// Parcours complet dans Chromium (Playwright) : migration V0.1, accueil, gestes, formulaires,
// sauvegarde/restauration, hors ligne. Usage : node tests/e2e.mjs [dossier-captures]
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const root = new URL('..', import.meta.url).pathname;
const shots = process.argv[2] || join(root, 'tests', 'captures');
await mkdir(shots, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.pdf': 'application/pdf' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const body = await readFile(join(root, p));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
}).listen(0);
const URL0 = `http://localhost:${server.address().port}/`;

const errors = [];
let step = 0;
const check = (cond, msg) => { step++; if (!cond) { errors.push(`Étape ${step} : ${msg}`); console.error('✗', msg); } else console.log('✓', msg); };
const browser = await chromium.launch();
const phone = { ...devices['iPhone 14'], hasTouch: true };

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ ...phone, acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  return { ctx, page };
}
const settle = p => p.waitForTimeout(450);
/** Navigue vers une route et attend que l'écran soit rendu. */
async function nav(p, hash) {
  await p.evaluate(h => { location.hash = h; }, hash);
  try {
    await p.waitForFunction(h => document.querySelector('#main').dataset.route === h.replace(/^#\/?/, ''), hash, { timeout: 8000 });
  } catch (e) {
    throw new Error(`Navigation vers ${hash} bloquée : ${JSON.stringify(await p.evaluate(() => [location.hash, document.querySelector('#main').dataset.route, document.querySelector('.sheet-wrap') ? 'feuille ouverte' : '']))}`);
  }
  await p.waitForTimeout(450);
}

// ---------- 1. Migration depuis la V0.1 ----------
const { ctx, page } = await newPage({ colorScheme: 'light' });
await page.goto(URL0 + 'manifest.webmanifest');
await page.evaluate(async () => {
  // Base au format V0.1 (structure historique).
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('carnet-maison', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of ['logements', 'pieces', 'equipements', 'taches', 'photos']) {
        const os = d.createObjectStore(s, { keyPath: 'id' });
        os.createIndex('logementId', 'logementId');
      }
      r.transaction.objectStore('photos').createIndex('equipementId', 'equipementId');
      d.createObjectStore('meta', { keyPath: 'key' });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const c = document.createElement('canvas'); c.width = 1600; c.height = 1200;
  const g = c.getContext('2d'); g.fillStyle = '#c87832'; g.fillRect(0, 0, 1600, 1200); g.fillStyle = '#fff'; g.fillRect(500, 300, 600, 600);
  const buf = await (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8))).arrayBuffer();
  const t = db.transaction(['logements', 'pieces', 'equipements', 'taches', 'photos', 'meta'], 'readwrite');
  const L = 'log-1';
  t.objectStore('logements').put({ id: L, nom: 'Maison', creeLe: 1 });
  t.objectStore('pieces').put({ id: 'p1', logementId: L, nom: 'Cuisine', longueur: 4, largeur: 3.5, hauteur: 2.5, notes: '', majLe: 1 });
  t.objectStore('equipements').put({ id: 'e1', logementId: L, nom: 'Chaudière', pieceId: 'p1', marque: 'Test 3000', installation: '2022-03-01', finGarantie: new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10), notes: '', majLe: 1 });
  t.objectStore('photos').put({ id: 'ph1', logementId: L, equipementId: 'e1', type: 'image/jpeg', data: buf, ajouteLe: 1 });
  const ago = d => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
  t.objectStore('taches').put({ id: 't1', logementId: L, nom: 'Entretien chaudière', equipementId: 'e1', freqN: 1, freqUnit: 'ans', derniere: ago(400), historique: [ago(765), ago(400)], notes: '', majLe: 1 });
  t.objectStore('taches').put({ id: 't2', logementId: L, nom: 'Nettoyage bouches VMC', equipementId: null, freqN: 3, freqUnit: 'mois', derniere: ago(80), historique: [ago(80)], notes: '', majLe: 1 });
  t.objectStore('taches').put({ id: 't3', logementId: L, nom: 'Ramonage', equipementId: null, freqN: 1, freqUnit: 'ans', derniere: null, historique: [], notes: '', majLe: 1 });
  t.objectStore('meta').put({ key: 'logementCourant', value: L });
  t.objectStore('meta').put({ key: 'accueilFait', value: true });
  t.objectStore('meta').put({ key: 'derniereSauvegarde', value: Date.now() - 40 * 864e5 });
  await new Promise(r => { t.oncomplete = r; });
  db.close();
});
await page.goto(URL0);
await page.waitForSelector('.hero-card');
await settle(page);
check(await page.locator('.section-title.late').count() === 1, 'Migration : la tâche en retard est affichée');
check((await page.locator('.backup-row.alert').textContent()).includes('il y a 40 jours'), 'Alerte de sauvegarde au-delà de 30 jours');
check(await page.locator('[data-known]').count() === 1, 'Tâche sans date dans « À compléter »');
await page.waitForTimeout(900);
await page.screenshot({ path: join(shots, '01-accueil-clair.png'), fullPage: true });
const hist = await page.evaluate(async () => {
  const db = await new Promise(r => { const q = indexedDB.open('carnet-maison'); q.onsuccess = () => r(q.result); });
  const all = await new Promise(r => { const q = db.transaction('interventions').objectStore('interventions').getAll(); q.onsuccess = () => r(q.result); });
  db.close(); return all.length;
});
check(hist === 3, `Migration : 3 réalisations historiques converties (${hist})`);

