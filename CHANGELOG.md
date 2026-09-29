# Journal des versions — SIIPI

Ce journal suit l'avancement par **Jalon**, au sens de `FEUILLE_DE_ROUTE.md` § 4 :
un lot de fonctionnalités groupées par dépendance réelle, pas par rubrique du
cahier des charges. Chaque entrée renvoie aux identifiants du cahier des
charges (`B5.5.2`, `C3.1`, …) tels que suivis dans la feuille de route.

## [0.13.0] — 2026-09-29 — Données réelles de Djerba (Houmt Souk, Midoun, Ajim)

### Ajouté
- **Import des relevés de la mission GPS de la FNCT** (février-juin 2026) :
  `npm run seed:djerba`, ou `CHARGER_DJERBA.bat` en y glissant le dossier de
  la mission. 52 sorties à l'index, 43 tracés GPX, 3 497 arrêts relevés.
- **36 circuits** (Houmt Souk 11, Midoun 23, Ajim 2) avec leur tracé observé,
  leur arrondissement, leur engin et leur **campagne d'observation** mesurée
  sur la sortie de référence : parc → début de collecte, collecte pure,
  trajet jusqu'au pont-bascule, retour au parc (minutes et kilomètres),
  tonnage net.
- **2 855 points de collecte**, rattachés à leur sortie par l'heure (tous les
  arrêts trouvent leur sortie), avec les contenants comptés (conteneurs
  métalliques et plastique, demi-fûts, bacs) en champs libres, le relevé
  brut de l'agent et la date, et l'état en étiquettes de couleur (conteneur
  cassé, déchets hors conteneur, déchets verts, fumier, encombrants…).
- **12 engins** immatriculés (bennes tasseuses et basculantes).
- **Le vocabulaire des relevés de Djerba** dans le lecteur de relevés
  (`services/kml.ts`) : « 3 conteneur metallique », « demi-fût », « 240 L
  Plastique x2 », « hand picked »… sont reconnus, et le type le plus parlant
  l'emporte quel que soit l'ordre de saisie (un point noir équipé d'un
  conteneur reste un point noir). Profite aussi à l'import depuis l'écran.
- Nouvelle campagne `releves-terrain` (17/17).

### Corrigé
- **Carte d'un circuit** : elle s'ouvrait sur un champ vide, au zoom maximal,
  à côté du circuit — le cadrage se faisait avant que la carte connaisse sa
  taille. Elle se cadre désormais sur le tracé et les arrêts, et ne se
  recadre plus sous la main de l'utilisateur.

### Décisions à retenir
- **Les données brutes ne sont pas versionnées** : elles contiennent les noms
  des chauffeurs, et le dépôt est public. Le script les lit là où on les pose.
- **Aucun nom de personne n'entre en base** : ni chauffeur, ni nom d'arrêt où
  l'agent avait écrit le sien, ni nom d'une habitation privée. Aucun agent
  fictif non plus : il fausserait l'effectif, qui entre dans les indicateurs.
- **Écriture au nom du directeur de chaque commune**, sous RLS : le script ne
  s'accorde aucun privilège que le directeur n'a pas.
- **Pas de pesées par défaut** : la mission a pesé un échantillon de sorties,
  que les indicateurs liraient comme l'année entière (Midoun à 0,03 kg par
  habitant et par jour). Le tonnage reste dans la fiche de chaque circuit,
  daté ; `DJERBA_PESEES=1` pour créer les pesées malgré tout.
- **Aucun lieu (marché, cimetière, abattoir) créé** : aucun n'est situé dans
  le relevé, et un nom de circuit ne dit pas où est l'abattoir.
- **Un temps de collecte ne se mesure qu'entre les repères** « début
  collecte » et « fin collecte » : sans eux, il reste vide.

### Mise en service (29 septembre 2026)
- Données de Djerba chargées en production : 36 circuits, 2 855 points de
  collecte, 12 engins.
- Démonstration fictive des trois communes retirée de la production
  (suppression logique) : 2 circuits de test et leur contrôle, 3 engins,
  3 conteneurs, 3 secteurs, 1 réclamation. Le jeu d'essai des tests n'est pas
  modifié.
- Feuille de route : Jalon 9 (application mobile) en attente d'un marquage
  blanc multi-communes ; priorités suivantes, Jalon 10 (refonte graphique et
  expérience du portail web / PWA) puis Jalon 11 (GMAO étendue et dépôts
  municipaux).

## [0.12.0] — 2026-09-29 — Lot d'optimisation : les sources automatiques des KPI

