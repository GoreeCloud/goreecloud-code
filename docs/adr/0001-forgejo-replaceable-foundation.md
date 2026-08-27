# ADR 0001 — Forgejo as the initial replaceable forge foundation

## Status

Accepted.

## Decision

GoreeCloud Code is the permanent first-party developer platform and product boundary. Forgejo is the preferred initial infrastructure foundation for Git repository collaboration capabilities, but Forgejo is not the permanent product boundary and must remain replaceable.

GoreeCloud-owned interfaces will separate product code from Forgejo-specific APIs. Provider-neutral domain contracts are defined in `packages/contracts`, and the Forgejo implementation lives in `integrations/forgejo`.

## Rationale

Building every mature Git protocol, storage, collaboration, authorization, diff, SSH, package, and workflow capability from scratch at project inception would create unnecessary security and maintenance risk. Forgejo supplies proven forge infrastructure while GoreeCloud builds its own developer experience, service contracts, governance, integrations, pipelines, security evidence, resilience, and AI-assisted development model.

## Architectural constraints

- Standard Git remains the repository interoperability format.
- Application code must not depend directly on Forgejo response models where a GoreeCloud contract can be used instead.
- Forgejo-specific authentication and transport logic stays within the Forgejo adapter.
- New native components should replace upstream functionality only when there is a material product, security, privacy, resilience, performance, integration, governance, or operational benefit.
- Migration to another backend must not require rewriting the Glaze UI product experience.

## Consequences

The initial implementation can move quickly while retaining architectural independence. GoreeCloud may later introduce additional providers, including GitHub interoperability and native GoreeCloud implementations, without redefining the permanent product identity.
