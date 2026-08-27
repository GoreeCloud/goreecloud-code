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

The web client should consume GoreeCloud Code APIs rather than calling Forgejo directly. Forgejo credentials remain server-side.

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

Copy `.env.example` into the deployment environment and provide `FORGEJO_BASE_URL`. Private repository discovery requires a narrowly scoped `FORGEJO_TOKEN`. Public user repository discovery can use `FORGEJO_USERNAME` without a token when the Forgejo instance permits anonymous access.

Tokens must never be exposed to the browser or committed to Git. Provider timeouts are bounded by `FORGEJO_TIMEOUT_MS`.

## Validation gate

M1 is complete only after a real test Forgejo instance demonstrates:

1. provider/version health;
2. repository discovery;
3. repository detail retrieval;
4. branch and commit retrieval;
5. issue retrieval;
6. pull-request retrieval;
7. expected handling of authentication failure and provider unavailability.

Write operations remain outside M1 and require separate authorization and threat-model work.
