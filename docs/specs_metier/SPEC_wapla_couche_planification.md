# SIIPI — Couche WaPla : bilan de flux, GES, uPOPs et scénarios PCGD
## Note de cadrage — moteur de calcul réimplémenté, en couche séparée

**FNCT · 9 octobre 2026 · statut : cadrage, rien n'est codé**
Source analysée : *UNIDO Solid Waste Management Plan (WaPla) Tool*, v1.5 (février 2021), TU Wien pour l'UNIDO/GEF — manuel et code source complet (`app/shiny/server.r`, 4 417 lignes), lus ligne à ligne. La spécification technique du moteur, avec un renvoi `server.r:NNN` pour chaque formule, est en annexe (`sources/wapla/wapla-moteur-reference.md`).

---

## 0. Le principe qui gouverne tout le reste

> **WaPla est une couche à part.** Ses résultats s'affichent dans le portail SIIPI, mais ses calculs restent séparés : WaPla utilise les données de SIIPI, et aucun indicateur, coût ou tonnage de SIIPI n'utilise jamais un résultat de WaPla.

Aucune méthode de SIIPI ne change :

| Méthode SIIPI | Ce que la couche WaPla en fait |
|---|---|
| Coût complet Z = (A + B) + (C + D) (lot 17.5, migration 062) | Elle **lit** son résultat quand il existe. Elle ne le recalcule pas, ne le corrige pas, ne le remplace pas |
| Indicateurs (5 axes), préparation DMA | **Aucun lien.** Aucun chiffre WaPla n'entre dans un indicateur |
| Mesuré › déclaré › non renseigné | Repris tel quel : chaque entrée WaPla porte sa provenance |
| Un tonnage estimé ne s'additionne jamais à un tonnage pesé | Tenu : le gisement estimé par WaPla ne s'écrit jamais dans `pesees` |
| Cloisonnement par la base (RLS) | Même règle, sur un schéma séparé |
| Jumeau numérique (`est_demo`) | Exclu de toute agrégation nationale WaPla |

**Ce que produit la couche, et son nom.** Des **estimations de planification** : un bilan annuel de flux, des émissions (GES, uPOPs) et une comparaison de scénarios pour le PCGD. Chaque écran porte la mention « Estimation de planification — méthode UNIDO WaPla », jamais « mesure ». Si l'on pouvait débrancher la couche sans qu'un seul chiffre de SIIPI bouge, la séparation est tenue. Cette propriété est **testée** (§ 7).

---

## 1. Ce qu'est WaPla, et ce qu'il n'est pas

**Ce qu'il fait.** À partir d'un gisement annuel et de coefficients de transfert (la part de chaque flux qui part vers chaque destination), il calcule quatre blocs :

| Bloc | Méthode | Unité |
|---|---|---|
| A. Flux | Analyse de flux de matière : collecte, non-collecte, brûlage à l'air libre, dépotoirs, décharge, compostage, tri, incinération, recyclage, stocks | t/an |
| B. uPOPs (dioxines et furanes) | Facteurs de la Convention de Stockholm (Toolkit PNUE) | mg TEQ/an |
| C. GES | Facteurs IPCC ; méthane de décharge en potentiel total (sans décroissance annuelle), PRG du CH₄ = 28 | t CO₂-éq/an |
| D. Coûts | Exploitation + investissement annualisé (annuité), coût par tonne entrante | devise/an, devise/t |

**Ce qu'il n'est pas.** Ce n'est pas un outil opérationnel : le coût de collecte y tient en un seul chiffre, et le gasoil en un seul total annuel. SIIPI est beaucoup plus fin (circuits, pesées par voyage, carnets de bord). La couche WaPla se situe **au-dessus** : elle agrège une année, elle ne descend jamais au circuit.

**Licence.** L'outil est distribué gratuitement (« Permission to use is hereby granted, free of charge ») et le paquet contient une licence Apache 2.0, qui couvre vraisemblablement l'enveloppe d'installation plutôt que le code de l'application. **Ce que nous faisons** : réécrire le moteur sans copier le code, en citant la méthode (UNIDO/GEF, TU Wien, 2021). **À confirmer par écrit auprès de l'UNIDO** avant toute diffusion nationale (§ 9).

