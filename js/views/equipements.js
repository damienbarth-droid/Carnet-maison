// Équipements : liste, fiche (photos, garantie, entretien, documents), formulaire.
import * as repo from '../core/repo.js';
import * as db from '../core/db.js';
import { processImage, bufUrl } from '../core/photos.js';
import { fmtDate, today, daysBetween } from '../core/dates.js';
import { warrantyStatus, fmtEur, norm } from '../core/model.js';
import { esc, emptyState, confirmSheet, toast, haptic, $, $$, bar, sheet } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { chrome, go, refresh } from '../ui/nav.js';
import { pageHead, infoRow, taskCard, wireTaskCards, interventionItem } from '../ui/components.js';

const MAX_DOC = 20 * 1024 * 1024;

function warrantyBadge(e) {
  const w = warrantyStatus(e);
  if (!w) return '';
  if (w.expired) return '<span class="pill pill-muted">Garantie expirée</span>';
  if (w.soon) return `<span class="pill pill-warn">Garantie : ${w.days} j</span>`;
  return '<span class="pill pill-ok">Sous garantie</span>';
}

export async function list({ root, query }) {
  chrome({ title: 'Équipements', tab: 'equipements', actions: [{ icon: 'plus', label: 'Ajouter un équipement', href: '#/equipements/nouveau' }] });
  const snap = await repo.snapshot();
  const filtre = query.get('filtre') || 'tous';
  const pieceNom = id => snap.pieces.find(p => p.id === id)?.nom;
  let eqs = snap.equipements;
  if (filtre === 'garantie') eqs = eqs.filter(e => warrantyStatus(e)?.soon);
  else if (filtre !== 'tous') eqs = eqs.filter(e => (e.pieceId || 'aucune') === filtre);
  const usedPieces = snap.pieces.filter(p => snap.equipements.some(e => e.pieceId === p.id));

  root.innerHTML = `
    ${pageHead('Équipements', snap.equipements.length ? `${snap.equipements.length} équipement${snap.equipements.length > 1 ? 's' : ''}` : '')}
    ${snap.equipements.length ? `
      <div class="seg h-scroll" role="tablist">
        <a class="seg-item ${filtre === 'tous' ? 'on' : ''}" href="#/equipements">Tous</a>
        <a class="seg-item ${filtre === 'garantie' ? 'on' : ''}" href="#/equipements?filtre=garantie">${icon('shield-check')}Garanties</a>
        ${usedPieces.map(p => `<a class="seg-item ${filtre === p.id ? 'on' : ''}" href="#/equipements?filtre=${esc(p.id)}">${esc(p.nom)}</a>`).join('')}
      </div>
      <div class="eq-grid stagger">
        ${eqs.map(e => `
          <a class="eq-card" href="#/equipements/${esc(e.id)}">
            <span class="eq-thumb">${e.couverture ? `<img src="${bufUrl(e.couverture)}" alt="" loading="lazy">` : icon('wrench')}</span>
            <span class="eq-txt">
              <strong>${esc(e.nom)}</strong>
              <small>${esc([pieceNom(e.pieceId), e.marque].filter(Boolean).join(' · ') || '—')}</small>
              ${warrantyBadge(e)}
            </span>
          </a>`).join('')}
      </div>
      ${eqs.length ? '' : '<p class="calm">Aucun équipement pour ce filtre.</p>'}`
    : emptyState({ iconName: 'wrench', title: 'Aucun équipement', text: 'Chaudière, VMC, ballon d’eau chaude, électroménager… Gardez marques, garanties et photos au même endroit.', action: `<a class="btn btn-primary" href="#/equipements/nouveau">${icon('plus')}Ajouter un équipement</a>` })}`;
}

