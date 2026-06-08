"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ORG_CATEGORIES,
  ORG_CATEGORY_LABELS,
  ORG_RELATIONSHIP_STATUSES,
  ORG_RELATIONSHIP_STATUS_LABELS,
} from "@/lib/schemas";
import { createOrgAction, editOrgAction } from "./actions";

const formSchema = z.object({
  name: z.string().min(1, "Required"),
  category: z.enum(ORG_CATEGORIES),
  website: z.string().optional(),
  primaryContactName: z.string().optional(),
  primaryContactRole: z.string().optional(),
  primaryContactEmail: z.string().optional(),
  primaryContactPhone: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  relationshipStatus: z.enum(ORG_RELATIONSHIP_STATUSES),
  assigneeUid: z.string().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

export type OrgFormInitial = {
  id: string;
  values: Partial<FormValues>;
};

export type AssigneeOption = { uid: string; label: string };

type Props = {
  initial?: OrgFormInitial | null;
  assignees: AssigneeOption[];
};

export function OrgForm({ initial, assignees }: Props) {
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
      name: "",
      category: "other",
      website: "",
      primaryContactName: "",
      primaryContactRole: "",
      primaryContactEmail: "",
      primaryContactPhone: "",
      city: "",
      state: "",
      relationshipStatus: "prospect",
      assigneeUid: "",
      notes: "",
      ...initial?.values,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const input = {
      name: values.name,
      category: values.category,
      website: values.website || undefined,
      primaryContactName: values.primaryContactName || undefined,
      primaryContactRole: values.primaryContactRole || undefined,
      primaryContactEmail: values.primaryContactEmail || undefined,
      primaryContactPhone: values.primaryContactPhone || undefined,
      city: values.city || undefined,
      state: values.state || undefined,
      relationshipStatus: values.relationshipStatus,
      assigneeUid: values.assigneeUid || null,
      notes: values.notes || undefined,
    };
    const result = initial
      ? await editOrgAction(initial.id, input)
      : await createOrgAction(input);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    startTransition(() => {
      router.push(`/orgs/${result.id}`);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <Section title="Identity">
        <Field label="Name" required error={errors.name?.message}>
          <Input {...register("name")} autoFocus />
        </Field>
        <Field label="Category">
          <Select {...register("category")}>
            {ORG_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ORG_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Website">
          <Input {...register("website")} placeholder="https://" />
        </Field>
      </Section>

      <Section title="Primary contact">
        <Field label="Name">
          <Input {...register("primaryContactName")} />
        </Field>
        <Field label="Role / title">
          <Input
            {...register("primaryContactRole")}
            placeholder="e.g. Program Officer"
          />
        </Field>
        <Field label="Email">
          <Input type="email" {...register("primaryContactEmail")} />
        </Field>
        <Field label="Phone">
          <Input {...register("primaryContactPhone")} />
        </Field>
      </Section>

      <Section title="Location">
        <Field label="City">
          <Input {...register("city")} />
        </Field>
        <Field label="State">
          <Input {...register("state")} />
        </Field>
      </Section>

      <Section title="Relationship">
        <Field label="Status">
          <Select {...register("relationshipStatus")}>
            {ORG_RELATIONSHIP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORG_RELATIONSHIP_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Assignee"
          hint={
            assignees.length === 0
              ? "Nobody to assign yet — invite teammates first."
              : "Who owns the relationship."
          }
        >
          <Select {...register("assigneeUid")}>
            <option value="">Unassigned</option>
            {assignees.map((a) => (
              <option key={a.uid} value={a.uid}>
                {a.label}
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
            placeholder="Background, history, what they care about."
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
              : "Save organization"}
        </button>
        <button
          type="button"
          onClick={() =>
            router.push(initial ? `/orgs/${initial.id}` : "/orgs")
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
