# SIIPI — Feuille de route
## Du cahier des charges à la plateforme : où nous en sommes, et dans quel ordre continuer

**Fédération Nationale des Communes Tunisiennes**
Version au 30 septembre 2026 (nuit) · établie à partir du cahier des charges SIIPI (MVP, phase 1)
Mise à jour du 30 septembre 2026 (nuit) : **changement de stratégie validé avec la FNCT** — la recette terrain n'étant pas possible pour l'instant, les jalons ne s'arrêtent pas : le jalon 12 avance en parallèle de R1 (lots 17.1, 17.3, 17.5) et la plateforme est éprouvée sur un **jumeau numérique** de trois mois d'activité (§ 6bis) en attendant les communes. Décision d'inscription citoyenne tranchée (§ 7.2). Version 0.15.1, documentaire.
Mise à jour du 30 septembre 2026 (soir) : **cap fixé de v0.16 à v0.19** — ordre des jalons arrêté (§ 0) ; communes de recette **Dar Chaâbane** puis **M'hamdia** ; référentiel de gestion du dépôt municipal, projet de décret sur le tri à la source (articles 13.1 et 14) et `SPEC_v0.16.md` versés à `docs/specs_metier/` ; protocole de validation réel inscrit dans `CLAUDE.md` ; barre latérale étendue à l'observatoire national. Le développement reprend dans Claude Code.
Mise à jour du 22 septembre 2026 : clôture du **Jalon 1** (§ 4) — huit lignes passées à Fait.
Mise à jour du 22 septembre 2026 (suite) : **Jalon 2, lot 1** (B5.1.2, B5.2.3, B5.4.3) — le push web est réellement émis. Le mécanisme d'abonnement du citoyen (`M6`) a dû être construit avec, pour que l'envoi ait un destinataire à joindre — voir le rapport de lot avant de considérer `M6` clos.
Mise à jour du 23 septembre 2026 : **`M6` clos** — historique « Mes notifications », préférences par canal et par type, et relance manuelle (« Renvoyer ») d'un envoi en échec.
Mise à jour du 28 septembre 2026 : **Jalon 3** — Contacts (`C1.1`–`C1.3`), versionnement des rapports (`C3.6`) et lecteur PDF intégré (`C3.5`) ; cinq lignes passées à Fait. `C1.4` (import/export CSV) rejoint le service d'export transverse du Jalon 4.
Mise à jour du 28 septembre 2026 (suite) : **Jalon 4, lot 1** — le service d'export unique (CSV + Excel) branché sur les cinq écrans concernés ; `B3.6` passé à Fait, `A3.4`, `B2.4` et `C1.4` à Partiel (reste le PDF et les imports, lot 2).
Mise à jour du 28 septembre 2026 (fin) : **Jalon 4 clos** — imports CSV (contacts, parc, points) et PDF par l'impression du navigateur ; `A3.4`, `B2.4`, `B3.1`, `B5.2.4` et `C1.4` passés à Fait.
Mise à jour du 28 septembre 2026 (soir) : **Jalon 5 clos** — la maintenance des engins : carnet d'entretien (`B2.2`) et alertes d'entretien au kilomètre et à la date (`B2.3`).
Mise à jour du 28 septembre 2026 (nuit) : **Jalon 6 clos** — le tableau des points avec champs libres (`B3.4`), les étiquettes et les actions planifiées sur une sélection (`B3.5`).
Mise à jour du 28 septembre 2026 (fin de nuit) : **Jalon 7 clos** — les paramètres (`B6.2`, `B6.3`, `B6.4`, `B6.6`) et le découpage validé par la FNCT et versionné (`C2.5`, `C2.6`).
Mise à jour du 29 septembre 2026 (nuit) : **v0.14.0** — les fichiers géographiques de chaque circuit : téléchargement GPX / KML / GeoJSON, dépôt dès la création, une couleur par circuit sur la carte.
Mise à jour du 29 septembre 2026 (soir) : **v0.13.0 en service** — données réelles de Djerba chargées, démonstration fictive retirée ; **Jalon 9 (application mobile) mis en attente**, priorités suivantes : Jalon 10 (refonte graphique et expérience du portail web / PWA), puis Jalon 11 (GMAO étendue et dépôts municipaux).
Mise à jour du 29 septembre 2026 (suite) : **données réelles de Djerba** — 36 circuits observés au GPS, 2 855 points de collecte et 12 engins pour Houmt Souk, Midoun et Ajim, depuis la mission de la FNCT.
Mise à jour du 29 septembre 2026 : **lot d'optimisation des sources KPI** — lieux sur carte, nettoyages en mètres linéaires, fin de poste, carburant, EPI, incidents, conventions ; la plateforme mesure ce que la fiche faisait déclarer, avec un badge de source par indicateur.
Mise à jour du 28 septembre 2026 (clôture) : **Jalon 8 clos** — le tableau de bord KPI 5 axes, la grille du Concours national de propreté (19 indicateurs, reventilation ministérielle), la préparation au décret DMA, les agrégations et les alertes nationales (`Axe 1` à `Axe 5`, `A2.3`, `A3.1`, `A3.3`, `B7.4`).

---

## 0. Reprise du développement — par où recommencer

Cowork sert à **discuter, planifier et documenter**. Le code s'écrit dans Claude
Code (« SIIPI git »), qui lit `CLAUDE.md`, ce document et
`docs/specs_metier/SPEC_v0.16.md`. Rien n'a été codé ici, hors la barre latérale
de l'observatoire national (contrôlée au typage, non commitée).

### L'ordre retenu

