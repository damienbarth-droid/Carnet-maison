// Fonctions de dates pures (format 'AAAA-MM-JJ', heure locale). Testées dans tests/unit.test.mjs.
const pad = n => String(n).padStart(2, '0');

export const toStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const today = () => toStr(new Date());
export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return toStr(d); };
export const maxDate = (...ds) => ds.filter(isDate).sort().pop() || null;

export const UNITS = {
  jours: { one: 'jour', many: 'jours' },
  semaines: { one: 'semaine', many: 'semaines' },
  mois: { one: 'mois', many: 'mois' },
  ans: { one: 'an', many: 'ans' },
};

/** Ajoute une fréquence ; pour les mois/années, le jour est ramené au dernier jour du mois si besoin (31 janv. + 1 mois = 28/29 févr.). */
export function addFreq(s, n, unit) {
  const d = parseDate(s);
  if (unit === 'jours') d.setDate(d.getDate() + n);
  else if (unit === 'semaines') d.setDate(d.getDate() + 7 * n);
  else {
    const months = unit === 'mois' ? n : 12 * n;
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
  }
  return toStr(d);
}

/** Retire une fréquence (utilisé pour les raccourcis « fait il y a 6 mois »). */
export function subFreq(s, n, unit) {
  if (unit === 'jours') return addDays(s, -n);
  if (unit === 'semaines') return addDays(s, -7 * n);
  return addFreq(s, -n, unit);
}

export function fmtFreq(n, u) {
  const unit = UNITS[u] || { one: u, many: u };
  const debut = u === 'semaines' ? 'Toutes les' : 'Tous les';
  if (n > 1) return `${debut} ${n} ${unit.many}`;
  return u === 'semaines' ? 'Chaque semaine' : u === 'jours' ? 'Chaque jour' : u === 'mois' ? 'Chaque mois' : 'Chaque année';
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function fmtDate(s, { short = false, year = true } = {}) {
  if (!isDate(s)) return '—';
  const d = parseDate(s);
  const m = (short ? MOIS : MOIS_LONG)[d.getMonth()];
  const showYear = year === true || (year === 'auto' && d.getFullYear() !== new Date().getFullYear());
  return `${d.getDate() === 1 ? '1er' : d.getDate()} ${m}${showYear ? ' ' + d.getFullYear() : ''}`;
}
export const monthName = (i, short = false) => (short ? MOIS : MOIS_LONG)[i];

export function relDays(n) {
  if (n === 0) return "aujourd'hui";
  if (n === 1) return 'demain';
  if (n === -1) return 'hier';
  const a = Math.abs(n);
  let txt;
  if (a < 14) txt = `${a} jours`;
  else if (a < 60) txt = `${Math.round(a / 7)} semaines`;
  else if (a < 730) txt = `${Math.round(a / 30.44)} mois`;
  else txt = `${Math.round(a / 365.25)} ans`;
  return n > 0 ? `dans ${txt}` : `il y a ${txt}`;
}