---

## 2. Architecture : comment la séparation est tenue

```
        SIIPI (inchangé)                          Couche WaPla (nouvelle)
  ┌──────────────────────────┐            ┌─────────────────────────────────────┐
  │ pesees, fuel_logs,       │  lecture   │ wapla.v_amorce_commune(exercice)    │
  │ carnets_de_bord,         │ ─────────► │   (vue SECURITY INVOKER, RLS        │
  │ parametres_commune,      │  seule     │    de SIIPI appliquée)              │
  │ valeurs_cout_complet,    │            │            │                        │
  │ valeurs_parametres_nat.  │            │            ▼                        │
  └──────────────────────────┘            │ wapla.bilans / wapla.entrees        │
              ▲                           │ wapla.scenarios                     │
              │  aucune flèche            │ wapla.facteurs_reference            │
              ╳  dans ce sens             │            │                        │
                                          │            ▼                        │
                                          │ backend/src/wapla/moteur.ts         │
                                          │   (fonction pure, sans base)        │
                                          └─────────────────────────────────────┘
```

- **Un schéma PostgreSQL à part, `wapla`.** Chaque table porte `commune_id`, `ENABLE` et `FORCE ROW LEVEL SECURITY`, et ses politiques s'appuient sur `app.can_read_commune()` et `app.can_write_commune()`, comme le reste de la base.
- **Lecture seule vers SIIPI.** La couche lit par des vues `wapla.v_amorce_*`. Elle ne pose aucun déclencheur ni aucune clé étrangère qui écrirait dans une table de SIIPI. Aucune fonction `app.*` ne référence un objet `wapla.*`.
- **Un moteur pur.** `backend/src/wapla/moteur.ts` prend un jeu d'entrées et rend des résultats, sans accès à la base. Il porte un numéro `version_moteur`, enregistré avec chaque résultat.
- **Des routes à part.** Préfixe `/wapla/*`, avec leur propre campagne de tests (`backend/tests/wapla.sh`).
- **Des facteurs à part.** Les facteurs d'émission et les valeurs de référence vivent dans `wapla.facteurs_reference`, avec leur source et leur date d'effet. Nous n'ajoutons **rien** à `definitions_parametres_nationaux` de SIIPI : ce sont des hypothèses de planification, pas des paramètres réglementaires.

---

## 3. Les entrées : d'où vient chaque chiffre

### 3.1 La provenance, obligatoire sur chaque entrée

| Provenance | Sens | Affichage |
|---|---|---|
| `siipi_mesure` | Lue dans un registre SIIPI tenu sur l'exercice (table et période enregistrées) | badge « mesuré (SIIPI) » |
| `siipi_declare` | Lue dans une donnée déclarée de SIIPI (fiche, étude de coût du bureau d'études) | badge « déclaré » |
| `saisie_commune` | Saisie dans la couche par la commune | badge « saisi » |
| `reference_tunisienne` | Valeur de `wapla.facteurs_reference` à source tunisienne datée | badge « référence nationale » + source |
| `defaut_wapla` | Valeur par défaut de l'outil UNIDO (calibrée pour l'Afrique australe) | badge orange « valeur par défaut UNIDO, à remplacer » |

**La règle des valeurs par défaut.** Le manuel le dit lui-même : ces valeurs sont des *placeholders*. Un bilan reçoit donc un **niveau de fiabilité** :

| Niveau | Condition | Conséquence |
|---|---|---|
| **Étayé** | Gisement, taux de collecte et destination des tonnages hors défaut UNIDO, et moins de 30 % des entrées restantes en défaut UNIDO | Peut entrer dans l'agrégat national |
| **Indicatif** | Les trois entrées clés hors défaut, mais plus de 30 % des autres en défaut | Visible par la commune et la FNCT, exclu des agrégats |
| **Illustratif** | Au moins une des trois entrées clés en défaut UNIDO | Visible par la commune seule, avec un bandeau permanent |

Le seuil de 30 % est un réglage de la FNCT, pas une constante du code.

### 3.2 Correspondance entrées WaPla ← SIIPI

