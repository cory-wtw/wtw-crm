import { redirect } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { canApproveImportedResource } from "@/lib/permissions";
import { EnrichQueue } from "./enrich-queue";

export const dynamic = "force-dynamic";

export default async function EnrichPage() {
  const session = await getSession();
  if (!canApproveImportedResource(session)) redirect("/resources");

  // The key is read server-side only, and only ever as a boolean out here —
  // its value never crosses to the client.
  const configured = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Draft resources from a page
        </h1>
        <p className="text-sm text-muted-foreground">
          Paste an organization&rsquo;s URL, one per line. Each page is read and
          turned into a draft record for you to check and edit. Nothing is
          published — drafts land flagged, like every other import.
        </p>
      </div>

      {!configured ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-bold">Enrichment isn&rsquo;t configured.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Set <code>ANTHROPIC_API_KEY</code> in the server environment. It is
            read server-side only and never reaches the browser.
          </p>
        </div>
      ) : (
        <EnrichQueue />
      )}
    </div>
  );
}
