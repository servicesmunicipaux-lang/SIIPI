# SPEC — SIIPI v0.16 → v0.19 : conformité, documents légaux, paramétrage, mutualisation

**Statut** : version 1 — 30/09/2026. Spécification de travail, tirée du master prompt v0.16
(rédigé avec Gemini), du référentiel officiel du dépôt municipal
(`01-referentiel-depot-municipal.md`) et des arbitrages de Nacer Boukhris du 30/09/2026.
Remplace le prompt comme source : **on ne recolle plus le prompt, on lit ce fichier.**

**Comment la lire.** Les sections 2 et 3 disent ce qui est *décidé* et ce qui a été *amendé* par
rapport au prompt, avec la raison. La section 4 découpe le travail en versions livrables. La
section 6 liste ce qui bloque encore, et qui doit le lever. Rien d'inventé n'est spécifié : ce
qui manque de pièces est écrit comme manquant.

---

## 1. Les cinq lignes rouges

Elles priment sur toute fonctionnalité de ce document.

1. **Pas d'optimisation VRP dans SIIPI.** L'optimisation lourde se fait en amont sur SIG tiers
   (QGIS / ArcGIS). SIIPI importe le tracé optimisé, remplace le tracé standard, le valide sur le
   terrain. SIIPI *capitalise et teste* ; il ne calcule pas de tournée.
