/**
 * Identité de marque — SOURCE UNIQUE.
 * Le nom « Amanah Finance » est provisoire : changer ce fichier suffit pour
 * renommer l'application (titres, manifeste PWA, icônes, couleurs, textes).
 * Les couleurs sont injectées en variables CSS (--brand-*) et consommées par
 * les jetons Tailwind de globals.css.
 */
export const brand = {
  name: 'Amanah Finance',
  shortName: 'Amanah',
  tagline: 'Votre argent, géré selon vos valeurs.',
  description: 'Gestion financière, patrimoniale et éthique, conforme à vos valeurs.',
  locale: 'fr-BE',
  colors: {
    primary950: '#06251c',
    primary900: '#0b3d2e', // vert émeraude profond
    primary800: '#0f4d3a',
    primary700: '#155f48',
    primary600: '#1e7658',
    primary100: '#dcebe4',
    primary50: '#eef5f1',
    accent600: '#8a6a30', // doré discret, assombri pour le texte (contraste AA)
    accent500: '#b8924a',
    accent100: '#f3ead9',
    background: '#faf8f3', // blanc cassé
    surface: '#ffffff',
    ink: '#1b1f1d',
    inkMuted: '#5a625d',
    line: '#e6e3dc', // gris clair
    mist: '#f1efea',
  },
} as const;

export type Brand = typeof brand;

/** Variables CSS injectées sur <html>. */
export function brandCssVariables(b: Brand = brand): Record<string, string> {
  const c = b.colors;
  return {
    '--brand-primary-950': c.primary950,
    '--brand-primary-900': c.primary900,
    '--brand-primary-800': c.primary800,
    '--brand-primary-700': c.primary700,
    '--brand-primary-600': c.primary600,
    '--brand-primary-100': c.primary100,
    '--brand-primary-50': c.primary50,
    '--brand-accent-600': c.accent600,
    '--brand-accent-500': c.accent500,
    '--brand-accent-100': c.accent100,
    '--brand-background': c.background,
    '--brand-surface': c.surface,
    '--brand-ink': c.ink,
    '--brand-ink-muted': c.inkMuted,
    '--brand-line': c.line,
    '--brand-mist': c.mist,
  };
}

/** Icône de l'application, générée à partir des couleurs de marque. */
export function brandIconSvg(opts: { maskable?: boolean } = {}, b: Brand = brand): string {
  const c = b.colors;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${opts.maskable ? 0 : 112}" fill="${c.primary900}"/><g fill="none" stroke-width="22"><rect x="156" y="156" width="200" height="200" rx="18" stroke="${c.background}"/><rect x="156" y="156" width="200" height="200" rx="18" stroke="${c.accent500}" transform="rotate(45 256 256)"/></g><circle cx="256" cy="256" r="26" fill="${c.accent500}"/></svg>`;
}
