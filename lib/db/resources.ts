import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import {
  derivedVerificationStatus,
  type GeoScope,
  type Resource,
} from "@/lib/schemas";

const COLLECTION = "resources";

function tsToDate(value: unknown): Date | null {
  const asTimestamp = value as { toDate?: () => Date } | null | undefined;
  if (asTimestamp?.toDate) return asTimestamp.toDate();
  if (value instanceof Date) return value;
  return null;
}

/**
 * Read a stored scope forward. `metro` and `county` were merged into `local`
 * once it was clear they were one gate under two names; records written before
 * that read as `local`, which is what they always meant.
 */
function readGeoScope(stored: unknown): GeoScope {
  if (stored === "metro" || stored === "county") return "local";
  if (stored === "state" || stored === "local" || stored === "national") {
    return stored;
  }
  return "national";
}

function deserialize(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Resource {
  const lastVerified = tsToDate(data.lastVerified);

  return {
    id,
    organizationName: data.organizationName ?? "",
    parentOrg: data.parentOrg ?? undefined,
    website: data.website ?? undefined,
    contactName: data.contactName ?? undefined,
    contactPhone: data.contactPhone ?? undefined,
    contactEmail: data.contactEmail ?? undefined,
    description: data.description ?? undefined,
    eligibility: data.eligibility ?? undefined,
    services: data.services ?? undefined,

    // Gates. Every default here is the permissive value, so a record written
    // before these fields existed reads as unrestricted rather than silently
    // failing every gate. The one exception is `buckets`: an empty list means
    // the record matches nothing until somebody classifies it, which is the
    // correct behaviour — we don't know what it serves.
    buckets: data.buckets ?? [],
    geoScope: readGeoScope(data.geoScope),
    geoStates: data.geoStates ?? [],
    geoLocalities: data.geoLocalities ?? [],
    minDischarge: data.minDischarge ?? "any",
    requiresVaEnrollment: data.requiresVaEnrollment ?? false,
    requiresValidId: data.requiresValidId ?? false,
    eraRestriction: data.eraRestriction ?? [],
    requiresDependents: data.requiresDependents ?? false,
    crisisCapable: data.crisisCapable ?? false,

    accessMethod: data.accessMethod ?? "phone",
    accessValue: data.accessValue ?? undefined,
    whatToBring: data.whatToBring ?? undefined,
    typicalWait: data.typicalWait ?? "unknown",

    // Age the stored status forward from lastVerified on the way out. There's
    // no scheduler, so live -> aging is derived here rather than written by a
    // job. That is the only transition derived from the clock: aging records
    // stay matchable and are handled by ranking, and `flagged` comes only from
    // a human or a Phase 7 check. See derivedVerificationStatus.
    verificationStatus: derivedVerificationStatus(
      data.verificationStatus ?? "live",
      lastVerified,
    ),
    fragility: data.fragility ?? "stable",
    lastVerified,
    lastVerifiedBy: data.lastVerifiedBy ?? undefined,
    contentHash: data.contentHash ?? undefined,
    flagReason: data.flagReason ?? undefined,
    sourceName: data.sourceName ?? undefined,
    externalId: data.externalId ?? undefined,

    createdBy: data.createdBy ?? "",
    createdAt: tsToDate(data.createdAt) ?? new Date(),
    updatedBy: data.updatedBy ?? "",
    updatedAt: tsToDate(data.updatedAt) ?? new Date(),
  };
}

export async function listResources(): Promise<Resource[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .orderBy("organizationName", "asc")
    .get();
  return snap.docs.map((d) => deserialize(d.id, d.data()));
}

export async function getResource(id: string): Promise<Resource | null> {
  const doc = await adminDb.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return deserialize(doc.id, doc.data()!);
}

/** Several resources by id, skipping any that no longer exist. */
export async function getResourcesByIds(ids: string[]): Promise<Resource[]> {
  if (ids.length === 0) return [];
  const docs = await Promise.all(
    ids.map((id) => adminDb.collection(COLLECTION).doc(id).get()),
  );
  return docs.filter((d) => d.exists).map((d) => deserialize(d.id, d.data()!));
}
