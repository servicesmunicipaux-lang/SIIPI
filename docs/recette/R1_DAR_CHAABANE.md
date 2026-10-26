# Recette R1 — Dar Chaâbane El Fehri, ou une commune qui part de zéro

> Le dossier de la recette terrain du **jalon 11** (v0.16 : barbechas, documents à numérotation
> scellée, carnet de bord et carburant, dossier de déclassement), avec l'écran *Coût de collecte* (lot C)
> en lecture. Source : `FEUILLE_DE_ROUTE.md` § 0 (ligne R1), § 5 (Recette R1) et § 6 (Niveau 2).
> Préparé le 9 octobre 2026 ; **mis à jour le 26 octobre 2026** (v0.15.82) après les décisions R1-a à R1-d
> (§ 2). **La recette n'a pas commencé** : elle attend le serveur de production et la commune.

**La commune n'est pas encore choisie** (décision du 26/10/2026). Ce sera Dar Chaâbane El Fehri, qui a un jeu
de démarrage réel, ou une commune du Grand Tunis qui part de zéro, pour éprouver la saisie depuis rien. Ce
dossier vaut pour les deux : là où ils diffèrent, il le dit.

Tant que R1 n'a pas eu lieu, le jalon 11 est **développé**, pas **livré**. Il le devient quand
trois conditions sont réunies (FEUILLE_DE_ROUTE § 5) : le critère d'acceptation passe ; le jalon a
tourné **un mois complet** dans la commune avec de vrais agents ; les défauts trouvés sont
consignés au [journal des corrections](JOURNAL_DES_CORRECTIONS.md), avec leur portée.

Pièces du dossier :

| Pièce | Pour qui |
|---|---|
| Ce document | La FNCT et l'exploitant : préparer, conduire et clore la recette |
| [Fiche quotidienne](FICHE_QUOTIDIENNE_R1.md), français et arabe | Le chef de dépôt, imprimée et affichée au dépôt |
| [Journal des corrections](JOURNAL_DES_CORRECTIONS.md) | Tout défaut trouvé, avec sa portée |
| `recette:etat -- <commune>` | L'état de la commune, en une page, à relancer chaque semaine |
| `docs/exploitation/INSTALLATION.md` § 7 | Démarrer la commune sur l'instance de production |

---

## 1. L'état de la commune

Une commande dit si la commune peut commencer, et sinon ce qui l'en empêche, avec le geste de chaque
préalable. Elle **ne modifie rien** (elle lit dans une transaction en lecture seule). Sur l'instance de
production :

```bash
docker compose --env-file .env -p siipi -f docker-compose.prod.yml run --rm --no-deps api npm run -s recette:etat:prod -- <identifiant de la commune>
```

Code de sortie : **0** prête, **3** pas prête, **1** commune introuvable, **2** usage.

Elle distingue trois choses :

1. **Les préalables**, qui empêchent de commencer : un compte propre de la commune, aucun compte de
   démonstration rattaché, des registres chargés (parc, personnel, circuits), aucune incohérence
   bloquante au panneau « À vérifier » ;
2. **Ce qui se recueille en route**, sans empêcher de commencer ;
3. **Les registres que la recette remplira**, vides avant elle — c'est attendu.

**État lu le 26 octobre 2026** pour Dar Chaâbane, sur la base de développement chargée dans l'ordre de
référence : **PAS PRÊTE — 2 préalables**.

