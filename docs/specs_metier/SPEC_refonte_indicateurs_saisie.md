# SIIPI — Refonte des indicateurs et de la saisie
## Indicateurs visualisés, retrait du Concours, entrée unique « Ajouter », caractérisation des déchets

**FNCT · 9 octobre 2026 · statut : spécification, rien n'est codé**
Ce chantier passe **avant la couche WaPla** (`SPEC_wapla_couche_planification.md`), qui lira la caractérisation créée ici.

---

## 0. Décisions actées (Nacer, 9 octobre 2026)

| # | Décision |
|---|---|
| D1 | **Le mot « Concours » et tout ce qui s'y rattache disparaissent de SIIPI** : barème, points, note sur 100, redistribution des points, classement, grille par modules M1/M2/M3. SIIPI se concentre sur les **indicateurs**. |
| D2 | Les indicateurs se lisent sur des **graphiques interactifs**. Un indicateur qui ne se calcule pas s'ouvre au clic sur **ce qui lui manque**, avec de quoi le compléter sur place. |
| D3 | **Une valeur déclarée par la commune suffit.** Plus de validation par la FNCT : la valeur porte le badge « déclaré », la FNCT peut la commenter mais ne la bloque pas. |
| D4 | **Une seule entrée « Ajouter »** pour toute donnée qu'un directeur de la propreté peut verser dans SIIPI. |
| D5 | **Le projet associatif est un projet** comme les autres, avec un **porteur** (commune, association, autre). |
| D6 | **La caractérisation des déchets est une donnée de SIIPI**, personnalisable par la commune. La moyenne nationale de l'ANGeD sert de valeur de repli. |

Les cinq règles d'or de `CLAUDE.md` restent entières. La règle 1.1 (« une donnée manquante n'est pas un zéro ») est même au cœur du lot 3 : compléter un indicateur, c'est fournir **la donnée** qui manque, jamais taper le résultat.

---

## 1. Lot 1 — Retrait du Concours

### 1.1 L'état actuel (relevé dans le dépôt le 9 octobre 2026)

« Concours » apparaît **192 fois dans 19 fichiers** :
- **Base** : migrations 050, 055 et 063. Elles contiennent la famille `concours` de `indicateurs_kpi`, la colonne `points` et ses contraintes, et le circuit de validation de la fiche d'évaluation dans `evaluations_kpi`. Les colonnes de redistribution des points (`a_abattoir`, `decharge_controlee_anged`, `experience_innovante`) en font partie.
- **API** : `app.ts`, `openapi/document.ts`, `kpi5Axes.routes.ts` (dont `/kpi/concours-national`), `services/kpi5Axes.ts`, `jeuxExport.ts`.
- **Écrans** : `IndicateursCommune.tsx`, `FicheEvaluation.tsx`, `KpiNational.tsx`, `TableauDeBordNational.tsx`, les deux fichiers de traduction, `api.ts`, `api-types.ts`.
- **Tests** : `kpi-5-axes.sh`, `simulation-3mois.sh`.
- **Documents** : `FEUILLE_DE_ROUTE.md`, et la note WaPla.

### 1.2 Ce qui part, ce qui reste

