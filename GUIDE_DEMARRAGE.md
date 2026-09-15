# Guide de démarrage — SIIPI (back-end réel)

Ce document explique comment faire fonctionner, en local, la nouvelle base
technique réelle du projet : base de données PostgreSQL/PostGIS, API REST
(back-end), et front-end connecté à cette API (au lieu des données simulées
du prototype d'origine).

Toute cette chaîne a été testée bout en bout avant livraison (migrations,
seed des 350 vraies communes, authentification, permissions par rôle,
front-end connecté) — voir le résumé des tests en bas de ce document.

## Prérequis

- Node.js 22 (déjà utilisé par le projet)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installé et démarré (pour PostgreSQL + PostGIS)

## 1. Démarrer la base de données

À la racine du projet :

```bash
docker compose up -d
```

Cela démarre :
- **PostgreSQL 16 + PostGIS** sur le port `5432`
- **Adminer** (interface web pour consulter la base) sur http://localhost:8081
  (Système : PostgreSQL, Serveur : `siipi-postgres`, Utilisateur : `siipi_admin`,
  Mot de passe : celui défini ci-dessous)

Par défaut, le mot de passe de la base est `change_me_strong_password`. Pour le
changer, créez un fichier `.env` à la racine du projet avec :

```
DB_PASSWORD=votre_mot_de_passe_fort
```

## 2. Configurer et démarrer l'API (back-end)

```bash
cd backend
cp .env.example .env
# Si vous avez changé DB_PASSWORD à l'étape 1, mettez à jour DATABASE_URL dans backend/.env en conséquence.
npm install
npm run migrate   # crée les tables (une seule fois, ou après une mise à jour du schéma)
npm run seed      # importe les 350 communes réelles + crée des comptes de démonstration
npm run dev       # démarre l'API sur http://localhost:4000
```

Vérification rapide : `curl http://localhost:4000/health` doit répondre
`{"status":"ok","database":"connected"}`.

### Comptes de démonstration créés par le seed

Mot de passe commun : `Siipi2026!` (à changer immédiatement dans un vrai
déploiement — voir section Sécurité plus bas).

Les 4 rôles ci-dessous sont les rôles RBAC **officiels** du cahier des charges
FNCT (section 5, matrice de permissions) :

| Rôle (CDC) | Email | Commune de rattachement |
|---|---|---|
| Super Admin FNCT | admin.national@siipi.tn | — (vue nationale) |
| Admin Commune — pilote | directeur.marsa@siipi.tn | La Marsa |
| Admin Commune — pilote | directeur.sfax@siipi.tn | Sfax (Ville & Médina) |
| Admin Commune — pilote | directeur.houmtsouk@siipi.tn | Djerba Houmt Souk |
| Admin Commune — pilote | directeur.midoun@siipi.tn | Djerba Midoun |
| Admin Commune — pilote | directeur.ajim@siipi.tn | Djerba Ajim |
| Gestionnaire Prestataire (privé) | prestataire.marsa@siipi.tn | La Marsa |
| Gestionnaire Prestataire (privé) | prestataire.houmtsouk@siipi.tn | Djerba Houmt Souk |
| Gestionnaire Prestataire (privé) | prestataire.midoun@siipi.tn | Djerba Midoun |
| Gestionnaire Prestataire (privé) | prestataire.ajim@siipi.tn | Djerba Ajim |
| Citoyen | citoyen.demo@siipi.tn | — |

Sfax n'a pas encore de Gestionnaire Prestataire de démonstration (écart hérité
du prototype d'origine, non lié aux communes de Djerba ajoutées ensuite).

Un citoyen peut aussi créer son propre compte directement depuis l'écran de
connexion de l'application ("Inscription Citoyen").

## 3. Démarrer le front-end

Dans un autre terminal, à la racine du projet :

```bash
npm install
npm run dev
```

Ouvrez http://localhost:3000 — l'application affiche maintenant un vrai
écran de connexion. Une fois connecté, chaque utilisateur ne voit que les
modules autorisés pour son rôle (fini le sélecteur de rôle libre du
prototype).

## Ce qui a changé par rapport au prototype

- **Authentification réelle** : JWT + mots de passe hashés (bcrypt), plus de
  changement de rôle en un clic.
- **Annuaire des 350 communes** : servi par l'API depuis PostgreSQL, modifiable
  par le portail national (bouton "Modifier"), avec les changements visibles
  par tous les utilisateurs — plus de `localStorage` local à un seul
  navigateur.
- **Calcul des indicateurs (KPI, réconciliation des pesées)** : exécuté
  réellement côté serveur, plus affiché comme du code statique non exécuté.
- **Autres modules** (flotte GPS, conteneurs IoT, tickets citoyens, GDMA/
  Barbéchas) : l'API et les tables existent déjà (voir `backend/src/routes/`)
  mais les écrans correspondants utilisent encore des données de démonstration
  (`src/data/mockData.ts`) en attendant une prochaine itération — c'est la
  suite logique de ce travail, avec la même méthode que pour le module
  "Annuaire des communes".

## Mise à jour — Réalignement sur le cahier des charges officiel (CDC)

La première version de cette fondation technique (ci-dessus) avait été construite
avant la réception du cahier des charges officiel FNCT/ANGeD. Une fois le CDC
reçu, trois écarts ont été corrigés (migration `010_realign_rbac_kpi_pilots_cdc.sql`) :

1. **Rôles RBAC** : les 5 rôles provisoires (`national_admin`, `municipal_manager`,
   `citizen`, `field_agent`, `gdma_actor`) sont remplacés par les **4 rôles
   officiels** de la matrice de permissions du CDC (§5) : **Super Admin FNCT**,
   **Admin Commune**, **Gestionnaire Prestataire (privé)**, **Citoyen**.
   - Il n'existe plus de rôle de connexion distinct pour un "agent de terrain" ou
     un "acteur GDMA" — ces écrans restent disponibles dans l'application (menu du
     portail Admin Commune) mais ne sont plus des comptes séparés, conformément au
     CDC qui rattache la gestion du personnel de terrain à la rubrique "Personnel &
     Planification" de l'Admin Commune.
   - Le module GDMA/Barbécha (achat de matières triées) n'apparaît pas dans le CDC
     officiel — il vient du prototype d'origine. Il reste fonctionnel (données,
     API) mais géré par l'Admin Commune ; à statuer avec la FNCT s'il doit rester
     dans le périmètre ou devenir une extension Phase 2+.
