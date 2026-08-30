# GoreeCloud Code Specifications

## Product boundary

GoreeCloud Code is original GoreeCloud-owned source-control and developer-platform software. Forgejo is the preferred initial replaceable forge infrastructure; GoreeCloud Code owns the product API, provider-neutral contracts, governance, evidence boundaries, and user experience.

## Current development state

- Milestone 1 Forgejo connectivity remains in progress pending recorded real-instance validation.
- The first Milestone 2 write is provider-neutral branch creation.
- Branch writes require server-side Forgejo permission, a separate application authorization secret, a mandatory application audit sink, and a mandatory idempotency/reconciliation journal.
- The Forgejo validator can optionally exercise one explicitly selected live branch create, same-key idempotent replay, and provider-neutral branch readback without adding branch-deletion authority.
- Issue mutation, pull-request mutation, package publication, pipeline writes, and AI-assisted writes are not enabled by this slice.

## Runtime architecture

`Glaze UI client -> GoreeCloud Code API -> ForgeProvider -> ForgejoProvider`

The browser receives no Forgejo credentials and does not depend directly on Forgejo-specific APIs.

## Governed branch-write contract

`POST /api/v1/repositories/:owner/:name/branches`

Required development controls:

- `FORGEJO_TOKEN` with minimum provider permissions;
- `GOREECLOUD_CODE_WRITE_TOKEN_FILE` for the interim application bearer gate;
- `GOREECLOUD_CODE_AUDIT_LOG_FILE` for data-minimized pre/outcome evidence;
- `GOREECLOUD_CODE_IDEMPOTENCY_FILE` for replay safety and reconciliation state; and
- an `Idempotency-Key` request header.

Raw idempotency keys are SHA-256 hashed before persistence. Successful matching requests replay the stored result without a second provider mutation. Conflicting or unresolved requests fail closed. Provider uncertainty requires reconciliation rather than blind retry.

These local files are development foundations. They are not production GoreeCloud Identity authorization, Wardveil Audit, Mesh evidence delivery, distributed idempotency, or production incident reconstruction.

## Live validation contract

`pnpm validate:forgejo` always supports the existing read-path validation. Live branch-write validation is opt-in and requires an explicit `VALIDATE_REPOSITORY`, `VALIDATE_WRITE_BRANCH`, `VALIDATE_WRITE_SOURCE_REF`, and protected `GOREECLOUD_CODE_WRITE_TOKEN`. `VALIDATE_WRITE_IDEMPOTENCY_KEY` may be supplied; otherwise the validator generates a bounded random key.

When the write path is enabled, the validator must:

1. create the explicitly selected validation branch through GoreeCloud Code;
2. repeat the identical request with the same idempotency key and receive a replay using the same operation ID;
3. confirm the branch through the provider-neutral branch-read endpoint.

The validator must not log reusable provider/application credentials or the raw idempotency key. It intentionally does not delete the validation branch because branch-deletion authority is not implemented by this milestone.

A successful validator run is target-specific interoperability evidence only. It does not establish Identity-backed authorization, Wardveil/Privacy Shield/Everkeep acceptance, distributed reconciliation, least privilege, deployment acceptance, or Stable qualification.

## Platform-system requirements

- **Glaze UI:** current consumer target is Glaze UI 2.0.0. Exact-revision consumer conformance is not yet accepted for GoreeCloud Code.
- **Wardveil Security:** repository/write security policy, authoritative audit/evidence, runner/artifact protections, and production acceptance remain incomplete.
- **Privacy Shield:** data-use/minimization authority remains separate; current application logs deliberately exclude reusable credentials and unnecessary private payloads, but Privacy Shield runtime acceptance is not established.
- **Everkeep:** repository/application continuity, backup, restore, portability, and recovery evidence require an application-specific acceptance contract and remain incomplete.
- **GoreeCloud Identity:** final actor/session/service authorization is pending; the current secret-file bearer is interim development infrastructure.
- **GoreeCloud Mesh:** coordination and evidence transport remain pending and must not manufacture security/privacy/continuity truth.

## Validation

Repository CI performs strict TypeScript checking, deterministic provider/API tests, governed-write audit/idempotency tests, builds, and syntax validation for the Forgejo target-validation tool. Live Forgejo read/write interoperability remains a separate target-environment validation gate and must be recorded before it changes milestone acceptance state.

## Stable boundary

GoreeCloud Code is not Stable or production-accepted. Stable qualification requires current Glaze UI consumer acceptance plus applicable Wardveil, Privacy Shield, Everkeep, Identity, Mesh, live Forgejo, least-privilege, deployment, and recovery evidence.
