import "server-only";
import { getSession, type Session } from "@/lib/firebase/session";
import { canManageFinances } from "@/lib/permissions";

/**
 * The finance pages' guard, shared by their server actions. Lives here, not
 * in a "use server" file, because anything exported from one of those
 * becomes a callable endpoint.
 */
export async function requireFinanceSession(): Promise<{ session: Session } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  if (!canManageFinances(session)) return { error: "Only admins can manage finances." };
  return { session };
}
