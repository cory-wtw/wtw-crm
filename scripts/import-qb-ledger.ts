// One-time QuickBooks → /finances migration.
//
// Usage:
//   npm run import-qb-ledger -- <general-ledger.csv> <mapping.json>            (dry run)
//   npm run import-qb-ledger -- <general-ledger.csv> <mapping.json> --commit   (write)
//
// 1. In QuickBooks: Reports → General Ledger → Report period "All Dates" →
//    Export → CSV (or Excel, then save as CSV). Keep this file somewhere safe
//    even after cancelling QB — it's the paper trail.
// 2. Load the starter categories at /finances (or create your own).
// 3. Copy scripts/qb-category-map.example.json, then run a dry run. It lists
//    every account in the ledger and which ones still need a mapping.
// 4. Map each income/expense account to a category name, and the bank,
//    credit card, equity and other balance-sheet accounts to "skip".
// 5. Compare the dry run's per-category totals with QuickBooks' Profit & Loss
//    for the same period. If an account comes out with the wrong sign, add
//    "flip": true to its mapping.
// 6. Re-run with --commit. Safe to repeat: each ledger row gets a
//    deterministic ID, so a second run only adds rows that are new, and
//    removes earlier QB rows that no longer appear in the ledger (the dry run
//    lists both first).
// 7. Rows that look like something already entered another way (by hand, a
//    bank or Zeffy import) are held back and listed. Add
//    --include-likely-duplicates once you've checked they're different.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  parseGeneralLedger,
  signFor,
  summarizeAccounts,
  type AccountMapping,
} from "@/lib/finance/qb-ledger";
import { findLikelyDuplicate, toIncomingTransaction } from "@/lib/finance/dedupe";
import { loadDedupeIndex } from "@/lib/finance/dedupe-db";
import { adminDb } from "@/lib/firebase/admin";
import {
  CATEGORIES_COLLECTION as CATEGORIES,
  TRANSACTIONS_COLLECTION as TRANSACTIONS,
} from "@/lib/schemas";

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

