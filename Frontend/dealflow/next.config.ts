import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is for Docker only; Vercel's adapter breaks with it.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.dicebear.com",
      },
    ],
  },
};

export default nextConfig;
