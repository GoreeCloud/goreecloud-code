const forgejoBaseUrl = required("FORGEJO_BASE_URL").replace(/\/$/, "");
const goreeCloudApiUrl = (process.env.GOREECLOUD_CODE_API_URL ?? "http://localhost:8787").replace(/\/$/, "");
const token = process.env.FORGEJO_TOKEN?.trim();
const repository = process.env.VALIDATE_REPOSITORY?.trim();

const headers = token ? { Authorization: `token ${token}` } : {};

console.log("GoreeCloud Code M1 validation");
console.log(`Forgejo: ${forgejoBaseUrl}`);
console.log(`GoreeCloud Code API: ${goreeCloudApiUrl}`);

await step("Forgejo version endpoint", async () => {
  const version = await json(`${forgejoBaseUrl}/api/v1/version`, { headers });
  assert(typeof version.version === "string" && version.version.length > 0, "Forgejo version is missing");
  return version.version;
});

await step("GoreeCloud Code provider health", async () => {
  const provider = await json(`${goreeCloudApiUrl}/api/v1/provider`);
  assert(provider.ok === true, "provider did not report healthy");
  assert(provider.provider === "forgejo", `unexpected provider: ${provider.provider}`);
  return `${provider.provider} ${provider.version ?? "unknown"}`;
});

const repositories = await step("Repository discovery through GoreeCloud Code", async () => {
  const response = await json(`${goreeCloudApiUrl}/api/v1/repositories`);
  assert(Array.isArray(response.repositories), "repositories payload is invalid");
  return response.repositories;
});

console.log(`  visible repositories: ${repositories.length}`);

if (!repository) {
  console.log("\nPartial validation complete.");
  console.log("Set VALIDATE_REPOSITORY=owner/name to exercise repository detail, branches, commits, issues, and pull requests.");
  process.exit(0);
}

const [owner, name, ...extra] = repository.split("/");
assert(owner && name && extra.length === 0, "VALIDATE_REPOSITORY must be owner/name");
const encoded = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

await step("Repository detail", () => json(`${goreeCloudApiUrl}/api/v1/repositories/${encoded}`));
await step("Branches", async () => {
  const response = await json(`${goreeCloudApiUrl}/api/v1/repositories/${encoded}/branches`);
  assert(Array.isArray(response.branches), "branches payload is invalid");
  return `${response.branches.length} branches`;
});
await step("Commits", async () => {
  const response = await json(`${goreeCloudApiUrl}/api/v1/repositories/${encoded}/commits`);
  assert(Array.isArray(response.commits), "commits payload is invalid");
  return `${response.commits.length} commits`;
});
await step("Issues", async () => {
  const response = await json(`${goreeCloudApiUrl}/api/v1/repositories/${encoded}/issues`);
  assert(Array.isArray(response.issues), "issues payload is invalid");
  return `${response.issues.length} issues`;
});
await step("Pull requests", async () => {
  const response = await json(`${goreeCloudApiUrl}/api/v1/repositories/${encoded}/pull-requests`);
  assert(Array.isArray(response.pullRequests), "pull-request payload is invalid");
  return `${response.pullRequests.length} pull requests`;
});

console.log("\nM1 read-path validation passed.");

async function step(label, task) {
  process.stdout.write(`- ${label} ... `);
  try {
    const result = await task();
    console.log(`ok${result === undefined ? "" : ` (${format(result)})`}`);
    return result;
  } catch (error) {
    console.log("failed");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function json(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.VALIDATION_TIMEOUT_MS ?? 10000));
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${url}${text ? `: ${text.slice(0, 500)}` : ""}`);
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timeout);
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function format(value) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return `${value.length} items`;
  return "validated";
}
