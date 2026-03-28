/**
 * PathoPulse Priority Scoring Engine v2
 *
 * Epidemiologically sound formula replacing the naive v1.
 * Key improvements:
 *   - Population-normalized incidence rate (per 100,000)
 *   - Case fatality rate weight
 *   - Recency decay (old non-updating outbreaks fade naturally)
 *   - Sequencing coverage reduces uncertainty
 *   - Active case flag bonus
 */
export function calcPriority(
  sequenced: boolean,
  total_cases: number,
  deaths: number = 0,
  population: number = 50000, // default for unknown zone size
  active_cases: number = 0,
  last_updated?: string | null
): number {
  // 1. Incidence rate per 100,000 (max contribution: 40 pts)
  const incidence_rate = population > 0 ? (active_cases / population) * 100000 : 0;
  const incidence_score = Math.min(40, incidence_rate / 50 * 40);

  // 2. Case Fatality Rate (max contribution: 25 pts)
  const cfr = total_cases > 0 ? deaths / total_cases : 0;
  const cfr_score = Math.min(25, cfr * 200);

  // 3. Genomic blindspot penalty/bonus (−15 if sequenced, 0 if not)
  const sequencing_score = sequenced ? -15 : 0;

  // 4. Active outbreak flag (10 pts if still has active cases)
  const active_score = active_cases > 0 ? 10 : 0;

  // 5. Recency weight — outbreaks not updated in 30+ days decay toward 0
  let recency = 1.0;
  if (last_updated) {
    const daysSince = (Date.now() - new Date(last_updated).getTime()) / (1000 * 60 * 60 * 24);
    recency = Math.max(0.1, 1 - daysSince / 60);
  }

  const raw = (incidence_score + cfr_score + sequencing_score + active_score + 25) * recency;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function getThreatTier(score: number): "critical" | "warning" | "stable" {
  if (score >= 75) return "critical";
  if (score >= 50) return "warning";
  return "stable";
}
