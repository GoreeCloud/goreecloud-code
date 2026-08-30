# GoreeCloud Code User Manual

## Status

GoreeCloud Code is under active development. The current Draft Milestone 2 branch provides a first-party repository dashboard, provider-neutral repository reads, and one governed branch-creation write. It is not Stable or production-ready.

Forgejo is the preferred initial forge infrastructure behind GoreeCloud Code. Browser clients use GoreeCloud Code APIs and do not receive Forgejo credentials.

## Current Capabilities

The current development build supports:

- provider health and repository discovery;
- repository details;
- branch, commit, issue, and pull-request reads;
- the responsive GoreeCloud Code repository dashboard;
- one governed branch-creation operation;
- development audit and idempotency evidence for branch creation;
- local/test Forgejo connectivity validation;
- opt-in live branch-write validation for an explicitly selected test repository and validation branch.

Issue mutation, pull-request creation/review, repository administration, package publishing, pipeline writes, branch deletion, and GoreeCloud AI-assisted repository mutations remain disabled.

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

If the provider may have executed but outcome certainty is lost, GoreeCloud Code returns reconciliation-required state and does not blindly retry the mutation.

The local audit and idempotency files are development controls only. They are not substitutes for GoreeCloud Identity authorization, Wardveil Policy/Audit acceptance, GoreeCloud Mesh evidence delivery, Privacy Shield acceptance, Everkeep recovery acceptance, distributed reconciliation, or production evidence.

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

When enabled, the validator:

1. creates the explicitly selected validation branch through the GoreeCloud Code API;
2. repeats the same request with the same idempotency key and requires an idempotent replay using the same operation ID;
3. confirms that the branch is visible through the provider-neutral branch read path.

The tool intentionally does not delete the validation branch because branch-deletion authority has not been implemented. Use a disposable, uniquely named validation branch and review/remove it through an already approved administrative path after the validation evidence has been captured.

The validator never intentionally prints the application write bearer, Forgejo token, or raw idempotency key.

## Security, Privacy, and Recovery Boundaries

Wardveil Security remains authoritative for security policy and evidence. Privacy Shield remains authoritative for purpose, minimization, consent, retention, telemetry, and data-use decisions. Everkeep remains authoritative for continuity, backup, restore, preservation, portability, and recovery evidence. GoreeCloud Identity remains the production identity and authorization authority, and GoreeCloud Mesh remains the coordination plane.

Current source-level controls do not establish production acceptance for those systems.

## Current Acceptance Gaps

The current Draft branch still requires, among other evidence:

- successful real-instance Forgejo validation recorded against an approved target;
- GoreeCloud Identity-backed user/service authorization;
- authoritative Wardveil policy, audit, and security evidence;
- Privacy Shield runtime acceptance;
- Everkeep continuity and recovery acceptance;
- distributed idempotency and reconciliation;
- exact current Glaze UI consumer conformance evidence;
- least-privilege and deployment validation;
- recovery and reconciliation testing.

Do not represent a successful local build or validation script as Stable or production-ready evidence.
