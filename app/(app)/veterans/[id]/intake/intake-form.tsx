"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  BUCKET_CODES,
  BUCKET_LABELS,
  BUCKET_PROMPTS,
  DEPENDENTS_ANSWERS,
  DEPENDENTS_ANSWER_LABELS,
  DISCHARGE_CHARACTERS,
  DISCHARGE_CHARACTER_LABELS,
  ID_STATUSES,
  ID_STATUS_LABELS,
  RECEIVING_VA_BENEFITS,
  RECEIVING_VA_BENEFITS_LABELS,
  SERVICE_ERAS,
  SERVICE_ERA_LABELS,
  type Bucket,
} from "@/lib/schemas";
import { ELIGIBILITY_FIELDS } from "@/lib/intake";
import { runIntakeAction, type IntakeResult } from "../actions";
import { IntakeResults } from "./intake-results";

// All-strings, coerced at submit, per the existing *-form.tsx convention. The
// empty string means unanswered, which is not the same as a "no" — the gates
// treat the two differently.
const formSchema = z.object({
  safeTonight: z.enum(["", "yes", "no"]),
  receivingVaBenefits: z.enum(["", ...RECEIVING_VA_BENEFITS]),
  needs: z.array(z.string()),
  idStatus: z.enum(["", ...ID_STATUSES]),
  dischargeCharacter: z.enum(["", ...DISCHARGE_CHARACTERS]),
  serviceEra: z.enum(["", ...SERVICE_ERAS]),
  hasDependents: z.enum(["", ...DEPENDENTS_ANSWERS]),
});
type FormValues = z.infer<typeof formSchema>;

type Props = {
  veteranId: string;
  veteranName: string;
  knownCity: string | null;
  knownState: string | null;
  initial: Partial<FormValues>;
  /** What the last intake recorded, and when. Seeds the needs boxes so a call
   *  that matched nobody doesn't cost staff the assessment. */
  lastIntake: { needs: Bucket[]; on: string } | null;
};

const NEEDS_LEAD_IN =
  "I'm going to run through a short list of things we help with. Some won't apply. Just say yes or no as I go, and if you're not sure, say that and we'll come back to it.";

