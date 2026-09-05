# GoreeCloud Code Features

## Implemented source foundation

- Provider-neutral repository, branch, commit, issue, pull-request, and provider-health reads.
- Replaceable Forgejo provider adapter with server-side credentials and bounded request behavior.
- GoreeCloud-owned API service and responsive repository dashboard.
- First governed branch-creation write route with Git-ref validation and bounded JSON input.
- Separate application authorization and Forgejo provider authorization boundaries.
- Data-minimized local JSONL audit attempt/outcome records with restrictive permissions.
- Durable local idempotency reservation, completed-result replay, conflict detection, uncertain-state blocking, and reconciliation-required behavior.
- Version-2 journal operation descriptors for new branch writes with version-1 read compatibility and no invented historical context.
- Bearer-protected read-only governed-write operation status for `in_progress`, `succeeded`, and `uncertain` journal state without raw idempotency keys or stored provider-failure reasons.
- Bearer-protected read-only reconciliation assessment using provider-neutral branch reads only; provider branch presence/absence never authorizes retry or automatic local-state resolution.
- Development/test Forgejo validation stack and deterministic CI tests.
- Opt-in live M2 validation for an explicitly selected branch-create operation, same-key replay verification, and provider-neutral branch readback without branch-deletion authority.
- Root user manual plus a synchronized central GoreeCloud User Manuals copy.
- Unified GoreeCloud branding authority reference.

## Under active development

- Real-instance Forgejo acceptance evidence for Milestone 1 reads and Milestone 2 branch writes.
- Authoritative reconciliation mutation/workflows for unresolved governed writes; current reconciliation is assessment-only.
- Migration/reconciliation to the current authoritative Stable **GLAZE UI V1.1 / 1.1.0** consumer target and exact-revision product evidence. Existing 2.x-labeled source is historical migration input, not current conformance.
- GoreeCloud Identity-backed identity/session integration plus Code-owned user/service authorization.
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
