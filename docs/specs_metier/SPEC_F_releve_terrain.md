# SIIPI — Jalon F : le relevé de terrain
## L'application de collecte de l'agent, synchronisée à SIIPI

**FNCT · 2 novembre 2026 · ouvert par Nacer le 28/10/2026 · statut : spécification v1, quatre décisions signées le 02/11/2026 (§ 2), amendée le même jour (§ 8 : lots F1c à F1f), rien n'est codé**

L'analyse fonctionnelle de l'existant (niveaux 1 et 2, registre des licences) est dans
`sources/terrain/ANALYSE_EXISTANT.md`. Ce document s'appuie dessus et sur une lecture du dépôt
à la v0.15.85 ; chaque constat porte son renvoi `fichier:ligne`.

---

## 0. Le but

Aujourd'hui, la donnée de terrain suit un chemin fait à la main. L'agent relève avec une
application tierce (GPS Waypoints, My Track, Geo Tracker), le fichier est exporté, puis
l'administrateur de la commune l'importe dans SIIPI. Ce chemin marche : c'est celui des données
de Dar Chaâbane et de Djerba. Il laisse trois fragilités, toutes constatées :

1. **le vocabulaire est libre** : SIIPI tient un dictionnaire et des motifs pour deviner un type
   à partir d'étiquettes tapées (`backend/src/services/kml.ts:262-345`) ;
2. **l'heure est piégée** : les fichiers Waypoints écrivent l'heure locale suivie de `Z`
   (`kml.ts:27-36`, `kml.ts:381-384`) ;
3. **le relevé n'arrive pas** si personne n'exporte le fichier.

Le jalon F donne à l'agent un outil qui saisit dans la nomenclature de SIIPI, écrit lui-même son
heure, garde la saisie sans réseau et l'envoie à la reprise. **La donnée arrive avec sa
provenance, `releve_terrain`, jamais confondue avec un import de fichier.**

### Les lignes rouges (`SPEC_v0.16.md`) tiennent ici aussi

- **Pas de GPS individuel**, ni sur un balayeur ni sur aucun agent. Une trace appartient à un
  véhicule et à un circuit, jamais à une personne nommée.
- Pas de notation de l'agent, pas d'agrégat par auteur de relevé.
- Aucun nom d'agent saisi, chargé ou envoyé par l'application.
- Les règles d'or de `CLAUDE.md` s'appliquent sans exception : un relevé en attente n'est compté
  nulle part (1.1) ; le cloisonnement vit dans la base (1.2) ; l'heure est celle de Tunis (1.3) ;
  rien ne s'efface (1.4) ; un conflit se montre, il ne se réconcilie pas en silence (1.5).

---

## 1. Ce que l'étude a trouvé dans le dépôt

### 1.1 Des défauts déjà présents, à corriger quel que soit le choix

| # | Constat | Portée | Renvoi |
|---|---|---|---|
| **E1** | Le service worker sert **toute** requête `GET` de même origine depuis le cache, en premier. Depuis que l'API est sous `/api` sur l'origine du site, cela vaut pour les réponses de l'API : une fois lue, une réponse est resservie indéfiniment ; elle est rangée sous son adresse seule, sans le jeton, donc lisible par le compte suivant sur un appareil partagé ; un 401 ou un 500 est rangé comme une réponse valable ; le `no-store` des impressions est contourné. | **Toute instance construite pour la production** (le service worker n'est enregistré qu'en production : `web/src/main.tsx:13-17`). Invisible sur la pile d'essai, qui tourne en développement. Touchera R1 dès la première connexion. | `web/public/sw.js:80-94`, `web/src/lib/api.ts:14`, `backend/exploitation/frontal/Caddyfile:62-64` |
| **E2** | La version du service worker est figée (`siipi-v1`) et la page est servie depuis le cache : une nouvelle version du front **ne s'installe jamais** chez un utilisateur déjà venu. | Toute mise à jour après l'installation. | `sw.js:16`, `sw.js:80-94` |
| **E3** | L'import d'un fichier avec `remplacer` (le défaut) supprime logiquement **tous** les points du circuit, quelle que soit leur source, et impute la suppression par `req.user!.sub` (contraire à `CLAUDE.md` § 5). | Le jour où relevé et import coexistent, un import efface les relevés. | `backend/src/routes/pointsCollecte.routes.ts:429`, `:557-563` |
| **E4** | Une trace importée (`gps_observe`) **remplace** l'itinéraire prévu (`kmz_prevu`) dans `circuits.trace`, sans date ni engin ; les heures des points de trace sont jetées. | La « voie de transition » (trace par application tierce) détruit l'itinéraire de référence au premier import. | `pointsCollecte.routes.ts:602-619`, `kml.ts:473-478` |
| **E5** | Tout KML qui porte `<Track` est classé « trace » et ses marqueurs sont jetés ; tout KML qui porte des points horodatés est lu en « heure locale suivie de Z », quel que soit son producteur. Un KML OpenTracks (heure avec décalage, marqueurs) serait mal lu deux fois. | Toute application autre que celles de Dar Chaâbane et Djerba. | `kml.ts:468-494`, `kml.ts:381-384`, `kml.ts:559` |
| **E6** | `PATCH /trucks/:id/position` contrôle le rattachement **principal** (`req.user!.communeId`) et non `app.mes_communes()`, et répond 403 au lieu de 404. *Rectifié le 02/11/2026 :* un prestataire ne pouvait pas déplacer n'importe quel engin, la RLS de `vehicules` l'en empêchait déjà ; le contrôle de la route ne refusait que des comptes légitimes. | **Corrigé en v0.15.86** (campagne `position-engins`), avec les bornes du corps et la position retirée du journal d'audit (migration 094). | `backend/src/routes/trucks.routes.ts` |

