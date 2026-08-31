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

Separate protected read-only routes may inspect durable local operation state and, for unresolved version-2 branch writes, perform a bounded provider-neutral reconciliation observation.

Only branch creation is enabled. Issue mutation, pull-request creation/review, repository mutation, package publishing, pipeline writes, reconciliation mutation, and AI-assisted writes remain disabled until their own authorization and evidence boundaries are implemented.

## Authorization boundary

A branch write requires both a Forgejo provider token with the minimum provider permission necessary to create the branch and the GoreeCloud Code application write gate configured through `GOREECLOUD_CODE_WRITE_TOKEN_FILE`.

The application bearer secret and Forgejo provider token are separate credentials. Neither is returned to the browser. The current application token file is an interim development mechanism, not the final GoreeCloud Identity session/claims plus Code-owned authorization design.

The governed-write status and reconciliation-assessment routes also require the interim application bearer. Reconciliation assessment may use provider read authority, but it never invokes provider mutation authority.

## Audit requirement

Branch mutation requires `GOREECLOUD_CODE_AUDIT_LOG_FILE`. If the audit sink is not configured, or if the pre-provider attempted event cannot be persisted, the provider is not called.

The local audit record is data-minimized: generated event/operation IDs, event time, action, phase, normalized repository/branch operation, and a bounded reason where relevant. It excludes authorization headers, application bearer tokens, Forgejo tokens, cookies, unrestricted request bodies, and client network identity. The JSONL file is opened with `0600` permissions.

This application-owned file is not Wardveil Audit production acceptance.

## Idempotency journal versions

Branch mutation also requires `GOREECLOUD_CODE_IDEMPOTENCY_FILE` and a client `Idempotency-Key` header. Accepted keys are bounded to 8–128 characters from the restricted `[A-Za-z0-9._:-]` set.

The raw client key is never persisted. GoreeCloud Code stores its SHA-256 digest plus a SHA-256 fingerprint of the normalized repository/branch operation, operation ID, state, and successful branch result where applicable. The journal is append-only JSONL, bounded in size, created through an application-owned path, and opened with `0600` permissions.

New records use **version 2** and additionally persist a bounded operation descriptor:

```text
repository.branch.create
repository owner + name
branch name + sourceRef
```

This descriptor contains the minimum provider-neutral context required to perform a later branch-list observation. Existing **version 1** records remain valid/readable. GoreeCloud Code does not reconstruct missing operation context from hashes or assumptions; a legacy unresolved row therefore remains manual-review-only.

Current local states are:

- `in_progress` — a durable pre-execution reservation exists;
- `succeeded` — the exact operation completed and its provider result is durable; and
- `uncertain` — the provider may have executed but final certainty was lost.

A completed matching key replays the stored result without calling the provider again. Reuse of the key for a different operation returns a conflict. `in_progress` and `uncertain` records block another mutation and require reconciliation instead of blind retry.

If the provider succeeds but the success record cannot be made durable, the API returns a reconciliation-required failure rather than silently treating the operation as safely repeatable. If the provider call itself fails after reservation, the operation is marked uncertain when possible and remains blocked from blind retry.

The journal uses process-local serialization to prevent same-process reservation races. This is not a distributed lock, globally durable replay service, Wardveil execution claim, or production reconciliation service.

## Read-only operation status

`GET /api/v1/governed-writes/:operationId` accepts canonical UUID operation IDs and reads the latest matching journal record under the same local serialization boundary used by journal mutations.

The response is intentionally data-minimized. It may include operation ID, current state, latest observation time, whether reconciliation is required, version-2 operation context when available, and the stored branch result only when the operation is durably `succeeded`.

The response does not expose raw idempotency keys, key digests, operation fingerprints, authorization credentials, provider credentials, or the persisted provider-failure reason.

## Read-only reconciliation assessment

`GET /api/v1/governed-writes/:operationId/reconciliation` performs no journal or provider mutation.

For a durably succeeded operation it reports `not_required` without a provider call. For an unresolved version-1 row it reports `legacy_operation_context_unavailable` without guessing or querying an arbitrary repository.

For unresolved version-2 branch writes, the assessor calls only `ForgeProvider.branches()` for the recorded repository and compares the recorded target branch name. It may report:

- `provider_branch_present`;
- `provider_branch_absent`; or
- `provider_observation_unavailable`.

These are observations, not terminal decisions. Every assessment keeps:

- `mutationAllowed: false`;
- `automaticResolutionAllowed: false`.

A visible branch may indicate that the provider-side effect occurred, but it does not prove all intended semantics or justify rewriting local durable evidence automatically. An absent branch does not prove the earlier provider request had no effect or authorize a blind retry. Provider observation failures are sanitized and remain manual-review-required.

An authoritative reconciliation mutation is deliberately outside this slice. It requires separate application authorization, Wardveil policy/Audit evidence, durable reconciliation evidence, race/concurrency controls, distributed state semantics, rollback/repair rules, and target-environment acceptance.

## Input controls

The branch route accepts only JSON, applies an 8 KiB request-body limit, validates both new branch and source refs against Git-incompatible/ref-dangerous forms, and exposes the `idempotency-key` header in the CORS allowlist. The observation routes accept only canonical UUID operation identifiers in their paths.

## Validation boundary

Deterministic tests cover provider request mapping, provider-token requirements, application authorization, audit fail-closed behavior, audit minimization/permissions, idempotency hashing/permissions, v1/v2 journal compatibility, completed replay without a second provider call, conflicting-key rejection, unresolved/uncertain state, unavailable idempotency storage, protected operation-status lookup/minimization, reconciliation branch-present/branch-absent/provider-unavailable/legacy behavior, proof that reconciliation assessment does not retry provider mutation, malformed refs, and API routing.

Live Forgejo write validation remains separately required. M1 is not complete until the real-instance read/connectivity validation gate is recorded. M2 remains incomplete until target-environment Identity-backed identity/session integration plus Code-owned authorization, authoritative Wardveil policy/audit/evidence, distributed idempotency/reconciliation, least-privilege acceptance, Privacy Shield acceptance, Everkeep continuity treatment, current Glaze UI 2.1.0 application migration/acceptance, and deployment/recovery evidence exist.
