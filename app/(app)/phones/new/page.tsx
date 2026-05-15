import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { PhoneForm } from "../phone-form";

export const dynamic = "force-dynamic";

export default async function NewPhonePage() {
  const session = await getSession();
  if (!session) notFound();
  if (session.role !== "admin") redirect("/phones");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Add phone</h1>
        <p className="text-sm text-muted-foreground">
          Track a new Straight Talk loaner. Assign it to a veteran from the
          veteran&rsquo;s edit page.
        </p>
      </div>
      <PhoneForm />
    </div>
  );
}
