import { notFound } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { VsoForm } from "../vso-form";

export const dynamic = "force-dynamic";

export default async function NewVsoPage() {
  const session = await getSession();
  if (!session) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Add VSO</h1>
        <p className="text-sm text-muted-foreground">
          The only required field is Full name. Fill in what you know now.
        </p>
      </div>
      <VsoForm />
    </div>
  );
}
