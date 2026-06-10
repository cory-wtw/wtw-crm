import type {
  Branch,
  DischargeStatus,
  HousingSituation,
  HousingStatus,
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

/**
 * Housing: the intake captures 8 categories of where a veteran is staying
 * right now; the veteran row condenses that to 4 (unsheltered / transitional
 * / housed / unknown). Mapping is opinionated but lossy in both directions:
 *
 *   - unsheltered (intake) → unsheltered (veteran)
 *   - shelter             → transitional   (emergency shelters are transitional)
 *   - couch_surfing       → transitional
 *   - vehicle             → unsheltered    (living in a car is unsheltered)
 *   - renting             → housed
 *   - own_home            → housed
 *   - transitional        → transitional
 *   - other               → null (ambiguous — leave the existing value alone)
 *
 * The narrative "where staying right now" text field on the intake captures
 * the granularity that this mapping drops.
 */
export function intakeHousingToVeteran(
  housing: HousingSituation | null | undefined,
): HousingStatus | null {
  if (!housing) return null;
  switch (housing) {
    case "unsheltered":
      return "unsheltered";
    case "vehicle":
      return "unsheltered";
    case "shelter":
      return "transitional";
    case "couch_surfing":
      return "transitional";
    case "transitional":
      return "transitional";
    case "renting":
      return "housed";
    case "own_home":
      return "housed";
    case "other":
      return null;
    default:
      return null;
  }
}

/**
 * Prefill helper. Veteran's `housed` is ambiguous (renting vs. own home), so
 * we only prefill when there's a clean one-to-one match: `unsheltered` and
 * `transitional` ride straight across, `housed` is left blank for the
 * liaison to disambiguate, `unknown` clears.
 */
export function veteranHousingToIntake(
  housing: HousingStatus | null | undefined,
): HousingSituation | null {
  switch (housing) {
    case "unsheltered":
      return "unsheltered";
    case "transitional":
      return "transitional";
    case "housed":
    case "unknown":
    default:
      return null;
  }
}
