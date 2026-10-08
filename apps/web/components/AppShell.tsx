'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { hideAppNav } from '../lib/shell';

export function AppShell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      {!hideAppNav(pathname) && nav}
      {children}
    </>
  );
}
