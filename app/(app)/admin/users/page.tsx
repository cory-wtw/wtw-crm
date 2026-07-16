import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { listInvites } from "@/lib/db/invites";
import { listAllUsers } from "@/lib/db/users";
import { formatDate } from "@/lib/format";
import { UserAdmin } from "./user-admin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session) notFound();
  if (session.role !== "admin") redirect("/");

  const [users, invites] = await Promise.all([
    listAllUsers(),
    listInvites(),
  ]);

  const userRows = users
    .slice()
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      const aLabel = (a.displayName ?? a.email).toLowerCase();
      const bLabel = (b.displayName ?? b.email).toLowerCase();
      return aLabel.localeCompare(bLabel);
    })
    .map((u) => ({
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      active: u.active,
      createdAt: formatDate(u.createdAt),
      lastLoginAt: formatDate(u.lastLoginAt),
      isSelf: u.uid === session.uid,
    }));

  const inviteRows = invites.map((i) => ({
    email: i.email,
    role: i.role,
    invitedAt: formatDate(i.invitedAt),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Users</h1>
        <p className="text-sm text-muted-foreground">
          Invite teammates, change their role, or deactivate accounts.
          Sign-in is gated by an allowlist — only users below or holding a
          pending invite can sign in.
        </p>
      </div>

      <UserAdmin users={userRows} invites={inviteRows} />
    </div>
  );
}
