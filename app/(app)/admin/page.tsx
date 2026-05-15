import { redirect } from "next/navigation";
import { getSession } from "@/lib/firebase/session";

export default async function AdminIndex() {
  const session = await getSession();
  if (session?.role !== "admin") redirect("/");
  redirect("/admin/users");
}