E1 et E2 sont le préalable **F0** (§ 5) : ils touchent l'espace citoyen et le portail en production
avant même la première ligne du jalon F.

### 1.2 Ce qui manque pour un relevé hors ligne

- **Aucune écriture rejouable.** Aucune clé d'idempotence nulle part (`backend/src`,
  `backend/migrations`). `POST /circuits/:id/points` rejoué sans `ordre` crée un second point
  (`pointsCollecte.routes.ts:255-257`).
- **Deux écritures où le dernier gagne en silence** : le constat du jour
  (`circuits.routes.ts:317-323`, contrainte `029_voyages_par_jour.sql:50-53`) et la déclaration
  de passage (`passages.routes.ts:70`). Un envoi de 14 h remplacerait le constat de 10 h.
- **L'heure ne porte pas de date.** `points_collecte.heure_observee` est un `TIME`
  (`028_module2_circuits_points_collecte.sql:117`) ; plusieurs routes posent
  `COALESCE($x::date, CURRENT_DATE)` (`circuits.routes.ts:316`) : un envoi rejoué le lendemain
  serait daté du jour du rejeu. Une chaîne `…+01:00` convertie en `::time` perd son décalage.
- **La saisie manuelle ne garde ni la précision ni l'heure observée** : elle écrit
  `heure_estimee` et `source='saisie'` (`pointsCollecte.routes.ts:215-275`).
- **Le type a une valeur par défaut** (`porte_a_porte`) dans le schéma
  (`pointsCollecte.routes.ts:229`) et en base (`028:106`) ; à l'import, un point sans aucune
  étiquette devient aussi `porte_a_porte`, une étiquette inconnue `autre` (`kml.ts:344`).
- **Une photo de point n'a nulle part où aller** : aucune colonne de photo dans `points_collecte`,
  aucun usage de fichier pour un relevé (`083_logos_communes.sql:31-34`), et la même photo
  envoyée deux fois fait deux fichiers (`041`, empreinte non unique).
- **`releve_terrain` n'existe pas** : `points_collecte.source` n'admet que `import_kml`, `saisie`,
  `suggestion_citoyen` (`042_points_suggeres.sql:91-93`). `traces_engins.provenance` n'admet que
  `gps_fournisseur` et la table n'a pas de circuit (`085_connecteur_gps.sql:127-143`).
- **Le jeton dure 8 h** et ne se renouvelle pas (`backend/src/config.ts:33`) ; au premier 401, le
  client referme la session (`web/src/lib/api.ts:48-58`). Un compte désactivé reste utilisable
  jusqu'à l'expiration de son jeton (`is_active` lu à la connexion seulement,
  `auth.routes.ts:66`, `middleware/auth.ts:31-45`).
- **`GET /circuits` renvoie le nom du chauffeur** (`circuits.routes.ts:36-43`) : le mettre en
  cache sur un téléphone chargerait des noms d'agents.
- **Le journal d'audit enregistre la ligne entière d'un point**, position comprise
  (`047`, déclencheur `trg_audit_points_collecte`) ; pour les véhicules, la position en est exclue
  (`014_journal_audit.sql:180-186`). Sous un compte nominatif, des points relevés à la chaîne
  feraient du journal une trace horodatée d'une personne.

### 1.3 Ce qui existe et sert

- Un seul lecteur de fichiers, `lireKml()`, qui découpe un relevé en voyages par les repères
  `debut_collecte` / `fin_collecte` (`kml.ts:598-634`) ; les repères sont des **types de points**
  de la nomenclature (`028:135-145`).
- La proposition puis l'adoption, déjà pratiquées pour les points suggérés par les habitants
  (`042_points_suggeres.sql`, `pointsSuggeres.routes.ts:149`, `:225`) et la mesure d'un doublon
  probable (`app.point_voisin`, `042:110-127`).
- L'écriture par une seule fonction avec `ON CONFLICT DO NOTHING` et la position gardée non
  rattachée avec son motif, du connecteur GPS (`085:154-166`, `085:260-330`).
- La photo par `<input capture="environment">` (`ConstatDuJour.tsx:216`) et le retrait des EXIF au
  dépôt, la position rendue à l'appelant (`fichiers.routes.ts:163-165`).

---

## 2. Les quatre décisions

Chacune a été instruite (options, coûts, risques, contre-argument) ; les instructions sont résumées
ici. **Les quatre sont signées par Nacer le 02/11/2026.** F-1, F-3 et F-4 suivent la recommandation ;
F-2 retient le chef d'équipe nommé (option D) plutôt que l'appareil d'engin (option C).

### Décision F-1 — La forme

