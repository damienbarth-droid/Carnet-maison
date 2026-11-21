// Pièces : liste, fiche, formulaire.
import * as repo from '../core/repo.js';
import { surface, fmtNum, parseNum } from '../core/model.js';
import { esc, emptyState, confirmSheet, toast, haptic, $ } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { chrome, go } from '../ui/nav.js';
import { pageHead, infoRow } from '../ui/components.js';

const m2 = s => s != null ? `${fmtNum(s)} m²` : '—';

export async function list({ root }) {
  chrome({ title: 'Pièces', tab: 'pieces', actions: [{ icon: 'plus', label: 'Ajouter une pièce', href: '#/pieces/nouveau' }] });
  const snap = await repo.snapshot();
  const total = snap.pieces.reduce((s, p) => s + (surface(p) || 0), 0);
  const count = id => snap.equipements.filter(e => e.pieceId === id).length;
  root.innerHTML = `
    ${pageHead('Pièces', snap.pieces.length ? `${snap.pieces.length} pièce${snap.pieces.length > 1 ? 's' : ''}` : '')}
    ${snap.pieces.length ? `
      <div class="stat-band">
        <div><span class="stat-big"><span data-count="${Math.round(total)}">0</span><small> m²</small></span><span class="stat-label">Surface totale</span></div>
        <div><span class="stat-big" data-count="${snap.equipements.length}">0</span><span class="stat-label">Équipements</span></div>
      </div>
      <div class="stack stagger">
        ${snap.pieces.map(p => `
          <a class="row-card" href="#/pieces/${esc(p.id)}">
            <span class="row-ico tone-bg-accent">${icon('door')}</span>
            <span class="row-txt"><strong>${esc(p.nom)}</strong>
              <small>${esc([surface(p) != null ? m2(surface(p)) : null, count(p.id) ? `${count(p.id)} équipement${count(p.id) > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ') || 'Dimensions à renseigner')}</small></span>
            ${icon('caret-right', 'caret')}
          </a>`).join('')}
      </div>
      <a class="btn btn-soft btn-block" href="#/pieces/nouveau">${icon('plus')}Ajouter une pièce</a>`
    : emptyState({ iconName: 'door', title: 'Aucune pièce', text: 'Ajoutez vos pièces pour y ranger vos équipements et connaître vos surfaces.', action: `<a class="btn btn-primary" href="#/pieces/nouveau">${icon('plus')}Ajouter une pièce</a>` })}`;
}

export async function detail({ root, params: [id] }) {
  const p = await repo.get('pieces', id);
  if (!p) return go('#/pieces', { replace: true });
  chrome({ title: p.nom, back: '#/pieces', tab: 'pieces', actions: [{ icon: 'pencil-simple', label: 'Modifier', href: `#/pieces/${id}/modifier` }] });
  const snap = await repo.snapshot();
  const eqs = snap.equipements.filter(e => e.pieceId === id);
  const s = surface(p);
  root.innerHTML = `
    ${pageHead(p.nom, 'Pièce')}
    <div class="measure-card">
      <div class="measure-main"><span class="stat-big">${s != null ? fmtNum(s) : '—'}<small> m²</small></span><span class="stat-label">Surface</span></div>
      <div class="measure-dims">
        <span>${icon('ruler')}L ${p.longueur != null ? fmtNum(p.longueur) : '—'} m</span>
        <span>${icon('ruler')}l ${p.largeur != null ? fmtNum(p.largeur) : '—'} m</span>
        <span>${icon('ruler')}h ${p.hauteur != null ? fmtNum(p.hauteur) : '—'} m</span>
      </div>
      ${s != null && p.hauteur != null ? `<span class="muted small">Volume ${fmtNum(s * p.hauteur)} m³</span>` : ''}
    </div>
    ${p.notes ? `<section class="section"><h2 class="section-title">Notes</h2><div class="card note">${esc(p.notes).replace(/\n/g, '<br>')}</div></section>` : ''}
    <section class="section">
      <h2 class="section-title">Équipements <span class="count">${eqs.length}</span></h2>
      ${eqs.length ? `<div class="stack">${eqs.map(e => `
        <a class="row-card" href="#/equipements/${esc(e.id)}">
          <span class="row-ico tone-bg-accent">${icon('wrench')}</span>
          <span class="row-txt"><strong>${esc(e.nom)}</strong><small>${esc(e.marque || '')}</small></span>${icon('caret-right', 'caret')}
        </a>`).join('')}</div>` : '<p class="calm">Aucun équipement dans cette pièce.</p>'}
      <a class="btn btn-soft btn-block" href="#/equipements/nouveau?piece=${esc(id)}">${icon('plus')}Ajouter un équipement ici</a>
    </section>`;
}

export async function form({ root, params: [id] }) {
  const isNew = !id;
  const p = isNew ? { nom: '', longueur: null, largeur: null, hauteur: null, notes: '' } : await repo.get('pieces', id);
  if (!p) return go('#/pieces', { replace: true });
  const parent = isNew ? '#/pieces' : `#/pieces/${id}`;
  chrome({ title: isNew ? 'Nouvelle pièce' : 'Modifier', back: parent, tab: 'pieces' });
  const num = v => v != null ? String(v).replace('.', ',') : '';
  root.innerHTML = `
    ${pageHead(isNew ? 'Nouvelle pièce' : 'Modifier la pièce')}
    <form id="f" class="form" autocomplete="off" novalidate>
      <label>Nom<input name="nom" required value="${esc(p.nom)}" placeholder="Ex. Salon" ${isNew ? 'autofocus' : ''} enterkeyhint="next"></label>
      <div class="row3">
        <label>Longueur<span class="suffix-wrap"><input name="longueur" inputmode="decimal" value="${num(p.longueur)}" placeholder="0,00"><i>m</i></span></label>
        <label>Largeur<span class="suffix-wrap"><input name="largeur" inputmode="decimal" value="${num(p.largeur)}" placeholder="0,00"><i>m</i></span></label>
        <label>Hauteur<span class="suffix-wrap"><input name="hauteur" inputmode="decimal" value="${num(p.hauteur)}" placeholder="0,00"><i>m</i></span></label>
      </div>
      <div class="live-surface"><span>Surface calculée</span><strong id="surf">—</strong></div>
      <label>Notes<textarea name="notes" rows="4" placeholder="Revêtement, peinture, particularités…">${esc(p.notes)}</textarea></label>
      <div class="form-actions">
        <button class="btn btn-primary btn-block" type="submit">${icon('check')}Enregistrer</button>
        ${isNew ? '' : `<button class="btn btn-danger btn-block" type="button" id="del">${icon('trash')}Supprimer la pièce</button>`}
      </div>
    </form>`;
  const f = $('#f', root);
  const upd = () => {
    const s = surface({ longueur: parseNum(f.longueur.value), largeur: parseNum(f.largeur.value) });
    $('#surf', root).textContent = m2(s);
  };
  f.addEventListener('input', upd); upd();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const nom = f.nom.value.trim();
    if (!nom) { f.nom.focus(); f.nom.classList.add('invalid'); toast('Indiquez un nom'); return; }
    const rec = await repo.save('pieces', {
      ...p, nom, longueur: parseNum(f.longueur.value), largeur: parseNum(f.largeur.value), hauteur: parseNum(f.hauteur.value), notes: f.notes.value.trim(),
    });
    haptic(); toast('Pièce enregistrée');
    go(`#/pieces/${rec.id}`, { replace: true });
  });
  $('#del', root)?.addEventListener('click', async () => {
    const eqs = (await repo.list('equipements')).filter(e => e.pieceId === p.id);
    const ok = await confirmSheet({
      title: `Supprimer « ${p.nom} » ?`,
      text: eqs.length ? `${eqs.length} équipement(s) seront conservés, sans pièce associée.` : 'Cette action est définitive.',
      confirm: 'Supprimer', danger: true,
    });
    if (!ok) return;
    await repo.batch([{ store: 'pieces', del: p.id }, ...eqs.map(e => ({ store: 'equipements', put: { ...e, pieceId: null, updatedAt: Date.now() } }))]);
    toast('Pièce supprimée');
    go('#/pieces', { replace: true });
  });
}
