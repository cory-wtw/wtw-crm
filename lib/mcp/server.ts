/**
 * The Roster MCP server: lets Claude look things up and propose changes.
 *
 * Read tools read. Every write tool only queues a change request — nothing on
 * a veteran, VSO or timeline moves until an admin approves it on
 * Admin → Claude changes. There is no approve tool and no delete tool, by
 * design: the approval step lives behind a signed-in admin session, which this
 * server never has.
 */

import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listEncounters } from "@/lib/db/encounters";
import { getVeteran, listVeterans } from "@/lib/db/veterans";
import { getVso, listVsos } from "@/lib/db/vsos";
import { listUsers } from "@/lib/db/users";
import { ENCOUNTER_FIELDS, VETERAN_FIELDS, VSO_FIELDS } from "@/lib/change-requests";
import {
  getChangeRequest,
  listChangeRequests,
  proposeChange,
  withdrawChange,
  type ProposeInput,
} from "@/lib/change-requests-apply";
import {
  CHANGE_REQUEST_STATUSES,
  CONTACT_METHODS,
  DEPENDENTS_ANSWERS,
  DISCHARGE_CHARACTERS,
  ID_STATUSES,
  PARTNERSHIP_STATUSES,
  PIPELINE_STAGES,
  PREFERRED_CONTACT_METHODS,
  SERVICE_ERAS,
  type ChangeRequest,
} from "@/lib/schemas";

const VETERAN_FIELD_HELP = `Fields: ${VETERAN_FIELDS.join(", ")}.
- firstName (required on create), lastInitial (one letter; the full last name is never stored)
- preferredContact: ${PREFERRED_CONTACT_METHODS.join(" | ")} — that channel (phone or email) must have a value
- birthYear (number), city, state (2 letters), zip
- dischargeCharacter: ${DISCHARGE_CHARACTERS.join(" | ")}
- serviceEra: ${SERVICE_ERAS.join(" | ")}
- idStatus: ${ID_STATUSES.join(" | ")}
- hasDependents: ${DEPENDENTS_ANSWERS.join(" | ")}
- pipelineStage: ${PIPELINE_STAGES.join(" | ")}
- monthlyBenefitBefore / monthlyBenefitAfter: dollars per month
- vsoIds: array of VSO ids (use search_vsos), assigneeUid: staff uid (use list_staff)
- eight00ThreadId: numeric id from an 800.com inbox URL
Null clears dischargeCharacter, serviceEra, idStatus, hasDependents, zip, assigneeUid, eight00ThreadId; use "" to clear a text field.
Never record claim history, conditions, diagnoses, income or the full last name — those are not stored, ever.`;

const VSO_FIELD_HELP = `Fields: ${VSO_FIELDS.join(", ")}.
- fullName (required on create), affiliation (e.g. DAV, VFW), city, state, directPhone, directEmail, notes
- preferredContactMethod: ${CONTACT_METHODS.join(" | ")}
- partnershipStatus: ${PARTNERSHIP_STATUSES.join(" | ")}`;

const REASON = z
  .string()
  .min(1)
  .describe("Why this change — where the information came from. Shown to the approving admin.");

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
    target: cr.targetLabel,
    targetId: cr.targetId,
    changes: cr.changes,
    reason: cr.reason,
    proposedAt: cr.proposedAt.toISOString(),
    reviewedBy: cr.reviewedByEmail,
    reviewedAt: cr.reviewedAt?.toISOString() ?? null,
    reviewNote: cr.reviewNote,
    appliedId: cr.appliedId,
  };
}