### Ajouté
- **Onglet « Registres »** de l'espace communal : six registres tenus au fil de
  l'eau, qui font MESURER par la plateforme ce que la fiche d'évaluation
  faisait déclarer.
- **Lieux sur carte** (`poi`) : marchés, cimetières, abattoirs, écoles,
  centres de santé — créés, déplacés, désactivés sur la carte de la commune,
  secteur rattaché automatiquement. Un lieu hors de la commune est refusé.
- **Actions de type « Nettoyage »**, rattachées à un lieu ou à des points, et
  closes avec les **mètres linéaires réalisés**. Elles mesurent le balayage
  (M1-1, ml/jour face à l'objectif de la commune, réglable dans Paramètres),
  les marchés (M2-4), les cimetières (M2-3) et les abattoirs (M2-5) : nettoyages
  faits sur nettoyages échus.
- **Check-list de fin de poste** : « Benne bâchée avant transit » obligatoire,
  sans valeur par défaut ; le taux de oui mesure le bâchage (M1-9).
- **Carburant** (`fuel_logs`) : les pleins entrent dans le coût global à la
  tonne ; un kilométrage plus élevé relève le compteur de l'engin.
- **Dotation EPI** (M1-6 : agents de terrain dotés sur l'effectif de terrain),
  **journal des incidents du travail** (axe 5), **commerces et conventions de
  propreté** (M2-2 : commerces sous convention active sur commerces ciblés).
- **Moteur de fusion** : la mesure automatique d'abord, sinon la valeur
  déclarée dans la fiche, sinon « Non renseigné ». Chaque indicateur porte un
  badge « Source : mesuré » ou « Source : déclaré » ; la fiche signale une
  déclaration supplantée par une mesure. La fiche et sa validation par la FNCT
  restent inchangées.
- **Carte citoyenne** : les marchés et cimetières de la commune et leur état
  de propreté (`GET /citoyen/lieux`, public). Jamais un abattoir, ni un lieu
  d'une autre commune.
- Migration 051, 24 routes (`/poi`, `/registres/*`, `/citoyen/lieux`),
  nouvelle campagne `kpi-sources` (40/40) ; `kpi-5-axes` reste à 64/64.

### Décisions à retenir
- **Un registre vide n'est pas un zéro** : la mesure n'existe que si le
  registre est tenu dans l'année ; sinon la déclaration reste la source. Un
  journal d'incidents tenu sans accident dit « 0 accident » ; un journal vide
  ne dit rien.
- **Un lieu jamais nettoyé ni planifié est « non renseigné »**, pas « sale ».
- **Cimetières = M2-3, Digitalisation = M3-3** (lecture du Jalon 8 conservée).

## [0.11.0] — 2026-09-28 — Jalon 8 : KPI 5 axes, Concours national de propreté, préparation DMA

### Ajouté
- **Onglet « Indicateurs »** de l'espace communal : les 5 axes (indice sur 100
  et sa base), la note du Concours national de propreté (19 indicateurs, trois
  modules, sur 100), la préparation au tri à la source, la grille complète et
  son impression en PDF.
- **Fiche d'évaluation annuelle** : ce que SIIPI ne voit pas (balayage,
  bâchage, EPI, espaces verts, cimetières, marchés, abattoirs, conventions,
  participation, partenariats, carburant, redevances, formation, accidents,
  préparation DMA), déclaré par la commune et validé par la FNCT. Brouillon,
  soumise, validée ; une fiche validée est verrouillée jusqu'à ce que la FNCT
  la rouvre, motif à l'appui.
- **Mesures calculées** par la plateforme (`app.mesures_kpi`) : contrôles
  terrain, réclamations et délais, entretien, déchets verts et DDC, pesées,
  publications, usage des modules, effectifs, absentéisme, coût de
  maintenance, coût global à la tonne.
- **Reventilation ministérielle** : décharge contrôlée par l'ANGeD (M1-8 →
  M1-9), aucune expérience innovante (M1-10 → M1-3), pas d'abattoir (M2-5 sans
  objet, hors du dénominateur).
- **Vue nationale** (observatoire FNCT) : classement du Concours (officiel ou
  provisoire, export Excel/CSV), 5 axes, préparation au tri, alertes, réglages
  — par commune, gouvernorat, district FNCT ou national (`A3.1`).
