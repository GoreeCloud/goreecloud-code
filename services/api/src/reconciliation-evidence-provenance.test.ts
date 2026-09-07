import assert from "node:assert/strict";
import test from "node:test";

import { assessReconciliationEvidenceProvenance } from "./reconciliation-evidence-provenance.ts";

const issuer = "goreecloud-identity";
const operationId = "op-20260907-002";
const evidenceKind = "provider-observation";
const digest = `sha256:${"a".repeat(64)}`;

test("exact provenance tuple remains explicitly non-authorizing", () => {
  const result = assessReconciliationEvidenceProvenance(
    { issuer, operationId, evidenceKind, payloadDigest: digest },
    issuer,
    operationId,
    evidenceKind,
  );

  assert.equal(result.provenanceStructurallyBound, true);
  assert.deepEqual(result.provenanceIssues, []);
  assert.equal(result.authenticatedIssuer, false);
  assert.equal(result.signatureVerified, false);
  assert.equal(result.productionTrustedInput, false);
  assert.equal(result.mutationAllowed, false);
  assert.equal(result.automaticResolutionAllowed, false);
});

test("cross-operation, cross-family, and issuer replay fail closed", () => {
  const result = assessReconciliationEvidenceProvenance(
    {
      issuer: "other-issuer",
      operationId: "op-previous",
      evidenceKind: "wardveil-policy",
      payloadDigest: digest,
    },
    issuer,
    operationId,
    evidenceKind,
  );

  assert.equal(result.provenanceStructurallyBound, false);
  assert.deepEqual(result.provenanceIssues, [
    "issuer_mismatch",
    "operation_id_mismatch",
    "evidence_kind_mismatch",
  ]);
});

test("digest must be a canonical lowercase sha256 reference", () => {
  const malformed = assessReconciliationEvidenceProvenance(
    { issuer, operationId, evidenceKind, payloadDigest: "sha256:ABC" },
    issuer,
    operationId,
    evidenceKind,
  );
  assert.deepEqual(malformed.provenanceIssues, ["invalid_payload_digest"]);
});

test("unknown fields fail closed", () => {
  assert.throws(
    () => assessReconciliationEvidenceProvenance(
      { issuer, operationId, evidenceKind, payloadDigest: digest, trusted: true } as never,
      issuer,
      operationId,
      evidenceKind,
    ),
    /unknown reconciliation evidence provenance fields/,
  );
});
