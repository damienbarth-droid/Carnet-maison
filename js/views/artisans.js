// Artisans : carnet de contacts de confiance.
import * as repo from '../core/repo.js';
import { fmtEur } from '../core/model.js';
import { esc, emptyState, confirmSheet, toast, haptic, $ } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { chrome, go } from '../ui/nav.js';
import { pageHead, interventionItem } from '../ui/components.js';

const METIERS = ['Chauffagiste', 'Plombier', 'Électricien', 'Ramoneur', 'Couvreur', 'Menuisier', 'Peintre', 'Maçon', 'Jardinier', 'Serrurier', 'Frigoriste'];
const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
const telHref = t => 'tel:' + String(t).replace(/[^\d+]/g, '');

export async function list({ root }) {
  chrome({ title: 'Artisans', back: '#/', actions: [{ icon: 'plus', label: 'Ajouter un artisan', href: '#/artisans/nouveau' }] });
  const snap = await repo.snapshot();
  root.innerHTML = `
    ${pageHead('Artisans', snap.contacts.length ? `${snap.contacts.length} contact${snap.contacts.length > 1 ? 's' : ''}` : '')}
    ${snap.contacts.length ? `<div class="stack stagger">${snap.contacts.map(c => `
      <div class="row-card contact">
        <a class="row-link" href="#/artisans/${esc(c.id)}">
          <span class="avatar">${esc(initials(c.nom))}</span>
          <span class="row-txt"><strong>${esc(c.nom)}</strong><small>${esc(c.metier || '')}</small></span>
        </a>
        ${c.telephone ? `<a class="icon-btn call" href="${esc(telHref(c.telephone))}" aria-label="Appeler ${esc(c.nom)}">${icon('phone')}</a>` : ''}
      </div>`).join('')}</div>
      <a class="btn btn-soft btn-block" href="#/artisans/nouveau">${icon('plus')}Ajouter un artisan</a>`
    : emptyState({ iconName: 'address-book', title: 'Aucun artisan', text: 'Gardez vos chauffagiste, plombier ou ramoneur à portée de pouce, avec l’historique de leurs interventions.', action: `<a class="btn btn-primary" href="#/artisans/nouveau">${icon('plus')}Ajouter un artisan</a>` })}`;
}

export async function detail({ root, params: [id] }) {
  const c = await repo.get('contacts', id);
  if (!c) return go('#/artisans', { replace: true });
  chrome({ title: c.nom, back: '#/artisans', actions: [{ icon: 'pencil-simple', label: 'Modifier', href: `#/artisans/${id}/modifier` }] });
  const snap = await repo.snapshot();
  const inters = snap.interventions.filter(i => i.contactId === id);
  const total = inters.reduce((s, i) => s + (i.cout || 0), 0);
  root.innerHTML = `
    <header class="page-head center">
      <span class="avatar xl">${esc(initials(c.nom))}</span>
      <h1>${esc(c.nom)}</h1>
      ${c.metier ? `<p class="page-sub">${esc(c.metier)}</p>` : ''}
    </header>
    <div class="action-row">
      ${c.telephone ? `<a class="btn btn-primary" href="${esc(telHref(c.telephone))}">${icon('phone')}Appeler</a>` : ''}
      ${c.email ? `<a class="btn btn-soft" href="mailto:${esc(c.email)}">${icon('envelope-simple')}E-mail</a>` : ''}
    </div>
    <div class="card info-list">
      ${c.telephone ? `<div class="info-row"><span class="info-ico">${icon('phone')}</span><span class="info-label">Téléphone</span><span class="info-value">${esc(c.telephone)}</span></div>` : ''}
      ${c.email ? `<div class="info-row"><span class="info-ico">${icon('envelope-simple')}</span><span class="info-label">E-mail</span><span class="info-value">${esc(c.email)}</span></div>` : ''}
      ${total ? `<div class="info-row"><span class="info-ico">${icon('currency-eur')}</span><span class="info-label">Total payé</span><span class="info-value">${fmtEur(total)}</span></div>` : ''}
    </div>
    ${c.notes ? `<section class="section"><h2 class="section-title">Notes</h2><div class="card note">${esc(c.notes).replace(/\n/g, '<br>')}</div></section>` : ''}
    <section class="section">
      <h2 class="section-title">Interventions <span class="count">${inters.length}</span></h2>
      ${inters.length ? `<ul class="timeline">${inters.map(i => interventionItem(i, snap)).join('')}</ul>` : '<p class="calm">Choisissez cet artisan lorsque vous marquez une tâche comme faite.</p>'}
    </section>`;
}

export async function form({ root, params: [id] }) {
  const isNew = !id;
  const c = isNew ? { nom: '', metier: '', telephone: '', email: '', notes: '' } : await repo.get('contacts', id);
  if (!c) return go('#/artisans', { replace: true });
  chrome({ title: isNew ? 'Nouvel artisan' : 'Modifier', back: isNew ? '#/artisans' : `#/artisans/${id}` });
  root.innerHTML = `
    ${pageHead(isNew ? 'Nouvel artisan' : 'Modifier l’artisan')}
    <form id="f" class="form" autocomplete="off" novalidate>
      <label>Nom ou entreprise<input name="nom" required value="${esc(c.nom)}" ${isNew ? 'autofocus' : ''}></label>
      <label>Métier<input name="metier" value="${esc(c.metier)}" list="metiers" placeholder="Ex. Chauffagiste"></label>
      <datalist id="metiers">${METIERS.map(m => `<option value="${m}">`).join('')}</datalist>
      <label>Téléphone<input name="telephone" type="tel" inputmode="tel" value="${esc(c.telephone)}"></label>
      <label>E-mail<input name="email" type="email" inputmode="email" value="${esc(c.email)}"></label>
      <label>Notes<textarea name="notes" rows="3" placeholder="Tarifs, disponibilités, recommandé par…">${esc(c.notes)}</textarea></label>
      <div class="form-actions">
        <button class="btn btn-primary btn-block" type="submit">${icon('check')}Enregistrer</button>
        ${isNew ? '' : `<button class="btn btn-danger btn-block" type="button" id="del">${icon('trash')}Supprimer</button>`}
      </div>
    </form>`;
  const f = $('#f', root);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const nom = f.nom.value.trim();
    if (!nom) { f.nom.focus(); f.nom.classList.add('invalid'); toast('Indiquez un nom'); return; }
    const rec = await repo.save('contacts', { ...c, nom, metier: f.metier.value.trim(), telephone: f.telephone.value.trim(), email: f.email.value.trim(), notes: f.notes.value.trim() });
    haptic(); toast('Artisan enregistré');
    go(`#/artisans/${rec.id}`, { replace: true });
  });
  $('#del', root)?.addEventListener('click', async () => {
    if (!await confirmSheet({ title: `Supprimer « ${c.nom} » ?`, text: 'Les interventions passées sont conservées.', confirm: 'Supprimer', danger: true })) return;
    const inters = (await repo.list('interventions')).filter(i => i.contactId === c.id);
    await repo.batch([{ store: 'contacts', del: c.id }, ...inters.map(i => ({ store: 'interventions', put: { ...i, contactId: null, updatedAt: Date.now() } }))]);
    toast('Artisan supprimé');
    go('#/artisans', { replace: true });
  });
}
