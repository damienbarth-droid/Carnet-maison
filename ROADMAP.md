# Feuille de route : Carnet Maison

> Mise à jour à chaque version. Lire avec `CLAUDE.md`.

## État actuel : V0.4.0 (21/11/2026)
Application complète hors ligne, testée automatiquement (8 tests unitaires + 19 vérifications de bout en bout).
Pas encore testée par le propriétaire sur un vrai téléphone : **à faire en priorité**.

## Prochaine étape : V0.5 « Synchronisation entre appareils » (décision à prendre)
Objectif du propriétaire : retrouver les mêmes données sur iPhone, Android, tablette et ordinateur,
en Wi-Fi comme en données mobiles. L'app reste utilisable hors ligne et se synchronise au retour du réseau.
Options étudiées :
- **A. Compte en ligne (recommandé)** : service type Supabase (gratuit au départ). Connexion par e-mail
  (lien magique, sans mot de passe). Données et photos chiffrées en transit, synchronisation automatique.
  Demande au propriétaire de créer un compte Supabase (guidé pas à pas) et d'autoriser l'hôte réseau.
  Le modèle est prêt : UUID, `updatedAt`, journal `suppressions`.
- B. Fichier de synchronisation dans iCloud Drive / Google Drive : pas de serveur, mais manuel et fragile.
- C. Rester local (sauvegarde manuelle seulement).

## Idées pour la suite (non priorisées)
- Notifications push (nécessite le serveur de la V0.5).
- Partage du logement avec un proche (même compte de foyer).
- Lecture d'une facture photographiée pour pré-remplir un équipement (marque, date, garantie).
- Plan de la maison / pièces dessinées.
- Budget prévisionnel annuel d'entretien.
- Widget écran d'accueil (limité pour une PWA).

## Journal des versions
### V0.4.0 (21/11/2026) : refonte complète (V0.2 + V0.3 + V0.4 en un lot)
**Fiabilité**
- « Annuler » après « Fait » et après « Reporter ».
- Mise à jour propre : bandeau « Nouvelle version disponible → Mettre à jour ».
- Sauvegarde construite par morceaux (moins de mémoire) ; la date de sauvegarde n'est notée qu'une fois
  le fichier réellement enregistré/partagé ; partage iPhone dans un geste dédié.
- Fenêtres intégrées (feuilles du bas) au lieu des popups du navigateur.
- Migration automatique des données V0.1 (historique → interventions, miniatures des photos).
- Corrections trouvées par les tests : message invisible qui bloquait les appuis en bas d'écran,
  rendu concurrent qui pouvait afficher un ancien écran.
**Architecture**
- Code découpé (core / ui / views), règles métier pures et testées, tests automatiques sur GitHub (Actions).
**Fonctionnalités**
- Interventions avec date, coût, artisan, note ; total dépensé par tâche, équipement, artisan, année.
- Artisans (appel direct, e-mail, historique). Documents joints (PDF, images) aux équipements.
- Reporter une tâche (1 semaine → 3 mois ou date libre). Raccourcis « dernière fois ? » pour les tâches sans date.
- Rappels : fichier agenda .ics (une tâche ou toutes, avec répétition) + pastille sur l'icône.
- Recherche globale sans accents. Plusieurs logements (ajout, renommage, suppression, bascule).
- Carnet d'entretien imprimable / PDF.
**Design**
- Nouvelle identité : typo Bricolage Grotesque + Figtree, icônes Phosphor, nouvelle icône d'app.
- Tableau de bord : score de santé animé, tuiles, frise des 12 semaines, bouton + central.
- Gestes : glisser une tâche à droite (fait) ou à gauche (reporter), glisser une feuille vers le bas pour fermer.
- Transitions entre écrans, apparitions en cascade, écrans vides illustrés, mode sombre retravaillé.

### V0.1 (01/11/2026)
Première version : pièces, équipements, entretien, sauvegarde JSON, mode sombre, hors ligne.
