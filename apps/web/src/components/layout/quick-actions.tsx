'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef } from 'react';
import { cn } from '@/components/ui';
import type { QuickAction } from '@/lib/quick-actions';
import { Icon } from './icons';

export const QUICK_ACTIONS_NOTE = {
  demo: 'Démonstration : seules les actions disponibles en simulation sont proposées. La saisie d’opérations, l’import et les dons sont disponibles en mode réel.',
  real: 'Seules les actions disponibles pour vous apparaissent : elles dépendent de votre rôle dans le foyer, de vos comptes, de vos projets et de vos choix de confidentialité.',
} as const;

/**
 * Bouton « + » et panneau d'actions rapides (lot 3).
 * - Dialogue modal natif : focus piégé, fermeture par la touche Échap, par le bouton « Fermer »
 *   et par un clic en dehors du panneau ; le focus revient au bouton qui l'a ouvert.
 * - Feuille en bas d'écran sur smartphone (zones de sécurité respectées), fenêtre centrée sur
 *   ordinateur.
 * - Aucune action : aucun bouton (jamais de bouton inactif).
 */
export function QuickActions({ actions, demo, variant }: { actions: readonly QuickAction[]; demo: boolean; variant: 'fab' | 'sidebar' }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const pathname = usePathname();

  // Navigation : le panneau se ferme
  useEffect(() => { if (dialog.current?.open) dialog.current.close(); }, [pathname]);

  if (actions.length === 0) return null;

  const open = () => {
    const d = dialog.current;
    if (!d || d.open) return;
    d.showModal();
    trigger.current?.setAttribute('aria-expanded', 'true');
    d.querySelector<HTMLElement>('[data-testid="action-rapide"]')?.focus();
  };
  const onClose = () => {
    trigger.current?.setAttribute('aria-expanded', 'false');
    trigger.current?.focus();
  };

  return (
    <>
      <button
        ref={trigger} type="button" onClick={open} aria-haspopup="dialog" aria-expanded="false"
        data-testid={variant === 'fab' ? 'bouton-actions-rapides' : 'bouton-actions-rapides-ordinateur'}
        className={variant === 'fab'
          ? 'fixed right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full border-2 border-accent-500 bg-primary-900 text-ivory shadow-lg hover:bg-primary-800 focus-visible:outline-offset-4 md:hidden bottom-[calc(5.25rem+env(safe-area-inset-bottom))]'
          : 'flex min-h-11 w-full items-center gap-3 rounded-lg border border-accent-500/70 px-3 py-2.5 text-sm font-medium text-ivory hover:bg-primary-800/60'}
        {...(variant === 'fab' ? { 'aria-label': 'Actions rapides' } : {})}
      >
        <Icon name="plus" className={variant === 'fab' ? 'h-6 w-6' : 'h-5 w-5'} />
        {variant === 'sidebar' ? 'Actions rapides' : null}
      </button>

      <dialog
        ref={dialog} aria-labelledby={titleId} onClose={onClose} data-testid="panneau-actions-rapides"
        // Un clic sur le fond (hors du panneau) atteint l'élément <dialog> lui-même
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
        // Le dialogue modal rend la page inerte, mais Tab peut quitter le document : on boucle
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          const items = [...e.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
          const first = items[0], last = items.at(-1);
          if (!first || !last) return;
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }}
        className={cn(
          'w-full max-w-none bg-transparent p-0 text-ink backdrop:bg-ink/45',
          'm-0 mt-auto max-h-[85dvh] md:m-auto md:max-w-md',
        )}
      >
        <div className="rounded-t-2xl bg-paper px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 md:rounded-2xl md:p-6">
          <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-line md:hidden" />
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-xl font-semibold text-primary-900">Actions rapides</h2>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Fermer" data-testid="fermer-actions-rapides"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-line hover:bg-mist">
              <Icon name="close" />
            </button>
          </div>
          <ul className="mt-2 divide-y divide-mist" data-testid="actions-rapides">
            {actions.map((a) => (
              <li key={a.id}>
                <Link href={a.href} onClick={() => dialog.current?.close()} data-testid="action-rapide" data-id={a.id}
                  className="flex min-h-14 items-center gap-3 rounded-lg py-3 hover:bg-mist/60">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-800"><Icon name={a.id} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{a.label}</span>
                    <span className="block text-sm text-ink-muted">{a.hint}</span>
                  </span>
                  <span aria-hidden="true" className="text-ink-muted">›</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-ink-muted" data-testid="note-actions-rapides">{demo ? QUICK_ACTIONS_NOTE.demo : QUICK_ACTIONS_NOTE.real}</p>
        </div>
      </dialog>
    </>
  );
}
