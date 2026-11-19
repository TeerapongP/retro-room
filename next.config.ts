import type { NextConfig } from "next";

// shortcut: production uses Webpack because Turbopack's CSS worker cannot spawn in this Windows workspace; switch back when that worker runs here.
const nextConfig: NextConfig = {
  /* config options here */
  distDir: process.env.RETRO_ROOM_PLAYWRIGHT === "true" ? ".next-playwright" : ".next",
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    agentUpgrade: "security",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