| Part | Reste |
|---|---|
| Colonne `points` et sa contrainte ; famille `concours` | Les **19 indicateurs eux-mêmes** (balayage, couverture des circuits, réclamations, bâchage…), rangés par **axe** (1 à 5) |
| Regroupement par modules M1, M2, M3 à l'écran | L'identifiant interne de chaque indicateur (`M1-1`…), **jamais affiché**. Le renommer casserait les valeurs déjà liées sans rien apporter |
| Note sur 100, base « 14/19 indicateurs, 72 % des points », seuil de classement, classement officiel et provisoire | Une **couverture** neutre : « 14 indicateurs calculables sur 19 » |
| Redistribution des points (ANGeD, innovation, abattoirs) | Le **profil de la commune** (abattoir oui/non, décharge contrôlée par l'ANGeD oui/non). Il sert seulement à dire qu'un indicateur est **sans objet** pour la commune, pas à déplacer des points |
| Circuit brouillon → soumise → validée, verrouillage, réouverture | La **valeur déclarée**, avec qui l'a saisie et quand (D3) |
| Route `/kpi/concours-national`, exports et clés de traduction du Concours | `/kpi/national` (agrégats), réécrit au lot 4 |

### 1.3 La migration (rien de réel ne se perd)

1. **Nouvelle table `declarations_indicateurs`** : commune, indicateur, **période** (année ou mois), valeur, cible, commentaire, `saisi_par`, `saisi_le`. Une seule déclaration en vigueur par commune, indicateur et période ; une correction **remplace** la précédente, qui reste au journal d'audit (règle 1.4).
2. **Recopie** des `valeurs_kpi` existantes vers cette table, avec l'année de leur fiche comme période.
3. **Le profil de la commune** (abattoir, décharge ANGeD) passe dans `parametres_commune`.
4. **Retrait** de `evaluations_kpi` et de `valeurs_kpi`, de la colonne `points` et de la famille `concours`, remplacée par `indicateur`. Toutes les notes et tous les classements étaient des données de test : il n'y a rien de réel à archiver.

**Une exception à vérifier avant d'exécuter** : si une commune réelle a déjà rempli une fiche, ses valeurs sont recopiées à l'étape 2. Seuls la note et le statut de validation disparaissent, et ils ne correspondent plus à aucune règle.

### 1.4 L'historique

**Proposition par défaut** : le `CHANGELOG.md` et les anciennes entrées datées de la feuille de route restent tels quels, car ils racontent ce qui a été fait. Partout ailleurs, le mot disparaît : code, base, API, écrans, traductions, exports, tests, spécifications en vigueur.

### 1.5 Test de sortie

- `grep -ri concours` sur `backend/src`, `backend/migrations` (hors anciennes migrations rejouées), `backend/tests`, `web/src` et `docs/specs_metier` ne renvoie **rien**. La seule exception est la migration de retrait, qui doit nommer ce qu'elle retire.
- Les 19 indicateurs se calculent comme avant : mêmes valeurs sur le jeu maîtrisé de la campagne `kpi-5-axes`, désormais sans note.
- Une valeur déclarée s'affiche **tout de suite**, avec le badge « déclaré » et sans attendre la FNCT.
- Un abattoir absent rend M2-5 « sans objet », pas « non renseigné ».

---

## 2. Lot 2 — Entrée unique « Ajouter » et nouvelles données de référence

### 2.1 Le constat

Aujourd'hui, chaque donnée s'ajoute depuis son propre écran : personnel, parc, circuits, points, projets, rapports, registres. Un directeur doit savoir *où* aller avant de savoir *quoi* faire. Les essais l'ont montré : ce n'est pas clair pour un utilisateur ordinaire.

### 2.2 Le principe : un formulaire par objet, une seule porte

- **Un registre de formulaires** (`web/src/composants/ajout/`) : un composant par type d'objet, **le même partout**. Le bouton « Ajouter un engin » de l'écran Parc, le catalogue « + Ajouter » et le panneau « ce qui manque » d'un indicateur (lot 3) ouvrent **le même formulaire**. Rien n'est dupliqué : un champ ajouté l'est partout.
- **Un bouton « + Ajouter » toujours visible** dans l'en-tête du portail. Sur téléphone, c'est un bouton flottant, à droite en français et à gauche en arabe.
- **Le catalogue**, rangé par ce que pense le directeur plutôt que par la structure de la base :

| Rubrique | Objets |
|---|---|
| **Mon équipe** | Agent |
| **Mes moyens** | Engin, conteneur |
| **Mon territoire** | Circuit (avec son fichier GPX/KML/GeoJSON), point de collecte, lieu (marché, cimetière, abattoir…), secteur |
| **Mes références** | PCGD, caractérisation des déchets, étude ou rapport |
| **Mes actions** | Projet (porteur : commune, association, autre), campagne de nettoyage, action planifiée |
| **Registres du jour** | Pesée, plein de carburant, fin de poste, carnet de bord, incident, dotation EPI |
| **Mes partenaires** | Contact, commerce et convention de propreté, prestataire |
| **Import en masse** | CSV (contacts, parc, points), fichiers géographiques — les imports existants, rangés ici |

- **Les formulaires longs se font en étapes.** Un circuit, par exemple, se crée en trois temps : identité, fichier géographique, puis jours, équipe et engin. Chaque étape s'enregistre : on peut s'arrêter et reprendre.
- **Chaque formulaire dit ce que la donnée débloque**, par exemple : « Ce registre de carburant permet de calculer le coût de collecte à la tonne. » Ce lien est lu dans le catalogue des indicateurs (§ 3.2), pas écrit à la main dans chaque formulaire.
- **Les rôles** filtrent le catalogue : un prestataire ne voit que ce qu'il a le droit d'ajouter.

### 2.3 Trois données nouvelles

**a) Le porteur d'un projet (D5).** Un champ `porteur` (commune, association, autre) et le nom du porteur s'ajoutent à la table des projets existante. Un projet associatif n'est qu'un projet dont le porteur est une association. Il peut alimenter l'indicateur des partenariats (M1-10) comme donnée **mesurée** plutôt que déclarée, à condition que la règle de calcul soit validée.

