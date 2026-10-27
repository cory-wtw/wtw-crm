# Roster MCP — Claude edits, admin approves

Claude (phone, web or desktop) can look up veterans and VSOs and **propose**
changes. Nothing is written to a record until an admin approves it on
**Admin → Claude changes**.

## What Claude can do
- Read: `search_veterans`, `get_veteran`, `search_vsos`, `get_vso`, `list_staff`
- Propose: `propose_veteran_create`, `propose_veteran_update`,
  `propose_contact_note`, `propose_vso_create`, `propose_vso_update`
- Track its own: `list_change_requests`, `get_change_request`, `withdraw_change_request`

No approve tool, no delete tool.

## How strict approval is
- Admin-only, behind the normal signed-in session. The MCP key can't approve.
- Each request shows every field before → after plus Claude's reason.
- Approve writes exactly those values, in one transaction with the audit entry.
- If anyone edited those fields after Claude proposed, approval is refused and
  the request is marked **out of date** — Claude must look again and re-propose.
- Re-validated on approval with the same schema as the edit forms.
- Requests expire after 7 days.
- Every proposal, withdrawal and decision is in the Audit log.

## Turn it on
1. `openssl rand -hex 32 | firebase apphosting:secrets:set ROSTER_MCP_KEY --data-file=-`
2. Uncomment the `ROSTER_MCP_KEY` block at the bottom of `apphosting.yaml`, deploy.
3. `npm run deploy-rules` (adds the `changeRequests` rule).
4. claude.ai → Settings → Connectors → Add custom connector →
   URL `https://<roster-host>/api/mcp/<the key>`. It then works in the Claude phone app.

The key is the password — anyone with the URL can read veteran records and
queue proposals. To rotate it, set a new secret and redeploy, then update the
connector URL.
