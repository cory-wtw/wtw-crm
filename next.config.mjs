/** @type {import('next').NextConfig} */
const nextConfig = {
  // firebase-admin pulls in native gRPC bindings and is server-only; let
  // Node resolve it from node_modules at runtime instead of having the
  // bundler externalize-and-mangle the name. Without this, Cloud Run
  // 500s on every request because it can't find the hashed package.
  serverExternalPackages: ["firebase-admin"],

  poweredByHeader: false,

  // Baseline security headers on every route. The nonce CSP (which also
  // carries frame-ancestors 'none', so the connector's Allow screen can't be
  // framed) lives in proxy.ts because it has to change per request.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      // Only the login page opens a popup (Google sign-in) that has to reach
      // back to its opener. Not set globally: the connector /oauth flow may
      // rely on window.opener.
      {
        source: "/login",
        headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }],
      },
    ];
  },
};

export default nextConfig;
