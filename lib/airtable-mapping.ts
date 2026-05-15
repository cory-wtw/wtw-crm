import {
  parseCurrency,
  parseDateMDY,
  parseIntOrNull,
} from "./csv";
import type {
  DependentStatus,
  PipelineHistoryEntry,
  PipelineStage,
} from "./schemas";

export const PIPELINE_LABEL_TO_VALUE: Record<string, PipelineStage> = {
  Found: "found",
  Connected: "connected",
  Filed: "filed",
  Won: "won",
  Lost: "lost",
};

export const DEPENDENT_LABEL_TO_VALUE: Record<string, DependentStatus> = {
  Alone: "alone",
  "With Spouse": "with_spouse",
  "With Spouse + Kids": "with_spouse_kids",
};

export type MappingWarning = { row: string; message: string };

export type MappedVeteran = {
  name: string;
  phone?: string;
  birthYear?: number;
  yearlyIncome?: number;
  householdSize?: number;
  dependentStatus?: DependentStatus;
  assigneeUid: string | null;
  pipelineStage: PipelineStage;
  pipelineHistory: PipelineHistoryEntry[];
  dateFound: Date | null;
  dateConnected: Date | null;
  dateFiled: Date | null;
  dateWon: Date | null;
  dateLost: Date | null;
  lifeExpectancyAtFound?: number;
  ageAtFound?: number;
  anticipatedRateCode: string | null;
  actualRateCode: string | null;
  vsoIds: string[];
  assignedPhoneId: string | null;
  notes?: string;
};

export type MappingOutcome =
  | { ok: true; veteran: MappedVeteran; warnings: MappingWarning[] }
  | { ok: false; error: string };

/**
 * Pure-function mapper from an AirTable veterans CSV row to the Firestore
 * shape. No I/O — caller supplies the assignee lookup and a stable `now`.
 */
export function mapAirtableRowToVeteran(
  row: Record<string, string>,
  options: {
    assigneeUidByDisplayName: Map<string, string>;
    now: Date;
    systemUid: string;
  },
): MappingOutcome {
  const name = (row["Name"] ?? "").trim();
  if (!name) {
    return { ok: false, error: "Missing Name" };
  }

  const warnings: MappingWarning[] = [];

  const stageLabel = (row["Pipeline Stage"] ?? "").trim();
  const stage = PIPELINE_LABEL_TO_VALUE[stageLabel] ?? "found";
  if (stageLabel && !PIPELINE_LABEL_TO_VALUE[stageLabel]) {
    warnings.push({
      row: name,
      message: `Unknown pipeline stage "${stageLabel}"; defaulting to found.`,
    });
  }

  const assigneeName = (row["Assignee"] ?? "").trim();
  const assigneeUid =
    assigneeName.length > 0
      ? (options.assigneeUidByDisplayName.get(
          assigneeName.toLowerCase(),
        ) ?? null)
      : null;
  if (assigneeName && !assigneeUid) {
    warnings.push({
      row: name,
      message: `Assignee "${assigneeName}" didn't match any Firebase user.`,
    });
  }

  const dateFound = parseDateMDY((row["Date Found"] ?? "").trim());
  const dateConnected = parseDateMDY(
    (row["Date Connected"] ?? "").trim(),
  );

  const history: PipelineHistoryEntry[] = [];
  if (dateFound) {
    history.push({
      stage: "found",
      enteredAt: dateFound,
      byUid: assigneeUid ?? options.systemUid,
    });
  }
  if (dateConnected) {
    history.push({
      stage: "connected",
      enteredAt: dateConnected,
      byUid: assigneeUid ?? options.systemUid,
    });
  }
  if (
    stage !== "found" &&
    stage !== "connected" &&
    !history.some((h) => h.stage === stage)
  ) {
    history.push({
      stage,
      enteredAt: options.now,
      byUid: assigneeUid ?? options.systemUid,
    });
  }

  const dependentLabel = (row["Dependent Status"] ?? "").trim();
  const dependentStatus = dependentLabel
    ? (DEPENDENT_LABEL_TO_VALUE[dependentLabel] ?? undefined)
    : undefined;

  const veteran: MappedVeteran = {
    name,
    phone: row["Phone"]?.trim() || undefined,
    birthYear:
      parseIntOrNull((row["Birth Year"] ?? "").trim()) ?? undefined,
    yearlyIncome:
      parseCurrency((row["Yearly Income"] ?? "").trim()) ?? undefined,
    householdSize:
      parseIntOrNull((row["Household Size"] ?? "").trim()) ?? undefined,
    dependentStatus,
    assigneeUid,
    pipelineStage: stage,
    pipelineHistory: history,
    dateFound,
    dateConnected,
    dateFiled: null,
    dateWon: stage === "won" ? options.now : null,
    dateLost: stage === "lost" ? options.now : null,
    lifeExpectancyAtFound:
      parseIntOrNull((row["Life Expectancy at Found"] ?? "").trim()) ??
      undefined,
    ageAtFound:
      parseIntOrNull((row["Age at Found"] ?? "").trim()) ?? undefined,
    anticipatedRateCode: row["Anticipated Rate"]?.trim() || null,
    actualRateCode: row["Actual Rate"]?.trim() || null,
    vsoIds: [],
    assignedPhoneId: null,
    notes: row["Notes"]?.trim() || undefined,
  };

  return { ok: true, veteran, warnings };
}
