// Carnet d'entretien imprimable (Imprimer → Enregistrer en PDF).
import * as repo from '../core/repo.js';
import { fmtDate, fmtFreq, today } from '../core/dates.js';
import { surface, fmtNum, fmtEur, warrantyStatus } from '../core/model.js';
import { esc, $ } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { chrome } from '../ui/nav.js';
import { STATE } from '../ui/components.js';

export async function render({ root }) {
  chrome({ title: 'Carnet PDF', back: '#/reglages' });
  const s = await repo.snapshot();
  const pieceNom = id => s.pieces.find(p => p.id === id)?.nom || '—';
  const eqNom = id => s.equipements.find(e => e.id === id)?.nom || '—';
  const total = s.interventions.reduce((a, i) => a + (i.cout || 0), 0);
  const totalSurf = s.pieces.reduce((a, p) => a + (surface(p) || 0), 0);

  root.innerHTML = `
    <div class="no-print report-toolbar">
      <p class="section-help">Aperçu du carnet. Touchez « Imprimer », puis choisissez « Enregistrer en PDF » (ou, sur iPhone, Partager → Enregistrer dans Fichiers).</p>
      <button class="btn btn-primary btn-block" id="print">${icon('printer')}Imprimer / PDF</button>
    </div>
    <article class="report">
      <header class="report-head">
        <img src="icons/icon.svg" alt="" width="44" height="44">
        <div><h1>Carnet d’entretien · ${esc(s.logement?.nom || 'Maison')}</h1><p>Édité le ${fmtDate(today())}</p></div>
      </header>
      <div class="report-kpis">
        <div><strong>${s.pieces.length}</strong><span>pièces · ${fmtNum(totalSurf)} m²</span></div>
        <div><strong>${s.equipements.length}</strong><span>équipements</span></div>
        <div><strong>${s.interventions.length}</strong><span>interventions</span></div>
        <div><strong>${fmtEur(total)}</strong><span>dépensés au total</span></div>
      </div>

      <h2>Entretien</h2>
      ${s.taches.length ? `<table><thead><tr><th>Tâche</th><th>Fréquence</th><th>Dernière fois</th><th>Prochaine</th><th>État</th></tr></thead><tbody>
        ${s.taches.map(t => { const st = s.status.get(t.id); return `<tr><td>${esc(t.nom)}${t.equipementId ? `<br><small>${esc(eqNom(t.equipementId))}</small>` : ''}</td><td>${esc(fmtFreq(t.freqN, t.freqUnit))}</td><td>${st.last ? fmtDate(st.last, { short: true }) : '—'}</td><td>${st.next ? fmtDate(st.next, { short: true }) : '—'}</td><td>${STATE[st.state].label}</td></tr>`; }).join('')}
      </tbody></table>` : '<p>Aucune tâche.</p>'}

      <h2>Historique des interventions</h2>
      ${s.interventions.length ? `<table><thead><tr><th>Date</th><th>Intervention</th><th>Artisan</th><th class="num">Coût</th></tr></thead><tbody>
        ${s.interventions.map(i => `<tr><td>${fmtDate(i.date, { short: true })}</td><td>${esc(s.taches.find(t => t.id === i.tacheId)?.nom || eqNom(i.equipementId))}${i.note ? `<br><small>${esc(i.note)}</small>` : ''}</td><td>${esc(s.contacts.find(c => c.id === i.contactId)?.nom || '—')}</td><td class="num">${i.cout ? fmtEur(i.cout) : '—'}</td></tr>`).join('')}
      </tbody></table>` : '<p>Aucune intervention enregistrée.</p>'}

      <h2>Équipements</h2>
      ${s.equipements.length ? `<table><thead><tr><th>Équipement</th><th>Pièce</th><th>Marque / modèle</th><th>Installé</th><th>Garantie</th></tr></thead><tbody>
        ${s.equipements.map(e => { const w = warrantyStatus(e); return `<tr><td>${esc(e.nom)}</td><td>${esc(pieceNom(e.pieceId))}</td><td>${esc(e.marque || '—')}</td><td>${e.installation ? fmtDate(e.installation, { short: true }) : '—'}</td><td>${e.finGarantie ? `${w.expired ? 'Expirée' : "Jusqu'au"} ${fmtDate(e.finGarantie, { short: true })}` : '—'}</td></tr>`; }).join('')}
      </tbody></table>` : '<p>Aucun équipement.</p>'}

      <h2>Pièces</h2>
      ${s.pieces.length ? `<table><thead><tr><th>Pièce</th><th class="num">L × l × h (m)</th><th class="num">Surface</th></tr></thead><tbody>
        ${s.pieces.map(p => `<tr><td>${esc(p.nom)}</td><td class="num">${[p.longueur, p.largeur, p.hauteur].map(v => v != null ? fmtNum(v) : '—').join(' × ')}</td><td class="num">${surface(p) != null ? fmtNum(surface(p)) + ' m²' : '—'}</td></tr>`).join('')}
      </tbody></table>` : '<p>Aucune pièce.</p>'}

      ${s.contacts.length ? `<h2>Artisans</h2><table><thead><tr><th>Nom</th><th>Métier</th><th>Téléphone</th></tr></thead><tbody>
        ${s.contacts.map(c => `<tr><td>${esc(c.nom)}</td><td>${esc(c.metier || '—')}</td><td>${esc(c.telephone || '—')}</td></tr>`).join('')}
      </tbody></table>` : ''}
      <footer class="report-foot">Généré avec Carnet Maison</footer>
    </article>`;
  $('#print', root).onclick = () => window.print();
}
