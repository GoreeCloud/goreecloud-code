import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import type { CreateBranchInput, ForgeProvider, RepositoryId } from "@goreecloud/code-contracts";
import { branchWriteAuditEvent, type WriteAuditSink } from "./audit.ts";
import type { BranchWriteIdempotencyStore } from "./idempotency.ts";
import { assessBranchWriteReconciliation } from "./reconciliation.ts";

export interface CodeServerOptions {
  corsOrigin?: string;
  authorizeWrite?: (authorizationHeader: string | undefined) => boolean | Promise<boolean>;
  recordWriteAudit?: WriteAuditSink;
  idempotency?: BranchWriteIdempotencyStore;
}

const MAX_WRITE_BODY_BYTES = 8 * 1024;

export function createCodeServer(provider: ForgeProvider, options: CodeServerOptions = {}) {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "OPTIONS") return send(response, 204, null, options);

    try {
      if (request.method === "GET") {
        if (url.pathname === "/health") {
          return send(response, 200, {
            service: "goreecloud-code-api",
            ok: true,
            provider: await provider.health(),
            governedWrites: {
              authorizationConfigured: Boolean(options.authorizeWrite),
              auditConfigured: Boolean(options.recordWriteAudit),
              idempotencyConfigured: Boolean(options.idempotency),
            },
          }, options);
        }

        if (url.pathname === "/api/v1/provider") {
          return send(response, 200, await provider.health(), options);
        }

        if (url.pathname === "/api/v1/repositories") {
          return send(response, 200, { repositories: await provider.repositories() }, options);
        }

        const governedWrite = governedWriteRoute(url.pathname);
        if (governedWrite) {
          if (!options.authorizeWrite) {
            return send(response, 503, { error: "write_authorization_unconfigured" }, options);
          }
          if (!(await options.authorizeWrite(request.headers.authorization))) {
            return send(response, 403, { error: "write_authorization_failed" }, options);
          }
          if (!options.idempotency) {
            return send(response, 503, { error: "write_idempotency_unconfigured" }, options);
          }
          let operation;
          try {
            operation = await options.idempotency.lookupOperation(governedWrite.operationId);
          } catch {
            return send(response, 503, { error: "write_idempotency_unavailable" }, options);
          }
          if (!operation) return send(response, 404, { error: "governed_write_operation_not_found" }, options);
          if (governedWrite.resource === "reconciliation") {
            const reconciliation = await assessBranchWriteReconciliation(provider, operation);
            return send(response, 200, { operation, reconciliation }, options);
          }
          return send(response, 200, { operation }, options);
        }

        const match = repositoryRoute(url.pathname);
        if (match) {
          const { id, resource } = match;
          if (!resource) return send(response, 200, await provider.repository(id), options);
          if (resource === "branches") return send(response, 200, { branches: await provider.branches(id) }, options);
          if (resource === "commits") return send(response, 200, { commits: await provider.commits(id, url.searchParams.get("ref") ?? undefined) }, options);
          if (resource === "issues") return send(response, 200, { issues: await provider.issues(id) }, options);
          if (resource === "pull-requests") return send(response, 200, { pullRequests: await provider.pullRequests(id) }, options);
        }

        return send(response, 404, { error: "not_found" }, options);
      }

      if (request.method === "POST") {
        const match = repositoryRoute(url.pathname);
        if (match?.resource === "branches") {
          const auditSink = options.recordWriteAudit;
          if (!auditSink) return send(response, 503, { error: "write_audit_unconfigured" }, options);
          const idempotency = options.idempotency;
          if (!idempotency) return send(response, 503, { error: "write_idempotency_unconfigured" }, options);
          if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
            return send(response, 415, { error: "application_json_required" }, options);
          }

          const input = parseCreateBranchInput(await readJsonBody(request));
          const idempotencyKey = parseIdempotencyKey(request.headers["idempotency-key"]);

          if (!options.authorizeWrite) {
            const operationId = randomUUID();
            if (!(await recordAuditAttempt(auditSink, operationId, match.id, input))) {
              return send(response, 503, { error: "write_audit_unavailable" }, options);
            }
            await recordAuditOutcome(auditSink, operationId, match.id, input, "denied", "write_authorization_unconfigured");
            return send(response, 503, { error: "write_authorization_unconfigured", operationId }, options);
          }
          if (!(await options.authorizeWrite(request.headers.authorization))) {
            const operationId = randomUUID();
            if (!(await recordAuditAttempt(auditSink, operationId, match.id, input))) {
              return send(response, 503, { error: "write_audit_unavailable" }, options);
            }
            await recordAuditOutcome(auditSink, operationId, match.id, input, "denied", "write_authorization_failed");
            return send(response, 403, { error: "write_authorization_failed", operationId }, options);
          }

          const requestedOperationId = randomUUID();
          let reservation;
          try {
            reservation = await idempotency.reserve(idempotencyKey, requestedOperationId, match.id, input);
          } catch {
            return send(response, 503, { error: "write_idempotency_unavailable" }, options);
          }

          if (reservation.kind === "conflict") {
            await recordAuditOutcome(auditSink, requestedOperationId, match.id, input, "denied", "idempotency_key_conflict");
            return send(response, 409, {
              error: "idempotency_key_conflict",
              operationId: reservation.operationId,
            }, options);
          }
          if (reservation.kind === "unresolved") {
            await recordAuditOutcome(auditSink, requestedOperationId, match.id, input, "denied", `idempotency_${reservation.state}`);
            return send(response, 409, {
              error: "idempotency_operation_unresolved",
              operationId: reservation.operationId,
              state: reservation.state,
              reconciliationRequired: true,
            }, options);
          }
          if (reservation.kind === "replay") {
            await recordAuditOutcome(auditSink, reservation.operationId, match.id, input, "succeeded", "idempotency_replay");
            return send(response, 200, {
              branch: reservation.branch,
              operationId: reservation.operationId,
              idempotency: { replayed: true },
            }, options);
          }

          const operationId = reservation.operationId;
          if (!(await recordAuditAttempt(auditSink, operationId, match.id, input))) {
            await idempotency.markUncertain(idempotencyKey, operationId, match.id, input, "audit_unavailable_after_reservation").catch(() => {});
            return send(response, 503, {
              error: "write_audit_unavailable",
              operationId,
              reconciliationRequired: true,
            }, options);
          }

          try {
            const branch = await provider.createBranch(match.id, input);
            try {
              await idempotency.markSucceeded(idempotencyKey, operationId, match.id, input, branch);
            } catch {
              await recordAuditOutcome(auditSink, operationId, match.id, input, "succeeded", "idempotency_outcome_persistence_failed");
              return send(response, 503, {
                error: "write_outcome_persistence_failed",
                operationId,
                branch,
                reconciliationRequired: true,
              }, options);
            }
            const outcomeRecorded = await recordAuditOutcome(auditSink, operationId, match.id, input, "succeeded");
            return send(response, 201, {
              branch,
              operationId,
              audit: { attemptRecorded: true, outcomeRecorded },
              idempotency: { replayed: false },
            }, options);
          } catch (error) {
            const reason = error instanceof Error ? error.message.slice(0, 160) : "provider_request_failed";
            await idempotency.markUncertain(idempotencyKey, operationId, match.id, input, reason).catch(() => {});
            await recordAuditOutcome(auditSink, operationId, match.id, input, "failed", reason);
            return send(response, 502, {
              error: "provider_request_failed",
              message: error instanceof Error ? error.message : "Unknown provider error",
              operationId,
              reconciliationRequired: true,
            }, options);
          }
        }
      }

      return send(response, 405, { error: "method_not_allowed" }, options);
    } catch (error) {
      const status = errorStatus(error);
      return send(response, status, {
        error: status < 500 ? "invalid_request" : "provider_request_failed",
        message: error instanceof Error ? error.message : "Unknown provider error",
      }, options);
    }
  });
}

