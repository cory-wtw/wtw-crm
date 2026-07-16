import Link from "next/link";
import { listMedia } from "@/lib/db/media";
import { listVeterans } from "@/lib/db/veterans";
import { getSession } from "@/lib/firebase/session";
import { MediaGallery, type MediaRow } from "./media-gallery";

export const dynamic = "force-dynamic";

export default async function SocialPage() {
  const [media, veterans, session] = await Promise.all([
    listMedia(),
    listVeterans(),
    getSession(),
  ]);

  const veteranName = new Map(veterans.map((v) => [v.id, v.name]));

  const rows: MediaRow[] = media.map((m) => ({
    id: m.id,
    kind: m.kind,
    downloadUrl: m.downloadUrl,
    fileName: m.fileName,
    caption: m.caption,
    tags: m.tags,
    status: m.status,
    consentOnFile: m.consentOnFile,
    sizeBytes: m.sizeBytes,
    createdBy: m.createdBy,
    createdAtIso: m.createdAt.toISOString(),
    usedAtIso: m.usedAt ? m.usedAt.toISOString() : null,
    linkedVeteranId: m.linkedVeteranId,
    linkedVeteranName: m.linkedVeteranId
      ? veteranName.get(m.linkedVeteranId) ?? null
      : null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Social</h1>
          <p className="text-sm text-muted-foreground">
            Photos and videos for the social media manager to pull from. Mark
            an item <strong>Used</strong> once it&rsquo;s posted, and delete it
            when it&rsquo;s no longer needed.
          </p>
        </div>
        <Link
          href="/social/new"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
        >
          Add media
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-bold">Nothing here yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload the first photo or video for the team.
          </p>
          <Link
            href="/social/new"
            className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white"
          >
            Add media
          </Link>
        </div>
      ) : (
        <MediaGallery
          rows={rows}
          currentUid={session?.uid ?? ""}
          isAdmin={session?.role === "admin"}
        />
      )}
    </div>
  );
}
