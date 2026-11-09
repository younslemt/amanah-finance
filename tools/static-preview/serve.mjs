// Serveur de l'aperçu statique. Applique les en-têtes de sécurité définis dans apps/web/next.config.ts.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.argv[2] ?? join(here, 'dist'));
const port = Number(process.env.PORT ?? 3000);
process.env.NODE_ENV = 'production';
const config = (await import(pathToFileURL(resolve(here, '../../apps/web/next.config.ts')).href)).default;
const headerRules = await config.headers();
const security = Object.fromEntries(headerRules[0].headers.map((h) => [h.key, h.value]));

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/') { res.writeHead(307, { Location: '/dashboard', ...security }); return res.end(); }
  let file = join(root, url.pathname);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404, security); return res.end('Not found'); }
  const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html; charset=utf-8';
  res.writeHead(200, { 'Content-Type': type, ...security });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`aperçu sur http://localhost:${port}`));
