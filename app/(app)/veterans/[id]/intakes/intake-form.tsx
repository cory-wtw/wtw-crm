"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  COPING_OPTION_LABELS,
  COPING_OPTIONS,
  DOC_STATUS_LABELS,
  DOC_STATUSES,
  HEARING_FREQUENCY_LABELS,
  HOUSING_SITUATION_LABELS,
  HOUSING_SITUATIONS,
  INCOME_SOURCE_LABELS,
  INCOME_SOURCES,
  INTAKE_BRANCH_LABELS,
  INTAKE_BRANCHES,
  INTAKE_DOC_KEYS,
  INTAKE_DOC_LABELS,
  type IntakeDocItem,
  type IntakeDocKey,
  MENTAL_HEALTH_OPTION_LABELS,
  MENTAL_HEALTH_OPTIONS,
  SKIN_FREQUENCY_LABELS,
  SLEEP_OPTION_LABELS,
  SLEEP_OPTIONS,
  STANDARD_FREQUENCY_LABELS,
  VA_ENROLLMENT_LABELS,
  VA_ENROLLMENTS,
  VA_RATING_STATUS_LABELS,
  VA_RATING_STATUSES,
  VSO_BEST_FIT_LABELS,
  VSO_BEST_FIT_TYPES,
} from "@/lib/schemas";
import {
  createIntakeAction,
  markIntakeCompleteAction,
  saveIntakeDraftAction,
} from "./actions";

type FormState = {
  basics: {
    fullName: string;
    dateOfBirth: string;
    bestPhone: string;
    bestEmail: string;
    currentLocation: string;
    bestWayToReach: string;
  };
  service: {
    branches: string[];
    yearsServed: string;
    rankAtDischarge: string;
    mos: string;
    dischargeStatus: string;
    placesServed: string;
    combatExperience: string;
    proudOf: string;
  };
  bodyDuringService: {
    injuries: string;
    concussions: string;
    exposures: string;
    traumaStillWithYou: string;
  };
  bodyToday: {
    headBrainMemory: string;
    vision: string;
    backNeckSpine: string;
    breathing: string;
    kneesAnklesFeet: string;
    stomach: string;
    shoulders: string;
    skin: string;
    hearing: string;
    other: string;
    dailyLifeImpact: string;
  };
  sleep: string[];
  mentalHealth: string[];
  coping: string[];
  housing: string;
  housingOther: string;
  income: string[];
  vaCare: {
    enrollment: string;
    rating: string;
    ratingValue: string;
    priorClaimOutcome: string;
  };
  openQuestions: {
    normalDay: string;
    countingOn: string;
    otherSupport: string;
    feelingAtSeparation: string;
  };
  documents: Record<IntakeDocKey, { status: string; notes: string }>;
  buddyContacts: { name: string; howToReach: string }[];
  vsoBestFit: { types: string[]; stateLivesIn: string; specialized: string };
  liaisonHandoff: { threadsWorthFollowing: string; urgency: string };
  nextContact: { when: string; where: string; how: string };
  liaisonSignature: { name: string };
};

function emptyDocs(): FormState["documents"] {
  return Object.fromEntries(
    INTAKE_DOC_KEYS.map((k) => [k, { status: "", notes: "" }]),
  ) as FormState["documents"];
}

function emptyState(): FormState {
  return {
    basics: {
      fullName: "",
      dateOfBirth: "",
      bestPhone: "",
      bestEmail: "",
      currentLocation: "",
      bestWayToReach: "",
    },
    service: {
      branches: [],
      yearsServed: "",
      rankAtDischarge: "",
      mos: "",
      dischargeStatus: "",
      placesServed: "",
      combatExperience: "",
      proudOf: "",
    },
    bodyDuringService: {
      injuries: "",
      concussions: "",
      exposures: "",
      traumaStillWithYou: "",
    },
    bodyToday: {
      headBrainMemory: "",
      vision: "",
      backNeckSpine: "",
      breathing: "",
      kneesAnklesFeet: "",
      stomach: "",
      shoulders: "",
      skin: "",
      hearing: "",
      other: "",
      dailyLifeImpact: "",
    },
    sleep: [],
    mentalHealth: [],
    coping: [],
    housing: "",
    housingOther: "",
    income: [],
    vaCare: {
      enrollment: "",
      rating: "",
      ratingValue: "",
      priorClaimOutcome: "",
    },
    openQuestions: {
      normalDay: "",
      countingOn: "",
      otherSupport: "",
      feelingAtSeparation: "",
    },
    documents: emptyDocs(),
    buddyContacts: Array.from({ length: 4 }, () => ({
      name: "",
      howToReach: "",
    })),
    vsoBestFit: { types: [], stateLivesIn: "", specialized: "" },
    liaisonHandoff: { threadsWorthFollowing: "", urgency: "" },
    nextContact: { when: "", where: "", how: "" },
    liaisonSignature: { name: "" },
  };
}

