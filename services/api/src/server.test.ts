import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Branch, CreateBranchInput, ForgeProvider, RepositoryId } from "@goreecloud/code-contracts";
import type { BranchWriteAuditEvent } from "./audit.ts";
import type { BranchWriteIdempotencyStore, BranchWriteReserveResult } from "./idempotency.ts";
import { createCodeServer } from "./server.ts";

const repository = { id: "1", owner: "goreecloud", name: "code", defaultBranch: "main", private: true, webUrl: "https://forge.test/goreecloud/code" };
let createdBranch: { id: RepositoryId; input: CreateBranchInput } | null = null;
let createBranchCalls = 0;
const auditEvents: BranchWriteAuditEvent[] = [];

const provider: ForgeProvider = {
  async health() { return { provider: "mock", ok: true, version: "1.0", capabilities: ["repositories:read", "repositories:write"] }; },
  async repositories() { return [repository]; },
  async repository(id: RepositoryId) { return { ...repository, ...id }; },
  async branches() { return [{ name: "main", sha: "abc", protected: true }]; },
  async createBranch(id, input) {
    createBranchCalls += 1;
    createdBranch = { id, input };
    return { name: input.name, sha: "def", protected: false };
  },
  async commits() { return [{ sha: "abc", message: "Initial", authoredAt: "2026-08-26T00:00:00Z", webUrl: "https://forge.test/c/abc" }]; },
  async issues() { return [{ number: 1, title: "Issue", state: "open", webUrl: "https://forge.test/i/1" }]; },
  async pullRequests() { return [{ number: 2, title: "Change", state: "open", base: "main", head: "feature", webUrl: "https://forge.test/p/2" }]; },
};

function memoryIdempotencyStore(): BranchWriteIdempotencyStore {
  const records = new Map<string, { fingerprint: string; operationId: string; state: "in_progress" | "succeeded" | "uncertain"; result?: Branch }>();
  const fingerprint = (id: RepositoryId, input: CreateBranchInput) => JSON.stringify({ id, input });
  return {
    async reserve(key, operationId, id, input): Promise<BranchWriteReserveResult> {
      const current = records.get(key);
      const nextFingerprint = fingerprint(id, input);
      if (!current) {
        records.set(key, { fingerprint: nextFingerprint, operationId, state: "in_progress" });
        return { kind: "reserved", operationId };
      }
      if (current.fingerprint !== nextFingerprint) return { kind: "conflict", operationId: current.operationId };
      if (current.state === "succeeded" && current.result) return { kind: "replay", operationId: current.operationId, branch: current.result };
      return { kind: "unresolved", operationId: current.operationId, state: current.state };
    },
    async markSucceeded(key, operationId, id, input, result) {
      records.set(key, { fingerprint: fingerprint(id, input), operationId, state: "succeeded", result });
    },
    async markUncertain(key, operationId, id, input) {
      records.set(key, { fingerprint: fingerprint(id, input), operationId, state: "uncertain" });
    },
  };
}

