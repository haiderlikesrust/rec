import type { NextConfig } from "next";

/** Where the backend listens. In the Docker image both run in one container; locally, `pnpm demo` on :42069. */
const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:42069";

const nextConfig: NextConfig = {
  transpilePackages: ["@cook/shared"],
  reactStrictMode: true,
  // Same-origin API: /api/* goes to the backend (Next's own routes, like /api/upload, are matched first).
  async rewrites() {
    return { beforeFiles: [], afterFiles: [{ source: "/api/:path*", destination: `${backend}/api/:path*` }], fallback: [] };
  },
};

export default nextConfig;
