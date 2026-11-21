// Réglages : sauvegarde, logements, agenda, stockage, à propos.
import * as repo from '../core/repo.js';
import { buildBackup, readBackup, restore } from '../core/backup.js';
import { buildIcs } from '../core/reminders.js';
import { backupAge, BACKUP_ALERT_DAYS } from '../core/model.js';
import { fmtDate } from '../core/dates.js';
import { APP_VERSION } from '../version.js';
import { esc, toast, haptic, $, $$, sheet, confirmSheet, shareOrDownload } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { chrome, go, refresh } from '../ui/nav.js';
import { pageHead } from '../ui/components.js';

const row = (href, ic, label, sub = '', tone = '') => `
  <a class="menu-item" href="${href}">
    <span class="menu-ico ${tone}">${icon(ic)}</span>
    <span class="menu-txt"><strong>${label}</strong>${sub ? `<small>${sub}</small>` : ''}</span>
    ${icon('caret-right', 'menu-caret')}
  </a>`;

export async function render({ root }) {
  chrome({ title: 'Réglages', back: '#/' });
  const [last, logements, persisted] = await Promise.all([
    repo.getMeta('derniereSauvegarde'), repo.logements(),
    navigator.storage?.persisted ? navigator.storage.persisted() : Promise.resolve(null),
  ]);
  const age = backupAge(last);
  root.innerHTML = `
    ${pageHead('Réglages')}
    <div class="menu card-menu">
      ${row('#/reglages/sauvegarde', 'cloud-check', 'Sauvegarde', age == null ? 'Jamais sauvegardé' : `Il y a ${age} jour${age > 1 ? 's' : ''}`, age == null || age > BACKUP_ALERT_DAYS ? 'tone-bg-late' : 'tone-bg-ok')}
      ${row('#/reglages/logements', 'buildings', 'Logements', `${logements.length} logement${logements.length > 1 ? 's' : ''}`)}
      ${row('#/reglages/agenda', 'calendar-plus', 'Rappels dans mon agenda', 'Ajouter toutes les tâches au calendrier')}
      ${row('#/rapport', 'printer', 'Carnet d’entretien PDF', 'À imprimer ou à transmettre')}
      ${row('#/artisans', 'address-book', 'Artisans', 'Vos contacts de confiance')}
    </div>
    <section class="section">
      <h2 class="section-title">À propos</h2>
      <div class="card info-list">
        <div class="info-row"><span class="info-ico">${icon('info')}</span><span class="info-label">Version</span><span class="info-value">${APP_VERSION}</span></div>
        <div class="info-row"><span class="info-ico">${icon('shield-check')}</span><span class="info-label">Stockage protégé</span><span class="info-value">${persisted === null ? 'Non pris en charge' : persisted ? 'Oui' : 'Non'}</span></div>
      </div>
      ${persisted === false ? `<button class="btn btn-soft btn-block" id="persist">${icon('shield-check')}Demander le stockage protégé</button>
        <p class="section-help">Installer l’application sur l’écran d’accueil aide le navigateur à l’accorder.</p>` : ''}
      <p class="section-help">Vos données restent sur cet appareil. Aucune information n’est envoyée sur internet.</p>
    </section>`;
  $('#persist', root)?.addEventListener('click', async () => {
    const ok = await navigator.storage.persist();
    toast(ok ? 'Stockage protégé accordé' : 'Refusé par le navigateur pour le moment');
    refresh();
  });
}

