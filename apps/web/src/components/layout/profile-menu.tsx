'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/components/ui';
import type { ProfileMenu as ProfileMenuModel } from '@/lib/navigation';

/**
 * Menu profil (lot 3) : accès secondaires regroupés derrière l'avatar.
 * Bouton de divulgation (aria-expanded) et liste de liens : utilisable au clavier et aux lecteurs
 * d'écran ; fermeture par la touche Échap (focus rendu au bouton), par un clic à l'extérieur
 * et à chaque navigation. La déconnexion reste un formulaire POST (mode réel uniquement).
 */
export function ProfileMenu({ menu, initial, displayName, placement }: {
  menu: ProfileMenuModel; initial: string | null; displayName: string | null; placement: 'header' | 'sidebar';
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); button.current?.focus(); }
    };
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer); };
  }, [open]);

  const sidebar = placement === 'sidebar';
  const avatar = (
    <span aria-hidden="true" className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
      sidebar ? 'border-primary-100/50 text-ivory' : 'border-primary-800/40 text-primary-900')}>
      {initial ?? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" /></svg>
      )}
    </span>
  );

  return (
    <div ref={root} className={cn('relative', sidebar ? 'w-full' : '')} data-testid={sidebar ? 'menu-profil-ordinateur' : 'menu-profil'}>
      <button ref={button} type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}
        data-testid="bouton-profil"
        className={cn('flex min-h-11 items-center gap-3 rounded-lg', sidebar ? 'w-full px-3 py-2 text-left text-sm text-ivory hover:bg-primary-800/60' : 'min-w-11 justify-center')}
        {...(sidebar ? {} : { 'aria-label': 'Profil et paramètres' })}>
        {avatar}
        {sidebar ? <span className="min-w-0 flex-1 truncate">{displayName ?? 'Profil et paramètres'}<span className="sr-only"> : profil et paramètres</span></span> : null}
      </button>
      <div id={panelId} hidden={!open} data-testid="panneau-profil"
        className={cn('absolute z-30 w-64 rounded-xl border border-line bg-paper p-2 text-ink shadow-lg',
          sidebar ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2')}>
        <nav aria-label="Profil et paramètres">
          <ul className="space-y-0.5">
            {menu.items.map((i) => (
              <li key={i.id}>
                <Link href={i.href} onClick={() => setOpen(false)} data-testid="lien-profil" data-id={i.id}
                  className="flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-mist">{i.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        {menu.signOut ? (
          <form action="/auth/signout" method="post" className="mt-1 border-t border-mist pt-1">
            <button type="submit" className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-mist">Se déconnecter</button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