**b) Le PCGD.** Une table `pcgd` : commune, année d'adoption, horizon, bureau d'études, statut (en préparation, adopté, en révision), document lié dans « Rapports et études ». Le PCGD devient une donnée, plus seulement un fichier déposé.

**c) La caractérisation des déchets (D6).**

| Élément | Règle |
|---|---|
| Table `caracterisations` | Commune (vide pour la moyenne nationale), **niveau de source**, année, méthode et saison si connues, document source lié |
| Niveaux de source | `moyenne_nationale_anged` (FNCT seule) · `etude_anged_commune` · `pcgd` · `autre_etude` (commune) |
| Fractions (`fractions_caracterisation`) | Une ligne par fraction, en %. **Nomenclature à aligner sur celle des études ANGeD**, à fournir par la FNCT. Provisoirement : organiques, papier-carton, plastiques, verre, métaux, textiles, fines et autres |
| Garde en base | Somme des fractions = 100 % à ±1 près, sinon refusé. Fraction négative : refusé |
| Valeur retenue (`app.caracterisation_retenue(commune, date)`) | La source **la plus précise**, puis la plus récente : étude ANGeD de la commune, puis PCGD, puis autre étude, puis moyenne nationale. Elle est toujours rendue **avec son origine et son année** |
| Affichage | « Composition retenue : PCGD 2026 », ou « Moyenne nationale ANGeD 2022 — aucune étude propre à la commune » |
| Qui lira cette donnée | La couche WaPla (en lecture), la projection DMA (15.2), et la fiche de la commune |

### 2.4 La complétude de la commune

Un écran « **Ma commune dans SIIPI** » liste les données de référence qui font de SIIPI la référence de la commune : population, périmètre, secteurs, circuits, parc, personnel, PCGD, caractérisation, contacts, registres tenus ce mois-ci. Chaque ligne est « présente » ou « à ajouter », avec un lien vers son formulaire et **la liste des indicateurs qu'elle débloque**.

**Ce n'est pas une note.** Il n'y a ni pourcentage global, ni comparaison entre communes : c'est une liste de choses à faire. Une note de complétude recréerait le Concours par une autre porte.

### 2.5 Test de sortie

