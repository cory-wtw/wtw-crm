"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

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
  const scroller = useRef<HTMLElement>(null);
  // Fade the right edge while more chips are hidden past it, so a phone user
  // can tell the row scrolls. Cleared once they reach the end. Measured in a
  // layout effect so the fade is there on first paint rather than popping in.
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () =>
      setOverflowing(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    el.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
    });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);
  return (
    <div className="relative -mx-4 print:hidden sm:mx-0">
      <nav
        ref={scroller}
        className="mobile-touch-scroll flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:px-0"
      >
        {TABS.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
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
      {overflowing && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-r from-transparent to-background"
        />
      )}
    </div>
  );
}
