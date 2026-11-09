import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { isDemoMode } from '@/lib/env';

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell demo={isDemoMode}>{children}</AppShell>;
}