- Le même formulaire, ouvert depuis le catalogue, depuis l'écran Parc et depuis un indicateur, enregistre la même ligne avec les mêmes contrôles. Un test vérifie qu'il n'existe qu'**un** composant par type d'objet.
- Une caractérisation à 97 % ou à 104 % est refusée.
- Une commune sans étude reçoit la moyenne nationale, étiquetée comme telle. Après ajout de son PCGD, `caracterisation_retenue` rend le PCGD.
- Une commune ne peut pas saisir une moyenne nationale.
- Recette : un directeur qui n'a jamais vu SIIPI ajoute un engin, un agent et un circuit **sans aide**, en français puis en arabe, et sur téléphone.

---

## 3. Lot 3 — Indicateurs visualisés et « ce qui manque »

### 3.1 Les séries dans le temps

`app.mesures_kpi(p_annee)` ne rend aujourd'hui qu'une valeur par an. Un graphique a besoin d'une **série**.

- **`app.serie_indicateur(commune, code, debut, fin, pas)`**, avec un pas mensuel ou annuel. Elle rend une ligne par période qui a une valeur, et **aucune ligne** pour une période sans donnée (règle 1.1). Un mois sans donnée est un **trou** dans la courbe, jamais un point à zéro.
- Les indicateurs **calculés** à partir de registres datés (pesées, réclamations, contrôles, carburant, fins de poste, nettoyages, maintenance) ont une série **mensuelle**.
- Les indicateurs **déclarés** ont la granularité de leur déclaration : annuelle par défaut, mensuelle si la commune déclare par mois.
- Chaque point de la série porte sa **source** (mesuré ou déclaré) : une courbe peut passer de déclaré à mesuré le jour où un registre commence à être tenu.

### 3.2 Ce qui manque à un indicateur

C'est la pièce qui rend possible « je clique et je complète ».

- **Le catalogue des indicateurs décrit les dépendances de chacun** : par exemple, « coût global à la tonne » dépend des pesées du mois, de la masse salariale, du registre carburant, de la maintenance et de la redevance ANGeD. Ces dépendances sont une **donnée** du catalogue, pas du code dispersé dans les écrans.
- **`app.manques_indicateur(commune, code, periode)`** rend, pour un indicateur non calculable, la liste de ce qui manque. Pour chaque élément : le libellé, le type de donnée, et **le formulaire à ouvrir**. Exemples :
  - « Population 2026 » → Paramètres de la commune ;
  - « Aucun plein de carburant en mars » → Registre carburant ;
  - « Objectif de balayage non fixé » → Paramètres.
