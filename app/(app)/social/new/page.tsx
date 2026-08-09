import Link from "next/link";
import { listVeterans } from "@/lib/db/veterans";
import { formatShortName } from "@/lib/name";
import { getSession } from "@/lib/firebase/session";
import { canViewVeteran } from "@/lib/permissions";
import { UploadForm } from "../upload-form";

export const dynamic = "force-dynamic";

export default async function NewMediaPage() {
  const session = await getSession();
  // Only load the veteran list for users allowed to see veteran data — a
  // social-only user must never see veteran names (PII). An empty list hides
  // the "related veteran" picker entirely.
  const veterans = canViewVeteran(session) ? await listVeterans() : [];
  const options = veterans.map((v) => ({
    id: v.id,
    name: formatShortName(v.firstName, v.lastInitial),
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/social"
          className="text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          ← Back to Social
        </Link>
        <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Add media</h1>
        <p className="text-sm text-muted-foreground">
          Upload a photo or video and describe it so the social media manager
          knows what it is.
        </p>
      </div>
      <UploadForm veterans={options} />
    </div>
  );
}
