/**
 * The Roster MCP server: lets Claude look things up and propose changes.
 *
 * Read tools read. Every write tool only queues a change request — nothing on
 * a veteran, VSO, resource, timeline or the books moves until an admin
 * approves it on Admin → Claude changes. There is no approve tool and no
 * delete tool, by design: approval lives behind a signed-in admin session in
 * the browser, which this server never has.
 */

import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listEncounters } from "@/lib/db/encounters";
import { listCategories, listTransactions } from "@/lib/db/finance";
import { getResource, listResources } from "@/lib/db/resources";
import { listUsers } from "@/lib/db/users";
import { getVeteran, listVeterans } from "@/lib/db/veterans";
import { getVso, listVsos } from "@/lib/db/vsos";
import {
  RESOURCE_FIELDS,
  TRANSACTION_FIELDS,
  VETERAN_FIELDS,
  VSO_FIELDS,
} from "@/lib/change-requests";
import {
  getChangeRequest,
  listChangeRequests,
  proposeFields,
  proposeFollowUp,
  proposeIntake,
  proposeOutcome,
  proposeChecklist,
  proposeReferral,
  withdrawChange,
  type ProposeResult,
  type Proposer,
} from "@/lib/change-requests-apply";
import { matchIntake } from "@/lib/ops/concierge";
import {
  ACCESS_METHODS,
  BUCKET_CODES,
  CHANGE_REQUEST_STATUSES,
  CHECKLIST_PRESETS,
  CONTACT_METHODS,
  DEPENDENTS_ANSWERS,
  DISCHARGE_CHARACTERS,
  FOLLOW_UP_OUTCOMES,
  GEO_SCOPES,
  HOUSING_STATUSES,
  ID_STATUSES,
  OUTCOME_KINDS,
  OUTCOME_KIND_INFO,
  WTW_ROLES,
  WTW_ROLE_LABELS,
  PARTNERSHIP_STATUSES,
  PENDING_PREFIX,
  PIPELINE_STAGES,
  POPULATIONS,
  PREFERRED_CONTACT_METHODS,
  RECEIVING_VA_BENEFITS,
  SERVICE_ERAS,
  TYPICAL_WAITS,
  VERIFICATION_STATUSES,
  type ChangeRequest,
} from "@/lib/schemas";

const NEVER_STORED =
  "Never record claim history, conditions, diagnoses, income, or the full last name — the Roster does not store those, ever.";

const VETERAN_FIELD_HELP = `Fields: ${VETERAN_FIELDS.join(", ")}.
- firstName (required on create), lastInitial (one letter)
- preferredContact: ${PREFERRED_CONTACT_METHODS.join(" | ")} — phone and text need a phone number, email needs an email
- hardToReach (boolean): no steady phone, only on Wi-Fi, moves around; contactNotes: one line on how to reach them ("Only gets texts on Wi-Fi")
- birthYear (number), city, state (2 letters), zip
- dischargeCharacter: ${DISCHARGE_CHARACTERS.join(" | ")}; serviceEra: ${SERVICE_ERAS.join(" | ")}
- idStatus: ${ID_STATUSES.join(" | ")}; hasDependents: ${DEPENDENTS_ANSWERS.join(" | ")}
- pipelineStage: ${PIPELINE_STAGES.join(" | ")} (the VA claim pipeline)
- monthlyBenefitBefore / monthlyBenefitAfter: VA dollars per month
- vsoIds: VSO ids (search_vsos); assigneeUid: staff uid (list_staff); eight00ThreadId: id from an 800.com inbox URL
Null clears dischargeCharacter, serviceEra, idStatus, hasDependents, zip, assigneeUid, eight00ThreadId; "" clears a text field.
${NEVER_STORED}`;

const VSO_FIELD_HELP = `Fields: ${VSO_FIELDS.join(", ")}.
- fullName (required on create), affiliation (DAV, VFW…), city, state, directPhone, directEmail, notes
- preferredContactMethod: ${CONTACT_METHODS.join(" | ")}; partnershipStatus: ${PARTNERSHIP_STATUSES.join(" | ")}`;