export async function sauvegarde({ root }) {
  chrome({ title: 'Sauvegarde', back: '#/reglages' });
  const [last, estimate] = await Promise.all([
    repo.getMeta('derniereSauvegarde'),
    navigator.storage?.estimate ? navigator.storage.estimate() : Promise.resolve(null),
  ]);
  const age = backupAge(last);
  const alert = age == null || age > BACKUP_ALERT_DAYS;
  root.innerHTML = `
    ${pageHead('Sauvegarde')}
    <section class="backup-hero ${alert ? 'alert' : 'ok'}">
      <span class="backup-hero-ico">${icon(alert ? 'warning' : 'cloud-check')}</span>
      <strong>${age == null ? 'Aucune sauvegarde' : age === 0 ? 'Sauvegardé aujourd’hui' : `Dernière sauvegarde il y a ${age} jour${age > 1 ? 's' : ''}`}</strong>
      <span>${last ? fmtDate(new Date(last).toISOString().slice(0, 10)) : 'Exportez vos données pour ne rien perdre.'}</span>
    </section>
    <button class="btn btn-primary btn-block" id="exp">${icon('download-simple')}Exporter une sauvegarde</button>
    <label class="btn btn-soft btn-block file-btn">${icon('upload-simple')}Restaurer une sauvegarde
      <input type="file" id="imp" accept="application/json,.json" hidden>
    </label>
    <section class="section">
      <h2 class="section-title">Bon à savoir</h2>
      <ul class="tips">
        <li>${icon('check-circle')}Le fichier contient tout : pièces, équipements, tâches, historique, photos et documents.</li>
        <li>${icon('check-circle')}Rangez-le en lieu sûr : iCloud Drive, Google Drive, ou envoyez-le-vous par e-mail.</li>
        <li>${icon('check-circle')}Sur un nouveau téléphone, ouvrez l’application puis « Restaurer une sauvegarde ».</li>
      </ul>
      ${estimate ? `<p class="section-help">Espace utilisé sur l’appareil : ${(estimate.usage / 1048576).toFixed(1).replace('.', ',')} Mo</p>` : ''}
    </section>`;

  $('#exp', root).addEventListener('click', async () => {
    const btn = $('#exp', root);
    btn.disabled = true; btn.classList.add('loading');
    let built;
    try { built = await buildBackup(repo.logementId()); }
    catch (e) { toast(`Erreur : ${e.message}`, { tone: 'late' }); return; }
    finally { btn.disabled = false; btn.classList.remove('loading'); }
    const size = (built.blob.size / 1048576).toFixed(1).replace('.', ',');
    // Deuxième geste de l'utilisateur : nécessaire pour le partage sur iPhone.
    await sheet(`
      <div class="sheet-hero ok">${icon('cloud-check')}</div>
      <h2 class="sheet-title">Sauvegarde prête</h2>
      <p class="sheet-text">${size} Mo · ${built.counts.taches} tâches, ${built.counts.equipements} équipements, ${built.counts.photos} photos</p>
      <div class="sheet-actions">
        <button class="btn btn-primary" data-save>${icon('share-network')}Enregistrer / partager</button>
        <button class="btn btn-ghost" data-cancel>Annuler</button>
      </div>`, (r, close) => {
      $('[data-save]', r).onclick = async () => {
        const res = await shareOrDownload(built.blob, built.name, 'Sauvegarde Carnet Maison');
        if (res === 'cancelled') return;
        await repo.setMeta('derniereSauvegarde', Date.now());
        haptic(18); toast('Sauvegarde enregistrée');
        close(true); refresh();
      };
      $('[data-cancel]', r).onclick = () => close(false);
    }, { label: 'Sauvegarde prête' });
  });

  $('#imp', root).addEventListener('change', async ev => {
    const file = ev.target.files[0]; ev.target.value = '';
    if (!file) return;
    let parsed;
    try { parsed = await readBackup(file); }
    catch (e) { toast(e.message, { tone: 'late' }); return; }
    const d = parsed.data;
    const ok = await confirmSheet({
      title: 'Restaurer cette sauvegarde ?',
      text: `${d.pieces.length} pièce(s), ${d.equipements.length} équipement(s), ${d.taches.length} tâche(s), ${d.photos.length} photo(s)${parsed.exporteLe ? `, du ${fmtDate(new Date(parsed.exporteLe).toISOString().slice(0, 10))}` : ''}. Les données actuelles de l’application seront remplacées.`,
      confirm: 'Restaurer', danger: true, iconName: 'upload-simple',
    });
    if (!ok) return;
    await restore(parsed);
    await repo.ensureLogement();
    haptic(18); toast('Sauvegarde restaurée');
    go('#/', { replace: true });
  });
}

