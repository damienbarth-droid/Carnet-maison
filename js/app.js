import * as db from './db.js';

/* ============================================================
   Utilitaires
   ============================================================ */
const $ = (sel, root = document) => root.querySelector(sel);
const main = $('#main');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : Date.now().toString(36) + Math.random().toString(36).slice(2));

const pad = n => String(n).padStart(2, '0');
const toStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => toStr(new Date());
const daysFrom = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return toStr(d); };

const UNITS = {
  jours: ['jour', 'jours'],
  semaines: ['semaine', 'semaines'],
  mois: ['mois', 'mois'],
  ans: ['an', 'ans'],
};

function addFreq(s, n, unit) {
  const d = parseDate(s);
  if (unit === 'jours') d.setDate(d.getDate() + n);
  else if (unit === 'semaines') d.setDate(d.getDate() + 7 * n);
  else {
    const months = unit === 'mois' ? n : 12 * n;
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
  }
  return toStr(d);
}

const fmtDate = s => s ? parseDate(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
const fmtFreq = (n, u) => {
  const debut = u === 'semaines' ? 'Toutes les' : 'Tous les';
  return n > 1 ? `${debut} ${n} ${UNITS[u]?.[1] ?? u}` : `${debut} ${UNITS[u]?.[1] ?? u}`;
};
const fmtNum = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseNum = v => { const n = parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g, '')); return Number.isFinite(n) ? n : null; };
const surface = p => (p.longueur != null && p.largeur != null) ? Math.round(p.longueur * p.largeur * 100) / 100 : null;

function relDays(n) {
  if (n === 0) return "aujourd'hui";
  if (n === 1) return 'demain';
  if (n === -1) return 'hier';
  return n > 0 ? `dans ${n} jours` : `il y a ${-n} jours`;
}

function prochaine(t) {
  return t.derniere ? addFreq(t.derniere, t.freqN, t.freqUnit) : null;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2600);
}

function setTitle(title, back = null) {
  $('#title').textContent = title;
  const b = $('#back');
  b.hidden = !back;
  b.dataset.href = back || '';
  document.title = title === 'Carnet Maison' ? title : `${title} · Carnet Maison`;
}

function setNav(section) {
  document.querySelectorAll('.tabbar a').forEach(a => {
    a.classList.toggle('active', a.dataset.section === section);
    if (a.dataset.section === section) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

const go = (hash) => { location.hash = hash; };

/* ============================================================
   Données
   ============================================================ */
let LOGEMENT_ID = null;

async function ensureLogement() {
  LOGEMENT_ID = await db.getMeta('logementCourant');
  if (LOGEMENT_ID && await db.get('logements', LOGEMENT_ID)) return;
  const existants = await db.all('logements');
  if (existants.length) {
    LOGEMENT_ID = existants[0].id;
  } else {
    LOGEMENT_ID = uid();
    await db.put('logements', { id: LOGEMENT_ID, nom: 'Maison', creeLe: Date.now() });
  }
  await db.setMeta('logementCourant', LOGEMENT_ID);
}

const list = async (store) => (await db.byIndex(store, 'logementId', LOGEMENT_ID));
const byName = (a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });

/* ============================================================
   Photos
   ============================================================ */
const MAX_PX = 1280;

async function resizeImage(file) {
  let source, w, h;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    w = source.width; h = source.height;
  } catch {
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image illisible'));
      img.src = URL.createObjectURL(file);
    });
    w = source.naturalWidth; h = source.naturalHeight;
  }
  const scale = Math.min(1, MAX_PX / Math.max(w, h));
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(source, 0, 0, cw, ch);
  if (source.close) source.close();
  if (source.src) URL.revokeObjectURL(source.src);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
  if (!blob) throw new Error('Conversion impossible');
  return { type: 'image/jpeg', data: await blob.arrayBuffer(), width: cw, height: ch };
}

let objectUrls = [];
function photoUrl(p) {
  const url = URL.createObjectURL(new Blob([p.data], { type: p.type || 'image/jpeg' }));
  objectUrls.push(url);
  return url;
}
function releaseUrls() { objectUrls.forEach(u => URL.revokeObjectURL(u)); objectUrls = []; }

function showPhoto(src) {
  const ov = $('#viewer');
  $('img', ov).src = src;
  ov.hidden = false;
}

/* ============================================================
   Routeur
   ============================================================ */