| Option | Ce qu'elle permet | Ce qu'elle coûte | Risque principal |
|---|---|---|---|
| A. PWA seule, trace comprise (écran tenu allumé) | Un seul code, aucun magasin | Peu | **La trace s'arrête écran éteint, sur Android comme sur iOS, sans standard en vue** (WebKit 193946 fermé « LATER » en 2025 ; W3C geolocation-api #74). Une trace trouée se lirait comme un circuit non fait : du faux qui ressemble à du vrai (règle 1.1). |
| **B. PWA pour la saisie, trace par une application tierce admise ou par le boîtier 17.4** | Points, constats, compteurs, pleins hors ligne sur les deux plateformes ; aucune position prise par SIIPI sur un téléphone | La file d'envoi (commune à toutes les options), et la correction de E4 et E5 pour que la trace importée soit **datée, rattachée à un engin et à un circuit, à part de l'itinéraire prévu** | La fragilité 3 demeure pour la trace seulement ; une application tierce peut porter publicité et traceurs (My Track en a trois selon Exodus) : la liste admise les écarte |
| C. Enveloppe Capacitor autour de la PWA, Android seulement, diffusée par MDM | Trace en arrière-plan (service de premier plan), envoi automatique | Projet Gradle, clé de signature à garder, MDM ou Play Store et déclaration du service de localisation, inscription de la FNCT comme développeur vérifiée (annoncée pour 2027) | La notification permanente « position utilisée » se lit comme un suivi de la personne : tenable seulement sur un téléphone **affecté à l'engin** (décision F-2) |
| D. Application native (Flutter) | Conformité au TDR, iOS et Android | Une seconde base de code complète, bilingue et RTL, et des formulaires en double (contraire à `verifier-ajout.mjs`) | N'apporte rien que C n'apporte, pour bien plus cher |

**Recommandation : B**, avec C en réserve sur un critère mesuré pendant la recette (la part des
sorties qui ont une trace reste sous le seuil fixé par la FNCT, et la commune a des téléphones
Android de service affectés aux engins). Une seule forme pour l'agent et pour le citoyen (Jalon 9) :
la PWA, avec une entrée et un manifeste propres au terrain.

*Correction au dossier de la feuille de route :* `DECISIONS_2026-10-16.md` ne tranche pas la forme de
l'application de l'agent. Elle dit « attendre » pour l'espace citoyen et « pas d'application native
par commune ». F-1 se tranche donc avec le Jalon 9, comme la feuille de route le demande.

> **Décidé le 02/11/2026 (Nacer) :** l'application de terrain est une PWA, installée sans magasin,
> avec une entrée distincte de l'espace citoyen. **La trace d'un véhicule ne vient jamais du
> navigateur** : pendant la transition, elle vient du fichier d'une application tierce admise,
> importé, daté et rattaché à un engin et à un circuit, sans jamais remplacer l'itinéraire prévu ; à
> terme, du boîtier 17.4. Aucune enveloppe ni application native n'est construite. La question se
> rouvre si, pendant la recette, la part des sorties qui ont une trace reste sous le seuil fixé par
> la FNCT.

### Décision F-2 — Qui écrit depuis le terrain

Constats préalables :
- **« Le TDR l'avait supprimé » n'a pas de source dans le dépôt.** La seule trace est la migration
  `010_realign_rbac_kpi_pilots_cdc.sql:21-30`, qui reclasse l'ancien `field_agent` en
  `admin_commune` pour s'aligner sur la matrice à quatre rôles **du CDC**. Ouvrir un rôle serait un
  écart à cette matrice, à motiver par écrit.
- **En régie, personne d'autre que la FNCT ne peut déclarer un passage** : la politique
  `declarations_insert` n'admet que la FNCT ou le prestataire sur ses circuits
  (`020_prestataires_passages_incidents.sql:252-258`). Dar Chaâbane et Djerba sont chargées en
  régie : leur confrontation déclaration / constat ne produit rien aujourd'hui.

| Option | Pour | Contre |
|---|---|---|
| A. Le compte du directeur sur le téléphone de terrain | Rien à coder | Droits complets dans une cabine, jeton non révocable, personnel nominatif lisible, faux auteur au journal. **À interdire.** |
| B. Un rôle nominatif « agent de terrain », un compte par agent | Chaque relevé a un auteur | Un 5ᵉ rôle à faire passer dans 270 politiques et 20 migrations qui emploient `is_authenticated` ; un courriel unique par agent (`002_users.sql:6`) ; **le journal d'audit devient un GPS nominatif** ; la ligne rouge 2 tient à une requête près |
| **C. Un appareil enrôlé, rattaché à un engin, sans compte de personne** | Identité machine, comme le boîtier 17.4 ; refusée par défaut par les 270 politiques ; formation quasi nulle ; révocable appareil par appareil | Une table d'appareils, un jeton d'appareil relu à chaque requête, des fonctions d'écriture étroites ; **un téléphone de service par engin** ; aucune vue ne doit joindre engin × heure × `carnets_de_bord.chauffeur_id` |
| D. Un chef d'équipe nommé qui propose, le directeur qui valide | Une pièce attribuable à un responsable ; tient la règle du balayage saisi par le chef d'équipe (`SPEC_v0.16.md:25-27`) | Un 5ᵉ rôle (moins de comptes) ; une proposition non validée n'alimente rien |

**Recommandation de l'instruction : C pour les faits du jour d'un engin, D seulement si le balayage
entre au périmètre, A interdite. Décision : D.** L'appareil écrit trace, début et fin de collecte, passage au centre,
carnet, plein sans bon et, en régie, la déclaration de passage. Il **propose** les points d'un
circuit, que la commune adopte. Il n'écrit **ni le constat de la commune** (sinon la commune se
contrôlerait elle-même), **ni un bon de carburant scellé** (un rejeu émettrait un second numéro,
`exploitation.routes.ts:204-221`). Ses écritures ne sont pas auditées ligne à ligne pour la position.

