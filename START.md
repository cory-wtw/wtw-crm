# Worth Their Weight CRM — Project Brief

**For:** Claude Code kickoff
**Prepared:** May 2026
**Owner:** Cory Gold, Founder & Executive Director

---

## What we're building

An internal CRM web application to replace AirTable. Single source of truth for veterans WTW has identified and the VSO partners they're connected to. Built for ~5 internal users at launch; should scale to 25+ as WTW grows nationally.

**Not** a public-facing tool. Not a donor platform (Zeffy handles that). Not a claims system — WTW never touches claims.

---

## Core principles

1. **Veteran privacy first.** PII (name, DOB, last 4 of SSN, service history, contact info) is sensitive. Every read and write to a veteran record gets logged. No public exposure ever.
2. **Match the brand pipeline.** The data model reflects how WTW actually operates: Found → Connected → Filed → Won. Field Scouts get credit at every stage.
3. **Boring tech, shipped.** Next.js + Firebase. Cory has shipped this stack before. No exotic dependencies.
4. **Human-readable everywhere.** Field names in the UI use plain English ("Last contacted" not "lastContactedAt"). The system serves the team, not the other way around.

---

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15 (App Router) | Cory knows it; SSR for fast loads |
| Hosting | Firebase Hosting + Cloud Functions | Cory knows it |
| Database | Cloud Firestore | RBAC enforced via Security Rules |
| Auth | Firebase Auth (email/password + Google) | Built-in, MFA available |
| UI | Tailwind CSS + shadcn/ui | Fast to build, brand-themable |
| Forms | react-hook-form + zod | Validation that doesn't fight you |
| Tables | TanStack Table | Sorting/filtering/pagination |
| Brand | Source Sans 3 (Google Fonts), brand palette from `WTW_BrandGuide_v2_1.pdf` | Match all other WTW collateral |

---

## v1 scope (ship this first)

- Email/password auth + Google sign-in
- Two roles: **Admin** and **Standard**
- Veterans collection (CRUD, pipeline stages, encounters, assignment)
- VSOs collection (CRUD, national rolodex)
- Audit log (every veteran read/write, who and when)
- Brand-themed UI (gold/near-black/cream, Source Sans 3)

### Explicitly out of v1
- Field Scout shift logs (v2)
- Donor records (Zeffy is the source of truth)
- Document generation (intake forms, ROIs — separate project)
- Mobile app (responsive web is fine for v1)
- Granular rank-based RBAC (v2 — comes when team grows past ~10)

---

## Data model

### `users`
Stored in Firestore, mirrored from Firebase Auth.

| Field | Type | Notes |
| --- | --- | --- |
| `uid` | string | Firebase Auth UID |
| `email` | string | |
| `displayName` | string | |
| `role` | enum | `admin` \| `standard` |
| `active` | boolean | Soft-disable without deleting |
| `createdAt` | timestamp | |
| `lastLoginAt` | timestamp | |

### `veterans`
The heart of the system. Every veteran WTW has identified. Deliberately
minimized — we keep only what's needed to run the pipeline and project the
benefit, nothing more.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | auto-generated |
| `firstName` | string | required |
| `lastInitial` | string | single letter; full last name is not stored |
| `preferredContact` | enum | `phone` \| `email` — the only channel kept |
| `phone` \| `email` | string | exactly one is stored, matching `preferredContact` |
| `birthYear` | number | optional |
| `pipelineStage` | enum | `found` \| `connected` \| `filed` \| `won` \| `lost` |
| `pipelineHistory` | array | { stage, enteredAt, byUid } — auto-appended on stage change |
| `dateFound` … `dateLost` | timestamp | stamped as the veteran hits each stage |
| `assigneeUid` | string | uid of the staff member running point |
| `lifeExpectancyAtFound`, `ageAtFound` | number | benefit-projection inputs |
| `anticipatedRateCode`, `actualRateCode` | string | look up monthly amount in `rateTable` |
| `vsoIds` | string[] | linked VSO partners |
| `assignedPhoneId` | string | linked Straight Talk loaner |
| `createdBy`, `createdAt` | | |
| `updatedBy`, `updatedAt` | | |

