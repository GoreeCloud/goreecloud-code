import assert from "node:assert/strict";
import { test } from "node:test";
import type { ForgeProvider } from "@goreecloud/code-contracts";
import { assessBranchWriteReconciliation } from "./reconciliation.ts";

const repository = { owner: "goreecloud", name: "code" };
const operation = {
  action: "repository.branch.create" as const,
  repository,
  branch: { name: "feature/reconcile", sourceRef: "main" },
};

function provider(branches = [{ name: "main", sha: "abc", protected: true }]): ForgeProvider {
  return {
    async health() { return { provider: "mock", ok: true, capabilities: ["repositories:read", "repositories:write"] }; },
    async repositories() { return []; },
    async repository(id) { return { id: "1", ...id, defaultBranch: "main", private: true, webUrl: "https://forge.test/repo" }; },
    async branches() { return branches; },
    async createBranch() { throw new Error("mutation must not be called"); },
    async commits() { return []; },
    async issues() { return []; },
    async pullRequests() { return []; },
  };
}

function assertObservationTimes(
  assessment: { localObservedAt: string; assessedAt: string },
  expectedLocalObservedAt: string,
) {
  assert.equal(assessment.localObservedAt, expectedLocalObservedAt);
  assert.equal(Number.isFinite(Date.parse(assessment.assessedAt)), true);
}

test("does not call the provider for already-succeeded operations", async () => {
  let branchReads = 0;
  const mock = provider();
  mock.branches = async () => { branchReads += 1; return []; };
  const observedAt = "2026-08-30T00:00:00.000Z";
  const assessment = await assessBranchWriteReconciliation(mock, {
    operationId: "operation-1",
    state: "succeeded",
    observedAt,
    reconciliationRequired: false,
    operation,
    branch: { name: operation.branch.name, sha: "def", protected: false },
  });
  assert.equal(assessment.assessment, "not_required");
  assert.equal(assessment.manualReviewRequired, false);
  assert.equal(assessment.providerChecked, false);
  assert.equal(assessment.mutationAllowed, false);
  assert.equal(assessment.automaticResolutionAllowed, false);
  assertObservationTimes(assessment, observedAt);
  assert.equal(branchReads, 0);
});

test("reports provider branch presence without resolving an uncertain operation", async () => {
  const observedAt = "2026-08-30T00:00:00.000Z";
  const assessment = await assessBranchWriteReconciliation(provider([
    { name: "main", sha: "abc", protected: true },
    { name: operation.branch.name, sha: "def", protected: false },
  ]), {
    operationId: "operation-2",
    state: "uncertain",
    observedAt,
    reconciliationRequired: true,
    operation,
  });
  assert.equal(assessment.assessment, "provider_branch_present");
  assert.equal(assessment.reconciliationRequired, true);
  assert.equal(assessment.manualReviewRequired, true);
  assert.deepEqual(assessment.observedBranch, { name: operation.branch.name, sha: "def", protected: false });
  assert.equal(assessment.automaticResolutionAllowed, false);
  assertObservationTimes(assessment, observedAt);
});

test("fails closed when provider observation contains duplicate target branches", async () => {
  const observedAt = "2026-08-30T00:00:00.000Z";
  const duplicateBranches = [
    { name: operation.branch.name, sha: "first", protected: false },
    { name: operation.branch.name, sha: "second", protected: true },
  ];
  const assessment = await assessBranchWriteReconciliation(provider(duplicateBranches), {
    operationId: "operation-ambiguous",
    state: "uncertain",
    observedAt,
    reconciliationRequired: true,
    operation,
  });
  assert.equal(assessment.assessment, "provider_branch_ambiguous");
  assert.equal(assessment.reconciliationRequired, true);
  assert.equal(assessment.manualReviewRequired, true);
  assert.equal(assessment.providerChecked, true);
  assert.equal(assessment.mutationAllowed, false);
  assert.equal(assessment.automaticResolutionAllowed, false);
  assert.equal(assessment.observedBranch, undefined);
  assert.deepEqual(assessment.observedBranches, duplicateBranches);
  assertObservationTimes(assessment, observedAt);
});

test("reports provider branch absence without authorizing retry", async () => {
  const observedAt = "2026-08-30T00:00:00.000Z";
  const assessment = await assessBranchWriteReconciliation(provider(), {
    operationId: "operation-3",
    state: "in_progress",
    observedAt,
    reconciliationRequired: true,
    operation,
  });
  assert.equal(assessment.assessment, "provider_branch_absent");
  assert.equal(assessment.manualReviewRequired, true);
  assert.equal(assessment.mutationAllowed, false);
  assertObservationTimes(assessment, observedAt);
});

test("keeps legacy operations unresolved when operation context is unavailable", async () => {
  const observedAt = "2026-08-30T00:00:00.000Z";
  const assessment = await assessBranchWriteReconciliation(provider(), {
    operationId: "legacy-operation",
    state: "uncertain",
    observedAt,
    reconciliationRequired: true,
  });
  assert.equal(assessment.assessment, "legacy_operation_context_unavailable");
  assert.equal(assessment.providerChecked, false);
  assert.equal(assessment.manualReviewRequired, true);
  assertObservationTimes(assessment, observedAt);
});

test("reports provider observation failure without leaking or resolving it", async () => {
  const mock = provider();
  mock.branches = async () => { throw new Error("private provider failure detail"); };
  const observedAt = "2026-08-30T00:00:00.000Z";
  const assessment = await assessBranchWriteReconciliation(mock, {
    operationId: "operation-4",
    state: "uncertain",
    observedAt,
    reconciliationRequired: true,
    operation,
  });
  assert.equal(assessment.assessment, "provider_observation_unavailable");
  assert.equal(assessment.manualReviewRequired, true);
  assert.equal(JSON.stringify(assessment).includes("private provider failure detail"), false);
  assertObservationTimes(assessment, observedAt);
});