const routes = [
  [/^$/, renderAccueil],
  [/^pieces$/, renderPieces],
  [/^pieces\/(new|[\w-]+)$/, renderPieceForm],
  [/^equipements$/, renderEquipements],
  [/^equipements\/(new|[\w-]+)$/, renderEquipementForm],
  [/^entretien$/, renderEntretien],
  [/^entretien\/(new|[\w-]+)$/, renderTacheForm],
  [/^sauvegarde$/, renderSauvegarde],
  [/^bienvenue$/, renderBienvenue],
];

async function router() {
  const path = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('?')[0];
  releaseUrls();
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      try { await fn(...m.slice(1)); }
      catch (e) { console.error(e); main.innerHTML = `<p class="empty">Erreur : ${esc(e.message)}</p>`; }
      window.scrollTo(0, 0);
      return;
    }
  }
  go('#/');
}

/* ============================================================
   Accueil
   ============================================================ */
function tacheCard(t, equipements, opts = {}) {
  const next = prochaine(t);
  const eq = t.equipementId && equipements.find(e => e.id === t.equipementId);
  let when;
  if (!next) when = 'Jamais faite : indiquez la dernière date';
  else {
    const d = daysFrom(today(), next);
    when = `${d < 0 ? 'Prévue le' : 'Le'} ${fmtDate(next)} (${relDays(d)})`;
  }
  return `
    <article class="card ${opts.late ? 'card-late' : ''}">
      <a class="card-main" href="#/entretien/${esc(t.id)}">
        <strong>${esc(t.nom)}</strong>
        ${eq ? `<span class="muted">${esc(eq.nom)}</span>` : ''}
        <span class="${opts.late ? 'late-text' : 'muted'}">${esc(when)}</span>
        <span class="muted small">${esc(fmtFreq(t.freqN, t.freqUnit))}</span>
      </a>
      <button class="btn btn-done" data-action="done" data-id="${esc(t.id)}">✓ Fait aujourd'hui</button>
    </article>`;
}

async function renderAccueil() {
  setTitle('Carnet Maison');
  setNav('accueil');
  const [taches, equipements, lastBackup] = await Promise.all([
    list('taches'), list('equipements'), db.getMeta('derniereSauvegarde'),
  ]);
  const t0 = today();
  const limite = addDays(t0, 30);
  const enRetard = [], aFaire = [];
  for (const t of taches) {
    const n = prochaine(t);
    if (!n) aFaire.push(t);
    else if (n < t0) enRetard.push(t);
    else if (n <= limite) aFaire.push(t);
  }
  const sortNext = (a, b) => (prochaine(a) || '0000').localeCompare(prochaine(b) || '0000');
  enRetard.sort(sortNext); aFaire.sort(sortNext);

  const limGar = addDays(t0, 60);
  const garanties = equipements
    .filter(e => e.finGarantie && e.finGarantie >= t0 && e.finGarantie <= limGar)
    .sort((a, b) => a.finGarantie.localeCompare(b.finGarantie));

  let backupHtml;
  if (!lastBackup) {
    backupHtml = `<a class="banner banner-alert" href="#/sauvegarde">⚠️ Aucune sauvegarde pour l'instant. Touchez ici pour exporter vos données.</a>`;
  } else {
    const jours = Math.floor((Date.now() - lastBackup) / 86400000);
    const txt = jours === 0 ? "Dernière sauvegarde aujourd'hui" : `Dernière sauvegarde il y a ${jours} jour${jours > 1 ? 's' : ''}`;
    backupHtml = jours > 30
      ? `<a class="banner banner-alert" href="#/sauvegarde">⚠️ ${txt}. Pensez à exporter vos données.</a>`
      : `<a class="banner" href="#/sauvegarde">💾 ${txt}</a>`;
  }

  main.innerHTML = `
    ${backupHtml}

    <section>
      <h2 class="h-late">En retard <span class="count">${enRetard.length}</span></h2>
      ${enRetard.length ? enRetard.map(t => tacheCard(t, equipements, { late: true })).join('') : '<p class="empty">Rien en retard 👍</p>'}
    </section>

    <section>
      <h2>À faire dans les 30 jours <span class="count">${aFaire.length}</span></h2>
      ${aFaire.length ? aFaire.map(t => tacheCard(t, equipements)).join('') : '<p class="empty">Rien de prévu dans les 30 jours.</p>'}
    </section>

    <section>
      <h2>Garanties qui expirent (60 jours) <span class="count">${garanties.length}</span></h2>
      ${garanties.length ? garanties.map(e => `
        <a class="card card-link card-warn" href="#/equipements/${esc(e.id)}">
          <strong>${esc(e.nom)}</strong>
          <span class="muted">Fin de garantie le ${fmtDate(e.finGarantie)} (${relDays(daysFrom(t0, e.finGarantie))})</span>
        </a>`).join('') : '<p class="empty">Aucune garantie n\'expire bientôt.</p>'}
    </section>

    <section>
      <h2>Accès rapide</h2>
      <div class="quick">
        <a class="quick-btn" href="#/pieces"><span aria-hidden="true">🚪</span>Pièces</a>
        <a class="quick-btn" href="#/equipements"><span aria-hidden="true">🔧</span>Équipements</a>
        <a class="quick-btn" href="#/entretien"><span aria-hidden="true">📅</span>Entretien</a>
      </div>
    </section>`;
}