// ---------- 2. Fait + Annuler ----------
await page.locator('.task-card.tone-late [data-done]').first().click();
await page.waitForSelector('.toast.show button');
await page.locator('.toast button').click();
await settle(page);
check(await page.locator('.task-card.tone-late').count() === 1, '« Annuler » restaure la tâche en retard');

// ---------- 3. Glisser à droite = fait ----------
const card = page.locator('.task-card.tone-late .swipe-face').first();
const box = await card.boundingBox();
await page.mouse.move(box.x + 40, box.y + 30);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 40 + i * 28, box.y + 32);
await page.mouse.up();
await page.waitForTimeout(900);
check(await page.locator('.task-card.tone-late').count() === 0, 'Glisser vers la droite marque la tâche comme faite');

// ---------- 4. Compléter une date inconnue ----------
await page.locator('[data-known] [data-ago="12"]').click();
await settle(page);
check(await page.locator('[data-known]').count() === 0, 'Raccourci « Il y a 1 an » renseigne la date');

// ---------- 5. Pièce ----------
await nav(page, '#/pieces/nouveau');
await page.fill('input[name=nom]', 'Salon');
await page.fill('input[name=longueur]', '5,2');
await page.fill('input[name=largeur]', '4,15');
check((await page.textContent('#surf')).includes('21,58'), 'Surface calculée 21,58 m²');
await page.click('button[type=submit]');
await page.waitForURL(/#\/pieces\/(?!nouveau)[\w-]+$/);
await settle(page);
await page.screenshot({ path: join(shots, '02-piece.png'), fullPage: true });

// ---------- 6. Artisan ----------
await nav(page, '#/artisans/nouveau');
await page.fill('input[name=nom]', 'Dupont Chauffage');
await page.fill('input[name=metier]', 'Chauffagiste');
await page.fill('input[name=telephone]', '01 23 45 67 89');
await page.click('button[type=submit]');
await page.waitForURL(/#\/artisans\/(?!nouveau)[\w-]+$/);

// ---------- 7. Équipement avec photo + document ----------
await nav(page, '#/equipements/nouveau');
await page.fill('input[name=nom]', 'Ballon d’eau chaude');
await page.selectOption('select[name=pieceId]', { label: 'Salon' });
await page.click('[data-g="5"]');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
await page.setInputFiles('#file', { name: 'photo.png', mimeType: 'image/png', buffer: png });
await page.waitForSelector('.photo-thumb img');
await page.click('button[type=submit]');
await page.waitForURL(/#\/equipements\/(?!nouveau)[\w-]+$/);
await page.setInputFiles('#doc-input', { name: 'facture.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
await page.waitForSelector('.row-card.doc');
check(true, 'Équipement créé avec photo et document');

// Fiche de l'équipement migré (photo V0.1 → miniature)
await nav(page, '#/equipements');
await page.waitForTimeout(1800);
await nav(page, '#/equipements/e1');
await page.waitForSelector('.gallery img');
await settle(page);
await page.screenshot({ path: join(shots, '03-equipement.png'), fullPage: true });
await nav(page, '#/equipements');
await page.waitForTimeout(500);
check(await page.locator('.eq-thumb img').count() === 2, 'Miniatures générées pour la liste (y compris photo V0.1)');
await page.screenshot({ path: join(shots, '04-equipements.png'), fullPage: true });

// ---------- 8. Tâche : fait avec coût + artisan ----------
await nav(page, '#/entretien/t2');
await page.waitForSelector('#done');
await page.click('#done');
await page.fill('.sheet input[name=cout]', '89,90');
await page.selectOption('.sheet select[name=contactId]', { label: 'Dupont Chauffage' });
await page.click('.sheet button[type=submit]');
await page.waitForTimeout(900);
check((await page.locator('.timeline').textContent()).includes('89,90'), 'Intervention avec coût dans l’historique');
await page.screenshot({ path: join(shots, '05-tache.png'), fullPage: true });

// ---------- 9. Reporter (glisser à gauche) ----------
await nav(page, '#/entretien');
await settle(page);
const c2 = page.locator('.task-card .swipe-face').first();
const b2 = await c2.boundingBox();
await page.mouse.move(b2.x + b2.width - 30, b2.y + 30);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(b2.x + b2.width - 30 - i * 26, b2.y + 32);
await page.mouse.up();
await page.waitForSelector('.sheet [data-d]');
await page.waitForTimeout(400);
await page.screenshot({ path: join(shots, '06-reporter.png') });
await page.locator('.sheet [data-d]').nth(2).click();
await settle(page);
check((await page.locator('.toast').textContent()).includes('Reportée'), 'Glisser vers la gauche permet de reporter');

// ---------- 10. Recherche ----------
await nav(page, '#/recherche');
await page.fill('#q', 'chaudiere');
check(await page.locator('#results .row-card').count() >= 2, 'Recherche sans accents');

// ---------- 11. Ajout rapide ----------
await page.goto(URL0);
await settle(page);
await page.click('#fab');
await page.waitForSelector('.sheet .menu-item');
await page.waitForTimeout(400);
await page.screenshot({ path: join(shots, '07-ajout-rapide.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// ---------- 12. Export ----------
await nav(page, '#/reglages/sauvegarde');
await page.click('#exp');
await page.waitForSelector('.sheet [data-save]');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.sheet [data-save]')]);
const backupPath = join(shots, 'sauvegarde.json');
await dl.saveAs(backupPath);
await page.waitForSelector('.toast.show:has-text("Sauvegarde enregistrée")');
const json = JSON.parse(await readFile(backupPath, 'utf8'));
check(json.format === 2 && json.data.photos.length === 2 && json.data.documents.length === 1 && json.data.contacts.length === 1, 'Export complet (photos, documents, artisans)');
await page.goto(URL0);
await settle(page);
check(!(await page.locator('.backup-row').getAttribute('class')).includes('alert'), 'Alerte de sauvegarde levée après export');

// ---------- 13. Rapport ----------
await nav(page, '#/rapport');
await page.waitForSelector('.report table');
await page.screenshot({ path: join(shots, '08-rapport.png'), fullPage: true });

// ---------- 14. Hors ligne ----------
await page.reload();
await page.waitForFunction(() => navigator.serviceWorker.controller);
await ctx.setOffline(true);
await nav(page, '#/pieces');
await page.reload();
await page.waitForSelector('.row-card');
check(true, 'Fonctionne hors ligne');
await ctx.setOffline(false);

// ---------- 15. Restauration dans un appareil vierge (mode sombre) ----------
const b = await newPage({ colorScheme: 'dark' });
await b.page.goto(URL0);
await b.page.waitForSelector('.welcome');
await b.page.waitForTimeout(700);
await b.page.screenshot({ path: join(shots, '09-bienvenue-sombre.png'), fullPage: true });
await b.page.click('.restore-link');
await b.page.waitForSelector('#imp', { state: 'attached' });
await b.page.setInputFiles('#imp', backupPath);
await b.page.waitForSelector('.sheet [data-ok]');
await b.page.click('.sheet [data-ok]');
await b.page.waitForSelector('.hero-card');
await b.page.waitForTimeout(1200);
await b.page.screenshot({ path: join(shots, '10-accueil-sombre.png'), fullPage: true });
await nav(b.page, '#/equipements/e1');
await b.page.waitForSelector('.gallery img');
check(true, 'Restauration complète sur un nouvel appareil');
await b.page.waitForTimeout(500);
await b.page.screenshot({ path: join(shots, '11-equipement-sombre.png'), fullPage: true });

// ---------- 16. Premier lancement : suggestions ----------
const c = await newPage({ colorScheme: 'light', ...devices['Pixel 7'], hasTouch: true });
await c.page.goto(URL0);
await c.page.waitForSelector('.pick');
await c.page.locator('.pick').nth(1).click();
check((await c.page.textContent('#n')) === '4', 'Décocher une suggestion met à jour le compteur');
await c.page.click('#go');
await c.page.waitForSelector('.hero-card');
check(await c.page.locator('[data-known]').count() === 4, '4 tâches suggérées ajoutées');
await nav(c.page, '#/entretien/nouveau');
await c.page.waitForTimeout(500);
await c.page.screenshot({ path: join(shots, '12-formulaire-tache.png'), fullPage: true });

await browser.close();
server.close();
if (errors.length) { console.error('\nÉCHECS / ERREURS :\n' + errors.join('\n')); process.exit(1); }
console.log(`\nTout est vert. Captures : ${shots}`);
