# SPEC — SIIPI v0.19 : mutualisation intercommunale (jalon 14)

**Statut** : version 1 — 9 octobre 2026. **Proposition à valider par la FNCT.** Aucun code n'est
écrit : le jalon 14 s'ouvre **après que les jalons 11 à 13 ont tourné en production**
(`FEUILLE_DE_ROUTE.md` § 0 et § 5). Ce document le rend spécifiable dès maintenant, comme la
feuille de route le prévoit.

**Sources** : `FEUILLE_DE_ROUTE.md` (jalon 14), `SPEC_v0.16.md` § 4 (v0.19), le référentiel du
dépôt municipal (`01-referentiel-depot-municipal.md` § 4, diapositive 61 de la source), le code
et la base au 9 octobre 2026 (v0.15.19), et les relevés GPS réels de Djerba chargés dans la base
du poste. **Rien d'inventé n'est spécifié** : ce qui manque de pièces est écrit comme manquant
(§ 7).

**Comment la lire.** La section 1 dit ce qui existe et pourquoi cela ne suffit pas. La section 2
pose les principes. Les sections 3 et 4 décrivent les deux lots. La section 5 dit ce que le jalon
ne fait pas, la section 6 les tests, la section 7 ce que la FNCT doit trancher avant l'ouverture.

---

## 1. Ce qui existe, et pourquoi ça ne suffit pas

### 1.1 Le rattachement multi-communes donne tout, ou rien

`utilisateur_communes` (migrations 020 et 027) rattache un compte à une seconde commune. Les
politiques s'appuient sur `app.mes_communes()` : un directeur rattaché **lit et écrit tout** dans
la seconde commune (`app.can_read_commune`, `app.can_write_commune`). C'est le bon outil pour
un agent ou un prestataire qui sert plusieurs communes. C'est le mauvais pour un prêt : prêter un
camion à la commune voisine ne doit pas lui ouvrir le registre du personnel, les réclamations
des citoyens ni le carnet d'entretien de tout le parc.

Le jalon 14 a besoin d'un **partage par objet** — un engin, pour une période ; un point de
collecte, pour une desserte — consenti par les deux communes, et vu par elles seules.

### 1.2 Les verrous qui lient un engin à sa commune

La base refuse aujourd'hui tout usage d'un engin hors de sa commune. Ces verrous sont justes et
**restent** ; un prêt n'en relâche aucun en silence, il ouvre une exception datée et consentie.

| Verrou | Où |
|---|---|
| `app.controler_commune_engin()` — `ENGIN_AUTRE_COMMUNE` | huit tables : `carnets_de_bord`, `fuel_logs`, `quotas_carburant`, `interventions_maintenance`, `plans_entretien`, `fins_de_poste`, `immobilisations_engins`, `dossiers_declassement` |
| `PESEE_ENGIN_HORS_COMMUNE` | `pesees` (migration 036) |
| `app.emettre_bon_carburant()` | l'engin doit appartenir à la commune qui émet (migration 058) |
| `CARNET_CHAUFFEUR`, `CARNET_CIRCUIT` | le chauffeur et le circuit d'un carnet appartiennent à la commune de l'engin (058) |

### 1.3 Le partage existe déjà sur le terrain, et la plateforme ne le voit pas

