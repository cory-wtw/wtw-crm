"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/finances", label: "Overview", exact: true },
  { href: "/finances/impact", label: "Impact" },
  { href: "/finances/spending", label: "Spending" },
  { href: "/finances/transactions", label: "Transactions" },
  { href: "/finances/import", label: "Import CSV" },
  { href: "/finances/categories", label: "Categories" },
  { href: "/finances/records", label: "Records" },
];

export function FinanceSubnav() {
  const pathname = usePathname();
  return (
    <nav className="mobile-touch-scroll print:hidden -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-bold transition-colors ${
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-foreground hover:bg-secondary"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
