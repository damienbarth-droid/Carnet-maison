// Composants partagés entre les écrans.
import * as repo from '../core/repo.js';
import { fmtDate, fmtFreq, relDays, today, addDays, addFreq, maxDate } from '../core/dates.js';
import { parseNum, fmtEur } from '../core/model.js';
import { esc, toast, haptic, sheet, $, bar, attachSwipe } from './dom.js';
import { icon } from './icons.js';
import { refresh } from './nav.js';

export function pageHead(title, sub = '', extra = '') {
  return `<header class="page-head">
    <h1>${esc(title)}</h1>
    ${sub ? `<p class="page-sub">${sub}</p>` : ''}
    ${extra}
  </header>`;
}

export const STATE = {
  retard: { label: 'En retard', tone: 'late' },
  bientot: { label: 'Bientôt', tone: 'soon' },
  ok: { label: 'À jour', tone: 'ok' },
  inconnu: { label: 'À compléter', tone: 'muted' },
};

export function pill(state, text) {
  const s = STATE[state] || STATE.inconnu;
  return `<span class="pill pill-${s.tone}">${esc(text || s.label)}</span>`;
}

export function whenText(st) {
  if (st.state === 'inconnu') return 'Dernière réalisation inconnue';
  if (st.state === 'retard') return `En retard de ${relDays(-st.days).replace('dans ', '').replace('demain', '1 jour')}`;
  return `${st.days === 0 ? "Aujourd'hui" : fmtDate(st.next, { year: 'auto' })} · ${relDays(st.days)}`;
}

const TASK_ICONS = [
  [/chaudi|chauff|radiat|po[eê]le/i, 'fire'], [/vmc|ventil|a[ée]ration|clim/i, 'fan'], [/ramon|chemin/i, 'broom'],
  [/goutti|toit|toiture/i, 'drop'], [/fum[ée]e|d[ée]tecteur|alarme/i, 'bell'], [/eau|plomb|fuite|adouciss|ballon/i, 'drop'],
  [/[ée]lectri|disjonct|tableau/i, 'lightning'], [/filtre|nettoy/i, 'sparkle'], [/jardin|haie|tonte/i, 'sparkle'],
];
export function taskIcon(nom) { return (TASK_ICONS.find(([re]) => re.test(nom)) || [null, 'calendar-check'])[1]; }

/** Carte de tâche avec glisser (droite = fait, gauche = reporter). */
export function taskCard(t, st, eq, { compact = false } = {}) {
  const tone = STATE[st.state].tone;
  return `<article class="task-card tone-${tone}" data-task="${esc(t.id)}">
    <div class="swipe-bg swipe-bg-right">${icon('check-circle')}<span>Fait</span></div>
    <div class="swipe-bg swipe-bg-left"><span>Reporter</span>${icon('clock')}</div>
    <div class="swipe-face">
      <a class="task-main" href="#/entretien/${esc(t.id)}">
        <span class="task-ico tone-bg-${tone}">${icon(taskIcon(t.nom))}</span>
        <span class="task-txt">
          <strong>${esc(t.nom)}</strong>
          <span class="task-when ${tone}">${esc(whenText(st))}</span>
          ${!compact ? `<span class="task-meta">${esc([eq?.nom, fmtFreq(t.freqN, t.freqUnit)].filter(Boolean).join(' · '))}</span>` : ''}
        </span>
      </a>
      ${st.state === 'inconnu'
        ? `<div class="chips" data-known="${esc(t.id)}">
            <span class="chips-label">Dernière fois ?</span>
            <button class="chip" data-ago="0">Récemment</button>
            <button class="chip" data-ago="6">Il y a 6 mois</button>
            <button class="chip" data-ago="12">Il y a 1 an</button>
            <button class="chip" data-ago="date">${icon('calendar-dots')}Date</button>
          </div>`
        : `<button class="done-btn" data-done="${esc(t.id)}" aria-label="Marquer « ${esc(t.nom)} » comme faite aujourd'hui">${icon('check')}<span>Fait</span></button>${bar(st.progress, tone)}`}
    </div>
  </article>`;
}

/** Branche les interactions de toutes les cartes de tâche contenues dans root. */
export function wireTaskCards(root, snap) {
  root.querySelectorAll('.task-card').forEach(card => {
    const id = card.dataset.task;
    const t = snap.taches.find(x => x.id === id);
    const st = snap.status.get(id);
    if (!t) return;
    attachSwipe(card, {
      onRight: st.state === 'inconnu' ? null : () => quickDone(t),
      onLeft: st.state === 'inconnu' ? null : () => postponeSheet(t, st),
    });
    card.querySelector('[data-done]')?.addEventListener('click', e => { e.preventDefault(); celebrate(card); quickDone(t); });
    card.querySelectorAll('[data-ago]').forEach(b => b.addEventListener('click', async e => {
      e.preventDefault();
      const v = b.dataset.ago;
      let date;
      if (v === 'date') {
        date = await pickDate('Date de la dernière réalisation', today());
        if (!date) return;
      } else date = v === '0' ? today() : addFreq(today(), -Number(v), 'mois');
      await repo.save('taches', { ...t, derniereManuelle: date });
      haptic();
      toast(`Noté : ${t.nom.toLowerCase()} faite le ${fmtDate(date)}`);
      refresh();
    }));
  });
}

function celebrate(card) {
  card.classList.add('celebrate');
  haptic(18);
}