let baseUrl = "";
const idempotency = memoryIdempotencyStore();
const server = createCodeServer(provider, {
  corsOrigin: "https://code.test",
  authorizeWrite: (authorization) => authorization === "Bearer test-write-token",
  recordWriteAudit: async (event) => { auditEvents.push(event); },
  idempotency,
});

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("API test server failed to bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

test("exposes provider-neutral health and repository routes", async () => {
  const healthResponse = await fetch(`${baseUrl}/health`);
  assert.equal(healthResponse.status, 200);
  assert.equal(healthResponse.headers.get("access-control-allow-origin"), "https://code.test");
  const health = await healthResponse.json() as any;
  assert.equal(health.service, "goreecloud-code-api");
  assert.equal(health.provider.provider, "mock");
  assert.deepEqual(health.governedWrites, { authorizationConfigured: true, auditConfigured: true, idempotencyConfigured: true });

  const repositories = await (await fetch(`${baseUrl}/api/v1/repositories`)).json() as any;
  assert.equal(repositories.repositories[0].name, "code");
});

test("routes repository subresources without provider-specific URLs", async () => {
  const branches = await (await fetch(`${baseUrl}/api/v1/repositories/goreecloud/code/branches`)).json() as any;
  const commits = await (await fetch(`${baseUrl}/api/v1/repositories/goreecloud/code/commits?ref=main`)).json() as any;
  const issues = await (await fetch(`${baseUrl}/api/v1/repositories/goreecloud/code/issues`)).json() as any;
  const changes = await (await fetch(`${baseUrl}/api/v1/repositories/goreecloud/code/pull-requests`)).json() as any;
  assert.equal(branches.branches[0].name, "main");
  assert.equal(commits.commits[0].sha, "abc");
  assert.equal(issues.issues[0].number, 1);
  assert.equal(changes.pullRequests[0].number, 2);
});

test("creates a branch only after authorization, idempotency reservation, and durable-attempt audit", async () => {
  createdBranch = null;
  auditEvents.length = 0;
  createBranchCalls = 0;
  const response = await branchRequest("request-security-0001", { name: "feature/security", sourceRef: "main" });
  assert.equal(response.status, 201);
  assert.deepEqual(createdBranch, { id: { owner: "goreecloud", name: "code" }, input: { name: "feature/security", sourceRef: "main" } });
  const payload = await response.json() as any;
  assert.deepEqual(payload.branch, { name: "feature/security", sha: "def", protected: false });
  assert.equal(typeof payload.operationId, "string");
  assert.deepEqual(payload.audit, { attemptRecorded: true, outcomeRecorded: true });
  assert.deepEqual(payload.idempotency, { replayed: false });
  assert.deepEqual(auditEvents.map((event) => event.phase), ["attempted", "succeeded"]);
  assert.equal(createBranchCalls, 1);
});

test("replays a completed idempotent branch write without calling the provider twice", async () => {
  const response = await branchRequest("request-security-0001", { name: "feature/security", sourceRef: "main" });
  assert.equal(response.status, 200);
  const payload = await response.json() as any;
  assert.deepEqual(payload.idempotency, { replayed: true });
  assert.equal(createBranchCalls, 1);
});

test("rejects reuse of an idempotency key for a different operation", async () => {
  const response = await branchRequest("request-security-0001", { name: "feature/different", sourceRef: "main" });
  assert.equal(response.status, 409);
  assert.equal((await response.json() as any).error, "idempotency_key_conflict");
  assert.equal(createBranchCalls, 1);
});

test("requires a bounded Idempotency-Key header", async () => {
  const response = await fetch(`${baseUrl}/api/v1/repositories/goreecloud/code/branches`, {
    method: "POST",
    headers: { authorization: "Bearer test-write-token", "content-type": "application/json" },
    body: JSON.stringify({ name: "feature/missing-key", sourceRef: "main" }),
  });
  assert.equal(response.status, 400);
});

test("records denied branch writes without logging credentials", async () => {
  auditEvents.length = 0;
  const unauthorized = await fetch(`${baseUrl}/api/v1/repositories/goreecloud/code/branches`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer wrong-secret", "idempotency-key": "request-denied-0001" },
    body: JSON.stringify({ name: "feature/denied", sourceRef: "main" }),
  });
  assert.equal(unauthorized.status, 403);
  assert.deepEqual(auditEvents.map((event) => event.phase), ["attempted", "denied"]);
  assert.equal(JSON.stringify(auditEvents).includes("wrong-secret"), false);
  assert.equal(JSON.stringify(auditEvents).includes("request-denied-0001"), false);
});

test("rejects malformed branch creation requests", async () => {
  const invalidRef = await fetch(`${baseUrl}/api/v1/repositories/goreecloud/code/branches`, {
    method: "POST",
    headers: { authorization: "Bearer test-write-token", "content-type": "application/json", "idempotency-key": "request-invalid-0001" },
    body: JSON.stringify({ name: "../unsafe", sourceRef: "main" }),
  });
  assert.equal(invalidRef.status, 400);

  const wrongMediaType = await fetch(`${baseUrl}/api/v1/repositories/goreecloud/code/branches`, {
    method: "POST",
    headers: { authorization: "Bearer test-write-token", "content-type": "text/plain", "idempotency-key": "request-invalid-0002" },
    body: "{}",
  });
  assert.equal(wrongMediaType.status, 415);
});

