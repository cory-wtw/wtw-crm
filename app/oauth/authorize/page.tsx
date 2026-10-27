import Image from "next/image";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { getClient } from "@/lib/mcp/oauth";
import { isAdmin } from "@/lib/permissions";
import { decideAuthorizeAction } from "./actions";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm space-y-5 rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image src="/wtw-logo.png" alt="" width={56} height={56} priority />
          <h1 className="text-xl font-black tracking-tight">Connect Claude to the Roster</h1>
        </div>
        {children}
      </div>
    </main>
  );
}

/** Connector sign-in: Claude sends the admin here, the admin taps Allow. */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const clientId = one(p.client_id);
  const redirectUri = one(p.redirect_uri);
  const codeChallenge = one(p.code_challenge);
  const state = one(p.state);

  const client = await getClient(clientId);
  if (
    !client ||
    !client.redirectUris.includes(redirectUri) ||
    one(p.response_type) !== "code" ||
    !codeChallenge ||
    one(p.code_challenge_method) !== "S256"
  ) {
    return (
      <Shell>
        <p className="text-sm">This sign-in link isn&rsquo;t valid. Start again from Claude.</p>
      </Shell>
    );
  }

  const session = await getSession();
  if (!session) {
    const query = new URLSearchParams(
      Object.entries(p).map(([k, v]) => [k, one(v)]),
    ).toString();
    // Via /logout, like the app layout: a stale cookie would otherwise make
    // proxy.ts bounce /login straight back here.
    redirect(`/logout?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }
  if (!isAdmin(session)) {
    return (
      <Shell>
        <p className="text-sm">Only Roster admins can connect Claude. You&rsquo;re signed in as {session.email}.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-sm">
        <span className="font-bold">{client.clientName}</span> wants to use the Roster as{" "}
        <span className="font-bold">{session.email}</span>.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>It can read veterans, VSOs, resources and the books.</li>
        <li>It can propose changes. Nothing is saved until an admin approves it on Admin → Claude changes.</li>
        <li>You can disconnect it there any time.</li>
      </ul>
      <form action={decideAuthorizeAction} className="flex gap-2">
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="code_challenge" value={codeChallenge} />
        <input type="hidden" name="state" value={state} />
        <button
          name="decision"
          value="allow"
          className="inline-flex h-11 flex-1 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
        >
          Allow
        </button>
        <button
          name="decision"
          value="deny"
          className="inline-flex h-11 flex-1 items-center justify-center rounded-md border border-border px-4 text-sm font-bold transition-colors hover:bg-secondary"
        >
          Deny
        </button>
      </form>
      <p className="text-xs text-muted-foreground">
        It will send you back to {new URL(redirectUri).host}.
      </p>
    </Shell>
  );
}
