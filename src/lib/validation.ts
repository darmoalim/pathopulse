/**
 * PathoPulse Server-Side Input Validation
 */

const VALID_SEVERITY = ["mild", "moderate", "severe"] as const;
const VALID_SAMPLE_STATUS = ["pending", "in_lab", "results_ready", "sequenced"] as const;
const MAX_CASES_PER_SUBMISSION = 2000;
const MAX_DEATHS_PER_SUBMISSION = 500;

export interface SubmissionInput {
  new_cases: unknown;
  deaths?: unknown;
  hospitalized?: unknown;
  recovered?: unknown;
  severity?: unknown;
  sample_status?: unknown;
  notes?: unknown;
  worker_name?: unknown;
  lab_code?: unknown;
}

export interface ValidatedSubmission {
  new_cases: number;
  deaths: number;
  hospitalized: number;
  recovered: number;
  severity: string;
  sample_status: string;
  notes: string;
  worker_name: string;
  lab_code: string;
}

export type ValidationResult = {
  valid: true; data: ValidatedSubmission;
} | {
  valid: false; errors: string[];
};

export function validateSubmission(body: SubmissionInput): { valid: boolean; data?: ValidatedSubmission; errors?: string[] } {
  const errors: string[] = [];

  // new_cases — required
  const new_cases = parseInt(String(body.new_cases));
  if (isNaN(new_cases) || new_cases < 0) errors.push("new_cases must be a non-negative integer");
  else if (new_cases > MAX_CASES_PER_SUBMISSION) errors.push(`new_cases cannot exceed ${MAX_CASES_PER_SUBMISSION} per submission`);

  // deaths — optional, default 0
  const deaths = parseInt(String(body.deaths ?? 0));
  if (isNaN(deaths) || deaths < 0) errors.push("deaths must be a non-negative integer");
  else if (deaths > MAX_DEATHS_PER_SUBMISSION) errors.push(`deaths cannot exceed ${MAX_DEATHS_PER_SUBMISSION} per submission`);

  // deaths cannot exceed new_cases for this submission
  if (!isNaN(new_cases) && !isNaN(deaths) && deaths > new_cases) {
    errors.push("deaths cannot exceed new_cases for the same submission");
  }

  // hospitalized — optional
  const hospitalized = parseInt(String(body.hospitalized ?? 0));
  if (isNaN(hospitalized) || hospitalized < 0) errors.push("hospitalized must be a non-negative integer");

  // recovered — optional
  const recovered = parseInt(String(body.recovered ?? 0));
  if (isNaN(recovered) || recovered < 0) errors.push("recovered must be a non-negative integer");

  // severity — enum
  const severity = String(body.severity ?? "moderate");
  if (!VALID_SEVERITY.includes(severity as any)) {
    errors.push(`severity must be one of: ${VALID_SEVERITY.join(", ")}`);
  }

  // sample_status — enum
  const sample_status = String(body.sample_status ?? "pending");
  if (!VALID_SAMPLE_STATUS.includes(sample_status as any)) {
    errors.push(`sample_status must be one of: ${VALID_SAMPLE_STATUS.join(", ")}`);
  }

  // notes — sanitize (strip HTML)
  const notes = String(body.notes ?? "").replace(/<[^>]*>/g, "").slice(0, 1000);

  // worker_name — sanitize
  const worker_name = String(body.worker_name ?? "Anonymous Field Worker").replace(/<[^>]*>/g, "").slice(0, 100);

  // lab_code
  const lab_code = String(body.lab_code ?? "").slice(0, 20);

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: { new_cases, deaths, hospitalized, recovered, severity, sample_status, notes, worker_name, lab_code }
  };
}