**Ce que la recommandation ne règle pas, et qui la ferait tomber.** Si les engins n'ont pas de
téléphone de service, les agents prendront le leur, et un jeton d'appareil sur un téléphone personnel
est une trace qui rentre à la maison. Dans ce cas, D sans aucune trace est plus honnête. Le texte de
la feuille de route (« l'agent est un rôle de la commune, pas un profil de suivi ») va dans le sens
de B ou D : **c'est à la FNCT de trancher.**

> **Décidé le 02/11/2026 (Nacer) :** SIIPI ouvre un rôle nominatif **`chef_equipe`**, un compte par
> chef d'équipe (pas un compte par agent), créé par le directeur de sa commune. Ce rôle **propose
> seulement** : ce qu'il saisit attend l'adoption de la commune, et n'alimente aucun indicateur avant
> elle. Il ne porte **aucune trace** : la trace d'un engin vient de l'application tierce admise ou du
> boîtier 17.4 (F-1). Il ne lit ni le personnel nominatif, ni les documents, ni les comptes, ni
> l'informel, ni la configuration GPS ; il n'émet aucun document scellé. Le compte d'un directeur ne va
> jamais sur un téléphone de terrain. `agent_nom` n'est jamais rempli par l'application. Aucun agrégat,
> aucune liste ni aucun export par chef d'équipe n'est produit (ligne rouge 2 : l'évaluation est
> collective). L'écart à la matrice à quatre rôles du CDC est motivé par cette décision.

**Ce que la décision emporte.**
- **Le coût du 5ᵉ rôle**, assumé : la contrainte `users_role_check` (`010:35-40`), `UserRole`
  (`middleware/auth.ts:7`), `ROLES_COMMUNAUX` et l'énumération des comptes (`comptes.routes.ts:103`) ;
  des politiques **INSERT seulement** sur les tables de proposition, sur le modèle de
  `points_suggeres_insert` (`042:154-164`) ; la relecture des politiques qui emploient
  `is_authenticated` et des prédicats négatifs (`093:116`, `093:199`), pour que le nouveau rôle n'y
  lise rien ; une campagne qui commence par les refus.
- **La révocation relue à chaque requête** : un compte de chef d'équipe vit sur un téléphone de
  terrain, qui se perd. `is_active` ne se lit aujourd'hui qu'à la connexion (`auth.routes.ts:66`) ; le
  lot F1 le relit à chaque requête, pour tous les rôles.
- **Le journal d'audit ne devient pas un GPS nominatif** : la position et l'heure des éléments
  proposés ne sont pas journalisées ligne à ligne ; l'adoption, geste du directeur, l'est.
- **Un courriel par compte** (`002_users.sql:6`) : un par chef d'équipe, pas par agent.
- **Restent ouverts** : la déclaration de passage en régie (le chef d'équipe, côté exécution, la
  propose-t-il ?) et le constat du jour (le chef d'équipe est du côté de l'exécution, le constat est le
  contrôle de la commune : qui le saisit ?) — à trancher avec F2, devant le chef de dépôt.

### Décision F-3 — Le premier périmètre

| Option | Pour | Contre |
|---|---|---|
| **A. Le relevé de circuit** (remplace GPS Waypoints) : points à type fermé, photo, précision, heure observée datée, repères début, fin, centre de transfert et parc | Règle les trois fragilités sur l'objet qui les a toutes produites ; sert dès R1 (13 circuits sans point, `docs/recette/R1_DAR_CHAABANE.md:149`) ; aucun rôle nouveau : il est fait par le directeur ou l'équipe FNCT de démarrage, **sur leur propre appareil** | Un relevé se fait une fois par circuit : faible fréquence ; ne remplit aucun registre quotidien |
| B. A + le constat du jour hors ligne | Une donnée quotidienne | Impossible sans F-2 (ses utilisateurs réels n'ont pas de compte) et sans revoir l'écrasement du constat |
| C. La journée d'engin (carnet, pleins, début et fin, centre, trace) | Nourrit consommation, coût de collecte, voyages | Suppose F-2 sous forme C, et une trace fiable, donc rouvre F-1 ; lignes rouges serrées ; un lot énorme |
| D. La trace d'abord, le téléphone comme boîtier 17.4 | Fragilité 3 réglée pour la trace | Enveloppe native ; double le connecteur 17.4 qui ne touche aucun téléphone |

**Recommandation : A.** Ordre des lots suivants, chacun sous sa condition : **F2** le constat du jour
hors ligne (après F-2 et F-4) ; **F3** carnet de bord et pleins simples (après le jeton d'appareil ; les
bons scellés jamais hors ligne) ; **F4** la trace dans l'application et les événements datés, seulement
si la recette montre que ni le boîtier 17.4 ni l'application tierce ne suffisent.

**Contre-argument retenu comme critère.** F1 règle un problème qui se pose une fois par circuit ; ce
qui reste vide, ce sont les registres quotidiens. Si, dans les premières semaines de R1, les circuits
reçoivent leurs points par l'import existant sans difficulté mais que les constats du jour restent
vides, F2 passe avant F1. **C'est au chef de dépôt, devant `recette:etat` et le compteur « attendus /
saisis » de l'accueil, de confirmer l'ordre.**

> **Décidé le 02/11/2026 (Nacer) :** le premier lot du jalon F est le **relevé de circuit** :
> points à type fermé, photo, précision et heure observée datée en heure de Tunis, repères début,
> fin, centre de transfert et parc posés comme types de points, hors ligne, chaque relevé arrivant
> une seule fois comme une proposition que la commune adopte. Il est fait par un chef d'équipe
> (F-2), ou par le directeur ou l'équipe FNCT de démarrage sur leur propre appareil. Suivront F2
> (constat), F3 (carnet et pleins simples), F4 (trace), chacun sous sa condition. L'ordre F1/F2 est
> confirmé par le chef de dépôt.

### Décision F-4 — Le hors-ligne

| Option | Pour | Contre |
|---|---|---|
| A. En ligne seulement, brouillon local envoyé à la main | Presque rien à coder | Déplace la fragilité 3 de l'export à l'envoi ; rejeu = doublon ; date = jour du rejeu |
| **B. File d'envoi en ajout seulement, journal des envois côté serveur** | Rend le test de validation **vérifiable par une campagne** ; un conflit est gardé et montré ; marche en PWA comme dans une enveloppe | Une table, une route, un écran « en écart / non rattachés » ; IndexedDB non chiffrée |
| C. Synchronisation dans les deux sens | L'agent corrige hors ligne | Version par ligne, contrôle de concurrence partout, fusion automatique contraire à la règle 1.5 |
| D. Le relevé comme fichier, déposé par la voie d'import | Le fichier survit à tout, se transmet par n'importe quel canal | Garde les défauts de l'import (E3, date perdue) ; provenance `import_kml` |

**Recommandation : B**, avec en secours l'**export du journal** au même format, réimportable par une
route qui reprend la même clé d'envoi (le meilleur de D, sans ses défauts).

> **Décidé le 02/11/2026 (Nacer) :** le relevé de terrain fonctionne hors ligne en **ajout
> seulement**. L'appareil garde les circuits de la commune, figés et datés, sans nom d'agent, la
> nomenclature et les tuiles déjà vues. Chaque élément porte un identifiant créé sur l'appareil et
> son horodatage avec décalage. Le serveur tient un journal des envois : un envoi rejoué ne crée
> rien. Le terrain ne modifie jamais un objet existant ; un doublon probable est mesuré ; un relevé
> sur un circuit retiré est gardé et montré, jamais jeté. La carte hors ligne garantie et la
> synchronisation dans les deux sens sont hors du premier périmètre.

---

## 3. Ce que fait F1

### 3.1 Le relevé, objet daté qui attend son adoption

- Un **relevé** est fait par un **chef d'équipe** (rôle `chef_equipe`, F-2), par le directeur ou par
  l'équipe FNCT de démarrage. Il porte : commune, circuit, date d'observation, engin facultatif, compte
  qui l'a fait (lu par la commune pour adopter, jamais agrégé),
  identifiant tiré par l'appareil (unique en base), état (`recu`, `adopte`, `ecarte` avec motif,
  `non_rattache` avec motif). **Aucun nom d'agent.**
- Ses **points** vivent dans une table d'attente, pas dans `points_collecte` : une ligne non adoptée
  y serait comptée tout de suite (inventaire des points noirs `089_indicateurs_guide.sql:164-169`,
  bibliothèque `084:122-125`, complétude `070:146`) et heurterait l'index unique
  `(circuit_id, voyage, ordre)` (`028:151-152`).
- Chaque point porte : type de la nomenclature, **obligatoire, sans valeur par défaut** ; précision
  (avis au-delà de 15 m, comme à l'import) ; **horodatage avec décalage** (`timestamptz`) ; observation
  libre ; photo facultative. L'état d'un point (« cassé », « déborde ») est un champ fermé séparé du
  type, si le chef de dépôt le confirme.
- **La commune adopte** : les points en place de source `releve_terrain` ou `import_kml` du circuit
  sont supprimés logiquement, ceux du relevé entrent dans `points_collecte` avec
  `source='releve_terrain'`, la date et l'heure observées. Le relevé reste gardé. Deux relevés du même
  circuit restent deux relevés : l'écart est montré, pas fusionné.
- **Le découpage en voyages est une seule fonction**, partagée par l'import et le relevé
  (`kml.ts:598-634` en est la source) : sans cela, l'égalité du test de validation ne tiendrait pas.
- La **date métier** d'un point relevé est sa date d'observation, jamais `created_at` : un relevé
  envoyé le mois suivant ne tombe pas dans le mauvais mois.
- `points_collecte` gagne l'horodatage observé daté ; l'import le remplit quand le fichier porte la
  date (Waypoints, GPX), au lieu de la jeter.

### 3.2 L'envoi

- L'appareil tient un **journal IndexedDB** : un élément par relevé, son identifiant, ses points, ses
  photos en `Blob`, son état. L'écran dit « en attente d'envoi : N », **jamais « envoyé » avant
  l'accusé de réception**. `navigator.storage.persist()` est demandé au premier lancement et son
  résultat affiché.
- Un relevé part **entier**, en une transaction, par une route dédiée. Rejoué, il rend le premier
  résultat (journal `envois_terrain`, clé client unique). Les photos partent ensuite, chacune sous sa
  propre clé ; un relevé reçu sans toutes ses photos est dit « photos en attente », pas « complet ».
- La date et l'heure viennent **toujours de l'appareil**, jamais de `CURRENT_DATE`. Le serveur mesure
  l'écart entre l'horloge de l'appareil à l'envoi et la sienne ; au-delà d'un seuil, c'est un **avis**,
  jamais une correction.
- **Le journal ne dépend pas de la session.** Un 401 ne vide pas la file : elle attend une nouvelle
  connexion. Une déconnexion avec des éléments en attente le dit avant de purger quoi que ce soit.
- Déclencheur : Background Sync sur Android ; à l'ouverture, à l'événement `online` ou par « Envoyer
  maintenant » sur iOS.
- Secours : le journal s'exporte en fichier, réimportable par la même route avec les mêmes clés.

### 3.3 Les conflits

| Cas | Ce que fait SIIPI |
|---|---|
| Le même relevé envoyé deux fois | Rien de nouveau : le premier résultat est rendu |
| Le même point relevé deux fois (deux relevés) | Deux relevés gardés ; le doublon probable est **mesuré** (`app.point_voisin`) et montré dans « À vérifier », avec son modèle arabe (règle v0.15.67) |
| Un circuit retiré pendant que l'appareil était hors ligne | Relevé gardé, `non_rattache`, avec son motif |
| Un circuit modifié depuis le chargement | Avis « relevé fait sur l'état du <date> » ; la commune décide à l'adoption |
| Un import de fichier après une adoption | L'import ne supprime plus que des points `import_kml` (correction de E3) |

### 3.4 Ce que l'appareil garde

- Les circuits de la commune et leurs points, par une **route de lecture propre au terrain**, sans
  nom de chauffeur ni équipe, rangés dans IndexedDB et non dans le cache HTTP, marqués « état au
  <horodatage> ».
- La nomenclature fermée des types.
- Les tuiles déjà vues, dans un cache borné. **La carte hors ligne garantie n'est pas dans F1** :
  poser un point demande la position et la liste, pas le fond de carte. Une carte garantie
  demanderait des tuiles servies par la FNCT (la politique d'usage d'OpenStreetMap interdit le
  préchargement en masse) ; les adresses de tuiles ne vivent que dans `FondsDeCarte.tsx`.

### 3.5 L'application dans le front

- Une entrée `/terrain` avec son manifeste (`id`, `start_url`, `scope` propres), sur la même origine
  et le même service worker que le portail et l'espace citoyen.
- Les formulaires de création restent uniques (`verifier-ajout.mjs`) : la file d'envoi appelle une
  route nouvelle, déclarée au registre `web/src/composants/ajout/appels-creation.json`.
- FR / AR, RTL, téléphone d'abord ; chaque chaîne dans les deux fichiers de langues.

### 3.6 Données personnelles

- Le chef d'équipe est la seule personne nommée du jalon, et seulement comme auteur d'une
  proposition : aucun compte, aucune liste ni aucun export par chef d'équipe.
- Aucun nom d'agent n'est saisi, chargé ou envoyé. Un nom libre d'arrêt peut porter un nom tapé par
  erreur (constaté à Djerba) : la saisie propose le type, l'observation reste libre mais bornée.
- La position et l'heure des points relevés ne sont pas journalisées ligne à ligne au journal d'audit ;
  l'**adoption** (un geste du directeur) l'est.
- Les éléments reçus sont purgés de l'appareil après accusé de réception ; une durée de garde des
  éléments non envoyés est fixée avec la DSI (appareil perdu).
- La géolocalisation d'engins conduits par des agents identifiables relève peut-être d'une
  déclaration à l'INPDP au titre de la **loi organique n° 2004-63** : à confirmer par un juriste de la
  FNCT avant F3 et F4. F1 ne pose que des lieux, pas une trace.

---

## 4. Le test de validation, réécrit

Le test de la feuille de route ne peut pas passer tel qu'il est écrit : un fichier My Tracks ne
produit **aucun** point (`kml.ts:493`), et un point sans type est accepté par l'import
(`kml.ts:344`) alors qu'il serait refusé par l'application. Il devient :

1. **Un relevé fait hors ligne arrive complet, une seule fois**, avec son heure de Tunis et sa
   provenance `releve_terrain` : la campagne envoie deux fois le même relevé, coupe une transaction au
   milieu, puis compte les lignes.
2. **Un point sans type de la nomenclature est refusé** à la saisie et par la route, avec un message
   qui dit quoi faire.
3. **Aucune trace ni aucun point relevé n'est rattaché à une personne** : ni colonne, ni vue, ni ligne
   du journal d'audit ne joint un relevé à un nom.
4. **Un fichier Waypoints (ou un GPX), dont chaque point est typé, et le même relevé saisi dans
   l'application donnent, après adoption, les mêmes lignes de `points_collecte`, la provenance
   exceptée.** Les valeurs attendues viennent d'un **témoin indépendant**
   (`releve_terrain_attendus.py`) qui ne lit que le fichier et la méthode de découpage.
5. **Une trace importée ne remplace jamais l'itinéraire prévu** (correction de E4, dès que F-1 est
   signée sous la forme B).

---

## 5. Découpage en lots

| Lot | Contenu | Condition |
|---|---|---|
| **F0** | Réécriture du service worker (E1, E2) : version liée au build ; `/api/*` jamais servi depuis le cache, sauf la liste blanche citoyenne en réseau d'abord ; `reponse.ok` contrôlé ; purge des caches à la déconnexion ; une campagne qui charge le **vrai** `sw.js` (aujourd'hui remplacé par un factice dans `proxy-https.sh:49`). Et la correction de E3 : l'import ne supprime plus que des points `import_kml` | **Aucune** : ne dépend d'aucune décision, et touche l'espace citoyen et le portail dès la première instance de production |
| **F1** | Le rôle `chef_equipe` en proposition seule (création par le directeur, politiques INSERT seulement, campagne des refus), la révocation relue à chaque requête, et le relevé de circuit (§ 3) | Décisions signées le 02/11/2026 ; F0 livré |
| **F1b** | La trace importée datée, rattachée à un engin et à un circuit, à part de l'itinéraire prévu (E4) ; le producteur du fichier lu et gardé (E5) ; la liste des applications tierces admises | F-1 signée sous la forme B |
| **F2** | Le constat du jour hors ligne ; une double saisie gardée et montrée, au lieu de l'écrasement | F-2 et F-4 ; ordre confirmé par le chef de dépôt |
| **F3** | Carnet de bord et pleins simples, proposés par le chef d'équipe et adoptés par la commune ; jamais un bon scellé hors ligne | Ordre confirmé par le chef de dépôt |
| **F4** | La trace par l'application, les événements datés | Seulement si la recette montre que 17.4 et l'application tierce ne suffisent ; rouvre F-1 |