| Entrée WaPla | Source dans SIIPI | Provenance | Remarque |
|---|---|---|---|
| **Déchets collectés** (W1, t/an) | Σ `pesees.poids_net_kg` / 1000 sur l'exercice, `type_dechet = 'menager'`, hors `deleted_at` | `siipi_mesure` | **Ancrage principal.** Si l'exercice n'est pas couvert en entier, la couche le dit (« 7 mois pesés ») et ne l'extrapole pas en silence |
| **Gisement** (WG, t/an) | Population retenue (17.1, migration 063) × production spécifique théorique (kg/hab/j) × 365 | `siipi_declare` (paramètre communal) | Le **taux de collecte** s'en déduit (W1 / WG) et s'affiche. S'il dépasse 1, c'est un écart signalé (règle 1.5), jamais un plafonnement silencieux |
| Recyclables séparés à la source (part du gisement) | Aucune source SIIPI aujourd'hui | `saisie_commune` | Le secteur informel (jalon 13) pourra l'alimenter plus tard, en déclaré |
| Destination des tonnages collectés (décharge, compostage, tri, transfert) | `pesees.destination`, `pesees.type_dechet` (`vert`, `tri`) | `siipi_mesure` si `destination` est renseignée, sinon `saisie_commune` | Le centre de transfert compte comme décharge (destination finale). Tant que `destination` n'est pas tenue, la répartition est saisie |
| Non-collecté : part brûlée, part en dépotoir, fuite vers les eaux | Aucune pesée possible. Le registre des points noirs en donne le nombre, pas le tonnage | `saisie_commune` | Une entrée qui ne sera jamais mesurée : le bilan reste **indicatif** sur ce volet, et l'écran le dit |
| **Gasoil de collecte** (L/an) | Σ `fuel_logs.litres` et carnets de bord (migration 058) des engins de collecte, sur l'exercice | `siipi_mesure` | Un registre de carburant vide donne « non renseigné », **jamais 0 L** (règle 1.1) |
| Coût annuel de collecte (statu quo) | Résultat du coût complet SIIPI (`valeurs_cout_complet`) quand il existe pour l'exercice | `siipi_declare` ou `siipi_mesure`, selon sa source | Lu tel quel. WaPla **ne recalcule pas** le coût de l'existant (§ 5) |
| Coût d'exploitation de la décharge | Redevance ANGeD en vigueur (`valeurs_parametres_nationaux`, 17.3) × tonnage mis en décharge | `siipi_declare` (« provisoire » tant que le barème manque) | Le caractère « provisoire » se propage au résultat |
| Composition (biodéchets, papier-carton, plastiques) | `app.caracterisation_retenue(commune, date)` : étude ANGeD de la commune, puis PCGD, puis autre étude, puis moyenne nationale ANGeD (voir `SPEC_refonte_indicateurs_saisie.md`, § 2.3) | `siipi_declare`, avec le niveau de source | Une composition issue de la **moyenne nationale** compte comme une entrée non propre à la commune pour le niveau de fiabilité. Défaut UNIDO seulement si SIIPI n'a aucune caractérisation, même nationale |
| Climat (précipitations, température moyennes) | Aucune | `reference_tunisienne` par gouvernorat, à fournir | Normales climatiques de l'INM par gouvernorat. Le climat règle la part de carbone dégradable du méthane |
| Gestion de la décharge (MCF), captage du biogaz | Aucune | `saisie_commune` (FNCT pour les sites ANGeD) | Une décharge contrôlée ANGeD n'est pas une décharge « bien gérée » par défaut : c'est un choix déclaré et daté |
| Investissements des scénarios (montant, durée, taux) | Aucune | `saisie_commune` | Propres à chaque scénario (§ 5) |

### 3.3 Ce qui ne s'applique pas en Tunisie

- **Le centre de tri (MRF) et l'incinération** sont désactivés par défaut. Ils s'activent seulement dans un scénario qui les projette.
- **Les uPOPs de l'incinération** ne s'affichent donc pas dans le statu quo d'une commune sans incinérateur.
- **Le four de cimenterie** (combustible solide de récupération) reste une option de scénario.

---

## 4. Le moteur

