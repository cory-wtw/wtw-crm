import { z } from "zod";

/**
 * Single-entry bookkeeping for WTW. A transaction is money in or money out,
 * tagged with a category. No ledgers, no journal entries, no balance sheet —
 * the 990-N needs one number (gross receipts) and the 990-EZ, if we ever get
 * there, needs a P&L and a functional split. That's all this models.
 */

/** Firestore collection names. Here rather than lib/db so scripts can use them. */
export const TRANSACTIONS_COLLECTION = "transactions";
export const CATEGORIES_COLLECTION = "transactionCategories";
export const RECORDS_COLLECTION = "financeRecords";
export const VENDOR_ALIASES_COLLECTION = "vendorAliases";
export const VENDOR_MONTHLY_COLLECTION = "vendorMonthly";

export const TRANSACTION_TYPES = ["income", "expense"] as const;
export const transactionTypeSchema = z.enum(TRANSACTION_TYPES);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: "Income",
  expense: "Expense",
};

/** Where a row came from. Drives nothing but the badge and the audit trail. */
export const TRANSACTION_SOURCES = ["manual", "bank_csv", "zeffy", "qb"] as const;
export const transactionSourceSchema = z.enum(TRANSACTION_SOURCES);
export type TransactionSource = z.infer<typeof transactionSourceSchema>;

export const TRANSACTION_SOURCE_LABELS: Record<TransactionSource, string> = {
  manual: "Manual",
  bank_csv: "Bank CSV",
  zeffy: "Zeffy",
  qb: "QuickBooks",
};

/** YYYY-MM-DD. Stored as a string so date-range filters never hit a timezone. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    // Round-trip check: Date happily rolls Feb 30 over to Mar 2.
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Not a real date");

const pct = z.number().min(0).max(100);

export const allocationSchema = z
  .object({ programPct: pct, mgmtPct: pct, fundraisingPct: pct })
  .refine(
    (a) => Math.abs(a.programPct + a.mgmtPct + a.fundraisingPct - 100) < 0.01,
    "Program, management and fundraising must add up to 100%",
  );
export type Allocation = z.infer<typeof allocationSchema>;

export const transactionInputSchema = z.object({
  date: isoDateSchema,
  vendor: z.string().trim().max(200).default(""),
  description: z.string().trim().max(500).optional(),
  // Signed: a negative amount is a refund or reversal within its type.
  amount: z
    .number()
    .finite()
    .refine((n) => n !== 0, "Amount can't be zero"),
  type: transactionTypeSchema,
  categoryId: z.string().min(1, "Pick a category"),
  // Absent = inherit the category's default split. Only meaningful for
  // expenses; income is never functionally allocated.
  allocation: allocationSchema.optional(),
  donorName: z.string().trim().max(200).optional(),
  campaign: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type TransactionInput = z.infer<typeof transactionInputSchema>;

export type Transaction = TransactionInput & {
  id: string;
  source: TransactionSource;
  createdBy: string;
  createdAt: Date;
  updatedBy: string;
  updatedAt: Date;
};

export const categoryInputSchema = z
  .object({
    name: z.string().trim().min(1, "Required").max(100),
    type: transactionTypeSchema,
    defaultProgramPct: pct,
    defaultMgmtPct: pct,
    defaultFundraisingPct: pct,
  })
  .refine(
    (c) =>
      Math.abs(
        c.defaultProgramPct + c.defaultMgmtPct + c.defaultFundraisingPct - 100,
      ) < 0.01,
    {
      message: "Program, management and fundraising must add up to 100%",
      path: ["defaultProgramPct"],
    },
  );
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export type Category = CategoryInput & { id: string };

/**
 * Starting categories, loosely following the 990-EZ Part I lines so the
 * year-end numbers drop straight onto the form if we ever outgrow the 990-N.
 */
export const DEFAULT_CATEGORIES: CategoryInput[] = [
  { name: "Individual donations", type: "income", defaultProgramPct: 100, defaultMgmtPct: 0, defaultFundraisingPct: 0 },
  { name: "Recurring donations", type: "income", defaultProgramPct: 100, defaultMgmtPct: 0, defaultFundraisingPct: 0 },
  { name: "Grants", type: "income", defaultProgramPct: 100, defaultMgmtPct: 0, defaultFundraisingPct: 0 },
  { name: "Event revenue", type: "income", defaultProgramPct: 100, defaultMgmtPct: 0, defaultFundraisingPct: 0 },
  { name: "Other income", type: "income", defaultProgramPct: 100, defaultMgmtPct: 0, defaultFundraisingPct: 0 },
  { name: "Veteran assistance", type: "expense", defaultProgramPct: 100, defaultMgmtPct: 0, defaultFundraisingPct: 0 },
  { name: "Outreach & events", type: "expense", defaultProgramPct: 80, defaultMgmtPct: 0, defaultFundraisingPct: 20 },
  { name: "Software & subscriptions", type: "expense", defaultProgramPct: 60, defaultMgmtPct: 30, defaultFundraisingPct: 10 },
  { name: "Office & supplies", type: "expense", defaultProgramPct: 50, defaultMgmtPct: 50, defaultFundraisingPct: 0 },
  { name: "Rent", type: "expense", defaultProgramPct: 70, defaultMgmtPct: 30, defaultFundraisingPct: 0 },
  { name: "Travel", type: "expense", defaultProgramPct: 90, defaultMgmtPct: 10, defaultFundraisingPct: 0 },
  { name: "Professional fees", type: "expense", defaultProgramPct: 0, defaultMgmtPct: 100, defaultFundraisingPct: 0 },
  { name: "Insurance", type: "expense", defaultProgramPct: 0, defaultMgmtPct: 100, defaultFundraisingPct: 0 },
  { name: "Bank & payment fees", type: "expense", defaultProgramPct: 0, defaultMgmtPct: 50, defaultFundraisingPct: 50 },
  { name: "Marketing & fundraising", type: "expense", defaultProgramPct: 0, defaultMgmtPct: 0, defaultFundraisingPct: 100 },
  { name: "Other expense", type: "expense", defaultProgramPct: 0, defaultMgmtPct: 100, defaultFundraisingPct: 0 },
];

/**
 * Source documents kept with the books: ledger exports, bank statements,
 * receipts, the filed 990-N confirmation. Stored as-is (any file type) under
 * finance-records/{uid}/ in Storage, readable only through the admin-checked
 * download route — never via a public URL.
 */
export const RECORD_MAX_BYTES = 25 * 1024 * 1024;

export const recordInputSchema = z.object({
  storagePath: z.string().min(1).max(400),
  fileName: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1, "Give it a name").max(200),
  year: z.number().int().min(2000).max(2100),
  notes: z.string().trim().max(1000).optional(),
});
export type RecordInput = z.infer<typeof recordInputSchema>;

export type FinanceRecord = RecordInput & {
  id: string;
  contentType: string;
  sizeBytes: number;
  createdBy: string;
  createdAt: Date;
};
