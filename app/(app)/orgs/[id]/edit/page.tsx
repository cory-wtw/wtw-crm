import { notFound } from "next/navigation";
import { listUsers } from "@/lib/db/users";
import { getOrg } from "@/lib/db/orgs";
import { OrgForm } from "../../org-form";

export const dynamic = "force-dynamic";

export default async function EditOrgPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await getOrg(id);
  if (!org) notFound();
  const users = await listUsers();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Edit {org.name}</h1>
      <OrgForm
        initial={{
          id: org.id,
          values: {
            name: org.name,
            category: org.category,
            website: org.website ?? "",
            primaryContactName: org.primaryContactName ?? "",
            primaryContactRole: org.primaryContactRole ?? "",
            primaryContactEmail: org.primaryContactEmail ?? "",
            primaryContactPhone: org.primaryContactPhone ?? "",
            city: org.city ?? "",
            state: org.state ?? "",
            relationshipStatus: org.relationshipStatus,
            assigneeUid: org.assigneeUid ?? "",
            notes: org.notes ?? "",
          },
        }}
        assignees={users.map((u) => ({
          uid: u.uid,
          label: u.displayName ?? u.email,
        }))}
      />
    </div>
  );
}