| Préalable | État | Ce qu'il faut faire |
|---|---|---|
| Compte propre de la commune | **0** | § 3.1 |
| Compte de démonstration rattaché | OK : aucun (le rattachement de JC-001 n'existe plus) | — |
| Registres chargés | OK : 29 engins, 61 agents, 13 circuits | — |
| Incohérences bloquantes | **13** : les 13 circuits en régie n'ont aucun agent affecté | § 3.3 |

Jusqu'à la v0.15.81, la commande comptait **78** agents : les 17 agents fictifs retirés du jeu de
développement comptaient encore. Elle ne compte plus que les agents en service (v0.15.82).

Ces chiffres valent pour la base de développement, dont les 61 agents portent des **noms fabriqués**. Sur
l'instance de la recette, il n'y en aura aucun avant l'import du personnel (§ 3.2). **Relancer la commande sur
l'instance de la recette** avant de fixer la date avec la commune.

## 2. Les décisions du 26 octobre 2026

| # | Décision |
|---|---|
| R1-a | La recette se fait sur une **instance de production neuve** (`installer.sh`), jamais sur la base de développement. Elle attend le serveur de la DSI, ou un serveur virtuel temporaire |
| R1-b | Le personnel s'importe en **CSV** : Nom, Prénom, Fonction, Statut. Le fichier qui porte un salaire, un CIN, une donnée de santé, une adresse ou un téléphone est **refusé** |
| R1-c | Périmètre : le jalon 11, plus l'écran *Coût de collecte* en lecture (parcours P4). Le reste du jalon 12 (estimation, indicateurs du guide) est éprouvé à R2, chez M'hamdia |
| R1-d | Les quatre parcours du § 6 sont validés, P4 sur le coût de collecte |

**Règle de la recette : aucune campagne de tests ne tourne sur l'instance de la recette.** Le lanceur le
refuse de lui-même sur une base de production (v0.15.69). Les campagnes se lancent sur une pile d'essai
séparée.

## 3. Lever les préalables

### 3.1 Ouvrir le compte du chef de dépôt

La FNCT l'ouvre depuis le portail de la commune : *Annuaire et carte* → la commune → *Administration* →
*Comptes*. Le mot de passe provisoire s'affiche une fois ; il est **remis en main propre**, jamais par
message (aucun serveur de courriel n'est encore désigné). Le chef de dépôt le remplace à sa première connexion.

Les comptes de démonstration ne servent pas à la recette : sur une instance de production, ils n'existent pas.

### 3.2 Charger les registres

**Dar Chaâbane.** L'exploitant charge le jeu de démarrage réel (`INSTALLATION.md` § 7) :

```bash
docker compose --env-file .env -p siipi -f docker-compose.prod.yml run --rm --no-deps api npm run -s charger:dar-chaabane:prod
```

Les 13 circuits, les 29 engins et la masse salariale 2021-2024 du service entrent. **Aucun agent** : en
production, la commande refuse les noms fabriqués du jeu de développement, et les contenus de communication
d'exemple. Le chef de dépôt importe ensuite le personnel, comme ci-dessous.

**Une commune qui part de zéro.** Rien n'est chargé par l'exploitant ; la commune saisit depuis son portail :

| Registre | Le geste |
|---|---|
| Parc | « + Ajouter » → *Le parc (fichier CSV)*, ou un engin à la fois depuis *Parc* |
| Personnel | « + Ajouter » → *Le personnel (fichier CSV)*, ou *Personnel* → *Importer le personnel* |
| Circuits | *Circuits* → créer chaque circuit, ou importer le tracé d'un relevé de terrain (KML, GPX) |
| Masse salariale de l'année | *Personnel* → *Coût du service* → *Effectif et masse salariale du service* |

**L'import du personnel**, dans les deux cas. Un fichier CSV de quatre colonnes : `Nom`, `Prénom`, `Fonction`,
`Statut` (en-têtes en français ou en arabe : `اللقب`, `الاسم`, `الخطة`, `الصفة`). La fonction et le statut
s'écrivent en mots (« Chauffeur », « سائق ») ou par leur code ; un statut vide vaut « Titulaire ». L'écran montre
un aperçu ligne par ligne **sans rien écrire**, puis enregistre. Un agent déjà inscrit (même nom et prénom,
dans un ordre ou dans l'autre) n'est pas créé une seconde fois.

Le fichier est **refusé en entier**, la colonne nommée, s'il porte un salaire ou une prime, un numéro de CIN
ou de pièce d'identité, une donnée de santé, une adresse ou un téléphone — en-tête en français ou en arabe — ou
une case de huit chiffres (la forme d'un CIN ou d'un téléphone). C'est le cas d'une feuille de paie telle
quelle : en retirer ces colonnes avant l'envoi.

### 3.3 Affecter les équipes aux circuits

C'est le seul préalable que **seule la commune** peut lever : le registre du personnel dit qui
travaille au service, pas qui fait quelle tournée. La plateforme ne devine pas (règle d'or 1.5).
À Dar Chaâbane, deux feuilles du registre annoncent 48 et 39 agents, la paie en compte 60 (migration 038).

Avec le chef de dépôt, pour chaque circuit en régie (*Terrain & opérations* → *Circuits* → le circuit, ou
*Flotte, GMAO & dépôt* → *Personnel* → *Équipes*) : le chauffeur, le chef d'équipe s'il y en a un, les agents.
Ou, si un circuit est confié à un prestataire, le prestataire. Les lignes bloquantes du panneau « À vérifier »
disparaissent à mesure.

Compter une demi-journée sur place, liste du personnel en main.

## 4. Ce qui se recueille en route

Ces écarts n'empêchent pas de commencer. Ils se complètent pendant le mois, et la commande les
recompte chaque semaine (état du 26 octobre 2026, Dar Chaâbane, base de développement) :

| À recueillir | État | Où |
|---|---|---|
| Masse salariale de l'année du service | non renseignée (le jeu s'arrête à 2024) | *Personnel* → *Coût du service*. Sans elle, le personnel du coût de collecte est « non renseigné » |
| Prix du gasoil | non renseigné | Observatoire → *Paramètres nationaux* (FNCT). Sans lui, le carburant d'un engin sans plein enregistré est « non renseigné » |
| Classe et volume de benne des engins de circuit | à compléter dès qu'un engin est affecté à un circuit | *Parc* → la fiche de l'engin (lot T) |
| Prix d'achat d'un engin | 1 engin | *Parc* — sans prix, le seuil de 80 % du déclassement reste « non calculable » |
| En-tête des documents : ministère de tutelle, formule d'en-tête de l'État | non renseignés | Observatoire → *Paramètres nationaux* (FNCT) |
| Modèles des quatre documents (ordre de mission, bon de carburant, bon de travail, déclaration de panne) | provisoires | Avec le chef de dépôt, sur pièce : la validation se fait en changeant leur statut dans le code (décision du 16/10/2026) |
| Circuits sans exécutant ni engin | 13 | *Circuits* |
| Circuits sans point de collecte | 13 | *Circuits* — importer la trace ou saisir les arrêts principaux |
| Engins immobilisés sans date de début | 13 | *Déclassement* → immobilisations |
| Engin immobilisé sans motif | 1 | *Déclassement* → immobilisations |
| Engins en service affectés à aucun circuit | 10 | *Parc* — affecter, ou noter l'emploi réel (réserve, appui, atelier) |
| Engins « à réformer » sans dossier de déclassement | 3 | *Déclassement* → dossiers (parcours P3) |

Pour une commune qui part de zéro, la commande dresse la même liste une fois ses registres saisis.

## 5. Le déroulé

| Quand | Quoi | Qui |
|---|---|---|
| **Avant** | Le serveur est installé (`installer.sh`) ; la commune est choisie ; la FNCT pose le prix du gasoil et l'en-tête des documents | DSI, FNCT |
| **Semaine 0** — un jour sur place | Compte du chef de dépôt ; registres chargés ou saisis, personnel importé, masse salariale de l'année déclarée (§ 3.2) ; équipes affectées (§ 3.3) ; `recette:etat` rend « PRÊTE » ; deux heures de prise en main ; [fiche quotidienne](FICHE_QUOTIDIENNE_R1.md) imprimée et affichée | FNCT, exploitant, chef de dépôt |
| **Semaines 1 à 4** | Usage quotidien **sans assistance**, sur le registre réel de la commune | Chef de dépôt et son équipe |
| **Chaque semaine** — 30 minutes | Point au téléphone : relancer `recette:etat`, lire « À vérifier », relever les défauts au journal, cocher les parcours tracés | FNCT avec le chef de dépôt |
| **Fin du mois** | Bilan : critère de sortie (§ 7), défauts ouverts, décision de clôture | FNCT, commune |

« Sans assistance » veut dire : on ne montre pas comment faire pendant le mois. Une question
posée au téléphone est un constat — l'écran ne disait pas quoi faire — et se consigne au journal.

Une commune qui part de zéro compte une semaine 0 plus longue : la saisie de ses registres est elle-même
éprouvée. Une donnée saisie deux fois, ou une saisie qui n'a pas trouvé son écran, se consigne au journal.

## 6. Quatre parcours de bout en bout (validés le 26/10/2026)

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

### P4 — Une journée de pointage jusqu'au coût de collecte

Pointage du matin (*Personnel*) → équipes du jour sur les circuits → pesées de la journée →
*Coût de collecte* (pôle Pilotage), le mois en cours : par circuit, le personnel, le carburant, l'entretien,
l'amortissement et la redevance, chacun avec sa provenance.

*Ce qu'on doit voir* : aucun salaire individuel (la masse salariale est celle du service et de l'année,
répartie au prorata des jours pointés) ; aucun terme médical dans les motifs d'absence ; chaque montant dit
s'il est **réel** (un plein, une intervention) ou **tiré du guide** (« ratio du guide », « prix du guide ») ;
tant qu'une composante manque, le circuit n'a **pas de total**, et le coût à la tonne n'existe que pour un
circuit dont **tous** les voyages sont pesés. Des circuits « non renseignés » les premières semaines sont un
résultat attendu, pas un défaut.

## 7. Critère de sortie

La recette est réussie quand, à la fin du mois :

1. **Un mois complet** d'usage réel s'est écoulé, sans assistance ;
2. **Aucun écran ouvert sans savoir quoi y faire**, et **aucune donnée saisie deux fois**
   (FEUILLE_DE_ROUTE § 6) — c'est ce que le point hebdomadaire vérifie ;
3. **Les quatre parcours** ont été tracés en entier au moins une fois chacun ;
4. **`recette:etat`** a rendu « PRÊTE » à chaque point hebdomadaire ;
5. **Tout défaut** est au journal des corrections, avec sa portée ; les défauts bloquants sont
   corrigés, et la correction est éprouvée par une campagne quand une campagne peut la voir.

Alors le jalon 11 passe de *développé* à *livré*, et le CHANGELOG le dit.

## 8. Ce que R1 ne vérifie pas

| Hors de R1 | Pourquoi |
|---|---|
| Identités nominatives des pré-collecteurs (16.1) | L'hébergement des identités n'est pas accrédité : la base refuse toute identité. Le registre pseudonyme, lui, s'éprouve |
| Registre des acteurs informels (18.1) | Le cadre du secteur informel n'est pas en vigueur : l'écran n'apparaît pas |
| Estimation sans pont-bascule (17.2), indicateurs du guide (K), coût complet d'un bureau d'études (17.5) | Recette R2, chez M'hamdia (R1-c) |
| Connecteur GPS (17.4) | Sa recette se fait avec le fournisseur de Menzel Chaker, quand sa documentation sera reçue |

## 9. Données personnelles

La recette se fait sur le registre réel de la commune, dans son instance : les noms des agents y
sont saisis ou importés par la commune, pour son usage (loi organique n° 2004-63). L'import refuse tout ce que
le registre ne garde jamais (§ 3.2). **Rien n'en sort** : le journal des corrections décrit un défaut sans nom
d'agent, sans matricule, sans capture d'écran qui en montrerait un. Une capture utile se recadre ou se floute
avant d'être jointe. Un fichier du personnel transmis pour la recette ne se dépose ni dans le dépôt de code ni
dans un message : il reste à la commune, qui l'importe elle-même.
