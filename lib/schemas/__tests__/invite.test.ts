import { describe, expect, it } from "vitest";
import { inviteSchema, normalizeEmail } from "..";

describe("inviteSchema", () => {
  it("requires email, role, invitedBy, invitedAt", () => {
    expect(inviteSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a fully populated invite", () => {
    const result = inviteSchema.safeParse({
      email: "kristen@worththeirweight.org",
      role: "standard",
      invitedBy: "u1",
      invitedAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed emails", () => {
    const result = inviteSchema.safeParse({
      email: "not-an-email",
      role: "standard",
      invitedBy: "u1",
      invitedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown roles", () => {
    const result = inviteSchema.safeParse({
      email: "x@y.com",
      role: "superadmin",
      invitedBy: "u1",
      invitedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("lowercases", () => {
    expect(normalizeEmail("Cory@WorthTheirWeight.org")).toBe(
      "cory@worththeirweight.org",
    );
  });

  it("trims", () => {
    expect(normalizeEmail("  cory@worththeirweight.org  ")).toBe(
      "cory@worththeirweight.org",
    );
  });

  it("does both", () => {
    expect(normalizeEmail("  Cory@X.COM\t")).toBe("cory@x.com");
  });
});
