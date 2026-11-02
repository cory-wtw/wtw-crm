import { notFound } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { DraftReview } from "./draft-review";

export const dynamic = "force-dynamic";

export default async function NewResourcePage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const session = await getSession();
  if (!session) notFound();
  const { draft } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] leading-tight font-black tracking-tight text-balance sm:text-4xl">
          Add Community Resource
        </h1>
        <p className="text-sm text-muted-foreground">
          The only required field is Organization name. Fill in what you know
          now.
        </p>
      </div>
      <DraftReview fromDraft={draft === "1"} />
    </div>
  );
}
