import { z } from "zod";
import { DISCHARGE_STATUSES } from "./veteran";

// Branches: superset of veteran schema's branches; covers National Guard +
// Reserves which appear on the intake form but not the veteran schema.
export const INTAKE_BRANCHES = [
  "army",
  "navy",
  "air_force",
  "marines",
  "coast_guard",
  "space_force",
  "national_guard",
  "reserves",
] as const;
export type IntakeBranch = (typeof INTAKE_BRANCHES)[number];
export const INTAKE_BRANCH_LABELS: Record<IntakeBranch, string> = {
  army: "Army",
  navy: "Navy",
  air_force: "Air Force",
  marines: "Marines",
  coast_guard: "Coast Guard",
  space_force: "Space Force",
  national_guard: "National Guard",
  reserves: "Reserves",
};

const STANDARD_FREQUENCIES = [
  "daily",
  "weekly",
  "sometimes",
  "not_really",
] as const;
export type StandardFrequency = (typeof STANDARD_FREQUENCIES)[number];
export const STANDARD_FREQUENCY_LABELS: Record<StandardFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  sometimes: "Sometimes",
  not_really: "Not really",
};

const SKIN_FREQUENCIES = [
  "ongoing",
  "comes_and_go",
  "sometimes",
  "not_really",
] as const;
export type SkinFrequency = (typeof SKIN_FREQUENCIES)[number];
export const SKIN_FREQUENCY_LABELS: Record<SkinFrequency, string> = {
  ongoing: "Ongoing",
  comes_and_go: "Comes & go",
  sometimes: "Sometimes",
  not_really: "Not really",
};

const HEARING_FREQUENCIES = [
  "constant",
  "daily",
  "sometimes",
  "not_really",
] as const;
export type HearingFrequency = (typeof HEARING_FREQUENCIES)[number];
export const HEARING_FREQUENCY_LABELS: Record<HearingFrequency, string> = {
  constant: "Constant",
  daily: "Daily",
  sometimes: "Sometimes",
  not_really: "Not really",
};

export const SLEEP_OPTIONS = [
  "trouble_falling_asleep",
  "nightmares",
  "sleep_too_much",
  "wake_up_a_lot",
  "wake_up_tired_anyway",
  "sleep_is_fine",
] as const;
export type SleepOption = (typeof SLEEP_OPTIONS)[number];
export const SLEEP_OPTION_LABELS: Record<SleepOption, string> = {
  trouble_falling_asleep: "Trouble falling asleep",
  nightmares: "Nightmares",
  sleep_too_much: "Sleep too much",
  wake_up_a_lot: "Wake up a lot",
  wake_up_tired_anyway: "Wake up tired anyway",
  sleep_is_fine: "Sleep is fine",
};

export const MENTAL_HEALTH_OPTIONS = [
  "on_edge_a_lot",
  "sad_most_days",
  "avoid_places_people",
  "hard_around_people",
  "guilt_that_wont_go",
  "hard_to_feel_anything",
  "angry_easily",
  "reminders_set_me_off",
  "trouble_trusting",
  "doing_okay",
] as const;
export type MentalHealthOption = (typeof MENTAL_HEALTH_OPTIONS)[number];
export const MENTAL_HEALTH_OPTION_LABELS: Record<MentalHealthOption, string> =
  {
    on_edge_a_lot: "On edge a lot",
    sad_most_days: "Sad most days",
    avoid_places_people: "Avoid places/people",
    hard_around_people: "Hard around people",
    guilt_that_wont_go: "Guilt that won't go",
    hard_to_feel_anything: "Hard to feel anything",
    angry_easily: "Angry easily",
    reminders_set_me_off: "Reminders set me off",
    trouble_trusting: "Trouble trusting",
    doing_okay: "Doing okay",
  };

export const COPING_OPTIONS = [
  "alcohol",
  "cannabis",
  "other_substances",
  "prescription_meds",
  "isolation",
  "coping_okay",
] as const;
export type CopingOption = (typeof COPING_OPTIONS)[number];
export const COPING_OPTION_LABELS: Record<CopingOption, string> = {
  alcohol: "Alcohol",
  cannabis: "Cannabis",
  other_substances: "Other substances",
  prescription_meds: "Prescription meds",
  isolation: "Isolation",
  coping_okay: "Coping okay",
};

export const HOUSING_SITUATIONS = [
  "unsheltered",
  "shelter",
  "couch_surfing",
  "vehicle",
  "renting",
  "own_home",
  "transitional",
  "other",
] as const;
export type HousingSituation = (typeof HOUSING_SITUATIONS)[number];
export const HOUSING_SITUATION_LABELS: Record<HousingSituation, string> = {
  unsheltered: "Outside / unsheltered",
  shelter: "Shelter",
  couch_surfing: "Couch surfing",
  vehicle: "Vehicle",
  renting: "Renting",
  own_home: "Own home",
  transitional: "Transitional",
  other: "Other",
};

