# Jalon F : analyse fonctionnelle de l'existant (niveaux 1 et 2)

**FNCT · 2 novembre 2026 · pièce de `../../SPEC_F_releve_terrain.md`**

Méthode : celle du jalon F (feuille de route). Niveau 1, la boîte noire : ce qu'un agent voit et ce
que l'application exporte. Niveau 2, le code publié : lire, comprendre, réimplémenter l'idée, jamais
copier sans décision écrite. Niveau 3, le code fermé : rien au-delà du niveau 1, aucune décompilation.
Un livrable par application : une fiche, puis une liste de ce que SIIPI doit faire mieux ou autrement,
jamais un plan de copie.

Cette analyse ne repose que sur le dépôt, la documentation des éditeurs et des fiches de magasins. Aucune application n'a été observée sur un appareil, donc les nombres de gestes ci-dessous sont **à mesurer** lors d'un essai de niveau 1. Aucun code n'a été décompilé ni copié.

## 0. Ce que le dépôt contient, et ce qui manque

- **Aucun fichier réel de relevé n'est dans le dépôt** : la recherche de fichiers `.kml`, `.gpx` et `.kmz` ne trouve rien. Les vrais fichiers sont dans un dossier externe désigné par `CHARGER_DJERBA.bat:9,43` et `backend/seed/djerba.ts:20-24`. Il n'a pas été parcouru pour cette analyse : les données de terrain réelles restent hors du dépôt public.
- **Les fichiers d'essai sont synthétiques et ne portent aucun en-tête `creator` ni `generator`** : `backend/tests/module2.sh:200-216` et `backend/tests/releves-terrain.sh:76-100`. Le seul `creator` du dépôt est celui que SIIPI écrit lui-même (`backend/src/services/fichierCircuit.ts:119`).
- **Les trois familles de fichiers lues par SIIPI**, décrites dans `backend/src/services/kml.ts:9-24` :
  - **A : Waypoints.** Un dossier `Waypoints`, une heure par point (`TimeStamp/when`), et dans `ExtendedData` les champs `accuracy`, `provider` et `tags`.
  - **B : « MY TRACKS (Daniel Qin) ».** Une trace `gx:Track` encadrée par des repères « Début » et « Fin », avec des statistiques dans la description.
  - **C : KMZ dessiné dans Google Earth.**
  - S'y ajoutent les GPX de Geo Tracker à Djerba (`djerba.ts:20-21`).

## 1. Identification de « GPS Waypoints »

- **Preuve formelle : impossible depuis le dépôt**, faute d'en-tête (voir § 0).
- **Indices concordants :**
  - les fichiers s'appellent `GPSWpts-…-all_wpts.kml` (`djerba.ts:22,288`) ;
  - la structure `Folder Waypoints` + `accuracy`/`provider`/`tags` (`kml.ts:9-15`) ;
  - ces fonctions sont documentées par **Bluecover Technologies** pour l'application « GPS Waypoints » (paquet `pt.bluecover.gpsegnos`) : étiquettes, photos, précision, export KML/GPX/CSV.
- **Attribution probable, non prouvée.** Pour la confirmer, il faut ouvrir un vrai fichier `GPSWpts…kml` et lire l'en-tête du `<Document>`. C'est à faire sur un fichier réel, hors du dépôt public.
- **Le piège de l'heure locale suivie de `Z`** est constaté dans les données, sur un écart de 3 643 s (`kml.ts:27-36`) et sur les 3 430 arrêts de Djerba sur 3 497 (`djerba.ts:33-38`). **Aucune documentation de l'éditeur ne le mentionne** : ce comportement n'est établi que par nos fichiers.

## 2. Fiches par application

### 2.1 My Tracks

**Attention : le dépôt ne parle pas de l'application de Google.** `kml.ts:18` cite **Daniel Qin**, dont l'application s'appelle « My Track » (paquet `com.zihua.android.mytracks`).

| | Google My Tracks (original) | OpenTracks (successeur libre) | My Track (Daniel Qin), celle qui est utilisée |
|---|---|---|---|
| Éditeur | Google, abandonnée en 2016 | Communauté OpenTracksApp (Codeberg), v4.29.0 du 28/09/2026 | Daniel Qin |
| Licence du code | Apache 2.0 (source secondaire ; le dépôt `github.com/google/mytracks` répond 404) | **Apache 2.0, vérifiée dans le fichier LICENSE** | Fermée (niveau 3), avec publicité, abonnement et 3 traceurs selon Exodus |
| Données | Sans objet | Aucun accès réseau, rien n'est envoyé | Sauvegarde soumise à abonnement selon des avis |
| Exports | Sans objet | GPX 1.1, KML 2.3, KMZ avec photos (lu dans le code, niveau 2) | GPX, KML, KMZ, et marqueurs en KML (fiches de magasin) |
| Gestes | Sans objet | Démarrer, poser un marqueur avec photo et catégorie : à mesurer | À mesurer |
| Hors ligne et batterie | Sans objet | Permission de localisation en arrière-plan, rien sur la batterie | Non documenté |

