import { describe, expect, it } from "vitest";
import { buildCsp } from "./csp";

const NONCE = "dGVzdC1ub25jZQ==";

function directive(csp: string, name: string): string | undefined {
  return csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `));
}

describe("buildCsp", () => {
  it("carries the nonce in script-src", () => {
    const csp = buildCsp(NONCE, "/veterans");
    expect(directive(csp, "script-src")).toContain(`'nonce-${NONCE}'`);
    expect(directive(csp, "script-src")).toContain("'strict-dynamic'");
  });

  it("never lets the app be framed", () => {
    expect(directive(buildCsp(NONCE, "/"), "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(buildCsp(NONCE, "/oauth/authorize"), "frame-ancestors")).toBe(
      "frame-ancestors 'none'",
    );
  });

  it("keeps form-action to self everywhere but the connector Allow page", () => {
    expect(directive(buildCsp(NONCE, "/login"), "form-action")).toBe("form-action 'self'");
    expect(directive(buildCsp(NONCE, "/veterans/new"), "form-action")).toBe(
      "form-action 'self'",
    );
  });

  it("lets the connector Allow page send its code back to Claude", () => {
    const formAction = directive(buildCsp(NONCE, "/oauth/authorize"), "form-action");
    expect(formAction).toContain("'self'");
    expect(formAction).toContain("https://claude.ai");
    expect(formAction).toContain("https://claude.com");
    expect(formAction).toContain("http://localhost:*");
    expect(formAction).toContain("http://127.0.0.1:*");
  });

  it("is a single line", () => {
    expect(buildCsp(NONCE, "/")).not.toMatch(/\n|\s{2,}/);
  });
});
