// Point d'entrée : coquille, routeur, transitions, mises à jour.
import * as repo from './core/repo.js';
import { backfillThumbs, releaseUrls } from './core/photos.js';
import { $, $$, esc, haptic, toast, chooseSheet, animateIn, reducedMotion } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { go, setRouter } from './ui/nav.js';

import * as home from './views/home.js';
import * as pieces from './views/pieces.js';
import * as equipements from './views/equipements.js';
import * as entretien from './views/entretien.js';
import * as artisans from './views/artisans.js';
import * as reglages from './views/reglages.js';
import * as recherche from './views/recherche.js';
import * as bienvenue from './views/bienvenue.js';
import * as rapport from './views/rapport.js';

const main = $('#main');

/* ---------- Routes ---------- */
const ID = '([\\w-]+)';
const routes = [
  ['', home.render],
  ['pieces', pieces.list], ['pieces/nouveau', pieces.form], [`pieces/${ID}/modifier`, pieces.form], [`pieces/${ID}`, pieces.detail],
  ['equipements', equipements.list], ['equipements/nouveau', equipements.form], [`equipements/${ID}/modifier`, equipements.form], [`equipements/${ID}`, equipements.detail],
  ['entretien', entretien.list], ['entretien/nouveau', entretien.form], [`entretien/${ID}/modifier`, entretien.form], [`entretien/${ID}`, entretien.detail],
  ['artisans', artisans.list], ['artisans/nouveau', artisans.form], [`artisans/${ID}/modifier`, artisans.form], [`artisans/${ID}`, artisans.detail],
  ['reglages', reglages.render], ['reglages/sauvegarde', reglages.sauvegarde], ['reglages/logements', reglages.logements], ['reglages/agenda', reglages.agenda],
  ['recherche', recherche.render],
  ['bienvenue', bienvenue.render],
  ['rapport', rapport.render],
].map(([p, fn]) => [new RegExp(`^${p}$`), fn]);

/** Ordre de profondeur pour choisir le sens de la transition. */
const depth = path => path === '' ? 0 : path.split('/').length;
let lastPath = null;
let navSeq = 0;

async function router() {
  const seq = ++navSeq;
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const query = new URLSearchParams(qs || '');
  const match = routes.map(([re, fn]) => [path.match(re), fn]).find(([m]) => m);
  if (!match) { go('#/', { replace: true }); return; }
  const [m, fn] = match;
  const dir = lastPath == null ? 'none' : depth(path) > depth(lastPath) ? 'forward' : depth(path) < depth(lastPath) ? 'back' : 'same';
  const sameView = lastPath === path;
  lastPath = path;

  const renderView = async () => {
    releaseUrls();
    const html = document.createElement('div');
    html.className = 'view';
    try {
      await fn({ params: m.slice(1), query, root: html, refresh });
    } catch (e) {
      console.error(e);
      html.innerHTML = `<div class="page-head"><h1>Oups</h1><p class="muted">${esc(e.message)}</p></div>`;
    }
    if (seq !== navSeq) return; // Une navigation plus récente a eu lieu entre-temps.
    main.replaceChildren(html); // Le conteneur reste vivant : les vues peuvent y chercher leurs éléments.
    main.dataset.route = raw;
    main.dataset.view = path.split('/')[0] || 'accueil';
    if (!sameView) window.scrollTo(0, 0);
    animateIn(main);
    observeTitle();
  };

  document.documentElement.dataset.nav = dir;
  if (document.startViewTransition && !reducedMotion() && !sameView && dir !== 'none') {
    const vt = document.startViewTransition(renderView);
    // Une transition interrompue par une navigation plus rapide n'est pas une erreur.
    [vt.ready, vt.finished, vt.updateCallbackDone].forEach(pr => pr.catch(() => {}));
  } else {
    await renderView();
    if (!sameView && !reducedMotion()) { main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter'); }
  }
}

/** Ré-affiche la vue courante (après une modification). */
function refresh() { lastPath = null; const keep = window.scrollY; return router().then(() => window.scrollTo(0, keep)); }
setRouter(router, refresh);

/* Titre compact dans la barre du haut quand le grand titre sort de l'écran. */
let titleObs;
function observeTitle() {
  titleObs?.disconnect();
  const h = main.querySelector('.page-head h1, .welcome h1');
  const bar = $('.topbar');
  if (!h) { bar.classList.add('scrolled'); return; }
  bar.classList.remove('scrolled');
  titleObs = new IntersectionObserver(([e]) => bar.classList.toggle('scrolled', !e.isIntersecting), { rootMargin: '-60px 0px 0px 0px' });
  titleObs.observe(h);
}

/* ---------- Bouton + (ajout rapide) ---------- */
async function quickAdd() {
  haptic();
  const v = await chooseSheet({
    title: 'Ajouter',
    options: [
      { value: '#/entretien/nouveau', label: "Tâche d'entretien", sub: 'Une action à répéter', icon: 'calendar-check' },
      { value: '#/equipements/nouveau', label: 'Équipement', sub: 'Chaudière, VMC, électroménager…', icon: 'wrench' },
      { value: '#/pieces/nouveau', label: 'Pièce', sub: 'Avec ses dimensions', icon: 'door' },
      { value: '#/artisans/nouveau', label: 'Artisan', sub: 'Un contact de confiance', icon: 'address-book' },
    ],
  });
  if (v) go(v);
}

/* ---------- Mises à jour de l'application ---------- */
function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
  navigator.serviceWorker.register('./sw.js').then(reg => {
    const offer = (w) => {
      if (!w || !navigator.serviceWorker.controller) return;
      toast('Nouvelle version disponible', { action: 'Mettre à jour', onAction: () => w.postMessage('SKIP_WAITING'), duration: 15000 });
      $('#toast button')?.querySelector('svg')?.remove();
    };
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(console.error);
}

/* ---------- Démarrage ---------- */
async function start() {
  if (!('indexedDB' in window)) {
    main.innerHTML = '<div class="page-head"><h1>Navigateur non compatible</h1><p class="muted">Ce navigateur ne permet pas le stockage local.</p></div>';
    return;
  }
  await repo.ensureLogement();
  navigator.storage?.persisted?.().then(p => p || navigator.storage.persist()).catch(() => {});
  [['#tab-pieces', 'door'], ['#tab-equipements', 'wrench'], ['#tab-entretien', 'calendar-check']]
    .forEach(([sel, ic]) => $(sel).insertAdjacentHTML('afterbegin', icon(ic)));
  $('#fab').addEventListener('click', quickAdd);
  window.addEventListener('hashchange', router);
  setupServiceWorker();
  if (!(await repo.getMeta('accueilFait')) && !location.hash.replace(/^#\/?/, '')) {
    go('#/bienvenue', { replace: true });
  } else router();
  setTimeout(() => backfillThumbs().catch(console.error), 1500);
}

start().catch(e => {
  console.error(e);
  main.innerHTML = `<div class="page-head"><h1>Erreur au démarrage</h1><p class="muted">${esc(e.message)}</p></div>`;
});