> Note: income, household size, dependent status, branch, discharge status,
> service dates, housing status, and free-text notes were removed in the
> data-minimization pass, along with the separate life/service **intake**
> feature. See `scripts/migrate-data-minimization.ts`.

### `veterans/{id}/encounters` (subcollection)
Every interaction with a veteran — replaces the AirTable encounter form.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | |
| `occurredAt` | timestamp | when the encounter happened (not when logged) |
| `loggedBy` | string | uid |
| `location` | string | freeform, e.g. "Riverbend Shelter" |
| `summary` | string | what happened |
| `nextStep` | string | what's the follow-up |
| `nextStepDueAt` | timestamp | optional |

### `vsos`
National VSO rolodex.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | |
| `organizationName` | string | e.g. "Hamilton County VSO", "DAV Chapter 12" |
| `type` | enum | County, DAV, VFW, American Legion, Other |
| `primaryContactName` | string | |
| `primaryContactRole` | string | |
| `phone`, `email` | string | |
| `address` | object | |
| `city`, `state` | string | indexed for lookup |
| `accreditationVerified` | boolean | Cory confirms before this flips true |
| `notes` | string | freeform — what they're good at, who to ask for, etc. |
| `lastContactedAt` | timestamp | |
| `referralsMade` | number | denormalized count, updated on veteran assignment |
| `createdBy`, `createdAt`, `updatedBy`, `updatedAt` | | |

### `auditLog`
Append-only. One document per access event.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | |
| `actorUid` | string | |
| `actorEmail` | string | denormalized for readability |
| `action` | enum | `read` \| `create` \| `update` \| `delete` |
| `resourceType` | enum | `veteran` \| `vso` \| `encounter` \| `user` |
| `resourceId` | string | |
| `at` | timestamp | |
| `diff` | object | for updates: { fieldName: { before, after } } |
| `ip` | string | best-effort |

Audit log entries are written by Cloud Functions triggers on every relevant collection so the client can't skip logging.

---

## RBAC

| Capability | Admin | Standard |
| --- | --- | --- |
| View any veteran | ✅ | ✅ |
| Create veteran | ✅ | ✅ |
| Edit veteran | ✅ | ✅ (only ones assigned to them) |
| Delete veteran | ✅ | ❌ |
| Change pipeline stage | ✅ | ✅ |
| Reassign veteran | ✅ | ❌ |
| View VSO rolodex | ✅ | ✅ |
| Create/edit VSO | ✅ | ✅ |
| Create/edit phone | ✅ | ✅ |
| Create/edit org | ✅ | ✅ |
| Delete VSO / phone / org | ✅ | ❌ |
| View audit log | ✅ | ❌ |
| Manage users | ✅ | ❌ |
| Run CSV import | ✅ | ❌ |

