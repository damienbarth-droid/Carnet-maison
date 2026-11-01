// Accès IndexedDB minimaliste, sans dépendance.
const DB_NAME = 'carnet-maison';
const DB_VERSION = 1;
export const DATA_STORES = ['logements', 'pieces', 'equipements', 'taches', 'photos'];

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of DATA_STORES) {
          if (!db.objectStoreNames.contains(name)) {
            const os = db.createObjectStore(name, { keyPath: 'id' });
            os.createIndex('logementId', 'logementId');
          }
        }
        const photos = req.transaction.objectStore('photos');
        if (!photos.indexNames.contains('equipementId')) photos.createIndex('equipementId', 'equipementId');
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
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
export const del = (store, id) => run([store], 'readwrite', t => t.objectStore(store).delete(id));
export const all = (store) => run([store], 'readonly', t => t.objectStore(store).getAll());
export const byIndex = (store, index, value) =>
  run([store], 'readonly', t => t.objectStore(store).index(index).getAll(value));

/** Applique plusieurs écritures dans une seule transaction. ops: [{store, put?, del?}] */
export function batch(ops) {
  const stores = [...new Set(ops.map(o => o.store))];
  if (!stores.length) return Promise.resolve();
  return run(stores, 'readwrite', t => {
    for (const o of ops) {
      const os = t.objectStore(o.store);
      if (o.del !== undefined) os.delete(o.del); else os.put(o.put);
    }
  });
}

/** Remplace tout le contenu (import d'une sauvegarde). */
export function replaceAll(data) {
  return run([...DATA_STORES], 'readwrite', t => {
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