const RESOURCE_FIELD_HELP = `Fields: ${RESOURCE_FIELDS.join(", ")}.
- organizationName (required), parentOrg, website, contactName, contactPhone, contactEmail
- description (for staff), helpsWith (one short line a veteran would understand, ≤160 chars), services, eligibility, eligibilityNotes (≤500)
- buckets (needs it serves): ${BUCKET_CODES.join(", ")}
- geoScope: ${GEO_SCOPES.join(" | ")}; geoStates: 2-letter codes (required unless national); geoLocalities: cities/counties (required for local)
- gates: minDischarge (any | general | honorable), requiresVaEnrollment, requiresValidId, requiresDependents, crisisCapable (booleans); replacesId (boolean, not a gate): actually replaces a state ID / driver's license or the papers for one (birth certificate, SS card, DD-214) — true for a Secretary of State or vital records office, false for legal aid, eraRestriction: [${SERVICE_ERAS.join(", ")}], populationRestriction: [${POPULATIONS.join(", ")}]
- accessMethod: ${ACCESS_METHODS.join(" | ")}; accessValue: the number/URL/address; whatToBring; typicalWait: ${TYPICAL_WAITS.join(" | ")}
- verificationStatus: ${VERIFICATION_STATUSES.join(" | ")}; fragility: stable | fragile; sourceName
Search first so you don't add a duplicate.`;

const TRANSACTION_FIELD_HELP = `Fields: ${TRANSACTION_FIELDS.join(", ")}.
- date: YYYY-MM-DD; type: income | expense; amount: dollars (negative = refund within its type)
- categoryId: from list_finance_categories, matching the type
- vendor (who was paid / who paid), description, notes
- income only: donorName, campaign
- expense only, optional: allocation {programPct, mgmtPct, fundraisingPct} adding to 100 (omit to use the category's default)
- expense only, optional: veteranId — the veteran it was spent on (search_veterans), e.g. their bus pass`;

const REASON = z
  .string()
  .min(1)
  .describe("Why — where this came from (\"phone call with Maria today\", \"award letter\"). Shown to the approving admin.");

const GROUP = z
  .string()
  .optional()
  .describe("Same label on every change from one conversation, e.g. \"Call with Maria G. 10/27\". The admin can review and approve them together, in order.");

/** Firestore ids only: a "/" would walk into another collection. */
const DOC_ID = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, "Not a valid id.");

const VETERAN_ID = z
  .string()
  .regex(/^(pending:)?[A-Za-z0-9_-]{1,128}$/, "Not a valid veteran id.")
  .describe(`A veteran id, or "${PENDING_PREFIX}<change request id>" for a new veteran you proposed in this conversation.`);

const INTAKE_ANSWERS = {
  needs: z.array(z.enum(BUCKET_CODES)).describe("What they said they need help with."),
  safeTonight: z.boolean().optional().describe("false = nowhere safe tonight. Used for this match only; never stored."),
  receivingVaBenefits: z.enum(RECEIVING_VA_BENEFITS).optional().describe("Routes the claims lane. Never stored."),
  situations: z.array(z.enum(POPULATIONS)).optional().describe("Only if they said so. Never stored."),
  housingStatus: z.enum(HOUSING_STATUSES).optional().describe("Never stored."),
  dischargeCharacter: z.enum(DISCHARGE_CHARACTERS).optional(),
  serviceEra: z.enum(SERVICE_ERAS).optional(),
  idStatus: z.enum(ID_STATUSES).optional(),
  hasDependents: z.enum(DEPENDENTS_ANSWERS).optional(),
};

const CRISIS_NOTICE =
  "NOWHERE SAFE TONIGHT. Tell the user to act now, as a person: Veterans Crisis Line — call 988 and press 1, or text 838255. Only same-day options are listed below.";

