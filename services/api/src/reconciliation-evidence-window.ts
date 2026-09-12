export const RECONCILIATION_EVIDENCE_WINDOW_VERSION = 1 as const;

export type ReconciliationEvidenceTemporalIssue =
  | "invalid_observed_at"
  | "invalid_expires_at"
  | "observed_in_future"
  | "invalid_validity_interval"
  | "evidence_expired";

export interface ReconciliationEvidenceWindowInput {
  readonly observedAt: string;
  readonly expiresAt: string;
}

export interface ReconciliationEvidenceWindowAssessment {
  readonly contractVersion: typeof RECONCILIATION_EVIDENCE_WINDOW_VERSION;
  readonly evidenceCurrent: boolean;
  readonly temporalIssues: readonly ReconciliationEvidenceTemporalIssue[];
  readonly mutationAllowed: false;
  readonly automaticResolutionAllowed: false;
}

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const EXPECTED_FIELDS = new Set(["observedAt", "expiresAt"]);

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !RFC3339.test(value)) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Assess only the temporal usability of future authoritative reconciliation
 * evidence. This is not an authorization primitive and can never allow a
 * mutation or automatic resolution.
 */
export function assessReconciliationEvidenceWindow(
  input: ReconciliationEvidenceWindowInput,
  assessmentTimeMs: number,
): ReconciliationEvidenceWindowAssessment {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("reconciliation evidence window must be an object");
  }
  if (!Number.isFinite(assessmentTimeMs)) {
    throw new TypeError("reconciliation evidence assessment time must be finite");
  }
  const unknown = Object.keys(input).filter((field) => !EXPECTED_FIELDS.has(field));
  if (unknown.length > 0) {
    throw new TypeError(`unknown reconciliation evidence fields: ${unknown.sort().join(", ")}`);
  }

  const issues: ReconciliationEvidenceTemporalIssue[] = [];
  const observedAt = parseTimestamp(input.observedAt);
  const expiresAt = parseTimestamp(input.expiresAt);
  if (observedAt === null) {
    issues.push("invalid_observed_at");
  }
  if (expiresAt === null) {
    issues.push("invalid_expires_at");
  }
  if (observedAt !== null && expiresAt !== null) {
    if (observedAt > assessmentTimeMs) {
      issues.push("observed_in_future");
    }
    if (expiresAt <= observedAt) {
      issues.push("invalid_validity_interval");
    }
    if (expiresAt <= assessmentTimeMs) {
      issues.push("evidence_expired");
    }
  }

  return Object.freeze({
    contractVersion: RECONCILIATION_EVIDENCE_WINDOW_VERSION,
    evidenceCurrent: issues.length === 0,
    temporalIssues: Object.freeze([...issues]),
    mutationAllowed: false as const,
    automaticResolutionAllowed: false as const,
  });
}