export async function logements({ root }) {
  chrome({ title: 'Logements', back: '#/reglages' });
  const list = await repo.logements();
  const cur = repo.logementId();
  root.innerHTML = `
    ${pageHead('Logements', 'Maison principale, résidence secondaire, location…')}
    <div class="stack">${list.map(l => `
      <div class="row-card ${l.id === cur ? 'current' : ''}">
        <button class="row-link linklike" data-use="${esc(l.id)}">
          <span class="row-ico ${l.id === cur ? 'tone-bg-ok' : 'tone-bg-accent'}">${icon(l.id === cur ? 'check' : 'house')}</span>
          <span class="row-txt"><strong>${esc(l.nom)}</strong><small>${l.id === cur ? 'Logement affiché' : 'Toucher pour afficher'}</small></span>
        </button>
        <button class="icon-btn" data-edit="${esc(l.id)}" aria-label="Renommer ${esc(l.nom)}">${icon('pencil-simple')}</button>
      </div>`).join('')}</div>
    <button class="btn btn-soft btn-block" id="add">${icon('plus')}Ajouter un logement</button>`;

  const askName = (title, value = '') => sheet(`
    <h2 class="sheet-title">${esc(title)}</h2>
    <form class="form" id="nf"><input name="nom" value="${esc(value)}" placeholder="Ex. Maison de vacances" required autofocus>
      <button class="btn btn-primary" type="submit">Valider</button>
      ${value ? '<button class="btn btn-danger" type="button" data-del>Supprimer ce logement</button>' : ''}
    </form>`, (r, close) => {
    $('#nf', r).addEventListener('submit', e => { e.preventDefault(); const v = e.target.nom.value.trim(); if (v) close({ nom: v }); });
    $('[data-del]', r)?.addEventListener('click', () => close({ del: true }));
  }, { label: title });

  $('#add', root).onclick = async () => {
    const r = await askName('Nouveau logement');
    if (!r?.nom) return;
    const l = await repo.save('logements', { nom: r.nom });
    await repo.switchLogement(l.id);
    toast(`« ${r.nom} » créé`);
    go('#/bienvenue?ajout=1', { replace: true });
  };
  $$('[data-use]', root).forEach(b => b.onclick = async () => {
    await repo.switchLogement(b.dataset.use); haptic(); toast('Logement affiché'); go('#/', { replace: true });
  });
  $$('[data-edit]', root).forEach(b => b.onclick = async () => {
    const l = list.find(x => x.id === b.dataset.edit);
    const r = await askName('Renommer', l.nom);
    if (!r) return;
    if (r.del) {
      if (list.length === 1) { toast('Il faut garder au moins un logement'); return; }
      if (!await confirmSheet({ title: `Supprimer « ${l.nom} » ?`, text: 'Toutes ses pièces, équipements, tâches, photos et documents seront définitivement supprimés.', confirm: 'Tout supprimer', danger: true })) return;
      await repo.deleteLogement(l.id);
      if (l.id === repo.logementId()) await repo.switchLogement(list.find(x => x.id !== l.id).id);
      toast('Logement supprimé'); refresh(); return;
    }
    await repo.save('logements', { ...l, nom: r.nom });
    refresh();
  });
}

export async function agenda({ root }) {
  chrome({ title: 'Agenda', back: '#/reglages' });
  const snap = await repo.snapshot();
  const items = snap.taches.filter(t => snap.status.get(t.id).next);
  root.innerHTML = `
    ${pageHead('Rappels dans l’agenda')}
    <section class="backup-hero ok"><span class="backup-hero-ico">${icon('bell')}</span>
      <strong>Recevez une alerte la veille</strong>
      <span>Vos tâches sont ajoutées à l’agenda de votre téléphone, avec répétition automatique.</span>
    </section>
    <button class="btn btn-primary btn-block" id="all" ${items.length ? '' : 'disabled'}>${icon('calendar-plus')}Ajouter ${items.length} tâche${items.length > 1 ? 's' : ''} à l’agenda</button>
    ${items.length ? '' : '<p class="calm">Indiquez d’abord la dernière réalisation de vos tâches.</p>'}
    <section class="section">
      <h2 class="section-title">Comment ça marche</h2>
      <ul class="tips">
        <li>${icon('check-circle')}<span><strong>iPhone :</strong> touchez le bouton, puis « Ajouter tout » dans le Calendrier.</span></li>
        <li>${icon('check-circle')}<span><strong>Android :</strong> ouvrez le fichier téléchargé avec Google Agenda.</span></li>
        <li>${icon('info')}<span>Si vous décalez une tâche dans l’app, refaites l’ajout pour mettre l’agenda à jour.</span></li>
      </ul>
      <p class="section-help">La pastille sur l’icône de l’application affiche aussi le nombre de tâches en retard (si votre téléphone le permet).</p>
    </section>`;
  $('#all', root).onclick = async () => {
    const ics = buildIcs(items.map(t => ({ id: t.id, titre: t.nom, date: snap.status.get(t.id).next, freqN: t.freqN, freqUnit: t.freqUnit })), `Carnet Maison · ${snap.logement?.nom || 'Maison'}`);
    const r = await shareOrDownload(new Blob([ics], { type: 'text/calendar' }), 'carnet-maison-agenda.ics', 'Agenda Carnet Maison');
    if (r !== 'cancelled') toast('Ouvrez le fichier pour l’ajouter à votre agenda');
  };
}
