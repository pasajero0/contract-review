import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ['@lex-poc/contract'],
  // The browser talks only to Next; the API is reached through this proxy, so no CORS is needed.
  rewrites: async () => [{ source: '/api/:path*', destination: 'http://127.0.0.1:3001/:path*' }],
};

export default nextConfig;
