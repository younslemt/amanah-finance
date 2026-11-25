import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

// Hébergement public (Netlify fixe NETLIFY=true pendant la compilation) : uniquement la
// démonstration, sans aucune variable Supabase. Toute autre configuration fait échouer le build.
const hosted = process.env.NETLIFY === 'true' || process.env.DEMO_ACCESS_REQUIRED === 'true';
if (hosted) {
  if (process.env.NEXT_PUBLIC_APP_MODE !== 'demo') throw new Error('Hébergement public : NEXT_PUBLIC_APP_MODE doit valoir « demo ». Le mode réel n’est jamais déployé ici.');
  const leaked = Object.keys(process.env).filter((k) => /SUPABASE|ENABLE_BANKING/i.test(k));
  if (leaked.length) throw new Error(`Hébergement public : variables interdites présentes (${leaked.join(', ')}).`);
}
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

// CSP : 'unsafe-inline' sur les scripts est temporaire (Sprint 1 : nonce via middleware).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${supabase}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Lu par le middleware : un build hébergé exige toujours le mot de passe d'accès (refus sinon)
  env: { AMANAH_HOSTED_BUILD: hosted ? 'true' : 'false' },
  transpilePackages: ['@amanah/engines', '@amanah/banking'],
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Le service worker doit toujours être revalidé (mise à jour immédiate des règles de cache)
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Content-Type', value: 'application/javascript; charset=utf-8' }] },
    ];
  },
};

export default nextConfig;
