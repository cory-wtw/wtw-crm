import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  COPING_OPTION_LABELS,
  type CopingOption,
  DISCHARGE_STATUS_LABELS,
  DOC_STATUS_LABELS,
  HEARING_FREQUENCY_LABELS,
  HOUSING_SITUATION_LABELS,
  INCOME_SOURCE_LABELS,
  type IncomeSource,
  INTAKE_BRANCH_LABELS,
  type IntakeBranch,
  INTAKE_DOC_KEYS,
  INTAKE_DOC_LABELS,
  type IntakeDocKey,
  MENTAL_HEALTH_OPTION_LABELS,
  type MentalHealthOption,
  SKIN_FREQUENCY_LABELS,
  SLEEP_OPTION_LABELS,
  type SleepOption,
  STANDARD_FREQUENCY_LABELS,
  VA_ENROLLMENT_LABELS,
  VA_RATING_STATUS_LABELS,
  VSO_BEST_FIT_LABELS,
  type VsoBestFitType,
} from "@/lib/schemas";
import type { Intake } from "@/lib/schemas";

// Brand palette + Helvetica fallback (Source Sans 3 would be a follow-up;
// react-pdf's built-in Helvetica reads close enough for v1 PDFs).
const COLORS = {
  cream: "#F3F3E6",
  brandGold: "#D2A63C",
  goldLight: "#EECD5C",
  deepGold: "#BB8525",
  nearBlack: "#1D1912",
  muted: "#6b6354",
  border: "#d9d6c2",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 60,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: COLORS.nearBlack,
    backgroundColor: "#FFFFFF",
  },
  header: {
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.deepGold,
    borderBottomStyle: "solid",
  },
  eyebrow: {
    fontSize: 8,
    color: COLORS.deepGold,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    color: COLORS.nearBlack,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  sub: {
    fontSize: 9,
    color: COLORS.muted,
  },
  sectionBar: {
    backgroundColor: COLORS.brandGold,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 12,
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 8,
    color: "#FFFFFF",
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 14,
    color: "#FFFFFF",
    fontFamily: "Helvetica-Bold",
  },
  subsectionBar: {
    backgroundColor: COLORS.goldLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
    marginBottom: 4,
  },
  subsectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    marginBottom: 4,
  },
  label: {
    width: 130,
    fontSize: 7,
    color: COLORS.muted,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingRight: 8,
  },
  value: {
    flex: 1,
    fontSize: 10,
    color: COLORS.nearBlack,
  },
  longBlock: {
    marginBottom: 6,
  },
  longLabel: {
    fontSize: 7,
    color: COLORS.muted,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  longValue: {
    fontSize: 10,
    lineHeight: 1.4,
    color: COLORS.nearBlack,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
  },
  docName: { flex: 2, paddingRight: 8 },
  docStatus: { width: 60, fontFamily: "Helvetica-Bold" },
  docNotes: { flex: 2, color: COLORS.muted },
  bullet: {
    fontSize: 10,
    color: COLORS.nearBlack,
    marginRight: 6,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 7,
    color: COLORS.muted,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
    borderTopStyle: "solid",
    paddingTop: 6,
  },
});

function dash(v: string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s.length === 0 ? "—" : s;
}

function joinLabels<T extends string>(
  values: T[],
  labels: Record<T, string>,
): string {
  if (!values || values.length === 0) return "—";
  return values.map((v) => labels[v]).join(", ");
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{dash(value)}</Text>
    </View>
  );
}

function LongBlock({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <View style={styles.longBlock}>
      <Text style={styles.longLabel}>{label}</Text>
      <Text style={styles.longValue}>{dash(value)}</Text>
    </View>
  );
}

function SectionBar({ number, title }: { number: string; title: string }) {
  return (
    <View style={styles.sectionBar}>
      <Text style={styles.sectionLabel}>Section {number}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function SubsectionBar({ title }: { title: string }) {
  return (
    <View style={styles.subsectionBar}>
      <Text style={styles.subsectionTitle}>{title.toUpperCase()}</Text>
    </View>
  );
}

function PageFooter({
  veteranName,
  pageNumber,
  totalPages,
}: {
  veteranName: string;
  pageNumber: string;
  totalPages?: string;
}) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        Worth Their Weight Life & Service Intake · {veteranName} ·
        501(c)(3) status pending · EIN 41-5275144
      </Text>
      <Text style={{ marginTop: 2 }}>
        Worth Their Weight is not a law firm and does not provide legal
        representation before the U.S. Department of Veterans Affairs. All
        claims-related services are performed by VA-accredited attorneys,
        agents, or Veterans Service Organizations.
      </Text>
      <Text style={{ marginTop: 4, textAlign: "right" }}>
        Page {pageNumber}
        {totalPages ? ` of ${totalPages}` : ""}
      </Text>
    </View>
  );
}

