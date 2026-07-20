"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createResourceAction, editResourceAction } from "./actions";

const formSchema = z.object({
  organizationName: z.string().min(1, "Required"),
  website: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional(),
  description: z.string().optional(),
  eligibility: z.string().optional(),
  services: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

export type ResourceFormInitial = {
  id: string;
  values: Partial<FormValues>;
};

type Props = {
  initial?: ResourceFormInitial | null;
};

export function ResourceForm({ initial }: Props) {
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
      organizationName: "",
      website: "",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      description: "",
      eligibility: "",
      services: "",
      ...initial?.values,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const input = {
      organizationName: values.organizationName,
      website: values.website || undefined,
      contactName: values.contactName || undefined,
      contactPhone: values.contactPhone || undefined,
      contactEmail: values.contactEmail || undefined,
      description: values.description || undefined,
      eligibility: values.eligibility || undefined,
      services: values.services || undefined,
    };
    const result = initial
      ? await editResourceAction(initial.id, input)
      : await createResourceAction(input);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    startTransition(() => {
      router.push(`/resources/${result.id}`);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <Section title="Organization">
        <Field
          label="Organization name"
          required
          error={errors.organizationName?.message}
        >
          <Input {...register("organizationName")} autoFocus />
        </Field>
        <Field label="Website" hint="e.g. https://example.org">
          <Input {...register("website")} />
        </Field>
      </Section>

      <Section title="Contact">
        <Field label="Contact name">
          <Input {...register("contactName")} />
        </Field>
        <Field label="Phone">
          <Input {...register("contactPhone")} />
        </Field>
        <Field label="Email" error={errors.contactEmail?.message}>
          <Input type="email" {...register("contactEmail")} />
        </Field>
      </Section>

      <Section title="Details">
        <Field
          label="Primary service(s) offered"
          hint="What this org actually provides — e.g. 'rent assistance, utility help, food pantry'."
          full
        >
          <Textarea
            {...register("services")}
            rows={3}
            placeholder="Rent assistance, utility bill help, emergency food…"
          />
        </Field>
        <Field
          label="Description of organization"
          hint="A short summary of who they are and what they do."
          full
        >
          <Textarea
            {...register("description")}
            rows={4}
            placeholder="What the organization is and who it serves."
          />
        </Field>
        <Field
          label="Eligibility requirements"
          hint="Who qualifies — income limits, residency, veteran status, etc."
          full
        >
          <Textarea
            {...register("eligibility")}
            rows={3}
            placeholder="Any requirements a person must meet to receive services."
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
              : "Save resource"}
        </button>
        <button
          type="button"
          onClick={() =>
            router.push(initial ? `/resources/${initial.id}` : "/resources")
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
  full,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${full ? "md:col-span-2" : ""}`}>
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

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={inputClasses} />;
}
