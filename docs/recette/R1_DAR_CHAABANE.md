# Recette R1 — Dar Chaâbane El Fehri

> Le dossier de préparation de la recette terrain du **jalon 11** (v0.16 : barbechas,
> documents à numérotation scellée, carnet de bord et carburant, dossier de déclassement).
> Source : `FEUILLE_DE_ROUTE.md` § 0 (ligne R1), § 5 (Recette R1) et § 6 (Niveau 2).
> Préparé le 9 octobre 2026. **La recette n'a pas commencé** : la commune n'est pas encore
> disponible.

Tant que R1 n'a pas eu lieu, le jalon 11 est **développé**, pas **livré**. Il le devient quand
trois conditions sont réunies (FEUILLE_DE_ROUTE § 5) : le critère d'acceptation passe ; le jalon a
tourné **un mois complet** chez Dar Chaâbane avec de vrais agents ; les défauts trouvés sont
consignés au [journal des corrections](JOURNAL_DES_CORRECTIONS.md), avec leur portée.

Pièces du dossier :

| Pièce | Pour qui |
|---|---|
| Ce document | La FNCT et l'exploitant : préparer, conduire et clore la recette |
| [Fiche quotidienne](FICHE_QUOTIDIENNE_R1.md), français et arabe | Le chef de dépôt, imprimée et affichée au dépôt |
| [Journal des corrections](JOURNAL_DES_CORRECTIONS.md) | Tout défaut trouvé, avec sa portée |
| `npm run recette:etat -- <commune>` | L'état de la commune, en une page, à relancer chaque semaine |

---

## 1. Avant de commencer : l'état de la commune

Une commande dit si la commune peut commencer, et sinon ce qui l'en empêche. Elle **ne modifie
rien** (elle lit dans une transaction en lecture seule) :

```bash
docker compose exec -T api npm run recette:etat -- nabeul_dar_chaabane_el_fehri
```

Sur une instance de production : `npm run recette:etat:prod -- nabeul_dar_chaabane_el_fehri`.
Code de sortie : **0** prête, **3** pas prête, **1** commune introuvable, **2** usage.

Elle distingue trois choses :

1. **Les préalables**, qui empêchent de commencer : un compte propre de la commune, aucun compte de
   démonstration rattaché, des registres chargés (parc, personnel, circuits), aucune incohérence
   bloquante au panneau « À vérifier » ;
2. **Ce qui se recueille en route**, sans empêcher de commencer ;
3. **Les registres que la recette remplira**, vides avant elle — c'est attendu.

**État lu le 9 octobre 2026** sur la pile d'essai, base chargée dans l'ordre de référence
(`CLAUDE.md` § 7) : **PAS PRÊTE — 3 préalables**.

| Préalable | État | Ce qu'il faut faire |
|---|---|---|
| Compte propre de la commune | **0** | § 2.1 |
| Compte de démonstration rattaché | **1** (`directeur.marsa@siipi.tn`) | § 2.2 |
| Registres chargés | OK : 29 engins, 78 agents actifs, 13 circuits | — |
| Incohérences bloquantes | **13** : les 13 circuits en régie n'ont aucun agent affecté | § 2.3 |

Ces chiffres valent pour la base d'essai. **Relancer la commande sur l'instance où se fera la
recette** avant de fixer la date avec la commune.

## 2. Lever les préalables

### 2.1 Ouvrir le compte du chef de dépôt

La FNCT l'ouvre depuis le portail de la commune : *Annuaire des communes* → Dar Chaâbane →
*Administration* → *Comptes*. Le mot de passe provisoire s'affiche une fois ; il est **remis en main
propre**, jamais par message. Le chef de dépôt le remplace à sa première connexion.

Les comptes de démonstration ne servent pas à la recette : leur mot de passe est publié avec le
code, et en production il n'ouvre aucun compte (v0.15.15).

### 2.2 Clore le rattachement du compte de démonstration

