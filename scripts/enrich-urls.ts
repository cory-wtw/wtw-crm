// Draft resource records from a list of URLs.
//
// Usage:
//   npm run enrich-urls -- --file=urls.txt              # DRY RUN — prints only
//   npm run enrich-urls -- --file=urls.txt --commit     # actually writes
//   npm run enrich-urls -- https://a.org https://b.org
//   npm run enrich-urls -- --file=urls.txt --concurrency=5
//
// The batch twin of /admin/resources/enrich. It shares the pipeline with the
// page — same fetch, same host blocking, same prompt, same parser, same
// externalId hashing — from lib/enrich-runner.ts, so a record drafted here and
// one drafted on the page can't disagree about what a page said.
//
// The difference is who reviews. The page puts a proposal in front of a person
// before anything is written; this writes unattended. That is only tolerable
// because every record lands `flagged` and stays invisible to matching until
// somebody marks it live — and because the dry run prints each proposed record
// in full, which is the review, done before the write instead of after.
//
// Needs ANTHROPIC_API_KEY in .env.local.
import { readFileSync } from "node:fs";
import { mapWithConcurrency } from "@/lib/concurrency";
import { parseUrlList, type Proposal } from "@/lib/enrich";
import {
  enrichUrl,
  externalIdForUrl,
  upsertEnrichedResource,
  validateProposal,
} from "@/lib/enrich-runner";

const COMMIT = process.argv.includes("--commit");

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const FILE = argValue("file");
/** Modest by default: these are small nonprofits' web servers, not a CDN. */
const CONCURRENCY = Math.max(1, Number(argValue("concurrency") ?? "3") || 3);

type Failure = { url: string; error: string };
type Written = { url: string; id: string; created: boolean };

/** URLs from --file and from bare arguments, normalized and de-duplicated. */
function collectUrls(): { urls: string[]; invalid: string[] } {
  const fromArgs = process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .join("\n");

  const fromFile = FILE ? readFileSync(FILE, "utf8") : "";
  return parseUrlList([fromFile, fromArgs].filter(Boolean).join("\n"));
}

/** The proposal as the reviewer would read it, nulls called out as nulls. */
function printProposal(url: string, proposal: Proposal, unanswered: string[]) {
  console.log(`\n─── ${url}`);
  console.log(`    externalId: ${externalIdForUrl(url)}`);
  for (const [field, value] of Object.entries(proposal)) {
    const rendered =
      value === null
        ? "null  ← page didn't say"
        : Array.isArray(value)
          ? value.length === 0
            ? "[]  ← page said none"
            : value.join(", ")
          : String(value);
    console.log(`    ${field.padEnd(21)} ${rendered}`);
  }
  if (unanswered.length > 0) {
    console.log(
      `    ${unanswered.length} field${unanswered.length === 1 ? "" : "s"} unanswered — a person should fill these in.`,
    );
  }
}

async function main(): Promise<void> {
  const { urls, invalid } = collectUrls();

  if (urls.length === 0) {
    throw new Error(
      "No URLs. Pass --file=path/to/urls.txt or list them as arguments.",
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set in .env.local.");
  }

  console.log(
    COMMIT
      ? "Drafting resources from URLs (COMMIT — writing changes)…"
      : "Drafting resources from URLs (DRY RUN — no writes)…",
  );
  console.log(`  ${urls.length} URLs, ${CONCURRENCY} at a time.`);
  if (invalid.length > 0) {
    console.log(`  Skipping ${invalid.length} line(s) that weren't URLs:`);
    for (const line of invalid) console.log(`    ${line}`);
  }

  const failures: Failure[] = [];
  const written: Written[] = [];
  let drafted = 0;
  let needsClassifying = 0;

  await mapWithConcurrency(urls, CONCURRENCY, async (url) => {
    // A dead link, a client-rendered page, a rate limit, or an unparseable
    // reply costs this URL and nothing else.
    const outcome = await enrichUrl(url);
    if (!outcome.ok) {
      failures.push({ url, error: outcome.error });
      console.log(`\n─── ${url}\n    FAILED: ${outcome.error}`);
      return;
    }

    const { proposal, unanswered, externalId, existingResourceId } =
      outcome.result;
    drafted++;
    printProposal(url, proposal, unanswered);
    if (existingResourceId) {
      console.log("    (already in the directory — this updates that record)");
    }

    const validated = validateProposal(proposal, url);
    if (!validated.ok) {
      failures.push({ url, error: validated.error });
      console.log(`    NOT WRITABLE: ${validated.error}`);
      return;
    }
    if (validated.input.buckets.length === 0) {
      // Writable, but it matches nobody until somebody classifies it. Worth
      // saying out loud rather than leaving to be discovered on /resources.
      needsClassifying++;
      console.log("    No buckets — will need classifying before it matches.");
    }

    if (!COMMIT) return;

    const result = await upsertEnrichedResource({
      resource: validated.input,
      externalId,
      actorUid: "system",
    });
    written.push({ url, id: result.id, created: result.created });
    console.log(`    ${result.created ? "created" : "updated"} ${result.id}`);
  });

  console.log("\nSummary:");
  console.log(`  URLs given:        ${urls.length}`);
  console.log(`  Drafted:           ${drafted}`);
  console.log(`  Failed:            ${failures.length}`);
  if (COMMIT) {
    console.log(`  Created:           ${written.filter((w) => w.created).length}`);
    console.log(`  Updated:           ${written.filter((w) => !w.created).length}`);
  }
  console.log(`  Need classifying:  ${needsClassifying}`);

  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const failure of failures) {
      console.log(`  ${failure.url}\n    ${failure.error}`);
    }
  }

  console.log(
    "\nEverything written lands verificationStatus=flagged and is invisible to",
  );
  console.log(
    "matching until a person reviews it. Nulls above are fields the page didn't",
  );
  console.log("answer — they sit at permissive defaults, not findings.");

  if (!COMMIT) {
    console.log("\nDry run only. Re-run with `-- --commit` to apply.");
  } else {
    console.log("\nDone.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