async function markDone(id) {
  const t = await db.get('taches', id);
  if (!t) return;
  const d = today();
  t.historique = t.historique || [];
  if (!t.historique.includes(d)) t.historique.push(d);
  t.historique.sort();
  t.derniere = d;
  t.majLe = Date.now();
  await db.put('taches', t);
  toast(`« ${t.nom} » notée comme faite. Prochaine : ${fmtDate(prochaine(t))}`);
  router();
}

/* ============================================================
   Pièces
   ============================================================ */
async function renderPieces() {
  setTitle('Pièces');
  setNav('pieces');
  const pieces = (await list('pieces')).sort(byName);
  const total = pieces.reduce((s, p) => s + (surface(p) || 0), 0);
  main.innerHTML = `
    <a class="btn btn-primary btn-block" href="#/pieces/new">＋ Ajouter une pièce</a>
    ${pieces.length ? `<p class="muted">Surface totale : <strong>${fmtNum(total)} m²</strong></p>` : ''}
    ${pieces.length ? pieces.map(p => {
      const s = surface(p);
      return `<a class="card card-link" href="#/pieces/${esc(p.id)}">
        <strong>${esc(p.nom)}</strong>
        <span class="muted">${s != null ? fmtNum(s) + ' m²' : 'Dimensions non renseignées'}${p.hauteur != null ? ` · h ${fmtNum(p.hauteur)} m` : ''}</span>
      </a>`;
    }).join('') : '<p class="empty">Aucune pièce. Commencez par en ajouter une.</p>'}`;
}

async function renderPieceForm(id) {
  const isNew = id === 'new';
  const p = isNew ? { nom: '', longueur: null, largeur: null, hauteur: null, notes: '' } : await db.get('pieces', id);
  if (!p) return go('#/pieces');
  setTitle(isNew ? 'Nouvelle pièce' : p.nom, '#/pieces');
  setNav('pieces');
  const num = v => v != null ? String(v).replace('.', ',') : '';
  main.innerHTML = `
    <form id="f" class="form" autocomplete="off">
      <label>Nom *<input name="nom" required value="${esc(p.nom)}" placeholder="Ex. Salon"></label>
      <div class="row3">
        <label>Longueur (m)<input name="longueur" inputmode="decimal" value="${num(p.longueur)}" placeholder="0,00"></label>
        <label>Largeur (m)<input name="largeur" inputmode="decimal" value="${num(p.largeur)}" placeholder="0,00"></label>
        <label>Hauteur (m)<input name="hauteur" inputmode="decimal" value="${num(p.hauteur)}" placeholder="0,00"></label>
      </div>
      <p class="surface">Surface : <strong id="surf">—</strong></p>
      <label>Notes<textarea name="notes" rows="4">${esc(p.notes)}</textarea></label>
      <button class="btn btn-primary btn-block" type="submit">Enregistrer</button>
      ${isNew ? '' : '<button class="btn btn-danger btn-block" type="button" id="del">Supprimer la pièce</button>'}
    </form>`;
  const f = $('#f');
  const upd = () => {
    const s = surface({ longueur: parseNum(f.longueur.value), largeur: parseNum(f.largeur.value) });
    $('#surf').textContent = s != null ? `${fmtNum(s)} m²` : '—';
  };
  f.addEventListener('input', upd); upd();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const rec = {
      ...p,
      id: isNew ? uid() : p.id,
      logementId: p.logementId || LOGEMENT_ID,
      nom: f.nom.value.trim(),
      longueur: parseNum(f.longueur.value),
      largeur: parseNum(f.largeur.value),
      hauteur: parseNum(f.hauteur.value),
      notes: f.notes.value.trim(),
      majLe: Date.now(),
    };
    if (!rec.nom) return;
    await db.put('pieces', rec);
    toast('Pièce enregistrée');
    go('#/pieces');
  });
  $('#del')?.addEventListener('click', async () => {
    const eqs = (await list('equipements')).filter(e => e.pieceId === p.id);
    const msg = eqs.length
      ? `Supprimer « ${p.nom} » ? ${eqs.length} équipement(s) n'auront plus de pièce associée.`
      : `Supprimer « ${p.nom} » ?`;
    if (!confirm(msg)) return;
    await db.batch([
      { store: 'pieces', del: p.id },
      ...eqs.map(e => ({ store: 'equipements', put: { ...e, pieceId: null } })),
    ]);
    toast('Pièce supprimée');
    go('#/pieces');
  });
}

