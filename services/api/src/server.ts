import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import type { CreateBranchInput, ForgeProvider, RepositoryId } from "@goreecloud/code-contracts";

export interface CodeServerOptions {
  corsOrigin?: string;
  authorizeWrite?: (authorizationHeader: string | undefined) => boolean | Promise<boolean>;
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
          }, options);
        }

        if (url.pathname === "/api/v1/provider") {
          return send(response, 200, await provider.health(), options);
        }

        if (url.pathname === "/api/v1/repositories") {
          return send(response, 200, { repositories: await provider.repositories() }, options);
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
          if (!options.authorizeWrite) {
            return send(response, 503, { error: "write_authorization_unconfigured" }, options);
          }
          if (!(await options.authorizeWrite(request.headers.authorization))) {
            return send(response, 403, { error: "write_authorization_failed" }, options);
          }
          if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
            return send(response, 415, { error: "application_json_required" }, options);
          }
          const input = parseCreateBranchInput(await readJsonBody(request));
          return send(response, 201, { branch: await provider.createBranch(match.id, input) }, options);
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

function repositoryRoute(pathname: string): { id: RepositoryId; resource?: string } | null {
  const match = pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)(?:\/(branches|commits|issues|pull-requests))?$/);
  if (!match) return null;
  return {
    id: {
      owner: decodeURIComponent(match[1]),
      name: decodeURIComponent(match[2]),
    },
    resource: match[3],
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
  response.setHeader("access-control-allow-headers", "content-type, authorization");
  response.setHeader("cache-control", "no-store");

  if (body === null) return response.end();
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