| # | Jalon | Contenu | Pourquoi à cette place | Prêt ? |
|---|---|---|---|---|
| **S0** | Assainissement (v0.15.2, v0.15.3) | Commit du Lot 0 ; retrait des anciennes références légales dans le code, les commentaires et l'OpenAPI ; import des KMZ issus d'ArcGIS ; **un seul guide de démarrage** (`DEMARRER.bat`) au lieu de trois documents qui se contredisent, `.env.example` aligné sur le mot de passe de la base du fichier Compose, et un `/health` qui dit « base non initialisée » au lieu d'une erreur 500 à la connexion ; **intégration de la carte du conseiller SIG** (gestion des couches, fonds OpenStreetMap et Esri, sans tuiles Google chargées hors API), prévue lundi 5 octobre | Le dépôt doit être propre avant qu'un lot s'y ajoute ; le KMZ est le préalable des données de M'hamdia | ✅ **Fait**, sauf la carte du conseiller SIG — v0.15.2 : Lot 0, références légales, KMZ ; v0.15.3 : guide de démarrage unique, `.env.example`, `/health`. La carte, attendue lundi 5 octobre, ne bloque pas S1 (décision du 1er octobre) |
| **S1** | Jumeau numérique (v0.15.4) | Jeu de données simulé de trois mois (structure de Dar Chaâbane), campagne `test:simulation-3mois`, écran « Mode démo » (§ 6bis) | Donne à tous les lots suivants un banc d'essai chiffré sans attendre une commune ; chaque lot y ajoute ses propres données | ✅ **Fait** (v0.15.4) — voir le CHANGELOG |
| **11** | v0.16 — Conformité et pièces opposables | 16.1 barbechas · 16.2 documents à numérotation scellée · 16.3 carnet de bord et carburant · 16.4 dossier de déclassement | 16.1 d'abord : on **retire** des colonnes avant que de vraies données n'y entrent. 16.2 avant 16.3 : le bon de carburant emprunte la séquence scellée | **16.1 fait** (v0.15.5) ; **16.2 : mécanique faite** (v0.15.6), mise en page en attente des gabarits ; **16.3 fait** (v0.15.7) ; **16.4 fait** (v0.15.8) |
| **R1** | Recette **Dar Chaâbane** — *différée* | Un mois d'usage réel du lot 11 (parc, personnel, 13 circuits déjà chargés). En attendant, le jumeau numérique (§ 6bis) | Reste l'objectif de **clôture de la version** (§ 6), mais ne bloque plus l'ouverture des jalons suivants | Dès que la commune est disponible |
| **12** | v0.17 — Paramétrage, estimation, coût complet | 17.1 paramètres étendus · 17.3 paramètres nationaux historisés · 17.2 moteur volumétrique · 17.5 rejeu du coût de M'hamdia · 17.4 connecteur GPS | 17.3 avant 17.2 : le moteur lit la densité et la redevance ANGeD. 17.5 ferme la boucle avec une commune qui a déjà un coût calculé par un bureau d'études | **En parallèle de R1.** **17.3 fait** (v0.15.9) ; **17.1 fait** (v0.15.10) ; 17.5 : débloqué. 17.2 et 17.4 : **suspendus** à leurs préalables externes |
| **R2** | Recette **M'hamdia** (puis Djerba pour le GPS) — *différée* | Circuits importés, séries de tonnage, coût rejoué | Son PCGD 2026 est le seul jeu où circuits, tonnage et coût existent ensemble | Dès que la commune est disponible ; le rejeu 17.5 se prépare sur le fichier reçu |
| **13** | v0.18 — Secteur informel | Registre communal des acteurs, carte de pré-collecteur, suivi de la période transitoire | Dépend de 16.1 (données nominatives) et du scellement de 16.2. Le **texte des articles 13.1 et 14 est reçu — en projet, non en vigueur** : le lot est livré derrière un paramètre national, inactif par défaut | Après 16.1 et 16.2. Restent à lever : articles 4 et 13, date de départ de la période transitoire |
| **14** | v0.19 — Mutualisation | Points limitrophes, prêts d'engins | Première exception au cloisonnement : pas avant que 11 à 13 aient tourné en production | Spécifiable dès maintenant ; ouverture après 11 à 13 en production |
| **15** | Ensuite | Anomalies de tournée, projection du décret DMA, observatoire comparatif (axe 10), suivi de la sous-traitance (axe 12), régulation saisonnière (axe 3) | Chacun suppose des données **mesurées** de plusieurs communes | À instruire |

**Note du 30 septembre 2026 (nuit).** La recette terrain R1 reste l'objectif de
clôture de la version : une version est *développée* et éprouvée sur le jumeau
numérique, *livrée* à la clôture de R1. Mais elle **ne bloque plus l'ouverture des
jalons suivants**. Les jalons 13, 14 et 15 gardent leur ordre et ne dépendent plus
de R1 pour être spécifiés.

Le Jalon 9 (application mobile) reste en attente de son marquage blanc ; les
axes « zone dégradée » et « application terrain synchronisée » du mémo
prospectif (axes 6 et 7) le suivent.

### Ce qui bloque, et ce qui ne bloque pas

- **Le jalon 11 n'est bloqué par rien.** La commune de recette est tranchée.
  Trois points restent ouverts et **ont une valeur par défaut** : sans réponse,
  Claude Code applique la valeur par défaut et le consigne.
  - `earnings_this_month_tnd` : **supprimé** (donnée financière individuelle ;
    réversible tant qu'aucune donnée réelle n'est saisie). Un agrégé par
    commune pourra venir des pesées.
  - Prix et date d'acquisition des engins : colonnes **facultatives** ; le
    dossier de déclassement dit « non renseigné » au lieu de calculer à vide.
    Les valeurs se recueillent pendant la recette.
  - Gabarits des documents : livrés, **à faire valider** par le chef de dépôt de
    Dar Chaâbane pendant R1.
- **Ce qui bloque vraiment**, et ne dépend pas du code : la documentation des
  API des opérateurs GPS (17.4) ; le barème ANGeD et sa date d'effet (le calcul
  fonctionne avec une valeur paramétrée, nommée « provisoire ») ; les articles 4
  et 13 du projet de décret et la date de départ de sa période transitoire
  (jalon 13) ; la confirmation juridique et l'hébergement accrédité pour toute
  identité nominative (la garde en base `hebergement_pii_accredite` reste à
  *faux* tant qu'ils manquent).

- **17.2 et 17.4 restent suspendus.** 17.4 attend la documentation des API GPS ;
  17.2 attend la clôture de 17.3 et la validation, par la FNCT, de la matrice de
  densités qu'il consomme.

### Consigne de reprise pour Claude Code

> Lis `CLAUDE.md` (§ 7 : critère d'acceptation), `FEUILLE_DE_ROUTE.md` § 0 et
> `docs/specs_metier/SPEC_v0.16.md`. Commence par l'étape **S0**, puis le
> jalon 11 dans l'ordre 16.1 → 16.2 → 16.3 → 16.4. Un lot = une migration, une
> campagne `backend/tests/<lot>.sh` enregistrée dans `package.json` et
> `MIGRER.bat`, qui commence par ce que la base **refuse**. Avant de déclarer un
> lot terminé : `npm run verifier:contrat` et toutes les campagnes passent, et les
> deux commandes de recomptage donnent le même nombre. Aucun nombre de tests
> ne s'écrit sans avoir été lu dans une sortie. Bump de version à la clôture du
> lot, dans le même commit que l'entrée du CHANGELOG. Après S0, fais S1 (jumeau
> numérique, § 6bis) puis le jalon 11. Le jalon 12 peut avancer en parallèle de
> R1 pour les lots qui n'en dépendent pas (17.1, 17.3, 17.5) ; 17.2 et 17.4 restent
> suspendus à leurs préalables externes.

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

Trois communes ont fourni de la matière — **Dar Chaabane El Fehri** (registre
des circuits, parc, effectif, pesées), **Djerba Houmt Souk** (prestataires,
réclamations, 36 circuits observés au GPS) et **M'hamdia** (PCGD 2026 et couches
de circuits reçus le 30 septembre). Aucune commune n'utilise encore la plateforme dans son travail
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
| `B3.1` | Import de points (CSV / GPX / KML) | ✅ Fait | KML, KMZ, GPX, GeoJSON et CSV reconnus par leur contenu (services/kml.ts), dès la création du circuit ; téléchargement du circuit en GPX / KML / GeoJSON · campagnes module2, imports, releves-terrain |
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
  loi organique 2004-63). Une fiche doit porter au moins un téléphone ou un
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

### Lot — Les données réelles de Djerba ✅ *(fait le 29 septembre 2026)*

**Pourquoi maintenant.** La plateforme n'avait qu'une commune réelle, Dar
Chaabane. La mission de suivi GPS de la FNCT à Djerba (février-juin 2026) en
apporte trois d'un coup — Houmt Souk, Midoun, Ajim — et un vocabulaire de
terrain différent, qui éprouve le lecteur de relevés.

