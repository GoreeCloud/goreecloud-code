import assert from "node:assert/strict";
import test from "node:test";

import { assessReconciliationEvidenceBinding } from "./reconciliation-evidence-binding.js";

const EXPECTED_OPERATION = "op-20260907-001";
const EXPECTED_KIND = "provider-observation";

test("exact operation and evidence family bind without authorizing mutation", () => {
  const result = assessReconciliationEvidenceBinding(
    { operationId: EXPECTED_OPERATION, evidenceKind: EXPECTED_KIND },
    EXPECTED_OPERATION,
    EXPECTED_KIND,
  );

  assert.equal(result.bindingSatisfied, true);
  assert.deepEqual(result.bindingIssues, []);
  assert.equal(result.mutationAllowed, false);
  assert.equal(result.automaticResolutionAllowed, false);
});

test("evidence cannot be replayed across governed-write operations", () => {
  const result = assessReconciliationEvidenceBinding(
    { operationId: "op-20260907-previous", evidenceKind: EXPECTED_KIND },
    EXPECTED_OPERATION,
    EXPECTED_KIND,
  );

  assert.equal(result.bindingSatisfied, false);
  assert.deepEqual(result.bindingIssues, ["operation_id_mismatch"]);
  assert.equal(result.mutationAllowed, false);
});

test("evidence family mismatch fails closed", () => {
  const result = assessReconciliationEvidenceBinding(
    { operationId: EXPECTED_OPERATION, evidenceKind: "wardveil-policy" },
    EXPECTED_OPERATION,
    EXPECTED_KIND,
  );

  assert.equal(result.bindingSatisfied, false);
  assert.deepEqual(result.bindingIssues, ["evidence_kind_mismatch"]);
});

test("malformed identifiers and unknown fields fail closed", () => {
  const malformed = assessReconciliationEvidenceBinding(
    { operationId: " ../operation ", evidenceKind: "provider observation" },
    EXPECTED_OPERATION,
    EXPECTED_KIND,
  );
  assert.deepEqual(malformed.bindingIssues, ["invalid_operation_id", "invalid_evidence_kind"]);

  assert.throws(
    () => assessReconciliationEvidenceBinding(
      { operationId: EXPECTED_OPERATION, evidenceKind: EXPECTED_KIND, authority: true } as never,
      EXPECTED_OPERATION,
      EXPECTED_KIND,
    ),
    /unknown reconciliation evidence binding fields/,
  );
});
