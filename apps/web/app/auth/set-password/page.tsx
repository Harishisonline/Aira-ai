'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const AFTER_AUTH = '/onboarding/area?from=general';

export default function SetPasswordPage() {
  const [message, setMessage] = useState('Saving your password…');

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const password = sessionStorage.getItem('aira.pendingPassword');
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setMessage('Open the confirmation link in the same browser where you typed the password.');
        return;
      }
      if (!password || password.length < 8) {
        window.location.assign(AFTER_AUTH);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      sessionStorage.removeItem('aira.pendingPassword');
      if (error) {
        setMessage(error.message);
        return;
      }
      window.location.assign(AFTER_AUTH);
    });
  }, []);

  return (
    <main style={{ maxWidth: 480, margin: '80px auto', padding: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Set password</h1>
      <p>{message}</p>
    </main>
  );
}
