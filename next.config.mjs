/**
 * Baseline security headers on every response.
 *
 * No script-src CSP yet: Next's inline bootstrap scripts and the Firebase
 * sign-in popup would need nonces wired through first. No
 * Cross-Origin-Opener-Policy either — signInWithPopup needs to talk to its
 * popup window, and `same-origin` breaks that.
 */
const securityHeaders = [
  // Nothing here is meant to be embedded; stops clickjacking the admin pages.
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // URLs carry veteran ids; don't hand them to outside sites we link to.
  { key: "Referrer-Policy", value: "same-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // firebase-admin pulls in native gRPC bindings and is server-only; let
  // Node resolve it from node_modules at runtime instead of having the
  // bundler externalize-and-mangle the name. Without this, Cloud Run
  // 500s on every request because it can't find the hashed package.
  serverExternalPackages: ["firebase-admin"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
