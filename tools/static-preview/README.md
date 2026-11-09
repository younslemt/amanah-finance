# Aperçu statique (vérification hors ligne)

Rend les **vrais** composants React de `apps/web` (mode démo) en HTML statique, compile le CSS
Tailwind 4 à partir des classes utilisées, et sert le tout avec les en-têtes de sécurité de
`next.config.ts`. Sert à vérifier les écrans quand Next.js ne peut pas être installé.

Ce que l'aperçu NE vérifie PAS : le routage et le rendu de Next.js, l'hydratation côté client,
les actions serveur, `next/font` (polices système à la place d'Inter et Fraunces), le middleware.
Ces points relèvent de `pnpm build` et `pnpm test:e2e`.

Seuls `next/link`, `next/navigation`, `next/font`, `next/headers`, `server-only` et `@supabase/ssr`
sont remplacés par des substituts (`stubs/`).
