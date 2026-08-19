# The Roster · Concierge Intake and Matching Build Spec
## v2.0 · August 18, 2026 · Reconciled against the live codebase

Supersedes v1.0 in full. v1 was written without knowledge of the existing Roster architecture and specified several things that already exist under different names. This version extends what is there.

Stack: Next.js 16.2.6 App Router, React 19, Firebase Auth / Firestore / Storage, Cloud Run via App Hosting, Tailwind v4, react-hook-form + zod, TanStack Table, Vitest.

---

# 0 · WHAT THIS SYSTEM IS

A veteran calls. A human runs a fifteen-minute structured intake. The system filters the resource directory on hard eligibility gates, ranks what survives, and surfaces a short list. The human picks five, reviews, and sends. Two weeks later a follow-up is due, and the answer feeds back into resource verification.

**What this system is not.** It makes no claim determinations. It tells no veteran what to file. It decides nothing on its own. It narrows a field so a person can choose well.

## Non-negotiable constraints

1. **People First.** No automated output reaches a veteran without a human approving it. Externally this is never described as an algorithm or as automated matching.
2. **Accreditation boundary.** WTW is not VA-accredited. Intake records facts a veteran states. It never records or generates a recommendation about what to claim, which conditions to file, or what a rating should be.
3. **Data minimization.** Collect nothing that is not necessary. See §2.1 for where the line sits and why.
4. **No outcome or dollar guarantees** in any generated output. "May qualify for" only.

---

# 1 · RECONCILIATION WITH THE EXISTING CODEBASE

What v1 got wrong, and what this version does instead.

| v1 specified | Reality | v2 approach |
|---|---|---|
| New `programs` collection | `resources/{id}` already exists | Extend `resources` with gate fields |
| Top-level `matches` collection | `veterans/{id}/encounters/{id}` exists | Referrals are encounters |
| Separate `verifications` collection | Nothing equivalent | New top-level collection, justified below |
| Weekly cron for URL checks | No Cloud Functions deployed, no scheduler | Manual admin-triggered batch run |
| Automated 14-day email trigger | No email infrastructure of any kind | Due-list computed at page load, human sends |
| Auto-sent follow-up email | No email | Generated text block, copy to clipboard, plus optional PDF |
| `dischargeCharacter` etc. as new fields | Removed in the data-minimization pass | Restored, deliberately. See §2.1 |

**On restoring the four eligibility fields.** The minimization pass removed income, household, branch, discharge, and notes together. Four of those were genuinely unnecessary. Discharge was not, because it is a hard eligibility gate that determines whether a referral succeeds or the veteran gets turned away at the door. The rule is collect nothing unnecessary, not collect as little as possible. These four are necessary and none of them are health or financial data.

---

# 2 · DATA MODEL

## 2.1 `veterans` — fields added

Existing fields stay exactly as they are: first name, last initial, one contact channel enforced by the `preferredContact` superRefine, optional birth year, city, state, `vsoIds[]`, `assignedPhoneId`, pipeline stage, `pipelineHistory[]`, the five stamped dates, `monthlyBenefitBefore` / `monthlyBenefitAfter`, audit stamps.

Add to `veteranSchema` in `lib/schemas/veteran.ts`:

| Field | Type | Notes |
|---|---|---|
| `dischargeCharacter` | enum, optional | `honorable` / `general` / `other` / `unsure` |
| `serviceEra` | enum, optional | `post911` / `gulf` / `vietnam` / `pre911` / `other` / `unsure` |
| `idStatus` | enum, optional | `valid` / `expired` / `none` / `unsure` |
| `hasDependents` | enum, optional | `yes` / `no` / `unsure` |
| `conciergeStatus` | enum, optional | `none` / `referred` / `followUpDue` / `closed` |
| `followUpDue` | Date, optional | Set at referral, +14 days |

All optional so no backfill is required. `lib/db/veterans.ts:deserialize` defaults every missing field, which is the existing convention.

**Not stored, ever.** Diagnoses, conditions, medications, income figures, household composition, claim history detail, SSN, date of birth, VA file number, full street address, full surname. The line: facts needed to route someone, nothing about their health or their money.

