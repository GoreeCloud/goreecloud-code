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
}

type JournalState = "in_progress" | "succeeded" | "uncertain";

interface JournalRecord {
  version: 1;
  observedAt: string;
  keyHash: string;
  fingerprint: string;
  operationId: string;
  state: JournalState;
  result?: Branch;
  reason?: string;
}

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
          version: 1,
          observedAt: new Date().toISOString(),
          keyHash,
          fingerprint,
          operationId,
          state: "in_progress",
        });
        return { kind: "reserved", operationId };
      });
    },
    markSucceeded(key, operationId, repository, branch, result) {
      return serialized(async () => append({
        version: 1,
        observedAt: new Date().toISOString(),
        keyHash: digest(key),
        fingerprint: operationFingerprint(repository, branch),
        operationId,
        state: "succeeded",
        result,
      }));
    },
    markUncertain(key, operationId, repository, branch, reason) {
      return serialized(async () => append({
        version: 1,
        observedAt: new Date().toISOString(),
        keyHash: digest(key),
        fingerprint: operationFingerprint(repository, branch),
        operationId,
        state: "uncertain",
        ...(reason ? { reason: reason.slice(0, 160) } : {}),
      }));
    },
  };
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function operationFingerprint(repository: RepositoryId, branch: CreateBranchInput): string {
  return digest(JSON.stringify({
    action: "repository.branch.create",
    repository: { owner: repository.owner, name: repository.name },
    branch: { name: branch.name, sourceRef: branch.sourceRef },
  }));
}

function validRecord(value: unknown): value is JournalRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || typeof row.observedAt !== "string") return false;
  if (!hexDigest(row.keyHash) || !hexDigest(row.fingerprint)) return false;
  if (typeof row.operationId !== "string" || !row.operationId) return false;
  if (!(["in_progress", "succeeded", "uncertain"] as unknown[]).includes(row.state)) return false;
  if (row.reason !== undefined && typeof row.reason !== "string") return false;
  if (row.state === "succeeded") {
    if (!row.result || typeof row.result !== "object" || Array.isArray(row.result)) return false;
    const result = row.result as Record<string, unknown>;
    if (typeof result.name !== "string" || typeof result.sha !== "string" || typeof result.protected !== "boolean") return false;
  }
  return true;
}

function hexDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