export function IntakePdf({
  intake,
  veteranName,
  liaisonName,
  completedAtLabel,
}: {
  intake: Intake;
  veteranName: string;
  liaisonName: string;
  completedAtLabel: string;
}) {
  return (
    <Document title={`WTW Intake — ${veteranName}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>LIFE & SERVICE INTAKE</Text>
          <Text style={styles.title}>Tell us your story.</Text>
          <Text style={styles.sub}>A conversation. Not a form.</Text>
          <View style={{ marginTop: 8 }}>
            <Row label="Veteran" value={veteranName} />
            <Row label="Liaison" value={liaisonName} />
            <Row label="Date" value={completedAtLabel} />
            <Row
              label="Status"
              value={
                intake.status === "complete" ? "Complete" : "Draft"
              }
            />
          </View>
        </View>

        <SectionBar number="01" title="General Information" />
        <SubsectionBar title="The Basics" />
        <Row label="Full name" value={intake.basics.fullName} />
        <Row label="Date of birth" value={intake.basics.dateOfBirth} />
        <Row label="Best phone" value={intake.basics.bestPhone} />
        <Row label="Best email" value={intake.basics.bestEmail} />
        <Row
          label="Where staying"
          value={intake.basics.currentLocation}
        />
        <Row
          label="Best way to reach"
          value={intake.basics.bestWayToReach}
        />

        <SubsectionBar title="Your Service" />
        <Row
          label="Branch"
          value={joinLabels(
            intake.service.branches as IntakeBranch[],
            INTAKE_BRANCH_LABELS,
          )}
        />
        <Row label="Years served" value={intake.service.yearsServed} />
        <Row
          label="Rank at discharge"
          value={intake.service.rankAtDischarge}
        />
        <Row label="MOS / Job" value={intake.service.mos} />
        <Row
          label="Discharge status"
          value={
            intake.service.dischargeStatus
              ? DISCHARGE_STATUS_LABELS[intake.service.dischargeStatus]
              : null
          }
        />
        <LongBlock
          label="Where did you serve?"
          value={intake.service.placesServed}
        />
        <LongBlock
          label="Combat or hostile fire"
          value={intake.service.combatExperience}
        />
        <LongBlock
          label="Proud of"
          value={intake.service.proudOf}
        />

        <PageFooter
          veteranName={veteranName}
          pageNumber="01"
        />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <SectionBar number="02" title="What Happened & Your Body" />

        <SubsectionBar title="During Service" />
        <LongBlock
          label="Injuries"
          value={intake.bodyDuringService.injuries}
        />
        <LongBlock
          label="Concussions / TBI"
          value={intake.bodyDuringService.concussions}
        />
        <LongBlock
          label="Hazardous exposures"
          value={intake.bodyDuringService.exposures}
        />
        <LongBlock
          label="Trauma still with you"
          value={intake.bodyDuringService.traumaStillWithYou}
        />

        <SubsectionBar title="Body Today" />
        <Row
          label="Head / brain / memory"
          value={
            intake.bodyToday.headBrainMemory
              ? STANDARD_FREQUENCY_LABELS[intake.bodyToday.headBrainMemory]
              : null
          }
        />
        <Row
          label="Vision"
          value={
            intake.bodyToday.vision
              ? STANDARD_FREQUENCY_LABELS[intake.bodyToday.vision]
              : null
          }
        />
        <Row
          label="Back / neck / spine"
          value={
            intake.bodyToday.backNeckSpine
              ? STANDARD_FREQUENCY_LABELS[intake.bodyToday.backNeckSpine]
              : null
          }
        />
        <Row
          label="Breathing"
          value={
            intake.bodyToday.breathing
              ? STANDARD_FREQUENCY_LABELS[intake.bodyToday.breathing]
              : null
          }
        />
        <Row
          label="Knees / ankles / feet"
          value={
            intake.bodyToday.kneesAnklesFeet
              ? STANDARD_FREQUENCY_LABELS[intake.bodyToday.kneesAnklesFeet]
              : null
          }
        />
        <Row
          label="Stomach"
          value={
            intake.bodyToday.stomach
              ? STANDARD_FREQUENCY_LABELS[intake.bodyToday.stomach]
              : null
          }
        />
        <Row
          label="Shoulders / hands"
          value={
            intake.bodyToday.shoulders
              ? STANDARD_FREQUENCY_LABELS[intake.bodyToday.shoulders]
              : null
          }
        />
        <Row
          label="Skin"
          value={
            intake.bodyToday.skin
              ? SKIN_FREQUENCY_LABELS[intake.bodyToday.skin]
              : null
          }
        />
        <Row
          label="Hearing"
          value={
            intake.bodyToday.hearing
              ? HEARING_FREQUENCY_LABELS[intake.bodyToday.hearing]
              : null
          }
        />
        <LongBlock
          label="Other body issues"
          value={intake.bodyToday.other}
        />
        <LongBlock
          label="Daily life impact"
          value={intake.bodyToday.dailyLifeImpact}
        />

        <PageFooter
          veteranName={veteranName}
          pageNumber="02"
        />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <SectionBar number="03" title="Mind, Daily Life, & Care" />

        <Row
          label="Sleep"
          value={joinLabels(
            intake.sleep as SleepOption[],
            SLEEP_OPTION_LABELS,
          )}
        />
        <Row
          label="Mental health"
          value={joinLabels(
            intake.mentalHealth as MentalHealthOption[],
            MENTAL_HEALTH_OPTION_LABELS,
          )}
        />
        <Row
          label="Coping"
          value={joinLabels(
            intake.coping as CopingOption[],
            COPING_OPTION_LABELS,
          )}
        />
        <Row
          label="Housing"
          value={
            intake.housing ? HOUSING_SITUATION_LABELS[intake.housing] : null
          }
        />
        <Row
          label="Income"
          value={joinLabels(
            intake.income as IncomeSource[],
            INCOME_SOURCE_LABELS,
          )}
        />

        <SubsectionBar title="VA Care" />
        <Row
          label="Enrollment"
          value={
            intake.vaCare.enrollment
              ? VA_ENROLLMENT_LABELS[intake.vaCare.enrollment]
              : null
          }
        />
        <Row
          label="Rating status"
          value={
            intake.vaCare.rating
              ? VA_RATING_STATUS_LABELS[intake.vaCare.rating]
              : null
          }
        />
        <Row label="Rating value" value={intake.vaCare.ratingValue} />
        <Row
          label="Prior claim outcome"
          value={intake.vaCare.priorClaimOutcome}
        />

        <SubsectionBar title="Open Questions" />
        <LongBlock
          label="Normal day / hardest"
          value={intake.openQuestions.normalDay}
        />
        <LongBlock
          label="Counting on / counted on"
          value={intake.openQuestions.countingOn}
        />
        <LongBlock
          label="Other support"
          value={intake.openQuestions.otherSupport}
        />
        <LongBlock
          label="At separation"
          value={intake.openQuestions.feelingAtSeparation}
        />

        <PageFooter
          veteranName={veteranName}
          pageNumber="03"
        />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <SectionBar number="04" title="Documents & Handoff" />

        <SubsectionBar title="Document Inventory" />
        {INTAKE_DOC_KEYS.map((key) => {
          const item = intake.documents[key as IntakeDocKey];
          const meta = INTAKE_DOC_LABELS[key as IntakeDocKey];
          return (
            <View style={styles.docRow} key={key}>
              <View style={styles.docName}>
                <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>
                  {meta.title}
                </Text>
                <Text style={{ fontSize: 8, color: COLORS.muted }}>
                  {meta.subtitle}
                </Text>
              </View>
              <Text style={styles.docStatus}>
                {item.status ? DOC_STATUS_LABELS[item.status] : "—"}
              </Text>
              <Text style={styles.docNotes}>{dash(item.notes)}</Text>
            </View>
          );
        })}

        <SubsectionBar title="Buddy Contacts" />
        {intake.buddyContacts.length === 0 ? (
          <Text style={{ fontSize: 10, color: COLORS.muted }}>—</Text>
        ) : (
          intake.buddyContacts.map((b, i) => (
            <Row
              key={i}
              label={b.name || `Contact ${i + 1}`}
              value={b.howToReach}
            />
          ))
        )}

        <SubsectionBar title="VSO Best Fit" />
        <Row
          label="Types"
          value={joinLabels(
            intake.vsoBestFit.types as VsoBestFitType[],
            VSO_BEST_FIT_LABELS,
          )}
        />
        <Row label="State (lives in)" value={intake.vsoBestFit.stateLivesIn} />
        <Row label="Specialized" value={intake.vsoBestFit.specialized} />

        <SubsectionBar title="Liaison Notes" />
        <LongBlock
          label="Threads worth following"
          value={intake.liaisonHandoff.threadsWorthFollowing}
        />
        <LongBlock label="Urgency" value={intake.liaisonHandoff.urgency} />

        <SubsectionBar title="Next Contact" />
        <Row label="When" value={intake.nextContact.when} />
        <Row label="Where" value={intake.nextContact.where} />
        <Row label="How" value={intake.nextContact.how} />

        <SubsectionBar title="Veteran Liaison" />
        <Row label="Liaison name" value={liaisonName} />
        <Row
          label="Signature / printed"
          value={intake.liaisonSignature.name}
        />
        <Row label="Date" value={completedAtLabel} />

        <PageFooter
          veteranName={veteranName}
          pageNumber="04"
        />
      </Page>
    </Document>
  );
}
