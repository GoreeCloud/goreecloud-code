# M2 Governed Write Operations

GoreeCloud Code owns authorization and evidence boundaries for product-level source-control writes. Forgejo remains replaceable infrastructure behind the provider adapter.

## Current development slice

The first M2 write is branch creation:

```text
client request
  -> GoreeCloud Code input validation
  -> local governed-write audit attempt record
  -> application-level write authorization
  -> ForgeProvider.createBranch
  -> Forgejo provider adapter
  -> outcome audit record
```

Only branch creation is enabled. Issue mutation, pull-request creation/review, repository mutation, package publishing, pipeline writes, and AI-assisted writes remain disabled until their own authorization and evidence boundaries are implemented.

## Dual authorization boundary

A branch write requires both:

1. a Forgejo provider token with the minimum provider permission necessary to create the branch; and
2. the GoreeCloud Code application write gate configured through `GOREECLOUD_CODE_WRITE_TOKEN_FILE` for the current development environment.

The application bearer secret and Forgejo provider token are separate credentials. Neither is returned to the browser by the API. The current application token file is an interim development mechanism, not the final GoreeCloud Identity session/authorization design.

## Audit requirement

Branch mutation also requires `GOREECLOUD_CODE_AUDIT_LOG_FILE`. If the audit sink is not configured, or if the initial audit-attempt record cannot be written, the API fails closed before calling the provider.

The local audit record is deliberately data-minimized. It contains:

- generated event and operation IDs;
- event time;
- action (`repository.branch.create`);
- attempted/succeeded/failed/denied phase;
- repository owner/name;
- requested branch name and source ref; and
- a bounded failure/denial reason where relevant.

It does not record authorization headers, application bearer tokens, Forgejo tokens, cookies, request bodies beyond the normalized branch operation, or client network identity.

The JSONL file is opened with `0600` permissions. The configured path should be application-owned and excluded from source control.

## Outcome behavior

The pre-mutation `attempted` audit record is mandatory. If it cannot be recorded, no provider mutation occurs.

Outcome records are written after authorization/provider completion. The success response exposes an operation ID and whether the post-operation outcome record was successfully persisted. A missing outcome record does not erase the already-recorded pre-mutation evidence and does not cause the API to retry or duplicate a provider mutation.

This local JSONL mechanism is a development evidence foundation only. It is not a claim that Wardveil Audit, GoreeCloud Mesh evidence delivery, durable centralized audit retention, actor identity, tamper-evident storage, distributed idempotency, or production incident reconstruction is complete.

## Input controls

The branch route accepts only JSON, applies a small bounded request body, and validates both the new branch and source ref against Git-incompatible/ref-dangerous forms before invoking the provider.

## Validation boundary

Deterministic tests cover provider request mapping, provider-token requirements, application authorization, audit fail-closed behavior, data minimization, audit-file permissions, malformed refs, and API routing.

Live Forgejo write validation remains separately required. M1 is not complete until the real-instance read/connectivity validation gate is recorded, and M2 is not complete until target-environment authorization, audit, least-privilege, Wardveil, identity, and recovery evidence exists.
