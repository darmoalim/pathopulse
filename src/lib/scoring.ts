/**
 * PathoPulse Priority Scoring Engine
 * 
 * Threat Index formula:
 *   score = (total_cases × 1.2) - (sequenced ? 40 : 0) + (deaths × 5)
 * 
 * Additional weights:
 *   - Deaths add critical mass (×5 per fatality)
 *   - Sequencing coverage reduces uncertainty score by 40 pts
 *   - Capped 0–100
 */
export function calcPriority(
  sequenced: boolean,
  total_cases: number,
  deaths: number = 0
): number {
  let score = (total_cases * 1.2) - (sequenced ? 40 : 0) + (deaths * 5);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getThreatTier(score: number): "critical" | "warning" | "stable" {
  if (score >= 75) return "critical";
  if (score >= 50) return "warning";
  return "stable";
}