**On `unsure`.** Every eligibility field carries an `unsure` value, and it is not the same as a blank. Blank means nobody asked; `unsure` means somebody asked and the answer was "I don't know". Both fail closed at the gates, but only one of them is worth asking again — and only the blank one is safe for a later intake to overwrite. `runIntakeAction` treats a blank answer as "not asked this time" and leaves the stored value intact; clearing a stored answer is done from the veteran edit form, deliberately, by a person.

**On clearing an answer.** `veteranInputSchema` accepts `null` on the four eligibility fields; the domain schema does not. That asymmetry is the clear path: the veteran edit form sends an explicit null to wipe an answer, and `dropUndefined` keeps it so it reaches Firestore. Intake never sends null — a blank there is silence, not an instruction. Edit clears; intake never does.

**`safeTonight` is deliberately not a stored field.** A crisis answer is true at a moment, not about a person, and a stale `safeTonight: false` on a record read three months later is worse than no data. It is a transient form value that routes the call and is not persisted.

## 2.2 `resources` — fields added

The resource directory becomes the matching corpus. Add to `lib/schemas/resource.ts`:

**Gates**

| Field | Type | Notes |
|---|---|---|
| `buckets` | array of enum | One or more, see §2.5 |
| `geoScope` | enum | `national` / `state` / `local` |
| `geoStates` | array of string | Two-letter codes. Empty when national |
| `geoLocalities` | array of string | Cities or counties, required for `local` scope |
| `minDischarge` | enum | `any` / `general` / `honorable` |
| `requiresVaEnrollment` | bool | |
| `requiresValidId` | bool | |
| `eraRestriction` | array of enum | Empty means unrestricted |
| `requiresDependents` | bool | |
| `crisisCapable` | bool | Same-day intake available |

**Eligibility that isn't a gate**

| Field | Type | Notes |
|---|---|---|
| `eligibilityNotes` | string, optional, max 500 | Free text. Descriptive only — nothing in `lib/matching` reads it |

**On `eligibilityNotes`.** The eight gates above are boolean and decidable, which is why they can be trusted to exclude. Plenty of real eligibility isn't: combat theater service, military sexual trauma, mortuary duty or emergency medical care for casualties of war, drone crew supporting combat operations. Vet Centers turn on exactly that language. Without somewhere to put it, it vanishes between the gates and staff never sees the sentence that would have got the veteran through the door.

It never gates. A matcher interpreting prose would exclude people in ways nobody could predict or test, and a note written to help would become a silent no. It is read by a person: it shows on the resource detail page, beside each candidate on the intake results screen so staff sees it before selecting, and under the resource in the referral packet — screened like any other borrowed text (§5.1), and dropped rather than reworded when it trips, since there is no neutral stand-in for "who they take" that says anything true.

**Access**

| Field | Type | Notes |
|---|---|---|
| `accessMethod` | enum | `phone` / `web` / `walkin` / `referral` |
| `accessValue` | string | Number, URL, or address |
| `whatToBring` | string, optional | |
| `typicalWait` | enum | `sameday` / `days` / `weeks` / `months` / `unknown` |

**Verification**

| Field | Type | Notes |
|---|---|---|
| `verificationStatus` | enum | `live` / `aging` / `flagged` / `retired` |
| `fragility` | enum | `stable` / `fragile` |
| `lastVerified` | Date | |
| `lastVerifiedBy` | string | uid |
| `contentHash` | string, optional | For diff checks |
| `flagReason` | string, optional | |
| `sourceName` | string, optional | Where the record came from |
| `externalId` | string, optional | Source-namespaced id (e.g. `va-facilities:vc_0101V`). Importers key on it so a re-run updates rather than duplicates. Not on the input schema |

**On `minDischarge`.** Values are inclusive upward. `any` accepts everything including other-than-honorable. `general` accepts general and honorable. Getting this wrong on Vet Center records silently hides the single most useful resource for this population, since Vet Centers accept any character of discharge and require no VA enrollment.

