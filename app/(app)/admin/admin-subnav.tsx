"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const TABS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/resources/enrich", label: "Draft resources" },
  { href: "/admin/resources/import", label: "Load JSON" },
  { href: "/admin/zips", label: "Fill in ZIPs" },
  { href: "/admin/tidy", label: "Tidy data" },
  { href: "/admin/fixes", label: "Record fixes" },
  { href: "/admin/audit", label: "Audit log" },
];

export function AdminSubnav() {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  // On a phone the row scrolls sideways; keep the current tab in view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    // One row that scrolls sideways on a phone instead of wrapping each label
    // onto three lines. The negative margin lets it run to the screen edge.
    <nav className="-mx-4 flex items-center gap-1 overflow-x-auto border-b border-border px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            ref={active ? activeRef : undefined}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-bold transition-colors ${
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
