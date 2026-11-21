'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Synchronisation entre onglets : après un enregistrement, les autres onglets ouverts se
 * rafraîchissent (mêmes données sur toutes les pages : projets, plan, tableau de bord).
 * Le message ne contient aucune donnée, seulement un signal.
 */
const CHANNEL = 'amanah-donnees';

export function notifyDataChanged(): void {
  try { const c = new BroadcastChannel(CHANNEL); c.postMessage('changed'); c.close(); } catch { /* navigateur sans BroadcastChannel */ }
}

export function DataSync() {
  const router = useRouter();
  useEffect(() => {
    let c: BroadcastChannel | null = null;
    try { c = new BroadcastChannel(CHANNEL); c.onmessage = () => router.refresh(); } catch { c = null; }
    return () => c?.close();
  }, [router]);
  return null;
}