export const INCOME_SOURCES = [
  "working",
  "ssdi_ssi",
  "va_pension",
  "unable_to_work",
  "family_helping",
  "no_income",
] as const;
export type IncomeSource = (typeof INCOME_SOURCES)[number];
export const INCOME_SOURCE_LABELS: Record<IncomeSource, string> = {
  working: "Working",
  ssdi_ssi: "SSDI / SSI",
  va_pension: "VA pension",
  unable_to_work: "Unable to work",
  family_helping: "Family helping",
  no_income: "No income",
};

export const VA_ENROLLMENTS = ["enrolled", "not_enrolled", "not_sure"] as const;
export type VaEnrollment = (typeof VA_ENROLLMENTS)[number];
export const VA_ENROLLMENT_LABELS: Record<VaEnrollment, string> = {
  enrolled: "Enrolled",
  not_enrolled: "Not enrolled",
  not_sure: "Not sure",
};

export const VA_RATING_STATUSES = ["no_rating", "has_rating", "not_sure"] as const;
export type VaRatingStatus = (typeof VA_RATING_STATUSES)[number];
export const VA_RATING_STATUS_LABELS: Record<VaRatingStatus, string> = {
  no_rating: "No rating",
  has_rating: "Has rating",
  not_sure: "Not sure",
};

export const DOC_STATUSES = ["has", "lacks", "working"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];
export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  has: "Has",
  lacks: "Lacks",
  working: "Working",
};

export const INTAKE_DOC_KEYS = [
  "dd214",
  "serviceMedicalRecords",
  "vaCFile",
  "priorVADecisionLetters",
  "civilianMedicalRecords",
  "marriageDivorceDocs",
  "photoIdSsn",
  "awardsCitationsOrders",
] as const;
export type IntakeDocKey = (typeof INTAKE_DOC_KEYS)[number];
export const INTAKE_DOC_LABELS: Record<
  IntakeDocKey,
  { title: string; subtitle: string }
> = {
  dd214: { title: "DD-214", subtitle: "Separation papers" },
  serviceMedicalRecords: {
    title: "Service Medical Records",
    subtitle: "From time in service",
  },
  vaCFile: { title: "VA C-File", subtitle: "Claim file from prior filings" },
  priorVADecisionLetters: {
    title: "Prior VA Decision Letters",
    subtitle: "Awards or denials",
  },
  civilianMedicalRecords: {
    title: "Civilian Medical Records",
    subtitle: "Treatment after separation",
  },
  marriageDivorceDocs: {
    title: "Marriage / Divorce / Dependent Docs",
    subtitle: "For dependency claims",
  },
  photoIdSsn: {
    title: "Photo ID / SSN Card",
    subtitle: "For VA enrollment and appointments",
  },
  awardsCitationsOrders: {
    title: "Awards, Citations, Deployment Orders",
    subtitle: "Any service documentation",
  },
};

export const VSO_BEST_FIT_TYPES = [
  "county_vso",
  "dva",
  "vfw",
  "american_legion",
  "state",
  "specialized",
] as const;
export type VsoBestFitType = (typeof VSO_BEST_FIT_TYPES)[number];
export const VSO_BEST_FIT_LABELS: Record<VsoBestFitType, string> = {
  county_vso: "County VSO",
  dva: "DVA",
  vfw: "VFW",
  american_legion: "American Legion",
  state: "State-specific",
  specialized: "Specialized",
};

export const INTAKE_STATUSES = ["draft", "complete"] as const;
export const intakeStatusSchema = z.enum(INTAKE_STATUSES);
export type IntakeStatus = z.infer<typeof intakeStatusSchema>;

const docItemSchema = z.object({
  status: z.enum(DOC_STATUSES).nullable().default(null),
  notes: z.string().optional(),
});
export type IntakeDocItem = z.infer<typeof docItemSchema>;

const buddyContactSchema = z.object({
  name: z.string().optional(),
  howToReach: z.string().optional(),
});
export type IntakeBuddyContact = z.infer<typeof buddyContactSchema>;

