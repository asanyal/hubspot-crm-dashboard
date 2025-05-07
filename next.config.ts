import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_ROOT_URL || 'http://localhost:8000';
    return [
      {
        source: '/api/hubspot/v2/:path*',
        destination: `${backendUrl}/api/hubspot/v2/:path*`,
      },
      {
        source: '/api/hubspot/:path*',
        destination: `${backendUrl}/api/hubspot/:path*`,
      },
    ];
  },
  experimental: {
    proxyTimeout: 300000, // 5 minutes in milliseconds
  },
};

export default nextConfig;
