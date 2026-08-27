import "./style.css";
import { goreeCloudCodeApi, type ProviderHealth, type Repository } from "./api";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("GoreeCloud Code root element is missing");

let repositories: Repository[] = [];
let provider: ProviderHealth | null = null;
let selectedRepository: Repository | null = null;
let loading = true;
let errorMessage = "";

render();
void loadDashboard();

async function loadDashboard() {
  loading = true;
  errorMessage = "";
  render();

  try {
    const [providerResult, repositoryResult] = await Promise.all([
      goreeCloudCodeApi.provider(),
      goreeCloudCodeApi.repositories(),
    ]);
    provider = providerResult;
    repositories = repositoryResult;
    selectedRepository = repositories[0] ?? null;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unable to reach GoreeCloud Code API";
  } finally {
    loading = false;
    render();
  }
}

function render() {
  app.innerHTML = `
    <main class="shell">
      <aside class="sidebar" aria-label="Primary navigation">
        <div class="brand"><span class="brand-mark" aria-hidden="true">G</span><div>GoreeCloud <strong>Code</strong></div></div>
        <nav>
          <a class="active" href="#overview">Overview</a>
          <a href="#repositories">Repositories <span class="nav-count">${repositories.length}</span></a>
          <a href="#issues">Issues</a>
          <a href="#changes">Changes</a>
          <a href="#pipelines">Pipelines</a>
          <a href="#packages">Packages</a>
          <a href="#security">Security</a>
        </nav>
        <div class="sidebar-footer">
          <div class="provider-dot ${provider?.ok ? "online" : ""}"></div>
          <div><strong>${provider?.ok ? "Provider connected" : "Provider offline"}</strong><span>${provider?.provider ?? "Forgejo"}${provider?.version ? ` ${escapeHtml(provider.version)}` : ""}</span></div>
        </div>
      </aside>

      <section class="content">
        <header class="topbar">
          <div>
            <p class="eyebrow">Developer platform · M1</p>
            <h1>Code</h1>
          </div>
          <div class="topbar-actions">
            <button class="secondary" id="refresh-button" type="button">Refresh</button>
            <button type="button" disabled title="Repository creation arrives with governed write operations">New repository</button>
          </div>
        </header>

        ${renderState()}
      </section>
    </main>
  `;

  document.querySelector<HTMLButtonElement>("#refresh-button")?.addEventListener("click", () => void loadDashboard());
  document.querySelectorAll<HTMLButtonElement>("[data-repository]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.repository);
      selectedRepository = repositories[index] ?? null;
      render();
    });
  });
}

function renderState(): string {
  if (loading) {
    return `
      <section class="state-card" aria-live="polite">
        <div class="spinner" aria-hidden="true"></div>
        <h2>Connecting to GoreeCloud Code</h2>
        <p>Checking the provider and loading repositories through the GoreeCloud-owned API boundary.</p>
      </section>`;
  }

  if (errorMessage) {
    return `
      <section class="state-card error-state" aria-live="polite">
        <div class="state-icon">!</div>
        <p class="eyebrow">Provider unavailable</p>
        <h2>GoreeCloud Code is disconnected.</h2>
        <p>${escapeHtml(errorMessage)}</p>
        <button id="retry-button" type="button">Try again</button>
      </section>`;
  }

  return `
    <section class="hero compact">
      <div>
        <p class="eyebrow">Connected workspace</p>
        <h2>Your repositories, without the platform lock-in.</h2>
        <p>GoreeCloud Code is reading live forge data through its own provider-neutral API. Forgejo stays behind the infrastructure boundary.</p>
      </div>
      <div class="provider-badge"><span></span>${escapeHtml(provider?.provider ?? "Forgejo")} ${provider?.version ? escapeHtml(provider.version) : "connected"}</div>
    </section>

    <section class="metrics" aria-label="Workspace summary">
      <article><span>Repositories</span><strong>${repositories.length}</strong><small>Visible to this provider identity</small></article>
      <article><span>Capabilities</span><strong>${provider?.capabilities.length ?? 0}</strong><small>Exposed through provider contract</small></article>
      <article><span>Provider</span><strong>${escapeHtml(provider?.provider ?? "—")}</strong><small>Replaceable infrastructure</small></article>
      <article><span>API state</span><strong>${provider?.ok ? "Healthy" : "Degraded"}</strong><small>Server-side credentials only</small></article>
    </section>

    <section class="workspace" id="repositories">
      <div class="panel repository-panel">
        <div class="panel-heading"><div><p class="eyebrow">Repository library</p><h3>Repositories</h3></div><span>${repositories.length}</span></div>
        ${repositories.length ? `<div class="repository-list">${repositories.map(renderRepository).join("")}</div>` : renderEmptyRepositories()}
      </div>
      <div class="panel detail-panel">
        ${renderRepositoryPreview()}
      </div>
    </section>`;
}

function renderRepository(repository: Repository, index: number): string {
  const active = selectedRepository?.id === repository.id;
  return `
    <button class="repository-row ${active ? "selected" : ""}" type="button" data-repository="${index}">
      <span class="repo-icon" aria-hidden="true">${repository.private ? "●" : "○"}</span>
      <span class="repo-copy"><strong>${escapeHtml(repository.owner)}/${escapeHtml(repository.name)}</strong><small>${escapeHtml(repository.description ?? "No description")}</small></span>
      <span class="branch-pill">${escapeHtml(repository.defaultBranch)}</span>
    </button>`;
}

function renderRepositoryPreview(): string {
  if (!selectedRepository) {
    return `<div class="empty-detail"><p class="eyebrow">Repository details</p><h3>Select a repository</h3><p>Repository activity, branches, issues, changes, and security evidence will appear here.</p></div>`;
  }

  return `
    <div class="detail-heading">
      <div><p class="eyebrow">Repository</p><h3>${escapeHtml(selectedRepository.name)}</h3><p>${escapeHtml(selectedRepository.description ?? "No repository description")}</p></div>
      <span class="visibility">${selectedRepository.private ? "Private" : "Public"}</span>
    </div>
    <div class="detail-grid">
      <div><span>Owner</span><strong>${escapeHtml(selectedRepository.owner)}</strong></div>
      <div><span>Default branch</span><strong>${escapeHtml(selectedRepository.defaultBranch)}</strong></div>
      <div><span>Provider ID</span><strong>${escapeHtml(selectedRepository.id)}</strong></div>
      <div><span>Access</span><strong>Read connected</strong></div>
    </div>
    <div class="detail-actions">
      <a class="button-link" href="${escapeAttribute(selectedRepository.webUrl)}" target="_blank" rel="noreferrer">Open provider repository</a>
      <button class="secondary" type="button" disabled>Activity view next</button>
    </div>
    <div class="boundary-note"><strong>GoreeCloud boundary</strong><p>This UI consumes GoreeCloud Code contracts, not Forgejo-specific browser APIs or credentials.</p></div>`;
}

function renderEmptyRepositories(): string {
  return `<div class="empty-list"><strong>No repositories returned</strong><p>The provider is healthy, but no repositories are visible to the configured identity.</p></div>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

queueMicrotask(() => {
  document.querySelector<HTMLButtonElement>("#retry-button")?.addEventListener("click", () => void loadDashboard());
});
