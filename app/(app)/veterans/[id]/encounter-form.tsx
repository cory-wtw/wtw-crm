"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { mentionsMedicalTerm } from "@/lib/medical-terms";
import { localTodayIso as todayIso } from "@/lib/utils";
import { addEncounterAction } from "../actions";

const formSchema = z.object({
  occurredAt: z.string().min(1, "Required"),
  location: z.string().optional(),
  summary: z.string().min(1, "Required"),
  nextStep: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

export function EncounterForm({ veteranId }: { veteranId: string }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const today = todayIso();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      occurredAt: today,
      location: "",
      summary: "",
      nextStep: "",
    },
  });

  const summary = useWatch({ control, name: "summary" });
  const summaryLooksMedical = mentionsMedicalTerm(summary);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const occurred = new Date(values.occurredAt);
    if (Number.isNaN(occurred.getTime())) {
      setError("Please enter a valid date.");
      return;
    }
    const input = {
      occurredAt: occurred,
      location: values.location || undefined,
      summary: values.summary,
      nextStep: values.nextStep || undefined,
    };

    const result = await addEncounterAction(veteranId, input);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    reset({
      occurredAt: todayIso(),
      location: "",
      summary: "",
      nextStep: "",
    });
    setExpanded(false);
    startTransition(() => router.refresh());
  });

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary"
      >
        Log contact
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-border bg-background p-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Date" required error={errors.occurredAt?.message}>
          <Input type="date" {...register("occurredAt")} />
        </Field>
        <Field label="Location">
          <Input
            {...register("location")}
            placeholder="e.g. Riverbend Shelter"
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
        {summaryLooksMedical && (
          <p className="text-xs text-[color:var(--wtw-deep-gold)]">
            Looks like this mentions a condition or treatment. Keep notes to
            needs and next steps.
          </p>
        )}
      </Field>
      <Field label="Next step">
        <Input
          {...register("nextStep")}
          placeholder="What needs to happen next?"
        />
      </Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting || isPending}
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
        >
          {isSubmitting || isPending ? "Saving…" : "Save"}
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

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-bold">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}