2. **KPI "5 Axes"** : les 5 axes provisoires sont remplacés par les 5 axes
   officiels du CDC (§3.2.10) : **Efficacité opérationnelle**, **Qualité de
   service**, **Performance environnementale**, **Performance économique**,
   **Sécurité et Ressources Humaines**.
3. **Communes pilotes** : le CDC (§1.2) prévoit une approche MVP sur un nombre
   restreint de communes pilotes. Les données importées marquaient à tort 9
   communes comme "pilote" ; c'est d'abord corrigé à exactement 2 (**La
   Marsa** et **Sfax**), puis élargi à **5 communes pilotes** à la demande de
   la FNCT (voir "Mise à jour — Communes pilotes de Djerba" plus bas) : La
   Marsa, Sfax, et les 3 communes de l'île de Djerba (Houmt Souk, Midoun,
   Ajim). Choix définitif à confirmer avec la FNCT.

### Limites connues de ce réalignement (pas encore traitées)

Ce qui suit reste hors périmètre de ce réalignement et sera traité dans une
prochaine itération, une fois cette base validée :

- Le rôle **Gestionnaire Prestataire (privé)** n'a pas encore de portail dédié
  ni de scoping fin par zone/commune (le CDC le prévoit) — il utilise
  temporairement une vue existante (opérations/flotte) en attendant ce module.
- L'inscription citoyenne reste email + mot de passe ; le CDC prévoit une
  authentification par téléphone + OTP pour l'application mobile Flutter (non
  construite à ce stade).
- Les ~15 sous-modules détaillés du CDC (GMAO, GeoTracker, sondages, projets,
  rapports/études, etc.) restent à construire au-delà de cette base technique
  réalignée. **Le découpage communal a depuis été livré** — voir la section
  dédiée plus bas.

## Mise à jour — Workflow de traitement des réclamations (conforme au CDC)

Le module réclamations (table `tickets`) applique maintenant la distinction de
permissions prévue par le CDC entre l'Admin Commune et le Gestionnaire
Prestataire (migration `011_tickets_workflow_cdc.sql`). L'ancienne route
générique `PATCH /tickets/:id/status` (qui donnait les mêmes droits aux deux
rôles) est remplacée par 4 actions dédiées dans `backend/src/routes/tickets.routes.ts` :

