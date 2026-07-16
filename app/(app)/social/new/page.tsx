import Link from "next/link";
import { listVeterans } from "@/lib/db/veterans";
import { UploadForm } from "../upload-form";

export const dynamic = "force-dynamic";

export default async function NewMediaPage() {
  const veterans = await listVeterans();
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
        <h1 className="mt-2 text-3xl font-black tracking-tight">Add media</h1>
        <p className="text-sm text-muted-foreground">
          Upload a photo or video and describe it so the social media manager
          knows what it is.
        </p>
      </div>
      <UploadForm veterans={options} />
    </div>
  );
}
