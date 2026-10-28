# Journal des versions — SIIPI

Ce journal suit l'avancement par **Jalon**, au sens de `FEUILLE_DE_ROUTE.md` § 4 :
un lot de fonctionnalités groupées par dépendance réelle, pas par rubrique du
cahier des charges. Chaque entrée renvoie aux identifiants du cahier des
charges (`B5.5.2`, `C3.1`, …) tels que suivis dans la feuille de route.

## [0.15.85] — 2026-10-28 — La période transitoire du secteur informel (lot I3, 18.3)

`DECISIONS_2026-10-20.md`, compléments du 28/10/2026 : le suivi de la période transitoire de l'article 13 du projet
de décret, sur les règles datées du lot I1. Derrière l'interrupteur du cadre du secteur informel, éteint en production.

### Ajouté
- **Les étapes d'accompagnement** (migration 093, `jalons_acteurs`) : formation, statut, régularisation… franchies
  par un acteur, datées, avec leur pièce ; chacune doit figurer dans la liste nationale **en vigueur à sa date** et
  suivre la démarche entamée. Une étape ne se réécrit pas ; saisie à tort, elle se retire.
- **Les agréments des intermédiaires** (`agrements_intermediaires`) : l'organisme, la référence, la délivrance et
  l'échéance portées par la pièce. **SIIPI n'agrée pas** : aucune route ne délivre un agrément. « À vérifier »
  annonce une échéance dans les 60 jours, signale un agrément expiré, et montre l'écart entre l'échéance et la durée
  nationale en vigueur à la délivrance, sans la corriger.
- **L'état de chaque acteur** (`app.situation_transitoire`, rejouable à une date) : peut exercer, formalisé, sans
  démarche, puis **à régulariser** après la fin — un avertissement, jamais un blocage ; un intermédiaire sans
  étalonnage après son échéance est signalé. **Sans date de départ, aucun état ni aucun avis.**
- **Le bilan de la conversion** (`app.conversion_informel`), mois par mois, **en provenance déclarée** : tonnes
  détournées (livraisons du registre des acteurs, jour de Tunis), redevance ANGeD évitée au taux du jour de chaque
  livraison (tonnes sans taux à part), voyages économisés au poids moyen d'un voyage pesé de circuit du même mois
  (non renseigné sans pesée). Jamais additionné au tonnage pesé ; export Excel/CSV.
- **La vue de la FNCT** (`app.secteur_informel_national`, entrée *Secteur informel* de l'observatoire) : par
  gouvernorat, « N communes sur M », acteurs, cartes valables, démarches en cours, formalisés, agréments valables,
  tonnes de l'année. **Tout compte de 1 à 4 est masqué** (aussi dans le bilan d'une commune lu par la FNCT) ; aucun
  rang, aucune ligne par commune, ordre alphabétique de la langue affichée.
- API `/periode-transitoire` (8 routes) ; écran *Acteurs informels* : volet *Accompagnement* (et *Agrément* pour un
  intermédiaire) dans chaque acteur, sections *La période transitoire* et *Le bilan de la conversion* — FR/AR, vérifié
  sur téléphone. Avis de « À vérifier » rendus en arabe.

### Vérifié
- Campagne `periode-transitoire` : les refus d'abord (cadre éteint, étape sans démarche, antérieure, de demain, hors
  liste du jour, en double, réécrite ; agrément d'un pré-collecteur, sans organisme, à l'échéance qui ne suit pas la
  délivrance, de demain, réécrit ; écritures de la FNCT, d'un prestataire, d'une autre commune ; vue nationale à un
  directeur) ; puis aucun état sans date de départ, la fin de période contre un témoin de dates, le rejeu à une date,
  « à régulariser » sans blocage, l'étalonnage, les avis d'agrément FR/AR, le bilan de la conversion recalculé par un
  témoin indépendant (`periode_transitoire_attendus.py`), le masquage sous 5 et l'absence de rang. Mutant (taux du
  jour du calcul) : 2 échecs, rétabli.

## [0.15.84] — 2026-10-28 — La carte de pré-collecteur (lot I2, 18.2)

`DECISIONS_2026-10-20.md`, compléments du 28/10/2026 : la carte de l'article 13.1 du projet de décret, sur les règles
datées du lot I1. Derrière l'interrupteur du cadre du secteur informel, éteint en production.

### Ajouté
- **La demande** (migration 092, `demandes_carte_precollecteur`, `zones_demande_carte`, `pieces_demande_carte`) :
  l'acteur, déclaré pré-collecteur, la date de dépôt, les secteurs d'accès de la commune, et, pour un renouvellement,
  la carte renouvelée. Les pièces : leur date et leur référence, jamais le scan ; **la liste exigée est celle du jour
  de la demande**.
- **L'accord** (`app.accorder_carte`) : une seule transaction qui vérifie la catégorie, les pièces, les secteurs et
  la **durée de validité en vigueur le jour de la décision** — sans elle, pas de carte —, puis émet la carte comme
  document scellé de 16.2 (`carte_precollecteur`, numéro `CP-AAAA-NNNNN`, gabarit bilingue « modèle provisoire »,
  bandeau « projet de décret — non en vigueur » quand la règle appliquée est provisoire). Un acteur dont la carte vaut
  encore ne reçoit qu'un renouvellement, qui commence le lendemain de sa fin. Le **refus** est motivé ; le **retrait**
  d'une carte aussi, et la carte reste au registre ; une annulation reste l'erreur d'émission.
- **Aucun nom n'est scellé** : la carte porte le pseudonyme ; le nom s'imprime pour le seul directeur de la commune,
  lu dans la table d'identité, lecture journalisée ; pour la FNCT, la case reste vide. Aucune colonne de paiement.
- « À vérifier » annonce une carte qui expire dans les 30 jours sans renouvellement demandé (FR, AR).
- API `/cartes-precollecteur` (lecture : commune et FNCT ; écriture : directeur de la commune) ; la route générique
  `POST /documents` n'émet pas de carte. Écran *Acteurs informels*, section *Cartes de pré-collecteur* : état de
  chaque demande, pièces du jour, accord, refus, impression, retrait, renouvellement — FR/AR, vérifiée sur téléphone.

### Vérifié
- Campagne `carte-precollecteur` : les refus d'abord (cadre éteint, intermédiaire, sans catégorie, secteur ou acteur
  d'une autre commune, pièce hors liste, accord incomplet, sans durée en vigueur, par la FNCT ou un prestataire,
  décision rejouée, carte réécrite, émission générique, colonne de paiement) ; puis la liste du jour de la demande, la
  durée du jour de la décision (témoin de dates), le renouvellement sans chevauchement, le nom imprimé pour le seul
  directeur et absent du registre comme du journal d'audit, l'avis d'échéance et son retrait. La campagne `documents`
  compte désormais cinq gabarits.

## [0.15.83] — 2026-10-28 — Les règles du secteur informel, en paramètres nationaux (lot I1)

`DECISIONS_2026-10-20.md`, complément du 28/10/2026 : les lots 18.2 et 18.3 se développent sans attendre l'article 13
du projet de décret, et **chaque règle légale est une donnée nationale datée, jamais du code**. I1 en pose le socle ;
la carte (I2) et la période transitoire (I3) suivent.

### Ajouté
- **Cinq paramètres nationaux du secteur informel** (migration 091, rubrique *Secteur informel* de l'écran
  *Paramètres nationaux*) : validité de la carte de pré-collecteur (12 mois), durée de l'agrément d'un intermédiaire
  (24 mois), durée de la période transitoire (36 mois), délai d'étalonnage (6 mois) — toutes **provisoires**,
  rattachées au projet de décret — et la **date de départ de la période transitoire, sans valeur** : le projet ne la
  donne pas. Un paramètre peut désormais être une **date** ; une durée en mois est un **entier** (« 12,5 mois » est
  refusé par la base).
- **Les listes nationales datées** (`elements_listes_nationales`, `app.liste_nationale(liste, date)`) : les pièces
  exigées pour la carte (déclaration d'activité simplifiée, engagement d'hygiène et de sécurité, acceptation de
  l'accompagnement) et les étapes d'accompagnement (formation, statut d'auto-entrepreneur, régularisation fiscale,
  immatriculation, cahier des charges, étalonnage). Un élément **se ferme** à une date, avec le texte qui en décide —
  une demande d'avant reste jugée sur la liste de son jour — ou **se retire** s'il a été saisi à tort ; il ne se
  réécrit ni ne s'efface (`GET /regles-informel`, `POST /regles-informel/listes/{liste}`,
  `POST /regles-informel/elements/{id}/fin`, `POST /regles-informel/elements/{id}/retrait` ; écriture : FNCT).
- **La période transitoire calculée** (`app.periode_transitoire(date)`) : départ, dernier jour, échéance d'étalonnage,
  avec les règles en vigueur ce jour-là. **Sans date de départ, aucune échéance** : l'écran dit « date de départ non
  fixée » et nomme ce qui manque.
- L'écran de la FNCT regroupe l'interrupteur du cadre, la période, les durées et les deux listes, en français et en
  arabe ; une unité en mots (« mois ») se traduit.

### Vérifié
- Campagne `informel-parametres` : les refus (une commune qui règle, une durée non entière ou hors bornes, une date
  pour un nombre, un élément sans arabe, en double, réécrit, effacé, fermé deux fois) ; la période qui n'a pas
  d'échéance sans départ, en a une dès qu'il est posé, et suit une durée allongée **à sa date d'effet seulement**
  (témoin de dates écrit dans la campagne) ; la validité d'une carte décidée aujourd'hui qui garde la durée
  d'aujourd'hui ; une pièce fermée qui cesse d'être exigée à sa date. Les deux tables nationales touchées sont
  rendues ligne entière.

## [0.15.82] — 2026-10-26 — La préparation de la recette R1

`DECISIONS_2026-10-20.md`, complément du 26/10/2026 (soir) : décisions R1-a à R1-d. La recette se fera sur une
instance de production neuve, chez Dar Chaâbane ou dans une commune du Grand Tunis qui part de zéro ; les outils
servent les deux cas.

### Ajouté
- **L'import du personnel** (`POST /personnel/import`) : un CSV de quatre colonnes — Nom, Prénom, Fonction, Statut,
  en-têtes en français ou en arabe —, un aperçu sans écriture, puis l'enregistrement. Un agent déjà inscrit (même nom
  et prénom, dans un ordre ou dans l'autre) n'est pas créé une seconde fois. **Le fichier est refusé en entier**, la
  colonne nommée, s'il porte un salaire ou une prime, un numéro de CIN ou de pièce d'identité, une donnée de santé,
  une adresse ou un téléphone, ou une case de huit chiffres (`services/importPersonnel.ts`). Écran *Personnel* →
  *Importer le personnel*, et le catalogue « + Ajouter » (*Le personnel (fichier CSV)*).
- **L'effectif et la masse salariale de l'année** se saisissent enfin : *Personnel* → *Coût du service*. L'API les
  recevait depuis le module 4 ; aucun écran ne les demandait, et « Ma commune dans SIIPI » renvoyait vers un écran
  qui n'avait pas de formulaire.
- **`charger:dar-chaabane` et `charger:dar-chaabane:prod`** : les circuits, le parc et la masse salariale réels de
  Dar Chaâbane, d'une commande. Sur une base de production, **aucun agent fictif** n'est créé et les contenus de
  communication d'exemple sont **refusés** (`seed/gardeProduction.ts`) ; en développement, rien ne change.
- `recette:etat` dit à une commune vide le geste de chaque registre (import du parc, import du personnel, circuits),
  propose le jeu de démarrage à Dar Chaâbane seule, et recense ce qu'il faut recueillir pour le coût de collecte :
  masse salariale de l'année, prix du gasoil, classe et volume des engins de circuit, modèles des documents encore
  provisoires.
- `docs/exploitation/INSTALLATION.md` § 7, « Démarrer une commune ». Le dossier de recette
  (`docs/recette/R1_DAR_CHAABANE.md`) et la fiche quotidienne sont mis à jour pour les deux cas ; P4 va du pointage
  au coût de collecte.
- Campagne **`preparation-recette`** (78e), 60 contrôles : treize refus de fichier (en-têtes français et arabes,
  huit chiffres), les rôles et le périmètre, les erreurs de ligne, l'import, le réimport sans double, l'arabe sans
  chadda ; la masse salariale déclarée sans effacer l'effectif ; `recette:etat` sur une commune vide ; une base de
  production jetable (13 circuits, 29 engins, 0 agent, 4 exercices de masse salariale, exemples refusés) et une base
  de développement (17 agents fictifs, comme avant). Le mutant qui ne regarde plus les en-têtes la fait échouer.

### Modifié
- `PUT /personnel/effectifs` : sur un exercice déjà déclaré, un champ absent du corps **garde** sa valeur ; un
  champ envoyé à null l'efface. Déclarer la masse salariale effaçait l'effectif de l'année.
- L'import lit l'arabe sans voyelles brèves ni chadda : « مرسم » vaut « مرسّم ».

### Corrigé
- `recette:etat` comptait les agents et les engins retirés : 78 agents à Dar Chaâbane pour 61 en service (les 17
  agents fictifs retirés du jeu de développement).

## [0.15.81] — 2026-10-26 — Lot C : le coût de collecte, par circuit et par engin

`DECISIONS_2026-10-20.md`, complément du 26/10/2026 (lot C). SIIPI calcule de ses propres registres le coût direct de
chaque circuit — `Z = A + B + C + D` de la méthode du coût complet (17.5) — et dit, composante par composante, d'où vient
chaque chiffre : **le réel d'abord**, un ratio ou un prix du guide de référence à défaut, **dit tel** ; sans l'un ni
l'autre, la composante est absente et le total n'existe pas.

### Ajouté
- **Migration 090** :
  - `vehicules.acquis_par_don` : un engin reçu en don **n'est pas amorti** ; son entretien se compte ;
  - quatre paramètres nationaux datés (17.3) : `prix_gasoil` (**sans valeur** : jamais un prix figé), `taux_entretien_neuf`
    (6 %), `taux_entretien_fin_de_vie` (14 %), `duree_amortissement_engins` (10 ans), avec leur source ;
  - `references_cout_engins` : le prix indicatif à neuf et la consommation de gasoil par séance du guide, par classe
    d'engin et tranche de volume, datés et sourcés, en lecture seule pour l'application ;
  - `app.cout_collecte_engins` — chaque engin de circuit **avec sa remorque attelée** (une unité) : amortissement (valeur
    réelle, sinon prix du guide ; sur la plus grande de la durée de référence et de l'âge), entretien (les interventions
    de la période dès qu'il en existe une, **jamais remplacées par le ratio** ; sinon le ratio du guide selon l'âge),
    carburant (les pleins ; sinon la consommation du guide × séances × prix du gasoil) ;
  - `app.cout_collecte_circuits` — la ventilation au kilomètre du carnet de bord, sinon au voyage attendu ; le personnel
    au pointage, sinon à l'équipe ; la redevance ANGeD au taux de la date de chaque pesée ; « ce qui manque » ; le total
    seulement si rien ne manque ; **le coût à la tonne seulement sur un circuit dont tous les voyages sont pesés** ;
  - `app.cout_collecte_indirects` — les frais du parc et de l'administration **seulement d'une étude de coût complet**
    (17.5) de l'exercice, rapportés à la période : **aucun forfait**.
- API : `GET /cout-collecte` (mois ou année ; total de la commune seulement si chaque circuit a le sien, coût par
  habitant sur une année seulement ; export Excel/CSV des circuits), `GET /cout-collecte/references` ; `acquisParDon`
  sur l'engin (création, modification, import et export du parc).
- **Écrans** (FR, AR) : *Coût de collecte* au pôle Pilotage — coût direct, frais indirects et coût complet ; par circuit
  et par engin, chaque montant avec sa pastille de provenance (Réel, Ratio du guide, Prix du guide, Don) ou « non
  renseigné » ; « acquis par don » dans le formulaire et la fiche de l'engin ; les références du guide dans
  *Paramètres nationaux*.
- Campagne **`cout-collecte`** (77e), 73 contrôles, contre un témoin indépendant (`tests/cout_collecte_attendus.py`) :
  les refus ; trois engins (réel, prix du guide d'un attelage de 21 ans, don entretenu) et cinq circuits ; le prix du
  gasoil absent puis posé ; une intervention sans coût ; les pesées complètes, l'étude, l'année ; le don par l'API ;
  l'export. Le mutant qui donne un coût à la tonne sur un circuit pesé une fois sur neuf la fait échouer.

### Décidé (26/10/2026)
- Aucun taux de charges sociales : la masse salariale saisie est la rémunération publique, charges comprises (G7).
- Durée d'amortissement = la plus grande de 10 ans et de l'âge de l'engin (G8).
- Aucun forfait de frais généraux : C + D seulement d'une étude de coût complet (G9).
- Aucun ratio de lubrifiants : ils sont dans l'entretien (G10).

## [0.15.80] — 2026-10-26 — Lot K : les indicateurs du guide de référence

`DECISIONS_2026-10-20.md`, complément du 26/10/2026 (suite). Les cinq indicateurs de performance de la collecte du
guide (§ 1.2.7) : quatre entrent, le cinquième (coût à la tonne) existait. Ils prennent place dans le catalogue des
indicateurs (lot 3a) : carte, courbe de douze mois, « ce qui manque », répartition nationale, arabe.

### Ajouté
- **Migration 089** :
  - **Taux de collecte** (pesé ménager ÷ production théorique, kg/hab/j × population, la population de saison en
    saison) — **seulement quand tous les voyages attendus sont pesés** ;
  - **Taux de collecte estimé** — pour une commune qui ne pèse **aucun** voyage, la fourchette estimée (17.2) ÷
    production ; incomplet dès qu'un circuit ménager ne s'estime pas ou est confié à un prestataire. Un mois mêlé n'a ni
    l'un ni l'autre : **une estimation ne s'ajoute jamais à une pesée** ;
  - **Taux de remplissage** — pesé ÷ capacité de la benne pleine (volume × densité du jour), sur les voyages pesés, en
    fourchette ;
  - **Taux de couverture** — population des secteurs desservis ÷ population, mesuré quand chaque secteur a sa
    population ; sinon déclaré ;
  - **Points noirs** — non résorbés en fin de période, dès qu'un inventaire existe ; sinon déclaré. `points_collecte.resorbe_le`
    : un point résorbé reste à l'inventaire, daté (réservé aux points noirs, jamais dans l'avenir).
  - `indicateurs_kpi.fourchette` : la borne haute dans `detail.valeur_max` ; pas de repère de gouvernorat pour une
    fourchette.
  - Les sources et dépendances de chacun (« ce qui manque »), rattachées aux éléments de « Ma commune dans SIIPI »
    (les points noirs restent dehors, exprès).
  - « À vérifier » : des voyages pesés au-delà de la benne pleine sur les 30 derniers jours (information), avec son arabe.
  - Les calculs de la migration 070 gardent leur corps (`…_base`) ; les fonctions du même nom y ajoutent ceux du guide.
- API : la répartition nationale rend la moyenne des bornes hautes (`valeur_max_moyenne`) et, par commune, `valeur_max` ;
  la résorption se pose par la modification d'un point.
- **Écrans** (FR, AR) : la fourchette dans la carte, le panneau (deux courbes, borne basse et borne haute) et la
  répartition ; « Marquer résorbé » dans l'écran des points.
- Campagne **`indicateurs-guide`** (76e), 51 contrôles, contre un témoin indépendant (`tests/indicateurs_guide_attendus.py`) :
  les refus ; trois communes (tout pesé, rien de pesé, mois mêlé) ; le prestataire qui rend l'estimation incomplète ;
  « non renseigné » et « ce qui manque » ensemble ; le zéro de points noirs seulement déclaré ; la répartition ; l'avis.
  Le mutant qui calcule un taux de collecte sur un mois à moitié pesé la fait échouer.

### Modifié
- `completude` : la population et la production théorique débloquent aussi les taux du guide ; les pesées, la
  collecte et le remplissage ; un circuit, la collecte estimée.

### Corrigé
- **La compilation à la volée (JIT) de PostgreSQL rendait les calculs lents** : le tonnage estimé d'un mois (17.2) prenait
  3,4 s, la fiche annuelle d'une commune et ses séries près d'une minute. Le planificateur surestime le coût de ces
  requêtes à fonctions imbriquées et compile ; sans compilation, 33 ms et une demi-seconde. Les fonctions de la
  volumétrie et des indicateurs portent `jit = off` (la campagne `indicateurs-guide` le vérifie) ; le reste de la base
  garde son réglage.

## [0.15.79] — 2026-10-26 — Lot 17.2 : le moteur volumétrique

`DECISIONS_2026-10-20.md`, compléments des 25 et 26/10/2026 ; `SPEC_v0.16.md`, R4. Une commune sans pont-bascule n'avait
aucun tonnage. La méthode du guide de référence — volume de la benne × densité des déchets dans cet équipement — est
posée, avec ses garde-fous.

### Ajouté
- **Migration 088** — `densites_reference`, la matrice nationale des densités (flux DMA), datée et sourcée, tenue par la
  FNCT : benne tasseuse **0,35** de 7 à 8 m³ et **0,5** au-delà de 8 m³ (rien sous 7 m³) ; tracteur et remorque
  compactrice **0,3** ; benne basculante, tracteur et remorque agricole, pick-up et ampli-roll (non compactants,
  décision du 26/10/2026), poubelles et conteneurs **0,20 – 0,25**. Une valeur ne se réécrit pas, une autre s'ajoute ;
  une valeur saisie à tort se retire avec son motif. **La base refuse** une benne qui tasse moins dense qu'une benne qui
  ne tasse pas, des bornes à l'envers, une valeur sans source, un équipement inconnu, une tranche qui en chevauche une
  autre.
- `app.densite_retenue()` et **`app.tonnage_estime(commune, mois)`** : par circuit, les voyages attendus jusqu'à
  aujourd'hui ; ceux qui ont une pesée sont comptés pesés et **ne s'estiment pas** ; pour les autres, volume de la benne
  de travail (lot T) × densité **du jour**, en fourchette, **benne pleine**. Le pesé est rendu à côté, **jamais
  additionné**. Sans tout ce qu'il faut, « ce qui manque » le dit (flux, engin, classe, volume, remorque, voyages,
  densité) — jamais 0.
- « À vérifier » (`app.incoherences_volumetrie`, information) : une benne qui, pleine, dépasserait la charge utile de
  l'engin. Avis traduit en arabe.
- `/volumetrie/densites` (lecture ; nouvelle valeur et retrait pour la FNCT), `/volumetrie/tonnage` (avec export).
- **Écrans** (FR, AR) : l'onglet **Estimation** des pesées (`communal/TonnageEstime.tsx`) — par circuit la benne, les
  voyages attendus, pesés et estimés, la fourchette « benne pleine » avec sa formule, le pesé dans sa colonne, ce qui
  manque et le geste qui le comble ; *Paramètres nationaux* : la matrice, son historique, révision et retrait
  (`national/MatriceDensites.tsx`).
- Campagne **`volumetrie`** (75e), 61 contrôles, contre un témoin indépendant (`tests/volumetrie_attendus.py`, qui ne
  lit que le scénario et la méthode) : les refus ; les bornes de 7 et 8 m³ ; l'attelage ; la densité du jour (révision
  en cours de mois) ; chaque « ce qui manque » ; le pick-up et l'ampli-roll ; **aucune estimation ajoutée au pesé** ;
  l'avis de charge utile et son arabe ; l'export ; la matrice rendue ligne entière en partant. Le mutant de la SPEC v0.16
  (estimer aussi les voyages pesés) la fait échouer.

### À savoir
- Aucun circuit réel ne s'estime encore : ses engins n'ont pas de classe (lot T), ou le circuit n'a pas d'engin. Chaque
  ligne dit ce qui manque.

## [0.15.78] — 2026-10-25 — Lot T : la typologie des engins de collecte

`DECISIONS_2026-10-20.md`, complément du 25/10/2026 (suite). Le guide TADAEEM (*Guide d'optimisation de la collecte des
DMA en Tunisie*, USAID TADAEEM, MALE) devient la référence métier de SIIPI ; il entre dans le dépôt avec sa note de
lecture, qui constate ses contradictions (`docs/specs_metier/sources/GUIDE_TADAEEM_LECTURE.md`). Le lot T prépare 17.2 :
le moteur volumétrique et le taux de remplissage ont besoin de la classe de chaque engin et d'un volume dont on sait
d'où il vient.

### Ajouté
- **Migration 087** — `classes_engins`, référentiel national en lecture seule (Tableau 10 du guide) : benne tasseuse,
  benne basculante (Cbb), pick-up, tracteur et remorque agricole (Tag), tracteur et remorque compactrice, ampli-roll et
  caisson ; pour chacune, compactant ou non, plage de volume de référence, types du parc compatibles, source.
- `vehicules.classe_collecte` et `vehicules.volume_provenance` (constructeur, mesuré, déclaré). **La base refuse** une
  classe qui ne convient pas au type (déclencheur ; un tracteur n'en porte jamais), un volume nul ou négatif, une
  provenance sans volume. L'API le refuse avant elle, en disant quoi corriger, et l'import CSV à la ligne.
- **`app.engin_de_travail()`** : la benne qui travaille pour un engin — lui-même, ou pour un tracteur sa seule remorque
  attelée. Sans remorque, ou avec plusieurs, le volume est inconnu et la raison est dite ; **SIIPI ne choisit jamais
  entre deux remorques.** La liste du parc la rend (`travail_*`).
- **« À vérifier »** (`app.incoherences_engins`, information) : le circuit dont le tonnage ne pourra pas être estimé
  (engin sans classe ou sans volume, tracteur sans remorque ou avec plusieurs), le volume hors de la plage de sa classe
  — signalé, jamais refusé. Chaque avis a son arabe.
- `GET /trucks/classes` ; l'export et l'import du parc portent la classe et la provenance du volume, en libellés FR/AR.
- **Écrans** (FR, AR) : `communal/ChampsTypologie.tsx`, dans le formulaire d'ajout d'un engin et dans sa fiche du parc.
  La classe évidente (benne tasseuse, ampli-roll) est **proposée** avec un bouton « Retenir », jamais cochée d'avance ;
  l'aide « Mesurer la benne » calcule longueur × largeur × hauteur et le reporte comme volume mesuré ; un volume hors
  plage est annoncé comme un avis à venir, pas comme une erreur. La fiche d'un tracteur dit quelle remorque porte sa
  benne, ou ce qui manque. *Paramètres nationaux* montre le référentiel et ses sources.
- Campagne **`typologie-engins`** (74e), 56 contrôles : d'abord les refus (classe inconnue, incompatible, sur un
  tracteur ; type changé contre la classe ; volume nul ou négatif ; provenance sans volume ou hors liste ; référentiel
  non inscriptible ; autre commune → 404), à l'API et dans la base ; puis le référentiel, l'engin de travail d'un
  attelage, les avis et leur arabe, l'export et l'import, et aucune classe posée à la place de la commune. Deux mutants
  (déclencheur retiré, remorque choisie au hasard) la font échouer.

### Modifié
- La ligne d'un engin dans le parc ne commence plus par « · » quand son âge n'est pas connu.

### À savoir
- **Aucun engin existant n'a reçu de classe** : à Dar Chaabane comme ailleurs, la commune les choisit. D'ici là, ses
  circuits apparaissent dans « À vérifier » (information) : leur tonnage ne pourra pas être estimé par 17.2.

## [0.15.77] — 2026-10-25 — Les noms arabes : douze corrigés par décision (D-NOMS-AR-1)

`DECISIONS_2026-10-20.md` § 6 et son complément du 25/10/2026. Les 44 noms arabes qui différaient de la carte du conseiller
SIG ont été classés et tranchés un par un (`docs/specs_metier/sources/sig/NOMS_ARABES_A_VALIDER.md`) : 12 corrigés,
24 gardés, 8 en attente d'une source officielle.

### Modifié
- **Migration 086** : les douze noms du groupe A (Tazarka : « تزغران » devient « تازركة » ; Tazghrane Boukrim Zaouiet El Mgaiez
  retrouve son nom complet ; Tunis, Sidi Bou Saïd, Bembla El Mnara, El Masdour Menzel Harb, Cherahil, Tlelsa, El Alâa,
  Nasrallah, Ben Guerdane, Bir Lahmar). Un nom n'est corrigé que s'il porte encore le nom constaté : une base où la FNCT
  l'aurait déjà changé n'est pas réécrite. **Rien ne s'efface** : `corrections_referentiel` gagne la nature `nom_arabe`, avec
  l'**ancien et le nouveau nom** (contrainte : les deux, et différents) ; le journal d'audit de `communes` garde chaque
  changement. Le référentiel du seed (`communes_350.json`) porte les nouveaux noms et la correction, pour qu'une base neuve
  arrive au même état.
- `app.corrections_referentiel()` et `GET /observatoire/corrections-referentiel` rendent l'ancien et le nouveau nom ;
  **Paramètres nationaux** les montre (« le nom arabe « … » devient « … » »), en français et en arabe.
- Campagne `noms-arabes` (73e), **17 contrôles** : ce que la base refuse (une correction de nom sans ancien nom, ou sans
  changement) ; sur la base des campagnes, les douze nouveaux noms, chaque ancien nom gardé, aucun autre nom différent du
  référentiel, des noms gardés et en attente intacts ; sur une base jetable qui porte encore les anciens noms, la migration
  corrige, trace au journal d'audit, épargne un nom déjà changé par la FNCT et se rejoue sans doublon ; l'observatoire rend
  l'ancien et le nouveau nom. Un mutant qui retire la garde (« seulement si le nom constaté est encore là ») est détecté.
- La campagne `decoupage` lisait la source de D-FNCT-3 dans la première correction rendue ; les corrections de nom, plus
  récentes, viennent désormais en tête. Elle la cherche par sa décision.

## [0.15.76] — 2026-10-25 — Lot 17.4b : l'écran « Intégration GPS »

Le lot 17.4 est livré (service en 17.4a, écran ici) ; il ne sera recetté qu'avec Menzel Chaker, dont la documentation de
l'API et un accès de test sont attendus. Plan validé le 23/10/2026, avec la FNCT en lecture seule et l'entrée visible pour elle.

### Ajouté
- **L'écran « Intégration GPS »** du portail communal (pôle Flotte, après « Parc » ; `composants/communal/IntegrationGps.tsx`),
  en français et en arabe :
  - **l'état d'abord** : le fournisseur, actif ou éteint ; la date du dernier relevé reçu, ou « aucun relevé reçu » en mots ;
    le dernier échec et son message, en rouge s'il est plus récent que le dernier relevé (« rien d'autre n'est bloqué ») ;
  - **la configuration** : qui appelle qui (chaque mode expliqué), l'adresse et la cadence, l'authentification ; **le jeton en
    écriture seule** (« enregistré le … — laissez vide pour le garder ») ; la correspondance des champs, avec un exemple pour
    chacun, et le format de l'horodatage ;
  - **« Essayer »**, qui lit sans rien enregistrer (une interrogation, ou un envoi collé pour un fournisseur en push), avec l'aide
    décidée le 23/10/2026 : « Si votre fournisseur change son API, recliquez sur Essayer pour vérifier le mapping. » **Un
    horodatage illisible montre la valeur reçue ET le format attendu, avec un exemple, et quoi corriger** (« Horodatage illisible :
    2026/10/23 14:00 — Attendu : Timestamp Unix (millisecondes), par ex. 1761224400000. Vérifiez « Format de l'horodatage » dans la
    configuration. ») ; une date avant 2020 ou dans l'avenir est dite impossible. « Interroger maintenant » et son bilan ;
  - **le webhook** : l'adresse à donner au fournisseur, le secret généré et **montré une seule fois**, la façon de signer un envoi ;
  - **les boîtiers** : leur engin, depuis, jusqu'au, « Clore » (avec confirmation ; la correspondance reste dans l'historique) ;
  - **les positions signalées**, par boîtier et motif, en mots ; « Rattacher ce boîtier à un engin » ouvre le formulaire déjà
    rempli ; pour un horodatage illisible, la dernière valeur reçue et l'indice que le format a peut-être changé ;
  - **la carte** (`FondsDeCarte`) : la dernière position de chaque engin, et la trace du jour d'un engin choisi.
- **La FNCT voit le même écran en lecture seule**, l'entrée visible : champs désactivés, aucun geste, un bandeau le dit.
- **`ajout/FormulaireBoitierGps.tsx`** : le seul formulaire qui rattache un boîtier (`appels-creation.json`, vérifié par
  `npm run lint`), aussi dans le catalogue « + Ajouter » ; il ne propose que les engins de la commune.

### À savoir
- Captures FR et AR prises sur la pile d'essai, dans une commune de test avec le faux fournisseur (une date au format changé, un
  boîtier inconnu, une position hors de Tunisie), puis retirée.

## [0.15.75] — 2026-10-23 — Lot 17.4a : le connecteur GPS générique (le service)

`DECISIONS_2026-10-20.md` § 8 et ses compléments du 23/10/2026. Livrable avec un faux fournisseur ; recetté seulement avec Menzel
Chaker, dont la documentation de l'API et un accès de test sont attendus. L'écran « Intégration GPS » est le lot 17.4b.

### Ajouté
- **Migration 085** : `gps_fournisseurs` (un par commune : pull ou push, authentification, **correspondance des champs JSON**,
  état du dernier relevé), `gps_secrets` (le jeton et le secret du webhook, **chiffrés par l'API**, illisibles pour le rôle de
  l'application, sans journal d'audit), `gps_boitiers` (boîtier → engin, daté, clos et jamais effacé ; un engin de la commune
  seulement), `traces_engins` (provenance « GPS fournisseur » ; **engins seulement**, aucune colonne vers une personne ; dans
  la Tunisie ; horodatage ni avant 2020 ni plus de 10 minutes après la réception ; une position reçue deux fois gardée une
  fois ; **`agregee_le`**, vide, réservée au résumé des vieilles traces : « Date à laquelle cette trace a été résumée. NULL =
  trace brute. »), `gps_positions_non_rattachees` (signalées avec leur motif, jamais rattachées au hasard). Le seul chemin vers
  les traces : `app.enregistrer_positions_gps()`. La commune écrit, la FNCT lit, le prestataire ne lit pas (RLS).
- **Le service** (`services/gps.ts`) : il ne connaît aucun fournisseur ; il lit selon la correspondance de la commune.
  **Un horodatage illisible reste illisible** : jamais remplacé par « maintenant » — un fournisseur qui change son format de
  date voit ses positions signalées (« horodatage_invalide », la date brute gardée), pas datées de leur réception. Une date
  ISO sans fuseau est lue à l'heure de Tunis ; une date de calendrier impossible est illisible. **Pull** : un planificateur
  (actif en production) interroge chaque fournisseur dû, à sa cadence, en 10 secondes au plus ; une panne est notée
  (message sans jeton), l'écran garde la date du dernier relevé, rien d'autre n'est bloqué. **Push** : `POST /gps/webhook/{id}`,
  sans compte, **signé** (HMAC-SHA256 de « horodatage.corps », secret de la commune, fenêtre de 5 minutes contre le rejeu),
  débit limité par fournisseur.