---

## 6. Questions qui ne se tranchent qu'avec une personne

| Qui | Question |
|---|---|
| **Nacer / FNCT** | Le seuil de réouverture de F-1 ; la liste des applications tierces admises pour la trace (les quatre décisions sont signées le 02/11/2026) |
| **Chef de dépôt** | Combien de chefs d'équipe, et ont-ils un téléphone (de service ou personnel) ? Y a-t-il du réseau au dépôt ? Ordre F1 / F2. Qui saisit le constat du jour et la déclaration de passage en régie. Les états d'un point (« cassé », « vide »). Le sort de `autre` à la saisie |
| **Prestataire réel** | Qui déclare le passage chez lui ; ses engins sont-ils dans `vehicules` de la commune |
| **Juriste de la FNCT** | Déclaration INPDP pour la trace d'engins conduits par des agents identifiables (loi 2004-63), et information des agents |
| **DSI** | Le parc de téléphones (Android, iOS ; de service ou personnels) ; un MDM ; des tuiles hébergées par la FNCT pour le hors-ligne ; la durée de garde des éléments non envoyés |

---

## 7. Hors du jalon F, signalé

- **`agent_nom`** (`020:170-174`), prévu « tant que les chauffeurs n'ont pas de compte », n'est envoyé
  par aucun écran : son retrait par une migration nouvelle est à décider.

