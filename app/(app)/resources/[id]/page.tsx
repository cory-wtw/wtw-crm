import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { getResource } from "@/lib/db/resources";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function websiteHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export default async function ResourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [resource, session] = await Promise.all([
    getResource(id),
    getSession(),
  ]);
  if (!resource) notFound();
  const canEdit = !!session;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            {resource.organizationName}
          </h1>
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
