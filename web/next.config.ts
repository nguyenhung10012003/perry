import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// The web imports the bot's TypeScript from ../src, so the trace root is the repository root.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Headers of every response (pages, Route Handlers, static files). The CSP is per request and set in proxy.ts
 * (pages) and by the handlers (callback error pages). HSTS is left to the reverse proxy.
 */
const STATIC_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  // images.unoptimized still traces sharp and its libvips binaries (18 MB); nothing uses them.
  outputFileTracingExcludes: { '*': ['**/node_modules/sharp/**', '**/node_modules/@img/**'] },
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  images: { unoptimized: true },
  // pg, pino and pino-pretty are on Next's built-in external list.
  serverExternalPackages: ['ioredis'],
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: STATIC_SECURITY_HEADERS }]);
  },
  webpack: (config: { resolve: { extensionAlias?: Record<string, string[]> } }) => {
    // The bot's NodeNext sources import "./x.js" for "./x.ts"; Turbopack cannot map this, hence --webpack.
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'], '.mjs': ['.mts', '.mjs'] };
    return config;
  },
};

export default nextConfig;
