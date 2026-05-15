import { z } from "zod";

export const USER_ROLES = ["admin", "standard"] as const;
export const userRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof userRoleSchema>;

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
