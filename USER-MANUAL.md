# GoreeCloud Code User Manual

## Status

GoreeCloud Code is under active development. The current Draft Milestone 2 branch provides a first-party repository dashboard, provider-neutral repository reads, one governed branch-creation write, protected read-only operation status, and protected read-only reconciliation assessment. It is not Stable or production-ready.

Forgejo is the preferred initial forge infrastructure behind GoreeCloud Code. Browser clients use GoreeCloud Code APIs and do not receive Forgejo credentials.

## Current Capabilities

The current development build supports:

- provider health and repository discovery;
- repository details;
- branch, commit, issue, and pull-request reads;
- the responsive GoreeCloud Code repository dashboard;
- one governed branch-creation operation;
- development audit and idempotency evidence for branch creation;
- read-only governed-write status inspection using returned operation IDs;
- read-only reconciliation assessment for unresolved version-2 branch writes;
- local/test Forgejo connectivity validation;
- opt-in live branch-write validation for an explicitly selected test repository and validation branch.

Issue mutation, pull-request creation/review, repository administration, package publishing, pipeline writes, branch deletion, authoritative reconciliation mutation, and GoreeCloud AI-assisted repository mutations remain disabled.

## Running the Development Workspace

The repository uses Node.js 22 or newer and pnpm.

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

Start the API and web development processes using the package scripts documented in `README.md` and the package manifests. Runtime configuration belongs in protected environment files or deployment configuration; do not commit active credentials.

## Repository Reads

The GoreeCloud Code API exposes provider-neutral read routes under `/api/v1`. The web client consumes these routes instead of calling Forgejo directly.

Representative reads include:

- `GET /api/v1/provider`
- `GET /api/v1/repositories`
- `GET /api/v1/repositories/:owner/:name`
- `GET /api/v1/repositories/:owner/:name/branches`
- `GET /api/v1/repositories/:owner/:name/commits`
- `GET /api/v1/repositories/:owner/:name/issues`
- `GET /api/v1/repositories/:owner/:name/pull-requests`

## Governed Branch Creation

The first bounded write is:

`POST /api/v1/repositories/:owner/:name/branches`

A branch-create request is allowed only when all currently implemented development controls are configured:

- the Forgejo provider has repository-write permission;
- `GOREECLOUD_CODE_WRITE_TOKEN_FILE` provides the separate GoreeCloud Code application write gate;
- `GOREECLOUD_CODE_AUDIT_LOG_FILE` provides the development audit sink;
- `GOREECLOUD_CODE_IDEMPOTENCY_FILE` provides the development idempotency journal;
- the request includes a bounded `Idempotency-Key` header;
- the JSON body contains valid `name` and `sourceRef` values.

The application bearer and Forgejo provider token are separate authorities. The raw client idempotency key is SHA-256 hashed before local persistence.

New journal entries use version 2 and store a data-minimized branch-write descriptor containing the action, repository owner/name, branch name, and source ref. This supports safe later observation without storing the raw idempotency key. Historical version-1 entries remain readable; missing operation context is not guessed.

If the provider may have executed but outcome certainty is lost, GoreeCloud Code returns reconciliation-required state and does not blindly retry the mutation.

The local audit and idempotency files are development controls only. They are not substitutes for GoreeCloud Identity integration/application authorization, Wardveil Policy/Audit acceptance, GoreeCloud Mesh evidence delivery, Privacy Shield acceptance, Everkeep recovery acceptance, distributed reconciliation, or production evidence.

## Inspecting Governed-Write Status

A successful or unresolved governed write returns an operation ID. The current development API can inspect that ID with:

`GET /api/v1/governed-writes/:operationId`

The operation ID must be the canonical UUID returned by GoreeCloud Code. The request requires the same interim application bearer gate used for governed branch creation.

The response can report:

- `in_progress` — the local journal has a reservation but no terminal durable result;
- `succeeded` — a durable result is present and may include the stored branch result;
- `uncertain` — the provider may have executed but GoreeCloud Code does not have safe terminal certainty.

For version-2 rows, the response can also include the data-minimized operation descriptor. The endpoint intentionally does not return the raw idempotency key, key hash/fingerprint, provider token, application bearer, authorization headers, or stored provider-error reason.