| Quoi | Ce qui en sort | Preuve |
|---|---|---|
| L'index des sorties (`Mission_FNCT.xlsx`) : commune, arrondissement, circuit, engin, pesées | 36 circuits, 12 engins, la campagne d'observation de chaque circuit | `seed/djerba.ts` |
| Les tracés GPX (UTC véritable) | le tracé observé de chaque circuit ; les trajets parc → collecte, collecte, collecte → pont-bascule, retour, en minutes et en kilomètres | `circuits.trace`, `etude_*` |
| Les 3 497 arrêts, tous circuits confondus, dans un seul fichier | 2 855 points de collecte, rattachés à leur sortie par l'heure, contenants comptés en champs libres, état en étiquettes | `points_collecte`, `champs_points`, `etiquettes_points` |
| Le vocabulaire de Djerba (« 3 conteneur metallique », « demi-fût », « hand picked ») | reconnu par le lecteur de relevés, aussi à l'import depuis l'écran | `services/kml.ts`, campagne `releves-terrain` |

**Principes tenus.**
- **Rien d'inventé.** Pas de lieu (marché, cimetière, abattoir) : aucun n'est
  situé dans le relevé. Pas de temps de collecte sans les repères de début et
  de fin posés par l'agent. Une valeur marquée « Fill Later » ou « Missing »
  reste vide.
- **Pas de chiffre faux présenté comme mesuré.** Les pesées de la mission sont
  un échantillon : entrées en table, elles afficheraient Midoun à 0,03 kg par
  habitant et par jour. Elles restent dans la fiche de chaque circuit, datées,
  et ne se chargent en table que sur demande (`DJERBA_PESEES=1`).
