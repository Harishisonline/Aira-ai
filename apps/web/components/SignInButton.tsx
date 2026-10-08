/**
 * SignInButton — the "Sign in" CTA shown in the nav when the user is not
 * signed in. Renders as a deep-blue pill matching the mockup design.
 */

import Link from 'next/link';

export function SignInButton() {
  return (
    <Link
      href="/signin"
      style={{
        marginLeft: 16,
        padding: '10px 18px',
        background: 'var(--primary)',
        color: '#fff !important',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
        textDecoration: 'none',
        display: 'inline-block',
      }}
    >
      Sign in
    </Link>
  );
}
