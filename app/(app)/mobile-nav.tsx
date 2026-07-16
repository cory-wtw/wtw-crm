"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { signOutAction } from "@/app/login/actions";

export type NavItem = { href: string; label: string };

/**
 * The small-screen navigation. The desktop nav lives inline in the layout and
 * is hidden below `md`; this hamburger takes over there. It collapses to a
 * single button in the header and expands to a full-width panel of links plus
 * the account row.
 */
export function MobileNav({
  items,
  email,
}: {
  items: NavItem[];
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  // Lock body scroll while the overlay menu is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card transition-colors hover:bg-secondary"
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>

      {open && (
        <>
          {/* Dim the page behind the panel; tapping it closes the menu. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-14 z-30 bg-black/40"
          />
          <div
            id={panelId}
            className="fixed inset-x-0 top-14 z-40 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-border bg-card shadow-lg"
          >
            <nav className="flex flex-col gap-1 p-3">
              {items.map((item) => (
                <MobileNavLink
                  key={item.href}
                  href={item.href}
                  onNavigate={() => setOpen(false)}
                >
                  {item.label}
                </MobileNavLink>
              ))}
            </nav>
            <div className="border-t border-border p-3">
              <p className="mb-2 truncate px-2 text-xs text-muted-foreground">
                {email}
              </p>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="inline-flex h-10 w-full items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MobileNavLink({
  href,
  children,
  onNavigate,
}: {
  href: string;
  children: React.ReactNode;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const active =
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`rounded-md px-3 py-3 text-base font-bold transition-colors ${
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}
