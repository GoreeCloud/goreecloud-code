import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ForgeProvider } from "@goreecloud/code-contracts";
import { ForgejoProvider } from "@goreecloud/code-forgejo";
import { createJsonlAuditSink } from "./audit.js";
import { createJsonlIdempotencyStore } from "./idempotency.js";
import { createCodeServer } from "./server.js";

const port = numberEnv("PORT", 8787);
const host = process.env.HOST ?? "0.0.0.0";
const provider = createProvider();
const writeToken = optionalSecretFile("GOREECLOUD_CODE_WRITE_TOKEN_FILE");
const auditLogFile = process.env.GOREECLOUD_CODE_AUDIT_LOG_FILE?.trim();
const idempotencyFile = process.env.GOREECLOUD_CODE_IDEMPOTENCY_FILE?.trim();
const server = createCodeServer(provider, {
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  ...(writeToken ? { authorizeWrite: (authorization: string | undefined) => bearerMatches(authorization, writeToken) } : {}),
  ...(auditLogFile ? { recordWriteAudit: createJsonlAuditSink(auditLogFile) } : {}),
  ...(idempotencyFile ? { idempotency: createJsonlIdempotencyStore(idempotencyFile) } : {}),
});

server.listen(port, host, () => {
  console.log(`GoreeCloud Code API listening on http://${host}:${port}`);
});

function createProvider(): ForgeProvider {
  const baseUrl = requiredEnv("FORGEJO_BASE_URL");
  const token = process.env.FORGEJO_TOKEN?.trim();
  const username = process.env.FORGEEJO_USERNAME?.trim() ?? process.env.FORGEJO_USERNAME?.trim();
  return new ForgejoProvider({
    baseUrl,
    ...(token ? { token } : {}),
    ...(username ? { username } : {}),
    timeoutMs: numberEnv("FORGEJO_TIMEOUT_MS", 10_000),
  });
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalSecretFile(name: string): string | undefined {
  const filePath = process.env[name]?.trim();
  if (!filePath) return undefined;
  const value = readFileSync(filePath, "utf8").trim();
  if (!value) throw new Error(`${name} must point to a non-empty secret file`);
  return value;
}

function bearerMatches(authorization: string | undefined, expectedToken: string): boolean {
  const prefix = "Bearer ";
  if (!authorization?.startsWith(prefix)) return false;
  const supplied = Buffer.from(authorization.slice(prefix.length), "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}
