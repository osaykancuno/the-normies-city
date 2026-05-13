import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "api.normies.art" },
    ],
  },
  experimental: {
    optimizePackageImports: ["@react-three/drei", "three"],
  },
};

export default config;