- **Les routes** `/gps/…` (11) : configuration (le jeton s'écrit et ne se relit jamais), essai sans enregistrement (une
  interrogation, ou un exemple collé), interrogation immédiate, secret du webhook montré une seule fois, boîtiers, positions
  signalées par boîtier et motif, traces (dernière position de chaque engin, trace d'un jour).
- **`SIIPI_SECRET_GPS`** : la clé des secrets GPS, refusée en production à sa valeur de développement, vérifiée par
  `verifier_env.sh`, passée par le compose de production (planificateur actif).
- Faux fournisseur générique (`tests/outils/faux_gps.py`) et campagne `gps` (72e), **58 contrôles**, qui commence par les refus de
  la décision : jeton relu (ni par l'API, ni en base, ni au journal d'audit, ni dans les journaux de l'API), table des secrets
  illisible pour l'application, webhook non signé, mal signé, rejoué, inconnu ; boîtier sur un engin d'une autre commune ; hors
  de Tunisie ; sans engin ; horodatage illisible, impossible, avant 2020, dans deux jours ; prestataire, autre commune, FNCT qui
  écrit. Puis l'essai, l'interrogation et ses doublons, quatre pannes, le boîtier clos, le webhook et sa limite, la cadence du
  planificateur, et des circuits, points relevés et engins qui n'ont pas bougé. **Quatre mutants détectés**, dont celui demandé
  le 23/10/2026 : un horodatage illisible remplacé par « maintenant » fait échouer six contrôles.

### À venir (17.4b)
- L'écran « Intégration GPS » du portail communal, avec sa carte, et l'aide décidée le 23/10/2026 près du bouton « Essayer » :
  « Si votre fournisseur change son API, recliquez sur Essayer pour vérifier le mapping. » (FR et AR).

## [0.15.74] — 2026-10-23 — Chantier P, lot P6 : le déploiement et la mise à jour — le chantier P est clos

Sixième et dernier lot de la préparation à la mise en production (`DECISIONS_2026-10-20.md` § 2 et § 4, et complément
du 23/10/2026 : référentiels seuls, retour arrière automatique avant la réouverture, page de maintenance).

### Ajouté
- **`backend/exploitation/deploiement/`** — les trois procédures, et leurs documents dans `docs/exploitation/`
  (`INSTALLATION.md`, `MISE_A_JOUR.md`, `RETOUR_ARRIERE.md`) :
  - **`verifier_env.sh`** : le `.env` d'un serveur, **lu, jamais exécuté**, refusé sur un secret absent, de
    développement ou trop court, un domaine ou un certificat absent, `localhost` hors essai, un certificat de la DSI
    introuvable, aucune clé de sauvegarde valide ; une seule clé, ni copie, ni SMTP, ni adresse d'alerte sont signalés.
  - **`installer.sh`** : toujours sur une base neuve (refus si le volume existe) ; images **étiquetées par la version**
    (le compose de production n'a plus d'image `latest`) ; base migrée puis **fixée « production » avant tout
    chargement** ; archive froide ; **référentiels nationaux seuls** (communes, découpage officiel, normales
    climatiques) ; premier compte de la FNCT, mot de passe provisoire affiché une fois ; contrôles (HTTPS, ports,
    versions fantômes) ; première sauvegarde et premier passage de la surveillance.
  - **`mettre_a_jour.sh`** : images construites pendant que l'ancienne version sert ; **page « maintenance en cours »**
    (FR et AR, 503, `web/public/maintenance.html`, témoin sur un volume que tient Caddy) ; API arrêtée ; sauvegarde
    chiffrée (en échec : rien ne change) ; **copie de la base dans le serveur PostgreSQL** (`CREATE DATABASE … TEMPLATE`) —
    la sauvegarde est chiffrée pour des clés que le serveur n'a pas, il ne peut pas la relire seul ; migrations,
    démarrage, contrôles (API saine, migrations au compte de l'image, frontal qui joint l'API) ; **retour arrière
    automatique** si un contrôle échoue avant la réouverture — personne n'ayant écrit depuis la copie, rien n'est perdu.
  - **`revenir.sh <base> <version>`** : met en service une autre base avec la version qui la connaît ; la base courante
    est **renommée** `siipi_national_abandonnee_<date>`, jamais effacée. Sert au retour arrière automatique et, après une
    restauration (P3), à la remise en service.
  - Chaque geste est inscrit dans `deploiements.log` (exclu du dépôt).
- **`essai_bout_en_bout.sh`** : les trois procédures jouées sur une pile jetable de ce poste — installation, une mise
  à jour qui ajoute une migration, une mise à jour dont la migration échoue et revient seule en arrière — **23 contrôles
  réussis**, puis tout retiré. Hors de `npm test` (les campagnes n'ont pas Docker), versionné pour être rejoué par la DSI.
- `seed:referentiel` (et `:prod`), `seed:normales-climat:prod` : les chargements de référence dans l'image de production.
- Campagne `installation-garde` (71e), 22 contrôles : les refus de `verifier_env.sh` (dont un `.env` piégé qui n'est pas
  exécuté), ses avertissements, et le seed — référentiel seul sur une base de production ou avec `--referentiel`, la
  démonstration inchangée en développement. Trois mutants détectés. La campagne `proxy-https` éprouve la page de
  maintenance (front et API en 503, `Retry-After`, levée).

### Corrigé
- **Le seed posait de la démonstration dans une base de production** : il s'abstenait des comptes, mais posait encore
  6 camions, 6 conteneurs, 3 secteurs et un barbécha fictifs dans La Marsa, Sfax et Djerba — des communes réelles (le
  mutant qui retire la correction les retrouve). En production, ou avec `--referentiel`, il ne charge que le référentiel.
- `scripts/skills/versions-fantomes.sh` accepte le compose d'un serveur (`DC`) ; `ports-production.sh` fournit
  `SIIPI_VERSION`.

### Le chantier P est clos
P1 (refus des campagnes), P2 (sauvegardes chiffrées), P3 (restauration testée), P4 (HTTPS), P5 (supervision), P6
(déploiement). Ce qui reste hors du dépôt attend la DSI : l'hébergeur, le nom de domaine et son DNS, les ports 80 et
443, la destination de la copie hors serveur, le compte SMTP, l'adresse des alertes, et une surveillance extérieure.

## [0.15.73] — 2026-10-23 — Chantier P, lot P5 : la supervision

Cinquième lot de la préparation à la mise en production (`DECISIONS_2026-10-20.md` § 4 : « /health surveillé, alerte si la
plateforme ou la sauvegarde échoue »).

### Ajouté
- **Le service `surveillance`** (`backend/exploitation/surveillance/`, `docker-compose.prod.yml`), **à part de l'API** — on ne
  confie pas à l'API le soin de dire que l'API est tombée. Toutes les 5 minutes : l'API (`/health`, base comprise), le site à
  travers le frontal, le certificat (moins de 14 jours avant l'expiration : le renouvellement automatique a cessé), la
  sauvegarde (dernière réussite de plus de 26 h, ou échec plus récent qu'elle, d'après les témoins de P2), la copie hors
  serveur (« non configurée » : à surveiller), le disque (un volume plein à plus de 85 %). Chaque constat en français et en
  arabe. Aucun port ; volumes en lecture seule, sauf le sien.
- **L'alerte part au changement d'état seulement** : « en panne » au premier constat, plus rien tant que cela dure, puis
  « rétabli » — un seul courriel pour plusieurs contrôles qui changent ensemble. Par le serveur SMTP de l'API, vers
  `SUPERVISION_DESTINATAIRES` ; le mot de passe du serveur ne passe ni sur une ligne de commande ni dans un fichier. Sans
  serveur ou sans destinataire, rien ne part, et l'état le dit.
- **`GET /supervision/etat`** (FNCT seule) lit le constat écrit par la surveillance, sans rien recalculer : chaque contrôle,
  depuis quand, son message dans les deux langues, la dernière alerte (sans ses destinataires ni le serveur). **Un constat de
  plus de trois intervalles est dit périmé** — si la surveillance elle-même s'arrête, son dernier « tout va bien » ne passe
  pas pour actuel ; sans constat, `disponible` est faux et rien n'est supposé.
- **L'écran « État de l'exploitation »** (observatoire, pôle Performance & déploiement), en français et en arabe : en tête,
  un bandeau rouge si le constat est périmé ; des effectifs de contrôles (en panne, à surveiller, en service — jamais un
  score) ; une carte par contrôle avec son état en mot et en pastille, son message, depuis quand ; les alertes, et le rappel
  qu'une surveillance extérieure au serveur reste nécessaire. Captures FR et AR prises sur un vrai passage de la surveillance.
- Campagne `supervision` (70e), 37 contrôles, avec une fausse API, des témoins fabriqués, un certificat de 5 puis de 60 jours
  et le serveur SMTP d'essai : une alerte et une seule par panne, la date de début gardée, « rétabli » une fois ; l'échec plus
  récent, l'API muette, le disque, la copie, le certificat ; sans SMTP ; la route (refus sans compte et pour un directeur,
  ordre, deux langues, aucun secret, périmé, absent). Quatre mutants détectés : une alerte à chaque passage, le « rétabli »
  jamais envoyé, le seuil de 26 h ignoré, un constat périmé non signalé.
- L'image a été construite et a fait un passage contre l'API de la pile d'essai.

### Corrigé
- `scripts/skills/ports-production.sh` (v0.15.72) échouait sans rien vérifier : il ne fournissait pas `SIIPI_SECRET_IDENTITES`,
  devenue obligatoire au même lot. Il la fournit ; il est inscrit dans le README des outils.

### Incident pendant le lot (consigné)
- Pendant le critère de P4, le fichier de route de ce lot a été créé sous le nom `exploitation.routes.ts`, déjà pris par le
  lot 16.3 (carnets de bord, carburant) : il l'a écrasé, les API d'essai ne démarraient plus et le critère a échoué. Le
  fichier a été restauré depuis git avant tout commit, le critère de P4 relancé et passé ; la route de ce lot s'appelle
  `supervision.routes.ts`. Rien de faux n'a été livré.

## [0.15.72] — 2026-10-23 — Chantier P, lot P4 : le frontal HTTPS

Quatrième lot de la préparation à la mise en production (`DECISIONS_2026-10-20.md` § 4 et complément du 23/10/2026 : Caddy).

### Ajouté
- **Le service `frontal`** (`docker-compose.prod.yml`) : Caddy 2.11, dont l'image (`web/Dockerfile`) construit le front
  (`npm run build`, typage compris) et le sert à `/`, et relaie `/api` vers l'API (préfixe retiré, comme le serveur de
  développement de Vite). **Une seule origine** : plus de CORS entre le front et l'API. La configuration
  (`backend/exploitation/frontal/Caddyfile`) est montée par le compose, et c'est ce fichier-là que la campagne éprouve.
- **Le certificat**, par `SIIPI_TLS` : une adresse électronique (Let's Encrypt, obtenu et renouvelé seul), les chemins du
  certificat de la DSI (déposé dans `./certificats`, que `.gitignore` exclut), ou `internal` pour un essai sur un poste.
  HTTP renvoie vers HTTPS (308), HSTS est posé, Caddy ne dit pas ce qu'il est. Le service worker et l'index ne sont jamais
  mis en cache ; les fichiers construits, à empreinte, se gardent un an.
- **Le frontal est la seule porte** : l'API (4000) et la base n'ont plus aucun port sur l'hôte ; seuls 80 et 443 sont
  publiés. `scripts/skills/ports-production.sh` le vérifie sur la configuration résolue et sort en erreur sinon (éprouvé :
  un port 4000 remis à l'API est signalé).
- **`TRUST_PROXY`** (`src/config.ts`, `app.set('trust proxy')`) : derrière Caddy, toutes les requêtes auraient l'adresse du
  proxy, et la limite des tentatives de connexion (20 par quart d'heure) serait devenue celle de **tout le pays**. Avec
  `TRUST_PROXY=1`, l'API lit l'adresse réelle que Caddy écrit dans `X-Forwarded-For` (un en-tête forgé par l'appelant ne
  passe pas Caddy) ; le journal des requêtes aussi. Vide, l'en-tête est ignoré. `TRUST_PROXY=true` est refusé au démarrage :
  il laisserait tout appelant choisir son adresse.
- Campagne `proxy-https` (69e), 19 contrôles, avec un vrai Caddy en HTTPS devant une API à part : `TRUST_PROXY=true` refusé ;
  sans proxy de confiance, un en-tête changé à chaque essai n'échappe pas à la limite ; HTTP → HTTPS (308) ; `/api` et `/` ;
  une adresse de l'application qui rend l'index ; en-têtes de cache, HSTS, `helmet` ; à travers Caddy, un en-tête forgé
  n'échappe pas à la limite ; **deux appelants réels ont chacun la leur**. Quatre mutants détectés : la confiance au proxy
  retirée, `TRUST_PROXY=true` accepté, le renvoi vers l'index retiré, HSTS retiré.

### Corrigé
- **Le compose de production ne passait pas `SIIPI_SECRET_IDENTITES` à l'API**, qui refuse alors de démarrer en production
  (secret de développement détecté, depuis la v0.15.5). Ni les réglages du courriel ni ceux des notifications push. Le
  compose de production n'avait jamais été démarré : le premier démarrage réel, à ce lot, l'a montré. Ils y sont, le secret
  obligatoire, les autres facultatifs (« non configuré » sans eux).

### Essai réel
- Le compose de production a été construit et démarré sur ce poste (`localhost`, autorité locale de Caddy), puis retiré :
  migrations, API saine derrière Caddy, base devenue « production », HTTP → HTTPS, index et fichiers construits avec leurs
  en-têtes, mot de passe de démonstration refusé, API et base sans aucun port publié, adresse réelle de l'appelant au journal
  de l'API, page de connexion affichée en HTTPS.

## [0.15.71] — 2026-10-23 — Chantier P, lot P3 : la restauration testée

Troisième lot de la préparation à la mise en production (`DECISIONS_2026-10-20.md` § 4 : « une campagne restaure la
dernière sauvegarde sur une base neuve et vérifie que les recomptages sont identiques »).

### Ajouté
- **`restaurer.sh <archive> <clé privée> <base neuve> <dossier neuf>`**, dans l'image de sauvegarde. Elle **ne restaure
  jamais par-dessus quelque chose** : une base cible qui existe, un dossier non vide, et elle refuse avant tout
  déchiffrement. La clé privée est lue depuis son fichier (le support hors ligne de la personne de la FNCT), jamais copiée.
  Le déchiffrement se fait au vol vers `pg_restore` et `tar` ; `age` vérifie l'intégrité. La base redevient ce qu'elle
  était, **nature comprise** : une sauvegarde de production restaurée est une base de production. Le rôle `siipi_app` et le
  droit du compte de l'API de l'endosser, qui vivent hors de la base, sont recréés comme la migration 013 les crée — ce
  qu'exige un serveur neuf.
- **La vérification contre le manifeste** : nature, nombre et dernière migration, nombre de lignes de **chaque table**,
  empreinte de **chaque fichier**, rien de plus ni de moins. Le rapport (`restauration_<base>.json`) nomme chaque écart
  (table, attendu, obtenu ; fichier manquant, en trop ou différent) ; au moindre écart, la sortie est en erreur.
- **Un échec ne laisse rien à moitié** : déchiffrement, restauration ou vérification qui échoue, la base créée est retirée
  et le dossier vidé. Remettre une base restaurée en service est une procédure écrite (lot P6), pas un geste du script.
- Campagne `restauration` (68e), 31 contrôles. Les refus : sans arguments, base cible existante (non touchée), dossier non
  vide (fichier intact), autre clé, archive abîmée d'un seul octet, fichier qui n'est pas une archive — chaque fois ni base
  ni fichier laissés. Un manifeste refait faux (40 lignes annoncées au lieu de 41, un fichier en moins) : deux écarts nommés,
  base retirée. Une base d'essai restaurée (lignes et géométries, fichiers identiques, chacune des deux clés, une API qui
  démarre dessus et se dit en bonne santé). Une sauvegarde de production restaurée reste de production, et le lanceur des
  campagnes la refuse (P1). **La base des campagnes elle-même**, sauvegardée en lecture seule et restaurée à part : plus de
  cent tables, Dar Chaâbane comprise, tous ses fichiers, aucun écart, et son journal d'audit n'a pas bougé. Trois mutants
  détectés : les fichiers oubliés, les écarts de comptes ignorés, une base cible existante acceptée.
- L'image a été construite et a fait l'aller-retour complet contre la base de la pile d'essai : 101 tables, 22 052 lignes,
  aucun écart.

### Corrigé
- **La sauvegarde échouait au-delà de quelques centaines de fichiers** (v0.15.70) : les empreintes passaient en argument à
  `jq`, et une ligne de commande a une longueur maximale — « Argument list too long » avec les 884 fichiers de la pile
  d'essai. La restauration de la base des campagnes l'a révélé ; les essais de P2 n'avaient que quelques fichiers. Les
  empreintes et les comptes passent désormais par des fichiers. La campagne `sauvegarde` (56 contrôles) sauvegarde un
  dossier de 2 003 fichiers et vérifie que le manifeste les compte tous ; la version de la v0.15.70 y échoue. Aucune
  installation n'était touchée : le service de sauvegarde n'a encore tourné sur aucun serveur.
- Les campagnes `sauvegarde` et `restauration` utilisent les outils PostgreSQL 16, ceux de l'image : le `pg_dump` plus
  récent du conteneur des campagnes écrit un réglage (`transaction_timeout`) qu'un serveur 16 refuse à la restauration.

## [0.15.70] — 2026-10-23 — Chantier P, lot P2 : les sauvegardes chiffrées

Deuxième lot de la préparation à la mise en production (`DECISIONS_2026-10-20.md` § 4 et son complément du 23/10/2026).

### Ajouté
- **Le service `sauvegarde`** (`docker-compose.prod.yml`, image `backend/exploitation/sauvegarde/`) : chaque nuit à
  `SAUVEGARDE_HEURE` (02:30, heure de Tunis, par décision du 23/10), une archive `siipi_<instance>_<date>_<heure>.tar` qui
  prend **ensemble** la base (`pg_dump -Fc`, dans un instantané) et les fichiers déposés (pris après la base : toute photo que
  la base cite y est), avec un **manifeste** — nature de la base, nombre de migrations, nombre de lignes de chaque table lu
  dans le même instantané que le dump, empreinte SHA-256 de chaque fichier. C'est ce que la restauration (P3) comparera.
- **Chiffrée par clés publiques `age`** : le serveur ne porte que `SAUVEGARDE_DESTINATAIRES`, il sait chiffrer, pas
  déchiffrer. Deux clés, une par personne de la FNCT (décision du 23/10) : chacune restaure seule, perdre une clé ne perd
  aucune sauvegarde. Sans clé valide (absente, ou refusée par `age`), la sauvegarde ne part pas : elle n'écrit jamais une
  archive en clair. La base et les fichiers sont chiffrés au vol.
- **Un échec ne passe jamais pour une réussite** : le passage est d'un seul bloc, une étape qui échoue retire l'archive
  partielle et écrit `dernier_echec.json` (quand, quelle étape, pourquoi) sans toucher `derniere_reussite.json`. Une
  archive n'a son nom définitif qu'une fois complète. La supervision (P5) lira ces deux témoins.
- **La rotation** (`rotation.sh`, une fonction pure sur les noms) : une archive par date, la plus récente de la journée ;
  7 dates, 4 dimanches, 12 premiers du mois. Elle compte les archives existantes, pas les jours du calendrier : des semaines
  d'échec ne retirent jamais les dernières bonnes. Un nom qu'elle ne reconnaît pas n'est ni gardé ni retiré.
- **La copie hors du serveur** par `rclone` vers `SAUVEGARDE_DESTINATION` (un chemin monté, ou un distant décrit dans
  `sauvegarde.env`), vérifiée après envoi, avec la même rotation. **Jamais en miroir** : un serveur réinstallé, au dossier
  vide, effacerait toutes les copies. Sans destination, le témoin dit « non configurée ».
- **L'archive froide des originaux** (D-FNCT-4) part original par original, chiffré, **une seule fois** (index des envois,
  chemin et empreinte), et n'est jamais effacée à la destination.
- Campagne `sauvegarde` (67e), 54 contrôles, sur une base d'essai à part et des dossiers temporaires : les refus (sans clé,
  clé qui n'en est pas une, clé tronquée, base injoignable — aucune archive, échec écrit, réussite intacte) ; une archive
  illisible sans clé (ni dump, ni nom de fichier, ni nom de table en clair), ouverte par chacune des deux clés et pas par une
  troisième ; un manifeste exact (nature, migrations, lignes d'une table témoin, autant de tables que la base, empreintes) ;
  des fichiers repris identiques ; la rotation contre un témoin Python écrit d'après la règle seule, sur plus d'un an de noms
  fabriqués ; la copie hors serveur identique, sa rotation, l'absence de miroir ; l'archive froide envoyée une fois et gardée ;
  une destination injoignable (échec, archive locale gardée). Cinq mutants détectés : le dump en clair, une rotation à
  8 jours, un échec qui écrit « réussite », une copie en miroir, des originaux renvoyés.

### À savoir
- L'image a été construite et lancée contre la base de la pile d'essai : `pg_dump` 16.15 (la version du serveur), heure de
  Tunis, archive lisible avec la clé, horaire posé à 02:30, heure invalide refusée.
- Reste hors du dépôt et attend la DSI : la destination hors du serveur. Les deux personnes qui gardent les clés privées
  les créent sur leur propre poste (`age-keygen`) ; seule la ligne « public key » vient sur le serveur.

## [0.15.69] — 2026-10-23 — Chantier P, lot P1 : les campagnes refusent une base de production

Premier des six lots de la préparation à la mise en production (`DECISIONS_2026-10-20.md` § 4 et son complément du
23/10/2026). Le plus court, et celui qui protège dès maintenant : une base réelle ne peut plus recevoir une campagne de tests.

### Ajouté
- **Le lanceur des campagnes (`tests/executer.sh`) refuse de partir** si la base n'est pas une base de développement
  (`app.nature_instance()`, migration 067) **ou** si l'API ne l'est pas (`GET /instance`) : une campagne écrit par les deux.
  Le refus vaut pour la **production** et, par décision du 23/10/2026, pour la **formation** — une campagne y poserait ses
  communes de test au milieu des agents formés. **Ne pas savoir vaut refus** : une nature illisible (base injoignable ou
  antérieure à la migration 067), une API injoignable ou qui ne dit pas sa nature. Le refus tombe avant toute campagne, avec
  le code de sortie 5, dit ce qu'est la base ou l'API, et où lancer les campagnes (une pile d'essai). `npm test`, `MIGRER.bat`
  et `TESTS.bat` passent tous par lui. Il n'y a pas de dérogation.
- Campagne `refus-production` (66e), 26 contrôles. Elle bâtit trois bases d'essai à part (`tests/outils/instance_essai.sh`),
  rendues production et formation **par leur propre API**, comme sur un serveur réel. Chaque refus est éprouvé par une
  fausse campagne (`tests/outils/sonde_lanceur.sh`) qui écrirait dans sa base : après un refus, la base n'a pas bougé, pas
  même son journal d'audit. Sont refusées : la base de production, l'API de production devant une base de développement, la
  base et l'API de formation, l'API injoignable, la base introuvable. Puis la même sonde, sur une base et une API de
  développement, part et écrit. Trois mutants du lanceur sont détectés : la garde de la base retirée (7 contrôles échouent),
  celle de l'API (7), « ne pas savoir » qui ne refuse plus (6).

### À savoir
- Une base neuve est « développement » jusqu'à ce qu'une API de production la serve la première fois. La procédure
  d'installation (lot P6) fixera sa nature avant tout chargement : c'est la garde qui protège une base réelle, pas l'espoir
  qu'on ne s'y trompera pas.

## [0.15.68] — 2026-10-22 — Jalon D, lot D4 : la bibliothèque nationale des données

Pour montrer le rôle de SIIPI dans la **capitalisation des données** de la gestion des déchets : un catalogue de tout ce qu'il
réunit, par commune, gouvernorat et district (SPEC_D § D4).

### Ajouté
- **L'écran « Bibliothèque des données »**, dans le pôle « Performance & déploiement » de l'observatoire, à côté de
  « Indicateurs & 5 axes ». Neuf éléments en trois groupes — **documents** (le PCGD, les études et rapports, les études de coût
  complet), **références** (la caractérisation des déchets, la population), **séries** (les pesées, les circuits, les points
  relevés, les réclamations). Chaque élément dit « dans SIIPI pour N commune(s) sur M », son nombre, sa période, et sa
  répartition (statut d'un PCGD, niveau d'une caractérisation, nature d'une population ou d'une pesée). Un clic ouvre le détail :
  **par gouvernorat ou par district FNCT** (« N communes sur M », ordre alphabétique), puis **commune par commune** — le titre,
  l'auteur, l'année et le statut des documents, le nombre et la période des séries, le nombre de mois où il y a des pesées —
  avec une recherche et un export Excel ou CSV. Français et arabe (de droite à gauche).
- `GET /bibliotheque` (le catalogue), `GET /bibliotheque/{element}` (le détail) et `GET /bibliotheque/lignes` (à plat,
  exportable) — **réservés à la FNCT** : le ministère la voit depuis un compte FNCT, sans nouveau rôle. Un élément inconnu est
  introuvable (404).
- Migration 084 : `app.bibliotheque_lignes()`, la lecture commune des neuf éléments (une ligne par document, une ligne par
  commune pour les séries et les références). Droits de l'appelant ; communes réelles seulement (ni la démonstration, ni une
  commune retirée) et, pour les tables qui le portent, lignes de provenance « réel ».
- Campagne `bibliotheque` (65e) : ce que la route refuse (sans compte, directeur, prestataire, citoyen, élément inconnu) ; les
  comptes exacts de chaque élément avant et après, dans une commune de test (une version remplacée d'un rapport ne compte pas,
  la population « déclarée » se distingue de l'« estimée », la période et les mois des pesées) ; l'ordre alphabétique ; l'export ;
  et la preuve que lire n'écrit rien, que le chemin d'un fichier ne sort nulle part et qu'aucune donnée personnelle ne sort. Un
  contrôle de rôle retiré à la main est détecté. La campagne a aussi révélé un défaut de la migration en cours d'écriture : la
  « provenance » d'une étude de coût complet dit de qui elle vient, pas si elle est réelle — la filtrer excluait toutes les études.

### Ce que la bibliothèque ne fait pas — par décision
- **Elle ne crée aucune donnée** : elle rend visible ce qui existe et ce qui manque.
- **Elle ne donne accès à aucun fichier** : un rapport est listé, jamais ouvert d'ici ; les fichiers restent dans leur commune.
- **Elle ne classe personne** : territoires et communes dans l'ordre alphabétique.
- Elle ne remplace pas un « non tenu » par un zéro : un élément qu'aucune commune n'a se dit « aucune commune sur M », en mots.
  Les pesées gardent leur nature « pesé » et leur tonnage n'est pas additionné ; une population dit si elle est déclarée ou estimée.

### À savoir
- Sur le banc, la bibliothèque est presque vide (seules la population de référence et les circuits de Dar Chaâbane existent) :
  c'est l'état réel. Les noms de gouvernorats restent en français dans l'écran arabe, comme dans le reste de l'observatoire : c'est
  le lot « noms arabes », à venir.
- Captures FR et AR montrées à Nacer et validées ; la vue remplie a été vérifiée sur des données fictives injectées dans le navigateur
  seulement (rien n'est écrit en base).

## [0.15.67] — 2026-10-22 — « À vérifier » en arabe

Les textes de « À vérifier » viennent de la base **en français seulement** : dans l'accueil et dans le panneau du constat,
l'écran arabe affichait des lignes françaises. D4 (bibliothèque nationale) affichera les mêmes avis ; sans ce lot, il aurait
eu le même défaut bilingue dans sa version arabe.

### Ajouté
- **L'arabe des avis, rendu par l'API** (`services/avisAr.ts`). Chaque avis de `GET /communes/{id}/coherence`,
  `GET /communes/{id}/accueil`, `GET /pesees/coherence` et `GET /communication/coherence` porte désormais `sujet_ar`,
  `constat_ar` et `quoi_faire_ar`. Les neuf fonctions `app.incoherences_*` ne changent pas : leur texte français reste
  celui que la base écrit, mot pour mot. L'API reconnaît ce texte sur un **modèle** (le texte du SQL, `%s` pour une valeur) et
  rend l'arabe correspondant ; les noms propres et les valeurs (un circuit, une immatriculation, un pourcentage) passent
  tels quels, les mots d'un vocabulaire fermé (l'état d'un engin, la séance d'un carnet, la catégorie d'un acteur) sont
  traduits. Soixante-huit textes, avec la terminologie de l'interface (engin = المعدة, circuit = المسلك, parc = الحظيرة,
  réclamation = إبلاغ, inventaire = الجرد). Chiffres latins.
- **Rien ne reste en français sans que les tests le disent.** Un texte qu'aucun modèle ne reconnaît rend `null` en arabe
  (l'écran affiche alors le français, jamais un arabe approximatif). La campagne `avis-ar` (64e) lit la définition des
  fonctions de la base, en retire chaque texte qu'elles écrivent et **exige un modèle pour chacun** ; elle exige aussi
  qu'aucun modèle ne soit orphelin (une phrase française changée sans que l'arabe suive). Puis, dans une commune de test, elle
  éprouve de bout en bout un circuit sans agent, un engin en panne confié à un circuit et un bâchage sous le seuil, par les
  routes qui rendent les avis. Deux défauts introduits à la main (un modèle retiré, une phrase française changée) sont
  détectés.

### Modifié
- « À vérifier » (portail) et l'accueil affichent l'arabe quand il existe (`texteAvis`), le français sinon. Dans l'accueil,
  les avis regroupés gardent leur sujet arabe quand c'est un libellé fixe.

### À savoir
- **Les traductions sont à relire par un arabophone de la FNCT** avant l'usage réel : le vocabulaire reprend l'interface
  existante, les phrases sont nouvelles. Elles se corrigent dans un seul fichier, `services/avisAr.ts`.
- Tout nouvel avis ajouté à une fonction `app.incoherences_*` doit recevoir son modèle dans ce fichier, sans quoi
  `npm test` échoue.

## [0.15.66] — 2026-10-22 — Jalon D, lot D3c : l'accueil du portail, les chiffres à retenir d'abord

Affichage seulement : l'API de l'accueil (`GET /communes/{id}/accueil`, v0.15.63) ne change pas (SPEC_D § D3).

### Modifié
- **Une bande de chiffres à retenir** en tête de l'accueil, chaque carte étant un bouton vers l'écran où l'on agit : le
  constat du jour (« 0 / 13 »), les points à vérifier (avec une pastille « N bloquant(s) »), les indicateurs non
  renseignés. **Des effectifs d'éléments, jamais un total, un pourcentage ou une note** : un score de « ce qui va bien »
  recréerait le palmarès retiré au lot 1. Un zéro n'est affiché que s'il est réel : « aucun circuit attendu » se dit en
  mots, pas « 0 / 0 ».
- **Une carte d'entretiens n'apparaît que s'il y en a de dus.** Sans plan d'entretien, « 0 en retard » se lirait « le
  parc est à jour », ce que rien ne prouve (règle 1.1).
- **Les avis identiques se regroupent.** Soixante-six circuits « en régie sans agent affecté » faisaient soixante-six
  lignes rouges ; ils font maintenant sept avis, chacun avec son nombre (« 13 × … »), ses trois premiers sujets et
  « et N autres ». Aucun écart n'est caché : il est compté. Les noms isolés (`<bdi>`) pour qu'un nom arabe ne s'inverse pas
  dans une phrase française.
- Les deux blocs (« Ce qui va bien », « Ce qui demande une action ») ne s'étirent plus à la hauteur l'un de l'autre ;
  la valeur d'un indicateur et sa source (pastille icône et mot) sont lisibles d'un coup d'œil ; le bouton de chaque
  ligne reste au bord, les indicateurs absents sont en pointillés, les entretiens portent leur pastille.
- Textes FR et AR.

### À savoir (non modifié)
- Les textes de « À vérifier » (constat, ce qu'il y a à faire) viennent de la base en **français seulement** : dans
  l'accueil arabe, ces lignes restent en français. Les traduire demande une migration (une colonne arabe pour ces avis).
- Captures avant/après, FR et AR, sur Dar Chaâbane El Fehri, montrées à Nacer et validées.

## [0.15.65] — 2026-10-21 — Jalon D, lot D3b : la synthèse nationale, les chiffres-clés d'abord

Affichage seulement : aucun calcul, aucune règle, aucun cloisonnement ne change (SPEC_D § D3).

### Modifié
- **Les chiffres-clés passent en tête** de la synthèse, sous le titre : adoption (« 0 / 350 communes actives »),
  population couverte, tonnage pesé, réclamations — la valeur en grand (`ChiffreCle`), le libellé en phrase et non en
  capitales. Le tonnage pesé porte une pastille « Pesé » (icône et mot). La carte d'un chiffre
  (`Elements.tsx › CarteIndicateur`, aussi utilisée par l'écran Preuve du portail) prend les mêmes règles.
- **Une valeur absente se tait** : une carte en pointillés et un mot discret, jamais un gros « Non renseigné » aussi
  voyant qu'un chiffre. **Sans commune active, les réclamations sont « non renseignées »**, plus « 0 » : zéro
  réclamation se lirait « aucun problème », alors que personne ne les enregistre encore (règle 1.1).
- **Le suivi du déploiement** : la phrase verte devient quatre chiffres en grand — saisissent, inactives ce mois-ci, pas
  encore démarrées, désactivées — chacun avec sa pastille ; la phrase entière reste pour les lecteurs d'écran. Le gris
  des communes « pas encore démarrées » s'éclaircit dans l'histogramme.
- Ordre de la page : le titre, une proposition de découpage à instruire s'il y en a (elle bloque la commune), les
  chiffres-clés, la carte, le suivi mois par mois, le tableau par territoire.

### Ajouté
- **La carte « Où la plateforme est utilisée »** (`national/CarteDeploiement.tsx`), par gouvernorat ou par district
  FNCT : chaque territoire est teinté selon la part de ses communes qui saisissent ce mois-ci, en cinq teintes ; la
  bulle dit « N communes sur M ». **Gris : aucune commune n'y saisit encore** — pas « mauvais ». À côté, la légende et la
  liste des territoires où l'on saisit, dans l'ordre alphabétique : un suivi, jamais un palmarès. Elle lit les données
  existantes (`GET /observatoire/activite`, `GET /observatoire/contours-gouvernorats`) : aucune route nouvelle.
- Textes FR et AR.

### À savoir (non modifié)
- La population couverte n'est pas marquée « estimée » : l'interface ne porte pas cette information par territoire.
- La carte de répartition d'un indicateur (« Indicateurs & 5 axes ») garde son style.
- Captures avant/après, FR et AR, montrées à Nacer ; la carte colorée a été vérifiée sur des communes fictives qui
  saisissent, simulées dans le navigateur seulement (rien n'est écrit en base).

## [0.15.64] — 2026-10-21 — Jalon D, lot D3a : l'écran Indicateurs, la valeur d'abord

Affichage seulement : les calculs, les règles et le cloisonnement ne bougent pas (SPEC_D § D3).

### Modifié
- **La carte d'un indicateur** (`kpi/CarteIndicateur.tsx`) : la valeur en grand, son unité en petit, son libellé au-dessus ;
  la source dite par une pastille avec un dessin et un mot (« Mesuré », « Déclaré »), et par un filet de couleur sur le
  bord de la carte (propriété logique : il passe à droite en arabe). L'atteinte de l'objectif est un filet fin et les mots
  « 33 % de l'objectif », seulement quand la commune a un objectif. La courbe de douze mois est plus discrète, et la
  **tendance** dit l'écart entre le premier et le dernier mois renseignés (« +2,4 pts depuis mars 26 »), sans couleur ni
  jugement — pour des réclamations, une hausse n'est pas un progrès — et seulement avec deux mois au moins.
- **Un indicateur non renseigné se tait** : une carte en pointillés, le mot « Non renseigné » discret, « Voir ce qui
  manque ». Dix-sept absences au même poids que deux mesures réelles les auraient noyées (règle 1.1 : jamais un 0, jamais
  un « — » qui prétend calculer).
- Le haut de l'écran : « 2 indicateurs calculables sur 19 » avec le nombre en grand ; les cartes des axes et l'indice
  sur 100 reprennent le même chiffre en grand ; plus d'étiquette en capitales.
- **Le panneau de détail** : le chiffre en tête avec sa source, plus d'espace entre les sections, titres lisibles.

### Ajouté
- Un petit kit visuel partagé, `composants/ui/` : `ChiffreCle` (le chiffre isolé, chiffres alignés, sans la police à chasse
  fixe réservée aux colonnes) et `Pastille` (un état avec icône ET mot : la couleur ne porte jamais seule le sens, un
  ton par sens — mesure, déclaré, attention, action, neutre). D3b et D3c s'en servent.
- Textes FR et AR : libellés courts de source, suite de la couverture, tendance.

### À savoir (non modifié)
- Le graphique « 5 ans » d'un indicateur mesuré sur l'état du jour (ex. « Propreté générale, information et mesures
  dissuasives ») est une ligne plate : la mesure est recalculée à l'identique pour chaque année. Il suggère un historique
  qui n'existe pas. À traiter dans un lot à part, hors D3.
- Captures avant/après, FR et AR, sur Dar Chaâbane El Fehri, montrées à Nacer avant la fin du lot (spec D3).

## [0.15.63] — 2026-10-21 — Jalon D, lot D2 : l'accueil du portail communal

### Ajouté
- **Un écran d'accueil**, ouvert par défaut à l'entrée du portail (pôle Cockpit, avant « Constat du jour »), qui
  remplace l'écran d'arrivée d'avant. Le logo et le nom de la commune restent en tête, comme sur tous les écrans ;
  dessous, deux blocs et l'avancement du constat :
  - **« Ce qui va bien »** : les indicateurs dont l'objectif est atteint (un objectif déclaré, un taux de 1) ; les
    autres indicateurs calculés, sans jugement, avec leur valeur et leur source ; les registres tenus ce mois-ci.
  - **« Ce qui demande une action »** : le contenu de « À vérifier » (les mêmes préférences de l'utilisateur
    s'appliquent : un avis bloquant s'affiche toujours), les indicateurs non renseignés avec « Ce qui manque » — le
    lien ouvre l'écran des indicateurs sur le panneau de CET indicateur —, les entretiens en retard ou à prévoir.
  - **Le constat du jour** : « N circuits contrôlés sur M attendus aujourd'hui », et la porte vers l'écran du constat.
  - Chaque ligne mène, en un clic, à l'écran où l'on agit ; un bloc montre cinq lignes, puis renvoie à l'écran
    complet. La FNCT qui ouvre le portail d'une commune lit la même chose.
- **Une commune qui n'a rien saisi** (hors population et périmètre, qui viennent du référentiel national) voit
  « Ma commune dans SIIPI » — le parcours de démarrage — et non un tableau de zéros.
- `GET /communes/{id}/accueil` (`routes/accueil.routes.ts`) : une réponse pour tout l'écran, plutôt que six appels lus
  à des instants différents. Elle ne calcule rien de plus : indicateurs du service des 5 axes, registres de
  `app.completude_commune`, écarts de `app.incoherences_commune`, entretiens de `app.echeances_entretien`. Une
  commune hors du périmètre de l'appelant est introuvable (404). Aucune migration.
- Campagne `accueil` (63e) : ce que la route refuse (sans compte, citoyen, prestataire, directeur d'une autre commune,
  commune inconnue) ; ce que l'écran ne dit jamais (un total, un pourcentage, un indicateur sans source parmi ce qui
  va bien, un non renseigné rangé avec ce qui va bien, un 95 % dit « objectif atteint ») ; puis le parcours — circuits
  attendus et constat posé, déclarations, entretien en retard, écart bloquant. Deux défauts introduits à la main
  (seuil d'objectif abaissé, contrôle de périmètre retiré) sont détectés.

### Corrigé
- **Une session dont le compte n'existe plus dit « reconnectez-vous ».** Le jeton est signé et l'API ne relit pas `users` à
  chaque requête : après un rechargement de la base (jeu d'essai, restauration) ou la suppression du compte, une session
  ouverte avant continuait de lire, puis son premier dépôt — un logo — échouait sur la clé « déposé par » et recevait
  « Requête incohérente avec les données existantes », qui envoyait chercher un défaut dans le fichier. Une clé étrangère
  refusée vers `users` est maintenant vérifiée : si l'appelant n'y est plus, c'est un 401, et l'écran revient à la
  connexion. Toute autre clé refusée reste un 400. Éprouvé dans la campagne `logos-communes` (compte supprimé, dépôt
  refusé en 401, rien enregistré).

### Modifié
- Le filtre des préférences d'alerte de « À vérifier » est une fonction partagée (`ecartVoulu`, `Coherence.tsx`) : l'accueil
  ne montre pas ce que « À vérifier » masque.
- `IndicateursCommune` accepte un indicateur d'ouverture (`codeInitial`).
- Vérifié dans le navigateur sur les données de Dar Chaabane (13 circuits attendus, 66 points à vérifier dont 5
  affichés, indicateurs non renseignés nommés), en français et en arabe (de droite à gauche), sur téléphone (pas de
  débordement), et sur une commune vide.

## [0.15.62] — 2026-10-21 — L'observatoire : « Annuaire et carte » en une page, la carte mène au portail, « Modifier » gagne les coordonnées

### Modifié
- **Une seule entrée de menu « Annuaire et carte »** (observatoire national) au lieu de deux (« Annuaire des
  communes » et « Carte des communes ») : les mêmes 350 communes se cherchaient deux fois. La page a deux vues, un
  sélecteur « Annuaire | Carte » en tête ; l'annuaire reste la vue d'ouverture, puisque c'est là que se trouve
  « Modifier ».
- **Sur la carte, un clic sur une commune mène à son portail.** L'encadré qui s'ouvrait avec la liste de chiffres
  (gouvernorat, district, type, population, superficie, densité, secteurs, code) est remplacé par un encadré court :
  le nom de la commune, en français et en arabe, son gouvernorat — qui évite d'ouvrir la mauvaise de deux communes
  homonymes (Ennour, Ezzouhour) — et un bouton « Ouvrir le portail ». La carte se cadre toujours sur la commune
  choisie par la recherche, et l'encadré s'y ouvre.
- **« Modifier » une commune gagne une section « Coordonnées »**, ouverte la première : le téléphone, le fax, le
  courriel, l'adresse, le responsable de la propreté (nom ou fonction) et son numéro — la fiche de la commune
  elle-même (`PATCH /communes/{id}`, `composants/ajout/FormulaireCoordonnees.tsx`), qu'aucun écran ne tenait
  jusque-là. Seuls les champs changés sont envoyés : une fiche rouverte et enregistrée sans rien toucher ne laisse
  pas de ligne de plus au journal d'audit. Elle se distingue de « Contacts », qui tient les interlocuteurs
  extérieurs (l'ANGeD, le gouvernorat, un prestataire). « Modifier » compte désormais quatre sections :
  Coordonnées, Contacts, Limites, Logo.
- **Un champ de la fiche vidé redevient « non renseigné »** : `PATCH /communes/{id}` écrit `NULL` quand on lui
  envoie un texte vide, au lieu de garder une chaîne vide qui se lirait comme une valeur (règle 1.1). Éprouvé dans la
  campagne `logos-communes` (téléphone et adresse enregistrés, adresse vidée, téléphone intact).
- Les libellés devenus inutiles (la fiche chiffrée de la carte, l'entrée « Carte des communes ») sont retirés, en
  français et en arabe ; la consigne de la carte dit « cliquez une commune pour ouvrir son portail ».
- Vérifié dans le navigateur, en français et en arabe (de droite à gauche) : l'entrée unique, la bascule entre les
  deux vues, la carte et ses 350 communes, l'encadré, le bouton qui ouvre le portail de la commune, et la section
  « Coordonnées » (enregistrer un seul champ n'écrit que ce champ au journal d'audit ; le bouton reste grisé tant que
  rien n'a changé).

## [0.15.61] — 2026-10-21 — Jalon D, lot D1 : le logo des communes

Jalon D, « prête à présenter » (`docs/specs_metier/SPEC_D_pret_a_presenter.md`, ajoutée au dépôt). D1, tel que
décidé : la commune dépose son logo elle-même, depuis son portail ; la FNCT en secours, depuis l'annuaire
national ; le logo s'affiche en tête du portail de la commune.

### Ajouté
- **Migration 083.** L'usage de fichier `logo_commune` (PNG, JPEG, WebP ou SVG, 1 Mo au plus, contrôlés en base ;
  le SVG n'est ouvert qu'à cet usage). La table `logos_communes` : un logo en vigueur par commune (index unique),
  l'historique gardé (un logo remplacé ou retiré garde sa ligne, `retire_le`), un logo déposé qui ne se réécrit
  pas, un logo retiré qui ne revient pas, un logo de commune réelle qui ne s'efface pas — seule une commune de test
  ou de démonstration s'efface avec le sien. Dépôt par la commune ou la FNCT (`app.can_write_commune`), lecture par
  tout compte, journal d'audit. `communes.logo_url`, jamais alimentée, est déclarée obsolète.
- **Les routes** `POST /communes/{id}/logo` (dépôt ou remplacement, en une transaction : si l'écriture des octets
  échoue, rien n'est inscrit), `POST /communes/{id}/logo/retrait`, `GET /communes/{id}/logo` (type réel, nosniff,
  politique de sécurité fermée, ETag) et `GET /communes/{id}/logos` (l'historique).
- **Le SVG statique** (`services/fichiers.ts`, `estSvg`, `svgStatique`) : un SVG qui contient un script, un
  gestionnaire d'événement, une adresse javascript:, un objet étranger, une déclaration de type ou d'entités, un
  lien extérieur, une feuille de style qui charge une adresse ou l'animation d'un lien est REFUSÉ, en disant
  pourquoi — jamais réécrit (règle 1.5). Le dépôt de fichiers ordinaire refuse toujours le SVG.
- **Le bandeau de la commune** en tête du portail (`composants/communal/BandeauCommune.tsx`) : son logo, ou un
  emblème à ses initiales (jamais une image vide ou cassée, `composants/LogoCommune.tsx`), son nom et son
  gouvernorat, en français et en arabe — le directeur ne voyait jusque-là nulle part le nom de sa commune.
- **Un formulaire unique** (`composants/ajout/FormulaireLogo.tsx`) : aperçu, choix de l'image (1 Mo contrôlé avant
  l'envoi), historique, retrait ; ouvert depuis le bandeau du portail (directeur, FNCT) et depuis l'annuaire
  national, dans « Modifier » (FNCT).
- `GET /communes/{id}` rend aussi le nom arabe du gouvernorat (`gouvernorat_ar`).
- **Campagne `logos-communes`** (45 contrôles), dans deux communes de test avec des comptes temporaires : les refus
  (sans compte, prestataire, citoyen, autre commune, PDF renommé, texte, plus de 1 Mo, huit formes de SVG actif,
  et en base), le dépôt, les métadonnées retirées, le logo servi, le remplacement et son historique, le secours de
  la FNCT, le retrait, le journal d'audit, l'ancienne adresse libre sans effet. Un mutant qui laisse passer tout
  SVG fait échouer 16 contrôles.

### Modifié
- `PATCH /communes/{id}` n'accepte plus `logoUrl` (une adresse libre, tirée d'un autre site à chaque ouverture).
- **L'annuaire national : un seul bouton « Modifier » par commune** (`composants/national/ModifierCommune.tsx`), qui
  remplace « Limite » : il ouvre, à la place de l'annuaire, l'écran de la commune avec trois sections — ses
  **contacts** (l'écran « Contacts » de son portail), ses **limites** (l'éditeur de découpage) et son **logo**. Le
  bouton « Indicateurs » quitte la ligne : les indicateurs d'une commune se consultent dans son portail (onglet
  « Indicateurs », le même écran, avec le mode FNCT), ou depuis l'onglet « Indicateurs & 5 axes » de l'observatoire.
  La ligne ne garde que « Ouvrir le portail » et « Modifier ». Vérifié dans le navigateur, en français et en arabe.

### Reste (jalon D)
- D1 : l'affichage dans l'espace citoyen, l'en-tête des documents imprimés et des exports. Puis D2 à D5.

## [0.15.60] — 2026-10-20 — WaPla : les normales climatiques réelles des 24 gouvernorats

### Ajouté
- **Les 27 feuilles NOAA des normales OMM 1991-2020** de la Tunisie, telles que publiées par l'archive NCEI
  (accession 0253808), dans `backend/seed/data/noaa_1991_2020/`. `.gitattributes` les garde octet pour octet : une
  conversion de fin de ligne à l'extraction changerait leur empreinte.
- **`backend/seed/data/manifest.csv`** : pour chaque feuille, son empreinte SHA-256, son adresse dans l'archive NCEI
  (les 27 noms publiés correspondent nom pour nom), sa date de téléchargement, sa source, son WMO et sa station, lus
  dans l'en-tête de la feuille.
- **`backend/seed/data/mapping_station_gouvernorat.csv`** : les 24 gouvernorats, selon la règle décidée. 20 ont leur
  station (normale stationnaire) ; 4 reçoivent celle de la station la plus proche (normale estimée) : Ariana
  (16,5 km), Ben Arous (22,3 km) et Manouba (33,2 km) depuis Tunis-Carthage, Sousse (42,1 km) depuis Monastir. Ces
  distances sont celles que le chargement calcule ; il les revérifie à 1 km près.

### Modifié
- **`seed:normales-climat` entre dans l'ordre de chargement de référence**, après `seed:communication`
  (`DEMARRER.bat`, `MIGRER.bat`, CLAUDE.md § 7). Rejoué, il ne change rien.
- **Campagne `normales-climat`** : une section sur les normales réelles. Un témoin indépendant, en Python, relit les 27
  feuilles, la correspondance et les limites en base, et recalcule chaque valeur, chaque label, chaque station et
  chaque distance ; le jeu réel, à blanc, trouve ses 48 valeurs déjà en vigueur. Un mutant qui fausse d'un degré la
  température de Gafsa fait échouer 2 contrôles.

## [0.15.59] — 2026-10-20 — WaPla : les normales OMM 1991-2020 de la NOAA, stationnaires ou estimées

Décision du 20/10/2026, complétée : la source des normales climatiques devient les normales OMM 1991-2020 publiées
par la NOAA pour 27 stations tunisiennes. Aucun fichier INM n'est déposé ; `seed:normales-inm` (v0.15.58) est
retiré, jamais utilisé.

### Ajouté
- **Migration 082** : `wapla.facteurs_reference` porte la provenance de chaque normale — `periode`,
  `methode_rattachement` (`station_unique` ou `plus_proche_voisin`), `stations_utilisees`, `distance_km`, `label`
  (`stationnaire` ou `estimee`). Pas de table nouvelle. La base refuse une provenance à moitié dite, un label
  incohérent avec la méthode, un plus proche voisin sans distance, une liste de stations vide. L'amorce transmet
  ces informations, et le nom arabe du gouvernorat, dans le détail de l'entrée.
- **`npm run seed:normales-climat`** (`backend/seed/normalesClimat.ts`) : lit les feuilles NOAA « Single Station
  Data Sheet » — précipitations annuelles (paramètre 1, somme) et température moyenne annuelle (paramètre 5,
  moyenne) ; les autres paramètres sont ignorés. Il contrôle chaque feuille contre `manifest.csv` (empreinte
  SHA-256, WMO, station) et la correspondance station → gouvernorat (`mapping_station_gouvernorat.csv`). L'ensemble
  est refusé, sans rien écrire, pour une feuille modifiée ou hors manifeste, un WMO qui ne correspond pas, un bloc
  ou une valeur annuelle absents, deux périodes mêlées, un gouvernorat absent, inconnu ou en double, une station
  sans feuille, une méthode et un label incohérents, une distance saisie qui ne concorde pas. La date d'effet
  par défaut suit la période (1er janvier 2021 pour 1991-2020) ; `--date-effet` la change ; `--essai` valide
  sans écrire.
  - **La distance d'une normale estimée est calculée**, jamais recopiée : distance haversine (6 371 km) entre la
    station, dont les coordonnées sont dans l'en-tête de sa feuille, et le centre géométrique du gouvernorat
    (centroïde des limites de ses communes). La colonne `distance_km` de la correspondance peut rester vide ;
    remplie, elle doit concorder à 1 km près.
  - Essayé à blanc sur les 27 feuilles réelles : toutes lues, 48 valeurs pour 24 gouvernorats ; Ariana 16,5 km,
    Ben Arous 22,3 km et Manouba 33,2 km de Tunis-Carthage, Sousse 42,1 km de Monastir.
- **Écran du bilan** (FR, AR) : sous l'entrée climat, « Normale estimée pour le gouvernorat de X, dérivée de la
  station Y (distance Z km), période 1991-2020, source INM/OMM-NOAA », ou « Normale stationnaire, station Y,
  période 1991-2020, source INM/OMM-NOAA ».
- `GET /wapla/facteurs-reference` rend la provenance de chaque normale.

### Modifié
- **Campagne `normales-climat`**, réécrite sur des feuilles NOAA fictives au format réel (49 contrôles) : 14 refus
  du chargement, 4 refus de la base, la provenance de chaque ligne, Ariana, Ben Arous et Manouba estimées depuis
  Tunis-Carthage, Sousse depuis Monastir, les autres stationnaires, la distance haversine recalculée par un
  témoin indépendant, la date d'effet suivant la période, la provenance transmise au bilan. Un mutant qui fait
  d'Ariana une normale stationnaire fait échouer 3 contrôles.
- **W0 acté en validation par lecture croisée** (spec, décisions, feuille de route) : le moteur et le port Python
  indépendant concordent sur 213 jeux ; ce n'est pas un rejeu contre une exécution de l'outil UNIDO, et c'est
  assumé. Des vecteurs officiels, s'ils apparaissent, entreront dans `wapla-moteur`.

### Reste
- Les 27 feuilles dans `backend/seed/data/noaa_1991_2020/`, `backend/seed/data/manifest.csv` et
  `backend/seed/data/mapping_station_gouvernorat.csv`, à déposer ; `seed:normales-climat` entrera alors dans
  l'ordre de chargement de référence.

## [0.15.58] — 2026-10-20 — WaPla : les normales climatiques par gouvernorat

Décision du 20/10/2026 (`DECISIONS_2026-10-16.md`, amendement) : le climat de WaPla est une référence par
gouvernorat, saisie par la FNCT à partir des normales INM 1981-2010 (open data, licence OTL), surchargeable par la
commune sans obligation.

### Ajouté
- **`npm run seed:normales-inm`** (`backend/seed/normalesInm.ts`) : charge les normales dans
  `wapla.facteurs_reference`, la table de la migration 074 (aucune nouvelle table : elle porte déjà le gouvernorat,
  la valeur, la source obligatoire, la date d'effet et le retrait sans effacement). Le moteur n'attend que deux
  grandeurs : les précipitations annuelles (mm) et la température moyenne annuelle (°C).
  - Fichier : UTF-8, séparateur « ; », point décimal, une ligne par gouvernorat (`gouvernorat`,
    `precipitations_annuelles_mm`, `temperature_moyenne_c`, `station`, `periode`, `source`, `licence`).
  - Le fichier entier est refusé, sans rien écrire, s'il ne couvre pas exactement les gouvernorats du référentiel
    (lus en base, aucun nom dans le code), s'il en porte un en double, une valeur vide, illisible, à virgule
    décimale ou hors des bornes, une source, une station, une période ou une licence vide.
  - Rejoué, il ne change rien. Il refuse de réécrire une normale en vigueur : on la retire d'abord, avec son motif.
  - Date d'effet par défaut : le 1er janvier 2011 pour les normales 1981-2010 ; un autre jeu s'ajoute sous une
    autre date, sans changer les bilans déjà ouverts.
- **Campagne `normales-climat`** : les refus du chargement, la couverture des gouvernorats, un bilan qui reçoit les
  normales de son gouvernorat, la surcharge de la commune qui l'emporte, un bilan sans climat jamais étayé. Sur des
  normales fictives ; la table nationale est rendue ligne pour ligne en partant.

### Modifié
- **Un bilan sans climat n'est jamais « étayé »** (`backend/src/wapla/fiabilite.ts`) : au mieux « indicatif », même
  sous le seuil des valeurs par défaut, et le bandeau du bilan le dit (FR et AR). Il n'entre donc pas dans les
  agrégats de la FNCT. Un mutant privé de la règle laisse passer un bilan sans climat en « étayé » et dans les
  agrégats : la campagne échoue.

### Reste
- Le fichier officiel des normales 1981-2010 (data.gov.tn), à déposer dans
  `backend/seed/data/normales_inm_1981_2010.csv` ; `seed:normales-inm` entrera alors dans l'ordre de chargement de
  référence.

## [0.15.57] — 2026-10-20 — JC-015 : module2 à module6 éprouvent une copie de Dar Chaabane

### Corrigé
- **JC-015 : Dar Chaabane paraissait « active » au tableau national.** Après la v0.15.55, elle était la seule
  commune réelle à porter des écritures de directeur au journal d'audit : celles de `module2` à `module6`, qui
  écrivaient leurs lignes d'essai dans la commune, puis les effaçaient. Aucune ligne réelle n'était modifiée,
  mais le journal, en ajout seul, gardait chaque écriture. Les cinq campagnes éprouvent désormais une copie du
  jeu réel, dans une commune de test ; Dar Chaabane n'est que lue.

### Ajouté
- `tests/outils/copie_dar_chaabane.sh` : la copie du jeu de Dar Chaabane dans une commune de test, en une
  transaction, lignes retirées comprises (fiche, engins, agents, circuits et équipes, effectifs, publications et
  questions), avec des identifiants neufs et des liens qui suivent. L'identifiant d'un engin est préfixé par la
  commune de test, son immatriculation par « TEST ». `dar_chaabane_intacte` contrôle que le journal d'audit de la
  commune ne reçoit aucune ligne. Un mutant de `module5` remis à écrire dans Dar Chaabane passe l'empreinte des
  tables et échoue sur ce contrôle.
- Le contrôle des communes réelles (`tests/outils/base_reelle.sh`) dans les cinq campagnes.

## [0.15.56] — 2026-10-19 — JC-013 : les tables nationales rendues ligne entière, dates comprises

### Corrigé
- **JC-013 : des campagnes rendaient la valeur, pas la date.** Mesuré sur la v0.15.55, chaque campagne entre deux
  empreintes de la base, dates comprises : celles qui travaillaient dans des communes réelles en sont sorties aux
  lots A à C ; il en restait six, toutes sur une table nationale. `kpi-5-axes` (`parametres_kpi`), `barbechas` et
  `acteurs-informels` (`parametres_nationaux`), `wapla-bilans` et `wapla-scenarios` (`wapla.reglages`),
  `districts` (`districts_fnct`, `gouvernorats_district`) rendaient la valeur trouvée. La date restait celle des
  campagnes, et l'auteur, le compte temporaire de la FNCT, était vide une fois ce compte effacé.

### Ajouté
- `tests/outils/tables_nationales.sh` : les lignes entières d'une table nationale, gardées avant le premier geste
  et rendues en partant par leur clé primaire. Une ligne ajoutée est retirée, une ligne retirée revient, chaque
  colonne reprend sa valeur. Le retour se fait une dernière fois après tout ce que la campagne fait déjà en
  sortant. Un contrôle « en partant » dans les six campagnes compare chaque table, ligne pour ligne. Éprouvé par
  trois mutants privés du retour : chacun échoue en nommant ses tables.

## [0.15.55] — 2026-10-19 — JC-014 (lot C) : plus aucune campagne n'écrit dans une commune réelle avec un compte de démonstration

### Corrigé
- **JC-014 : huit campagnes écrivaient dans des communes réelles, puis effaçaient leurs lignes.** Le journal
  d'audit, en ajout seul, gardait leurs écritures, et suffisait à faire paraître ces communes « actives » au
  tableau national.
  - `circuits`, `periode`, `prestataires`, `intercommunal`, `enlevements` et `versions-decoupage` se
    connectaient avec les comptes de démonstration nommés (directeurs de La Marsa, Sfax, Houmt Souk, Midoun ;
    prestataires de La Marsa et Houmt Souk ; `citoyen.demo`). Elles travaillent dans des communes de test aux
    identifiants fixes qui en tiennent le rôle, avec des comptes temporaires du même rôle et un citoyen d'essai.
  - `barbechas` et `documents` prenaient le premier directeur des deux premières communes par une requête
    écrite sur trois lignes. Elles ont deux directeurs temporaires, chacun dans sa commune de test ; `documents`
    rattache le sien à sa commune des documents, comme avant.
  - `versions-decoupage` bâtit dans sa commune de test le secteur en vigueur qu'elle trouvait à Houmt Souk :
    `scripts/skills/audit-blocs.py` avait nommé ses trois contrôles « renommer, recolorer, retirer un secteur »,
    posés sous condition de le trouver, qui ne tournaient plus. Ils tournent toujours.

  Mesuré sur base neuve après le `npm test` complet : les écritures d'un directeur ou d'un prestataire ne
  touchent plus que Dar Chaabane (`module2` à `module6`, JC-001) ; aucune à La Marsa, Houmt Souk ni Ajim.

### Ajouté
- La garde du lanceur (`tests/executer.sh`) recolle une requête `$(sql "…")` écrite sur plusieurs lignes avant
  de la lire. Sur l'état précédent, elle arrête `barbechas` et `documents`.
- Le contrôle des communes réelles (`tests/outils/base_reelle.sh`) dans les huit campagnes.

## [0.15.54] — 2026-10-19 — JC-011 (lot B2) : plus aucune campagne n'emprunte de compte, et le lanceur y veille

### Corrigé
- **JC-011, lot B2 : les douze dernières campagnes qui empruntaient « le premier » compte d'un rôle.**
  - `acteurs-informels`, `cout-complet`, `declassement`, `exploitation`, `parametres-communaux` et
    `parametres-nationaux` prenaient le premier directeur rattaché à une commune, et le rattachaient le temps
    de la campagne à leur commune de test. C'est désormais un directeur temporaire, rattaché de même : le
    rattachement est ce qu'elles éprouvent. Leur « autre directeur » est temporaire aussi.
  - `module2` et `module3` ont un prestataire temporaire, rattaché le temps de la campagne à la commune
    qu'elles éprouvent. `module3` posait ses contrôles du prestataire sous condition de le trouver : ils
    tournent toujours.
  - `kpi-5-axes` a deux prestataires temporaires, chacun avec un circuit. Avec le prestataire emprunté, « son
    tableau, sur ses seules lignes » se vérifiait sur une liste vide, donc sur rien. Le contrôle exige
    désormais sa ligne, et aucune de l'autre.
  - `fichiers` a son « administrateur d'une autre commune » temporaire, dans une seconde commune de test.
  - `mot-de-passe-public` ouvre son compte d'essai dans une commune de test, plus dans celle du premier
    directeur de la base.

  Les vingt-sept campagnes de JC-011 n'empruntent plus aucun compte.

### Ajouté
- **La garde du lanceur** (`tests/executer.sh`). Une campagne dont une ligne choisit un compte par
  `FROM users WHERE role = '…' … LIMIT 1` ne tourne pas : le lanceur sort en code 4, en nommant la ligne et
  ce qu'il faut faire. Les lignes de commentaire ne comptent pas. Éprouvée par une campagne d'essai qui contient
  l'ancien choix : elle est arrêtée avant son premier geste.
- `tests/outils/comptes_temporaires.sh` : `ajouter_a_la_sortie` ajoute l'effacement des comptes après ce que
  la campagne fait déjà en sortant. Les lignes qu'un compte a posées partent avant lui.
- Le contrôle des communes réelles dans les six campagnes au directeur rattaché.

## [0.15.53] — 2026-10-19 — JC-011 (lot B) : douze campagnes de plus quittent « le premier directeur de la base »

### Corrigé
- **JC-011, lot B.** Ces douze campagnes travaillent désormais dans deux communes de test, avec un
  directeur temporaire dans chacune et un prestataire temporaire :
  `assainissement`, `champs-points`, `contacts`, `exports`, `imports`, `maintenance`, `parametres`,
  `rapports`, `releves-terrain`, `comptes`, `simulation-3mois`, `suggestions`.

  Elles prenaient « le premier directeur de la base », c'est-à-dire La Marsa sur la pile d'essai. Leur
  cloisonnement empruntait le premier directeur d'une autre commune ou le premier prestataire.
  - `exports` et `imports` posent leurs points d'essai sur deux circuits de leur commune de test. Ils les
    posaient jusqu'ici sur deux circuits réels de Dar Chaabane, ce qui réécrivait la date d'import de leurs
    points (JC-013).
  - `parametres` a son citoyen d'essai. Elle réglait jusqu'ici les préférences du compte de démonstration
    citoyen, puis les remettait à vide au lieu de les rendre.
  - `comptes` a son agent de la FNCT temporaire, au lieu du premier compte de la FNCT de la base. Son
    contrôle de cloisonnement ne se saute plus quand une seule commune est activée.
  - `simulation-3mois` garde sa commune réelle éprouvée : c'est le sujet du test, et elle vérifie qu'elle en
    sort intacte. Le compte communal de son refus devient un directeur temporaire.
  - Les contrôles posés sous condition de trouver un compte ne le sont plus : `contacts`, `rapports`,
    `maintenance`, `champs-points`, `exports`, `imports`. Le compte est bâti par la campagne.

### Ajouté
- **`tests/outils/communes_essai.sh`** pose les communes de test et efface en partant tout ce qu'elles
  portent. Chaque table qui porte `commune_id` est vidée de leurs lignes, en plusieurs passes pour laisser les
  clés étrangères céder. Rien n'est effacé hors de ces communes.
- Les deux contrôles des communes réelles (`tests/outils/base_reelle.sh`) dans chacune des douze campagnes.

### Constaté
- **Portée de JC-011 élargie.** En préparant la garde, une recherche plus large (`FROM users WHERE role = '…'
  … LIMIT 1`) trouve douze autres campagnes qui empruntent « le premier » compte d'un rôle :
  - le premier directeur rattaché à une commune, qu'elles rattachent le temps de la campagne à leur commune
    de test : `acteurs-informels`, `cout-complet`, `declassement`, `exploitation`, `parametres-communaux`,
    `parametres-nationaux`, `mot-de-passe-public` ;
  - le premier prestataire : `module2`, `module3`, `kpi-5-axes` ;
  - le premier directeur d'une autre commune : `fichiers`.

  Elles seront traitées au lot B2, avec la garde qui fera échouer toute campagne qui contient encore ce
  choix.

## [0.15.52] — 2026-10-19 — JC-012 et JC-011 (lot A) : cinq campagnes quittent La Marsa

### Corrigé
- **JC-012** (`docs/recette/JOURNAL_DES_CORRECTIONS.md`). Cinq campagnes laissaient des lignes à La Marsa,
  commune réelle, à chaque passage. Ces lignes entraient pour partie dans les indicateurs de la commune.
  - `cloisonnement` : une réclamation résolue, sa notification, une ligne de score, et les notes de la fiche
    réécrites.
  - `audit` : une réclamation, l'engin `trk-02` déplacé, et le taux de recouvrement de la TCL réécrit (63,5).
  - `notifications`, `notifications-citoyen` : trois notifications chacune, orphelines. Elles effaçaient par
    leur titre, et une notification de décision ne porte pas le leur.
  - `kpi-sources` : une ligne de paramètres créée pour la commune.

  Les cinq campagnes travaillent désormais dans leurs communes de test, et leur nettoyage est borné à ces
  communes :
  - `cloisonnement` en bâtit trois : deux engins, un conteneur, deux secteurs, deux directeurs, deux
    prestataires, un citoyen ;
  - `audit` en bâtit deux ;
  - `notifications` et `notifications-citoyen` une chacune ;
  - `kpi-sources` deux.
- **`observatoire` bâtit l'activité qu'elle contrôle.** « Les communes où l'on a travaillé sont actives » se
  vérifiait sur n'importe quelle commune active, en pratique La Marsa. Or c'étaient les écritures des autres
  campagnes avec son directeur de démonstration qui la rendaient active. La campagne bâtit désormais deux
  communes de test :
  - une où son directeur temporaire écrit : elle doit être « active » ;
  - une où seule la FNCT écrit : elle doit rester « incomplete ».

  La provenance des données se qualifie sur la première, plus sur La Marsa. Sur toute base où les anciennes
  campagnes ont tourné, La Marsa paraît déployée au tableau national, car le journal d'audit est en ajout seul
  (JC-012).
- **JC-011, en partie** : `notifications`, `notifications-citoyen` et `kpi-sources` ne prennent plus « le
  premier directeur de la base ». Les douze autres campagnes suivent au lot B.

### Ajouté
- **`tests/outils/comptes_temporaires.sh`** : des comptes de tout rôle (directeur, prestataire, FNCT) le temps
  d'une campagne, effacés en partant.
- **`tests/outils/base_reelle.sh`** relève, sur les seules lignes des communes réelles, chaque table qui porte
  `commune_id` (66 sur la pile d'essai) et la fiche de chaque commune réelle, dates comprises. Il les compare
  pendant que la campagne a ses lignes en base, puis en partant, et le contrôle nomme les tables qui ont bougé.
  Cela fait deux contrôles dans chacune des cinq campagnes, plus un contrôle que la commune de test porte bien
  les gestes de la campagne.
- `observatoire` reçoit aussi les deux contrôles des communes réelles.
- **Éprouvé par cinq mutants**, qui refont l'ancien geste à La Marsa : une réclamation, le taux de la TCL, une
  notification pour chacune des deux campagnes de notifications, un paramètre. Chacun fait échouer exactement
  les deux contrôles, en nommant la table touchée.
- `CLAUDE.md` § 7 : aucune ligne d'une commune réelle ne bouge pendant une campagne.

### Constaté
- La revue des campagnes ne voyait les modifications de la fiche de La Marsa qu'en date. Relancée sur une
  pile où la valeur était déjà écrite, une campagne ne change plus que `updated_at`. Une relance ne montre pas
  ce que le premier passage a déjà changé.

## [0.15.51] — 2026-10-19 — JC-010 : plus aucune version fantôme du découpage pendant les campagnes

### Corrigé
- **JC-010** (`docs/recette/JOURNAL_DES_CORRECTIONS.md`). Toute correction directe de la FNCT (un secteur
  posé ou retiré, une limite redessinée) fige l'état présent en « version 1 » du découpage, puis inscrit la
  correction en version suivante. Deux campagnes faisaient ce geste dans des communes réelles :
  - `suppression` posait et retirait ses secteurs dans Houmt Souk et Midoun. Elle y laissait une version 1
    « initiale », et un « Secteur temporaire » supprimé de plus à chaque passage, visible dans la liste de ce
    que ces communes ont retiré ;
  - `decoupage` corrigeait la limite de Midoun, puis rejouait l'import officiel. La limite revenait, mais une
    version 2 « Périmètre corrigé directement par la FNCT » restait dans l'historique de Midoun.
- `suppression` travaille désormais dans deux communes de test, chacune avec son directeur temporaire.
- `decoupage` lit toujours le référentiel réel. Toutes ses écritures de limite se font sur une commune de test
  qui porte une copie de la limite de Midoun, avec un directeur temporaire. Elle n'a plus à rejouer l'import
  officiel pour rendre Midoun (JC-007) : Midoun n'est plus touchée.

### Ajouté
- **`tests/outils/communes_reelles.sh`** relève, hors des communes de test, les secteurs (retirés compris),
  les versions du découpage et la limite de chaque commune (tracé, provenance, superficie, date). Il les
  compare pendant que la campagne a ses lignes en base, puis en partant. Ce sont six contrôles dans
  `suppression` et six dans `decoupage`, plus, dans chacune, un contrôle que la commune de test porte bien les
  gestes de la campagne.
- **Éprouvé par deux mutants**, qui refont l'ancien geste dans une commune réelle :
  - un secteur posé par la FNCT à Houmt Souk : 4 contrôles de `suppression` échouent (secteurs et versions,
    pendant et en partant) ;
  - la limite de Midoun corrigée par la FNCT : 5 contrôles de `decoupage` échouent (versions et limites,
    pendant et en partant, et la limite officielle de Midoun).
- **Inventaire des versions fantômes**, en lecture seule. L'heure qui fait foi est l'insertion de la version au
  journal d'audit ; la signature est un geste d'essai à 60 s près dans la même commune. Résultat :
  - la base du dossier principal ne porte aucune version ;
  - la pile d'essai en porte trois, toutes fantômes ;
  - l'ancien volume `nacer_siipi_postgres_data`, arrêté à la migration 012, n'a pas d'historique du
    découpage. Il a été inspecté sur une copie, retirée ensuite.

  Le retrait des versions déjà laissées reste une décision de la FNCT.
- `CLAUDE.md` § 7 : une correction de la FNCT, dans une campagne, se fait dans une commune de test.

## [0.15.50] — 2026-10-16 — JC-009 : la campagne `citoyen` ne touche à aucune commune réelle

### Corrigé
- **JC-009** (`docs/recette/JOURNAL_DES_CORRECTIONS.md`). La campagne `citoyen` posait ses secteurs, ses
  circuits, ses annonces et son signalement d'essai dans Houmt Souk, commune réelle, avec les comptes de
  démonstration de la commune.
  - **Constat plus grave en la corrigeant** : un secteur posé par la FNCT passe par une correction directe du
    découpage, qui fige l'état présent en « version 1 » quand la commune n'en a aucune. La campagne effaçait en
    partant les versions qui citaient ses secteurs, pas cette version 1. Chaque base où `npm test` a tourné
    garde donc, dans l'historique du découpage de Houmt Souk, une version 1 validée qui annonce une première
    modification qui n'a jamais eu lieu. Reproduit sur la pile d'essai ; la base du dossier principal n'en
    porte aucune.
  - **Elle n'est pas la seule** : dans un `npm test` complet, `suppression` fige déjà cette version 1 (à Houmt
    Souk et à Midoun), et `decoupage` laisse à Midoun une version 2 « Périmètre corrigé directement par la
    FNCT ». Consigné en **JC-010, ouverte** : cette correction-ci ne suffit pas, à elle seule, à empêcher une
    version fantôme de naître pendant `npm test`.
  - La campagne travaille désormais dans sa commune de test (`test_citoyen`), avec un directeur temporaire. Les
    comptes de démonstration n'y servent plus qu'à des refus, sans rien écrire.
  - Son nettoyage est borné à sa commune de test : une ligne égarée dans une commune réelle y reste, et les
    contrôles la voient.
  - Une version 1 déjà laissée par un passage antérieur n'est pas retirée : sur une base réelle, c'est une
    décision de la FNCT (le journal dit comment la reconnaître).

### Ajouté
- **Onze contrôles dans la campagne `citoyen`** :
  - la commune de test porte bien les lignes de la campagne (2 annonces, 2 secteurs, 2 circuits, 1
    signalement, des versions) ;
  - pendant que la campagne a ses lignes en base, puis en partant : aucune **annonce**, aucun **secteur**,
    aucun **circuit**, aucune **version de découpage** ni aucun **signalement** ajouté, modifié ou retiré hors
    de sa commune de test (empreinte de chaque table prise avant le premier geste).
- **Éprouvé par trois mutants**, qui refont dans Houmt Souk un geste de l'ancienne campagne :
  - une annonce : 2 contrôles échouent (les annonces, pendant et en partant) ;
  - un secteur : 4 (les secteurs et les versions du découpage) ;
  - un circuit : 2 (les circuits).

## [0.15.49] — 2026-10-16 — JC-006 : un corps illisible reçoit 400, jamais 500

### Corrigé
- **JC-006** (`docs/recette/JOURNAL_DES_CORRECTIONS.md`). Un corps de requête que l'API ne savait pas lire
  recevait « Erreur interne du serveur » (500). Le client croyait à une panne et réessayait, et le journal se
  remplissait de fausses erreurs internes. La cause est établie : le gestionnaire d'erreurs ne reconnaissait
  pas les erreurs du lecteur de corps d'Express. Le défaut touchait toute l'API, et pas seulement le JSON mal
  formé. Chaque cas reçoit désormais son statut, avec un message qui dit quoi corriger :
  - un JSON mal formé : **400** ;
  - un corps trop gros : **413**, et le message rappelle qu'un fichier se dépose par `/fichiers` ;
  - un jeu de caractères ou une compression illisibles : **415**.
- Le journal des requêtes passe **avant** les lecteurs de corps. Placé après, il ne voyait jamais une requête
  refusée à la lecture ; l'exploitant ne lisait que le « 500 », sans la requête qui l'avait causé.

### Ajouté
- **Campagne `corps-illisibles`** (18 contrôles). Elle démarre sa propre API, en développement, sur le port
  4007, pour lire son journal. Elle éprouve :
  - des routes publiques (`/auth/login`, `/citizens/register`) et des routes sous compte
    (`/communes/localiser`, `/citoyen/adresse`) ;
  - `/fichiers`, qui a son propre lecteur : 13 Mo y sont lus, quand ils sont refusés ailleurs ;
  - qu'une requête bien formée passe toujours, et qu'un mauvais mot de passe reste un 401 ;
  - que le journal consigne les 8 refus, sans aucune « [error] » ni réponse 500.

  Éprouvée à rebours : avec l'ancien gestionnaire, 14 de ses contrôles échouent.

### Consigné
- **JC-009, ouverte** : la campagne `citoyen` écrit encore ses secteurs et circuits d'essai dans Houmt Souk avec
  des comptes de démonstration (règle de JC-001).

## [0.15.48] — 2026-10-16 — JC-005 : la campagne `citoyen` ne touche plus qu'à ses citoyens

### Corrigé
- **JC-005** (`docs/recette/JOURNAL_DES_CORRECTIONS.md`). La campagne `citoyen` remettait à zéro la commune,
  l'adresse, la position et le secteur de **tous** les citoyens de la base, au début et à la fin. Sur une base
  portant de vrais habitants, chaque passage des campagnes leur aurait retiré leurs horaires de collecte et le
  ciblage de leurs notifications, sans que personne ne le voie.
  - Elle crée son propre citoyen d'essai à la place du compte de démonstration, et ne touche qu'à lui.
  - Elle crée aussi un citoyen **témoin**, domicilié, auquel elle ne doit pas toucher.
  - En partant, elle efface ses deux citoyens et ses lignes `TEST`, rien d'autre.

### Ajouté
- Trois contrôles en fin de campagne `citoyen` :
  - le témoin garde sa commune, son adresse, sa position et son secteur ;
  - les deux citoyens de la campagne sont effacés ;
  - tous les autres citoyens de la base sont tels qu'elle les a trouvés (empreinte prise avant le premier
    geste).

  Le témoin est bâti : sans lui, le dernier contrôle passerait à vide sur une base où personne n'a d'adresse.
  Éprouvé à rebours : l'ancienne remise à zéro, réinjectée, fait échouer deux de ces contrôles.

## [0.15.47] — 2026-10-16 — Le courriel : mot de passe provisoire et notifications sur demande

Décision du 16 octobre 2026 (`docs/specs_metier/DECISIONS_2026-10-16.md`) : courriel d'abord, SMS plus
tard. Réponse du même jour : les notifications par courriel sont **sur demande**.

### Ajouté
- **`services/courriel.ts`** : l'envoi par un serveur SMTP que désigne l'exploitant (`SMTP_HOST`,
  `SMTP_PORT`, `SMTP_SECURITE`, `SMTP_UTILISATEUR`, `SMTP_MOT_DE_PASSE`, `COURRIEL_EXPEDITEUR`,
  `COURRIEL_URL_PORTAIL` ; `docker-compose.yml`, `backend/.env.example`). SIIPI ne s'abonne à aucun service
  d'envoi.
  - Sans serveur, rien ne part, et le résultat le dit : « non_configure », jamais un envoi supposé réussi.
  - Une seule tentative, comme le push. « Envoyé » veut dire « accepté par le serveur SMTP ».
  - Le corps d'un courriel n'est jamais journalisé.
- **B1.2 — le mot de passe provisoire part par courriel** à son titulaire, à l'ouverture d'un compte et à
  une réinitialisation, avec l'adresse du portail.
  - Envoyé, il n'est **plus dans la réponse** : le cadre n'a pas à le connaître.
  - Sans serveur, ou si l'envoi échoue, il s'affiche une fois au cadre, comme avant, avec la raison.
  - Il n'ouvre que son propre remplacement (v0.15.24) : intercepté, il ne donne accès à rien d'autre.
- **Migration 081 — les notifications par courriel, sur demande** :
  - pour le canal courriel, une préférence absente vaut « désactivé » : brancher le courriel ne déclenche
    aucune vague d'envois ;
  - `notifications_citoyen` accepte le canal `email` et le statut `non_configure` ; une ligne qui
    prétendrait un SMS parti reste refusée ;
  - `app.courriels_publication` et `app.courriel_citoyen` (SECURITY DEFINER, appelées par le seul service
    d'envoi, jamais par une route) rendent les citoyens qui l'ont demandé et leur adresse ;
  - `app.indicateurs_communication` compte le push et le courriel à part : un courriel ne fausse ni la
    livraison ni la lecture du push.
- **Les envois** : une publication envoyée part en push et, aux citoyens qui l'ont demandé, par courriel ;
  une décision sur une réclamation aussi. Chaque courriel tenté est consigné (`livre`, `echec`,
  `non_configure`). L'historique « Mes notifications » et le statut affiché sur un ticket restent ceux du
  push.
- **`GET /courriel/etat`** et **`POST /courriel/essai`**, réservés à la FNCT :
  - l'état dit le serveur, sa sécurité, s'il est authentifié, l'expéditeur — jamais le mot de passe ;
  - l'essai part à l'adresse du compte qui le demande, à nulle autre : SIIPI n'est pas un relais.
- **Écrans** :
  - *Paramètres nationaux → Serveur de courriel* : l'état, et l'essai ;
  - préférences du citoyen : la colonne « Courriel » devient modifiable, décochée tant qu'il ne l'a pas
    demandée ; le SMS reste grisé ;
  - *Comptes et accès* : « identifiants envoyés par courriel », ou le mot de passe à transmettre et pourquoi ;
  - *Communication → Indicateurs* : une carte « Courriels » (acceptés, en échec, non partis).
- **Campagne `courriel`** (base, API et serveur SMTP jetables ; `tests/outils/serveur_smtp.py` ne relaie
  rien) :
  - ce qui est refusé : état et essai hors FNCT, SMS prétendu, statut inventé, courriel par défaut ;
  - aucun serveur : rien ne part, le mot de passe revient au cadre, la ligne dit « non_configure » ;
  - un serveur : le mot de passe arrive dans le courriel, ouvre le compte, et n'est ni dans la réponse,
    ni dans le journal, ni dans la base ; le courriel va au seul citoyen qui l'a demandé, le push n'est pas
    remplacé, l'historique reste celui du push ; un citoyen qui retire sa demande ne reçoit plus rien ;
  - un serveur injoignable : l'échec est dit, le compte s'ouvre quand même, le mot de passe revient au
    cadre.

### Modifié
- `notifications-citoyen` : les préférences par défaut sont désormais push activé, courriel et SMS
  désactivés. `communication-indicateurs` : le jeu porte 10 courriels, comptés à part, et le témoin les
  suit.
- `@types/nodemailer` est pris en 6.4 : la 7 ajoutait, en dépendance, le SDK d'un service d'envoi en ligne
  dont SIIPI ne se sert pas.

## [0.15.46] — 2026-10-16 — 16.2 : les gabarits des documents scellés, « modèle provisoire »

Décision du 16 octobre 2026 (`docs/specs_metier/DECISIONS_2026-10-16.md`) : construire maintenant les quatre
gabarits. Chacun s'imprime « modèle provisoire » jusqu'à sa validation par le chef de dépôt de Dar Chaâbane
pendant la recette.

### Ajouté
- **`src/documents/gabarits.ts`** : un gabarit par type — ordre de mission, bon de sortie de carburant, bon
  de travail, déclaration de panne. Chacun porte :
  - ses titres et sa référence en français et en arabe ;
  - ses champs (clé, libellés, nature, obligatoire, unité) et ses signatures avec leurs qualités ;
  - son **statut**, `provisoire` aujourd'hui. Il passera à `valide` dans le code, donc dans l'historique.

  Les clés du bon de carburant sont celles qu'écrit le carnet (058) : le bon émis depuis le carnet s'imprime
  tel quel.
- **Le gabarit est le contrat du contenu.** `POST /documents` refuse un champ obligatoire absent (en le
  nommant), un champ que le gabarit n'imprime pas, et une date ou un nombre mal écrits. Le contenu est figé dès
  l'émission : une erreur ne se rattraperait plus.
- **`GET /documents/{id}/impression`** rend une page A4 bilingue en HTML imprimable (`impression.ts`), qui
  porte :
  - l'en-tête de l'État, du gouvernorat et de la commune en français et en arabe, puis le numéro d'ordre et
    la référence ;
  - les champs, les observations, les signatures, et la mention d'édition (date, heure de Tunis, auteur) ;
  - l'**empreinte du contenu**, à comparer au registre ;
  - le bandeau « MODÈLE PROVISOIRE », et pour un document annulé un tampon « ANNULÉ » avec son motif ;
  - **un champ vide reste une case vide**, sans tiret ni zéro ; tout texte est échappé.
- **`GET /documents/gabarits`**, d'où l'écran tire ses formulaires.
- **Migration 080 — `gouvernorats_noms`** : le nom arabe des 24 gouvernorats, pour « ولاية … ». C'est une
  donnée, pas du code, conformément à D-FNCT-2. Lecture pour tous, écriture par la FNCT.
- **Écran** *Flotte, GMAO & dépôt → Documents*, le registre de tous les documents :
  - filtre par type, impression, annulation motivée ;
  - les **numéros manquants** signalés ;
  - les modèles provisoires annoncés.
- **Un formulaire unique** (`ajout/FormulaireDocument.tsx`), construit depuis le gabarit, pour l'ordre de
  mission, le bon de travail et la déclaration de panne. Il est ouvert depuis le registre et depuis
  « + Ajouter » ; la commune émet, la FNCT lit. L'émission est dite définitive avant le clic. Le bon de
  carburant reste émis depuis le carnet, qui enregistre le plein en même temps.
- **Imprimer** sur chaque bon du carnet de carburant. L'impression passe par un cadre invisible de la page,
  pas par une fenêtre que le navigateur bloquerait.
- **Campagne `documents`** :
  - elle émet désormais des contenus conformes ;
  - une section nouvelle couvre les quatre gabarits provisoires, les champs manquants nommés, le champ inconnu,
    la date mal écrite et la déclaration de panne émise ;
  - à l'impression, elle vérifie le numéro, le titre arabe, le bandeau, le texte échappé, la case vide restée
    vide, l'empreinte et la mention d'édition ;
  - le directeur d'une autre commune reçoit 404, une requête sans compte 401, et un document annulé
    s'imprime barré avec son motif.

## [0.15.45] — 2026-10-16 — C2.2 : l'import des fichiers de limites (Shapefile, KML, KMZ, GeoJSON)

Un géomètre ou un bureau d'études livre le périmètre ou les secteurs d'une commune en Shapefile, le format
d'ArcGIS et de QGIS, souvent dans un système de coordonnées tunisien. Les écrans de découpage ne lisaient que
du GeoJSON.

### Ajouté
- **`POST /decoupage/lire-fichier`** (directeur de commune ou FNCT) lit un fichier de limites et rend ses
  formes **en WGS 84**, avec leurs attributs. Elle n'enregistre rien : l'écran les montre avant toute
  proposition.
  - **Shapefile en zip** : la projection vient du .prj, l'encodage des attributs du .cpg (arabe en UTF-8
    ou Windows-1256). Les contours troués et à plusieurs parties sont lus, ainsi que les champs texte,
    numériques, logiques et date.
  - **KML et KMZ** : les polygones, leurs trous, le nom et les attributs.
  - **GeoJSON** : son membre « crs » est lu quand il existe.
  - **La projection ne se devine pas.** SIIPI reconnaît WGS 84, WGS 84 / UTM 32N, Carthage / UTM 32N,
    Carthage / Nord et Sud Tunisie, et Web Mercator. PostGIS reprojette, changement de datum compris. Un
    autre système est refusé en le nommant. Un Shapefile sans .prj n'est accepté que si ses coordonnées
    sont des degrés en Tunisie, et la réponse le dit.
  - Une forme invalide est signalée, pas corrigée. Un encodage supposé est dit.
- **`services/zip.ts`**, le seul lecteur d'archives :
  - il lit le répertoire central, si bien que les zips écrits en flux par Windows ou QGIS sont lus ;
  - il refuse plus de 200 entrées, plus de 200 Mo décompressés et les entrées chiffrées ;
  - il ne décompresse jamais au-delà de la taille annoncée, ce qui arrête les « bombes ».

  La lecture des KMZ de relevés (`kml.ts`) passe désormais par lui.
- **Écrans de découpage** : *Découpage → Proposer une modification* (commune : périmètre, secteurs) et le
  découpage d'une commune à l'observatoire (FNCT) acceptent Shapefile, KML, KMZ et GeoJSON. Le résultat de
  la lecture (format, système, nombre de contours, avertissements) s'affiche sous les boutons. Quand un
  fichier porte plusieurs contours, la FNCT reçoit celui qui porte le nom de la commune, sinon le premier ;
  l'écran le dit dans les deux cas. FR/AR.
- **Campagne `import-geo`** :
  - elle commence par les refus : sans compte, citoyen, prestataire, archive sans .dbf, sans Shapefile, .shp
    seul, fichier quelconque, bombe zip, Lambert 93, mètres sans .prj, GeoJSON dans un système inconnu ou
    en mètres sans le dire ;
  - chaque format est confronté à un témoin (`tests/donnees/fichiers_geo.py`), qui écrit lui-même les
    fichiers octet par octet et calcule UTM 32N et Web Mercator par les formules du manuel ;
  - précisions vérifiées : retour en degrés à 1e-9 ° en WGS 84, à 1e-6 ° depuis UTM et Web Mercator ;
    changement de datum de Carthage appliqué ;
  - attributs arabes justes en UTF-8 comme en Windows-1256 ;
  - aucune version de découpage créée par la lecture.

## [0.15.44] — 2026-10-16 — B5.5.4 : les indicateurs de communication

La dernière fonctionnalité « à faire » de la rubrique 5.5 du cahier des charges, qui demande délai,
volumétrie et taux. Une commune qui écrit à ses habitants doit savoir quatre choses :
- si ses messages arrivent ;
- s'ils sont lus ;
- combien d'habitants elle ne peut pas joindre ;
- en combien de temps elle répond aux points que les citoyens lui proposent.

### Ajouté
- **Migration 079 — `app.indicateurs_communication(commune, début, fin)`.** Les calculs lisent ce que la
  plateforme consigne déjà : publications, envois, tentatives individuelles, réponses aux sondages, points
  proposés. La période est en dates de Tunis, bornes comprises.
  - **Volumétrie** : publications publiées par type, envois, destinataires joints et non joints (sans
    adresse, désabonnés), envois individuels par issue, points proposés reçus, répondants aux sondages.
  - **Délais** : délai médian de décision sur un point proposé (heures, avec le nombre de décisions) ;
    points encore en attente et l'ancienneté du plus ancien.
  - **Taux**, chacun avec son numérateur et son dénominateur :
    - livraison (livrées sur livrées et en échec) ;
    - lecture (lues sur livrées) ;
    - portée (joints sur joints, sans adresse et désabonnés) ;
    - validation des points proposés ;
    - participation aux sondages (répondants distincts sur les foyers invités par le plus grand envoi de
      chaque sondage).
  - **Un taux sans dénominateur est `null`, jamais 0** (règle d'or 1.1).
  - Les contenus marqués « exemple » et les points retirés n'entrent pas dans les calculs.
  - **Que des totaux** : la fonction lit des envois individuels que la commune ne voit pas (044) et n'en rend
    que des comptes (loi organique n° 2004-63). Directeur de la commune ou FNCT ; sinon « introuvable »,
    aussi en SQL direct.
- **`GET /communication/indicateurs?communeId&debut&fin`**, décrite dans le contrat.
- **Écran** *Communication → Indicateurs*. On choisit la période (un an glissant par défaut). L'écran
  affiche les trois familles en cartes, chaque taux avec ce sur quoi il porte (« 30 sur 35 ») ou ce qui lui
  manque. FR/AR.
- **Campagne `communication-indicateurs`** :
  - elle commence par les refus : sans compte, citoyen, prestataire, autre commune (aussi en SQL direct),
    période mal formée ;
  - sur une période vide, les comptes valent 0 et les taux `null` ;
  - sur un jeu complet, chaque indicateur est égal à celui d'un témoin
    (`tests/donnees/communication_indicateurs.py`) qui ne lit que le jeu et la définition ;
  - le jeu place une publication à 23 h 30 le 30 juin et une à 0 h 30 le 1er juillet : un calcul en dates
    UTC les compterait toutes les deux ;
  - aucune donnée nominative dans la réponse.

## [0.15.43] — 2026-10-16 — S0 : la carte du conseiller SIG

Le dernier point de S0. Le conseiller SIG a livré une carte web (Leaflet) des 350 communes. SIIPI en reprend
les usages, sur son propre référentiel : les contours du conseiller sont ceux de SIIPI, à 2 % près pour les 350
communes.

### Ajouté
- **Un sélecteur de fonds pour toutes les cartes** (`web/src/composants/carte/FondsDeCarte.tsx`) : le plan
  OpenStreetMap (par défaut) ou l'imagerie satellite d'Esri, avec leurs attributions. Les huit cartes de
  SIIPI l'utilisent. L'aperçu de la limite communale et la carte de répartition, qui doivent rester lisibles,
  gardent le plan seul. **Pas de tuiles Google** : appelées hors de leur API, elles enfreignent les conditions
  de Google (feuille de route, S0) ; la carte du conseiller en chargeait. `npm run lint` le vérifie
  (`scripts/verifier-fonds-de-carte.mjs`) : aucune adresse de tuiles hors de ce composant, aucune tuile Google.
- **`GET /observatoire/carte-communes`** : les communes réelles (ni démonstration, ni commune retirée), leur
  contour officiel simplifié (722 Ko, contre 8,6 Mo pour le fichier du conseiller) et leur fiche : noms FR/AR,
  gouvernorat, district, type, population **avec sa provenance**, superficie **calculée sur l'ellipsoïde**
  à partir du contour, secteurs, code. Une population jamais saisie (0 dans la colonne d'origine) sort `null`,
  jamais 0. La réponse est gardée en mémoire tant que le découpage et ses districts ne changent pas.
- **L'écran** *Observatoire → Carte des communes* : choix du fond, couche des communes affichable ou masquable,
  filtre par gouvernorat, recherche « nom — gouvernorat » (deux Ennour, deux Ezzouhour), fiche de chaque
  commune. Le total des habitants s'écrit avec sa provenance. FR/AR.
- **Campagne `carte-communes`** : sans compte, refusé ; ni la commune de démonstration ni une commune retirée.
  Un témoin recalcule sur la sphère l'aire de chaque contour rendu, et celle d'un carré connu : la superficie
  s'accorde à 5 % (contour simplifié), ce qui écarte l'aire en Web Mercator (39 % de trop au moins). Absent :
  `null`. Chaque commune réelle porte son district.
- **Les écarts du fichier du conseiller**, constatés sans rien corriger (règle d'or 1.5), dans
  `docs/specs_metier/sources/sig/` (rapport et CSV, 901 lignes) :
  - ses superficies sont des aires en Web Mercator, 1,39 à 1,58 fois trop grandes, donc ses densités trop basses ;
  - 5 gouvernorats sont orthographiés autrement ;
  - 256 populations diffèrent (11 021 199 habitants chez lui contre 12 221 221 dans SIIPI, toutes estimées). La
    source qui fait foi reste à trancher par la FNCT ;
  - 189 noms français et 44 noms arabes diffèrent. Parmi ces derniers, le nom arabe de Tazarka dans SIIPI
    (« تزغران ») paraît être celui de Tazghrane : c'est à vérifier par la FNCT.

### Corrigé
- Les contrôles `verifier-gouvernorats.mjs` et `districts` retiraient les commentaires en coupant à la
  première paire `//` : une adresse (`https://…`) était coupée avec, et ce qu'elle contenait échappait au
  contrôle. Ils ne retirent plus que les vrais commentaires. Les deux contrôles du front ont été éprouvés sur un
  fichier fautif.

## [0.15.42] — 2026-10-16 — D-FNCT-4 : la campagne `purge-media` sur une base jetable

D-FNCT-4 est reconfirmée le 16 octobre 2026. Les textes et métadonnées des réclamations sont conservés
sans limite. À 36 mois, une photo est compressée (JPEG qualité 70, 500 Ko au plus) et sa version
compressée reste en ligne sans limite. L'original part dans l'archive froide, **où il reste sans limite**
(réponse de l'utilisateur, qui confirme celle du 9 octobre : pas d'effacement à 48 mois). La FNCT peut le
faire restaurer sous 48 heures, et chaque geste est tracé. Le passage est mensuel. Tout cela était en
place depuis la v0.15.23 ; ce lot change la campagne.

### Changé
- **`purge-media` ne touche plus rien de partagé** (leçon de JC-007). Elle prend une base neuve, migrée
  et semée pour elle, une API à part (port 4005), un volume de fichiers et une archive froide dans son
  dossier temporaire. Elle efface tout en partant. Jusqu'ici, elle écrivait sa commune, ses comptes, ses
  fichiers et ses passages dans la base des campagnes, et ses photos dans le volume réel. Deux contrôles
  vérifient qu'elle travaille bien à part.
- **Le passage mensuel est éprouvé pour de bon.** Seule une base jetable permet de laisser partir un
  passage national. Sans `SIIPI_CONSERVATION_MEDIAS=active`, l'API n'en lance aucun. Avec la variable, elle
  l'annonce, puis le planificateur compresse de lui-même une nouvelle photo de 37 mois et archive son
  original ; la photo de 30 mois reste entière.

## [0.15.41] — 2026-10-16 — D-FNCT-2 : les cinq districts du décret n° 2023-589

Décision de la FNCT du 16 octobre 2026 : les districts sont ceux du **décret n° 2023-589 du 21 septembre
2023**. D1 : Bizerte, Béja, Jendouba, Le Kef. D2 : Tunis, Ariana, Ben Arous, Zaghouan, Manouba, Nabeul.
D3 : Siliana, Sousse, Kasserine, Kairouan, Monastir, Mahdia. D4 : Gafsa, Sfax, Sidi Bouzid, Tozeur.
D5 : Kébili, Gabès, Tataouine, Médenine.

### Ajouté
- **Migration 078** : le découpage du décret, posé dans les tables de la migration 050
  (`districts_fnct`, `gouvernorats_district`) — celles que lisent déjà `/kpi/national`, `/kpi/repartition`,
  le suivi du déploiement et `/wapla/agregats` : une seconde table aurait fait deux vérités. Le gouvernorat
  reste le texte porté par chaque commune (il n'a pas de table à lui) ; « La Manouba » du décret s'y écrit
  « Manouba ». Codes D1 à D5 (la base accepte désormais les majuscules), noms en français et en arabe,
  **source** (nouvelle colonne, cinq caractères au moins). Posé seulement si la FNCT n'avait défini aucun
  district.
- **`PUT /kpi/districts`** exige la **source** du découpage et refuse un gouvernorat **sans district**
  (400, avec la liste des oubliés) : un oubli ferait sortir ses communes de toutes les sommes par district.
  `GET /kpi/districts` rend la source ; sa réponse est décrite dans le contrat.
- **Écran** *Observatoire → Paramètres nationaux → Les districts de la FNCT* : les cinq districts, leurs
  gouvernorats, la source citée ; « Modifier le découpage » (codes, noms FR/AR, district de chaque
  gouvernorat, source exigée). Il remplace l'éditeur des réglages des indicateurs, qui n'envoyait pas les
  noms arabes et les aurait effacés à chaque enregistrement.
- **Aucun nom de gouvernorat dans le code** : la campagne `districts` le vérifie côté API, et
  `web/scripts/verifier-gouvernorats.mjs`, enchaîné par `npm run lint`, côté front.
- **Campagne `districts`** : refus d'abord (sans compte, commune, citoyen, sans source, gouvernorat oublié,
  inconnu, district inconnu, code en double, un gouvernorat dans deux districts en SQL direct) ; le
  découpage en base est celui d'un témoin recopié de la décision (`tests/donnees/districts-decret-2023-589.json`),
  5 districts, 24 gouvernorats, aucun orphelin, aucun doublon ; les sommes par district (indicateurs
  nationaux, agrégats WaPla) sont celles de leurs gouvernorats ; une redéfinition par la FNCT est suivie
  par les sommes. Le découpage est une donnée réelle : relevé en entrant, rétabli en partant, vérifié
  identique.

### Corrigé
- La campagne `kpi-5-axes` **effaçait tout le découpage** (`DELETE FROM gouvernorats_district`) à chaque
  passage, et le réécrivait par un `PUT` d'essai : sur une base portant le découpage officiel, chaque
  `npm test` l'aurait détruit (le cas de JC-007). Elle ne retire plus que sa propre ligne d'essai ; le
  `PUT` est éprouvé par la campagne `districts`, qui rétablit le découpage.

### Mise à jour d'une installation existante
`npm run migrate` : le découpage du décret est posé si aucun district n'était défini.

## [0.15.40] — 2026-10-16 — WaPla, lot W5 : les agrégats nationaux des bilans étayés

L'observatoire de la FNCT additionne les bilans WaPla par territoire
(`docs/specs_metier/SPEC_wapla_couche_planification.md` § 6, précisé au lot W5).

### Ce qui entre dans un agrégat (migration 077)
- **`wapla.bilans_agregeables(exercice)`** tient la règle en base : un bilan **calculé**, **étayé**, non
  retiré, d'une commune **réelle**. N'y entrent ni un bilan indicatif ou illustratif, ni un brouillon, ni
  la commune de démonstration, ni une commune retirée du référentiel. Réservée à la FNCT, aussi en SQL
  direct (`AGREGAT_FNCT`).
- **`wapla.communes_par_gouvernorat()`** : le « M », les communes réelles de chaque gouvernorat, avec ou
  sans bilan, et leur district FNCT.

### `GET /wapla/agregats?exercice=` (FNCT)
- National, par district (les gouvernorats sans district en un groupe nommé) et par gouvernorat :
  **« N sur M communes »**, puis le gisement, les déchets mis en décharge, brûlés à l'air libre, les GES
  (potentiel engagé), les dioxines et furanes — avec la définition de la comparaison des scénarios.
- Un territoire sans bilan étayé n'a **pas de chiffre** (`null`, jamais 0).
- **Aucun classement** : ni rang, ni ligne par commune ; ordre alphabétique (districts : ordre de la FNCT).

### L'écran
« **Bilans WaPla étayés** » (observatoire, pôle Performance & déploiement) : l'exercice, l'ensemble des
communes, puis le tableau par gouvernorat ou par district, sans tri par valeur ; FR/AR, téléphone.

### Campagne `wapla-agregats`
Elle bâtit un gouvernorat d'essai de 31 communes, dont 12 avec un bilan étayé, et autour d'elles tout ce
qui ne doit pas compter (un indicatif, un illustratif, un brouillon, un étayé retiré, un étayé d'un autre
exercice, une commune retirée et la commune de démonstration avec chacune un bilan étayé). Test de sortie :
« 12 sur 31 », la commune de démonstration absente, les sommes égales à celles d'un témoin qui ne lit que
les résultats du moteur, aucune clé ni route de rang ou de classement dans le contrat.

### CLAUDE.md et README
- CLAUDE.md : `ON CONFLICT … DO UPDATE` sur une table RLS exige une politique `UPDATE` (leçon de la
  v0.4.0) ; une colonne `GENERATED` n'est pas calculée dans un déclencheur `BEFORE` (leçon du lot 16.2) ;
  une campagne restaure toute donnée réelle qu'elle modifie, ou travaille sur une base jetable (JC-007,
  `mot-de-passe-public`).
- README : « Une base devient production définitivement. Vérifiez la variable avant de démarrer. »

## [0.15.39] — 2026-10-14 — WaPla, lot W4b : les écrans des scénarios

Les écrans des scénarios du PCGD (`docs/specs_metier/SPEC_wapla_couche_planification.md` § 6, point 3),
sur les routes du lot W4a.

### Dans le bilan
- Une section « **Les scénarios** » : la liste (brouillon, calculé, figé) et la création d'un scénario
  nommé — seulement depuis un bilan calculé, l'écran le dit sinon.
- L'exercice proposé à l'ouverture d'un bilan est le premier qui n'en a pas encore : la liste montrait une
  année quand le bouton en gardait une autre.

### Le scénario
- **Les hypothèses** : les entrées de planification, chacune partant du statu quo avec sa provenance ; une
  valeur changée prend le badge « **Hypothèse du scénario** ». Les coûts du statu quo restent ceux de SIIPI
  et ne sont pas demandés.
- **Les coûts de ce que le scénario ajoute**, pour chaque procédé optionnel en service : investissement,
  durée d'amortissement, taux, exploitation, recettes.
- **La comparaison** : statu quo, scénario et écart **signé** pour les déchets mis en décharge, brûlés à
  l'air libre, les GES (potentiel engagé, dit à côté), les dioxines et furanes ; puis le coût de ce que le
  scénario ajoute — « +54 700 TND/an », ou « non renseigné » avec les procédés dont il manque les coûts.
- **Figer**, avec confirmation : en tête, « figé le …, calculé par le moteur … : ce scénario ne change
  plus » ; plus aucun champ, plus de calcul.
- Le résultat détaillé du scénario (diagramme, tableaux) en dépliant ; retrait du scénario.

### Banc d'essai
Le script du critère supprime désormais aussi le schéma `wapla` avant de rejouer les migrations : depuis
W2a, il ne supprimait que `public` et `app`, si bien que la « base neuve » gardait les tables et les lignes de
la couche d'un passage à l'autre. Le critère a été rejoué sur une base vraiment neuve (W2a à W4b compris).

## [0.15.38] — 2026-10-14 — WaPla, lot W4a : les scénarios, comparés au statu quo

Les données et le calcul des scénarios du PCGD (`docs/specs_metier/SPEC_wapla_couche_planification.md`
§ 5, § 6 point 3). Les écrans suivent au lot W4b.

### Un scénario (migration 076)
- **`wapla.scenarios`** : un scénario part d'un bilan **calculé** — le statu quo. Il en copie les entrées,
  avec leur provenance ; la commune y pose ses hypothèses (`hypothese_scenario`) : une part envoyée au
  compostage, un procédé activé, un investissement. Une hypothèse posée rend le calcul caduc.
- **Le calcul** (moteur corrigé, dans l'API) **copie le résultat du statu quo** dans le scénario :
  recalculer le bilan ensuite ne change pas la comparaison.
- **Figé, un scénario ne change plus** : ni ses entrées, ni son résultat, ni sa comparaison, ni la version
  du moteur. La base le tient — l'API répond 409, le SQL direct est refusé. Il ne peut qu'être retiré,
  logiquement.

### La comparaison (`src/wapla/comparaison.ts`, fonction pure)
- Statu quo, scénario et écart pour ce que la note de cadrage nomme : **tonnes mises en décharge, tonnes
  brûlées à l'air libre, t CO₂-éq, mg TEQ**.
- **L'écart de coût** ne porte que sur ce que le scénario **ajoute** (SPEC § 5) : un procédé qui ne reçoit
  rien dans le statu quo et reçoit des déchets dans le scénario — annuité, exploitation, moins recettes. Un
  procédé déjà en service garde son coût dans celui de SIIPI. Un coût manquant rend l'écart « non
  renseigné », avec le procédé en cause.

### Routes `/wapla`
`GET`/`POST /wapla/bilans/{id}/scenarios`, `GET /wapla/scenarios/{id}`,
`PUT /wapla/scenarios/{id}/entrees/{cle}`, `POST /wapla/scenarios/{id}/calcul`,
`POST /wapla/scenarios/{id}/figer`, `POST /wapla/scenarios/{id}/retrait`.

### Campagne `wapla-scenarios`
Refus d'abord (bilan non calculé, FNCT — aussi en SQL direct —, prestataire, sans nom, hypothèse inconnue
ou hors bornes, figer un brouillon). Puis 20 % de la collecte au compostage : moins de déchets en décharge,
le compostage reconnu comme ajouté, l'écart « non renseigné » puis égal à 200 000 / 10 + 50 000 − compost ×
20 ; les grandeurs et l'écart recalculés par un témoin des seuls résultats stockés, le résultat confronté au
témoin du moteur. Le **test de sortie de W4** : figé, le scénario garde ses chiffres, sa comparaison, sa
version et ses entrées à l'octet près après un changement des références de la FNCT et un nouveau calcul du
statu quo. Les scénarios d'un bilan illustratif sont cachés à la FNCT.

## [0.15.37] — 2026-10-14 — WaPla, lot W3 : l'écran du bilan de planification

Le premier écran de la couche WaPla (`docs/specs_metier/SPEC_wapla_couche_planification.md` § 6), dans le
pôle Pilotage du portail communal : **« Bilan de planification (WaPla) »**. La mention « Estimation de
planification — méthode UNIDO WaPla. Ce n'est pas une mesure. » suit chaque vue.

### L'amorce, puis le bilan
- La commune ouvre le bilan d'un exercice : il naît de ce que SIIPI tient (W2a, W2b).
- Les **25 entrées de planification**, en 10 groupes (gisement, collecte, procédés en service, destination,
  non-collecté, gasoil, coûts, composition, climat, décharge), chacune avec **sa provenance** — mesurée ou
  déclarée dans SIIPI, saisie, référence nationale, valeur par défaut UNIDO — et, quand SIIPI ne la tient
  pas, **la raison** que donne l'amorce. Une part se saisit en %, un procédé s'active ou se désactive, la
  gestion de la décharge se choisit.
- « **Garder la valeur UNIDO** », exprès : elle compte comme telle dans le niveau de fiabilité.
- **Calculer** reste fermé tant qu'une entrée clé n'est pas traitée, et l'écran dit lesquelles.
- Les facteurs techniques de l'outil (facteurs d'émission, coefficients) restent à leur valeur UNIDO,
  lisibles, non modifiables à cette étape.

### Le résultat
- Le **niveau de fiabilité** en tête, avec ce qui le fixe (part des entrées comptées restées par défaut,
  seuil de la FNCT) et la version du moteur ; un bilan illustratif porte un **bandeau permanent**.
- Le **diagramme de Sankey** des flux (t/an), lu de gauche à droite en arabe aussi ; sur téléphone, il
  défile dans son cadre. Les résidus des feux, qui reviennent en décharge (correction D8), ne sont pas
  dessinés — ils feraient une boucle — et l'écran le dit ; ils sont dans le tableau des flux.
- Les **GES** par procédé, avec à côté ce qu'est le total : un **potentiel engagé**, pas l'émission de
  l'année ni un inventaire national.
- Les **uPOPs** par procédé et par milieu (air, eau, sol, produit, résidus).
- Les **coûts** par procédé : « non renseigné » quand un terme manque, jamais 0.
- **L'export** Excel ou CSV (`GET /wapla/bilans/{id}/export`) : la mention de méthode, **toutes** les
  entrées du moteur avec leur provenance — les valeurs par défaut de l'UNIDO utilisées nommées comme
  telles —, puis les résultats.

### Campagne `wapla-bilans` (51)
Six contrôles de l'export s'ajoutent : la méthode en tête avec la version et le niveau, chaque entrée avec
sa provenance, le total de GES dit potentiel engagé, le CSV qui nomme les valeurs par défaut, la lecture par
la FNCT, le refus au prestataire.

## [0.15.36] — 2026-10-14 — WaPla, lot W2b : les bilans, le calcul, le niveau de fiabilité

Deuxième lot de la couche WaPla en base (`docs/specs_metier/SPEC_wapla_couche_planification.md` § 3.1,
§ 6). Une **estimation de planification**, jamais une mesure ; aucun chiffre de SIIPI n'en dépend.

### Les bilans (migration 075)
- **`wapla.bilans`** : un par commune et par exercice. Il **naît de l'amorce** (W2a) : chaque entrée que
  SIIPI tient y entre avec sa provenance et sa source. Ni centre de tri ni incinération dans le statu quo
  d'une commune tunisienne (SPEC § 3.3).
- **`wapla.entrees`** : saisie de la commune (dans les bornes de l'outil), ou **valeur par défaut de
  l'UNIDO gardée exprès** — elle compte alors comme telle. Une entrée ne s'efface pas.
- **Le calcul** se fait dans l'API avec le moteur **corrigé** ; la base garde le résultat, la **version du
  moteur** et le niveau. **Une saisie rend le résultat caduc** : le bilan revient au brouillon.
- Un bilan se **retire** (suppression logique) ; un autre peut alors s'ouvrir pour le même exercice.

### Le niveau de fiabilité (`src/wapla/fiabilite.ts`, fonction pure)
- Les trois **clés** — gisement, taux de collecte, destination (la part de chaque procédé actif) — doivent
  être traitées avant le calcul (SPEC § 6).
- Une clé gardée par défaut → **illustratif** : visible par la commune seule, **la base le cache à la FNCT**.
- Sinon, la part des **17 entrées comptées** (`wapla.cles_entrees`) restées par défaut — ou issues de la
  seule moyenne nationale — au moins égale au **seuil de la FNCT** (`wapla.reglages`, 30 %, réglable) →
  **indicatif** ; en dessous → **étayé**. Le détail (quelles entrées, quelle part, quel seuil) est gardé.

### Une couche qui ne compte pas dans SIIPI
Les tables de la couche n'ont pas le journal d'audit de SIIPI, exprès : le déploiement national compte
les écritures de la commune au journal, et une saisie WaPla y ferait passer une commune pour active. Elles
gardent leur propre trace (qui, quand).

### Routes `/wapla`
`GET`/`PUT /wapla/reglages…` (FNCT), `GET`/`POST /wapla/bilans`, `GET /wapla/bilans/{id}`,
`PUT /wapla/bilans/{id}/entrees/{cle}`, `POST /wapla/bilans/{id}/calcul`, `POST /wapla/bilans/{id}/retrait`.

### Campagne `wapla-bilans`
Refus d'abord (lecture sans compte, par un citoyen ou un prestataire ; ouverture, saisie ou retrait par la
FNCT — aussi en SQL direct ; autre commune, exercice futur, doublon ; entrée inconnue, hors bornes, sans
défaut ; calcul avant les clés ; entrée effacée ; provenance de SIIPI sans source). Puis le parcours : né de
l'amorce, une clé gardée par défaut (illustratif, invisible pour la FNCT), la clé saisie (étayé : 5 entrées
comptées sur 17 par défaut, 29,4 %), le seuil abaissé à 25 % (indicatif), une saisie qui rend le résultat
caduc. Le résultat stocké est confronté au **témoin indépendant** (mode corrigé) ; la masse se conserve ; et
rien de ce que la commune fait dans la couche ne compte comme saisie dans SIIPI.

## [0.15.35] — 2026-10-14 — WaPla, lot W2a : le schéma à part, les références, l'amorce

Premier lot de la couche WaPla en base (`docs/specs_metier/SPEC_wapla_couche_planification.md` § 2 et
§ 3). La couche lit SIIPI ; SIIPI ne la lit jamais.

### Un schéma à part (migration 074)
- **`wapla`** : tout ce qui est WaPla y vit. Aucune fonction, vue, contrainte ou déclencheur de SIIPI n'y
  touche.
- **`wapla.facteurs_reference`** : les références tunisiennes — les normales climatiques par gouvernorat
  (pluie annuelle, température moyenne), tenues par la **FNCT**, datées, **sourcées**, dans des bornes
  plausibles. Une valeur ne se corrige ni ne s'efface : elle se **retire avec son motif**, et la suivante
  prend sa place. Rien n'est ajouté aux paramètres nationaux de SIIPI.

### L'amorce : ce que SIIPI propose pour chaque entrée de WaPla
`wapla.amorce_commune(commune, exercice)` et **`GET /wapla/amorce`**, avec les droits de l'appelant (les
règles de lecture de SIIPI s'appliquent) :
- le **gisement** (population retenue × production théorique × 365) — déclaré ;
- les **déchets collectés** (pesées ménagères de l'exercice) — mesurés, **sans extrapolation** : un
  exercice pesé en partie le dit (« 3 mois pesés sur 12 ») ;
- le **taux de collecte** (collecté / gisement) — au-delà de 1, **un écart à montrer**, jamais un plafond ;
- le **gasoil de collecte** (pleins des engins « Propreté (levée des déchets) ») — mesuré ; sans plein,
  « non renseigné », jamais 0 L ;
- le **coût de collecte** du statu quo : le coût total publié par l'étude de coût complet de l'exercice,
  lu tel quel ;
- l'**exploitation de la décharge** : la redevance ANGeD, chaque pesée au taux de sa date, et son caractère
  provisoire ;
- la **composition** retenue (étude de la commune, PCGD, autre étude, puis moyenne nationale, dite comme
  telle) ;
- le **climat** du gouvernorat.
Une entrée que SIIPI ne tient pas reste vide, avec ce qui manque. Ne sont pas proposés : la destination des
tonnages (`pesees.destination` est un texte libre), le non-collecté, la gestion de la décharge — la commune
les saisira (lot W2b).

### Routes `/wapla`
`GET /wapla/amorce`, `GET /wapla/facteurs-reference`, `POST /wapla/facteurs-reference` (FNCT),
`POST /wapla/facteurs-reference/{id}/retrait` (FNCT, motif obligatoire). Les routes vivent dans
`src/wapla/` ; hors de ce dossier, seuls `app.ts` (qui les monte) et le contrat les importent — jamais le
moteur.

### Campagne `wapla`
Elle commence par les refus (amorce : sans compte, citoyen, prestataire, autre commune, exercice futur ;
références : saisies par une commune — aussi en SQL direct —, sans source, hors bornes, gouvernorat inconnu,
en double, corrigées, effacées, retirées sans motif), bâtit une commune de test et recalcule chaque valeur de
l'amorce des seules lignes insérées. La **séparation** : aucun objet de SIIPI ne dépend du schéma `wapla`
(pg_depend — et le contrôle attrape bien une vue qui le lirait), aucune fonction de SIIPI ne le nomme, et le
schéma supprimé le temps d'une transaction, les chiffres de SIIPI (complétude, indicateurs, redevance,
production) sont identiques à la ligne près.

## [0.15.34] — 2026-10-14 — WaPla, lot W1b : le mode corrigé

Deuxième lot du moteur WaPla (`docs/specs_metier/SPEC_wapla_couche_planification.md` § 4.2) : le mode
**corrigé**, désormais le mode par défaut et le seul qui s'affichera. Le mode fidèle reste, pour les
campagnes.

### Les dix défauts corrigés
- **D1** : les uPOPs du dépotoir soustraient le tonnage nettoyé, plus la constante 36.
- **D2** : avec valorisation énergétique, le CO₂ fossile des plastiques reste compté ; le crédit s'y ajoute.
- **D3** : un seul total de GES, feux compris.
- **D4** : un total de coût dont un terme manque est « non renseigné », jamais 0 (règle d'or 1.1) — la
  décharge, mais aussi la collecte, le compostage, l'incinération, le centre de tri et le total général.
  Un procédé absent coûte 0 ; un investissement nul se saisit 0.
- **D5** : un prix de recyclage manquant ne rend « non renseigné » que son matériau
  (`recyclage_par_matiere`).
- **D6** : plus de 20 °C et exactement 400 mm de pluie donnent la classe 4 ; l'outil s'arrêtait.
- **D7** (tranché le 14/10/2026) : le méthane de décharge et de dépotoir porte sur la part ni brûlée ni
  récupérée de ce qui a du carbone dégradable — l'entrée **sans les résidus** d'incinération, de feux et de
  brûlage. Des cendres en plus ne changent plus le méthane (40 % incinéré, 55 t de résidus : 362,9 t CO₂-éq,
  contre 337,4 dans l'outil). Le curseur de dégradation reste un paramètre de masse.
- **D8** : les résidus des feux rentrent dans la décharge et le dépotoir ; la boucle se résout exactement.
  La masse est conservée : Σ des puits = gisement.
- **D9** : sans climat, le dépotoir prend aussi le multiplicateur de gestion (0,7 × 1,05).
- **D10** : des parts dont la somme dépasse 100 % (composition, nature des déchets, recyclables) sont
  refusées, avec ce qu'il faut corriger.

### Ce qui change dans les résultats
- `ges.total` remplace `total_interne` (fidèle : sans les feux, comme l'outil ; corrigé : feux compris) ;
  `ges.total_affiche` n'existe qu'en mode fidèle. `couts.total` remplace `total_affiche`.
- Chaque résultat porte `mode` et la liste de ses `corrections` ; `version_moteur` : `w1b-1`.
- L'arrondi « à deux chiffres » du mode fidèle va au chiffre pair à égalité, comme R (7 450 → 7 400) ; il
  allait vers le haut.

### Campagne `wapla-moteur` (70)
Le témoin indépendant `tests/wapla_attendus.py` reçoit les mêmes corrections, écrites autrement (la boucle
des feux s'y résout par itérations) : moteur et témoin d'accord à 10⁻⁹ près sur 215 jeux, dans douze
réglages (fidèle, corrigé, chaque correction seule). En mode corrigé, la masse est conservée à 10⁻⁶ t près
sur chaque jeu calculé ; appliquée seule, chaque correction ne change que ce que son défaut touche, et
aucune n'est muette.

## [0.15.33] — 2026-10-14 — WaPla, lot W1a : le moteur, en mode fidèle

Premier lot de code de la couche WaPla (`docs/specs_metier/SPEC_wapla_couche_planification.md` § 4) :
le moteur de l'outil UNIDO WaPla v1.5 (TU Wien, 2021), réécrit. **Réutilisation confirmée par l'UNIDO
le 13 octobre 2026** : le moteur et sa spécification (`docs/specs_metier/sources/wapla/
wapla-moteur-reference.md`) entrent dans le dépôt.

### Une fonction pure, à part
- **`backend/src/wapla/moteur.ts`** : des entrées, des résultats — flux de matière (37 flux, 35
  coefficients de transfert, procédés optionnels retirés et réacheminés comme dans l'outil), uPOPs
  (mg TEQ/an), GES (t CO₂-éq/an, méthane en potentiel engagé), classe climatique, coûts (annuités,
  coûts spécifiques). Ni base, ni route, ni écran ; il n'importe que zod, et aucun fichier de SIIPI ne
  l'importe. Chaque résultat porte `version_moteur` et son mode.
- **Mode fidèle seulement** : il reproduit l'outil, défauts compris (D1 à D10 de la note de cadrage :
  la constante 36 des uPOPs du dépotoir, le CO₂ fossile qui disparaît avec la valorisation énergétique,
  le total de GES sans les feux, le coût de décharge nul, la ligne de recettes qui disparaît, le trou de
  la classe climatique, le bilan de masse qui fuit des résidus des feux…). C'est la preuve que l'outil
  est compris ; le mode corrigé, le seul qui s'affichera, vient au lot W1b.
- Le moteur **refuse** ce que l'outil laisse passer sans calcul possible : une clé inconnue (une faute
  de frappe garderait la valeur par défaut sans que personne le voie), une durée d'amortissement
  nulle (coût infini), un coût saisi pour un procédé inactif (l'outil ne dit pas ce qu'il en fait).
- `npm run wapla:calculer` : le moteur en ligne de commande, une liste de jeux en entrée.

### Campagne `wapla-moteur`
Elle commence par les refus, retrouve les vecteurs de référence de l'annexe (valeurs par défaut et
scénario B : 460 t collectées, 238,28 t en stock de décharge, 699,3 t CO₂-éq feux compris, 690 dans le
tableau de l'outil), confronte le moteur au **témoin indépendant** `tests/wapla_attendus.py` sur 13 jeux
fixes et 200 tirés au hasard (graine fixe), puis vérifie que chaque défaut D1 à D10 est bien là.

Les vecteurs viennent d'une lecture du code de l'outil, pas encore d'une exécution : les rejouer dans
l'application WaPla sous Windows reste à faire (lot W0).

## [0.15.32] — 2026-10-13 — Refonte, lot 5 : « Ma commune dans SIIPI »

Dernier lot de `docs/specs_metier/SPEC_refonte_indicateurs_saisie.md` (§ 2.4) : la complétude de la
commune. **Ce n'est pas une note** — ni pourcentage, ni jauge, ni « 12 sur 21 », ni liste qui compare les
communes : une liste de choses à faire.

### Ce que la commune a, ce qui lui reste à ajouter (migration 073)
- **`elements_completude`** : 14 données de référence (population, périmètre, secteurs, circuits, parc,
  plans d'entretien, agents de terrain, effectif et masse salariale de l'année, objectif de balayage,
  commerces, PCGD, caractérisation, contacts) et 7 registres du mois (pesées, carburant, pointage, fins de
  poste, contrôles terrain, entretien, nettoyages). Chacun dit en français et en arabe ce qu'il est et à
  quoi il sert, et où il se complète : un formulaire du registre d'ajout, un écran, un paramètre.
- **Ce qu'il débloque** se lit dans les dépendances du lot 3a (`sources_elements_completude` →
  `dependances_indicateurs`) : jamais recopié. Un élément qui alimente un indicateur est « présent »
  exactement quand la source est tenue (`app.source_tenue`) : « présent » ici et « il manque » sur
  l'indicateur ne se contredisent pas.
- **`app.completude_commune(commune, jour)`** et **`GET /kpi/completude`** : une commune à la fois (la FNCT
  doit en nommer une), un jour qui n'est pas dans le futur ; les registres portent sur le mois de ce jour.
  Un élément à ajouter n'a pas de nombre — l'écran dit « à ajouter », jamais « 0 ».
- Restent dehors, exprès : le registre des incidents (un mois sans accident est une bonne nouvelle, il ne
  doit pas s'afficher « à ajouter »), les réclamations résolues, la dotation EPI, les nettoyages des lieux
  qui ne valent que pour certaines communes. Une moyenne nationale ne rend pas la caractérisation
  « présente » : c'est le repli, pas une étude de la commune.

### L'écran
- **« Ma commune dans SIIPI »**, en tête du pôle Pilotage : deux listes, « Les données de référence » et
  « Les registres de oct. 26 », chaque ligne « Présent » ou « À ajouter », ce qu'il y a derrière
  (« Circuits enregistrés : 13. »), les indicateurs qu'elle débloque ou alimente, et son bouton :
  « Ajouter » ouvre le formulaire sur place, « Renseigner » le paramètre, « Ouvrir « Pesées » » l'écran.
  Une case ne montre que ce qui reste à ajouter. La FNCT lit, sans boutons.
- **Un seul composant** décide du formulaire qui complète une donnée (`kpi/LigneACompleter.tsx`) : le
  panneau d'un indicateur (« il manque ») et cet écran s'en servent tous deux.

### Campagne `completude`
Elle commence par ce que la plateforme refuse (sans compte, citoyen, prestataire, autre commune, liste
« toutes communes », jour futur ou inexistant, catalogue réécrit, fonction interne), bâtit une commune vide
— tout y est « à ajouter », sans aucun nombre — puis la remplit élément par élément ; une pesée d'aujourd'hui
ne compte plus la veille du premier du mois ; une intervention d'entretien sans coût ne tient pas le registre,
et l'indicateur dit la même chose.

## [0.15.31] — 2026-10-13 — Refonte, lot 4b : le déploiement en tête, la répartition sur une carte

Seconde moitié du lot 4 de `docs/specs_metier/SPEC_refonte_indicateurs_saisie.md` (§ 4) : les écrans
de la FNCT, sur les routes du lot 4a. Aucune migration, aucune route nouvelle.

### Le suivi du déploiement, en tête de la synthèse nationale
- **`SuiviDeploiement`**, première section après le titre : les douze derniers mois en barres
  empilées — communes qui **saisissent**, **inactives ce mois**, **pas encore démarrées**,
  **désactivées** — et la phrase du mois (« En oct. 26, sur 350 communes — saisissent : 5 · … »).
- Les chiffres du graphique sont aussi dans un tableau, dépliable ; le mois en cours se lit par
  gouvernorat ou par district, **dans l'ordre alphabétique**. Les deux s'exportent.

### La répartition d'un indicateur, sans classement
- **« Répartition »**, première vue (et vue par défaut) d'« Indicateurs & 5 axes » : un indicateur
  des 5 axes, de la préparation au tri ou des données des communes, par gouvernorat ou par district.
- **La carte des gouvernorats** : cinq teintes du plus clair au plus foncé entre la plus petite et la
  plus grande moyenne, **gris pour « non renseigné »** ; la bulle de chaque gouvernorat dit
  « N sur M communes ». Une seule valeur donne une seule case de légende. En district, un gouvernorat
  **non rattaché** reste gris : ce n'est pas un territoire, sa moyenne ne le colore pas.
- **Le graphique** suit l'ordre alphabétique des groupes ; le tableau des groupes donne la moyenne,
  sur combien de communes elle porte, mesurées et déclarées à part.
- **Le détail par commune** (FNCT) : tri par nom, gouvernorat ou valeur — le taux d'atteinte quand
  l'indicateur se lit en taux, les communes sans valeur toujours en bas —, recherche sans accents,
  export. La source de chaque valeur s'écrit en toutes lettres.

### Vérifié dans le navigateur (banc d'essai, FNCT)
- Synthèse : la section du déploiement en tête, 12 mois, aucune erreur dans la console.
- Répartition : 24 gouvernorats sur la carte, 24 groupes, 350 communes ; « Circuits enregistrés » colore
  Nabeul seul (« 1 sur 28 communes »), le tri par valeur met Dar Chaâbane El Fehri en tête et les
  communes sans valeur en bas. En arabe, à 375 px : sens de droite à gauche, aucun débordement.

## [0.15.30] — 2026-10-13 — Refonte, lot 4a : le tableau national, sans classement ni tonnage mêlé

Première moitié du lot 4 de `docs/specs_metier/SPEC_refonte_indicateurs_saisie.md` (§ 4) : les
données et les routes. Les écrans (suivi du déploiement en tête, carte et graphique de répartition)
suivent au lot 4b.

### Ce qu'est une saisie de la commune (migration 072)
- **`app._saisies_communales`** : une écriture de la commune elle-même (son directeur ou le
  prestataire qui travaille pour elle), une pesée réelle qu'elle enregistre, un pointage de ses
  agents. **Pas une écriture de la FNCT** sur la fiche de la commune, pas une réclamation d'un
  citoyen, pas un script. Jusqu'ici, « active » comptait toute écriture au journal — FNCT comprise —
  et ignorait les pesées du module 6, que le journal ne voit pas. `app.statut_communes` repose
  désormais sur cette définition.

### Le déploiement, mois par mois
- **`app.activite_communes`** et **`GET /observatoire/activite`** (FNCT, au plus 24 mois,
  exportable) : pour chaque mois, les communes qui **saisissent**, les **inactives** (elles ont
  commencé, rien ce mois-là), celles **pas encore démarrées**, et les **désactivées** — pour le pays,
  par gouvernorat ou par district. L'activation est celle d'aujourd'hui : la base n'en garde pas
  l'historique comme une donnée.

### Un tonnage estimé ne s'additionne jamais à un tonnage pesé
- **`app.tableau_gouvernorats`** additionnait les tonnages de référence de toutes les communes,
  estimés, déclarés et mesurés confondus — et l'écran national l'affichait sous le titre « Tonnage
  déclaré ». Il les donne désormais **chacun dans sa colonne** (`tonnage_jour_estime`, `_declare`,
  `_mesure`), et le **tonnage pesé** à part (pesées réelles des douze derniers mois, avec le nombre de
  communes pesées). La production par habitant, calculée sur le total mêlé, disparaît.
- L'écran national, en attendant le lot 4b : la carte « Tonnage pesé (12 mois) », avec le nombre de
  communes derrière ; deux colonnes séparées dans le tableau par gouvernorat.

### La répartition d'un indicateur, sans classement
- **`GET /kpi/repartition`** (FNCT, exportable) : par gouvernorat, par district ou pour le pays, la
  moyenne — et **sur combien de communes elle porte** (« 4 communes sur 5 »), mesurées et déclarées à
  part. Au niveau commune, la valeur de chacune, **par ordre alphabétique**. Aucun rang, aucun ordre
  par valeur.
- **`/kpi/dma`** au niveau commune ne range plus les communes de la mieux à la moins bien préparée :
  par nom.

### La carte
- **`app.contours_gouvernorats`** et **`GET /observatoire/contours-gouvernorats`** : les 24
  gouvernorats, dissous à partir des communes réelles (quelques secondes de calcul, gardés en mémoire
  tant que le découpage ne change pas).

### La commune de démonstration, absente partout
- Elle n'entre ni dans le déploiement, ni dans les tonnages, ni dans les répartitions, ni dans les
  contours ; son gouvernorat n'est plus proposé au rattachement à un district (`/kpi/districts`).

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 72 migrations ; la 072 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat **315/315**, **48 bilans, 1 947 tests réussis,
  aucun échec** ; la nouvelle campagne `tableau-national` : 35 réussis, aucun échec. Recomptage 48 / 48.
- `audit-blocs.py` : 28 blocs sous condition, tous leurs contrôles ont tourné. Lint backend et web (TypeScript 5.8.3) : code 0.
- `tableau-national` bâtit un gouvernorat de cinq communes et deux communes de démonstration, et
  recalcule ses attentes des seules données insérées : la FNCT qui qualifie une commune ne la rend pas
  active, une pesée du module 6 si ; janvier, février et mars 2021 donnent 2, 1 et 1 commune qui
  saisissent ; estimé 16, déclaré 20, mesuré 30 t/j, pesé 19 t sur 4 communes, jamais additionnés ;
  « 4 communes sur 5 », moyenne 4,75 t ; aucune des réponses nationales ne porte un rang.

## [0.15.29] — 2026-10-13 — Refonte, lot 3b : les indicateurs en graphiques, et « compléter sur place »

Seconde moitié du lot 3 de `docs/specs_metier/SPEC_refonte_indicateurs_saisie.md` (§ 3.3) : ce que
voit le directeur. Décision D2 : les indicateurs se lisent sur des graphiques interactifs, et un
indicateur qui ne se calcule pas s'ouvre sur ce qui lui manque, avec de quoi le compléter sur place.

### L'écran Indicateurs
- **Une carte par indicateur**, rangée par axe, puis la préparation DMA, puis les **données de la
  commune** (tonnage, coût à la tonne, effectifs…) : la valeur et son unité, la source écrite en
  toutes lettres (« mesuré », « déclaré », « non renseigné », « sans objet »), l'atteinte de
  l'objectif quand il y en a un, et une **petite courbe de douze mois** qui ne relie pas deux mois à
  travers un mois vide. Un indicateur annuel le dit, au lieu d'une courbe.
- Les petites courbes viennent d'un seul appel : **`app.series_commune`** et **`GET /kpi/series`**
  (migration 071) calculent chaque mois une seule fois pour tous les indicateurs mensuels, avec les
  règles de `app.serie_indicateur`.
- **Au clic, un panneau à côté de la vue** (en plein écran sur téléphone) :
  - un **graphique interactif** (Recharts) : valeur exacte au survol, 3, 6, 12 mois ou 5 ans,
    comparaison avec l'année précédente, **repère du gouvernorat** quand au moins cinq communes y ont
    une valeur — et sinon une phrase qui le dit ;
  - **les données sous le graphique**, en tableau, un mois vide écrit « non renseigné », exportables
    en CSV ou Excel ;
  - **la formule et les sources**, en français et en arabe (`GET /kpi/dependances`).
- **« Pour calculer cet indicateur, il manque : »** — chaque élément s'ouvre sur place : le formulaire
  du registre d'ajout (plein de carburant, fin de poste, dotation EPI…), la **déclaration** de
  l'indicateur (`FormulaireDeclaration` : valeur, cible d'un ratio, commentaire), ou le **paramètre**
  de la commune (population, objectif de balayage) ; un écran du portail quand la donnée en demande
  le contexte. Une fois la donnée enregistrée, l'écran se relit, la carte change, et **le graphique
  apparaît dans le même panneau**, sans rechargement. La FNCT lit la liste, sans bouton.
- En arabe, les libellés sont arabes et le **temps reste orienté de gauche à droite** (SPEC § 6, à
  confirmer en recette).

### Le registre des formulaires
- La population et les seuils de la commune (dont l'objectif de balayage) quittent la page Paramètres
  pour `ajout/FormulairesParametres.tsx` : la page et le panneau montrent le même composant.

### Dépendance nouvelle
- **Recharts 3.10.1** (publiée le 25 juillet 2026) et **react-is 19.3.0**, au niveau de React.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 71 migrations ; la 071 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat **312/312**, **47 bilans, 1 912 tests réussis,
  aucun échec** ; `series-indicateurs` : 50 réussis, aucun échec (dont les séries de la commune en un passage :
  mêmes points que la série seule, février toujours absent, aucun indicateur annuel découpé en mois).
- `audit-blocs.py` : 28 blocs sous condition, tous leurs contrôles ont tourné. Lint backend et web (TypeScript 5.8.3) : code 0.
- Navigateur, en directeur : tonnage d'août et d'octobre avec septembre vide, sans trait à travers le
  trou ni zéro dans le tableau ; « Désherbage » non renseigné → « Compléter » → 140 % refusé avant
  l'envoi → 72 % : la carte passe à « déclaré », la couverture de 2 à 3 sur 19, le graphique apparaît
  dans le panneau ; l'objectif de balayage s'ouvre sur place ; « Ouvrir « Registres » » conduit à
  l'écran. En FNCT : la liste de ce qui manque, sans bouton. En arabe à 375 px : panneau plein écran
  au-dessus du bouton flottant, temps de gauche à droite, mois en arabe, sans défilement horizontal.

## [0.15.28] — 2026-10-13 — Refonte, lot 3a : les indicateurs dans le temps, et ce qui leur manque

Première moitié du lot 3 de `docs/specs_metier/SPEC_refonte_indicateurs_saisie.md` (§ 3.1, § 3.2, et
le repère du § 3.3) : les données d'abord. Les graphiques, le panneau et « compléter sur place »
suivent au lot 3b.

### Un seul calcul, pour toute période (migration 070)
- Les corps de `app.mesures_kpi` (063) et `app.mesures_kpi_auto` (051) deviennent des fonctions
  internes qui prennent une période et une liste de communes ; les fonctions annuelles d'origine les
  appellent. La valeur d'une année et la série de ses mois sortent du **même code** ; les valeurs
  annuelles ne bougent pas (`kpi-5-axes`, `kpi-sources` et `simulation-3mois` inchangées).
- Les effectifs, annuels, ne se lisent que sur une année entière : un mois ne porte pas la masse
  salariale d'une année.
- `app.mesures_kpi_communes` et `app.mesures_kpi_auto_communes` : l'écran d'une commune ne calcule
  plus les 350 communes que la FNCT peut lire pour n'en garder qu'une (même droit d'accès).

### La série d'un indicateur
- **`app.serie_indicateur`** et **`GET /kpi/serie`** (mois ou année, 36 mois ou 10 ans au plus) :
  une ligne par période qui a une valeur, **aucune** pour une période sans donnée — un mois sans
  pesée est un trou, jamais un zéro (règle d'or 1.1). Chaque point porte sa source, mesuré ou
  déclaré ; une déclaration mensuelle fait un point mensuel.
- Le point annuel est calculé par le service de la carte de l'indicateur : la courbe et la carte ne
  peuvent pas dire deux chiffres pour la même année.
- La **granularité** devient une donnée du catalogue : mensuelle (registres datés), annuelle
  (effectifs, déclarations), actuelle (plans d'entretien, circuits enregistrés : un état d'aujourd'hui
  ne se reporte pas sur le passé).
- La série s'exporte en CSV ou XLSX (service d'export existant).

### Ce qui manque à un indicateur
- **Les dépendances sont une donnée** : `sources_indicateurs` (28 sources, avec ce qui les complète :
  un formulaire du registre d'ajout, un écran, un paramètre, la déclaration elle-même — ou rien, quand
  la donnée vient des citoyens ou de la FNCT) et `dependances_indicateurs` (des groupes : il faut
  chacun ; dans un groupe, une source suffit — le registre carburant, OU la déclaration de la dépense).
- **`app.manques_indicateur`** et **`GET /kpi/manques`** : ce qui manque pour l'année, groupe par
  groupe, avec le formulaire à ouvrir. Un indicateur calculé se complète par ses données sources,
  jamais en tapant le résultat ; un indicateur sans objet ne manque de rien.
- La formule de chaque indicateur, **en arabe** (`description_ar`), à côté de la description
  française.

### Le repère du gouvernorat
- **`app.reference_gouvernorat`** et **`GET /kpi/reference-gouvernorat`** : par période, la moyenne
  des communes réelles du gouvernorat qui ont une valeur, **seulement à partir de cinq**
  (`parametres_kpi.seuil_reference_gouvernorat`, décision de la FNCT), et le nombre de communes —
  jamais lesquelles.

### Corrigé en passant
- Le **coût global à la tonne** lisait ses jours de pesée dans le kilo par habitant : une commune
  sans population déclarée le voyait « non renseigné » faute de… pesées. Les jours couverts viennent
  désormais du tonnage.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 70 migrations ; la 070 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat **310/310**, **47 bilans, 1 905 tests réussis,
  aucun échec** ; la nouvelle campagne `series-indicateurs` : 43 réussis, aucun échec. Recomptage 47 / 47.
- `audit-blocs.py` : 28 blocs sous condition, tous leurs contrôles ont tourné. Lint backend et web (TypeScript 5.8.3) : code 0.
- `series-indicateurs` éprouve les quatre tests de sortie du § 3.4 sur des données qu'elle bâtit, avec
  des valeurs attendues recalculées des seules données insérées : février sans pesée n'a pas de ligne ;
  au coût à la tonne il ne manque que le carburant, puis plus rien après un plein ; pas de repère à
  quatre communes, un repère à cinq (moyenne 4,1 t) qui ne nomme personne ; et pour chaque indicateur,
  « non renseigné » si et seulement si quelque chose manque.

## [0.15.27] — 2026-10-13 — Refonte, lot 2b : le catalogue « + Ajouter », un formulaire par type

Seconde moitié du lot 2 de `docs/specs_metier/SPEC_refonte_indicateurs_saisie.md` (§ 2.2) : une seule
porte pour ajouter une donnée, et le même formulaire partout. Aucune migration, aucune route nouvelle :
le lot est entièrement dans le front.

### Le catalogue « + Ajouter »
- Toujours au même endroit : en tête du portail communal ; sur téléphone, un **bouton flottant**, à
  droite en français et à gauche en arabe.
- Rangé par ce que pense le directeur — mon équipe, mes moyens, mon territoire, mes références, mes
  actions, registres du jour, mes partenaires, import en masse —, et **filtré par rôle** : la FNCT n'y
  voit ni le PCGD ni la caractérisation, qu'elle lit sans les saisir.
- 19 entrées ouvrent un formulaire ; 6 conduisent à l'écran qui donne leur contexte et le disent
  (« S'ouvre sur l'écran Pesées ») : une pesée se rattache à un voyage attendu, une action planifiée
  à une sélection de points, une campagne de nettoyage à un lieu, un secteur à une proposition de
  découpage, un prestataire à un compte, des fichiers géographiques à un circuit.
- Après un enregistrement, l'écran ouvert se relit et l'annonce le dit ; un import reste ouvert sur
  son bilan.

### Le registre des formulaires (`web/src/composants/ajout/`)
- **Nouveaux**, sur des routes qui existaient sans écran : **agent** (ni CIN, ni salaire, ni
  adresse), **engin** (un doublon d'immatriculation est refusé par l'API, message tel quel), **point
  de collecte** (dans un circuit, posé sur une carte cadrée sur la commune).
- **Déplacés** depuis leurs écrans, sans changement de règle : circuit, lieu (avec sa propre petite
  carte), contact, projet (rédaction d'une publication), étude ou rapport, sortie au carnet de bord,
  plein de carburant, fin de poste, incident, dotation EPI, commerce, convention, imports CSV
  (contacts, parc). Chaque écran ouvre désormais **le même** composant : Parc (« Ajouter un engin »),
  Personnel (« Ajouter un agent »), Circuits, Contacts, Communication, Rapports, Registres, Carnet.
- **Un composant par type, vérifié** : `web/scripts/verifier-ajout.mjs`, lancé par `npm run lint`,
  refuse qu'un appel d'API de création (`appels-creation.json`, la liste que lit aussi le registre)
  vive ailleurs que dans un seul fichier du registre. Éprouvé à l'envers : un second appel à
  `api.creerEngin` hors du registre le fait échouer.

### Pas encore
- Le **conteneur** n'est pas au catalogue : l'API ne sait pas l'écrire.
- Le **catalogue du prestataire** (son signalement d'incident sur un circuit) reste dans son espace.
- « Ce que la donnée débloque », lu dans le catalogue des indicateurs : lot 3.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 69 migrations ; la 069 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat **307/307**, **46 bilans, 1 862 tests réussis,
  aucun échec**. Recomptage 46 / 46.
- `audit-blocs.py` : 28 blocs sous condition, tous leurs contrôles ont tourné. Lint backend et web (TypeScript 5.8.3) : code 0, dont « 19 types,
  14 appels de création : chacun dans un seul fichier du registre ».
- Navigateur : agent, engin, circuit, point (posé sur la carte) et fin de poste ajoutés par le
  catalogue ; le même formulaire d'engin depuis le Parc ; doublon d'immatriculation refusé ; fin de
  poste refusée tant que la benne n'est pas dite bâchée ou non ; « Une action planifiée » ouvre les
  Points ; la FNCT ne voit pas le PCGD ; arabe RTL à 375 px, bouton flottant à gauche, sans
  défilement horizontal.

## [0.15.26] — 2026-10-12 — Refonte, lot 2a : porteur d'un projet, PCGD, caractérisation des déchets

Première moitié du lot 2 de `docs/specs_metier/SPEC_refonte_indicateurs_saisie.md` (§ 2.3), décisions
D5 et D6 : les données d'abord. Le catalogue « + Ajouter » et le passage des formulaires existants dans
le registre suivent au lot 2b.

### Ajouté (migration 069)
- **Le porteur d'un projet (D5)** : `publications.projet_porteur` (commune, association, autre) et
  `projet_porteur_nom`, obligatoire sauf pour la commune — la base le refuse sinon. L'ancienne
  « nature » (communal, associatif) est recopiée puis retirée : un seul champ dit qui porte le projet.
- **Le PCGD comme donnée** (`pcgd`) : statut (en préparation, adopté, en révision), année d'adoption,
  horizon, bureau d'études, rapport lié dans « Rapports et études ». Un PCGD adopté sans année, ou un
  horizon antérieur à l'adoption, est refusé en base.
- **La caractérisation des déchets (D6)** : `caracterisations` et `fractions_caracterisation`, sur une
  nomenclature **provisoire** (`fractions_reference` : organiques, papier-carton, plastiques, verre,
  métaux, textiles, fines et autres), à aligner sur celle des études de l'ANGeD. La somme des
  fractions est gardée **en base** à 100 % ± 1 (contrainte différée, vérifiée à la validation) ; une
  fraction négative est refusée. La moyenne nationale de l'ANGeD ne se saisit que par la FNCT, une
  étude de la commune que par la commune — la base le tient.
- **`app.caracterisation_retenue(commune, date)`** : la source la plus précise, puis la plus récente
  (étude ANGeD de la commune, PCGD, autre étude, moyenne nationale), toujours avec son niveau et son
  année. Sans étude ni moyenne nationale saisie, **rien** : la composition est non renseignée, jamais
  supposée (règle d'or 1.1).
- **Le retrait** d'un PCGD ou d'une caractérisation est logique (`app.retirer_reference`) ; la
  commune ne retire pas la moyenne nationale.
- Routes `/references/fractions`, `/references/pcgd`, `/references/caracterisations`,
  `/references/caracterisation-retenue`, `DELETE /references/{table}/{id}`.

### Écrans
- **Mes références** (pôle Pilotage) : la composition retenue en tête — « Composition retenue : PCGD
  2026 », « Moyenne nationale ANGeD 2022 — aucune étude propre à la commune », ou « non renseignée » —,
  le PCGD, les caractérisations. La FNCT y lit, elle n'y ajoute rien.
- **Le registre des formulaires** (`web/src/composants/ajout/`) : PCGD et caractérisation, un
  composant par type d'objet. Le formulaire de caractérisation affiche le total pendant la saisie ;
  une case laissée vide ne part pas comme un zéro.
- *Paramètres nationaux* : la carte de la **moyenne nationale ANGeD**, saisie avec le même formulaire.
- *Communication → Projets* : le porteur et son nom. Français et arabe.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 69 migrations ; la 069 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat **307/307**, **46 bilans, 1 862 tests réussis,
  aucun échec** ; la nouvelle campagne `references` : 35 réussis, aucun échec. Recomptage 46 / 46.
- `audit-blocs.py` : 28 blocs sous condition, tous leurs contrôles ont tourné. Lint backend et web (TypeScript 5.8.3) : code 0.
- Navigateur : PCGD et caractérisation saisis par un directeur, refus affichés avant l'envoi (année
  manquante, horizon, total à 97 %) ; composition retenue « PCGD 2026 » ; projet associatif nommé ;
  la FNCT saisit la moyenne nationale et lit la commune sans bouton d'ajout ; arabe RTL à 375 px sans
  défilement horizontal.

## [0.15.25] — 2026-10-12 — Refonte, lot 1 : barème, note et classement retirés ; la commune déclare

Lot 1 de `docs/specs_metier/SPEC_refonte_indicateurs_saisie.md` (§ 1), décisions D1 et D3 du
9 octobre 2026. SIIPI se concentre sur les **indicateurs** : le barème, les points, la note sur 100,
la reventilation des points, le classement et la fiche d'évaluation à valider disparaissent. Les
19 indicateurs restent, avec leurs calculs et leurs identifiants internes, qui ne s'affichent plus.

### Retiré (migration 068)
- `evaluations_kpi` et `valeurs_kpi`, après recopie de chaque valeur, avec son auteur et sa date ; la
  colonne `points` et la famille « concours » d'`indicateurs_kpi` (devenue « indicateur ») ; les
  paramètres `couverture_classement_min` et `bareme_provisoire`. Avant d'écrire la migration, la base
  principale a été vérifiée : aucune fiche, aucune valeur — rien de réel n'était à recopier.
- Routes `PUT /kpi/bareme`, `GET /kpi/concours-national` (et son export CSV),
  `/kpi/evaluations/{commune}/{annee}` et ses étapes soumettre, valider, rouvrir.
- Les questions « expérience innovante » et « agent dédié aux réclamations » : elles ne servaient qu'à
  la redistribution des points ou à une information sans effet.

### Ajouté
- **`declarations_indicateurs`** : une valeur déclarée par la commune vaut **dès qu'elle est
  enregistrée** (D3) — badge « déclaré », qui l'a saisie et quand. Une correction remplace la
  précédente, que le journal d'audit garde ; un retrait est logique. La base refuse un taux au-delà de
  100 %, un ratio sans cible, la déclaration d'un indicateur calculé, et **la déclaration par la FNCT
  à la place de la commune**.
- **Le commentaire de la FNCT** (`POST /kpi/commentaires-fnct/{id}`) : il se lit à côté de la
  valeur, il ne la bloque pas ; seule la FNCT l'écrit, la base le tient.
- **Le profil de la commune** (abattoir municipal, décharge contrôlée par l'ANGeD) passe dans
  `parametres_commune` ; son seul effet : rendre un indicateur « sans objet ».
- **La couverture**, en clair : « 14 indicateurs calculables sur 19 » ; les sans-objet sortent du
  total.
- `GET` et `PUT /kpi/declarations/{commune}/{annee}`.

### Conservé, par décision de l'utilisateur (12 octobre 2026)
- Les **indices des 5 axes** et l'**indice de préparation DMA** : ils sont le tableau de bord 5 axes
  du cahier des charges (TDR §3.2.10), pas le concours. Ils reposent sur le **taux d'atteinte** de
  chaque indicateur (la valeur sur la cible, ou le pourcentage), qui n'est plus appelé « note » et
  qu'aucun barème ne pondère. Les alertes nationales gardent leurs seuils.

### Écrans
- *Indicateurs* de la commune : la couverture à la place de la note, les indicateurs **par axe** (plus
  par modules, plus de colonne de points ni d'identifiant), l'onglet **Déclarations** à la place de la
  fiche d'évaluation. La FNCT y lit et commente ; elle ne saisit pas.
- *Observatoire → Indicateurs & 5 axes* : plus d'onglet de classement ; la couverture de chaque
  commune ; les réglages gardent les seuils et les districts. Français et arabe.

### Corrigé en passant
- `scripts/skills/kpi-evaluator.mjs` lisait comme « déclarées » les valeurs **calculées** par
  `app.mesures_kpi` ; il lit désormais les déclarations de la commune.
- La campagne `kpi-5-axes` écrivait dans une commune réelle avec un compte de démonstration ; elle a
  sa commune de test et son directeur temporaire (règle de JC-001).

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 68 migrations ; la 068 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat **299/299** (sept routes retirées, trois ajoutées),
  **45 bilans, 1 827 tests réussis, aucun échec**. `kpi-5-axes` : 74 contrôles — refus d'abord (plus
  de classement, de barème ni de fiche ; la FNCT ne déclare pas, même en SQL direct) ; les **mêmes
  valeurs qu'avant le retrait** sur le jeu maîtrisé (62,5 %, 75 % et 0,708, 66,7 %, 30 t et 20 %,
  coût à la tonne) ; une déclaration affichée tout de suite, avec son auteur ; « sans objet » pour
  l'abattoir et la décharge ANGeD ; 17 indicateurs applicables sur 19 ; correction et retrait
  logique ; commentaire de la FNCT ; aucun « concours » dans le code de l'API, ses campagnes et son
  contrat. `kpi-sources` : 40. Recomptage : 45 campagnes présentes, 45 enchaînées.
- `audit-blocs.py` : 28 blocs sous condition, tous leurs contrôles ont tourné. `npm run lint`
  backend et web (TypeScript 5.8.3) : code 0.
- Navigateur (pile d'essai) : la commune déclare un taux, il s'affiche aussitôt « déclaré », avec son
  auteur, et la couverture passe de 2 à 3 sur 19 ; la FNCT ne peut que lire et commenter, et son
  commentaire s'affiche à côté de la valeur ; l'observatoire n'a plus d'onglet de classement et donne
  la couverture de chaque commune ; en arabe, de droite à gauche, sans défilement horizontal à 375 px.

## [0.15.24] — 2026-10-09 — D-FNCT-5 : production, formation, mot de passe provisoire

Décision de la FNCT du 9 octobre 2026. Contrainte : « aucun compte de démonstration ne doit être
accessible sur une instance de production, même par erreur de configuration. » Une variable
d'environnement est une configuration — elle s'oublie, se recopie d'un serveur à l'autre. **C'est
donc la base qui retient ce qu'elle est.**

### Ajouté
- **Migration 067** — `instance_siipi` : la nature de l'instance (`developpement`, `formation`,
  `production`). Une base neuve est en développement ; la première fois qu'elle est servie en
  production ou en formation, elle le devient **définitivement** (la base refuse d'en changer).
  `users.compte_demonstration` désigne les comptes du jeu de démonstration. En production : ils sont
  désactivés, `app.find_user_for_login` ne les trouve plus, et la base refuse de les réactiver.
- **`src/instance.ts`** — la nature demandée se lit dans l'environnement : `FORMATION=true` ; sinon
  `PRODUCTION=true` ou `NODE_ENV=production` (réponse de l'utilisateur) ; `FORMATION` l'emporte sur
  `NODE_ENV`, pour qu'une instance de formation tourne sur l'image de production (réponse de
  l'utilisateur). Au démarrage, l'API la concilie avec la base, et **refuse de démarrer** sur
  `FORMATION=true` et `PRODUCTION=true` ensemble, `FORMATION=true` sur une base de production, ou
  une base de formation servie en production. Une base de production servie avec une configuration
  de développement **reste** une instance de production.
- **Connexion** : en production, le mot de passe publié n'ouvre aucun compte (v0.15.15) et les
  comptes de démonstration sont refusés, quel que soit leur mot de passe, avec un message qui dit
  comment créer le premier compte réel.
- **Mot de passe provisoire, verrouillé par le serveur** : le jeton le porte, et toute route autre
  que `GET /auth/me`, `PUT /comptes/moi/preferences` et `POST /comptes/moi/mot-de-passe` répond 403
  « Vous devez changer votre mot de passe avant de continuer. » (code `MOT_DE_PASSE_A_CHANGER`).
  L'écran le disait déjà ; un client appelant l'API directement passait outre. Le changement rend un
  nouveau jeton.
- **`GET /instance`** (sans authentification) et le **bandeau rouge permanent** « BASE DE
  FORMATION — Données fictives. » sur chaque écran d'une instance de formation, connexion comprise,
  sans bouton pour le fermer. Français et arabe.
- **`npm run compte:fnct:creer[:prod] -- <adresse> "<nom>"`** : le premier compte réel de la FNCT,
  mot de passe provisoire affiché une fois. `mot-de-passe:provisoire` refuse un compte de
  démonstration sur une instance de production.
- **Déploiement** : `docker-compose.prod.yml` porte `PRODUCTION` (vrai par défaut) et `FORMATION`,
  et des noms de conteneurs paramétrables (`SIIPI_INSTANCE`) ; une instance de formation a ses
  propres conteneurs et sa propre base. **`README.md`** : « Production et formation ».
- **Campagnes** : `comptes` étendue (section 3 : le verrou du mot de passe provisoire ; section 7 :
  production et formation, sur des bases d'essai à part) ; `tests/outils/instance_essai.sh`.

### Corrigé
- La campagne `mot-de-passe-public` démarrait une API de production **sur la base des campagnes** :
  depuis la migration 067, elle l'aurait rendue définitivement « production », et toutes les
  campagnes suivantes auraient vu leurs comptes de démonstration refusés. Elle travaille désormais
  sur une base d'essai à part, et vérifie que le démarrage en production désactive les comptes de
  démonstration.

### Mise à jour d'une installation existante
`npm run migrate`. Une base de développement le reste. **Ne jamais servir une base de
développement ou de démonstration avec `PRODUCTION=true`** : elle deviendrait définitivement une
base de production, comptes de démonstration désactivés.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 67 migrations ; la 067 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat **303/303**, **45 bilans, 1 818 tests réussis, aucun
  échec** (`comptes` : 55 contrôles — `PRODUCTION=false`, connexion de démonstration permise ;
  `PRODUCTION=true`, comptes de démonstration refusés et désactivés, compte réel ouvert, réactivation
  et retour en développement refusés par la base ; base de production servie sans `PRODUCTION` :
  toujours production ; `FORMATION=true` sur la production, et `FORMATION` avec `PRODUCTION` :
  démarrage refusé ; base de formation : comptes de démonstration permis, bandeau demandé, refusée
  en production ; mot de passe provisoire : toute autre route refusée avec le message de la
  décision, mot pour mot, jusqu'au remplacement. `mot-de-passe-public` : 25 contrôles, sur une base
  d'essai à part). Recomptage : 45 campagnes présentes, 45 enchaînées.
- Après `npm test` : la base des campagnes est toujours une base de développement, ses 11 comptes de
  démonstration actifs ; aucune base d'essai ne reste.
- `audit-blocs.py` : 28 blocs sous condition, tous leurs contrôles ont tourné. `npm run lint`
  backend et web (TypeScript 5.8.3) : code 0.
- Navigateur : instance de formation d'essai (base dédiée, `FORMATION=true`, `NODE_ENV=production`) —
  bandeau rouge dès l'écran de connexion, puis sur l'observatoire, toujours en haut après défilement,
  en arabe de droite à gauche, sans défilement horizontal à 375 px. Pile d'essai — un compte
  provisoire n'ouvre que l'écran de changement, avec le message de la décision ; après le changement,
  la plateforme s'ouvre sans recharger la page.

## [0.15.23] — 2026-10-09 — D-FNCT-4 : conservation des photos — compressées à 36 mois, originaux en archive froide

Décision de la FNCT du 9 octobre 2026. **Rien ne se purge.** Les textes, dates, statuts et
localisations des réclamations sont conservés sans limite, comme toutes les métadonnées. Seule la
forme des photos lourdes change : à 36 mois, la version compressée reste en ligne, indéfiniment, et
l'original part dans l'archive froide — où il est conservé, lui aussi, sans limite (réponse de
l'utilisateur du 9 octobre : la fenêtre de récupération « 37 à 48 mois » n'a plus de fin).

### Ajouté
- **Migration 066** :
  - Paramètres (`app_parametres`, comme la conservation du journal en 014) : âge de compression
    36 mois, qualité JPEG 70, 500 Ko au plus, restauration sous 48 heures.
  - Une fiche de fichier **n'est jamais réécrite** : la compression *ajoute* des colonnes (date,
    chemin et empreinte de la version compressée, chemin de l'original dans l'archive, date de
    restauration). Nom, type, taille, empreinte, déposant, date et visibilité restent ceux du dépôt.
    La base refuse une compression à moitié renseignée, et la compression d'un PDF.
  - L'application ne peut plus modifier que la visibilité d'une fiche : « marquer compressée » une
    photo entière lui est refusé par la base.
  - Les fichiers entrent au **journal d'audit** (ils n'y étaient pas) ; la compression et la
    restauration y figurent au nom de la tâche, la demande au nom de la FNCT.
  - `passages_conservation_medias` (chaque passage : photos à l'âge, compressées, octets avant et
    après, anomalies) et `demandes_restauration` (motif obligatoire, échéance), lisibles par la FNCT
    seule ; une demande ne naît que par `app.demander_restauration()`, réservée à la FNCT.
- **La tâche** (`src/services/conservationMedias.ts`), dans cet ordre pour chaque photo : relire
  l'original et vérifier son empreinte ; le copier dans l'archive, relire la copie, la vérifier ;
  écrire la version compressée (JPEG qualité 70, réduite par paliers jusqu'à 500 Ko) ; marquer la
  fiche ; et seulement alors retirer l'original du volume courant. Un original qui ne correspond
  plus à sa fiche n'est ni archivé ni restauré : l'écart est consigné (règle d'or 1.5).
  - **Mensuelle** dans l'API, avec `SIIPI_CONSERVATION_MEDIAS=active` (activée dans
    `docker-compose.prod.yml`) : vérification horaire ; les restaurations en attente sont servies, et
    le passage national a lieu une fois par mois (heure de Tunis).
  - **À la main** : `npm run medias:compresser`, `medias:restaurer`, `medias:archive:initialiser`
    (variantes `:prod`) ; `-- --commune <id>` restreint un passage à une commune.
  - **L'archive doit être montée, et le dire** : sans le fichier témoin posé par
    `medias:archive:initialiser`, la tâche refuse le passage et ne touche à rien. Un dossier absent se
    créerait tout seul dans le conteneur — et les originaux disparaîtraient à sa reconstruction.
- **Routes** (FNCT) : `GET /fichiers/conservation`, `POST /fichiers/{id}/restauration`,
  `GET /fichiers/{id}/original`. `GET /fichiers/{id}` sert la version compressée, à la même
  adresse : le citoyen consulte toujours sa photo.
- **Écran** *Observatoire → Outils de la FNCT → Conservation des photos* : la règle, les passages
  (et leurs refus), les demandes avec leur échéance et leur retard, le formulaire de demande. Français
  et arabe.
- **Volume** `siipi_archive_froide` dans les deux fichiers Compose ; dépendance `sharp` (0.34.5).
- **Campagne `purge-media`** : elle commence par ce qui est refusé, bâtit ses données (commune,
  directeur, citoyen, images fabriquées par la bibliothèque de l'API) et ne lance la tâche que sur
  sa commune.

### Corrigé
- **JC-008** : l'image de production ne préparait pas le dossier de ses volumes ; un volume neuf
  naissait à root et l'utilisateur `node` n'y écrivait pas — aucun dépôt n'aurait abouti en
  production. L'image prépare désormais `/var/siipi/fichiers` et `/var/siipi/archive`.

### Mise à jour d'une installation existante
`npm run migrate`. En production, monter le volume de l'archive froide, lancer une fois
`npm run medias:archive:initialiser:prod`, et sauvegarder ce volume **à part** : c'est la seule
copie des originaux. En développement, la tâche mensuelle reste inactive.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 66 migrations ; la 066 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat **302/302**, **45 bilans, 1 783 tests réussis, aucun
  échec** (`purge-media` : 59 contrôles — refus d'abord ; sans archive, passage refusé et rien de
  touché ; la photo de 37 mois compressée et servie en JPEG de 500 Ko au plus, celle de 30 mois
  intacte, une image de rapport et un PDF intacts ; fiche et texte de la réclamation identiques
  avant et après ; original identique dans l'archive et retiré du volume courant ; audit de la
  compression, de la demande et de la restauration ; un original altéré jamais restauré).
  Recomptage : 45 campagnes présentes, 45 enchaînées.
- `audit-blocs.py` : 28 blocs sous condition, tous leurs contrôles ont tourné. `npm run lint`
  backend et web (TypeScript 5.8.3) : code 0.
- Planificateur réel (seconde API, `SIIPI_CONSERVATION_MEDIAS=active`) : sans archive, passage
  refusé ; moins d'un jour après ce refus, aucune nouvelle tentative ; archive initialisée, passage
  terminé ; le passage du mois fait, aucun autre.
- Image de production reconstruite : `sharp` 0.34.5 chargé, tâche compilée présente, volumes neufs
  `fichiers` et `archive` accessibles en écriture à `node` (JC-008).
- Navigateur (pile d'essai, compte FNCT) : une photo de 37 mois compressée de 1 344 Ko à 451 Ko ;
  le passage refusé faute d'archive affiché avec son motif ; la demande faite depuis le formulaire,
  échéance à 48 heures, puis restaurée ; en arabe, de droite à gauche, noms des communes en arabe,
  sans défilement horizontal à 375 px.

## [0.15.22] — 2026-10-09 — D-FNCT-3 : Zarzouna rattachée à Bizerte, El Hchachna commune à part entière

Décision de la FNCT du 9 octobre 2026. La couche officielle des contours (350 communes) et le
référentiel des communes ne listaient pas les mêmes : le référentiel avait Zarzouna, la couche avait
El Hchachna. Zarzouna restait sans territoire, El Hchachna n'existait pas. **La couche était juste ;
c'est la table des communes qui est corrigée.** Source : Instance Prospective, arrêté conjoint en
attente.

### Ajouté
- **Migration 065** :
  - `communes` reçoit le retrait logique (`deleted_at`, `deleted_by`) et la trace de la fusion
    (`fusionnee_dans`, `motif_retrait`). La base refuse un retrait sans motif, une fusion sans
    retrait, une commune fusionnée dans elle-même.
  - La politique de lecture de `communes` cache une commune retirée : elle disparaît d'un coup de
    **toutes** les routes (annuaire, observatoire, application citoyenne, localisation), sans
    qu'aucune ait à y penser. Les trois fonctions `SECURITY DEFINER` qui listent les communes
    (`statut_communes`, `frontieres_communes`, `enregistrer_adresse`) la filtrent explicitement.
  - **`app.rattacher_commune(source, cible, motif)`** : déplace les points de collecte, les circuits
    et les pesées vers la commune cible, puis retire la source. Elle **refuse** de rattacher une
    commune qui porte d'autres données (comptes, engins, personnel…) et les nomme : leur sort est
    une décision, pas un effet de bord. Réservée au propriétaire de la base.
  - **El Hchachna** (Bizerte, code 1727) entre au référentiel ; son contour vient de la couche
    officielle, par `import:decoupage`.
  - **Zarzouna** est rattachée à la commune de Bizerte, **jamais effacée** : la ligne reste, retirée,
    avec sa population, son motif et la commune qui l'a reçue.
  - Registre `corrections_referentiel` : chaque correction, sa décision, sa source, sa date.
- **`GET /observatoire/corrections-referentiel`**, et sa carte dans *Observatoire → Paramètres
  nationaux* : « Zarzouna (Bizerte) : rattachée à la commune de Bizerte. El Hchachna : commune à
  part entière. Source : Instance Prospective, arrêté conjoint en attente. » — en français et en
  arabe.
- Le jeu de référence (`communes_350.json`, `appariement_communes.json`) porte la même correction :
  une installation neuve et une base migrée arrivent au même état.

### Corrigé
- **JC-007** : la campagne `decoupage` effaçait le contour officiel de Djerba Midoun à chaque
  passage. Elle rejoue désormais l'import officiel en partant, et vérifie que Midoun a retrouvé son
  contour et sa superficie.
- Trois témoins de campagne comptaient la table `communes` entière (`observatoire` : population
  totale et nombre de communes estimées ; `simulation-3mois` : communes réelles) : ils comptent
  désormais ce que l'API laisse voir, une commune retirée restant en base.
- La spécification du jalon 14 disait « contours disponibles pour 348 communes sur 350 » : mesure
  faite sur une base d'essai abîmée par JC-007. Rectifiée.

### À confirmer
- Le nom arabe de Zarzouna dans le jeu de référence est « جرونة » ; l'orthographe usuelle est
  « جرزونة ». Non modifié, en attente de la FNCT.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 65 migrations ; la 065 rejouée : « Base déjà à jour ».
  Après `npm test` : 350 communes au référentiel, 350 avec un contour (Midoun compris), 1 retirée.
- `npm test` : code de sortie 0 — contrat **299/299**, **44 bilans, 1 724 tests réussis, aucun
  échec** (`decoupage` : 49 contrôles — 350 communes et non 351, Zarzouna introuvable et refusée
  comme adresse, El Hchachna localisée, le rattachement éprouvé sur des communes de test : refus,
  blocage par un engin, déplacements, double rattachement, aucun droit pour l'application).
  Recomptage : 44 campagnes présentes, 44 enchaînées.
- `audit-blocs.py` : 28 blocs sous condition, tous leurs contrôles ont tourné. `npm run lint`
  backend et web (TypeScript 5.8.3) : code 0.

### Mise à jour d'une installation existante
Après `npm run migrate`, lancer **`npm run import:decoupage`** : la migration crée El Hchachna, son
contour vient de la couche officielle.

## [0.15.21] — 2026-10-09 — D-FNCT-1 : le citoyen trouve sa commune par sa position, ou par gouvernorat

Décision de la FNCT du 9 octobre 2026 (homonymes : deux Ennour, à Sfax et à Kasserine ; deux
Ezzouhour, à Kasserine et à Sousse). La liste de 350 noms seuls faisait choisir la mauvaise commune
sans que le citoyen le sache.

### Ajouté
- **`POST /communes/localiser`** : la commune dont le contour contient une position (`ST_Contains`).
  « Trouvée » seulement si un seul contour la contient ; hors de tout contour ou dans deux : non
  trouvée, raison donnée (`hors_commune`, `ambigue`). La position voyage **dans le corps**, jamais
  dans l'URL — qui irait au journal d'accès — et **n'est écrite nulle part** (loi organique
  n° 2004-63) : elle ne sert qu'à proposer.
- **Application citoyenne, choix de la commune** (`ChoixCommune`) :
  1. à l'ouverture du formulaire d'adresse, quand le citoyen n'a pas encore de commune, la position
     est demandée ; la commune trouvée est proposée — « Vous êtes localisé à Ennour (Kasserine).
     Est-ce correct ? » — avec « Oui, c'est correct » / « Non, choisir manuellement » ;
  2. refus, géolocalisation indisponible, ou « non » : le **gouvernorat** (24), puis la **commune**,
     affichée « Nom (Gouvernorat) » ;
  3. position hors de toute commune : « Nous n'avons pas pu déterminer votre commune.
     Choisissez-la manuellement. », puis le choix en deux étapes.
  La position de l'*adresse* reste un geste à part (« Utiliser ma position actuelle ») : le citoyen
  peut ne pas être chez lui quand il ouvre l'application. Français et arabe : noms arabes des
  communes, et les 24 gouvernorats traduits dans les deux fichiers de langue.

### Corrigé
- Le type `Commune` du front déclarait `governorate`, quand l'API renvoie `gouvernorat` : le champ
  restait toujours vide sans que le compilateur le voie.

### Constaté (journal des corrections, ouverts)
- **JC-005** : la campagne `citoyen` efface l'adresse de **tous** les citoyens de la base, au début
  et à la fin. Sans conséquence sur une base de démonstration ; destructeur sur une base réelle.
- **JC-006** : un corps JSON mal formé reçoit 500 au lieu de 400, sur toutes les routes.
- **Zarzouna** n'a pas de contour dans le jeu de référence : un citoyen qui s'y trouve passe au choix
  manuel. *(Rectifié avant fusion : la première rédaction citait aussi Djerba Midoun. Son contour
  existe ; c'est la campagne `decoupage` qui l'efface à chaque passage — défaut traité avec D-FNCT-3.)*

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 64 migrations ; la 064 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat **298/298**, **44 bilans, 1 701 tests réussis, aucun
  échec** (`citoyen` : 13 contrôles de plus). Recomptage : 44 campagnes présentes, 44 enchaînées.
- `audit-blocs.py` : tous les contrôles sous condition ont tourné. `npm run lint` backend et web
  (TypeScript 5.8.3) : code 0.
- Navigateur (pile d'essai, compte citoyen d'essai), position simulée : dans l'Ennour de Kasserine,
  la proposition s'affiche ; « non » ouvre le choix, gouvernorat présélectionné, 24 gouvernorats,
  « Ennour (Kasserine) » ; géolocalisation réelle refusée : choix manuel direct ; position en mer :
  le message, en arabe et de droite à gauche, puis « النور (القصرين) » ; à 375 px, aucun défilement
  horizontal.

## [0.15.20] — 2026-10-09 — Jalon 14 spécifié : prêt d'engins et points limitrophes (documentaire)

Aucun code. Le jalon 14 s'ouvre après que les jalons 11 à 13 ont tourné en production ; la feuille
de route le disait « spécifiable dès maintenant » : il l'est.

### Ajouté
- **`docs/specs_metier/SPEC_v0.19_mutualisation.md`** — proposition à valider par la FNCT :
  - **Ce qui existe, et pourquoi ça ne suffit pas.** Le rattachement multi-communes ouvre *toute* la
    commune voisine : trop large pour un prêt. Les verrous qui lient un engin à sa commune
    (`app.controler_commune_engin()` sur huit tables, pesées, bons de carburant, carnet) restent ;
    un prêt ouvre une exception datée et consentie, il n'en relâche aucun en silence.
  - **Le partage existe déjà sur le terrain** : sur les relevés réels de Djerba, 51 points de
    collecte sont situés hors du territoire de leur commune — dont 39 d'Ajim dans Midoun, jusqu'à
    243 m de la limite — et 127 à moins de 150 m d'une limite. Aucun accord ne l'écrit.
  - **Principes** : consentement à double sens, partage d'un objet et jamais d'une commune, seules
    les deux voient, le propriétaire reste propriétaire, une tonne ne compte qu'une fois.
  - **Lot 19.1, registre des prêts d'engins** : cycle proposé → accepté → clos, ce que la base
    refuse, ce que le prêt ouvre et à qui, kilométrage déduit des compteurs, assiette de carburant
    (pas de facturation), indicateurs des deux côtés, écarts dans « À vérifier ».
  - **Lot 19.2, points limitrophes** : constat des points hors territoire (avec une tolérance pour
    l'imprécision des contours), accord de desserte, bande partagée le long de la limite.
  - Deux campagnes de tests proposées, et **sept questions à trancher** (D-1 à D-7), dont la forme
    juridique d'un prêt : le référentiel cite la section 9 du Code des collectivités locales pour
    l'achat groupé, pas pour le prêt.
- Renvois depuis la feuille de route (§ 0 et jalon 14), `SPEC_v0.16.md` (v0.19) et
  `docs/specs_metier/README.md` (arbitrage n° 3 : spécifié, reste ouvert).

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 64 migrations ; la 064 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat 297/297, **44 bilans, 1 688 tests réussis,
  aucun échec**. Recomptage : 44 campagnes présentes, 44 enchaînées.
- `audit-blocs.py` sur ce journal : 28 blocs, tous leurs contrôles ont tourné.
- `npm run lint` backend et web (TypeScript 5.8.3) : code 0.
- Les chiffres de Djerba sont lus sur la base du poste, en transaction en lecture seule.

## [0.15.19] — 2026-10-09 — JC-004 : audit des contrôles sous condition, quatre blocs corrigés

### Corrigé
- **Audit de tous les contrôles de campagne placés sous condition** (suite de JC-003) : 33 blocs
  — 28 `if … fi`, 5 formes courtes `[ … ] && chk`. Sur le jeu de référence, **4 sautaient des
  contrôles sans le dire** (JC-004) :
  - `module5` — l'**envoi réussi** d'une notification et la garantie « **l'historique retient le
    nombre, pas les noms** » ne tournaient jamais : aucun citoyen joignable dans la commune. Les
    deux chemins tournent désormais à chaque passage : un citoyen d'essai rend l'envoi possible,
    un carré de dix mètres sans adresse le rend impossible ;
  - `module5` — le refus de **cibler le secteur d'une autre commune** ;
  - `module6` — le refus d'une **pesée sur l'engin d'une autre commune** ;
  - `suggestions` — le refus de **rattacher une proposition au circuit d'une autre commune**.
  Chaque contrôle bâtit l'objet qu'il éprouve — secteur, publication, engin, pesée, circuit —
  dans une commune de test retirée en partant. Plus aucune condition autour de ces contrôles.
- Quatre des contrôles rendus passent : la plateforme se comportait bien. **Le cinquième attendait
  une réponse fausse** : le circuit d'une commune hors du périmètre est *introuvable* (404,
  `CLAUDE.md` § 5), pas « refusé » (400) — le test, jamais exécuté, contredisait la règle. Le 400
  existe bien, pour un directeur rattaché aux deux communes, et il est éprouvé aussi.

### Ajouté
- **`scripts/skills/audit-blocs.py`** : sur le journal d'un `npm test` de référence, il nomme tout
  contrôle sous condition qui n'a pas tourné et sort en erreur. Éprouvé sur les campagnes d'avant
  la correction : il retrouve les cinq contrôles manquants (code 1) ; sur celles d'après, aucun
  (code 0).
- `CLAUDE.md` § 7 : **aucun contrôle sous condition d'une donnée qu'on espère trouver** — l'objet à
  éprouver se bâtit, sinon le contrôle échoue.

### Reste ouvert
- Les 28 blocs restants tournent sur le jeu de référence mais **restent fragiles** : si la donnée
  qu'ils cherchent disparaissait, ils se sauteraient en silence. `audit-blocs.py` le dirait.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 64 migrations ; la 064 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat 297/297, **44 bilans, 1 688 tests réussis,
  aucun échec** (`module5` 31 → 39, `module6` 40 → 42, `suggestions` 27 → 31).
- Recomptage : 44 campagnes présentes, 44 enchaînées.
- `npm run lint` backend et web (TypeScript 5.8.3) : code 0.
- `audit-blocs.py` sur ce journal : « 28 blocs sous condition contenant des contrôles ; tous leurs
  contrôles ont tourné », code 0. Après la chaîne : aucune commune, aucun compte, aucun engin de
  test restant.

## [0.15.18] — 2026-10-09 — JC-003 : la campagne `fichiers` ne saute plus sa partie citoyen

### Corrigé
- **La partie 4 de `fichiers` ne s'exécutait jamais** (JC-003). Ses treize contrôles — photo
  déposée par un citoyen, preuve de traitement adressée, et **B5.1.3 de bout en bout** (la
  clôture d'une réclamation ouvre la photo à son auteur, et à lui seul) — étaient enveloppés dans
  des `if` : faute de citoyen ayant la commune du directeur dans le jeu de référence, ils se
  sautaient sans le dire, et la campagne se comptait réussie. **Aucune campagne n'éprouvait donc
  réellement B5.1.3**, pourtant marqué « Fait » ; `citoyen` ne touche pas à la preuve.
- Masqué par ce saut : la réclamation d'essai portait la catégorie `depot_sauvage`, renommée par la
  migration 024 ; l'insertion n'aurait jamais réussi. Catégorie `point_noir` désormais.
- `fichiers` bâtit sa **commune de test**, son **directeur temporaire** (`tests/outils/`) et son
  **citoyen** (inscription par l'API, adresse déclarée dans la commune), et les retire en partant.
  Plus aucun contrôle conditionnel : sans administrateur d'une autre commune, le contrôle
  **échoue** au lieu de se sauter. La campagne ne dépend plus ni de Dar Chaâbane ni d'un compte de
  démonstration pour écrire. **De 26 à 40 contrôles.**
- Le comportement de la plateforme était juste : une fois rendus à la campagne, les contrôles
  passent. Seul le test manquait.

### Reste ouvert
- **30 autres blocs conditionnels dans 16 campagnes**, non audités : certains peuvent sauter des
  contrôles de la même façon, d'autres sont légitimes. À vérifier un par un sur le jeu de référence.
- Le journal note qu'une numérotation de défauts plus ancienne a existé hors du dépôt
  (`suggestions.sh` cite « le défaut n° 6 du journal ») ; les identifiants `JC-` ne la prolongent pas.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 64 migrations ; la 064 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat 297/297, **44 bilans, 1 674 tests réussis,
  aucun échec** (1 660 + les 14 contrôles rendus à `fichiers`).
- Recomptage : 44 campagnes présentes, 44 enchaînées.
- `npm run lint` backend et web (TypeScript 5.8.3) : code 0.
- Premier passage de la partie 4 rendue : 5 échecs (la catégorie périmée), puis 40/40 une fois
  corrigée — les contrôles peuvent donc échouer, ils ne font pas que passer. Après la chaîne
  complète : aucune commune ni aucun compte de test restant.

## [0.15.17] — 2026-10-09 — JC-001 : les campagnes n'empruntent plus de compte de démonstration

### Corrigé
- **Un compte de démonstration écrivait dans le registre réel de Dar Chaâbane** (JC-001,
  `docs/recette/JOURNAL_DES_CORRECTIONS.md`). La campagne `module2` rattachait le premier directeur
  venu — `directeur.marsa`, au mot de passe public — à Dar Chaâbane et ne le retirait pas ;
  `module3` à `module6` en dépendaient pour écrire dans la commune. Chacune crée désormais **son
  propre directeur** de Dar Chaâbane, avec un mot de passe de test à usage unique, et l'efface en
  partant (`tests/outils/directeur_temporaire.sh`, rangé hors du recomptage des campagnes). Aucune
  campagne ne rattache plus de compte à une commune ; clore le rattachement déjà posé ne casse plus
  rien. Le prestataire de démonstration n'est plus retiré que si la campagne l'a rattachée
  elle-même.
- **JC-001 rectifiée** : sa première rédaction citait aussi la campagne `fichiers`, à tort — elle
  travaille dans la commune de son directeur (La Marsa) et ne dépendait pas du rattachement.

### Reste ouvert, et assumé
- `module2` à `module6` éprouvent les **données réelles** de Dar Chaâbane (inventaire, effectif,
  circuits) et y écrivent puis effacent leurs lignes de test : c'est leur objet. La règle demeure —
  **aucune campagne sur la base d'une recette** (`CLAUDE.md` § 9).
- **Le rattachement déjà posé n'est pas retiré par ce lot**, ni sur la pile d'essai ni dans le
  dossier principal : le clore est une décision (date de fin, `docs/recette/R1_DAR_CHAABANE.md`
  § 2.2).

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 64 migrations ; la 064 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat 297/297, **44 bilans, 1 660 tests réussis,
  aucun échec** (dont `module2` : 73, avec le nouveau contrôle de sortie).
- Recomptage : 44 campagnes présentes, 44 enchaînées — l'outil sourcé n'est pas compté.
- `npm run lint` backend et web (TypeScript 5.8.3) : code 0.
- Après la chaîne complète sur base neuve : **aucun rattachement à Dar Chaâbane**, aucun directeur
  temporaire restant ; `recette:etat` y rend « PAS PRÊTE — 2 préalable(s) » (compte propre,
  équipes), le compte de démonstration étant à OK.
- Rattachement de démonstration **clos** sur la pile d'essai : `module2` à `module6` passent
  (72, 46, 79, 31, 40) ; l'ancienne `module3`, sur la même base, ne voit plus aucun engin
  (« attendu 29, obtenu 0 ») — c'était bien la dépendance.
- Contre-épreuve : directeur temporaire laissé en place, le contrôle de sortie de `module2` échoue
  (« attendu 0|0, obtenu 0|1 »).

## [0.15.16] — 2026-10-09 — Recette R1 préparée : dossier, fiche bilingue, journal des corrections, état de la commune

La recette terrain de Dar Chaâbane (R1) n'a pas commencé : la commune n'est pas disponible.
Ce lot la rend prête à démarrer le jour où elle le sera.

### Ajouté
- **`docs/recette/R1_DAR_CHAABANE.md`** : préalables et comment les lever, ce qui se recueille en
  route, déroulé sur quatre semaines, **quatre parcours de bout en bout adaptés au jalon 11**
  (une tournée, un plein, un engin à réformer, une journée de pointage jusqu'au coût à la tonne —
  adaptation du § 6 de la feuille de route, **à valider par la FNCT**), critère de sortie, ce que
  R1 ne vérifie pas, données personnelles.
- **`docs/recette/FICHE_QUOTIDIENNE_R1.md`** : la fiche du chef de dépôt, en français et en arabe,
  avec les noms d'écrans tels que le menu les affiche dans chaque langue.
- **`docs/recette/JOURNAL_DES_CORRECTIONS.md`** : le journal que `CLAUDE.md` et la feuille de route
  citaient **et qui n'existait pas dans le dépôt**. Format, portée obligatoire, aucune donnée
  personnelle ; deux premières entrées (JC-001, JC-002).
- **Commande `npm run recette:etat -- <commune>`** (`:prod` dans l'image de production) : dit en
  une page si la commune peut commencer — compte propre, compte de démonstration rattaché,
  registres chargés, incohérences bloquantes — puis ce qui se recueille en route et les registres
  que la recette remplira. Elle lit dans une transaction en lecture seule : elle ne modifie rien.
  Codes : 0 prête, 3 pas prête, 1 commune introuvable, 2 usage.
- **Campagne `recette-etat`** : une commune de test passe de « pas prête » à « prête » préalable par
  préalable ; la base est la même avant et après chaque appel. Contre-épreuve faite : un compte de
  démonstration compté comme compte propre, trois de ses contrôles échouent.

### Constaté (journal des corrections)
- **JC-001 — ouverte.** La campagne `module2` rattache un compte de démonstration à Dar Chaâbane et
  ne le retire pas ; `module3` à `module6` et `fichiers` en dépendent et écrivent dans la commune
  réelle. Sur toute base où `npm test` a tourné — dont celle du dossier principal — ce compte, au
  mot de passe public, peut écrire dans le registre de Dar Chaâbane. En attendant une correction
  durable (que ces campagnes bâtissent leur propre commune de test) : aucune campagne sur la base
  d'une recette, et le rattachement se clôt avant R1 (`docs/recette/R1_DAR_CHAABANE.md` § 2.2).
- **JC-002.** La feuille de route annonçait 14 lignes bloquantes chez Dar Chaâbane ; le panneau en
  compte 13 sur la base de référence. Corrigé dans la feuille de route, qui renvoie désormais à
  `recette:etat` plutôt qu'à un chiffre figé.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 64 migrations ; la 064 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat 297/297, **44 bilans, 1 659 tests réussis,
  aucun échec** (dont `recette-etat` : 23).
- Recomptage : 44 campagnes présentes, 44 enchaînées.
- `npm run lint` backend et web (TypeScript 5.8.3) : code 0.
- `recette:etat` sur Dar Chaâbane (base d'essai, 9 octobre 2026) : « PAS PRÊTE — 3 préalable(s) » ;
  forme compilée (`node …/etatRecette.js`) : même verdict, et code 2 sans commune.

## [0.15.15] — 2026-10-08 — En production, le mot de passe de démonstration n'ouvre aucun compte

### Sécurité
- **Le risque.** Le mot de passe des comptes de démonstration est écrit dans le dépôt
  (seed, `DEMARRAGE.md`, `DEMARRER.bat`), et l'image de production exécute le même seed :
  une instance installée et jamais reprise avait onze comptes, dont celui de la FNCT, ouverts
  à quiconque a lu le code (`FEUILLE_DE_ROUTE.md` § 8).
- **En production (`NODE_ENV=production`), ce mot de passe n'ouvre aucun compte** : la
  connexion répond 403, avec ce qu'il faut faire. Le refus précède la recherche du compte —
  même réponse pour un compte connu ou inconnu — et vaut pour tout compte qui aurait gardé ce
  mot de passe, pas seulement ceux du seed. En développement, rien ne change.
- **Partout, il ne se choisit pas comme nouveau mot de passe** (400).
- **Une commande serveur rouvre un compte** : `npm run mot-de-passe:provisoire:prod --
  <adresse>` (ou `mot-de-passe:provisoire` en développement) attribue un mot de passe
  provisoire, affiché une fois, à remplacer à la première connexion — y compris pour la FNCT,
  qui ne peut plus se connecter avec le mot de passe public. La base n'en garde que l'empreinte.
- **Au démarrage en production**, l'API nomme dans son journal les comptes de démonstration
  qui gardent ce mot de passe.
- Le mot de passe et la liste des comptes de démonstration sont définis une seule fois
  (`src/motDePassePublic.ts`) ; le seed refuse de créer un compte de démonstration absent de
  cette liste.
- **Campagne `mot-de-passe-public`** : elle démarre une seconde API en production sur le port
  4001 du conteneur, le temps de la campagne ; le nombre attendu de comptes exposés est
  calculé par la base (`crypt()` de pgcrypto), pas par l'API. Contre-épreuve faite : garde
  désactivée, ses trois contrôles de connexion en production échouent.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 64 migrations ; la 064 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat 297/297, **43 bilans, 1 636 tests réussis,
  aucun échec** (dont `mot-de-passe-public` : 23).
- Recomptage : 43 campagnes présentes, 43 enchaînées.
- `npm run lint` backend et web (TypeScript 5.8.3) : code 0.
- Commande compilée (`tsc` vers un dossier d'essai, `node …/motDePasseProvisoire.js`) : sans
  adresse, code 2 ; adresse inconnue, code 1 et aucun compte modifié.

## [0.15.14] — 2026-10-08 — Secteur informel : aucun écran tant que le cadre n'est pas en vigueur

### Corrigé
- **L'écran « Acteurs informels » apparaissait cadre fermé.** La v0.15.13 le montrait
  toujours dans le portail communal, en lecture seule avec un bandeau « pas en vigueur ».
  Le test de validation du jalon 13 (`FEUILLE_DE_ROUTE.md`) demande au contraire qu'avec
  le paramètre national inactif, **aucun écran du secteur informel n'apparaisse** : un
  écran visible ferait passer un projet de décret pour une obligation faite à la commune.
  Le portail lit l'état du cadre et n'offre l'entrée qu'une fois le cadre en vigueur ; tant
  que l'état n'est pas connu, l'entrée reste cachée. La carte de l'observatoire, où la FNCT
  met le cadre en vigueur, reste visible ; son texte dit désormais que la suspension retire
  l'écran aux communes sans rien effacer. Rien ne change en base : l'écriture y était déjà
  refusée cadre fermé.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 64 migrations ; la 064 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat 297/297, **42 bilans, 1 613 tests réussis,
  aucun échec**.
- Recomptage : 42 campagnes présentes, 42 enchaînées.
- `npm run lint` backend et web (TypeScript 5.8.3) : code 0.
- Navigateur (pile d'essai), compte d'un admin communal : cadre inactif, l'entrée
  « Acteurs informels » est absente (Pesées et Preuve présentes) ; cadre mis en vigueur,
  elle apparaît au rechargement. Base d'essai remise en l'état (cadre inactif).

## [0.15.13] — 2026-10-08 — Lot 18.1 : registre communal des acteurs informels (cadre inactif)

Projet de décret sur le tri à la source, article 13.1 — **non en vigueur**. Tout le lot
s'écrit derrière le paramètre national `cadre_secteur_informel_actif`, faux par défaut :
tant que la FNCT ne l'a pas mis en vigueur en citant le texte publié, **la base refuse**
toute catégorie, tout fait et toute démarche, dans toutes les communes. Le registre se
lit ; il ne s'écrit pas.

### Ajouté
- **Migration 064.** Le registre des pré-collecteurs du lot 16.1 (`barbechas`) devient
  celui des acteurs informels : catégorie déclarée (`pre_collecteur` ou `intermediaire`),
  trois faits (dispose d'un local, achète à ses pairs, véhicule motorisé) à trois états —
  *non renseigné* n'est jamais *non* — et la date de leur relevé, exigée par la base et
  jamais dans l'avenir. Une inscription du lot 16.1, sans catégorie ni faits, reste permise.
- **Pseudonyme attribué par la base** (`<COMMUNE>-I0001`, `app.prochain_identifiant_acteur`).
  L'identité reste où le lot 16.1 l'a mise, lue par le seul admin de la commune ; le registre
  ne porte ni nom, ni CIN, ni position, ni rendement individuel.
- **La démarche de formalisation est un historique** (`demarches_formalisation`) : entamée
  (avec sa pièce), en accompagnement, formalisée, interrompue (avec son motif). La base tient
  l'ordre : pas d'accompagnement ni de formalisation sans démarche entamée, pas de date qui
  recule ni dans l'avenir, rien après une formalisation. Une étape ne se réécrit pas, même au
  super-utilisateur ; saisie à tort, elle se retire (suppression logique, `app.supprimer`).
- **La plateforme constate, elle ne corrige pas.** `app.categorie_impliquee` dit ce que les
  faits impliquent (un local ou des achats aux pairs : intermédiaire) ; un écart avec la
  catégorie déclarée apparaît dans « À vérifier » (`app.incoherences_acteurs_informels`,
  ajoutée à `app.incoherences_commune`) et dans le registre, sans que la catégorie change.
- **Routes** `/acteurs-informels` (registre, inscription, catégorie et faits, démarches) et
  `/observatoire/cadre-secteur-informel` (lecture pour tous ; mise en vigueur par la FNCT
  seule, texte publié exigé par l'API et par la base). Un acteur d'une autre commune est
  introuvable (404).
- **Écrans.** Portail communal, pôle Terrain : « Acteurs informels », avec un bandeau qui dit
  si le cadre est en vigueur ; formulaires réservés à l'admin de la commune, cadre en vigueur.
  Observatoire, Paramètres nationaux : la carte « Cadre du secteur informel ». Français et
  arabe ; vérifiés à 1 366 px et à 375 px (aucun défilement horizontal de la page).
- **Campagne `acteurs-informels`**, qui commence par ce que la plateforme refuse (cadre
  fermé, mise en vigueur sans texte ou par une commune, faits non datés, démarche hors de son
  ordre) ; elle bâtit sa commune de test, l'efface et rend le paramètre national dans l'état
  trouvé.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 64 migrations ; la 064 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat 297/297, **42 bilans, 1 613 tests
  réussis, aucun échec** (dont `acteurs-informels` : 66).
- Recomptage : 42 campagnes présentes, 42 enchaînées.
- `npm run lint` backend et web (TypeScript 5.8.3) : code 0.
- Navigateur (pile d'essai) : mise en vigueur depuis l'observatoire, inscription d'un
  acteur (pseudonyme `LAMARSA-I0001`, écart signalé), étape « démarche entamée »
  inscrite ; arabe en RTL sans clé manquante ; à 375 px, aucun défilement horizontal
  de la page. Base d'essai remise en l'état (cadre suspendu, acteur retiré).

## [0.15.12] — 2026-10-08 — Trois correctifs relevés pendant les lots 16.4 à 17.5

### Corrigé
- **Téléphone : la barre latérale écrasait chaque écran.** Le portail communal et
  l'observatoire posaient la barre du menu À CÔTÉ du contenu, dans une rangée
  sans point de rupture : sur 375 px, l'écran tenait dans une colonne d'environ
  160 px. Le conteneur passe en colonne sur téléphone (barre au-dessus, contenu
  pleine largeur) et reste en ligne à partir de `lg`. Vérifié à 375 px en
  français et en arabe (contenu 343 px, aucun défilement horizontal), et à
  1 366 px où rien ne change.
- **Pesées en arabe : les mois s'écrivaient en français.** La liste des mois
  était écrite en dur ; elle suit maintenant la langue de l'écran, avec les noms
  en usage en Tunisie (جانفي، جويلية…).
- **Un kilo par habitant, pas deux (migration 063).** La fiche des cinq axes
  (`app.mesures_kpi`, migration 050) divisait encore par le recensement, alors
  que l'écran des pesées utilise depuis le lot 17.1 la population que la commune
  retient. La fiche prend désormais la même population (déclarée, sinon
  recensement), et le détail de la mesure dit laquelle. Deux contrôles ajoutés à
  la campagne `parametres-communaux` : la fiche suit la population déclarée, puis
  revient au recensement quand on l'efface.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 63 migrations ; la 063 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat 289/289, **41 bilans, 1 547 tests
  réussis, aucun échec** (dont `parametres-communaux` : 32, avec les deux contrôles
  de la fiche des cinq axes).
- Recomptage : 41 campagnes présentes, 41 enchaînées.
- `npm run lint` backend et web (TypeScript 5.8.3) : code 0.
- Navigateur (pile d'essai) : à 375 px, barre du menu au-dessus du contenu, contenu
  de 343 px, aucun défilement horizontal, en français et en arabe ; à 1 366 px,
  barre et contenu côte à côte comme avant ; mois « جانفي », « جويلية » en arabe.

## [0.15.11] — 2026-10-08 — Lot 17.5 : le rejeu du coût complet d'un bureau d'études

Un PCGD publie un coût complet — M'hamdia 2025 : 1 914 830 DT, « 155 DT/t ».
SIIPI ne le recopie pas comme une vérité : il range les chiffres **déclarés** par
le bureau d'études, rejoue la méthode **Z = (A + B) + (C + D)** (skill
pcgd-cout-complet-methodologie) et montre les écarts **E1 à E8**, sans les
trancher. Décision du 08/10/2026 : le fichier d'agrégats réel de M'hamdia reste
**hors du dépôt public** (accord de la commune et du bureau d'études non vérifié) ;
il se charge localement par l'écran.

### Ajouté
- **Migration 062.**
  - `etudes_cout_complet` : une étude par commune et exercice ; provenance imposée
    « déclaré par le bureau d'études ».
  - `valeurs_cout_complet` : postes (blocs A à D), totaux, ratios publiés — avec
    leur **pas d'arrondi** et, quand le rapport le donne à part, leur numérateur —,
    ventilation par flux. Un poste absent du rapport a un montant NULL : **non
    renseigné, jamais 0**. Deux versions publiées d'un même chiffre se rangent
    toutes les deux ; une seule est retenue pour le calcul.
  - `constats_lecture_cout_complet` : ce que la lecture relève et que SIIPI ne
    recalcule pas (un millésime « 2017 » dans un titre de 2025).
  - Refusés en base : une autre provenance, un ratio sans pas d'arrondi, un
    montant négatif, un total absent, un code hors nomenclature, deux versions
    retenues du même chiffre, une ligne réécrite ; l'application n'a aucun droit
    d'effacement. Une étude se retire (retrait logique) pour être rechargée.
- **Le rejeu** (`services/coutComplet.ts`), calculé à chaque lecture, jamais
  stocké : blocs A à D, X, Y, Z face aux totaux publiés ; le coût rapporté au
  tonnage **pesé** ; pour chaque ratio publié, le dénominateur qu'il implique.
  **L'arrondi n'est pas une tolérance** : « 155 » couvre 154,5 à 155,5, le
  dénominateur implicite est un **intervalle**, et il n'y a écart que si le chiffre
  déclaré en sort.
  - E1 dénominateur du coût à la tonne · E2 dénominateurs différents selon
    l'indicateur · E3 totaux qui ne se recoupent pas · E4 deux versions d'un même
    poste · E5 dénominateurs par habitant, ménage, habitat · E6 constats de
    lecture · E7 postes non renseignés · E8 ventilation par flux.
- **La lecture d'un fichier « agrégats de PCGD »** (`services/importCoutComplet.ts`)
  : refuse en bloc tout champ qui ressemble à une donnée personnelle (nom d'agent,
  CIN, téléphone, salaire individuel), vérifie que le gouvernorat du fichier est
  celui de la commune, range les versions concurrentes, et ne recopie pas les
  écarts que SIIPI recalcule.
- Routes `/cout-complet/etudes` (liste, chargement, étude et rejeu, retrait) —
  4 routes au contrat.
- **Écran « Coût complet »** (pôle Pilotage) : chargement du fichier, tableau du
  rejeu bloc par bloc face aux totaux publiés, tableau des ratios et de leur
  dénominateur, cartes E1 à E8 qui finissent toutes par « à demander au bureau
  d'études ». FR et AR.
- **Campagne `cout-complet`** sur un **jeu fictif** de même structure
  (`tests/donnees/cout-complet-fictif.json`), comparée à un **témoin
  indépendant** (`tests/cout_complet_attendus.py`), qui ne lit que le fichier et
  la méthode : refus au chargement et en base, puis blocs, Z, intervalles, statut
  de chaque écart, retrait et rechargement.
- `.gitignore` : le fichier réel `docs/specs_metier/sources/mhamdia-pcgd-2025-agregats.json`.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 62 migrations ; la 062 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat 289/289, **41 bilans, 1 545 tests
  réussis, aucun échec** (dont `cout-complet` : 45, comparés au témoin indépendant).
- Recomptage : 41 campagnes présentes, 41 enchaînées.
- `npm run lint` backend et web (TypeScript 5.8.3) : code 0.
- Fichier réel de M'hamdia, chargé **localement** sur la pile d'essai (jamais
  versionné) : le rejeu de l'API et le témoin indépendant donnent les mêmes blocs
  A à D, le même Z (égal au coût total publié) et le même statut pour les huit
  écarts ; l'écran l'affiche en entier.

## [0.15.10] — 2026-10-07 — Lot 17.1 : la population de saison et le repère de production

Une commune côtière triple en été. Le kilo par habitant et par jour (migration
036) rapportait le tonnage du mois à la population du recensement, toute
l'année : en juillet, il triplait, et l'on concluait à un problème de collecte
là où il n'y avait que des estivants. Faux cinq mois par an.

### Ajouté
- **Migration 061** — trois réglages ajoutés à `parametres_commune` :
  - la **population permanente** que la commune retient, avec sa source (à
    défaut, le recensement s'applique, et l'écran le dit) ;
  - la **population présente en saison** et ses mois (la saison peut
    chevaucher l'année : de novembre à février) ;
  - la **production spécifique théorique** (kg/hab/jour), avec sa source : le
    repère du pesé.
  - Refusés en base : un chiffre sans sa source, une saison incomplète, un mois
    hors de 1 à 12, une population de saison inférieure à la population
    permanente retenue (elle la comprend), une production théorique nulle ou
    absurde.
  - `app.production_specifique(commune, année)` : par mois, le ratio sur la
    population permanente et, pour un mois de saison, sur la population
    présente — **côte à côte** ; le ratio retenu (celui de la saison quand elle
    s'applique) et son **écart au repère**. Sans population, pas de ratio ; sans
    repère, pas d'écart (null, jamais 0). Rien n'est « corrigé ».
- Routes `PUT /communes/{id}/population` (corps complet, null efface) et
  `GET /pesees/production-specifique` ; `GET /communes/{id}/parametres` rend
  aussi la population du recensement.
- **Paramètres** (admin de la commune) : une section « Population et production
  de référence » ; les mois de la saison se choisissent par leur nom, dans la
  langue de l'écran.
- **Pesées** (vue « Tonnages ») : la colonne kg/hab/jour donne le ratio retenu
  et dit sur quelle population — recensement, population retenue, ou population
  présente en saison avec le ratio des seuls permanents à côté ; une colonne
  « Écart au repère ». FR et AR.
- **Campagne `parametres-communaux`** : elle commence par les refus (API et
  base), puis recalcule à la main sur une commune de 8 000 habitants : mars
  0,125 kg/hab/jour sur le recensement ; 0,100 sur 10 000 habitants déclarés ;
  juillet 0,600 sur les permanents et 0,200 sur 30 000 présents, ratio retenu
  0,200, −20,0 % du repère 0,25 ; une saison de novembre à février qui contient
  janvier ; sans population, le tonnage reste et le ratio est null.

### Corrigé en cours de lot
- La contrainte « saison complète » laissait passer des mois sans population :
  `NULL BETWEEN 1 AND 12` vaut NULL, et une contrainte qui vaut NULL est
  satisfaite. Les `IS NOT NULL` sont désormais explicites — c'est la campagne,
  qui commence par les refus, qui l'a révélé.

### Non traité ici
- L'indicateur KG_HAB_J des cinq axes (migration 050) et la vue nationale
  rapportent encore le tonnage à la population du recensement.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 61 migrations ; la 061 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat 285/285, **40 bilans, 1 500 tests
  réussis, aucun échec** (dont `parametres-communaux` : 30).
- Recomptage : 40 campagnes présentes, 40 enchaînées.
- `npm run lint` backend et web (TypeScript 5.8.3) : code 0.
- Navigateur (pile d'essai, La Marsa, 92 987 habitants au recensement) : une
  saison de 50 000 personnes refusée avec son motif ; avec 250 000 présentes de
  juin à septembre, juillet 0,400 kg/hab/jour (1,075 sur les seuls permanents),
  mars 0,538 « recensement », écarts au repère 0,8 affichés.

## [0.15.9] — 2026-10-07 — Lot 17.3 : les paramètres nationaux datés

Premier lot du jalon 12. Trois valeurs que fixe l'échelon national — la
redevance ANGeD, le ministère de tutelle, la formule d'en-tête des documents —
vivent désormais dans un registre national daté, tenu par la FNCT, au lieu de
350 copies communales qui divergeraient (SPEC § R5). **Un tarif change à une
date** : la redevance d'une pesée est celle en vigueur à la date de la pesée,
jamais celle du jour où l'on calcule.

### Ajouté
- **Migration 060.**
  - `definitions_parametres_nationaux` : ce qui se paramètre (nature nombre ou
    texte bilingue, unité, bornes). Trois paramètres : `redevance_anged`
    (TND/t), `ministere_tutelle`, `entete_etat`.
  - `valeurs_parametres_nationaux` : chaque valeur avec sa **date d'effet** (qui
    peut être à venir : un barème publié d'avance). Une valeur **ne se réécrit
    pas** ; une autre s'ajoute. Une valeur saisie à tort se retire, avec un
    motif, et reste lisible. Écriture : la FNCT seule (RLS) ; aucun droit
    d'effacement pour l'application.
  - **Une valeur officielle cite sa pièce** : la base refuse une valeur non
    provisoire sans référence (barème, arrêté). La redevance de référence des
    PCGD, **6,516 TND/t**, est posée **provisoire** au 1er janvier 2025 : le
    barème officiel et sa date d'effet manquent toujours.
  - Un nombre hors de ses bornes, un intitulé sans sa version arabe, deux
    valeurs à la même date : refusés en base.
  - `app.parametre_national(code, date)` : la valeur en vigueur à une date.
  - `app.redevance_anged(commune, année)` : par mois, **chaque pesée au taux en
    vigueur à sa date**. Une pesée antérieure à toute valeur n'a pas de taux :
    son tonnage est compté à part, et le montant porte sur le reste (`null`
    s'il n'y a rien de taxable, jamais 0). Le mois dit si un taux provisoire a
    servi.
- Routes `/parametres-nationaux` (lecture pour tout utilisateur authentifié,
  ajout et retrait pour la FNCT) et `/pesees/redevance` — 4 routes au contrat.
- **Écran « Paramètres nationaux »** dans l'observatoire (outils de la FNCT) :
  valeur en vigueur avec sa pièce et la mention « provisoire », valeurs à venir,
  historique avec les retraits et leur motif ; ajout d'une valeur datée,
  « provisoire » coché par défaut. Pas de bouton « modifier ».
- **Pesées** (vue « Tonnages ») : la redevance ANGeD de chaque mois à côté du
  tonnage, avec le taux appliqué et « taux provisoire » quand c'est le cas. FR et
  AR.
- **Campagne `parametres-nationaux`** : elle commence par les refus (commune qui
  fixe ou retire une valeur nationale, valeur officielle sans pièce — API et
  base —, texte pour un nombre, redevance nulle ou de 5 000 TND/t, intitulé sans
  arabe, date d'avant 2000, paramètre inconnu, doublon de date, valeur réécrite
  en base, effacement par l'application, retrait sans motif), puis l'historique
  (barème à venir qui attend sa date, intitulé retiré qui laisse « non
  renseigné »), puis la règle du lot, recalculée à la main : 5 TND/t au 1er
  janvier 2001, 8 TND/t au 1er juin — mars 2 t → 10 TND, juin 4,5 t → 36 TND (le
  jour d'effet compte déjà au nouveau taux), décembre 2000 sans taux → montant
  null ; le taux de juin retiré, juin repasse à 22,5 TND. Valeurs de test datées
  de 2001 et effacées en partant ; la valeur de référence n'est jamais touchée.

### Non traité ici
- L'assiette exacte de la redevance (tous les flux pesés, ou les seuls déchets
  mis en décharge) est à confirmer avec le barème officiel ANGeD.
- Les noms de mois de l'écran Pesées restent écrits en français en version arabe
  (liste antérieure au lot).

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 60 migrations ; la 060 rejouée : « Base déjà à jour » (la valeur de référence n'est posée qu'une fois).
- `npm test` : code de sortie 0 — contrat 283/283, **39 bilans, 1 470 tests
  réussis, aucun échec** (dont `parametres-nationaux` : 33).
- Recomptage : 39 campagnes présentes, 39 enchaînées.
- `npm run lint` backend et web (TypeScript 5.8.3) : code 0.
- Navigateur (pile d'essai) : observatoire, redevance en vigueur 6,516 TND/t
  « provisoire » depuis le 01/01/2025, ministère et en-tête « non renseigné » ;
  jumeau numérique, juin 2026 : 1 229,08 t → 8 008,685 TND « à 6,516 TND/t · taux
  provisoire » ; version arabe en RTL.

## [0.15.8] — 2026-10-07 — Lot 16.4 : le dossier de déclassement

Le référentiel du dépôt (diapos 83 à 85) ne décrit pas une fiche mais une
**procédure** : des conditions de proposition, quatre pièces obligatoires, un
circuit d'autorisation. SIIPI l'instruit ; il ne déclasse rien. Le prix et la
date de mise en circulation existaient déjà (`valeur_achat_tnd`,
`date_premiere_circulation`, migration 032) : aucune colonne n'a été ajoutée aux
engins.

### Ajouté
- **Migration 059.**
  - `immobilisations_engins` : les périodes où un engin n'a pas pu servir. Elles
    **s'ouvrent et se ferment d'elles-mêmes** quand l'état de l'engin change
    (en service ↔ en panne / à réformer), à la date que porte l'état ; elles se
    saisissent aussi pour le passé. Deux périodes d'un même engin ne se
    chevauchent pas. Un engin à l'arrêt **sans date connue n'ouvre rien** : son
    immobilisation est dite « de début inconnu » (les 13 engins immobilisés de
    Dar Chaabane, dont l'inventaire ne date aucune panne).
  - `app.constat_declassement()` : par engin, âge en années décimales, cumul des
    dépenses d'entretien et de réparation (carburant exclu) rapporté à la valeur
    d'achat, et le **seuil de 80 % affiché** — atteint, non atteint,
    *indéterminé* (des interventions sans coût), *non calculable* (pas de valeur
    d'achat, ou carnet d'entretien non tenu) ; pannes des 12 derniers mois ;
    **rapport de rendement** de l'année : jours d'immobilisation / jours
    travaillés au carnet de bord. Un registre non tenu rend `null`, jamais 0 ; un
    registre tenu et vide rend 0.
  - `dossiers_declassement` : motifs (les cinq conditions de la diapo 83),
    rapport détaillé, coût estimatif de la réparation, et le **constat figé** par
    la base au jour de la proposition. Un seul dossier en cours par engin ; aucun
    sur un engin réformé ou déjà adjugé. Motifs et rapport se corrigent jusqu'à
    la première étape ; ensuite, le dossier est figé. Il ne s'efface pas : un
    abandon se clôt « sans suite », avec son motif.
  - `etapes_declassement` : le **circuit dans l'ordre que la base impose** —
    accord de l'administration communale ; avis des Domaines de l'État et du
    contrôle technique (après un accord favorable) ; publicité légale (après deux
    avis favorables) ; adjudication (pli fermé ou enchère publique), qui clôt le
    dossier. Une étape ne se modifie pas ; la dernière se retire tant que rien ne
    s'appuie sur elle et que le dossier est en cours.
  - `pieces_declassement` : les pièces jointes (stockage, migration 041 ; usage
    `declassement`). Le fichier d'une pièce ne se retire pas par `/fichiers` ; les
    pièces d'un dossier clos restent.
  - Proposer, inscrire une étape, joindre une pièce : **l'admin de la commune**
    (`app.peut_instruire_declassement`). La FNCT lit.
  - **« À vérifier »** (famille déclassement) : l'engin adjugé encore inscrit au
    parc (la plateforme ne le passe pas « réformé » à la place de la commune),
    l'engin « à réformer » sans dossier, le motif « 80 % » que le cumul enregistré
    contredit.
- Routes `/declassement/constat`, `/declassement/immobilisations`,
  `/declassement/dossiers` (liste de proposition de la diapo 85, fiche, étapes,
  pièces) — 13 routes au contrat.
- **Écran « Déclassement »** (pôle Flotte) : il s'ouvre sur le constat du parc,
  colonne « part du prix » mise en avant ; la fiche d'un dossier montre le constat
  figé à côté de celui du jour, les quatre pièces obligatoires (jointe, calculée
  par SIIPI, saisie, manquante — affichées, jamais bloquantes), l'inventaire des
  dépenses, le circuit avec les seules étapes que la base accepterait ; le
  registre des immobilisations. FR et AR (RTL vérifié).
- **Campagne `declassement`** : elle commence par les refus (FNCT qui propose,
  dossier sans motif, motif hors référentiel, rapport trop court, proposition
  dans l'avenir, engin réformé ou d'une autre commune, second dossier en cours,
  périodes qui se chevauchent ou à l'envers, étape prématurée, en double, datée
  avant la proposition ou après la clôture, dossier engagé réécrit, pièce d'une
  autre commune), puis recalcule à la main : 42 000 TND sur 50 000 → 84,0 %,
  atteint ; 25,0 % avec une intervention sans coût → indéterminé ; 10 + 4 jours
  d'immobilisation (la période à cheval bornée au 1er janvier) pour 20 jours
  travaillés → 0,70 ; le constat figé qui reste à 84,0 quand une facture porte le
  cumul du jour à 94,0. Elle travaille sur l'an dernier et l'an d'avant, dans deux
  communes de test qu'elle efface.

### Corrigé en cours de lot
- Une période d'immobilisation saisie à l'envers (fin avant le début) faisait
  échouer la base sur la construction de l'intervalle (500) avant son propre
  refus : le contrôle des dates passe désormais en premier (400, message clair).

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 59 migrations ; la 059 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat 279/279, **38 bilans, 1 437 tests
  réussis, aucun échec** (dont `declassement` : 79).
- Recomptage : 38 campagnes présentes, 38 enchaînées.
- `npm run lint` backend et web (TypeScript 5.8.3) : code 0.
- Navigateur (pile d'essai) : constat d'une benne à 85,5 %, « 80 % atteint », 82 jours
  d'immobilisation (46 saisis + 36 ouverts par l'état de l'engin), jours travaillés
  « non renseigné » sans carnet ; dossier ouvert et accord de la commune inscrits depuis
  l'écran ; version arabe en RTL.

## [0.15.7] — 2026-10-02 — Lot 16.3 : carnet de bord, bons de carburant, L/100 km

Le carnet de bord est, selon le référentiel du dépôt, « le premier manque à
combler » : sans lui, aucun coût par engin n'est calculable. Il donne le ratio
mensuel du référentiel (diapo 44), que SIIPI exprime d'abord en **litres aux
100 km** — demande du 02/10.

### Ajouté
- **Migration 058.**
  - `carnets_de_bord` : une sortie par engin, par jour et par séance (matin,
    après-midi, nuit), compteur à la sortie et au retour, chauffeur, circuit,
    numéro du bon de pesée, tonnage. La **distance parcourue est une colonne
    calculée** par la base (retour − sortie) : jamais saisie. Un retour inférieur
    à la sortie est refusé ; le chauffeur et le circuit appartiennent à la
    commune de l'engin ; le compteur de l'engin suit le carnet, à la hausse.
  - `vehicules.unite_compteur` (km | heures) : L/100 km pour un compteur
    kilométrique, L/heure pour un compteur horaire. Les engins lourds de
    chantier sont passés en heures à la création de la colonne ; la commune
    corrige engin par engin.
  - **Bons de carburant par le registre scellé** (lot 16.2) :
    `app.emettre_bon_carburant()` émet le bon numéroté **et** enregistre le plein,
    dans la même transaction. Annuler le bon retire le plein ; un plein sous bon
    valable ne se modifie ni ne se retire seul.
  - `quotas_carburant` : quota mensuel par engin, **daté** — celui d'un mois est
    celui en vigueur au premier jour du mois.
  - `app.consommation_engins()` : par engin et par mois, litres, distance,
    **L/100 km** (ou L/heure), quota et écart. Une source absente rend `null`,
    jamais 0 : sans carnet, pas de ratio ; sans quota, pas d'écart.
  - **« À vérifier »** (famille carburant) : le dépassement du quota
    (avertissement, avec la lecture du référentiel — un indicateur d'avarie, pas
    une faute), le compteur qui recule, la sortie jamais rentrée. Aucun ratio par
    chauffeur, aucun classement.
- Routes `/exploitation/carnets`, `/exploitation/bons-carburant`,
  `/exploitation/quotas`, `/exploitation/engins/{id}/unite-compteur`,
  `/exploitation/consommation`.
- **Écran « Carnet & carburant »** (pôle Flotte) : la consommation du mois, avec
  la colonne **L/100 km** mise en avant et « non renseigné » là où le carnet
  manque ; la saisie des sorties et des retours ; l'émission et l'annulation des
  bons ; les quotas et l'unité des compteurs. FR et AR.
- **Jumeau numérique** : 736 sorties au carnet et 8 quotas ajoutés au jeu (tirés
  après tout le reste, avec leur propre graine : aucune donnée existante ne
  change). La campagne `simulation-3mois` compare la consommation de juillet,
  engin par engin, au calcul indépendant de `jumeau_attendus.py`.
- **Campagne `exploitation`** : elle commence par les refus (retour inférieur à la
  sortie, litres négatifs, distance saisie, sortie dans l'avenir, séance en double,
  chauffeur ou engin d'une autre commune, bon émis par la FNCT, quota nul, plein
  sous bon modifié ou retiré seul), puis recalcule à la main un mois de
  consommation (25,0 L/100 km, 8,00 L/heure, écart au quota), vérifie « À
  vérifier », et l'annulation d'un bon qui retire son plein et ramène le ratio à
  14,6 L/100 km. Elle travaille dans deux communes de test qu'elle efface : un bon
  consomme un numéro du registre scellé.
- `seed:parc` pose l'unité du compteur à la création d'un engin (heures pour un
  engin lourd) : sans cela, une installation neuve — où la colonne naît avant le
  parc — aurait laissé les chargeuses en kilomètres.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 58 migrations ; la 058 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat 266/266, **37 bilans, 1 358 tests
  réussis, aucun échec** (dont `exploitation` : 38 ; `simulation-3mois` : 82, avec
  la consommation de juillet des huit engins du jumeau).
- Recomptage : 37 campagnes présentes, 37 enchaînées.
- `npm run lint` backend et web (TypeScript 5.8.3) : code 0.
- Navigateur, jumeau numérique, juillet 2026 : 36,6 L/100 km pour une benne, 28,3
  pour un tracteur, écart au quota affiché ; version arabe en RTL.

## [0.15.6] — 2026-10-02 — Lot 16.2 : la numérotation scellée (mécanique)

Décision du 02/10 : construire la mécanique sans attendre les gabarits. Les
quatre pièces opposables du dépôt (référentiel § 2.1) — **ordre de mission** (D3),
**bon de sortie carburant** (D7), **bon de travail maintenance** (D11), **fiche de
déclaration de panne** (D9) — ont désormais un registre dont la base garantit ce
qu'un registre papier montre de lui-même : aucune page arrachée, aucune réécrite,
aucune glissée après coup.

### Ajouté
- **Migration 057** — `sequences_documents` et `documents_emis` :
  - **numéro continu** par commune, par type et par exercice (année à l'heure de
    Tunis), attribué **sous verrou** dans la même transaction que le document :
    deux émissions simultanées reçoivent deux numéros distincts, une émission qui
    échoue n'en consomme aucun ;
  - **jamais réutilisé** : un document annulé garde son numéro ;
  - **contenu figé**, avec son empreinte SHA-256 : un document émis ne se modifie
    pas et ne s'efface pas, pas même logiquement ; seule l'**annulation motivée**
    est permise (motif d'au moins cinq caractères) ;
  - **aucun numéro glissé** : une insertion qui ne porte pas le numéro que le
    compteur vient d'attribuer est refusée, même au super-utilisateur ;
  - l'application n'a **aucun droit d'écriture directe** : `app.emettre_document()`
    et `app.annuler_document()` sont les deux seules portes ;
  - `app.trous_documents()` : les numéros attribués sans document. Il ne devrait
    jamais rien rendre ; une ligne trahit une manipulation hors de l'application,
    et la plateforme la montre.
- Émettre et annuler sont des actes de la commune : son admin, pas la FNCT, qui
  lit les registres. L'objet d'un document (engin, circuit, agent, intervention)
  doit appartenir à la commune.
- Routes `GET /documents`, `GET /documents/trous`, `GET /documents/{id}`,
  `POST /documents`, `POST /documents/{id}/annuler` — ni modification ni
  suppression.
- **Campagne `documents`** : elle commence par les refus (réutiliser un numéro,
  devancer le compteur, modifier, supprimer, annuler sans motif, émettre à la place
  de la commune, lire ou annuler chez une autre commune), puis vérifie dix
  émissions simultanées (dix numéros distincts et contigus), qu'une émission
  ratée ne consomme rien, l'annulation qui garde son numéro, et la détection d'un
  trou créé hors de l'application. Elle travaille dans une commune de test qu'elle
  crée et efface : un document émis ne s'efface pas, aucun registre réel n'est touché.

### Corrigé en cours de lot
- Le déclencheur qui fige le contenu comparait la ligne entière ; dans un
  déclencheur `BEFORE`, la colonne générée `numero_affiche` n'est pas encore
  calculée, si bien que **toute annulation** passait pour une réécriture du numéro.
  Trouvé par la campagne avant toute livraison.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 57 migrations ; la 057 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat 256/256, **36 bilans, 1 311 tests
  réussis, aucun échec** (dont `documents` : 33).
- Recomptage : 36 campagnes présentes, 36 enchaînées.
- `npm run lint` backend et web (TypeScript 5.8.3) : code 0.

### En attente
- La **mise en page** (PDF bilingue A4 via `scripts/skills/pdf-template.mjs`) attend
  les gabarits validés par un chef de dépôt en exercice (SPEC § 6). Le contenu est
  conservé tel qu'émis : l'impression le relira, elle ne le recalculera pas.
- Pas encore d'écran d'émission : ses formulaires dépendent des gabarits. Les bons
  de carburant du lot 16.3 seront les premiers à passer par ce registre.

## [0.15.5] — 2026-10-02 — Lot 16.1 : conformité du registre des pré-collecteurs

Premier lot du jalon 11 (v0.16, conformité et pièces opposables). La table
`barbechas`, héritée du prototype, portait le CIN, le nom, un statut d'assurance
maladie, un revenu individuel et un lien de compte — ce que CLAUDE.md § 2
interdit de stocker. SPEC_v0.16.md, réserves R1 à R3.

### Supprimé
- Du registre `barbechas` : `cin`, `health_insurance_status`, `earnings_this_month_tnd`,
  `user_id` et `name`. Le registre devient **pseudonyme** : `id_precollecteur`
  (ex-`code_id`), zone, commune, véhicule, cumul pesé. *Pseudonyme*, pas anonyme
  (R1) : tant que la table d'identité existe, la donnée reste personnelle.
- Les noms présents n'ont pas été recopiés dans la table d'identité : elle refuse
  toute écriture tant que l'hébergement n'est pas accrédité, migration comprise.
  En base principale, il n'y en avait qu'un, celui du jeu de démonstration du seed.
- Du **journal d'audit** : les copies du nom, du CIN, de l'assurance et du revenu
  que le journal gardait des lignes du registre.
- Le revenu individuel, sur décision du 02/10/2026 (SPEC D8).

### Ajouté
- **Migration 056.**
  - `donnees_personnelles_barbechas` : nom et **empreinte du CIN**, sous RLS forcée,
    lue et écrite par le **seul admin de la commune** — ni la FNCT, ni une autre
    commune. Hors du journal d'audit, qui en recopierait le contenu ; chaque
    lecture passe par le journal des consultations (`access_log.precollecteur_ids`).
  - La base **refuse** toute identité tant que la FNCT n'a pas déclaré
    l'hébergement accrédité (`parametres_nationaux.hebergement_pii_accredite`,
    pièce justificative obligatoire), et pour une commune sans **récépissé INPDP**
    (`parametres_commune.recepisse_inpdp`, numéro et date). Le retrait d'une
    identité, lui, reste toujours possible.
  - `app.revenus_precollecteurs()` : le revenu par zone et par mois, recalculé
    depuis les livraisons, **masqué sous cinq pré-collecteurs** distincts.
- **L'empreinte** : HMAC-SHA256 du CIN normalisé, sous une clé de commune dérivée
  d'un secret d'environnement (`SIIPI_SECRET_IDENTITES`), calculée dans l'API —
  jamais en SQL, jamais en base. Une clé par commune : deux registres ne se
  recoupent pas. Le CIN en clair n'est ni écrit, ni journalisé, ni renvoyé ; le
  message d'erreur d'un CIN mal formé ne le répète pas. L'API refuse de démarrer
  en production avec le secret de développement.
- Routes : `GET|PUT|DELETE /barbechas/{id}/identite`, `GET /barbechas/revenus`,
  `GET|PUT /observatoire/hebergement-identites` (FNCT), `PUT /communes/{id}/recepisse-inpdp`.
- **Campagne `barbechas`** : elle commence par ce que la base refuse (colonnes
  disparues, copies du journal, identité sans hébergement accrédité, sans
  récépissé, accréditation sans pièce, lecture par la FNCT et par une autre
  commune), puis vérifie l'empreinte (ni le CIN, ni un simple SHA-256), le
  dédoublonnage, le journal des lectures, le revenu masqué et le retrait.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence (le seed crée le pré-collecteur de
  démonstration sans nom) : 56 migrations ; la 056 rejouée : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat 251/251, **35 bilans, 1 278 tests
  réussis, aucun échec** (dont `barbechas` : 40).
- Recomptage : 35 campagnes présentes, 35 enchaînées.
- `npm run lint` backend et web (TypeScript 5.8.3) : code 0.
- Pas d'écran dans ce lot : le registre n'en avait pas ; l'API et la base portent
  les règles.

### Reste ouvert (SPEC § 6)
- Confirmation juridique : responsable du traitement, déclaration ou autorisation.
- Hébergement accrédité : où, et quand — d'ici là, la base refuse les identités.
- Les **exports antérieurs** qui contenaient le CIN ou la santé : les retirer de la
  base ne les rappelle pas. Purge à décider.

## [0.15.4] — 2026-10-01 — S1 : le jumeau numérique

Aucune commune n'utilise encore la plateforme au quotidien. Le jumeau numérique
l'éprouve en attendant : trois mois d'activité simulée (1er juin – 31 août 2026)
dans une commune de démonstration fictive, chargés à la demande, retirés d'un
clic (FEUILLE_DE_ROUTE.md § 6bis).

### Ajouté
- **Le jeu** : `backend/seed/data/jumeau_3mois.json`, produit une fois pour toutes
  par `scripts/jumeau/generer.py` (graine fixe) et **versionné** — l'application
  charge, elle ne génère rien : deux chargements donnent les mêmes données. La
  structure est celle de Dar Chaabane El Fehri (13 circuits, 29 engins, 61 agents) ;
  rien d'autre n'en vient — noms tirés de listes de prénoms et de noms courants,
  immatriculations en « 99 », série qui n'existe pas. Présences quotidiennes,
  pesées, fins de poste, pleins de carburant, réclamations, nettoyages, contrôles,
  incidents, EPI, effectifs, un sondage et ses réponses (sans compte citoyen).
  Quatre anomalies **volontaires** pour que chaque alerte se déclenche puis
  s'éteigne : pesée au-delà de la charge utile, réclamation jamais traitée,
  nettoyage resté planifié, engin immobilisé sans motif.
- **Migration 055** — les garde-fous, dans la base :
  - `communes.est_demo`, qui ne se modifie pas ;
  - `provenance` (`reel` | `simule`) sur les dix-huit tables que le jeu remplit :
    toute ligne d'une commune de démonstration devient « simulée », même saisie à
    la main pendant une démonstration ; une ligne « simulée » est **refusée** dans
    une commune réelle ;
  - la commune de démonstration sort du statut de déploiement (donc du tableau
    par gouvernorat) et de la carte publique nationale ;
  - `app.retirer_jeu_demo()` : efface la commune de démonstration et tout son
    contenu. **Seule exception à la suppression logique** (CLAUDE.md § 1.4) :
    rien de ce qui est effacé n'a eu lieu. Réservée à la FNCT, refusée sur une
    commune réelle ;
  - `app.charger_reponses_demo()` : les réponses de sondage simulées, que la
    politique de la table réserve sinon aux citoyens.
- **Routes** `GET /demo`, `POST /demo/charger`, `POST /demo/retirer` (FNCT ; une
  commune réelle répond 409). `GET /communes` n'inclut la commune de
  démonstration qu'avec `avecDemo=1` ; `/communes/stats` et les vues nationales
  des KPI (concours, national, DMA, alertes) l'écartent.
- **Écran « Mode démo »** dans l'observatoire (Outils de la FNCT) : charger,
  ouvrir le portail, recharger à l'identique, retirer — avec confirmation avant
  tout ce qui efface. **Bannière permanente** « Données de démonstration » sur
  chaque écran du portail de démonstration ; FR et AR.
- `npm run seed:jumeau` (et `-- --retirer`) : la même chose en ligne de commande.
- **Campagne `simulation-3mois`** : elle commence par les refus (compte communal,
  commune réelle au chargement et au retrait, ligne simulée hors démonstration,
  réponses simulées sur une publication réelle, `est_demo` modifié), puis compare
  chaque indicateur à `backend/tests/jumeau_attendus.py` — qui ne lit que le
  fichier du jeu et la définition des indicateurs, jamais le code testé —,
  vérifie l'absence de la commune de démonstration de toute vue nationale,
  déclenche puis éteint chaque alerte, recharge à l'identique, et retire tout
  sans toucher à la commune réelle.

### Modifié
- Campagne `module4` : la liste blanche des colonnes de `personnel`,
  `effectifs_service` et `presences` accueille `provenance` — décision consignée
  dans la campagne : la colonne ne dit rien d'une personne, seulement si la ligne
  appartient au jeu de démonstration.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 55 migrations ; la 055 rejouée une seconde
  fois : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat 244/244, **34 bilans, 1 238 tests
  réussis, aucun échec** (dont `simulation-3mois` : 73, avec ses 22 indicateurs
  conformes au calcul indépendant).
- Recomptage : 34 campagnes présentes, 34 enchaînées.
- `npm run lint` backend et web (TypeScript 5.8.3) : code 0.
- Navigateur : chargement depuis le mode démo, ouverture du portail de
  démonstration, bannière sur chaque écran, indicateurs calculés, version arabe
  (RTL). Le retrait a été vérifié par la campagne, pas cliqué dans le navigateur
  (fenêtre de confirmation).

### Constaté
- Le jeu s'arrête au 31 août : passé trente jours, chaque circuit est signalé
  « aucune pesée depuis trente jours », ce qui est exact. Les circuits de
  **balayage** reçoivent le même signal alors qu'ils ne se pèsent jamais — à
  Dar Chaabane aussi. Défaut de la règle de cohérence, laissé à un lot à part.

## [0.15.3] — 2026-10-01 — S0 : un seul guide de démarrage, une base qui dit son état

Complément de S0 décidé le 1er octobre (ligne S0 de la feuille de route). Reste
de S0 : la carte du conseiller SIG, attendue lundi 5 octobre, qui ne bloque pas S1.

### Ajouté
- **`/health` dit l'état de la base**, pas seulement qu'elle répond. Il distingue
  une base injoignable, une base **non initialisée** (aucune migration appliquée)
  et une base **plus ancienne que le code** (migrations en attente, avec leur
  nombre), et dit pour chacune la commande à lancer (`DEMARRER.bat`,
  `MIGRER.bat`). Une base saine répond 200 avec le nombre de migrations
  appliquées. Une base vide répondait « ok, connected ».
- Campagne `assainissement`, section 6 : une seconde API est lancée sur une base
  **vide** créée pour l'occasion, puis sur une base en retard ; la base de la
  campagne n'est pas touchée.

### Corrigé
- **La connexion sur une base non initialisée répondait « Erreur interne du
  serveur »** (500). Avant de répondre 500, le gestionnaire d'erreurs consulte
  l'état de la base : si elle n'est pas en état de servir, il répond 503 avec la
  cause et le remède. Le contrôle ne coûte qu'en cas d'erreur.
- **Trois documents de démarrage qui se contredisaient** (`README.md`,
  `DEMARRAGE.md`, `GUIDE_DEMARRAGE.md`) et un script PowerShell abandonné
  (`demarrer.ps1`) : mot de passe de la base (`change_me_strong_password` contre
  `siipi_dev_password`), port d'Adminer (8080 contre 8081), « 26 migrations »,
  « 240 tests », et le pas-à-pas du prototype d'origine. **`DEMARRER.bat` est
  désormais le seul guide** ; `DEMARRAGE.md` l'explique et donne les mêmes
  commandes hors Windows. `GUIDE_DEMARRAGE.md` et `demarrer.ps1` sont retirés
  (l'historique git les garde).
- **`DEMARRER.bat` n'installait pas ce que les campagnes de tests attendent** :
  il s'arrêtait après le découpage, sans la commune pilote. Il suit maintenant
  l'ordre de référence (`seed:dar-chaabane`, `seed:parc`, `seed:personnel`,
  `seed:communication`), n'écrit plus de nombre de migrations figé, et finit par
  le contrôle de `/health`.
- **Le mot de passe affiché par `DEMARRER.bat` était faux** : sous
  `enabledelayedexpansion`, le `!` de `Siipi2026!` disparaissait à l'écran.
  Même défaut dans `RECHARGER_DAR_CHAABANE.bat`, qui annonçait en outre deux
  comptes (`directeur.darchaabane@…`, `prestataire.darchaabane@…`) qu'aucun seed
  ne crée : il renvoie désormais au compte national, qui ouvre le portail de
  n'importe quelle commune.
- **`backend/.env.example`** citait un mot de passe que la base du Compose ne
  connaît pas : copié tel quel, il empêchait l'API lancée hors conteneur de se
  connecter. Aligné sur `siipi_dev_password`.
- Commentaire périmé de `TESTS.bat` (« douze campagnes ») : il lance `npm test`,
  donc toutes les campagnes.

### Vérifié (lu dans les sorties)
- Base neuve, ordre de référence : 54 migrations ; la dernière rejouée une
  seconde fois : « Base déjà à jour ».
- `npm test` : code de sortie 0 — contrat 241/241, **33 bilans, 1 165 tests
  réussis, aucun échec** (dont `assainissement` : 38).
- Recomptage : 33 campagnes présentes, 33 enchaînées.
- `npm run lint` backend et web (TypeScript 5.8.3) : code 0.
- `DEMARRER.bat` déroulé à blanc (Docker simulé) : les neuf étapes, le mot de
  passe affiché en entier, `/health` contrôlé. Il n'a pas été lancé contre une
  vraie pile : il aurait pris les ports du portail en service.

## [0.15.2] — 2026-09-30 — S0 : assainissement

### Ajouté
- **Import des KMZ exportés d'ArcGIS** (préalable des données de M'hamdia). Un tel
  fichier porte toute une base d'étude, une couche par dossier, avec les
  attributs dans un tableau HTML. L'aperçu d'import décrit désormais les
  **couches** (points, lignes, surfaces, attributs et leurs valeurs) ; on choisit
  la couche, au besoin un **filtre** sur un attribut (les points d'un seul
  circuit) et le **type** des points qui n'en portent pas (une couche de
  dépotoirs → points noirs). Valider sans choisir est refusé. Les surfaces sont
  écartées avec leur raison. Éprouvé sur le KMZ réel des circuits existants de
  M'hamdia (PCGD 2026) : neuf couches reconnues, là où l'import mêlait 125 points
  et trois tracés en un seul.
- **Empreinte des migrations.** Le migrateur ne suivait que le NOM d'une
  migration : un fichier déjà appliqué pouvait changer sans que rien ne le dise,
  et la modification n'atteignait que les bases créées après. Il garde désormais
  l'empreinte SHA-256 de chaque migration et s'arrête, en nommant le fichier et en
  disant quoi faire, si un fichier ne lui correspond plus.
- Campagne **`assainissement`** : elle commence par ce que la plateforme refuse
  (migration modifiée, fichier à plusieurs couches validé sans choix, ancienne
  référence légale dans la base ou le contrat d'API).

### Corrigé
- **La référence légale** : les commentaires, les migrations, le contrat d'API,
  les seeds, les tests et le libellé FR/AR citaient le décret-loi n° 2022-54
  (cybercriminalité). Le texte qui régit les données à caractère personnel est la
  **loi organique n° 2004-63** ; 43 occurrences corrigées. Les cinq commentaires
  de la base concernés sont réécrits sur les bases existantes par la migration
  053 — corriger les fichiers seuls n'aurait changé que les bases neuves.
- **Un citoyen inscrit par l'application ne pouvait ni proposer un point de
  collecte ni déposer une photo dans sa propre commune** (« Action hors du
  périmètre de votre commune ») : les deux politiques exigeaient la commune du
  COMPTE, qu'un citoyen inscrit n'a pas — la sienne est celle de son adresse
  déclarée. Migration 054.
- **Des campagnes qui ne vérifiaient rien, ou pas ce qu'elles annonçaient** :
  - `suggestions` s'arrêtait en succès, « sans objet », faute de compte citoyen :
    elle ne testait rien et cachait le défaut précédent. Elle crée désormais son
    citoyen d'essai ;
  - `module4` jetait le message d'erreur qu'elle cherchait (le refus d'affecter
    un agent d'une autre commune ne pouvait jamais être constaté) ;
  - `module6` attendait `t` là où PostgreSQL 16 écrit `true` ;
  - `circuits` et `prestataires` créaient leur circuit sans date de début :
    dû à partir d'aujourd'hui, il n'avait aucun passage prévu la semaine
    contrôlée ;
  - `module2` dépendait de l'ordre des chargements (agents fictifs du module 2).
- **Les agents fictifs de Dar Chaabane** (MAT-*) sont retirés par `seed:personnel`
  dès que le registre réel est chargé — ce que faisait `CORRIGER_PERSONNEL.bat` à
  la main ; les affectations sont closes, rien n'est effacé.
- **`MIGRER.bat` ne lançait que huit campagnes** sur trente-deux, nommées à la
  main. Il lance désormais `npm test` : le contrat d'API et toutes les campagnes.
- `test:kpi-sources` lançait aussi `releves-terrain` (défaut de la v0.13.0).
- **Session expirée** : un portail resté ouvert au-delà de la durée du jeton
  (huit heures) affichait « Token invalide ou expiré » sur chaque écran, avec un
  « Réessayer » qui ne pouvait pas réussir. La première réponse 401 referme
  désormais la session et ramène à l'écran de connexion, qui dit pourquoi.
- Libellé manquant de la famille d'import « CSV ».

### Vérifié (critère d'acceptation, `CLAUDE.md` § 7)
- Sur une base neuve, dans l'ordre d'une installation réelle (`migrate`, `seed`,
  `import:decoupage`, `seed:dar-chaabane`, `seed:parc`, `seed:personnel`,
  `seed:communication`) : 54 migrations appliquées, la dernière rejouée une
  seconde fois sans effet.
- `npm test` : code de sortie 0 — contrat 241 routes servies / 241 documentées,
  **33 campagnes, 1 159 tests réussis, aucun échec** (somme des 33 bilans lus
  dans la sortie).
- Recomptage : 33 campagnes présentes, 33 enchaînées par `npm test`.
- `npm run lint` (backend et web, TypeScript 5.8.3) : aucun écart.

### Décisions à retenir
- **Une campagne ne se déclare jamais « sans objet »** : elle bâtit ses données
  ou elle échoue.
- **Une migration appliquée ne se modifie pas** — c'est désormais vérifié, pas
  seulement écrit.
- **Un fichier SIG n'est pas une tournée** : SIIPI ne devine pas quelle couche
  porte les arrêts d'un circuit ; il les décrit et laisse choisir.
- Les anciennes entrées de ce journal qui citent le décret-loi 2022-54 restent
  telles quelles : c'est l'histoire du dépôt.

## [0.15.1] — 2026-09-30 — Changement de stratégie : jumeau numérique et jalons en parallèle

Version **documentaire** : aucun code applicatif ne change.

### Modifié
- **La recette terrain est différée** (les communes ne sont pas disponibles). Elle
  reste l'objectif de clôture d'une version mais ne bloque plus l'ouverture des
  jalons suivants. `FEUILLE_DE_ROUTE.md` § 0, § 4 (R1, R2, jalon 12), § 6.
- **Le jalon 12 avance en parallèle de R1** pour les lots 17.1, 17.3 et 17.5. Les lots
  17.2 et 17.4 restent suspendus à leurs préalables externes.
- **Inscription citoyenne (§ 7.2) tranchée** : courriel et push web en phase 1 ;
  téléphone et OTP en phase 2, après R1. Écart assumé à `M1` du cahier des charges.
- `CLAUDE.md` : `simulation-3mois` inscrite au critère d'acceptation ; consigne de
  reprise mise à jour ; les nombres de campagnes sont datés du 30/09/2026 et se
  recalculent par les deux commandes de recomptage.
- `FEUILLE_DE_ROUTE.md` : deux risques ajoutés (illusion de maturité ; données
  simulées confondues avec des données réelles) et une décision ouverte (date de la
  recette).

### Ajouté
- **Le jumeau numérique** (`FEUILLE_DE_ROUTE.md` § 6bis) : jeu de données simulé de
  trois mois d'activité, campagne `test:simulation-3mois`, écran « Mode démo ». Lot
  **S1**, à réaliser après S0. Il porte les garde-fous qui le séparent du réel :
  données fictives, provenance `simule`, commune de démonstration exclue des
  agrégations nationales, valeurs attendues calculées hors du code testé.

### Numérotation
- Cette entrée porte **0.15.1** et non 0.16.1 : la version 0.16.0 est celle de la
  clôture du jalon 11 et n'existe pas encore. L'étape S0 (assainissement) devient
  **0.15.2**.

## [0.15.0] — 2026-09-30 — Jalon 10, phase 1 : navigation par pôles et carte unifiée

### Ajouté
- **Barre latérale à cinq pôles métier** (`BarreLaterale.tsx`), en remplacement
  des dix-sept onglets défilants. Posée et rétractable sur poste fixe, tiroir
  par-dessus au téléphone. Le tiroir vient de la **droite en arabe** : le pouce
  d'un lecteur d'arabe part de ce côté-là.
  Cockpit · Terrain & opérations · Citoyens & cadre de vie · Flotte, GMAO &
  dépôt · Pilotage & auto-évaluation, plus un groupe « Administration » rendu à
  part — forcer « Comptes » dans un pôle métier ferait chercher les accès là où
  personne ne les cherche.
- **Panneau de circuit sur la carte** (`PanneauCircuit.tsx`) : choisir un
  circuit montre son exécutant, son engin, ses arrêts par nature et ses constats
  des trente derniers jours — **sans quitter la carte**. Le panneau borde la
  carte, il ne la remplace pas : on doit voir le tracé pendant qu'on lit ses
  constats.
- **`CLAUDE.md`** : la mémoire de travail du projet — commandes, conventions,
  les cinq règles d'or, ce qu'on ne stocke jamais, et le protocole de validation.
- **`scripts/skills/`** : quatre outils de vérification interne, chacun né d'un
  défaut réel — `db-check.sh` (RLS forcée, politiques qui ignorent
  l'intercommunalité, géométries sans index, `SECURITY DEFINER` sans
  `search_path`), `kpi-evaluator.mjs` (une absence devenue zéro),
  `ui-builder.mjs` (écran conforme : trois états, propriétés logiques, clés dans
  les deux langues), `pdf-template.mjs` (les quatre documents légaux tunisiens).

### Modifié
- L'espace communal passe de 1100 à 1400 pixels de large : la carte unifiée en a
  besoin, et la barre latérale en prend déjà une part.
- `FEUILLE_DE_ROUTE.md` : Jalons 10 et 11 détaillés en sous-lots, chacun avec
  son test de validation — dont le moteur d'estimation volumétrique, le
  connecteur GPS tiers, les documents légaux, la détection d'anomalies de
  tournée et le calculateur DMA.

### Deux absences qui se disent
Un circuit sans arrêt affiche « le circuit existe au registre, mais personne ne
sait où il passe ». Un circuit sans constat depuis trente jours affiche « ce
n'est pas *rien à signaler*, c'est un contrôle qui n'a pas eu lieu ». Un cadre
vide se prend pour une panne ; pire, il laisse croire qu'il n'y a rien à faire.

---

## [0.14.0] — 2026-09-29 — Les fichiers géographiques de chaque circuit

### Ajouté
- **Onglet « Données géographiques »** dans la fiche d'un circuit : le dépôt
  de l'itinéraire et des arrêts (GPX, KML, KMZ, GeoJSON, CSV), jusqu'ici
  logé sous « Points de collecte », et le **téléchargement du circuit** en
  GPX (GPS), KML (Google Earth) ou GeoJSON (QGIS) : tracé et arrêts, avec le
  type, le voyage, le rang, l'heure relevée, les champs libres et les
  étiquettes (`GET /circuits/{id}/fichier`).
- **Un fichier téléchargé se réimporte à l'identique** : types, ordre, heure
  et tracé reviennent tels quels, dans les trois formats.
- **Fichiers joints dès la création d'un circuit** (facultatif) : itinéraire
  et arrêts sont importés juste après l'enregistrement, et la fiche s'ouvre
  sur l'onglet qui les montre ; un fichier refusé est signalé en tête de la
  fiche, sans annuler le circuit.

### Corrigé
- **Carte de la commune** : les tracés étaient tous violets, et le filtre
  « circuit » ne s'appliquait qu'aux arrêts — vingt-trois circuits se
  fondaient en une seule tache. Chaque circuit a désormais sa couleur, et le
  filtre isole aussi son tracé.
- **Lecteur de relevés** : un KML d'arrêts accompagné d'un tracé perdait le
  tracé ; un GPX perdait le type de ses points ; un GeoJSON perdait le
  voyage, l'heure et la précision, et lisait « centre_transfert » comme
  « autre ». En import « auto », un itinéraire en place n'est toujours pas
  remplacé d'office par le tracé d'un relevé d'arrêts.

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
