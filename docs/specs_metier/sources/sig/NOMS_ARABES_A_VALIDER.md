# Noms arabes à valider

`DECISIONS_2026-10-20.md` § 6. Les **44 noms arabes** qui diffèrent entre SIIPI et la carte du conseiller SIG
(relevé du 16/10/2026, `ecarts_carte_conseiller_2026-10-16.csv`), classés par Claude Code et **tranchés par Nacer le
25/10/2026**. Une proposition n'est pas une source officielle : seuls les cas tranchés « corriger » sont corrigés, par
la migration `086_noms_arabes.sql` (décision `D-NOMS-AR-1`) ; l'ancien nom reste lisible dans `corrections_referentiel`
(observatoire, Paramètres nationaux) et au journal d'audit.

## A. Corrigés (12)

| Code | Commune | Gouvernorat | Nom dans SIIPI | Nom du conseiller | Nom retenu — pourquoi | Décision de Nacer |
|---|---|---|---|---|---|---|
| 1111 | Tunis (Capitale) | Tunis | بلدية تونس | تونس العاصمة | **تونس** — Aucun autre nom ne porte « بلدية » | Corriger (25/10/2026) |
| 1116 | Sidi Bou Saïd | Tunis | سيدي بو سعيد | سيدي بوسعيد | **سيدي بوسعيد** — Graphie usuelle | Corriger (25/10/2026) |
| 1517 | Tazarka | Nabeul | تزغران | تازركة | **تازركة** — SIIPI porte le début du nom d’une autre commune (Tazghrane) | Corriger (25/10/2026) |
| 1536 | Tazghrane Boukrim Zaouiet El Mgaiez | Nabeul | تزغران بوكريم | تزغران بوكريم زاوية المقايز | **تزغران بوكريم زاوية المقايز** — Nom tronqué | Corriger (25/10/2026) |
| 3222 | Bembla El Mnara | Monastir | بمبلة المنارة | بنبلة المنارة | **بنبلة المنارة** — Graphie usuelle de Bembla | Corriger (25/10/2026) |
| 3224 | El Masdour Menzel Harb | Monastir | المسدور منزل حرب | المصدور منزل حرب | **المصدور منزل حرب** — ص et non س | Corriger (25/10/2026) |
| 3231 | Cherahil | Monastir | شراحيل | الشراحيل | **الشراحيل** — Article du nom usuel | Corriger (25/10/2026) |
| 3327 | Tlelsa | Mahdia | تلايلسة | التلالسة | **التلالسة** — Graphie usuelle | Corriger (25/10/2026) |
| 4117 | El Alâa | Kairouan | العلاء | العلا | **العلا** — Graphie usuelle | Corriger (25/10/2026) |
| 4119 | Nasrallah | Kairouan | نصرالله | نصر الله | **نصر الله** — Deux mots | Corriger (25/10/2026) |
| 5213 | Ben Guerdane | Médenine | بنقردان | بن قردان | **بن قردان** — Deux mots | Corriger (25/10/2026) |
| 5312 | Bir Lahmar | Tataouine | بئر لحمر | بئر الأحمر | **بئر الأحمر** — Forme écrite usuelle | Corriger (25/10/2026) |

## B. En attente d'une source officielle (8)