### 4.1 Ce qu'il calcule

Le détail exact est en annexe : 37 flux, 35 coefficients de transfert, tous les facteurs et toutes les formules, avec la ligne du code source. En résumé :

- **Flux.** Chaque flux sortant d'un procédé vaut son coefficient multiplié par la somme des entrées de ce procédé. Chaque procédé a exactement un coefficient déduit (1 − les autres). Le moteur applique un ordre topologique en une seule passe ; WaPla le fait en cinq itérations, avec le même résultat.
- **GES.** Les formules portent sur :
  - le gasoil (× 0,0026 t CO₂-éq/L) ;
  - les plastiques brûlés (× 2,5 × 0,7) ;
  - le compostage (0,056 / 0,245 / 0,648 t CO₂-éq/t selon la qualité de gestion) ;
  - le méthane de décharge et de dépotoir. Le calcul enchaîne : MCF × COD (biodéchets 0,16, papier 0,40) × 0,5 × 16/12 × 28 × part dégradable climatique × tonnage net déposé × (1 − biogaz capté) ;
  - les crédits du recyclage, par tonne : papier −0,15, verre −0,30, plastiques −1,50, métaux −1,80.
- **uPOPs.** Le facteur d'émission (µg TEQ/t) est multiplié par le tonnage concerné, puis divisé par 1 000. Valeurs : brûlage à l'air libre 40 (air) et 1 (sol) ; feux de décharge et de dépotoir 300 et 10 ; lixiviats et résidus selon la nature des déchets ; compost 5 (propre) ou 50 (gris) × 0,65.
- **Coûts.** Annuité d'investissement = P·(1+i)ⁿ·i / ((1+i)ⁿ − 1), ou P/n si le taux est nul.

**Une précision qui compte pour la lecture des GES.** WaPla compte en une fois tout le méthane que produira, sur des décennies, la tonne déposée cette année : c'est un **potentiel engagé**, pas l'émission de l'année. Une commune qui réduit sa mise en décharge voit donc son chiffre baisser immédiatement. C'est voulu pour comparer des scénarios, et c'est faux si on le compare à un inventaire national de GES. L'écran le dit.

### 4.2 Les défauts de l'outil d'origine, et ce que nous en faisons

La lecture du code a relevé une vingtaine de défauts. Ceux qui changent un résultat :

| # | Défaut dans WaPla | Effet | Décision proposée |
|---|---|---|---|
| D1 | uPOPs des dépotoirs : le code soustrait la **constante 36** au lieu du tonnage nettoyé | Résultat faux dès qu'un nettoyage de dépotoir est saisi | Corriger (soustraire le tonnage nettoyé) |
| D2 | Incinération avec valorisation énergétique : le CO₂ fossile des plastiques **disparaît** | Incinération flatteuse | Corriger (CO₂ fossile + crédit énergie) |
| D3 | Le total GES interne oublie les feux de décharge, alors que le tableau affiché les compte | Deux totaux différents | Un seul total, feux compris |
| D4 | Coût de décharge mis à 0 si l'exploitation **ou** l'investissement est vide | Coût nul affiché | « Non renseigné » (règle 1.1) |
| D5 | Recettes du recyclage : une case vide fait disparaître toute la ligne | Ligne absente sans explication | « Non renseigné » sur le seul matériau manquant |
| D6 | Climat : température > 20 °C avec exactement 400 mm de pluie ne correspond à aucune classe | L'outil plante | Bornes fermées, aucun trou |
| D7 | Méthane de décharge : les résidus d'incinération et le curseur de dégradation sont ignorés | Méthane indépendant du bilan de masse | Corriger : un seul tonnage déposé, le même pour la masse et le méthane |
| D8 | Résidus des feux de décharge : ils sortent du bilan | La masse n'est pas conservée | Les réintégrer : Σ entrées = Σ sorties + stocks |
| D9 | Part dégradable du dépotoir sans données climatiques : le facteur de gestion est omis | Incohérence avec la décharge | Même règle pour les deux |
| D10 | Sommes de parts > 1 (composition, nature des déchets) seulement signalées | Parts négatives calculées | **Refusées par la base** |

