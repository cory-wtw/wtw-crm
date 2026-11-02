import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/login/actions";
import { getSession } from "@/lib/firebase/session";
import { getUser } from "@/lib/db/users";
import { isSocialOnly, isSocialPath } from "@/lib/permissions";
import { NavLink } from "./nav-link";
import { MobileNav, type NavItem } from "./mobile-nav";
import { version } from "@/package.json";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  // Not /login directly: a stale-but-present cookie would make proxy.ts
  // bounce that request straight back here. /logout clears the cookie
  // first, then sends the browser on to /login for real.
  if (!session) redirect("/logout");

  // Social-only users are penned into /social. This is the authoritative
  // check — it runs on every authenticated page render and reads the real
  // role from the session (not a client-tamperable cookie). The middleware
  // supplies the current path via a header.
  const socialOnly = isSocialOnly(session);
  if (socialOnly) {
    const pathname = (await headers()).get("x-pathname") ?? "/social";
    if (!isSocialPath(pathname)) redirect("/social");
  }

  const navItems: NavItem[] = socialOnly
    ? [{ href: "/social", label: "Social" }]
    : [
        { href: "/veterans", label: "Veterans" },
        { href: "/outreach", label: "Outreach" },
        { href: "/vsos", label: "VSOs" },
        { href: "/resources", label: "Resources" },
        { href: "/social", label: "Social" },
        ...(session.role === "admin"
          ? [
              { href: "/finances", label: "Finances" },
              { href: "/admin/users", label: "Admin" },
            ]
          : []),
      ];

  // Four pages on the phone tab bar; everything else sits under "More".
  const tabs: NavItem[] = socialOnly
    ? navItems
    : ["/veterans", "/outreach", "/resources", session.role === "admin" ? "/finances" : "/vsos"]
        .map((href) => navItems.find((i) => i.href === href))
        .filter((i): i is NavItem => Boolean(i));

  const user = await getUser(session.uid).catch(() => null);
  const initials = toInitials(user?.displayName ?? null, session.email);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl print:hidden">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:gap-6 sm:px-6">
          <Link href="/veterans" className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground">
              <Image src="/wtw-logo.png" alt="" width={22} height={22} priority />
            </span>
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate text-lg font-black tracking-tight">Roster</span>
              <span className="text-[10px] font-semibold text-muted-foreground">
                v{version}
              </span>
            </span>
          </Link>
          <nav className="hidden flex-1 items-center gap-1 lg:pointer-fine:flex">
            {navItems.map((item) => (
              <NavLink key={item.href} href={item.href}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-xs">
            <form action={signOutAction} className="hidden lg:pointer-fine:block">
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-full border border-border bg-card px-4 font-bold transition-colors hover:bg-secondary"
              >
                Sign out
              </button>
            </form>
            <span
              title={session.email}
              className="hidden h-10 w-10 items-center justify-center rounded-full bg-foreground text-sm font-black text-background lg:pointer-fine:inline-flex"
            >
              {initials}
            </span>
            <MobileNav items={navItems} tabs={tabs} email={session.email} initials={initials} />
          </div>
        </div>
      </header>
      <div className="flex-1 px-4 py-5 sm:px-6 sm:py-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </div>
      <footer className="border-t border-border pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] print:hidden lg:pointer-fine:pb-4">
        <div className="mx-auto w-full max-w-6xl px-4 text-center text-[11px] leading-relaxed text-muted-foreground sm:px-6">
          <p>
            Worth Their Weight is not a law firm and does not provide legal
            representation before the U.S. Department of Veterans Affairs. All
            claims-related services are performed by VA-accredited attorneys,
            agents, or Veterans Service Organizations.
          </p>
          <p className="mt-2">
            Worth Their Weight · 501(c)(3) nonprofit · EIN 41-5275144 ·
            1100 Market Street, Suite 712, Chattanooga, TN 37402 · Internal use only
          </p>
        </div>
      </footer>
    </div>
  );
}

function toInitials(name: string | null, email: string): string {
  const source = name?.trim() || email.split("@")[0].replace(/[._-]+/g, " ");
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}
