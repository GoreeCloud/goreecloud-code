import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { ForgejoProvider } from "./index.ts";

let baseUrl = "";
let server: ReturnType<typeof createServer>;
let lastBranchRequest: { method?: string; authorization?: string; body?: unknown } | null = null;

before(async () => {
  server = createServer(async (request, response) => {
    response.setHeader("content-type", "application/json");
    const requestPath = request.url ?? "";
    if (requestPath === "/api/v1/version") return response.end(JSON.stringify({ version: "11.0.0-test" }));
    if (requestPath.startsWith("/api/v1/user/repos")) return response.end(JSON.stringify([{ id: 7, name: "code", owner: { login: "goreecloud" }, default_branch: "main", private: true, html_url: "https://forge.test/goreecloud/code" }]));
    if (requestPath === "/api/v1/repos/goreecloud/code/branches?limit=100") return response.end(JSON.stringify([{ name: "main", protected: true, commit: { id: "abc123" } }]));
    if (requestPath === "/api/v1/repos/goreecloud/code/branches" && request.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      lastBranchRequest = {
        method: request.method,
        ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      };
      response.statusCode = 201;
      return response.end(JSON.stringify({ name: "feature/security", protected: false, commit: { id: "def456" } }));
    }
    if (requestPath === "/api/v1/repos/goreecloud/code/issues?state=all&limit=50") return response.end(JSON.stringify([{ number: 1, title: "Issue", state: "open", html_url: "https://forge.test/i/1" }, { number: 2, title: "PR", state: "open", pull_request: {}, html_url: "https://forge.test/p/2" }]));
    response.statusCode = 404;
    response.end(JSON.stringify({ message: "not found" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Mock server failed to bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

test("reports provider health and version", async () => {
  const provider = new ForgejoProvider({ baseUrl, token: "test-token" });
  const health = await provider.health();
  assert.equal(health.ok, true);
  assert.equal(health.provider, "forgejo");
  assert.equal(health.version, "11.0.0-test");
  assert.equal(health.capabilities.includes("repositories:write"), true);
});

test("maps repositories and branches into provider-neutral contracts", async () => {
  const provider = new ForgejoProvider({ baseUrl, token: "test-token" });
  const [repository] = await provider.repositories();
  assert.deepEqual(repository, {
    id: "7",
    owner: "goreecloud",
    name: "code",
    defaultBranch: "main",
    private: true,
    webUrl: "https://forge.test/goreecloud/code",
  });
  assert.deepEqual(await provider.branches({ owner: "goreecloud", name: "code" }), [{ name: "main", sha: "abc123", protected: true }]);
});

test("creates branches through the Forgejo adapter using the current old_ref_name field", async () => {
  const provider = new ForgejoProvider({ baseUrl, token: "test-token" });
  const branch = await provider.createBranch(
    { owner: "goreecloud", name: "code" },
    { name: "feature/security", sourceRef: "main" },
  );
  assert.deepEqual(branch, { name: "feature/security", sha: "def456", protected: false });
  assert.deepEqual(lastBranchRequest, {
    method: "POST",
    authorization: "token test-token",
    body: { new_branch_name: "feature/security", old_ref_name: "main" },
  });
});

test("refuses branch creation without a provider token", async () => {
  const provider = new ForgejoProvider({ baseUrl, username: "goreecloud" });
  await assert.rejects(
    () => provider.createBranch({ owner: "goreecloud", name: "code" }, { name: "feature", sourceRef: "main" }),
    /requires FORGEJO_TOKEN/,
  );
});

test("filters pull requests from issue results", async () => {
  const provider = new ForgejoProvider({ baseUrl, token: "test-token" });
  const issues = await provider.issues({ owner: "goreecloud", name: "code" });
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.number, 1);
});

test("requires an explicit discovery identity", async () => {
  const provider = new ForgejoProvider({ baseUrl });
  await assert.rejects(() => provider.repositories(), /FORGEJO_TOKEN or FORGEJO_USERNAME/);
});
