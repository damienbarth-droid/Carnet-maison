// Premier lancement (et ajout de tâches suggérées).
import * as repo from '../core/repo.js';
import { fmtFreq } from '../core/dates.js';
import { esc, toast, haptic, $, $$ } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { chrome, go } from '../ui/nav.js';
import { SUGGESTIONS } from './entretien.js';
import { taskIcon } from '../ui/components.js';

export async function render({ root, query }) {
  const ajout = query.get('ajout') === '1';
  const firstRun = !(await repo.getMeta('accueilFait'));
  chrome({ title: ajout ? 'Suggestions' : 'Bienvenue', back: ajout ? '#/entretien' : (firstRun ? null : '#/') });
  const existantes = new Set((await repo.list('taches')).map(t => t.nom.toLowerCase()));
  const dispo = SUGGESTIONS.filter(s => !existantes.has(s.nom.toLowerCase()));

  root.innerHTML = `
    ${ajout ? '' : `
    <section class="welcome">
      <div class="welcome-art" aria-hidden="true">
        <span class="orb o1"></span><span class="orb o2"></span><span class="orb o3"></span>
        <img src="icons/icon.svg" alt="">
      </div>
      <h1>Carnet Maison</h1>
      <p>La mémoire de votre logement : entretien, équipements, garanties et artisans. <strong>Tout reste sur votre appareil.</strong></p>
    </section>`}
    <form id="f" class="form">
      <h2 class="section-title">${ajout ? 'Tâches suggérées' : 'Par quoi commencer ?'}</h2>
      ${dispo.length ? `<p class="section-help">Touchez celles qui vous concernent.</p>
      <div class="pick-grid stagger">
        ${dispo.map((s, i) => `
          <label class="pick">
            <input type="checkbox" name="s" value="${i}" checked>
            <span class="pick-ico">${icon(taskIcon(s.nom))}</span>
            <span class="pick-txt"><strong>${esc(s.nom)}</strong><small>${esc(fmtFreq(s.freqN, s.freqUnit))} · ${esc(s.sub)}</small></span>
            <span class="pick-check">${icon('check')}</span>
          </label>`).join('')}
      </div>
      <button class="btn btn-primary btn-block" type="submit" id="go">${icon('check')}Ajouter <span id="n">${dispo.length}</span> tâche(s)</button>`
      : '<p class="calm">Toutes les tâches suggérées sont déjà ajoutées.</p>'}
      ${ajout ? '' : `<button class="btn btn-ghost btn-block" type="button" id="skip">Passer cette étape</button>`}
    </form>
    ${firstRun ? `<a class="restore-link" href="#/reglages/sauvegarde">${icon('upload-simple')}J’ai déjà une sauvegarde : la restaurer</a>` : ''}`;

  const finish = async () => { await repo.setMeta('accueilFait', true); go(ajout ? '#/entretien' : '#/', { replace: true }); };
  $('#skip', root)?.addEventListener('click', finish);
  const f = $('#f', root);
  f.addEventListener('change', () => {
    const n = $$('input[name=s]:checked', root).length;
    const c = $('#n', root); if (c) c.textContent = n;
    const b = $('#go', root); if (b) b.disabled = n === 0;
    haptic(6);
  });
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const choisis = $$('input[name=s]:checked', root).map(c => dispo[+c.value]);
    await repo.batch(choisis.map(({ sub, ...s }) => ({
      store: 'taches', put: repo.stamp({ ...s, equipementId: null, derniereManuelle: null, reporteAu: null, notes: '' }),
    })));
    if (choisis.length) { haptic(18); toast(`${choisis.length} tâche(s) ajoutée(s). Indiquez quand elles ont été faites.`); }
    finish();
  });
}
