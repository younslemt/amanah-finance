/**
 * Encodage de l'état de démonstration pour le navigateur : JSON compressé (deflate),
 * base64url, préfixé par la version. Décodage borné (protection contre un contenu géant)
 * puis validé par le schéma : un contenu illisible ou altéré n'est jamais utilisé.
 */
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { DEMO_STATE_VERSION, parseDemoState, type DemoState } from './demo-state.ts';

const PREFIX = `v${DEMO_STATE_VERSION}.`;
/** Taille maximale d'un morceau de cookie (marge sous la limite de 4 096 octets). */
export const CHUNK_SIZE = 3_500;
/** Nombre maximal de morceaux : l'ensemble reste sous les limites d'en-têtes des serveurs. */
export const MAX_CHUNKS = 3;
const MAX_INFLATED = 256 * 1024;

export function encodeDemoState(s: DemoState): string {
  return PREFIX + deflateRawSync(Buffer.from(JSON.stringify(s), 'utf8'), { level: 9 }).toString('base64url');
}

export type Decoded = { state: DemoState; status: 'ok' } | { state: null; status: 'empty' | 'corrupted' | 'outdated' };

export function decodeDemoState(raw: string | null | undefined): Decoded {
  if (!raw) return { state: null, status: 'empty' };
  if (!raw.startsWith(PREFIX)) return { state: null, status: /^v\d+\./.test(raw) ? 'outdated' : 'corrupted' };
  try {
    const json = inflateRawSync(Buffer.from(raw.slice(PREFIX.length), 'base64url'), { maxOutputLength: MAX_INFLATED }).toString('utf8');
    const state = parseDemoState(JSON.parse(json));
    return state ? { state, status: 'ok' } : { state: null, status: 'corrupted' };
  } catch {
    return { state: null, status: 'corrupted' };
  }
}

/** Découpe en morceaux de cookie ; null si l'état dépasse la place disponible. */
export function toChunks(encoded: string): string[] | null {
  const chunks: string[] = [];
  for (let i = 0; i < encoded.length; i += CHUNK_SIZE) chunks.push(encoded.slice(i, i + CHUNK_SIZE));
  return chunks.length <= MAX_CHUNKS ? chunks : null;
}
