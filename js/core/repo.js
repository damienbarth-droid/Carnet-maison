// Accès aux données du logement courant + opérations métier.
import * as db from './db.js';
import { taskStatus } from './model.js';
import { today } from './dates.js';

export const uid = db.uid;
let current = null;
export const logementId = () => current;

export async function ensureLogement() {
  current = await db.getMeta('logementCourant');
  if (current && await db.get('logements', current)) return current;
  const existants = (await db.all('logements')).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  if (existants.length) current = existants[0].id;
  else {
    current = uid();
    const now = Date.now();
    await db.put('logements', { id: current, nom: 'Maison', createdAt: now, updatedAt: now });
  }
  await db.setMeta('logementCourant', current);
  return current;
}

export async function switchLogement(id) {
  current = id;
  await db.setMeta('logementCourant', id);
}

export const list = (store) => db.byIndex(store, 'logementId', current);
export const get = (store, id) => db.get(store, id);
export const logements = async () => (await db.all('logements')).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

/** Prépare un enregistrement (id, horodatage, logement). */
export function stamp(rec) {
  const now = Date.now();
  return { ...rec, id: rec.id || uid(), logementId: rec.logementId || current, createdAt: rec.createdAt || now, updatedAt: now };
}
export const save = (store, rec) => { const r = stamp(rec); return db.put(store, r).then(() => r); };
export const batch = db.batch;

const byName = (a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr', { sensitivity: 'base' });

/** Instantané des données légères du logement courant (sans photos ni documents). */
export async function snapshot() {
  const [pieces, equipements, taches, interventions, contacts, logement] = await Promise.all([
    list('pieces'), list('equipements'), list('taches'), list('interventions'), list('contacts'), db.get('logements', current),
  ]);
  const ref = today();
  const status = new Map(taches.map(t => [t.id, taskStatus(t, interventions, ref)]));
  pieces.sort(byName); equipements.sort(byName); contacts.sort(byName);
  taches.sort((a, b) => {
    const sa = status.get(a.id), sb = status.get(b.id);
    return (sa.next || '9999').localeCompare(sb.next || '9999') || byName(a, b);
  });
  interventions.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  return { logement, pieces, equipements, taches, interventions, contacts, status };
}

/** Enregistre une réalisation. Renvoie une fonction d'annulation. */
export async function markDone(tacheId, { date = today(), cout = null, contactId = null, note = '' } = {}) {
  const t = await db.get('taches', tacheId);
  if (!t) return null;
  const inter = stamp({ tacheId, equipementId: t.equipementId || null, date, cout, contactId, note, logementId: t.logementId });
  const before = { ...t };
  await db.batch([
    { store: 'interventions', put: inter },
    { store: 'taches', put: { ...t, reporteAu: null, updatedAt: Date.now() } },
  ]);
  return async () => db.batch([
    { store: 'interventions', del: inter.id },
    { store: 'taches', put: { ...before, updatedAt: Date.now() } },
  ]);
}

/** Supprime un logement et toutes ses données. */
export async function deleteLogement(id) {
  const ops = [{ store: 'logements', del: id }];
  for (const s of ['pieces', 'equipements', 'taches', 'interventions', 'photos', 'documents', 'contacts']) {
    const rows = await db.byIndex(s, 'logementId', id);
    rows.forEach(r => ops.push({ store: s, del: r.id }));
  }
  await db.batch(ops);
}

export const getMeta = db.getMeta;
export const setMeta = db.setMeta;
