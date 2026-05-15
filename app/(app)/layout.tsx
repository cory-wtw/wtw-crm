import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/login/actions";
import { getSession } from "@/lib/firebase/session";
import { NavLink } from "./nav-link";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-card/70 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-6 px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/wtw-logo.png"
              alt=""
              width={28}
              height={28}
              priority
            />
            <span className="text-sm font-bold tracking-tight">
              Worth Their Weight Roster
            </span>
          </Link>
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            <NavLink href="/">Dashboard</NavLink>
            <NavLink href="/veterans">Veterans</NavLink>
            <NavLink href="/vsos">VSOs</NavLink>
            {session.role === "admin" && (
              <NavLink href="/admin/users">Admin</NavLink>
            )}
          </nav>
          <div className="flex items-center gap-3 text-xs">
            <span className="hidden text-muted-foreground sm:inline">
              {session.email}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-card px-3 font-bold transition-colors hover:bg-secondary"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex-1 px-6 py-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </div>
      <footer className="border-t border-border py-4">
        <div className="mx-auto w-full max-w-6xl px-6 text-center text-[11px] leading-relaxed text-muted-foreground">
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