## 2.3 Referrals as encounters

No new collection. A referral set is written to `veterans/{id}/encounters/{id}` with an encounter type of `referral` and:

| Field | Type |
|---|---|
| `type` | `"referral"` |
| `bucketsIdentified` | array of bucket codes |
| `referrals` | array of `{ resourceId, resourceName, rank, score }` |
| `followUpDue` | Date |
| `followUpCompleted` | Date, optional |

Outcomes are recorded as a second encounter of type `followUp`:

| Field | Type |
|---|---|
| `type` | `"followUp"` |
| `outcomes` | array of `{ resourceId, outcome, note }` |

`outcome` enum: `reached` / `unreachable` / `ineligible` / `declined` / `helped`.

This keeps the interaction timeline as the single history of a veteran, which is what encounters are already for, and it means no dangling foreign keys. The codebase already has two link fields with no referential integrity (`vso.referralsMade` never increments, `phone.assignedVeteranId` never syncs), so adding a third pattern of unmaintained links would compound an existing weakness.

## 2.4 `verifications` — new top-level collection

Append-only. One doc per check.

| Field | Type |
|---|---|
| `resourceId` | string |
| `checkType` | enum: `url` / `contentDiff` / `keyword` / `aiReview` / `grantList` / `irsStatus` / `humanOutcome` / `manual` |
| `result` | enum: `pass` / `flag` / `fail` |
| `detail` | string |
| `checkedAt` | Date |
| `checkedBy` | string, `"system"` or uid |

Justified as top-level rather than a resource subcollection because the admin review queue needs to read across all resources at once, and a collection-group query for that is more machinery than a flat collection with a `resourceId` field.

## 2.5 Bucket codes

Fixed enum in `lib/schemas/bucket.ts`, with a `BUCKET_LABELS` map and a `BUCKET_PROMPTS` map for the read-aloud text. Follows the existing schema-file convention.

| Code | Label |
|---|---|
| `crisis` | Crisis |
| `housing` | Housing |
| `essentials` | Food & Essentials |
| `health` | Health Care |
| `mental` | Mental Health & Recovery |
| `claims` | VA Benefits & Claims |
| `income` | Income & Assistance |
| `work` | Work & School |
| `legal` | Legal & Records |
| `family` | Family & Caregiving |
| `transport` | Getting There |

## 2.6 Pipeline reconciliation

The existing pipeline `found → connected → filed → won → lost` is a claims pipeline. A concierge veteran who receives five program referrals never files anything and would sit at `connected` permanently, skewing the stage counts at the top of `/veterans`.

`conciergeStatus` is therefore a separate axis, not a new stage. A veteran can be `connected` on the claims pipeline and `closed` on concierge, or have `conciergeStatus: none` and move through claims normally.

`countVeteransByStage()` stays as it is. Add a separate concierge count if the veterans page needs it, but do not merge the two.

---

# 3 · INTAKE FORM

Route: `app/(app)/veterans/[id]/intake/page.tsx`, plus `intake-form.tsx` as the client component. Reachable from the veteran detail page and from a new-veteran flow.

Built for a staff member typing while on a phone call, not for self-serve. Optimize entry speed over polish. Single scrolling page with section headings rather than a wizard, because a wizard costs clicks and staff needs to jump back when a veteran circles around.

Form schema is all-strings and distinct from the domain schema, coerced at submit, per the existing `*-form.tsx` convention.

## 3.1 Section 1 · Triage

Asked first, always.

**Safe tonight?** (not persisted)
> Is tonight the problem? Nowhere safe to sleep, or you're in danger, or you're in a bad place mentally right now.

If **no**: collapse the rest of the form, surface `crisisCapable` resources only, show the Veterans Crisis Line (988 then 1, or text 838255) at the top of the results. Everything else waits.

**Receiving VA benefits?**
> Have you ever filed for disability with the VA? If you haven't, or you filed and got turned down, that's a yes for us.

`no` or `unsure` flags the claims lane and routes to an accredited partner. The system never assesses the claim.

## 3.2 Section 2 · Needs

