import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: { ignoreBuildErrors: true },
  reactCompiler: true,
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
    const backendOrigin = apiUrl.replace(/\/api\/v1\/?$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
