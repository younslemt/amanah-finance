import { ImageResponse } from 'next/og';
import { brandIconSvg } from '@/config/brand';

/**
 * Icônes de l'application générées depuis la configuration de marque :
 * SVG (navigateurs récents) et PNG (installation Android et iOS).
 */
const PNG: Record<string, { size: number; maskable: boolean }> = {
  'icon-192.png': { size: 192, maskable: false },
  'icon-512.png': { size: 512, maskable: false },
  'icon-maskable-512.png': { size: 512, maskable: true },
  'apple-touch-icon.png': { size: 180, maskable: true },
};

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (file === 'icon.svg' || file === 'icon-maskable.svg') {
    return new Response(brandIconSvg({ maskable: file === 'icon-maskable.svg' }), {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' },
    });
  }
  const png = PNG[file];
  if (!png) return new Response('Not found', { status: 404 });
  const src = `data:image/svg+xml;base64,${Buffer.from(brandIconSvg({ maskable: png.maskable })).toString('base64')}`;
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    (<img src={src} width={png.size} height={png.size} alt="" />),
    { width: png.size, height: png.size, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}

export function generateStaticParams() {
  return ['icon.svg', 'icon-maskable.svg', ...Object.keys(PNG)].map((file) => ({ file }));
}