Lead-in, displayed above the checkboxes and read aloud:

> I'm going to run through a short list of things we help with. Some won't apply. Just say yes or no as I go, and if you're not sure, say that and we'll come back to it.

Eleven checkboxes. Each label is the read-aloud prompt, not the bucket name. Bucket names are internal vocabulary and mean nothing to a veteran.

| Bucket | Read aloud |
|---|---|
| Crisis | Is tonight the problem? Nowhere safe to sleep, or you're in danger, or you're in a bad place mentally right now. |
| Housing | Do you need somewhere to live, or are you about to lose where you're at? |
| Food & Essentials | Food, clothes, hygiene stuff, anything for the house. |
| Health Care | Do you need to see a doctor or a dentist? Includes getting signed up with the VA if you never did. |
| Mental Health & Recovery | Somebody to talk to. Counseling, PTSD, drinking or using, or just another veteran who gets it. |
| VA Benefits & Claims | Have you ever filed for disability with the VA? If you haven't, or you filed and got turned down, that's a yes. |
| Income & Assistance | Money coming in. Social Security, food stamps, help with the light bill or the rent, somebody to help with debt. |
| Work & School | Looking for work, going back to school, getting a certification, or starting something of your own. |
| Legal & Records | Do you have a valid ID? Do you have your DD-214? Anything with a discharge upgrade or a court date also goes here. |
| Family & Caregiving | Anybody depending on you, or anybody taking care of you. Kids, a spouse, an aging parent. |
| Getting There | How you get around and how people reach you. A ride, a bus pass, a phone, internet. |

Checked buckets are stored on the encounter as `bucketsIdentified`. **No per-bucket free-text notes.** v1 specified them; they are a notes field by another name, and notes were removed in the minimization pass for good reason.

## 3.3 Section 3 · Eligibility keys

**ID**
> Do you have a current state ID or driver's license on you? Expired counts, just tell me it's expired.

**Discharge**
> What's on your discharge paperwork? Honorable, general, something else, or you're not sure. Doesn't disqualify you either way, I just need to know which doors open.

That second sentence stays in the UI as helper text. It is the difference between an honest answer and a hangup.

**Era** dropdown. **Dependents** yes/no.

## 3.4 Submit

Server action `runIntakeAction` in `app/(app)/veterans/[id]/actions.ts`:

1. `getSession()`, reject if absent
2. `canAccessCrm(session)`, reject if false
3. `canEditVeteran(session, veteran)`, reject if false
4. zod parse the input
5. Update the veteran doc with the four eligibility fields
6. Run gate filter and ranking in memory
7. Return top 8 with gate results and flags

Returns `{ ok: true, candidates }` or `{ ok: false, error }`, per the existing discriminated-union convention. Nothing is written to encounters yet.

**Target:** roughly 20 clicks, no typed prose. Under fifteen minutes with conversation.

---

# 4 · MATCHING ENGINE

Lives in `lib/matching/` as pure functions with no I/O, unit-tested. Mirrors the `lib/permissions.ts` pattern: pure, testable, called from actions.

Files: `lib/matching/gates.ts`, `lib/matching/ranking.ts`, `lib/matching/index.ts`, plus `__tests__`.

## 4.1 Gate filter

Boolean only. No scoring, no fuzzy matching. Eligibility is not a probability.