- **Aucun nom de personne.** Les chauffeurs ne sont pas repris, ni sous leur
  nom ni sous un nom fictif (qui fausserait l'effectif) ; les noms d'arrêts où
  l'agent avait écrit le sien, ou qui désignent une habitation privée, sont
  retirés. Le dossier brut n'entre pas dans le dépôt, qui est public.
- **Cloisonnement.** Chaque commune est écrite dans une transaction ouverte au
  nom de son directeur, sous RLS.

**Correction livrée avec le lot** : la carte d'un circuit s'ouvrait au zoom
maximal sur un champ vide à côté du circuit (cadrage fait avant que la carte
connaisse sa taille) ; elle se cadre désormais sur le tracé et les arrêts.

**Tranché par la FNCT (29 septembre 2026).**
- Les données de démonstration fictives de ces trois communes ont été
  **retirées** de la base de production (suppression logique, tracée au
  journal) : 2 circuits de test et leur contrôle, 3 engins aux
  immatriculations inventées, 3 conteneurs fictifs, 3 secteurs de
  démonstration et une réclamation fictive — pour ne pas fausser l'axe 1 ni le
  Concours national. Elles restent dans le jeu d'essai des campagnes de tests,
  qui en ont besoin.
- Les jours de passage des circuits ne figurent pas au relevé : ils restent
  vides, et seront renseignés par les administrateurs de chaque commune depuis
  l'espace communal.
- Les engins de Houmt Souk suivis en février n'ont pas d'immatriculation au
  relevé : ils sont décrits dans la fiche du circuit, pas créés au parc.

**Test de validation.** Campagne `releves-terrain` (17/17, nouvelle) : les
contenants comptés, le ramassage à la main, la priorité des types (un point
noir équipé d'un conteneur reste un point noir) et le vocabulaire de Dar
Chaabane toujours lu. Import vérifié sur la pile d'essai : 3 497 arrêts sur
3 497 rattachés, relancé trois fois sans doublon ; aucun nom de personne en
base ; les trajets retour mesurés concordent d'un circuit à l'autre (13,1 km
depuis le parc de Midoun, 8,7 km depuis celui de Sedwikech). Vérifié dans le
navigateur : la liste des 23 circuits de Midoun, la fiche et la carte de
Mahboubine-Abbatoir, le tableau des points avec ses champs et étiquettes.

### Lot — Les fichiers géographiques de chaque circuit ✅ *(fait le 29 septembre 2026)*

**Pourquoi.** À la mise en service des données de Djerba, trois manques sont
apparus à l'usage : la carte de la commune affichait les 23 tracés de Midoun
d'une seule couleur, sans qu'on puisse en suivre un ; le dépôt des fichiers
d'un circuit, caché sous l'onglet « Points de collecte », était introuvable
— y compris à la création ; et un circuit ne pouvait pas sortir de la
plateforme sous forme de fichier.

| Quoi | Preuve |
|---|---|
| Une couleur par circuit sur la carte de la commune ; le filtre « circuit » isole son tracé et ses arrêts | `CarteCommunale.tsx` |
| Onglet « Données géographiques » : dépôt (itinéraire, arrêts) et téléchargement GPX / KML / GeoJSON | `GET /circuits/{id}/fichier`, `services/fichierCircuit.ts` |
| Fichiers joints dès la création d'un circuit | `Circuits.tsx` |
| Aller-retour sans perte : un fichier exporté se réimporte à l'identique (types, ordre, heure, tracé) | `services/kml.ts`, campagne `releves-terrain` |

**Test de validation.** Campagne `releves-terrain` portée à 37/37 : les trois
formats se téléchargent, en pièce jointe nommée d'après le code du circuit ;
réimportés, ils redonnent les mêmes 15 arrêts dans le même ordre avec les
mêmes types, et le même tracé ; l'import « auto » d'un KML d'arrêts ne
remplace pas l'itinéraire ; une autre commune ne télécharge pas le circuit
(404). Vérifié dans le navigateur (Midoun) : les tracés colorés et le filtre
sur Mahboubine-Abbatoir, l'onglet « Données géographiques », la création
d'un circuit avec ses fichiers (tracé et 92 arrêts posés) puis avec un
fichier illisible (circuit créé, avertissement en tête de fiche).

### Jalon 9 — L'application mobile citoyenne ⏸ *(en attente — décision FNCT du 29 septembre 2026)*

Mis en attente. Une application mobile distribuée aux 350 communes suppose
d'abord un **système de personnalisation multi-communes (marquage blanc)** :
chaque commune doit pouvoir y paraître sous son nom, son logo et son identité
visuelle, sans une application par commune. Ce socle sera traité plus tard ;
d'ici là, l'espace citoyen web reste le canal (voir § 7.1).

### Jalon 10 — Navigation par pôles métier et unification cartographique *(10.1 et 10.2 faits ; 10.3 et 10.4 repris au Jalon 12)*

**Le problème, tel qu'il se constate.** Dix-sept onglets sur une barre
horizontale. Sur un téléphone, treize d'entre eux vivent hors de l'écran,
derrière un défilement que rien n'annonce : un directeur qui cherche
« Personnel » **ne peut pas savoir que l'onglet existe**. Et le défilement
horizontal au pouce entre en concurrence avec le défilement vertical de la
page — on part de travers une fois sur deux.

Ce n'est pas un défaut d'esthétique. C'est une charge de mémoire qui fait
renoncer, et un contrôle auquel on renonce n'est pas fait.

#### 10.1 — Les cinq pôles métier

Le regroupement ne suit pas la parenté technique mais **le moment de la journée
et l'interlocuteur** :

| Pôle | Ce qu'il réunit | Le moment |
|---|---|---|
| **1. Cockpit & synthèse** | Constat du matin, alertes « à vérifier », raccourcis d'urgence | En arrivant |
| **2. Terrain & opérations** | Carte unifiée, circuits, arrêts, pesées, preuves | Pendant la tournée |
| **3. Citoyens & cadre de vie** | Réclamations, suggestions, communication, découpage | Quand ça vient du dehors |
| **4. Flotte, GMAO & dépôt** | Parc, registres (carburant, EPI, sécurité), personnel | Au dépôt |
| **5. Pilotage & auto-évaluation** | Indicateurs 5 axes, auto-évaluation, rapports et études | En fin de mois |

**Un sixième groupe, « Administration »** (contacts, comptes), est rendu à part
en bas. Ce n'est pas un pôle métier : forcer « Comptes » dans un pôle ferait
chercher les accès là où personne ne les cherche.

**Deux affectations méritent d'être justifiées.** Les **pesées** vont au
terrain, non au pilotage : un tonnage se saisit le soir même, rattaché à la
tournée qui l'a produit ; au pilotage, il ne serait relu qu'en fin de mois. Le
**personnel** va au dépôt : c'est le même chef de parc qui répond des agents et
des engins, au même endroit.

**État : ✅ fait.** `web/src/composants/BarreLaterale.tsx` — barre posée et
rétractable sur poste fixe, tiroir par-dessus au téléphone, fermeture par
Échap, par le voile et par le choix d'un écran, focus rendu au bouton, tiroir
replié sorti de l'ordre de tabulation (`inert`), état déplié/replié conservé
d'une session à l'autre. Le tiroir vient de la **droite en arabe** : non par
symétrie décorative, mais parce que le pouce d'un lecteur d'arabe part de ce
côté-là.

**Extension du 30 septembre 2026.** La même barre porte désormais l'**observatoire
national** (synthèse, communes, performance et déploiement) : le super
administrateur navigue par pôles comme un directeur de commune. Le composant
accepte des intitulés de pôle propres à l'observatoire, sans second mécanisme.

**Tests de validation.**
- *Automatique* : `npm run lint` côté web avec la version de TypeScript du
  projet ; parcours complet au clavier (Tab, Échap) sans piège de focus.
- *Recette* : sur un téléphone réel, atteindre n'importe lequel des dix-sept
  écrans **en deux gestes au plus**, en français puis en arabe. Critère de
  sortie : aucun écran atteint par tâtonnement.

#### 10.2 — Une seule carte pour le terrain

**Ce qui était éclaté.** Les circuits, leurs arrêts et leurs contrôles vivaient
dans trois onglets. Vérifier « la tournée n° 3 est-elle passée, et où ? »
demandait trois écrans et deux allers-retours de mémoire.

**Ce qui est fait.** Choisir un circuit sur la carte ouvre un panneau qui
répond aux trois questions **sans quitter la carte** : qui l'exécute et avec
quel engin, combien d'arrêts et de quelle nature, et ce que disent les
constats des trente derniers jours.

Le panneau **borde** la carte, il ne la remplace pas : on doit voir le tracé
pendant qu'on lit ses constats, sinon on retombe dans l'aller-retour que cet
écran supprime. La sélection est **celle du filtre existant** — un second
mécanisme aurait fait diverger les deux, et on aurait vu le panneau d'un
circuit pendant que la carte en traçait un autre.

Deux absences sont **dites**, jamais laissées en blanc : « aucun arrêt
enregistré » (le circuit existe au registre, mais personne ne sait où il passe)
et « aucun constat depuis 30 jours » (ce n'est pas *rien à signaler*, c'est un
contrôle qui n'a pas eu lieu).

**État : ✅ fait.** `web/src/composants/communal/PanneauCircuit.tsx`.

**Tests de validation.**
- *Automatique* : campagne `releves-terrain` étendue — choisir un circuit rend
  ses arrêts et ses seuls constats ; un circuit sans arrêt rend la phrase, pas
  un vide.
- *Recette* : un chef de service répond à « la tournée n° 3 est-elle passée
  hier ? » **sans changer d'écran**.

#### 10.3 — Paramètres de la commune, étendus *(repris au Jalon 12, lots 17.1 et 17.2)*

| Réglage | Pourquoi il change les chiffres |
|---|---|
| Population réelle et saisonnière | Une commune côtière triple en été : un ratio kg/hab/jour calculé sur la population permanente est faux cinq mois par an |
| Production spécifique théorique (kg/hab/jour) | Sert de repère à l'écart entre l'attendu et le pesé |
| **Moteur d'estimation volumétrique** | `Tonnage estimé = volume utile (m³) × taux de remplissage (%) × densité (t/m³)` — pour les communes **sans pont-bascule**, c'est-à-dire la grande majorité |

**La règle qui gouverne ce moteur.** Un tonnage estimé n'est **jamais** présenté
comme un tonnage pesé. Il porte sa nature (`source = 'estimation_volumetrique'`),
ses trois paramètres, et la date à laquelle ils ont été réglés. Sans cela, une
estimation devient une mesure au bout de trois semaines, et on la comparera un
jour à un chiffre de l'ANGeD sans savoir qu'on compare une opinion à une pesée.

**Test de validation.** Trois jeux de paramètres donnent trois tonnages
différents pour la même tournée, et l'écran le dit. Un tonnage estimé et un
tonnage pesé ne s'additionnent jamais sans que la distinction reste lisible.

#### 10.4 — Connecteur GPS tiers *(repris au Jalon 12, lot 17.4 — bloqué)*

Interface de configuration pour relier une plateforme GPS existante (Orange,
Ooredoo, boîtiers locaux) aux tables PostGIS de SIIPI : URL, jeton, cadence,
correspondance entre l'identifiant du boîtier et l'immatriculation de l'engin.

**Ce qui doit être tenu.** Le jeton du fournisseur est un secret : il ne
s'affiche jamais en clair après l'enregistrement, et il ne part pas dans les
journaux. Une trace GPS importée porte **sa provenance** : elle ne se confond
pas avec un relevé fait par la commune.

**Test de validation.** Un fournisseur injoignable ne fait pas échouer l'écran :
il affiche la date du dernier relevé reçu. Une trace sans correspondance
d'engin est **signalée**, pas rattachée au hasard.

---

### Jalon 11 — v0.16 : conformité et pièces opposables *(prochain)*

Spécification détaillée : `docs/specs_metier/SPEC_v0.16.md` (lignes rouges,
amendements R1 à R7, tests). Le référentiel officiel de gestion du dépôt
municipal est versé à `docs/specs_metier/01-referentiel-depot-municipal.md`.

**Les cinq lignes rouges, qui bornent tous les lots suivants.** Pas
d'optimisation de tournées dans SIIPI (on importe le tracé optimisé par le SIG) ·
pas de dépôt nominatif public ni de notation disciplinaire individuelle · pas de
GPS individuel sur les balayeurs (véhicules seulement) · pas de réponse
automatique aux citoyens · ni facturation ni recouvrement. **Périmètre GMAO :**
ni stock de pièces, ni achats, ni facturation.

**Ce qui existe déjà** : carnet d'entretien et alertes (Jalon 5), état du parc,
registre des pleins de carburant (lot « sources KPI »).

| Lot | Contenu | Test de validation (commence par ce que la base refuse) |
|---|---|---|
| **16.1** | **Conformité `barbechas`** : suppression de `cin` et `health_insurance_status` ; identifiant pseudonyme communal ; empreinte HMAC-SHA256 du CIN calculée dans l'API, jamais stockée ni journalisée ; table d'identité séparée sous RLS restreinte à l'administrateur de la commune ; gardes `hebergement_pii_accredite` et `recepisse_inpdp` | Insérer une identité sans récépissé, ou hébergement non accrédité : refusé. Lire l'identité en `super_admin_fnct` ou en administrateur d'une autre commune : refusé. `information_schema` ne trouve plus `cin` |
| **16.2** | **Documents légaux à numérotation scellée** : `sequences_documents`, `documents_emis` ; numéro continu par commune, type et exercice, attribué sous verrou, jamais réutilisé ; annulation avec motif ; contenu figé ; détection de trous. Quatre modèles bilingues : ordre de mission, bon de carburant, bon de travail, déclaration de panne | Cent émissions successives et deux éditeurs simultanés : séquence continue, sans doublon. Modifier ou supprimer un document émis : refusé. Un champ vide reste vide |
| **16.3** | **Carnet de bord** (compteurs de sortie et de retour, séance, chauffeur, circuit, n° du bon de pesée ; la distance est *déduite*), **bons de carburant** numérotés, **quota mensuel par engin**, ratio litres au km ou à l'heure, écart au quota dans « À vérifier » | Compteur de retour inférieur au compteur de sortie : refusé. Litres négatifs : refusé. Une surconsommation s'affiche comme un écart, jamais comme une faute |
| **16.4** | **Dossier de déclassement** : cumul des dépenses rapporté au prix d'acquisition avec seuil de 80 % *affiché* ; rapport de rendement ; pièces jointes ; suivi du circuit d'autorisation. Le prix et la date de mise en circulation existaient déjà (`valeur_achat_tnd`, `date_premiere_circulation`, migration 032) : aucune colonne ajoutée. ✅ **Fait** (v0.15.8, migration 059, campagne `declassement`) | Seuil « atteint » ou « non atteint » sans jamais déclasser. Sans prix : « non calculable », pas de calcul à vide |

**Règle commune :** SIIPI constate, il ne décide pas. Aucun score, aucun
classement de chauffeurs.

**Clôture de la version :** le critère d'acceptation passe (`verifier:contrat`
et toutes les campagnes) **et** le lot a tourné un mois complet chez Dar Chaâbane
(R1) **et** les défauts trouvés sont consignés au journal des corrections.
Sinon la version est *développée*, pas *livrée*. R1 étant différée, la version
reste *développée* et éprouvée sur le jumeau numérique (§ 6bis) jusqu'à ce que la
commune soit disponible ; cela ne retient pas l'ouverture du jalon suivant.

### Recette R1 — Dar Chaâbane

**Recette différée.** En attendant, le jumeau numérique (§ 6bis) éprouve la
plateforme. R1 sera organisée dès que la commune sera disponible.

Contenu prévu, inchangé : un mois d'usage réel du jalon 11 par le chef de dépôt —
parc et personnel déjà chargés, treize circuits, gabarits de documents à valider
sur pièce, recueil du prix et de la date d'acquisition des engins. Protocole du § 6.

### Jalon 12 — v0.17 : paramétrage, estimation, coût complet *(en parallèle de R1)*

**Statut du 30 septembre 2026.** Le jalon 12 avance en parallèle de R1 pour les
lots qui n'en dépendent pas : **17.1, 17.3 et 17.5**. Les lots **17.2 et 17.4
restent suspendus à leurs préalables externes** (matrice de densités validée et
17.3 clos pour le premier ; documentation des API pour le second).

| Lot | Contenu | Test de validation |
|---|---|---|
| **17.1** | Paramètres communaux étendus : population permanente et saisonnière, production spécifique théorique (s'ajoute à `parametres_commune`, migration 048). ✅ **Fait** (v0.15.10, migration 061, campagne `parametres-communaux`) | Un ratio kg/hab/jour calculé sur la population saisonnière diffère du ratio permanent, et l'écran le dit |
| **17.3** | **Paramètres nationaux historisés** à date d'effet : redevance ANGeD (valeur de référence des PCGD 6,516 DT/t, nommée « provisoire » tant que le barème officiel manque), intitulés d'en-tête des documents, ministère de tutelle. ✅ **Fait** (v0.15.9, migration 060, campagne `parametres-nationaux`) | La redevance appliquée est celle en vigueur **à la date de la pesée**, pas à celle du calcul |
| **17.2** | **Moteur d'estimation volumétrique** : matrice `densites_reference(type d'engin compactant, flux, min / typique / max, source, date d'effet)` ; `tonnage estimé = volume utile × taux de remplissage × densité` ; provenance `estime` | Un tonnage estimé ne s'additionne jamais à un tonnage pesé. Une benne tasseuse dont la densité n'excède pas celle d'une benne non compactante est signalée |
| **17.5** | **Rejeu du coût complet de M'hamdia** (voir encadré ci-dessous) | Le moteur retrouve les totaux du bureau d'études quand on lui donne les mêmes entrées, et **affiche le dénominateur** de chaque coût à la tonne |
| **17.4** | **Connecteur GPS tiers** : URL, jeton, cadence, correspondance boîtier/engin ; positions **d'engins uniquement** ; provenance de la trace. **Bloqué** tant que la documentation des API n'est pas fournie | Fournisseur injoignable : l'écran affiche la date du dernier relevé. Trace sans engin correspondant : signalée, jamais rattachée au hasard |

**La méthode du coût complet** (pour 17.5 et pour tout ce qui calcule un coût
à la tonne) : Z = (A + B) + (C + D), soit charges directes réelles, dotation aux
amortissements calculée engin par engin, quote-part du parc et quote-part de
l'administration selon des **clés physiques documentées**. Intérêts de la dette
CPSCL inclus ; charges patronales explicites (17 à 23 % selon la base) ; coût
ventilé **par flux** (ménagers, démolition, balayage) quand la commune les gère.
Un tonnage estimé n'y entre jamais.

> **Ce que le PCGD de M'hamdia apporte, et ce qu'il faut vérifier avant de s'en
> servir comme référence.** Le rapport (166 pages, 2026) et deux couches KMZ
> (circuits existants et projetés, 21/08/2026) donnent, pour 2025, un coût direct
> de 1 393 386 DT (73 %), des charges indirectes de 521 444 DT (siège, parc,
> direction) et un total de 1 914 830 DT, soit **155 DT/t** ; personnel 864 655 DT
> (62 %), engins 281 932 DT, transfert et mise en décharge 72 300 DT,
> amortissements 174 499 DT. Les pesées 2023-2025 (Borj Chakir, CT Naassen) donnent
> 15 151,80 t, 13 786,44 t et 22 099,81 t. Le coût des campagnes de propreté est
> isolé (576 202 DT ; 59 DT/t). Quatre points sont à faire préciser au bureau
> d'études **avant** de rejouer son calcul : (1) 1 914 830 DT divisés par
> 22 099,81 t donnent 86,6 DT/t, non 155 ; le dénominateur implicite est d'environ
> 12 350 t, sans que le rapport dise à quoi il correspond (tonnage de la seule
> régie ?) ; (2) les tableaux 20 et 21 portent 524 444 DT de charges indirectes
> alors que le tableau 19 et le total donnent 521 444 (l'addition le confirme), et
> les tableaux 18 et 21 sont titrés « 2017 » pour des données 2025 ; (3) la
> lecture du texte n'a pas trouvé d'intérêts de la dette CPSCL, de charges
> patronales explicites, de détail de l'amortissement par engin ni de clés de
> répartition des charges indirectes ; (4) seule la part « campagnes de propreté »
> est ventilée, pas le balayage ni la démolition. Rien de cela ne disqualifie le
> rapport : cela dit ce que le rejeu peut prouver et ce qu'il devra demander.

**Règles de traitement des données de M'hamdia.** Le PDF sert à **nourrir
l'import et les tests** ; il n'est jamais une source de vérité permanente en
base. Une fois importée, la donnée vit dans la base du portail et l'administrateur
peut la modifier. **Aucun salaire individuel et aucun nom d'agent n'est importé** :
seulement des agrégats par service. Toute donnée personnelle utilisée en test est
remplacée par une valeur fictive de même format et de même longueur.

### Recette R2 — M'hamdia, puis Djerba

**Recette différée**, comme R1 : elle aura lieu dès que la commune sera disponible.
Le rejeu du coût (17.5) se prépare dès maintenant sur le fichier reçu.

M'hamdia : import des deux couches de circuits, séries mensuelles de tonnage,
rejeu du coût (17.5). Djerba : carte et connecteur GPS (17.4), si la
documentation des API est fournie. **Préalable technique (étape S0)** : l'import
actuel de fichiers géographiques ne lit vraisemblablement pas les attributs HTML
que produit ArcGIS dans les descriptions, ni les lignes groupées en
`MultiGeometry` ; les KMZ de M'hamdia en contiennent.

### Jalon 13 — v0.18 : secteur informel *(derrière un paramètre national, inactif par défaut)*

Source : `docs/specs_metier/02-projet-decret-tri-source-art13-14.md`. Le texte est
un **projet non en vigueur**, présenté comme la vision partagée des ministères de
l'Environnement et de l'Intérieur. SIIPI ne le présente jamais comme une
obligation ; les durées qu'il fixe (carte : 1 an, agrément : 2 ans, période
transitoire : 3 ans, étalonnage : 6 mois) sont des **paramètres nationaux à date
d'effet**, non des constantes du code.

| Lot | Contenu | Bloque |
|---|---|---|
| **18.1** | **Registre communal des acteurs informels** (article 13.1) : catégorie *pré-collecteur* ou *intermédiaire*, établie par des faits (local, achat à d'autres pré-collecteurs, véhicule motorisé) avec signalement d'incohérence ; identifiant pseudonyme et table d'identité séparée ; zone ; statut de la démarche de formalisation, daté | 16.1 clos |
| **18.2** | **Carte de pré-collecteur** : demande, trois attestations (déclaration simplifiée, engagement d'hygiène et de sécurité, acceptation de l'accompagnement), décision, numéro scellé, validité d'un an renouvelable, zones d'accès, retrait motivé. **Gratuite : aucun champ de paiement** | 16.2 ; article 13 du projet non fourni |
| **18.3** | **Suivi de la période transitoire** : jalons d'accompagnement par acteur, échéance des agréments d'intermédiaires (délivrés par l'éco-organisme : SIIPI enregistre, n'agrée pas), tableau de conversion (tonnes détournées, redevance évitée, voyages économisés) en provenance déclarée | Date de départ de la période transitoire |
| **18.4** | *Prospectif* : consultation et export vers le registre de traçabilité de l'ANGeD (article 14), profil de lecture seule pour l'auditeur | Publication de la plateforme ANGeD |

**Ce que SIIPI ne fait pas ici.** Il n'agrée pas les intermédiaires (l'éco-organisme
le fait) ; il ne tient pas le registre coté et paraphé de l'article 14 (l'ANGeD le
fournit, avec sa propre application gratuite) ; il ne fabrique pas de signature
électronique qualifiée (il enregistre l'empreinte du document et la référence du
certificat) ; il **ne géolocalise aucun pré-collecteur individuellement** (ligne
rouge 3 : l'article 14 y renvoie à la plateforme des collecteurs).

**Test de validation.** Un acteur qui déclare acheter à d'autres pré-collecteurs
est signalé comme intermédiaire. Une carte ne se numérote qu'une fois. Avec le
paramètre national inactif, aucun écran du secteur informel n'apparaît.

### Jalon 14 — v0.19 : mutualisation intercommunale

Points limitrophes (zones grises) sur carte collaborative ; registre de prêt
d'engins (engin, commune prêteuse, bénéficiaire, période, kilométrage,
imputation du carburant). C'est la **première exception délibérée au
cloisonnement par commune** : consentement explicite à double sens (la prêteuse
ouvre, la bénéficiaire accepte, seules les deux voient), campagne dédiée dans
`intercommunal.sh`, et **pas avant que les jalons 11 à 13 aient tourné en
production**.

### Jalon 15 — Ensuite, à instruire

Retenus au mémo prospectif (douze axes) : l'**observatoire comparatif** (axe 10 :
positionnement dans la strate, seuil de publication, données mesurées seulement,
jamais de classement nominatif), le **suivi de la sous-traitance** (axe 12 :
constat du service fait, jamais calcul de pénalité), la **régulation saisonnière**
(axe 3, qui s'appuie sur 17.1). Les autres axes (nudge, financements climat, zone
dégradée, application terrain, caractérisation par image) attendent le Jalon 9 et
des données mesurées dans plusieurs communes. Les deux lots ci-dessous restent
inscrits :

#### 15.1 — Détection d'anomalies de tournée *(à faire ; suppose 17.4)*

Trois alertes, à partir des traces GPS et du registre des circuits :

| Alerte | Seuil | Ce qu'elle évite |
|---|---|---|
| Arrêt prolongé non prévu | configurable par commune | Un engin immobilisé une heure sans que personne ne le sache avant le soir |
| Déviation d'itinéraire | écart au tracé théorique | Une tournée raccourcie qui laisse un quartier non desservi |
| Secteur non desservi > 48 h | 48 h par défaut | Le dépôt sauvage qui naît d'un secteur oublié |

**La règle.** Une anomalie est une **question posée**, avec sa date et son
contexte — jamais une sanction, et jamais un reproche à un agent nommé. Le
journal des corrections de ce projet montre assez que le premier réflexe devant
un écart est de chercher l'erreur de saisie avant la faute.

**Test de validation.** Une trace fabriquée avec un arrêt de 45 minutes lève
l'alerte ; la même sans l'arrêt ne la lève pas. Un engin en panne déclarée ne
génère **aucune** alerte de déviation : il ne roule pas.

#### 15.2 — Anticipation du décret « tri à la source » (DMA) *(à faire)*

Calculateur d'impact : tonnes valorisables par flux, CO₂ évité, et la
progression vers les objectifs du décret.

**La règle d'or s'applique intégralement.** Tant que le tri à la source n'est
pas en place dans la commune, le calculateur affiche une **projection
explicitement nommée comme telle**, fondée sur des ratios de caractérisation
nationaux — et non un résultat. Une projection présentée comme un résultat
serait opposée un jour à une commune qui n'a jamais trié un gramme.

**Test de validation.** Une commune sans collecte sélective obtient une
projection étiquetée, jamais un taux de valorisation. Les ratios employés sont
affichés avec leur source et leur date.

---

## 5. Ce qui est fait et qui ne figurait pas au cahier des charges

Ces briques ne sont pas au TDR. Elles ont été ajoutées parce que le terrain les a
réclamées, et elles comptent dans ce que la FNCT reçoit.

| Brique | Pourquoi elle existe |
|---|---|
| **Panneau de cohérence** (`app.incoherences_commune`) | Le croisement à la main du registre des circuits et de l'inventaire du parc de Dar Chaabane a fait apparaître en quelques minutes des écarts que personne ne cherchait. Douze contrôles datés, avec ce qu'il y a à faire — jamais une correction automatique |
| **Constat du matin** | L'écran qu'un chef de service ouvre en arrivant : ce qui bloque aujourd'hui, et rien d'autre |
| **Espace prestataire et confrontation contractuelle** | Un tableau des passages déclarés face aux passages attendus, utilisable comme pièce de discussion |
| **Journal d'audit et suppression logique** | Rien ne s'efface de la base ; les accès aux données citoyennes sont tracés (loi organique n° 2004-63) |
| **Retrait des métadonnées EXIF des photos** | Une photo de téléphone porte la position du domicile de celui qui l'a prise. Elle est retirée au dépôt, et rendue à l'écran pour qu'il la propose — jamais conservée à l'insu de la personne |
| **Rattachement multi-communes** | Un agent, un marché, plusieurs communes : la mutualisation est l'objet même de SIIPI, et sept politiques de cloisonnement la contredisaient |

---

## 6bis. Le jumeau numérique — préparer la recette sans la commune

> Aucune commune n'étant disponible pour la recette terrain, la plateforme est
> éprouvée sur un **jumeau numérique** : un jeu de données réaliste de 3 mois
> d'activité sur Dar Chaâbane, généré à partir des données réelles déjà chargées.
>
> **Ce que le jumeau contient** : pointages quotidiens, pesées journalières,
> réclamations citoyennes, fins de poste, pleins de carburant, incidents,
> nettoyages, sondages.
>
> **Ce qu'il permet de vérifier** : chaque KPI est recalculé à la main et
> comparé à la valeur affichée ; chaque alerte est déclenchée puis éteinte ;
> chaque agrégation est contrôlée.
>
> **Campagne dédiée** : `test:simulation-3mois`, qui charge le jeu de données sur
> une base neuve et vérifie les valeurs attendues.
>
> **Mode démo** : un écran « Mode démo » dans le portail municipal permet de
> charger le jeu de données en un clic, pour préparer la démonstration aux
> communes.
>
> **Ce que le jumeau ne remplace pas** : la recette terrain. Cinq défauts sur
> vingt n'ont été trouvés qu'en usage réel. Le jumeau prépare la recette ; il ne la
> remplace pas.

**Les garde-fous que le jumeau doit tenir.** Un jeu simulé qui se confond avec le
réel est pire que pas de jeu : la démonstration fictive de Djerba avait été retirée
à la v0.13.0 pour cette raison. Ces règles sont donc **testées**, non supposées.

1. **Fictif de bout en bout.** La *structure* est reprise de Dar Chaâbane (treize
   circuits, engins, effectif par fonction) ; **aucun nom d'agent, CIN, téléphone
   ni salaire réel** n'en sort. Toute donnée personnelle est remplacée par une
   valeur fictive de même format et de même longueur.
2. **Provenance écrite.** Chaque ligne simulée porte `provenance = 'simule'` et ne
   s'additionne jamais à une pesée réelle (règle d'or 1.1).
