# CLAUDE.md — mémoire de travail du projet SIIPI

Ce fichier est lu au début de chaque session. Il contient ce qu'il faut savoir
**avant** de toucher au code : les commandes, les conventions, et les cinq
règles qu'on ne discute pas.

> **Système d'Information Intelligent pour la Propreté Intercommunale**
> Fédération Nationale des Communes Tunisiennes — 350 communes.
> Propriété intellectuelle : FNCT. Hébergement : Tunisie. Données personnelles :
> voir « Références légales » au §2.

**Décisions tranchées :** `docs/specs_metier/DECISIONS_2026-10-16.md` (mobile, SMS et courriel, OTP, modèles 16.2, mutualisation D-1 à D-7) et `docs/specs_metier/DECISIONS_2026-10-20.md` (versions fantômes, bases d'essai, SMTP, chantier P de mise en production, populations, noms arabes, matrice des densités 17.2, connecteur GPS 17.4 — avec l'ordre de travail). Elles priment sur les valeurs par défaut et les questions ouvertes des spécifications.

**Où reprendre :** `FEUILLE_DE_ROUTE.md` § 0 donne l'ordre des jalons (S0, puis v0.16 → v0.19), ce qui
est prêt et ce qui bloque. Les pièces métier sont dans `docs/specs_metier/` (lire `SPEC_v0.16.md`).