```ts
export function passesGates(v: MatchInput, r: Resource): GateResult {
  const failures: string[] = [];

  if (v.safeTonight === false && !r.crisisCapable) {
    return { passes: false, failures: ["not crisis-capable"] };
  }

  // Geography
  if (r.geoScope !== "national") {
    if (!v.state || !r.geoStates.includes(v.state)) failures.push("geography");
    else if (r.geoScope !== "state") {
      if (!v.city || !r.geoLocalities.some(l => matchesLocality(l, v.city!)))
        failures.push("locality");
    }
  }

  // Discharge, inclusive upward
  const need = { any: 0, general: 1, honorable: 2 }[r.minDischarge];
  const have = { other: 0, unsure: 0, general: 1, honorable: 2 }[
    v.dischargeCharacter ?? "unsure"
  ];
  if (need > have) failures.push("discharge");

  if (r.requiresVaEnrollment && v.receivingVaBenefits === "no")
    failures.push("va enrollment");

  if (r.requiresValidId && v.idStatus !== "valid") failures.push("valid id");

  if (r.eraRestriction.length && !r.eraRestriction.includes(v.serviceEra ?? "unsure"))
    failures.push("era");

  if (r.requiresDependents && v.hasDependents !== "yes") failures.push("dependents");

  if (!r.buckets.some(b => v.needs.includes(b))) failures.push("no bucket overlap");

  if (!["live", "aging"].includes(r.verificationStatus)) failures.push("unverified");

  return { passes: failures.length === 0, failures };
}
```

**`unsure` fails closed.** Unknown discharge is treated as `other`, so nothing gets recommended that would turn the veteran away. The match screen shows a "confirm discharge before sending" flag. Failing open here means a veteran travels somewhere, gets refused, and does not call back.

`GateResult` carries `failures` so the staff review screen can show why something was excluded. Useful in Phase 0 for discovering that a gate is misconfigured.

## 4.2 Ranking

Applied only to gate survivors. Weights live in one exported const so they can be tuned without touching logic.

| Signal | Weight | Condition |
|---|---|---|
| Crisis | 1000 | `crisisCapable` when `safeTonight === false` |
| Legal unlock | 200 | `legal` bucket when `idStatus !== "valid"` |
| Geographic proximity | 120 / 80 / 40 | locality / state / national |
| Access friction | 100 / 60 / 30 / 10 | walkin / phone / web / referral |
| Wait | 80 / 50 / 20 / 0 | sameday / days / weeks / months |
| Freshness | 60 / 30 / 0 | under 90d / 90–180d / over 180d |
| Bucket coverage | 25 each | Per matched bucket |

**Legal & Records outranks what the veteran asked for, on purpose.** No valid ID blocks a housing voucher, a job, and a bank account. If someone calls about housing with no ID, the ID surfaces first.

## 4.3 Review screen

`app/(app)/veterans/[id]/intake/results` renders the top 8 as cards. Each shows name, one-line description, buckets matched, access method and value, `typicalWait`, `lastVerified`, score, and any flags.

Staff checks five, may add one manually by searching resources, then approves.

**Hard rule.** No code path sends or writes a referral without an explicit approval action. There is no auto-send anywhere in the codebase.

Approval calls `createReferralAction`, which writes the `referral` encounter, sets `conciergeStatus: "referred"`, sets `followUpDue` to +14 days, calls `logAudit`, and `revalidatePath`s.

---

# 5 · OUTPUT AND FOLLOW-UP

No email infrastructure exists and this spec does not add any. Cloud Functions are a dependency but nothing is deployed, and standing up a mail provider for ten to twelve referrals a month is not proportionate.

## 5.1 The referral output

`createReferralAction` returns a formatted plain-text block. The results page renders it in a `<pre>` with a copy button. Cory pastes it into Gmail and sends from `cory@worththeirweight.org`.

Contains: the five resources, one line each on what they do, how to start, what to bring, and one sentence saying we will check back in two weeks.

Must not contain: dollar figures, outcome predictions, claim advice, or any statement about what to file.

**Optional, Phase 5:** a printable PDF version. `@react-pdf/renderer` is already installed with no importer, so this costs a component and no new dependency.

## 5.2 The follow-up queue

No cron. `app/(app)/follow-ups/page.tsx` reads veterans where `conciergeStatus === "referred"` and `followUpDue <= now`, sorted oldest first. Add it to `navItems` in `app/(app)/layout.tsx`, gated on `canAccessCrm`.

Because `listVeterans()` already reads the full collection, this is a JS filter over rows already in memory. No index, no query.

Each row opens a short form: for each resource referred, one of reached / unreachable / ineligible / declined / helped, plus an optional note. Submitting writes a `followUp` encounter, writes one `verifications` doc of type `humanOutcome` per resource, and sets `conciergeStatus: "closed"`.