- **Alertes nationales à seuils réglables** (`A3.3`) et alertes de la commune
  dans « À vérifier » (fiche de l'année, bâchage sous le seuil).
- **« Visualiser »** une commune depuis l'annuaire (`A2.3`) ; **« Mes
  indicateurs »** dans le dossier du prestataire (`B7.4`).
- **Réglages de la FNCT** : barème des 19 indicateurs (provisoire jusqu'à
  confirmation), seuils, état du décret DMA, districts FNCT.
- Migration 050, 16 routes `/kpi/*`, nouvelle campagne `kpi-5-axes` (64/64).

### Décisions à retenir
- **Une donnée manquante n'est pas un zéro** : ni en base, ni dans les
  moyennes, ni à l'écran ; toute note s'affiche avec sa base.
- **Le barème et les districts sont des données de la FNCT**, pas des
  hypothèses de la plateforme.
- **Le classement officiel ne retient que les fiches validées.**
- **La préparation DMA n'entre pas dans la note** tant que le décret n'est pas
  en vigueur.

## [0.10.0] — 2026-09-28 — Jalon 7 : paramètres et découpage validé

### Ajouté — lot 1, les paramètres (TDR §3.2.6)
- **Écran « Paramètres »**, ouvert à tous les rôles depuis l'en-tête : langue
  (enregistrée sur le compte), format de date (`B6.4` : jour/mois/année, ISO,
  mois en toutes lettres), unités (`B6.6` : t / kg, m³ / L, km² / ha),
  alertes « À vérifier » (`B6.2` : gravité minimale, domaines suivis), et
  changement de mot de passe à tout moment.
- **Un module de formatage unique** (`web/src/lib/formats.ts`), à l'heure de
  Tunis quel que soit le poste (`B6.3`), repris par dix-sept écrans qui
  formataient chacun à leur façon.
- **Seuils de la commune** (`B6.2`) : délai d'alerte des réclamations, préavis
  d'entretien par défaut, alerte des actions planifiées dépassées. Ils
  déclenchent de vraies alertes dans « À vérifier » (nouvelle fonction de
  contrôle `app.incoherences_seuils`).
- Migration 048, routes `GET/PUT /comptes/moi/preferences` et
  `GET/PUT /communes/{id}/parametres` ; préférences rendues par la connexion
  et par `/auth/me`. Nouvelle campagne `parametres` (27/27).

### Ajouté — lot 2, le découpage validé et versionné (TDR §3.2.8)
- **Onglet « Découpage » de la commune** : état en vigueur, proposition
  (retouche du périmètre, secteurs dessinés sur la carte ou importés en
  GeoJSON, note pour la FNCT), historique des versions (`C2.5`, `C2.6`).
- **File « Découpages à valider »** en tête de l'observatoire : comparaison
  carte avec l'état en vigueur, écarts (secteurs ajoutés, modifiés, retirés),
  avertissements (débordement du périmètre, chevauchements), validation ou
  refus motivé.
- **Retour à une version antérieure** : demandé par la commune (et validé par
  la FNCT) ou appliqué directement par la FNCT ; les secteurs reviennent sous
  leur identifiant, avec leurs rattachements.
- Migration 049, routes `/decoupage/*` (7). Nouvelle campagne
  `versions-decoupage` (43/43).

### Modifié
- **La commune ne modifie plus son découpage directement** : `POST /zones`,
  `DELETE /zones/{id}` et la modification du tracé, du nom ou du code d'un
  secteur lui répondent 403 et renvoient à la proposition. Les attributs de
  service (couleur, fréquence, population, prestataire, statut) restent
  modifiables. Les campagnes `citoyen` et `suppression` posent désormais leurs
  secteurs d'essai par la FNCT.
- Les corrections directes de la FNCT (périmètre, secteur) créent une version.

### Corrigé
- La phrase de synthèse du parc (« 16 engins sur 29 peuvent servir ») affichait
  sa clé de traduction : le pluriel n'était pas renseigné.

### Décisions à retenir
- **Deux niveaux de paramètres** : les préférences de chacun, sur son compte ;
  les règles de la commune, communes à l'équipe.
- **Un avis bloquant s'affiche toujours**, quelles que soient les préférences.
- **Les unités ne changent que l'affichage.**
- **Une version est un état complet**, réapplicable ; la première modification
  fige d'abord l'existant ; revenir en arrière crée une version nouvelle.

## [0.9.0] — 2026-09-28 — Jalon 6 : champs libres et planification d'actions

### Ajouté
- **Tableau des points** (`B3.4`), nouvel onglet « Points » de l'espace
  communal : tous les arrêts de la commune, tous circuits confondus, avec les
  colonnes que la commune ajoute elle-même — texte, nombre, oui/non, liste de
  choix, date, avec libellé arabe facultatif. Saisie à la case, ou par lot sur
  une sélection.
- **Étiquettes** (`B3.5`) : neuf couleurs, posées ou ôtées par lot, et un filtre
  par une ou plusieurs étiquettes (le point doit les porter toutes).
- **Actions planifiées** (`B3.5`) : une action (« campagne déchets verts »,
  date prévue, fin facultative, responsable) se planifie sur la sélection du
  tableau et se suit point par point — fait, par qui, quand ; « en retard »
  calculé ; terminer, annuler, reprendre.
- **Filtres** par étiquette, par valeur de colonne (égal, contient, renseigné,
  vide) et par action sur `GET /circuits/points` ; l'export Excel/CSV reprend la
  sélection et ajoute les colonnes libres de la commune et le nom des
  étiquettes (`B3.6` complété).
- Migration 047, routes `/points/*` (17), nouvelle campagne `champs-points`
  (75/75) incluse dans `npm run test`.

### Corrigé
- **L'historique des arrêts était vide** : l'onglet « Historique » d'un circuit
  lisait les lignes d'audit de `points_collecte`, mais aucun déclencheur ne les
  écrivait. Il est posé (migration 047).
- `GET /circuits/:id/historique` répondait 500 (« uuid = text ») : paramètre
  typé des deux côtés.

### Décisions à retenir
- **Une colonne libre n'est pas une colonne SQL** : les définitions sont dans
  `champs_points`, les valeurs dans `points_collecte.attributs`, indexées par
  l'identifiant du champ — un renommage ne perd ni ne réécrit rien.
- **Le type d'un champ ne change pas**, et un choix de liste encore utilisé ne
  se retire pas.
- **Tout ou rien** : une valeur hors type ou un point introuvable, et un lot
  n'écrit rien.
- **Une action vise des points arrêtés à sa création**, pas une étiquette.
- **Retirer n'efface pas** : colonnes et étiquettes retirées quittent l'écran,
  les filtres et l'export, leurs valeurs restent sur les points.
- **Qui voit quoi** : le prestataire lit colonnes et étiquettes des arrêts de
  ses circuits ; la commune et la FNCT écrivent ; les actions restent à la
  commune. Un déclencheur refuse en base l'étiquette ou l'action d'une autre
  commune.

## [0.8.0] — 2026-09-28 — Jalon 5 : la maintenance des engins (GMAO)

### Ajouté
- **Carnet d'entretien** (`B2.2`) : chaque intervention — date, type (vidange,
  révision, pneumatiques, freinage…), nature préventive ou corrective, coût en
  dinars au millime, kilométrage, garage. Dans la fiche dépliée de chaque
  engin de l'écran Parc, avec export Excel/CSV.
