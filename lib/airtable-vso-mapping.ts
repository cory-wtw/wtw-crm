import type { PartnershipStatus } from "./schemas";

export const PARTNERSHIP_LABEL_TO_VALUE: Record<string, PartnershipStatus> = {
  "Active Partner": "active_partner",
  "In Discussion": "in_discussion",
  Inactive: "inactive",
  Declined: "declined",
};

export type MappedVso = {
  fullName: string;
  affiliation?: string;
  city?: string;
  state?: string;
  directPhone?: string;
  directEmail?: string;
  partnershipStatus: PartnershipStatus;
  notes?: string;
};

export type VsoMappingOutcome =
  | {
      ok: true;
      vso: MappedVso;
      warnings: Array<{ row: string; message: string }>;
    }
  | { ok: false; error: string };

export function mapAirtableRowToVso(
  row: Record<string, string>,
): VsoMappingOutcome {
  const fullName = (row["Full Name"] ?? "").trim();
  if (!fullName) {
    return { ok: false, error: "Missing Full Name" };
  }

  const warnings: Array<{ row: string; message: string }> = [];

  const statusLabel = (row["Partnership Status"] ?? "").trim();
  const partnershipStatus =
    PARTNERSHIP_LABEL_TO_VALUE[statusLabel] ?? "in_discussion";
  if (statusLabel && !PARTNERSHIP_LABEL_TO_VALUE[statusLabel]) {
    warnings.push({
      row: fullName,
      message: `Unknown partnership status "${statusLabel}"; defaulting to In Discussion.`,
    });
  }

  const vso: MappedVso = {
    fullName,
    affiliation: row["Affiliation"]?.trim() || undefined,
    city: row["City"]?.trim() || undefined,
    state: row["State"]?.trim() || undefined,
    directPhone: row["Direct Phone"]?.trim() || undefined,
    directEmail: row["Direct Email"]?.trim() || undefined,
    partnershipStatus,
    notes: row["Notes"]?.trim() || undefined,
  };

  return { ok: true, vso, warnings };
}