test("fails closed when governed-write controls are not configured", async () => {
  const auditMissing = createCodeServer(provider, { authorizeWrite: () => true, idempotency: memoryIdempotencyStore() });
  await withServer(auditMissing, async (url) => {
    const response = await postBranch(url, "request-locked-0001", "Bearer test-write-token");
    assert.equal(response.status, 503);
    assert.equal((await response.json() as any).error, "write_audit_unconfigured");
  });

  const idempotencyMissing = createCodeServer(provider, { authorizeWrite: () => true, recordWriteAudit: async () => {} });
  await withServer(idempotencyMissing, async (url) => {
    const response = await postBranch(url, "request-locked-0002", "Bearer test-write-token");
    assert.equal(response.status, 503);
    assert.equal((await response.json() as any).error, "write_idempotency_unconfigured");
  });
});

test("fails closed when write authorization is not configured", async () => {
  const events: BranchWriteAuditEvent[] = [];
  const lockedServer = createCodeServer(provider, {
    recordWriteAudit: async (event) => { events.push(event); },
    idempotency: memoryIdempotencyStore(),
  });
  await withServer(lockedServer, async (url) => {
    const response = await postBranch(url, "request-locked-0003");
    assert.equal(response.status, 503);
    assert.equal((await response.json() as any).error, "write_authorization_unconfigured");
    assert.deepEqual(events.map((event) => event.phase), ["attempted", "denied"]);
  });
});

test("fails closed before provider mutation when the audit sink is unavailable", async () => {
  createdBranch = null;
  const lockedServer = createCodeServer(provider, {
    authorizeWrite: () => true,
    recordWriteAudit: async () => { throw new Error("disk unavailable"); },
    idempotency: memoryIdempotencyStore(),
  });
  await withServer(lockedServer, async (url) => {
    const response = await postBranch(url, "request-locked-0004", "Bearer test-write-token");
    assert.equal(response.status, 503);
    assert.equal((await response.json() as any).error, "write_audit_unavailable");
    assert.equal(createdBranch, null);
  });
});

test("fails closed before provider mutation when idempotency storage is unavailable", async () => {
  createdBranch = null;
  const unavailable: BranchWriteIdempotencyStore = {
    async reserve() { throw new Error("disk unavailable"); },
    async markSucceeded() {},
    async markUncertain() {},
  };
  const lockedServer = createCodeServer(provider, {
    authorizeWrite: () => true,
    recordWriteAudit: async () => {},
    idempotency: unavailable,
  });
  await withServer(lockedServer, async (url) => {
    const response = await postBranch(url, "request-locked-0005", "Bearer test-write-token");
    assert.equal(response.status, 503);
    assert.equal((await response.json() as any).error, "write_idempotency_unavailable");
    assert.equal(createdBranch, null);
  });
});

test("rejects unsupported methods and unknown routes", async () => {
  assert.equal((await fetch(`${baseUrl}/api/v1/repositories`, { method: "POST" })).status, 405);
  assert.equal((await fetch(`${baseUrl}/missing`)).status, 404);
});

function branchRequest(key: string, input: CreateBranchInput) {
  return fetch(`${baseUrl}/api/v1/repositories/goreecloud/code/branches`, {
    method: "POST",
    headers: { authorization: "Bearer test-write-token", "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify(input),
  });
}

function postBranch(url: string, key: string, authorization?: string) {
  return fetch(`${url}/api/v1/repositories/goreecloud/code/branches`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": key,
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify({ name: "feature", sourceRef: "main" }),
  });
}

async function withServer(instance: ReturnType<typeof createCodeServer>, work: (url: string) => Promise<void>) {
  await new Promise<void>((resolve) => instance.listen(0, "127.0.0.1", resolve));
  try {
    const address = instance.address();
    if (!address || typeof address === "string") throw new Error("API test server failed to bind");
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => instance.close((error) => error ? reject(error) : resolve()));
  }
}
