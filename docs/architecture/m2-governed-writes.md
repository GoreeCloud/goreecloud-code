# M2 Governed Write Operations

GoreeCloud Code owns authorization, replay-safety, reconciliation, and application evidence boundaries for product-level source-control writes. Forgejo remains replaceable infrastructure behind the provider adapter.

## Current development slice

The first M2 write is branch creation:

```text
client request
  -> bounded input and Idempotency-Key validation
  -> application-level write authorization
  -> durable local idempotency reservation
  -> local governed-write audit attempt record
  -> ForgeProvider.createBranch
  -> Forgejo provider adapter
  -> durable idempotency outcome
  -> audit outcome record
```

A separate protected read-only status route may inspect the durable local operation state after an operation ID has been returned.

Only branch creation is enabled. Issue mutation, pull-request creation/review, repository mutation, package publishing, pipeline writes, reconciliation mutation, and AI-assisted writes remain disabled until their own authorization and evidence boundaries are implemented.

## Authorization boundary

A branch write requires both a Forgejo provider token with the minimum provider permission necessary to create the branch and the GoreeCloud Code application write gate configured through `GOREECLOUD_CODE_WRITE_TOKEN_FILE`.

The application bearer secret and Forgejo provider token are separate credentials. Neither is returned to the browser. The current application token file is an interim development mechanism, not the final GoreeCloud Identity session/authorization design.

The governed-write operation-status route also requires the interim application bearer. It does not require or expose the Forgejo provider token because the status is read from GoreeCloud Code's application-owned journal rather than by issuing a provider mutation.

## Audit requirement

Branch mutation requires `GOREECLOUD_CODE_AUDIT_LOG_FILE`. If the audit sink is not configured, or if the pre-provider attempted event cannot be persisted, the provider is not called.

The local audit record is data-minimized: generated event/operation IDs, event time, action, phase, normalized repository/branch operation, and a bounded reason where relevant. It excludes authorization headers, application bearer tokens, Forgejo tokens, cookies, unrestricted request bodies, and client network identity. The JSONL file is opened with `0600` permissions.

This application-owned file is not Wardveil Audit production acceptance.

## Idempotency and reconciliation

Branch mutation also requires `GOREECLOUD_CODE_IDEMPOTENCY_FILE` and a client `Idempotency-Key` header. Accepted keys are bounded to 8–128 characters from the restricted `[A-Za-z0-9._:-]` set.

The raw client key is never persisted. GoreeCloud Code stores its SHA-256 digest plus a SHA-256 fingerprint of the normalized repository/branch operation, operation ID, state, and successful branch result where applicable. The journal is append-only JSONL, bounded in size, created through an application-owned path, and opened with `0600` permissions.

Current states are:

- `in_progress` — a durable pre-execution reservation exists;
- `succeeded` — the exact operation completed and its provider result is durable; and
- `uncertain` — the provider may have executed but final certainty was lost.

A completed matching key replays the stored result without calling the provider again. Reuse of the key for a different operation returns a conflict. `in_progress` and `uncertain` records block another mutation and require reconciliation instead of blind retry.

If the provider succeeds but the success record cannot be made durable, the API returns a reconciliation-required failure rather than silently treating the operation as safely repeatable. If the provider call itself fails after reservation, the operation is marked uncertain when possible and remains blocked from blind retry.

The journal uses process-local serialization to prevent same-process reservation races. This is not a distributed lock, globally durable replay service, Wardveil execution claim, or production reconciliation service.

## Read-only operation status

`GET /api/v1/governed-writes/:operationId` accepts canonical UUID operation IDs and reads the latest matching journal record under the same local serialization boundary used by journal mutations.

The response is intentionally data-minimized. It may include:

- operation ID;
- current state;
- latest observation time;
- whether reconciliation is required; and
- the stored branch result only when the operation is durably `succeeded`.

The response does not expose raw idempotency keys, key digests, operation fingerprints, authorization credentials, provider credentials, or the persisted provider-failure reason.

The route is observational only. It cannot move an operation between states, call the provider, retry a request, delete a branch, or resolve uncertainty. `in_progress` and `uncertain` remain blocked/reconciliation-required until a separately authorized authoritative reconciliation capability exists.

## Input controls

The branch route accepts only JSON, applies an 8 KiB request-body limit, validates both new branch and source refs against Git-incompatible/ref-dangerous forms, and exposes the `idempotency-key` header in the CORS allowlist. The status route accepts only canonical UUID operation identifiers in its path.

## Validation boundary

Deterministic tests cover provider request mapping, provider-token requirements, application authorization, audit fail-closed behavior, audit minimization/permissions, idempotency hashing/permissions, completed replay without a second provider call, conflicting-key rejection, unresolved/uncertain state, unavailable idempotency storage, protected operation-status lookup/minimization, malformed refs, and API routing.

Live Forgejo write validation remains separately required. M1 is not complete until the real-instance read/connectivity validation gate is recorded. M2 remains incomplete until target-environment Identity-backed authorization, authoritative Wardveil policy/audit/evidence, distributed idempotency/reconciliation, least-privilege acceptance, Privacy Shield acceptance, Everkeep continuity treatment, and deployment evidence exist.
