import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { CreateBranchInput, RepositoryId } from "@goreecloud/code-contracts";

export type BranchWriteAuditPhase = "attempted" | "succeeded" | "failed" | "denied";

export interface BranchWriteAuditEvent {
  version: 1;
  eventId: string;
  operationId: string;
  observedAt: string;
  action: "repository.branch.create";
  phase: BranchWriteAuditPhase;
  repository: RepositoryId;
  branch: CreateBranchInput;
  reason?: string;
}

export type WriteAuditSink = (event: BranchWriteAuditEvent) => Promise<void>;

export function branchWriteAuditEvent(
  operationId: string,
  repository: RepositoryId,
  branch: CreateBranchInput,
  phase: BranchWriteAuditPhase,
  reason?: string,
): BranchWriteAuditEvent {
  return {
    version: 1,
    eventId: randomUUID(),
    operationId,
    observedAt: new Date().toISOString(),
    action: "repository.branch.create",
    phase,
    repository,
    branch,
    ...(reason ? { reason } : {}),
  };
}

export function createJsonlAuditSink(filePath: string): WriteAuditSink {
  const target = filePath.trim();
  if (!target) throw new Error("Audit log file path is required");
  return async (event) => {
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await appendFile(target, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
  };
}