/* ============================================================
   Équipements
   ============================================================ */
async function renderEquipements() {
  setTitle('Équipements');
  setNav('equipements');
  const [eqs, pieces] = await Promise.all([list('equipements'), list('pieces')]);
  const pieceNom = id => pieces.find(p => p.id === id)?.nom;
  const t0 = today();
  eqs.sort(byName);
  main.innerHTML = `
    <a class="btn btn-primary btn-block" href="#/equipements/new">＋ Ajouter un équipement</a>
    ${eqs.length ? eqs.map(e => {
      const garantie = e.finGarantie
        ? (e.finGarantie < t0 ? 'Garantie expirée' : `Garantie jusqu'au ${fmtDate(e.finGarantie)}`)
        : '';
      return `<a class="card card-link" href="#/equipements/${esc(e.id)}">
        <strong>${esc(e.nom)}</strong>
        <span class="muted">${esc([pieceNom(e.pieceId), e.marque].filter(Boolean).join(' · ') || '—')}</span>
        ${garantie ? `<span class="muted small">${esc(garantie)}</span>` : ''}
      </a>`;
    }).join('') : '<p class="empty">Aucun équipement enregistré.</p>'}`;
}

async function renderEquipementForm(id) {
  const isNew = id === 'new';
  const e = isNew ? { nom: '', pieceId: null, marque: '', installation: '', finGarantie: '', notes: '' } : await db.get('equipements', id);
  if (!e) return go('#/equipements');
  setTitle(isNew ? 'Nouvel équipement' : e.nom, '#/equipements');
  setNav('equipements');
  const pieces = (await list('pieces')).sort(byName);
  const existing = isNew ? [] : await db.byIndex('photos', 'equipementId', e.id);
  existing.sort((a, b) => (a.ajouteLe || 0) - (b.ajouteLe || 0));
  const added = [];      // { id, type, data }
  const removed = new Set();
  const taches = isNew ? [] : (await list('taches')).filter(t => t.equipementId === e.id);

  main.innerHTML = `
    <form id="f" class="form" autocomplete="off">
      <label>Nom *<input name="nom" required value="${esc(e.nom)}" placeholder="Ex. Chaudière"></label>
      <label>Pièce
        <select name="pieceId">
          <option value="">— Aucune —</option>
          ${pieces.map(p => `<option value="${esc(p.id)}" ${p.id === e.pieceId ? 'selected' : ''}>${esc(p.nom)}</option>`).join('')}
        </select>
      </label>
      ${pieces.length ? '' : '<p class="muted small">Astuce : créez d\'abord vos pièces dans l\'onglet Pièces.</p>'}
      <label>Marque / modèle<input name="marque" value="${esc(e.marque)}"></label>
      <div class="row2">
        <label>Date d'installation<input type="date" name="installation" value="${esc(e.installation)}"></label>
        <label>Fin de garantie<input type="date" name="finGarantie" value="${esc(e.finGarantie)}"></label>
      </div>
      <fieldset>
        <legend>Photos</legend>
        <div id="photos" class="photos"></div>
        <label class="btn btn-secondary btn-block file-btn">📷 Ajouter des photos
          <input type="file" id="file" accept="image/*" multiple hidden>
        </label>
      </fieldset>
      <label>Notes<textarea name="notes" rows="4">${esc(e.notes)}</textarea></label>
      <button class="btn btn-primary btn-block" type="submit">Enregistrer</button>
      ${isNew ? '' : `
        ${taches.length ? `<p class="muted">Tâches d'entretien liées : ${taches.map(t => `<a href="#/entretien/${esc(t.id)}">${esc(t.nom)}</a>`).join(', ')}</p>` : ''}
        <a class="btn btn-secondary btn-block" href="#/entretien/new?equipement=${esc(e.id)}">＋ Tâche d'entretien pour cet équipement</a>
        <button class="btn btn-danger btn-block" type="button" id="del">Supprimer l'équipement</button>`}
    </form>`;

  const box = $('#photos');
  const drawPhotos = () => {
    const shown = [...existing.filter(p => !removed.has(p.id)), ...added];
    box.innerHTML = shown.length ? shown.map(p => `
      <div class="thumb">
        <img src="${photoUrl(p)}" alt="Photo" data-action="view">
        <button type="button" class="thumb-del" data-remove="${esc(p.id)}" aria-label="Retirer la photo">✕</button>
      </div>`).join('') : '<p class="muted small">Aucune photo.</p>';
  };
  drawPhotos();
  box.addEventListener('click', ev => {
    const r = ev.target.closest('[data-remove]');
    if (r) {
      const pid = r.dataset.remove;
      const i = added.findIndex(p => p.id === pid);
      if (i >= 0) added.splice(i, 1); else removed.add(pid);
      drawPhotos();
    }
  });
  $('#file').addEventListener('change', async ev => {
    const files = [...ev.target.files];
    ev.target.value = '';
    if (!files.length) return;
    toast('Traitement des photos…');
    for (const file of files) {
      try { added.push({ id: uid(), ...(await resizeImage(file)) }); }
      catch (err) { toast(`Photo ignorée : ${err.message}`); }
    }
    drawPhotos();
  });

  const f = $('#f');
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const rec = {
      ...e,
      id: isNew ? uid() : e.id,
      logementId: e.logementId || LOGEMENT_ID,
      nom: f.nom.value.trim(),
      pieceId: f.pieceId.value || null,
      marque: f.marque.value.trim(),
      installation: f.installation.value,
      finGarantie: f.finGarantie.value,
      notes: f.notes.value.trim(),
      majLe: Date.now(),
    };
    if (!rec.nom) return;
    const now = Date.now();
    await db.batch([
      { store: 'equipements', put: rec },
      ...[...removed].map(pid => ({ store: 'photos', del: pid })),
      ...added.map((p, i) => ({ store: 'photos', put: { ...p, equipementId: rec.id, logementId: rec.logementId, ajouteLe: now + i } })),
    ]);
    toast('Équipement enregistré');
    go('#/equipements');
  });

  $('#del')?.addEventListener('click', async () => {
    if (!confirm(`Supprimer « ${e.nom} » et ses photos ?${taches.length ? ' Les tâches liées seront conservées sans équipement.' : ''}`)) return;
    await db.batch([
      { store: 'equipements', del: e.id },
      ...existing.map(p => ({ store: 'photos', del: p.id })),
      ...taches.map(t => ({ store: 'taches', put: { ...t, equipementId: null } })),
    ]);
    toast('Équipement supprimé');
    go('#/equipements');
  });
}

/* ============================================================
   Entretien
   ============================================================ */
async function renderEntretien() {
  setTitle('Entretien');
  setNav('entretien');
  const [taches, equipements] = await Promise.all([list('taches'), list('equipements')]);
  const t0 = today();
  taches.sort((a, b) => (prochaine(a) || '0000').localeCompare(prochaine(b) || '0000'));
  main.innerHTML = `
    <a class="btn btn-primary btn-block" href="#/entretien/new">＋ Ajouter une tâche</a>
    ${taches.length ? taches.map(t => tacheCard(t, equipements, { late: prochaine(t) && prochaine(t) < t0 })).join('')
      : `<p class="empty">Aucune tâche d'entretien.</p>
         <a class="btn btn-secondary btn-block" href="#/bienvenue">Voir les tâches suggérées</a>`}`;
}

async function renderTacheForm(id) {
  const isNew = id === 'new';
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const t = isNew
    ? { nom: '', equipementId: params.get('equipement') || null, freqN: 1, freqUnit: 'ans', derniere: '', historique: [], notes: '' }
    : await db.get('taches', id);
  if (!t) return go('#/entretien');
  setTitle(isNew ? 'Nouvelle tâche' : t.nom, '#/entretien');
  setNav('entretien');
  const eqs = (await list('equipements')).sort(byName);
  const hist = [...(t.historique || [])].sort().reverse();
  const next = prochaine(t);

  main.innerHTML = `
    ${isNew ? '' : `
      <div class="next-box ${next && next < today() ? 'next-late' : ''}">
        <span>Prochaine échéance</span>
        <strong>${next ? fmtDate(next) : 'À définir'}</strong>
        ${next ? `<span>${relDays(daysFrom(today(), next))}</span>` : '<span>Indiquez la dernière date faite</span>'}
      </div>
      <button class="btn btn-done btn-block" type="button" data-action="done" data-id="${esc(t.id)}">✓ Fait aujourd'hui</button>`}
    <form id="f" class="form" autocomplete="off">
      <label>Tâche *<input name="nom" required value="${esc(t.nom)}" placeholder="Ex. Purger les radiateurs"></label>
      <label>Équipement lié (optionnel)
        <select name="equipementId">
          <option value="">— Aucun —</option>
          ${eqs.map(e => `<option value="${esc(e.id)}" ${e.id === t.equipementId ? 'selected' : ''}>${esc(e.nom)}</option>`).join('')}
        </select>
      </label>
      <label>Fréquence</label>
      <div class="row2 freq">
        <input name="freqN" type="number" min="1" step="1" inputmode="numeric" required value="${esc(t.freqN)}" aria-label="Nombre">
        <select name="freqUnit" aria-label="Unité">
          ${Object.keys(UNITS).map(u => `<option value="${u}" ${u === t.freqUnit ? 'selected' : ''}>${u}</option>`).join('')}
        </select>
      </div>
      <label>Dernière date faite<input type="date" name="derniere" value="${esc(t.derniere || '')}" max="${today()}"></label>
      <p class="surface">Prochaine échéance : <strong id="nextPreview">—</strong></p>
      <label>Notes<textarea name="notes" rows="3">${esc(t.notes)}</textarea></label>
      <button class="btn btn-primary btn-block" type="submit">Enregistrer</button>
    </form>
    ${isNew ? '' : `
      <section>
        <h2>Historique des réalisations <span class="count">${hist.length}</span></h2>
        ${hist.length ? `<ul class="history">${hist.map(d => `<li><span>${fmtDate(d)}</span><button type="button" class="link-btn" data-hist="${d}" aria-label="Retirer cette date">Retirer</button></li>`).join('')}</ul>`
          : '<p class="empty">Pas encore de réalisation enregistrée.</p>'}
      </section>
      <button class="btn btn-danger btn-block" type="button" id="del">Supprimer la tâche</button>`}`;

  const f = $('#f');
  const upd = () => {
    const n = parseInt(f.freqN.value, 10);
    const d = f.derniere.value;
    $('#nextPreview').textContent = (d && n > 0) ? fmtDate(addFreq(d, n, f.freqUnit.value)) : '—';
  };
  f.addEventListener('input', upd); f.addEventListener('change', upd); upd();

  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const n = parseInt(f.freqN.value, 10);
    if (!(n > 0)) return toast('Fréquence invalide');
    const derniere = f.derniere.value || null;
    const historique = [...(t.historique || [])];
    const rec = {
      ...t,
      id: isNew ? uid() : t.id,
      logementId: t.logementId || LOGEMENT_ID,
      nom: f.nom.value.trim(),
      equipementId: f.equipementId.value || null,
      freqN: n,
      freqUnit: f.freqUnit.value,
      derniere,
      historique,
      notes: f.notes.value.trim(),
      majLe: Date.now(),
    };
    if (!rec.nom) return;
    await db.put('taches', rec);
    toast('Tâche enregistrée');
    go('#/entretien');
  });

  main.querySelectorAll('[data-hist]').forEach(b => b.addEventListener('click', async () => {
    const d = b.dataset.hist;
    if (!confirm(`Retirer la réalisation du ${fmtDate(d)} de l'historique ?`)) return;
    const cur = await db.get('taches', t.id);
    cur.historique = (cur.historique || []).filter(x => x !== d);
    if (cur.derniere === d) cur.derniere = cur.historique.length ? [...cur.historique].sort().pop() : null;
    await db.put('taches', cur);
    router();
  }));

  $('#del')?.addEventListener('click', async () => {
    if (!confirm(`Supprimer la tâche « ${t.nom} » et son historique ?`)) return;
    await db.del('taches', t.id);
    toast('Tâche supprimée');
    go('#/entretien');
  });
}

