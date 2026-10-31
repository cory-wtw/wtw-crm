"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
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
  POPULATION_LABELS,
  POPULATIONS,
  SERVICE_ERA_LABELS,
  SERVICE_ERAS,
  TYPICAL_WAIT_LABELS,
  TYPICAL_WAITS,
  VERIFICATION_STATUS_LABELS,
  VERIFICATION_STATUSES,
} from "@/lib/schemas";
import {
  draftKeyFor,
  possibleDuplicates,
  type DraftKey,
  type DraftValues,
  type DuplicateCandidate,
  type PossibleDuplicate,
} from "@/lib/quick-add";
import { createResourceAction, editResourceAction } from "./actions";
import { listDuplicateCandidatesAction } from "./quick-add-actions";

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
  helpsWith: z.string().optional(),

  buckets: z.array(z.string()),

  geoScope: z.enum(GEO_SCOPES),
  geoStates: z.string().optional(),
  geoLocalities: z.string().optional(),

  minDischarge: z.enum(MIN_DISCHARGES),
  requiresVaEnrollment: z.boolean(),
  requiresValidId: z.boolean(),
  eraRestriction: z.array(z.string()),
  requiresDependents: z.boolean(),
  populationRestriction: z.array(z.string()),
  crisisCapable: z.boolean(),
  replacesId: z.boolean(),

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
  /** A Quick add draft: values to start from, and which ones to highlight. */
  draft?: { values: DraftValues; filled: DraftKey[] } | null;
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

