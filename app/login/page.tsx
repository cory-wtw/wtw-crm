import Image from "next/image";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/firebase/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getSession()) {
    redirect("/");
  }
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image src="/wtw-medal.svg" alt="" width={48} height={64} priority />
          <h1 className="text-2xl font-black tracking-tight">
            Worth Their Weight CRM
          </h1>
          <p className="text-sm text-muted-foreground">Sign in to continue.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
