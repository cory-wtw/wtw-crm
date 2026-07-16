import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { logAudit } from "@/lib/audit";
import { getIntake } from "@/lib/db/intakes";
import { getUser } from "@/lib/db/users";
import { getVeteran } from "@/lib/db/veterans";
import { getSession } from "@/lib/firebase/session";
import { canAccessCrm } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { IntakePdf } from "@/lib/intake-pdf";

export const dynamic = "force-dynamic";

function safeFilename(name: string, completedAt: Date | null): string {
  const stamp = (completedAt ?? new Date())
    .toISOString()
    .slice(0, 10);
  const slug = name
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return `wtw-intake-${slug || "veteran"}-${stamp}.pdf`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; intakeId: string }> },
) {
  const { id, intakeId } = await context.params;

  const session = await getSession();
  if (!session) {
    return new NextResponse("Not signed in.", { status: 401 });
  }
  if (!canAccessCrm(session)) {
    return new NextResponse("Not allowed.", { status: 403 });
  }

  const [veteran, intake] = await Promise.all([
    getVeteran(id),
    getIntake(id, intakeId),
  ]);
  if (!veteran || !intake) {
    return new NextResponse("Intake not found.", { status: 404 });
  }

  // Read access mirrors the Firestore rule on the intakes subcollection:
  // anyone signed in can read. The audit log captures who exported what.
  const liaison = intake.liaisonUid ? await getUser(intake.liaisonUid) : null;
  const liaisonName = liaison?.displayName ?? liaison?.email ?? "—";
  const completedAtLabel = intake.completedAt
    ? formatDate(intake.completedAt)
    : "Draft";

  const buffer = await renderToBuffer(
    <IntakePdf
      intake={intake}
      veteranName={veteran.name}
      liaisonName={liaisonName}
      completedAtLabel={completedAtLabel}
    />,
  );

  await logAudit({
    action: "export",
    resourceType: "intake",
    resourceId: `${id}/${intakeId}`,
  });

  const filename = safeFilename(veteran.name, intake.completedAt);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