**Deux modes, un seul en service.** Le moteur sera écrit en mode **corrigé** : c'est le seul qui s'affiche. Un mode **fidèle**, qui reproduit les défauts, n'existe que dans la campagne de tests. Il prouve que nous avons compris l'outil d'origine avant de le corriger : chaque écart entre les deux modes doit s'expliquer par un défaut nommé du tableau ci-dessus, et par rien d'autre.

---

## 5. Les coûts : où passe la frontière avec SIIPI

C'est le point où la séparation est la plus facile à rompre.

- **Statu quo.** Le coût de collecte de l'existant est **celui de SIIPI** (coût complet, lot 17.5), lu tel quel avec sa provenance et son dénominateur. Sans coût complet pour l'exercice, il est « non renseigné ». La couche ne calcule **pas** un second coût de l'existant selon la méthode UN-Habitat : deux coûts à la tonne pour la même année finiraient côte à côte dans une réunion.
- **Scénarios.** La méthode WaPla s'applique seulement à ce que le scénario **ajoute** : nouvel investissement (plateforme de compostage, centre de tri, engins), annuité, exploitation et recettes nouvelles. Le résultat se présente en **écart au statu quo** (« +X TND/an »), jamais comme un nouveau coût complet.
- **Coût par tonne.** WaPla divise un investissement **total** par un tonnage **annuel** et nomme le résultat « coût spécifique d'investissement ». Ce n'est pas un coût annuel à la tonne. La couche affiche l'annuité par tonne et, à côté, le dénominateur de chaque coût, comme SIIPI le fait pour les siens.

---

## 6. Les écrans

**Commune** (pôle « Pilotage & auto-évaluation », sous-entrée « Bilan & scénarios WaPla ») :

1. **Amorce.** La couche propose les entrées lues dans SIIPI, chacune avec son badge. La commune complète ce qui manque. Rien n'est calculé tant que les trois entrées clés ne sont pas renseignées.
2. **Bilan de l'exercice.** Diagramme des flux (Sankey), tableau des flux, GES par procédé, uPOPs par procédé et par milieu, niveau de fiabilité en tête.
3. **Scénarios.** Copie du bilan, modification des coefficients et des investissements, comparaison côte à côte avec le statu quo : tonnes enfouies, tonnes brûlées à l'air libre, t CO₂-éq, mg TEQ, écart de coût. Un scénario se fige à la validation : il garde ses entrées et la version du moteur qui l'a calculé (règle 1.4).
4. **Export** (service transverse existant, Excel/CSV/PDF), avec la mention de méthode et la liste des valeurs par défaut utilisées.

**FNCT** (observatoire national) : agrégats par gouvernorat et par district des seuls bilans **étayés** de l'exercice, avec leur nombre (« 12 communes sur 31 du gouvernorat ») et sans classement des communes. La commune de démonstration n'y figure jamais.

**Diffusion des uPOPs : à trancher (§ 9).** Un chiffre de dioxines par commune, calculé en grande partie sur des hypothèses, peut être mal reçu s'il circule hors de son contexte. Proposition par défaut : visible par la commune et la FNCT, jamais dans un export public sans validation de la FNCT.

---

## 7. Validation : ce que la base refuse d'abord

Comme toutes les campagnes de SIIPI, `wapla.sh` commence par les refus :

| Test | Attendu |
|---|---|
| Une commune écrit ou lit le bilan d'une autre | Refusé (RLS), y compris en SQL direct |
| Coefficients d'un procédé dont la somme dépasse 1, ou parts de composition dont la somme dépasse 1 | Refusé en base |
| Un bilan de la commune de démonstration entre dans un agrégat national | Absent de l'agrégat |
| **Séparation** : un objet `app.*` dépend d'un objet `wapla.*` (`pg_depend`) | Aucun |
| **Séparation** : on supprime le schéma `wapla` et on rejoue toutes les campagnes SIIPI | Toutes passent, chiffres identiques |
| Gasoil sans registre tenu | « Non renseigné », pas 0 L |
| Bilan de masse | Σ entrées = Σ sorties + Δ stocks, à 10⁻⁶ t près, sur 100 jeux d'entrées tirés au hasard |
| **Vecteurs de référence** | Le mode fidèle retrouve les valeurs de l'annexe (port Python **indépendant** du code de l'application). Exemple, valeurs par défaut et 1 000 t : 460 t collectées, 238,28 t en stock de décharge, 699,3 t CO₂-éq au total avant arrondi (WaPla affiche 690 après ses arrondis à deux chiffres significatifs) |
| Mode corrigé | Chaque écart avec le mode fidèle correspond à un défaut D1 à D10, et à rien d'autre |
| Recalcul dans l'outil d'origine (une fois, au lot W0) | Les valeurs par défaut et le scénario B, saisis dans l'application WaPla sous Windows, donnent les mêmes chiffres que le port Python. **Les vecteurs viennent d'une lecture du code, pas encore d'une exécution de WaPla : c'est ce test qui les confirme** |