/* ============================================================
   Premier lancement : tâches suggérées
   ============================================================ */
const SUGGESTIONS = [
  { nom: 'Entretien chaudière', freqN: 1, freqUnit: 'ans' },
  { nom: 'Ramonage', freqN: 1, freqUnit: 'ans' },
  { nom: 'Nettoyage bouches VMC', freqN: 3, freqUnit: 'mois' },
  { nom: 'Nettoyage gouttières', freqN: 1, freqUnit: 'ans' },
  { nom: 'Test détecteur de fumée', freqN: 6, freqUnit: 'mois' },
];

async function renderBienvenue() {
  setTitle('Bienvenue');
  setNav('');
  const existantes = new Set((await list('taches')).map(t => t.nom.toLowerCase()));
  const dispo = SUGGESTIONS.filter(s => !existantes.has(s.nom.toLowerCase()));
  main.innerHTML = `
    <div class="intro">
      <p><strong>Carnet Maison</strong> garde la mémoire de votre logement : pièces, équipements et entretien.</p>
      <p class="muted small">Vos données restent sur ce téléphone. Pensez à exporter une sauvegarde régulièrement.</p>
    </div>
    <form id="f" class="form">
      <h2>Tâches d'entretien suggérées</h2>
      ${dispo.length ? `<p class="muted">Cochez celles qui vous concernent :</p>
      ${dispo.map((s, i) => `
        <label class="check">
          <input type="checkbox" name="s" value="${i}" checked>
          <span><strong>${esc(s.nom)}</strong><br><span class="muted small">${esc(fmtFreq(s.freqN, s.freqUnit))}</span></span>
        </label>`).join('')}` : '<p class="empty">Toutes les tâches suggérées sont déjà ajoutées.</p>'}
      ${dispo.length ? '<button class="btn btn-primary btn-block" type="submit">Ajouter les tâches cochées</button>' : ''}
      <button class="btn btn-secondary btn-block" type="button" id="skip">${dispo.length ? 'Passer' : 'Retour'}</button>
    </form>
    <a class="btn btn-secondary btn-block" href="#/sauvegarde">⬆️ J'ai déjà une sauvegarde : la restaurer</a>`;
  const finish = async () => { await db.setMeta('accueilFait', true); go('#/'); };
  $('#skip').addEventListener('click', finish);
  $('#f').addEventListener('submit', async ev => {
    ev.preventDefault();
    const choisis = [...ev.target.querySelectorAll('input[name=s]:checked')].map(c => dispo[+c.value]);
    await db.batch(choisis.map(s => ({
      store: 'taches',
      put: { id: uid(), logementId: LOGEMENT_ID, ...s, equipementId: null, derniere: null, historique: [], notes: '', majLe: Date.now() },
    })));
    if (choisis.length) toast(`${choisis.length} tâche(s) ajoutée(s). Indiquez leur dernière date de réalisation.`);
    finish();
  });
}

