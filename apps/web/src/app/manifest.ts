import type { MetadataRoute } from 'next';
import { brand } from '@/config/brand';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.shortName,
    description: brand.description,
    start_url: '/dashboard',
    display: 'standalone',
    background_color: brand.colors.background,
    theme_color: brand.colors.primary900,
    lang: brand.locale,
    icons: [
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icons/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
