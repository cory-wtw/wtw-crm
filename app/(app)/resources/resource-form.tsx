"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ACCESS_METHOD_LABELS,
  ACCESS_METHODS,
  BUCKET_CODES,
  BUCKET_LABELS,
  FRAGILITIES,
  FRAGILITY_LABELS,
  GEO_SCOPE_LABELS,
  GEO_SCOPES,
  MIN_DISCHARGE_LABELS,
  MIN_DISCHARGES,
  SERVICE_ERA_LABELS,
  SERVICE_ERAS,
  TYPICAL_WAIT_LABELS,
  TYPICAL_WAITS,
  VERIFICATION_STATUS_LABELS,
  VERIFICATION_STATUSES,
} from "@/lib/schemas";
import { createResourceAction, editResourceAction } from "./actions";

// Text inputs are strings so empty values are easy to detect and are coerced
// at submit, per the existing *-form.tsx convention. Checkbox groups and
// single checkboxes come off the DOM as string[] / boolean already, so they
// are typed as what they are.
const formSchema = z.object({
  organizationName: z.string().min(1, "Required"),
  parentOrg: z.string().optional(),
  website: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional(),
  description: z.string().optional(),
  eligibility: z.string().optional(),
  eligibilityNotes: z.string().optional(),
  services: z.string().optional(),

  buckets: z.array(z.string()),

  geoScope: z.enum(GEO_SCOPES),
  geoStates: z.string().optional(),
  geoLocalities: z.string().optional(),

  minDischarge: z.enum(MIN_DISCHARGES),
  requiresVaEnrollment: z.boolean(),
  requiresValidId: z.boolean(),
  eraRestriction: z.array(z.string()),
  requiresDependents: z.boolean(),
  crisisCapable: z.boolean(),

  accessMethod: z.enum(ACCESS_METHODS),
  accessValue: z.string().optional(),
  whatToBring: z.string().optional(),
  typicalWait: z.enum(TYPICAL_WAITS),

  verificationStatus: z.enum(VERIFICATION_STATUSES),
  fragility: z.enum(FRAGILITIES),
  sourceName: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

export type ResourceFormInitial = {
  id: string;
  values: Partial<FormValues>;
};

type Props = {
  initial?: ResourceFormInitial | null;
};

/** "TN, GA , al" -> ["TN", "GA", "AL"] */
function splitList(value: string | undefined, upper = false): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (upper ? part.toUpperCase() : part));
}

const ACCESS_VALUE_LABEL: Record<FormValues["accessMethod"], string> = {
  phone: "Phone number to call",
  web: "Application URL",
  walkin: "Address to walk into",
  referral: "Who has to refer them",
};