/* ============================================================
   Sauvegarde : export / import
   ============================================================ */
function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBuf(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

async function exporter() {
  const data = {};
  for (const s of db.DATA_STORES) data[s] = await db.all(s);
  data.photos = data.photos.map(p => ({ ...p, data: bufToB64(p.data) }));
  const payload = {
    application: 'carnet-maison',
    format: 1,
    exporteLe: new Date().toISOString(),
    logementCourant: LOGEMENT_ID,
    data,
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const name = `carnet-maison-${today()}.json`;
  const file = new File([blob], name, { type: 'application/json' });

  let ok = false;
  if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ files: [file], title: 'Sauvegarde Carnet Maison' }); ok = true; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  if (!ok) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  await db.setMeta('derniereSauvegarde', Date.now());
  toast('Sauvegarde exportée');
  router();
}

async function importer(file) {
  let payload;
  try { payload = JSON.parse(await file.text()); }
  catch { return toast('Fichier illisible (JSON invalide)'); }
  if (payload?.application !== 'carnet-maison' || !payload.data) return toast("Ce fichier n'est pas une sauvegarde Carnet Maison");
  const d = payload.data;
  const counts = `${(d.pieces || []).length} pièce(s), ${(d.equipements || []).length} équipement(s), ${(d.taches || []).length} tâche(s), ${(d.photos || []).length} photo(s)`;
  if (!confirm(`Importer cette sauvegarde (${counts}) ?\n\nToutes les données actuelles de l'application seront remplacées.`)) return;
  const data = {};
  for (const s of db.DATA_STORES) data[s] = Array.isArray(d[s]) ? d[s].filter(x => x && x.id) : [];
  data.photos = data.photos.map(p => ({ ...p, data: typeof p.data === 'string' ? b64ToBuf(p.data) : p.data }));
  await db.replaceAll(data);
  if (payload.logementCourant) await db.setMeta('logementCourant', payload.logementCourant);
  await db.setMeta('accueilFait', true);
  await db.setMeta('derniereSauvegarde', Date.parse(payload.exporteLe) || Date.now());
  await ensureLogement();
  toast('Sauvegarde importée');
  go('#/');
}

