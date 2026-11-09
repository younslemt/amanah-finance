// Remplace next/navigation : le chemin courant est fixé par le moteur de rendu de l'aperçu.
export const __preview = { pathname: '/' };
export function usePathname() { return __preview.pathname; }
export class PreviewRedirect extends Error { constructor(public to: string) { super(`redirect:${to}`); } }
export function redirect(to: string): never { throw new PreviewRedirect(to); }
export function notFound(): never { throw new Error('notFound'); }
