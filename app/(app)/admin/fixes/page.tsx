import Link from "next/link";
import { adminDb } from "@/lib/firebase/admin";
import { listAllAttachments } from "@/lib/db/attachments";
import { deserialize as deserializeUser } from "@/lib/db/users";
import { deserialize as deserializeVeteran } from "@/lib/db/veterans";
import { findMedicalTerms } from "@/lib/medical-terms";
import { formatShortName } from "@/lib/name";
import { planFixes } from "@/lib/record-fixes-apply";
import { ApplyButton } from "./apply-button";
import {
  MedicalAttachments,
  type MedicalAttachmentRow,
} from "./medical-attachments";

export const dynamic = "force-dynamic";

function show(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  return Array.isArray(value) ? value.join(", ") || "—" : String(value);
}

/**
 * Attachments whose file name, original file name, or display name matches
 * the medical term list, with the veteran's short name and, when someone
 * confirmed the file isn't medical, who that was.
 */
async function listPossibleMedicalAttachments(): Promise<
  MedicalAttachmentRow[]
> {
  const flagged = (await listAllAttachments())
    .filter((a) => a.veteranId)
    .map((a) => ({
      attachment: a,
      matchedTerms: findMedicalTerms(
        [a.originalFileName, a.fileName, a.name].filter(Boolean).join(" "),
        a.category,
      ),
    }))
    .filter((f) => f.matchedTerms.length > 0);
  if (flagged.length === 0) return [];

  // One batched read per collection; a missing or broken doc leaves that
  // row's name blank instead of taking down the page.
  const veteranIds = [...new Set(flagged.map((f) => f.attachment.veteranId))];
  const confirmerUids = [
    ...new Set(
      flagged
        .map((f) => f.attachment.nonMedicalConfirmedBy)
        .filter((uid): uid is string => !!uid),
    ),
  ];
  const [veteranDocs, userDocs] = await Promise.allSettled([
    adminDb.getAll(...veteranIds.map((id) => adminDb.doc(`veterans/${id}`))),
    confirmerUids.length
      ? adminDb.getAll(...confirmerUids.map((uid) => adminDb.doc(`users/${uid}`)))
      : Promise.resolve([]),
  ]);

  const veteranNames = new Map<string, string>();
  if (veteranDocs.status === "fulfilled") {
    for (const doc of veteranDocs.value) {
      if (!doc.exists) continue;
      try {
        const v = deserializeVeteran(doc.id, doc.data()!);
        veteranNames.set(doc.id, formatShortName(v.firstName, v.lastInitial));
      } catch (err) {
        console.error("medical scan: bad veteran doc", doc.id, err);
      }
    }
  } else {
    console.error("medical scan: veteran lookup failed", veteranDocs.reason);
  }

  const confirmerNames = new Map<string, string>();
  if (userDocs.status === "fulfilled") {
    for (const doc of userDocs.value) {
      if (!doc.exists) continue;
      try {
        const u = deserializeUser(doc.id, doc.data()!);
        confirmerNames.set(doc.id, u.displayName || u.email);
      } catch (err) {
        console.error("medical scan: bad user doc", doc.id, err);
      }
    }
  } else {
    console.error("medical scan: user lookup failed", userDocs.reason);
  }

  return flagged.map(({ attachment, matchedTerms }) => ({
    id: attachment.id,
    veteranId: attachment.veteranId,
    veteranName: veteranNames.get(attachment.veteranId) || "Unknown veteran",
    name: attachment.name,
    fileName: attachment.originalFileName || attachment.fileName,
    matchedTerms,
    createdAtIso: attachment.createdAt.toISOString(),
    confirmedBy: attachment.nonMedicalConfirmedBy
      ? (confirmerNames.get(attachment.nonMedicalConfirmedBy) ??
        attachment.nonMedicalConfirmedBy)
      : null,
  }));
}

// The admin layout already turns away anyone who isn't an admin.
export default async function RecordFixesPage() {
  const [fixes, medicalAttachments] = await Promise.all([
    planFixes(),
    listPossibleMedicalAttachments(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] leading-tight font-black tracking-tight text-balance sm:text-4xl">
          Record fixes
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Changes that would otherwise be done one record at a time: who a
          program only serves (MST, SSVF, HUD-VASH), retiring lender and
          realtor listings and duplicate records, corrections from research
          (who Bridge Health and Vet Centers serve, Chattanooga places open to
          anyone nearby), and rewriting he/him in record text. Each
          record&rsquo;s change is listed below with why. Nothing is written
          until you tap the button.
        </p>
      </div>

      {fixes.length === 0 ? (
        <p className="text-sm">Nothing to fix.</p>
      ) : (
        <>
          <ApplyButton count={fixes.length} />
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {fixes.map((f) => (
              <li key={f.id} className="space-y-1 p-3 text-sm">
                <Link
                  href={`/resources/${f.id}`}
                  className="font-bold underline-offset-4 hover:underline"
                >
                  {f.name}
                </Link>
                {f.reasons.map((reason) => (
                  <p key={reason} className="text-xs text-[color:var(--wtw-deep-gold)]">
                    {reason}
                  </p>
                ))}
                {Object.entries(f.changes).map(([field, change]) => (
                  <p key={field} className="text-xs">
                    <span className="text-muted-foreground">{field}: </span>
                    <span className="line-through opacity-60">{show(change.before)}</span>
                    {" → "}
                    <span className="font-bold">{show(change.after)}</span>
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}

      <MedicalAttachments rows={medicalAttachments} />
    </div>
  );
}
