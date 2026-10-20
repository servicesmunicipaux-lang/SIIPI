# W0 — Rejeu des vecteurs de référence dans l'outil WaPla d'origine

**Objet.** Le moteur de SIIPI (`backend/src/wapla/moteur.ts`, mode fidèle) a été écrit à partir d'une
**lecture** du code de WaPla (`server.r`), et ses vecteurs de référence viennent d'un port Python, pas d'une
exécution de WaPla (`wapla-moteur-reference.md` § 8). W0 confirme ces vecteurs en les rejouant **dans
l'application d'origine** (SPEC_wapla_couche_planification.md § 7 et § 8, test de sortie : « les deux jeux
saisis dans WaPla redonnent les vecteurs »).

**Ce que les manuels ne donnent pas.** Les deux manuels de l'UNIDO (versions 1 et 2) ne publient aucun
résultat chiffré pour un jeu d'entrées connu : leurs résultats sont des captures d'écran. La confirmation
passe donc par le rejeu.

## 1. Lancer l'outil

- Archive : `UNDIO_WaPla_Tool.zip` (UNIDO), dossier `Version 2/WaPla_2_20220826_1500.zip`.
- Décompresser `WaPla_2`, puis lancer **`WaPla_msw.exe`** (l'application « MSW », déchets municipaux ; pas
  `WaPla_pop.exe`). L'application est une application R Shiny : elle s'ouvre **dans le navigateur**, sur une
  adresse locale (`http://127.0.0.1:<port>`).
- Au premier lancement, le lanceur installe les paquets R manquants depuis le CRAN (`app/config.cfg`) : il
  faut une connexion à Internet.
- Le rejeu peut se faire dans ce navigateur, à la main, ou dans le navigateur intégré de Claude Code, sur la
  même adresse locale.

## 2. Jeu A — les valeurs par défaut

**Aucune entrée à modifier.** Les valeurs par défaut de WaPla 2 sont celles du moteur (`DEFAUTS_WAPLA`) :
déchets produits 1 000 t/an (*Waste generated*), les trois procédés optionnels cochés, aucun déchet vers le
centre de tri, le compostage ni l'incinération (`tc_4 = tc_5 = tc_22 = 0`), précipitations et température
vides (pas de classe climatique), aucun coût. Appuyer sur **Calculate**.

### Flux (onglet Summary, second tableau : les flux de masse ; WaPla arrondit à trois chiffres significatifs)

| Ligne | Attendu (affiché) | Relevé dans WaPla |
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

### Gaz à effet de serre (Results → Greenhouse Gas Emissions, tableau sous le graphique ; deux chiffres significatifs, lignes nulles retirées)

Le total affiché par WaPla est la somme des valeurs **déjà arrondies**, arrondie à nouveau, feux compris
(`wapla-moteur-reference.md` § 4.3). Le total exact, feux compris, vaut 699,3 t ; sans les feux (ce que
calcule `TAGHG`, jamais affiché), 662,4 t.

| Ligne | Attendu (affiché) | Relevé dans WaPla |
|---|---:|---:|
| Waste Collection | 2,6 | |
| Landfill | 600 | |
| Informal Dumping | 140 | |
| Open Burning | 35 | |
| Fires at LF/Dumpsites | 37 | |
| Recycling | -120 | |
| Total annual GHG emissions | 690 | |

### uPOPs (Results → uPOP emissions, tableau sous le graphique ; deux chiffres significatifs, lignes nulles retirées)

| Ligne | Attendu (affiché) | Relevé dans WaPla |
|---|---:|---:|
| Open Burning -> Air | 8 | |
| Open Burning -> Land / residues | 0,2 | |
| Fires at LF/Dumpsites -> Air | 63 | |
| Fires at LF/Dumpsites -> Land / residues | 2,1 | |
| Landfill -> Water | 0,023 | |
| Landfill -> Residues | 2,3 | |
| Informal Dumping -> Water | 0,01 | |
| Informal Dumping -> Residues | 1 | |

## 3. Jeu B — trois procédés, un climat, du biogaz capté

Partir du jeu A et modifier **six entrées** :

| Entrée WaPla | Où | Valeur |
|---|---|---|
| Average precipitation [mm/yr] (`APY`) | panneau de gauche | 350 |
| Average temperature [C] (`ATY`) | panneau de gauche | 19 |
| Waste collected → Waste to composting (`tc_4`) | Inputs → System definitions → Waste collection | 0,1 |
| Waste collected → Waste to materials recovery facility (`tc_5`) | idem | 0,1 |
| Waste collected → Waste to incineration (`tc_22`) | idem | 0,1 |
| Share of landfill gas collected [%] (`ghg_19`) | Inputs → Greenhouse gas emissions → Engineered/Sanitary landfill | 30 |

Classe climatique attendue : **cl_3** (10 < ATY ≤ 20, APY ≤ 400) ; part de carbone dégradable 0,5 en
décharge, 0,525 au dépotoir. Appuyer sur **Calculate**.

### Flux

| Ligne | Attendu (affiché) | Relevé dans WaPla |
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

### Gaz à effet de serre

| Ligne | Attendu (affiché) | Relevé dans WaPla |
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

### uPOPs

| Ligne | Attendu (affiché) | Relevé dans WaPla |
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

## 4. Ce que dit le résultat

- **Toutes les valeurs concordent** : les vecteurs sont confirmés par une exécution de WaPla. On l'écrit
  dans `wapla-moteur-reference.md` § 8 (« confirmé dans WaPla 2, build 20220826, le … »), et W0 est clos
  pour sa partie vecteurs.
- **Une valeur diffère** : l'écart est consigné tel quel (ligne, attendu, relevé). Il désigne soit une
  lecture fautive du code — le moteur fidèle et le témoin `backend/tests/wapla_attendus.py` sont alors
  corrigés ensemble, avec un nouveau jeu de vecteurs —, soit une différence d'arrondi d'affichage, qui se
  vérifie sur la valeur exacte (colonne `attendu_exact` de `W0_valeurs_attendues.csv`). Rien n'est ajusté
  pour faire coïncider.
- Les valeurs exactes, à six décimales, sont dans `W0_valeurs_attendues.csv` ; la colonne `releve_wapla` y
  reçoit les relevés.

## 5. Les normales climatiques de l'INM

La couche WaPla lit, pour chaque gouvernorat, deux grandeurs (`wapla.facteurs_reference`, migration 074) :

| Code | Grandeur WaPla | Unité | Bornes acceptées par la base |
|---|---|---|---|
| `precipitations_annuelles_mm` | APY, précipitations annuelles moyennes | mm/an | 0 à 3 000 |
| `temperature_moyenne_c` | ATY, température moyenne annuelle | °C | −10 à 40 |

Aujourd'hui la table est **vide** : l'amorce d'un bilan dit, pour chaque commune, « la FNCT n'a pas encore
saisi les normales climatiques du gouvernorat ». Le gabarit `W0_normales_inm.csv` liste les 24 gouvernorats
du référentiel ; pour chacun : les deux valeurs, la station de l'INM retenue, la période des normales
(par exemple 1991-2020) et la source citée. Une valeur sans source n'entre pas : la base la refuse.

**À surveiller.** La classe climatique de WaPla a un trou : ATY > 20 °C avec APY = 400 mm exactement ne
correspond à aucune classe, et l'outil d'origine plante (`wapla-moteur-reference.md` § 4.2, défaut 6). Le
mode corrigé de SIIPI ferme la borne ; une normale qui tomberait exactement sur 400 mm dans un gouvernorat
chaud se signale à la saisie.
