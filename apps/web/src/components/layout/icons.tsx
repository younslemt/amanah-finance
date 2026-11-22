import type { NavIcon } from '@/lib/navigation';
import type { QuickActionId } from '@/lib/quick-actions';

/** Icônes décoratives (trait) : toujours accompagnées d'un libellé, donc aria-hidden. */
const PATHS: Record<NavIcon | QuickActionId | 'close' | 'plus', string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z',
  // Étoile à huit branches (khatam), motif de l'identité Amanah
  commitments: 'M12 3l2.6 2.6H18v3.4l2.6 2.6-2.6 2.6V18h-3.4L12 20.6 9.4 18H6v-3.4L3.4 12 6 9.4V6h3.4z',
  goals: 'M12 21a9 9 0 110-18 9 9 0 010 18zm0-4a5 5 0 110-10 5 5 0 010 10zm0-4a1 1 0 110-2 1 1 0 010 2z',
  budget: 'M4 19V9m6 10V5m6 14v-7m4 7H2',
  wealth: 'M3 10l9-6 9 6M5 10v9m14-9v9M9 10v9m6-9v9M3 21h18',
  add_operation: 'M12 5v14M5 12h14',
  allocate_to_goal: 'M12 21a9 9 0 110-18 9 9 0 010 18zM12 8v8M8 12h8',
  create_goal: 'M12 21a9 9 0 110-18 9 9 0 010 18zm0-4a5 5 0 110-10 5 5 0 010 10zm0-4a1 1 0 110-2 1 1 0 010 2z',
  add_calendar_event: 'M4 6h16v14H4zM4 10h16M8 3v5m8-5v5',
  record_contribution: 'M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z',
  import_statement: 'M12 4v11m0 0l-4-4m4 4l4-4M5 20h14',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
};

export function Icon({ name, className = 'h-5 w-5' }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
