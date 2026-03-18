import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {},
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
