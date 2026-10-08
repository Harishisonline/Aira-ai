/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output produces a minimal server.js + node_modules
  // subset for small Docker images. To run locally: `node .next/standalone/server.js`
  // (the standard `pnpm start` does not work with standalone output).
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,

  // Allow images from Supabase storage (avatars bucket) and any subdomain
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
    ],
  },

  // Headers here are applied by Next.js before our middleware runs.
  // The middleware applies the strict CSP + HSTS + COOP — leave those
  // to middleware.ts. Headers here cover the per-path cases (e.g.
  // no-cache on /api/* so stale auth state can't leak).
  async headers() {
    return [
      {
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ];
  },

  env: {
    NEXT_PUBLIC_APP_NAME: 'Aira AI',
    NEXT_PUBLIC_APP_VERSION: '1.3.0',
  },

  webpack: (config) => config,
};

module.exports = nextConfig;
