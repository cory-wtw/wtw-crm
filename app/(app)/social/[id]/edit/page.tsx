import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMedia } from "@/lib/db/media";
import { listVeterans } from "@/lib/db/veterans";
import { getSession } from "@/lib/firebase/session";
import { canEditMedia, canViewVeteran } from "@/lib/permissions";
import { EditMediaForm } from "./edit-form";

export const dynamic = "force-dynamic";

export default async function EditMediaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const media = await getMedia(id);
  if (!media) notFound();
  if (!canEditMedia(session, media)) redirect("/social");

  // Only surface the veteran picker to users allowed to see veteran data.
  const showVeteranPicker = canViewVeteran(session);
  const veterans = showVeteranPicker ? await listVeterans() : [];
  const options = veterans.map((v) => ({ id: v.id, name: v.name }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/social"
          className="text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          ← Back to Social
        </Link>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Edit media</h1>
        <p className="text-sm text-muted-foreground">
          Update the description and details. To change the photo or video
          itself, delete this item and upload a new one.
        </p>
      </div>
      <EditMediaForm
        id={media.id}
        fileName={media.fileName}
        kind={media.kind}
        downloadUrl={media.downloadUrl}
        initialCaption={media.caption}
        initialTags={media.tags}
        initialConsent={media.consentOnFile}
        initialVeteranId={media.linkedVeteranId}
        veterans={options}
        showVeteranPicker={showVeteranPicker}
      />
    </div>
  );
}
