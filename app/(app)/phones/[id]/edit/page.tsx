import { notFound } from "next/navigation";
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

  const phone = await getPhone(id);
  if (!phone) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
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
