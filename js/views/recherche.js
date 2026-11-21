// Recherche globale (sans accents ni casse).
import * as repo from '../core/repo.js';
import { norm } from '../core/model.js';
import { esc, $ } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { chrome } from '../ui/nav.js';

export async function render({ root }) {
  chrome({ title: 'Recherche', back: '#/' });
  const snap = await repo.snapshot();
  const groups = [
    { label: 'Tâches', ic: 'calendar-check', href: 'entretien', items: snap.taches, text: t => [t.nom, t.notes] },
    { label: 'Équipements', ic: 'wrench', href: 'equipements', items: snap.equipements, text: e => [e.nom, e.marque, e.notes] },
    { label: 'Pièces', ic: 'door', href: 'pieces', items: snap.pieces, text: p => [p.nom, p.notes] },
    { label: 'Artisans', ic: 'address-book', href: 'artisans', items: snap.contacts, text: c => [c.nom, c.metier, c.telephone, c.notes] },
  ];
  root.innerHTML = `
    <div class="search-box">${icon('magnifying-glass')}<input id="q" type="search" placeholder="Chaudière, plombier, salon…" autocomplete="off" enterkeyhint="search" autofocus></div>
    <div id="results"></div>`;
  const out = $('#results', root);
  const run = () => {
    const q = norm($('#q', document).value.trim());
    if (!q) { out.innerHTML = '<p class="calm">Cherchez dans vos tâches, équipements, pièces et artisans.</p>'; return; }
    const words = q.split(/\s+/);
    let n = 0;
    const html = groups.map(g => {
      const hits = g.items.filter(x => { const t = norm(g.text(x).filter(Boolean).join(' ')); return words.every(w => t.includes(w)); });
      n += hits.length;
      return hits.length ? `<section class="section"><h2 class="section-title">${g.label} <span class="count">${hits.length}</span></h2><div class="stack">
        ${hits.map(x => `<a class="row-card" href="#/${g.href}/${esc(x.id)}"><span class="row-ico tone-bg-accent">${icon(g.ic)}</span><span class="row-txt"><strong>${esc(x.nom)}</strong><small>${esc(g.text(x).slice(1).filter(Boolean)[0] || '')}</small></span>${icon('caret-right', 'caret')}</a>`).join('')}
      </div></section>` : '';
    }).join('');
    out.innerHTML = n ? html : '<p class="calm">Aucun résultat.</p>';
  };
  root.querySelector('#q').addEventListener('input', run);
  setTimeout(() => { run(); $('#q')?.focus(); }, 0);
}
