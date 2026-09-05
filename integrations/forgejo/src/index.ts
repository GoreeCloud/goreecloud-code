import type {
  Branch,
  Commit,
  CreateBranchInput,
  ForgeProvider,
  Issue,
  ProviderHealth,
  PullRequest,
  Repository,
  RepositoryId,
} from "@goreecloud/code-contracts";

export interface ForgejoProviderOptions {
  baseUrl: string;
  token?: string;
  username?: string;
  timeoutMs?: number;
}

export class ForgejoProvider implements ForgeProvider {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly username: string | undefined;
  private readonly timeoutMs: number;

  constructor(options: ForgejoProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.username = options.username;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  private async request<T>(path: string, init: { method?: string; body?: string } = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const requestInit: RequestInit = {
        method: init.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(this.token ? { Authorization: `token ${this.token}` } : {}),
        },
        signal: controller.signal,
      };
      if (init.body !== undefined) requestInit.body = init.body;

      const response = await fetch(`${this.baseUrl}/api/v1${path}`, requestInit);

      if (!response.ok) {
        throw new Error(`Forgejo request failed: ${response.status} ${response.statusText}`);
      }

      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeout);
    }
  }

  async health(): Promise<ProviderHealth> {
    const startedAt = Date.now();
    try {
      const version = await this.request<{ version: string }>("/version");
      return {
        provider: "forgejo",
        ok: true,
        version: version.version,
        baseUrl: this.baseUrl,
        latencyMs: Date.now() - startedAt,
        capabilities: [
          "repositories:read",
          ...(this.token ? ["repositories:write" as const] : []),
          "issues:read",
          "pullRequests:read",
        ],
      };
    } catch (error) {
      return {
        provider: "forgejo",
        ok: false,
        baseUrl: this.baseUrl,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown provider error",
        capabilities: [],
      };
    }
  }

  async repositories(): Promise<Repository[]> {
    const path = this.token
      ? "/user/repos?limit=50&sort=updated"
      : this.username
        ? `/users/${encodeURIComponent(this.username)}/repos?limit=50`
        : null;

    if (!path) {
      throw new Error("Forgejo repository discovery requires FORGEJO_TOKEN or FORGEJO_USERNAME");
    }

    const repos = await this.request<Array<Record<string, unknown>>>(path);
    return repos.map(mapRepository);
  }

  async repository(id: RepositoryId): Promise<Repository> {
    return mapRepository(await this.request<Record<string, unknown>>(`/repos/${encodeURIComponent(id.owner)}/${encodeURIComponent(id.name)}`));
  }

  async branches(id: RepositoryId): Promise<Branch[]> {
    const rows = await this.request<Array<Record<string, any>>>(`/repos/${encodeURIComponent(id.owner)}/${encodeURIComponent(id.name)}/branches?limit=100`);
    return rows.map(mapBranch);
  }

  async createBranch(id: RepositoryId, input: CreateBranchInput): Promise<Branch> {
    if (!this.token) throw new Error("Forgejo branch creation requires FORGEJO_TOKEN");
    const row = await this.request<Record<string, any>>(
      `/repos/${encodeURIComponent(id.owner)}/${encodeURIComponent(id.name)}/branches`,
      {
        method: "POST",
        body: JSON.stringify({
          new_branch_name: input.name,
          old_ref_name: input.sourceRef,
        }),
      },
    );
    return mapBranch(row);
  }

  async commits(id: RepositoryId, ref?: string): Promise<Commit[]> {
    const suffix = ref ? `?sha=${encodeURIComponent(ref)}&limit=50` : "?limit=50";
    const rows = await this.request<Array<Record<string, any>>>(`/repos/${encodeURIComponent(id.owner)}/${encodeURIComponent(id.name)}/commits${suffix}`);
    return rows.map((row) => ({
      sha: String(row.sha),
      message: String(row.commit?.message ?? ""),
      authoredAt: String(row.commit?.author?.date ?? ""),
      ...(row.commit?.author?.name ? { authorName: String(row.commit.author.name) } : {}),
      webUrl: String(row.html_url ?? ""),
    }));
  }

  async issues(id: RepositoryId): Promise<Issue[]> {
    const rows = await this.request<Array<Record<string, any>>>(`/repos/${encodeURIComponent(id.owner)}/${encodeURIComponent(id.name)}/issues?state=all&limit=50`);
    return rows.filter((row) => !row.pull_request).map((row) => ({
      number: Number(row.number),
      title: String(row.title),
      state: row.state === "closed" ? "closed" : "open",
      ...(row.user?.login ? { author: String(row.user.login) } : {}),
      ...(row.updated_at ? { updatedAt: String(row.updated_at) } : {}),
      webUrl: String(row.html_url ?? ""),
    }));
  }

  async pullRequests(id: RepositoryId): Promise<PullRequest[]> {
    const rows = await this.request<Array<Record<string, any>>>(`/repos/${encodeURIComponent(id.owner)}/${encodeURIComponent(id.name)}/pulls?state=all&limit=50`);
    return rows.map((row) => ({
      number: Number(row.number),
      title: String(row.title),
      state: row.merged ? "merged" : row.state === "closed" ? "closed" : "open",
      base: String(row.base?.ref ?? ""),
      head: String(row.head?.ref ?? ""),
      ...(row.user?.login ? { author: String(row.user.login) } : {}),
      ...(row.updated_at ? { updatedAt: String(row.updated_at) } : {}),
      webUrl: String(row.html_url ?? ""),
    }));
  }
}

function mapBranch(row: Record<string, any>): Branch {
  return {
    name: String(row.name),
    sha: String(row.commit?.id ?? row.commit?.sha ?? ""),
    protected: Boolean(row.protected),
  };
}

function mapRepository(row: Record<string, any>): Repository {
  return {
    id: String(row.id),
    owner: String(row.owner?.login ?? row.owner?.username ?? ""),
    name: String(row.name),
    ...(row.description ? { description: String(row.description) } : {}),
    defaultBranch: String(row.default_branch ?? "main"),
    private: Boolean(row.private),
    webUrl: String(row.html_url ?? ""),
    ...(row.clone_url ? { cloneUrl: String(row.clone_url) } : {}),
    ...(row.ssh_url ? { sshUrl: String(row.ssh_url) } : {}),
    ...(row.updated_at ? { updatedAt: String(row.updated_at) } : {}),
  };
}
