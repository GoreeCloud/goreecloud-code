import assert from "node:assert/strict";
import test from "node:test";

import { assessReconciliationEvidenceWindow } from "./reconciliation-evidence-window.ts";

const assessmentTime = Date.parse("2026-09-06T15:00:00Z");

test("current evidence remains manual-review only", () => {
  const result = assessReconciliationEvidenceWindow(
    {
      observedAt: "2026-09-06T14:55:00Z",
      expiresAt: "2026-09-06T15:05:00Z",
    },
    assessmentTime,
  );

  assert.equal(result.evidenceCurrent, true);
  assert.deepEqual(result.temporalIssues, []);
  assert.equal(result.mutationAllowed, false);
  assert.equal(result.automaticResolutionAllowed, false);
});

test("expired evidence fails closed", () => {
  const result = assessReconciliationEvidenceWindow(
    {
      observedAt: "2026-09-06T14:00:00Z",
      expiresAt: "2026-09-06T14:30:00Z",
    },
    assessmentTime,
  );

  assert.equal(result.evidenceCurrent, false);
  assert.ok(result.temporalIssues.includes("evidence_expired"));
});

test("future observations and impossible intervals fail closed", () => {
  const future = assessReconciliationEvidenceWindow(
    {
      observedAt: "2026-09-06T15:01:00Z",
      expiresAt: "2026-09-06T15:10:00Z",
    },
    assessmentTime,
  );
  assert.ok(future.temporalIssues.includes("observed_in_future"));

  const impossible = assessReconciliationEvidenceWindow(
    {
      observedAt: "2026-09-06T14:55:00Z",
      expiresAt: "2026-09-06T14:54:59Z",
    },
    assessmentTime,
  );
  assert.ok(impossible.temporalIssues.includes("invalid_validity_interval"));
});

test("invalid timestamps and unknown fields are rejected", () => {
  const invalid = assessReconciliationEvidenceWindow(
    { observedAt: "yesterday", expiresAt: "later" },
    assessmentTime,
  );
  assert.deepEqual(invalid.temporalIssues, ["invalid_observed_at", "invalid_expires_at"]);

  assert.throws(
    () =>
      assessReconciliationEvidenceWindow(
        {
          observedAt: "2026-09-06T14:55:00Z",
          expiresAt: "2026-09-06T15:05:00Z",
          authority: true,
        } as never,
        assessmentTime,
      ),
    /unknown reconciliation evidence fields/,
  );
  assert.throws(
    () =>
      assessReconciliationEvidenceWindow(
        {
          observedAt: "2026-09-06T14:55:00Z",
          expiresAt: "2026-09-06T15:05:00Z",
        },
        Number.NaN,
      ),
    /assessment time must be finite/,
  );
});