Le rattachement d'un point de collecte à sa commune est **administratif** : aucune règle ne
vérifie qu'il est situé dans son territoire. Mesuré le 9 octobre 2026 sur les relevés GPS réels de
Djerba (base du poste, lecture seule ; contours communaux disponibles pour toutes les communes du
référentiel depuis D-FNCT-3 — la première rédaction disait 348 sur 350, mesure faite sur une base
d'essai d'où la campagne `decoupage` venait d'effacer le contour de Midoun, JC-007) :

| Commune du point | Points relevés | Situés hors de son territoire | Dont, en réalité, chez | À moins de 150 m d'une limite (dans son territoire) |
|---|---|---|---|---|
| Ajim | 238 | **40** (17 %) | Midoun : 39, jusqu'à 243 m de la limite ; en mer : 1 | 28 |
| Midoun | 1 700 | 7 | Houmt Souk : 7, jusqu'à 33 m | 40 |
| Houmt Souk | 917 | 4 | Midoun : 2 ; en mer : 2, à 8 m au plus | 53 |
| Dar Chaâbane | 82 | 0 | — | 6 |

Les camions d'Ajim collectent dans Midoun ; ceux de Midoun, dans Houmt Souk. C'est de la
mutualisation de fait, sans accord écrit dans la plateforme : si une tournée change, le point
cesse d'être desservi, et aucune des deux communes ne le voit. Les points « en mer » à quelques
mètres disent autre chose : la précision des contours, d'où une **tolérance** (§ 4.2).

### 1.4 Ce que dit le référentiel

La diapositive 61 du référentiel du dépôt municipal fait du partenariat entre communes « une
nécessité », en renvoyant à la **section 9 du Code des collectivités locales**, et l'illustre
surtout par l'**achat groupé** d'équipements lourds, conduit par une commission commune
(gouvernorats de l'Ariana en 2012, de Ben Arous en 2014, 2,5 millions de dinars). Elle ne décrit
**ni le prêt d'engin ni la desserte d'un point voisin** : la forme juridique de l'un et de
l'autre reste à confirmer (§ 7, D-1). SIIPI enregistre la référence de l'acte ; il ne le rédige
pas, et ne le remplace pas.

---

## 2. Principes

Ils déclinent les cinq règles d'or de `CLAUDE.md` pour la première exception délibérée au
cloisonnement.

1. **Consentement à double sens.** Une commune propose, l'autre accepte. **Rien n'est partagé avant
   l'acceptation.** Chacune peut clore avec un motif. La base refuse tout autre chemin.
2. **Un objet, jamais une commune.** On partage un engin pour une période, ou la desserte d'un
   point ; jamais l'accès à la commune voisine. Le rattachement multi-communes reste l'outil des
   agents partagés.
3. **Seules les deux voient.** La FNCT lit, comme partout, et ne décide pas (`CLAUDE.md` § 6). Aucune
   autre commune ne voit ni l'accord ni ce qu'il ouvre.
4. **Rien ne s'efface.** Un accord se clôt ; l'historique garde qui a utilisé quel engin, quand, et
   qui desservait quel point.
5. **Le propriétaire reste propriétaire.** Un engin prêté reste au parc de la prêteuse :
   inventaire, valeur d'achat, assurance, entretien, déclassement. L'**usage** pendant le prêt —
   carnet de bord, carburant, pesées — est imputé à la bénéficiaire.
6. **La plateforme constate, elle ne corrige pas.** Un prêt échu mais toujours utilisé, un point
   desservi hors de tout accord : ce sont des écarts montrés aux deux communes, jamais réconciliés
   en silence.
7. **Rien ne compte deux fois.** Un engin prêté n'entre pas dans le parc de la bénéficiaire ; une
   tonne pesée par un engin prêté n'est comptée qu'une fois, chez la commune qui l'a pesée (§ 3.5).

---

## 3. Lot 19.1 — Le registre des prêts d'engins

### 3.1 Le prêt

Une table `prets_engins`, sous `ENABLE` **et** `FORCE ROW LEVEL SECURITY` :

| Colonne | Règle |
|---|---|
| `vehicule_id` | L'engin prêté ; il appartient à la commune prêteuse (vérifié en base) |
| `commune_preteuse`, `commune_beneficiaire` | Distinctes |
| `date_debut`, `date_fin_prevue` | Un prêt a une fin prévue ; `date_fin_prevue >= date_debut` |
| `statut` | `propose` → `accepte` ou `refuse` ; `accepte` → `clos` ; `propose` → `retire` |
| `reference_acte` | La pièce qui fonde le prêt (convention, délibération : D-1) — **exigée à l'acceptation** |
| `imputation_carburant` | `beneficiaire` ou `preteuse` : qui paie le carburant consommé pendant le prêt |
| `conditions` | Texte libre : entretien courant, assurance, chauffeur fourni ou non |
| `compteur_remise`, `compteur_retour` | Le compteur à la remise (exigé à l'acceptation) et au retour (exigé à la clôture) ; retour ≥ remise |
| `date_retour_effective` | À la clôture ; un prêt peut finir avant ou après sa fin prévue |
| `motif` | Exigé pour un refus, un retrait, une clôture anticipée |
| `propose_par`, `accepte_par`, `clos_par`, et leurs dates | Imputés, jamais modifiés |

**Ce que la base refuse :**

- proposer un engin d'une autre commune, ou le prêter à sa propre commune ;
- proposer un engin réformé, en dossier de déclassement, ou immobilisé à la date de début ;
- deux prêts acceptés du même engin sur des périodes qui se chevauchent (contrainte d'exclusion
  sur la période) ;
- qu'une commune accepte son propre prêt : seul un administrateur **de la bénéficiaire** accepte ou
  refuse, seul un administrateur **de la prêteuse** propose, retire ou clôt — la FNCT ne fait rien
  de cela ;
- accepter sans référence d'acte ni compteur de remise ; refuser ou retirer sans motif ;
- modifier un prêt accepté autrement qu'en le clôturant ; effacer un prêt.

### 3.2 Ce que le prêt ouvre, et à qui

Pendant un prêt **accepté**, et pour les dates comprises entre `date_debut` et le retour :

- la bénéficiaire **voit** l'engin : immatriculation, type, charge utile, unité du compteur, état.
  Elle ne voit **pas** sa valeur d'achat, son carnet d'entretien ni son dossier de déclassement ;
- elle **inscrit** pour cet engin, à son nom et dans ses propres registres : carnet de bord,
  pesées, fins de poste, et le carburant si l'imputation est `beneficiaire` (bons émis dans **sa**
  numérotation scellée) ;
- la prêteuse **lit** ces écritures, pour cet engin et cette période seulement : c'est ce qui lui
  permet de suivre le kilométrage et la consommation de son bien.

Concrètement, `app.controler_commune_engin()` et `PESEE_ENGIN_HORS_COMMUNE` acceptent une écriture
dont la commune n'est pas la propriétaire **si et seulement si** un prêt accepté de cet engin à
cette commune couvre la **date de l'écriture** (date du carnet, du plein, de la pesée) — pas la
date du jour. Une écriture datée hors du prêt reste refusée, avec un message qui dit la période
du prêt.

**Pendant le prêt, la prêteuse n'écrit plus d'usage pour cet engin** (carnet, pesée, carburant) :
l'engin n'est pas chez elle. La base le refuse et dit « engin prêté à … jusqu'au … ; clore le prêt
si l'engin est revenu ». *(Choix proposé : D-2.)*

### 3.3 L'entretien et les pannes

L'entretien reste chez la prêteuse (principe 5). Une **panne pendant le prêt** est déclarée par la
bénéficiaire, qui en a la garde : elle crée une immobilisation que la prêteuse voit et instruit.
*(Choix proposé : D-3.)* Le quota mensuel de carburant reste celui de la prêteuse ; la
consommation pendant le prêt y est montrée à part, pour ne pas lire une surconsommation là où
l'engin a servi ailleurs.

### 3.4 Le kilométrage et le carburant

- Distance du prêt = `compteur_retour − compteur_remise`, déduite, jamais saisie.
- La somme des distances du carnet de bord de la bénéficiaire sur la période est comparée à cette
  distance : un écart est **montré** aux deux communes (principe 6), pas corrigé.
- Le carburant consommé pendant le prêt est une **assiette** (litres, montant) attribuée à la
  commune qui paie selon `imputation_carburant`. SIIPI ne facture rien d'une commune à l'autre
  (ligne rouge 5) : il exporte l'assiette.

### 3.5 Les indicateurs

| Indicateur | Commune prêteuse | Commune bénéficiaire |
|---|---|---|
| Inventaire, valeur du parc, déclassement | compte l'engin | ne le compte pas |
| Disponibilité du parc | l'engin est « prêté » : ni disponible ni immobilisé chez elle | ne le compte pas |
| L/100 km, carburant consommé | hors période de prêt | pendant le prêt |
| Tonnage pesé, coût à la tonne | ses propres pesées | ses propres pesées, y compris par l'engin prêté |

Une tonne n'est comptée qu'une fois : chez la commune qui l'a pesée.

### 3.6 Ce que montre « À vérifier »

Pour les deux communes, dans `app.incoherences_commune()` :

- un prêt **échu non clos** (fin prévue dépassée, toujours accepté) — avertissement ;
- un prêt **proposé depuis plus de quinze jours** sans réponse — information ;
- un **écart de kilométrage** entre les compteurs du prêt et le carnet de la bénéficiaire —
  information ;
- un engin prêté **immobilisé** pendant le prêt — information.

### 3.7 Écrans

- *Flotte, GMAO & dépôt* → *Parc* : un onglet **Prêts** — proposer, accepter ou refuser, clore ;
  les prêts en attente de réponse en tête. Sur la fiche d'un engin prêté, un bandeau « prêté à …
  jusqu'au … ».
- Chez la bénéficiaire, les engins empruntés apparaissent dans les listes du carnet, des pesées et
  du carburant, marqués « emprunté à … », et seulement pour les dates du prêt.
- Français et arabe, comme tout écran.

---

## 4. Lot 19.2 — Les points limitrophes

### 4.1 Le constat

Un point de collecte est **hors territoire** quand sa position n'est pas dans le contour de sa
commune ; **limitrophe** quand il est à moins d'une distance donnée de la limite (paramètre
national daté, D-5). La plateforme le calcule à chaque lecture, sans rien modifier, et le montre
dans « À vérifier » : « 39 points de vos circuits sont situés dans la commune de Midoun ; aucun
accord de desserte n'est enregistré. »

Une commune sans contour (aucune depuis D-FNCT-3, mais la règle demeure) : « non calculable », pas
« aucun point ».

### 4.2 La tolérance

Les contours ne sont pas exacts au mètre : trois points de Djerba sont « en mer », à 8 m au plus du
contour. Un point situé à moins d'une **tolérance** (paramètre national daté, D-5) hors de son
territoire n'est pas signalé comme hors territoire, mais comme limitrophe.

### 4.3 L'accord de desserte

Un **accord de desserte** dit qu'une commune dessert un point situé chez sa voisine :

- la commune qui dessert le **propose** ; la commune du territoire l'**accepte** ou le refuse avec
  motif ; chacune peut le clore ;
- il porte sur un point (ou une liste de points), une période, et la référence de l'acte (D-1) ;
- une fois accepté, le point hors territoire n'est plus un écart : la commune du territoire le voit
  sur sa carte, marqué « desservi par … », avec ses jours de passage — **rien d'autre** de la tournée
  voisine (ni l'équipe, ni les pesées, ni les autres arrêts) ;
- clos, l'accord laisse le point visible comme écart jusqu'à ce qu'une des deux communes agisse.

Ce lot ne déplace ni ne réattribue aucun point : il rend visible ce qui se fait, et le fait
consentir.

### 4.4 La carte collaborative

Sur une **bande** le long de la limite commune (largeur : le paramètre limitrophe), chacune des deux
communes voit les points de collecte de l'autre : position, type, commune qui dessert, jours de
passage. Pas les circuits, pas les équipes, pas les réclamations, pas les citoyens. C'est ce qui
permet de voir qu'un même dépôt est desservi deux fois, ou par personne.

*(Les réclamations citoyennes déposées près d'une limite sont hors de ce lot : D-6.)*

---

## 5. Ce que le jalon 14 ne fait pas

| Exclu | Pourquoi |
|---|---|
| Ouvrir l'accès à la commune voisine | Le partage porte sur un objet ; le rattachement reste l'outil des agents partagés |
| Attribuer automatiquement un point limitrophe | La commune décide, la plateforme instruit (`CLAUDE.md` § 6) ; et pas d'optimisation de tournée (ligne rouge 1) |
| Facturer un prêt ou un carburant entre communes | Ligne rouge 5 : SIIPI produit l'assiette, il ne facture pas |
| Suivre la position d'un engin prêté | Relève du connecteur GPS d'engins (17.4), s'il existe un jour ; jamais d'agent (ligne rouge 3) |
| L'achat groupé d'équipements (diapositive 61) | Marchés et fonction budgétaire exclus (`01-referentiel-depot-municipal.md` § 4) ; il pourra être **enregistré** comme origine d'un engin, pas conduit |

---

## 6. Tests

Une campagne par lot — `mutualisation-prets` et `mutualisation-limitrophes` — bâtissant ses
**deux communes de test** voisines, ses engins et ses points, et les retirant en partant ; aucune
condition autour d'un contrôle (`CLAUDE.md` § 7, `scripts/skills/audit-blocs.py`). La feuille de
route prévoyait d'éprouver le jalon dans `intercommunal.sh` ; deux campagnes à part sont proposées
parce que `intercommunal` éprouve le rattachement, un mécanisme différent qu'il ne faut pas
confondre.

Elles commencent par **ce que la base refuse** :

- **19.1** : prêter l'engin d'une autre commune ; prêter à soi-même ; accepter son propre prêt ;
  accepter sans acte ni compteur ; refuser sans motif ; deux prêts acceptés qui se chevauchent ;
  prêter un engin réformé ou immobilisé ; une écriture de la bénéficiaire datée hors du prêt ; une
  écriture de la prêteuse pendant le prêt ; un compteur de retour inférieur à la remise ;
  modifier ou effacer un prêt ; **une troisième commune qui voit le prêt ou l'engin** ;
- **19.2** : accepter son propre accord ; un accord sans acte ; **une troisième commune qui voit la
  bande** ; la commune du territoire qui voit autre chose de la tournée voisine que le point.

Puis ce qui marche : le cycle complet d'un prêt jusqu'à sa clôture, les écritures et leur
imputation, les indicateurs des deux côtés (une tonne comptée une fois), les écarts de « À
vérifier ». Les valeurs attendues des indicateurs viennent d'un **script témoin indépendant**,
comme pour le jumeau numérique (`CLAUDE.md` § 7).

---

## 7. À trancher avant l'ouverture

| # | Question | Qui | Proposition de ce document |
|---|---|---|---|
| D-1 | **Forme juridique** d'un prêt d'engin et d'un accord de desserte : convention signée par les deux présidents ? délibérations des deux conseils ? Le référentiel cite la section 9 du Code des collectivités locales pour l'achat groupé, pas pour le prêt | Juriste FNCT | SIIPI exige la **référence** d'un acte, sans en fixer la forme |
| D-2 | Pendant le prêt, une écriture de la **prêteuse** pour l'engin : refusée, ou montrée comme écart ? | FNCT | Refusée, avec la période du prêt dans le message |
| D-3 | Une **panne pendant le prêt** : qui la déclare, qui paie la réparation ? | FNCT | La bénéficiaire déclare ; la prêteuse instruit ; le paiement relève de l'acte (`conditions`) |
| D-4 | **Le chauffeur** : fourni par la prêteuse (un agent qui travaille chez la voisine) ou par la bénéficiaire ? Dans le premier cas, l'agent doit-il être rattaché à la bénéficiaire ? | FNCT | Chauffeur de la bénéficiaire par défaut ; un chauffeur prêté passe par le rattachement, déjà existant, pour la durée du prêt |
| D-5 | La **distance limitrophe** et la **tolérance** des contours | FNCT, avec le conseiller SIG | Paramètres nationaux datés ; valeurs à fixer sur les relevés de Djerba |
| D-6 | Une **réclamation citoyenne** déposée près d'une limite : transférable à la commune voisine, comme on transfère au prestataire ? | FNCT | Hors du jalon 14 ; à instruire avec le jalon 15 |
| D-7 | Les **communes de recette** du jalon 14 | FNCT, communes | Djerba (Ajim, Midoun, Houmt Souk) pour les points limitrophes : la mutualisation de fait y est mesurée (§ 1.3) |

**Préalable, inchangé** : les jalons 11 à 13 ont tourné en production (`FEUILLE_DE_ROUTE.md`). Les
recettes R1 et R2 sont différées ; le jalon 14 l'est donc aussi, quelle que soit la réponse à ces
questions.
