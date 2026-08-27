import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) throw new Error("GoreeCloud Code root element is missing");

app.innerHTML = `
  <main class="shell">
    <aside class="sidebar" aria-label="Primary navigation">
      <div class="brand">GoreeCloud <span>Code</span></div>
      <nav>
        <a class="active" href="#overview">Overview</a>
        <a href="#repositories">Repositories</a>
        <a href="#issues">Issues</a>
        <a href="#changes">Changes</a>
        <a href="#pipelines">Pipelines</a>
        <a href="#packages">Packages</a>
        <a href="#security">Security</a>
      </nav>
    </aside>
    <section class="content">
      <header class="topbar">
        <div>
          <p class="eyebrow">Developer platform</p>
          <h1>Welcome to GoreeCloud Code</h1>
        </div>
        <button type="button">New repository</button>
      </header>
      <section class="hero">
        <p class="eyebrow">Milestone 0</p>
        <h2>Your development platform, owned by GoreeCloud.</h2>
        <p>Forgejo provides the initial replaceable forge infrastructure while GoreeCloud Code owns the product boundary, contracts, governance, integrations, and developer experience.</p>
      </section>
      <section class="grid" aria-label="Platform status">
        <article><strong>Repositories</strong><span>Provider layer ready</span></article>
        <article><strong>Forge provider</strong><span>Forgejo adapter started</span></article>
        <article><strong>Pipelines</strong><span>Planned</span></article>
        <article><strong>Security</strong><span>Evidence integration planned</span></article>
      </section>
    </section>
  </main>
`;
