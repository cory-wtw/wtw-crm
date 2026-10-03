import { describe, expect, it } from "vitest";
import {
  claimsForUser,
  decideAuth,
  isTrustedSignIn,
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
});

describe("claimsForUser", () => {
  it("carries the role for an active user", () => {
    expect(claimsForUser({ role: "standard", active: true })).toEqual({
      role: "standard",
    });
  });

  it("carries no role for a deactivated user", () => {
    expect(claimsForUser({ role: "admin", active: false })).toEqual({});
  });
});

describe("isTrustedSignIn", () => {
  const google = { sign_in_provider: "google.com" };

  it("accepts a verified Google sign-in", () => {
    expect(
      isTrustedSignIn({ email: "a@b.org", email_verified: true, firebase: google }),
    ).toBe(true);
  });

  it("rejects an unverified email", () => {
    expect(
      isTrustedSignIn({ email: "a@b.org", email_verified: false, firebase: google }),
    ).toBe(false);
  });

  it("rejects other providers", () => {
    expect(
      isTrustedSignIn({
        email: "a@b.org",
        email_verified: true,
        firebase: { sign_in_provider: "password" },
      }),
    ).toBe(false);
  });

  it("rejects a token with no email", () => {
    expect(isTrustedSignIn({ email_verified: true, firebase: google })).toBe(
      false,
    );
  });
});
