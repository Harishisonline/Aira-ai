/**
 * Root layout for the Aira AI web app.
 * - Loads Inter from next/font/google
 * - Inlines no-flash theme script
 * - ThemeProvider wraps the tree
 * - App Nav is omitted on marketing/auth shells (see lib/shell.ts)
 */

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { Nav } from '../components/Nav';
import { AppShell } from '../components/AppShell';
import { ThemeProvider } from '../components/ThemeProvider';
import type { UserRow } from '../lib/types';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Aira AI',
  description: 'Live AQI for Maharashtra. Built for Borivali, runs for everyone.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f4c75',
};

const themeBootstrapScript = `
(function() {
  try {
    var t = localStorage.getItem('aira.theme');
    if (t === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {}
})();
`.trim();

async function getCurrentUser(): Promise<{ user: UserRow | null; email: string | null }> {
  const cookieStore = await cookies();
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { user: null, email: null };

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set({ name, value, ...(options as any) });
          });
        } catch {
          // Read-only context (Server Component); middleware refreshes cookies.
        }
      },
    },
  });

  const { data: { session } } = await supabase.auth.getSession();
  const authUser = session?.user;
  if (!authUser) return { user: null, email: null };

  const { data: profile } = await supabase
    .from('users')
    .select('id, email, display_name, bio, avatar_url, theme, default_state, default_city, default_place, alert_threshold, email_alerts_enabled, health_profile, created_at, last_seen_at')
    .eq('id', authUser.id)
    .single();

  return { user: profile as UserRow | null, email: authUser.email ?? null };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { user, email } = await getCurrentUser();

  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className={inter.className}>
        <ThemeProvider initialTheme={user?.theme === 'dark' ? 'dark' : 'light'}>
          <AppShell nav={<Nav user={user} email={email} />}>
            {children}
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
