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

            buckets: resource.buckets,
            geoScope: resource.geoScope,
            geoStates: resource.geoStates.join(", "),
            geoLocalities: resource.geoLocalities.join(", "),

            minDischarge: resource.minDischarge,
            requiresVaEnrollment: resource.requiresVaEnrollment,
            requiresValidId: resource.requiresValidId,
            eraRestriction: resource.eraRestriction,
            requiresDependents: resource.requiresDependents,
            crisisCapable: resource.crisisCapable,

            accessMethod: resource.accessMethod,
            accessValue: resource.accessValue ?? "",
            whatToBring: resource.whatToBring ?? "",
            typicalWait: resource.typicalWait,

            verificationStatus: resource.verificationStatus,
            fragility: resource.fragility,
            sourceName: resource.sourceName ?? "",
          },
        }}
      />
    </div>
  );
}
