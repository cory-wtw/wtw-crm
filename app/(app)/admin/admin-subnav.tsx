"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/resources/enrich", label: "Draft resources" },
  { href: "/admin/resources/import", label: "Load JSON" },
  { href: "/admin/audit", label: "Audit log" },
];

export function AdminSubnav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 border-b border-border pb-2">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-md px-3 py-1.5 text-sm font-bold transition-colors ${
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
