import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  // Disable request logging in dev
  devIndicators: false,
};

export default nextConfig;
