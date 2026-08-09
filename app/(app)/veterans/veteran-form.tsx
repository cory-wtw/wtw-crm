"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  PIPELINE_LABELS,
  PIPELINE_STAGES,
  PREFERRED_CONTACT_LABELS,
  PREFERRED_CONTACT_METHODS,
} from "@/lib/schemas";
import { createVeteranAction, editVeteranAction } from "./actions";

export type AssigneeOption = { uid: string; label: string };
export type VsoOption = { id: string; label: string };
export type PhoneOption = { id: string; label: string };

export type VeteranFormInitial = {
  id: string;
  values: Partial<FormValues>;
};

type Props = {
  initial?: VeteranFormInitial | null;
  /** Whether the current user can choose / change the assignee. Admins can;
   *  Standard users always self-assign and don't see the field. */
  canReassign: boolean;
  assignees: AssigneeOption[];
  vsos: VsoOption[];
  phones: PhoneOption[];
};

// Form values are strings so empty inputs are easy to detect; we coerce
// before sending to the server action.
const formSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastInitial: z.string().max(1, "One letter only").optional(),

  preferredContact: z.enum(PREFERRED_CONTACT_METHODS),
  phone: z.string().optional(),
  email: z.string().optional(),

  birthYear: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),

  assigneeUid: z.string().optional(),
  pipelineStage: z.enum(PIPELINE_STAGES),

  monthlyBenefitBefore: z.string().optional(),
  monthlyBenefitAfter: z.string().optional(),

  vsoIds: z.array(z.string()),
  assignedPhoneId: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

function toNumber(s: string | undefined): number | undefined {
  if (!s || !s.trim()) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function VeteranForm({
  initial,
  canReassign,
  assignees,
  vsos,
  phones,
}: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastInitial: "",
      preferredContact: "phone",
      phone: "",
      email: "",
      birthYear: "",
      city: "",
      state: "",
      assigneeUid: "",
      pipelineStage: "found",
      monthlyBenefitBefore: "",
      monthlyBenefitAfter: "",
      vsoIds: [],
      assignedPhoneId: "",
      ...initial?.values,
    },
  });

  const preferredContact = watch("preferredContact");

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    // Store only the preferred contact channel — the other is left blank so
    // we never keep both a phone and an email on the same record.
    const usePhone = values.preferredContact === "phone";
    const input = {
      firstName: values.firstName,
      lastInitial: (values.lastInitial || "").toUpperCase(),
      preferredContact: values.preferredContact,
      phone: usePhone ? values.phone || undefined : "",
      email: !usePhone ? values.email || undefined : "",
      birthYear: toNumber(values.birthYear),
      city: values.city || undefined,
      state: values.state || undefined,
      assigneeUid: values.assigneeUid || null,
      pipelineStage: values.pipelineStage,
      monthlyBenefitBefore: toNumber(values.monthlyBenefitBefore) ?? 0,
      monthlyBenefitAfter: toNumber(values.monthlyBenefitAfter) ?? 0,
      vsoIds: values.vsoIds,
      assignedPhoneId: values.assignedPhoneId || null,
    };

    const result = initial
      ? await editVeteranAction(initial.id, input)
      : await createVeteranAction(input);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    startTransition(() => {
      router.push(`/veterans/${result.id}`);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-10">
      <Section title="Identity">
        <Field
          label="First name"
          required
          error={errors.firstName?.message}
          input={<Input {...register("firstName")} autoFocus />}
        />
        <Field
          label="Last initial"
          hint="Just the first letter of their last name."
          error={errors.lastInitial?.message}
          input={<Input maxLength={1} {...register("lastInitial")} />}
        />
      </Section>

      <Section title="Contact">
        <Field
          label="Preferred contact method"
          hint="We keep only this one channel on file."
          input={
            <Select {...register("preferredContact")}>
              {PREFERRED_CONTACT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PREFERRED_CONTACT_LABELS[m]}
                </option>
              ))}
            </Select>
          }
        />
        {preferredContact === "phone" ? (
          <Field
            label="Phone"
            error={errors.phone?.message}
            input={<Input type="tel" {...register("phone")} />}
          />
        ) : (
          <Field
            label="Email"
            error={errors.email?.message}
            input={<Input type="email" {...register("email")} />}
          />
        )}
      </Section>

      <Section title="Demographics">
        <Field
          label="Birth year"
          input={<Input type="number" {...register("birthYear")} />}
        />
        <Field label="City" input={<Input {...register("city")} />} />
        <Field label="State" input={<Input {...register("state")} />} />
      </Section>

      <Section title="Pipeline">
        <Field
          label="Stage"
          input={
            <Select {...register("pipelineStage")}>
              {PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {PIPELINE_LABELS[s]}
                </option>
              ))}
            </Select>
          }
        />
        {canReassign ? (
          <Field
            label="Assignee"
            hint={
              assignees.length === 0
                ? "Nobody to assign yet — invite teammates first."
                : "The staff member running point."
            }
            input={
              <Select {...register("assigneeUid")}>
                <option value="">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a.uid} value={a.uid}>
                    {a.label}
                  </option>
                ))}
              </Select>
            }
          />
        ) : (
          <Field
            label="Assignee"
            hint="You'll be assigned automatically. Ask an admin to reassign."
            input={
              <p className="rounded-md border border-input bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
                You
              </p>
            }
          />
        )}
      </Section>

      <Section title="Monthly benefit">
        <Field
          label="Before WTW ($/mo)"
          hint="What they were already receiving before we got involved. Usually 0."
          input={
            <Input
              type="number"
              step="0.01"
              {...register("monthlyBenefitBefore")}
            />
          }
        />
        <Field
          label="After WTW ($/mo)"
          hint="What they receive now that we've connected them."
          input={
            <Input
              type="number"
              step="0.01"
              {...register("monthlyBenefitAfter")}
            />
          }
        />
      </Section>

      <Section title="Links">
        <Field
          label="VSO partners"
          hint={
            vsos.length === 0
              ? "No VSOs in the rolodex yet. Add some on the VSOs page first."
              : "Check all VSOs working with this veteran."
          }
          input={
            <div className="space-y-2 rounded-md border border-input bg-background p-3">
              {vsos.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No VSOs available yet.
                </p>
              ) : (
                vsos.map((v) => (
                  <label
                    key={v.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      value={v.id}
                      {...register("vsoIds")}
                      className="accent-[color:var(--wtw-brand-gold)]"
                    />
                    {v.label}
                  </label>
                ))
              )}
            </div>
          }
        />
        <Field
          label="Assigned Straight Talk phone"
          input={
            <Select {...register("assignedPhoneId")}>
              <option value="">—</option>
              {phones.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          }
        />
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
              : "Save veteran"}
        </button>
        <button
          type="button"
          onClick={() =>
            router.push(initial ? `/veterans/${initial.id}` : "/veterans")
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
  input,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  input: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-bold">
          {label}
          {required && <span className="text-destructive"> *</span>}
        </label>
      )}
      {input}
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
