/**
 * Routes that render their own chrome (mockups 00, 07, 13, 15) and must
 * NOT show the app Nav from the root layout.
 */

export function hideAppNav(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === '/') return true;
  if (pathname === '/signin' || pathname.startsWith('/signin/')) return true;
  if (pathname === '/onboarding/area' || pathname.startsWith('/onboarding/')) return true;
  if (pathname === '/advisory/chat-locked') return true;
  return false;
}
