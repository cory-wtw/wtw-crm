"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/schemas";
import { addOrgEncounterAction } from "../actions";

const formSchema = z.object({
  occurredAt: z.string().min(1, "Required"),
  location: z.string().optional(),
  summary: z.string().min(1, "Required"),
  nextStep: z.string().optional(),
  nextStepDueAt: z.string().optional(),
  amount: z.string().optional(),
  transactionType: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

export function OrgEncounterForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const today = todayIso();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      occurredAt: today,
      location: "",
      summary: "",
      nextStep: "",
      nextStepDueAt: "",
      amount: "",
      transactionType: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const occurred = new Date(values.occurredAt);
    if (Number.isNaN(occurred.getTime())) {
      setError("Invalid occurred-at date.");
      return;
    }
    const due = values.nextStepDueAt
      ? new Date(values.nextStepDueAt)
      : null;
    if (due && Number.isNaN(due.getTime())) {
      setError("Invalid next-step due date.");
      return;
    }

    let amount: number | undefined;
    if (values.amount && values.amount.trim()) {
      const parsed = Number(values.amount);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError("Amount must be a non-negative number.");
        return;
      }
      amount = parsed;
    }

    const input = {
      occurredAt: occurred,
      location: values.location || undefined,
      summary: values.summary,
      nextStep: values.nextStep || undefined,
      nextStepDueAt: due,
      amount,
      transactionType:
        values.transactionType && values.transactionType.length
          ? values.transactionType
          : undefined,
    };

    const result = await addOrgEncounterAction(orgId, input);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    reset({
      occurredAt: todayIso(),
      location: "",
      summary: "",
      nextStep: "",
      nextStepDueAt: "",
      amount: "",
      transactionType: "",
    });
    setExpanded(false);
    startTransition(() => router.refresh());
  });

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary"
      >
        Log encounter
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-border bg-background p-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Occurred at" required error={errors.occurredAt?.message}>
          <Input type="date" {...register("occurredAt")} />
        </Field>
        <Field label="Location">
          <Input
            {...register("location")}
            placeholder="e.g. their offices, phone, Zoom"
          />
        </Field>
      </div>
      <Field label="Summary" required error={errors.summary?.message}>
        <textarea
          {...register("summary")}
          rows={3}
          placeholder="What happened?"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Next step">
          <Input
            {...register("nextStep")}
            placeholder="What's the follow-up?"
          />
        </Field>
        <Field label="Next step due">
          <Input type="date" {...register("nextStepDueAt")} />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Amount" hint="Optional. USD. Leave blank if no money.">
          <Input
            type="number"
            step="0.01"
            {...register("amount")}
            placeholder="0.00"
          />
        </Field>
        <Field label="Transaction type">
          <Select {...register("transactionType")}>
            <option value="">—</option>
            {TRANSACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {TRANSACTION_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting || isPending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
        >
          {isSubmitting || isPending ? "Saving…" : "Save encounter"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-bold">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const inputClasses =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClasses} />;
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputClasses} />;
}
