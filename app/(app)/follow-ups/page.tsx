import { redirect } from "next/navigation";

// Folded into /outreach alongside check-ins — one queue page instead of two
// nav items. This route stays so an old link still lands somewhere; the
// per-veteran /follow-ups/[id] outcome form is unchanged.
export default function FollowUpsPage() {
  redirect("/outreach");
}
