import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@proofline/event-model",
    "@proofline/protocol",
    "@proofline/ui",
    "@proofline/wormhole-sdk",
  ],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
