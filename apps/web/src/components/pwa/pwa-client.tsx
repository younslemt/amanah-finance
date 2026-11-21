'use client';
import { useEffect, useState } from 'react';

/**
 * Inscription du service worker (production uniquement) et bandeau réseau.
 * Hors ligne : rien n'est enregistré, l'affichage peut ne pas être à jour.
 */
export function PwaClient() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    }
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  if (online) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 bg-accent-100 px-4 py-2 text-center text-sm text-ink" data-testid="bandeau-hors-ligne">
      Connexion perdue : l’affichage peut ne pas être à jour et aucun enregistrement n’est possible.
    </div>
  );
}
