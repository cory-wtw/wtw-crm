"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  BRANCH_LABELS,
  BRANCHES,
  DEPENDENT_STATUS_LABELS,
  DEPENDENT_STATUSES,
  DISCHARGE_STATUS_LABELS,
  DISCHARGE_STATUSES,
  HOUSING_STATUS_LABELS,
  HOUSING_STATUSES,
  PIPELINE_LABELS,
  PIPELINE_STAGES,
} from "@/lib/schemas";
import { createVeteranAction, editVeteranAction } from "./actions";

export type AssigneeOption = { uid: string; label: string };
export type RateOption = { code: string; label: string };
export type VsoOption = { id: string; label: string };
export type PhoneOption = { id: string; label: string };

export type VeteranFormInitial = {
  id: string;
  values: Partial<FormValues>;
};

type Props = {
  initial?: VeteranFormInitial | null;
  assignees: AssigneeOption[];
  rates: RateOption[];
  vsos: VsoOption[];
  phones: PhoneOption[];
};

// Form values are strings so empty inputs are easy to detect; we coerce
// before sending to the server action.
const formSchema = z.object({
  name: z.string().min(1, "Required"),
  preferredName: z.string().optional(),
  phone: z.string().optional(),

  birthYear: z.string().optional(),
  yearlyIncome: z.string().optional(),
  householdSize: z.string().optional(),
  dependentStatus: z.string().optional(),

  branch: z.string().optional(),
  dischargeStatus: z.string().optional(),
  serviceFrom: z.string().optional(),
  serviceTo: z.string().optional(),
  housingStatus: z.string().optional(),

  assigneeUid: z.string().optional(),
  pipelineStage: z.enum(PIPELINE_STAGES),

  lifeExpectancyAtFound: z.string().optional(),
  ageAtFound: z.string().optional(),

  anticipatedRateCode: z.string().optional(),
  actualRateCode: z.string().optional(),

  vsoIds: z.array(z.string()),
  assignedPhoneId: z.string().optional(),

  notes: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

function toNumber(s: string | undefined): number | undefined {
  if (!s || !s.trim()) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function VeteranForm({
  initial,
  assignees,
  rates,
  vsos,
  phones,
}: Props) {
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
      preferredName: "",
      phone: "",
      birthYear: "",
      yearlyIncome: "",
      householdSize: "",
      dependentStatus: "",
      branch: "",
      dischargeStatus: "",
      serviceFrom: "",
      serviceTo: "",
      housingStatus: "",
      assigneeUid: "",
      pipelineStage: "found",
      lifeExpectancyAtFound: "",
      ageAtFound: "",
      anticipatedRateCode: "",
      actualRateCode: "",
      vsoIds: [],
      assignedPhoneId: "",
      notes: "",
      ...initial?.values,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const input = {
      name: values.name,
      preferredName: values.preferredName || undefined,
      phone: values.phone || undefined,
      birthYear: toNumber(values.birthYear),
      yearlyIncome: toNumber(values.yearlyIncome),
      householdSize: toNumber(values.householdSize),
      dependentStatus:
        values.dependentStatus && values.dependentStatus.length
          ? values.dependentStatus
          : undefined,
      branch:
        values.branch && values.branch.length ? values.branch : undefined,
      dischargeStatus:
        values.dischargeStatus && values.dischargeStatus.length
          ? values.dischargeStatus
          : undefined,
      serviceFrom: values.serviceFrom || undefined,
      serviceTo: values.serviceTo || undefined,
      housingStatus:
        values.housingStatus && values.housingStatus.length
          ? values.housingStatus
          : undefined,
      assigneeUid: values.assigneeUid || null,
      pipelineStage: values.pipelineStage,
      lifeExpectancyAtFound: toNumber(values.lifeExpectancyAtFound),
      ageAtFound: toNumber(values.ageAtFound),
      anticipatedRateCode: values.anticipatedRateCode || null,
      actualRateCode: values.actualRateCode || null,
      vsoIds: values.vsoIds,
      assignedPhoneId: values.assignedPhoneId || null,
      notes: values.notes || undefined,
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
          label="Name"
          required
          error={errors.name?.message}
          input={<Input {...register("name")} autoFocus />}
        />
        <Field
          label="Preferred name"
          hint="What they actually go by, if different."
          input={<Input {...register("preferredName")} />}
        />
        <Field label="Phone" input={<Input {...register("phone")} />} />
      </Section>

      <Section title="Demographics">
        <Field
          label="Birth year"
          input={<Input type="number" {...register("birthYear")} />}
        />
        <Field
          label="Yearly income"
          hint="Used for benefit projection."
          input={
            <Input
              type="number"
              step="0.01"
              {...register("yearlyIncome")}
            />
          }
        />
        <Field
          label="Household size"
          input={<Input type="number" {...register("householdSize")} />}
        />
        <Field
          label="Dependent status"
          input={
            <Select {...register("dependentStatus")}>
              <option value="">—</option>
              {DEPENDENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {DEPENDENT_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          }
        />
      </Section>

      <Section title="Service">
        <Field
          label="Branch"
          input={
            <Select {...register("branch")}>
              <option value="">—</option>
              {BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {BRANCH_LABELS[b]}
                </option>
              ))}
            </Select>
          }
        />
        <Field
          label="Discharge status"
          input={
            <Select {...register("dischargeStatus")}>
              <option value="">—</option>
              {DISCHARGE_STATUSES.map((d) => (
                <option key={d} value={d}>
                  {DISCHARGE_STATUS_LABELS[d]}
                </option>
              ))}
            </Select>
          }
        />
        <Field
          label="Service from"
          input={<Input type="date" {...register("serviceFrom")} />}
        />
        <Field
          label="Service to"
          input={<Input type="date" {...register("serviceTo")} />}
        />
        <Field
          label="Housing status"
          input={
            <Select {...register("housingStatus")}>
              <option value="">—</option>
              {HOUSING_STATUSES.map((h) => (
                <option key={h} value={h}>
                  {HOUSING_STATUS_LABELS[h]}
                </option>
              ))}
            </Select>
          }
        />
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
      </Section>

      <Section title="Win math">
        <Field
          label="Life expectancy at found"
          hint="Expected remaining years from the moment they were found. Drives lifetime benefit."
          input={
            <Input
              type="number"
              {...register("lifeExpectancyAtFound")}
            />
          }
        />
        <Field
          label="Age at found"
          input={<Input type="number" {...register("ageAtFound")} />}
        />
      </Section>

      <Section title="Benefits">
        <Field
          label="Anticipated rate code"
          hint="What rating we expect them to receive."
          input={
            <Select {...register("anticipatedRateCode")}>
              <option value="">—</option>
              {rates.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </Select>
          }
        />
        <Field
          label="Actual rate code"
          hint="What the VA actually awarded. Fill in after Won."
          input={
            <Select {...register("actualRateCode")}>
              <option value="">—</option>
              {rates.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </Select>
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

      <Section title="Notes">
        <Field
          label=""
          input={
            <textarea
              {...register("notes")}
              rows={5}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
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