- **Indicateur calculé** : on complète les **données sources**, jamais le résultat. Il n'existe pas de case « coût à la tonne » à remplir.
- **Indicateur déclaré** : le formulaire est la déclaration elle-même (valeur, cible si c'est un ratio, commentaire), avec le badge « déclaré ».

### 3.3 L'écran Indicateurs de la commune

**Vue d'ensemble.** Les cinq axes, et dans chacun une **carte par indicateur** avec :
- la valeur de la période et son unité ;
- une petite courbe sur 12 mois ;
- le badge de source (« mesuré », « déclaré », « non renseigné », « sans objet ») écrit en toutes lettres, pas seulement en couleur ;
- l'écart à l'objectif quand la commune en a fixé un.

**Au clic, un panneau à côté de la vue** (le même principe que le panneau de circuit sur la carte) :
- **un graphique interactif** : valeur exacte au survol, période réglable (3 mois, 6 mois, 12 mois, année), comparaison avec l'année précédente, et **repère de la moyenne du gouvernorat** quand au moins cinq communes y ont une valeur, sans nommer aucune commune ;
- **les données sous le graphique**, en tableau, exportables avec le service d'export existant ;
- **la formule et les sources**, en français et en arabe.

**Au clic sur un indicateur « non renseigné »**, le panneau s'ouvre sur « **Pour calculer cet indicateur, il manque :** », avec la liste de § 3.2 et chaque formulaire ouvrable sur place. Une fois la donnée enregistrée, l'indicateur se recalcule et **le graphique apparaît dans le même panneau**, sans rechargement.

**Bibliothèque de graphiques** : le portail n'en a aucune aujourd'hui. Proposition : **Recharts** (React, légère). En arabe, les libellés sont en arabe mais le temps reste orienté de gauche à droite, comme sur la plupart des tableaux de bord arabophones. C'est à confirmer en recette. Chaque graphique a un équivalent en tableau, pour l'accessibilité et l'impression.

### 3.4 Test de sortie

- Un mois sans pesée laisse un **trou** dans la courbe du tonnage, pas un zéro (vérifié sur les données renvoyées, pas sur le dessin).
- Pour « coût global à la tonne » sans registre carburant, `manques_indicateur` rend exactement « registre carburant ». Après saisie d'un plein, l'indicateur se calcule et le manque disparaît.
- Pour un indicateur calculé, l'API refuse une déclaration directe de sa valeur (400).
- Le repère du gouvernorat est absent quand moins de cinq communes ont une valeur.
- Recette : au clic sur un indicateur « non renseigné », un directeur le rend calculable **sans quitter l'écran**.

---

## 4. Lot 4 — Tableau de bord national

Mêmes composants que le lot 3, au niveau de la FNCT :

- **Suivi du déploiement**, en tête comme demandé : communes actives par mois, communes qui saisissent et communes inactives, par gouvernorat et par district.
- **Indicateurs par gouvernorat et par district** : carte et graphique de répartition. La FNCT, qui a un accès complet, voit le détail par commune dans un tableau triable. **Aucun classement publié**, aucun palmarès.
- **Réel et estimé distingués** partout : un tonnage estimé ne s'additionne jamais à un tonnage pesé.
- La commune de démonstration (`est_demo`) est absente de tout agrégat.

**Test de sortie** : la commune de démonstration est absente ; un agrégat de gouvernorat donne le nombre de communes qu'il couvre (« 12 communes sur 31 ») ; aucune route ne rend un rang.

---

## 5. Ordre des lots

| Ordre | Lot | Pourquoi à cette place |
|---|---|---|
| 1 | **Retrait du Concours** | On retire avant de construire : les graphiques ne doivent pas hériter du barème |
| 2 | **Registre de formulaires, « + Ajouter », porteur, PCGD, caractérisation** | Le lot 3 réutilise ces formulaires pour « ce qui manque » ; WaPla a besoin de la caractérisation |
| 3 | **Indicateurs visualisés et manques** | Il s'appuie sur les deux premiers |
| 4 | **Tableau de bord national** | Mêmes composants, à l'échelle nationale |
| 5 | **Complétude de la commune** (§ 2.4) | Elle lit les dépendances du catalogue (§ 3.2) |
| ensuite | **Couche WaPla** | Elle lit la caractérisation et la population retenue |

Chaque lot suit le protocole de `CLAUDE.md` : une migration, une campagne qui commence par ce que la base refuse, `verifier:contrat` et toutes les campagnes au vert, et un commit par correctif.

---

## 6. Points ouverts (avec valeur par défaut)

| Sujet | Valeur par défaut | Décideur |
|---|---|---|
| `CHANGELOG.md` et anciennes entrées de la feuille de route | Conservés comme historique | Nacer |
| Nomenclature des fractions de caractérisation | Celle des études ANGeD, à fournir ; d'ici là, la liste provisoire du § 2.3 | FNCT |
| Moyenne nationale ANGeD (valeurs et année) | Saisie par la FNCT dès réception | FNCT |
| Sens du temps sur les graphiques en arabe | De gauche à droite, à confirmer en recette | Nacer |
| Bibliothèque de graphiques | Recharts | Nacer |
| Seuil d'affichage du repère de gouvernorat | 5 communes | FNCT |
| M1-10 (partenariats) mesuré par les projets portés par une association | Oui, si la règle de calcul est validée | FNCT |
