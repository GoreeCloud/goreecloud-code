import type { Branch, ForgeProvider } from "@goreecloud/code-contracts";
import type { BranchWriteOperationStatus } from "./idempotency.ts";

export type BranchWriteReconciliationAssessmentKind =
  | "not_required"
  | "legacy_operation_context_unavailable"
  | "provider_branch_present"
  | "provider_branch_absent"
  | "provider_branch_ambiguous"
  | "provider_observation_unavailable";

export interface BranchWriteReconciliationAssessment {
  operationId: string;
  localState: BranchWriteOperationStatus["state"];
  localObservedAt: string;
  assessedAt: string;
  reconciliationRequired: boolean;
  assessment: BranchWriteReconciliationAssessmentKind;
  manualReviewRequired: boolean;
  providerChecked: boolean;
  observedBranch?: Branch;
  observedBranches?: Branch[];
  mutationAllowed: false;
  automaticResolutionAllowed: false;
}

export async function assessBranchWriteReconciliation(
  provider: ForgeProvider,
  operation: BranchWriteOperationStatus,
): Promise<BranchWriteReconciliationAssessment> {
  const assessedAt = new Date().toISOString();

  if (operation.state === "succeeded") {
    return baseAssessment(operation, "not_required", false, false, assessedAt);
  }

  if (!operation.operation) {
    return baseAssessment(
      operation,
      "legacy_operation_context_unavailable",
      true,
      false,
      assessedAt,
    );
  }

  try {
    const branches = await provider.branches(operation.operation.repository);
    const observedBranches = branches.filter(
      (candidate) => candidate.name === operation.operation?.branch.name,
    );
    if (observedBranches.length > 1) {
      return {
        ...baseAssessment(operation, "provider_branch_ambiguous", true, true, assessedAt),
        observedBranches,
      };
    }
    const observedBranch = observedBranches[0];
    if (observedBranch) {
      return {
        ...baseAssessment(operation, "provider_branch_present", true, true, assessedAt),
        observedBranch,
      };
    }
    return baseAssessment(operation, "provider_branch_absent", true, true, assessedAt);
  } catch {
    return baseAssessment(operation, "provider_observation_unavailable", true, true, assessedAt);
  }
}

function baseAssessment(
  operation: BranchWriteOperationStatus,
  assessment: BranchWriteReconciliationAssessmentKind,
  manualReviewRequired: boolean,
  providerChecked: boolean,
  assessedAt: string,
): BranchWriteReconciliationAssessment {
  return {
    operationId: operation.operationId,
    localState: operation.state,
    localObservedAt: operation.observedAt,
    assessedAt,
    reconciliationRequired: operation.reconciliationRequired,
    assessment,
    manualReviewRequired,
    providerChecked,
    mutationAllowed: false,
    automaticResolutionAllowed: false,
  };
}