export function ResourceForm({ initial }: Props) {
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
      organizationName: "",
      parentOrg: "",
      website: "",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      description: "",
      eligibility: "",
      eligibilityNotes: "",
      services: "",
      buckets: [],
      geoScope: "national",
      geoStates: "",
      geoLocalities: "",
      minDischarge: "any",
      requiresVaEnrollment: false,
      requiresValidId: false,
      eraRestriction: [],
      requiresDependents: false,
      crisisCapable: false,
      accessMethod: "phone",
      accessValue: "",
      whatToBring: "",
      typicalWait: "unknown",
      verificationStatus: "live",
      fragility: "stable",
      sourceName: "",
      ...initial?.values,
    },
  });

  const geoScope = watch("geoScope");
  const accessMethod = watch("accessMethod");
  const needsStates = geoScope !== "national";
  const needsLocalities = geoScope === "local";

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const input = {
      organizationName: values.organizationName,
      parentOrg: values.parentOrg || undefined,
      website: values.website || undefined,
      contactName: values.contactName || undefined,
      contactPhone: values.contactPhone || undefined,
      contactEmail: values.contactEmail || undefined,
      description: values.description || undefined,
      eligibility: values.eligibility || undefined,
      eligibilityNotes: values.eligibilityNotes || undefined,
      services: values.services || undefined,

      buckets: values.buckets,

      geoScope: values.geoScope,
      // Scope decides which geography fields mean anything. Clear the ones it
      // doesn't cover so a record switched from local to national doesn't keep
      // a stale locality list that the gate would still read.
      geoStates: needsStates ? splitList(values.geoStates, true) : [],
      geoLocalities: needsLocalities ? splitList(values.geoLocalities) : [],

      minDischarge: values.minDischarge,
      requiresVaEnrollment: values.requiresVaEnrollment,
      requiresValidId: values.requiresValidId,
      eraRestriction: values.eraRestriction,
      requiresDependents: values.requiresDependents,
      crisisCapable: values.crisisCapable,

      accessMethod: values.accessMethod,
      accessValue: values.accessValue || undefined,
      whatToBring: values.whatToBring || undefined,
      typicalWait: values.typicalWait,

      verificationStatus: values.verificationStatus,
      fragility: values.fragility,
      sourceName: values.sourceName || undefined,
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
        <Field
          label="Parent organization"
          hint="The national body or health system this one sits under, if any."
        >
          <Input {...register("parentOrg")} />
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
          hint="Who qualifies — income limits, residency, veteran status, etc. Free text, for a human to read. The gates below are what filtering actually uses."
          full
        >
          <Textarea
            {...register("eligibility")}
            rows={3}
            placeholder="Any requirements a person must meet to receive services."
          />
        </Field>
      </Section>

      <Section title="Needs served">
        <Field
          label="Buckets"
          hint="Check every need this org can actually help with. A resource with no buckets checked will never be suggested for anyone."
          full
        >
          <div className="grid gap-2 rounded-md border border-input bg-background p-3 sm:grid-cols-2">
            {BUCKET_CODES.map((code) => (
              <label key={code} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  value={code}
                  {...register("buckets")}
                  className="accent-[color:var(--wtw-brand-gold)]"
                />
                {BUCKET_LABELS[code]}
              </label>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="Who they'll take">
        <Field
          label="Service area"
          hint="How wide their coverage is."
        >
          <Select {...register("geoScope")}>
            {GEO_SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {GEO_SCOPE_LABELS[scope]}
              </option>
            ))}
          </Select>
        </Field>
        {needsStates ? (
          <Field
            label="States served"
            required
            hint="Two-letter codes, comma separated — e.g. TN, GA, AL. Required once the area is narrower than national."
          >
            <Input {...register("geoStates")} placeholder="TN, GA" />
          </Field>
        ) : (
          <Field label="States served" hint="National — no state list needed.">
            <p className="rounded-md border border-input bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
              Everywhere
            </p>
          </Field>
        )}
        {needsLocalities && (
          <Field
            label="Cities or counties served"
            required
            hint="Comma separated — e.g. Chattanooga, East Ridge. A veteran's city is matched against this list, so name the cities, not just the county."
            full
          >
            <Input
              {...register("geoLocalities")}
              placeholder="Chattanooga, Hamilton County"
            />
          </Field>
        )}

        <Field
          label="Eligibility notes"
          hint="Eligibility the checkboxes can't hold — combat theater service, military sexual trauma, and the like. Shown to staff and included in the referral; it never filters anything."
          full
          error={errors.eligibilityNotes?.message}
        >
          <Textarea {...register("eligibilityNotes")} rows={3} />
        </Field>
        <Field
          label="Minimum discharge accepted"
          hint="Inclusive upward. Vet Centers and most crisis services accept any discharge — check before restricting this."
        >
          <Select {...register("minDischarge")}>
            {MIN_DISCHARGES.map((value) => (
              <option key={value} value={value}>
                {MIN_DISCHARGE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Era restriction"
          hint="Leave all unchecked unless the org genuinely turns away other eras."
        >
          <div className="grid gap-2 rounded-md border border-input bg-background p-3">
            {SERVICE_ERAS.filter((era) => era !== "unsure").map((era) => (
              <label key={era} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  value={era}
                  {...register("eraRestriction")}
                  className="accent-[color:var(--wtw-brand-gold)]"
                />
                {SERVICE_ERA_LABELS[era]}
              </label>
            ))}
          </div>
        </Field>

        <Field
          label="Requirements"
          hint="Only check what the org actually enforces — each one of these hides the resource from veterans who don't meet it."
          full
        >
          <div className="grid gap-2 rounded-md border border-input bg-background p-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...register("requiresVaEnrollment")}
                className="accent-[color:var(--wtw-brand-gold)]"
              />
              Requires VA enrollment
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...register("requiresValidId")}
                className="accent-[color:var(--wtw-brand-gold)]"
              />
              Requires a valid ID
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...register("requiresDependents")}
                className="accent-[color:var(--wtw-brand-gold)]"
              />
              Requires dependents
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...register("crisisCapable")}
                className="accent-[color:var(--wtw-brand-gold)]"
              />
              Same-day / crisis capable
            </label>
          </div>
        </Field>
      </Section>

      <Section title="How to start">
        <Field label="Access method">
          <Select {...register("accessMethod")}>
            {ACCESS_METHODS.map((method) => (
              <option key={method} value={method}>
                {ACCESS_METHOD_LABELS[method]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={ACCESS_VALUE_LABEL[accessMethod]}
          hint="What a veteran does first — this goes in the referral they receive."
        >
          <Input {...register("accessValue")} />
        </Field>
        <Field
          label="What to bring"
          hint="Documents or items they should have with them."
          full
        >
          <Input
            {...register("whatToBring")}
            placeholder="DD-214, photo ID, proof of address"
          />
        </Field>
        <Field label="Typical wait">
          <Select {...register("typicalWait")}>
            {TYPICAL_WAITS.map((wait) => (
              <option key={wait} value={wait}>
                {TYPICAL_WAIT_LABELS[wait]}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title="Verification">
        <Field
          label="Status"
          hint="Live and Aging are both suggested to staff — an aging record just ranks lower. Flagged and Retired are held back. Changing this records a verification entry against the resource."
        >
          <Select {...register("verificationStatus")}>
            {VERIFICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {VERIFICATION_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Fragility"
          hint="Fragile = small, single-site, or grant-dependent. Those get re-checked more often."
        >
          <Select {...register("fragility")}>
            {FRAGILITIES.map((value) => (
              <option key={value} value={value}>
                {FRAGILITY_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Source"
          hint="Where this record came from — a grant list, their website, a phone call."
          full
        >
          <Input {...register("sourceName")} placeholder="SSVF grantee list" />
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

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputClasses} />;
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={inputClasses} />;
}
