import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// Next reads `.env` only from apps/web; the project keeps one file in the root.
const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3001';

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ['@lex-poc/contract'],
  // The browser talks only to Next; the API is reached through this proxy, so no CORS is needed.
  rewrites: async () => [{ source: '/api/:path*', destination: `${API_URL}/:path*` }],
};

export default nextConfig;
