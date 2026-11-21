// Accueil : tableau de bord.
import * as repo from '../core/repo.js';
import { today, addDays, fmtDate, daysBetween, parseDate, monthName } from '../core/dates.js';
import { healthScore, warrantyStatus, backupAge, fmtEur, BACKUP_ALERT_DAYS, SOON_DAYS } from '../core/model.js';
import { updateBadge } from '../core/reminders.js';
import { esc, ring, chooseSheet } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { chrome, go, refresh } from '../ui/nav.js';
import { taskCard, wireTaskCards } from '../ui/components.js';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
}

export async function render({ root }) {
  chrome({
    title: 'Accueil', tab: 'accueil',
    actions: [
      { icon: 'magnifying-glass', label: 'Rechercher', href: '#/recherche' },
      { icon: 'gear', label: 'Réglages', href: '#/reglages' },
    ],
  });
  const snap = await repo.snapshot();
  const [lastBackup, logements] = await Promise.all([repo.getMeta('derniereSauvegarde'), repo.logements()]);
  const t0 = today();
  const eqOf = t => snap.equipements.find(e => e.id === t.equipementId);
  const st = t => snap.status.get(t.id);

  const late = snap.taches.filter(t => st(t).state === 'retard');
  const soon = snap.taches.filter(t => st(t).state === 'bientot');
  const unknown = snap.taches.filter(t => st(t).state === 'inconnu');
  const warranties = snap.equipements
    .map(e => ({ e, w: warrantyStatus(e, t0) }))
    .filter(x => x.w?.soon)
    .sort((a, b) => a.w.days - b.w.days);
  const year = new Date().getFullYear();
  const spent = snap.interventions.filter(i => i.date.startsWith(String(year))).reduce((s, i) => s + (i.cout || 0), 0);
  const score = healthScore([...snap.status.values()]);
  updateBadge(late.length);

  // Message principal
  let headline, tone;
  if (!snap.taches.length) { headline = 'Ajoutez vos premières tâches d’entretien'; tone = 'muted'; }
  else if (late.length) { headline = `${late.length} tâche${late.length > 1 ? 's' : ''} en retard`; tone = 'late'; }
  else if (soon.length) { headline = `Tout est à jour · ${soon.length} à prévoir bientôt`; tone = 'ok'; }
  else if (unknown.length && unknown.length === snap.taches.length) { headline = 'Indiquez quand vos tâches ont été faites'; tone = 'muted'; }
  else { headline = 'Votre maison est à jour'; tone = 'ok'; }

  // Sauvegarde
  const age = backupAge(lastBackup);
  const backupAlert = age == null || age > BACKUP_ALERT_DAYS;
  const backupTxt = age == null ? 'Aucune sauvegarde pour l’instant'
    : age === 0 ? 'Dernière sauvegarde aujourd’hui'
    : `Dernière sauvegarde il y a ${age} jour${age > 1 ? 's' : ''}`;

  // Frise des 12 prochaines semaines
  const weeks = Array.from({ length: 12 }, (_, i) => ({ start: addDays(t0, i * 7), items: [] }));
  for (const t of snap.taches) {
    const s = st(t);
    if (!s.next) continue;
    const idx = s.state === 'retard' ? 0 : Math.floor(daysBetween(t0, s.next) / 7);
    if (idx >= 0 && idx < 12) weeks[idx].items.push(t);
  }
  const maxW = Math.max(1, ...weeks.map(w => w.items.length));

  const logement = snap.logement;
  root.innerHTML = `
    <header class="page-head home-head">
      <button class="logement-switch" type="button" id="switch-logement">
        ${icon('house')}<span>${esc(logement?.nom || 'Maison')}</span>${logements.length > 1 ? icon('caret-down') : ''}
      </button>
      <h1>${greeting()}</h1>
      <p class="page-sub">${esc(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase()))}</p>
    </header>

    <section class="hero-card tone-${tone}">
      ${ring(score, { tone: score == null ? 'muted' : score >= 80 ? 'ok' : score >= 50 ? 'soon' : 'late', label: 'santé' })}
      <div class="hero-txt">
        <strong>${esc(headline)}</strong>
        <span>${snap.taches.length ? `${snap.taches.length} tâche${snap.taches.length > 1 ? 's' : ''} suivie${snap.taches.length > 1 ? 's' : ''} · ${snap.equipements.length} équipement${snap.equipements.length > 1 ? 's' : ''}` : 'Commencez par le bouton +'}</span>
      </div>
    </section>

    <div class="bento stagger">
      <a class="tile tile-late ${late.length ? 'is-on' : ''}" href="#/entretien?filtre=retard">
        <span class="tile-ico">${icon('warning-circle')}</span>
        <span class="tile-num" data-count="${late.length}">0</span>
        <span class="tile-label">En retard</span>
      </a>
      <a class="tile tile-soon" href="#/entretien?filtre=bientot">
        <span class="tile-ico">${icon('hourglass')}</span>
        <span class="tile-num" data-count="${soon.length}">0</span>
        <span class="tile-label">Dans les ${SOON_DAYS} jours</span>
      </a>
      <a class="tile tile-warn" href="#/equipements?filtre=garantie">
        <span class="tile-ico">${icon('shield-check')}</span>
        <span class="tile-num" data-count="${warranties.length}">0</span>
        <span class="tile-label">Garanties à surveiller</span>
      </a>
      <a class="tile tile-money" href="#/rapport">
        <span class="tile-ico">${icon('currency-eur')}</span>
        <span class="tile-num"><span data-count="${Math.round(spent)}">0</span>&nbsp;€</span>
        <span class="tile-label">Dépensé en ${year}</span>
      </a>
    </div>

    <a class="backup-row ${backupAlert ? 'alert' : ''}" href="#/reglages/sauvegarde">
      <span class="backup-ico">${icon(backupAlert ? 'warning' : 'cloud-check')}</span>
      <span class="backup-txt"><strong>${esc(backupTxt)}</strong>${backupAlert ? '<small>Vos données ne sont que sur cet appareil. Exportez une sauvegarde.</small>' : ''}</span>
      ${icon('caret-right', 'caret')}
    </a>

    ${late.length ? `
    <section class="section">
      <h2 class="section-title late">${icon('warning-circle')}En retard <span class="count">${late.length}</span></h2>
      <div class="stack stagger">${late.map(t => taskCard(t, st(t), eqOf(t))).join('')}</div>
    </section>` : ''}

    <section class="section">
      <h2 class="section-title">À faire dans les ${SOON_DAYS} jours <span class="count">${soon.length}</span></h2>
      ${soon.length ? `<div class="stack stagger">${soon.map(t => taskCard(t, st(t), eqOf(t))).join('')}</div>`
        : `<p class="calm">${icon('smiley')}Rien de prévu ces 30 prochains jours.</p>`}
    </section>

    ${unknown.length ? `
    <section class="section">
      <h2 class="section-title">À compléter <span class="count">${unknown.length}</span></h2>
      <p class="section-help">Indiquez quand ces tâches ont été faites pour la dernière fois : l’app calculera la suite.</p>
      <div class="stack stagger">${unknown.map(t => taskCard(t, st(t), eqOf(t), { compact: true })).join('')}</div>
    </section>` : ''}

    <section class="section">
      <h2 class="section-title">Garanties qui expirent <span class="count">${warranties.length}</span></h2>
      ${warranties.length ? `<div class="stack stagger">${warranties.map(({ e, w }) => `
        <a class="row-card" href="#/equipements/${esc(e.id)}">
          <span class="row-ico tone-bg-warn">${icon('shield-check')}</span>
          <span class="row-txt"><strong>${esc(e.nom)}</strong><small>Fin le ${fmtDate(e.finGarantie)} · ${w.days === 0 ? "aujourd'hui" : `dans ${w.days} jour${w.days > 1 ? 's' : ''}`}</small></span>
          ${icon('caret-right', 'caret')}
        </a>`).join('')}</div>`
        : `<p class="calm">${icon('shield-check')}Aucune garantie n’expire dans les 60 jours.</p>`}
    </section>

    ${snap.taches.some(t => st(t).next) ? `
    <section class="section">
      <h2 class="section-title">Les 12 prochaines semaines</h2>
      <div class="weeks" role="img" aria-label="Nombre de tâches prévues par semaine">
        ${weeks.map((w, i) => {
          const d = parseDate(w.start);
          const label = i === 0 ? 'Cette sem.' : (d.getDate() <= 7 || i === 1) ? monthName(d.getMonth(), true) : '';
          return `<div class="week ${w.items.length ? 'has' : ''} ${i === 0 && late.length ? 'late' : ''}" title="${esc(w.items.map(t => t.nom).join(', '))}">
            <span class="week-bar" style="--h:${w.items.length ? Math.max(18, (w.items.length / maxW) * 100) : 6}%"><span>${w.items.length || ''}</span></span>
            <small>${label}</small>
          </div>`;
        }).join('')}
      </div>
    </section>` : ''}

    <section class="section">
      <h2 class="section-title">Accès rapide</h2>
      <div class="quick stagger">
        <a class="quick-btn" href="#/pieces"><span class="quick-ico q1">${icon('door')}</span>Pièces<small>${snap.pieces.length}</small></a>
        <a class="quick-btn" href="#/equipements"><span class="quick-ico q2">${icon('wrench')}</span>Équipements<small>${snap.equipements.length}</small></a>
        <a class="quick-btn" href="#/entretien"><span class="quick-ico q3">${icon('calendar-check')}</span>Entretien<small>${snap.taches.length}</small></a>
        <a class="quick-btn" href="#/artisans"><span class="quick-ico q4">${icon('address-book')}</span>Artisans<small>${snap.contacts.length}</small></a>
      </div>
    </section>`;

  wireTaskCards(root, snap);
  root.querySelector('#switch-logement').addEventListener('click', async () => {
    const v = await chooseSheet({
      title: 'Logement',
      options: [
        ...logements.map(l => ({ value: l.id, label: l.nom, icon: 'house', selected: l.id === repo.logementId() })),
        { value: '__manage', label: 'Gérer les logements', sub: 'Ajouter, renommer, supprimer', icon: 'buildings' },
      ],
    });
    if (!v) return;
    if (v === '__manage') return go('#/reglages/logements');
    if (v !== repo.logementId()) { await repo.switchLogement(v); refresh(); }
  });
}
