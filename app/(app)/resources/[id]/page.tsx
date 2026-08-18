import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { getResource } from "@/lib/db/resources";
import { getUser } from "@/lib/db/users";
import { getLatestVerification } from "@/lib/db/verifications";
import { formatDate } from "@/lib/format";
import {
  ACCESS_METHOD_LABELS,
  BUCKET_LABELS,
  FRAGILITY_LABELS,
  GEO_SCOPE_LABELS,
  MIN_DISCHARGE_LABELS,
  type Resource,
  SERVICE_ERA_LABELS,
  TYPICAL_WAIT_LABELS,
  VERIFICATION_CHECK_TYPE_LABELS,
  type VerificationResult,
  VERIFICATION_RESULT_LABELS,
  VERIFICATION_STATUS_LABELS,
} from "@/lib/schemas";

export const dynamic = "force-dynamic";

const RESULT_TINT: Record<VerificationResult, string> = {
  pass: "bg-primary/20 text-foreground",
  flag: "bg-[color:var(--wtw-deep-gold)]/15 text-[color:var(--wtw-deep-gold)]",
  fail: "bg-destructive/15 text-destructive",
};

function websiteHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** "County · Hamilton County (TN)" — the scope plus whatever it's scoped to. */
function serviceArea(resource: Resource): string {
  const scope = GEO_SCOPE_LABELS[resource.geoScope];
  if (resource.geoScope === "national") return scope;
  const places =
    resource.geoLocalities.length > 0
      ? resource.geoLocalities.join(", ")
      : resource.geoStates.join(", ");
  const states =
    resource.geoLocalities.length > 0 && resource.geoStates.length > 0
      ? ` (${resource.geoStates.join(", ")})`
      : "";
  return places ? `${scope} · ${places}${states}` : scope;
}

/** The gates a veteran has to clear, or "None" when the door is open. */
function requirements(resource: Resource): string {
  const parts: string[] = [];
  if (resource.requiresVaEnrollment) parts.push("VA enrollment");
  if (resource.requiresValidId) parts.push("Valid ID");
  if (resource.requiresDependents) parts.push("Dependents");
  const listed = parts.length > 0 ? parts.join(", ") : "None";
  return resource.crisisCapable ? `${listed} · Same-day capable` : listed;
}

export default async function ResourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [resource, session, latestCheck] = await Promise.all([
    getResource(id),
    getSession(),
    getLatestVerification(id),
  ]);
  if (!resource) notFound();
  const canEdit = !!session;

  // checkedBy is a uid or the literal "system" for an automated check.
  const checker =
    latestCheck && latestCheck.checkedBy !== "system"
      ? await getUser(latestCheck.checkedBy)
      : null;
  const checkedByName = !latestCheck
    ? null
    : latestCheck.checkedBy === "system"
      ? "System"
      : (checker?.displayName ?? checker?.email ?? "Unknown");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            {resource.organizationName}
          </h1>
          {resource.parentOrg && (
            <p className="text-sm text-muted-foreground">
              Part of {resource.parentOrg}
            </p>
          )}
          {resource.website && (
            <a
              href={websiteHref(resource.website)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[color:var(--wtw-deep-gold)] underline-offset-4 hover:underline"
            >
              {resource.website.replace(/^https?:\/\//i, "")}
            </a>
          )}
        </div>
        {canEdit && (
          <Link
            href={`/resources/${resource.id}/edit`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary"
          >
            Edit
          </Link>
        )}
      </div>

      <Card title="Contact">
        <Row label="Contact name" value={resource.contactName} />
        <Row label="Phone" value={resource.contactPhone} />
        <Row label="Email" value={resource.contactEmail} />
        <Row
          label="Website"
          value={resource.website}
          href={resource.website ? websiteHref(resource.website) : undefined}
        />
      </Card>

      {resource.services && (
        <Card title="Primary service(s) offered">
          <p className="whitespace-pre-wrap text-sm md:col-span-2">
            {resource.services}
          </p>
        </Card>
      )}

      {resource.description && (
        <Card title="Description">
          <p className="whitespace-pre-wrap text-sm md:col-span-2">
            {resource.description}
          </p>
        </Card>
      )}

      {resource.eligibility && (
        <Card title="Eligibility requirements">
          <p className="whitespace-pre-wrap text-sm md:col-span-2">
            {resource.eligibility}
          </p>
        </Card>
      )}

      <Card title="Needs served">
        <div className="md:col-span-2">
          {resource.buckets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No buckets set. This resource won&rsquo;t be suggested for anyone
              until somebody classifies it.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {resource.buckets.map((bucket) => (
                <li
                  key={bucket}
                  className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em]"
                >
                  {BUCKET_LABELS[bucket]}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card title="Who they'll take">
        <Row label="Service area" value={serviceArea(resource)} />
        <Row
          label="Minimum discharge"
          value={MIN_DISCHARGE_LABELS[resource.minDischarge]}
        />
        <Row
          label="Era restriction"
          value={
            resource.eraRestriction.length === 0
              ? "None"
              : resource.eraRestriction
                  .map((era) => SERVICE_ERA_LABELS[era])
                  .join(", ")
          }
        />
        <Row label="Requirements" value={requirements(resource)} />
      </Card>

      <Card title="How to start">
        <Row
          label={ACCESS_METHOD_LABELS[resource.accessMethod]}
          value={resource.accessValue}
        />
        <Row
          label="Typical wait"
          value={TYPICAL_WAIT_LABELS[resource.typicalWait]}
        />
        <Row label="What to bring" value={resource.whatToBring} />
      </Card>

      <Card title="Verification">
        <Row
          label="Status"
          value={VERIFICATION_STATUS_LABELS[resource.verificationStatus]}
        />
        <Row label="Fragility" value={FRAGILITY_LABELS[resource.fragility]} />
        <Row label="Last verified" value={formatDate(resource.lastVerified)} />
        <Row label="Source" value={resource.sourceName} />
        {resource.flagReason && (
          <Row label="Flag reason" value={resource.flagReason} />
        )}

        <div className="border-t border-border pt-4 md:col-span-2">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            Latest check
          </p>
          {!latestCheck ? (
            <p className="text-sm text-muted-foreground">
              No checks recorded against this resource yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${RESULT_TINT[latestCheck.result]}`}
                >
                  {VERIFICATION_RESULT_LABELS[latestCheck.result]}
                </span>
                <span className="text-sm font-bold">
                  {VERIFICATION_CHECK_TYPE_LABELS[latestCheck.checkType]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(latestCheck.checkedAt)} · {checkedByName}
                </span>
              </div>
              {latestCheck.detail && (
                <p className="whitespace-pre-wrap text-sm">
                  {latestCheck.detail}
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Last updated {formatDate(resource.updatedAt)}
      </p>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
        {title}
      </h2>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null | undefined;
  href?: string;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      {value && href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[color:var(--wtw-deep-gold)] underline-offset-4 hover:underline"
        >
          {value.replace(/^https?:\/\//i, "")}
        </a>
      ) : (
        <p className="text-sm">{value || "—"}</p>
      )}
    </div>
  );
}
