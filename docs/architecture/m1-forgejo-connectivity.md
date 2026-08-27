# M1 — Forgejo Connectivity

## Objective

Connect GoreeCloud Code to a real Forgejo deployment without making Forgejo the GoreeCloud product boundary.

## Runtime path

```text
Glaze UI client
      │
      ▼
GoreeCloud Code API
      │
      ▼
ForgeProvider contract
      │
      ▼
ForgejoProvider
      │
      ▼
Forgejo REST API / Git
```

The web client consumes GoreeCloud Code APIs rather than calling Forgejo directly. Forgejo credentials remain server-side.

## Initial API surface

- `GET /health`
- `GET /api/v1/provider`
- `GET /api/v1/repositories`
- `GET /api/v1/repositories/:owner/:name`
- `GET /api/v1/repositories/:owner/:name/branches`
- `GET /api/v1/repositories/:owner/:name/commits?ref=<ref>`
- `GET /api/v1/repositories/:owner/:name/issues`
- `GET /api/v1/repositories/:owner/:name/pull-requests`

These endpoints are provider-neutral GoreeCloud Code contracts. A future native repository service or alternate forge implementation should be able to serve the same product API.

## Configuration

Copy `.env.example` into the GoreeCloud Code API deployment environment and provide `FORGEJO_BASE_URL`. Private repository discovery requires a narrowly scoped `FORGEJO_TOKEN`. Public user repository discovery can use `FORGEJO_USERNAME` without a token when the Forgejo instance permits anonymous access.

Tokens must never be exposed to the browser or committed to Git. Provider timeouts are bounded by `FORGEJO_TIMEOUT_MS`.

## M1 validation infrastructure

`deploy/forgejo/compose.yml` provides a local/test Forgejo + PostgreSQL stack specifically for M1 validation. It is not a production topology and does not change the architectural status of Forgejo as replaceable infrastructure.

The deployment deliberately keeps PostgreSQL on an internal Docker network while exposing Forgejo HTTP and SSH for local validation. The image may use `latest` for first bootstrap, but any repeatable validation record must pin the exact Forgejo release tested.

The repository also provides:

```sh
pnpm validate:forgejo
```

The validator checks both sides of the boundary:

1. Forgejo responds through its version API;
2. GoreeCloud Code reports a healthy `forgejo` provider;
3. repository discovery succeeds through the GoreeCloud Code API;
4. when `VALIDATE_REPOSITORY=owner/name` is supplied, repository detail, branches, commits, issues, and pull requests are exercised through the GoreeCloud Code API.

This is intentionally an end-to-end read-path test. The validator does not send the Forgejo token to the web client.

## Validation gate

M1 is complete only after a real test Forgejo instance demonstrates:

1. provider/version health;
2. repository discovery;
3. repository detail retrieval;
4. branch and commit retrieval;
5. issue retrieval;
6. pull-request retrieval;
7. expected handling of invalid authentication;
8. expected handling of provider unavailability;
9. browser operation without direct Forgejo credentials or Forgejo-specific API calls.

A validation script existing in the repository is not itself evidence that this gate has passed. Completion requires an actual test run and recorded results.

## Out of scope

Write operations remain outside M1 and require separate authorization, least-privilege, threat-model, audit, and evidence work. The M1 deployment also does not claim production readiness for TLS, backups, SSO, runner isolation, packages, Wardveil Security, Privacy Shield, Everkeep, or GoreeCloud Mesh integration.
