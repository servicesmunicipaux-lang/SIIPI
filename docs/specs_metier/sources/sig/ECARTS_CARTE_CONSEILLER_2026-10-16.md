# Carte du conseiller SIG — écarts avec le référentiel de SIIPI

*Comparaison du 16 octobre 2026, commune par commune (code municipal), entre le fichier `communes.js` de la carte
du conseiller SIG et le référentiel des communes de SIIPI (base principale, v0.15.42). Le détail ligne à ligne est
dans `ecarts_carte_conseiller_2026-10-16.csv`. SIIPI n'a rien modifié : ce document constate, il ne corrige pas
(règle d'or 1.5) ; ce qu'il faut retenir se décide avec le conseiller et la FNCT.*

## Ce qui concorde

- **Les 350 communes** sont les mêmes des deux côtés, avec les mêmes codes municipaux ; la décision D-FNCT-3 est
  appliquée dans les deux (Zarzouna absente, El Hchachna présente).
- **Les contours sont identiques** : l'aire de chaque contour du conseiller, recalculée sur la sphère, est celle du
  contour officiel de SIIPI à 2 % près pour 350 communes sur 350.
  SIIPI garde donc son tracé : la carte de SIIPI n'importe pas le fichier du conseiller.

## 1. La superficie de la carte du conseiller est fausse — à corriger chez le conseiller

La « Superficie » de chaque fiche est l'aire calculée **en projection Web Mercator (EPSG:3857)**, qui gonfle les
surfaces d'un facteur 1/cos²(latitude). Le rapport entre la superficie affichée et l'aire réelle du contour va de
**1.39** (au sud) à **1.58** (au nord), et suit ce facteur à 0.76 % près pour toutes les
communes. Les **densités** de la carte sont donc trop basses d'autant.

Exemple : Dar Chaâbane El Fehri — 105,99 km² et 441 hab./km² sur la carte du conseiller ; 68,31 km² sur le contour
officiel, soit 680 hab./km² avec la population de SIIPI.

À demander au conseiller : calculer les aires dans une projection équivalente (par exemple UTM 32N, EPSG:32632)
ou sur l'ellipsoïde (`$geodesic_area` dans QGIS, `ST_Area(geom::geography)` dans PostGIS).

## 2. Les gouvernorats sont orthographiés autrement (5 sur 24)

| Carte du conseiller | SIIPI |
|---|---|
| Beja | Béja |
| Gabes | Gabès |
| Kebili | Kébili |
| Kef | Le Kef |
| Mednine | Médenine |

Sans incidence pour SIIPI, qui garde sa graphie. À harmoniser si le fichier du conseiller doit un jour se joindre
aux données de SIIPI par le nom du gouvernorat (le découpage en districts, D-FNCT-2, s'appuie sur la graphie de SIIPI).

## 3. Les populations diffèrent — une source à trancher

- **256 communes sur 350** n'ont pas la même population.
- Total : **11 021 199** habitants sur la carte du conseiller, **12 221 221** dans SIIPI, où toutes les populations sont
  marquées « estimées » (`donnees_source = estime`).
- Ni l'une ni l'autre ne dit d'où elle vient (recensement de quelle année, projection de l'INS ?). **À trancher par
  la FNCT : quelle source fait foi, et de quelle année.** SIIPI affichera ensuite la population avec cette source.

Les dix plus grands écarts :

| Code | Commune | Carte du conseiller | SIIPI |
|---|---|---|---|
| 4211 | Kasserine (Ville) | 31 823 | 108 794 |
| 5111 | Gabès (Ville & Oasis Maritime) | 99 426 | 152 921 |
| 4311 | Sidi Bouzid (Ville) | 73 226 | 122 722 |
| 3111 | Sousse (Ville Médina & Corniche) | 174 592 | 221 530 |
| 3113 | Ezzouhour | 64 532 | 18 500 |
| 4212 | Sbeïtla | 36 388 | 75 245 |
| 2211 | Jendouba (Ville) | 74 421 | 113 116 |
| 5119 | Mareth | 30 410 | 63 122 |
| 3225 | Moknine | 57 111 | 89 277 |
| 4113 | Sbikha | 40 206 | 71 922 |

## 4. Les noms

- **Noms en français : 189 différences**, presque toutes de graphie (« EL kram » / « Le Kram », « Sidi Bou
  Said » / « Sidi Bou Saïd », « Tunis Ville » / « Tunis (Capitale) »). Voir le fichier CSV.
- **Noms en arabe : 44 différences.** La plupart sont des variantes (espaces, tirets, article). Certaines
  méritent une vérification, car les deux noms ne désignent pas la même chose :
  - **1517 Tazarka** : « تزغران » dans SIIPI — c'est le début du nom de Tazghrane (1536, « تزغران بوكريم ») —
    contre « تازركة » chez le conseiller. L'erreur est vraisemblablement dans SIIPI.
  - **3429 Ennadhour - Sidi Ali Belabed** : « بئر علي الشمالية » chez le conseiller, un autre lieu ; SIIPI a
    « الناظور سيدي علي بلعابد ».
  - **6318 / 6319** (Bechri-Jersine-El Blidet, Bechni-Fatnassa) : « بشلي » / « بشري » chez le conseiller,
    « بشري » / « بشني » dans SIIPI.

  **À vérifier par la FNCT avant toute correction dans SIIPI.**

| Code | Commune | Carte du conseiller | SIIPI |
|---|---|---|---|
| 1111 | Tunis (Capitale) | تونس العاصمة | بلدية تونس |
| 1116 | Sidi Bou Saïd | سيدي بوسعيد | سيدي بو سعيد |
| 1517 | Tazarka | تازركة | تزغران |
| 1535 | Fondouk Jedid-Seltan | فندق الجديد - سلتان | فندق الجديد سلتان |
| 1536 | Tazghrane Boukrim Zaouiet El Mgaiez | تزغران بوكريم زاوية المقايز | تزغران بوكريم |
| 1538 | Boucharray-Chrifet | الشريفات بوشراي | بوشراي الشريفات |
| 1721 | Ras Jebel | راس الجبل | رأس الجبل |
| 2221 | Kalaa-El Maaden-Ferksan | القلعة - المعدن - فرقصان | القلعة المعدن فرقصان |
| 2317 | Kalaat Senan | قلعة السنان | قلعة سنان |
| 2318 | Kalaat Khasba | القلعة الخصباء | قلعة الخصبة |
| 2323 | Zaafrane Dyr | الزعفران - دير الكاف | الزعفران دير |
| 2324 | Bahra | بهرة | بحرة |
| 3112 | Ksibet Thrayet | قصيبة سوسة والثريات | قصيبة الثريات |
| 3113 | Ezzouhour | الزهور - سوسة | الزهور |
| 3127 | Grymet Hicher | القريمات هيشر | قريميط هيشر |
| 3218 | Ghenada | غنادة | الغنادة |
| 3222 | Bembla El Mnara | بنبلة المنارة | بمبلة المنارة |
| 3223 | Menzel Ennour | منزل نور | منزل النور |
| 3224 | El Masdour Menzel Harb | المصدور منزل حرب | المسدور منزل حرب |
| 3231 | Cherahil | الشراحيل | شراحيل |
| 3325 | Sidi Zid - Ouled Moulahem | سيدي زيد - أولاد مولاهم | سيدي زيد أولاد مولاهم |
| 3327 | Tlelsa | التلالسة | تلايلسة |
| 3328 | Zelba | زالبة | زلبة |
| 3428 | El Aouabed Khazzanet | العوابد - الخزانات | العوابد الخزانات |
| 3429 | Ennadhour - Sidi Ali Belabed | بئر علي الشمالية | الناظور سيدي علي بلعابد |
| 3431 | Hazeg El Louza | الحزق - اللوزة | حزق اللوزة |
| 3432 | Ennour | النور - صفاقس | النور |
| 4117 | El Alâa | العلا | العلاء |
| 4119 | Nasrallah | نصر الله | نصرالله |
| 4123 | Sisseb-Driaat | سيسب - الذريعات | سيسب الدريعات |
| 4128 | Aïn El Beidha | العين البيضاء | عين البيضاء |
| 4220 | Majel Belabbès | ماجل بالعباس | ماجل بلعباس |
| 4223 | Ezzouhour | الزهور - القصرين | الزهور |
| 4224 | Ennour | النور - القصرين | النور |
| 4225 | Chraia - Machreg Ech-Chems | الشرائع - مشرق الشمس | الشرائع مشرق الشمس |
| 4313 | Cebbala Ouled Asker | سبالة | سبالة أولاد عسكر |
| 4321 | Saïda | السعيدة | سعيدة |
| 4322 | Souk Jedid | سوق الجديد | السوق الجديد |
| 4323 | El Ahouaz - El Assouda | الأسودة | الأحواز الأسودة |
| 4324 | El Faidh Bennour | الفائض بنور | الفايض بنور |
| 5213 | Ben Guerdane | بن قردان | بنقردان |
| 5312 | Bir Lahmar | بئر الأحمر | بئر لحمر |
| 6318 | Bechri-Jersine-El Blidet | بشلي - جرسين - البليدات | بشري جرسين البليدات |
| 6319 | Bechni-Fatnassa | بشري - فطناسة | بشني فطناسة |

## 5. Ce que SIIPI reprend de la carte, et ce qu'il ne reprend pas (v0.15.43)

Repris : le choix du fond (plan OpenStreetMap ou satellite Esri), la couche des communes qu'on affiche ou masque, le
filtre par gouvernorat, la recherche « nom — gouvernorat » (homonymes), la fiche de chaque commune.

Non repris : **les tuiles Google** (appelées hors de leur API, elles enfreignent les conditions de Google — feuille
de route, lot S0), la superficie Web Mercator, les populations et les noms du fichier (SIIPI garde son référentiel
tant que la FNCT n'a pas tranché).