**This is the most valuable verification signal in the system.** No crawler can tell you a phone number is dead. A veteran who tried can.

Two `unreachable` outcomes on the same resource inside 60 days sets `verificationStatus: "flagged"`.

---

# 6 · RESOURCE INGESTION

Do not build a scraper farm. Almost all of this is already compiled by federal agencies.

## 6.1 Sources, in build order

| Source | Coverage | Method |
|---|---|---|
| National Resource Directory | 16,000+ vetted resources, all buckets | Check the JSON/Search widget on the site first |
| VA Facilities API (developer.va.gov) | Medical centers, clinics, Vet Centers, mobile Vet Centers, VBA offices | Free REST API, instant sandbox key, demo required for production |
| SSVF grantee list | Housing, all states | Published list |
| LSV grantee list (va.gov/homeless/lsv.asp) | Legal services, with counties served | Download |
| GPD provider list | Transitional housing | Download |
| VA OGC accredited rep search | VSOs, agents, attorneys | Download. Feeds `vsos`, not `resources` |
| State departments of veterans affairs | County Veteran Service Officers | Manual, one-time |
| 211 by state | Food, utilities, transport | Hand-curated |
| ProPublica Nonprofit Explorer | IRS exempt status, 990 history | Free API, verification only |

**Bucket gap.** Federal lists cover Housing, Health, Mental Health, Claims, Legal, and Work well. They cover Food & Essentials, Family & Caregiving, and Getting There poorly, because those are not veteran-specific. Hand-build those three.

## 6.2 Import mechanics

No Cloud Functions. Import runs as a one-off tsx script in `scripts/`, matching the existing `scripts/migrate-*.ts` pattern run against `.env.local`.

**AI enrichment is a page, not part of the importer.** v2.0 described it inline in the import script; that shape suits a bulk feed and fights the actual first job, which is 75 hand-picked national organizations pasted in from a list. Enrichment therefore lives at `app/(app)/admin/resources/enrich`, `canApproveImportedResource` only: paste one URL or a list, one per line; per URL the server fetches the page, sends the text to the Anthropic API, and proposes a record; the proposal renders beside the fetched page text with every field editable, to approve or discard. Bulk imports (the VA Facilities script and anything after it) stay unenriched — they map gate values by record type and land flagged for the same review.

Rules the page holds to:

- The API key is read server-side only and never reaches the client.
- The prompt demands JSON only, and the parser strips fences and tolerates junk anyway. A model that ignores the instruction must not take the batch down with it.
- **Any field the page doesn't support comes back `null`, never a guess.** A null prompts a human; a guess is a silent error nobody finds. Each null is marked "page didn't say" beside its field, and the value under it is the schema's permissive default — a placeholder, not a finding. It is not counted or reported as a hole in the record: a page that says nothing about discharge is a page about something else, not an incomplete one.
- **Eligibility written in prose goes to `eligibilityNotes`** (§2.2), in the organization's own terms. The boolean fields hold what reduces to a checkbox; this holds the rest, and is the difference between a Vet Center record that reads "any discharge" and one that also says who else it takes.
- One URL at a time, so a fetch failure or an unparseable response costs that URL and not the batch.
- Written `flagged`, `sourceName: "ai-enrich"`, `externalId: ai-enrich:<url-hash>` for idempotency.

An admin review queue at `app/(app)/admin/resources/review` lists flagged records for approval in bulk. On approval, store `contentHash` and set `live`.

**Never auto-publish an AI-enriched record.** A wrong gate value silently misroutes veterans and nobody finds out.

---

# 7 · DEAD RESOURCE DETECTION

## 7.1 Manual batch runner

No Cloud Scheduler. `app/(app)/admin/verification/page.tsx` with a "Run checks" button, admin-only.

**Cloud Run timeout is the real constraint.** A batch of several hundred URL fetches will exceed the request limit. The action processes a bounded batch, defaults to 25 resources, ordered by `lastVerified` ascending, and returns a cursor. The client loops, calling the action until it reports done, showing progress. Keeps each request well under timeout with no new infrastructure.

