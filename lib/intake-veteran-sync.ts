import type {
  Branch,
  DischargeStatus,
  IntakeBranch,
} from "./schemas";

/** Branches that exist in both the intake and the veteran schema. */
const SHARED_BRANCHES: ReadonlyArray<Branch & IntakeBranch> = [
  "army",
  "navy",
  "marines",
  "air_force",
  "coast_guard",
  "space_force",
] as const;

/**
 * If the intake recorded exactly one branch and that branch exists in the
 * veteran schema's enum, return it for syncing back to the veteran row.
 * National Guard and Reserves are intentionally skipped — they don't exist
 * on the veteran enum, so we don't lose data by ignoring them on sync.
 */
export function intakeBranchToVeteran(
  branches: ReadonlyArray<string>,
): Branch | null {
  if (branches.length !== 1) return null;
  const b = branches[0] as IntakeBranch;
  return (SHARED_BRANCHES as readonly string[]).includes(b)
    ? (b as Branch)
    : null;
}

/** When prefilling a brand-new intake, mirror veteran.branch as a single
 * checked box on the intake's branches list. */
export function veteranBranchToIntake(
  branch: Branch | null | undefined,
): IntakeBranch[] {
  if (!branch) return [];
  return [branch as IntakeBranch];
}

/**
 * Discharge status uses the same enum on both sides (intake was promoted
 * from free text to enum). This is a no-op pass-through that documents
 * the intent and keeps callers symmetric with the branch helpers.
 */
export function syncableDischargeStatus(
  value: DischargeStatus | null | undefined,
): DischargeStatus | null {
  return value ?? null;
}
