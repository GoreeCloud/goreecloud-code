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

test("does not call the provider for already-succeeded operations", async () => {
  let branchReads = 0;
  const mock = provider();
  mock.branches = async () => { branchReads += 1; return []; };
  const assessment = await assessBranchWriteReconciliation(mock, {
    operationId: "operation-1",
    state: "succeeded",
    observedAt: "2026-08-30T00:00:00.000Z",
    reconciliationRequired: false,
    operation,
    branch: { name: operation.branch.name, sha: "def", protected: false },
  });
  assert.equal(assessment.assessment, "not_required");
  assert.equal(assessment.manualReviewRequired, false);
  assert.equal(assessment.providerChecked, false);
  assert.equal(assessment.mutationAllowed, false);
  assert.equal(assessment.automaticResolutionAllowed, false);
  assert.equal(branchReads, 0);
});

test("reports provider branch presence without resolving an uncertain operation", async () => {
  const assessment = await assessBranchWriteReconciliation(provider([
    { name: "main", sha: "abc", protected: true },
    { name: operation.branch.name, sha: "def", protected: false },
  ]), {
    operationId: "operation-2",
    state: "uncertain",
    observedAt: "2026-08-30T00:00:00.000Z",
    reconciliationRequired: true,
    operation,
  });
  assert.equal(assessment.assessment, "provider_branch_present");
  assert.equal(assessment.reconciliationRequired, true);
  assert.equal(assessment.manualReviewRequired, true);
  assert.deepEqual(assessment.observedBranch, { name: operation.branch.name, sha: "def", protected: false });
  assert.equal(assessment.automaticResolutionAllowed, false);
});

test("reports provider branch absence without authorizing retry", async () => {
  const assessment = await assessBranchWriteReconciliation(provider(), {
    operationId: "operation-3",
    state: "in_progress",
    observedAt: "2026-08-30T00:00:00.000Z",
    reconciliationRequired: true,
    operation,
  });
  assert.equal(assessment.assessment, "provider_branch_absent");
  assert.equal(assessment.manualReviewRequired, true);
  assert.equal(assessment.mutationAllowed, false);
});

test("keeps legacy operations unresolved when operation context is unavailable", async () => {
  const assessment = await assessBranchWriteReconciliation(provider(), {
    operationId: "legacy-operation",
    state: "uncertain",
    observedAt: "2026-08-30T00:00:00.000Z",
    reconciliationRequired: true,
  });
  assert.equal(assessment.assessment, "legacy_operation_context_unavailable");
  assert.equal(assessment.providerChecked, false);
  assert.equal(assessment.manualReviewRequired, true);
});

test("reports provider observation failure without leaking or resolving it", async () => {
  const mock = provider();
  mock.branches = async () => { throw new Error("private provider failure detail"); };
  const assessment = await assessBranchWriteReconciliation(mock, {
    operationId: "operation-4",
    state: "uncertain",
    observedAt: "2026-08-30T00:00:00.000Z",
    reconciliationRequired: true,
    operation,
  });
  assert.equal(assessment.assessment, "provider_observation_unavailable");
  assert.equal(assessment.manualReviewRequired, true);
  assert.equal(JSON.stringify(assessment).includes("private provider failure detail"), false);
});