const INSTRUCTIONS = `The Worth Their Weight Roster: veterans, their timeline, VSOs, the community resource directory, and the books.

Every propose_* tool only queues a change for an admin to approve; nothing changes until then. Tell the user what you queued and give them the review link. Give every change from one conversation the same "group" label so they can be approved together.

Logging a phone call (from a transcript, or "I talked to so-and-so"):
1. Find the veteran (search_veterans). If they're new, propose_veteran_create, then use "${PENDING_PREFIX}<its id>" as their veteranId for everything else in the call.
2. propose_veteran_update for facts that changed (phone, city, ID, discharge, stage…). Send only changed fields.
3. propose_contact_note: a short, neutral summary of the call and any next step.
4. If it was an intake: propose_intake with what they said. It returns the short list.
5. If the user picked resources to send: propose_referral with the ids, ranks and scores from that list. After approval, get_change_request returns the packet text to send.
6. Following up on a referral: get_veteran shows openReferrals; propose_follow_up with an outcome per resource.
7. A concrete win (job, housing, SNAP…): propose_win, saying whether WTW helped.
8. Concrete things they still need (bus pass, ID, phone, supplies), or got: propose_checklist — add new needs, tick off what they now have. get_veteran shows the current checklist.
Only record what was actually said. Ask the user when something is unclear rather than guessing. ${NEVER_STORED}
The system never assesses a VA claim or says what to file — WTW is not VA-accredited. Route claims questions to an accredited VSO.`;

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function requestView(cr: ChangeRequest) {
  return {
    id: cr.id,
    kind: cr.kind,
    status: cr.status,
    group: cr.groupLabel,
    target: cr.targetLabel,
    targetId: cr.targetId,
    changes: cr.changes,
    reason: cr.reason,
    proposedAt: cr.proposedAt.toISOString(),
    reviewedBy: cr.reviewedByEmail,
    reviewedAt: cr.reviewedAt?.toISOString() ?? null,
    reviewNote: cr.reviewNote,
    lastError: cr.lastError,
    appliedId: cr.appliedId,
    result: cr.result,
    ...(cr.kind === "veteran.create" && cr.status === "pending"
      ? { useAsVeteranId: `${PENDING_PREFIX}${cr.id}` }
      : {}),
  };
}

const contains = (haystack: (string | undefined | null)[], q: string) =>
  haystack.filter(Boolean).join(" ").toLowerCase().includes(q);

