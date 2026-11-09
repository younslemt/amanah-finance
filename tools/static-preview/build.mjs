// Construit un aperçu statique de apps/web en mode démo, sans Next.js.
// Usage : node tools/static-preview/build.mjs [dossier de sortie]
import { build } from 'esbuild';
import { compile } from 'tailwindcss';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '../../apps/web');
const out = resolve(process.argv[2] ?? join(here, 'dist'));
const nodePaths = (process.env.PREVIEW_NODE_PATH ?? '').split(':').filter(Boolean);
const stubs = (f) => join(here, 'stubs', f);
mkdirSync(out, { recursive: true });

// 1. Rendu serveur des pages
await build({
  entryPoints: [join(here, 'render-entry.tsx')],
  bundle: true, platform: 'node', format: 'esm', target: 'node22', jsx: 'automatic',
  outfile: join(out, '.render.mjs'), nodePaths, logLevel: 'warning',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  define: { 'process.env.NEXT_PUBLIC_APP_MODE': '"demo"', 'process.env.NODE_ENV': '"production"' },
  alias: {
    '@': join(web, 'src'),
    'next/link': stubs('next-link.tsx'), 'next/navigation': stubs('next-navigation.ts'),
    'next/font/google': stubs('next-font.ts'), 'next/headers': stubs('next-headers.ts'),
    'next/server': stubs('next-server.ts'), 'server-only': stubs('empty.ts'), '@supabase/ssr': stubs('supabase-ssr.ts'),
  },
  loader: { '.css': 'empty' },
});
const { PAGES, renderPage } = await import(pathToFileURL(join(out, '.render.mjs')).href);
const classes = new Set();
for (const p of PAGES) {
  const html = await renderPage(p);
  for (const m of html.matchAll(/class="([^"]*)"/g)) m[1].split(/\s+/).forEach((c) => c && classes.add(c));
  const dir = join(out, p.path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  console.log(`rendu ${p.path} (${html.length} octets)`);
}

// 2. CSS Tailwind 4 à partir des classes effectivement utilisées
const require = createRequire(join(nodePaths[0] ?? web, 'x.js'));
const twDir = dirname(require.resolve('tailwindcss/package.json'));
const compiler = await compile(readFileSync(join(web, 'src/app/globals.css'), 'utf8'), {
  base: web,
  loadStylesheet: async (id, base) => {
    const file = id === 'tailwindcss' ? join(twDir, 'index.css') : resolve(base, id);
    return { path: file, base: dirname(file), content: readFileSync(file, 'utf8') };
  },
});
const css = compiler.build([...classes]);
writeFileSync(join(out, 'styles.css'), css);
console.log(`styles.css : ${classes.size} classes, ${css.length} octets`);

// 3. Icônes générées par la configuration de marque (comme la route /icons/[file])
const { brandIconSvg } = await import(pathToFileURL(join(out, '.render.mjs')).href);
mkdirSync(join(out, 'icons'), { recursive: true });
writeFileSync(join(out, 'icons/icon.svg'), brandIconSvg());
writeFileSync(join(out, 'icons/icon-maskable.svg'), brandIconSvg({ maskable: true }));