## 7.2 Checks

| # | Check | Cost |
|---|---|---|
| 1 | URL health: 404, 500, or redirect to site root | Free |
| 2 | Content hash diff against stored `contentHash` | Free |
| 3 | Keyword scan: "no longer accepting", "program has ended", "funding has expired", "waitlist closed", "temporarily suspended" | Free |
| 4 | AI review, **only on records that tripped 1, 2, or 3** | Low |
| 5 | Grant list diff: re-download SSVF, GPD, LSV, compare year over year | Free, annual, run as a script |
| 6 | IRS exempt status via ProPublica | Free, annual |

**Check 1 catches the sneaky failure.** A redirect to a site's homepage usually means the program page was deleted and someone papered over it. Bunker Labs would surface here, since it was absorbed into Syracuse IVMF in January 2024 and anyone referring veterans to that name is sending them nowhere.

**Check 5 is the strongest automated signal.** Grant lists republish by fiscal year. An organization present last year and absent this year lost its funding. That is a fact, not an inference.

**Check 4 asks three questions only:** does this still exist, did contact info change, did eligibility change. It writes a flag. It never decides.

## 7.3 Fragility tiering

Tag `stable` or `fragile` at import. `stable` covers VA facilities, federal programs, large national nonprofits. `fragile` covers small nonprofits, single-site programs, grant-dependent services.

The batch runner orders by `lastVerified` ascending within fragility tier, so fragile records surface more often without any scheduling.

## 7.4 Status transitions

```
live    ──(90d since lastVerified)──> aging
live    ──(any check flags)─────────> flagged
aging   ──(180d)────────────────────> flagged
flagged ──(human confirms ok)───────> live
flagged ──(human confirms dead)─────> retired
retired ─────────────────────────────> stays, never deleted
```

`live` and `aging` appear in matches, `aging` ranked lower. `flagged` and `retired` do not appear.

**Never auto-retire.** Flags go to a human queue. A false positive that silently removes a good resource is worse than a stale record, because nobody ever finds out.

The `live → aging` transition is computed at read time in `lib/db/resources.ts:deserialize` from `lastVerified`, not written by a job. No scheduler needed.

---

# 8 · PERMISSIONS

Add to `lib/permissions.ts`, with cases in `lib/permissions.test.ts`:

| Predicate | Rule |
|---|---|
| `canRunIntake(session, veteran)` | Same as `canEditVeteran` |
| `canCreateReferral(session, veteran)` | Same as `canEditVeteran` |
| `canRecordFollowUp(session, veteran)` | Same as `canEditVeteran` |
| `canManageResources(session)` | `canAccessCrm` |
| `canRunVerification(session)` | Admin only |
| `canApproveImportedResource(session)` | Admin only |

`social` role sees none of this, already handled by `isSocialOnly`.

Enforcement is in `permissions.ts` plus the action, since every write goes through the Admin SDK and bypasses rules. `firestore.rules` still needs a `verifications` match block, because the deny-all catch-all makes a new collection invisible to clients otherwise.

---

# 9 · AUDIT

Add to `RESOURCE_TYPES` in `lib/schemas/audit.ts`: `encounter`, `verification`. Resources are presumably already there.

Add matching entries to `RESOURCE_TYPE_LABELS` and `resourceLink()` in `app/(app)/admin/audit/page.tsx`.

Audited: referral creation, follow-up recording, resource create/update/delete, verification status changes, imported-record approval.

Not audited: running the gate filter, running a batch check that produces no status change. Reads are not logged, per the existing behavior since commit 7ba1f8d.

---

# 10 · DATA RETENTION

Write the rule down before building deletion, or "bare minimum" becomes inconsistent deletion and a funder eventually asks.

| Data | Retention |
|---|---|
| Veteran, active | Indefinite while active |
| Veteran, closed | 24 months, then purge `contactValue`, `city`, `birthYear` |
| Eligibility fields | Purged with contact fields at 24 months |
| Unreachable after 3 attempts | 90 days, then purge contact fields |
| Encounters | Retained, anonymized once the parent veteran is purged |
| `verifications` | Indefinite, no personal data |
| Resources | Indefinite, including `retired` |

