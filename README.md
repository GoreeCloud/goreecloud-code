# GoreeCloud Code

GoreeCloud Code is the first-party GoreeCloud developer and source-control platform for repositories, collaboration, CI/CD, packages, security, AI-assisted development, and GoreeCloud platform integrations.

Forgejo is the preferred initial, replaceable infrastructure foundation. It is not the permanent GoreeCloud product boundary. GoreeCloud Code owns the user experience, service contracts, governance model, integration architecture, and long-term developer platform.

## Status

**Milestone 0 — Bootstrap**

The current work establishes the product boundary, provider abstraction, Forgejo adapter, web application shell, shared contracts, CI foundation, and deployment scaffolding.

## Architecture

```text
GoreeCloud Code
├── apps/web                 Glaze UI developer experience
├── packages/contracts       Provider-neutral domain contracts
├── integrations/forgejo     Forgejo provider implementation
├── services/api             GoreeCloud-owned API boundary
├── deploy/forgejo           Initial Forgejo deployment support
└── docs                     Architecture, ADRs, security, migration
```

The provider boundary is intentionally replaceable:

```text
GoreeCloud Code
      │
      ▼
 ForgeProvider
      │
      ├── ForgejoProvider      initial implementation
      ├── GitHubProvider       migration/interoperability
      └── NativeProvider       future GoreeCloud implementation
```

## Platform integrations

GoreeCloud Code is designed to integrate with substantive GoreeCloud platform systems as implementations become available:

- **Glaze UI** — developer experience and interaction system.
- **GoreeCloud AI** — governed AI-assisted software development.
- **Wardveil Security** — evidence-backed repository, runner, dependency, artifact, and deployment security state.
- **Privacy Shield** — privacy-control contracts, data minimization, retention, and telemetry governance.
- **Everkeep** — backup, recovery, preservation, portability, and succession.
- **GoreeCloud Mesh** — coordination and governance between first-party applications and services.

Public claims about these systems must remain tied to implemented capabilities and available evidence.

## Development principles

1. Standard Git remains the repository interoperability foundation.
2. Forgejo is replaceable infrastructure, not the permanent product boundary.
3. GoreeCloud-owned APIs and contracts must not expose unnecessary Forgejo-specific assumptions.
4. CI logic should remain portable between GitHub Actions, Forgejo Actions, and future GoreeCloud Pipelines.
5. Security-sensitive capabilities require least privilege, explicit authorization, and evidence-backed controls.
6. Repository migration must preserve Git history and deliberately account for metadata outside Git itself.

## Initial roadmap

### M0 — Bootstrap

- Monorepo foundation
- Provider-neutral contracts
- Forgejo adapter skeleton
- Web application shell
- API boundary
- CI and validation
- Architecture decisions

### M1 — Forgejo connectivity

- Authenticate to a test Forgejo deployment
- Repository discovery and detail views
- Branch and commit reads
- Issue and pull-request reads
- Provider health and capability reporting

### M2 — Governed write operations

- Branch creation
- Issue creation and updates
- Pull-request creation
- Review workflows
- Bounded GoreeCloud AI operations

### M3 — Pipelines, packages, and migration

- Portable workflow execution
- GoreeCloud-controlled runners
- Package and OCI registry integration
- GitHub migration/import tooling
- External repository mirroring