Enforce in both:
1. **Firestore Security Rules** (server-side, authoritative)
2. **UI gating** (hide buttons standard users can't use — prevents confusion, not security)

---

## Routes

```
/login                     public
/                          dashboard (counts by pipeline stage, recent encounters)
/veterans                  list, filter, search
/veterans/new              create
/veterans/[id]             detail + encounter timeline
/veterans/[id]/edit        edit
/vsos                      list
/vsos/new                  create
/vsos/[id]                 detail
/vsos/[id]/edit            edit
/admin/users               admin only
/admin/audit               admin only
/admin/import              admin only — CSV upload
/settings                  user's own profile
```

---

## Brand application

Pull from `WTW_BrandGuide_v2_1.pdf`. Address on the brand guide is outdated — use the current HQ in all UI:

> **1100 Market Street, Suite 712, Chattanooga, TN 37402**

- **Primary background:** Cream `#F3F3E6` (light mode) and Near Black `#1D1912` (dark mode)
- **Brand Gold:** `#D2A63C` — primary buttons, active nav state, key data points
- **Gold Light:** `#EECD5C` — for gold elements on dark backgrounds
- **Deep Gold:** `#BB8525` — eyebrow labels, table column headers, dividers
- **Body type:** Source Sans 3, regular 400, 16px base
- **Display:** Source Sans 3, Black 900
- **Logo:** Use the gold medal mark in the top-left of the nav. SVG only.

Footer of every authenticated page:
> *Worth Their Weight · 501(c)(3) · EIN 41-5275144 · Internal use only*

---

## Security checklist

- [ ] Firestore Security Rules cover every collection (no `allow read, write: if true` ever)
- [ ] All veteran reads logged via Cloud Function trigger
- [ ] Last 4 SSN encrypted at rest (use Firestore field-level encryption or Cloud KMS)
- [ ] MFA required for admin role
- [ ] Session timeout: 8 hours of inactivity
- [ ] Backup: daily Firestore export to Cloud Storage, 30-day retention
- [ ] No PII in client-side logs, error reports, or analytics
- [ ] HTTPS only (Firebase Hosting handles this)

---

## AirTable migration

**Done and retired.** The one-time CSV import was run and its tooling
(`scripts/seed-veterans.ts`, `scripts/seed-vsos.ts`, the `airtable-*-mapping`
helpers, and the raw `data/airtable-*.csv` exports) has since been removed —
it imported fields that the data-minimization pass later dropped, so keeping a
runnable importer would have re-introduced them. Veterans and VSOs are now
added directly through the app. The VA rate table is still seeded via
`npm run seed-rates`.

---

## Opening prompt for Claude Code

Paste this into Claude Code in an empty repo to kick off:

> I'm building an internal CRM for Worth Their Weight, a Tennessee 501(c)(3) that finds unsheltered veterans and connects them to VA-accredited VSOs. The full project brief is in `WTW_CRM_Project_Brief.md` at the repo root — read it first.
>
> Start with project setup only. Don't build features yet.
>
> 1. Initialize a Next.js 15 App Router project with TypeScript, Tailwind CSS, and ESLint.
> 2. Install: `firebase`, `firebase-admin`, `react-hook-form`, `zod`, `@hookform/resolvers`, `@tanstack/react-table`, `lucide-react`, `date-fns`, and the shadcn/ui CLI.
> 3. Initialize shadcn/ui with the Slate base color, then override Tailwind theme with the WTW brand palette from the brief (Brand Gold `#D2A63C`, Near Black `#1D1912`, Cream `#F3F3E6`, Gold Light `#EECD5C`, Deep Gold `#BB8525`).
> 4. Add Source Sans 3 from Google Fonts as the default app font.
> 5. Set up Firebase: `lib/firebase/client.ts` for the client SDK, `lib/firebase/admin.ts` for the Admin SDK, environment variables in `.env.local` (template only — I'll fill in real values).
> 6. Create the empty Firestore Security Rules file with `allow read, write: if false;` as the default — we'll lock down per-collection in a later step.
> 7. Build a minimal landing page at `/` showing the WTW gold medal logo and the words "Worth Their Weight CRM" in Source Sans 3 Black, with a "Sign in" button that goes to `/login` (also stubbed).
>
> When that's done, stop and show me what you've got. Then we'll do auth, then the veterans data model, then VSOs, then audit logging, then RBAC rules, then the dashboard.
>
> Ship small, verify each step, don't get ahead.

---

## What I'd push back on (worth Cory's read)

A few honest flags before you start:

1. **Field-level encryption for SSN in Firestore is real work.** Firestore doesn't have native column-level encryption like Postgres. You either (a) encrypt client-side before write using Cloud KMS, which adds friction to every read, or (b) just don't store SSN at all and key off DOB + name. Recommendation: **don't store last 4 SSN in v1.** VSOs will collect it during intake. WTW doesn't need it.
2. **Audit logging on reads is expensive.** Every veteran detail page view writes an audit log entry, which is a Firestore write. At WTW's volume this is fine ($negligible). Just know that if traffic ever spikes (e.g. you build a public-ish dashboard), this scales linearly with views.
3. **Two roles will not be enough by month 6.** Once Patrick is fundraising and a Brigade Commander shows up, you'll want role-based veteran visibility (e.g. fundraising staff shouldn't see veteran PII). Plan for that v2 migration — keep the `role` field as a string enum, not a boolean, so adding new roles is a config change not a schema change. (Already done in the model above.)
4. **Don't build this and the handoff packet PDFs in the same sprint.** Pick one, finish it, then start the other. Half-built tools become permanent.