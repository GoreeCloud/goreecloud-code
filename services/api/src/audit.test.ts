import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { branchWriteAuditEvent, createJsonlAuditSink } from "./audit.ts";

test("writes data-minimized governed-write audit JSONL with restrictive permissions", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "goreecloud-code-audit-"));
  try {
    const target = path.join(directory, "private", "writes.jsonl");
    const sink = createJsonlAuditSink(target);
    const event = branchWriteAuditEvent(
      "operation-1",
      { owner: "goreecloud", name: "code" },
      { name: "feature/audit", sourceRef: "main" },
      "attempted",
    );
    await sink(event);

    assert.equal((await stat(target)).mode & 0o777, 0o600);
    const lines = (await readFile(target, "utf8")).trim().split("\n");
    assert.equal(lines.length, 1);
    const stored = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    assert.equal(stored.operationId, "operation-1");
    assert.equal(stored.action, "repository.branch.create");
    assert.equal(stored.phase, "attempted");
    assert.equal("authorization" in stored, false);
    assert.equal("token" in stored, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
