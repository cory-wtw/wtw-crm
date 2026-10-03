import { notFound } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { VsoForm } from "../vso-form";
import { requireCrm } from "@/lib/auth-guards";

export const dynamic = "force-dynamic";

export default async function NewVsoPage() {
  await requireCrm();
  const session = await getSession();
  if (!session) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Add VSO</h1>
        <p className="text-sm text-muted-foreground">
          The only required field is Full name. Fill in what you know now.
        </p>
      </div>
      <VsoForm />
    </div>
  );
}
