import { notFound } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { getResource } from "@/lib/db/resources";
import { ResourceForm } from "../../resource-form";

export const dynamic = "force-dynamic";

export default async function EditResourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  const resource = await getResource(id);
  if (!resource) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Edit {resource.organizationName}
        </h1>
      </div>
      <ResourceForm
        initial={{
          id: resource.id,
          values: {
            organizationName: resource.organizationName,
            website: resource.website ?? "",
            contactName: resource.contactName ?? "",
            contactPhone: resource.contactPhone ?? "",
            contactEmail: resource.contactEmail ?? "",
            description: resource.description ?? "",
            eligibility: resource.eligibility ?? "",
            services: resource.services ?? "",
          },
        }}
      />
    </div>
  );
}
