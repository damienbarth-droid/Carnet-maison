# Carnet Maison

Application web installable (PWA), en français, pour tenir le carnet d'entretien d'un logement :
pièces, équipements (avec photos et garanties) et tâches d'entretien récurrentes.

- HTML / CSS / JavaScript sans framework, fonctionne hors ligne (service worker).
- Données stockées **uniquement sur l'appareil** (IndexedDB, stockage persistant demandé).
- Sauvegarde / restauration par fichier JSON (photos incluses en base64).
- Mode sombre automatique.

Aucune donnée personnelle n'est contenue dans ce dépôt.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Coquille de l'application |
| `css/styles.css` | Styles (clair / sombre) |
| `js/db.js` | Accès IndexedDB |
| `js/app.js` | Routeur, écrans, export/import, photos |
| `sw.js` | Service worker (cache hors ligne) |
| `manifest.webmanifest`, `icons/` | Installation sur l'écran d'accueil |

## Modèle de données

Magasins IndexedDB : `logements`, `pieces`, `equipements`, `taches`, `photos`, `meta`.
Chaque élément porte un `logementId` (un seul logement « Maison » en V0.1).

## Publier une nouvelle version

Après modification d'un fichier, incrémenter `VERSION` dans `sw.js` pour forcer la mise à jour du cache.

## Test en local

```sh
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```
