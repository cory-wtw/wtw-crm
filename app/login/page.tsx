import Image from "next/image";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { LoginForm } from "./login-form";

/** Only the connector sign-in may ask to come back after login — an open
 *  "next" would let any link bounce a fresh session somewhere else. */
function safeNext(value: string | string[] | undefined): string | null {
  const next = Array.isArray(value) ? value[0] : value;
  return next?.startsWith("/oauth/authorize?") ? next : null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNext((await searchParams).next);
  if (await getSession()) {
    redirect(next ?? "/");
  }
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm space-y-8 rounded-3xl border border-border bg-card p-8 shadow-[0_1px_2px_rgb(29_25_18/0.05),0_24px_48px_-24px_rgb(29_25_18/0.25)]">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--wtw-near-black)]">
            <Image src="/wtw-logo.png" alt="" width={40} height={40} priority />
          </span>
          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-tight">Roster</h1>
            <p className="text-sm text-muted-foreground">Worth Their Weight · sign in to continue</p>
          </div>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
