# Roster MCP — Claude does the data entry, an admin approves

Talk to Claude (phone, web or desktop): paste a call transcript, or say "I
talked to Maria, she got the job at Amazon." Claude looks up the records and
**proposes** every change. Nothing is saved until an admin approves it on
**Admin → Claude changes**.

## What Claude can propose
- Veterans: new, edit (contact, location, eligibility, stage, benefits, VSOs)
- Timeline notes ("called, left voicemail")
- Intakes — runs the matcher, returns the short list
- Referrals — after approval the packet text is on the review page (and
  Claude can fetch it to draft the email). Nothing is ever sent automatically.
- Follow-ups on referrals, and wins (job, housing, SNAP…)
- VSOs, community resources: new and edit
- Finances: new transaction, edit transaction

A whole call shares one label, so the review page groups it with an
**Approve all** button (in order, stopping at the first problem). A new veteran
and their intake/referral/notes can be proposed together.

Can't: approve anything, delete anything, touch users/roles, social media,
attachments, finance records/imports.

## How strict approval is
- Only a signed-in admin approves, in the Roster itself. Claude can't.
- Every request shows what changes and Claude's reason.
- Approving runs the same code as the app's own buttons, with the same checks.
- If someone edited the same fields after Claude proposed, it's refused and
  marked **out of date**.
- A request for a new veteran's intake/referral waits until that veteran is
  approved.
- Requests expire after 7 days. Everything is in the Audit log.

## Security
- Claude connects with **Google sign-in**: only active Roster admins can
  connect, and they tap Allow on a Roster page.
- Tokens last an hour, refresh tokens rotate, all stored as hashes.
- Every call re-checks the person is still an active admin. **Disconnect**
  on Admin → Claude changes, or deactivating the user, cuts it off at once.
- Sign-in only returns to claude.ai / claude.com / your own computer.
- Crisis, MST, housing and VA-benefit answers steer the match and are never
  stored — not in the request, not on the timeline.
- Note: what Claude reads (records, transcripts) passes through Anthropic,
  and through Plaud if you record calls there.

## Housekeeping (one-time, recommended)
- In the Google Cloud console → Firestore → TTL, add a policy on field
  `expiresAt` for collections `oauthTokens` and `oauthCodes`, so expired
  sign-in tokens delete themselves.
- Optionally set `APP_ORIGIN=https://<roster-host>` in apphosting.yaml so
  sign-in links never depend on forwarded headers.

## Testing
`npm run e2e:mcp` runs the whole flow against the Firestore emulator
(instructions at the top of scripts/e2e-mcp.ts).

## Turn it on
1. Deploy, then run `npm run deploy-rules`.
2. claude.ai → Settings → Connectors → **Add custom connector** →
   URL `https://<roster-host>/api/mcp`. Sign in with your WTW Google account
   and tap **Allow**. It then works in the Claude phone app.
