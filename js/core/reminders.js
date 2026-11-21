// Rappels sans serveur : pastille sur l'icône + fichiers agenda (.ics).
import { parseDate, toStr } from './dates.js';

export async function updateBadge(count) {
  try {
    if (!('setAppBadge' in navigator)) return;
    if (count > 0) await navigator.setAppBadge(count); else await navigator.clearAppBadge();
  } catch { /* non pris en charge */ }
}

const RRULE = { jours: 'DAILY', semaines: 'WEEKLY', mois: 'MONTHLY', ans: 'YEARLY' };
const icsEsc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const compact = s => s.replace(/-/g, '');

function fold(line) {
  // Les lignes ICS sont limitées à 75 octets.
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 73) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

/** items : [{ id, titre, date (AAAA-MM-JJ), freqN, freqUnit, description }] */
export function buildIcs(items, calName = 'Carnet Maison') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Carnet Maison//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEsc(calName)}`];
  for (const it of items) {
    const end = parseDate(it.date); end.setDate(end.getDate() + 1);
    lines.push('BEGIN:VEVENT',
      `UID:${it.id}@carnet-maison`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(it.date)}`,
      `DTEND;VALUE=DATE:${compact(toStr(end))}`,
      `SUMMARY:${icsEsc('🏠 ' + it.titre)}`);
    if (it.description) lines.push(`DESCRIPTION:${icsEsc(it.description)}`);
    if (it.freqN && RRULE[it.freqUnit]) lines.push(`RRULE:FREQ=${RRULE[it.freqUnit]};INTERVAL=${it.freqN}`);
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(it.titre)}`, 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
