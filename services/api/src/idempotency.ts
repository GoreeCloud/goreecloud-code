import { createHash } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Branch, CreateBranchInput, RepositoryId } from "@goreecloud/code-contracts";

export interface BranchWriteReservation {
  kind: "reserved";
  operationId: string;
}

export interface BranchWriteReplay {
  kind: "replay";
  operationId: string;
  branch: Branch;
}

export interface BranchWriteConflict {
  kind: "conflict";
  operationId: string;
}

export interface BranchWriteUnresolved {
  kind: "unresolved";
  operationId: string;
  state: "in_progress" | "uncertain";
}

export type BranchWriteReserveResult =
  | BranchWriteReservation
  | BranchWriteReplay
  | BranchWriteConflict
  | BranchWriteUnresolved;

export interface BranchWriteOperationDescriptor {
  action: "repository.branch.create";
  repository: RepositoryId;
  branch: CreateBranchInput;
}

export interface BranchWriteOperationStatus {
  operationId: string;
  state: "in_progress" | "succeeded" | "uncertain";
  observedAt: string;
  reconciliationRequired: boolean;
  operation?: BranchWriteOperationDescriptor;
  branch?: Branch;
}

export interface BranchWriteIdempotencyStore {
  reserve(
    key: string,
    operationId: string,
    repository: RepositoryId,
    branch: CreateBranchInput,
  ): Promise<BranchWriteReserveResult>;
  markSucceeded(
    key: string,
    operationId: string,
    repository: RepositoryId,
    branch: CreateBranchInput,
    result: Branch,
  ): Promise<void>;
  markUncertain(
    key: string,
    operationId: string,
    repository: RepositoryId,
    branch: CreateBranchInput,
    reason?: string,
  ): Promise<void>;
  lookupOperation(operationId: string): Promise<BranchWriteOperationStatus | null>;
}

type JournalState = "in_progress" | "succeeded" | "uncertain";

interface JournalRecordV1 {
  version: 1;
  observedAt: string;
  keyHash: string;
  fingerprint: string;
  operationId: string;
  state: JournalState;
  result?: Branch;
  reason?: string;
}

interface JournalRecordV2 {
  version: 2;
  observedAt: string;
  keyHash: string;
  fingerprint: string;
  operationId: string;
  state: JournalState;
  operation: BranchWriteOperationDescriptor;
  result?: Branch;
  reason?: string;
}

type JournalRecord = JournalRecordV1 | JournalRecordV2;

const MAX_JOURNAL_BYTES = 4 * 1024 * 1024;