---

## 8. Amendements du 2 novembre 2026 (Nacer)

Issus d'une revue avec Nacer inspirée des outils de collecte du marché (ArcGIS Field Maps et QuickCapture, KoboToolbox, OsmAnd). Ils précisent F1 et ouvrent trois lots. **Les décisions F-1 à F-4 ne changent pas** ; en cas de doute, elles priment.

### 8.1 Décidé

| # | Décision |
|---|---|
| **A-1 Photo** | **Facultative par défaut.** Dans son profil de collecte, la commune peut la rendre obligatoire pour certains types qui entraînent une dépense ou un litige (bac cassé, dépôt sauvage facturé). SIIPI n'impose aucune photo à toutes les communes. |
| **A-2 Faire évoluer un point** | Le terrain **ne modifie jamais** un point existant (F-4). Il **ajoute un constat daté** sur ce point (« cassé », « à laver », « débordement », puis « réparé », « lavé »). L'état affiché d'un point est son **dernier constat adopté** ; l'historique reste entier. Déplacer ou retirer un point reste une proposition que la commune adopte. |
| **A-3 Lien avec les actions** | Un constat qui appelle une intervention (cassé, à laver) devient une **proposition d'action dans « À vérifier »**. La commune la planifie d'un clic, dans les actions planifiées existantes (`actions_planifiees`, `actions_points`) — ce geste vaut adoption du constat — ou l'écarte avec un motif. Une fois l'action faite, le chef d'équipe pointe « fait » sur le terrain ; le point redevient conforme. |
| **A-4 Porte-à-porte** | Mode **« début / fin de tronçon »** : deux clics déclarent explicitement le tronçon desservi ; le segment est pris **sur l'itinéraire prévu** entre les deux repères projetés, sans trace GPS continue (F-1). Entre les deux, l'agent ne signale que des **exceptions** (ruelle bloquée, dépôt sauvage, encombrants). **Aucun service n'est réputé fait sans déclaration** (règle 1.1) : sans les deux repères, le tronçon est « non déclaré », pas « fait ». Sans itinéraire prévu, les repères sont gardés et le segment est « non calculable ». |
| **A-5 Saisie automatique** | Remplis seuls, sans geste de l'agent : date et heure observées (`timestamptz`, horloge de l'appareil), coordonnées, précision, identifiants du relevé et du point (tirés sur l'appareil), commune, circuit choisi au départ, version de la nomenclature, état « en attente d'envoi », écart d'horloge mesuré à l'envoi (avis, jamais correction). **Le secteur** est calculé à l'adoption à partir du découpage de la commune. |
| **A-6 Pré-remplis, modifiables** | Le **dernier type** est **mis en avant, jamais présélectionné** : l'agent tape toujours le bouton. Les **attributs** (volume, matériau) peuvent reprendre ceux du point précédent, affichés comme pré-remplis. La photo obligatoire ou non découle du type (A-1). Alerte d'éloignement (> 200 m du circuit) et alerte de précision (> 15 m) : l'agent confirme ou repositionne, rien n'est corrigé seul. |
| **A-7 Jamais remplis** | Nom d'agent ou de chauffeur ; type par défaut ; position « aimantée » au circuit (l'aimantation est **visuelle seulement**, la coordonnée brute reste en base) ; heure du serveur à la place de l'heure observée ; montant ou coût ; toute correction silencieuse ; adoption d'un point par le terrain. |
| **A-8 L'auteur** | Le compte qui a fait le relevé est porté **une fois par relevé**, jamais point par point ; aucune vue, aucun export ne rapproche un compte des positions et des heures de ses points (ligne rouge 2, décision F-2). |

