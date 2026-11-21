// Navigation partagée par toutes les vues.
import { $, $$, esc } from './dom.js';
import { icon } from './icons.js';

let routerFn = () => {}, refreshFn = () => {};
export function setRouter(router, refresh) { routerFn = router; refreshFn = refresh; }
export const refresh = () => refreshFn();

export const go = (hash, { replace = false } = {}) => {
  if (replace) { history.replaceState(null, '', hash); routerFn(); } else location.hash = hash;
};
/** Retour hiérarchique (toujours vers la page parente, prévisible). */
export const back = (parent = '#/') => go(parent);

/* ---------- Habillage (barre du haut, onglets) ---------- */
export function chrome({ title = '', back: backHref = null, tab = '', actions = [] } = {}) {
  $('#topbar-title').textContent = title;
  document.title = title && title !== 'Accueil' ? `${title} · Carnet Maison` : 'Carnet Maison';
  const b = $('#back');
  b.hidden = !backHref;
  b.onclick = () => back(backHref);
  $('#topbar-actions').innerHTML = actions.map((a, i) => a.href
    ? `<a class="icon-btn" href="${esc(a.href)}" aria-label="${esc(a.label)}">${icon(a.icon)}</a>`
    : `<button class="icon-btn" type="button" data-act="${i}" aria-label="${esc(a.label)}">${icon(a.icon)}</button>`).join('');
  $$('#topbar-actions [data-act]').forEach(btn => { btn.onclick = actions[+btn.dataset.act].onClick; });
  $$('.tabbar [data-tab]').forEach(a => {
    const on = a.dataset.tab === tab;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.body.classList.toggle('has-back', !!backHref);
}