- **Alertes d'entretien** (`B2.3`) : des plans (« vidange tous les 10 000 km ou
  tous les 180 jours », seuil d'alerte réglable) et leurs échéances, calculées
  depuis la dernière intervention du même type. Bandeau en tête du parc (en
  retard, à prévoir, à vérifier), badge sur la ligne de l'engin concerné,
  export des échéances.
- **Le compteur des engins** : `vehicules.kilometrage` et sa date de relevé,
  relevables à l'écran ; une intervention qui porte un kilométrage plus élevé
  le met à jour.
- **Coût par engin** sur douze mois glissants, part corrective comprise
  (`GET /maintenance/bilan`) : la matière de l'axe 3 des KPI (Jalon 8).
- Migration 046, routes `/maintenance/*` (11), nouvelle campagne `maintenance`
  (43/43) incluse dans `npm run test`.

### Décisions à retenir
- **L'échéance n'est pas stockée** : une alerte disparaît d'elle-même dès que
  l'intervention est saisie, et revient si celle-ci est retirée — aucune
  seconde vérité à tenir à jour.
- **« À vérifier » plutôt que « à jour »** quand l'échéance au kilomètre ne peut
  pas être évaluée (aucun relevé de compteur, ou intervention saisie sans
  kilométrage) : ne pas rassurer sans rien savoir. C'est le cas, au départ, des
  35 engins des seeds, qui n'ont jamais eu de compteur.
- **Le compteur ne recule pas** : un relevé inférieur est refusé, sauf compteur
  remplacé confirmé ; une intervention ancienne saisie après coup ne le
  rajeunit pas.
- **Commune et FNCT seulement** : un prestataire voit les engins de ses zones,
  pas leur carnet ni leur coût. En base, un déclencheur refuse une intervention
  ou un plan rattaché à une autre commune que celle de l'engin.
