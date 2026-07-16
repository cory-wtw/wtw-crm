"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { UserRole } from "@/lib/schemas";
import {
  changeUserRoleAction,
  inviteUserAction,
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
  isSelf: boolean;
};

export type InviteRow = {
  email: string;
  role: UserRole;
  invitedAt: string;
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
    const result = await inviteUserAction(inviteEmail, inviteRole);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setInviteEmail("");
    setInviteRole("standard");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
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
              onChange={(e) => setInviteEmail(e.target.value)}
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
            className="inline-flex h-[38px] items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
          >
            Send invite
          </button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          The invite materializes into a user record the first time that
          email signs in with Google.
        </p>
      </section>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          Pending invites ({invites.length})
        </h2>
        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invites.</p>
        ) : (
          <div className="mobile-touch-scroll overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                <th className="py-2">Email</th>
                <th className="py-2">Role</th>
                <th className="py-2">Sent</th>
                <th className="py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.email} className="border-t border-border">
                  <td className="py-2.5 font-bold">{i.email}</td>
                  <td className="py-2.5 capitalize">{i.role}</td>
                  <td className="py-2.5 text-muted-foreground">
                    {i.invitedAt}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={run(() => revokeInviteAction(i.email))}
                      disabled={isPending}
                      className="text-xs font-bold text-destructive underline-offset-4 hover:underline disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          Users ({users.length})
        </h2>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users yet.</p>
        ) : (
          <div className="mobile-touch-scroll overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                <th className="py-2">Name / Email</th>
                <th className="py-2">Role</th>
                <th className="py-2">Status</th>
                <th className="py-2">Last login</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.uid} className="border-t border-border">
                  <td className="py-2.5">
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
                  <td className="py-2.5">
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
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    >
                      <option value="standard">Standard</option>
                      <option value="admin">Admin</option>
                      <option value="social">Social (media only)</option>
                    </select>
                  </td>
                  <td className="py-2.5">
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
                  <td className="py-2.5 text-muted-foreground">
                    {u.lastLoginAt}
                  </td>
                  <td className="py-2.5 text-right">
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
