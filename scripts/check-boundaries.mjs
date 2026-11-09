// Vérifie les règles de dépendance de l'architecture (exécuté en CI).
//  1. packages/engines : aucun import externe, aucune lecture d'horloge ni d'aléatoire.
//  2. packages/banking : n'importe que @amanah/engines.
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
    if (!i.startsWith('.') && i !== '@amanah/engines') errors.push(`${f} : dépendance non autorisée « ${i} »`);
  }
}
for (const pkg of ['engines', 'banking']) {
  for (const f of files(join(root, 'packages', pkg))) {
    if (/apps\/web|@amanah\/web/.test(readFileSync(f, 'utf8'))) errors.push(`${f} : un paquet ne doit pas dépendre de l'application`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Règles de dépendance respectées.');
