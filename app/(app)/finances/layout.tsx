import { redirect } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { canManageFinances } from "@/lib/permissions";
import { FinanceSubnav } from "./finance-subnav";

export default async function FinancesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageFinances(session)) redirect("/");

  return (
    <div className="space-y-6">
      <FinanceSubnav />
      <div>{children}</div>
    </div>
  );
}
