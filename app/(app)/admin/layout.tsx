import { redirect } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { AdminSubnav } from "./admin-subnav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  return (
    <div className="space-y-6">
      <AdminSubnav />
      <div>{children}</div>
    </div>
  );
}
