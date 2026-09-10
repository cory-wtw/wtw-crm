import { redirect } from "next/navigation";

// Folded into /outreach alongside referral follow-ups — one queue page
// instead of two nav items. This route stays so an old link still lands
// somewhere.
export default function CheckInsPage() {
  redirect("/outreach");
}
