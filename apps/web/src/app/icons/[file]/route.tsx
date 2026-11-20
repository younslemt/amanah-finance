import { brandIconSvg } from '@/config/brand';

/** Icônes PWA générées depuis la configuration de marque. */
export function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  return params.then(({ file }) => {
    if (file !== 'icon.svg' && file !== 'icon-maskable.svg') return new Response('Not found', { status: 404 });
    return new Response(brandIconSvg({ maskable: file === 'icon-maskable.svg' }), {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' },
    });
  });
}

export function generateStaticParams() {
  return [{ file: 'icon.svg' }, { file: 'icon-maskable.svg' }];
}
