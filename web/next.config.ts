import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cook/shared"],
  reactStrictMode: true,
};

export default nextConfig;
