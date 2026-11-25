// Serveur Enable Banking SIMULÉ pour la CI (aucune donnée réelle, aucune connexion externe).
// Reproduit les routes publiques de l'API (référence : enablebanking.com/docs/api/latest) :
// GET /aspsps, POST /auth, POST /sessions, GET|DELETE /sessions/{id},
// GET /accounts/{uid}/details|balances|transactions ; plus une « banque » qui simule
// l'authentification forte (boutons Autoriser / Refuser), comme le Mock ASPSP de la sandbox.
// Chaque requête d'API doit porter un JWT RS256 valide signé par la clé de l'application.
//   node fake-enable-banking.mjs <port> <chemin de la clé publique PEM> <identifiant d'application>
import { createServer } from 'node:http';
import { createVerify, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [port = '4010', publicKeyPath, appId] = process.argv.slice(2);
const publicKey = readFileSync(publicKeyPath, 'utf8');
const auths = new Map(); // authorization_id -> { state, redirect_url, aspsp }
const codes = new Map(); // code -> authorization_id
const sessions = new Map(); // session_id -> { status }
let calls = [];
let expired = false; // levé par /__expirer, effacé à la création d'une nouvelle session

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function jwtOk(req) {
  const t = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  const [h, p, s] = t.split('.');
  if (!h || !p || !s) return false;
  const header = JSON.parse(b64(h).toString());
  const payload = JSON.parse(b64(p).toString());
  const v = createVerify('RSA-SHA256'); v.update(`${h}.${p}`);
  const now = Math.floor(Date.now() / 1000);
  return v.verify(publicKey, b64(s)) && header.alg === 'RS256' && header.kid === appId
    && payload.iss === 'enablebanking.com' && payload.aud === 'api.enablebanking.com' && payload.exp > now && payload.exp - payload.iat <= 86400;
}

const today = new Date();
// Dates du mois en cours (le budget affiche le mois courant) : jamais avant le 1er du mois
const monthStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
const day = (n) => new Date(Math.max(monthStart, today.getTime() - n * 86400000)).toISOString().slice(0, 10);
const TX = {
  'acc-courant': [
    { entry_reference: 'eb-1', transaction_amount: { amount: '2450.00', currency: 'EUR' }, credit_debit_indicator: 'CRDT', status: 'BOOK', booking_date: day(20), remittance_information: ['SALAIRE EMPLOYEUR FICTIF'], debtor: { name: 'Employeur Fictif SA' } },
    { entry_reference: 'eb-2', transaction_amount: { amount: '850.00', currency: 'EUR' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: day(18), remittance_information: ['LOYER FICTIF'], creditor: { name: 'Propriétaire Fictif' }, creditor_account: { iban: 'BE68539007547034' } },
    { entry_reference: 'eb-3', transaction_amount: { amount: '64.35', currency: 'EUR' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: day(10), remittance_information: ['DELHAIZE FICTIF'], creditor: { name: 'Delhaize' } },
    { entry_reference: 'eb-4', transaction_amount: { amount: '12.00', currency: 'EUR' }, credit_debit_indicator: 'DBIT', status: 'PDNG', booking_date: day(1), remittance_information: ['EN ATTENTE FICTIF'] },
  ],
  'acc-epargne': [
    { entry_reference: 'eb-5', transaction_amount: { amount: '3.21', currency: 'EUR' }, credit_debit_indicator: 'CRDT', status: 'BOOK', booking_date: day(5), remittance_information: ['INTERETS CREDITEURS COMPTE EPARGNE'] },
  ],
};
const BAL = { 'acc-courant': '1535.65', 'acc-epargne': '5003.21' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  let body = '';
  for await (const chunk of req) body += chunk;

  // Commandes de pilotage du test (expiration forcée), hors API
  if (url.pathname === '/__expirer') { expired = true; for (const s of sessions.values()) s.status = 'EXPIRED'; return json(res, 200, { ok: true }); }
  if (url.pathname === '/__appels') return json(res, 200, calls);

  // « Banque » simulée : l'utilisateur autorise ou refuse (aucun identifiant demandé)
  if (url.pathname === '/banque-simulee') {
    const a = auths.get(url.searchParams.get('auth'));
    if (!a) { res.writeHead(404); return res.end('inconnu'); }
    if (url.searchParams.get('choix')) {
      const back = new URL(a.redirect_url);
      back.searchParams.set('state', a.state);
      if (url.searchParams.get('choix') === 'autoriser') {
        const code = randomBytes(12).toString('hex');
        codes.set(code, url.searchParams.get('auth'));
        back.searchParams.set('code', code);
      } else back.searchParams.set('error', 'access_denied');
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width"><title>Banque simulée</title>
      <h1>Banque simulée (${a.aspsp.name})</h1><p>Authentification forte simulée : aucune donnée réelle.</p>
      <a href="?auth=${url.searchParams.get('auth')}&choix=autoriser">Autoriser l’accès</a> · <a href="?auth=${url.searchParams.get('auth')}&choix=refuser">Refuser</a></html>`);
  }

  if (!jwtOk(req)) return json(res, 401, { message: 'JWT invalide', error: 'UNAUTHORIZED' });
  calls.push(`${req.method} ${url.pathname}`);
  const parts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'GET' && url.pathname === '/aspsps') {
    return json(res, 200, { aspsps: [
      { name: 'Mock ASPSP', country: 'BE', psu_types: ['personal', 'business'], maximum_consent_validity: 15552000 },
      { name: 'Banque Fictive Belge', country: 'BE', bic: 'FICTBEBB', psu_types: ['personal'] },
    ] });
  }
  if (req.method === 'POST' && url.pathname === '/auth') {
    const b = JSON.parse(body);
    if (b.access?.balances !== true || b.access?.transactions !== true || !b.access?.valid_until || !b.state || !b.redirect_url) return json(res, 422, { message: 'requête invalide', error: 'WRONG_REQUEST_PARAMETERS' });
    const id = randomBytes(8).toString('hex');
    auths.set(id, { state: b.state, redirect_url: b.redirect_url, aspsp: b.aspsp });
    return json(res, 200, { url: `http://localhost:${port}/banque-simulee?auth=${id}`, authorization_id: id });
  }
  if (req.method === 'POST' && url.pathname === '/sessions') {
    const { code } = JSON.parse(body);
    if (!codes.has(code)) return json(res, 422, { message: 'code inconnu', error: 'WRONG_AUTHORIZATION_CODE' });
    codes.delete(code); // usage unique
    expired = false;
    const id = `sess-${randomBytes(6).toString('hex')}`;
    sessions.set(id, { status: 'AUTHORIZED' });
    return json(res, 200, {
      session_id: id, access: { valid_until: new Date(Date.now() + 90 * 86400000).toISOString() },
      accounts: [
        { uid: 'acc-courant', account_id: { iban: 'BE71096123456769' }, name: 'Compte à vue fictif', currency: 'EUR', cash_account_type: 'CACC' },
        { uid: 'acc-epargne', account_id: { iban: 'BE10000000000404' }, name: 'Épargne fictive', currency: 'EUR', cash_account_type: 'SVGS' },
      ],
    });
  }
  if (parts[0] === 'sessions' && parts[1]) {
    const s = sessions.get(parts[1]);
    if (!s) return json(res, 404, { message: 'Session does not exist', error: 'SESSION_DOES_NOT_EXIST' });
    if (req.method === 'DELETE') { s.status = 'CLOSED'; return json(res, 200, { message: 'OK' }); }
    return json(res, 200, { status: s.status, accounts: ['acc-courant', 'acc-epargne'] });
  }
  if (parts[0] === 'accounts' && parts[1]) {
    if (expired) return json(res, 401, { message: 'Session is expired', error: 'EXPIRED_SESSION' });
    if (parts[2] === 'balances') return json(res, 200, { balances: [{ balance_type: 'CLBD', balance_amount: { amount: BAL[parts[1]] ?? '0.00', currency: 'EUR' } }] });
    if (parts[2] === 'details') return json(res, 200, { name: parts[1], currency: 'EUR', cash_account_type: 'CACC' });
    if (parts[2] === 'transactions') {
      const all = TX[parts[1]] ?? [];
      // Pagination par lots de 2, comme l'API (continuation_key)
      const start = Number(url.searchParams.get('continuation_key') ?? 0);
      const page = all.slice(start, start + 2);
      return json(res, 200, { transactions: page, continuation_key: start + 2 < all.length ? String(start + 2) : null });
    }
  }
  return json(res, 404, { message: 'introuvable', error: 'NOT_FOUND' });
}).listen(Number(port), () => console.log(`Enable Banking simulé sur ${port}`));