### 8.2 Retenu, avec ses ajustements

- **Profils de collecte** : définis par la commune (par exemple « Inventaire des bacs », « Points noirs ») ; ils filtrent les boutons affichés. Un profil fixe aussi les types dont la photo est obligatoire (A-1).
- **Saisie « coup de poing »** : une grille de gros boutons ; un appui pose le type, la position, l'heure et la précision en une fois. Chaque type de la nomenclature peut porter **une image fournie par la commune** (la photo de son propre bac), avec une icône par défaut. Libellé toujours visible sous l'image, en français et en arabe.
- **Changement de régime** : passer en porte-à-porte ou en apport volontaire change la grille affichée (exceptions en porte-à-porte ; bacs et débordements en apport volontaire).
- **Qualité spatiale** : indicateur de précision vert / orange / rouge ; alerte d'éloignement ; aimantation visuelle seulement (A-7).
- **États d'envoi sur la carte** : en attente (gris, pointillé), reçu (bleu plein), échec (rouge, avec la raison et « réessayer »). Jamais « envoyé » avant l'accusé de réception (§ 3.2).
- **Doublon probable hors ligne** : à partir des points et constats du circuit en cache, l'application signale « un bac cassé a déjà été signalé ici le … » et propose d'**ajouter un constat sur le point existant** plutôt que d'en créer un nouveau. L'agent décide ; le doublon reste mesuré côté serveur (§ 3.3).
- **Dictée** : **le micro du clavier du téléphone**, pas l'API `SpeechRecognition` du navigateur (qui envoie le son à un service extérieur, ne marche pas hors ligne et reconnaît mal le dialecte). Rien à coder.
- **Carte hors ligne sur l'emprise du circuit** (couloir autour du tracé) : **lot conditionnel** — la politique d'OpenStreetMap interdit le préchargement en masse ; il faut des tuiles servies par la FNCT, donc la réponse de la DSI (§ 3.4 inchangé pour F1).
- **Temps et coût par régime** : le **temps** passé en porte-à-porte et en apport volontaire est **mesuré** (heures des repères). Le **tonnage** ne l'est pas par régime (une pesée couvre un voyage) : un coût à la tonne par régime est une **répartition**, affichée comme telle, jamais comme une mesure.

