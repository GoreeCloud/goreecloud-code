# GoreeCloud Code Specifications

## Product boundary

GoreeCloud Code is original GoreeCloud-owned source-control and developer-platform software. Forgejo is the preferred initial replaceable forge infrastructure; GoreeCloud Code owns the product API, provider-neutral contracts, governance, evidence boundaries, and user experience.

## Current development state

- Milestone 1 Forgejo connectivity remains in progress pending recorded real-instance validation.
- The first Milestone 2 write is provider-neutral branch creation.
- Branch writes require server-side Forgejo permission, a separate application authorization secret, a mandatory application audit sink, and a mandatory idempotency/reconciliation journal.
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

## Platform-system requirements

- **Glaze UI:** current consumer target is Glaze UI 2.0.0. Exact-revision consumer conformance is not yet accepted for GoreeCloud Code.
- **Wardveil Security:** repository/write security policy, authoritative audit/evidence, runner/artifact protections, and production acceptance remain incomplete.
- **Privacy Shield:** data-use/minimization authority remains separate; current application logs deliberately exclude reusable credentials and unnecessary private payloads, but Privacy Shield runtime acceptance is not established.
- **Everkeep:** repository/application continuity, backup, restore, portability, and recovery evidence require an application-specific acceptance contract and remain incomplete.
- **GoreeCloud Identity:** final actor/session/service authorization is pending; the current secret-file bearer is interim development infrastructure.
- **GoreeCloud Mesh:** coordination and evidence transport remain pending and must not manufacture security/privacy/continuity truth.

## Validation

Repository CI performs strict TypeScript checking, deterministic provider/API tests, governed-write audit/idempotency tests, and builds. Live Forgejo interoperability is a separate validation gate.

## Stable boundary

GoreeCloud Code is not Stable or production-accepted. Stable qualification requires current Glaze UI consumer acceptance plus applicable Wardveil, Privacy Shield, Everkeep, Identity, Mesh, live Forgejo, least-privilege, deployment, and recovery evidence.
