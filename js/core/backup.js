// Sauvegarde : export / import JSON (photos et documents en base64).
import * as db from './db.js';
import { convertTacheV1 } from './model.js';
import { today } from './dates.js';

export const FORMAT = 2;
const BINARY_FIELDS = { photos: ['data', 'thumb'], documents: ['data'], equipements: ['couverture'] };

export function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64ToBuf(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

/** Construit le fichier de sauvegarde par morceaux (évite une chaîne géante en mémoire). */
export async function buildBackup(logementCourant) {
  const parts = [`{"application":"carnet-maison","format":${FORMAT},"exporteLe":${JSON.stringify(new Date().toISOString())},"logementCourant":${JSON.stringify(logementCourant)},"data":{`];
  const counts = {};
  for (const [i, store] of db.DATA_STORES.entries()) {
    const rows = await db.all(store);
    counts[store] = rows.length;
    parts.push(`${i ? ',' : ''}${JSON.stringify(store)}:[`);
    rows.forEach((r, j) => {
      const out = { ...r };
      for (const f of BINARY_FIELDS[store] || []) if (out[f]) out[f] = bufToB64(out[f]);
      parts.push((j ? ',' : '') + JSON.stringify(out));
    });
    parts.push(']');
  }
  parts.push('}}');
  const blob = new Blob(parts, { type: 'application/json' });
  return { blob, name: `carnet-maison-${today()}.json`, counts };
}

/** Lit et valide un fichier de sauvegarde (formats 1 et 2). */
export async function readBackup(file) {
  let payload;
  try { payload = JSON.parse(await file.text()); }
  catch { throw new Error('Fichier illisible (ce n\'est pas un JSON valide).'); }
  if (payload?.application !== 'carnet-maison' || !payload.data) throw new Error("Ce fichier n'est pas une sauvegarde Carnet Maison.");
  if ((payload.format || 1) > FORMAT) throw new Error("Cette sauvegarde vient d'une version plus récente de l'application. Mettez l'application à jour.");
  const data = {};
  for (const s of db.DATA_STORES) data[s] = Array.isArray(payload.data[s]) ? payload.data[s].filter(x => x && typeof x.id === 'string') : [];
  for (const [store, fields] of Object.entries(BINARY_FIELDS)) {
    data[store] = data[store].map(r => {
      const out = { ...r };
      for (const f of fields) if (typeof out[f] === 'string') out[f] = b64ToBuf(out[f]);
      return out;
    });
  }
  if ((payload.format || 1) === 1) {
    const taches = [], inter = [];
    for (const t of data.taches) { const c = convertTacheV1(t, db.uid); taches.push(c.tache); inter.push(...c.interventions); }
    data.taches = taches; data.interventions = inter;
    for (const p of data.photos) { p.createdAt = p.createdAt || p.ajouteLe || Date.now(); delete p.ajouteLe; }
  }
  return { data, exporteLe: Date.parse(payload.exporteLe) || null, logementCourant: payload.logementCourant || null };
}

export async function restore({ data, exporteLe, logementCourant }) {
  await db.replaceAll(data);
  if (logementCourant && data.logements.some(l => l.id === logementCourant)) await db.setMeta('logementCourant', logementCourant);
  await db.setMeta('accueilFait', true);
  await db.setMeta('miniaturesOK', false);
  await db.setMeta('derniereSauvegarde', exporteLe || Date.now());
}
