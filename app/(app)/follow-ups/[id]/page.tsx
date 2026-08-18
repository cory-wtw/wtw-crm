import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLatestReferral } from "@/lib/db/encounters";
import { getVeteran } from "@/lib/db/veterans";
import { getSession } from "@/lib/firebase/session";
import { formatDate } from "@/lib/format";
import { formatShortName } from "@/lib/name";
import { canRecordFollowUp } from "@/lib/permissions";
import { FollowUpForm } from "./follow-up-form";

export const dynamic = "force-dynamic";

export default async function FollowUpPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const veteran = await getVeteran(id);
  if (!veteran) notFound();

  const session = await getSession();
  if (!canRecordFollowUp(session, veteran)) redirect("/follow-ups");

  const referral = await getLatestReferral(id);
  const shortName = formatShortName(veteran.firstName, veteran.lastInitial);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            Follow-up · {shortName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {referral
              ? `Packet sent ${formatDate(referral.occurredAt)}. Ask about each one.`
              : "No referral packet on this record."}
          </p>
        </div>
        <Link
          href="/follow-ups"
          className="text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          Back to the queue
        </Link>
      </div>

      {!referral || referral.referrals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-bold">
            There&rsquo;s no referral packet to follow up on.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The concierge status says a packet went out, but the timeline
            doesn&rsquo;t have one. Check{" "}
            <Link
              href={`/veterans/${veteran.id}`}
              className="font-bold underline-offset-4 hover:underline"
            >
              the record
            </Link>
            .
          </p>
        </div>
      ) : (
        <FollowUpForm
          veteranId={veteran.id}
          veteranName={shortName}
          referralEncounterId={referral.id}
          resources={referral.referrals.map((r) => ({
            resourceId: r.resourceId,
            resourceName: r.resourceName,
          }))}
        />
      )}
    </div>
  );
}
