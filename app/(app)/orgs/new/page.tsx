import { listUsers } from "@/lib/db/users";
import { OrgForm } from "../org-form";

export const dynamic = "force-dynamic";

export default async function NewOrgPage() {
  const users = await listUsers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Add organization</h1>
        <p className="text-sm text-muted-foreground">
          Only Name is required. Fill in what you know.
        </p>
      </div>
      <OrgForm
        assignees={users.map((u) => ({
          uid: u.uid,
          label: u.displayName ?? u.email,
        }))}
      />
    </div>
  );
}
