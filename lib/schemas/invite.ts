import { z } from "zod";
import { userRoleSchema } from "./user";

/**
 * An open invitation to join the Roster. Doc ID is the lowercased,
 * trimmed email so lookups on first sign-in are O(1). The invite is
 * deleted when the user materializes into the `users` collection.
 */
export const inviteSchema = z.object({
  email: z.string().email(),
  role: userRoleSchema,
  invitedBy: z.string(),
  invitedAt: z.date(),
});
export type Invite = z.infer<typeof inviteSchema>;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
