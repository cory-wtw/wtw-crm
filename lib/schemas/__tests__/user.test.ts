import { describe, expect, it } from "vitest";
import { USER_ROLES, userSchema } from "..";

describe("userSchema", () => {
  it("accepts both roles", () => {
    for (const role of USER_ROLES) {
      const result = userSchema.safeParse({
        uid: "u1",
        email: "test@example.com",
        displayName: "Test",
        role,
        active: true,
        createdAt: new Date(),
        lastLoginAt: null,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown roles", () => {
    const result = userSchema.safeParse({
      uid: "u1",
      email: "test@example.com",
      displayName: null,
      role: "superadmin",
      active: true,
      createdAt: new Date(),
      lastLoginAt: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed emails", () => {
    const result = userSchema.safeParse({
      uid: "u1",
      email: "not-an-email",
      displayName: null,
      role: "admin",
      active: true,
      createdAt: new Date(),
      lastLoginAt: null,
    });
    expect(result.success).toBe(false);
  });
});
