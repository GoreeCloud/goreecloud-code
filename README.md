# GoreeCloud Code

GoreeCloud Code is the first-party GoreeCloud developer and source-control platform for repositories, collaboration, CI/CD, packages, security, AI-assisted development, and GoreeCloud platform integrations.

Forgejo is the preferred initial, replaceable infrastructure foundation. It is not the permanent GoreeCloud product boundary. GoreeCloud Code owns the user experience, service contracts, governance model, integration architecture, and long-term developer platform.

## Project records

- [Specifications](SPECIFICATIONS.md)
- [Features](FEATURES.md)
- [Benefits](BENEFITS.md)
- [Competitive objectives](COMPETITIVE-OBJECTIVES.md)
- [User manual](USER-MANUAL.md)
- [Branding authority](BRANDING.md)

## Status

**Milestone 1 — Forgejo Connectivity remains in progress, with the first Milestone 2 governed write boundary under development.**

Milestone 0 established the product boundary, provider abstraction, Forgejo adapter, web application shell, shared contracts, CI foundation, and deployment scaffolding. M1 includes the runnable GoreeCloud-owned API service, repository dashboard, provider-neutral repository activity reads, deterministic provider/API tests, and an end-to-end Forgejo validation stack.

A recorded real-instance validation run is still required before M1 is complete. The first M2 slice adds provider-neutral branch creation behind explicit server-side authorization, mandatory application audit evidence, and durable development idempotency/reconciliation state. The validation tool can now opt in to one controlled live branch-create/replay check when an operator supplies an explicit target repository, validation branch, source ref, and application bearer. This does not mark M1 or M2 complete.

## Architecture

```text
GoreeCloud Code
├── apps/web                 developer experience; Glaze UI 2.0 migration required
├── packages/contracts       provider-neutral domain contracts
├── integrations/forgejo     replaceable Forgejo provider
├── services/api             GoreeCloud-owned product API and governed-write controls
├── deploy/forgejo           M1 Forgejo validation deployment
├── scripts                  read-path and opt-in governed-write validation tools
└── docs                     architecture, ADRs, security, migration
```

Runtime boundary:

```text
Glaze UI / GoreeCloud clients
            │
            ▼
     GoreeCloud Code API
            │
            ▼
       ForgeProvider
            │
            ├── ForgejoProvider      initial implementation
            ├── GitHubProvider       future migration/interoperability adapter
            └── NativeProvider       future GoreeCloud implementation
```

The browser must not receive Forgejo credentials or depend directly on Forgejo-specific APIs.

## API and local connectivity

Configure the API using `.env.example`. At minimum, reads require `FORGEJO_BASE_URL`. Private repository discovery requires a narrowly scoped `FORGEJO_TOKEN`; anonymous public discovery can use `FORGEJO_USERNAME` when supported by the instance.

Provider-neutral routes include:

- `GET /health`
- `GET /api/v1/provider`
- `GET /api/v1/repositories`
- `GET /api/v1/repositories/:owner/:name`
- repository branches, commits, issues, and pull-request read endpoints
- `POST /api/v1/repositories/:owner/:name/branches`

### Governed branch creation

Branch creation requires:

1. valid JSON containing `name` and `sourceRef`;
2. a valid bounded `Idempotency-Key` header;
3. a Forgejo provider token with the required provider permission;
4. application-level bearer authorization configured through `GOREECLOUD_CODE_WRITE_TOKEN_FILE`;
5. `GOREECLOUD_CODE_AUDIT_LOG_FILE`; and
6. `GOREECLOUD_CODE_IDEMPOTENCY_FILE`.

The audit sink records data-minimized attempted/outcome evidence. The idempotency journal hashes the raw client key before persistence and binds it to the normalized repository/branch operation. A completed matching request replays the stored result without a second provider call. A conflicting key or an in-progress/uncertain operation is blocked; provider uncertainty requires reconciliation rather than blind retry.

Both local JSONL stores use restrictive application-owned paths and mode-`0600` files. They are development foundations, not final GoreeCloud Identity authorization, Wardveil Audit, Mesh evidence delivery, distributed idempotency, or production recovery/reconciliation.

See `docs/architecture/m2-governed-writes.md`.

## Forgejo validation

For an isolated M1 test environment, use `deploy/forgejo/compose.yml` with `deploy/forgejo/.env.example`. This stack is development/test infrastructure, not production architecture.

```sh
FORGEJO_BASE_URL=http://localhost:3000 \
GOREECLOUD_CODE_API_URL=http://localhost:8787 \
VALIDATE_REPOSITORY=owner/repository \
pnpm validate:forgejo
```

