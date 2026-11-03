import Link from "next/link";
import { connection } from "next/server";

/**
 * Rendered per request (not at build) so it gets the proxy's CSP nonce like
 * every other page; a prerendered 404 would ship scripts without one.
 */
export default async function NotFound() {
  await connection();
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm space-y-4 rounded-3xl border border-border bg-card p-8 text-center">
        <h1 className="text-3xl font-black tracking-tight">Not found</h1>
        <p className="text-sm text-muted-foreground">There&rsquo;s nothing at this address.</p>
        <Link href="/" className="text-sm font-bold underline underline-offset-4">
          Back to the Roster
        </Link>
      </div>
    </main>
  );
}