La liste officielle des communes (décret de création, portail du ministère de l'Intérieur ou des collectivités locales),
ou la commune elle-même, tranchera. Rien n'est changé d'ici là.

| Code | Commune | Gouvernorat | Nom dans SIIPI | Nom du conseiller | Proposition | Décision de Nacer |
|---|---|---|---|---|---|---|
| 2318 | Kalaat Khasba | Le Kef | قلعة الخصبة | القلعة الخصباء | à vérifier | En attente (25/10/2026) |
| 2324 | Bahra | Le Kef | بحرة | بهرة | à vérifier | En attente (25/10/2026) |
| 3127 | Grymet Hicher | Sousse | قريميط هيشر | القريمات هيشر | à vérifier | En attente (25/10/2026) |
| 3328 | Zelba | Mahdia | زلبة | زالبة | à vérifier | En attente (25/10/2026) |
| 3431 | Hazeg El Louza | Sfax | حزق اللوزة | الحزق - اللوزة | à vérifier | En attente (25/10/2026) |
| 4123 | Sisseb-Driaat | Kairouan | سيسب الدريعات | سيسب - الذريعات | à vérifier | En attente (25/10/2026) |
| 4128 | Aïn El Beidha | Kairouan | عين البيضاء | العين البيضاء | à vérifier | En attente (25/10/2026) |
| 4321 | Saïda | Sidi Bouzid | سعيدة | السعيدة | à vérifier | En attente (25/10/2026) |

## C. Gardés tels que dans SIIPI (24)

| Code | Commune | Gouvernorat | Nom dans SIIPI | Nom du conseiller | Pourquoi | Décision de Nacer |
|---|---|---|---|---|---|---|
| 1535 | Fondouk Jedid-Seltan | Nabeul | فندق الجديد سلتان | فندق الجديد - سلتان | Ponctuation seulement | Garder (25/10/2026) |
| 1538 | Boucharray-Chrifet | Nabeul | بوشراي الشريفات | الشريفات بوشراي | Ordre seulement ; SIIPI suit le nom français | Garder (25/10/2026) |
| 1721 | Ras Jebel | Bizerte | رأس الجبل | راس الجبل | Forme de SIIPI correcte (hamza) | Garder (25/10/2026) |
| 2221 | Kalaa-El Maaden-Ferksan | Jendouba | القلعة المعدن فرقصان | القلعة - المعدن - فرقصان | Ponctuation seulement | Garder (25/10/2026) |
| 2317 | Kalaat Senan | Le Kef | قلعة سنان | قلعة السنان | Forme de SIIPI usuelle | Garder (25/10/2026) |
| 2323 | Zaafrane Dyr | Le Kef | الزعفران دير | الزعفران - دير الكاف | Le conseiller ajoute le gouvernorat | Garder (25/10/2026) |
| 3112 | Ksibet Thrayet | Sousse | قصيبة الثريات | قصيبة سوسة والثريات | Le conseiller ajoute « سوسة و » | Garder (25/10/2026) |
| 3113 | Ezzouhour | Sousse | الزهور | الزهور - سوسة | Le conseiller ajoute le gouvernorat (homonymes) | Garder (25/10/2026) |
| 3218 | Ghenada | Monastir | الغنادة | غنادة | Forme de SIIPI usuelle | Garder (25/10/2026) |
| 3223 | Menzel Ennour | Monastir | منزل النور | منزل نور | Forme de SIIPI usuelle | Garder (25/10/2026) |
| 3325 | Sidi Zid - Ouled Moulahem | Mahdia | سيدي زيد أولاد مولاهم | سيدي زيد - أولاد مولاهم | Ponctuation seulement | Garder (25/10/2026) |
| 3428 | El Aouabed Khazzanet | Sfax | العوابد الخزانات | العوابد - الخزانات | Ponctuation seulement | Garder (25/10/2026) |
| 3429 | Ennadhour - Sidi Ali Belabed | Sfax | الناظور سيدي علي بلعابد | بئر علي الشمالية | Le conseiller désigne un autre lieu | Garder (25/10/2026) |
| 3432 | Ennour | Sfax | النور | النور - صفاقس | Le conseiller ajoute le gouvernorat (homonymes) | Garder (25/10/2026) |
| 4220 | Majel Belabbès | Kasserine | ماجل بلعباس | ماجل بالعباس | Forme de SIIPI usuelle | Garder (25/10/2026) |
| 4223 | Ezzouhour | Kasserine | الزهور | الزهور - القصرين | Le conseiller ajoute le gouvernorat (homonymes) | Garder (25/10/2026) |
| 4224 | Ennour | Kasserine | النور | النور - القصرين | Le conseiller ajoute le gouvernorat (homonymes) | Garder (25/10/2026) |
| 4225 | Chraia - Machreg Ech-Chems | Kasserine | الشرائع مشرق الشمس | الشرائع - مشرق الشمس | Ponctuation seulement | Garder (25/10/2026) |
| 4313 | Cebbala Ouled Asker | Sidi Bouzid | سبالة أولاد عسكر | سبالة | SIIPI porte le nom complet | Garder (25/10/2026) |
| 4322 | Souk Jedid | Sidi Bouzid | السوق الجديد | سوق الجديد | Forme de SIIPI usuelle | Garder (25/10/2026) |
| 4323 | El Ahouaz - El Assouda | Sidi Bouzid | الأحواز الأسودة | الأسودة | SIIPI porte le nom complet | Garder (25/10/2026) |
| 4324 | El Faidh Bennour | Sidi Bouzid | الفايض بنور | الفائض بنور | Forme de SIIPI usuelle | Garder (25/10/2026) |
| 6318 | Bechri-Jersine-El Blidet | Kébili | بشري جرسين البليدات | بشلي - جرسين - البليدات | Le conseiller croise بشري et بشني ; SIIPI suit le nom français | Garder (25/10/2026) |
| 6319 | Bechni-Fatnassa | Kébili | بشني فطناسة | بشري - فطناسة | Le conseiller croise بشري et بشني ; SIIPI suit le nom français | Garder (25/10/2026) |