3. **Périmètre étanche.** Le jeu se charge dans une **commune de démonstration**
   fictive, marquée `est_demo`, exclue de l'observatoire national, du concours et de
   toute agrégation nationale. Le chargement est **refusé sur une commune réelle**.
4. **Déterministe et contrôlé de l'extérieur.** Graine fixe : mêmes données à
   chaque chargement. Les valeurs attendues sont calculées par un script
   **indépendant du code de l'application** — sinon on vérifie l'application par
   elle-même.
5. **Une bannière permanente** « Données de démonstration » sur chaque écran du
   mode démo.
6. **Il grandit avec les jalons.** Chaque lot y ajoute ses données (bons de
   carburant, carnets de bord, documents scellés…) et ses valeurs attendues.

**Ce que le jumeau prouve, et ce qu'il ne prouve pas.** Il prouve que la mécanique
calcule juste sur des données propres. Il ne dit rien de la qualité des saisies
réelles, ni de ce qu'un chef de dépôt comprend d'un écran : c'est le rôle de la
recette.

**Test de validation (lot S1).** Le chargement rejoué deux fois donne les mêmes
valeurs. Le chargement sur une commune réelle est refusé. L'observatoire national
ne contient pas la commune de démonstration. Chaque alerte du jeu se déclenche puis
s'éteint quand on corrige la donnée.

