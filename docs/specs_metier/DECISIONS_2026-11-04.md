# Décisions de Nacer — 4 novembre 2026

Suite des registres du 16 et du 20 octobre. Claude Code applique ces décisions telles quelles ; elles priment sur les valeurs par défaut des spécifications. Une décision ne se modifie que par une nouvelle entrée datée.

## 1. Jalon G — déchets assimilés et conventions de propreté

Spécification : `SPEC_G_assimiles_conventions.md` (v1.1). Décisions G-1 à G-4 (§ 0 de la spécification) :
- **G-1** la ligne rouge n° 5 est gardée : SIIPI calcule l'assiette et l'exporte ; l'état du recouvrement est réimporté en lecture seule ;
- **G-2** levées sur les circuits et campagne de pesée **découplées** ; un établissement sans circuit relève du forfait ou d'un point d'apport volontaire, au choix de la commune ;
- **G-3** identification par matricule fiscal, ou par CIN (jamais en clair, empreinte et table d'identité séparée, garde d'hébergement) ;
- **G-4** recensement : import TCL, puis Kobo en propositions, puis saisie ; un établissement n'est jamais supprimé.

Ajouts du 4 novembre :
- le **proxy WaCT de 30 %** sert à l'estimation globale du gisement des assimilés, **jamais à la facturation** ;
- les **campagnes de pesée sont génériques** (établissements ou ménages), dès le jalon G.

Les ajustements du § 0bis et les questions du § 9 de la spécification restent **à confirmer par Nacer** avant le codage des lots concernés.

## 2. WaCT et WABI : pas de module maintenant

- **Le module WaCT complet (jalon H) et WABI (jalon I) sont reportés.** Raisons : ils demandent des données qui n'existent pas encore (pesée ménagère, audit des installations, grilles qualitatives) ; ils retarderaient le jalon G, qui apporte des recettes réelles ; WABI complet contredit la décision du 9 octobre (pas de score, pas de classement).
- **Conditions de réouverture** (une seule suffit) : un bailleur l'exige ; la FNCT veut publier un rapport national ODD ; une commune pilote demande explicitement l'auto-diagnostic WABI dans SIIPI.
- **D'ici là**, une étude WaCT ou WABI faite par une commune se saisit comme **indicateurs déclarés**, avec source et date, par le mécanisme existant des déclarations. Aucun nouveau module.

## 3. Lot « Indicateurs ODD et radar » (petit lot, 1 à 2 jours)

Le nom dans l'interface est **« Indicateurs ODD »**, jamais « WaCT ». Ordre : **après la finalisation de la spécification G, avant le codage du jalon G**.

### 3.1 Deux indicateurs ODD calculés, ajoutés au catalogue

| Code | Indicateur | Calcul | Nature |
|---|---|---|---|
| `ODD_11_6_1_A` | Taux de collecte des déchets municipaux | Pesées de la période ÷ (gisement ménager + gisement assimilé) × 100. Gisement ménager = population retenue × production spécifique (17.1). Gisement assimilé = celui du jalon G (pesée de campagne, puis déclaré, puis proxy) ; **avant le jalon G, le proxy seul** : gisement ménager × 0,30 / 0,70 | **Estimé** dès qu'un terme l'est ; « mesuré » seulement si la production ménagère vient d'une étude mesurée déclarée, les assimilés d'une campagne, et que tous les voyages attendus sont pesés |
| `ODD_12_3_1_B` | Indice de gaspillage alimentaire des ménages | Production spécifique (kg/hab/j) × part de la fraction `organiques` de la caractérisation retenue ÷ 100 ; total = population × ce ratio ÷ 1000 (t/j) | **Approximation**, dite à l'écran : la fraction organique de SIIPI comprend aussi les déchets verts, alors que l'indicateur ne compte que les déchets alimentaires. Une valeur déclarée issue d'une étude la remplace |

