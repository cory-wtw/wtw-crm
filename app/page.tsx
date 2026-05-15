import Image from "next/image";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { signOutAction } from "./login/actions";

export default async function Dashboard() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <main className="flex flex-1 flex-col px-6 py-12">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/wtw-logo.png"
              alt=""
              width={40}
              height={40}
              priority
            />
            <h1 className="text-2xl font-black tracking-tight">Dashboard</h1>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary"
            >
              Sign out
            </button>
          </form>
        </header>

        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">Signed in as</p>
          <p className="mt-1 text-lg font-bold">{session.email}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[color:var(--wtw-deep-gold)]">
            {session.role ?? "no role yet"}
          </p>
        </section>

        <section className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          Veterans, VSOs, and the pipeline view are coming next.
        </section>
      </div>
    </main>
  );
}
