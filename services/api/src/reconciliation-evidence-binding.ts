export const RECONCILIATION_EVIDENCE_BINDING_VERSION = 1 as const;

export type ReconciliationEvidenceBindingIssue =
  | "invalid_operation_id"
  | "operation_id_mismatch"
  | "invalid_evidence_kind"
  | "evidence_kind_mismatch";

export interface ReconciliationEvidenceBindingInput {
  readonly operationId: string;
  readonly evidenceKind: string;
}

export interface ReconciliationEvidenceBindingAssessment {
  readonly contractVersion: typeof RECONCILIATION_EVIDENCE_BINDING_VERSION;
  readonly bindingSatisfied: boolean;
  readonly bindingIssues: readonly ReconciliationEvidenceBindingIssue[];
  readonly mutationAllowed: false;
  readonly automaticResolutionAllowed: false;
}

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EVIDENCE_KIND = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const EXPECTED_FIELDS = new Set(["operationId", "evidenceKind"]);

/**
 * Bind future authoritative reconciliation evidence to the exact governed-write
 * operation and evidence family being reviewed. This prevents structurally
 * valid evidence from one operation or evidence family from being reused for
 * another. The result is still observation-only and never grants mutation or
 * automatic-resolution authority.
 */
export function assessReconciliationEvidenceBinding(
  input: ReconciliationEvidenceBindingInput,
  expectedOperationId: string,
  expectedEvidenceKind: string,
): ReconciliationEvidenceBindingAssessment {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("reconciliation evidence binding must be an object");
  }
  const unknown = Object.keys(input).filter((field) => !EXPECTED_FIELDS.has(field));
  if (unknown.length > 0) {
    throw new TypeError(`unknown reconciliation evidence binding fields: ${unknown.sort().join(", ")}`);
  }
  if (!OPAQUE_ID.test(expectedOperationId)) {
    throw new TypeError("expected reconciliation operation id is invalid");
  }
  if (!EVIDENCE_KIND.test(expectedEvidenceKind)) {
    throw new TypeError("expected reconciliation evidence kind is invalid");
  }

  const issues: ReconciliationEvidenceBindingIssue[] = [];
  if (typeof input.operationId !== "string" || !OPAQUE_ID.test(input.operationId)) {
    issues.push("invalid_operation_id");
  } else if (input.operationId !== expectedOperationId) {
    issues.push("operation_id_mismatch");
  }

  if (typeof input.evidenceKind !== "string" || !EVIDENCE_KIND.test(input.evidenceKind)) {
    issues.push("invalid_evidence_kind");
  } else if (input.evidenceKind !== expectedEvidenceKind) {
    issues.push("evidence_kind_mismatch");
  }

  return Object.freeze({
    contractVersion: RECONCILIATION_EVIDENCE_BINDING_VERSION,
    bindingSatisfied: issues.length === 0,
    bindingIssues: Object.freeze([...issues]),
    mutationAllowed: false as const,
    automaticResolutionAllowed: false as const,
  });
}
