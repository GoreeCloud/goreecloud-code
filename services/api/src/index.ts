import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import type { ForgeProvider, RepositoryId } from "@goreecloud/code-contracts";
import { ForgejoProvider } from "@goreecloud/code-forgejo";

const port = numberEnv("PORT", 8787);
const host = process.env.HOST ?? "0.0.0.0";
const provider = createProvider();

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS") {
    return send(response, 204, null);
  }

  if (request.method !== "GET") {
    return send(response, 405, { error: "method_not_allowed" });
  }

  try {
    if (url.pathname === "/health") {
      return send(response, 200, {
        service: "goreecloud-code-api",
        ok: true,
        provider: await provider.health(),
      });
    }

    if (url.pathname === "/api/v1/provider") {
      return send(response, 200, await provider.health());
    }

    if (url.pathname === "/api/v1/repositories") {
      return send(response, 200, { repositories: await provider.repositories() });
    }

    const match = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)(?:\/(branches|commits|issues|pull-requests))?$/);
    if (match) {
      const id: RepositoryId = {
        owner: decodeURIComponent(match[1]),
        name: decodeURIComponent(match[2]),
      };
      const resource = match[3];

      if (!resource) return send(response, 200, await provider.repository(id));
      if (resource === "branches") return send(response, 200, { branches: await provider.branches(id) });
      if (resource === "commits") return send(response, 200, { commits: await provider.commits(id, url.searchParams.get("ref") ?? undefined) });
      if (resource === "issues") return send(response, 200, { issues: await provider.issues(id) });
      if (resource === "pull-requests") return send(response, 200, { pullRequests: await provider.pullRequests(id) });
    }

    return send(response, 404, { error: "not_found" });
  } catch (error) {
    console.error(error);
    return send(response, 502, {
      error: "provider_request_failed",
      message: error instanceof Error ? error.message : "Unknown provider error",
    });
  }
});

server.listen(port, host, () => {
  console.log(`GoreeCloud Code API listening on http://${host}:${port}`);
});

function createProvider(): ForgeProvider {
  const baseUrl = requiredEnv("FORGEJO_BASE_URL");
  return new ForgejoProvider({
    baseUrl,
    token: process.env.FORGEJO_TOKEN,
    username: process.env.FORGEJO_USERNAME,
    timeoutMs: numberEnv("FORGEJO_TIMEOUT_MS", 10_000),
  });
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("access-control-allow-origin", process.env.CORS_ORIGIN ?? "http://localhost:5173");
  response.setHeader("access-control-allow-methods", "GET, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type, authorization");
  response.setHeader("cache-control", "no-store");

  if (body === null) return response.end();
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
