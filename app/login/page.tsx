import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-black tracking-tight">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Auth is wired up in the next step.
          </p>
        </div>
        <Link
          href="/"
          className="block text-center text-sm text-[color:var(--wtw-deep-gold)] underline-offset-4 hover:underline"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
