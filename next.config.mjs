/** @type {import('next').NextConfig} */
const nextConfig = {
  // firebase-admin pulls in native gRPC bindings and is server-only; let
  // Node resolve it from node_modules at runtime instead of having the
  // bundler externalize-and-mangle the name. Without this, Cloud Run
  // 500s on every request because it can't find the hashed package.
  serverExternalPackages: ["firebase-admin"],

  // The Claude connector's Allow screen must never load inside someone else's
  // page, where a disguised button could get an admin to approve it.
  async headers() {
    return [
      {
        source: "/oauth/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
