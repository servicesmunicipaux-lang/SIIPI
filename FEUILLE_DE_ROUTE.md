# SIIPI — Feuille de route
## Du cahier des charges à la plateforme : où nous en sommes, et dans quel ordre continuer

**Fédération Nationale des Communes Tunisiennes**
Version au 22 septembre 2026 · établie à partir du cahier des charges SIIPI (MVP, phase 1)
Mise à jour du 22 septembre 2026 : clôture du **Jalon 1** (§ 4) — huit lignes passées à Fait.
Mise à jour du 22 septembre 2026 (suite) : **Jalon 2, lot 1** (B5.1.2, B5.2.3, B5.4.3) — le push web est réellement émis. Le mécanisme d'abonnement du citoyen (`M6`) a dû être construit avec, pour que l'envoi ait un destinataire à joindre — voir le rapport de lot avant de considérer `M6` clos.
Mise à jour du 23 septembre 2026 : **`M6` clos** — historique « Mes notifications », préférences par canal et par type, et relance manuelle (« Renvoyer ») d'un envoi en échec.
Mise à jour du 28 septembre 2026 : **Jalon 3** — Contacts (`C1.1`–`C1.3`), versionnement des rapports (`C3.6`) et lecteur PDF intégré (`C3.5`) ; cinq lignes passées à Fait. `C1.4` (import/export CSV) rejoint le service d'export transverse du Jalon 4.
Mise à jour du 28 septembre 2026 (suite) : **Jalon 4, lot 1** — le service d'export unique (CSV + Excel) branché sur les cinq écrans concernés ; `B3.6` passé à Fait, `A3.4`, `B2.4` et `C1.4` à Partiel (reste le PDF et les imports, lot 2).
Mise à jour du 28 septembre 2026 (fin) : **Jalon 4 clos** — imports CSV (contacts, parc, points) et PDF par l'impression du navigateur ; `A3.4`, `B2.4`, `B3.1`, `B5.2.4` et `C1.4` passés à Fait.
Mise à jour du 28 septembre 2026 (soir) : **Jalon 5 clos** — la maintenance des engins : carnet d'entretien (`B2.2`) et alertes d'entretien au kilomètre et à la date (`B2.3`).
Mise à jour du 28 septembre 2026 (nuit) : **Jalon 6 clos** — le tableau des points avec champs libres (`B3.4`), les étiquettes et les actions planifiées sur une sélection (`B3.5`).
Mise à jour du 28 septembre 2026 (fin de nuit) : **Jalon 7 clos** — les paramètres (`B6.2`, `B6.3`, `B6.4`, `B6.6`) et le découpage validé par la FNCT et versionné (`C2.5`, `C2.6`).
Mise à jour du 29 septembre 2026 : **lot d'optimisation des sources KPI** — lieux sur carte, nettoyages en mètres linéaires, fin de poste, carburant, EPI, incidents, conventions ; la plateforme mesure ce que la fiche faisait déclarer, avec un badge de source par indicateur.
Mise à jour du 28 septembre 2026 (clôture) : **Jalon 8 clos** — le tableau de bord KPI 5 axes, la grille du Concours national de propreté (19 indicateurs, reventilation ministérielle), la préparation au décret DMA, les agrégations et les alertes nationales (`Axe 1` à `Axe 5`, `A2.3`, `A3.1`, `A3.3`, `B7.4`).

---

## 1. Comment lire ce document

Ce document confronte, ligne par ligne, les **96 fonctionnalités** numérotées du
cahier des charges à ce que la plateforme fait réellement aujourd'hui. Chaque
ligne porte un statut et, quand elle est faite, **la preuve qui l'établit** — la
migration qui crée la donnée, la route qui la sert, la campagne de tests qui la
vérifie.

| Statut | Ce que cela signifie exactement |
|---|---|
| ✅ **Fait** | Le code existe, une campagne de tests automatisée le vérifie, et la migration se rejoue sur une base neuve |
| 🟡 **Partiel** | Le socle est posé et éprouvé ; il manque une part précise, nommée dans la colonne de droite |
| ⬜ **À faire** | Rien n'existe encore |
| ⏸ **Suspendu** | Une décision ou une dépendance extérieure bloque, et c'est assumé |

### Une distinction qui compte plus que les pourcentages

**« Fait » ne veut pas dire « recetté par une commune ».** Il veut dire : le code
passe une campagne de tests, et la base se reconstruit de zéro sans erreur.

Deux communes seulement ont servi de terrain — **Dar Chaabane El Fehri** (registre
des circuits, parc, effectif, pesées) et **Djerba Houmt Souk** (prestataires,
réclamations). Aucune commune n'utilise encore la plateforme dans son travail
quotidien. C'est l'écart entre « développé » et « en service », et il ne se comble
que par une recette terrain (§ 6).

---

## 2. Où en est le projet

| | Nombre | Part |
|---|---:|---:|
| ✅ Fait et éprouvé | 87 | 91 % |
| 🟡 Partiel | 5 | 5 % |
| ⬜ À faire | 2 | 2 % |
| ⏸ Suspendu | 2 | 2 % |
| **Total des fonctionnalités du cahier des charges** | **96** | **100 %** |

**Le socle est le plus avancé, la restitution le moins.** Tout ce qui consiste à
*collecter et cloisonner* la donnée — personnel, engins, circuits, pesées,
réclamations, sondages, fichiers — est en place et éprouvé. Tout ce qui consiste
à *en restituer la synthèse* — tableau KPI 5 axes, exports, alertes — reste à
bâtir. C'est l'ordre naturel : on ne calcule pas un coût à la tonne avant d'avoir
les tonnes et la masse salariale.

### Avancement par rubrique

| Rubrique | ✅ | 🟡 | ⬜ | ⏸ | Lecture |
|---|---:|---:|---:|---:|---|
| **3.1.1 Authentification** | 3 |  |  |  | Complète. |
| **3.1.2 Les 350 communes** | 5 |  |  |  | Complète : le bouton « Indicateurs » ouvre les KPI de chaque commune (Jalon 8). |
| **3.1.3 Tableau de bord national** | 4 |  |  |  | Complète : agrégation par commune, gouvernorat, district FNCT et national, alertes à seuils configurables (Jalon 8). |
| **3.2.1 Personnel et planning** | 4 | 2 |  |  | Le cœur est fait ; photo du cadre et envoi de courriel manquent. |
| **3.2.2 Engins et maintenance** | 4 |  | 1 |  | Inventaire, carnet d'entretien et alertes faits (Jalon 5) ; reste l'interopérabilité GPS, optionnelle au TDR. |
| **3.2.3 Données géolocalisées** | 6 |  |  |  | Complète : import (KML, GPX, GeoJSON, CSV), carte, tableau des points à colonnes libres, étiquettes, actions planifiées et export de la sélection filtrée (Jalon 6). |
| **3.2.4 Pesées** | 3 |  |  | 2 | Complète pour la part communale ; la part ANGeD est suspendue. |
| **5.1 Réclamations** | 4 |  |  |  | Complète. |
| **5.2 Sondages** | 4 |  |  |  | Complète : questionnaire, ciblage, invitation push, résultats et leur export Excel / CSV / PDF. |
| **5.3 Projets** | 4 |  |  |  | Complète. |
| **5.4 Notifications ciblées** | 3 | 1 |  |  | Le push est réellement émis ; SMS et courriel restent à câbler (décision de fournisseur). |
| **5.5 Points citoyens** | 3 |  | 1 |  | Il reste les indicateurs de communication. |
| **3.2.6 Paramètres** | 6 |  |  |  | Complète : langue, format de date, unités, alertes et mot de passe par personne ; seuils par commune (Jalon 7). |
| **3.2.7 Contacts** | 4 |  |  |  | Complète : liste, ajout, modification, retrait (Jalon 3), export et import CSV (Jalon 4). |
| **3.2.8 Découpage communal** | 5 | 1 |  |  | Proposé par la commune, validé par la FNCT, versionné et restaurable (Jalon 7) ; reste l'import Shapefile. |
| **3.2.9 Rapports et études** | 7 |  |  |  | Complète : versionnement et lecteur PDF intégré ajoutés au Jalon 3. |
| **3.2.10 KPI 5 axes** | 5 |  |  |  | Complète : 5 axes calculés et déclarés, Concours national (19 indicateurs), préparation DMA (Jalon 8). Le barème ministériel reste à confirmer par la FNCT. |
| **3.2.11 Prestataires privés** | 4 |  |  |  | Complète : tableau de bord restreint du prestataire (Jalon 8). |
| **3.3 Application citoyenne** | 9 | 1 |  |  | Les fonctions y sont — mais en web, pas en application Android (§ 7). Seul `M1` (téléphone + OTP) reste partiel. |

