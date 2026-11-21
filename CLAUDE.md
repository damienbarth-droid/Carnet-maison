# Carnet Maison : mémoire du projet pour Claude

> Lis ce fichier **et `ROADMAP.md`** au début de chaque session. Ils suffisent pour reprendre le projet
> sans relire tout le code. **Mets `ROADMAP.md` à jour à chaque nouvelle version.**

## Le projet
PWA en français, installable sur téléphone, qui sert de carnet d'entretien d'un logement : pièces,
équipements (photos, garanties, documents), tâches d'entretien récurrentes, interventions (coût, artisan),
artisans. Fonctionne hors ligne. Données stockées **uniquement sur l'appareil** (IndexedDB) ; sauvegarde
par fichier JSON.

- Site publié : https://damienbarth-droid.github.io/Carnet-maison/ (GitHub Pages, branche `main`, dossier racine).
- Dépôt : `damienbarth-droid/Carnet-maison`.

## Le propriétaire (important)
- Non-développeur, découvre GitHub et Claude Code. Écrire **en français**, simplement, sans jargon.
- Il veut que Claude soit **autonome sur GitHub** : il a autorisé Claude à créer la demande de fusion (PR)
  **et à la fusionner dans `main`** une fois les tests au vert. Ne lui demander que les vrais choix (A ou B).
- Il envoie souvent des captures d'écran de son téléphone (iPhone / Android) pour signaler un problème.
- Ambition : rendu « SaaS premium », moderne sans être kitsch, fluide, très simple d'usage.

## Façon de travailler
1. Lire `ROADMAP.md` (état actuel, prochaine version, décisions en attente).
2. Coder sur la branche de session, lancer **`npm test`** puis **`npm run test:e2e`** (Playwright déjà installé
   dans l'environnement cloud ; captures dans `tests/captures/`, regarder les principales).
3. Incrémenter la version aux **3 endroits** : `sw.js` (VERSION), `js/version.js`, `package.json`
   (`npm test` vérifie qu'ils concordent). Sans changement de VERSION, les téléphones gardent l'ancienne version.
4. Tout nouveau fichier servi doit figurer dans `ASSETS` de `sw.js` (vérifié par `tests/check-sw.mjs`).
5. Commit, push, PR, fusion dans `main`, puis mettre à jour `ROADMAP.md` (journal des versions).
6. Expliquer au propriétaire ce qui a changé, en langage simple, et ce qu'il doit vérifier sur son téléphone.

## Architecture (sans framework, sans étape de build)
```
index.html            coquille : barre du haut, <main>, barre d'onglets flottante + bouton +
sw.js                 cache hors ligne (cache d'abord), proposition « Mettre à jour »
css/styles.css        tout le style : jetons (clair/sombre), composants, animations, impression
fonts/                Bricolage Grotesque (titres) + Figtree (texte), woff2 variables, licence OFL
js/app.js             routeur (hash), transitions (View Transitions API), démarrage, ajout rapide
js/version.js         APP_VERSION
js/core/dates.js      dates pures 'AAAA-MM-JJ' (addFreq gère fin de mois / bissextile)
js/core/model.js      règles métier pures : taskStatus, healthScore, warrantyStatus, convertTacheV1…
js/core/db.js         IndexedDB v2 + migration depuis v1 ; batch() journalise les suppressions
js/core/repo.js       logement courant, snapshot(), markDone() (renvoie une fonction d'annulation)
js/core/photos.js     redimensionnement 1280 px JPEG 0,8 + miniature 360 px ; backfillThumbs()
js/core/backup.js     export par morceaux (format 2, base64) / import formats 1 et 2
js/core/reminders.js  pastille d'icône (setAppBadge) + fichiers agenda .ics (RRULE)
js/ui/dom.js          toast (avec Annuler), sheet() feuille du bas, confirmSheet, chooseSheet,
                      ring(), bar(), attachSwipe(), emptyState(), shareOrDownload()
js/ui/components.js   pageHead, taskCard (glisser droite = fait, gauche = reporter), doneSheet, postponeSheet…
js/ui/icons.js        icônes Phosphor duotone (MIT) en SVG inline : icon('nom')
js/ui/nav.js          go(), chrome() (titre, retour, actions, onglet actif), refresh()
js/views/*.js         un fichier par écran : home, pieces, equipements, entretien, artisans,
                      reglages (sauvegarde, logements, agenda), recherche, bienvenue, rapport
tests/                unit.test.mjs (node --test), check-sw.mjs, e2e.mjs (Playwright)
```
Une vue = `async function ({ root, params, query })` qui remplit `root` (conteneur vivant, on peut y chercher
des éléments plus tard) et appelle `chrome({...})`. Routes déclarées dans `js/app.js`.

## Modèle de données (IndexedDB `carnet-maison`, version 2)
Tous les enregistrements : `id` (UUID), `logementId`, `createdAt`, `updatedAt`.
- `logements` {nom} — `meta.logementCourant` = logement affiché.
- `pieces` {nom, longueur, largeur, hauteur, notes} — surface calculée, jamais stockée.
- `equipements` {nom, pieceId, marque, installation, finGarantie, notes, couverture (miniature ArrayBuffer)}
- `photos` {equipementId, type, data, thumb, width, height} — ArrayBuffer (fiable sur Safari).
- `documents` {equipementId, nom, type, taille, data}
- `taches` {nom, equipementId, freqN, freqUnit (jours|semaines|mois|ans), derniereManuelle, reporteAu, notes}
- `interventions` {tacheId, equipementId, date, cout, contactId, note} — l'historique.
- `contacts` (artisans) {nom, metier, telephone, email, notes}
- `suppressions` {store, recordId, at} — journal pour une future synchronisation.
- `meta` : logementCourant, accueilFait, derniereSauvegarde (timestamp), miniaturesOK.
Dernière réalisation = max(derniereManuelle, dates des interventions). Prochaine = dernière + fréquence
(ou `reporteAu` si plus tard). États : retard / bientot (≤ 30 j) / ok / inconnu.

## Design
- Fond papier chaud, cartes blanches, accent vert sapin (`--accent`), statuts rouge/ambre/vert.
- Titres en Bricolage Grotesque très gras et serrés ; texte en Figtree. Pas d'emoji dans l'interface.
- Barre d'onglets flottante en verre dépoli, bouton + central. Feuilles du bas au lieu des popups.
- Animations : courbe ressort `--spring`, apparitions en cascade (`.stagger`), anneaux/compteurs animés,
  vibration légère sur Android. Toujours respecter `prefers-reduced-motion`.
- Cibles tactiles ≥ 44 px, boutons principaux 56 px. Tester clair ET sombre, petit écran (≤ 370 px).

## À ne jamais faire
- Mettre des données personnelles dans le dépôt (captures de test exclues par `.gitignore`).
- Ajouter un framework ou une étape de build sans accord du propriétaire.
- Casser la compatibilité des sauvegardes : `readBackup` doit toujours lire les anciens formats.
- Modifier le schéma IndexedDB sans migration dans `db.js` (+ test e2e qui part de l'ancien format).
