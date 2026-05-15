import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex flex-col items-center gap-8 text-center">
        <Image
          src="/wtw-medal.svg"
          alt="Worth Their Weight medal"
          width={96}
          height={120}
          priority
        />
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
          Worth Their Weight CRM
        </h1>
        <p className="max-w-md text-base text-muted-foreground">
          Internal tool for the WTW team. Sign in to find, connect, and follow
          up on veterans in our pipeline.
        </p>
        <Link
          href="/login"
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