| Action | Route | Qui peut l'appeler | Effet |
|---|---|---|---|
| Accepter | `PATCH /tickets/:id/accept` | Admin Commune, Super Admin FNCT | `recu` → `en_cours` |
| Refuser | `PATCH /tickets/:id/refuse` (motif obligatoire) | Admin Commune, Super Admin FNCT **uniquement** | → `rejete` (définitif) |
| Transférer | `PATCH /tickets/:id/assign` (à un Gestionnaire Prestataire précis) | Admin Commune, Super Admin FNCT | → `assigne` |
| Traiter | `PATCH /tickets/:id/treat` (`en_cours` ou `resolu`) | Gestionnaire Prestataire (uniquement sur SES tickets transférés), Admin Commune, Super Admin FNCT | fait avancer le statut |

Points clés, testés de bout en bout avec une vraie base et de vrais appels API :

- Le **Gestionnaire Prestataire ne peut jamais refuser** un ticket (la route
  `/refuse` lui est fermée par RBAC) — il peut seulement le faire progresser
  (`/treat`), et uniquement sur les tickets qui lui ont été explicitement
  transférés via `/assign` (vérifié via la nouvelle colonne
  `assigned_prestataire_id`, pas seulement le champ texte `assigned_team`).
- Un Admin Commune ne peut agir (accepter/refuser/transférer) que sur les
  réclamations de sa propre commune (403 sinon), sauf le Super Admin FNCT qui
  voit tout.
- `/assign` vérifie que le Gestionnaire Prestataire désigné est bien rattaché
  à la commune du ticket (sinon 400) — empêche de transférer un ticket à un
  prestataire d'une autre commune.
- Un ticket déjà `resolu` ou `rejete` (statuts définitifs) ne peut plus être
  modifié par aucune de ces routes (400).
- `GET /tickets?assignedToMe=true` permet à un Gestionnaire Prestataire de ne
  voir que les tickets qui lui ont été transférés, plutôt que tout le trafic
  de la commune.

Cette API a ensuite été connectée à l'interface (voir section suivante).

## Mise à jour — Réclamations connectées à l'interface (Portail Municipal + App Citoyenne)

Le module réclamations est maintenant relié à l'API réelle des deux côtés,
selon la même méthode que l'annuaire des communes (`hooks/useCommunesDirectory.ts`) :
un hook dédié (`src/hooks/useTicketsWorkflow.ts`) charge les tickets et expose les
actions du workflow, un mapper (`src/lib/ticketMapper.ts`) traduit les colonnes
`snake_case` de l'API vers le type front-end `TicketReport`.

**Portail Municipal — onglet "Gestion des Réclamations"** (`src/components/MunicipalPortal.tsx`) :
- La liste et l'inspecteur de ticket affichent les vraies réclamations de la
  commune sélectionnée (chargement/erreur affichés explicitement).
- Les boutons d'action changent selon le statut réel du ticket : **Accepter** /
  **Refuser** (ticket "reçu"), puis **Transférer** à un Gestionnaire Prestataire
  (liste réelle chargée via `GET /communes/:id/prestataires`, nouvelle route
  ajoutée) et **Marquer Résolu** / **Refuser** (ticket accepté ou transféré).
  Un refus demande désormais un motif (obligatoire), affiché ensuite sur le
  ticket.
- Chaque clic appelle la vraie route API (`/accept`, `/refuse`, `/assign`,
  `/treat`) et met à jour l'affichage avec la réponse du serveur.

**Application Citoyenne — écran "Signaler"** (`src/components/CitizenAppSimulator.tsx`) :
- Le formulaire envoie un vrai signalement via `POST /tickets` (au lieu d'une
  simulation locale) et affiche le numéro de ticket réellement créé en base.
- Un sélecteur de commune a été ajouté (l'annuaire réel des communes, via
  `useCommunesDirectory`) : le profil citoyen n'a pas encore de commune de
  rattachement enregistrée côté back-end, donc le citoyen l'indique lui-même au
  moment du signalement — une commune pilote est présélectionnée par défaut.