export function createJsonlIdempotencyStore(filePath: string): BranchWriteIdempotencyStore {
  const target = filePath.trim();
  if (!target) throw new Error("Idempotency journal file path is required");

  let mutationTail: Promise<void> = Promise.resolve();
  async function serialized<T>(work: () => Promise<T>): Promise<T> {
    const previous = mutationTail;
    let release!: () => void;
    mutationTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  async function load(): Promise<JournalRecord[]> {
    let text: string;
    try {
      text = await readFile(target, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
      throw error;
    }
    if (Buffer.byteLength(text, "utf8") > MAX_JOURNAL_BYTES) {
      throw new Error("Idempotency journal capacity exceeded");
    }
    const records: JournalRecord[] = [];
    for (const line of text.split("\n")) {
      if (!line) continue;
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new Error("Idempotency journal contains invalid JSON");
      }
      if (!validRecord(value)) throw new Error("Idempotency journal contains an invalid record");
      records.push(value);
    }
    return records;
  }

  async function append(record: JournalRecord): Promise<void> {
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const handle = await open(target, "a", 0o600);
    try {
      await handle.chmod(0o600);
      const stat = await handle.stat();
      const encoded = `${JSON.stringify(record)}\n`;
      if (stat.size + Buffer.byteLength(encoded, "utf8") > MAX_JOURNAL_BYTES) {
        throw new Error("Idempotency journal capacity exceeded");
      }
      await handle.appendFile(encoded, "utf8");
    } finally {
      await handle.close();
    }
  }

  return {
    reserve(key, operationId, repository, branch) {
      return serialized(async () => {
        const keyHash = digest(key);
        const fingerprint = operationFingerprint(repository, branch);
        const records = await load();
        const matching = records.filter((record) => record.keyHash === keyHash);
        if (matching.length) {
          const first = matching[0]!;
          const latest = matching[matching.length - 1]!;
          if (first.fingerprint !== fingerprint || latest.fingerprint !== fingerprint) {
            return { kind: "conflict", operationId: latest.operationId };
          }
          if (latest.state === "succeeded") {
            if (!latest.result) throw new Error("Succeeded idempotency record is missing its result");
            return { kind: "replay", operationId: latest.operationId, branch: latest.result };
          }
          return { kind: "unresolved", operationId: latest.operationId, state: latest.state };
        }
        await append({
          version: 2,
          observedAt: new Date().toISOString(),
          keyHash,
          fingerprint,
          operationId,
          state: "in_progress",
          operation: operationDescriptor(repository, branch),
        });
        return { kind: "reserved", operationId };
      });
    },
    markSucceeded(key, operationId, repository, branch, result) {
      return serialized(async () => append({
        version: 2,
        observedAt: new Date().toISOString(),
        keyHash: digest(key),
        fingerprint: operationFingerprint(repository, branch),
        operationId,
        state: "succeeded",
        operation: operationDescriptor(repository, branch),
        result,
      }));
    },
    markUncertain(key, operationId, repository, branch, reason) {
      return serialized(async () => append({
        version: 2,
        observedAt: new Date().toISOString(),
        keyHash: digest(key),
        fingerprint: operationFingerprint(repository, branch),
        operationId,
        state: "uncertain",
        operation: operationDescriptor(repository, branch),
        ...(reason ? { reason: reason.slice(0, 160) } : {}),
      }));
    },
    lookupOperation(operationId) {
      return serialized(async () => {
        const normalized = operationId.trim();
        if (!normalized) return null;
        const matching = (await load()).filter((record) => record.operationId === normalized);
        if (!matching.length) return null;
        const latest = matching[matching.length - 1]!;
        return {
          operationId: latest.operationId,
          state: latest.state,
          observedAt: latest.observedAt,
          reconciliationRequired: latest.state !== "succeeded",
          ...(latest.version === 2 ? { operation: latest.operation } : {}),
          ...(latest.state === "succeeded" && latest.result ? { branch: latest.result } : {}),
        };
      });
    },
  };
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function operationDescriptor(repository: RepositoryId, branch: CreateBranchInput): BranchWriteOperationDescriptor {
  return {
    action: "repository.branch.create",
    repository: { owner: repository.owner, name: repository.name },
    branch: { name: branch.name, sourceRef: branch.sourceRef },
  };
}

function operationFingerprint(repository: RepositoryId, branch: CreateBranchInput): string {
  return digest(JSON.stringify(operationDescriptor(repository, branch)));
}

function validRecord(value: unknown): value is JournalRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if ((row.version !== 1 && row.version !== 2) || typeof row.observedAt !== "string") return false;
  if (!hexDigest(row.keyHash) || !hexDigest(row.fingerprint)) return false;
  if (typeof row.operationId !== "string" || !row.operationId) return false;
  if (!(["in_progress", "succeeded", "uncertain"] as unknown[]).includes(row.state)) return false;
  if (row.version === 2 && !validOperation(row.operation)) return false;
  if (row.reason !== undefined && typeof row.reason !== "string") return false;
  if (row.state === "succeeded") {
    if (!row.result || typeof row.result !== "object" || Array.isArray(row.result)) return false;
    const result = row.result as Record<string, unknown>;
    if (typeof result.name !== "string" || typeof result.sha !== "string" || typeof result.protected !== "boolean") return false;
  }
  return true;
}

function validOperation(value: unknown): value is BranchWriteOperationDescriptor {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const operation = value as Record<string, unknown>;
  if (operation.action !== "repository.branch.create") return false;
  if (!operation.repository || typeof operation.repository !== "object" || Array.isArray(operation.repository)) return false;
  if (!operation.branch || typeof operation.branch !== "object" || Array.isArray(operation.branch)) return false;
  const repository = operation.repository as Record<string, unknown>;
  const branch = operation.branch as Record<string, unknown>;
  return typeof repository.owner === "string" && repository.owner.length > 0
    && typeof repository.name === "string" && repository.name.length > 0
    && typeof branch.name === "string" && branch.name.length > 0
    && typeof branch.sourceRef === "string" && branch.sourceRef.length > 0;
}

function hexDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
