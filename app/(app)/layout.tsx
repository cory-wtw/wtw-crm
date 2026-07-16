import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/login/actions";
import { getSession } from "@/lib/firebase/session";
import { isSocialOnly, isSocialPath } from "@/lib/permissions";
import { NavLink } from "./nav-link";
import { MobileNav, type NavItem } from "./mobile-nav";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

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
        { href: "/", label: "Dashboard" },
        { href: "/veterans", label: "Veterans" },
        { href: "/vsos", label: "VSOs" },
        { href: "/orgs", label: "Orgs" },
        { href: "/phones", label: "Phones" },
        { href: "/social", label: "Social" },
        ...(session.role === "admin"
          ? [{ href: "/admin/users", label: "Admin" }]
          : []),
      ];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:gap-6 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <Image
              src="/wtw-logo.png"
              alt=""
              width={28}
              height={28}
              priority
              className="shrink-0"
            />
            <span className="truncate text-sm font-bold tracking-tight">
              <span className="sm:hidden">WTW Roster</span>
              <span className="hidden sm:inline">
                Worth Their Weight Roster
              </span>
            </span>
          </Link>
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink key={item.href} href={item.href}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-xs">
            <span className="hidden text-muted-foreground lg:inline">
              {session.email}
            </span>
            <form action={signOutAction} className="hidden md:block">
              <button
                type="submit"
                className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-card px-3 font-bold transition-colors hover:bg-secondary"
              >
                Sign out
              </button>
            </form>
            <MobileNav items={navItems} email={session.email} />
          </div>
        </div>
      </header>
      <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </div>
      <footer className="border-t border-border py-4">
        <div className="mx-auto w-full max-w-6xl px-4 text-center text-[11px] leading-relaxed text-muted-foreground sm:px-6">
          <p>
            Worth Their Weight is not a law firm and does not provide legal
            representation before the U.S. Department of Veterans Affairs. All
            claims-related services are performed by VA-accredited attorneys,
            agents, or Veterans Service Organizations.
          </p>
          <p className="mt-2">
            Worth Their Weight · 501(c)(3) status pending · EIN 41-5275144 ·
            1100 Market Street, Suite 712, Chattanooga, TN 37402 · Internal use only
          </p>
        </div>
      </footer>
    </div>
  );
}
