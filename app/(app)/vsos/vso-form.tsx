"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CONTACT_METHODS,
  PARTNERSHIP_STATUSES,
  PARTNERSHIP_STATUS_LABELS,
} from "@/lib/schemas";
import { createVsoAction, editVsoAction } from "./actions";

const formSchema = z.object({
  fullName: z.string().min(1, "Required"),
  affiliation: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  directPhone: z.string().optional(),
  directEmail: z.string().optional(),
  preferredContactMethod: z.string().optional(),
  partnershipStatus: z.enum(PARTNERSHIP_STATUSES),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

export type VsoFormInitial = {
  id: string;
  values: Partial<FormValues>;
};

type Props = {
  initial?: VsoFormInitial | null;
};

const CONTACT_METHOD_LABELS: Record<string, string> = {
  phone: "Phone",
  email: "Email",
  text: "Text",
  in_person: "In person",
};

export function VsoForm({ initial }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      affiliation: "",
      city: "",
      state: "",
      directPhone: "",
      directEmail: "",
      preferredContactMethod: "",
      partnershipStatus: "in_discussion",
      notes: "",
      ...initial?.values,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const input = {
      fullName: values.fullName,
      affiliation: values.affiliation || undefined,
      city: values.city || undefined,
      state: values.state || undefined,
      directPhone: values.directPhone || undefined,
      directEmail: values.directEmail || undefined,
      preferredContactMethod:
        values.preferredContactMethod && values.preferredContactMethod.length
          ? values.preferredContactMethod
          : undefined,
      partnershipStatus: values.partnershipStatus,
      notes: values.notes || undefined,
    };
    const result = initial
      ? await editVsoAction(initial.id, input)
      : await createVsoAction(input);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    startTransition(() => {
      router.push(`/vsos/${result.id}`);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <Section title="Identity">
        <Field label="Full name" required error={errors.fullName?.message}>
          <Input {...register("fullName")} autoFocus />
        </Field>
        <Field
          label="Affiliation"
          hint="Freeform — e.g. 'TN VSO', 'DAV Chapter 12', 'Hamilton County VSO'."
        >
          <Input {...register("affiliation")} />
        </Field>
      </Section>

      <Section title="Contact">
        <Field label="Phone">
          <Input {...register("directPhone")} />
        </Field>
        <Field label="Email" error={errors.directEmail?.message}>
          <Input type="email" {...register("directEmail")} />
        </Field>
        <Field label="City">
          <Input {...register("city")} />
        </Field>
        <Field label="State">
          <Input {...register("state")} />
        </Field>
        <Field label="Preferred contact method">
          <Select {...register("preferredContactMethod")}>
            <option value="">—</option>
            {CONTACT_METHODS.map((m) => (
              <option key={m} value={m}>
                {CONTACT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title="Partnership">
        <Field label="Status">
          <Select {...register("partnershipStatus")}>
            {PARTNERSHIP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PARTNERSHIP_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title="Notes">
        <Field label="">
          <textarea
            {...register("notes")}
            rows={5}
            placeholder="What they're good at, who to ask for, etc."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
      </Section>

      {serverError && (
        <p className="text-sm text-destructive">{serverError}</p>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-6">
        <button
          type="submit"
          disabled={isSubmitting || isPending}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
        >
          {isSubmitting || isPending
            ? "Saving…"
            : initial
              ? "Save changes"
              : "Save VSO"}
        </button>
        <button
          type="button"
          onClick={() =>
            router.push(initial ? `/vsos/${initial.id}` : "/vsos")
          }
          className="text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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
      {label && (
        <label className="block text-sm font-bold">
          {label}
          {required && <span className="text-destructive"> *</span>}
        </label>
      )}
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
