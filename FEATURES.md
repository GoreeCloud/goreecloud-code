# GoreeCloud Code Features

## Implemented source foundation

- Provider-neutral repository, branch, commit, issue, pull-request, and provider-health reads.
- Replaceable Forgejo provider adapter with server-side credentials and bounded request behavior.
- GoreeCloud-owned API service and responsive repository dashboard.
- First governed branch-creation write route with Git-ref validation and bounded JSON input.
- Separate application authorization and Forgejo provider authorization boundaries.
- Data-minimized local JSONL audit attempt/outcome records with restrictive permissions.
- Durable local idempotency reservation, completed-result replay, conflict detection, uncertain-state blocking, and reconciliation-required behavior.
- Bearer-protected read-only governed-write operation status for `in_progress`, `succeeded`, and `uncertain` journal state without raw idempotency keys or stored provider-failure reasons.
- Development/test Forgejo validation stack and deterministic CI tests.
- Opt-in live M2 validation for an explicitly selected branch-create operation, same-key replay verification, and provider-neutral branch readback without branch-deletion authority.
- Root user manual plus a synchronized central GoreeCloud User Manuals copy.
- Unified GoreeCloud branding authority reference.

## Under active development

- Real-instance Forgejo acceptance evidence for Milestone 1 reads and Milestone 2 branch writes.
- Authoritative reconciliation workflows for unresolved governed writes; current status inspection is observational only.
- Glaze UI 2.0.0 consumer migration and exact-revision conformance evidence.
- GoreeCloud Identity-backed user/service authorization.
- Wardveil policy, audit/evidence, repository, runner, dependency, artifact, and deployment security integration.
- Privacy Shield runtime data-use/minimization acceptance.
- Everkeep application-specific continuity/recovery contract and evidence.
- GoreeCloud Mesh capability/evidence integration.
- Distributed idempotency and authoritative reconciliation suitable for multiple API processes.

## Planned

- Governed issue and pull-request mutations and review workflows.
- Portable CI/pipeline execution and GoreeCloud-controlled runners.
- Package and OCI registry capabilities.
- GitHub migration/mirroring tools and metadata-preserving workflows.
- Bounded GoreeCloud AI-assisted development operations with explicit authorization and evidence.

Planned items are objectives, not implemented capability claims.
