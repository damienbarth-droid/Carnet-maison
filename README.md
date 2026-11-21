# Carnet Maison

Application web installable (PWA), en français : le carnet d'entretien de votre logement.
Pièces, équipements (photos, garanties, documents), entretien récurrent, interventions, artisans.

**Ouvrir l'application :** https://damienbarth-droid.github.io/Carnet-maison/
(puis « Sur l'écran d'accueil » sur iPhone, ou « Installer l'application » sur Android).

- Fonctionne hors ligne. Les données restent sur l'appareil (aucune donnée personnelle dans ce dépôt).
- Sauvegarde / restauration par fichier.
- HTML, CSS et JavaScript sans framework ni étape de build.

## Développement
```sh
npm run serve      # http://localhost:8765
npm test           # tests unitaires + vérification du cache hors ligne
npm run test:e2e   # parcours complet dans Chromium (Playwright)
```
Documentation interne : `CLAUDE.md` (architecture, conventions) et `ROADMAP.md` (versions, suite).

Crédits : icônes [Phosphor](https://phosphoricons.com) (MIT), polices Bricolage Grotesque et Figtree (SIL OFL).
