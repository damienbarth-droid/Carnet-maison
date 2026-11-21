// Entretien : liste filtrable, fiche de tâche, formulaire.
import * as repo from '../core/repo.js';
import { fmtDate, fmtFreq, relDays, today, UNITS, addFreq, isDate, daysBetween } from '../core/dates.js';
import { fmtEur, norm } from '../core/model.js';
import { buildIcs } from '../core/reminders.js';
import { esc, emptyState, confirmSheet, toast, haptic, $, $$, ring, shareOrDownload } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { chrome, go, refresh } from '../ui/nav.js';
import { pageHead, taskCard, wireTaskCards, doneSheet, postponeSheet, interventionItem, infoRow, STATE, pill, taskIcon } from '../ui/components.js';

export const SUGGESTIONS = [
  { nom: 'Entretien chaudière', freqN: 1, freqUnit: 'ans', sub: 'Obligatoire chaque année' },
  { nom: 'Ramonage', freqN: 1, freqUnit: 'ans', sub: 'Conduits de cheminée et poêle' },
  { nom: 'Nettoyage bouches VMC', freqN: 3, freqUnit: 'mois', sub: 'Meilleure qualité d’air' },
  { nom: 'Nettoyage gouttières', freqN: 1, freqUnit: 'ans', sub: 'Avant l’hiver' },
  { nom: 'Test détecteur de fumée', freqN: 6, freqUnit: 'mois', sub: 'Un appui sur le bouton test' },
];

export async function list({ root, query }) {
  chrome({ title: 'Entretien', tab: 'entretien', actions: [{ icon: 'plus', label: 'Ajouter une tâche', href: '#/entretien/nouveau' }] });
  const snap = await repo.snapshot();
  const filtre = query.get('filtre') || 'tout';
  const st = t => snap.status.get(t.id);
  const counts = { retard: 0, bientot: 0, ok: 0, inconnu: 0 };
  snap.taches.forEach(t => counts[st(t).state]++);
  const shown = filtre === 'tout' ? snap.taches : snap.taches.filter(t => st(t).state === filtre);
  const eqOf = t => snap.equipements.find(e => e.id === t.equipementId);
  const seg = (k, label) => `<a class="seg-item ${filtre === k ? 'on' : ''}" href="#/entretien${k === 'tout' ? '' : `?filtre=${k}`}">${label}${k !== 'tout' && counts[k] ? ` <b>${counts[k]}</b>` : ''}</a>`;

  root.innerHTML = `
    ${pageHead('Entretien', snap.taches.length ? `${snap.taches.length} tâche${snap.taches.length > 1 ? 's' : ''} suivie${snap.taches.length > 1 ? 's' : ''}` : '')}
    ${snap.taches.length ? `
      <div class="seg h-scroll">
        ${seg('tout', 'Tout')}${seg('retard', 'En retard')}${seg('bientot', 'Bientôt')}${seg('ok', 'À jour')}${seg('inconnu', 'À compléter')}
      </div>
      <p class="hint">${icon('info')}Glissez une tâche vers la droite pour la marquer faite, vers la gauche pour la reporter.</p>
      <div class="stack stagger">${shown.map(t => taskCard(t, st(t), eqOf(t))).join('')}</div>
      ${shown.length ? '' : '<p class="calm">Aucune tâche dans cette catégorie.</p>'}
      <a class="btn btn-soft btn-block" href="#/bienvenue?ajout=1">${icon('sparkle')}Tâches suggérées</a>`
    : emptyState({ iconName: 'calendar-check', title: 'Aucune tâche d’entretien', text: 'Chaudière, ramonage, VMC… On vous rappelle quand c’est le moment.', action: `<a class="btn btn-primary" href="#/bienvenue?ajout=1">${icon('sparkle')}Voir les suggestions</a><a class="btn btn-ghost" href="#/entretien/nouveau">${icon('plus')}Créer une tâche</a>` })}`;
  wireTaskCards(root, snap);
}

