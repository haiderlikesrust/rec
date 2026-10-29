import type { NextConfig } from "next";

// @base-org/account (pulled in by RainbowKit's wallet list) references optional x402 payment packages
// that aren't installed and are never used here. Point them at a stub module so the bundler is happy.
const optionalStubs = [
  "@x402/core/client",
  "@x402/evm",
  "@x402/evm/exact/client",
  "@x402/evm/upto/client",
  "@x402/svm/exact/client",
];

const nextConfig: NextConfig = {
  transpilePackages: ["@cook/shared"],
  reactStrictMode: true,
  turbopack: {
    resolveAlias: Object.fromEntries(optionalStubs.map((m) => [m, "./lib/empty.ts"])),
  },
};

export default nextConfig;
