# W0 — Validation du moteur WaPla réimplémenté contre les vecteurs de référence UNIDO

> **Statut, 20/10/2026.** **W0 acté le 20/10/2026 : validation par lecture croisée**, pas un rejeu contre une exécution de l'outil UNIDO. Le moteur a été écrit d'après une lecture de `server.r` ; un second port, en Python et indépendant du code de l'application (`backend/tests/wapla_attendus.py`), a été écrit d'après la même lecture ; les deux concordent sur 213 jeux (campagne `wapla-moteur`). C'est moins fort qu'un rejeu contre exécution, et c'est assumé : aucun vecteur officiel n'existe en accès libre (ni dans l'archive de l'outil, ni dans ses manuels, ni sur les pages de TU Wien), et aucune démarche n'est engagée pour en obtenir. Le jour où des vecteurs officiels apparaissent, ils entrent dans la campagne `wapla-moteur` et W0 repasse en « validé contre exécution ». Cette fiche reste le format d'entrée de ces vecteurs, le jour venu.

**Décision du 20/10/2026.** WaPla n'est pas un service externe : les méthodes de calcul de l'outil UNIDO ont
été extraites et réimplémentées dans SIIPI (`backend/src/wapla/moteur.ts`, couche `wapla.*`). W0 vérifie que
ce moteur produit **les mêmes résultats que l'outil d'origine** sur des vecteurs de référence. Il n'y a rien à
lancer ni à connecter : ni application WaPla, ni URL locale. W0 ne dépend pas des normales climatiques : un
vecteur porte ses propres entrées, climat compris.

**Où en sont les vecteurs.** Les valeurs de l'annexe (`wapla-moteur-reference.md` § 8) viennent d'un port
Python écrit à partir d'une **lecture** de `server.r`, pas d'une exécution de l'outil. Les deux manuels de
l'UNIDO (versions 1 et 2) ne publient aucun résultat chiffré pour un jeu d'entrées connu, et l'archive de
l'outil ne contient aucun projet d'exemple enregistré. Les vecteurs de référence restent donc à fournir.

## 1. Ce qu'il faut pour le rejeu

Un **vecteur** est un jeu d'entrées complet et les sorties que l'outil UNIDO d'origine a calculées pour lui.

### 1.1 Provenance (une ligne par vecteur)