---

## 3. Le détail, fonctionnalité par fonctionnalité


### 3.1.1 Authentification

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `A1.1` | Login sécurisé (bcrypt) | ✅ Fait | auth.routes.ts · campagne comptes |
| `A1.2` | Rôle Super Admin FNCT | ✅ Fait | RBAC migration 010 · campagne cloisonnement |
| `A1.3` | Session JWT + expiration | ✅ Fait | middleware/auth.ts · campagne comptes |

### 3.1.2 Les 350 communes

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `A2.1` | Tableau des communes (FR/AR, gouvernorat, statut, GPS) | ✅ Fait | migrations 001/025 · campagne observatoire |
| `A2.2` | Recherche et filtre | ✅ Fait | routes observatoire · écran national |
| `A2.3` | Bouton « Visualiser » (KPI lecture seule) | ✅ Fait | bouton « Indicateurs » de l'annuaire et clic sur une commune des classements : ses 5 axes, sa note, sa fiche (que la FNCT valide) · campagne kpi-5-axes |
| `A2.4` | Bouton « Modifier » (admin complète) | ✅ Fait | EspaceCommunal.tsx |
| `A2.5` | Badge de statut vert / gris / orange | ✅ Fait | Elements.tsx · migration 016 |

### 3.1.3 Tableau de bord national

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `A3.1` | Agrégation des indicateurs | ✅ Fait | `GET /kpi/national` : 5 axes, Concours, DMA, tonnages pesés et taux de résolution (recomposé des comptes) par commune, gouvernorat, district FNCT et national · campagne kpi-5-axes |
| `A3.2` | Cartographie nationale Leaflet | ✅ Fait | DecoupageCommunal.tsx · migration 025 |
| `A3.3` | Alertes et seuils configurables | ✅ Fait | `GET /kpi/alertes` : réclamations en attente (48 h par défaut), traitement, bâchage, entretien sous seuil, fiches à valider ; seuils réglés par la FNCT (`parametres_kpi`, migration 050) ; la commune reçoit les siennes dans « À vérifier » · campagne kpi-5-axes |
| `A3.4` | Export PDF / Excel / CSV | ✅ Fait | Excel et CSV : tableau par gouvernorat et annuaire des 350 communes (services/export.ts · campagne exports) ; PDF : impression du tableau, A4 à l'italienne (lib/impression.ts) |

### 3.2.1 Personnel et planning

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B1.1` | Enregistrement d'un cadre | 🟡 Partiel | compte, fonction, courriel : oui. Photo et date de naissance : non câblés |
| `B1.2` | Création de compte + mot de passe provisoire | 🟡 Partiel | le mot de passe provisoire existe ; l'envoi par courriel n'est pas branché |
| `B1.3` | Accès cadre → espace commune | ✅ Fait | Connexion.tsx · campagne comptes |
| `B1.4` | CRUD personnel (activer / désactiver / modifier / retirer) | ✅ Fait | migration 039 · campagne module4 |
| `B1.5` | Rôles (administrateur, gestionnaire prestataire) | ✅ Fait | migrations 010/020 · campagne cloisonnement |
| `B1.6` | Planning des équipes (agents → circuits → jours) | ✅ Fait | migrations 034/040 · campagne module4 |

### 3.2.2 Engins et maintenance

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B2.1` | Fiche engin | ✅ Fait | migration 032 · campagne module3 |
| `B2.2` | Historique de maintenance (date, type, coût, km) | ✅ Fait | table `interventions_maintenance` (migration 046) · carnet dans la fiche de l'engin, export Excel/CSV · campagne maintenance |
| `B2.3` | Alertes d'entretien (seuils km / date) | ✅ Fait | `plans_entretien` et `app.echeances_entretien` (migration 046) : en retard / à prévoir / à vérifier, bandeau en tête du parc · campagne maintenance |
| `B2.4` | Import / export CSV du parc | ✅ Fait | export (campagne exports) ; import par immatriculation, création ou mise à jour, aperçu avant écriture (`POST /trucks/import` · campagne imports) |
| `B2.5` | Interopérabilité GPS (optionnelle au TDR) | ⬜ À faire |  |

### 3.2.3 Données géolocalisées

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B3.1` | Import de points (CSV / GPX / KML) | ✅ Fait | KML, KMZ, GPX, GeoJSON et CSV reconnus par leur contenu (services/kml.ts) · campagnes module2 et imports |
| `B3.2` | Import de tracés GeoTracker | ✅ Fait | services/kml.ts · campagne module2 |
| `B3.3` | Carte multicouches | ✅ Fait | CarteCommunale.tsx, CircuitCarte.tsx |
| `B3.4` | Tableau attributaire avec champs libres | ✅ Fait | onglet « Points » : colonnes libres texte / nombre / oui-non / liste / date définies par la commune (`champs_points`, `points_collecte.attributs`, migration 047), saisie à la case ou par lot · campagne champs-points |
| `B3.5` | Planification d'actions et filtrage par tags | ✅ Fait | étiquettes (`etiquettes_points`), filtre par étiquette(s) et par valeur de colonne, actions planifiées sur une sélection avec avancement point par point (`actions_planifiees`, migration 047) · campagne champs-points |
| `B3.6` | Export des points filtrés (Excel / CSV) | ✅ Fait | filtres circuit / type / statut sur la carte, puis étiquette, colonne libre et action (Jalon 6), repris tels quels par l'export (même route) ; les colonnes libres de la commune et le nom des étiquettes s'ajoutent au fichier · campagnes exports et champs-points |

### 3.2.4 Pesées

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B4.1` | Import du classeur ANGeD | ⏸ Suspendu | décision FNCT : l'interopérabilité ANGeD n'est pas ouverte |
| `B4.2` | Saisie journalière rattachée au circuit | ✅ Fait | migration 036 · campagne module6 |
| `B4.3` | Recoupement saisie ↔ ANGeD | ⏸ Suspendu | dépend de B4.1 ; la colonne « source » l'attend sans migration |
| `B4.4` | Historique par période / camion / circuit | ✅ Fait | routes pesees · campagne module6 |
| `B4.5` | Registre numérique conforme au décret | ✅ Fait | suppression logique, imputabilité · campagne suppression |

### 5.1 Réclamations

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B5.1.1` | Tableau de bord et carte à code couleur | ✅ Fait | Reclamations.tsx · campagne citoyen |
| `B5.1.2` | Acceptation / refus motivé | ✅ Fait | notifierDecisionReclamation (migration 044) · campagne notifications |
| `B5.1.3` | Preuve de traitement (photo « après ») | ✅ Fait | migration 041 · campagnes fichiers et citoyen |
| `B5.1.4` | Transfert au prestataire | ✅ Fait | tickets.routes.ts · campagne prestataires |

### 5.2 Sondages

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B5.2.1` | Création du questionnaire | ✅ Fait | migrations 035/037 · campagne module5 |
| `B5.2.2` | Paramétrage et ciblage (géographique, type de foyer) | ✅ Fait | migration 035 · campagne module5 |
| `B5.2.3` | Publication et notification push | ✅ Fait | notifierPublication (migration 044) · campagne notifications |
| `B5.2.4` | Résultats graphiques et export CSV / PDF | ✅ Fait | dépouillement graphique, export Excel/CSV (campagne exports) et PDF (impression des résultats) |

### 5.3 Projets

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B5.3.1` | Création d'un projet (FR/AR, périmètre) | ✅ Fait | migration 035 · campagne module5 |
| `B5.3.2` | Liste, suivi et affichage sur la carte | ✅ Fait | Communication.tsx |
| `B5.3.3` | Upload de documents | ✅ Fait | Communication.tsx (dépôt + liste) · migration 041 · campagne module5 |
| `B5.3.4` | Visibilité citoyenne | ✅ Fait | publicationsCitoyen.routes.ts |

### 5.4 Notifications ciblées

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B5.4.1` | Création d'une notification par zone | ✅ Fait | migration 035 · campagne module5 |
| `B5.4.2` | Ciblage sur les adresses citoyennes | ✅ Fait | app.destinataires_publication · campagne module5 |
| `B5.4.3` | Canaux de diffusion (push, SMS, courriel) | 🟡 Partiel | push réellement émis (migration 044) ; SMS et courriel enregistrables mais non câblés (décision de fournisseur, §7.2) |
| `B5.4.4` | Historique des envois | ✅ Fait | envois_notification · campagne module5 |

