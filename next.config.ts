import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin pulls in native bits (gRPC) and is server-only; let
  // Node resolve it at runtime instead of Turbopack trying to bundle it.
  // Without this, Cloud Run sees a mangled module name like
  // `firebase-admin-<hash>/app` and 500s. See:
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