async function main() {
  const [file, mapFile, ...flags] = process.argv.slice(2);
  if (!file || !mapFile) {
    console.error("Usage: npm run import-qb-ledger -- <ledger.csv> <mapping.json> [--commit]");
    process.exit(1);
  }
  const commit = flags.includes("--commit");

  const { entries, problems } = parseGeneralLedger(readFileSync(file, "utf8"));
  const mapping: Record<string, AccountMapping> =
    JSON.parse(readFileSync(mapFile, "utf8")).accounts ?? {};
  const summaries = new Map(summarizeAccounts(entries).map((s) => [s.account, s]));

  console.log(`Read ${entries.length} ledger rows across ${summaries.size} accounts.`);
  for (const p of problems.slice(0, 20)) console.warn(`  ! ${p}`);

  const unmapped = [...summaries.values()].filter((s) => !(s.account in mapping));
  if (unmapped.length > 0) {
    console.log("\nAccounts with no mapping yet (add each to the mapping file):");
    for (const s of unmapped) {
      console.log(`  "${s.account}"  — ${s.rows} rows, net ${usd(s.rawCents)}`);
    }
  }

  const catSnap = await adminDb.collection(CATEGORIES).get();
  const categories = new Map(
    catSnap.docs.map((d) => [
      String(d.data().name).toLowerCase(),
      { id: d.id, name: String(d.data().name), type: d.data().type as "income" | "expense" },
    ]),
  );

  const missing = new Set<string>();
  for (const m of Object.values(mapping)) {
    if (m !== "skip" && !categories.has(m.category.toLowerCase())) missing.add(m.category);
  }
  if (missing.size > 0) {
    console.error(`\nThese categories don't exist in /finances yet: ${[...missing].join(", ")}`);
    console.error("Create them on the Categories page (or fix the spelling) and re-run.");
    process.exit(1);
  }

  type Doc = { id: string; data: Record<string, unknown> };
  const docs: Doc[] = [];
  const seen = new Map<string, number>();
  const totals = new Map<string, number>(); // "YYYY · Category" → cents
  const now = new Date();

  for (const e of entries) {
    const m = mapping[e.account];
    if (!m || m === "skip") continue;
    const category = categories.get(m.category.toLowerCase())!;
    const sign = signFor(category.type, summaries.get(e.account)!, e.debitCredit, m.flip);
    const cents = Math.round(e.amount * 100) * sign;

    const identity = [e.account, e.date, e.txnType, e.num, e.name, e.memo, Math.round(e.amount * 100)].join("|");
    const n = seen.get(identity) ?? 0;
    seen.set(identity, n + 1);
    const id = `qb_${createHash("sha1").update(`${identity}#${n}`).digest("hex").slice(0, 24)}`;

    const data: Record<string, unknown> = {
      date: e.date,
      vendor: e.name,
      amount: cents / 100,
      type: category.type,
      categoryId: category.id,
      notes: [`QB: ${e.account}`, e.txnType, e.num && `#${e.num}`].filter(Boolean).join(" · "),
      source: "qb",
      createdBy: "system",
      createdAt: now,
      updatedBy: "system",
      updatedAt: now,
    };
    if (e.memo) data.description = e.memo;
    if (category.type === "income" && e.name) data.donorName = e.name;
    docs.push({ id, data });

    const key = `${e.date.slice(0, 4)} · ${category.type === "income" ? "+" : "−"} ${category.name}`;
    totals.set(key, (totals.get(key) ?? 0) + cents);
  }

  console.log(`\n${docs.length} rows map to a category. Totals by year and category:`);
  for (const [key, cents] of [...totals.entries()].sort()) {
    console.log(`  ${key.padEnd(48)} ${usd(cents).padStart(14)}`);
  }

  // Compare with what an earlier run already wrote. A ledger row whose
  // details changed in QuickBooks (memo, name, amount) gets a new ID, so the
  // old copy would linger as a duplicate — list those so they can be removed.
  const existingSnap = await adminDb.collection(TRANSACTIONS).where("source", "==", "qb").get();
  const existingIds = new Set(existingSnap.docs.map((d) => d.id));
  const incomingIds = new Set(docs.map((d) => d.id));
  const newRows = docs.filter((d) => !existingIds.has(d.id));

  // The same money entered some other way — by hand, or from a bank or Zeffy
  // import — under a different id. Held back unless asked for.
  const includeLikely = flags.includes("--include-likely-duplicates");
  const likely: { doc: Doc; reason: string; match: string }[] = [];
  const definite: Doc[] = [];
  if (newRows.length > 0) {
    const index = await loadDedupeIndex(
      newRows.map((d) => String(d.data.date)),
      { excludeSource: "qb" },
    );
    const claimed = new Set<string>();
    for (const d of newRows) {
      const m = findLikelyDuplicate(toIncomingTransaction(d.data), index, { claimed });
      if (!m) {
        definite.push(d);
        continue;
      }
      likely.push({
        doc: d,
        reason: m.reason,
        match: `${m.existing.date} ${m.existing.vendor || m.existing.description || ""} (${m.existing.source})`,
      });
    }
  }
  const added = includeLikely ? [...definite, ...likely.map((l) => l.doc)] : definite;
  const stale = existingSnap.docs.filter((d) => !incomingIds.has(d.id));

  console.log(
    `\nCompared with the database: ${docs.length - newRows.length} already imported, ${definite.length} new, ${likely.length} likely duplicates${includeLikely ? " (included)" : " (held back)"}, ${stale.length} no longer in this ledger.`,
  );
  for (const d of definite) {
    const x = d.data;
    console.log(`  + ${x.date}  ${String(x.vendor || x.description || "").slice(0, 36).padEnd(36)} ${usd(Math.round(Number(x.amount) * 100)).padStart(12)}`);
  }
  if (likely.length > 0) {
    console.log(
      `\n${likely.length} look like transactions already entered another way — ${includeLikely ? "INCLUDED (--include-likely-duplicates)" : "held back; add --include-likely-duplicates to import them"}:`,
    );
    for (const l of likely) {
      const x = l.doc.data;
      console.log(`  ? ${x.date}  ${String(x.vendor || x.description || "").slice(0, 36).padEnd(36)} ${usd(Math.round(Number(x.amount) * 100)).padStart(12)}  ~ ${l.match} — ${l.reason}`);
    }
  }
  for (const d of stale) {
    const x = d.data();
    console.log(`  − ${x.date}  ${String(x.vendor || x.description || "").slice(0, 36).padEnd(36)} ${usd(Math.round(Number(x.amount) * 100)).padStart(12)}  (would be removed)`);
  }

  if (!commit) {
    console.log("\nDry run — nothing written. Re-run with --commit once the totals match QuickBooks' P&L.");
    return;
  }

  // Only add rows that aren't there yet, so edits made in the Roster since
  // the last run (a custom split, a fixed vendor name) aren't overwritten.
  for (let i = 0; i < added.length; i += 400) {
    const batch = adminDb.batch();
    for (const d of added.slice(i, i + 400)) {
      batch.set(adminDb.collection(TRANSACTIONS).doc(d.id), d.data);
    }
    await batch.commit();
  }
  for (let i = 0; i < stale.length; i += 400) {
    const batch = adminDb.batch();
    for (const d of stale.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
  console.log(`\nAdded ${added.length} transactions, removed ${stale.length} that are no longer in the ledger.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