async function renderSauvegarde() {
  setTitle('Sauvegarde', '#/');
  setNav('');
  const [last, persisted, estimate] = await Promise.all([
    db.getMeta('derniereSauvegarde'),
    navigator.storage?.persisted ? navigator.storage.persisted() : Promise.resolve(null),
    navigator.storage?.estimate ? navigator.storage.estimate() : Promise.resolve(null),
  ]);
  const jours = last ? Math.floor((Date.now() - last) / 86400000) : null;
  main.innerHTML = `
    <div class="intro">
      <p>${last ? `Dernière sauvegarde : <strong>${new Date(last).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</strong> (${jours === 0 ? "aujourd'hui" : `il y a ${jours} jour${jours > 1 ? 's' : ''}`})` : '<strong>Aucune sauvegarde effectuée.</strong>'}</p>
      <p class="muted small">Le fichier exporté contient toutes vos données, photos comprises. Gardez-le en lieu sûr (cloud, ordinateur, e-mail…).</p>
    </div>
    <button class="btn btn-primary btn-block" id="exp">⬇️ Exporter une sauvegarde</button>
    <label class="btn btn-secondary btn-block file-btn">⬆️ Importer une sauvegarde
      <input type="file" id="imp" accept="application/json,.json" hidden>
    </label>
    <section>
      <h2>Stockage</h2>
      <p class="muted">Stockage persistant : <strong>${persisted === null ? 'non pris en charge' : persisted ? 'accordé ✓' : 'non accordé'}</strong></p>
      ${persisted === false ? '<p class="muted small">Le navigateur pourrait effacer les données en cas de manque de place. Installer l\'application sur l\'écran d\'accueil aide à obtenir ce droit.</p><button class="btn btn-secondary btn-block" id="persist">Demander le stockage persistant</button>' : ''}
      ${estimate ? `<p class="muted small">Espace utilisé : ${(estimate.usage / 1048576).toFixed(1).replace('.', ',')} Mo</p>` : ''}
    </section>`;
  $('#exp').addEventListener('click', () => exporter().catch(e => toast(`Erreur : ${e.message}`)));
  $('#imp').addEventListener('change', ev => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (f) importer(f).catch(e => toast(`Erreur : ${e.message}`));
  });
  $('#persist')?.addEventListener('click', async () => {
    const ok = await navigator.storage.persist();
    toast(ok ? 'Stockage persistant accordé' : 'Refusé par le navigateur pour le moment');
    router();
  });
}

/* ============================================================
   Démarrage
   ============================================================ */
document.addEventListener('click', ev => {
  const done = ev.target.closest('[data-action="done"]');
  if (done) { ev.preventDefault(); markDone(done.dataset.id); return; }
  const img = ev.target.closest('img[data-action="view"]');
  if (img) { showPhoto(img.src); return; }
});
$('#back').addEventListener('click', () => go($('#back').dataset.href || '#/'));
$('#viewer').addEventListener('click', () => { $('#viewer').hidden = true; });

async function start() {
  if (!('indexedDB' in window)) {
    main.innerHTML = '<p class="empty">Ce navigateur ne permet pas le stockage local.</p>';
    return;
  }
  await ensureLogement();
  if (navigator.storage?.persist) {
    navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => {});
  }
  window.addEventListener('hashchange', router);
  if (!(await db.getMeta('accueilFait'))) {
    const h = location.hash.replace(/^#\/?/, '');
    if (!h) { go('#/bienvenue'); return; }
  }
  router();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.error));
}

start().catch(e => { console.error(e); main.innerHTML = `<p class="empty">Erreur au démarrage : ${esc(e.message)}</p>`; });
