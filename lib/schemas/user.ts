import { z } from "zod";

export const USER_ROLES = ["admin", "standard", "social"] as const;
export const userRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof userRoleSchema>;

/**
 * Human labels for roles. "social" is a restricted role: the social media
 * manager who can only reach the Social wall — no veteran/VSO/org/phone data.
 */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  standard: "Standard",
  social: "Social (media only)",
};

export const userSchema = z.object({
  uid: z.string(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: userRoleSchema,
  active: z.boolean(),
  createdAt: z.date(),
  lastLoginAt: z.date().nullable(),
});
export type User = z.infer<typeof userSchema>;
