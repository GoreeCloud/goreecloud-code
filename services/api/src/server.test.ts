import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { CreateBranchInput, ForgeProvider, RepositoryId } from "@goreecloud/code-contracts";
import type { BranchWriteAuditEvent } from "./audit.ts";
import { createCodeServer } from "./server.ts";

const repository = { id: "1", owner: "goreecloud", name: "code", defaultBranch: "main", private: true, webUrl: "https://forge.test/goreecloud/code" };
let createdBranch: { id: RepositoryId; input: CreateBranchInput } | null = null;
const auditEvents: BranchWriteAuditEvent[] = [];

const provider: ForgeProvider = {
  async health() { return { provider: "mock", ok: true, version: "1.0", capabilities: ["repositories:read", "repositories:write"] }; },
  async repositories() { return [repository]; },
  async repository(id: RepositoryId) { return { ...repository, ...id }; },
  async branches() { return [{ name: "main", sha: "abc", protected: true }]; },
  async createBranch(id, input) {
    createdBranch = { id, input };
    return { name: input.name, sha: "def", protected: false };
  },
  async commits() { return [{ sha: "abc", message: "Initial", authoredAt: "2026-08-26T00:00:00Z", webUrl: "https://forge.test/c/abc" }]; },
  async issues() { return [{ number: 1, title: "Issue", state: "open", webUrl: "https://forge.test/i/1" }]; },
  async pullRequests() { return [{ number: 2, title: "Change", state: "open", base: "main", head: "feature", webUrl: "https://forge.test/p/2" }]; },
};

let baseUrl = "";
const server = createCodeServer(provider, {
  corsOrigin: "https://code.test",
  authorizeWrite: (authorization) => authorization === "Bearer test-write-token",
  recordWriteAudit: async (event) => { auditEvents.push(event); },
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
  assert.deepEqual(health.governedWrites, { authorizationConfigured: true, auditConfigured: true });

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

test("creates a branch only after authorization and durable-attempt audit", async () => {
  createdBranch = null;
  auditEvents.length = 0;
  const response = await fetch(`${baseUrl}/api/v1/repositories/goreecloud/code/branches`, {
    method: "POST",
    headers: {
      authorization: "Bearer test-write-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "feature/security", sourceRef: "main" }),
  });
  assert.equal(response.status, 201);
  assert.deepEqual(createdBranch, {
    id: { owner: "goreecloud", name: "code" },
    input: { name: "feature/security", sourceRef: "main" },
  });
  const payload = await response.json() as any;
  assert.deepEqual(payload.branch, { name: "feature/security", sha: "def", protected: false });
  assert.equal(typeof payload.operationId, "string");
  assert.deepEqual(payload.audit, { attemptRecorded: true, outcomeRecorded: true });
  assert.deepEqual(auditEvents.map((event) => event.phase), ["attempted", "succeeded"]);
  assert.equal(auditEvents[0]?.operationId, payload.operationId);
  assert.equal(auditEvents[1]?.operationId, payload.operationId);
  assert.deepEqual(auditEvents[0]?.repository, { owner: "goreecloud", name: "code" });
  assert.deepEqual(auditEvents[0]?.branch, { name: "feature/security", sourceRef: "main" });
});

test("records denied branch writes without logging credentials", async () => {
  auditEvents.length = 0;
  const unauthorized = await fetch(`${baseUrl}/api/v1/repositories/goreecloud/code/branches`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer wrong-secret" },
    body: JSON.stringify({ name: "feature/security", sourceRef: "main" }),
  });
  assert.equal(unauthorized.status, 403);
  const payload = await unauthorized.json() as any;
  assert.equal(typeof payload.operationId, "string");
  assert.deepEqual(auditEvents.map((event) => event.phase), ["attempted", "denied"]);
  assert.equal(JSON.stringify(auditEvents).includes("wrong-secret"), false);
});

test("rejects malformed branch creation requests", async () => {
  const invalidRef = await fetch(`${baseUrl}/api/v1/repositories/goreecloud/code/branches`, {
    method: "POST",
    headers: { authorization: "Bearer test-write-token", "content-type": "application/json" },
    body: JSON.stringify({ name: "../unsafe", sourceRef: "main" }),
  });
  assert.equal(invalidRef.status, 400);

  const wrongMediaType = await fetch(`${baseUrl}/api/v1/repositories/goreecloud/code/branches`, {
    method: "POST",
    headers: { authorization: "Bearer test-write-token", "content-type": "text/plain" },
    body: "{}",
  });
  assert.equal(wrongMediaType.status, 415);
});

test("fails closed when the governed-write audit sink is not configured", async () => {
  const lockedServer = createCodeServer(provider, { authorizeWrite: () => true });
  await new Promise<void>((resolve) => lockedServer.listen(0, "127.0.0.1", resolve));
  try {
    const address = lockedServer.address();
    if (!address || typeof address === "string") throw new Error("Locked API test server failed to bind");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/repositories/goreecloud/code/branches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "feature", sourceRef: "main" }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json() as any).error, "write_audit_unconfigured");
  } finally {
    await new Promise<void>((resolve, reject) => lockedServer.close((error) => error ? reject(error) : resolve()));
  }
});

test("fails closed when write authorization is not configured after audit is available", async () => {
  const events: BranchWriteAuditEvent[] = [];
  const lockedServer = createCodeServer(provider, { recordWriteAudit: async (event) => { events.push(event); } });
  await new Promise<void>((resolve) => lockedServer.listen(0, "127.0.0.1", resolve));
  try {
    const address = lockedServer.address();
    if (!address || typeof address === "string") throw new Error("Locked API test server failed to bind");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/repositories/goreecloud/code/branches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "feature", sourceRef: "main" }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json() as any).error, "write_authorization_unconfigured");
    assert.deepEqual(events.map((event) => event.phase), ["attempted", "denied"]);
  } finally {
    await new Promise<void>((resolve, reject) => lockedServer.close((error) => error ? reject(error) : resolve()));
  }
});

test("fails closed before mutation when the audit sink is unavailable", async () => {
  createdBranch = null;
  const lockedServer = createCodeServer(provider, {
    authorizeWrite: () => true,
    recordWriteAudit: async () => { throw new Error("disk unavailable"); },
  });
  await new Promise<void>((resolve) => lockedServer.listen(0, "127.0.0.1", resolve));
  try {
    const address = lockedServer.address();
    if (!address || typeof address === "string") throw new Error("Locked API test server failed to bind");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/repositories/goreecloud/code/branches`, {
      method: "POST",
      headers: { authorization: "Bearer test-write-token", "content-type": "application/json" },
      body: JSON.stringify({ name: "feature", sourceRef: "main" }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json() as any).error, "write_audit_unavailable");
    assert.equal(createdBranch, null);
  } finally {
    await new Promise<void>((resolve, reject) => lockedServer.close((error) => error ? reject(error) : resolve()));
  }
});

test("rejects unsupported methods and unknown routes", async () => {
  assert.equal((await fetch(`${baseUrl}/api/v1/repositories`, { method: "POST" })).status, 405);
  assert.equal((await fetch(`${baseUrl}/missing`)).status, 404);
});
