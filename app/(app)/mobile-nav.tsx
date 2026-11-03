"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import {
  BookOpen,
  CalendarCheck,
  Ellipsis,
  Landmark,
  LogOut,
  Megaphone,
  Share2,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { signOutAction } from "@/app/login/actions";

export type NavItem = { href: string; label: string };

const ICONS: Record<string, LucideIcon> = {
  "/veterans": Users,
  "/follow-ups": CalendarCheck,
  "/outreach": Megaphone,
  "/vsos": Landmark,
  "/resources": BookOpen,
  "/social": Share2,
  "/finances": Wallet,
  "/admin/users": ShieldCheck,
};

function useActive(href: string) {
  const pathname = usePathname();
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Phone and tablet navigation: an avatar in the top bar and a tab bar pinned
 * to the bottom of the screen, both opening the same "More" sheet with every
 * page and sign out. The desktop nav lives inline in the layout and only shows
 * on a wide screen WITH a fine pointer (`lg:pointer-fine`): touch stays
 * "coarse" even on a landscape iPad, so tablets get this instead.
 *
 * The tab bar, backdrop and sheet are `position: fixed`, so no ancestor of
 * this component may carry `transform`, `filter`, `backdrop-filter`,
 * `will-change` or `contain` — any of those would re-anchor them to that
 * ancestor instead of the viewport.
 */
export function MobileNav({
  items,
  tabs,
  email,
  initials,
}: {
  items: NavItem[];
  /** Up to four pages that get a spot on the tab bar. */
  tabs: NavItem[];
  email: string;
  initials: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const pathname = usePathname();

  // Close the sheet whenever the page changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  // Lock body scroll while the sheet is open, and let Escape close it.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Move focus into the sheet on open and back to whichever button opened it
  // on close (the avatar or the More tab), so keyboard and screen-reader
  // users don't lose their place behind the modal.
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => {
      const el = returnFocus.current;
      if (el && document.contains(el)) el.focus();
    };
  }, [open]);

  const tabHrefs = new Set(tabs.map((t) => t.href));
  const moreActive = items.some(
    (i) => !tabHrefs.has(i.href) && (pathname === i.href || pathname.startsWith(`${i.href}/`)),
  );

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-sm font-black text-background lg:pointer-fine:hidden"
      >
        {initials}
      </button>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur print:hidden lg:pointer-fine:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2">
          {tabs.map((t) => (
            <li key={t.href} className="flex-1">
              <TabLink item={t} />
            </li>
          ))}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={panelId}
              className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-bold ${
                open || moreActive ? "text-[color:var(--wtw-deep-gold)]" : "text-muted-foreground"
              }`}
            >
              <Ellipsis className="h-6 w-6" strokeWidth={2.25} aria-hidden />
              More
            </button>
          </li>
        </ul>
      </nav>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 lg:pointer-fine:hidden"
          />
          <div
            id={panelId}
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-card pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] shadow-2xl lg:pointer-fine:hidden"
          >
            <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-border" aria-hidden />
            <div className="flex items-center gap-3 px-5 pt-4 pb-2">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-black text-background">
                {initials}
              </span>
              <p className="min-w-0 truncate text-sm text-muted-foreground">{email}</p>
            </div>
            <nav className="grid grid-cols-2 gap-2 p-4">
              {items.map((item) => (
                <SheetLink key={item.href} item={item} />
              ))}
            </nav>
            <form action={signOutAction} className="px-4">
              <button
                type="submit"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background text-sm font-bold"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </>
  );
}

function TabLink({ item }: { item: NavItem }) {
  const active = useActive(item.href);
  const Icon = ICONS[item.href] ?? Users;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold ${
        active ? "text-[color:var(--wtw-deep-gold)]" : "text-muted-foreground"
      }`}
    >
      <Icon className="h-6 w-6" strokeWidth={active ? 2.5 : 2} aria-hidden />
      {item.label}
    </Link>
  );
}

function SheetLink({ item }: { item: NavItem }) {
  const active = useActive(item.href);
  const Icon = ICONS[item.href] ?? Users;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-20 flex-col justify-between gap-2 rounded-2xl border p-3 text-sm font-bold ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground"
      }`}
    >
      <Icon
        className={`h-5 w-5 ${active ? "text-[color:var(--wtw-gold-light)]" : "text-[color:var(--wtw-deep-gold)]"}`}
        aria-hidden
      />
      {item.label}
    </Link>
  );
}