- Une intervention se saisit une fois faite : une date future est refusée.

### Vérifié
- Campagne `maintenance` : le test de validation de la feuille de route —
  signalé « à prévoir » à 10 jours de l'échéance, « à jour » après la saisie,
  de retour après le retrait —, retards à la date et au kilomètre, statut « à
  vérifier », compteur qui ne recule pas, coût au millime, bilan sur 12 mois,
  cloisonnement (autre commune : invisible et 404 ; SQL direct refusé ;
  prestataire : 403), engin réformé sorti des échéances, exports.
- Navigateur : bandeau « 1 à prévoir » et badge, saisie de la vidange par le
  formulaire (virgule décimale comprise), bandeau passé « à jour » ; relevé
  inférieur refusé avec la raison, saisie conservée.
- 47 migrations rejouées sur base neuve · contrat OpenAPI conforme (172 routes)
  · typage front et back sans erreur · les 25 autres campagnes sans régression.

---

## [0.7.0] — 2026-09-28 — Jalon 4, lot 2 : imports CSV et PDF (clôture du Jalon 4)

### Ajouté
- **Import CSV des contacts** (`C1.4`, `POST /contacts/import`) et **du parc**
  (`B2.4`, `POST /trucks/import`), avec un bouton « Importer un CSV » sur les
  deux écrans. En deux temps, comme l'import KML : un aperçu ligne par ligne
  qui n'écrit rien (à créer, à mettre à jour, inchangé, déjà présent, erreur —
  avec la raison), puis la validation des seules lignes valides, en une
  transaction.
- **Import CSV des points de collecte** (`B3.1`) : un format de plus du lecteur
  de relevés (`services/kml.ts`), reconnu à son contenu — l'import par circuit
  existant sert tel quel. Ordre de passage renuméroté par voyage.