export function buildRosterMcpServer(baseUrl: string, user: Proposer): McpServer {
  const server = new McpServer({ name: "wtw-roster", version: "2.0.0" }, { instructions: INSTRUCTIONS });

  const queued = (result: ProposeResult, extra?: Record<string, unknown>) =>
    result.ok
      ? json({
          queued: true,
          note: "Nothing has changed yet. An admin must approve this.",
          reviewUrl: `${baseUrl}/admin/changes`,
          request: requestView(result.request),
          ...extra,
        })
      : fail(result.error);

  // ---------------------------------------------------------------- veterans

  server.registerTool(
    "search_veterans",
    {
      title: "Search veterans",
      description: "Find veterans by name, city, state, phone or email (case-insensitive). Optionally filter by pipeline stage.",
      inputSchema: {
        query: z.string().optional(),
        stage: z.enum(PIPELINE_STAGES).optional(),
        limit: z.number().int().min(1).max(100).default(25),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, stage, limit }) => {
      const q = query?.trim().toLowerCase();
      const digits = q?.replace(/\D/g, "") ?? "";
      const veterans = (await listVeterans())
        .filter((v) => !stage || v.pipelineStage === stage)
        .filter(
          (v) =>
            !q ||
            contains([`${v.firstName} ${v.lastInitial}`, v.city, v.state, v.email], q) ||
            (digits.length >= 4 && (v.phone ?? "").replace(/\D/g, "").includes(digits)),
        )
        .slice(0, limit);
      return json(
        veterans.map((v) => ({
          id: v.id,
          name: `${v.firstName}${v.lastInitial ? ` ${v.lastInitial}.` : ""}`,
          city: v.city ?? null,
          state: v.state ?? null,
          pipelineStage: v.pipelineStage,
          conciergeStatus: v.conciergeStatus ?? null,
          lastContactedAt: v.lastContactedAt?.toISOString() ?? null,
        })),
      );
    },
  );

  server.registerTool(
    "get_veteran",
    {
      title: "Get a veteran",
      description:
        "One veteran's full record, wins, their 15 most recent timeline entries, open referrals awaiting follow-up (with encounter and resource ids), and change requests waiting on them.",
      inputSchema: { veteranId: DOC_ID },
      annotations: { readOnlyHint: true },
    },
    async ({ veteranId }) => {
      const veteran = await getVeteran(veteranId);
      if (!veteran) return fail("Veteran not found.");
      const [encounters, pending] = await Promise.all([
        listEncounters(veteranId),
        listChangeRequests("pending", 500),
      ]);
      return json({
        veteran,
        recentTimeline: encounters.slice(0, 15).map((e) => ({
          id: e.id,
          type: e.type,
          occurredAt: e.occurredAt.toISOString(),
          summary: e.summary,
          nextStep: e.nextStep ?? null,
        })),
        openReferrals: encounters
          .filter((e) => e.type === "referral" && !e.followUpCompleted)
          .map((e) => ({
            referralEncounterId: e.id,
            sentAt: e.occurredAt.toISOString(),
            followUpDue: e.followUpDue?.toISOString() ?? null,
            resources: e.referrals.map((r) => ({ resourceId: r.resourceId, name: r.resourceName })),
          })),
        pendingChangeRequests: pending.filter((cr) => cr.targetId === veteranId).map(requestView),
        link: `${baseUrl}/veterans/${veteranId}`,
      });
    },
  );

  server.registerTool(
    "list_staff",
    {
      title: "List staff",
      description: "Staff accounts (uid, email, role) — for assigneeUid.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const users = await listUsers();
      return json(users.map((u) => ({ uid: u.uid, email: u.email, name: u.displayName, role: u.role })));
    },
  );

  server.registerTool(
    "propose_veteran_create",
    {
      title: "Propose a new veteran",
      description: `Queue a new veteran for approval. Search first so you don't add a duplicate. The result's useAsVeteranId lets you queue their intake, notes and referral in the same call.\n${VETERAN_FIELD_HELP}`,
      inputSchema: { fields: z.record(z.string(), z.unknown()), reason: REASON, group: GROUP },
    },
    async ({ fields, reason, group }) =>
      queued(await proposeFields(user, { kind: "veteran.create", fields }, reason, group)),
  );

  server.registerTool(
    "propose_veteran_update",
    {
      title: "Propose a veteran edit",
      description: `Queue an edit to one veteran. Send only the fields that change. Moving pipelineStage stamps its date and history on approval.\n${VETERAN_FIELD_HELP}`,
      inputSchema: {
        veteranId: DOC_ID,
        changes: z.record(z.string(), z.unknown()),
        reason: REASON,
        group: GROUP,
      },
    },
    async ({ veteranId, changes, reason, group }) =>
      queued(await proposeFields(user, { kind: "veteran.update", targetId: veteranId, changes }, reason, group)),
  );

  server.registerTool(
    "propose_contact_note",
    {
      title: "Propose a timeline note",
      description:
        "Queue a contact note on a veteran's timeline — a call, text, visit, voicemail. Approving it also moves their last-contacted date forward. occurredAt / nextStepDueAt are ISO dates; occurredAt defaults to now.",
      inputSchema: {
        veteranId: VETERAN_ID,
        summary: z.string().min(1).describe("Short and neutral: what happened, what they asked for."),
        occurredAt: z.string().optional(),
        location: z.string().optional(),
        nextStep: z.string().optional(),
        nextStepDueAt: z.string().optional(),
        reason: REASON,
        group: GROUP,
      },
    },
    async ({ veteranId, reason, group, ...fields }) =>
      queued(await proposeFields(user, { kind: "encounter.create", targetId: veteranId, fields }, reason, group)),
  );

  // ------------------------------------------------------- intake & referral

  server.registerTool(
    "preview_matches",
    {
      title: "Preview matches",
      description:
        "Run the matcher for a veteran on intake answers and return the short list, without recording anything. Use propose_intake to record the intake.",
      inputSchema: { veteranId: VETERAN_ID, ...INTAKE_ANSWERS },
      annotations: { readOnlyHint: true },
    },
    async ({ veteranId, ...answers }) => {
      const id = veteranId.startsWith(PENDING_PREFIX) ? null : veteranId;
      const veteran = id ? await getVeteran(id) : null;
      if (id && !veteran) return fail("Veteran not found.");
      const pendingFields = !id
        ? (await getChangeRequest(veteranId.slice(PENDING_PREFIX.length)))?.changes
        : null;
      const data = veteran ?? Object.fromEntries(Object.entries(pendingFields ?? {}).map(([k, c]) => [k, c.after]));
      const matched = await matchIntake(data, answers);
      if (!matched.ok) return fail(matched.error);
      return json({ ...(matched.result.crisis ? { CRISIS: CRISIS_NOTICE } : {}), ...matched.result });
    },
  );

  server.registerTool(
    "propose_intake",
    {
      title: "Propose an intake",
      description:
        "Record a concierge intake from what the veteran said: queues the intake (needs + the four stored eligibility answers) for approval and returns the short list of matching resources. safeTonight, receivingVaBenefits, situations and housingStatus steer the match and are never stored. Leave out anything they weren't asked — blank never clears a stored answer.",
      inputSchema: { veteranId: VETERAN_ID, ...INTAKE_ANSWERS, reason: REASON, group: GROUP },
    },
    async ({ veteranId, reason, group, ...answers }) => {
      const r = await proposeIntake(user, veteranId, answers, reason, group);
      if (!r.ok) return fail(r.error);
      return queued(r, {
        ...(r.match.crisis ? { CRISIS: CRISIS_NOTICE } : {}),
        claimsLane: r.match.claimsLane
          ? "No filing history or unsure: route claims to an accredited VSO. Don't assess the claim."
          : null,
        shortList: r.match.candidates.map((c, rank) => ({
          rank,
          resourceId: c.id,
          score: c.score,
          name: c.organizationName,
          helpsWith: c.matchedBuckets,
          access: `${c.accessMethod}: ${c.accessValue ?? ""}`,
          eligibilityNotes: c.eligibilityNotes,
          flags: c.flags,
        })),
        intakeFlags: r.match.flags,
        nothingMatched: r.match.candidates.length === 0,
      });
    },
  );

  server.registerTool(
    "propose_referral",
    {
      title: "Propose a referral",
      description:
        "Queue a referral packet: the resources the user chose for this veteran, with rank and score from the short list. On approval it goes on the timeline, starts the 14-day follow-up, and get_change_request returns the packet text for the user to send. Nothing is sent automatically.",
      inputSchema: {
        veteranId: VETERAN_ID,
        bucketsIdentified: z.array(z.enum(BUCKET_CODES)).describe("The needs they named."),
        referrals: z
          .array(z.object({ resourceId: DOC_ID, rank: z.number().int().nonnegative(), score: z.number() }))
          .min(1),
        reason: REASON,
        group: GROUP,
      },
    },
    async ({ veteranId, reason, group, ...input }) =>
      queued(await proposeReferral(user, veteranId, input, reason, group)),
  );

  server.registerTool(
    "propose_follow_up",
    {
      title: "Propose a follow-up",
      description: `Record what came of a referral packet (see get_veteran → openReferrals), one outcome per resource: ${FOLLOW_UP_OUTCOMES.join(" | ")}. For "helped", winKind (${OUTCOME_KINDS.join(", ")}) and amount record the win too. Closes the follow-up on approval.`,
      inputSchema: {
        veteranId: DOC_ID,
        referralEncounterId: DOC_ID,
        outcomes: z
          .array(
            z.object({
              resourceId: DOC_ID,
              outcome: z.enum(FOLLOW_UP_OUTCOMES),
              note: z.string().optional(),
              winKind: z.enum(OUTCOME_KINDS).optional(),
              amount: z.number().nonnegative().optional(),
            }),
          )
          .min(1),
        reason: REASON,
        group: GROUP,
      },
    },
    async ({ veteranId, reason, group, ...input }) =>
      queued(await proposeFollowUp(user, veteranId, input, reason, group)),
  );

  server.registerTool(
    "propose_win",
    {
      title: "Propose a win",
      description: `Log something concrete a veteran walked away with — the Impact report counts these. kind: ${OUTCOME_KINDS.map((k) => `${k} (${OUTCOME_KIND_INFO[k].label}${OUTCOME_KIND_INFO[k].value ? `; amount = ${OUTCOME_KIND_INFO[k].value === "monthly" ? "$/month" : "$ once"}` : ""})`).join(", ")}.`,
      inputSchema: {
        veteranId: VETERAN_ID,
        kind: z.enum(OUTCOME_KINDS),
        achievedAt: z.string().describe("ISO date it happened."),
        amount: z.number().nonnegative().optional(),
        resourceId: DOC_ID.optional().describe("The resource that made it happen, if any."),
        wtwRole: z
          .enum(WTW_ROLES)
          .describe(
            `Did WTW help? ${WTW_ROLES.map((r) => `${r} = ${WTW_ROLE_LABELS[r]}`).join("; ")}. Only what the user said — ask if unclear. "none" wins stay on the record but aren't counted as WTW's impact.`,
          ),
        note: z.string().max(500).optional(),
        reason: REASON,
        group: GROUP,
      },
    },
    async ({ veteranId, reason, group, ...input }) =>
      queued(await proposeOutcome(user, veteranId, input, reason, group)),
  );

  server.registerTool(
    "propose_checklist",
    {
      title: "Update the needs checklist",
      description: `Change a veteran's "Still needs" checklist — the concrete things to get them. add: new items, short labels (common ones: ${CHECKLIST_PRESETS.join(", ")}). done: items they now have. reopen: items ticked by mistake. remove: items added by mistake or no longer needed. Name existing items by label or id (get_veteran → veteran.checklist). Several at once is fine. A new veteran ("${PENDING_PREFIX}<id>") can only take adds.`,
      inputSchema: {
        veteranId: VETERAN_ID,
        add: z.array(z.string().min(1).max(80)).max(20).optional(),
        done: z.array(z.string().min(1)).max(20).optional(),
        reopen: z.array(z.string().min(1)).max(20).optional(),
        remove: z.array(z.string().min(1)).max(20).optional(),
        reason: REASON,
        group: GROUP,
      },
    },
    async ({ veteranId, reason, group, ...input }) =>
      queued(await proposeChecklist(user, veteranId, input, reason, group)),
  );

  // -------------------------------------------------------------------- VSOs

  server.registerTool(
    "search_vsos",
    {
      title: "Search VSOs",
      description: "Find Veteran Service Officers by name, affiliation, city or state. Empty query lists them all.",
      inputSchema: { query: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      const q = query?.trim().toLowerCase();
      return json((await listVsos()).filter((v) => !q || contains([v.fullName, v.affiliation, v.city, v.state], q)));
    },
  );

  server.registerTool(
    "get_vso",
    {
      title: "Get a VSO",
      description: "One VSO's full record.",
      inputSchema: { vsoId: DOC_ID },
      annotations: { readOnlyHint: true },
    },
    async ({ vsoId }) => {
      const vso = await getVso(vsoId);
      return vso ? json(vso) : fail("VSO not found.");
    },
  );

  server.registerTool(
    "propose_vso_create",
    {
      title: "Propose a new VSO",
      description: `Queue a new VSO.\n${VSO_FIELD_HELP}`,
      inputSchema: { fields: z.record(z.string(), z.unknown()), reason: REASON, group: GROUP },
    },
    async ({ fields, reason, group }) =>
      queued(await proposeFields(user, { kind: "vso.create", fields }, reason, group)),
  );

  server.registerTool(
    "propose_vso_update",
    {
      title: "Propose a VSO edit",
      description: `Queue an edit to one VSO. Send only the fields that change.\n${VSO_FIELD_HELP}`,
      inputSchema: { vsoId: DOC_ID, changes: z.record(z.string(), z.unknown()), reason: REASON, group: GROUP },
    },
    async ({ vsoId, changes, reason, group }) =>
      queued(await proposeFields(user, { kind: "vso.update", targetId: vsoId, changes }, reason, group)),
  );

  // --------------------------------------------------------------- resources

  server.registerTool(
    "search_resources",
    {
      title: "Search community resources",
      description: "Find community resources by name, parent org, city/county or description; filter by need bucket or state.",
      inputSchema: {
        query: z.string().optional(),
        bucket: z.enum(BUCKET_CODES).optional(),
        state: z.string().length(2).optional(),
        limit: z.number().int().min(1).max(100).default(25),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, bucket, state, limit }) => {
      const q = query?.trim().toLowerCase();
      const st = state?.toUpperCase();
      const found = (await listResources())
        .filter((r) => !bucket || r.buckets.includes(bucket))
        .filter((r) => !st || r.geoScope === "national" || r.geoStates.includes(st))
        .filter((r) => !q || contains([r.organizationName, r.parentOrg, r.description, r.helpsWith, ...r.geoLocalities], q))
        .slice(0, limit);
      return json(
        found.map((r) => ({
          id: r.id,
          name: r.organizationName,
          parentOrg: r.parentOrg ?? null,
          helpsWith: r.helpsWith ?? null,
          buckets: r.buckets,
          area: r.geoScope === "national" ? "national" : `${r.geoStates.join(", ")} ${r.geoLocalities.join(", ")}`.trim(),
          verificationStatus: r.verificationStatus,
        })),
      );
    },
  );

  server.registerTool(
    "get_resource",
    {
      title: "Get a community resource",
      description: "One resource's full record.",
      inputSchema: { resourceId: DOC_ID },
      annotations: { readOnlyHint: true },
    },
    async ({ resourceId }) => {
      const r = await getResource(resourceId);
      return r ? json({ ...r, link: `${baseUrl}/resources/${r.id}` }) : fail("Resource not found.");
    },
  );

  server.registerTool(
    "propose_resource_create",
    {
      title: "Propose a new resource",
      description: `Queue a new community resource.\n${RESOURCE_FIELD_HELP}`,
      inputSchema: { fields: z.record(z.string(), z.unknown()), reason: REASON, group: GROUP },
    },
    async ({ fields, reason, group }) =>
      queued(await proposeFields(user, { kind: "resource.create", fields }, reason, group)),
  );

  server.registerTool(
    "propose_resource_update",
    {
      title: "Propose a resource edit",
      description: `Queue an edit to one resource. Send only the fields that change. Moving verificationStatus logs a verification on approval.\n${RESOURCE_FIELD_HELP}`,
      inputSchema: { resourceId: DOC_ID, changes: z.record(z.string(), z.unknown()), reason: REASON, group: GROUP },
    },
    async ({ resourceId, changes, reason, group }) =>
      queued(await proposeFields(user, { kind: "resource.update", targetId: resourceId, changes }, reason, group)),
  );

  // ---------------------------------------------------------------- finances

  server.registerTool(
    "list_finance_categories",
    {
      title: "List finance categories",
      description: "The books' categories (id, name, income/expense, default functional split).",
      annotations: { readOnlyHint: true },
    },
    async () => json(await listCategories()),
  );

  server.registerTool(
    "search_transactions",
    {
      title: "Search transactions",
      description: "Transactions in the books, newest first. Filter by date range (YYYY-MM-DD), type, and text in vendor/description/donor/notes. Returns totals for what matched.",
      inputSchema: {
        from: z.string().optional(),
        to: z.string().optional(),
        type: z.enum(["income", "expense"]).optional(),
        query: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ from, to, type, query, limit }) => {
      const q = query?.trim().toLowerCase();
      const matched = (await listTransactions())
        .filter((t) => (!from || t.date >= from) && (!to || t.date <= to) && (!type || t.type === type))
        .filter((t) => !q || contains([t.vendor, t.description, t.donorName, t.campaign, t.notes], q))
        .sort((a, b) => b.date.localeCompare(a.date));
      const total = (kind: "income" | "expense") =>
        Math.round(matched.filter((t) => t.type === kind).reduce((s, t) => s + t.amount, 0) * 100) / 100;
      return json({
        count: matched.length,
        totalIncome: total("income"),
        totalExpense: total("expense"),
        transactions: matched.slice(0, limit),
      });
    },
  );

  server.registerTool(
    "propose_transaction_create",
    {
      title: "Propose a transaction",
      description: `Queue a new transaction for the books. Check search_transactions first so a bank import doesn't double it.\n${TRANSACTION_FIELD_HELP}`,
      inputSchema: { fields: z.record(z.string(), z.unknown()), reason: REASON, group: GROUP },
    },
    async ({ fields, reason, group }) =>
      queued(await proposeFields(user, { kind: "transaction.create", fields }, reason, group)),
  );

  server.registerTool(
    "propose_transaction_update",
    {
      title: "Propose a transaction edit",
      description: `Queue an edit to one transaction (recategorize, fix an amount, add a donor). Send only the fields that change.\n${TRANSACTION_FIELD_HELP}`,
      inputSchema: { transactionId: DOC_ID, changes: z.record(z.string(), z.unknown()), reason: REASON, group: GROUP },
    },
    async ({ transactionId, changes, reason, group }) =>
      queued(await proposeFields(user, { kind: "transaction.update", targetId: transactionId, changes }, reason, group)),
  );

  // ---------------------------------------------------------- the queue itself

  server.registerTool(
    "list_change_requests",
    {
      title: "List change requests",
      description: "Change requests and what happened to them. Defaults to pending.",
      inputSchema: {
        status: z.enum(CHANGE_REQUEST_STATUSES).default("pending"),
        group: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(25),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ status, group, limit }) =>
      json(
        (await listChangeRequests(status, 500))
          .filter((cr) => !group || cr.groupLabel === group)
          .slice(0, limit)
          .map(requestView),
      ),
  );

  server.registerTool(
    "get_change_request",
    {
      title: "Get a change request",
      description: "One change request: its changes, status, the reviewer's note — and, for an approved referral, the packet text to send.",
      inputSchema: { id: DOC_ID },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const cr = await getChangeRequest(id);
      return cr ? json(requestView(cr)) : fail("Change request not found.");
    },
  );

  server.registerTool(
    "withdraw_change_request",
    {
      title: "Withdraw a change request",
      description: "Take back a pending proposal that was wrong. It can't be approved after this.",
      inputSchema: { id: DOC_ID },
    },
    async ({ id }) => {
      const result = await withdrawChange(user, id);
      return result.ok ? json({ withdrawn: true, id }) : fail(result.error);
    },
  );

  server.registerPrompt(
    "log_a_call",
    {
      title: "Log a call",
      description: "Turn a call transcript or a quick note into Roster changes for approval.",
      argsSchema: { notes: z.string().describe("The transcript, or what happened in your own words.") },
    },
    ({ notes }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Log this conversation in the Roster. Follow the server's "Logging a phone call" steps, use one group label for everything, ask me about anything unclear before proposing it, then list what you queued.\n\n${notes}`,
          },
        },
      ],
    }),
  );

  return server;
}
