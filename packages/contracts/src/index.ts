export type ForgeCapability =
  | "repositories:read"
  | "repositories:write"
  | "issues:read"
  | "issues:write"
  | "pullRequests:read"
  | "pullRequests:write"
  | "pipelines:read"
  | "pipelines:write"
  | "packages:read"
  | "packages:write";

export interface RepositoryId {
  owner: string;
  name: string;
}

export interface Repository extends RepositoryId {
  id: string;
  description?: string;
  defaultBranch: string;
  private: boolean;
  webUrl: string;
  cloneUrl?: string;
  sshUrl?: string;
  updatedAt?: string;
}

export interface Branch {
  name: string;
  sha: string;
  protected: boolean;
}

export interface CreateBranchInput {
  name: string;
  sourceRef: string;
}

export interface Commit {
  sha: string;
  message: string;
  authoredAt: string;
  authorName?: string;
  webUrl: string;
}

export interface Issue {
  number: number;
  title: string;
  state: "open" | "closed";
  author?: string;
  updatedAt?: string;
  webUrl: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  base: string;
  head: string;
  author?: string;
  updatedAt?: string;
  webUrl: string;
}

export interface ProviderHealth {
  provider: string;
  ok: boolean;
  version?: string;
  baseUrl?: string;
  latencyMs?: number;
  error?: string;
  capabilities: ForgeCapability[];
}

export interface ForgeProvider {
  health(): Promise<ProviderHealth>;
  repositories(): Promise<Repository[]>;
  repository(id: RepositoryId): Promise<Repository>;
  branches(id: RepositoryId): Promise<Branch[]>;
  createBranch(id: RepositoryId, input: CreateBranchInput): Promise<Branch>;
  commits(id: RepositoryId, ref?: string): Promise<Commit[]>;
  issues(id: RepositoryId): Promise<Issue[]>;
  pullRequests(id: RepositoryId): Promise<PullRequest[]>;
}