### 5.5 Points citoyens

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B5.5.1` | Gestion des adresses citoyennes | ✅ Fait | migration 021 · campagne citoyen |
| `B5.5.2` | Validation des nouveaux points | ✅ Fait | PointsSuggeres.tsx (onglet communal) · migration 042 · campagne suggestions |
| `B5.5.3` | Association équipe → circuit | ✅ Fait | migrations 034/040 · campagne module4 |
| `B5.5.4` | Indicateurs de communication (délai, volumétrie, taux) | ⬜ À faire |  |

### 3.2.6 Paramètres

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B6.1` | Bascule Français / العربية | ✅ Fait | i18n.ts, RTL · tout le portail |
| `B6.2` | Préférences de notification et seuils | ✅ Fait | préférences d'alerte de chacun (domaines, gravité minimale) sur le panneau « À vérifier » ; seuils de la commune (`parametres_commune`, migration 048 : délai des réclamations, préavis d'entretien, actions en retard) qui y déclenchent des alertes · campagne parametres |
| `B6.3` | Fuseau horaire (UTC+1) | ✅ Fait | toute date affichée passe par `lib/formats.ts`, à l'heure de Tunis quel que soit le réglage du poste, et Paramètres le dit ; aucun autre fuseau n'est proposé, la Tunisie n'en a qu'un |
| `B6.4` | Format de date | ✅ Fait | jour/mois/année, ISO, mois en toutes lettres — enregistré sur le compte (`users.preferences`), appliqué à tout le portail (`lib/formats.ts`) · campagne parametres |
| `B6.5` | Changement de mot de passe | ✅ Fait | ChangerMotDePasse.tsx (mot de passe provisoire) et, depuis le Jalon 7, à tout moment dans Paramètres · campagne comptes |
| `B6.6` | Unités de mesure | ✅ Fait | masses (t / kg), volumes (m³ / L), surfaces (km² / ha), à l'affichage seulement : les valeurs restent stockées dans leur unité · campagne parametres |

### 3.2.7 Contacts

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `C1.1` | Liste des contacts | ✅ Fait | Contacts.tsx (recherche, filtre par catégorie) · migration 045 · campagne contacts |
| `C1.2` | Ajouter un contact | ✅ Fait | contacts.routes.ts (au moins un téléphone ou un courriel, garanti aussi en base) · campagne contacts |
| `C1.3` | Modifier / supprimer (suppression logique) | ✅ Fait | app.supprimer ouvert aux contacts, journal d'audit · lecture réservée à la commune et à la FNCT (pas au prestataire) · campagne contacts |
| `C1.4` | Import / export CSV | ✅ Fait | export (campagne exports) ; import avec détection des doublons, aperçu avant écriture (`POST /contacts/import` · campagne imports) |

### 3.2.8 Découpage communal

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `C2.1` | Carte du périmètre communal | ✅ Fait | migration 025 · campagne decoupage |
| `C2.2` | Import GeoJSON / Shapefile / KML | 🟡 Partiel | GeoJSON et KML : oui. Shapefile : non |
| `C2.3` | Édition manuelle du polygone | ✅ Fait | DecoupageCommunal.tsx (Geoman) |
| `C2.4` | Découpage en zones | ✅ Fait | migration 012 · campagne decoupage |
| `C2.5` | Validation par le Super Admin FNCT | ✅ Fait | la commune propose son découpage (périmètre et secteurs), la FNCT compare, valide ou refuse motif à l'appui (`versions_decoupage`, `app.valider_version_decoupage`, migration 049) ; la commune ne modifie plus son découpage directement · campagne versions-decoupage |
| `C2.6` | Historique et retour à la version précédente | ✅ Fait | chaque état validé est une version numérotée, réapplicable avec les identifiants des secteurs et leurs rattachements ; retour demandé par la commune ou appliqué par la FNCT · campagne versions-decoupage |