- Le ticket créé est immédiatement visible et traitable par l'Admin Commune
  dans le Portail Municipal : testé de bout en bout dans un vrai navigateur
  (citoyen crée un signalement → Admin Commune le voit, l'accepte, le
  transfère à un Gestionnaire Prestataire réel, puis le marque résolu ; un
  second scénario de refus avec motif a aussi été vérifié).

**Limites connues, encore hors périmètre :**
- Le compteur de points/badges "Kenz El Medina" reste une simulation locale
  côté app citoyenne — il n'est pas encore relié au profil citoyen réel
  (`GET /citizens/me`, table `citizen_badges`/`citizen_rewards`).
- Pas encore d'écran dédié pour le Gestionnaire Prestataire (il n'a pas accès
  au Portail Municipal) : il peut traiter ses tickets transférés via l'API
  (`PATCH /tickets/:id/treat`, `GET /tickets?assignedToMe=true`) mais pas
  encore depuis une interface dédiée.
- Pas de prise de photo réelle (upload) sur le signalement citoyen — le champ
  existe côté API (`photoUrl`) mais l'écran ne l'envoie pas encore.

## Mise à jour — Module Découpage communal (frontières réelles + secteurs de collecte)

Premier des ~15 sous-modules détaillés du CDC à être construit au-delà de la
base technique réalignée (migration `012_decoupage_communal.sql`).

**Frontières administratives réelles des communes** — la FNCT a fourni un
extrait OpenStreetMap (`decoupage_municipalites.txt`, 353 polygones de
municipalités). Un script d'appariement (nom normalisé, puis proximité
géographique du centroïde avec un seuil de confiance) l'a relié aux 350
communes de `communes_350.json` :
- **317 communes sur 350 (91 %)** ont désormais une vraie frontière
  polygonale importée (`communes.boundary_geom`, colonne PostGIS
  `MultiPolygon`), au lieu du seul point lat/lng précédent.
- Les 33 communes restantes (noms trop différents entre l'export OSM et le
  référentiel, ou aucune correspondance fiable à moins de 15 km) n'ont pas de
  frontière importée pour l'instant — elles continuent d'afficher uniquement
  leur point central, sans erreur ni donnée incorrecte affichée à leur place.
  La liste exacte est reconstituable en relançant le script d'appariement
  (voir `backend/seed/importBoundaries.ts`).
- Import : `cd backend && npm run import:boundaries` (à exécuter une fois,
  après `migrate` + `seed` ; peut être relancé sans risque).
- API : `GET /communes/:id/boundary` (une commune), `GET /communes/boundaries`
  (toutes les communes disponibles, en `FeatureCollection` GeoJSON, pour la
  carte nationale).

**Secteurs / zones de collecte** — nouvelle table `zones_collecte` : découpage
interne d'une commune en secteurs opérationnels (polygone dessiné à la main),
base pour la future affectation des tournées et le GeoTracker. Un lien
optionnel `vehicules.zone_id` a aussi été ajouté pour préparer cette
affectation. Permissions conformes au CDC (`backend/src/routes/zones.routes.ts`) :
- **Admin Commune** (et **Super Admin FNCT**) : créent, modifient et
  suppriment les secteurs de leur commune (`POST/PATCH/DELETE /zones`).
- **Gestionnaire Prestataire** : consultation seule des secteurs de sa
  commune (utile pour situer ses tournées) — écriture refusée (403).

**Interface — Portail Municipal, nouvel onglet "Découpage Communal"**
(`src/components/DecoupageCommunalMap.tsx`, hook `useCollectionZones.ts`,
mapper `zoneMapper.ts`) :
- Carte Leaflet affichant la frontière réelle de la commune en fond (si
  disponible) et les secteurs existants, colorés et nommés.
- Outil de dessin de polygone (bibliothèque `leaflet-draw`) pour l'Admin
  Commune : dessiner un secteur ouvre un petit formulaire (nom, code,
  fréquence de collecte, population estimée, couleur, Gestionnaire
  Prestataire à assigner) avant l'enregistrement en base.
- Liste des secteurs à côté de la carte, avec réassignation rapide du
  prestataire et suppression.
- Le Gestionnaire Prestataire voit le même écran en lecture seule (pas
  d'outil de dessin ni de bouton de modification) — non accessible pour
  l'instant en pratique, faute de portail dédié à ce rôle (voir limite
  connue plus haut).