- **PDF** du tableau national (`A3.4`, A4 à l'italienne) et des résultats d'un
  sondage (`B5.2.4`), par l'impression du navigateur (`lib/impression.ts`) :
  le bloc est copié dans une zone d'impression avec titre, date et organisme.
- `services/import.ts` : lecteur CSV (RFC 4180) piloté par les jeux de
  colonnes de l'export — en-têtes et valeurs codées reconnus en français, en
  arabe ou par leur code.
- Nouvelle campagne `imports` (51/51), incluse dans `npm run test`.

### Décisions à retenir
- **L'aller-retour export → tableur → import est sans effet** tant qu'on ne
  change rien : les contacts ressortent « déjà présents » (même nom et même
  téléphone ou courriel), les engins « inchangés ». L'apostrophe qui
  neutralise une formule à l'export est retirée au retour.
- **Une case vide n'efface rien** à l'import du parc : seules les cases
  remplies sont comparées à la fiche existante. Un changement d'état sans date
  dit « depuis aujourd'hui », comme à l'écran.
- **Windows-1252 accepté, mais signalé** : c'est l'enregistrement « CSV »
  classique d'un Excel français ; l'arabe y est déjà perdu, et l'aperçu le dit
  plutôt que d'importer des « ??? » en silence.
- **PDF par le navigateur, pas par le serveur** : il met en forme l'arabe
  (lettres liées, droite à gauche) sans bibliothèque ni police embarquée.
  Le reste de la page est retiré de l'impression (`display: none`), pas masqué
  — sans quoi il laisserait des pages blanches.

### Corrigé
- `POST /trucks` : un engin existant n'était reconnu qu'à un identifiant dérivé
  de l'immatriculation, que les fiches des seeds ne portent pas
  (« dcef-02220943 », « trk-04 ») — ressaisir son immatriculation le
  dédoublait. Il est désormais reconnu à l'immatriculation, espaces et casse
  mis à part, comme à l'import.
- Impression : les titres de colonnes cliquables (tri) disparaissaient du PDF ;
  ils sont imprimés comme du texte, sans les flèches de tri.

### Vérifié
- Campagne `imports` : aperçu sans écriture, validation des seules lignes
  valides, doublons dans le fichier, aller-retour export → import sans effet
  (y compris depuis un export en arabe), arabe et accents intacts, séparateurs
  « ; » « , » tabulation, Windows-1252, virgule décimale, cloisonnement
  (autre commune et prestataire : 403).
- **PDF produits réellement** avec Microsoft Edge à partir de la vue
  d'impression de l'application : tableau national en français et en arabe
  (de droite à gauche, lettres liées, en-tête répété page 2), résultats d'un
  sondage.
- Navigateur : import de contacts de bout en bout (aperçu, validation, liste
  rafraîchie).
- 46 migrations rejouées sur base neuve · contrat OpenAPI conforme (161 routes)
  · typage front et back sans erreur · les 24 autres campagnes sans régression
  (mêmes échecs pré-existants et sans rapport qu'aux jalons précédents).

---

## [0.6.0] — 2026-09-28 — Jalon 4, lot 1 : le service d'export unique

### Ajouté
- **Export Excel et CSV sur les cinq écrans qui en demandent** : tableau
  national par gouvernorat et annuaire des 350 communes (`A3.4`), parc
  (`B2.4`), points de collecte filtrés (`B3.6`), résultats d'un sondage
  (`B5.2.4`), contacts (`C1.4`). Un seul bouton (`BoutonExport.tsx`), Excel en
  premier.
- `services/export.ts` : l'export n'est pas une route de plus mais une autre
  représentation des routes de liste existantes (`?format=csv|xlsx`,
  `&langue=fr|ar`) — même requête, mêmes filtres, mêmes rôles, même RLS.
  XLSX écrit sans dépendance (zip et CRC32 à la main, comme le lecteur KMZ),
  nombres et dates typés, feuille de droite à gauche en arabe, en-tête figé,
  filtre automatique. CSV en UTF-8 avec BOM, séparateur « ; », virgule
  décimale.
- `services/jeuxExport.ts` : un jeu de colonnes par route, en-têtes FR/AR et
  libellés des valeurs codées.
- Carte communale : filtres des arrêts par circuit et par type, qui règlent à
  la fois la couche affichée et l'export ; `GET /circuits/points` accepte
  désormais `circuitId`, `type` et `actif`.
- Nouvelle campagne `exports` (42/42), incluse dans `npm run test`.

### Décisions à retenir
- **Le fichier ne peut pas diverger de l'écran** : il passe par la même route.
  Une erreur (400, 401, 403) reste une erreur JSON — jamais un fichier vide
  qu'on prendrait pour un résultat.
- **Injection de formule neutralisée** en CSV : un texte qui commence par
  = + - @ est préfixé d'une apostrophe (un contact nommé « =HYPERLINK(…) » ne
  devient pas un lien piégé). En XLSX, tout texte est une chaîne en ligne,
  jamais une formule.
- **CSV à la française** (« ; », virgule décimale) : c'est la convention du
  tableur des communes. Sur un poste réglé autrement, seul le XLSX garantit
  des nombres typés — d'où l'ordre des boutons.
- **Aucun cache** (`Cache-Control: no-store`) : des données de commune, parfois
  personnelles.
- L'annuaire national s'exporte en entier (350 communes) : la recherche de
  l'écran sert à trouver une commune, pas à constituer une sélection.

### Vérifié
- Campagne `exports` : BOM et UTF-8, noms arabes et accents intacts, cellules
  numériques pour un `NUMERIC` que `pg` rend en chaîne, dates typées, libellés
  à la place des codes, en-têtes et feuille en arabe, filtres identiques à
  l'écran, cloisonnement (autre commune : en-tête seul ; prestataire : 403),
  formule neutralisée, guillemets / point-virgule / retour à la ligne relus à
  l'identique.
- **Dans un Excel réel** (automatisation, lecture seule) : `أريانة`,
  `قلعة الأندلس`, `Kalaât` intacts ; valeurs d'achat et populations lues comme
  des nombres, dates comme des dates ; CSV découpé en 15 colonnes ; feuille
  arabe de droite à gauche.
- 46 migrations rejouées sur base neuve · contrat OpenAPI conforme (159 routes)
  · typage front et back sans erreur · les 23 autres campagnes sans régression
  (mêmes échecs pré-existants et sans rapport qu'aux jalons précédents).

### Reste pour le lot 2
Imports CSV (contacts `C1.4`, parc `B2.4`, points `B3.1`) et PDF (`A3.4`,
`B5.2.4`).

---

## [0.5.0] — 2026-09-28 — Jalon 3 : Contacts, versionnement et lecteur PDF

### Ajouté
- **Contacts** (`C1.1`–`C1.3`) : l'annuaire de travail de la commune — ANGeD,
  gouvernorat, prestataires, associations, fournisseurs, élus. Liste avec
  recherche (nom, organisation, fonction) et filtre par catégorie, ajout,
  modification, retrait logique. Nouvel onglet « Contacts » du portail
  communal (`Contacts.tsx`), routes `GET/POST /contacts`,
  `PATCH/DELETE /contacts/:id`, table `contacts` (migration 045) avec journal
  d'audit.
- **Versionnement des rapports et études** (`C3.6`) : « Nouvelle version »
  sur chaque document, historique daté de toutes les versions. Une version 2
  est une nouvelle ligne rattachée à la première par `document_id` — la
  version 1 n'est jamais écrasée et son fichier reste lisible. Routes
  `GET/POST /rapports-etudes/:id/versions` ; la liste ne montre plus que la
  dernière version de chaque document, avec son nombre de versions.
- **Lecteur PDF intégré** (`C3.5`) : « Aperçu » affiche un PDF dans la page,
  pour la version courante comme pour les anciennes. Un document Office
  s'ouvre toujours à part — aucun navigateur ne l'affiche nativement.
- Nouvelle campagne de tests `contacts` (25/25), incluse dans `npm run test` ;
  campagne `rapports` étendue au versionnement (37/37, 17 nouvelles
  assertions).

### Décisions à retenir
- **Contacts lisibles par la commune et la FNCT seulement.** La politique RLS
  s'appuie sur `app.can_write_commune` et non sur `app.can_read_commune`, qui
  ouvrirait aussi la lecture aux prestataires rattachés : ce sont des données
  personnelles de tiers dont leur mission n'a pas besoin (décret-loi
  2022-54). Une fiche doit porter au moins un téléphone ou un courriel,
  vérifié par l'API et par une contrainte en base.
- **Retirer un contact d'une autre commune répond 404, pas 403.**
  `app.supprimer` étant SECURITY DEFINER, il voit la fiche et répondait 403 —
  ce qui révélait son existence. La route vérifie désormais la visibilité
  sous RLS avant d'appeler `app.supprimer`, conformément à la règle déjà
  posée par la campagne `suppression`.
- **Versions : garde-fous en base, pas seulement dans la route.** Un
  déclencheur refuse une version greffée sur le document d'une autre commune
  ou une « version 2 » sans document ; le numéro suivant est compté sur toutes
  les versions, retirées comprises (`app.prochaine_version_rapport`), pour
  qu'un numéro cité dans un courrier ne désigne jamais deux fichiers. Retirer
  un document retire toutes ses versions.
- **`C1.4` (import/export CSV des contacts) reporté au Jalon 4**, qui bâtit un
  service d'export unique pour les cinq endroits qui en demandent.

### Corrigé
- `FEUILLE_DE_ROUTE.md` : la ligne « 3.3 Application citoyenne » du tableau
  par rubrique n'avait pas été mise à jour à la clôture de `M6` (Jalon 2).

### État de l'art à la clôture de ce lot
46 migrations rejouées sur base neuve · contrat OpenAPI conforme (159 routes
servies, 159 documentées) · typage front et back sans erreur · campagnes
`contacts` (25/25) et `rapports` (37/37) · les 21 autres campagnes sans
régression (mêmes échecs pré-existants et sans rapport qu'aux jalons
précédents — `circuits`, `prestataires`, `decoupage`, `module2`, `module4`,
`module6` — signalés séparément) · vérification manuelle dans le navigateur :
ajout, modification, recherche et état vide des contacts ; historique et
aperçu PDF d'une version antérieure ; rendu arabe RTL.

---

## [0.4.0] — 2026-09-23 — Jalon 2, lot 2 : clôture de `M6` (historique et préférences)

### Ajouté
- Historique « Mes notifications » côté citoyen : `GET /citoyen/notifications`
  (+ `?nonLues=true`), `PUT /citoyen/notifications/:id/lu`,
  `PUT /citoyen/notifications/tout-lu`. La table du lot 1
  (`notifications_envoyees`) est renommée `notifications_citoyen` et étendue
  de trois colonnes (`lu`, `metadata`, `tentatives`) — pas de nouvelle
  migration : la 044 n'était pas encore fusionnée dans `main`.
- Préférences par canal et par type : `GET`/`PUT /citoyen/preferences`, table
  `preferences_notification` (creuse — une ligne absente vaut « activé », un
  citoyen qui n'a jamais ouvert l'écran reçoit tout ce pour quoi il s'est
  inscrit). Le service d'émission consulte la préférence avant d'envoyer, mais
  consigne toujours l'issue dans l'historique — y compris quand rien n'est
  parti (`non_souhaite`, `non_abonne`, `sans_souscription`) : c'est cette
  trace, pas seulement les envois réussis, qui nourrit l'écran et son
  compteur.
- Écrans citoyens « Mes notifications » (liste chronologique, non-lus mis en
  évidence, tout marquer lu, état vide) et « Préférences » (canaux × types,
  SMS et courriel grisés — non câblés), atteints depuis une cloche à compteur
  de non-lus dans l'en-tête de l'espace citoyen. Bilingue FR/AR, RTL compris.
- Relance manuelle (« Renvoyer ») d'un envoi en échec :
  `PATCH /tickets/:id/notification/renvoyer` et `renvoyerNotification()`
  (`services/notifications.ts`), plus le bouton correspondant dans l'écran
  Réclamations du back-office communal. Réservée aux décisions de
  réclamation — la commune connaît déjà ce citoyen par le ticket qu'elle
  instruit, retenir cette seule ligne ne lui apprend rien de plus ; un envoi
  lié à une publication reste invisible d'une commune, comme au lot 1.
  Re-résout la souscription du citoyen au moment de la relance, pas celle
  d'hier : un citoyen réabonné depuis reçoit l'essai suivant sur son nouvel
  appareil.
- Nouvelle campagne de tests `notifications-citoyen` (25/25) : RLS croisée
  entre citoyens, historique conservé malgré un type désactivé et malgré
  l'opt-out global, compteur de non-lus, « tout marquer lu », relance refusée
  hors échec puis acceptée. `npm run test` inclut désormais cette campagne.

### Décisions et limites à retenir

**« Push seul, pas de SMS » (confirmé à la clôture de `M6`).** Le SMS et le
courriel restent acceptés par le modèle de données (`canal`, contrainte
`preferences_canal_valide`) mais aucun des deux n'émet quoi que ce soit : la
préférence de la feuille de route § 7.2 est un seul canal sans fournisseur
externe à payer ni à choisir, et le SMS dépend d'une décision distincte liée
à l'inscription citoyenne par téléphone (`M1`). Proposer le SMS comme
fonctionnel dans l'écran Préférences aurait promis au citoyen une réception
qui n'aurait jamais lieu ; l'écran le grise donc explicitement plutôt que de
le masquer, pour que la limite reste visible plutôt que silencieuse.

**Leçon RLS retenue en cours de route : `INSERT ... ON CONFLICT ... DO
UPDATE` sur une table RLS exige une politique `UPDATE`, même quand aucun
conflit ne survient.** PostgreSQL vérifie les permissions de toutes les
clauses d'une requête au moment de la *planifier*, pas seulement de celles
qu'elle exécute — un upsert dont c'est le tout premier passage (donc sans
conflit réel) échoue déjà sur la clause `DO UPDATE` absente de politique
(erreur `42501`). Découverte sur `push_souscriptions` (lot 1, premier
`POST /citoyen/push/souscriptions` en échec), et appliquée par anticipation à
`preferences_notification` dès sa création dans ce lot, pour la même raison
d'upsert.

**Statut de `M6` avant cette clôture.** Le lot 1 avait dû construire le
mécanisme même de `M6` (abonnement du navigateur, réception, clic vers
l'application) pour être testable, sans quoi émettre un push n'aurait eu
personne à joindre — mais sans l'historique côté citoyen ni les préférences
fines, qui restaient à construire. `M6` n'était donc pas coché à l'issue du
lot 1 ; il l'est avec ce lot.

**Limite assumée : une seule tentative automatique par envoi.** L'automatisme
ne retente jamais un échec en silence — chaque tentative est consignée
immédiatement, résultat compris. La relance ajoutée dans ce lot est la
mitigation retenue : un agent peut relancer explicitement un envoi en échec
(jamais l'inverse — l'automatisme reste à une tentative), et chaque relance
incrémente `tentatives` plutôt que de créer une nouvelle ligne, pour que
l'historique reste lisible comme une seule notification qui a fini par
aboutir ou non.

### État de l'art à la clôture de ce lot
45 migrations rejouées sur base neuve · contrat OpenAPI conforme (153 routes
servies, 153 documentées) · typage front et back sans erreur · campagnes
`notifications-citoyen` (25/25, nouvelle) et `notifications` (16/16, rejouée
sans régression après le renommage de table) · `citoyen` (43/43), `module5`
(31/31) et le reste de la suite sans régression additionnelle imputable à ce
lot (cinq échecs pré-existants et sans rapport — dates codées en dur,
découpage officiel non importé sur cette base de test, ordre des seeds —
signalés séparément, voir le rapport de lot).

---

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
