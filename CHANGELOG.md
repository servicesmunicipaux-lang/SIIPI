# Journal des versions — SIIPI

Ce journal suit l'avancement par **Jalon**, au sens de `FEUILLE_DE_ROUTE.md` § 4 :
un lot de fonctionnalités groupées par dépendance réelle, pas par rubrique du
cahier des charges. Chaque entrée renvoie aux identifiants du cahier des
charges (`B5.5.2`, `C3.1`, …) tels que suivis dans la feuille de route.

## [0.3.0] — 2026-09-22 — Jalon 2, lot 1 : le socle de notification (push)

Décision retenue avec l'utilisateur : un seul canal pour ce lot, le **push
web** (Web Push API + VAPID) — aucun fournisseur externe à payer ni à
choisir. SMS et courriel restent enregistrables comme canal choisi mais
n'émettent encore rien. Politique de retry : **une seule tentative**, un
échec est consigné immédiatement, jamais réessayé en silence.

### Ajouté
- `B5.1.2` — le citoyen est notifié par push quand sa réclamation est
  acceptée ou refusée (avec le motif).
- `B5.2.3` — invitation push envoyée à chaque citoyen du périmètre quand un
  sondage est publié et envoyé.
- `B5.4.3` — le canal push d'une notification ciblée est réellement émis
  (SMS et courriel restent enregistrables, non câblés).
- Migration 044 : tables `push_souscriptions` (l'endpoint du navigateur d'un
  citoyen, qu'il enregistre lui-même) et `notifications_envoyees` (une ligne
  par tentative individuelle, lecture réservée à la FNCT et au citoyen
  concerné — jamais à la commune, qui continue de lire l'agrégat de
  `envois_notification`).
- Deux fonctions SQL `app.souscriptions_citoyen`/`app.souscriptions_publication`
  (SECURITY DEFINER), réservées au service d'émission : le ciblage d'une
  publication reste entièrement en base, jamais exposé par une route — même
  principe que `app.compter_destinataires` (035).
- Service `backend/src/services/notifications.ts` : une tentative, un
  résultat consigné, aucune reprise automatique.
- Côté citoyen : bandeau d'abonnement (`AbonnementPush.tsx`), gestion des
  évènements `push`/`notificationclick` dans le service worker.
- Nouvelle campagne de tests `notifications` (16/16), incluse dans
  `npm run test`.

### Construit par nécessité, pas encore validé comme fait
Le mécanisme d'abonnement du navigateur (`M6`) a dû être construit pour que
ce lot soit testable — on ne peut pas émettre un push sans que quelqu'un
puisse le recevoir. Restent ouverts avant de considérer `M6` clos : un
historique « mes notifications » côté citoyen, des préférences par canal.
Voir le rapport de lot.

### État de l'art à la clôture de ce lot
45 migrations rejouées sur base neuve · contrat OpenAPI conforme (147 routes
servies, 147 documentées) · typage front et back sans erreur · campagne
`notifications` : 16/16 · aucune régression sur `module5`, `citoyen`,
`cloisonnement`.

---

## [0.2.0] — 2026-09-22 — Jalon 1 : brancher les écrans

### Ajouté
- **Points de collecte suggérés par les citoyens** (`B5.5.2`, `M3.1`) : écran
  de validation côté commune (`PointsSuggeres.tsx`, nouvel onglet « Points
  suggérés »), et formulaire de proposition côté citoyen (`ProposerPoint.tsx`,
  nouvel onglet « Proposer un point »). L'API et le cloisonnement (migration
  042) existaient déjà.
- **Documents d'un projet** (`B5.3.3`) : dépôt et liste de pièces jointes dans
  l'onglet Communication, pour les publications de type « projet ».
- **Photo du constat de terrain quotidien** : bouton d'ajout de photo par
  circuit dans l'écran « Constat du jour », usage `constat_terrain` du
  stockage de fichiers déjà en place.
- **Rapports et études** (`C3.1`–`C3.4`, `C3.7`) : nouvel écran communal
  (`RapportsEtudes.tsx`), nouvelle table `rapports_etudes` avec ses
  métadonnées (titre, catégorie, auteur déclaré, date) et son cloisonnement
  RLS (migration 043). Le stockage de fichiers accepte désormais les
  documents Word/Excel/PowerPoint et un plafond de 50 Mo — réservés à l'usage
  `rapport_etude`, pour ne pas élargir l'acceptation des autres usages.
- Nouvelle campagne de tests `rapports` (20 vérifications), incluse dans
  `npm run test` aux côtés de `fichiers` et `suggestions` — qui existaient déjà
  mais n'étaient pas rejouées par la campagne globale jusqu'ici.

### Corrigé
Trois défauts trouvés en rejouant migrations et seeds sur une base
entièrement neuve, dans un environnement Docker isolé — invisibles sur
l'installation de développement existante, jamais reconstruite de zéro :

- `POST /circuits/controles` et `POST /passages` répondaient 500 sur toute
  base neuve : leur clause `ON CONFLICT` ne portait pas la colonne `voyage`,
  introduite par la migration 029 pour les circuits à plusieurs rotations
  quotidiennes, alors que la contrainte d'unicité, elle, la porte depuis cette
  même migration.
- Le type utilitaire `Corps<>` de `web/src/lib/api.ts` supposait un corps de
  requête obligatoire (`requestBody:`) ; le contrat OpenAPI généré le décrit
  en réalité comme optionnel (`requestBody?:`) pour toutes les routes, y
  compris celles qui l'exigent en pratique. La régénération des types cassait
  donc silencieusement `deposerFichier` — déjà utilisé en production par les
  réclamations, le signalement citoyen et le constat de terrain.
- Une assertion de la campagne `fichiers` (« aucune colonne de position
  n'existe ») produisait un faux échec : son filtre `LIKE '%lat%'` retenait
  aussi `chemin_relatif`. Remplacé par une comparaison par segment du nom de
  colonne.

### Signalé (non corrigé dans ce lot)
Deux tâches de fond ont été ouvertes pour un traitement séparé :
- Fragilité de plusieurs campagnes de tests sur une base rejouée de zéro
  (dates codées en dur dans `circuits.sh`/`prestataires.sh`, incompatibilité
  d'hypothèses entre `module2.sh` et `module4.sh` selon l'ordre des seeds
  `seed:personnel`/`seed:dar-chaabane`).
- Lenteur sévère (plus de 3 minutes) de `GET /communication` pour Dar
  Chaabane El Fehri — sans lien avec ce lot, probablement le calcul de
  destinataires (`app.destinataires_publication`) sur cette commune.

### État de l'art à la clôture du Jalon 1
44 migrations rejouées sur base neuve · contrat OpenAPI conforme
(144 routes servies, 144 documentées) · typage front et back sans erreur ·
20 campagnes de tests, dont `rapports` (nouvelle, 20/20) et `fichiers`
(26/26) sans régression.

---

*Les versions antérieures au Jalon 1 ne sont pas datées rétroactivement : ce
journal démarre avec le passage au développement par lot de la feuille de
route.*