export type IntakeFormInitial = {
  intakeId: string;
  status: "draft" | "complete";
  values: Partial<FormState>;
};

export function IntakeForm({
  veteranId,
  initial,
}: {
  veteranId: string;
  initial?: IntakeFormInitial | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(() => ({
    ...emptyState(),
    ...(initial?.values as Partial<FormState> | undefined),
    documents: { ...emptyDocs(), ...initial?.values?.documents },
  }));
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverSuccess, setServerSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Track unsaved changes and the last-saved timestamp so we can show
  // the liaison clearly that their work is being preserved, and warn
  // them on accidental nav-aways. Auto-save fires periodically while
  // there are unsaved changes — belt and suspenders against a tab close
  // mid-conversation.
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
    initial?.intakeId ? new Date() : null,
  );
  const dirtyRef = useRef(false);
  const currentIntakeIdRef = useRef<string | null>(
    initial?.intakeId || null,
  );
  const inFlightSaveRef = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  function toInput() {
    // Convert form state to the shape expected by the server action.
    return {
      basics: state.basics,
      service: state.service,
      bodyDuringService: state.bodyDuringService,
      bodyToday: {
        ...state.bodyToday,
        headBrainMemory: state.bodyToday.headBrainMemory || null,
        vision: state.bodyToday.vision || null,
        backNeckSpine: state.bodyToday.backNeckSpine || null,
        breathing: state.bodyToday.breathing || null,
        kneesAnklesFeet: state.bodyToday.kneesAnklesFeet || null,
        stomach: state.bodyToday.stomach || null,
        shoulders: state.bodyToday.shoulders || null,
        skin: state.bodyToday.skin || null,
        hearing: state.bodyToday.hearing || null,
      },
      sleep: state.sleep,
      mentalHealth: state.mentalHealth,
      coping: state.coping,
      housing: state.housing || null,
      housingOther: state.housingOther,
      income: state.income,
      vaCare: {
        ...state.vaCare,
        enrollment: state.vaCare.enrollment || null,
        rating: state.vaCare.rating || null,
      },
      openQuestions: state.openQuestions,
      documents: Object.fromEntries(
        INTAKE_DOC_KEYS.map((k) => [
          k,
          {
            status: state.documents[k].status || null,
            notes: state.documents[k].notes,
          },
        ]),
      ),
      buddyContacts: state.buddyContacts.filter(
        (b) => b.name.trim() || b.howToReach.trim(),
      ),
      vsoBestFit: state.vsoBestFit,
      liaisonHandoff: state.liaisonHandoff,
      nextContact: state.nextContact,
      liaisonSignature: { name: state.liaisonSignature.name },
    };
  }

  const performSave = useCallback(
    async (
      options: { silent?: boolean } = {},
    ): Promise<{ ok: true; id: string } | { ok: false; error: string }> => {
      const input = toInput();
      const intakeId = currentIntakeIdRef.current;
      const result = intakeId
        ? await saveIntakeDraftAction(veteranId, intakeId, input)
        : await createIntakeAction(veteranId, input);
      if (!result.ok) {
        if (!options.silent) setServerError(result.error);
        return result;
      }
      const newId =
        "id" in result ? (result as { id: string }).id : intakeId!;
      currentIntakeIdRef.current = newId;
      setIsDirty(false);
      setLastSavedAt(new Date());
      if (!options.silent) {
        setServerError(null);
        setServerSuccess("Saved.");
      }
      return { ok: true, id: newId };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [veteranId, state],
  );

  async function onSaveDraft(event: React.FormEvent) {
    event.preventDefault();
    const wasNew = !currentIntakeIdRef.current;
    let result: { ok: true; id: string } | { ok: false; error: string };
    try {
      result = await performSave();
    } catch (err) {
      console.error("intake save failed", err);
      setServerError(
        err instanceof Error
          ? `Save failed: ${err.message}`
          : "Save failed. Check the browser console.",
      );
      return;
    }
    if (!result.ok) return;
    if (wasNew) {
      startTransition(() => {
        router.replace(`/veterans/${veteranId}/intakes/${result.id}/edit`);
        router.refresh();
      });
    }
  }

  // Auto-save every 30s while there are unsaved changes. The save flow
  // is idempotent and creates the intake on first save if needed.
  useEffect(() => {
    const t = setInterval(() => {
      if (!dirtyRef.current) return;
      if (inFlightSaveRef.current) return;
      inFlightSaveRef.current = performSave({ silent: true }).finally(() => {
        inFlightSaveRef.current = null;
      });
    }, 30_000);
    return () => clearInterval(t);
  }, [performSave]);

  // beforeunload guard — browser-native "are you sure?" dialog if the
  // liaison tries to close the tab or navigate away with unsaved edits.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  async function onMarkComplete() {
    setServerError(null);
    setServerSuccess(null);
    const confirmed = window.confirm(
      "Mark this intake complete? Once locked, edits require reopening it from the view page.",
    );
    if (!confirmed) return;
    const saved = await performSave({ silent: true });
    if (!saved.ok) {
      setServerError(saved.error);
      return;
    }
    const completed = await markIntakeCompleteAction(veteranId, saved.id);
    if (!completed.ok) {
      setServerError(completed.error);
      return;
    }
    startTransition(() => {
      router.push(`/veterans/${veteranId}/intakes/${saved.id}`);
      router.refresh();
    });
  }

  // -------- helpers for updating nested state --------
  function setBasics<K extends keyof FormState["basics"]>(
    k: K,
    v: FormState["basics"][K],
  ) {
    setIsDirty(true);
    setState((s) => ({ ...s, basics: { ...s.basics, [k]: v } }));
  }
  function setService<K extends keyof FormState["service"]>(
    k: K,
    v: FormState["service"][K],
  ) {
    setIsDirty(true);
    setState((s) => ({ ...s, service: { ...s.service, [k]: v } }));
  }
  function setBodyDuring<K extends keyof FormState["bodyDuringService"]>(
    k: K,
    v: FormState["bodyDuringService"][K],
  ) {
    setIsDirty(true);
    setState((s) => ({
      ...s,
      bodyDuringService: { ...s.bodyDuringService, [k]: v },
    }));
  }
  function setBodyToday<K extends keyof FormState["bodyToday"]>(
    k: K,
    v: FormState["bodyToday"][K],
  ) {
    setIsDirty(true);
    setState((s) => ({ ...s, bodyToday: { ...s.bodyToday, [k]: v } }));
  }
  function setVaCare<K extends keyof FormState["vaCare"]>(
    k: K,
    v: FormState["vaCare"][K],
  ) {
    setIsDirty(true);
    setState((s) => ({ ...s, vaCare: { ...s.vaCare, [k]: v } }));
  }
  function setOpenQ<K extends keyof FormState["openQuestions"]>(
    k: K,
    v: FormState["openQuestions"][K],
  ) {
    setIsDirty(true);
    setState((s) => ({
      ...s,
      openQuestions: { ...s.openQuestions, [k]: v },
    }));
  }
  function setHandoff<K extends keyof FormState["liaisonHandoff"]>(
    k: K,
    v: FormState["liaisonHandoff"][K],
  ) {
    setIsDirty(true);
    setState((s) => ({
      ...s,
      liaisonHandoff: { ...s.liaisonHandoff, [k]: v },
    }));
  }
  function setNextContact<K extends keyof FormState["nextContact"]>(
    k: K,
    v: FormState["nextContact"][K],
  ) {
    setIsDirty(true);
    setState((s) => ({ ...s, nextContact: { ...s.nextContact, [k]: v } }));
  }
  function setVso<K extends keyof FormState["vsoBestFit"]>(
    k: K,
    v: FormState["vsoBestFit"][K],
  ) {
    setIsDirty(true);
    setState((s) => ({ ...s, vsoBestFit: { ...s.vsoBestFit, [k]: v } }));
  }
  function toggleArrayItem<T extends string>(
    arr: T[],
    value: T,
    checked: boolean,
  ): T[] {
    if (checked) return arr.includes(value) ? arr : [...arr, value];
    return arr.filter((v) => v !== value);
  }
  function updateDoc(
    key: IntakeDocKey,
    patch: Partial<{ status: string; notes: string }>,
  ) {
    setIsDirty(true);
    setState((s) => ({
      ...s,
      documents: {
        ...s.documents,
        [key]: { ...s.documents[key], ...patch },
      },
    }));
  }
  function updateBuddyContact(
    idx: number,
    patch: Partial<{ name: string; howToReach: string }>,
  ) {
    setIsDirty(true);
    setState((s) => ({
      ...s,
      buddyContacts: s.buddyContacts.map((b, i) =>
        i === idx ? { ...b, ...patch } : b,
      ),
    }));
  }
  function addBuddyContact() {
    setIsDirty(true);
    setState((s) => ({
      ...s,
      buddyContacts: [...s.buddyContacts, { name: "", howToReach: "" }],
    }));
  }

  return (
    <form onSubmit={onSaveDraft} className="space-y-10">
      <Section number="01" title="General Information">
        <SubSection title="The Basics">
          <Grid cols={2}>
            <Field label="Full name">
              <Input
                value={state.basics.fullName}
                onChange={(e) => setBasics("fullName", e.target.value)}
              />
            </Field>
            <Field label="Date of birth">
              <Input
                type="date"
                value={state.basics.dateOfBirth}
                onChange={(e) => setBasics("dateOfBirth", e.target.value)}
              />
            </Field>
            <Field label="Best phone">
              <Input
                value={state.basics.bestPhone}
                onChange={(e) => setBasics("bestPhone", e.target.value)}
              />
            </Field>
            <Field label="Best email (if any)">
              <Input
                type="email"
                value={state.basics.bestEmail}
                onChange={(e) => setBasics("bestEmail", e.target.value)}
              />
            </Field>
            <Field label="Where are you staying right now?" wide>
              <Input
                value={state.basics.currentLocation}
                onChange={(e) =>
                  setBasics("currentLocation", e.target.value)
                }
              />
            </Field>
            <Field label="Best way to reach you again" wide>
              <Input
                value={state.basics.bestWayToReach}
                onChange={(e) => setBasics("bestWayToReach", e.target.value)}
              />
            </Field>
          </Grid>
        </SubSection>

        <SubSection title="Your Service">
          <CheckboxGroup
            label="Branch"
            columns={4}
            options={INTAKE_BRANCHES.map((b) => ({
              value: b,
              label: INTAKE_BRANCH_LABELS[b],
            }))}
            selected={state.service.branches}
            onChange={(value, checked) =>
              setService(
                "branches",
                toggleArrayItem(state.service.branches, value, checked),
              )
            }
          />
          <Grid cols={2}>
            <Field label="Years served">
              <Input
                value={state.service.yearsServed}
                onChange={(e) => setService("yearsServed", e.target.value)}
              />
            </Field>
            <Field label="Rank at discharge">
              <Input
                value={state.service.rankAtDischarge}
                onChange={(e) =>
                  setService("rankAtDischarge", e.target.value)
                }
              />
            </Field>
            <Field label="MOS / Job">
              <Input
                value={state.service.mos}
                onChange={(e) => setService("mos", e.target.value)}
              />
            </Field>
            <Field label="Discharge status">
              <Input
                value={state.service.dischargeStatus}
                onChange={(e) =>
                  setService("dischargeStatus", e.target.value)
                }
              />
            </Field>
          </Grid>
          <Field
            label="Where did you serve? Bases, deployments, places that mattered"
            hint="Listen for combat zones, hazardous duty, environmental exposures (burn pits, contaminated water, radiation, asbestos)."
          >
            <Textarea
              rows={3}
              value={state.service.placesServed}
              onChange={(e) => setService("placesServed", e.target.value)}
            />
          </Field>
          <Field label="Any combat experience or hostile fire?">
            <Textarea
              rows={2}
              value={state.service.combatExperience}
              onChange={(e) =>
                setService("combatExperience", e.target.value)
              }
            />
          </Field>
          <Field
            label="What did you love about your service? What are you proud of?"
            hint="Start with strength. It builds trust before harder questions on the next page."
          >
            <Textarea
              rows={2}
              value={state.service.proudOf}
              onChange={(e) => setService("proudOf", e.target.value)}
            />
          </Field>
        </SubSection>
      </Section>

      <Section number="02" title="What Happened & Your Body">
        <SubSection title="Your Body During Service">
          <Field label="Were you ever injured during service? Falls, accidents, training, combat — anything?">
            <Textarea
              rows={2}
              value={state.bodyDuringService.injuries}
              onChange={(e) => setBodyDuring("injuries", e.target.value)}
            />
          </Field>
          <Field
            label="Did you ever lose consciousness, get knocked out, or have your &ldquo;bell rung&rdquo; — even if no one called it a concussion?"
            hint="Blast exposure, vehicle accidents, training falls, sports, fights — all count."
          >
            <Textarea
              rows={2}
              value={state.bodyDuringService.concussions}
              onChange={(e) => setBodyDuring("concussions", e.target.value)}
            />
          </Field>
          <Field label="Were you exposed to anything hazardous? Burn pits, chemicals, contaminated water, asbestos, radiation, loud noises, jet fuel?">
            <Textarea
              rows={2}
              value={state.bodyDuringService.exposures}
              onChange={(e) => setBodyDuring("exposures", e.target.value)}
            />
          </Field>
          <Field
            label="Did anything happen — to you or around you — that&rsquo;s still with you?"
            hint="Trauma, loss of friends, MST, witnessing harm. Don't push. Capture only what they offer."
          >
            <Textarea
              rows={2}
              value={state.bodyDuringService.traumaStillWithYou}
              onChange={(e) =>
                setBodyDuring("traumaStillWithYou", e.target.value)
              }
            />
          </Field>
        </SubSection>

        <SubSection title="Your Body Today">
          <p className="text-xs text-muted-foreground">
            Ask &ldquo;does this area give you trouble?&rdquo; — not &ldquo;do
            you have arthritis?&rdquo; Capture how it feels and works. The VSO
            and VA examiners handle medical labels.
          </p>
          <Grid cols={2}>
            <FrequencyField
              label="Head, brain, memory"
              hint="Headaches, memory, focus, dizziness, light/sound sensitivity."
              labels={STANDARD_FREQUENCY_LABELS}
              value={state.bodyToday.headBrainMemory}
              onChange={(v) => setBodyToday("headBrainMemory", v)}
            />
            <FrequencyField
              label="Vision, eyes"
              hint="Blurriness, double vision, light sensitivity, dry eyes."
              labels={STANDARD_FREQUENCY_LABELS}
              value={state.bodyToday.vision}
              onChange={(v) => setBodyToday("vision", v)}
            />
            <FrequencyField
              label="Back, neck, spine"
              hint="Pain, stiffness, shooting pain, can't lift."
              labels={STANDARD_FREQUENCY_LABELS}
              value={state.bodyToday.backNeckSpine}
              onChange={(v) => setBodyToday("backNeckSpine", v)}
            />
            <FrequencyField
              label="Breathing, lungs, sinuses"
              hint="Cough, shortness of breath, sinus, asthma, sleep apnea."
              labels={STANDARD_FREQUENCY_LABELS}
              value={state.bodyToday.breathing}
              onChange={(v) => setBodyToday("breathing", v)}
            />
            <FrequencyField
              label="Knees, ankles, feet"
              hint="Pain, swelling, instability, can't walk far, gives out."
              labels={STANDARD_FREQUENCY_LABELS}
              value={state.bodyToday.kneesAnklesFeet}
              onChange={(v) => setBodyToday("kneesAnklesFeet", v)}
            />
            <FrequencyField
              label="Stomach, digestion, gut"
              hint="Heartburn, nausea, IBS, food doesn't sit right."
              labels={STANDARD_FREQUENCY_LABELS}
              value={state.bodyToday.stomach}
              onChange={(v) => setBodyToday("stomach", v)}
            />
            <FrequencyField
              label="Shoulders, elbows, wrist, hands"
              hint="Pain, weakness, range of motion, numbness."
              labels={STANDARD_FREQUENCY_LABELS}
              value={state.bodyToday.shoulders}
              onChange={(v) => setBodyToday("shoulders", v)}
            />
            <FrequencyField
              label="Skin"
              hint="Rashes, sores, scars from service, changes since deployment."
              labels={SKIN_FREQUENCY_LABELS}
              value={state.bodyToday.skin}
              onChange={(v) => setBodyToday("skin", v)}
            />
            <FrequencyField
              label="Hearing, ringing in ears"
              hint="Trouble hearing, ringing, buzzing, hissing."
              labels={HEARING_FREQUENCY_LABELS}
              value={state.bodyToday.hearing}
              onChange={(v) => setBodyToday("hearing", v)}
            />
          </Grid>
          <Field
            label="Anything else hurting or not working right?"
            hint="Heart, blood pressure, blood sugar, kidneys, urinary, sexual, teeth/jaw."
          >
            <Textarea
              rows={2}
              value={state.bodyToday.other}
              onChange={(e) => setBodyToday("other", e.target.value)}
            />
          </Field>
          <Field
            label="In your own words: how does your body get in the way of daily life?"
            hint="&ldquo;Can't stand long enough to cook.&rdquo; &ldquo;Knees give out on stairs.&rdquo; Functional impact is what VA examiners look for."
          >
            <Textarea
              rows={3}
              value={state.bodyToday.dailyLifeImpact}
              onChange={(e) =>
                setBodyToday("dailyLifeImpact", e.target.value)
              }
            />
          </Field>
        </SubSection>
      </Section>

      <Section number="03" title="Mind, Daily Life, & Care">
        <Grid cols={2}>
          <CheckboxGroup
            label="Sleep"
            options={SLEEP_OPTIONS.map((s) => ({
              value: s,
              label: SLEEP_OPTION_LABELS[s],
            }))}
            selected={state.sleep}
            onChange={(value, checked) => {
              setIsDirty(true);
              setState((s) => ({
                ...s,
                sleep: toggleArrayItem(s.sleep, value, checked),
              }));
            }}
          />
          <CheckboxGroup
            label="Housing"
            options={HOUSING_SITUATIONS.map((h) => ({
              value: h,
              label: HOUSING_SITUATION_LABELS[h],
            }))}
            selected={state.housing ? [state.housing] : []}
            onChange={(value, checked) => {
              setIsDirty(true);
              setState((s) => ({ ...s, housing: checked ? value : "" }));
            }}
          />
          <CheckboxGroup
            label="How are you doing in your head?"
            options={MENTAL_HEALTH_OPTIONS.map((m) => ({
              value: m,
              label: MENTAL_HEALTH_OPTION_LABELS[m],
            }))}
            selected={state.mentalHealth}
            onChange={(value, checked) => {
              setIsDirty(true);
              setState((s) => ({
                ...s,
                mentalHealth: toggleArrayItem(
                  s.mentalHealth,
                  value,
                  checked,
                ),
              }));
            }}
          />
          <CheckboxGroup
            label="Income"
            options={INCOME_SOURCES.map((i) => ({
              value: i,
              label: INCOME_SOURCE_LABELS[i],
            }))}
            selected={state.income}
            onChange={(value, checked) => {
              setIsDirty(true);
              setState((s) => ({
                ...s,
                income: toggleArrayItem(s.income, value, checked),
              }));
            }}
          />
          <CheckboxGroup
            label="Coping right now"
            options={COPING_OPTIONS.map((c) => ({
              value: c,
              label: COPING_OPTION_LABELS[c],
            }))}
            selected={state.coping}
            onChange={(value, checked) => {
              setIsDirty(true);
              setState((s) => ({
                ...s,
                coping: toggleArrayItem(s.coping, value, checked),
              }));
            }}
          />
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[color:var(--wtw-deep-gold)]">
              VA Care
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Enrollment">
                <Select
                  value={state.vaCare.enrollment}
                  onChange={(e) =>
                    setVaCare("enrollment", e.target.value)
                  }
                >
                  <option value="">—</option>
                  {VA_ENROLLMENTS.map((v) => (
                    <option key={v} value={v}>
                      {VA_ENROLLMENT_LABELS[v]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Rating">
                <Select
                  value={state.vaCare.rating}
                  onChange={(e) => setVaCare("rating", e.target.value)}
                >
                  <option value="">—</option>
                  {VA_RATING_STATUSES.map((v) => (
                    <option key={v} value={v}>
                      {VA_RATING_STATUS_LABELS[v]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Rating value (if any)" wide>
                <Input
                  value={state.vaCare.ratingValue}
                  onChange={(e) =>
                    setVaCare("ratingValue", e.target.value)
                  }
                  placeholder="e.g. 70%"
                />
              </Field>
              <Field label="Filed a claim before? Outcome?" wide>
                <Input
                  value={state.vaCare.priorClaimOutcome}
                  onChange={(e) =>
                    setVaCare("priorClaimOutcome", e.target.value)
                  }
                />
              </Field>
            </div>
          </div>
        </Grid>

        <Field
          label="What does a normal day look like? What&rsquo;s the hardest?"
          hint="Listen for: sleep, food, where they go, who they see, what's hard."
        >
          <Textarea
            rows={3}
            value={state.openQuestions.normalDay}
            onChange={(e) => setOpenQ("normalDay", e.target.value)}
          />
        </Field>
        <Field
          label="Anyone counting on you? Anyone you&rsquo;re counting on?"
          hint="Spouse, kids, parents, battle buddies."
        >
          <Textarea
            rows={2}
            value={state.openQuestions.countingOn}
            onChange={(e) => setOpenQ("countingOn", e.target.value)}
          />
        </Field>
        <Field
          label="What other support are you connected to right now?"
          hint="Other nonprofits, churches, recovery programs, case managers, family."
        >
          <Textarea
            rows={2}
            value={state.openQuestions.otherSupport}
            onChange={(e) => setOpenQ("otherSupport", e.target.value)}
          />
        </Field>
        <Field
          label="When you separated from service, how did you feel — physically, mentally, emotionally?"
          hint="Listen for gap between when service ended and when problems showed up."
        >
          <Textarea
            rows={2}
            value={state.openQuestions.feelingAtSeparation}
            onChange={(e) =>
              setOpenQ("feelingAtSeparation", e.target.value)
            }
          />
        </Field>
      </Section>

      <Section number="04" title="Documents & Handoff">
        <SubSection title="Document Inventory">
          <div className="space-y-3">
            {INTAKE_DOC_KEYS.map((key) => {
              const meta = INTAKE_DOC_LABELS[key];
              const cur = state.documents[key];
              return (
                <div
                  key={key}
                  className="rounded-md border border-border bg-card p-3"
                >
                  <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-start">
                    <div>
                      <p className="text-sm font-bold">{meta.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {meta.subtitle}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {DOC_STATUSES.map((s) => (
                        <label
                          key={s}
                          className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold ${
                            cur.status === s
                              ? "border-[color:var(--wtw-brand-gold)] bg-primary/20"
                              : "border-border bg-background"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`doc-${key}`}
                            value={s}
                            checked={cur.status === s}
                            onChange={() => updateDoc(key, { status: s })}
                            className="sr-only"
                          />
                          {DOC_STATUS_LABELS[s]}
                        </label>
                      ))}
                      <button
                        type="button"
                        onClick={() => updateDoc(key, { status: "" })}
                        className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                      >
                        clear
                      </button>
                    </div>
                    <Input
                      value={cur.notes}
                      onChange={(e) =>
                        updateDoc(key, { notes: e.target.value })
                      }
                      placeholder="Notes"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </SubSection>

        <SubSection title="Buddy Contacts">
          <p className="text-xs text-muted-foreground">
            Names and contact only. WTW does not collect statements.
          </p>
          <div className="space-y-2">
            {state.buddyContacts.map((b, idx) => (
              <div key={idx} className="grid gap-2 md:grid-cols-2">
                <Input
                  placeholder="Name"
                  value={b.name}
                  onChange={(e) =>
                    updateBuddyContact(idx, { name: e.target.value })
                  }
                />
                <Input
                  placeholder="How to reach"
                  value={b.howToReach}
                  onChange={(e) =>
                    updateBuddyContact(idx, { howToReach: e.target.value })
                  }
                />
              </div>
            ))}
            <button
              type="button"
              onClick={addBuddyContact}
              className="text-xs font-bold text-[color:var(--wtw-deep-gold)] underline-offset-4 hover:underline"
            >
              + Add another contact
            </button>
          </div>
        </SubSection>

        <SubSection title="VSO Best Fit">
          <CheckboxGroup
            label=""
            columns={3}
            options={VSO_BEST_FIT_TYPES.map((t) => ({
              value: t,
              label: VSO_BEST_FIT_LABELS[t],
            }))}
            selected={state.vsoBestFit.types}
            onChange={(value, checked) =>
              setVso(
                "types",
                toggleArrayItem(state.vsoBestFit.types, value, checked),
              )
            }
          />
          <Grid cols={2}>
            <Field label="State-specific. Lives in:">
              <Input
                value={state.vsoBestFit.stateLivesIn}
                onChange={(e) => setVso("stateLivesIn", e.target.value)}
              />
            </Field>
            <Field label="Specialized">
              <Input
                value={state.vsoBestFit.specialized}
                onChange={(e) => setVso("specialized", e.target.value)}
              />
            </Field>
          </Grid>
        </SubSection>

        <SubSection title="Liaison Notes & Handoff">
          <Field
            label="Threads worth following — where service experience and current symptoms connect"
            hint="Example: &ldquo;Served around burn pits. Has chronic cough. Hasn't seen a doctor since 2019.&rdquo;"
          >
            <Textarea
              rows={3}
              value={state.liaisonHandoff.threadsWorthFollowing}
              onChange={(e) =>
                setHandoff("threadsWorthFollowing", e.target.value)
              }
            />
          </Field>
          <Field
            label="Urgency? Anything the VSO needs to know first?"
            hint="Imminent housing loss, medication out, mental health concern, time-sensitive evidence."
          >
            <Textarea
              rows={2}
              value={state.liaisonHandoff.urgency}
              onChange={(e) => setHandoff("urgency", e.target.value)}
            />
          </Field>
        </SubSection>

        <SubSection title="Next Contact">
          <Grid cols={3}>
            <Field label="When">
              <Input
                value={state.nextContact.when}
                onChange={(e) => setNextContact("when", e.target.value)}
              />
            </Field>
            <Field label="Where">
              <Input
                value={state.nextContact.where}
                onChange={(e) => setNextContact("where", e.target.value)}
              />
            </Field>
            <Field label="How">
              <Input
                value={state.nextContact.how}
                onChange={(e) => setNextContact("how", e.target.value)}
              />
            </Field>
          </Grid>
        </SubSection>

        <SubSection title="Veteran Liaison">
          <Field label="Liaison name">
            <Input
              value={state.liaisonSignature.name}
              onChange={(e) => {
                setIsDirty(true);
                setState((s) => ({
                  ...s,
                  liaisonSignature: { name: e.target.value },
                }));
              }}
            />
          </Field>
        </SubSection>
      </Section>

      {serverError && (
        <p className="text-sm text-destructive">{serverError}</p>
      )}
      {serverSuccess && (
        <p className="text-sm text-[color:var(--wtw-deep-gold)]">
          {serverSuccess}
        </p>
      )}

      <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 px-6 py-4 backdrop-blur">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-bold transition-colors hover:bg-secondary disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save draft"}
        </button>
        <span
          className="text-xs text-muted-foreground"
          aria-live="polite"
        >
          {isDirty
            ? "Unsaved changes…"
            : lastSavedAt
              ? `Last saved ${lastSavedAt.toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : "Not yet saved"}
        </span>
        <button
          type="button"
          onClick={onMarkComplete}
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
        >
          Mark complete
        </button>
        <button
          type="button"
          onClick={() => router.push(`/veterans/${veteranId}`)}
          className="text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          Back to veteran
        </button>
      </div>
    </form>
  );
}

// -------- presentational helpers --------

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div className="rounded-lg bg-gradient-to-r from-[color:var(--wtw-deep-gold)]/30 to-[color:var(--wtw-brand-gold)]/30 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          Section {number}
        </p>
        <h2 className="text-2xl font-black tracking-tight">{title}</h2>
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <h3 className="rounded-md bg-[color:var(--wtw-brand-gold)]/20 px-3 py-2 text-sm font-bold">
        {title}
      </h3>
      <div className="space-y-4 pl-1">{children}</div>
    </div>
  );
}

function Grid({
  cols,
  children,
}: {
  cols: 2 | 3;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`grid gap-4 ${cols === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${wide ? "md:col-span-2" : ""}`}>
      {label && (
        <label
          className="block text-sm font-bold"
          dangerouslySetInnerHTML={{ __html: label }}
        />
      )}
      {children}
      {hint && (
        <p
          className="text-xs text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: hint }}
        />
      )}
    </div>
  );
}

function CheckboxGroup({
  label,
  options,
  selected,
  onChange,
  columns,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (value: string, checked: boolean) => void;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div className="space-y-2">
      {label && (
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[color:var(--wtw-deep-gold)]">
          {label}
        </p>
      )}
      <div
        className={`grid gap-2 ${
          columns === 4
            ? "sm:grid-cols-2 md:grid-cols-4"
            : columns === 3
              ? "sm:grid-cols-2 md:grid-cols-3"
              : "sm:grid-cols-2"
        }`}
      >
        {options.map((o) => {
          const checked = selected.includes(o.value);
          return (
            <label
              key={o.value}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${
                checked
                  ? "border-[color:var(--wtw-brand-gold)] bg-primary/15"
                  : "border-border bg-background"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(o.value, e.target.checked)}
                className="accent-[color:var(--wtw-brand-gold)]"
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function FrequencyField<T extends string>({
  label,
  hint,
  labels,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  labels: Record<T, string>;
  value: string;
  onChange: (value: string) => void;
}) {
  const keys = Object.keys(labels) as T[];
  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-3">
      <p className="text-sm font-bold">{label}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {keys.map((k) => {
          const checked = value === k;
          return (
            <label
              key={k}
              className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold ${
                checked
                  ? "border-[color:var(--wtw-brand-gold)] bg-primary/20"
                  : "border-border bg-background"
              }`}
            >
              <input
                type="radio"
                checked={checked}
                onChange={() => onChange(k)}
                className="sr-only"
              />
              {labels[k]}
            </label>
          );
        })}
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
          >
            clear
          </button>
        )}
      </div>
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

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputClasses} />;
}

export type { IntakeDocItem };