async function recordAuditAttempt(
  sink: WriteAuditSink,
  operationId: string,
  repository: RepositoryId,
  branch: CreateBranchInput,
): Promise<boolean> {
  try {
    await sink(branchWriteAuditEvent(operationId, repository, branch, "attempted"));
    return true;
  } catch {
    return false;
  }
}

async function recordAuditOutcome(
  sink: WriteAuditSink,
  operationId: string,
  repository: RepositoryId,
  branch: CreateBranchInput,
  phase: "succeeded" | "failed" | "denied",
  reason?: string,
): Promise<boolean> {
  try {
    await sink(branchWriteAuditEvent(operationId, repository, branch, phase, reason));
    return true;
  } catch {
    return false;
  }
}

function governedWriteRoute(pathname: string): { operationId: string; resource?: "reconciliation" } | null {
  const match = pathname.match(/^\/api\/v1\/governed-writes\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/(reconciliation))?$/i);
  const operationId = match?.[1]?.toLowerCase();
  if (!operationId) return null;
  return {
    operationId,
    ...(match?.[2] === "reconciliation" ? { resource: "reconciliation" as const } : {}),
  };
}

function repositoryRoute(pathname: string): { id: RepositoryId; resource?: string } | null {
  const match = pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)(?:\/(branches|commits|issues|pull-requests))?$/);
  if (!match) return null;
  const owner = match[1];
  const name = match[2];
  if (!owner || !name) return null;
  const resource = match[3];
  return {
    id: {
      owner: decodeURIComponent(owner),
      name: decodeURIComponent(name),
    },
    ...(resource ? { resource } : {}),
  };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_WRITE_BODY_BYTES) throw httpError(413, "Write request body too large");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw httpError(400, "Invalid JSON request body");
  }
}

function parseCreateBranchInput(value: unknown): CreateBranchInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw httpError(400, "Branch creation body must be an object");
  }
  const row = value as Record<string, unknown>;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const sourceRef = typeof row.sourceRef === "string" ? row.sourceRef.trim() : "";
  if (!validRef(name, true)) throw httpError(400, "Invalid branch name");
  if (!validRef(sourceRef, false)) throw httpError(400, "Invalid source ref");
  return { name, sourceRef };
}

function parseIdempotencyKey(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
    throw httpError(400, "A valid Idempotency-Key header is required");
  }
  return value;
}

function validRef(value: string, branchName: boolean): boolean {
  if (!value || value.length > (branchName ? 255 : 512)) return false;
  if (value === "@" || value === "HEAD" || value.startsWith("-") || value.startsWith("/") || value.endsWith("/") || value.endsWith(".")) return false;
  if (value.includes("..") || value.includes("@{") || value.includes("//")) return false;
  if (branchName && value.startsWith("refs/")) return false;
  if (value.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".lock"))) return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 32 || code === 127 || "~^:?*[\\".includes(character)) return false;
  }
  return true;
}

function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

function errorStatus(error: unknown): number {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    if (Number.isInteger(status) && status >= 400 && status < 500) return status;
  }
  return 502;
}

function send(response: ServerResponse, status: number, body: unknown, options: CodeServerOptions) {
  response.statusCode = status;
  response.setHeader("access-control-allow-origin", options.corsOrigin ?? "http://localhost:5173");
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type, authorization, idempotency-key");
  response.setHeader("cache-control", "no-store");

  if (body === null) return response.end();
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