Le compte de démonstration `directeur.marsa@siipi.tn` est rattaché à Dar Chaâbane, avec droit
d'écriture. Ce rattachement n'a pas été voulu : la campagne de tests `module2` l'a posé pour
tourner sur une base neuve, et ne le retire pas ([JC-001](JOURNAL_DES_CORRECTIONS.md#jc-001)).
Tant qu'il est ouvert, quiconque connaît le mot de passe public écrit dans le registre réel de la
commune.

Il se **clôt**, il ne s'efface pas (règle d'or 1.4) : l'historique garde qui a eu accès, et
quand. Aucun écran ne le fait encore ; l'exploitant l'exécute dans Adminer ou `psql` :

```sql
UPDATE utilisateur_communes
   SET date_fin = CURRENT_DATE - 1
 WHERE commune_id = 'nabeul_dar_chaabane_el_fehri'
   AND user_id IN (SELECT id FROM users WHERE email = 'directeur.marsa@siipi.tn');
```

Puis relancer `recette:etat` : la ligne doit passer à `[OK]`.

> **Règle de la recette : ne jamais lancer `MIGRER.bat`, `TESTS.bat` ni `npm test` sur la base
> de la recette.** Les campagnes `module2` à `module6` et `fichiers` travaillent sur Dar Chaâbane
> elle-même et y rattachent un compte de démonstration (JC-001). Les campagnes se lancent sur une
> pile d'essai séparée, jamais sur des données réelles en cours de recette.

### 2.3 Affecter les équipes aux 13 circuits

C'est le seul préalable que **seule la commune** peut lever : le registre du personnel dit qui
travaille au service, pas qui fait quelle tournée. Le dossier reçu de la commune ne le dit pas non
plus — deux feuilles du registre annoncent 48 et 39 agents, la paie en compte 60 (migration 038).
La plateforme ne devine pas (règle d'or 1.5).

Avec le chef de dépôt, pour chacun des 13 circuits en régie (*Terrain & opérations* →
*Circuits* → le circuit, ou *Flotte, GMAO & dépôt* → *Personnel*) : le chauffeur, le chef
d'équipe s'il y en a un, les agents. Ou, si un circuit est
confié à un prestataire, le prestataire. Les 13 lignes bloquantes du panneau « À vérifier »
disparaissent à mesure.

Compter une demi-journée sur place, liste du personnel en main.

## 3. Ce qui se recueille en route

Ces écarts n'empêchent pas de commencer. Ils se complètent pendant le mois, et la commande les
recompte chaque semaine (état du 9 octobre 2026 sur la base d'essai) :

| À recueillir | Combien | Où |
|---|---|---|
| Prix d'achat d'un engin | 1 engin | *Parc* — sans prix, le seuil de 80 % du déclassement reste « non calculable » |
| En-tête des documents : ministère de tutelle, formule d'en-tête de l'État | non renseignés | Observatoire → *Paramètres nationaux* (FNCT) |
| Modèles des documents (ordre de mission, bon de carburant, bon de travail, déclaration de panne) | à valider sur pièce | Avec le chef de dépôt : la numérotation scellée est faite (16.2), la mise en page attend ces modèles |
| Circuits sans exécutant ni engin | 13 | *Circuits* |
| Circuits sans point de collecte | 13 | *Circuits* — importer la trace ou saisir les arrêts principaux |
| Engins immobilisés sans date de début | 13 | *Déclassement* → immobilisations |
| Engin immobilisé sans motif | 1 | *Déclassement* → immobilisations |
| Engins en service affectés à aucun circuit | 10 | *Parc* — affecter, ou noter l'emploi réel (réserve, appui, atelier) |
| Engins « à réformer » sans dossier de déclassement | 3 | *Déclassement* → dossiers (parcours P3) |
| Fiche d'évaluation de l'année | pas commencée | *Indicateurs* |

## 4. Le déroulé

| Quand | Quoi | Qui |
|---|---|---|
| **Semaine 0** — un jour sur place | Préalables levés (§ 2) ; `recette:etat` rend « PRÊTE » ; deux heures de prise en main ; [fiche quotidienne](FICHE_QUOTIDIENNE_R1.md) imprimée et affichée | FNCT, exploitant, chef de dépôt |
| **Semaines 1 à 4** | Usage quotidien **sans assistance**, sur le registre réel de la commune | Chef de dépôt et son équipe |
| **Chaque semaine** — 30 minutes | Point au téléphone : relancer `recette:etat`, lire « À vérifier », relever les défauts au journal, cocher les parcours tracés | FNCT avec le chef de dépôt |
| **Fin du mois** | Bilan : critère de sortie (§ 6), défauts ouverts, décision de clôture | FNCT, commune |

« Sans assistance » veut dire : on ne montre pas comment faire pendant le mois. Une question
posée au téléphone est un constat — l'écran ne disait pas quoi faire — et se consigne au journal.

## 5. Quatre parcours de bout en bout

Le § 6 de la feuille de route demande trois parcours complets ; ils y sont écrits pour une commune
qui utiliserait tout le portail (signalement citoyen, pointage, prestataire). Dar Chaâbane éprouve
le **jalon 11** : les parcours ci-dessous en sont l'adaptation. **Adaptation à valider par la
FNCT** avant la semaine 0.

Chacun doit être tracé **au moins une fois en entier** pendant le mois, avec de vraies données.

### P1 — Une tournée

Sortie de l'engin au carnet de bord (*Carnet & carburant* : compteur de sortie, séance, chauffeur,
circuit) → pesée au retour (*Pesées*, avec le numéro du bon de pesée) → retour au carnet (compteur
de retour) → consommation du mois en L/100 km.

*Ce qu'on doit voir* : la distance est **déduite** des deux compteurs, jamais saisie ; un compteur
de retour inférieur à celui de sortie est refusé ; la pesée est rattachée à son circuit.

### P2 — Un plein

Bon de carburant émis (*Carnet & carburant* → émettre un bon : numéro scellé, continu ; le plein
est enregistré du même geste) → quota mensuel de l'engin → écart au quota dans « À vérifier ».

*Ce qu'on doit voir* : un bon émis ne se modifie ni ne s'efface ; il s'annule avec un motif, et son
numéro reste au registre. Une surconsommation s'affiche comme un **écart**, jamais comme une faute.

### P3 — Un engin à réformer

Immobilisation datée et motivée (*Déclassement* → immobilisations) → dossier de déclassement
(pièces, inventaire des dépenses, rapport de rendement) → seuil de 80 % du prix d'achat
**affiché** → étapes du circuit d'autorisation.

*Ce qu'on doit voir* : la plateforme affiche « seuil atteint » ou « non atteint » ; **elle ne
déclasse jamais** un engin. Sans prix d'achat : « non calculable », pas un calcul à vide.

### P4 — Une journée de pointage jusqu'au coût à la tonne

Pointage du matin (*Personnel*) → équipes du jour sur les circuits → pesées de la journée →
*Indicateurs* → « Coût global à la tonne » (masse salariale, carburant, maintenance et redevances,
divisés par le tonnage pesé).

*Ce qu'on doit voir* : aucun salaire individuel (le coût existe au niveau du service et de
l'année) ; aucun terme médical dans les motifs d'absence ; tant qu'une des quatre composantes du
coût manque, l'indicateur dit **non renseigné**, jamais 0 — c'est un résultat attendu des
premières semaines, pas un défaut.

## 6. Critère de sortie

La recette est réussie quand, à la fin du mois :

1. **Un mois complet** d'usage réel s'est écoulé, sans assistance ;
2. **Aucun écran ouvert sans savoir quoi y faire**, et **aucune donnée saisie deux fois**
   (FEUILLE_DE_ROUTE § 6) — c'est ce que le point hebdomadaire vérifie ;
3. **Les quatre parcours** ont été tracés en entier au moins une fois chacun ;
4. **`recette:etat`** a rendu « PRÊTE » à chaque point hebdomadaire ;
5. **Tout défaut** est au journal des corrections, avec sa portée ; les défauts bloquants sont
   corrigés, et la correction est éprouvée par une campagne quand une campagne peut la voir.

Alors le jalon 11 passe de *développé* à *livré*, et le CHANGELOG le dit.

## 7. Ce que R1 ne vérifie pas

| Hors de R1 | Pourquoi |
|---|---|
| Identités nominatives des pré-collecteurs (16.1) | L'hébergement des identités n'est pas accrédité : la base refuse toute identité. Le registre pseudonyme, lui, s'éprouve |
| Registre des acteurs informels (18.1) | Le cadre du secteur informel n'est pas en vigueur : l'écran n'apparaît pas |
| Mise en page des documents (16.2) | Elle attend les modèles validés sur pièce pendant R1 ; la numérotation scellée s'éprouve, elle |
| Coût complet, paramètres étendus (jalon 12) | Recette R2, chez M'hamdia |

## 8. Données personnelles

La recette se fait sur le registre réel de la commune, dans son instance : les noms des agents y
sont saisis par la commune, pour son usage (loi organique n° 2004-63). **Rien n'en sort** : le
journal des corrections décrit un défaut sans nom d'agent, sans matricule, sans capture d'écran
qui en montrerait un. Une capture utile se recadre ou se floute avant d'être jointe.
