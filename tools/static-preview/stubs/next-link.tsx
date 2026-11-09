import type { AnchorHTMLAttributes, ReactNode } from 'react';
// Remplace next/link : un lien HTML ordinaire (navigation complète, sans préchargement).
export default function Link({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) {
  return <a href={href} {...rest}>{children}</a>;
}
