"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const TABS = [
  { href: "/admin/changes", label: "Approvals" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/resources/enrich", label: "Draft resources" },
  { href: "/admin/resources/import", label: "Load JSON" },
  { href: "/admin/zips", label: "Fill in ZIPs" },
  { href: "/admin/tidy", label: "Tidy data" },
  { href: "/admin/fixes", label: "Record fixes" },
  { href: "/admin/deleted", label: "Recently deleted" },
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
    <nav className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            ref={active ? activeRef : undefined}
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