export async function detail({ root, params: [id] }) {
  const t = await repo.get('taches', id);
  if (!t) return go('#/entretien', { replace: true });
  chrome({ title: t.nom, back: '#/entretien', tab: 'entretien', actions: [{ icon: 'pencil-simple', label: 'Modifier', href: `#/entretien/${id}/modifier` }] });
  const snap = await repo.snapshot();
  const st = snap.status.get(id);
  const eq = snap.equipements.find(e => e.id === t.equipementId);
  const inters = snap.interventions.filter(i => i.tacheId === id);
  const total = inters.reduce((s, i) => s + (i.cout || 0), 0);
  const tone = STATE[st.state].tone;
  const pct = st.state === 'inconnu' ? null : Math.round((1 - st.progress) * 100);

  root.innerHTML = `
    ${pageHead(t.nom, `${pill(st.state)} <span class="muted">${esc(fmtFreq(t.freqN, t.freqUnit))}</span>`)}
    <section class="due-card tone-${tone}">
      ${ring(pct, { tone: tone === 'muted' ? 'muted' : tone, size: 120, label: 'restant' })}
      <div class="due-txt">
        <span class="muted small">Prochaine échéance</span>
        <strong>${st.next ? fmtDate(st.next) : 'À définir'}</strong>
        <span class="${tone}">${st.next ? relDays(st.days) : 'Indiquez la dernière réalisation'}</span>
        ${isDate(t.reporteAu) && st.next === t.reporteAu ? `<span class="muted small">${icon('clock')}Reportée</span>` : ''}
      </div>
    </section>

    <div class="action-row">
      <button class="btn btn-primary" id="done">${icon('check')}Fait</button>
      <button class="btn btn-soft" id="postpone" ${st.next ? '' : 'disabled'}>${icon('clock')}Reporter</button>
      <button class="btn btn-soft" id="ics" ${st.next ? '' : 'disabled'} aria-label="Ajouter à l’agenda">${icon('calendar-plus')}</button>
    </div>

    <div class="card info-list">
      ${infoRow('wrench', 'Équipement', eq ? `<a href="#/equipements/${esc(eq.id)}">${esc(eq.nom)}</a>` : '<span class="muted">Aucun</span>')}
      ${infoRow('clock-counter-clockwise', 'Dernière fois', st.last ? `${fmtDate(st.last)} <small class="muted">(${relDays(-daysBetween(st.last, today()))})</small>` : '<span class="muted">Inconnue</span>')}
      ${infoRow('arrows-clockwise', 'Fréquence', esc(fmtFreq(t.freqN, t.freqUnit)))}
      ${total ? infoRow('currency-eur', 'Total dépensé', fmtEur(total)) : ''}
    </div>
    ${t.notes ? `<section class="section"><h2 class="section-title">Notes</h2><div class="card note">${esc(t.notes).replace(/\n/g, '<br>')}</div></section>` : ''}

    <section class="section">
      <h2 class="section-title">Historique <span class="count">${inters.length}</span></h2>
      ${inters.length ? `<ul class="timeline">${inters.map(i => `${interventionItem(i, snap, { showTask: false }).replace('</li>', `<button class="icon-btn tl-del" data-del="${esc(i.id)}" aria-label="Retirer cette réalisation">${icon('trash')}</button></li>`)}`).join('')}</ul>`
        : `<p class="calm">${icon('clock-counter-clockwise')}Les réalisations enregistrées avec « Fait » apparaîtront ici.</p>`}
    </section>`;

  $('#done', root).onclick = () => doneSheet(t, snap);
  $('#postpone', root).onclick = () => postponeSheet(t, st);
  $('#ics', root).onclick = async () => {
    const ics = buildIcs([{ id: t.id, titre: t.nom, date: st.next, freqN: t.freqN, freqUnit: t.freqUnit, description: eq ? `Équipement : ${eq.nom}` : '' }]);
    const r = await shareOrDownload(new Blob([ics], { type: 'text/calendar' }), `${norm(t.nom).replace(/[^a-z0-9]+/g, '-')}.ics`, t.nom);
    if (r !== 'cancelled') toast('Ouvrez le fichier pour l’ajouter à votre agenda');
  };
  $$('[data-del]', root).forEach(b => b.addEventListener('click', async () => {
    const i = inters.find(x => x.id === b.dataset.del);
    if (!await confirmSheet({ title: 'Retirer cette réalisation ?', text: `Réalisation du ${fmtDate(i.date)}.`, confirm: 'Retirer', danger: true })) return;
    await repo.batch([{ store: 'interventions', del: i.id }]);
    toast('Réalisation retirée'); refresh();
  }));
}

