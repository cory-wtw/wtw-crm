// Usage: npm run seed-veterans -- [path/to/csv]
// Defaults to data/airtable-veterans.csv. Idempotent only by ID — re-running
// creates duplicates. Run once, verify, then move on.
//
// Assignees are matched case-insensitively against Firebase Auth displayName.
// Unmatched assignees leave assigneeUid=null and print a warning so an admin
// can reassign in the UI later.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import {
  parseCsv,
  parseCurrency,
  parseDateMDY,
  parseIntOrNull,
} from "@/lib/csv";
import {
  type DependentStatus,
  type PipelineHistoryEntry,
  type PipelineStage,
} from "@/lib/schemas";

const SYSTEM_UID = "system-import";

const PIPELINE_LABEL_TO_VALUE: Record<string, PipelineStage> = {
  Found: "found",
  Connected: "connected",
  Filed: "filed",
  Won: "won",
  Lost: "lost",
};

const DEPENDENT_LABEL_TO_VALUE: Record<string, DependentStatus> = {
  Alone: "alone",
  "With Spouse": "with_spouse",
  "With Spouse + Kids": "with_spouse_kids",
};

function dropUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

async function buildAssigneeMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let pageToken: string | undefined;
  do {
    const result = await adminAuth.listUsers(1000, pageToken);
    for (const u of result.users) {
      if (u.displayName) {
        map.set(u.displayName.trim().toLowerCase(), u.uid);
      }
    }
    pageToken = result.pageToken;
  } while (pageToken);
  return map;
}

async function main() {
  const csvPath = resolve(
    process.cwd(),
    process.argv[2] ?? "data/airtable-veterans.csv",
  );
  const text = readFileSync(csvPath, "utf8");
  const rows = parseCsv(text);
  console.log(`Parsed ${rows.length} rows from ${csvPath}`);

  const assigneeMap = await buildAssigneeMap();
  console.log(
    `Matched ${assigneeMap.size} Firebase Auth users by displayName.`,
  );

  const now = new Date();
  const batch = adminDb.batch();
  let written = 0;

  for (const row of rows) {
    const name = row["Name"];
    if (!name) {
      console.warn(`Skipping row with no Name`);
      continue;
    }

    const stageLabel = row["Pipeline Stage"];
    const stage = PIPELINE_LABEL_TO_VALUE[stageLabel] ?? "found";
    if (stageLabel && !PIPELINE_LABEL_TO_VALUE[stageLabel]) {
      console.warn(
        `  ! Unknown pipeline stage "${stageLabel}" for ${name}; defaulting to found.`,
      );
    }

    const assigneeName = row["Assignee"];
    const assigneeUid =
      assigneeName != null && assigneeName.length > 0
        ? (assigneeMap.get(assigneeName.toLowerCase()) ?? null)
        : null;
    if (assigneeName && !assigneeUid) {
      console.warn(
        `  ! Assignee "${assigneeName}" for ${name} didn't match any Firebase user. Leaving unassigned.`,
      );
    }

    const dateFound = parseDateMDY(row["Date Found"]);
    const dateConnected = parseDateMDY(row["Date Connected"]);

    const history: PipelineHistoryEntry[] = [];
    if (dateFound) {
      history.push({
        stage: "found",
        enteredAt: dateFound,
        byUid: assigneeUid ?? SYSTEM_UID,
      });
    }
    if (dateConnected) {
      history.push({
        stage: "connected",
        enteredAt: dateConnected,
        byUid: assigneeUid ?? SYSTEM_UID,
      });
    }
    if (
      stage !== "found" &&
      stage !== "connected" &&
      !history.some((h) => h.stage === stage)
    ) {
      // We don't have a date for filed/won/lost in the CSV; stamp it now.
      history.push({
        stage,
        enteredAt: now,
        byUid: assigneeUid ?? SYSTEM_UID,
      });
    }

    const dependentLabel = row["Dependent Status"];
    const veteran = dropUndefined({
      name,
      phone: row["Phone"] || undefined,
      birthYear: parseIntOrNull(row["Birth Year"]) ?? undefined,
      yearlyIncome: parseCurrency(row["Yearly Income"]) ?? undefined,
      householdSize: parseIntOrNull(row["Household Size"]) ?? undefined,
      dependentStatus: dependentLabel
        ? (DEPENDENT_LABEL_TO_VALUE[dependentLabel] ?? undefined)
        : undefined,

      assigneeUid,

      pipelineStage: stage,
      pipelineHistory: history,
      dateFound,
      dateConnected,
      dateFiled: null,
      dateWon: stage === "won" ? now : null,
      dateLost: stage === "lost" ? now : null,

      lifeExpectancyAtFound:
        parseIntOrNull(row["Life Expectancy at Found"]) ?? undefined,
      ageAtFound: parseIntOrNull(row["Age at Found"]) ?? undefined,

      anticipatedRateCode: row["Anticipated Rate"] || null,
      actualRateCode: row["Actual Rate"] || null,

      vsoIds: [],
      assignedPhoneId: null,

      notes: row["Notes"] || undefined,

      createdBy: SYSTEM_UID,
      createdAt: now,
      updatedBy: SYSTEM_UID,
      updatedAt: now,
    });

    const ref = adminDb.collection("veterans").doc();
    batch.set(ref, veteran);
    written++;
    console.log(
      `  + ${name} (${stage})${assigneeUid ? ` → ${assigneeName}` : assigneeName ? ` [unassigned]` : ""}`,
    );
  }

  await batch.commit();
  console.log(`Done. Wrote ${written} veterans.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
