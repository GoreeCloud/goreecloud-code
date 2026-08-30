import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createJsonlIdempotencyStore } from "./idempotency.ts";

const repository = { owner: "goreecloud", name: "code" };
const branch = { name: "feature/idempotent", sourceRef: "main" };

test("persists hashed idempotency records with restrictive permissions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "goreecloud-code-idempotency-"));
  const file = join(directory, "state", "branch-writes.jsonl");
  const store = createJsonlIdempotencyStore(file);
  const key = "request-12345678";

  const reserved = await store.reserve(key, "operation-1", repository, branch);
  assert.deepEqual(reserved, { kind: "reserved", operationId: "operation-1" });
  await store.markSucceeded(key, "operation-1", repository, branch, {
    name: branch.name,
    sha: "abc123",
    protected: false,
  });

  const text = await readFile(file, "utf8");
  assert.equal(text.includes(key), false);
  assert.equal(text.includes("abc123"), true);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
});

test("replays a completed operation without creating a second reservation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "goreecloud-code-idempotency-"));
  const file = join(directory, "branch-writes.jsonl");
  const store = createJsonlIdempotencyStore(file);
  const key = "request-abcdefgh";

  await store.reserve(key, "operation-1", repository, branch);
  await store.markSucceeded(key, "operation-1", repository, branch, {
    name: branch.name,
    sha: "abc123",
    protected: false,
  });

  const replay = await store.reserve(key, "operation-2", repository, branch);
  assert.deepEqual(replay, {
    kind: "replay",
    operationId: "operation-1",
    branch: { name: branch.name, sha: "abc123", protected: false },
  });
});

test("detects conflicting and unresolved idempotency keys", async () => {
  const directory = await mkdtemp(join(tmpdir(), "goreecloud-code-idempotency-"));
  const store = createJsonlIdempotencyStore(join(directory, "branch-writes.jsonl"));
  const key = "request-conflict1";

  await store.reserve(key, "operation-1", repository, branch);
  assert.deepEqual(await store.reserve(key, "operation-2", repository, branch), {
    kind: "unresolved",
    operationId: "operation-1",
    state: "in_progress",
  });
  assert.deepEqual(await store.reserve(key, "operation-3", repository, { name: "different", sourceRef: "main" }), {
    kind: "conflict",
    operationId: "operation-1",
  });

  await store.markUncertain(key, "operation-1", repository, branch, "provider timeout");
  assert.deepEqual(await store.reserve(key, "operation-4", repository, branch), {
    kind: "unresolved",
    operationId: "operation-1",
    state: "uncertain",
  });
});
