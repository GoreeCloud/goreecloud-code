import type {
  Branch,
  Commit,
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
}

export class ForgejoProvider implements ForgeProvider {
  private readonly baseUrl: string;
  private readonly token?: string;

  constructor(options: ForgejoProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}/api/v1${path}`, {
      headers: this.token ? { Authorization: `token ${this.token}` } : undefined,
    });

    if (!response.ok) {
      throw new Error(`Forgejo request failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async health(): Promise<ProviderHealth> {
    const version = await this.request<{ version: string }>("/version");
    return {
      provider: "forgejo",
      ok: true,
      version: version.version,
      capabilities: [
        "repositories:read",
        "issues:read",
        "pullRequests:read",
      ],
    };
  }

  async repositories(): Promise<Repository[]> {
    const repos = await this.request<Array<Record<string, unknown>>>("/user/repos?limit=50");
    return repos.map(mapRepository);
  }

  async repository(id: RepositoryId): Promise<Repository> {
    return mapRepository(await this.request<Record<string, unknown>>(`/repos/${id.owner}/${id.name}`));
  }

  async branches(id: RepositoryId): Promise<Branch[]> {
    const rows = await this.request<Array<Record<string, any>>>(`/repos/${id.owner}/${id.name}/branches`);
    return rows.map((row) => ({
      name: String(row.name),
      sha: String(row.commit?.id ?? ""),
      protected: Boolean(row.protected),
    }));
  }

  async commits(id: RepositoryId, ref?: string): Promise<Commit[]> {
    const suffix = ref ? `?sha=${encodeURIComponent(ref)}` : "";
    const rows = await this.request<Array<Record<string, any>>>(`/repos/${id.owner}/${id.name}/commits${suffix}`);
    return rows.map((row) => ({
      sha: String(row.sha),
      message: String(row.commit?.message ?? ""),
      authoredAt: String(row.commit?.author?.date ?? ""),
      webUrl: String(row.html_url ?? ""),
    }));
  }

  async issues(id: RepositoryId): Promise<Issue[]> {
    const rows = await this.request<Array<Record<string, any>>>(`/repos/${id.owner}/${id.name}/issues?state=all`);
    return rows.filter((row) => !row.pull_request).map((row) => ({
      number: Number(row.number),
      title: String(row.title),
      state: row.state === "closed" ? "closed" : "open",
      webUrl: String(row.html_url ?? ""),
    }));
  }

  async pullRequests(id: RepositoryId): Promise<PullRequest[]> {
    const rows = await this.request<Array<Record<string, any>>>(`/repos/${id.owner}/${id.name}/pulls?state=all`);
    return rows.map((row) => ({
      number: Number(row.number),
      title: String(row.title),
      state: row.merged ? "merged" : row.state === "closed" ? "closed" : "open",
      base: String(row.base?.ref ?? ""),
      head: String(row.head?.ref ?? ""),
      webUrl: String(row.html_url ?? ""),
    }));
  }
}

function mapRepository(row: Record<string, any>): Repository {
  return {
    id: String(row.id),
    owner: String(row.owner?.login ?? row.owner?.username ?? ""),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    defaultBranch: String(row.default_branch ?? "main"),
    private: Boolean(row.private),
    webUrl: String(row.html_url ?? ""),
  };
}
