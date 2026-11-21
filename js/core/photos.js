// Photos : redimensionnement (1280 px max, JPEG 0,8) et miniatures.
import * as db from './db.js';

export const MAX_PX = 1280;
export const THUMB_PX = 360;

async function decode(blob) {
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close && bmp.close() };
  } catch {
    const url = URL.createObjectURL(blob);
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image illisible'));
      i.src = url;
    });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  }
}

function render(dec, max, quality) {
  const scale = Math.min(1, max / Math.max(dec.w, dec.h));
  const w = Math.max(1, Math.round(dec.w * scale)), h = Math.max(1, Math.round(dec.h * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(dec.src, 0, 0, w, h);
  return new Promise((resolve, reject) => c.toBlob(b => b ? resolve({ blob: b, w, h }) : reject(new Error('Conversion impossible')), 'image/jpeg', quality));
}

/** Fichier image → { type, data, thumb, width, height } (ArrayBuffer, compatible Safari). */
export async function processImage(file) {
  const dec = await decode(file);
  try {
    const big = await render(dec, MAX_PX, 0.8);
    const small = await render(dec, THUMB_PX, 0.75);
    return { type: 'image/jpeg', data: await big.blob.arrayBuffer(), thumb: await small.blob.arrayBuffer(), width: big.w, height: big.h };
  } finally { dec.done(); }
}

const urls = new Set();
export function bufUrl(buf, type = 'image/jpeg') {
  if (!buf) return '';
  const u = URL.createObjectURL(new Blob([buf], { type }));
  urls.add(u);
  return u;
}
export function releaseUrls() { urls.forEach(u => URL.revokeObjectURL(u)); urls.clear(); }

/** Ajoute les miniatures manquantes (données V0.1) et la photo de couverture des équipements. Tâche de fond. */
export async function backfillThumbs() {
  if (await db.getMeta('miniaturesOK')) return;
  const photos = await db.all('photos');
  const firstByEq = new Map();
  for (const p of photos.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) {
    if (!p.thumb && p.data) {
      try {
        const dec = await decode(new Blob([p.data], { type: p.type || 'image/jpeg' }));
        const small = await render(dec, THUMB_PX, 0.75); dec.done();
        p.thumb = await small.blob.arrayBuffer();
        await db.put('photos', p);
      } catch { /* image illisible : ignorée */ }
    }
    if (p.thumb && !firstByEq.has(p.equipementId)) firstByEq.set(p.equipementId, p.thumb);
  }
  for (const [eqId, thumb] of firstByEq) {
    const e = await db.get('equipements', eqId);
    if (e && !e.couverture) await db.put('equipements', { ...e, couverture: thumb });
  }
  await db.setMeta('miniaturesOK', true);
}
