import { notFound } from "next/navigation";
import { getVeteran } from "@/lib/db/veterans";
import { IntakeForm } from "../intake-form";

export const dynamic = "force-dynamic";

export default async function NewIntakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const veteran = await getVeteran(id);
  if (!veteran) notFound();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
          Life & Service Intake
        </p>
        <h1 className="text-3xl font-black tracking-tight">
          Tell us your story
        </h1>
        <p className="text-sm text-muted-foreground">
          A conversation. Not a form. For {veteran.name}. One sitting, 30–45
          minutes. Skip anything that doesn&rsquo;t fit. Save draft anytime;
          mark complete when ready to send to a VSO.
        </p>
      </div>

      <IntakeForm veteranId={veteran.id} />
    </div>
  );
}