**Ce que montre le code d'OpenTracks (niveau 2, sans copie) :**
- Le KML utilise l'espace de noms 2.3, avec une balise `<Track>` sans préfixe `gx:`.
- Les marqueurs sont des `Placemark` placés dans un dossier, avec heure et type. Avec photo, ils deviennent des `PhotoOverlay`.
- La précision horizontale est écrite point par point dans `SchemaData`.
- Les heures portent le **décalage du fuseau de la trace**, pas un `Z` imposé.

**Ce que SIIPI fait de ces fichiers :**
- Tout fichier qui contient `<Track` est classé en famille B, et la fonction rend `points: []` (`kml.ts:468-492`). Les marqueurs d'un KML OpenTracks seraient donc **perdus**, et l'avertissement affiché, selon lequel aucun arrêt n'est identifié, serait faux.
- Les statistiques ne sont lues que si la description contient « Total distance », ce qui suppose le format de Daniel Qin (`kml.ts:482`).

**Ce qui gêne un agent de propreté :** aucune liste fermée de types, la trace n'est attachée à aucun véhicule, et l'export reste manuel. Pour My Track, s'ajoutent la publicité et les fonctions payantes.

### 2.2 GPS Waypoints (Bluecover, attribution probable)

- **Licence et accès :**
  - code propriétaire, freemium ;
  - la version Premium apporte le récepteur GNSS externe, le journal NMEA, les raccourcis clavier pour créer un point, et la sauvegarde.
- **Saisie d'un point :**
  - point avec étiquettes libres (« tagging model »), photo, précision affichée ;
  - « Auto-Path » enregistre des points à intervalle fixe ;
  - nombre de gestes à mesurer. La création par raccourci étant réservée au Premium, la version gratuite passe par l'écran.
- **Export :**
  - formats KML, GPX, CSV ;
  - constaté dans nos fichiers : `accuracy`, `provider`, `tags` en `ExtendedData`, et l'heure locale suivie de `Z` (`kml.ts:9-15,27-36`).
- **Hors ligne :** la saisie fonctionne sans réseau, mais les fonds de carte ne sont **pas** disponibles hors ligne selon l'éditeur.
- **Ce qui gêne :**
  - **vocabulaire libre** : SIIPI doit maintenir un dictionnaire et des motifs pour le déchiffrer (`kml.ts:262-302`) ;
  - le mot « autre » est rendu pour toute étiquette inconnue (`kml.ts:337-345`) ;
  - le fichier ne dit pas à quelle sortie appartient un arrêt, ce qui oblige à le déduire par l'heure (`djerba.ts:26-31`) ;
  - le nom du chauffeur est parfois tapé dans le nom de l'arrêt, et SIIPI doit le retirer (`djerba.ts:40-43`).

### 2.3 Geo Tracker (Ilya Bogdanovich)

- **Licence et accès :** propriétaire (fiche AlternativeTo), freemium avec achat unique. Le projet `darthroid/geotracker` sous MIT est une **autre** application, pour iOS.
- **Fonctions :**
  - trace GPS, points, export et import GPX/KML/KMZ ;
  - **arrêts détectés automatiquement**, exportés en `<wpt>` (« Stop for ~2 min ») : SIIPI les ignore volontairement (`djerba.ts:276-277`).