- **Note technique** : les feuilles de style Leaflet (carte + dessin) sont
  désormais chargées depuis le bundle (`import 'leaflet/dist/leaflet.css'`
  dans `src/main.tsx`) plutôt que par CDN, pour ne dépendre d'aucune
  ressource réseau externe au démarrage de l'application.

**Limites connues, encore hors périmètre :**
- 33 communes sur 350 sans frontière réelle importée (voir plus haut).
- Pas encore possible de redessiner le tracé d'un secteur existant depuis la
  carte (seuls ses attributs — nom, prestataire, etc. — sont modifiables) ;
  il faut le supprimer et le redessiner pour corriger sa forme.
- Le lien `vehicules.zone_id` existe en base mais aucun écran ne l'utilise
  encore pour affecter réellement une tournée à un secteur.

## Mise à jour — Communes pilotes de Djerba (Houmt Souk, Midoun, Ajim)

À la demande de la FNCT, le périmètre de démonstration passe de 2 à **5
communes pilotes** : les 2 communes pilotes historiques (La Marsa, Sfax) et
les **3 communes de l'île de Djerba** — Houmt Souk (chef-lieu et port
principal), Midoun (zone touristique) et Ajim (village de potiers et bac vers
Jorf). Ce choix se prête bien à une démonstration de gestion intercommunale
mutualisée sur un territoire insulaire.

Concrètement (`backend/seed/data/communes_350.json`, `backend/seed/seed.ts`) :

- Les 3 communes sont marquées `is_pilot = true` (avec effet immédiat après
  `npm run seed`, qui met à jour `communes.is_pilot` sans tout réimporter).
- **Frontières réelles** : les 3 communes disposent déjà d'une vraie
  frontière administrative importée depuis OpenStreetMap (voir le module
  Découpage communal ci-dessus) — aucune action supplémentaire nécessaire de
  ce côté.
- **Comptes de démonstration** : un Admin Commune et un Gestionnaire
  Prestataire ont été créés pour chacune des 3 communes (voir tableau des
  comptes de démonstration plus haut) — contrairement à Sfax, qui n'a pour
  l'instant qu'un Admin Commune.