## Inspecting Reconciliation State

For a governed-write operation ID, the development API also exposes:

`GET /api/v1/governed-writes/:operationId/reconciliation`

This endpoint is **assessment-only**. For unresolved version-2 branch writes, it may perform a provider-neutral branch-list read for the repository already stored in the operation descriptor. It can report:

- `not_required` — the local operation is already durably succeeded;
- `legacy_operation_context_unavailable` — the operation came from an older version-1 journal row and lacks safe context for automated observation;
- `provider_branch_present` — the recorded target branch is visible at the provider;
- `provider_branch_absent` — the recorded target branch is not visible in the provider branch read;
- `provider_observation_unavailable` — the provider read could not be completed.

Every response keeps `mutationAllowed: false` and `automaticResolutionAllowed: false`. A visible branch does **not** convert an uncertain record into succeeded. An absent branch does **not** authorize a retry. Provider errors are represented as sanitized assessment state rather than exposing private upstream failure detail.

Unresolved operations remain manual-review/reconciliation-required until a separately governed reconciliation mutation is designed with its own authority, evidence, concurrency, and rollback controls.

## Forgejo Validation

The repository includes:

```bash
pnpm validate:forgejo
```

### Read-path validation

Set `FORGEJO_BASE_URL` and optionally `GOREECLOUD_CODE_API_URL`, `FORGEJO_TOKEN`, and `VALIDATE_REPOSITORY=owner/name` according to the target test environment. The validator checks Forgejo version availability, provider health, repository discovery, and repository reads through GoreeCloud Code.

### Opt-in governed-write validation

Live branch-write validation is disabled unless the operator explicitly provides all of the following:

- `VALIDATE_REPOSITORY=owner/name`
- `VALIDATE_WRITE_BRANCH=<disposable-validation-branch>`
- `VALIDATE_WRITE_SOURCE_REF=<approved-source-ref>`
- `GOREECLOUD_CODE_WRITE_TOKEN=<application-write-bearer>`

`VALIDATE_WRITE_IDEMPOTENCY_KEY` is optional; when omitted, the validator generates a bounded random key for that run.

When enabled, the validator creates the explicitly selected validation branch through the GoreeCloud Code API, repeats the same request with the same idempotency key and requires an idempotent replay using the same operation ID, then confirms that the branch is visible through the provider-neutral branch read path.

The tool intentionally does not delete the validation branch because branch-deletion authority has not been implemented. Use a disposable, uniquely named validation branch and review/remove it through an already approved administrative path after validation evidence has been captured.

The validator never intentionally prints the application write bearer, Forgejo token, or raw idempotency key.

## Glaze UI Migration State

The current authoritative Stable consumer target is **GLAZE UI V1.1 / 1.1.0**. Existing 2.x-labeled source is historical migration input and does not establish current conformance. GoreeCloud Code remains migration/reconciliation-required until its application UI targets the accepted 1.1.0 revision and completes product-specific exact-revision conformance/acceptance. A design-system Stable promotion does not automatically make this application conforming.

## Security, Privacy, and Recovery Boundaries

Wardveil Security remains authoritative for security policy and evidence. Privacy Shield remains authoritative for purpose, minimization, consent, retention, telemetry, and data-use decisions. Everkeep remains authoritative for continuity, backup, restore, preservation, portability, and recovery evidence. GoreeCloud Identity establishes authenticated identity/claims, while GoreeCloud Code remains responsible for its own application authorization. GoreeCloud Mesh remains the coordination plane.

Current source-level controls do not establish production acceptance for those systems.

## Current Acceptance Gaps

The current Draft branch still requires, among other evidence:

- successful real-instance Forgejo validation recorded against an approved target;
- GoreeCloud Identity-backed identity/session integration and Code-owned user/service authorization;
- authoritative Wardveil policy, audit, and security evidence;
- Privacy Shield runtime acceptance;
- Everkeep continuity and recovery acceptance;
- distributed idempotency and authoritative reconciliation mutation;
- migration/reconciliation to GLAZE UI V1.1 / 1.1.0 and exact consumer conformance evidence;
- least-privilege and deployment validation;
- recovery and reconciliation testing.

Do not represent a successful local build, operation-status/reconciliation read, or validation script as Stable or production-ready evidence.
