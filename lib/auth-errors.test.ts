import { describe, expect, it } from "vitest";
import { humanizeAuthError } from "./auth-errors";

describe("humanizeAuthError", () => {
  it("maps cancellation codes to a friendly message", () => {
    expect(humanizeAuthError({ code: "auth/popup-closed-by-user" })).toBe(
      "Sign-in was cancelled.",
    );
    expect(
      humanizeAuthError({ code: "auth/cancelled-popup-request" }),
    ).toBe("Sign-in was cancelled.");
  });

  it("flags popup blockers", () => {
    expect(humanizeAuthError({ code: "auth/popup-blocked" })).toContain(
      "popup",
    );
  });

  it("flags disabled accounts", () => {
    expect(humanizeAuthError({ code: "auth/user-disabled" })).toContain(
      "admin",
    );
  });

  it("flags network failures", () => {
    expect(
      humanizeAuthError({ code: "auth/network-request-failed" }),
    ).toContain("connection");
  });

  it("returns the raw code for unknown auth errors so we can debug", () => {
    expect(humanizeAuthError({ code: "auth/some-new-thing" })).toBe(
      "auth/some-new-thing",
    );
  });

  it("returns a generic message for non-auth errors", () => {
    expect(humanizeAuthError(new Error("boom"))).toBe(
      "Something went wrong. Try again.",
    );
    expect(humanizeAuthError(null)).toBe("Something went wrong. Try again.");
    expect(humanizeAuthError(undefined)).toBe(
      "Something went wrong. Try again.",
    );
  });
});