**Compléments non codés**, à produire dès que le mode démo existe : un guide
d'accueil de deux pages et une vidéo de cinq minutes.

**Livré en v0.15.4 (lot S1).**
- *Le jeu* : `backend/seed/data/jumeau_3mois.json`, du 1er juin au 31 août 2026,
  produit par `scripts/jumeau/generer.py` (graine fixe) et versionné — 29 engins,
  61 agents, 13 circuits, présences quotidiennes, pesées, fins de poste, pleins,
  150 réclamations, nettoyages, contrôles, incidents, EPI, un sondage et ses
  réponses. Quatre anomalies **volontaires** (surcharge, réclamation en souffrance,
  nettoyage oublié, engin immobilisé sans motif) ; ailleurs le jeu est propre.
- *Les garde-fous en base* (migration 055) : `communes.est_demo`, `provenance` sur
  dix-huit tables, refus d'une ligne simulée dans une commune réelle, exclusion du
  statut de déploiement (donc du tableau par gouvernorat) et de la carte publique ;
  les routes nationales (KPI, annuaire, statistiques) l'écartent aussi.
- *Le retrait* : `app.retirer_jeu_demo()`, seule exception à la suppression
  logique (`CLAUDE.md` § 1.4), réservée à la FNCT, refusée sur une commune réelle.