export const intakeSchema = z.object({
  id: z.string(),
  veteranId: z.string(),
  liaisonUid: z.string(),
  status: intakeStatusSchema,
  completedAt: z.date().nullable().default(null),

  // Section 01 — General Information
  basics: z
    .object({
      fullName: z.string().optional(),
      dateOfBirth: z.string().optional(),
      bestPhone: z.string().optional(),
      bestEmail: z.string().optional(),
      currentLocation: z.string().optional(),
      bestWayToReach: z.string().optional(),
    })
    .default({}),

  service: z
    .object({
      branches: z.array(z.enum(INTAKE_BRANCHES)).default([]),
      yearsServed: z.string().optional(),
      rankAtDischarge: z.string().optional(),
      mos: z.string().optional(),
      // Same enum as veteran.dischargeStatus so the sync is lossless.
      dischargeStatus: z.enum(DISCHARGE_STATUSES).nullable().default(null),
      placesServed: z.string().optional(),
      combatExperience: z.string().optional(),
      proudOf: z.string().optional(),
    })
    .default({ branches: [], dischargeStatus: null }),

  // Section 02 — What Happened & Your Body
  bodyDuringService: z
    .object({
      injuries: z.string().optional(),
      concussions: z.string().optional(),
      exposures: z.string().optional(),
      traumaStillWithYou: z.string().optional(),
    })
    .default({}),

  bodyToday: z
    .object({
      headBrainMemory: z.enum(STANDARD_FREQUENCIES).nullable().default(null),
      vision: z.enum(STANDARD_FREQUENCIES).nullable().default(null),
      backNeckSpine: z.enum(STANDARD_FREQUENCIES).nullable().default(null),
      breathing: z.enum(STANDARD_FREQUENCIES).nullable().default(null),
      kneesAnklesFeet: z.enum(STANDARD_FREQUENCIES).nullable().default(null),
      stomach: z.enum(STANDARD_FREQUENCIES).nullable().default(null),
      shoulders: z.enum(STANDARD_FREQUENCIES).nullable().default(null),
      skin: z.enum(SKIN_FREQUENCIES).nullable().default(null),
      hearing: z.enum(HEARING_FREQUENCIES).nullable().default(null),
      other: z.string().optional(),
      dailyLifeImpact: z.string().optional(),
    })
    .default({
      headBrainMemory: null,
      vision: null,
      backNeckSpine: null,
      breathing: null,
      kneesAnklesFeet: null,
      stomach: null,
      shoulders: null,
      skin: null,
      hearing: null,
    }),

  // Section 03 — Mind, Daily Life, & Care
  sleep: z.array(z.enum(SLEEP_OPTIONS)).default([]),
  mentalHealth: z.array(z.enum(MENTAL_HEALTH_OPTIONS)).default([]),
  coping: z.array(z.enum(COPING_OPTIONS)).default([]),
  housing: z.enum(HOUSING_SITUATIONS).nullable().default(null),
  housingOther: z.string().optional(),
  income: z.array(z.enum(INCOME_SOURCES)).default([]),
  vaCare: z
    .object({
      enrollment: z.enum(VA_ENROLLMENTS).nullable().default(null),
      rating: z.enum(VA_RATING_STATUSES).nullable().default(null),
      ratingValue: z.string().optional(),
      priorClaimOutcome: z.string().optional(),
    })
    .default({ enrollment: null, rating: null }),
  openQuestions: z
    .object({
      normalDay: z.string().optional(),
      countingOn: z.string().optional(),
      otherSupport: z.string().optional(),
      feelingAtSeparation: z.string().optional(),
    })
    .default({}),

  // Section 04 — Documents & Handoff
  documents: z
    .object({
      dd214: docItemSchema,
      serviceMedicalRecords: docItemSchema,
      vaCFile: docItemSchema,
      priorVADecisionLetters: docItemSchema,
      civilianMedicalRecords: docItemSchema,
      marriageDivorceDocs: docItemSchema,
      photoIdSsn: docItemSchema,
      awardsCitationsOrders: docItemSchema,
    })
    .default({
      dd214: { status: null },
      serviceMedicalRecords: { status: null },
      vaCFile: { status: null },
      priorVADecisionLetters: { status: null },
      civilianMedicalRecords: { status: null },
      marriageDivorceDocs: { status: null },
      photoIdSsn: { status: null },
      awardsCitationsOrders: { status: null },
    }),

  buddyContacts: z.array(buddyContactSchema).default([]),

  vsoBestFit: z
    .object({
      types: z.array(z.enum(VSO_BEST_FIT_TYPES)).default([]),
      stateLivesIn: z.string().optional(),
      specialized: z.string().optional(),
    })
    .default({ types: [] }),

  liaisonHandoff: z
    .object({
      threadsWorthFollowing: z.string().optional(),
      urgency: z.string().optional(),
    })
    .default({}),

  nextContact: z
    .object({
      when: z.string().optional(),
      where: z.string().optional(),
      how: z.string().optional(),
    })
    .default({}),

  liaisonSignature: z
    .object({
      name: z.string().optional(),
      signedAt: z.date().nullable().default(null),
    })
    .default({ signedAt: null }),

  createdBy: z.string(),
  createdAt: z.date(),
  updatedBy: z.string(),
  updatedAt: z.date(),
});
export type Intake = z.infer<typeof intakeSchema>;

export const intakeInputSchema = intakeSchema.omit({
  id: true,
  veteranId: true,
  liaisonUid: true,
  status: true,
  completedAt: true,
  createdBy: true,
  createdAt: true,
  updatedBy: true,
  updatedAt: true,
});
export type IntakeInput = z.infer<typeof intakeInputSchema>;
