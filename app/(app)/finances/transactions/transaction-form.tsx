"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Category, TransactionType } from "@/lib/schemas";
import { deleteTransactionAction, saveTransactionAction } from "../actions";

const formSchema = z
  .object({
    type: z.enum(["income", "expense"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Required"),
    amount: z
      .string()
      .min(1, "Required")
      .refine((s) => Number.isFinite(Number(s)) && Number(s) !== 0, "Enter a non-zero amount"),
    categoryId: z.string().min(1, "Pick a category"),
    vendor: z.string(),
    description: z.string(),
    donorName: z.string(),
    campaign: z.string(),
    notes: z.string(),
    customSplit: z.boolean(),
    programPct: z.string(),
    mgmtPct: z.string(),
    fundraisingPct: z.string(),
  })
  .refine(
    (v) =>
      !v.customSplit ||
      Math.abs(Number(v.programPct) + Number(v.mgmtPct) + Number(v.fundraisingPct) - 100) < 0.01,
    { message: "Must add up to 100%", path: ["programPct"] },
  );
type FormValues = z.infer<typeof formSchema>;

export type TransactionFormInitial = {
  id: string;
  values: Partial<FormValues>;
};

type Props = {
  categories: Category[];
  vendors: string[];
  campaigns: string[];
  today: string;
  initial?: TransactionFormInitial | null;
};

export function TransactionForm({ categories, vendors, campaigns, today, initial }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "expense",
      date: today,
      amount: "",
      categoryId: "",
      vendor: "",
      description: "",
      donorName: "",
      campaign: "",
      notes: "",
      customSplit: false,
      programPct: "",
      mgmtPct: "",
      fundraisingPct: "",
      ...initial?.values,
    },
  });

  const type = useWatch({ control, name: "type" });
  const categoryId = useWatch({ control, name: "categoryId" });
  const customSplit = useWatch({ control, name: "customSplit" });
  const options = categories.filter((c) => c.type === type);
  const category = categories.find((c) => c.id === categoryId);

  function switchType(next: TransactionType) {
    setValue("type", next);
    if (category && category.type !== next) setValue("categoryId", "");
  }

  function toggleSplit(on: boolean) {
    setValue("customSplit", on);
    if (on && category) {
      setValue("programPct", String(category.defaultProgramPct));
      setValue("mgmtPct", String(category.defaultMgmtPct));
      setValue("fundraisingPct", String(category.defaultFundraisingPct));
    }
  }

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    const input = {
      type: v.type,
      date: v.date,
      amount: Number(v.amount),
      categoryId: v.categoryId,
      vendor: v.vendor.trim(),
      description: v.description.trim() || undefined,
      donorName: v.type === "income" ? v.donorName.trim() || undefined : undefined,
      campaign: v.type === "income" ? v.campaign.trim() || undefined : undefined,
      notes: v.notes.trim() || undefined,
      allocation:
        v.type === "expense" && v.customSplit
          ? {
              programPct: Number(v.programPct),
              mgmtPct: Number(v.mgmtPct),
              fundraisingPct: Number(v.fundraisingPct),
            }
          : undefined,
    };
    const result = await saveTransactionAction(initial?.id ?? null, input);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    startTransition(() => {
      router.push("/finances/transactions");
      router.refresh();
    });
  });

  async function onDelete() {
    if (!initial) return;
    if (!window.confirm("Delete this transaction? This can't be undone.")) return;
    setServerError(null);
    setDeleting(true);
    const result = await deleteTransactionAction(initial.id);
    if (!result.ok) {
      setDeleting(false);
      setServerError(result.error);
      return;
    }
    startTransition(() => {
      router.push("/finances/transactions");
      router.refresh();
    });
  }

  const busy = isSubmitting || isPending || deleting;

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <div className="inline-flex rounded-md border border-border bg-card p-1">
        {(["expense", "income"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => switchType(t)}
            className={`h-9 rounded px-4 text-sm font-bold transition-colors ${
              type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "expense" ? "Money out" : "Money in"}
          </button>
        ))}
      </div>

      <Section title="Transaction">
        <Field label="Date" required error={errors.date?.message}>
          <Input type="date" {...register("date")} />
        </Field>
        <Field
          label="Amount"
          required
          error={errors.amount?.message}
          hint="Use a negative number for a refund or reversal."
        >
          <Input type="number" step="0.01" inputMode="decimal" {...register("amount")} />
        </Field>
        <Field label="Category" required error={errors.categoryId?.message}>
          <Select {...register("categoryId")}>
            <option value="">—</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={type === "income" ? "Paid by / source" : "Vendor"}>
          <Input list="vendor-options" {...register("vendor")} />
          <datalist id="vendor-options">
            {vendors.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </Field>
        <Field label="Description" hint="As it appears on the statement, if you have it.">
          <Input {...register("description")} />
        </Field>
      </Section>

      {type === "income" && (
        <Section title="Donation">
          <Field label="Donor name">
            <Input {...register("donorName")} />
          </Field>
          <Field label="Campaign">
            <Input list="campaign-options" {...register("campaign")} />
            <datalist id="campaign-options">
              {campaigns.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </Section>
      )}

      {type === "expense" && (
        <Section title="Functional allocation">
          <div className="space-y-3 md:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={customSplit}
                onChange={(e) => toggleSplit(e.target.checked)}
                className="size-4"
              />
              Override the category default for this one
            </label>
            {!customSplit && (
              <p className="text-xs text-muted-foreground">
                {category
                  ? `Uses ${category.name}'s default: ${category.defaultProgramPct}% program · ${category.defaultMgmtPct}% management · ${category.defaultFundraisingPct}% fundraising.`
                  : "Uses the category's default split."}
              </p>
            )}
            {customSplit && (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Program %" error={errors.programPct?.message}>
                  <Input type="number" step="0.1" min="0" max="100" {...register("programPct")} />
                </Field>
                <Field label="Management %">
                  <Input type="number" step="0.1" min="0" max="100" {...register("mgmtPct")} />
                </Field>
                <Field label="Fundraising %">
                  <Input type="number" step="0.1" min="0" max="100" {...register("fundraisingPct")} />
                </Field>
              </div>
            )}
          </div>
        </Section>
      )}

      <Section title="Notes">
        <div className="md:col-span-2">
          <textarea
            {...register("notes")}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </Section>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <div className="flex items-center gap-3 border-t border-border pt-6">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : initial ? "Save changes" : "Save transaction"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/finances/transactions")}
          className="text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        {initial && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="ml-auto inline-flex h-11 items-center justify-center rounded-md border border-destructive/40 bg-card px-3 text-sm font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="border-b border-border pb-2 text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
        {title}
      </h2>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-bold">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const inputClasses =
  "w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClasses} />;
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputClasses} />;
}
