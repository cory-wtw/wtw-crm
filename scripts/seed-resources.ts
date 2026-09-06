// Load hand-curated resources from a JSON file.
//
// Usage:
//   npm run seed-resources                                  # DRY RUN — prints only
//   npm run seed-resources -- --commit                      # actually writes
//   npm run seed-resources -- --file=data/other-batch.json
//
// The counterpart to the two automated importers, and the one that matches how
// the roster is actually being built: a person researches an organization,
// writes it down with a source, and loads it. No API key, no model, no guessing
// — every value in the file was put there by somebody who checked.
//
// The file speaks the form's own vocabulary ("Mental Health & Recovery",
// "Call", "Any discharge, including other-than-honorable"), not internal codes.
// lib/resource-import.ts does the mapping and refuses anything it doesn't
// recognize rather than defaulting it, so a typo stops the record instead of
// quietly producing one that matches nobody.
//
// Idempotent on `externalId: seed:<slug of org_name>`, so a second run updates
// rather than duplicates. Rename an organization in the file and you get a new
// record; that is the tradeoff for not needing an id column.
//
// Unlike the enrichment writer, this honours the `status` in the file. "Nothing
// auto-publishes" guards against a machine's guesses reaching a veteran — a
// researched record that says "Live" has already had the human read that rule
// exists to require, and --commit is that person's action.
import { readFileSync } from "node:fs";
import { adminDb } from "@/lib/firebase/admin";
import {
  parseSeedResource,
  type SeedResource,
} from "@/lib/resource-import";
import { resourceInputSchema, type ResourceInput } from "@/lib/schemas";
import { findByExternalId } from "@/lib/external-id";

const COMMIT = process.argv.includes("--commit");

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const FILE = argValue("file") ?? "data/resources-seed.json";
const SOURCE_ACTOR = "system";

type Ready = {
  input: ResourceInput;
  externalId: string;
  warnings: string[];
};

/** The record as it will be stored, so the dry run IS the review. */
function printRecord(record: Ready, index: number) {
  const { input } = record;
  console.log(`\n─── ${index + 1}. ${input.organizationName}`);
  console.log(`    externalId:   ${record.externalId}`);
  console.log(`    buckets:      ${input.buckets.join(", ") || "(none)"}`);
  console.log(
    `    area:         ${input.geoScope}${
      input.geoStates.length > 0 ? ` · ${input.geoStates.join(", ")}` : ""
    }${
      input.geoLocalities.length > 0
        ? ` · ${input.geoLocalities.join(", ")}`
        : ""
    }`,
  );
  console.log(`    discharge:    ${input.minDischarge}`);

  const gates = [
    input.requiresVaEnrollment && "VA enrollment",
    input.requiresValidId && "valid ID",
    input.requiresDependents && "dependents",
    input.crisisCapable && "same-day capable",
  ].filter(Boolean);
  console.log(`    gates:        ${gates.join(", ") || "none"}`);
  console.log(`    access:       ${input.accessMethod} · ${input.accessValue ?? "—"}`);
  console.log(`    wait:         ${input.typicalWait}`);
  console.log(`    status:       ${input.verificationStatus} · ${input.fragility}`);
  if (input.eligibilityNotes) {
    console.log(`    elig notes:   ${input.eligibilityNotes}`);
  }
  for (const warning of record.warnings) {
    console.log(`    ! ${warning}`);
  }
}

async function main(): Promise<void> {
  console.log(
    COMMIT
      ? `Loading resources from ${FILE} (COMMIT — writing changes)…`
      : `Loading resources from ${FILE} (DRY RUN — no writes)…`,
  );

  const parsedFile = JSON.parse(readFileSync(FILE, "utf8")) as {
    resources?: SeedResource[];
  };
  const raw = parsedFile.resources ?? [];
  if (raw.length === 0) {
    throw new Error(`No "resources" array in ${FILE}.`);
  }

  const ready: Ready[] = [];
  const rejected: { name: string; errors: string[] }[] = [];

  for (const record of raw) {
    const name = record.org_name ?? "(unnamed)";
    const mapped = parseSeedResource(record);
    if (!mapped.ok) {
      rejected.push({ name, errors: mapped.errors });
      continue;
    }

    // Through the same schema the form validates against. A record the form
    // would reject must not get in by the back door.
    const validated = resourceInputSchema.safeParse(mapped.input);
    if (!validated.success) {
      rejected.push({
        name,
        errors: validated.error.issues.map(
          (issue) =>
            `${issue.path.map(String).join(".") || "record"}: ${issue.message}`,
        ),
      });
      continue;
    }

    ready.push({
      input: validated.data,
      externalId: mapped.externalId,
      warnings: mapped.warnings,
    });
  }

  ready.forEach(printRecord);

  if (rejected.length > 0) {
    console.log(`\nRejected ${rejected.length}:`);
    for (const bad of rejected) {
      console.log(`  ${bad.name}`);
      for (const error of bad.errors) console.log(`    - ${error}`);
    }
  }

  let created = 0;
  let updated = 0;

  if (COMMIT) {
    const now = new Date();
    for (const record of ready) {
      const existingId = await findByExternalId(record.externalId);
      const shared = {
        ...record.input,
        externalId: record.externalId,
        updatedBy: SOURCE_ACTOR,
        updatedAt: now,
        // A record marked live was checked by the person who wrote the file,
        // today. Recording that is what keeps it out of the aging bucket for
        // the next 90 days — and what makes the date on screen true.
        ...(record.input.verificationStatus === "live"
          ? { lastVerified: now, lastVerifiedBy: SOURCE_ACTOR }
          : {}),
      };

      if (existingId) {
        await adminDb.collection("resources").doc(existingId).update(shared);
        updated++;
      } else {
        await adminDb.collection("resources").add({
          ...shared,
          ...(record.input.verificationStatus === "live"
            ? {}
            : { lastVerified: null, lastVerifiedBy: null }),
          createdBy: SOURCE_ACTOR,
          createdAt: now,
        });
        created++;
      }
    }
  }

  console.log(`\nSummary:`);
  console.log(`  ready:    ${ready.length}`);
  console.log(`  rejected: ${rejected.length}`);
  if (COMMIT) {
    console.log(`  created:  ${created}`);
    console.log(`  updated:  ${updated}`);
    console.log("\nDone. Open /resources to check them.");
  } else {
    console.log("\nDry run only. Re-run with `-- --commit` to apply.");
  }

  if (rejected.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
