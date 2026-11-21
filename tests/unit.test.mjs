// Tests unitaires des règles métier (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addFreq, subFreq, addDays, daysBetween, fmtFreq, fmtDate, relDays } from '../js/core/dates.js';
import { taskStatus, healthScore, surface, warrantyStatus, convertTacheV1, backupAge, lastDone, norm, parseNum } from '../js/core/model.js';
import { buildIcs } from '../js/core/reminders.js';

test('addFreq : jours, semaines, mois, années', () => {
  assert.equal(addFreq('2026-01-10', 10, 'jours'), '2026-01-20');
  assert.equal(addFreq('2026-01-10', 2, 'semaines'), '2026-01-24');
  assert.equal(addFreq('2026-01-31', 1, 'mois'), '2026-02-28');
  assert.equal(addFreq('2024-01-31', 1, 'mois'), '2024-02-29');
  assert.equal(addFreq('2026-11-15', 3, 'mois'), '2027-02-15');
  assert.equal(addFreq('2024-02-29', 1, 'ans'), '2025-02-28');
  assert.equal(subFreq('2026-03-31', 1, 'mois'), '2026-02-28');
});

test('dates : écarts et changement d’heure', () => {
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('formats français', () => {
  assert.equal(fmtFreq(1, 'ans'), 'Chaque année');
  assert.equal(fmtFreq(3, 'mois'), 'Tous les 3 mois');
  assert.equal(fmtFreq(2, 'semaines'), 'Toutes les 2 semaines');
  assert.equal(fmtDate('2026-05-01'), '1er mai 2026');
  assert.equal(relDays(0), "aujourd'hui");
  assert.equal(relDays(-3), 'il y a 3 jours');
  assert.equal(relDays(45), 'dans 6 semaines');
});

test('statut de tâche', () => {
  const t = { id: 't', freqN: 1, freqUnit: 'ans', derniereManuelle: '2025-10-01' };
  const s = taskStatus(t, [], '2026-11-01');
  assert.equal(s.next, '2026-10-01');
  assert.equal(s.state, 'retard');
  assert.equal(s.days, -31);
  // Une intervention plus récente l'emporte sur la date manuelle.
  const s2 = taskStatus(t, [{ tacheId: 't', date: '2026-10-20' }], '2026-11-01');
  assert.equal(s2.last, '2026-10-20');
  assert.equal(s2.state, 'ok');
  // Bientôt (≤ 30 jours)
  assert.equal(taskStatus({ ...t, derniereManuelle: '2025-11-20' }, [], '2026-11-01').state, 'bientot');
  // Inconnue
  assert.equal(taskStatus({ id: 'x', freqN: 1, freqUnit: 'ans' }, []).state, 'inconnu');
  // Reportée
  const r = taskStatus({ ...t, reporteAu: '2026-11-15' }, [], '2026-11-01');
  assert.equal(r.next, '2026-11-15');
  assert.equal(r.state, 'bientot');
  assert.equal(lastDone(t, [{ tacheId: 'autre', date: '2026-10-30' }]), '2025-10-01');
});

test('score de santé, surface, garantie, sauvegarde', () => {
  assert.equal(healthScore([{ state: 'ok' }, { state: 'retard' }, { state: 'inconnu' }]), 50);
  assert.equal(healthScore([{ state: 'inconnu' }]), null);
  assert.equal(surface({ longueur: 5.2, largeur: 4.15 }), 21.58);
  assert.equal(surface({ longueur: 5 }), null);
  const w = warrantyStatus({ installation: '2026-01-01', finGarantie: '2026-12-01' }, '2026-11-01');
  assert.equal(w.days, 30); assert.equal(w.soon, true); assert.equal(w.expired, false);
  assert.equal(backupAge(Date.now() - 31 * 86400000), 31);
  assert.equal(backupAge(null), null);
});

test('migration des tâches V0.1', () => {
  let n = 0;
  const { tache, interventions } = convertTacheV1({
    id: 't1', logementId: 'L', nom: 'Ramonage', freqN: 1, freqUnit: 'ans', equipementId: null,
    derniere: '2026-01-05', historique: ['2025-01-03', '2026-01-05', '2026-01-05'], notes: '', majLe: 1,
  }, () => `i${n++}`);
  assert.equal(interventions.length, 2);
  assert.equal(tache.historique, undefined);
  assert.equal(tache.derniereManuelle, null);
  assert.equal(taskStatus(tache, interventions, '2026-11-01').last, '2026-01-05');
  const sansHisto = convertTacheV1({ id: 't2', derniere: '2025-06-01', freqN: 6, freqUnit: 'mois' }, () => 'x');
  assert.equal(sansHisto.tache.derniereManuelle, '2025-06-01');
});

test('outils : recherche et nombres', () => {
  assert.equal(norm('Équipement Chaudière'), 'equipement chaudiere');
  assert.equal(parseNum('4,15'), 4.15);
  assert.equal(parseNum(''), null);
});

test('fichier agenda .ics', () => {
  const ics = buildIcs([{ id: 'a', titre: 'Entretien chaudière, annuel', date: '2026-12-01', freqN: 1, freqUnit: 'ans' }]);
  assert.match(ics, /DTSTART;VALUE=DATE:20261201/);
  assert.match(ics, /RRULE:FREQ=YEARLY;INTERVAL=1/);
  assert.match(ics, /chaudière\\, annuel/);
  assert.ok(ics.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75));
});
