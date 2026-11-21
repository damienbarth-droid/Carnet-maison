// Règles métier pures (sans accès au stockage). Testées dans tests/unit.test.mjs.
import { addFreq, daysBetween, today, maxDate, isDate } from './dates.js';

export const SOON_DAYS = 30;       // « À faire dans les 30 jours »
export const WARRANTY_DAYS = 60;   // « Garanties qui expirent dans les 60 jours »
export const BACKUP_ALERT_DAYS = 30;

/** Dernière réalisation effective : max(date saisie à la main, interventions). */
export function lastDone(tache, interventions = []) {
  return maxDate(tache.derniereManuelle, ...interventions.filter(i => i.tacheId === tache.id).map(i => i.date));
}

/** Statut complet d'une tâche. */
export function taskStatus(tache, interventions = [], ref = today()) {
  const last = lastDone(tache, interventions);
  let next = last ? addFreq(last, tache.freqN, tache.freqUnit) : null;
  if (next && isDate(tache.reporteAu) && tache.reporteAu > next && (!last || tache.reporteAu > last)) next = tache.reporteAu;
  if (!next) return { last: null, next: null, days: null, state: 'inconnu', progress: 0 };
  const days = daysBetween(ref, next);
  const span = Math.max(1, daysBetween(last, next));
  const progress = Math.min(1, Math.max(0, daysBetween(last, ref) / span));
  const state = days < 0 ? 'retard' : days <= SOON_DAYS ? 'bientot' : 'ok';
  return { last, next, days, state, progress };
}

/** Score de santé : part des tâches datées qui ne sont pas en retard (null si aucune). */
export function healthScore(statuses) {
  const dated = statuses.filter(s => s.state !== 'inconnu');
  if (!dated.length) return null;
  return Math.round(100 * dated.filter(s => s.state !== 'retard').length / dated.length);
}

export function surface(p) {
  return (p && p.longueur != null && p.largeur != null) ? Math.round(p.longueur * p.largeur * 100) / 100 : null;
}

export function warrantyStatus(e, ref = today()) {
  if (!isDate(e.finGarantie)) return null;
  const days = daysBetween(ref, e.finGarantie);
  let progress = null;
  if (isDate(e.installation) && e.installation < e.finGarantie) {
    progress = Math.min(1, Math.max(0, daysBetween(e.installation, ref) / daysBetween(e.installation, e.finGarantie)));
  }
  return { days, expired: days < 0, soon: days >= 0 && days <= WARRANTY_DAYS, progress };
}

export function backupAge(lastBackupTs, now = Date.now()) {
  if (!lastBackupTs) return null;
  return Math.floor((now - lastBackupTs) / 86400000);
}

/** Conversion d'une tâche au format V0.1 (historique dans la tâche) vers le format actuel. */
export function convertTacheV1(t, newId) {
  const historique = Array.isArray(t.historique) ? t.historique.filter(isDate) : [];
  const now = t.majLe || Date.now();
  const interventions = [...new Set(historique)].map(date => ({
    id: newId(), logementId: t.logementId, tacheId: t.id, equipementId: t.equipementId || null,
    date, cout: null, contactId: null, note: '', createdAt: now, updatedAt: now,
  }));
  const { historique: _h, derniere, majLe: _m, ...rest } = t;
  const tache = {
    ...rest,
    derniereManuelle: isDate(derniere) && !historique.includes(derniere) ? derniere : null,
    reporteAu: null,
    createdAt: rest.createdAt || now,
    updatedAt: now,
  };
  return { tache, interventions };
}

/** Normalise un texte pour la recherche (sans accents ni casse). */
export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const fmtEur = n => (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: (n % 1) ? 2 : 0 });
export const fmtNum = (n, d = 2) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const parseNum = v => {
  const n = parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
};
