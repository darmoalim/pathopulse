/**
 * PathoPulse SEIR Mathematical Engine (Spatial Predictive Modeling)
 *
 * Implements a discrete reaction-diffusion mathematical model to forecast
 * the geographical boundary of a pathogen's spread. 
 *
 * Wavefront Velocity formula (Fisher-KPP): v = 2 * sqrt(D * β)
 */

type PathogenProfile = {
  r0: number;       // Basic reproduction number
  gamma: number;    // Recovery rate (1 / days infectious)
  diffusion: number; // Spatial diffusion factor (D) in km^2 / day
};

// Known transmission constraints for J&K context
const PATHOGENS: Record<string, PathogenProfile> = {
  "COVID-19": { r0: 3.5, gamma: 0.1, diffusion: 0.8 },
  "Dengue":   { r0: 2.2, gamma: 0.15, diffusion: 0.2 }, // Mosquito vector restricts speed
  "Cholera":  { r0: 5.0, gamma: 0.2, diffusion: 0.4 },  // Waterborne
  "Measles":  { r0: 15.0, gamma: 0.14, diffusion: 1.2 }, // Highly airborne
  "H1N1":     { r0: 1.8, gamma: 0.14, diffusion: 0.6 },
  "Zika":     { r0: 2.0, gamma: 0.14, diffusion: 0.2 },
  default:    { r0: 2.5, gamma: 0.1, diffusion: 0.5 },
};

/**
 * Calculates the predicted expanding spatial threat radius (in kilometers)
 * using an ODE-based Fisher-KPP wave propagation estimation.
 */
export function forecastThreatRadius(
  disease: string,
  activeCases: number,
  population: number,
  timelineDays: number = 7
): number {
  if (activeCases <= 0) return 0;
  
  // Fuzzy match or default
  const match = Object.keys(PATHOGENS).find(k => disease.toLowerCase().includes(k.toLowerCase()));
  const profile = match ? PATHOGENS[match] : PATHOGENS.default;

  // Contact Rate (β) = R0 * γ
  // In dense populations, beta naturally increases slightly. 
  // We approximate density via population since zone sizes in J&K are relatively standard,
  // but we enforce a logarithmic dampening to avoid runaway math.
  const densityMultiplier = Math.max(1, Math.log10(population + 10) / 3);
  const beta = profile.r0 * profile.gamma * densityMultiplier;

  // Diffusion is affected by active symptomatic transmitters
  // (A huge outbreak diffuses faster initially as it overwhelms isolation measures)
  const viralLoadFactor = Math.log10(activeCases + 1);
  const D = profile.diffusion * viralLoadFactor;

  // Wavefront velocity: v = 2 * sqrt(D * β) [km / day]
  const velocity = 2 * Math.sqrt(Math.max(0, D * beta));

  // The radius expansion over the requested timeline
  const radiusKm = velocity * timelineDays;

  // Cap absolute max blast radius to prevent geographic absurdity in a state context (max 50km in 7 days)
  return Math.min(50, Number(radiusKm.toFixed(2)));
}
