import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/hubspot/v2/:path*',
        destination: 'http://localhost:8000/api/hubspot/v2/:path*',
      },
      {
        source: '/api/hubspot/:path*',
        destination: 'http://localhost:8000/api/hubspot/:path*',
      },
    ];
  },
  experimental: {
    proxyTimeout: 300000, // 5 minutes in milliseconds
  },
};

export default nextConfig;
