import assert from "node:assert/strict";
import test from "node:test";

import {
  assessReconciliationReadiness,
  type ReconciliationReadinessInput,
} from "./reconciliation-readiness.ts";

const satisfied: ReconciliationReadinessInput = {
  application_authorization: true,
  identity: true,
  wardveil: true,
  privacy_shield: true,
  durable_reconciliation: true,
  distributed_concurrency: true,
  least_privilege: true,
  everkeep_recovery: true,
  mesh: true,
  glaze_consumer_acceptance: true,
  provider_write_interoperability: true,
};

test("missing prerequisites are reported in deterministic order", () => {
  const assessment = assessReconciliationReadiness({
    ...satisfied,
    identity: false,
    durable_reconciliation: false,
    provider_write_interoperability: false,
  });

  assert.equal(assessment.designPrerequisitesSatisfied, false);
  assert.deepEqual(assessment.missingPrerequisites, [
    "identity",
    "durable_reconciliation",
    "provider_write_interoperability",
  ]);
  assert.equal(assessment.mutationAllowed, false);
  assert.equal(assessment.automaticResolutionAllowed, false);
});

test("all design prerequisites still do not authorize mutation", () => {
  const assessment = assessReconciliationReadiness(satisfied);

  assert.equal(assessment.designPrerequisitesSatisfied, true);
  assert.deepEqual(assessment.missingPrerequisites, []);
  assert.equal(assessment.mutationAllowed, false);
  assert.equal(assessment.automaticResolutionAllowed, false);
});
