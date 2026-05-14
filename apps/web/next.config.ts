import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@kyujin/db', '@kyujin/shared'],
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  serverExternalPackages: ['postgres', 'googleapis'],
};

export default nextConfig;
