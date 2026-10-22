import type { NextConfig } from 'next';

const API_URL = process.env.API_URL || 'http://localhost:4000';

const config: NextConfig = {
  reactStrictMode: true,
  // old addresses (/p/PRD-001/...) keep working
  async redirects() {
    return [{ source: '/p/:path*', destination: '/products/:path*', permanent: false }];
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default config;