- *L'écran* : observatoire → Outils de la FNCT → **Mode démo** (charger, ouvrir le
  portail, recharger à l'identique, retirer) ; bannière permanente sur chaque écran
  du portail de démonstration, en FR et en AR.
- *La campagne* `simulation-3mois` : 22 indicateurs comparés à
  `backend/tests/jumeau_attendus.py`, qui ne lit que le fichier du jeu.
- *Constat* : le jeu s'arrête au 31 août ; passé trente jours, chaque circuit est
  signalé « aucune pesée depuis trente jours » — c'est exact. Les circuits de
  balayage reçoivent ce même signal alors qu'ils ne se pèsent pas : défaut de la
  règle de cohérence, à revoir dans un lot à part.

---

## 6. Comment on valide : deux niveaux, et ils ne se remplacent pas

### Niveau 1 — Les campagnes automatisées *(en place)*

**Quarante campagnes rejouables** au 07/10/2026, lancées par `backend/tests/executer.sh
<campagne>` et enchaînées par `npm test` (`assainissement`, `audit`, `barbechas`, `champs-points`, `circuits`,
`citoyen`, `cloisonnement`, `comptes`, `contacts`, `declassement`, `decoupage`, `documents`, `enlevements`, `exploitation`,
`exports`, `fichiers`, `imports`, `intercommunal`, `kpi-5-axes`, `kpi-sources`,
`maintenance`, `module2` à `module6`, `notifications`, `notifications-citoyen`,
`observatoire`, `parametres`, `parametres-communaux`, `parametres-nationaux`, `periode`, `prestataires`, `rapports`,
`releves-terrain`, `simulation-3mois`, `suggestions`, `suppression`,
`versions-decoupage`). `simulation-3mois` est celle du jumeau numérique (lot S1, § 6bis) ;
`barbechas`, celle de la conformité du registre des pré-collecteurs (lot 16.1) ; `documents`,
celle des documents à numérotation scellée (lot 16.2) ; `exploitation`, celle du carnet de bord,
des bons de carburant et du ratio L/100 km (lot 16.3) ; `declassement`, celle du dossier de
déclassement, du seuil de 80 % et du circuit d'autorisation (lot 16.4) ; `parametres-nationaux`,
celle des paramètres nationaux datés et de la redevance au taux de la date de la pesée (lot 17.3) ;
`parametres-communaux`, celle de la population de saison et du repère de production (lot 17.1).