Implemented as `scripts/purge-stale.ts`, run manually on a calendar reminder. No scheduler.

---

# 11 · AI BOUNDARIES

Permitted, all staff-facing, none reaching a veteran unreviewed:

1. Resource record enrichment at import, human approves
2. Flagged-record review, writes flags only
3. Referral text drafting, human copies and sends

Prohibited:

1. Any claim determination or filing recommendation
2. Auto-sending anything to a veteran
3. Auto-publishing or auto-retiring a resource
4. Generating dollar figures or outcome predictions
5. Being described externally as an algorithm or as automated matching

The external description stays true because it is true: a person runs the call, a person picks the five, a person sends the email.

---

# 12 · BUILD PHASES

| Phase | Deliverable | Gate to proceed |
|---|---|---|
| **0** | Spreadsheet, 40 resources across all eleven buckets. Run 10 real veterans by hand | Gates and weights confirmed against real calls |
| **1** | Bucket schema, resource schema extension, resource form updated | Existing resources page still works |
| **2** | `lib/matching/` gates + ranking + tests. No UI | Unit tests pass against Phase 0 data |
| **3** | Intake form, `runIntakeAction`, results screen | Ten intakes under 15 minutes each |
| **4** | `createReferralAction`, encounter write, copy-to-clipboard output | Referrals recorded, text usable as-is |
| **5** | Follow-up queue, `followUp` encounter, `humanOutcome` verifications | Outcomes flowing back |
| **6** | Import scripts, AI enrichment, admin review queue | Schema stable, no gate changes for 30 days |
| **7** | Batch verification runner, flag queue, status transitions | Flags reviewed without backlog |

**Phase 0 is not a formality.** Running real calls against a spreadsheet will show that some gates are wrong in ways no spec predicts, including this one. Finding out in a spreadsheet costs an afternoon. Finding out in Phase 6 costs a rebuild.

**Ship Phases 1 through 5 before touching 6 and 7.** A working loop over 40 resources beats a broken loop over 4,000.

---

# 13 · WHAT NOT TO BUILD

- A veteran-facing self-serve portal. The fifteen-minute human call is the product. Self-serve recreates the directories that already fail veterans.
- A public resource search. Sixteen thousand records already exist at NRD and a veteran still cannot use them. The database is not the differentiator.
- Semantic or AI matching. Eligibility is boolean. Fuzzy matching sends veterans to programs that turn them away.
- Cloud Functions, schedulers, or an email provider. Everything here works on request-triggered actions and manual runs.
- Server-side filtering or pagination for matching. Full-collection reads into memory are the existing pattern and are faster than compound queries at this scale.
- Anything storing a diagnosis, a rating, an income figure, or a claim detail.
- Automated outreach of any kind.

---

# 14 · NEXT 16 GOTCHAS

Repeated from `AGENTS.md` because a new feature will hit all three:

- Middleware is `proxy.ts` at repo root exporting `proxy()`, not `middleware.ts`. Matcher is duplicated in `lib/proxy-matcher.ts`; keep them in sync.
- Route params is a Promise: `{ params }: { params: Promise<{ id: string }> }`, then `const { id } = await params`.
- `serverExternalPackages: ["firebase-admin"]` in `next.config.mjs` is load-bearing. Without it Cloud Run 500s on every request.

Also: `dropUndefined()` and `formatIssues()` are copy-pasted into every `actions.ts` with no shared module. This spec adds two more action files. Worth extracting to `lib/action-helpers.ts` while you are in there, or continue the copy-paste for consistency. Either is fine, but pick one.

---

*Worth Their Weight is not a law firm and does not provide legal representation before the U.S. Department of Veterans Affairs. All claims-related services are performed by VA-accredited attorneys, agents, or Veterans Service Organizations.*

**Worth Their Weight** · 808 Chestnut St PMB 1333, Chattanooga, TN 37402 · EIN 41-5275144 · worththeirweight.org
