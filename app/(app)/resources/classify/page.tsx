import Link from "next/link";
import { redirect } from "next/navigation";
import { listResources } from "@/lib/db/resources";
import { getSession } from "@/lib/firebase/session";
import { canAccessCrm } from "@/lib/permissions";
import { needsClassification } from "@/lib/schemas";
import { ClassifyQueue, type ClassifyItem } from "./classify-queue";

export const dynamic = "force-dynamic";

export default async function ClassifyResourcesPage() {
  const session = await getSession();
  if (!canAccessCrm(session)) redirect("/resources");

  const resources = await listResources();

  // The whole record travels to the client, not just the fields being edited:
  // saving reuses editResourceAction, which validates and writes the complete
  // input, so anything left behind here would be wiped on save.
  const queue: ClassifyItem[] = resources
    .filter(needsClassification)
    .map((r) => ({
      id: r.id,
      organizationName: r.organizationName,
      description: r.description ?? null,
      services: r.services ?? null,
      eligibility: r.eligibility ?? null,
      website: r.website ?? null,
      input: {
        organizationName: r.organizationName,
        parentOrg: r.parentOrg,
        website: r.website,
        contactName: r.contactName,
        contactPhone: r.contactPhone,
        contactEmail: r.contactEmail,
        description: r.description,
        eligibility: r.eligibility,
        services: r.services,
        buckets: r.buckets,
        geoScope: r.geoScope,
        geoStates: r.geoStates,
        geoLocalities: r.geoLocalities,
        minDischarge: r.minDischarge,
        requiresVaEnrollment: r.requiresVaEnrollment,
        requiresValidId: r.requiresValidId,
        eraRestriction: r.eraRestriction,
        requiresDependents: r.requiresDependents,
        crisisCapable: r.crisisCapable,
        accessMethod: r.accessMethod,
        accessValue: r.accessValue,
        whatToBring: r.whatToBring,
        typicalWait: r.typicalWait,
        verificationStatus: r.verificationStatus,
        fragility: r.fragility,
        sourceName: r.sourceName,
      },
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            Classify resources
          </h1>
          <p className="text-sm text-muted-foreground">
            One record at a time: what needs it serves, and where. Everything
            else stays as it is — the full record is on its own page.
          </p>
        </div>
        <Link
          href="/resources"
          className="text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          Back to the directory
        </Link>
      </div>

      {queue.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-bold">Every record is classified.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Each one has at least one need set and a service area the matcher
            can read.
          </p>
        </div>
      ) : (
        <ClassifyQueue queue={queue} />
      )}
    </div>
  );
}
