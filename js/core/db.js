// Accès IndexedDB, sans dépendance. Version 2 : interventions, documents, artisans, journal des suppressions.
import { convertTacheV1 } from './model.js';

const DB_NAME = 'carnet-maison';
const DB_VERSION = 2;

/** Magasins exportés dans la sauvegarde. */
export const DATA_STORES = ['logements', 'pieces', 'equipements', 'taches', 'interventions', 'photos', 'documents', 'contacts'];

export const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));

let dbPromise;

function upgrade(db, tx, oldVersion) {
  for (const name of DATA_STORES) {
    if (!db.objectStoreNames.contains(name)) {
      const os = db.createObjectStore(name, { keyPath: 'id' });
      if (name !== 'logements') os.createIndex('logementId', 'logementId');
    }
  }
  const idx = (store, name) => { const os = tx.objectStore(store); if (!os.indexNames.contains(name)) os.createIndex(name, name); };
  idx('photos', 'equipementId');
  idx('documents', 'equipementId');
  idx('interventions', 'tacheId');
  if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
  // Journal des suppressions : prépare une future synchronisation entre appareils.
  if (!db.objectStoreNames.contains('suppressions')) db.createObjectStore('suppressions', { keyPath: 'id' });

  if (oldVersion === 1) {
    // Migration V0.1 → V0.2 : l'historique des tâches devient des interventions.
    const taches = tx.objectStore('taches');
    taches.openCursor().onsuccess = ev => {
      const cur = ev.target.result;
      if (!cur) return;
      const { tache, interventions } = convertTacheV1(cur.value, uid);
      cur.update(tache);
      const inter = tx.objectStore('interventions');
      interventions.forEach(i => inter.put(i));
      cur.continue();
    };
    for (const name of ['pieces', 'equipements', 'logements', 'photos']) {
      tx.objectStore(name).openCursor().onsuccess = ev => {
        const cur = ev.target.result;
        if (!cur) return;
        const v = cur.value;
        const t = v.majLe || v.creeLe || v.ajouteLe || Date.now();
        const { majLe, creeLe, ajouteLe, ...rest } = v;
        cur.update({ ...rest, createdAt: rest.createdAt || t, updatedAt: rest.updatedAt || t });
        cur.continue();
      };
    }
  }
}

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = ev => upgrade(req.result, req.transaction, ev.oldVersion);
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); location.reload(); };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("Fermez les autres onglets de l'application puis réessayez."));
    });
  }
  return dbPromise;
}

function run(storeNames, mode, work) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    let result;
    const out = work(t);
    if (out && 'onsuccess' in out) out.onsuccess = () => { result = out.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction annulée'));
  }));
}

export const get = (store, id) => run([store], 'readonly', t => t.objectStore(store).get(id));
export const put = (store, value) => run([store], 'readwrite', t => t.objectStore(store).put(value));
export const all = (store) => run([store], 'readonly', t => t.objectStore(store).getAll());
export const byIndex = (store, index, value) => run([store], 'readonly', t => t.objectStore(store).index(index).getAll(value));

/** Plusieurs écritures dans une seule transaction. ops : [{ store, put } | { store, del }] */
export function batch(ops) {
  const stores = [...new Set(ops.map(o => o.store).concat(ops.some(o => o.del !== undefined) ? ['suppressions'] : []))];
  if (!ops.length) return Promise.resolve();
  const now = Date.now();
  return run(stores, 'readwrite', t => {
    for (const o of ops) {
      const os = t.objectStore(o.store);
      if (o.del !== undefined) {
        os.delete(o.del);
        t.objectStore('suppressions').put({ id: `${o.store}:${o.del}`, store: o.store, recordId: o.del, at: now });
      } else os.put(o.put);
    }
  });
}

/** Remplace toutes les données (import d'une sauvegarde). */
export function replaceAll(data) {
  return run([...DATA_STORES, 'suppressions'], 'readwrite', t => {
    t.objectStore('suppressions').clear();
    for (const name of DATA_STORES) {
      const os = t.objectStore(name);
      os.clear();
      for (const item of data[name] || []) os.put(item);
    }
  });
}

export async function getMeta(key, fallback = null) {
  const row = await get('meta', key);
  return row ? row.value : fallback;
}
export const setMeta = (key, value) => put('meta', { key, value });