### 8.3 Effet sur le découpage en lots

| Lot | Contenu | Condition |
|---|---|---|
| **F1** (complété) | § 3, plus A-1, A-5 à A-8, profils de collecte, grille à images, qualité spatiale, états d'envoi, doublon hors ligne | Inchangée |
| **F1c** | Constats sur un point existant (A-2), proposition d'action et lien avec les actions planifiées, « fait » pointé sur le terrain (A-3) | F1 livré |
| **F1d** | Porte-à-porte par tronçon (A-4), changement de régime, temps par régime | F1 livré ; un itinéraire prévu sur les circuits concernés |
| **F1e** | Carte hors ligne sur l'emprise du circuit | Tuiles servies par la FNCT (réponse de la DSI) |

### 8.4 Ouvert, avec valeur par défaut

| Question | Défaut |
|---|---|
| Le « fait » pointé par un chef d'équipe sur une action : adopté un par un, ou confirmé en lot par la commune ? | Confirmé en lot par la commune, depuis l'action |
| Distance du doublon probable hors ligne | Celle de `app.point_voisin`, la même qu'au serveur |
| Les images des types : qui les dépose ? | La commune ; la FNCT fournit les icônes par défaut |

### 8.5 À explorer (choisi par Nacer le 2 novembre)

**Le mode « inventaire »** — lot **F1c** (il repose sur les constats de A-2).
- L'application liste les points connus du circuit (cache du matin) ; le chef d'équipe les passe en revue un par un : **conforme**, **cassé**, **absent**, ou **non vu**.
- Chaque réponse est un **constat** (A-2), jamais une modification du point.
- **« Non vu » n'est pas « conforme »** (règle 1.1) : un point non passé en revue reste sans constat, et l'avancement le dit (« 34 points passés en revue sur 120 »).
- Un point trouvé sur place mais absent de la liste s'ajoute comme un point nouveau, proposé à l'adoption.

**Les réclamations visibles sur la carte terrain** — lot **F1f**.
- Le chef d'équipe voit, sur son circuit, les réclamations ouvertes : **position, catégorie, date, statut** seulement. Ni nom, ni téléphone, ni adresse du citoyen ; la photo du citoyen n'est pas chargée sur l'appareil.
- Il peut ajouter un constat **« vérifié sur place »** (avec photo facultative, A-1). C'est une proposition : **la commune décide** du statut de la réclamation et de la réponse au citoyen. Aucune réponse automatique au citoyen (ligne rouge).
- La lecture des réclamations par un chef d'équipe est un **accès à une donnée citoyenne** : elle est journalisée comme les autres (journal des accès, 1 an).
- Test de sortie : la route du terrain ne rend aucun champ nominatif ; un chef d'équipe ne voit que les réclamations des circuits de sa commune ; « vérifié sur place » ne change aucun statut sans la commune.

| Lot | Contenu | Condition |
|---|---|---|
| **F1c** (complété) | Constats, lien avec les actions, mode inventaire | F1 livré |
| **F1f** | Réclamations sur la carte terrain, constat « vérifié sur place » | F1c livré |