---

## 8. Découpage en lots et place dans la feuille de route

La couche ne bloque rien et n'est bloquée par aucun jalon en cours. Elle **profite** de 17.1 (population), de 17.3 (redevance ANGeD) et de 17.5 (coût complet). Proposition : **jalon 15, à la suite des jalons 11 à 14**. Le lot W0 peut commencer tout de suite, car il ne touche pas au code.

| Lot | Contenu | Dépend de | Test de sortie |
|---|---|---|---|
| **W0** | Vecteurs de référence confirmés dans l'outil d'origine ; références tunisiennes réunies (composition, climat par gouvernorat) ; accord écrit de l'UNIDO | — | Les deux jeux saisis dans WaPla redonnent les vecteurs |
| **W1** | Moteur pur `moteur.ts`, modes fidèle et corrigé, sans base ni écran | W0 | Vecteurs, bilan de masse, écarts expliqués |
| **W2** | Schéma `wapla`, RLS, vues d'amorce en lecture seule, routes `/wapla/*` | W1 | Refus, séparation (`pg_depend`, suppression du schéma) |
| **W3** | Écrans commune : amorce, bilan, Sankey, export | W2 | Recette sur le jumeau numérique, puis sur M'hamdia (le seul jeu où tonnage et coût existent ensemble) |
| **W4** | Scénarios : copie, figement, comparaison, écart de coût | W3 | Un scénario figé garde ses chiffres après une modification des facteurs de référence |
| **W5** | Agrégats nationaux des bilans étayés | W4 + plusieurs communes réelles | Le jumeau absent ; une commune sans bilan étayé n'apparaît pas |

---

## 9. Décisions à prendre

Chaque décision a une valeur par défaut. Sans réponse, la valeur par défaut s'applique et la décision est consignée.

| Sujet | Valeur par défaut proposée | Décideur |
|---|---|---|
| Mode du moteur affiché | **Corrigé**, le mode fidèle réservé aux tests | Nacer |
| Seuil de valeurs par défaut pour « étayé » | 30 % des entrées hors entrées clés | FNCT |
| Diffusion des uPOPs | Commune + FNCT ; export public seulement après validation de la FNCT | FNCT |
| Source de la composition des déchets | Tranché : caractérisation tenue dans SIIPI, personnalisable par la commune, moyenne nationale ANGeD en repli | — |
| Climat | Normales INM par gouvernorat | FNCT |
| Classe de gestion des décharges contrôlées ANGeD | Déclarée site par site, datée, par la FNCT | FNCT / ANGeD |
| Réutilisation du code et de la méthode | Méthode citée, code réécrit ; accord écrit de l'UNIDO avant diffusion nationale | FNCT |
| Place dans la feuille de route | Jalon 15, W0 dès maintenant | Nacer |

---

## Annexes

- `sources/wapla/wapla-moteur-reference.md` : spécification complète du moteur (flux, coefficients, facteurs, formules, défauts), avec renvois au code source.
- `sources/wapla/wapla_sim.py` : port Python indépendant qui produit les vecteurs de référence. Il sert de calcul extérieur à l'application, comme le jumeau numérique l'exige (§ 6bis, garde-fou 4).
- Manuel UNIDO : `UNIDO Solid Waste Management Plan Tool_MANUAL.pdf` (dossier `plateforme IMiSIWM\wapla`).