export async function detail({ root, params: [id] }) {
  const e = await repo.get('equipements', id);
  if (!e) return go('#/equipements', { replace: true });
  chrome({ title: e.nom, back: '#/equipements', tab: 'equipements', actions: [{ icon: 'pencil-simple', label: 'Modifier', href: `#/equipements/${id}/modifier` }] });
  const [snap, photos, docs] = await Promise.all([
    repo.snapshot(), db.byIndex('photos', 'equipementId', id), db.byIndex('documents', 'equipementId', id),
  ]);
  photos.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  docs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const piece = snap.pieces.find(p => p.id === e.pieceId);
  const taches = snap.taches.filter(t => t.equipementId === id);
  const inters = snap.interventions.filter(i => i.equipementId === id);
  const spent = inters.reduce((s, i) => s + (i.cout || 0), 0);
  const w = warrantyStatus(e);

  root.innerHTML = `
    ${photos.length ? `
      <div class="gallery h-scroll ${photos.length === 1 ? 'single' : ''}">
        ${photos.map((p, i) => `<button class="gallery-item" data-view="${i}"><img src="${bufUrl(p.data, p.type)}" alt="Photo ${i + 1} de ${esc(e.nom)}"></button>`).join('')}
      </div>` : ''}
    ${pageHead(e.nom, esc([piece?.nom, e.marque].filter(Boolean).join(' · ')) || 'Équipement')}

    ${w ? `
      <div class="warranty-card ${w.expired ? 'expired' : w.soon ? 'soon' : 'ok'}">
        <div class="warranty-top">${icon('shield-check')}<strong>${w.expired ? 'Garantie expirée' : 'Sous garantie'}</strong>
          <span>${w.expired ? `depuis le ${fmtDate(e.finGarantie)}` : `jusqu’au ${fmtDate(e.finGarantie)}`}</span></div>
        ${w.progress != null ? bar(w.progress, w.expired ? 'muted' : w.soon ? 'warn' : 'ok') : ''}
        ${!w.expired ? `<small>${w.days === 0 ? "Expire aujourd'hui" : `Encore ${w.days} jour${w.days > 1 ? 's' : ''}`}</small>` : ''}
      </div>` : ''}

    <div class="card info-list">
      ${infoRow('door', 'Pièce', piece ? `<a href="#/pieces/${esc(piece.id)}">${esc(piece.nom)}</a>` : '')}
      ${infoRow('notepad', 'Marque / modèle', esc(e.marque))}
      ${infoRow('calendar-check', 'Installation', e.installation ? `${fmtDate(e.installation)} <small class="muted">(${Math.max(0, Math.floor(daysBetween(e.installation, today()) / 365.25))} an${Math.floor(daysBetween(e.installation, today()) / 365.25) > 1 ? 's' : ''})</small>` : '')}
      ${infoRow('currency-eur', 'Dépensé en entretien', spent ? fmtEur(spent) : '')}
      ${!piece && !e.marque && !e.installation && !spent ? '<p class="muted small" style="margin:0">Aucune information détaillée. Touchez le crayon pour compléter.</p>' : ''}
    </div>

    ${e.notes ? `<section class="section"><h2 class="section-title">Notes</h2><div class="card note">${esc(e.notes).replace(/\n/g, '<br>')}</div></section>` : ''}

    <section class="section">
      <h2 class="section-title">Entretien <span class="count">${taches.length}</span></h2>
      ${taches.length ? `<div class="stack">${taches.map(t => taskCard(t, snap.status.get(t.id), null)).join('')}</div>` : ''}
      <a class="btn btn-soft btn-block" href="#/entretien/nouveau?equipement=${esc(id)}">${icon('plus')}Ajouter une tâche d’entretien</a>
    </section>

    <section class="section">
      <h2 class="section-title">Documents <span class="count">${docs.length}</span></h2>
      ${docs.length ? `<div class="stack">${docs.map(d => `
        <div class="row-card doc" data-doc="${esc(d.id)}">
          <span class="row-ico tone-bg-accent">${icon(d.type === 'application/pdf' ? 'file-pdf' : d.type?.startsWith('image/') ? 'image' : 'file')}</span>
          <button class="row-txt linklike" data-open="${esc(d.id)}"><strong>${esc(d.nom)}</strong><small>${(d.taille / 1048576).toFixed(1).replace('.', ',')} Mo · ${fmtDate(new Date(d.createdAt).toISOString().slice(0, 10), { short: true })}</small></button>
          <button class="icon-btn" data-deldoc="${esc(d.id)}" aria-label="Supprimer ${esc(d.nom)}">${icon('trash')}</button>
        </div>`).join('')}</div>` : '<p class="section-help">Factures, notices, devis : retrouvez-les en un geste.</p>'}
      <label class="btn btn-soft btn-block file-btn">${icon('paperclip')}Joindre un document
        <input type="file" id="doc-input" accept="application/pdf,image/*,.pdf,.doc,.docx,.txt" multiple hidden>
      </label>
    </section>

    ${inters.length ? `
    <section class="section">
      <h2 class="section-title">Historique <span class="count">${inters.length}</span></h2>
      <ul class="timeline">${inters.map(i => interventionItem(i, snap)).join('')}</ul>
    </section>` : ''}`;

  wireTaskCards(root, snap);

  // Visionneuse
  $$('[data-view]', root).forEach(b => b.addEventListener('click', () => viewer(photos, +b.dataset.view)));

  // Documents
  $('#doc-input', root).addEventListener('change', async ev => {
    const files = [...ev.target.files]; ev.target.value = '';
    const ops = [];
    for (const f of files) {
      if (f.size > MAX_DOC) { toast(`« ${f.name} » dépasse 20 Mo`, { tone: 'late' }); continue; }
      ops.push({ store: 'documents', put: repo.stamp({ equipementId: id, nom: f.name, type: f.type || 'application/octet-stream', taille: f.size, data: await f.arrayBuffer() }) });
    }
    if (!ops.length) return;
    await repo.batch(ops);
    haptic(); toast(ops.length > 1 ? `${ops.length} documents ajoutés` : 'Document ajouté');
    refresh();
  });
  $$('[data-open]', root).forEach(b => b.addEventListener('click', () => {
    const d = docs.find(x => x.id === b.dataset.open);
    const url = URL.createObjectURL(new Blob([d.data], { type: d.type }));
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    if (!/^(application\/pdf|image\/)/.test(d.type)) a.download = d.nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }));
  $$('[data-deldoc]', root).forEach(b => b.addEventListener('click', async () => {
    const d = docs.find(x => x.id === b.dataset.deldoc);
    if (!await confirmSheet({ title: `Supprimer « ${d.nom} » ?`, confirm: 'Supprimer', danger: true })) return;
    await repo.batch([{ store: 'documents', del: d.id }]);
    toast('Document supprimé'); refresh();
  }));
}