Règles qui s'appliquent :
- **Le numérateur suit la règle du taux de collecte existant** (`TAUX_COLLECTE`) : calculé seulement quand tous les voyages attendus de la période sont pesés ; sinon « non renseigné », jamais un taux faussement bas.
- **`TAUX_COLLECTE` reste tel qu'il est.** Il rapporte le pesé au seul gisement ménager ; l'ODD y ajoute les assimilés et sera donc plus bas. Le panneau de l'indicateur l'explique.
- **Sans population retenue, production spécifique ou caractérisation : « non renseigné », jamais 0.** « Ce qui manque » le dit.
- Le panneau montre la provenance de **chaque terme** (pesé, déclaré, proxy WaCT, caractérisation et son niveau de source).

### 3.2 Trois indicateurs ODD déclarables

`ODD_11_6_1_B` (gestion en installations contrôlées, %), `ODD_12_5_1` (taux de valorisation de la ville, %), `FUITE_PLASTIQUE` (kg/hab/an) : **jamais calculés**, saisis par la commune depuis une étude, marqués « déclarés ».

- **Source et date de l'étude obligatoires.** La table `declarations_indicateurs` n'a aujourd'hui ni l'une ni l'autre (seulement un commentaire et la date de saisie) : une migration ajoute `source` et `date_reference`, exigées par la base pour tout indicateur marqué `exige_source` dans le catalogue.
- Une famille `odd` s'ajoute au catalogue (aujourd'hui `indicateur`, `dma`, `donnee`), pour regrouper les cinq indicateurs sous « Indicateurs ODD » ; axe 3 (performance environnementale).

### 3.3 Radar de complétude sur l'écran Indicateurs

- **Un radar par commune**, à 5 axes : pour chaque axe, la part des indicateurs **renseignés** parmi les indicateurs **applicables** (un indicateur « sans objet » sort du dénominateur).
- Chaque axe porte aussi son compte en mots (« 4 sur 7 »). **Aucun chiffre global**, aucune comparaison entre communes, aucun radar national.
- Bibliothèque : Recharts (déjà installée) ; un tableau équivalent pour l'accessibilité et l'impression.
- **Option B, plus tard** : un radar de performance (part des objectifs atteints par axe), quand les communes auront saisi leurs cibles.

### 3.4 Tests de sortie

- Une commune sans production spécifique : les deux ODD calculés sont « non renseignés ».
- Un mois partiellement pesé : `ODD_11_6_1_A` est « non renseigné », comme `TAUX_COLLECTE`.
- Un jeu maîtrisé : les deux valeurs recalculées à la main par un témoin indépendant.
- Une déclaration ODD sans source ou sans date : refusée par la base.
- Le radar d'une commune n'expose aucune donnée d'une autre commune ; un indicateur « sans objet » ne fait pas baisser son axe.

## 4. Complément du 4 novembre (soir)

- **Le § 0bis et le § 9 de la spécification G sont validés** ; la spécification passe en v1.2 (les réponses sont au § 9).
- **Quatre sources de recensement** : import TCL, **import open data**, recensement Kobo, saisie manuelle. Une entrée open data est marquée `source_creation = 'open_data'` et `identifiant_statut = 'a_completer'` tant que le matricule manque ; **forfait possible, réel refusé** tant que l'identifiant manque. La licence de chaque fichier importé est enregistrée ; Google Maps sert à vérifier à l'écran, pas à un import en masse (ses conditions d'utilisation l'interdisent).
- **Export ADEP / INSAF** : CSV documenté, sans attendre le format du receveur.
- **Ordre de travail** : 1. lot « Indicateurs ODD et radar » (§ 3), indépendant de G ; 2. G1 ; 3. G2 à G7 ; 4. R1 quand le serveur est prêt. Le jalon F reste en pause ; WaCT et WABI restent reportés.
- **Livraison** : chaque lot passe par une PR présentée à Nacer avant la fusion.
