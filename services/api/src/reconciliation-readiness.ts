export const RECONCILIATION_READINESS_CONTRACT_VERSION = 1 as const;

export type ReconciliationPrerequisite =
  | "application_authorization"
  | "identity"
  | "wardveil"
  | "privacy_shield"
  | "durable_reconciliation"
  | "distributed_concurrency"
  | "least_privilege"
  | "everkeep_recovery"
  | "mesh"
  | "glaze_consumer_acceptance"
  | "provider_write_interoperability";

export type ReconciliationReadinessInput = Readonly<
  Record<ReconciliationPrerequisite, boolean>
>;

export interface ReconciliationReadinessAssessment {
  readonly contractVersion: typeof RECONCILIATION_READINESS_CONTRACT_VERSION;
  readonly designPrerequisitesSatisfied: boolean;
  readonly missingPrerequisites: readonly ReconciliationPrerequisite[];
  readonly mutationAllowed: false;
  readonly automaticResolutionAllowed: false;
}

const orderedPrerequisites: readonly ReconciliationPrerequisite[] = [
  "application_authorization",
  "identity",
  "wardveil",
  "privacy_shield",
  "durable_reconciliation",
  "distributed_concurrency",
  "least_privilege",
  "everkeep_recovery",
  "mesh",
  "glaze_consumer_acceptance",
  "provider_write_interoperability",
];

/**
 * Assess whether the explicitly tracked prerequisites for future authoritative
 * reconciliation design are satisfied.
 *
 * This is intentionally not an authorization primitive. Even when every input
 * is true, the current Development implementation has no reconciliation
 * mutation authority and cannot automatically resolve an operation.
 */
export function assessReconciliationReadiness(
  input: ReconciliationReadinessInput,
): ReconciliationReadinessAssessment {
  const missingPrerequisites = orderedPrerequisites.filter(
    (prerequisite) => input[prerequisite] !== true,
  );

  return Object.freeze({
    contractVersion: RECONCILIATION_READINESS_CONTRACT_VERSION,
    designPrerequisitesSatisfied: missingPrerequisites.length === 0,
    missingPrerequisites: Object.freeze([...missingPrerequisites]),
    mutationAllowed: false as const,
    automaticResolutionAllowed: false as const,
  });
}
