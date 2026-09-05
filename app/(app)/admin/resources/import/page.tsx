import { redirect } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { canApproveImportedResource } from "@/lib/permissions";
import { ImportPanel } from "./import-panel";

export const dynamic = "force-dynamic";

export default async function ImportResourcesPage() {
  const session = await getSession();
  if (!canApproveImportedResource(session)) redirect("/resources");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Load resources from JSON
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Paste researched records and check them before they land. Written in
          the form&rsquo;s own words &mdash; &ldquo;Mental Health &amp;
          Recovery&rdquo;, &ldquo;Call&rdquo;, &ldquo;Any discharge, including
          other-than-honorable&rdquo; &mdash; not internal codes. Loading twice
          updates the same records rather than duplicating them, so a corrected
          batch can just be pasted again.
        </p>
      </div>

      <ImportPanel />
    </div>
  );
}