**Le critère d'acceptation** est celui de `CLAUDE.md` § 7 : `npm run
verifier:contrat` et toutes ces campagnes passent, et les deux commandes de
recomptage donnent le même nombre. Aucun nombre de tests ne s'écrit sans avoir
été lu dans la sortie d'une commande.

**Leur principe :** elles commencent par ce que la plateforme **refuse**. Le
module 4 vérifie d'abord qu'aucune colonne de salaire, de CIN ou de santé
n'existe ; le stockage de fichiers, qu'un exécutable renommé « photo.jpg »
n'entre pas. Un module se juge d'abord à ce qu'il a refusé de stocker.

S'y ajoutent, à chaque passage : la chaîne des **migrations rejouée sur une
base neuve**, puis une seconde fois pour l'idempotence, le contrôle du **contrat d'API** (toute route servie est
documentée), et le **typage du front** comparé au contrat
réellement servi.

### Niveau 2 — La recette terrain *(à organiser — différée)*

**Différée le 30 septembre 2026** : les communes ne sont pas encore disponibles.
Elle reste l'objectif de clôture de chaque version ; en attendant, le jumeau
numérique (§ 6bis) prépare la plateforme sans la remplacer.

C'est ce qui manque, et aucune campagne ne le remplace. Le journal des
corrections en porte la preuve : **cinq défauts n'ont été révélés par aucun test
automatisé** — ils n'apparaissaient qu'une fois la plateforme
réellement utilisée, avec un premier circuit créé et un premier signalement
déposé.

**Protocole proposé, par commune pilote :**

1. **Une semaine d'usage réel** par le service propreté, sans assistance, sur son propre registre.
2. **Trois parcours complets** tracés de bout en bout : un signalement citoyen jusqu'à sa preuve de traitement ; une journée de pointage jusqu'au coût à la tonne ; une tournée de prestataire jusqu'à la confrontation contractuelle.
3. **Un critère de sortie chiffré** : aucun écran ouvert sans savoir quoi y faire, et aucune donnée saisie deux fois.
4. **Consignation systématique** de tout défaut dans le journal des corrections, avec sa portée — pas seulement sa cause.

**Communes de recette, arrêtées le 30 septembre 2026.**

| Commune | Rôle | Ce qu'elle éprouve |
|---|---|---|
| **Dar Chaâbane El Fehri** | Recette du jalon 11 | Registre le plus complet : parc, personnel, treize circuits. Carnet de bord, bons, documents, dossier de déclassement |
| **M'hamdia** | Recette du jalon 12 | PCGD 2026 et couches de circuits reçus de la commune : import, séries de tonnage, coût complet rejoué |
| **Djerba Houmt Souk** | Carte et GPS (17.4), prestataires | 36 circuits observés au GPS, 2 855 points, 12 engins ; ni personnel ni pesées |
| *Une commune rurale à désigner* | Couverture rurale | Le cahier des charges distingue urbain et rural ; aucune commune rurale n'a servi de terrain |

**Règle de clôture d'une version** (les recettes R1 et R2 sont différées, § 6bis) : le critère d'acceptation passe, le lot a
tourné un mois complet chez la commune de recette avec de vrais agents, et les
défauts sont consignés au journal des corrections.

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

**Décision du 29 septembre 2026 :** l'application mobile (Jalon 9) est mise en
attente jusqu'à ce qu'existe un marquage blanc par commune ; la PWA entre dans
la refonte du portail (Jalon 10).

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

**Décision retenue le 30 septembre 2026 : courriel et notification push web en
phase 1 ; téléphone et OTP en phase 2, après R1.** La phase 1 est ce qui
fonctionne déjà, sans fournisseur de SMS ni coût par message ; la phase 2 attend
d'avoir observé l'usage réel. C'est un **écart assumé** au cahier des charges
(`M1`), qui reste partiel jusque-là.

Conséquences : le choix d'inscription cesse d'être un préalable du **Jalon 9**
(application mobile), qui reste en attente de son marquage blanc seul. Il est sans
effet sur le **Jalon 13** : les acteurs informels ne s'inscrivent pas eux-mêmes,
la commune les enregistre (lot 18.1).

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
| Affectation réelle des équipes aux 13 tournées de Dar Chaabane | Commune | 14 lignes bloquantes au panneau de cohérence ; à traiter pendant R1 |
| Purge des fichiers retirés | FNCT | Le volume grossit ; rien n'est perdu |
| Articles 4 et 13 du projet de décret, date de départ de sa période transitoire | FNCT / ministères | Le jalon 13 ne peut pas être spécifié en entier |
| Date de la recette terrain (R1 chez Dar Chaâbane, R2 chez M'hamdia) | Communes / FNCT | Aucune version n'est *livrée* ; elles restent *développées* et éprouvées sur le jumeau |
| Barème ANGeD en vigueur et sa date d'effet | ANGeD | Le coût complet garde une redevance « provisoire » |
| Documentation des API GPS des opérateurs | Opérateurs | Le connecteur 17.4 reste bloqué |
| Confirmation juridique du traitement des identités de pré-collecteurs et hébergement accrédité | Juriste FNCT | La garde `hebergement_pii_accredite` reste à faux : aucune identité nominative n'entre en base |
| Purge des exports antérieurs qui contiennent `cin` ou des données de santé | FNCT | Des copies subsistent hors de la base |
| Mot de passe de démonstration `Siipi2026!` publié avec le code | FNCT | Toute instance installée avec les comptes de démonstration et jamais changée est ouverte |

---

## 9. Risques

| Risque | Portée | Ce qui le réduit |
|---|---|---|
| **Le tableau KPI affiche des chiffres faux** | Un indicateur calculé sur une donnée absente sera lu comme vrai et opposé à un tiers | Ne rien afficher quand la donnée source manque ; recalcul manuel avant mise en service |
| **La donnée n'est pas saisie** | Un module que personne ne remplit est pire qu'aucun module : il donne l'illusion d'un suivi | Le pointage tient en soixante cases et un enregistrement ; tout écran ouvert chaque matin doit se remplir en moins de deux minutes |
| **Un défaut invisible aux tests** | Cinq défauts sur vingt n'ont été trouvés qu'en usage réel | Recette terrain (§ 6), et consignation systématique |
| **Une donnée personnelle entre en base** | Loi organique n° 2004-63 | Les campagnes vérifient d'abord ce qui est refusé ; aucune colonne de salaire, de CIN ni de santé n'existe |
| **La plateforme est prête mais aucune commune ne l'a utilisée : illusion de maturité** | Un tableau vert sur des données propres se lit comme « ça marche », et se présente ainsi à la FNCT ou à une commune | Le jumeau numérique (§ 6bis) qui chiffre ce qu'on sait ; le mode démo ; un guide d'accueil de deux pages ; une vidéo de cinq minutes ; et l'écart maintenu entre « fait » et « recetté » (§ 1) |
| **Des données simulées confondues avec des données réelles** | Un tonnage simulé additionné à un tonnage pesé fausse un coût à la tonne | Commune de démonstration marquée `est_demo`, provenance `simule`, exclusion des agrégations nationales — chacune testée par la campagne `simulation-3mois` |
| **Déploiement sur 350 communes** | Aucune procédure de reprise de données n'est écrite | À bâtir avant la deuxième commune, pas avant la trois-centième |

---

## 10. Annexe — l'état technique

| | |
|---|---|
| **Base de données** | PostgreSQL 16 + PostGIS 3.4 — **61 migrations** au 07/10/2026, rejouées sur base neuve à chaque livraison ; le migrateur en garde l'empreinte |
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