- **Flotte & conteneurs** : un camion et un point de collecte de
  démonstration par commune (`trk-04`/`cnt-04` Houmt Souk, `trk-05`/`cnt-05`
  Midoun, `trk-06`/`cnt-06` Ajim), avec des noms de lieux réalistes (marché
  central, zone hôtelière de Sidi Mahrès, port d'Ajim).
- **Découpage communal** : un secteur de collecte de démonstration par
  commune (`zones_collecte`), dérivé de la vraie frontière importée
  (polygone réduit à ~50 % autour du centre-ville) et assigné au
  Gestionnaire Prestataire correspondant — visible immédiatement dans
  l'onglet "Découpage Communal" du Portail Municipal, sans avoir besoin de
  dessiner un secteur pour tester le module.

Import/mise à jour sur une base existante (sans tout réimporter) :
```
cd backend
npm run seed
```
(rejouable sans risque : les comptes et secteurs déjà présents ne sont pas dupliqués).

## Sécurité avant tout déploiement réel

Ce qui est livré ici est une base technique fonctionnelle, pas un système
prêt pour la production. Avant tout déploiement au-delà d'un usage local de
démonstration :

- Changer `JWT_SECRET` (backend/.env) et tous les mots de passe de démonstration.
- Définir un vrai `DB_PASSWORD` fort et ne jamais committer de fichier `.env`.
- Décider de l'hébergement définitif (datacenter national vs cloud) — voir
  l'analyse SIIPI fournie précédemment pour ce point.
- Ajouter une politique de sauvegarde de la base PostgreSQL.
- Soumettre le back-end à un audit de sécurité avant toute mise en production
  (contrairement aux résultats affichés dans le prototype, aucun audit réel
  n'a encore eu lieu sur ce nouveau code).

## Résumé des tests effectués avant livraison

Avant de livrer ce code, la chaîne complète a été testée avec une vraie base
PostgreSQL/PostGIS et une vraie exécution du front-end (navigateur headless) :

- ✅ 10 migrations SQL appliquées sans erreur
- ✅ Import réel des 350 communes + comptes de démonstration
- ✅ Connexion (mot de passe correct / incorrect) et JWT
- ✅ Contrôle d'accès par rôle (RBAC) : un citoyen ne peut pas modifier une
  commune (403), un directeur municipal ne peut agir que sur sa propre
  commune
- ✅ Détection automatique d'anomalie de pesée (écart > 5 %) par un
  déclencheur SQL
- ✅ Calcul du montant d'une pesée barbécha côté serveur (jamais fourni par
  le client) et mise à jour automatique des totaux
- ✅ Compilation TypeScript du front-end et du back-end sans erreur
- ✅ Build de production Vite réussi
- ✅ Scénario de bout en bout dans un vrai navigateur : écran de connexion →
  connexion → annuaire des 350 communes chargé depuis l'API → déconnexion

### Tests effectués après le réalignement sur le CDC officiel

- ✅ La 11ᵉ migration (`010_realign_rbac_kpi_pilots_cdc.sql`) s'applique sans
  erreur sur une base neuve (11 migrations au total)
- ✅ Les 4 comptes de démonstration ont bien les 4 rôles officiels du CDC en
  base (`super_admin_fnct`, `admin_commune` ×2, `gestionnaire_prestataire`,
  `citoyen`)
- ✅ Exactement 2 communes marquées `is_pilot = true` (La Marsa, Sfax)
- ✅ Connexion réussie pour les 4 rôles officiels (API + navigateur réel)
- ✅ RBAC re-testé avec les nouveaux rôles : un citoyen ne peut pas modifier
  une commune (403) ; un Admin Commune ne peut modifier que sa propre commune
  (403 sur une autre commune, 200 sur la sienne) ; un Super Admin FNCT peut
  modifier n'importe quelle commune ; un Gestionnaire Prestataire peut
  mettre à jour la position d'un véhicule de sa commune
  d'affectation
- ✅ Inscription citoyenne : le compte créé porte bien le rôle `citoyen`
- ✅ POST `/kpi/five-axis` accepte les 5 axes officiels du CDC
  (`efficaciteOperationnelle`, `qualiteService`, `performanceEnvironnementale`,
  `performanceEconomique`, `securiteRh`) et calcule correctement le score
  global
- ✅ Compilation TypeScript (front-end et back-end) et build de production
  Vite de nouveau réussis après le réalignement
- ✅ Chaque rôle, testé dans un vrai navigateur (Chromium), arrive bien sur
  la vue par défaut attendue après connexion

### Tests effectués pour le module Découpage communal

- ✅ 12ᵉ migration (`012_decoupage_communal.sql`) appliquée sans erreur
- ✅ Import des frontières : 317/350 communes mises à jour, 0 échec sur les
  entrées appariées
- ✅ RBAC re-testé sur `/zones` : un Admin Commune d'une autre commune ne
  peut pas créer de secteur (403) ; un Gestionnaire Prestataire ne peut pas
  en créer (403) mais peut lire ceux de sa commune (200) ; l'assignation
  d'un secteur à un Gestionnaire Prestataire de la bonne commune fonctionne ;
  la suppression fonctionne (204, puis 404 à la relecture)
- ✅ Compilation TypeScript (front-end et back-end) et build de production
  Vite réussis avec le nouveau module
- ✅ Scénario de bout en bout dans un vrai navigateur (Chromium) : connexion
  Admin Commune → onglet Découpage Communal → dessin d'un polygone à la
  souris sur la carte → formulaire rempli et enregistré → secteur visible
  dans la liste → **rechargement complet de la page → secteur toujours
  présent (donc bien persisté en base, pas seulement en mémoire)** →
  suppression → secteur disparu

### Tests effectués pour les communes pilotes de Djerba

- ✅ `npm run seed` rejoué sur une base déjà peuplée : 5 communes marquées
  `is_pilot = true` (La Marsa, Sfax, Djerba Houmt Souk/Midoun/Ajim), aucun
  doublon créé sur les comptes ou les secteurs en le rejouant deux fois de
  suite
- ✅ Connexion réussie pour les 6 nouveaux comptes de démonstration (3 Admin
  Commune + 3 Gestionnaire Prestataire de Djerba)
- ✅ `GET /communes/medenine_djerba_houmt_souk/boundary` renvoie bien une
  frontière réelle (`MultiPolygon`)
- ✅ `GET /zones?communeId=medenine_djerba_houmt_souk` renvoie le secteur de
  démonstration avec son Gestionnaire Prestataire déjà assigné
- ✅ Compilation TypeScript du back-end de nouveau réussie après ces
  changements
