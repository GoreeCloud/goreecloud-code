# Forgejo M1 validation deployment

This directory provides a development/test Forgejo deployment for validating GoreeCloud Code Milestone 1. It is infrastructure behind GoreeCloud Code, not the permanent product boundary and not a production deployment specification.

## Start the test forge

1. Copy `.env.example` to `.env`.
2. Replace `POSTGRES_PASSWORD` with a strong local secret.
3. For repeatable validation, pin `FORGEJO_IMAGE` to the exact Forgejo release being tested rather than leaving it on `latest`.
4. Start the stack:

```sh
docker compose --env-file .env up -d
```

Forgejo is exposed at `http://localhost:3000` by default and Git-over-SSH at port `2222`.

Complete Forgejo's initial setup, create a dedicated M1 validation account, and create or import at least one test repository. Prefer a narrowly scoped access token for GoreeCloud Code rather than an administrator token.

## Connect GoreeCloud Code

Configure the GoreeCloud Code API environment:

```text
FORGEJO_BASE_URL=http://localhost:3000
FORGEJO_TOKEN=<narrowly-scoped-test-token>
FORGEJO_TIMEOUT_MS=10000
CORS_ORIGIN=http://localhost:5173
```

Run the API and web app using the workspace development commands. The browser must only communicate with the GoreeCloud Code API; do not place the Forgejo token in Vite/browser configuration.

## Validate the read path

From the repository root:

```sh
FORGEJO_BASE_URL=http://localhost:3000 \
GOREECLOUD_CODE_API_URL=http://localhost:8787 \
VALIDATE_REPOSITORY=owner/repository \
pnpm validate:forgejo
```

`VALIDATE_REPOSITORY` is optional. Without it, validation confirms the Forgejo version endpoint, provider health, and repository discovery. With it, validation additionally checks repository detail, branches, commits, issues, and pull requests through the GoreeCloud Code API.

## Security boundaries

This stack is intentionally limited to M1 read validation. Do not treat it as evidence that production hardening, backups, TLS, SSO, runner isolation, package security, Wardveil Security integration, Privacy Shield controls, or Everkeep recovery requirements are complete. Those capabilities require their own implementation and validation evidence.