2. **Pas de fichage nominatif public, pas de notation individuelle disciplinaire.** L'évaluation se
   fait par équipe et par circuit. Les listes nominatives réelles sont réservées à un hébergement
   étatique ou accrédité (voir R3 : c'est une condition technique, pas une intention).
3. **Pas de GPS individuel sur les balayeurs.** Le suivi en temps réel ne concerne que les
   **engins**. Le balayage se saisit par les chefs d'équipe en mètres linéaires par jour.
   *Le référentiel officiel (diapos 11, 50) recommande le GPS pour les engins seulement : il confirme
   cette ligne.*
4. **Pas de réponse automatique aux citoyens.** Les réclamations sont traitées par un humain, qui
   peut classer ou retirer ce qui ne relève pas de la propreté urbaine. Sont admis : accusés de
   réception factuels et changements de statut.
5. **Pas de facturation ni de recouvrement.** SIIPI produit des assiettes et les exporte vers les
   systèmes financiers existants (ADEP / INSAF).

**Périmètre GMAO** — inclus : disponibilité du parc, carburant, bons de travail, fiches de
déclassement, suivi des EPI. Exclus : stock de pièces au détail, achats et commandes
fournisseurs, facturation. *(Le référentiel prévoit le magasin et la fonction budgétaire ; leur
exclusion est un choix, écrit au §4 de `01-referentiel-depot-municipal.md`.)*

---

## 2. Décisions arrêtées

| # | Décision | Date |
| :-- | :--- | :--- |
| D1 | Les pièces métier vivent dans `docs/specs_metier/` ; le référentiel officiel y est déposé. | 30/09 |
| D2 | La **barre latérale à pôles** couvre **le portail municipal ET l'observatoire national de la FNCT**. Portail communal : livré en v0.15.0 (et déjà visible du super admin quand il ouvre une commune). Observatoire national : livré, 4 écrans en 3 pôles, typage vérifié en TypeScript 5.8.2. | 30/09 |
| D3 | Version : les `package.json` et lockfiles portent la version de la dernière entrée du CHANGELOG. Corrigé de 0.14.0 à **0.15.0**. Montée à 0.16.0 uniquement en clôturant v0.16, dans le commit de son entrée CHANGELOG. | 30/09 |
| D4 | **Critère d'acceptation technique unique avant commit** : `npm run verifier:contrat` + les **32** campagnes `backend/tests/*.sh`, chaînées par `npm test`. Écrit dans `CLAUDE.md` §7. Le « 240/240 » n'a aucune existence ; le « 33 » du dossier `tests/` compte le lanceur `executer.sh`, qui n'est pas une campagne. | 30/09 |
| D5 | Identité des pré-collecteurs : identifiant communal pseudonyme + table d'identité séparée (voir R1-R3). | 30/09 |
| D6 | Densité : matrice engin × flux, plus jamais une constante globale (voir R4). | 30/09 |
| D7 | La redevance ANGeD est un paramètre **historisé**, jamais une constante de code (voir R5). | 30/09 |
| D8 | `earnings_this_month_tnd` est **supprimé**. Le revenu ne se lit plus qu'agrégé par zone et par mois, recalculé depuis les livraisons, masqué sous **cinq** pré-collecteurs distincts. Livré en v0.15.5 (lot 16.1, migration 056). | 02/10 |

---

## 3. Amendements et réserves — ce que le prompt ne dit pas, ou dit autrement

Chaque point est une correction *proposée* ; les vetos de l'utilisateur priment.

### R1 — « Anonymisé » est faux : c'est de la **pseudonymisation**

`id_precollecteur` (`BARB-<COMMUNE>-2026-XXXX`) reste relié à l'identité par la table
`donnees_personnelles_barbechas`. Tant que cette liaison existe, la donnée est *pseudonyme*, et le
droit la traite comme personnelle. Le vocabulaire du code, des écrans et du contrat OpenAPI doit
dire « pseudonyme », pas « anonyme » : un mot faux ici se retourne contre la commune lors d'un
contrôle.

**Empreinte du CIN.** Un CIN tunisien compte 8 chiffres : 10⁸ possibilités, qu'un simple hash se
laisse énumérer en quelques secondes. L'empreinte n'a de valeur que si le secret est hors d'atteinte
de la base :

- `empreinte = HMAC-SHA256(cin_normalisé, clé_commune)`, calculée **dans l'API** (Node `crypto`),
  jamais en SQL : la clé ne doit traverser ni le journal de la base ni les traces de requêtes ;
- `clé_commune` est dérivée d'un **secret maître d'environnement** (jamais en base, jamais dans le
  dépôt) et du `commune_id` ;
- le CIN en clair n'est **jamais persisté ni journalisé** — y compris dans les journaux de requêtes
  HTTP, qui forment la fuite la plus courante ;
- l'empreinte ne sert qu'au dédoublonnage à l'inscription, par `UNIQUE (commune_id, empreinte)` ;
- **rotation de clé** : impossible de ré-empreinter (le CIN n'existe plus). Le dédoublonnage
  s'arrête donc aux inscriptions faites sous l'ancienne clé — à documenter, pas à cacher.

### R2 — La table `barbechas` porte plus que le CIN et la santé

La migration 008 crée aussi `name`, `user_id` (lien vers un compte) et
**`earnings_this_month_tnd`** — un revenu individuel. L'ajouter au nettoyage :

| Colonne | Proposition |
| :--- | :--- |
| `cin` | supprimée ; remplacée par l'empreinte (R1), du côté identité |
| `health_insurance_status` | supprimée (donnée de santé au sens large ; aucune finalité) |
| `name` | déplacée vers `donnees_personnelles_barbechas` |
| `earnings_this_month_tnd` | **supprimée du niveau individuel.** Le revenu n'existe qu'agrégé (par zone, par mois, sous un seuil minimal de participants). À arbitrer si la commune y tient. |
| `user_id` | supprimé de `barbechas` ; si un compte applicatif est requis, il se rattache côté identité |
| `code_id` | devient `id_precollecteur` (colonne réutilisée : le seed en pose déjà un) |

Onze autres migrations, une route, le seed et le contrat OpenAPI référencent `barbechas` : la
suppression est un **chantier de migration**, pas une ligne — RLS, audit, suppression logique,
fichiers et vues publiques sont à repasser un par un.

Les colonnes supprimées existent dans des **exports déjà sortis** : les retirer de la base ne les
rappelle pas. À traiter séparément (voir §6).

### R3 — Deux conditions techniques pour que la ligne rouge 2 soit réelle

La ligne rouge 2 réserve les listes nominatives à un hébergement étatique ou accrédité. La table
d'identité, elle, vit dans la base de SIIPI. Pour que les deux tiennent ensemble, **la base doit
refuser, pas l'écran** :

1. `donnees_personnelles_barbechas` n'accepte aucune écriture tant qu'un paramètre national
   `hebergement_pii_accredite` n'est pas passé à `true` par la FNCT (défaut : `false`). Jusqu'à
   cette date, tout est **fictif, de même format et de même longueur** que le réel.
2. Elle n'accepte aucune écriture pour une commune dont `parametres_commune.recepisse_inpdp` est
   vide : sans déclaration préalable, pas d'identité.

Politiques d'accès : seul `admin_commune` **de cette commune** lit la table — y compris **pas
`super_admin_fnct`** (la FNCT n'a pas de finalité à connaître l'identité d'un pré-collecteur d'une
commune). Chaque lecture est journalisée (service `accessLog`, déjà en place pour les citoyens).
Les agents de terrain, les pesées, les tournées, les bilans et les exports ne voient jamais que
`id_precollecteur`.

**Déclaration INPDP.** Le prompt affirme que l'émission de la carte relève d'un traitement de
données personnelles et que l'application « génère le formulaire pré-rempli pour le Maire ».
Ce n'est pas vérifié ici : la loi organique n° 2004-63 prévoit une déclaration préalable auprès de
l'INPDP, dont le site publie les formulaires ; qui est responsable du traitement, et si les photos
changent le régime (déclaration ou autorisation), c'est à **confirmer par un juriste de la FNCT**.
SIIPI peut produire un *brouillon* de déclaration — jamais un document présenté comme déposé.

### R4 — Densité : une matrice de valeurs, pas un facteur multiplicatif

Le prompt propose `densité de flux × facteur de compactage (1,8 à 2,5)`. Le calcul ne tient pas :

- DMA « standard humide » 0,40 × 1,8 → 2,5 = **0,72 à 1,00 t/m³**, au-delà de la plage des bennes
  tasseuses (0,5 à 0,7) que le prompt cite lui-même. Pour retomber sur 0,5-0,7 depuis 0,40, il
  faudrait un facteur de **1,25 à 1,75**.
- Un facteur de compactage appliqué aux **gravats** (1,2 t/m³) n'a aucun sens : on ne compacte pas
  des gravats.
- 0,40 t/m³ pour un DMA non compacté dépasse la plage du référentiel PCGD (0,2-0,3).

**Proposition.** Table `densites_reference (type_engin_compactant, flux, densite_min, densite_typique,
densite_max, source, date_effet)` — la densité **effective** de la caisse, compactage inclus, pour
chaque couple. Valeurs de départ = plages du référentiel PCGD, chacune sourcée :

| Engin | Flux | Plage de départ (t/m³) |
| :--- | :--- | :--- |
| Non compactant | DMA | 0,2 – 0,3 |
| Non compactant | Déchets verts | 0,15 – 0,3 |
| Compactant (benne tasseuse) | DMA | 0,5 – 0,7 |
| Tout engin | Démolition / gravats | 1,2 – 1,8 |

Les valeurs 0,20 / 0,40 / 1,20 du prompt sont à valider ou à remplacer ; la commune peut les
ajuster, avec une justification obligatoire et une date d'effet.

**Formule** (corrigée du prompt, qui l'avait déjà complétée) :

```
Tonnage séance = V_utile × τ_remplissage × densité(engin, flux) × n_voyages
Tonnage jour   = Tonnage séance × n_séances_jour
```

`V_utile` existe déjà : `vehicules.capacity_m3`.

**Trois garde-fous, dans la base :**

1. **Une estimation n'est pas une pesée.** Tout tonnage issu de la formule porte
   `provenance = 'estime'` (mécanisme de la migration 051) et **n'est jamais additionné** à un
   tonnage mesuré : les indicateurs affichent les deux séparément, ou n'affichent que le mesuré.
2. **Plausibilité.** Un tonnage estimé supérieur à `charge_utile_t × n_voyages` est signalé dans « À
   vérifier » (le contrôle existe déjà côté pesées, migration 036) ; la formule ne « corrige » pas.
3. **Fourchette, pas point.** L'écran montre `min – typique – max`, pas un chiffre à la décimale.
   Un seul nombre affiche une précision que l'estimation n'a pas.

### R5 — Redevance ANGeD : une table nationale, et une date d'effet

Le prompt déplace le taux dans `parametres_exercice_commune`. Deux réserves :

- **Le taux est national.** Le porter par commune et par exercice crée 350 copies à maintenir, donc
  350 occasions de diverger. Proposition : `parametres_nationaux_exercice (code, valeur, date_effet,
  source, saisi_par)`, tenue par la FNCT, **en lecture seule pour les communes**. Ce qui reste
  propre à une commune (densités ajustées, taux de remplissage, quotas) va dans une table communale
  historisée par `date_effet`.
- **Un tarif change à une date, pas à l'ouverture d'un exercice.** Historiser par `date_effet` et
  calculer avec le taux **en vigueur à la date de la pesée**. Un historique par exercice seul
  fausserait l'année du changement.

**Valeur.** Le prompt cite 6,5 TND/t en §5 et 6,516 TND/t en §4. Le référentiel PCGD donne
6,516 (ordre de grandeur observé, Bargou 2025). **Aucune de ces valeurs ne doit être saisie comme
officielle sans le barème et sa date d'effet** (pièce manquante, §6).

### R6 — La valeur vénale n'est pas l'amortissement

Le référentiel impose une décote **dégressive** de 10 % par an pour l'assurance (diapo 105). Le
coût complet PCGD amortit **linéairement**. Deux notions, deux champs, deux libellés : ne jamais
substituer l'une à l'autre.

### R7 — Les documents du prompt sont trois sur dix-sept

Le prompt demande quatre documents ; le référentiel en établit **17 réglementaires et 7 de suivi**
(voir son §2). Ceux qui alimentent le coût complet et manquent au prompt : le **carnet de bord**, la
**fiche de déclaration de panne**, le **quota carburant**. Le déclassement n'est pas une fiche mais
une **procédure** (§4, lot 16.4).

---

## 4. Découpage en versions

Une version se **clôt** sur trois conditions cumulées : le critère D4 passe ; le lot a tourné **un
mois complet chez la commune de recette** avec de vrais agents ; les défauts trouvés sont
consignés dans `journal-corrections-test-terrain`. Sinon, elle est *développée*, pas *livrée*.

Commune de recette — **proposition à confirmer** : Dar Chaâbane pour v0.16 (parc, personnel et
13 circuits déjà chargés, ce que les lots 16.x consomment) ; Djerba pour la carte et le GPS en
v0.17 (36 circuits, 2 855 points, mais ni personnel ni pesées).

### v0.16 — Conformité et pièces opposables

| Lot | Contenu | Bloque |
| :--- | :--- | :--- |
| **16.1** | Conformité `barbechas` (R1-R3) : suppression des colonnes, table d'identité séparée sous RLS restreinte, empreinte HMAC, garde-fous `hebergement_pii_accredite` et `recepisse_inpdp` | ✅ **Fait** (v0.15.5) — arbitrage rendu (D8) |
| **16.2** | Documents légaux à **numérotation scellée** : `sequences_documents` + `documents_emis` (numéro continu par commune / type / exercice, attribué sous verrou, jamais réutilisé, annulation avec motif, contenu figé), détection de trous, PDF bilingue via `scripts/skills/pdf-template.mjs` — *ordre de mission, bon carburant, bon de travail, fiche de déclaration de panne* | **Mécanique faite** (v0.15.6, migration 057, décision du 02/10 : sans attendre les gabarits) ; PDF bilingue en attente des gabarits validés par un chef de dépôt |
| **16.3** ✅ v0.15.7 | **Carnet de bord** (compteurs sortie/retour, séance, chauffeur, circuit, n° de bon de pesée ; distance *déduite*, jamais saisie), **bons de carburant** numérotés, **quota mensuel par engin**, ratio litres / km ou heures, écart au quota dans « À vérifier » | — |
| **16.4** ✅ v0.15.8 | **Dossier de déclassement** : cumul des dépenses / prix d'acquisition avec seuil de 80 % *affiché*, rapport de rendement (jours d'immobilisation / jours travaillés), pièces jointes (stockage 041), suivi du circuit d'autorisation | — (le prix et la date de mise en circulation existaient depuis la migration 032 : `valeur_achat_tnd`, `date_premiere_circulation`) |

Règles communes à 16.2-16.4 : **SIIPI constate, il ne décide pas.** Le seuil de 80 % s'affiche
« atteint / non atteint » ; il ne déclasse rien. Une surconsommation s'affiche comme un écart,
jamais comme une faute (le référentiel la traite comme *indicateur d'avarie*, diapo 42). Aucun
score, aucun classement de chauffeurs.

### v0.17 — Paramétrage et estimation

| Lot | Contenu |
| :--- | :--- |
| **17.1** | Paramètres communaux étendus (population permanente / saisonnière, production spécifique kg/hab/jour) — s'ajoute à `parametres_commune` (048), qui existe déjà |
| **17.2** | Moteur d'estimation volumétrique : `densites_reference`, formule R4, provenance `estime`, plausibilité |
| **17.3** ✅ v0.15.9 | Paramètres nationaux historisés (R5) : redevance ANGeD, ministère de tutelle et intitulés des en-têtes de documents — `definitions_parametres_nationaux` et `valeurs_parametres_nationaux` (migration 060), redevance au taux de la date de la pesée (`app.redevance_anged`) |
| **17.4** | Connecteur GPS : configuration webhook / clé API, réception de positions **d'engins uniquement**, comparaison au tracé standard, détection des points non desservis. **Bloqué** tant que la documentation des API des opérateurs n'est pas fournie. |

### v0.18 — Secteur informel (projet de décret sur le tri à la source, articles 13.1 et 14)

Source : `02-projet-decret-tri-source-art13-14.md`. **Le texte est un projet non en vigueur** :
tout ce lot est livré derrière le paramètre national `cadre_secteur_informel_actif` (faux par
défaut), et les durées (1 an, 2 ans, 3 ans, 6 mois) sont des paramètres historisés. **Dépend de
16.1 clos** (données nominatives) et du scellement de 16.2.

| Lot | Contenu | Bloque |
| :--- | :--- | :--- |
| **18.1** | **Registre communal des acteurs informels** : catégorie `pre_collecteur` / `intermediaire` déterminée par des faits (local, achat aux pairs, véhicule motorisé) avec signalement d'incohérence ; identifiant pseudonyme, table d'identité séparée (R1-R3) ; zone ; statut de la démarche de formalisation, daté | 16.1 |
| **18.2** | **Carte de pré-collecteur** : demande, trois attestations (déclaration d'activité simplifiée, engagement d'hygiène et de sécurité, acceptation de l'accompagnement), décision, numéro scellé, validité 1 an renouvelable, zones d'accès, retrait motivé. **Aucun champ de paiement** | 16.2 ; article 13 non fourni |
| **18.3** | **Suivi de la période transitoire** : jalons d'accompagnement par acteur (formation, régularisation, étalonnage), échéance des agréments d'intermédiaires délivrés par l'éco-organisme (SIIPI enregistre, n'agrée pas), tableau de conversion (tonnes détournées, redevance évitée, voyages économisés) en **provenance déclarée**, jamais additionné à un tonnage pesé | Date de départ de la période |
| **18.4** | *Prospectif* — interconnexion avec le registre de traçabilité de l'ANGeD (article 14) : consultation et export ; profil de lecture seule pour l'auditeur | Publication de la plateforme ANGeD |

Ne fait pas partie de SIIPI : l'agrément des intermédiaires, les registres cotés et paraphés, la
signature électronique qualifiée (on enregistre l'empreinte et la référence du certificat), la
géolocalisation individuelle des pré-collecteurs (ligne rouge 3).

### v0.19 — Mutualisation intercommunale

Points limitrophes (zones grises) sur carte collaborative ; registre de prêt d'engins (engin,
commune prêteuse, bénéficiaire, période, kilométrage, imputation du carburant).
C'est la **première exception délibérée au cloisonnement par commune** : consentement explicite à
double sens (la prêteuse ouvre, la bénéficiaire accepte, seules les deux voient), campagne de tests
dédiée dans `intercommunal.sh`, et **pas avant que v0.16-v0.18 aient tourné en production**.

---

## 5. Tests

- Une campagne `backend/tests/<lot>.sh` par lot, **enregistrée dans `package.json` (chaîne `test`)
  et dans `MIGRER.bat`** — sans quoi le critère D4 rétrécit en silence.
- Elle commence par **ce que la base refuse** :
  - 16.1 : insérer une identité sans récépissé INPDP ; insérer alors que l'hébergement n'est pas
    accrédité ; lire l'identité en tant que `super_admin_fnct` ; lire en tant qu'admin d'une autre
    commune ; retrouver `cin` ou `health_insurance_status` par `information_schema` ;
  - 16.2 : réutiliser un numéro ; émettre deux documents simultanément (numéros distincts) ;
    supprimer ou modifier un document émis ; combler un trou ;
  - 16.3 : compteur de retour inférieur au compteur de sortie ; litres négatifs ;
  - 17.2 : estimation qui s'additionne à un tonnage mesuré.
- Données de test fictives, de même format et longueur que le réel (`TEST-…`), nettoyées en fin de
  campagne.
- Toute nouvelle table : `ENABLE` **et** `FORCE ROW LEVEL SECURITY`, politique par
  `app.mes_communes()` (jamais `app.current_commune()`, qui n'est que la commune principale — le
  défaut qui est revenu trois fois), suppression logique par `app.supprimer`, journal d'audit.

---

## 6. Ce qui bloque encore, et qui le lève

| Blocage | Pour | Qui |
| :--- | :--- | :--- |
| Commune de recette à confirmer | tous les lots | Nacer |
| ~~`earnings_this_month_tnd` : supprimé ou agrégé ?~~ — **levé le 02/10 (D8)** : supprimé, agrégat seuillé | 16.1 | Nacer |
| Confirmation juridique : responsable du traitement, déclaration ou autorisation (photos), texte à citer (loi organique 2004-63) | 16.1, 18 | Juriste FNCT |
| Hébergement accrédité pour les identités nominatives : où, et quand | 16.1, 18 | FNCT / ANGeD |
| Gabarits des 4 documents à faire valider par un chef de dépôt en exercice | 16.2 | Commune de recette |
| Articles 4 et 13 du projet, date de départ de la période transitoire, sens exact du dernier alinéa arabe de l'article 13.1 (voir `02-…` § 5) | 18.2, 18.3 | FNCT / ministères |
| Barème ANGeD en vigueur et sa date d'effet | 17.3, coût complet | ANGeD |
| Documentation des API GPS (Orange, Ooredoo, prestataires locaux) | 17.4 | Opérateurs |
| Prix et date d'acquisition des engins de la commune de recette — l'inventaire de Dar Chaabane donne la valeur d'achat et la mise en circulation ; la facture d'acquisition reste à joindre engin par engin | 16.4 | Commune de recette |
| Exports antérieurs contenant `cin` / santé : purge à décider | 16.1 | Nacer / FNCT |

---

## 7. Traçabilité

- Source initiale : master prompt v0.16 (Gemini), 30/09/2026, analysé point par point dans la
  conversation de travail.
- Référentiel : `01-referentiel-depot-municipal.md` (119 diapositives, déposé 29/09/2026).
- Cadre légal des données personnelles : loi organique n° 2004-63 du 27 juillet 2004, appliquée par
  l'INPDP (vérifié le 30/09/2026).
- Projet de décret sur le tri à la source (définitions, articles 13.1 et 14), reçu le 30/09/2026 :
  `02-projet-decret-tri-source-art13-14.md`.
- Vérifié dans le dépôt : 32 campagnes `tests/*.sh` + `executer.sh` ; 32 enchaînées par `npm test` ;
  `barbechas` (008) porte `cin`, `name`, `user_id`, `earnings_this_month_tnd`,
  `health_insurance_status` ; `vehicules` porte `capacity_m3` et `charge_utile_t` mais ni prix ni
  date d'acquisition ; aucune table `fuel_logs` n'existe (le nom du prompt est indicatif — la
  convention est le français : `bons_carburant`).
