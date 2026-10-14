"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/finances", label: "Overview", exact: true },
  { href: "/finances/spending", label: "Spending" },
  { href: "/finances/transactions", label: "Transactions" },
  { href: "/finances/import", label: "Import CSV" },
  { href: "/finances/categories", label: "Categories" },
  { href: "/finances/records", label: "Records" },
];

export function FinanceSubnav() {
  const pathname = usePathname();
  return (
    <nav className="mobile-touch-scroll flex items-center gap-1 overflow-x-auto border-b border-border pb-2">
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-bold transition-colors ${
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
