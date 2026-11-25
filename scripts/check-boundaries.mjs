// Vérifie les règles de dépendance de l'architecture (exécuté en CI).
//  1. packages/engines : aucun import externe, aucune lecture d'horloge ni d'aléatoire.
//  2. packages/banking : n'importe que @amanah/engines (et node:crypto pour le seul connecteur
//     Enable Banking, exécuté côté serveur).
//  4. Le connecteur bancaire (clé privée, jetons) n'est jamais importé par un composant client.
//  3. Aucun paquet n'importe apps/web.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
});
const imports = (src) => [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
const errors = [];

for (const f of files(join(root, 'packages/engines/src'))) {
  const src = readFileSync(f, 'utf8');
  for (const i of imports(src)) if (!i.startsWith('.')) errors.push(`${f} : import externe interdit « ${i} »`);
  if (/Date\.now\(|new Date\(\)|Math\.random\(/.test(src)) errors.push(`${f} : horloge ou aléatoire interdits dans un moteur`);
}
for (const f of files(join(root, 'packages/banking/src'))) {
  for (const i of imports(readFileSync(f, 'utf8'))) {
    const serverConnector = f.endsWith('/enable-banking.ts') && i === 'node:crypto';
    if (!i.startsWith('.') && i !== '@amanah/engines' && !serverConnector) errors.push(`${f} : dépendance non autorisée « ${i} »`);
  }
}
for (const pkg of ['engines', 'banking']) {
  for (const f of files(join(root, 'packages', pkg))) {
    if (/apps\/web|@amanah\/web/.test(readFileSync(f, 'utf8'))) errors.push(`${f} : un paquet ne doit pas dépendre de l'application`);
  }
}

for (const f of files(join(root, "apps/web/src"))) {
  const src = readFileSync(f, 'utf8');
  const sensitive = imports(src).filter((i) => i.includes('enable-banking') || i.includes('banking/bank-sync'));
  if (sensitive.length && /^\s*['"]use client['"]/.test(src)) errors.push(`${f} : composant client important le connecteur bancaire`);
  if (imports(src).includes('@amanah/banking/enable-banking') && !f.includes('/lib/banking/')) errors.push(`${f} : le connecteur Enable Banking ne s'utilise que via lib/banking`);
}
// Fichiers .tsx aussi
const tsx = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? tsx(p) : p.endsWith('.tsx') ? [p] : []; });
for (const f of tsx(join(root, 'apps/web/src'))) {
  const src = readFileSync(f, 'utf8');
  if (/^\s*['"]use client['"]/.test(src) && imports(src).some((i) => i.includes('enable-banking') || i.includes('banking/bank-sync'))) errors.push(`${f} : composant client important le connecteur bancaire`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Règles de dépendance respectées.');
