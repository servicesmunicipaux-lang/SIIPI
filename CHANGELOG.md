# Journal des versions — SIIPI

Ce journal suit l'avancement par **Jalon**, au sens de `FEUILLE_DE_ROUTE.md` § 4 :
un lot de fonctionnalités groupées par dépendance réelle, pas par rubrique du
cahier des charges. Chaque entrée renvoie aux identifiants du cahier des
charges (`B5.5.2`, `C3.1`, …) tels que suivis dans la feuille de route.

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