**Consigne de reprise (30/09/2026, nuit).** La recette terrain est différée : elle reste
l'objectif de clôture d'une version mais ne bloque plus l'ouverture des jalons
suivants. Les lots 17.1, 17.3 et 17.5 peuvent avancer en parallèle de R1 ; 17.2 et
17.4 restent suspendus à leurs préalables externes. Ordre : S0, S1 (jumeau
numérique), jalon 11. **S0 est fait (v0.15.2, v0.15.3 ; la carte du conseiller SIG en v0.15.43). S1 est fait (v0.15.4), 16.1 aussi (v0.15.5), et la mécanique de
16.2 (v0.15.6, numérotation scellée), et ses gabarits imprimables depuis la v0.15.46, « modèle provisoire »
jusqu'à leur validation par un chef de dépôt (décision du 16/10/2026). 16.3 est fait (v0.15.7 : carnet de bord, bons de carburant, quota, L/100 km), 16.4
aussi (v0.15.8 : dossier de déclassement, seuil de 80 % affiché, rapport de rendement, circuit
d'autorisation). Le jalon 11 est développé ; ses gabarits attendent la validation du chef de dépôt pendant la recette.
Au jalon 12, 17.3 est fait (v0.15.9 : paramètres nationaux datés, redevance ANGeD au taux de la
date de la pesée), 17.1 aussi (v0.15.10 : population permanente et de saison, production
théorique), 17.5 aussi (v0.15.11 : rejeu du coût complet d'un bureau d'études, écarts E1 à E8 ;
le fichier réel de M'hamdia reste hors du dépôt public). Restent 17.2 et 17.4, suspendus.
Au jalon 13, 18.1 est fait (v0.15.13 : registre communal des acteurs informels, derrière le
paramètre national `cadre_secteur_informel_actif`, inactif ; v0.15.14 : l'écran n'apparaît pas tant
que le cadre n'est pas en vigueur) ; 18.2 et 18.3 attendent l'article 13
et la date de départ de la période transitoire. v0.15.15 : en production, le mot de passe public
des comptes de démonstration n'ouvre aucun compte (`src/motDePassePublic.ts`). v0.15.16 : la recette R1
est préparée (`docs/recette/`, commande `recette:etat`) ; elle attend la commune. v0.15.17 : les
campagnes n'empruntent plus de compte de démonstration pour écrire dans Dar Chaabane (JC-001).
v0.15.18 : `fichiers` ne saute plus sa partie citoyen en silence (JC-003). v0.15.19 : audit de
tous les blocs conditionnels des campagnes, 4 sautaient des contrôles, corrigés (JC-004) ; outil
`scripts/skills/audit-blocs.py`. Le jalon 14 (mutualisation) est spécifié, pas ouvert :
`docs/specs_metier/SPEC_v0.19_mutualisation.md`, à valider par la FNCT (D-1 à D-7). v0.15.21 :
D-FNCT-1 tranchée — le citoyen trouve sa commune par sa position, ou par gouvernorat puis commune.
v0.15.22 : D-FNCT-3 tranchée — Zarzouna rattachée à Bizerte (retirée, jamais effacée), El Hchachna
créée ; une commune retirée disparaît de toute l'API par la politique de lecture de `communes`.
v0.15.23 : D-FNCT-4 tranchée — à 36 mois, une photo est compressée, l'original part dans l'archive
froide (volume `siipi_archive_froide`, gardé sans limite) ; la FNCT en demande la restauration.
v0.15.24 : D-FNCT-5 tranchée — la base retient sa nature (développement, formation, production ;
`src/instance.ts`, migration 067) ; comptes de démonstration refusés en production ; un mot de passe
provisoire n'ouvre que son remplacement. Une campagne ne démarre jamais une API de production ou de
formation sur la base des tests : elle la rendrait définitivement telle (`tests/outils/instance_essai.sh`).
v0.15.25 : refonte, lot 1 — barème, note, classement et fiche d'évaluation retirés (migration 068) ; la commune
déclare (`declarations_indicateurs`), la valeur vaut dès son enregistrement, la FNCT la commente.
v0.15.26 : refonte, lot 2a — porteur d'un projet, PCGD et caractérisation des déchets (migration 069) ;
`app.caracterisation_retenue()` rend la source la plus précise, avec son origine, ou rien ; premiers
formulaires du registre `web/src/composants/ajout/`. v0.15.27 : refonte, lot 2b — catalogue « + Ajouter »
(en-tête du portail, bouton flottant sur téléphone) ; les formulaires de création vivent dans le registre,
un par type, et chaque écran ouvre le même (`npm run lint` le vérifie). v0.15.28 : refonte, lot 3a — les
indicateurs dans le temps (migration 070) : un seul calcul pour toute période (`app.mesures_kpi` devient une
enveloppe), `app.serie_indicateur` (un mois sans donnée est un trou), `app.manques_indicateur` (les dépendances
sont une donnée du catalogue), repère du gouvernorat dès 5 communes. v0.15.29 : refonte, lot 3b — l'écran
Indicateurs en cartes (petite courbe de 12 mois, migration 071 : `app.series_commune`) et panneau (graphique
Recharts, tableau exportable, formule FR/AR, repère) ; « il manque » ouvre sur place le formulaire du registre,
la déclaration ou le paramètre de la commune. v0.15.30 : refonte, lot 4a — le tableau national (migration 072) :
une saisie est le fait de la commune elle-même (`app._saisies_communales`, jamais la FNCT), déploiement mois par
mois (`/observatoire/activite`), tonnages estimé / déclaré / mesuré / pesé jamais additionnés, répartition d'un
indicateur avec « N communes sur M » et sans rang, contours des gouvernorats. v0.15.31 : lot 4b — la synthèse nationale s'ouvre sur le suivi du déploiement ; « Répartition » donne la carte des gouvernorats, le graphique alphabétique et le détail par commune, triable. v0.15.32 : lot 5 — « Ma commune dans SIIPI » (migration 073, `app.completude_commune`) : chaque donnée de référence et chaque registre du mois, présent ou à ajouter, avec son formulaire et les indicateurs qu'il débloque ; ni total, ni pourcentage, ni liste « toutes communes ». Le choix du formulaire qui complète une donnée vit dans un seul composant (`web/src/composants/kpi/LigneACompleter.tsx`). La refonte est close. v0.15.33 : WaPla, lot W1a — le moteur réécrit en mode fidèle (`backend/src/wapla/moteur.ts`, fonction pure, sans base) : il reproduit l'outil UNIDO défauts compris, vecteurs de l'annexe retrouvés, aucun écart avec le témoin `tests/wapla_attendus.py` sur 213 jeux ; réutilisation confirmée par l'UNIDO le 13/10/2026. v0.15.34 : W1b — le mode corrigé, par défaut (D1 à D10 corrigés ; D7 tranché le 14/10/2026 : méthane sans les résidus, curseur de dégradation séparé) ; masse conservée, chaque écart avec le mode fidèle expliqué par un défaut nommé, témoin d'accord dans douze réglages. v0.15.35 : W2a — le schéma `wapla` (migration 074) : les références tunisiennes (climat par gouvernorat, tenues par la FNCT, datées, retirées jamais effacées) et l'amorce `wapla.amorce_commune` (ce que SIIPI propose pour chaque entrée, avec sa provenance, ou ce qui manque ; droits de l'appelant). SIIPI ne dépend jamais de `wapla` : pg_depend, et le schéma supprimé le temps d'une transaction, les chiffres de SIIPI ne bougent pas. v0.15.36 : W2b — les bilans WaPla (migration 075) : un par commune et par exercice, nés de l'amorce, complétés par la commune, calculés par le moteur corrigé dans l'API, le résultat gardé avec sa version ; niveau de fiabilité (clés traitées avant le calcul ; une clé par défaut → illustratif, que la FNCT ne voit pas ; seuil de la FNCT sur 17 entrées comptées) ; une saisie rend le résultat caduc. Pas de journal d'audit de SIIPI sur la couche : une saisie WaPla ne compte pas comme activité dans SIIPI. v0.15.37 : W3 — l'écran « Bilan de planification (WaPla) » du pôle Pilotage (`web/src/composants/wapla/`) : ouverture d'un exercice depuis l'amorce, entrées de planification avec leur provenance et ce que SIIPI ne tient pas, calcul, niveau de fiabilité et son bandeau, diagramme de Sankey, GES (potentiel engagé), uPOPs, coûts, export Excel/CSV (`GET /wapla/bilans/{id}/export` : méthode, toutes les entrées et leur provenance, résultats). v0.15.38 : W4a — les scénarios (migration 076) : copie d'un bilan calculé, hypothèses de la commune, comparaison au statu quo (décharge, brûlage, GES, uPOPs, écart de coût de ce que le scénario ajoute), figement tenu par la base (`src/wapla/comparaison.ts`, fonction pure). v0.15.39 : W4b — les écrans des scénarios (`ScenarioWapla.tsx`) : création depuis un bilan calculé, hypothèses (dont les coûts d'un procédé ajouté), tableau côte à côte avec le statu quo et écart signé, figement. v0.15.40 : W5 — les agrégats nationaux (migration 077, `GET /wapla/agregats`, FNCT seule) : par gouvernorat et par district, les seuls bilans calculés et étayés d'une commune réelle (`wapla.bilans_agregeables` tient la règle), « N sur M communes », null et jamais 0 sans bilan étayé, aucun rang ni ligne par commune, ordre alphabétique. W0 est acté le 20/10/2026 en validation par lecture croisée, pas en rejeu contre exécution : le moteur et un port Python indépendant (`tests/wapla_attendus.py`), tous deux écrits d'après `server.r`, concordent sur 213 jeux ; des vecteurs officiels, s'ils apparaissent, entreront dans la campagne `wapla-moteur` (format : `docs/specs_metier/sources/wapla/W0_fiche_rejeu.md`). Le climat WaPla est une référence par gouvernorat, saisie par la FNCT à partir des normales OMM 1991-2020 de la NOAA, stationnaire ou estimée depuis la station la plus proche, en surcharge facultative par la commune ; son chargement est en place depuis la v0.15.59 (`npm run seed:normales-climat`) ; depuis la v0.15.60, les 27 feuilles NOAA, leur manifeste et la correspondance sont dans `backend/seed/data/`, et le chargement entre dans l'ordre de référence. v0.15.41 : D-FNCT-2 tranchée — les cinq districts du décret n° 2023-589 du 21 septembre 2023 (migration 078, dans les tables de 050 : `districts_fnct`, `gouvernorats_district`), avec leur source ; la FNCT les redéfinit dans *Paramètres nationaux*, en citant sa source, sans laisser de gouvernorat sans district. Aucun nom de gouvernorat dans le code (campagne `districts`, `web/scripts/verifier-gouvernorats.mjs`). v0.15.42 : D-FNCT-4 reconfirmée le 16/10/2026 — originaux gardés sans limite dans l'archive froide ; `purge-media` travaille sur une base, une API (port 4005), un volume et une archive jetables, et y laisse partir le passage mensuel pour de bon. v0.15.43 : la carte du conseiller SIG (S0) — un seul sélecteur de fonds pour toutes les cartes (`composants/carte/FondsDeCarte.tsx` : plan OpenStreetMap, satellite Esri, jamais de tuiles Google), l'écran *Carte des communes* de l'observatoire (`GET /observatoire/carte-communes` : superficie sur l'ellipsoïde, population avec sa provenance, null jamais 0) ; les écarts entre le fichier du conseiller et le référentiel sont constatés dans `docs/specs_metier/sources/sig/`, rien n'est corrigé. v0.15.44 : B5.5.4 — les indicateurs de communication (migration 079, `app.indicateurs_communication`, `GET /communication/indicateurs`, onglet *Indicateurs* de l'écran Communication) : volumes, délai de décision sur un point proposé, taux de livraison, de lecture, de portée, de validation et de participation ; que des totaux, un taux sans dénominateur est null. v0.15.45 : C2.2 — l'import des fichiers de limites (`POST /decoupage/lire-fichier`, `services/fichierGeo.ts`, `services/zip.ts`) : Shapefile en zip, KML, KMZ, GeoJSON, ramenés en WGS 84 par PostGIS ; une projection inconnue est refusée en la nommant, jamais devinée ; rien n'est enregistré par la lecture. v0.15.46 : 16.2 — les gabarits des quatre documents scellés (`src/documents/gabarits.ts`, contrat du contenu vérifié à l'émission ; `impression.ts`, page A4 bilingue, bandeau « modèle provisoire », empreinte du contenu), `GET /documents/gabarits`, `GET /documents/{id}/impression`, écran *Documents* (registre, impression, annulation, trous) et formulaire unique `ajout/FormulaireDocument.tsx` ; noms arabes des gouvernorats en base (migration 080). v0.15.47 : le courriel (décision du 16/10/2026, « courriel d'abord ») — un serveur SMTP désigné par l'exploitant (`SMTP_*`, `services/courriel.ts`), rien ne part sans lui et c'est dit ; le mot de passe provisoire part à son titulaire et sort alors de la réponse ; les notifications partent par courriel aux seuls citoyens qui l'ont demandé, type par type (migration 081 : une préférence absente vaut « désactivé »), consignées sur le canal `email`, comptées à part du push ; état et essai pour la FNCT (`GET /courriel/etat`, `POST /courriel/essai`, jamais le mot de passe du serveur). v0.15.48 : JC-005 corrigée — la campagne `citoyen` ne touche plus qu'à son citoyen d'essai ; un citoyen témoin domicilié et l'empreinte de tous les autres prouvent en partant qu'elle les a laissés tels quels. v0.15.49 : JC-006 corrigée — un corps illisible reçoit 400, 413 ou 415 avec ce qu'il faut corriger, jamais 500 ; le journal des requêtes passe avant les lecteurs de corps (campagne `corps-illisibles`). v0.15.50 : JC-009 corrigée — la campagne `citoyen` travaille dans sa commune de test avec un directeur temporaire, et prouve, pendant qu'elle a ses lignes en base puis en partant, qu'aucune annonce, aucun secteur, aucun circuit, aucune version de découpage ni aucun signalement n'a bougé ailleurs ; elle laissait une fausse « version 1 » dans l'historique du découpage de Houmt Souk. v0.15.51 : JC-010 corrigée — `suppression` et `decoupage` font leurs corrections de la FNCT dans des communes de test ; `tests/outils/communes_reelles.sh` prouve que secteurs, versions et limites des communes réelles n'ont pas bougé ; inventaire des versions fantômes : seule la pile d'essai en portait. v0.15.52 : JC-012 corrigée, JC-011 en partie (lot A) — `cloisonnement`, `audit`, `notifications`, `notifications-citoyen` et `kpi-sources` travaillent dans leurs communes de test avec des comptes temporaires (`tests/outils/comptes_temporaires.sh`) ; `tests/outils/base_reelle.sh` prouve qu'aucune ligne d'une commune réelle n'a bougé (66 tables, fiches des communes). v0.15.53 : JC-011, lot B — douze autres campagnes quittent « le premier directeur de la base » ; `tests/outils/communes_essai.sh` pose les communes de test et efface tout ce qu'elles portent ; v0.15.54 : JC-011 corrigée (lot B2) — les douze dernières campagnes n'empruntent plus de compte ; la garde du lanceur (`tests/executer.sh`) refuse toute campagne qui choisit « le premier » compte d'un rôle. v0.15.55 : JC-014 corrigée — huit campagnes qui écrivaient avec des comptes de démonstration nommés (La Marsa, Sfax, Houmt Souk, Midoun) ou par une requête sur plusieurs lignes (Ajim, Houmt Souk) travaillent dans des communes de test ; la garde recolle une requête écrite sur plusieurs lignes. v0.15.56 : JC-013 corrigée — les six campagnes qui touchent une table nationale (paramètres nationaux et des indicateurs, réglages WaPla, districts) la rendent ligne entière, date et auteur compris (`tests/outils/tables_nationales.sh`). v0.15.57 : JC-015 corrigée — `module2` à `module6` éprouvent une copie du jeu de Dar Chaabane dans une commune de test (`tests/outils/copie_dar_chaabane.sh`) ; Dar Chaabane n'est que lue, son journal d'audit ne reçoit aucune ligne. v0.15.58 : les normales climatiques par gouvernorat (WaPla) — `npm run seed:normales-inm` charge les normales INM 1981-2010 (open data, licence OTL) dans `wapla.facteurs_reference`, versionnées par date d'effet, après avoir vérifié que le fichier couvre exactement les gouvernorats du référentiel ; un bilan sans climat n'est jamais « étayé » (campagne `normales-climat`). Le fichier officiel reste à déposer dans `backend/seed/data/`. v0.15.59 : la source devient les normales OMM 1991-2020 de la NOAA (27 stations) — `npm run seed:normales-climat` (qui remplace `seed:normales-inm`) lit les feuilles NOAA, contrôle leur empreinte contre un manifeste et la correspondance station → gouvernorat ; chaque normale porte sa période, sa méthode, ses stations, sa distance et son label stationnaire ou estimée (migration 082), et l'écran du bilan le dit (FR, AR) ; la distance d'une normale estimée est calculée au chargement (haversine, station → centre du gouvernorat), jamais recopiée. W0 acté en validation par lecture croisée. v0.15.60 : les normales réelles sont chargées — 27 feuilles NOAA (manifeste SHA-256, adresses NCEI), la correspondance des 24 gouvernorats (20 stationnaires ; Ariana, Ben Arous, Manouba estimées depuis Tunis-Carthage, Sousse depuis Monastir) ; `seed:normales-climat` dans l'ordre de référence ; la campagne `normales-climat` les recalcule par un témoin indépendant. v0.15.61 : jalon D (« prête à présenter », `docs/specs_metier/SPEC_D_pret_a_presenter.md`), lot D1 — le logo des communes (migration 083, table `logos_communes`, usage de fichier `logo_commune`) : la commune le dépose depuis son portail, la FNCT en secours depuis l'annuaire (un seul « Modifier » par commune : contacts, limites, logo ; v0.15.62 : l'annuaire et la carte des communes sont une seule entrée « Annuaire et carte », un clic sur la carte mène au portail, et « Modifier » gagne les coordonnées de la commune) ; il s'affiche en tête du portail (`composants/communal/BandeauCommune.tsx`, emblème aux initiales sans logo) ; un SVG n'est accepté que statique, refusé et jamais réécrit s'il porte un script ou un lien extérieur (`svgStatique`) ; le logo remplacé reste dans l'historique.**

---

## 1. Les cinq règles d'or

Elles priment sur toute élégance technique. Un correctif qui en viole une est un
défaut, pas un correctif.

### 1.1 Une donnée manquante n'est pas un zéro

Un indicateur dont la source n'est pas tenue **ne s'affiche pas**. Il n'affiche
pas `0`, il n'affiche pas `—` en prétendant calculer : il dit *non renseigné*.

> Un tableau de bord qui montre « 0 accident » alors que personne ne tient le
> registre des accidents est plus dangereux qu'un tableau vide : il sera lu
> comme vrai, et opposé un jour à un prestataire ou à un conseil municipal.

Concrètement : `app.mesures_kpi_auto()` ne rend **aucune ligne** quand le
registre qui la nourrit est vide. Ne jamais remplacer cette absence par un
`COALESCE(..., 0)`.

### 1.2 Le cloisonnement vit dans la base, jamais seulement dans l'écran

Chaque table métier porte `commune_id`, `ENABLE` **et** `FORCE ROW LEVEL
SECURITY`, et des politiques qui s'appuient sur `app.can_read_commune()` /
`app.can_write_commune()`. Une route qui oublierait de filtrer ne verra
malgré tout que les lignes autorisées.

**« Sa commune » a deux sens** et c'est la source de trois défauts passés :
`users.commune_id` est le rattachement **principal** ; `app.mes_communes()` est
le **périmètre réel**, rattachements multi-communes compris. Tout contrôle
d'accès se réfère au second.

### 1.3 L'heure est celle de Tunis (UTC+1)

Les colonnes `DATE` sont transmises **en texte**, sans conversion (voir
`backend/src/db.ts`). Par défaut le pilote en ferait un objet `Date` à minuit
heure serveur, que `JSON.stringify` convertirait en UTC : le 1er septembre
deviendrait `2026-08-31T23:00:00Z`, et un contrôle du lundi s'afficherait le
dimanche. **Le bug est invisible sur un serveur en UTC — donc invisible en
développement.**

### 1.4 Rien ne s'efface

Suppression **logique** partout : `deleted_at` + `deleted_by`, via
`app.supprimer(table, id)` — seule voie offerte à l'API, et sa liste blanche
dit ce qui est supprimable. Une affectation se **clôt** (`date_fin`), elle ne
disparaît pas : la tournée de la semaine dernière garde l'équipe qui l'a faite.

**Une seule exception, assumée : le jeu de démonstration** (jumeau numérique,
migration 055). `app.retirer_jeu_demo()` efface vraiment la commune de
démonstration et tout ce qu'elle contient. La suppression logique protège un
historique réel ; une pesée simulée n'est l'historique de rien, et la garder
« supprimée » laisserait du faux en base. L'exception est tenue par la base :
la fonction est réservée à la FNCT et refuse toute commune réelle.

### 1.5 La plateforme constate, elle ne corrige pas

Quand deux registres se contredisent, on **montre l'écart** avec ce qu'il y a à
faire — jamais une réconciliation silencieuse. C'est l'objet de
`app.incoherences_commune()`. Une plateforme qui « nettoierait » ces écarts
ferait disparaître le seul signal disponible sur la qualité des données de la
commune.

---

## 2. Ce qu'on ne stocke jamais

Protection des données personnelles (voir « Références légales » ci-dessous).
La base **n'a pas** ces colonnes, et c'est vérifié par les campagnes de tests
avant toute autre chose :

| Interdit | Pourquoi |
|---|---|
| Salaire individuel, prime, indemnité | Le coût existe au niveau du **service** et de l'**année** (`effectifs_service`) |
| CIN, numéro de pièce d'identité | Aucune finalité dans un outil de propreté. Seule exception, encadrée : l'**empreinte** HMAC du CIN d'un pré-collecteur, pour le dédoublonnage (lot 16.1) — le CIN lui-même n'est jamais écrit |
| Donnée de santé, diagnostic, motif médical | Le vocabulaire des absences ne comporte volontairement **aucun** terme médical |
| Adresse personnelle d'un agent | — |

**Donnée de test :** toute donnée personnelle fournie en test (CIN, téléphone,
salaire, nom d'agent) est remplacée par une valeur **fictive de même format et
de même longueur**.

**Courriels :** un courriel peut porter un mot de passe provisoire. Son corps n'est jamais journalisé ni
gardé en base ; le journal garde le titre et l'issue. Les adresses des citoyens ne sortent que vers le
service d'envoi (`app.courriels_publication`, `app.courriel_citoyen`), jamais par une route.

**Photos :** les métadonnées EXIF sont retirées au dépôt. La position GPS qu'elles
contiennent est **rendue à l'appelant** pour qu'il la propose — jamais conservée
à l'insu de la personne qui a pris la photo.

### Références légales

Le texte qui régit les données à caractère personnel est la **loi organique n° 2004-63
du 27 juillet 2004**, appliquée par l'**INPDP** (Instance nationale de protection des
données personnelles). Jusqu'à confirmation par un juriste de la FNCT :

- dans tout document neuf, citer la **loi 2004-63** pour la minimisation, la
  finalité, l'information des personnes et la déclaration des traitements ;
- les anciennes références légales qui subsistent dans des commentaires, des
  migrations ou le contrat OpenAPI sont **retirées au lot S0** (voir
  `FEUILLE_DE_ROUTE.md` § 0) ; avant de toucher à une migration déjà appliquée,
  vérifier si le migrateur en contrôle l'empreinte ;
- la règle « toute donnée personnelle fournie en test est remplacée par une
  valeur fictive de même format et de même longueur » reste **inchangée**.

---

## 3. Commandes

### Poste de travail (Windows, Docker Desktop)

| Script | Ce qu'il fait |
|---|---|
| `DEMARRER.bat` | **Le seul guide de démarrage** (expliqué par `DEMARRAGE.md`) : conteneurs, migrations, jeux dans l'ordre de référence, contrôle de `/health`. Rejouable |
| `RELANCER.bat` | Redémarrage simple |
| `MIGRER.bat` | **Le passage obligé après toute modification** : migrations, seeds, régénération des types du front, typage, puis `npm test` — le contrat d'API et **toutes** les campagnes inscrites dans `backend/package.json` |
| `TESTS.bat` | Les campagnes seules |
| `VERIFIER.bat` | Diagnostic en lecture seule |
| `CHARGER_DJERBA.bat` / `RECHARGER_DAR_CHAABANE.bat` | Rechargement des jeux réels |
| `POUSSER.bat` | Envoi vers GitHub (les identifiants restent chez l'utilisateur) |

### Dans les conteneurs

```bash
docker compose exec -T api npm run migrate            # migrations en attente
docker compose exec -T api npm run verifier:contrat   # toute route servie est documentée
docker compose exec -T api npm test                   # verifier:contrat + toutes les campagnes (60 au 16/10/2026)
docker compose exec -T api npm run test:module4       # une seule campagne
docker compose exec -T api npm run recette:etat -- <commune>   # une commune peut-elle commencer sa recette ? (lecture seule)
docker compose run  --rm web npx tsc --noEmit         # typage du front
```

### Régénérer les types du front

```bash
docker compose run --rm web npx openapi-typescript http://api:4000/openapi.json -o src/lib/api-types.ts
```

> `npm run types:api` vise `localhost:4000`, ce qui est faux dans un conteneur :
> `localhost` y désigne **ce conteneur**. Les services s'adressent par leur nom.

---

## 4. Pile technique

| Couche | Choix | Note |
|---|---|---|
| Base | PostgreSQL 16 + PostGIS 3.4 | 81 migrations au 16/10/2026, rejouées sur base neuve à chaque livraison |
| API | Node 22 + Express + TypeScript (ESM) | zod pour la validation |
| Contrat | OpenAPI 3.1 **généré depuis les schémas zod d'exécution** | la documentation ne peut pas décrire autre chose que ce qui est contrôlé |
| Front | React 19 + Vite + Tailwind v4 + Leaflet + Recharts | PWA (`manifest.webmanifest`, `sw.js`) |
| Langues | i18next — FR / AR avec RTL | |
| Déploiement | Docker Compose | volume `siipi_fichiers` pour les octets déposés |

---

## 5. Conventions de code

### Le code parle français

Noms de variables, de fonctions, de composants, commentaires, messages
d'erreur : **en français**. C'est la langue des personnes qui maintiendront ce
code à la FNCT. `communeDemandee`, `cheminRelatif`, `incoherences_commune`,
`PhotoDeposee` — pas `getCommune`, `relPath`, `FileImage`.

Exceptions : ce qu'impose une bibliothèque (`useEffect`, `className`), et les
identifiants du cahier des charges (`B5.1.3`, `M3.1`).

### Les commentaires disent *pourquoi*, jamais *quoi*

```ts
// ✗ Incrémente le compteur
// ✓ Le champ est remis à zéro : sans cela, rechoisir le même fichier après un
//   échec ne déclencherait aucun événement, et l'écran paraîtrait figé.
```

Un commentaire qui paraphrase le code est du bruit. Un commentaire qui explique
la décision — surtout le contre-exemple qu'elle évite — vaut une heure de
débogage six mois plus tard.

### TypeScript

`strict`, `noUnusedLocals`, `noUnusedParameters`. **Ne jamais faire taire le
compilateur avec `!` sur un objet d'authentification** : c'est ainsi que
`req.user!.id` (qui n'existe pas ; le champ est `sub`) a vécu neuf fois dans le
code, écrivant `NULL` dans toutes les colonnes d'imputation.

### Bilinguisme et RTL — non négociable

- Toute chaîne visible passe par `t('...')`, et la clé existe **dans `fr.json`
  et dans `ar.json`**. Une clé absente d'une des deux langues est un défaut.
- Propriétés **logiques** en Tailwind : `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`,
  jamais `ml-`/`mr-`/`left-`/`right-`.
- Toute mise en page se vérifie dans les deux sens.

### Navigation

Tout espace de travail à plusieurs écrans — portail communal **et** observatoire
national de la FNCT — navigue par `BarreLaterale` (pôles métier, rétractable,
tiroir sur téléphone, tiroir à droite en arabe). Pas de barre d'onglets
horizontale : sur téléphone, elle cache la majorité de ses onglets sans le dire.
Un nouvel écran se déclare dans le tableau `ENTREES` de l'espace concerné, avec
son pôle et ses deux libellés (FR et AR).

### Base de données

- Une migration est **numérotée, jamais modifiée après application** : on en
  ajoute une nouvelle. Depuis la v0.15.2, **le migrateur le vérifie** : il garde
  l'empreinte SHA-256 de chaque migration appliquée (`schema_migrations.empreinte`,
  fins de ligne ramenées à LF) et **s'arrête** si un fichier ne lui correspond
  plus. Un changement de texte dans une migration ancienne (un `COMMENT ON`, par
  exemple) se porte donc par une migration nouvelle — sinon il n'atteindrait que
  les bases créées après lui (voir `053_references_legales.sql`).
- Idempotente : `IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP ... IF EXISTS`.
- `CREATE OR REPLACE FUNCTION` ne peut pas changer un type de retour :
  `DROP FUNCTION IF EXISTS app.f(args);` d'abord — et **le `GRANT` qui suit
  devient alors indispensable**.
- Chaque table, chaque colonne non évidente porte un `COMMENT ON`. C'est la
  seule documentation que lira l'administrateur dans dix ans.
- Les contraintes portent les règles métier : un refus sans motif, une
  validation sans point créé, une décision sans date sont refusés **en base** —
  pas seulement dans l'écran.
- **`INSERT … ON CONFLICT … DO UPDATE` sur une table RLS exige une politique
  `UPDATE`**, même quand aucun conflit ne survient : PostgreSQL contrôle toutes
  les clauses au moment de planifier la requête. Le tout premier upsert échoue
  donc déjà (`42501`) si la politique manque (leçon de la v0.4.0, `push_souscriptions`).
- **Une colonne `GENERATED` n'est pas encore calculée dans un déclencheur
  `BEFORE`** : `NEW.colonne` y vaut `NULL`. La comparer là fausse toute logique
  qui s'appuie dessus — au lot 16.2, toute annulation passait pour une réécriture
  de `numero_affiche`. Comparer dans un déclencheur `AFTER`, ou exclure la
  colonne générée de la comparaison.

### Routes Express

- Les chemins littéraux se déclarent **avant** `/:id`. Ce piège s'est présenté
  cinq fois : `/personnel/effectif` pris pour un identifiant.
- Erreurs : `ApiError(statut, message en français, actionnable)`. Le message dit
  quoi faire, pas seulement ce qui ne va pas.
- Un enregistrement hors périmètre est **introuvable** (404), jamais « refusé » :
  un refus renseignerait sur son existence.

---

## 6. Charte fonctionnelle

### Gouvernance

| Rôle | Périmètre |
|---|---|
| `super_admin_fnct` | Les 350 communes. Ne décide pas à la place d'une commune (ni acceptation de réclamation, ni validation de point) |
| `admin_commune` | Sa commune, ou l'ensemble de ses rattachements (`app.mes_communes()`) |
| `gestionnaire_prestataire` | Ses zones sous contrat. Traite une réclamation transférée, **ne peut pas la refuser** |
| `citoyen` | Ses propres données, ses propres signalements |

### Le fil rouge

**La commune décide, la plateforme instruit.** Elle prépare, mesure, signale et
propose — elle ne tranche pas à la place de l'agent. Un rang de tournée déduit
est *signalé comme déduit*. Un doublon probable est *mesuré*, pas supprimé.

**Une donnée de référence nationale se paramètre à la maille officielle la plus petite disponible, pas à la
maille opérationnelle la plus fine.** Le climat de WaPla se tient par gouvernorat (24 lignes, maille de l'INM),
saisi une fois par la FNCT ; la commune peut le surcharger, rien ne l'y oblige. Le demander à chacune des 350
communes aurait changé une décision technique en fardeau pour toutes (décision du 20/10/2026).

### Documents administratifs

Les documents légaux (ordre de mission, bon de sortie carburant, fiche de
déclassement, bon de travail) suivent la forme attendue par l'administration
tunisienne : en-tête de la commune, références réglementaires, numérotation
continue, signatures. Ils sont **bilingues** et imprimables en A4.

**Les gabarits** (`backend/src/documents/gabarits.ts`, lot 16.2) disent, pour chaque type, ses champs, ses
libellés FR/AR, ses signatures et son statut — « provisoire » jusqu'à la validation d'un chef de dépôt, qui
se fait en changeant ce statut dans le code. Le gabarit est le contrat du contenu : l'émission refuse un champ
absent ou inconnu, et l'impression (`impression.ts`) laisse une case vide vide.

**La numérotation est scellée par la base** (migration 057) : un document ne s'émet que
par `app.emettre_document()` (numéro attribué sous verrou, dans la même transaction),
ne s'annule que par `app.annuler_document()` (motif obligatoire, numéro conservé), et ne
se modifie ni ne s'efface. L'application n'a aucun droit d'écriture directe sur le
registre. Un nouveau type de document s'ajoute à la liste de `documents_emis` — jamais par
une table à part, qui aurait sa propre numérotation à prouver.

---

## 7. Protocole de validation — avant toute livraison

### Le critère d'acceptation

**Avant de commiter, l'unique critère d'acceptation technique est le passage
sans erreur de :**

1. **`npm run verifier:contrat`** — toute route servie est documentée ;
2. **toutes les campagnes `backend/tests/*.sh`** — pas « celles qui concernent
   la tâche ». Elles étaient 60 au 16/10/2026 (S0 a ajouté `assainissement`,
   S1 `simulation-3mois`, 16.1 `barbechas`, 16.2 `documents`, 16.3 `exploitation`,
   16.4 `declassement`, 17.3 `parametres-nationaux`, 17.1 `parametres-communaux`,
   17.5 `cout-complet`, 18.1 `acteurs-informels`, v0.15.15 `mot-de-passe-public`,
   v0.15.16 `recette-etat`, v0.15.23 `purge-media`, v0.15.26 `references`, v0.15.28 `series-indicateurs`, v0.15.30 `tableau-national`, v0.15.32 `completude`, v0.15.33 `wapla-moteur`, v0.15.35 `wapla`, v0.15.36 `wapla-bilans`, v0.15.38 `wapla-scenarios`, v0.15.40 `wapla-agregats`, v0.15.41 `districts`, v0.15.43 `carte-communes`, v0.15.44 `communication-indicateurs`, v0.15.45 `import-geo`, v0.15.47 `courriel`, v0.15.49 `corps-illisibles`, v0.15.58 `normales-climat`, v0.15.61 `logos-communes`).

Les deux se lancent d'une seule commande, qui les enchaîne dans cet ordre :

```bash
docker compose exec -T api npm test
```

Le dossier `backend/tests/` contenait **61 fichiers `.sh`** au 16/10/2026 : 60
campagnes et `executer.sh`, le lanceur, qui n'est pas une campagne. Ces chiffres
ne sont pas des valeurs à retenir mais à **recalculer** — un critère d'acceptation qui se
dessèche sans bruit est pire qu'aucun :

```bash
ls backend/tests/*.sh | grep -vc executer                       # campagnes présentes
grep -o '"test": "[^"]*"' backend/package.json | grep -o 'executer.sh [a-z0-9-]*' | sort -u | wc -l   # campagnes enchaînées par npm test
```

Les deux nombres doivent être **égaux**. S'ils diffèrent, une campagne existe
sans être exécutée : la tâche n'est pas terminée. *(La seconde commande ne lit
que la chaîne `test` depuis la v0.15.2 : l'ancienne comptait aussi les scripts
`test:<campagne>`, si bien qu'une campagne retirée de la chaîne mais gardée en
script à part restait comptée.)*

**Aucun contrôle sous condition d'une donnée qu'on espère trouver.** Un `if [ -n "$X" ]`
autour d'un `chk` se saute en silence quand la donnée manque, et la campagne se compte réussie :
c'est ainsi que B5.1.3 n'était éprouvé par aucune campagne (JC-003, JC-004). L'objet à éprouver
se **bâtit** (commune de test, engin, secteur, citoyen d'essai) ; si la campagne ne peut pas le
bâtir, le contrôle **échoue**. `python3 scripts/skills/audit-blocs.py backend <journal de npm test>`
nomme tout contrôle sous condition qui n'a pas tourné.

**Une campagne ne se déclare jamais « sans objet ».** Jusqu'à la v0.15.2,
`suggestions` s'arrêtait en SUCCÈS quand elle ne trouvait pas de compte citoyen :
`npm test` la comptait réussie alors qu'aucun de ses contrôles n'avait tourné — et
ce silence cachait un défaut réel (migration 054). Une campagne bâtit ses propres
données ; si elle ne le peut pas, elle **échoue**.

**Ordre de chargement de référence** (celui d'une installation réelle, et celui
dans lequel les campagnes sont écrites) : `migrate`, `seed`, `import:decoupage`,
`seed:dar-chaabane`, `seed:parc`, `seed:personnel`, `seed:communication`,
`seed:normales-climat` (les normales NOAA 1991-2020 des 24 gouvernorats, depuis la v0.15.60).

**Aucun nombre de tests ne s'écrit** dans un message de commit, un rapport ou
un CHANGELOG sans avoir été lu dans la sortie d'une commande. Un chiffre
recopié d'un prompt ou d'un souvenir (« 240/240 ») n'a jamais été mesuré.

### Ce que le critère ne couvre pas

Les campagnes interrogent l'API et la base ; elles ne voient ni le front ni la
rejouabilité des migrations. Ces deux contrôles restent des **préconditions** :

1. **Chaîne de migrations rejouée sur une base neuve** (000 → la dernière), puis
   la nouvelle migration **rejouée une seconde fois** pour prouver son
   idempotence.
2. **`npm run lint`** côté backend **et** côté web. Le front n'est pas typé par
   Vite : il se transpile sans vérifier, et c'est ainsi qu'un composant a planté
   au rendu sur une propriété jamais déclarée. Typage de référence : TypeScript
   **5.8.x** (la 5.9 signale à tort une erreur dans `AbonnementPush.tsx`).
   Côté web, `npm run lint` enchaîne `scripts/verifier-gouvernorats.mjs` (aucun nom de
   gouvernorat dans le code : le découpage vit dans la base, D-FNCT-2), `scripts/verifier-fonds-de-carte.mjs`
   (les adresses de tuiles ne vivent que dans `FondsDeCarte.tsx`, aucune tuile Google) et `scripts/verifier-ajout.mjs` : l'appel d'API qui
   crée un objet (liste : `src/composants/ajout/appels-creation.json`) ne vit que dans
   UN formulaire du registre `src/composants/ajout/`. Un écran qui veut ajouter un
   objet ouvre ce formulaire (`useAjoutEnLigne`), il n'en écrit pas un second.

### Après le critère

3. **Relecture de la taille ET du contenu des fichiers livrés.** Cinq livraisons
   ont rapporté un succès en posant une version périmée sur le disque. Une
   comparaison de taille ne suffit pas sur un fichier accentué : chercher une
   phrase que seule la nouvelle version contient.
4. **Version.** Les deux `package.json` et leurs `package-lock.json` portent la
   version de la **dernière entrée du `CHANGELOG.md`**. On ne la monte qu'en
   clôturant un lot, dans le même commit que l'entrée du CHANGELOG — jamais
   avant, jamais après. Un décalage entre le commit annoncé et les fichiers est
   un défaut (constaté : v0.15.0 annoncée, fichiers restés à 0.14.0).

### Écrire une campagne de tests

Elle commence par ce que la plateforme **refuse** : un module se juge d'abord à
ce qu'il n'a pas laissé entrer. Elle bâtit ses propres données (`TEST-…`) et les
nettoie — travailler sur le jeu de Dar Chaabane l'abîme à chaque passage.
Enregistrement dans `backend/package.json` et dans `MIGRER.bat`.

**Une campagne ne laisse jamais une donnée réelle modifiée.** Si elle doit écrire
sur une donnée existante, elle la **restaure** en partant et vérifie qu'elle l'a
fait (JC-007 : `decoupage` effaçait le contour officiel de Midoun). Si elle a
besoin d'une base propre, ou d'une base qu'elle va transformer, elle en crée une
**jetable** (`tests/outils/instance_essai.sh` : `mot-de-passe-public` aurait sinon
rendu la base des campagnes définitivement « production » ; `purge-media` y lance
la tâche de conservation, qui ne doit jamais toucher une photo réelle).

**Une correction de la FNCT se fait dans une commune de test.** Poser ou retirer un secteur, redessiner
une limite : la base fige l'état présent en « version 1 » du découpage, puis inscrit la correction en version
suivante. Faite dans une commune réelle, même effacée ensuite, elle laisse dans son historique des versions qui
n'ont jamais eu lieu (JC-009, JC-010). Une campagne qui fait ce geste le fait dans sa commune de test, et le
prouve avec `tests/outils/communes_reelles.sh` — pendant qu'elle a ses lignes en base, puis en partant.

**Aucune ligne d'une commune réelle ne bouge pendant une campagne.** Une campagne bâtit ses communes
de test et ses comptes (`tests/outils/comptes_temporaires.sh` : tout rôle, effacés en partant) et prouve avec
`tests/outils/base_reelle.sh`, pendant qu'elle a ses lignes en base puis en partant, que les tables des communes
réelles et leurs fiches n'ont pas bougé, dates comprises (JC-012). « Le premier directeur de la base » n'est
jamais un compte de campagne : sur une base réelle, c'est le plus ancien directeur réel (JC-011). Le lanceur
refuse une campagne qui choisit un compte par `FROM users WHERE role = '…' … LIMIT 1` (code 4), même écrit sur
plusieurs lignes. Un compte de démonstration **nommé** ne sert qu'à un refus ou à une lecture : écrire avec lui,
même en effaçant ses lignes, laisse la commune « active » au journal d'audit (JC-014).

**Une table nationale se rend ligne entière.** Une table sans commune (paramètres nationaux, paramètres des
indicateurs, réglages WaPla, districts) n'a pas de copie de test : la campagne qui la modifie la garde avant son
premier geste et la rend en partant, date et auteur compris, avec `tests/outils/tables_nationales.sh`. Rendre la
valeur par l'API ne suffit pas : la date devient celle des campagnes, et l'auteur, un compte temporaire effacé
(JC-013).

**Le jeu réel s'éprouve sur sa copie.** Une campagne qui doit éprouver les données réelles d'une
commune (`module2` à `module6`, sur Dar Chaabane) les copie dans une commune de test
(`tests/outils/copie_dar_chaabane.sh`) et n'écrit que dans la copie, avec un directeur temporaire
(`tests/outils/directeur_temporaire.sh`). Écrire dans la commune réelle, même en effaçant ses lignes,
laisse au journal d'audit les écritures d'un directeur, et la commune paraît « active » (JC-015). La
campagne le prouve : le journal d'audit de la commune ne reçoit aucune ligne, pendant puis en partant.
Elle ne rattache aucun compte à la commune réelle (JC-001). Les fichiers sourcés vivent sous `tests/outils/`, que le recomptage
ci-dessus (`tests/*.sh`) ne voit pas : ils ne sont pas des campagnes.

**Témoin indépendant.** Quand une campagne vérifie un calcul, ses valeurs attendues viennent
d'un script qui ne lit que le fichier d'entrée et la méthode, jamais le code testé :
`jumeau_attendus.py` (S1), `cout_complet_attendus.py` (17.5, sur un jeu fictif de même structure
que le fichier réel, `tests/donnees/cout-complet-fictif.json`).

**Exception assumée : `simulation-3mois`.** Elle ne bâtit pas de lignes `TEST-…` :
elle charge le jeu du jumeau numérique (`backend/seed/data/jumeau_3mois.json`,
produit une fois pour toutes par `scripts/jumeau/generer.py`) dans sa commune de
démonstration fictive (`est_demo`), et la **retire** en partant. Ses lignes portent
`provenance = 'simule'` ; la base refuse une ligne simulée dans une commune réelle.
Ses valeurs attendues sont calculées par `backend/tests/jumeau_attendus.py`, qui ne
lit que le fichier du jeu et la définition des indicateurs — jamais le code testé.
Le jeu change ? On relance `generer.py` et on versionne le fichier : l'application
ne génère rien. Voir `FEUILLE_DE_ROUTE.md` § 6bis.

---

## 8. Repères du dépôt

```
backend/
  migrations/      081 fichiers numérotés au 16/10/2026 — l'ordre fait foi, l'empreinte aussi
  src/routes/      une route par domaine ; les littéraux avant /:id
  src/services/    kml.ts (relevés terrain), fichierGeo.ts (Shapefile, KML, GeoJSON de limites),
                   zip.ts (le seul lecteur d'archives), fichiers.ts (stockage, EXIF),
                   conservationMedias.ts (photos de 36 mois, archive froide)
  src/wapla/       la couche WaPla : moteur.ts, fiabilite.ts, comparaison.ts (fonctions pures), routes.ts (/wapla) ; hors de
                   src/wapla, seuls app.ts et le contrat l'importent, et jamais le moteur
  src/openapi/     document.ts — le contrat, généré depuis les schémas zod
  seed/            jeux réels : Dar Chaabane, Djerba (Houmt Souk, Midoun, Ajim)
  tests/           60 campagnes au 16/10/2026, lancées par tests/executer.sh
web/
  src/composants/  communal/ · national/ · prestataire/ · kpi/ · registres/
                   ajout/ — le registre des formulaires de création et le catalogue « + Ajouter »
                   carte/ — FondsDeCarte.tsx, le seul endroit des fonds de carte (OSM, Esri)
  src/lib/api.ts   client HTTP ; api-types.ts est GÉNÉRÉ, ne pas l'écrire à la main
  src/locales/     fr.json · ar.json — les deux, toujours
scripts/skills/    outils de vérification interne (voir scripts/skills/README.md)
```

**Documents de référence :** `FEUILLE_DE_ROUTE.md` (les 96 fonctionnalités du
cahier des charges et leur état), `CHANGELOG.md` (l'avancement par jalon).

---

## 9. Terrain

Deux communes ont servi de terrain réel : **Dar Chaabane El Fehri** (circuits,
parc, effectif, pesées) et **Djerba** — Houmt Souk, Midoun, Ajim (relevés GPS,
prestataires). Aucune commune n'utilise encore la plateforme dans son travail
quotidien.

**Cinq défauts n'ont été révélés par aucune campagne automatisée.** Ils
n'apparaissaient qu'en usage réel. C'est l'argument, s'il en fallait un, pour
une recette terrain avant chaque jalon — et pour consigner chaque défaut trouvé
dans le journal des corrections (`docs/recette/JOURNAL_DES_CORRECTIONS.md`) avec
sa **portée**, pas seulement sa cause.

**Pendant une recette, aucune campagne ne tourne sur sa base** : les campagnes créent des communes
et des comptes de test, et rendent des tables nationales qu'elles ont modifiées. `module2` à `module6`
n'écrivent plus dans Dar Chaabane, elles éprouvent sa copie (JC-015), mais une recette ne partage pas sa
base avec des essais. Les campagnes se lancent sur une pile d'essai séparée.