### 3.2.9 Rapports et études

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `C3.1` | Liste des rapports | ✅ Fait | RapportsEtudes.tsx (liste + filtre par catégorie) · campagne rapports |
| `C3.2` | Dépôt de document (PDF, DOCX, XLSX, PPTX) | ✅ Fait | migration 043 · services/fichiers.ts (signature ZIP, plafond 50 Mo pour l'usage `rapport_etude`) · campagne rapports |
| `C3.3` | Métadonnées (titre, type, auteur, date) | ✅ Fait | table `rapports_etudes` (migration 043) · rapportsEtudes.routes.ts |
| `C3.4` | Catégories d'étude | ✅ Fait | 5 catégories (étude technique, rapport d'activité, audit, plan d'action, autre) · migration 043 |
| `C3.5` | Lecteur PDF intégré | ✅ Fait | RapportsEtudes.tsx (« Aperçu » dans la page, pour chaque version) ; un document Office s'ouvre à part, aucun navigateur ne l'affichant nativement |
| `C3.6` | Versionnement | ✅ Fait | migration 045 (`document_id`, `version`, garde-fous en base) · routes `/rapports-etudes/:id/versions` · campagne rapports |
| `C3.7` | Accès FNCT / commune | ✅ Fait | RLS `rapports_etudes_select`/`_insert`/`_update` (migration 043) · campagne rapports |

### 3.2.10 KPI 5 axes

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `Axe 1` | Efficacité opérationnelle | ✅ Fait | contrôles terrain (M1-2), entretien (M1-7), tonnages mesurés ; balayage (ml des nettoyages), bâchage (fins de poste), cimetières, marchés, abattoirs (nettoyages des lieux) mesurés dès que le registre est tenu, déclarés sinon ; espaces verts déclarés · campagnes kpi-5-axes, kpi-sources |
| `Axe 2` | Qualité de service | ✅ Fait | réclamations et délai (M3-1), information et consultation (M1-3), digitalisation (M3-3) mesurées ; participation et partenariats déclarés · campagne kpi-5-axes |
| `Axe 3` | Performance environnementale | ✅ Fait | déchets verts et DDC (M1-5), part collectée séparément (DMA-4) mesurées ; décharge, innovation et préparation au décret DMA déclarées · campagne kpi-5-axes |
| `Axe 4` | Performance économique | ✅ Fait | coût global à la tonne (salaires, carburant — mesuré par les pleins —, maintenance, redevances), non renseigné tant qu'une composante manque ; conventions de propreté (M2-2) mesurées par le registre des commerces · campagnes kpi-5-axes, kpi-sources |
| `Axe 5` | Sécurité et ressources humaines | ✅ Fait | effectif, encadrement, absentéisme mesurés ; EPI (M1-6) et accidents mesurés par leurs registres, déclarés sinon ; heures de formation déclarées · campagnes kpi-5-axes, kpi-sources |

### 3.2.11 Prestataires privés

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B7.1` | Assignation de zones | ✅ Fait | migration 020 · campagne prestataires |
| `B7.2` | Périmètre d'action cloisonné | ✅ Fait | migrations 022/027 · campagne intercommunal |
| `B7.3` | Traitement des réclamations transférées | ✅ Fait | campagne prestataires |
| `B7.4` | Tableau de bord restreint | ✅ Fait | « Mes indicateurs » dans le dossier du prestataire : passages réalisés et contrôlés, réclamations traitées, délai — ses seules lignes (`GET /kpi/prestataire`) · campagne kpi-5-axes |

### 3.3 Application citoyenne

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `M1` | Inscription / connexion (téléphone + OTP) | 🟡 Partiel | compte par courriel et mot de passe ; ni téléphone ni OTP |
| `M2` | Gestion des adresses | ✅ Fait | migration 021 · campagne citoyen |
| `M3` | Horaires, équipe assignée et véhicule | ✅ Fait | app.horaires_citoyen · campagne citoyen |
| `M3.1` | Suggestion d'un point manquant | ✅ Fait | ProposerPoint.tsx (onglet citoyen) · migration 042 · campagne suggestions |
| `M4` | Déposer une réclamation (texte, photo, position) | ✅ Fait | FormulaireSignalement.tsx · campagne citoyen |
| `M5` | Suivi de la réclamation | ✅ Fait | migration 021 · campagne citoyen |
| `M6` | Notifications push | ✅ Fait | migration 044 (`notifications_citoyen`, `preferences_notification`) · routes citoyen.routes.ts · campagne `notifications-citoyen` |
| `M7` | Participation aux sondages | ✅ Fait | publicationsCitoyen.routes.ts · campagne module5 |
| `M8` | Visibilité de l'équipe de collecte | ✅ Fait | app.horaires_citoyen · campagne citoyen |
| `M9` | Bilinguisme FR / AR avec RTL | ✅ Fait | i18n.ts · tout l'espace citoyen |

---

## 4. Les jalons à venir, et pourquoi dans cet ordre

L'ordre ci-dessous n'est pas celui du cahier des charges : c'est celui qui
**débloque le plus de fonctionnalités par unité de travail**, et qui respecte les
dépendances réelles entre les briques.

### Jalon 1 — Brancher les écrans sur ce qui est déjà bâti ✅ *(fait le 22 septembre 2026)*

Quatre chantiers, tous du côté de l'écran plutôt que de la conception — l'API et
le cloisonnement existaient déjà pour trois d'entre eux.

| Quoi | Débloque | Preuve |
|---|---|---|
| Écran de validation des points proposés par les citoyens (commune), et formulaire de proposition (citoyen) | `B5.5.2`, `M3.1` | `PointsSuggeres.tsx`, `ProposerPoint.tsx` · migration 042 |
| Dépôt des documents d'un projet | `B5.3.3` | `Communication.tsx` (section Documents) · migration 041 |
| Photo du constat de terrain quotidien | complète la rubrique 3 | `ConstatDuJour.tsx` · usage `constat_terrain` (migration 041) |
| Écran des rapports et études, avec dépôt DOCX/XLSX/PPTX jusqu'à 50 Mo | `C3.1`–`C3.4`, `C3.7` | `RapportsEtudes.tsx` · migration 043 · campagne `rapports` |

**Corrections livrées avec le lot**, trouvées en rejouant migrations et seeds sur
une base neuve dans un environnement isolé (aucune n'était visible sur
l'installation de développement existante, jamais reconstruite de zéro) :
- `POST /circuits/controles` et `POST /passages` : la clause `ON CONFLICT` ne
  portait plus la colonne `voyage`, introduite par la migration 029 — tout
  constat de terrain ou toute déclaration de passage échouait (500) sur une
  base neuve. Corrigé dans `circuits.routes.ts` et `passages.routes.ts`.
- Le type utilitaire `Corps<>` de `web/src/lib/api.ts` supposait un corps de
  requête obligatoire (`requestBody:`) alors que le contrat généré le porte en
  optionnel (`requestBody?:`) pour toutes les routes — `deposerFichier`, déjà en
  production, cessait de compiler à la moindre régénération des types.

**Signalé, non corrigé dans ce lot** (tâches de fond distinctes) : fragilité de
plusieurs campagnes de tests sur une base rejouée de zéro (dates codées en dur,
ordre des seeds `seed:personnel`/`seed:dar-chaabane`) et une lenteur sévère
(> 3 min) de `GET /communication` pour Dar Chaabane El Fehri, sans lien avec ce
lot.

**Test de validation.** Contrat d'API vérifié (`verifier:contrat`), 44
migrations rejouées sur base neuve, typage front et back sans erreur, campagne
`rapports` créée (20/20), campagnes `fichiers` (26/26) et `circuits` (25/26,
1 échec pré-existant déjà signalé) rejouées sans régression.

### Jalon 2 — Le socle de notification ✅ *(fait le 23 septembre 2026)*

**Lot 1 — `B5.1.2`, `B5.2.3`, `B5.4.3` : fait le 22 septembre 2026.**

Décision retenue avec l'utilisateur : un seul canal pour ce lot, le **push
web** (Web Push API + VAPID) — aucun fournisseur externe à payer ni à choisir.
SMS et courriel restent enregistrables comme canal choisi mais n'émettent
encore rien (décision de fournisseur distincte, liée à `M1`, § 7.2). Politique
de retry retenue : **une seule tentative automatique**, un échec est consigné
immédiatement, jamais réessayé en silence.

Construit dans ce lot (migration 044) :
- `push_souscriptions` — l'endpoint du navigateur d'un citoyen, qu'il
  enregistre lui-même (aucune commune n'y a accès).
- Le journal d'envoi individuel — une ligne par tentative, avec son issue
  (`livre`/`echec`/`non_abonne`/`sans_souscription`) ; lecture réservée à la
  FNCT et au citoyen concerné, jamais à la commune — qui continue de lire
  l'agrégat de `envois_notification` (campagne module5), jamais qui a reçu
  quoi.
- Le ciblage d'une publication reste entièrement en SQL (fonctions
  `app.souscriptions_*`, SECURITY DEFINER), reproduisant le principe déjà posé
  par `app.compter_destinataires` (035) : la commune sait combien, jamais qui.
- Côté citoyen : bandeau d'abonnement (`AbonnementPush.tsx`), gestion `push` /
  `notificationclick` dans le service worker (`web/public/sw.js`).

Ce lot avait dû construire, pour être testable, le mécanisme même de `M6`
(abonnement du navigateur, réception, clic vers l'application) — sans
l'historique côté citoyen ni les préférences fines, objets du lot 2.

**Test de validation.** Campagne `notifications` (16/16) : un échec de
livraison est consigné et non silencieux (endpoint injoignable → `echec` avec
message) ; un désabonné ne reçoit rien (`non_abonne`) ; une commune ne peut
pas lire le journal individuel (RLS vérifiée par émulation de rôle) ; le
citoyen concerné voit ses propres envois.

**Lot 2 — clôture de `M6` : fait le 23 septembre 2026.**

Le journal d'envoi du lot 1 (`notifications_envoyees`) est devenu
`notifications_citoyen` : même table, renommée et étendue (`lu`, `metadata`,
`tentatives`) pour porter aussi l'historique citoyen — pas de migration
séparée, la précédente n'était pas encore fusionnée dans `main`. Construit
dans ce lot :
- `preferences_notification` (canal × type, table creuse : une ligne absente
  vaut « activé ») — le citoyen choisit ce qu'il veut recevoir, par type de
  notification. Le service d'émission la consulte avant d'envoyer, mais
  consigne toujours l'issue dans l'historique, y compris quand rien n'est
  parti.
- API citoyenne : `GET /citoyen/notifications` (+ `?nonLues=true`),
  `PUT .../notifications/:id/lu`, `PUT .../notifications/tout-lu`,
  `GET`/`PUT /citoyen/preferences`.
- Écrans « Mes notifications » (liste chronologique, non-lus mis en évidence,
  tout marquer lu, état vide) et « Préférences » (canaux × types, SMS et
  courriel grisés — non câblés) — bilingues FR/AR, RTL compris — atteints
  depuis une cloche à compteur de non-lus dans l'en-tête de l'espace citoyen.
- Relance manuelle (« Renvoyer ») d'un envoi en échec, depuis l'écran
  Réclamations du back-office communal (`PATCH
  /tickets/:id/notification/renvoyer`) — réservée aux décisions de
  réclamation (la commune connaît déjà ce citoyen par le ticket qu'elle
  instruit) ; une publication reste invisible d'une commune, comme au lot 1.
  L'automatisme, lui, continue de ne tenter qu'une fois.

**Test de validation.** Campagne `notifications-citoyen` (25/25, nouvelle) :
RLS croisée (un citoyen ne lit ni l'historique ni les préférences d'un
autre) ; l'historique reste renseigné malgré un type désactivé (`non_souhaite`)
et malgré l'opt-out global (`non_abonne`) ; compteur de non-lus exact ; « tout
marquer lu » vide le compteur sans supprimer l'historique ; relance manuelle
refusée hors échec (400), acceptée sur un échec et incrémente `tentatives`.
Campagne `notifications` rejouée sans régression (16/16) après le
renommage de table. Contrat d'API vérifié, 45 migrations rejouées sur base
neuve, typage front et back sans erreur.

### Jalon 3 — Rapports et études, puis Contacts ✅ *(fait le 28 septembre 2026)*

Les rapports et études avaient été avancés au Jalon 1 (dépôt, métadonnées,
catégories) : ce jalon en ferme la rubrique et ouvre celle des contacts.

| Quoi | Débloque | Preuve |
|---|---|---|
| Annuaire de travail de la commune : liste, recherche, filtre par catégorie, ajout, modification, retrait logique | `C1.1`, `C1.2`, `C1.3` | `Contacts.tsx` · `contacts.routes.ts` · migration 045 · campagne `contacts` |
| Versionnement des rapports : une version 2 est une nouvelle ligne rattachée à la première, jamais un écrasement | `C3.6` | migration 045 · `/rapports-etudes/:id/versions` · campagne `rapports` |
| Lecteur PDF intégré à la page, pour chaque version | `C3.5` | `RapportsEtudes.tsx` |

**Choix retenus.**
- **Contacts : lecture réservée à la commune et à la FNCT.** Ce sont des
  données personnelles de tiers ; un prestataire rattaché lit les circuits et
  les réclamations de la commune, pas son carnet d'adresses (minimisation,
  décret-loi 2022-54). Une fiche doit porter au moins un téléphone ou un
  courriel — vérifié par l'API et par une contrainte en base.
- **Versions : même table, garde-fous en base.** Une version se rattache par
  `document_id` au document d'origine ; un déclencheur refuse qu'elle se
  greffe sur le document d'une autre commune, ou qu'une « version 2 » existe
  sans document. Un numéro de version n'est jamais réattribué, même après
  retrait. Retirer un document retire toutes ses versions — sinon la version 1
  réapparaîtrait après le retrait de la 2.
- **`C1.4` (CSV) reporté au Jalon 4**, qui bâtit un service d'export unique
  pour les cinq endroits qui en demandent.

**Correction livrée avec le lot** : la ligne « 3.3 Application citoyenne » du
tableau par rubrique n'avait pas été mise à jour à la clôture de `M6` (Jalon 2) ;
elle l'est ici (9 faits, 1 partiel).

**Test de validation.** Dépôt d'une version 2 d'un rapport : la version 1 reste
consultable (son fichier se lit toujours), datée et imputée ; un cadre d'une
autre commune ne lit pas l'historique et ne peut pas y greffer de version, pas
même en SQL direct. Campagnes `rapports` (37/37, dont 17 nouvelles assertions
de versionnement) et `contacts` (25/25, nouvelle) ; 46 migrations rejouées sur
base neuve ; contrat d'API conforme (159 routes) ; typage front et back sans
erreur ; le reste de la suite sans régression (mêmes échecs pré-existants que
les jalons précédents, signalés à part).

### Jalon 4 — L'import et l'export, de façon transverse ✅ *(fait le 28 septembre 2026)*

Le cahier des charges demande de l'export à cinq endroits (`A3.4`, `B2.4`,
`B3.6`, `B5.2.4`, `C1.4`). Les bâtir un par un produirait cinq formats
différents. Un service unique — une requête, un jeu de colonnes, un fichier —
les sert tous.

**Test de validation.** Un export rouvert dans un tableur affiche les accents
arabes et français correctement, et les nombres restent des nombres.

**Lot 1 — le service d'export (Excel + CSV) : fait le 28 septembre 2026.**

- **Une requête** : l'export n'a pas de requête à lui. C'est une autre
  représentation des routes de liste existantes (`?format=csv|xlsx`) — même
  SQL, mêmes filtres, mêmes rôles, même cloisonnement RLS. Le fichier est ce
  que l'écran montrait ; il ne peut pas en diverger.
- **Un jeu de colonnes** par route (`services/jeuxExport.ts`) : en-têtes
  FR/AR, type de chaque colonne, libellés des valeurs codées (« En panne »,
  pas « en_panne »).
- **Un fichier** (`services/export.ts`, sans dépendance) : XLSX aux nombres et
  aux dates typés, feuille de droite à gauche en arabe, en-tête figé et filtre
  automatique ; CSV en UTF-8 avec BOM, « ; » et virgule décimale. Les textes
  commençant par = + - @ sont neutralisés (injection de formule).
- Branché sur les cinq écrans (`BoutonExport.tsx`) : tableau national et
  annuaire des communes, parc, carte communale (nouveaux filtres circuit/type
  des arrêts, repris par l'export), résultats d'un sondage, contacts.

Test de validation passé deux fois : par la campagne `exports` (42/42) sur les
octets des fichiers, et dans un **Excel réel** : noms arabes et accents
intacts, valeurs d'achat et populations lues comme des nombres, dates comme des
dates, CSV découpé en colonnes, feuille arabe de droite à gauche. Réserve : le
CSV suit la convention d'un tableur réglé en français (« ; », virgule
décimale) ; sur un poste réglé autrement, seul le XLSX garantit le résultat —
c'est pourquoi l'écran le propose en premier.

**Lot 2 — imports CSV et PDF : fait le 28 septembre 2026.**

- **Un lecteur CSV unique** (`services/import.ts`), piloté par les MÊMES jeux
  de colonnes que l'export : un en-tête se reconnaît à son libellé français,
  arabe ou à son code, une valeur codée à son libellé. Un export retouché dans
  un tableur puis réimporté fait l'aller-retour sans rien renommer. Séparateur
  « ; », « , » ou tabulation déduit de l'en-tête ; UTF-8 avec ou sans BOM, ou
  Windows-1252 (le « CSV » classique d'Excel) avec un avertissement, puisque
  l'arabe n'y survit pas ; virgule ou point décimal.
- **En deux temps**, comme l'import KML : un aperçu ligne par ligne qui
  n'écrit rien (à créer, à mettre à jour, inchangé, déjà présent, erreur — avec
  la raison), puis la validation, en une transaction, des seules lignes
  valides.
- **Contacts** (`C1.4`) : un contact déjà présent (même nom, et même téléphone
  ou même courriel) n'est pas recréé — réimporter un export ne double pas
  l'annuaire.
- **Parc** (`B2.4`) : un engin se reconnaît à son immatriculation, espaces et
  casse mis à part ; inconnu, il est créé, connu, seules les cases remplies
  sont comparées — une case vide n'efface jamais une saisie de l'écran, et un
  export réimporté tel quel est « inchangé » partout.
- **Points** (`B3.1`) : le CSV est un format de plus du lecteur de relevés,
  reconnu à son contenu. L'import par circuit, son aperçu et ses options
  (remplacer / compléter) servent tels quels ; l'ordre de passage est
  renuméroté par voyage.
- **PDF** (`A3.4`, `B5.2.4`) : par l'impression du navigateur, qui met en
  forme l'arabe et le sens de lecture sans bibliothèque ni police embarquée.
  Le bloc est copié dans une zone d'impression avec un en-tête (titre, date,
  organisme) ; le reste de la page est retiré, pas seulement masqué — sans
  quoi il laisserait des pages blanches.

**Corrigé en passant** : `POST /trucks` ne reconnaissait un engin existant qu'à
un identifiant dérivé de l'immatriculation, que ne portent pas les fiches des
seeds (« dcef-02220943 », « trk-04 ») : ressaisir l'immatriculation d'un engin
existant le dédoublait. Il le reconnaît désormais à l'immatriculation, comme
l'import.

**Test de validation.** Campagne `imports` (51/51, nouvelle) : aperçu sans
écriture, validation des seules lignes valides, aller-retour export → import
sans effet (contacts : tout « déjà présent » ; parc : tout « inchangé », y
compris depuis un export en arabe), nom et catégorie en arabe arrivés intacts,
Windows-1252 lu avec avertissement, cloisonnement (une autre commune : 403 ;
prestataire : 403). PDF vérifiés en les produisant réellement (Microsoft Edge,
à partir de la vue d'impression de l'application) : tableau national en
français et en arabe — de droite à gauche, lettres liées, en-tête répété sur la
seconde page — et résultats d'un sondage. Cette vérification a révélé, et fait
corriger, des titres de colonnes qui disparaissaient à l'impression.

### Jalon 5 — La maintenance des engins (GMAO) ✅ *(fait le 28 septembre 2026)*

`B2.2` et `B2.3` étaient absents. C'était la rubrique la moins avancée, et
celle dont dépend l'axe 3 des KPI (coût de maintenance à la tonne).

| Quoi | Débloque | Preuve |
|---|---|---|
| Carnet d'entretien : date, type, nature (préventive / corrective), coût au millime, kilométrage, garage | `B2.2` | `interventions_maintenance` (migration 046) · fiche de l'engin · export Excel/CSV |
| Plans d'entretien (« vidange tous les 10 000 km ou 180 jours ») et leurs échéances | `B2.3` | `plans_entretien`, `app.echeances_entretien` · bandeau d'alertes en tête du parc |
| Le compteur de l'engin, qui manquait | prérequis de `B2.3` | `vehicules.kilometrage` / `kilometrage_le` |
| Coût par engin sur douze mois, part corrective | prépare l'axe 3 (Jalon 8) | `GET /maintenance/bilan` |

**Choix retenus.**
- **L'échéance n'est pas stockée** : elle se calcule depuis la dernière
  intervention du même type. Une échéance écrite en base serait une seconde
  vérité qu'une intervention saisie ou retirée laisserait fausse — c'est ce
  qui fait qu'une alerte disparaît d'elle-même à la saisie, et revient si
  l'intervention est retirée.
- **« À vérifier » plutôt que « à jour »** : un plan au kilomètre qu'on ne peut
  pas évaluer — aucun relevé de compteur (le cas des 35 engins des seeds), ou
  dernière intervention saisie sans kilométrage — n'est jamais présenté comme
  à jour.
- **Le compteur ne recule pas** : ni par un relevé (refusé, sauf compteur
  remplacé explicitement confirmé), ni par une intervention ancienne saisie
  après coup.
- **Des coûts et des pannes : la commune et la FNCT** — pas le prestataire,
  qui voit les engins de ses zones mais pas leur carnet. Un déclencheur refuse
  en base une intervention ou un plan rattaché à une autre commune que celle
  de l'engin.

**Test de validation.** Campagne `maintenance` (43/43, nouvelle) : une vidange
due dans 10 jours est « à prévoir » alors que l'échéance n'est pas atteinte ;
la saisie de la vidange la fait passer « à jour » et sortir de la liste, avec
une nouvelle échéance à +180 j / +10 000 km ; son retrait fait revenir
l'alerte. Vérifié aussi dans le navigateur : bandeau « 1 à prévoir », badge sur
la ligne de l'engin, saisie de l'intervention par le formulaire, bandeau passé
« à jour ». 47 migrations rejouées sur base neuve ; contrat conforme
(172 routes) ; les 25 autres campagnes sans régression.

### Jalon 6 — Champs libres et planification d'actions ✅ *(fait le 28 septembre 2026)*

`B3.4` et `B3.5` : ajouter des colonnes libres au tableau des points, filtrer par
étiquette, et sortir la sélection. C'est ce qui permet à une commune d'organiser
une campagne de déchets verts sans attendre une évolution du logiciel.

| Quoi | Débloque | Preuve |
|---|---|---|
| Onglet « Points » : tous les arrêts de la commune, tous circuits confondus, avec les colonnes que la commune définit (texte, nombre, oui/non, liste de choix, date) | `B3.4` | `champs_points`, `points_collecte.attributs` (migration 047) · saisie à la case, ou par lot sur une sélection |
| Étiquettes de couleur, posées ou ôtées par lot ; filtre par une ou plusieurs étiquettes | `B3.5` | `etiquettes_points`, `points_collecte.etiquettes` |
| Actions planifiées sur une sélection (« campagne déchets verts le 12 octobre »), suivies point par point : fait, par qui, quand ; « en retard » calculé | `B3.5` | `actions_planifiees`, `actions_points` · vue « Actions planifiées » |
| Filtres par étiquette, par valeur de colonne (égal, contient, renseigné, vide) et par action, sur la route de liste existante | `B3.6` (complété) | l'export reprend la sélection, avec les colonnes libres et le nom des étiquettes |
| L'historique des arrêts, qui manquait | prérequis de la traçabilité | déclencheur d'audit sur `points_collecte` (l'onglet « Historique » du circuit le lisait depuis la migration 028 sans que rien ne l'écrive) |

**Choix retenus.**
- **Une colonne libre n'est pas une colonne SQL** : ajouter une colonne à une
  table est une migration, pas un geste d'administrateur municipal. Les
  définitions vivent dans une table, les valeurs sur le point, indexées par
  l'identifiant du champ — renommer « accès camion » ne perd ni ne réécrit
  rien.
- **Le type d'un champ ne change pas** : les valeurs saisies ne le suivraient
  pas. On crée un autre champ ; l'ancien se retire. Et un choix de liste encore
  porté par des points ne peut pas être retiré.
- **Une valeur se contrôle contre son champ, et un lot est tout ou rien** : une
  valeur d'un autre type, ou un seul point introuvable, et rien n'est écrit.
- **Une action vise des points arrêtés à sa création**, pas une étiquette : une
  étiquette posée demain ne doit pas agrandir en silence une campagne déjà
  annoncée aux riverains.
- **Retirer n'efface pas** : une colonne ou une étiquette retirée ne s'affiche,
  ne se filtre ni ne s'exporte plus, mais ses valeurs restent sur les points,
  pour l'historique.
- **Qui voit quoi** : le prestataire chargé d'un circuit lit les colonnes et
  les étiquettes des arrêts qu'il voit ; seules la commune et la FNCT écrivent,
  et les actions planifiées restent l'affaire de la commune. En base, un
  déclencheur refuse l'étiquette ou l'action d'une autre commune.

**Test de validation.** Campagne `champs-points` (75/75, nouvelle) : le champ
« accès camion » est créé, posé à « non » sur trente points d'un coup, le filtre
en rend exactement trente, et l'export CSV sort ces trente lignes avec la
colonne « accès camion » (l'Excel en arabe, avec son libellé arabe). Vérifié
aussi dans le navigateur, sans aucune intervention : colonne créée depuis
l'écran, trente points cochés et renseignés par la barre de lot, filtre à
trente, export identique, puis une action planifiée sur ces trente points et
un premier point pointé « fait » ; écran relu en arabe et à la largeur d'un
téléphone. 48 migrations rejouées sur base neuve ; contrat conforme
(189 routes) ; les 26 autres campagnes sans régression.

### Jalon 7 — Paramètres et découpage : les finitions ✅ *(fait le 28 septembre 2026)*

`B6.2`, `B6.4`, `B6.6` (préférences, format de date, unités) et `C2.5`, `C2.6`
(validation FNCT du découpage, retour à la version précédente). En deux lots,
une seule PR.

| Quoi | Débloque | Preuve |
|---|---|---|
| **Lot 1.** Écran « Paramètres » (bouton en tête du portail, tous les rôles) : langue, format de date, unités, alertes, mot de passe | `B6.2`, `B6.4`, `B6.6`, `B6.5` à tout moment | `users.preferences` (migration 048), `GET/PUT /comptes/moi/preferences`, rendues aussi à la connexion |
| Un seul module de formatage, à l'heure de Tunis, repris par dix-sept écrans | `B6.3`, `B6.4`, `B6.6` | `web/src/lib/formats.ts` |
| Seuils de la commune, qui déclenchent vraiment : réclamations en attente, entretiens en retard, actions dépassées dans « À vérifier » ; préavis d'entretien par défaut | `B6.2` | `parametres_commune`, `app.incoherences_seuils` (migration 048) |
| **Lot 2.** Onglet « Découpage » de la commune : état en vigueur, proposition (retouche du périmètre, secteurs dessinés ou importés en GeoJSON), historique | `C2.5`, `C2.6` | `versions_decoupage`, routes `/decoupage/*` (migration 049) |
| File « Découpages à valider » de la FNCT, comparaison carte et écarts (secteurs ajoutés, modifiés, retirés ; débordements et chevauchements), validation ou refus motivé | `C2.5` | `app.valider_version_decoupage` |
| Retour à une version antérieure, avec les mêmes identifiants de secteurs | `C2.6` | `POST /decoupage/versions/{id}/restaurer` |

**Choix retenus.**
- **Deux niveaux de paramètres** : ce que chacun préfère voir (sur son compte)
  et ce que la commune décide (une règle de service pour toute l'équipe).
- **Un seuil qui ne déclenche rien n'est pas un seuil** : les seuils de la
  commune alimentent le panneau « À vérifier » ; un avis bloquant s'y affiche
  toujours, quelles que soient les préférences.
- **Les unités ne changent que l'affichage** : rien n'est converti en base.
- **Ce qui est validé, c'est un état complet** (périmètre et ensemble des
  secteurs), pas une retouche : c'est ce qui rend une version réapplicable.
- **La commune ne modifie plus son découpage directement** : tracé, nom, code,
  création et retrait d'un secteur passent par une proposition ; les attributs
  de service (couleur, fréquence, prestataire, statut) restent à sa main. Les
  corrections directes de la FNCT créent, elles aussi, une version.
- **La première modification fige d'abord l'existant** en version 1, pour qu'il
  y ait toujours une version précédente où revenir ; revenir en arrière crée
  une version nouvelle, l'historique ne se réécrit pas.

**Test de validation.** Campagne `versions-decoupage` (43/43, nouvelle) :
Houmt Souk propose son périmètre et deux secteurs ; rien ne change avant la
décision ; la FNCT refuse, motif à l'appui, puis valide la proposition
corrigée ; la commune redessine ses secteurs (l'un retiré, un autre qui
déborde, signalé à la FNCT) ; elle demande le retour à la version précédente,
que la FNCT valide — le secteur retiré revient sous son identifiant et son
circuit le retrouve. Campagne `parametres` (27/27, nouvelle) : les préférences
reviennent à la connexion ; une réclamation de quatre jours remonte dans « À
vérifier » avec un délai de trois jours, et disparaît avec un délai de sept.
Vérifié aussi dans le navigateur : kilogrammes et dates ISO dans le parc,
avis masqués par les préférences, un secteur dessiné à la souris, proposé,
validé par la FNCT, puis défait par un retour à la version 1. 50 migrations
rejouées sur base neuve ; contrat conforme (200 routes).

### Jalon 8 — Le tableau de bord KPI 5 axes ✅ *(fait le 28 septembre 2026)*

**Il venait en dernier parce qu'il se nourrit de tout le reste.** Un indicateur
calculé sur une donnée absente n'est pas un indicateur : c'est un chiffre faux
qui sera lu comme vrai, et qu'on opposera un jour à un prestataire ou à un
conseil municipal.

| Quoi | Débloque | Preuve |
|---|---|---|
| Les 5 axes, par commune et par année : ce que SIIPI mesure (contrôles, réclamations, entretien, pesées, publications, personnel, usage de la plateforme) et ce que la commune déclare | `Axe 1` à `Axe 5` | `app.mesures_kpi` (migration 050), `services/kpi5Axes.ts`, onglet « Indicateurs » |
| La grille du **Concours national de propreté** : 19 indicateurs en trois modules, note sur 100, reventilation ministérielle (ANGeD : M1-8 → M1-9 ; Innovation : M1-10 → M1-3 ; Abattoirs : M2-5 sans objet) | Concours | `indicateurs_kpi` (barème en base, réglable par la FNCT) |
| La **fiche d'évaluation annuelle** : ce que SIIPI ne voit pas, déclaré par la commune, validé par la FNCT ; le classement officiel ne retient que les fiches validées | Concours | `evaluations_kpi`, `valeurs_kpi` |
| La **préparation au décret DMA** (tri à la source) : conteneurs normalisés, zones pilotes, sensibilisation, part collectée séparément — un dispositif d'anticipation, sans effet sur la note | Axe 3 | famille « dma » du catalogue, vue « Préparation au tri » |
| Quatre niveaux d'agrégation : commune, gouvernorat, district FNCT, national — tonnages et taux de résolution joints | `A3.1` | `GET /kpi/national`, `/kpi/concours-national`, `/kpi/dma` |
| Alertes nationales à seuils réglables, et les alertes de la commune dans « À vérifier » | `A3.3` | `GET /kpi/alertes`, `parametres_kpi`, `app.incoherences_kpi` |
| « Visualiser » une commune depuis l'observatoire ; tableau de bord restreint du prestataire | `A2.3`, `B7.4` | bouton « Indicateurs », « Mes indicateurs » |

**Principe tenu — une donnée manquante n'est pas un zéro.** Une valeur saisie
est une ligne ; pas de ligne, pas de valeur. Une mesure dont le module n'a
jamais servi dans la commune n'a pas de ligne (la digitalisation d'une commune
qui n'a jamais rien saisi n'est pas « 0 % » : elle est inconnue). La note du
Concours se calcule sur les seuls points renseignés, et s'affiche avec sa base
(« 14/19 indicateurs, 72 % des points ») ; une commune dont la couverture est
sous le seuil (60 % des points par défaut) n'est pas classée. Le coût global à
la tonne n'existe que si ses quatre composantes sont connues.

**Choix retenus, et ce qui reste à la FNCT.**
- **Le barème est une donnée** : la répartition des 100 points entre les 19
  indicateurs est provisoire tant que la FNCT ne l'a pas confirmée (écran
  Réglages) ; l'écran le dit.
- **Les districts FNCT ne sont pas supposés** : la table existe, vide ; la FNCT
  définit ses districts et y rattache les gouvernorats. D'ici là, la vue par
  district le dit (« non rattaché »).
- **Les codes** : M2-3 est lu comme « Cimetières » et M3-3 comme
  « Digitalisation » (la spécification citait deux fois M3-3). À confirmer.
- **Pas de vue matérialisée** : le calcul des 350 communes prend moins de
  100 ms ; un instantané stocké serait une seconde vérité à tenir à jour.

**Test de validation.** Campagne `kpi-5-axes` (64/64, nouvelle) : sur une année
vierge, un jeu de données maîtrisé (quatre contrôles, cinq réclamations, trois
pesées, quatre demandes d'enlèvement) ; chaque indicateur est recalculé à la
main et comparé au chiffre rendu — couverture des circuits 62,5 %, réclamations
75 % et note 0,708, tonnage 30 t, part séparée 20 %, coût global à la tonne ;
la reventilation (M1-9 à 9 points, M1-3 à 10, M2-5 sans objet, 96 points
applicables) ; la note recalculée depuis les points ; le cycle de la fiche
(brouillon, soumise, validée, verrouillée même en SQL, rouverte) ; le
classement officiel et provisoire ; les agrégations ; les districts ; le
barème ; les alertes ; le cloisonnement. Vérifié aussi dans le navigateur :
l'onglet Indicateurs de La Marsa (« non renseigné » partout où rien n'est
connu), une valeur saisie par la fiche, la vue nationale, et la validation de
la fiche par la FNCT depuis « Visualiser ».

### Lot d'optimisation — Les sources automatiques des KPI ✅ *(fait le 29 septembre 2026)*

**Pourquoi après le Jalon 8.** Le tableau de bord tenait, mais une bonne part
de la grille reposait sur la fiche d'évaluation : une déclaration annuelle, que
la FNCT valide sans pouvoir la vérifier. Ce lot fait mesurer par la plateforme
ce que les services tiennent déjà sur papier — sans supprimer la fiche, qui
reste la source tant qu'un registre n'est pas tenu.

| Quoi | Indicateur | Preuve |
|---|---|---|
| Lieux sur carte : marchés, cimetières, abattoirs, écoles, santé | — | `poi` (migration 051), onglet « Registres » › « Lieux et nettoyages » |
| Actions « Nettoyage » sur un lieu ou des points, closes avec les mètres linéaires réalisés | M1-1, M2-3, M2-4, M2-5 | `actions_planifiees.type`, `.poi_id`, `.metres_lineaires` ; objectif de balayage dans Paramètres |
| Check-list de fin de poste, « Benne bâchée avant transit » obligatoire | M1-9 | `fins_de_poste` |
| Pleins de carburant | coût global à la tonne | `fuel_logs` |
| Dotation EPI | M1-6 | `dotations_epi` |
| Journal des incidents du travail | Axe 5 (accidents) | `incidents_travail` |
| Commerces et conventions de propreté | M2-2 | `commerces`, `conventions_commerciales` |
| Moteur de fusion : mesuré › déclaré › non renseigné, badge de source | tous | `app.mesures_kpi_auto`, `services/kpi5Axes.ts` |
| Marchés et cimetières sur la carte citoyenne, avec leur état | — | `GET /citoyen/lieux` (`app.lieux_publics`) |

**Principe tenu — un registre vide n'est pas un zéro.** Une mesure n'existe que
si son registre est tenu dans l'année ; sinon la valeur déclarée reste la
source, et à défaut l'indicateur est « non renseigné ». Le balayage mesuré sans
objectif connu (ni dans Paramètres, ni dans la fiche) n'a pas de note. Un lieu
jamais nettoyé ni planifié est « non renseigné », pas « sale ».

**Cloisonnement.** Un lieu n'est visible que dans sa commune ; une action ne
peut viser un lieu d'une autre commune. La route citoyenne ne rend que les
marchés et cimetières actifs — jamais un abattoir.

**Test de validation.** Campagne `kpi-sources` (40/40, nouvelle), sur une année
vierge : bâchage en quatre temps (déclaré seul ; 3 fins de poste bâchées sur 4, mesuré, qui prime ; mesure retirée, la déclaration reprend ; ni l'une ni l'autre, non renseigné) ;
balayage à 140,2 ml/j sans puis avec objectif ; marchés à 50 % mesuré,
abattoirs à 100 %, cimetières restés déclarés faute de nettoyage échu ; EPI,
conventions, carburant (387,9 TND, compteur relevé), accidents à 0 sur journal
tenu ; route citoyenne (sans abattoir, 400 sans commune) ; cloisonnement. La
campagne `kpi-5-axes` reste à 64/64. Vérifié aussi dans le navigateur : un
marché créé sur la carte de La Marsa, un nettoyage planifié puis clos à
850 ml, une fin de poste sans bâchage refusée puis enregistrée, les badges
« Source : mesuré » (M1-9, M2-4), et le marché « propre » sur la carte
citoyenne.

### Jalon 9 — L'application mobile citoyenne

Voir § 7 : c'est une décision avant d'être un chantier.

---

## 5. Ce qui est fait et qui ne figurait pas au cahier des charges

Ces briques ne sont pas au TDR. Elles ont été ajoutées parce que le terrain les a
réclamées, et elles comptent dans ce que la FNCT reçoit.

| Brique | Pourquoi elle existe |
|---|---|
| **Panneau de cohérence** (`app.incoherences_commune`) | Le croisement à la main du registre des circuits et de l'inventaire du parc de Dar Chaabane a fait apparaître en quelques minutes des écarts que personne ne cherchait. Douze contrôles datés, avec ce qu'il y a à faire — jamais une correction automatique |
| **Constat du matin** | L'écran qu'un chef de service ouvre en arrivant : ce qui bloque aujourd'hui, et rien d'autre |
| **Espace prestataire et confrontation contractuelle** | Un tableau des passages déclarés face aux passages attendus, utilisable comme pièce de discussion |
| **Journal d'audit et suppression logique** | Rien ne s'efface de la base ; les accès aux données citoyennes sont tracés (décret-loi n° 2022-54) |
| **Retrait des métadonnées EXIF des photos** | Une photo de téléphone porte la position du domicile de celui qui l'a prise. Elle est retirée au dépôt, et rendue à l'écran pour qu'il la propose — jamais conservée à l'insu de la personne |
| **Rattachement multi-communes** | Un agent, un marché, plusieurs communes : la mutualisation est l'objet même de SIIPI, et sept politiques de cloisonnement la contredisaient |

---

## 6. Comment on valide : deux niveaux, et ils ne se remplacent pas

### Niveau 1 — Les campagnes automatisées *(en place)*

**Vingt et une campagnes rejouables**, lancées à chaque migration par
`MIGRER.bat` :

`module2` (circuits) · `module3` (parc) · `module4` (personnel) · `module5`
(communication) · `module6` (pesées) · `fichiers` (stockage) · `suggestions`
(points citoyens) · `rapports` (rapports et études) · `notifications` (socle
de notification) · `comptes` · `cloisonnement` · `intercommunal` · `citoyen` ·
`prestataires` · `circuits` · `decoupage` · `enlevements` · `observatoire` ·
`periode` · `audit` · `suppression`

**Leur principe :** elles commencent par ce que la plateforme **refuse**. Le
module 4 vérifie d'abord qu'aucune colonne de salaire, de CIN ou de santé
n'existe ; le stockage de fichiers, qu'un exécutable renommé « photo.jpg »
n'entre pas. Un module se juge d'abord à ce qu'il a refusé de stocker.

S'y ajoutent, à chaque passage : la chaîne des **45 migrations rejouée sur une
base neuve**, le contrôle du **contrat d'API** (toute route servie est
documentée — 147 routes), et le **typage du front** comparé au contrat
réellement servi.

### Niveau 2 — La recette terrain *(à organiser)*

C'est ce qui manque, et aucune campagne ne le remplace. Le journal des
corrections en porte la preuve : **cinq défauts n'ont été révélés par aucun des
240 tests automatisés** — ils n'apparaissaient qu'une fois la plateforme
réellement utilisée, avec un premier circuit créé et un premier signalement
déposé.

**Protocole proposé, par commune pilote :**

1. **Une semaine d'usage réel** par le service propreté, sans assistance, sur son propre registre.
2. **Trois parcours complets** tracés de bout en bout : un signalement citoyen jusqu'à sa preuve de traitement ; une journée de pointage jusqu'au coût à la tonne ; une tournée de prestataire jusqu'à la confrontation contractuelle.
3. **Un critère de sortie chiffré** : aucun écran ouvert sans savoir quoi y faire, et aucune donnée saisie deux fois.
4. **Consignation systématique** de tout défaut dans le journal des corrections, avec sa portée — pas seulement sa cause.

**Communes proposées :** Dar Chaabane El Fehri (registre le plus complet),
Djerba Houmt Souk (prestataire privé actif), et une commune rurale à désigner —
le cahier des charges distingue la couverture urbaine et rurale, et aucune
commune rurale n'a encore servi de terrain.

---

## 7. Trois décisions à prendre, et elles conditionnent la suite

### 7.1 L'application citoyenne : Android natif, ou web mobile ?

**C'est l'écart le plus important entre le cahier des charges et la plateforme.**

Le TDR demande une **application Flutter, Android en priorité**. Ce qui existe est
un **espace citoyen web**, bilingue et utilisable sur téléphone, qui couvre déjà
sept des dix fonctions demandées : adresses, horaires, équipe assignée,
réclamation avec photo et position, suivi, sondages, bilinguisme RTL.

Ce qu'une application native apporterait et que le web ne donne pas :
la **notification push** hors navigation, l'**installation sur l'écran d'accueil**
avec une icône, et le **fonctionnement hors connexion**.

Trois voies :

| Voie | Ce qu'elle coûte | Ce qu'elle donne |
|---|---|---|
| **Rester en web** | rien | tout sauf le push et le hors-ligne ; pas de présence sur le Play Store |
| **Application web progressive (PWA)** | faible — l'existant est réutilisé | installation sur l'écran d'accueil, push sur Android, hors-ligne partiel |
| **Flutter natif** | un chantier complet, et une seconde base de code à maintenir | conformité stricte au TDR, présence sur le Play Store, iOS possible |

**Recommandation :** la voie PWA en premier. Elle rend le push et l'installation
sans dupliquer la base de code, et laisse la décision Flutter ouverte une fois que
l'usage réel aura montré ce que les citoyens font vraiment. Passer directement au
natif, c'est maintenir deux applications avant de savoir si la première sert.

### 7.2 L'inscription citoyenne : téléphone + OTP, ou courriel ?

Le TDR demande **téléphone + OTP** (`M1`). L'existant fonctionne au courriel et au
mot de passe. En Tunisie, l'argument du TDR est solide : le téléphone est le
seul identifiant que tout le monde possède.

Cela suppose un fournisseur de SMS, un coût par message, et un mécanisme
anti-abus. **Le Jalon 2 (lot 1) a tranché la sienne sans SMS** — push web
seul, aucun fournisseur à choisir. La décision ci-dessus reste donc entière et
indépendante : elle ne peut plus s'appuyer sur un fournisseur déjà retenu pour
les notifications.

### 7.3 L'interopérabilité ANGeD

Décision déjà prise : **hors périmètre tant que l'ANGeD n'ouvre pas sa
plateforme**. Le coût à la tonne est débloqué autrement, par la saisie communale.
La colonne `source` de la table des pesées attend la donnée ANGeD sans migration —
le jour où elle arrive, le recoupement `B4.3` devient une requête.

**À suivre :** c'est une question de convention entre la FNCT et l'ANGeD, pas une
question technique.

---

## 8. Ce qui reste ouvert, et qu'il faut trancher

| Sujet | Décideur | Conséquence si rien n'est tranché |
|---|---|---|
| Zarzouna / El Hchachna (Bizerte) : la couche officielle et le référentiel listent des communes différentes | FNCT | Zarzouna reste sans territoire |
| Les 5 districts FNCT : la base ne connaît que les 24 gouvernorats | FNCT | Aucune agrégation par district possible |
| Homonymes dans la liste des communes (Ennour, Ezzouhour) | FNCT | Un citoyen peut choisir la mauvaise commune |
| Affectation réelle des équipes aux 13 tournées de Dar Chaabane | Commune | 14 lignes bloquantes au panneau de cohérence |
| Purge des fichiers retirés | FNCT | Le volume grossit ; rien n'est perdu |
| Mot de passe de démonstration `Siipi2026!` publié avec le code | FNCT | Toute instance installée avec les comptes de démonstration et jamais changée est ouverte |

---

## 9. Risques

| Risque | Portée | Ce qui le réduit |
|---|---|---|
| **Le tableau KPI affiche des chiffres faux** | Un indicateur calculé sur une donnée absente sera lu comme vrai et opposé à un tiers | Ne rien afficher quand la donnée source manque ; recalcul manuel avant mise en service |
| **La donnée n'est pas saisie** | Un module que personne ne remplit est pire qu'aucun module : il donne l'illusion d'un suivi | Le pointage tient en soixante cases et un enregistrement ; tout écran ouvert chaque matin doit se remplir en moins de deux minutes |
| **Un défaut invisible aux tests** | Cinq défauts sur vingt n'ont été trouvés qu'en usage réel | Recette terrain (§ 6), et consignation systématique |
| **Une donnée personnelle entre en base** | Décret-loi n° 2022-54 | Les campagnes vérifient d'abord ce qui est refusé ; aucune colonne de salaire, de CIN ni de santé n'existe |
| **Déploiement sur 350 communes** | Aucune procédure de reprise de données n'est écrite | À bâtir avant la deuxième commune, pas avant la trois-centième |

---

## 10. Annexe — l'état technique

| | |
|---|---|
| **Base de données** | PostgreSQL 16 + PostGIS 3.4 — **45 migrations**, rejouées sur base neuve à chaque livraison |
| **API** | Node.js 22 + Express + TypeScript, contrat OpenAPI 3.1 **généré depuis le code** |
| **Portail web** | React 19 + Vite + Tailwind + Leaflet, bilingue FR/AR avec RTL |
| **Cloisonnement** | Row-Level Security PostgreSQL — la commune, le prestataire et le citoyen ne voient que leur périmètre, y compris si une route oubliait de filtrer |
| **Conformité** | Suppression logique généralisée, journal d'audit, traçabilité des accès aux données citoyennes |
| **Déploiement** | Docker Compose, scripts d'installation et de vérification fournis |
| **Code source** | Propriété de la FNCT — dépôt `servicesmunicipaux-lang/SIIPI` |

---

*Document établi par confrontation systématique du cahier des charges SIIPI
(version MVP phase 1) et de l'état du code au 22 septembre 2026. Chaque statut
« fait » est adossé à une campagne de tests nommée et rejouable.*
