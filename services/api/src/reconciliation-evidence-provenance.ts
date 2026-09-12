export const RECONCILIATION_EVIDENCE_PROVENANCE_VERSION = 1 as const;

export type ReconciliationEvidenceProvenanceIssue =
  | "invalid_issuer"
  | "issuer_mismatch"
  | "invalid_operation_id"
  | "operation_id_mismatch"
  | "invalid_evidence_kind"
  | "evidence_kind_mismatch"
  | "invalid_payload_digest";

export interface ReconciliationEvidenceProvenanceInput {
  readonly issuer: string;
  readonly operationId: string;
  readonly evidenceKind: string;
  readonly payloadDigest: string;
}

export interface ReconciliationEvidenceProvenanceAssessment {
  readonly contractVersion: typeof RECONCILIATION_EVIDENCE_PROVENANCE_VERSION;
  readonly provenanceStructurallyBound: boolean;
  readonly provenanceIssues: readonly ReconciliationEvidenceProvenanceIssue[];
  readonly authenticatedIssuer: false;
  readonly signatureVerified: false;
  readonly productionTrustedInput: false;
  readonly mutationAllowed: false;
  readonly automaticResolutionAllowed: false;
}

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EVIDENCE_KIND = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const EXPECTED_FIELDS = new Set(["issuer", "operationId", "evidenceKind", "payloadDigest"]);

/**
 * Validate the structural provenance tuple that future authenticated
 * reconciliation evidence must bind to.
 *
 * This deliberately does not authenticate the issuer or verify a signature.
 * Caller-supplied issuer/digest data cannot become reconciliation authority;
 * authenticatedIssuer, signatureVerified, productionTrustedInput, mutationAllowed,
 * and automaticResolutionAllowed therefore remain false invariants.
 */
export function assessReconciliationEvidenceProvenance(
  input: ReconciliationEvidenceProvenanceInput,
  expectedIssuer: string,
  expectedOperationId: string,
  expectedEvidenceKind: string,
): ReconciliationEvidenceProvenanceAssessment {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("reconciliation evidence provenance must be an object");
  }
  const unknown = Object.keys(input).filter((field) => !EXPECTED_FIELDS.has(field));
  if (unknown.length > 0) {
    throw new TypeError(`unknown reconciliation evidence provenance fields: ${unknown.sort().join(", ")}`);
  }
  if (!OPAQUE_ID.test(expectedIssuer)) {
    throw new TypeError("expected reconciliation evidence issuer is invalid");
  }
  if (!OPAQUE_ID.test(expectedOperationId)) {
    throw new TypeError("expected reconciliation operation id is invalid");
  }
  if (!EVIDENCE_KIND.test(expectedEvidenceKind)) {
    throw new TypeError("expected reconciliation evidence kind is invalid");
  }

  const issues: ReconciliationEvidenceProvenanceIssue[] = [];
  if (typeof input.issuer !== "string" || !OPAQUE_ID.test(input.issuer)) {
    issues.push("invalid_issuer");
  } else if (input.issuer !== expectedIssuer) {
    issues.push("issuer_mismatch");
  }
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
  if (typeof input.payloadDigest !== "string" || !SHA256.test(input.payloadDigest)) {
    issues.push("invalid_payload_digest");
  }

  return Object.freeze({
    contractVersion: RECONCILIATION_EVIDENCE_PROVENANCE_VERSION,
    provenanceStructurallyBound: issues.length === 0,
    provenanceIssues: Object.freeze([...issues]),
    authenticatedIssuer: false as const,
    signatureVerified: false as const,
    productionTrustedInput: false as const,
    mutationAllowed: false as const,
    automaticResolutionAllowed: false as const,
  });
}
