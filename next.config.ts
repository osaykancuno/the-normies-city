import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "api.normies.art" },
    ],
  },
  // Pin the workspace root so Turbopack stops complaining about an unrelated
  // package-lock.json sitting in the user's home directory.
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    optimizePackageImports: ["@react-three/drei", "three"],
  },
};

export default config;
