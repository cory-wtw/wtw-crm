import { describe, expect, it } from "vitest";
import {
  decideAuth,
  isInviteExpired,
  isLastLoginStale,
  isOrgEmail,
} from "./auth-provisioning";
import type { Invite, User } from "./schemas";

const ACTIVE_USER: User = {
  uid: "u1",
  email: "cory@worththeirweight.org",
  displayName: "Cory Gold",
  role: "admin",
  active: true,
  createdAt: new Date(),
  lastLoginAt: null,
};

const STANDARD_INVITE: Invite = {
  email: "kristen@worththeirweight.org",
  role: "standard",
  invitedBy: "u1",
  invitedAt: new Date(),
};

describe("decideAuth", () => {
  it("allows an existing active user", () => {
    const decision = decideAuth({
      email: "cory@worththeirweight.org",
      existingUser: ACTIVE_USER,
      existingInvite: null,
    });
    expect(decision.action).toBe("allow");
  });

  it("rejects an existing deactivated user", () => {
    const decision = decideAuth({
      email: "cory@worththeirweight.org",
      existingUser: { ...ACTIVE_USER, active: false },
      existingInvite: null,
    });
    expect(decision.action).toBe("reject");
    if (decision.action === "reject") {
      expect(decision.reason).toContain("deactivated");
    }
  });

  it("provisions a new user from an invite", () => {
    const decision = decideAuth({
      email: "kristen@worththeirweight.org",
      existingUser: null,
      existingInvite: STANDARD_INVITE,
      now: new Date(),
    });
    expect(decision.action).toBe("provision");
    if (decision.action === "provision") {
      expect(decision.role).toBe("standard");
      expect(decision.email).toBe("kristen@worththeirweight.org");
    }
  });

  it("rejects a sign-in with no user and no invite", () => {
    const decision = decideAuth({
      email: "stranger@example.com",
      existingUser: null,
      existingInvite: null,
    });
    expect(decision.action).toBe("reject");
    if (decision.action === "reject") {
      expect(decision.reason).toContain("allowlist");
    }
  });

  it("prefers existing user over a stale invite", () => {
    const decision = decideAuth({
      email: "cory@worththeirweight.org",
      existingUser: ACTIVE_USER,
      existingInvite: STANDARD_INVITE,
    });
    expect(decision.action).toBe("allow");
  });

  it("rejects a deactivated user even when an invite is present", () => {
    const decision = decideAuth({
      email: "cory@worththeirweight.org",
      existingUser: { ...ACTIVE_USER, active: false },
      existingInvite: STANDARD_INVITE,
    });
    expect(decision.action).toBe("reject");
  });

  it("still allows an active user when their invite has expired", () => {
    const decision = decideAuth({
      email: "cory@worththeirweight.org",
      existingUser: ACTIVE_USER,
      existingInvite: {
        ...STANDARD_INVITE,
        invitedAt: new Date("2026-09-17T12:00:00Z"),
      },
      now: new Date("2026-11-03T12:00:00Z"),
    });
    expect(decision.action).toBe("allow");
  });

  it("rejects a deactivated user even with a fresh invite", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    const decision = decideAuth({
      email: "cory@worththeirweight.org",
      existingUser: { ...ACTIVE_USER, active: false },
      existingInvite: { ...STANDARD_INVITE, invitedAt: now },
      now,
    });
    expect(decision.action).toBe("reject");
    if (decision.action === "reject") {
      expect(decision.reason).toContain("deactivated");
    }
  });

  it("rejects an expired invite with a resend hint", () => {
    const sent = new Date("2026-09-17T12:00:00Z");
    const decision = decideAuth({
      email: "kristen@worththeirweight.org",
      existingUser: null,
      existingInvite: { ...STANDARD_INVITE, invitedAt: sent },
      now: new Date("2026-11-03T12:00:00Z"),
    });
    expect(decision.action).toBe("reject");
    if (decision.action === "reject") {
      expect(decision.reason).toContain("expired");
      expect(decision.reason).toContain("resend");
    }
  });
});

describe("isInviteExpired", () => {
  const sent = new Date("2026-10-01T12:00:00Z");

  it("is fresh inside the 7-day window", () => {
    expect(isInviteExpired({ invitedAt: sent }, sent)).toBe(false);
    expect(
      isInviteExpired({ invitedAt: sent }, new Date("2026-10-08T11:59:00Z")),
    ).toBe(false);
  });

  it("is still valid at exactly 7 days", () => {
    expect(
      isInviteExpired({ invitedAt: sent }, new Date("2026-10-08T12:00:00Z")),
    ).toBe(false);
  });

  it("fails closed on a missing or unparseable date", () => {
    expect(isInviteExpired({ invitedAt: new Date(0) }, sent)).toBe(true);
    expect(isInviteExpired({ invitedAt: new Date(NaN) }, sent)).toBe(true);
  });

  it("expires once 7 days have passed", () => {
    expect(
      isInviteExpired({ invitedAt: sent }, new Date("2026-10-08T12:01:00Z")),
    ).toBe(true);
    expect(
      isInviteExpired({ invitedAt: sent }, new Date("2026-11-03T12:00:00Z")),
    ).toBe(true);
  });
});

describe("isOrgEmail", () => {
  it("accepts the org domain in any case", () => {
    expect(isOrgEmail("cory@worththeirweight.org")).toBe(true);
    expect(isOrgEmail("Cory@WorthTheirWeight.ORG")).toBe(true);
  });

  it("rejects outside domains and lookalikes", () => {
    expect(isOrgEmail("someone@gmail.com")).toBe(false);
    expect(isOrgEmail("dev@thethinkweb.com")).toBe(false);
    expect(isOrgEmail("x@worththeirweight.org.evil.com")).toBe(false);
    expect(isOrgEmail("x@notworththeirweight.org")).toBe(false);
    expect(isOrgEmail("no-at-sign")).toBe(false);
  });

  it("handles whitespace, trailing dots, and lookalike characters", () => {
    expect(isOrgEmail("  cory@worththeirweight.org  ")).toBe(true);
    expect(isOrgEmail("cory@worththeirweight.org.")).toBe(false);
    // Cyrillic "о" in place of Latin "o".
    expect(isOrgEmail("cory@worththeirweight.\u043erg")).toBe(false);
  });
});

describe("isLastLoginStale", () => {
  const now = new Date("2026-11-03T12:00:00Z");

  it("treats never-logged-in as not stale", () => {
    expect(isLastLoginStale(null, now)).toBe(false);
  });

  it("flags logins older than 60 days", () => {
    expect(isLastLoginStale(new Date("2026-09-01T12:00:00Z"), now)).toBe(true);
    expect(isLastLoginStale(new Date("2026-10-01T12:00:00Z"), now)).toBe(false);
  });
});
