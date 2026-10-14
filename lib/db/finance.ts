import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import {
  CATEGORIES_COLLECTION as CATEGORIES,
  RECORDS_COLLECTION as RECORDS,
  VENDOR_ALIASES_COLLECTION as VENDOR_ALIASES,
  VENDOR_MONTHLY_COLLECTION as VENDOR_MONTHLY,
  type FinanceRecord,
  TRANSACTIONS_COLLECTION as TRANSACTIONS,
  type Allocation,
  type Category,
  type Transaction,
  type TransactionSource,
} from "@/lib/schemas";

export { CATEGORIES, RECORDS, TRANSACTIONS, VENDOR_ALIASES, VENDOR_MONTHLY };

function deserializeTransaction(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Transaction {
  const allocation: Allocation | undefined =
    data.allocation &&
    typeof data.allocation.programPct === "number"
      ? {
          programPct: data.allocation.programPct,
          mgmtPct: data.allocation.mgmtPct,
          fundraisingPct: data.allocation.fundraisingPct,
        }
      : undefined;
  return {
    id,
    date: data.date ?? "",
    vendor: data.vendor ?? "",
    description: data.description ?? undefined,
    amount: typeof data.amount === "number" ? data.amount : 0,
    type: data.type === "income" ? "income" : "expense",
    categoryId: data.categoryId ?? "",
    allocation,
    donorName: data.donorName ?? undefined,
    campaign: data.campaign ?? undefined,
    notes: data.notes ?? undefined,
    source: (data.source as TransactionSource) ?? "manual",
    createdBy: data.createdBy ?? "",
    createdAt: data.createdAt?.toDate?.() ?? data.createdAt ?? new Date(),
    updatedBy: data.updatedBy ?? "",
    updatedAt: data.updatedAt?.toDate?.() ?? data.updatedAt ?? new Date(),
  };
}

/**
 * Every transaction, newest first. WTW books a few hundred rows a year, so
 * the reports filter in memory rather than maintaining composite indexes.
 */
export async function listTransactions(): Promise<Transaction[]> {
  const snap = await adminDb
    .collection(TRANSACTIONS)
    .orderBy("date", "desc")
    .get();
  return snap.docs.map((d) => deserializeTransaction(d.id, d.data()));
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  const doc = await adminDb.collection(TRANSACTIONS).doc(id).get();
  if (!doc.exists) return null;
  return deserializeTransaction(doc.id, doc.data()!);
}

/**
 * Distinct vendors and campaigns, most recently used first, for the form's
 * autocomplete. Projects just those fields rather than whole documents.
 */
export async function listFormOptions(): Promise<{
  vendors: string[];
  campaigns: string[];
}> {
  const snap = await adminDb
    .collection(TRANSACTIONS)
    .orderBy("date", "desc")
    .select("vendor", "campaign")
    .get();
  const vendors = new Set<string>();
  const campaigns = new Set<string>();
  for (const d of snap.docs) {
    const { vendor, campaign } = d.data();
    if (vendor) vendors.add(vendor);
    if (campaign) campaigns.add(campaign);
  }
  return { vendors: [...vendors], campaigns: [...campaigns] };
}

export async function listCategories(): Promise<Category[]> {
  const snap = await adminDb.collection(CATEGORIES).orderBy("name", "asc").get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name ?? "",
      type: data.type === "income" ? "income" : "expense",
      defaultProgramPct: data.defaultProgramPct ?? 0,
      defaultMgmtPct: data.defaultMgmtPct ?? 100,
      defaultFundraisingPct: data.defaultFundraisingPct ?? 0,
    };
  });
}

function deserializeRecord(id: string, data: FirebaseFirestore.DocumentData): FinanceRecord {
  return {
    id,
    storagePath: data.storagePath ?? "",
    fileName: data.fileName ?? "",
    label: data.label ?? data.fileName ?? "",
    year: typeof data.year === "number" ? data.year : 0,
    notes: data.notes ?? undefined,
    contentType: data.contentType ?? "application/octet-stream",
    sizeBytes: typeof data.sizeBytes === "number" ? data.sizeBytes : 0,
    createdBy: data.createdBy ?? "",
    createdAt: data.createdAt?.toDate?.() ?? data.createdAt ?? new Date(),
  };
}

/** Newest year first, then newest upload first. */
export async function listRecords(): Promise<FinanceRecord[]> {
  const snap = await adminDb.collection(RECORDS).get();
  return snap.docs
    .map((d) => deserializeRecord(d.id, d.data()))
    .sort((a, b) => b.year - a.year || b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getRecord(id: string): Promise<FinanceRecord | null> {
  const doc = await adminDb.collection(RECORDS).doc(id).get();
  return doc.exists ? deserializeRecord(doc.id, doc.data()!) : null;
}

/** Vendor merges/renames from the Spending tab: raw vendor key → display name. */
export async function listVendorAliases(): Promise<Record<string, string>> {
  const snap = await adminDb.collection(VENDOR_ALIASES).get();
  return Object.fromEntries(
    snap.docs
      .map((d) => [d.data().key as string, d.data().name as string] as const)
      .filter(([k, v]) => k && v),
  );
}

/** Monthly amounts an admin set on the Spending tab: lower-cased vendor name → dollars. */
export async function listVendorMonthly(): Promise<Record<string, number>> {
  const snap = await adminDb.collection(VENDOR_MONTHLY).get();
  return Object.fromEntries(
    snap.docs
      .map((d) => [String(d.data().name ?? "").toLowerCase(), Number(d.data().monthly)] as const)
      .filter(([k, v]) => k && Number.isFinite(v)),
  );
}