- **Heure :** les `trkpt` sont en **UTC véritable**, et SIIPI ajoute une heure (`djerba.ts:281`, `kml.ts:735-752`).
- **Hors ligne et batterie :**
  - l'enregistrement ne demande que le GPS ;
  - les tuiles déjà vues restent en cache un temps ;
  - l'éditeur annonce un mode économie et une journée d'autonomie (affirmation de l'éditeur, non vérifiée) ;
  - l'arrière-plan **exige un réglage propre à chaque appareil**.
- **Ce qui gêne :** aucune notion de type de point ni de véhicule, export manuel, réglage de l'arrière-plan à refaire téléphone par téléphone.

### 2.4 OsmAnd

- **Licence :** voir le § 4.
- **Enregistrer une trace :**
  - 1 toucher sur le widget, plus un dialogue s'il est activé ;
  - ou un appui long sur l'icône, ou une action rapide ;
  - une notification permanente : la fermer arrête l'enregistrement.
- **Réglages de la trace :**
  - intervalle de 5 s par défaut ;
  - filtres de déplacement minimal, de précision minimale et de vitesse ;
  - découpage automatique : nouveau segment après 6 min d'arrêt, nouvelle trace après 2 h, nouveau fichier à chaque changement de date.
- **Export :** GPX avec heure, vitesse, cap et HDOP (comme précision en mètres) ; les favoris par groupes partent en `Favorites.gpx`.
- **Batterie :** environ 6 %/h écran éteint d'après la documentation. Sur iOS, l'enregistrement peut être suspendu.
- **Suivi en direct :** envoi vers une URL, mais **les points non envoyés sont perdus** si l'application ou le téléphone redémarre.
- **Hors ligne :** cartes vectorielles téléchargeables, c'est sa force.
- **Dans le dépôt : aucun fichier OsmAnd n'a jamais été importé.**
- **Ce que SIIPI en lirait :** les champs `type`, `desc` et `cmt` sont lus (`kml.ts:772-774`), mais la précision est **toujours mise à null** (`kml.ts:807`). Le HDOP d'OsmAnd et la précision d'OpenTracks seraient donc perdus.

## 3. Ce que SIIPI doit faire mieux ou autrement

1. **Liste fermée à la saisie.** Le type de point vient de la nomenclature `points_collecte.type`, sans texte libre. L'état du point (« cassé », « déborde ») est séparé de sa nature, alors qu'il est aujourd'hui déduit par priorités (`kml.ts:319-328`).
2. **Heure non ambiguë.** Chaque relevé porte un horodatage absolu et son décalage, écrit par l'application. Il ne faut plus deviner le fuseau d'après la famille de fichier.
   - Constat à corriger dès maintenant : `heureLocale` s'applique à **tout** KML qui a des Placemark horodatés, quelle que soit l'application (`kml.ts:381-384,551,559`). Un KML en vrai UTC venant d'une autre application serait décalé d'une heure.
3. **Le producteur se lit, il ne se suppose pas.** Pendant la transition, l'import devrait lire et garder `creator`/`generator`, et refuser ou signaler un producteur inconnu. Il ne faut plus classer sur la seule présence de `<Track` (`kml.ts:468`).
4. **Traces et points dans un même relevé.** OpenTracks porte les deux dans un fichier, et SIIPI jette les points (`kml.ts:491`).
5. **Précision gardée pour tous les formats**, y compris GPX (`kml.ts:807`).
6. **Le relevé appartient à une sortie et à un véhicule dès sa création.** Plus de rattachement deviné par l'heure (`djerba.ts:26-31`), et aucun nom de chauffeur, jamais (`djerba.ts:40-43`).
7. **Début et fin de collecte sont des actions, pas des étiquettes.** Elles délimitent la partie utile du trajet, ce que SIIPI déduit aujourd'hui (`kml.ts:38-42`).
8. **File d'envoi durable**, qui survit au redémarrage et envoie une seule fois avec un identifiant d'envoi. C'est le contre-exemple du suivi en direct d'OsmAnd.
   - Aujourd'hui, le service worker refuse volontairement de mettre les écritures en cache (`web/public/sw.js:11-14`). Le hors-ligne en écriture est donc à concevoir entièrement.
9. **Réglage de l'arrière-plan guidé et vérifié par l'application**, au lieu d'une notice par modèle de téléphone comme chez Geo Tracker. C'est la décision 1 (PWA ou application native).
10. **Fonds de carte hors ligne limités au territoire de la commune**, puisque GPS Waypoints n'en a pas. La règle du dépôt tient : les tuiles ne vivent que dans `FondsDeCarte.tsx`.
11. **Arrêts détectés automatiquement : proposés, jamais enregistrés** comme points de collecte (`djerba.ts:276-277`).
12. **Ce qui existe déjà et peut servir :**
    - le suivi de position dans le navigateur côté prestataire (`web/src/composants/prestataire/MaTournee.tsx:46-60`) ;
    - la provenance de la position (`appareil`, `saisie`, `absente`) dans `backend/migrations/020_prestataires_passages_incidents.sql:168-169` ;
    - **une valeur de provenance pour les relevés de terrain manque** : `points_collecte.source` n'accepte aujourd'hui que `import_kml`, `saisie` et `suggestion_citoyen` (`backend/migrations/042_points_suggeres.sql:93`).
13. **Rôle d'agent de terrain.** Il a été supprimé par `backend/migrations/010_realign_rbac_kpi_pilots_cdc.sql:21-30`, et `backend/src/routes/trucks.routes.ts:422` confirme qu'il n'existe pas. C'est la décision 2, qui reste ouverte.

## 4. Registre des licences

| Composant | Licence vérifiée | Réutilisable ? | Condition |
|---|---|---|---|
| OpenTracks (code) | Apache 2.0 (LICENSE) | Oui, même du code | Garder les mentions de licence et le fichier NOTICE, signaler les modifications. Compatible avec toute licence de SIIPI. Une décision écrite reste requise par la règle du jalon F. |
| Google My Tracks | Apache 2.0 (source secondaire) | Archive introuvable | Mêmes conditions. Passer plutôt par OpenTracks. |
| OsmAnd (code) | **GPL-3.0 seule** (F-Droid, LICENSE) | **Idées seulement** | Intégrer ou dériver du code oblige à publier toute l'application dérivée sous GPLv3. Publier sur Google Play ou l'App Store une application qui utilise son code d'interface demande une **autorisation écrite** d'OsmAnd. |
| OsmAnd (illustrations, mises en page, icônes) | CC BY-NC-ND 4.0, une partie propriétaire | **Non** | Ni modification ni usage commercial. |
| OsmAnd (voix de synthèse) | Propriétaire | Non | — |
| Données OpenStreetMap | **ODbL** | Oui | Attribution « © contributeurs OpenStreetMap » ; une base dérivée diffusée se diffuse sous ODbL. |
| GPS Waypoints, Geo Tracker, My Track (Daniel Qin) | Propriétaires | **Niveau 1 seulement** | Formats et usage observables ; aucune décompilation, aucune ressource reprise. |
| Formats GPX 1.1 et KML 2.2/2.3 | Normes ouvertes (Topografix, OGC) | Oui | — |

## Sources

- [Codeberg : OpenTracks](https://codeberg.org/OpenTracksApp/OpenTracks) et [LICENSE](https://codeberg.org/OpenTracksApp/OpenTracks/raw/branch/main/LICENSE)
- Code d'export d'OpenTracks, lu au niveau 2 : [KMLTrackExporter](https://codeberg.org/OpenTracksApp/OpenTracks/raw/branch/main/src/main/java/de/dennisguse/opentracks/io/file/exporter/KMLTrackExporter.java) et [GPXTrackExporter](https://codeberg.org/OpenTracksApp/OpenTracks/raw/branch/main/src/main/java/de/dennisguse/opentracks/io/file/exporter/GPXTrackExporter.java)
- Histoire de MyTracks : [wikiwand](https://wikiwand.com/en/articles/MyTracks), [wiki OSM : OpenTracks](https://wiki.openstreetmap.org/wiki/OpenTracks)
- My Track (Daniel Qin) : [Exodus Privacy](https://reports.exodus-privacy.eu.org/en/reports/87235), [appgoblin](https://appgoblin.info/apps/com.zihua.android.mytracks), [android-stats](https://android-stats.com/d/com.zihua.android.mytracks), [apkcombo](https://apkcombo.com/my-track/com.zihua.android.mytracks/)
- GPS Waypoints : [Bluecover](https://www.bluecover.pt/gps-waypoints/), [fonctions](https://www.bluecover.pt/gps-waypoints/features/), [APKMirror](https://www.apkmirror.com/apk/bluecover-technologies/gps-waypoints/gps-waypoints-3-15-release/gps-waypoints-3-15-android-apk-download/), [appgoblin](https://appgoblin.info/apps/pt.bluecover.gpsegnos)
- Geo Tracker : [AlternativeTo](https://www.alternativeto.net/software/geo-tracker/about/), [APKMirror](https://www.apkmirror.com/apk/ilya-bogdanovich/geo-tracker-gps-tracker), [App Store](https://apps.apple.com/app/id1610586137), [AppBrain](https://www.appbrain.com/app/com.ilyabogdanovich.geotracker), [darthroid/geotracker](https://github.com/darthroid/geotracker)
- OsmAnd : [LICENSE](https://github.com/osmandapp/OsmAnd/blob/master/LICENSE), [F-Droid](https://f-droid.org/en/packages/net.osmand.plus/), [enregistrement de trajet](https://docs.osmand.net/docs/user/plugins/trip-recording), [favoris](https://download.osmand.net/docs/user/personal/favorites), [problèmes d'enregistrement](https://download.osmand.net/docs/user/troubleshooting/track-recording-issues)
- [OpenStreetMap : droits d'auteur (ODbL)](https://www.openstreetmap.org/copyright)