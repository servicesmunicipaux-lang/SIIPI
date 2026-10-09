# docs/specs_metier — pièces métier de référence

Ce dossier contient les **sources officielles** sur lesquelles SIIPI s'appuie, et leur lecture
orientée développement. Règle unique : *rien de ce qui est codé dans SIIPI — un gabarit, un seuil,
une règle de gestion — ne doit être inventé.* Si ce n'est pas ici ou dans un texte cité, cela doit
être tranché avant d'être écrit.

## Contenu

| Fichier | Objet | État |
| :--- | :--- | :--- |
| `01-referentiel-depot-municipal.md` | Référentiel officiel de gestion et maintenance de la flotte municipale : documents réglementaires, rôles, maintenance, déclassement, carburant | **déposé** 30/09/2026 |
| `02-projet-decret-tri-source-art13-14.md` | Lecture orientée développement du **projet de décret** (définitions, art. 13.1 et 14) — non en vigueur | **déposé** 30/09/2026 |
| `SPEC_v0.16.md` | **Spécification de travail v0.16 → v0.19** : lignes rouges, décisions, amendements, découpage en lots, tests, blocages | **v1** 30/09/2026 |
| `SPEC_v0.19_mutualisation.md` | **Jalon 14 détaillé** : prêt d'engins et points limitrophes — ce qui existe, principes, lots 19.1 et 19.2, tests, questions à trancher (D-1 à D-7) | **v1, à valider** 09/10/2026 |
| `sources/mhamdia-pcgd-2025-agregats.json` | Agrégats 2025 du PCGD de M'hamdia (coûts, tonnages, écarts constatés) — entrées du lot 17.5, sans donnée personnelle. **Hors du dépôt public** (`.gitignore`) tant que l'accord de la commune et du bureau d'études n'est pas vérifié : il se charge localement par l'écran « Coût complet » | **déposé localement** 08/10/2026 |
| `sources/referentiel-mestoudaa-119-diapositives.txt` | Texte intégral extrait de la présentation source (119 diapositives) | **déposé** |

## Pièces attendues

| Pièce | Nécessaire pour | Statut |
| :--- | :--- | :--- |
| Texte des articles 13.1 et 14 (cadre WAMA-Net / ANGeD) | Module secteur informel, registre de traçabilité | **reçu en projet** (non en vigueur) — voir `02-…` ; restent les articles 4 et 13 et la date de départ de la période transitoire |
| Gabarits des documents légaux sous forme de fichiers | Générateur PDF officiel | **manquant** — reconstruits à partir des champs du référentiel, à faire valider |
| Documentation des API GPS (Orange, Ooredoo, prestataires) | Connecteur GPS | **manquant** |
| Barème ANGeD en vigueur et sa date d'effet | Redevance évitée, coût complet | **manquant** |

## Arbitrages ouverts

Ces décisions ne relèvent pas du développement. Tant qu'elles ne sont pas tranchées, les lots
concernés ne sont pas spécifiables.

1. **Identification des pré-collecteurs.** *Conception arrêtée le 30/09/2026* (identifiant
   communal pseudonyme + table d'identité séparée, voir `SPEC_v0.16.md` R1-R3). **Reste ouvert** :
   confirmation juridique (responsable du traitement, déclaration ou autorisation, texte à citer)
   et hébergement accrédité des identités nominatives.
2. **Inférence d'image : locale ou API externe**, si l'axe caractérisation est retenu — question de
   souveraineté de la donnée.
3. **Ouverture trans-communale** (points limitrophes, prêt d'engins) : première exception délibérée
   au cloisonnement absolu par commune. *Spécifiée le 09/10/2026* (`SPEC_v0.19_mutualisation.md`) :
   partage par objet, consentement à double sens. **Reste ouvert** : la forme juridique d'un prêt et
   d'un accord de desserte (D-1), et six autres questions listées au § 7 de cette spécification.

## Divergences assumées avec le référentiel

Le périmètre de SIIPI est plus étroit que celui du référentiel officiel, délibérément. Les
exclusions sont listées au §4 de `01-referentiel-depot-municipal.md` — gestion de stock au détail,
fonction budgétaire et marchés. Elles sont des choix, pas des oublis.
