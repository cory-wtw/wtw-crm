import { redirect } from "next/navigation";
import { after } from "next/server";
import { maybeAutoSync } from "@/lib/finance/bank-sync";
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

  // Opening any finance page catches the books up with the bank when the
  // last sync is more than a few hours old. Runs after the page is sent.
  after(maybeAutoSync);

  return (
    <div className="space-y-6">
      <FinanceSubnav />
      <div>{children}</div>
    </div>
  );
}
