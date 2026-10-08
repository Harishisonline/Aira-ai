/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel builds its own optimized output, so standalone is not needed
  // for production. Keep reactStrictMode on.
  reactStrictMode: true,
  poweredByHeader: false,

  // Allow images from Supabase storage (avatars bucket) and any subdomain
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
    ],
  },

  // Per-path no-cache so stale auth state can't leak via the API
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

  // Empty Turbopack config: required to silence "you have a webpack
  // config and no turbopack config" warning in Next.js 16+.
  turbopack: {},
};

module.exports = nextConfig;