/** Visionneuse plein écran avec défilement horizontal. */
function viewer(photos, start) {
  const ov = document.createElement('div');
  ov.className = 'viewer';
  ov.innerHTML = `<div class="viewer-track h-scroll">${photos.map(p => `<div class="viewer-slide"><img src="${bufUrl(p.data, p.type)}" alt=""></div>`).join('')}</div>
    <button class="viewer-close icon-btn" aria-label="Fermer">${icon('x')}</button>
    ${photos.length > 1 ? `<div class="viewer-count"><span>${start + 1}</span> / ${photos.length}</div>` : ''}`;
  document.body.appendChild(ov);
  const track = $('.viewer-track', ov);
  track.scrollLeft = start * track.clientWidth;
  track.addEventListener('scroll', () => { const c = $('.viewer-count span', ov); if (c) c.textContent = Math.round(track.scrollLeft / track.clientWidth) + 1; }, { passive: true });
  requestAnimationFrame(() => ov.classList.add('open'));
  const close = () => { ov.classList.remove('open'); document.removeEventListener('keydown', onKey); setTimeout(() => ov.remove(), 250); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  $('.viewer-close', ov).onclick = close;
  ov.addEventListener('click', e => { if (e.target.classList.contains('viewer-slide')) close(); });
}

export async function form({ root, params: [id], query }) {
  const isNew = !id;
  const e = isNew ? { nom: '', pieceId: query.get('piece') || null, marque: '', installation: '', finGarantie: '', notes: '' } : await repo.get('equipements', id);
  if (!e) return go('#/equipements', { replace: true });
  const parent = isNew ? '#/equipements' : `#/equipements/${id}`;
  chrome({ title: isNew ? 'Nouvel équipement' : 'Modifier', back: parent, tab: 'equipements' });
  const pieces = (await repo.list('pieces')).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const existing = isNew ? [] : await db.byIndex('photos', 'equipementId', id);
  existing.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const added = [];
  const removed = new Set();
  const usedNames = new Set((await repo.list('equipements')).map(x => norm(x.nom)));

  root.innerHTML = `
    ${pageHead(isNew ? 'Nouvel équipement' : 'Modifier l’équipement')}
    <form id="f" class="form" autocomplete="off" novalidate>
      <div class="photo-strip h-scroll" id="photos"></div>
      <label>Nom<input name="nom" required value="${esc(e.nom)}" placeholder="Ex. Chaudière gaz" ${isNew ? 'autofocus' : ''} list="eq-suggest"></label>
      <datalist id="eq-suggest">${['Chaudière', 'Pompe à chaleur', 'VMC', 'Ballon d’eau chaude', 'Climatisation', 'Poêle à bois', 'Adoucisseur', 'Lave-linge', 'Lave-vaisselle', 'Réfrigérateur', 'Four', 'Plaque de cuisson', 'Hotte', 'Portail motorisé', 'Volets roulants', 'Alarme', 'Tableau électrique', 'Détecteur de fumée'].filter(n => !usedNames.has(norm(n))).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <label>Pièce
        <select name="pieceId">
          <option value="">— Aucune —</option>
          ${pieces.map(p => `<option value="${esc(p.id)}" ${p.id === e.pieceId ? 'selected' : ''}>${esc(p.nom)}</option>`).join('')}
        </select>
      </label>
      <label>Marque / modèle<input name="marque" value="${esc(e.marque)}" placeholder="Ex. Saunier Duval ThemaPlus"></label>
      <div class="row2">
        <label>Installation<input type="date" name="installation" value="${esc(e.installation)}"></label>
        <label>Fin de garantie<input type="date" name="finGarantie" value="${esc(e.finGarantie)}"></label>
      </div>
      <div class="chips" id="garantie-chips">
        <span class="chips-label">Garantie</span>
        <button type="button" class="chip" data-g="2">2 ans</button>
        <button type="button" class="chip" data-g="5">5 ans</button>
        <button type="button" class="chip" data-g="10">10 ans</button>
      </div>
      <label>Notes<textarea name="notes" rows="4" placeholder="Numéro de série, réglages, contrat d’entretien…">${esc(e.notes)}</textarea></label>
      <div class="form-actions">
        <button class="btn btn-primary btn-block" type="submit">${icon('check')}Enregistrer</button>
        ${isNew ? '' : `<button class="btn btn-danger btn-block" type="button" id="del">${icon('trash')}Supprimer l’équipement</button>`}
      </div>
    </form>`;

  const f = $('#f', root);
  const box = $('#photos', root);
  const draw = () => {
    const shown = [...existing.filter(p => !removed.has(p.id)), ...added];
    box.innerHTML = `
      <label class="photo-add file-btn" aria-label="Ajouter des photos">${icon('camera')}<span>Photo</span>
        <input type="file" id="file" accept="image/*" multiple hidden>
      </label>
      ${shown.map(p => `<div class="photo-thumb"><img src="${bufUrl(p.thumb || p.data, p.type)}" alt="">
        <button type="button" class="photo-del" data-remove="${esc(p.id)}" aria-label="Retirer la photo">${icon('x')}</button></div>`).join('')}`;
    $('#file', box).addEventListener('change', onFiles);
  };
  const onFiles = async ev => {
    const files = [...ev.target.files]; ev.target.value = '';
    if (!files.length) return;
    box.classList.add('busy');
    for (const file of files) {
      try { added.push({ id: repo.uid(), ...(await processImage(file)) }); }
      catch (err) { toast(`Photo ignorée : ${err.message}`, { tone: 'late' }); }
    }
    box.classList.remove('busy');
    haptic(); draw();
  };
  box.addEventListener('click', ev => {
    const r = ev.target.closest('[data-remove]');
    if (!r) return;
    const pid = r.dataset.remove;
    const i = added.findIndex(p => p.id === pid);
    if (i >= 0) added.splice(i, 1); else removed.add(pid);
    draw();
  });
  draw();

  $$('[data-g]', root).forEach(b => b.addEventListener('click', () => {
    const base = f.installation.value || today();
    const d = new Date(base); d.setFullYear(d.getFullYear() + Number(b.dataset.g));
    f.finGarantie.value = d.toISOString().slice(0, 10);
    haptic(8);
  }));

  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const nom = f.nom.value.trim();
    if (!nom) { f.nom.focus(); f.nom.classList.add('invalid'); toast('Indiquez un nom'); return; }
    const now = Date.now();
    const kept = existing.filter(p => !removed.has(p.id));
    const first = kept[0] || added[0];
    const rec = repo.stamp({
      ...e, nom, pieceId: f.pieceId.value || null, marque: f.marque.value.trim(),
      installation: f.installation.value, finGarantie: f.finGarantie.value, notes: f.notes.value.trim(),
      couverture: first ? first.thumb || null : null,
    });
    await repo.batch([
      { store: 'equipements', put: rec },
      ...[...removed].map(pid => ({ store: 'photos', del: pid })),
      ...added.map((p, i) => ({ store: 'photos', put: { ...p, equipementId: rec.id, logementId: rec.logementId, createdAt: now + i, updatedAt: now } })),
    ]);
    haptic(); toast('Équipement enregistré');
    go(`#/equipements/${rec.id}`, { replace: true });
  });

  $('#del', root)?.addEventListener('click', async () => {
    const taches = (await repo.list('taches')).filter(t => t.equipementId === e.id);
    const docs = await db.byIndex('documents', 'equipementId', e.id);
    const ok = await confirmSheet({
      title: `Supprimer « ${e.nom} » ?`,
      text: `Ses photos et documents seront supprimés.${taches.length ? ' Les tâches liées sont conservées.' : ''}`,
      confirm: 'Supprimer', danger: true,
    });
    if (!ok) return;
    await repo.batch([
      { store: 'equipements', del: e.id },
      ...existing.map(p => ({ store: 'photos', del: p.id })),
      ...docs.map(d => ({ store: 'documents', del: d.id })),
      ...taches.map(t => ({ store: 'taches', put: { ...t, equipementId: null, updatedAt: Date.now() } })),
    ]);
    toast('Équipement supprimé');
    go('#/equipements', { replace: true });
  });
}
