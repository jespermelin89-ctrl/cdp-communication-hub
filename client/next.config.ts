import type { NextConfig } from 'next';
import withBundleAnalyzer from '@next/bundle-analyzer';

const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Proxy API calls to the backend server (except local auth routes)
  async rewrites() {
    return [
      {
        source: '/api/auth/:path*',
        destination: '/api/auth/:path*',
      },
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

// Bundle analyzer: run with ANALYZE=true npm run build
export default withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })(nextConfig);
