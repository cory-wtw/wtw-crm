import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { getPhone } from "@/lib/db/phones";
import { PhoneForm } from "../../phone-form";

export const dynamic = "force-dynamic";

export default async function EditPhonePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();
  if (session.role !== "admin") redirect(`/phones/${id}`);

  const phone = await getPhone(id);
  if (!phone) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black tracking-tight">
        Edit {phone.name}
      </h1>
      <PhoneForm
        initial={{
          id: phone.id,
          values: {
            name: phone.name,
            imeiSerial: phone.imeiSerial ?? "",
            status: phone.status,
            notes: phone.notes ?? "",
          },
        }}
      />
    </div>
  );
}
