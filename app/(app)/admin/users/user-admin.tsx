"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  INVITE_TTL_DAYS,
  ORG_EMAIL_DOMAIN,
  STALE_LOGIN_DAYS,
  isOrgEmail,
} from "@/lib/auth-provisioning";
import type { UserRole } from "@/lib/schemas";
import {
  changeUserRoleAction,
  inviteUserAction,
  resendInviteAction,
  revokeInviteAction,
  setUserActiveAction,
} from "./actions";

export type UserRow = {
  uid: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  active: boolean;
  createdAt: string;
  lastLoginAt: string;
  staleLogin: boolean;
  isSelf: boolean;
};

export type InviteRow = {
  email: string;
  role: UserRole;
  invitedAt: string;
  expired: boolean;
};

export function UserAdmin({
  users,
  invites,
}: {
  users: UserRow[];
  invites: InviteRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("standard");
  const [inviteOutsideOrg, setInviteOutsideOrg] = useState(false);
  const inviteIsOutside =
    inviteEmail.includes("@") && !isOrgEmail(inviteEmail.trim());

  function run<T extends { ok: true } | { ok: false; error: string }>(
    work: () => Promise<T>,
  ) {
    return async () => {
      setError(null);
      const result = await work();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      startTransition(() => router.refresh());
    };
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (inviteIsOutside && !inviteOutsideOrg) {
      setError(
        `Only @${ORG_EMAIL_DOMAIN} emails can be invited. Tick "Outside the org (contractor)" to invite this one anyway.`,
      );
      return;
    }
    const result = await inviteUserAction(
      inviteEmail,
      inviteRole,
      inviteOutsideOrg,
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setInviteEmail("");
    setInviteRole("standard");
    setInviteOutsideOrg(false);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(29_25_18/0.04)] sm:p-6">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          Invite teammate
        </h2>
        <form
          onSubmit={onInvite}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex-1 min-w-[240px] space-y-1.5">
            <label htmlFor="invite-email" className="block text-sm font-bold">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                // The override is per-address: don't let it carry over.
                setInviteOutsideOrg(false);
              }}
              placeholder="teammate@worththeirweight.org"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="invite-role" className="block text-sm font-bold">
              Role
            </label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as UserRole)}
              className="h-[38px] rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="standard">Standard</option>
              <option value="admin">Admin</option>
              <option value="social">Social (media only)</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-[38px] items-center justify-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
          >
            Send invite
          </button>
          <label
            htmlFor="invite-outside-org"
            className="flex basis-full items-center gap-2 text-sm"
          >
            <input
              id="invite-outside-org"
              type="checkbox"
              checked={inviteOutsideOrg}
              onChange={(e) => setInviteOutsideOrg(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-[color:var(--wtw-deep-gold)]"
            />
            Outside the org (contractor)
          </label>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          The invite materializes into a user record the first time that
          email signs in with Google. Invites expire after {INVITE_TTL_DAYS}{" "}
          days. Only @{ORG_EMAIL_DOMAIN} emails are allowed unless you tick
          the contractor box.
        </p>
      </section>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(29_25_18/0.04)] sm:p-6">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          Pending invites ({invites.length})
        </h2>
        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invites.</p>
        ) : (
          <div className="mobile-touch-scroll overflow-x-auto">
          <table className="block w-full text-sm sm:table sm:min-w-[32rem]">
            <thead className="hidden sm:table-header-group">
              <tr className="text-left text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                <th className="py-2">Email</th>
                <th className="py-2">Role</th>
                <th className="py-2">Sent</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="block sm:table-row-group">
              {invites.map((i) => (
                <tr key={i.email} className="block border-t border-border py-2 sm:table-row sm:py-0">
                  <td className="block py-1 sm:table-cell sm:py-2.5 font-bold">{i.email}</td>
                  <td className="block py-1 sm:table-cell sm:py-2.5 capitalize">{i.role}</td>
                  <td className="block py-1 sm:table-cell sm:py-2.5 text-muted-foreground">
                    {i.invitedAt}
                    {i.expired && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                        Expired
                      </span>
                    )}
                  </td>
                  <td className="block py-1 sm:table-cell sm:py-2.5 sm:text-right">
                    <span className="inline-flex gap-4">
                      <button
                        type="button"
                        onClick={run(() => resendInviteAction(i.email))}
                        disabled={isPending}
                        className="text-xs font-bold text-[color:var(--wtw-deep-gold)] underline-offset-4 hover:underline disabled:opacity-50"
                      >
                        Resend
                      </button>
                      <button
                        type="button"
                        onClick={run(() => revokeInviteAction(i.email))}
                        disabled={isPending}
                        className="text-xs font-bold text-destructive underline-offset-4 hover:underline disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(29_25_18/0.04)] sm:p-6">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          Users ({users.length})
        </h2>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users yet.</p>
        ) : (
          <div className="mobile-touch-scroll overflow-x-auto">
          <table className="block w-full text-sm sm:table sm:min-w-[44rem]">
            <thead className="hidden sm:table-header-group">
              <tr className="text-left text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                <th className="py-2">Name / Email</th>
                <th className="py-2">Role</th>
                <th className="py-2">Status</th>
                <th className="py-2">Last login</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="block sm:table-row-group">
              {users.map((u) => (
                <tr key={u.uid} className="block border-t border-border py-2 sm:table-row sm:py-0">
                  <td className="block py-1 sm:table-cell sm:py-2.5">
                    <p className="font-bold">
                      {u.displayName ?? u.email}
                      {u.isSelf && (
                        <span className="ml-2 text-[10px] uppercase tracking-[0.15em] text-[color:var(--wtw-deep-gold)]">
                          you
                        </span>
                      )}
                    </p>
                    {u.displayName && (
                      <p className="text-xs text-muted-foreground">
                        {u.email}
                      </p>
                    )}
                  </td>
                  <td className="block py-1 sm:table-cell sm:py-2.5">
                    <select
                      value={u.role}
                      onChange={(e) =>
                        run(() =>
                          changeUserRoleAction(u.uid, e.target.value),
                        )()
                      }
                      disabled={
                        isPending || (u.isSelf && u.role === "admin")
                      }
                      className="h-11 rounded-md border border-input bg-background px-2 text-xs focus:outline-none sm:h-8 focus:ring-2 focus:ring-ring disabled:opacity-50"
                    >
                      <option value="standard">Standard</option>
                      <option value="admin">Admin</option>
                      <option value="social">Social (media only)</option>
                    </select>
                  </td>
                  <td className="block py-1 sm:table-cell sm:py-2.5">
                    {u.active ? (
                      <span className="inline-flex items-center rounded-full bg-primary/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em]">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                        Deactivated
                      </span>
                    )}
                  </td>
                  <td className="block py-1 sm:table-cell sm:py-2.5 text-muted-foreground">
                    {u.lastLoginAt}
                    {u.staleLogin && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold tracking-[0.05em] text-muted-foreground">
                        Last login over {STALE_LOGIN_DAYS} days ago
                      </span>
                    )}
                  </td>
                  <td className="block py-1 sm:table-cell sm:py-2.5 sm:text-right">
                    {u.isSelf ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : u.active ? (
                      <button
                        type="button"
                        onClick={run(() =>
                          setUserActiveAction(u.uid, false),
                        )}
                        disabled={isPending}
                        className="text-xs font-bold text-destructive underline-offset-4 hover:underline disabled:opacity-50"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={run(() =>
                          setUserActiveAction(u.uid, true),
                        )}
                        disabled={isPending}
                        className="text-xs font-bold text-[color:var(--wtw-deep-gold)] underline-offset-4 hover:underline disabled:opacity-50"
                      >
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}