export function buildRosterMcpServer(baseUrl: string): McpServer {
  const server = new McpServer(
    { name: "wtw-roster", version: "1.0.0" },
    {
      instructions:
        "The WTW Roster: veterans, VSOs and their contact timeline. Look records up with the search/get tools before proposing an edit. " +
        "Every propose_* tool only queues a change for an admin to approve — nothing changes until then, so tell the user it's waiting for approval and give them the review link. " +
        "One proposal per record per change; if one comes back stale or rejected, look the record up again before re-proposing.",
    },
  );

  const queued = (result: Awaited<ReturnType<typeof proposeChange>>) =>
    result.ok
      ? json({
          queued: true,
          note: "Nothing has changed yet. An admin must approve this.",
          reviewUrl: `${baseUrl}/admin/changes`,
          request: requestView(result.request),
        })
      : fail(result.error);

  server.registerTool(
    "search_veterans",
    {
      title: "Search veterans",
      description:
        "Find veterans by name, city, state, phone or email (case-insensitive substring). Optionally filter by pipeline stage. Returns ids for the other tools.",
      inputSchema: {
        query: z.string().optional(),
        stage: z.enum(PIPELINE_STAGES).optional(),
        limit: z.number().int().min(1).max(100).default(25),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, stage, limit }) => {
      const q = query?.trim().toLowerCase();
      const digits = q?.replace(/\D/g, "");
      const veterans = (await listVeterans())
        .filter((v) => !stage || v.pipelineStage === stage)
        .filter((v) => {
          if (!q) return true;
          const text = [`${v.firstName} ${v.lastInitial}`, v.city, v.state, v.email]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (text.includes(q)) return true;
          return !!digits && digits.length >= 4 && (v.phone ?? "").replace(/\D/g, "").includes(digits);
        })
        .slice(0, limit);
      return json(
        veterans.map((v) => ({
          id: v.id,
          name: `${v.firstName}${v.lastInitial ? ` ${v.lastInitial}.` : ""}`,
          city: v.city ?? null,
          state: v.state ?? null,
          pipelineStage: v.pipelineStage,
          lastContactedAt: v.lastContactedAt?.toISOString() ?? null,
          updatedAt: v.updatedAt.toISOString(),
        })),
      );
    },
  );

  server.registerTool(
    "get_veteran",
    {
      title: "Get a veteran",
      description: "One veteran's full record, their 10 most recent timeline entries, and any change requests waiting on them.",
      inputSchema: { veteranId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ veteranId }) => {
      const veteran = await getVeteran(veteranId);
      if (!veteran) return fail("Veteran not found.");
      const [encounters, pending] = await Promise.all([
        listEncounters(veteranId),
        listChangeRequests("pending"),
      ]);
      return json({
        veteran,
        recentTimeline: encounters.slice(0, 10).map((e) => ({
          type: e.type,
          occurredAt: e.occurredAt.toISOString(),
          summary: e.summary,
          nextStep: e.nextStep ?? null,
        })),
        pendingChangeRequests: pending.filter((cr) => cr.targetId === veteranId).map(requestView),
        link: `${baseUrl}/veterans/${veteranId}`,
      });
    },
  );

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
      const vsos = (await listVsos()).filter(
        (v) =>
          !q ||
          [v.fullName, v.affiliation, v.city, v.state].filter(Boolean).join(" ").toLowerCase().includes(q),
      );
      return json(vsos);
    },
  );

  server.registerTool(
    "get_vso",
    {
      title: "Get a VSO",
      description: "One VSO's full record.",
      inputSchema: { vsoId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ vsoId }) => {
      const vso = await getVso(vsoId);
      return vso ? json(vso) : fail("VSO not found.");
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
      description: `Queue a new veteran record for admin approval. Search first so you don't add a duplicate.\n${VETERAN_FIELD_HELP}`,
      inputSchema: {
        fields: z.record(z.string(), z.unknown()).describe("The new record's fields."),
        reason: REASON,
      },
    },
    async ({ fields, reason }) => queued(await proposeChange({ kind: "veteran.create", fields, reason })),
  );

  server.registerTool(
    "propose_veteran_update",
    {
      title: "Propose a veteran edit",
      description: `Queue an edit to one veteran for admin approval. Send only the fields that change. Moving pipelineStage also stamps its date and history on approval.\n${VETERAN_FIELD_HELP}`,
      inputSchema: {
        veteranId: z.string(),
        changes: z.record(z.string(), z.unknown()).describe("Only the fields to change, with their new values."),
        reason: REASON,
      },
    },
    async ({ veteranId, changes, reason }) =>
      queued(await proposeChange({ kind: "veteran.update", targetId: veteranId, changes, reason })),
  );

  server.registerTool(
    "propose_contact_note",
    {
      title: "Propose a timeline note",
      description: `Queue a contact note on a veteran's timeline (a call, text, visit) for admin approval. Approving it also moves their last-contacted date forward.\nFields: ${ENCOUNTER_FIELDS.join(", ")}. occurredAt and nextStepDueAt are ISO dates; occurredAt defaults to now. summary is required.`,
      inputSchema: {
        veteranId: z.string(),
        summary: z.string().min(1),
        occurredAt: z.string().optional(),
        location: z.string().optional(),
        nextStep: z.string().optional(),
        nextStepDueAt: z.string().optional(),
        reason: REASON,
      },
    },
    async ({ veteranId, reason, ...fields }) =>
      queued(await proposeChange({ kind: "encounter.create", targetId: veteranId, fields, reason })),
  );

  server.registerTool(
    "propose_vso_create",
    {
      title: "Propose a new VSO",
      description: `Queue a new VSO for admin approval.\n${VSO_FIELD_HELP}`,
      inputSchema: { fields: z.record(z.string(), z.unknown()), reason: REASON },
    },
    async ({ fields, reason }) => queued(await proposeChange({ kind: "vso.create", fields, reason })),
  );

  server.registerTool(
    "propose_vso_update",
    {
      title: "Propose a VSO edit",
      description: `Queue an edit to one VSO for admin approval. Send only the fields that change.\n${VSO_FIELD_HELP}`,
      inputSchema: {
        vsoId: z.string(),
        changes: z.record(z.string(), z.unknown()),
        reason: REASON,
      },
    },
    async ({ vsoId, changes, reason }) =>
      queued(await proposeChange({ kind: "vso.update", targetId: vsoId, changes, reason } satisfies ProposeInput)),
  );

  server.registerTool(
    "list_change_requests",
    {
      title: "List change requests",
      description: "Change requests you've proposed and what happened to them. Defaults to pending.",
      inputSchema: {
        status: z.enum(CHANGE_REQUEST_STATUSES).default("pending"),
        limit: z.number().int().min(1).max(100).default(25),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ status, limit }) => json((await listChangeRequests(status, limit)).map(requestView)),
  );

  server.registerTool(
    "get_change_request",
    {
      title: "Get a change request",
      description: "One change request: its changes, status, and the reviewer's note.",
      inputSchema: { id: z.string() },
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
      description: "Take back one of your pending proposals (e.g. it was wrong). It can't be approved after this.",
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: false },
    },
    async ({ id }) => {
      const result = await withdrawChange(id);
      return result.ok ? json({ withdrawn: true, id }) : fail(result.error);
    },
  );

  return server;
}