| Champ | Exemple |
|---|---|
| `vecteur` | identifiant court (`V1`, `trinidad`…) |
| `source` | document UNIDO ou TU Wien (titre, page), ou exécution de l'outil (version et build, par exemple « WaPla 2, build 20220826 »), et par qui |
| `date` | date du calcul ou de la publication |
| `precision` | `exacte` (valeurs non arrondies) ou `affichee` (valeurs telles que l'outil les montre, avec leur arrondi) |

### 1.2 Entrées

Toutes les entrées du calcul, sous leur nom dans l'outil (`ui.r`) : `waste_in`, les trois procédés optionnels
(centre de tri, compostage, incinération : actif ou non), `tc_*`, `pop_*`, `ghg_*`, `APY`, `ATY` et, si des
coûts sont donnés en sortie, `cost_*`. Une entrée absente est lue comme **la valeur par défaut de l'outil** —
la version de l'outil doit alors être dite, car les valeurs par défaut en dépendent.

Fichier `W0_vecteurs_entrees.csv` (séparateur `;`) : `vecteur;cle;valeur`.

### 1.3 Sorties à comparer

| Tableau | Lignes | Unité |
|---|---|---|
| Flux de masse | code du flux (`W1`, `D1`, `LS1`…) | t/an |
| Gaz à effet de serre | par procédé (collecte, décharge, dépotoir, brûlage, feux, recyclage, compostage, incinération) et total | t CO₂-éq/an |
| uPOPs | par procédé et milieu (air, sol ou résidus, eau, produits) | mg TEQ/an |
| Coûts (s'ils sont donnés) | par procédé et total | devise/an |

Fichier `W0_vecteurs_sorties.csv` (séparateur `;`) : `vecteur;tableau;ligne;valeur;unite`. Une sortie que le
vecteur ne donne pas n'est pas comparée ; une sortie donnée et nulle est comparée à zéro.

**Formes acceptées aussi** : les tableaux téléchargés depuis l'outil (« Download table », CSV) avec le fichier
de projet enregistré (`.RData`) qui porte les entrées ; ou un tableau d'un document de l'UNIDO, cité avec sa
page.

### 1.4 La comparaison

- Le moteur tourne en **mode fidèle** (défauts de l'outil compris) sur chaque vecteur.
- Valeurs exactes : écart relatif au plus 10⁻⁶. Valeurs affichées : le moteur est arrondi comme l'outil
  (trois chiffres significatifs pour les flux, deux pour les GES et les uPOPs ; total des GES = somme des
  valeurs arrondies, arrondie à nouveau, feux compris), puis comparé à l'identique.
- Tout écart est consigné tel quel (vecteur, ligne, attendu, obtenu). Il désigne soit une lecture fautive du
  code — le moteur fidèle et le témoin `backend/tests/wapla_attendus.py` sont alors corrigés ensemble —, soit
  un arrondi d'affichage, qui se vérifie sur la valeur exacte. Rien n'est ajusté pour faire coïncider.
- Les vecteurs confirmés entrent dans une campagne (`wapla-moteur`), avec leur source.

## 2. Les sorties du moteur sur les vecteurs de l'annexe

Ce que le moteur rend aujourd'hui, en mode fidèle, sur les deux jeux de l'annexe — arrondi comme l'outil
l'affiche. Si un vecteur de référence porte les mêmes entrées, ses sorties se comparent directement à ces
tableaux ; les valeurs exactes, à six décimales, sont dans `W0_valeurs_attendues.csv`.

### Jeu A — les valeurs par défaut de l'outil

Les valeurs par défaut de WaPla 2 (`ui.r`), reprises dans le moteur (`DEFAUTS_WAPLA`) :
déchets produits 1 000 t/an (*Waste generated*), les trois procédés optionnels cochés, aucun déchet vers le
centre de tri, le compostage ni l'incinération (`tc_4 = tc_5 = tc_22 = 0`), précipitations et température
vides (pas de classe climatique), aucun coût. 

#### Flux (t/an, trois chiffres significatifs)

| Ligne | Moteur SIIPI (arrondi de l'outil) | Vecteur de référence |
|---|---:|---:|
| WoB | 200 | |
| BR3 | 40 | |
| D2 | 200 | |
| CR | 0 | |
| W1 | 460 | |
| W3 | 400 | |
| WR | 0 | |
| RDF | 0 | |
| Re1 | 0 | |
| Re2 | 4,6 | |
| CMP | 0 | |
| Org | 0 | |
| LGE1 | 102 | |
| LGE2 | 49,6 | |
| OBE | 160 | |
| CE | 0 | |
| WC | 0 | |
| MR | 0 | |
| D1 | 460 | |
| W2 | 140 | |
| Re3 | 0 | |
| OFG | 0 | |
| IRes | 0 | |
| ReT | 147 | |
| LS1 | 238 | |
| LS2 | 92 | |
| WI | 0 | |
| WG | 1000 | |
| WB1 | 115 | |
| WB2 | 96 | |
| EFLD | 148 | |
| BR1 | 34,5 | |
| BR2 | 28,8 | |
| Re4 | 2,4 | |
| CU | 0 | |
| LW | 0 | |

#### Gaz à effet de serre (t CO₂-éq/an, deux chiffres significatifs, lignes nulles retirées)

Le total tel que l'outil l'affiche est la somme des valeurs **déjà arrondies**, arrondie à nouveau, feux compris
(`wapla-moteur-reference.md` § 4.3). Le total exact, feux compris, vaut 699,3 t ; sans les feux (ce que
calcule `TAGHG`, jamais affiché), 662,4 t.

| Ligne | Moteur SIIPI (arrondi de l'outil) | Vecteur de référence |
|---|---:|---:|
| Waste Collection | 2,6 | |
| Landfill | 600 | |
| Informal Dumping | 140 | |
| Open Burning | 35 | |
| Fires at LF/Dumpsites | 37 | |
| Recycling | -120 | |
| Total annual GHG emissions | 690 | |

#### uPOPs (mg TEQ/an, deux chiffres significatifs, lignes nulles retirées)

| Ligne | Moteur SIIPI (arrondi de l'outil) | Vecteur de référence |
|---|---:|---:|
| Open Burning -> Air | 8 | |
| Open Burning -> Land / residues | 0,2 | |
| Fires at LF/Dumpsites -> Air | 63 | |
| Fires at LF/Dumpsites -> Land / residues | 2,1 | |
| Landfill -> Water | 0,023 | |
| Landfill -> Residues | 2,3 | |
| Informal Dumping -> Water | 0,01 | |
| Informal Dumping -> Residues | 1 | |

### Jeu B — trois procédés, un climat, du biogaz capté

Le jeu A, à six entrées près :

| Entrée (nom dans l'outil) | Écran de l'outil | Valeur |
|---|---|---|
| Average precipitation [mm/yr] (`APY`) | panneau de gauche | 350 |
| Average temperature [C] (`ATY`) | panneau de gauche | 19 |
| Waste collected → Waste to composting (`tc_4`) | Inputs → System definitions → Waste collection | 0,1 |
| Waste collected → Waste to materials recovery facility (`tc_5`) | idem | 0,1 |
| Waste collected → Waste to incineration (`tc_22`) | idem | 0,1 |
| Share of landfill gas collected [%] (`ghg_19`) | Inputs → Greenhouse gas emissions → Engineered/Sanitary landfill | 30 |

Classe climatique attendue : **cl_3** (10 < ATY ≤ 20, APY ≤ 400) ; part de carbone dégradable 0,5 en
décharge, 0,525 au dépotoir. 

#### Flux

| Ligne | Moteur SIIPI (arrondi de l'outil) | Vecteur de référence |
|---|---:|---:|
| WoB | 200 | |
| BR3 | 40 | |
| D2 | 200 | |
| CR | 8,69 | |
| W1 | 460 | |
| W3 | 400 | |
| WR | 46 | |
| RDF | 9,2 | |
| Re1 | 2,3 | |
| Re2 | 3,6 | |
| CMP | 9,31 | |
| Org | 16,1 | |
| LGE1 | 79,9 | |
| LGE2 | 49,6 | |
| OBE | 160 | |
| CE | 44,1 | |
| WC | 46 | |
| MR | 18,4 | |
| D1 | 322 | |
| W2 | 140 | |
| Re3 | 0 | |
| OFG | 44,2 | |
| IRes | 11 | |
| ReT | 148 | |
| LS1 | 187 | |
| LS2 | 92 | |
| WI | 46 | |
| WG | 1000 | |
| WB1 | 90 | |
| WB2 | 96 | |
| EFLD | 130 | |
| BR1 | 27 | |
| BR2 | 28,8 | |
| Re4 | 2,4 | |
| CU | 0 | |
| LW | 0 | |

#### Gaz à effet de serre

| Ligne | Moteur SIIPI (arrondi de l'outil) | Vecteur de référence |
|---|---:|---:|
| Waste Collection | 2,6 | |
| Landfill | 230 | |
| Informal Dumping | 110 | |
| Open Burning | 35 | |
| Fires at LF/Dumpsites | 33 | |
| Recycling | -130 | |
| Composting | 3,5 | |
| Incineration | 14 | |
| Total annual GHG emissions | 300 | |

#### uPOPs

| Ligne | Moteur SIIPI (arrondi de l'outil) | Vecteur de référence |
|---|---:|---:|
| Open Burning -> Air | 8 | |
| Open Burning -> Land / residues | 0,2 | |
| Fires at LF/Dumpsites -> Air | 56 | |
| Fires at LF/Dumpsites -> Land / residues | 1,9 | |
| Landfill -> Water | 0,018 | |
| Landfill -> Residues | 1,8 | |
| Informal Dumping -> Water | 0,01 | |
| Informal Dumping -> Residues | 1 | |
| Incineration -> Air | 190 | |
| Incineration -> Residues | 4,1 | |
| Composting -> Products | 0,17 | |

## 3. Le climat (hors W0)

Le moteur n'attend que deux grandeurs climatiques : les précipitations annuelles (`APY`, mm) et la température
moyenne annuelle (`ATY`, °C). Dans SIIPI, elles viennent de la référence par gouvernorat, saisie par la FNCT à
partir des normales OMM 1991-2020 de la NOAA (stationnaires, ou estimées depuis la station la plus proche), que
la commune peut surcharger (décision du
20/10/2026, `DECISIONS_2026-10-16.md`, amendement). La classe climatique de l'outil en découle ; elle a un trou
(ATY > 20 °C avec APY = 400 mm exactement, l'outil d'origine plante, `wapla-moteur-reference.md` § 4.2,
défaut 6) que le mode corrigé ferme.