export async function quickDone(t) {
  const undo = await repo.markDone(t.id);
  haptic(18);
  toast(`« ${t.nom} » : c'est fait !`, {
    action: 'Annuler',
    onAction: async () => { await undo(); toast('Annulé'); refresh(); },
  });
  setTimeout(refresh, 220);
}

/** Feuille « Marquer comme fait » avec détails (date, coût, artisan, note). */
export async function doneSheet(t, snap) {
  const contacts = snap.contacts;
  const res = await sheet(`
    <div class="sheet-hero ok">${icon('check-circle')}</div>
    <h2 class="sheet-title">${esc(t.nom)}</h2>
    <form class="form" id="done-form">
      <label>Date<input type="date" name="date" value="${today()}" max="${today()}" required></label>
      <div class="row2">
        <label>Coût (€)<input name="cout" inputmode="decimal" placeholder="0" autocomplete="off"></label>
        <label>Artisan
          <select name="contactId"><option value="">Moi-même</option>
          ${contacts.map(c => `<option value="${esc(c.id)}">${esc(c.nom)}</option>`).join('')}</select>
        </label>
      </div>
      <label>Note<textarea name="note" rows="2" placeholder="Pièce changée, remarque…"></textarea></label>
      <button class="btn btn-primary" type="submit">${icon('check')}Enregistrer</button>
    </form>`, (root, close) => {
    $('#done-form', root).addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target;
      close({ date: f.date.value || today(), cout: parseNum(f.cout.value), contactId: f.contactId.value || null, note: f.note.value.trim() });
    });
  }, { label: 'Marquer comme fait' });
  if (!res) return;
  const undo = await repo.markDone(t.id, res);
  haptic(18);
  toast(`Enregistré${res.cout ? ` · ${fmtEur(res.cout)}` : ''}`, { action: 'Annuler', onAction: async () => { await undo(); refresh(); } });
  refresh();
}

/** Feuille « Reporter ». */
export async function postponeSheet(t, st) {
  const base = maxDate(today(), st.next) || today();
  const opts = [
    ['1 semaine', addDays(base, 7)], ['2 semaines', addDays(base, 14)],
    ['1 mois', addFreq(base, 1, 'mois')], ['3 mois', addFreq(base, 3, 'mois')],
  ];
  const v = await sheet(`
    <div class="sheet-hero soon">${icon('clock')}</div>
    <h2 class="sheet-title">Reporter « ${esc(t.nom)} »</h2>
    <p class="sheet-text">Prévue ${st.next ? 'le ' + fmtDate(st.next) : '—'}</p>
    <div class="grid2">
      ${opts.map(([l, d]) => `<button class="tile-btn" data-d="${d}"><strong>${l}</strong><small>${fmtDate(d, { short: true, year: 'auto' })}</small></button>`).join('')}
    </div>
    <button class="btn btn-ghost" data-pick>${icon('calendar-dots')}Choisir une date</button>`, (root, close) => {
    root.querySelectorAll('[data-d]').forEach(b => { b.onclick = () => close(b.dataset.d); });
    $('[data-pick]', root).onclick = async () => { const d = await pickDate('Reporter au', addDays(base, 7), today()); if (d) close(d); };
  }, { label: 'Reporter' });
  if (!v) { refresh(); return; }
  const before = { ...t };
  await repo.save('taches', { ...t, reporteAu: v });
  toast(`Reportée au ${fmtDate(v, { year: 'auto' })}`, { action: 'Annuler', onAction: async () => { await repo.save('taches', before); refresh(); } });
  refresh();
}

export function pickDate(title, value, min = '') {
  return sheet(`
    <h2 class="sheet-title">${esc(title)}</h2>
    <form class="form" id="pick">
      <input type="date" name="d" value="${value || ''}" ${min ? `min="${min}"` : `max="${today()}"`} required>
      <button class="btn btn-primary" type="submit">Valider</button>
    </form>`, (root, close) => {
    $('#pick', root).addEventListener('submit', e => { e.preventDefault(); close(e.target.d.value || null); });
  }, { label: title });
}

/** Ligne d'information (détails). */
export function infoRow(iconName, label, value) {
  if (value == null || value === '') return '';
  return `<div class="info-row"><span class="info-ico">${icon(iconName)}</span><span class="info-label">${esc(label)}</span><span class="info-value">${value}</span></div>`;
}

export function interventionItem(i, snap, { showTask = true } = {}) {
  const t = snap.taches.find(x => x.id === i.tacheId);
  const e = !t && snap.equipements.find(x => x.id === i.equipementId);
  const c = snap.contacts.find(x => x.id === i.contactId);
  const title = showTask ? (t?.nom || i.titre || e?.nom || 'Intervention') : fmtDate(i.date);
  return `<li class="tl-item" data-inter="${esc(i.id)}">
    <span class="tl-dot"></span>
    <div class="tl-body">
      <div class="tl-top"><strong>${esc(title)}</strong>${i.cout ? `<span class="tl-cost">${fmtEur(i.cout)}</span>` : ''}</div>
      <span class="muted small">${esc([showTask ? fmtDate(i.date) : null, c?.nom].filter(Boolean).join(' · ') || 'Fait moi-même')}</span>
      ${i.note ? `<p class="tl-note">${esc(i.note)}</p>` : ''}
    </div>
  </li>`;
}

/** Champ texte réutilisable. */
export function field(label, name, value = '', attrs = '') {
  return `<label>${esc(label)}<input name="${name}" value="${esc(value ?? '')}" ${attrs}></label>`;
}