export function IntakeForm({
  veteranId,
  veteranName,
  knownCity,
  knownState,
  initial,
  lastIntake,
}: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<IntakeResult | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      safeTonight: "",
      receivingVaBenefits: "",
      needs: lastIntake?.needs ?? [],
      idStatus: "",
      dischargeCharacter: "",
      serviceEra: "",
      hasDependents: "",
      ...initial,
    },
  });

  const safeTonight = watch("safeTonight");
  const current = watch();

  /**
   * What the record already held for a field, and whether this call has changed
   * it. Staff should never have to guess which answers they just gave and which
   * came off the record — a pre-filled radio looks identical to one they set.
   */
  function provenance(field: keyof FormValues): Provenance {
    const stored = initial[field];
    if (!stored) return null;
    return current[field] === stored ? "stored" : "changed";
  }
  // Nowhere safe tonight collapses the rest of the call. Everything below the
  // triage section waits until they're somewhere safe.
  const inCrisis = safeTonight === "no";

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const input = {
      safeTonight:
        values.safeTonight === "" ? undefined : values.safeTonight === "yes",
      receivingVaBenefits: values.receivingVaBenefits || undefined,
      // What was ticked, and only that. A crisis answer still surfaces same-day
      // help, but the server folds that in — see matchNeeds. The record should
      // say what the veteran told us, not what we inferred from it.
      needs: values.needs as Bucket[],
      idStatus: values.idStatus || undefined,
      dischargeCharacter: values.dischargeCharacter || undefined,
      serviceEra: values.serviceEra || undefined,
      // Blank stays blank all the way to the server, where it means "not asked
      // this time" and leaves any stored answer alone.
      hasDependents: values.hasDependents || undefined,
    };

    const response = await runIntakeAction(veteranId, input);
    if (!response.ok) {
      setServerError(response.error);
      return;
    }
    setResult(response.result);
    // Bring the results into view — staff is on a call and shouldn't hunt.
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  if (result) {
    return (
      <IntakeResults
        result={result}
        veteranId={veteranId}
        veteranName={veteranName}
        onStartOver={() => setResult(null)}
      />
    );
  }

  const prefilledCount = ELIGIBILITY_FIELDS.filter(
    (field) => initial[field],
  ).length;

  /** A box ticked on the last call, still ticked now. */
  function carriedOver(code: Bucket): boolean {
    return (
      (lastIntake?.needs.includes(code) ?? false) &&
      current.needs.includes(code)
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {prefilledCount > 0 && (
        <p className="rounded-lg border border-border bg-secondary/30 p-4 text-sm">
          <span className="font-bold">
            {prefilledCount} answer{prefilledCount === 1 ? "" : "s"} already on
            the record
          </span>{" "}
          <span className="text-muted-foreground">
            — marked below. Leave anything you don&rsquo;t ask about alone and
            it stays as it is; nothing here is erased by skipping it. If an
            answer is genuinely unknown, say so with &ldquo;Not sure&rdquo;.
          </span>
        </p>
      )}

      <Section
        title="Triage"
        blurb="Ask this first, every time."
      >
        <Question prompt="Is tonight the problem? Nowhere safe to sleep, or you're in danger, or you're in a bad place mentally right now.">
          <Radios
            name="safeTonight"
            register={register}
            options={[
              { value: "yes", label: "They're safe tonight" },
              { value: "no", label: "No — tonight is the problem" },
            ]}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Not saved to their record. It&rsquo;s true right now, not about
            them.
          </p>
        </Question>

        {inCrisis && <CrisisLine />}

        <Question prompt="Have you ever filed for disability with the VA? If you haven't, or you filed and got turned down, that's a yes for us.">
          <Radios
            name="receivingVaBenefits"
            register={register}
            options={RECEIVING_VA_BENEFITS.map((value) => ({
              value,
              label: RECEIVING_VA_BENEFITS_LABELS[value],
            }))}
          />
        </Question>
      </Section>

      {inCrisis ? (
        <div className="rounded-lg border border-dashed border-border p-6">
          <p className="text-sm font-bold">The rest of the call waits.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Get them somewhere safe tonight. Run the full intake once that
            &rsquo;s handled — the record keeps whatever you&rsquo;ve already
            entered.
          </p>
        </div>
      ) : (
        <>
          <Section title="Needs" blurb={NEEDS_LEAD_IN}>
            {lastIntake && (
              <p className="rounded-md border border-border bg-secondary/30 p-3 text-sm text-muted-foreground md:col-span-2">
                Ticked from the intake on{" "}
                <span className="font-bold">{lastIntake.on}</span>. Change
                whatever this call changes — the boxes here are this call&rsquo;s
                answers, and the earlier run stays on the record as it was.
              </p>
            )}
            <div className="space-y-2 md:col-span-2">
              {BUCKET_CODES.map((code) => (
                <label
                  key={code}
                  className="flex items-start gap-3 rounded-md border border-input bg-background p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    value={code}
                    {...register("needs")}
                    className="mt-0.5 accent-[color:var(--wtw-brand-gold)]"
                  />
                  <span>
                    <span className="block">{BUCKET_PROMPTS[code]}</span>
                    <span className="mt-0.5 block text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                      {BUCKET_LABELS[code]}
                      {carriedOver(code) && (
                        <span className="ml-2 text-[color:var(--wtw-deep-gold)]">
                          · from last call
                        </span>
                      )}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Section>

          <Section
            title="Eligibility keys"
            blurb="Four answers that decide which doors open."
          >
            <Question
              prompt="Do you have a current state ID or driver's license on you? Expired counts, just tell me it's expired."
              provenance={provenance("idStatus")}
            >
              <Radios
                name="idStatus"
                register={register}
                options={ID_STATUSES.map((value) => ({
                  value,
                  label: ID_STATUS_LABELS[value],
                }))}
              />
            </Question>

            <Question
              prompt="What's on your discharge paperwork? Honorable, general, something else, or you're not sure."
              provenance={provenance("dischargeCharacter")}
            >
              <Radios
                name="dischargeCharacter"
                register={register}
                options={DISCHARGE_CHARACTERS.map((value) => ({
                  value,
                  label: DISCHARGE_CHARACTER_LABELS[value],
                }))}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Say this out loud: &ldquo;Doesn&rsquo;t disqualify you either
                way, I just need to know which doors open.&rdquo;
              </p>
            </Question>

            <Question prompt="When did you serve?" provenance={provenance("serviceEra")}>
              <select
                {...register("serviceEra")}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Not asked</option>
                {SERVICE_ERAS.map((era) => (
                  <option key={era} value={era}>
                    {SERVICE_ERA_LABELS[era]}
                  </option>
                ))}
              </select>
            </Question>

            <Question
              prompt="Anybody depending on you? Kids, a spouse, an aging parent."
              provenance={provenance("hasDependents")}
            >
              <Radios
                name="hasDependents"
                register={register}
                options={DEPENDENTS_ANSWERS.map((value) => ({
                  value,
                  label: DEPENDENTS_ANSWER_LABELS[value],
                }))}
              />
            </Question>
          </Section>
        </>
      )}

      <div className="rounded-lg border border-border bg-secondary/30 p-4 text-xs text-muted-foreground">
        Matching on {[knownCity, knownState].filter(Boolean).join(", ") ||
          "no location on file"}
        . Location comes from the veteran record —{" "}
        <Link
          href={`/veterans/${veteranId}/edit`}
          className="font-bold underline-offset-4 hover:underline"
        >
          edit it there
        </Link>{" "}
        if it&rsquo;s wrong.
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <div className="flex items-center gap-3 border-t border-border pt-6">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
        >
          {isSubmitting ? "Matching…" : "Find resources"}
        </button>
        <Link
          href={`/veterans/${veteranId}`}
          className="text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

/** The number staff reads out before anything else on a crisis call. */
export function CrisisLine() {
  return (
    <div className="md:col-span-2 rounded-lg border-2 border-[color:var(--wtw-brand-gold)] bg-primary/10 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
        Veterans Crisis Line
      </p>
      <p className="mt-1 text-lg font-black tracking-tight">
        Dial 988, then press 1
      </p>
      <p className="text-sm">
        Or text <span className="font-bold">838255</span>. Stay on the call with
        them if you can.
      </p>
    </div>
  );
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="border-b border-border pb-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          {title}
        </h2>
        {blurb && (
          <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
        )}
      </div>
      <div className="grid gap-5 md:grid-cols-2">{children}</div>
    </section>
  );
}

type Provenance = "stored" | "changed" | null;

/** One question. The prompt IS the label — it's what staff says out loud. */
function Question({
  prompt,
  provenance,
  children,
}: {
  prompt: string;
  provenance?: Provenance;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-sm font-bold">{prompt}</p>
        {provenance === "stored" && (
          <span className="inline-flex shrink-0 items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            From the record
          </span>
        )}
        {provenance === "changed" && (
          <span className="inline-flex shrink-0 items-center rounded-full bg-[color:var(--wtw-deep-gold)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--wtw-deep-gold)]">
            Changed this call
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Radios({
  name,
  register,
  options,
}: {
  name: keyof FormValues;
  register: ReturnType<typeof useForm<FormValues>>["register"];
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label
          key={option.value}
          className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <input
            type="radio"
            value={option.value}
            {...register(name)}
            className="accent-[color:var(--wtw-brand-gold)]"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
