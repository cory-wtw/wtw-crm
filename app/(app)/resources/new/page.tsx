import { notFound } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { ResourceForm } from "../resource-form";

export const dynamic = "force-dynamic";

export default async function NewResourcePage() {
  const session = await getSession();
  if (!session) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Add Community Resource
        </h1>
        <p className="text-sm text-muted-foreground">
          The only required field is Organization name. Fill in what you know
          now.
        </p>
      </div>
      <ResourceForm />
    </div>
  );
}
