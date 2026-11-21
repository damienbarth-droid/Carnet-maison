// Vérifie que le service worker met en cache tous les fichiers de l'application
// et que les numéros de version concordent.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const assets = [...sw.matchAll(/^\s+'([^']+)',$/gm)].map(m => m[1]);
const walk = d => readdirSync(join(root, d)).flatMap(f => statSync(join(root, d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]);
const expected = ['index.html', 'manifest.webmanifest', ...['css', 'js', 'fonts', 'icons'].flatMap(walk)]
  .filter(f => /\.(html|css|js|woff2|png|svg|webmanifest)$/.test(f));

let ok = true;
for (const f of expected) if (!assets.includes(f)) { console.error(`✗ Absent du cache hors ligne (sw.js) : ${f}`); ok = false; }
for (const a of assets) if (a !== './' && !expected.includes(a)) { console.error(`✗ Fichier inexistant listé dans sw.js : ${a}`); ok = false; }
const swVersion = sw.match(/const VERSION = '([^']+)'/)[1];
const appVersion = readFileSync(join(root, 'js/version.js'), 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
if (new Set([swVersion, appVersion, pkgVersion]).size !== 1) { console.error(`✗ Versions différentes : sw.js ${swVersion}, version.js ${appVersion}, package.json ${pkgVersion}`); ok = false; }
if (!ok) process.exit(1);
console.log(`✓ Service worker : ${assets.length} fichiers, version ${swVersion}`);