export function ResourceForm({ initial, draft }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Drafted fields nobody has looked at yet. Editing one, or saying it looks
  // right, takes it off the list.
  const [unchecked, setUnchecked] = useState<Set<DraftKey>>(
    () => new Set(draft?.filled ?? []),
  );
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);

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
      helpsWith: "",
      buckets: [],
      geoScope: "national",
      geoStates: "",
      geoLocalities: "",
      minDischarge: "any",
      requiresVaEnrollment: false,
      requiresValidId: false,
      eraRestriction: [],
      requiresDependents: false,
      populationRestriction: [],
      crisisCapable: false,
      replacesId: false,
      accessMethod: "phone",
      accessValue: "",
      whatToBring: "",
      typicalWait: "unknown",
      verificationStatus: "live",
      fragility: "stable",
      sourceName: "",
      ...initial?.values,
      ...draft?.values,
    },
  });

  function confirmField(key: DraftKey) {
    setUnchecked((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }
  const mark = (key: DraftKey) => ({
    drafted: unchecked.has(key),
    onConfirm: () => confirmField(key),
  });

  useEffect(() => {
    const subscription = watch((_, { name, type }) => {
      if (type !== "change" || !name) return;
      const key = draftKeyFor(name);
      if (key) confirmField(key);
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  // Possible duplicates, for new records only. A warning, never a block — two
  // offices of one org can legitimately share a website.
  const nameValue = watch("organizationName");
  const phoneValue = watch("contactPhone");
  const websiteValue = watch("website");
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    listDuplicateCandidatesAction()
      .then((found) => {
        if (!cancelled) setCandidates(found);
      })
      .catch(() => {
        // The check is a courtesy; a failure must not get in the way of saving.
      });
    return () => {
      cancelled = true;
    };
  }, [initial]);
  const duplicates: PossibleDuplicate[] = useMemo(
    () =>
      possibleDuplicates(
        {
          organizationName: nameValue,
          contactPhone: phoneValue,
          website: websiteValue,
        },
        candidates,
      ),
    [candidates, nameValue, phoneValue, websiteValue],
  );

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
      helpsWith: values.helpsWith?.trim() || undefined,

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
      populationRestriction: values.populationRestriction,
      crisisCapable: values.crisisCapable,
      replacesId: values.replacesId,

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
      <DuplicateWarning duplicates={duplicates} />
      <Section title="Organization">
        <Field
          label="Organization name" {...mark("organizationName")}
          required
          error={errors.organizationName?.message}
        >
          <Input {...register("organizationName")} autoFocus />
        </Field>
        <Field
          label="Parent organization" {...mark("parentOrg")}
          hint="The national body or health system this one sits under, if any."
        >
          <Input {...register("parentOrg")} />
        </Field>
        <Field label="Website" {...mark("website")} hint="e.g. https://example.org">
          <Input {...register("website")} />
        </Field>
      </Section>

      <Section title="Contact">
        <Field label="Contact name" {...mark("contactName")}>
          <Input {...register("contactName")} />
        </Field>
        <Field label="Phone" {...mark("contactPhone")}>
          <Input {...register("contactPhone")} />
        </Field>
        <Field label="Email" {...mark("contactEmail")} error={errors.contactEmail?.message}>
          <Input type="email" {...register("contactEmail")} />
        </Field>
      </Section>

      <Section title="Details">
        <Field
          label="What they help with" {...mark("helpsWith")}
          hint="One plain line for the veteran's email — 'Help with rent and keeping your home.' Not who they are; what they'll do for you. No he/she."
          error={errors.helpsWith?.message}
          full
        >
          <Input {...register("helpsWith")} placeholder="Help finding work and job training." />
        </Field>
        <Field
          label="Primary service(s) offered" {...mark("services")}
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
          label="Description of organization" {...mark("description")}
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
          label="Eligibility requirements" {...mark("eligibility")}
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
          label="Buckets" {...mark("buckets")}
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
          label="Service area" {...mark("geoScope")}
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
            {...mark("geoStates")}
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
            label="Cities or counties served" {...mark("geoLocalities")}
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
          label="Eligibility notes" {...mark("eligibilityNotes")}
          hint="Eligibility the checkboxes can't hold — combat theater service, military sexual trauma, and the like. Shown to staff and included in the referral; it never filters anything."
          full
          error={errors.eligibilityNotes?.message}
        >
          <Textarea {...register("eligibilityNotes")} rows={3} />
        </Field>
        <Field
          label="Minimum discharge accepted" {...mark("minDischarge")}
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
          label="Era restriction" {...mark("eraRestriction")}
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
          label="Only serves" {...mark("populationRestriction")}
          hint="Check only when the org takes nobody else — an MST line or HUD-VASH. It is offered only when staff marks the veteran as in that group at intake."
        >
          <div className="grid gap-2 rounded-md border border-input bg-background p-3">
            {POPULATIONS.map((population) => (
              <label key={population} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  value={population}
                  {...register("populationRestriction")}
                  className="accent-[color:var(--wtw-brand-gold)]"
                />
                {POPULATION_LABELS[population]}
              </label>
            ))}
          </div>
        </Field>

        <Field
          label="Requirements" {...mark("requirements")}
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
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                {...register("replacesId")}
                className="accent-[color:var(--wtw-brand-gold)]"
              />
              Replaces a lost ID — state ID, driver&apos;s license, birth
              certificate, Social Security card or DD-214 (not legal aid)
            </label>
          </div>
        </Field>
      </Section>

      <Section title="How to start">
        <Field label="Access method" {...mark("accessMethod")}>
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
          {...mark("accessValue")}
          hint="What a veteran does first — this goes in the referral they receive."
        >
          <Input {...register("accessValue")} />
        </Field>
        <Field
          label="What to bring" {...mark("whatToBring")}
          hint="Documents or items they should have with them."
          full
        >
          <Input
            {...register("whatToBring")}
            placeholder="DD-214, photo ID, proof of address"
          />
        </Field>
        <Field label="Typical wait" {...mark("typicalWait")}>
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
          label="Fragility" {...mark("fragility")}
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
          label="Source" {...mark("sourceName")}
          hint="Where this record came from — a grant list, their website, a phone call."
          full
        >
          <Input {...register("sourceName")} placeholder="SSVF grantee list" />
        </Field>
      </Section>

      <DuplicateWarning duplicates={duplicates} />

      {serverError && (
        <p className="text-sm text-destructive">{serverError}</p>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-6">
        <button
          type="submit"
          disabled={isSubmitting || isPending}
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
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

function DuplicateWarning({ duplicates }: { duplicates: PossibleDuplicate[] }) {
  if (duplicates.length === 0) return null;
  return (
    <div className="space-y-1 rounded-md border border-[color:var(--wtw-deep-gold)]/50 bg-[color:var(--wtw-deep-gold)]/10 p-3 text-sm">
      {duplicates.map((dup) => (
        <p key={dup.id}>
          <span className="font-bold">Possible duplicate of </span>
          <Link
            href={`/resources/${dup.id}`}
            target="_blank"
            className="font-bold underline"
          >
            {dup.organizationName}
          </Link>{" "}
          <span className="text-xs text-muted-foreground">
            ({dup.reasons.join(", ")})
          </span>
        </p>
      ))}
      <p className="text-xs text-muted-foreground">
        You can still save — check it isn&rsquo;t already in the roster.
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  required,
  full,
  drafted,
  onConfirm,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  full?: boolean;
  /** Filled by a Quick add draft and not checked yet. */
  drafted?: boolean;
  onConfirm?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`space-y-1.5 ${full ? "md:col-span-2" : ""} ${
        drafted
          ? "-m-2 rounded-md bg-[color:var(--wtw-brand-gold)]/25 p-2"
          : ""
      }`}
    >
      {label && (
        <div className="flex items-baseline justify-between gap-2">
          <label className="block text-sm font-bold">
            {label}
            {required && <span className="text-destructive"> *</span>}
          </label>
          {drafted && onConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              className="shrink-0 text-xs font-bold text-[color:var(--wtw-deep-gold)] hover:underline"
            >
              Looks right
            </button>
          )}
        </div>
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
  "w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClasses} />;
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputClasses} />;
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={inputClasses} />;
}