export async function form({ root, params: [id], query }) {
  const isNew = !id;
  const t = isNew
    ? { nom: query.get('nom') || '', equipementId: query.get('equipement') || null, freqN: 1, freqUnit: 'ans', derniereManuelle: null, notes: '' }
    : await repo.get('taches', id);
  if (!t) return go('#/entretien', { replace: true });
  const parent = isNew ? (query.get('equipement') ? `#/equipements/${query.get('equipement')}` : '#/entretien') : `#/entretien/${id}`;
  chrome({ title: isNew ? 'Nouvelle tâche' : 'Modifier', back: parent, tab: 'entretien' });
  const eqs = (await repo.list('equipements')).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  root.innerHTML = `
    ${pageHead(isNew ? 'Nouvelle tâche' : 'Modifier la tâche')}
    <form id="f" class="form" autocomplete="off" novalidate>
      <label>Tâche<input name="nom" required value="${esc(t.nom)}" placeholder="Ex. Purger les radiateurs" ${isNew ? 'autofocus' : ''}></label>
      <label>Équipement lié <span class="opt">facultatif</span>
        <select name="equipementId">
          <option value="">— Aucun —</option>
          ${eqs.map(e => `<option value="${esc(e.id)}" ${e.id === t.equipementId ? 'selected' : ''}>${esc(e.nom)}</option>`).join('')}
        </select>
      </label>
      <fieldset class="freq-field">
        <legend>Fréquence</legend>
        <div class="stepper">
          <button type="button" class="icon-btn" data-step="-1" aria-label="Moins">−</button>
          <input name="freqN" type="number" min="1" max="99" step="1" inputmode="numeric" value="${esc(t.freqN)}" aria-label="Nombre">
          <button type="button" class="icon-btn" data-step="1" aria-label="Plus">+</button>
        </div>
        <div class="seg seg-units">
          ${Object.keys(UNITS).map(u => `<label class="seg-item ${u === t.freqUnit ? 'on' : ''}"><input type="radio" name="freqUnit" value="${u}" ${u === t.freqUnit ? 'checked' : ''}>${u}</label>`).join('')}
        </div>
        <p class="muted small" id="freq-txt"></p>
      </fieldset>
      <label>Dernière réalisation connue <span class="opt">facultatif</span>
        <input type="date" name="derniere" value="${esc(t.derniereManuelle || '')}" max="${today()}">
      </label>
      <div class="live-surface"><span>Prochaine échéance</span><strong id="next">—</strong></div>
      <label>Notes<textarea name="notes" rows="3" placeholder="Comment faire, produit utilisé…">${esc(t.notes)}</textarea></label>
      <div class="form-actions">
        <button class="btn btn-primary btn-block" type="submit">${icon('check')}Enregistrer</button>
        ${isNew ? '' : `<button class="btn btn-danger btn-block" type="button" id="del">${icon('trash')}Supprimer la tâche</button>`}
      </div>
    </form>`;

  const f = $('#f', root);
  const unit = () => f.querySelector('input[name=freqUnit]:checked')?.value || 'ans';
  const upd = () => {
    const n = Math.max(1, parseInt(f.freqN.value, 10) || 1);
    $('#freq-txt', root).textContent = fmtFreq(n, unit());
    $$('.seg-units .seg-item', root).forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
    const d = f.derniere.value;
    $('#next', root).textContent = d ? fmtDate(addFreq(d, n, unit())) : (isNew ? 'Dès que vous indiquez une date' : '—');
  };
  f.addEventListener('input', upd); f.addEventListener('change', upd); upd();
  $$('[data-step]', root).forEach(b => b.addEventListener('click', () => {
    f.freqN.value = Math.min(99, Math.max(1, (parseInt(f.freqN.value, 10) || 1) + Number(b.dataset.step)));
    haptic(6); upd();
  }));

  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const nom = f.nom.value.trim();
    const n = parseInt(f.freqN.value, 10);
    if (!nom) { f.nom.focus(); f.nom.classList.add('invalid'); toast('Indiquez un nom'); return; }
    if (!(n > 0)) { toast('Fréquence invalide'); return; }
    const rec = await repo.save('taches', {
      ...t, nom, equipementId: f.equipementId.value || null, freqN: n, freqUnit: unit(),
      derniereManuelle: f.derniere.value || null, notes: f.notes.value.trim(), reporteAu: t.reporteAu || null,
    });
    haptic(); toast('Tâche enregistrée');
    go(`#/entretien/${rec.id}`, { replace: true });
  });

  $('#del', root)?.addEventListener('click', async () => {
    if (!await confirmSheet({ title: `Supprimer « ${t.nom} » ?`, text: 'La tâche et son historique seront supprimés.', confirm: 'Supprimer', danger: true })) return;
    const inters = (await repo.list('interventions')).filter(i => i.tacheId === t.id);
    await repo.batch([{ store: 'taches', del: t.id }, ...inters.map(i => ({ store: 'interventions', del: i.id }))]);
    toast('Tâche supprimée');
    go('#/entretien', { replace: true });
  });
}

export { taskIcon };