With only the read-path variables, the validator exercises Forgejo version availability and provider-neutral repository reads through GoreeCloud Code.

### Opt-in M2 branch-write validation

Live write validation remains disabled unless an operator explicitly selects a disposable target branch and supplies the existing application write bearer:

```sh
FORGEJO_BASE_URL=http://localhost:3000 \
GOREECLOUD_CODE_API_URL=http://localhost:8787 \
VALIDATE_REPOSITORY=owner/repository \
VALIDATE_WRITE_BRANCH=validation/unique-branch \
VALIDATE_WRITE_SOURCE_REF=main \
GOREECLOUD_CODE_WRITE_TOKEN='<protected-runtime-value>' \
pnpm validate:forgejo
```

`VALIDATE_WRITE_IDEMPOTENCY_KEY` may be supplied explicitly; otherwise the validator creates a bounded random key for that run. The tool requires the first write to return a new operation, repeats the same request with the same key and requires an idempotent replay using the same operation ID, then confirms the created branch through the provider-neutral read route.

The validator intentionally does not implement or exercise branch deletion. The operator must choose a disposable, uniquely named validation branch and handle later cleanup through an already approved administrative path. The validator does not intentionally print the Forgejo token, application write bearer, or raw idempotency key.

The repository-level `pnpm check` command syntax-checks the validator so the opt-in live path cannot silently rot between target-environment runs.

See `docs/architecture/m1-forgejo-connectivity.md` and `USER-MANUAL.md`. M1 must not be marked complete until real-instance validation is recorded, and M2 write interoperability is not accepted until the opt-in write path is successfully executed against an approved target and its evidence is recorded.

## Platform integrations and acceptance

- **Glaze UI** — current mandatory consumer target is Glaze UI 2.0.0. Exact-revision GoreeCloud Code conformance is not yet accepted.
- **Wardveil Security** — authoritative repository/write policy, Audit/evidence, runner, dependency, artifact, and deployment security remain incomplete. The local Code audit file is not Wardveil Audit.
- **Privacy Shield** — remains authoritative for data use, consent, minimization, retention, and telemetry governance. Current local evidence deliberately excludes reusable credentials and unnecessary payloads, but runtime Privacy Shield acceptance is not established.
- **Everkeep** — application-specific backup, restore, preservation, portability, succession, and recovery assurance remain pending.
- **GoreeCloud Identity** — final actor/session/service authorization remains pending; the secret-file bearer is interim development infrastructure.
- **GoreeCloud Mesh** — cross-system capability/evidence coordination remains pending and cannot manufacture authority.
- **GoreeCloud AI** — governed AI-assisted software development remains planned and must use bounded Code operations rather than unrestricted provider credentials.

Public claims about these systems must remain tied to implemented capabilities and current evidence.

## Development principles

1. Standard Git remains the repository interoperability foundation.
2. Forgejo is replaceable infrastructure, not the permanent product boundary.
3. GoreeCloud-owned APIs and contracts must minimize provider-specific assumptions.
4. CI logic should remain portable between GitHub Actions, Forgejo Actions, and future GoreeCloud Pipelines.
5. Security-sensitive capabilities require least privilege, explicit authority, durable replay safety, evidence, and reconciliation.
6. Repository migration must preserve Git history and deliberately account for metadata outside Git itself.
7. Stable qualification requires current applicable Glaze UI, Wardveil Security, Privacy Shield, Everkeep, Identity, Mesh, runtime, and recovery evidence.

## Roadmap

### M0 — Bootstrap

Foundation established: monorepo, provider contracts, Forgejo adapter, web shell, API boundary, CI, and architecture decisions.

### M1 — Forgejo connectivity

In progress: real-instance authentication/validation, repository discovery/detail, branches, commits, issues, pull requests, provider health, live dashboard, and end-to-end validation tooling.

### M2 — Governed write operations

In progress: branch creation with ref validation, separate application/provider authorization, mandatory audit, durable development idempotency, safe replay, reconciliation-required uncertainty, and opt-in live write/replay validation tooling. Identity-backed authorization, Wardveil policy/Audit, Privacy Shield acceptance, Everkeep continuity, distributed idempotency/reconciliation, least privilege, and live target validation evidence remain incomplete. Issue/pull-request/review and AI-assisted mutations remain disabled.

### M3 — Pipelines, packages, and migration

Planned: portable workflow execution, GoreeCloud-controlled runners, package/OCI registry integration, GitHub import tooling, and external repository mirroring.
