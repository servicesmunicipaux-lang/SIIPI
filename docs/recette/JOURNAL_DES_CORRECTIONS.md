# Journal des corrections

`CLAUDE.md` § 9 et `FEUILLE_DE_ROUTE.md` § 5 et § 6 y renvoient : tout défaut trouvé — en recette
terrain surtout — s'y consigne **avec sa portée**, pas seulement sa cause. C'est l'une des trois
conditions de clôture d'une version (§ 5).

**Ce journal n'existait pas dans le dépôt** quand la recette R1 a été préparée (constat du
9 octobre 2026) : les documents le citaient, aucun fichier ne le portait. Les corrections
antérieures sont décrites dans les sections « Corrigé » du `CHANGELOG.md`. Les « cinq défauts
révélés seulement par l'usage réel » que cite `CLAUDE.md` § 9 n'y sont pas énumérés un par un ; ils
ne sont pas recopiés ici de mémoire. Le journal commence avec la préparation de R1.

Une numérotation plus ancienne a existé hors du dépôt : `backend/tests/suggestions.sh` cite « le
défaut n° 6 du journal » (travailler sur un circuit réel abîmait le jeu de Dar Chaabane). Les
identifiants `JC-` ne la prolongent pas ; un ancien numéro cité ailleurs renvoie à ce journal-là.

## Comment consigner

Une entrée par défaut, la plus récente en bas. Champs :

| Champ | Ce qu'on y écrit |
|---|---|
| **Identifiant** | `JC-` suivi d'un numéro continu (`JC-003`, `JC-004`…) |
| **Date** | Le jour du constat |
| **Trouvé par** | Recette R1 · préparation de recette · usage réel · campagne · relecture |
| **Où** | L'écran (nom du menu) ou la route d'API, et la commune |
| **Constat** | Ce qui s'est passé, et ce qu'on attendait |
| **Cause** | Si elle est connue ; sinon « non établie » — jamais une supposition présentée comme sûre |
| **Portée** | Ce qui d'autre est touché : quelles communes, quelles données, depuis quand, quelles autres routes ou écrans. **Obligatoire** : c'est elle qui dit si d'autres données sont fausses |
| **Gravité** | Bloquant (empêche de travailler ou fausse une donnée) · gênant · d'apparence |
| **Correction** | Version et PR, ou « ouverte » |
| **Contrôle ajouté** | La campagne qui verrait le défaut revenir, ou pourquoi aucune ne le peut |

**Aucune donnée personnelle** : ni nom d'agent, ni matricule, ni CIN, ni capture d'écran qui en
montre un (loi organique n° 2004-63). Un engin se désigne par son identifiant au parc.

---

## Entrées

### JC-001

| Champ | |
|---|---|
| **Date** | 9 octobre 2026 |
| **Trouvé par** | Préparation de recette (commande `recette:etat`) |
| **Où** | Campagnes `module2` à `module6` ; commune Dar Chaâbane El Fehri. *(Rectifié le 9 octobre 2026 : la première rédaction citait aussi `fichiers`, à tort — elle ne prend Dar Chaâbane que pour choisir un directeur, puis travaille dans la commune de celui-ci, La Marsa, et ne dépend pas du rattachement.)* |
| **Constat** | Le compte de démonstration `directeur.marsa@siipi.tn` est rattaché à Dar Chaâbane, avec droit d'écriture, sur la pile d'essai **et sur la base du dossier principal**. Personne ne l'a décidé. |
| **Cause** | `module2` rattache le premier directeur venu à Dar Chaâbane quand la commune n'a pas de directeur propre, « pour tourner sur une base fraîche », et ne retire que le rattachement du prestataire. Les campagnes suivantes (`module3` à `module6`) en dépendent : elles écrivent dans Dar Chaâbane avec ce compte. Vérifié : le rattachement clos, l'ancienne `module3` ne voit plus aucun engin de la commune (« vingt-neuf engins : attendu 29, obtenu 0 »). |
| **Portée** | Toute base sur laquelle `npm test` a tourné — donc `MIGRER.bat` et `TESTS.bat` sur le poste : le compte de démonstration, dont le mot de passe est public, peut écrire dans le registre réel de Dar Chaâbane. En production, ce mot de passe n'ouvre plus aucun compte depuis la v0.15.15 ; en développement, si. Les campagnes écrivent aussi leurs lignes de test dans la commune réelle — `CLAUDE.md` § 7 le savait (« travailler sur le jeu de Dar Chaabane l'abîme à chaque passage ») sans en tirer la règle pour une recette. |
| **Gravité** | Bloquant pour R1 : une recette sur des données qu'une campagne peut modifier ne prouve rien |
| **Correction** | **Corrigée pour le compte (v0.15.17).** `module2` à `module6` créent chacune leur propre directeur de Dar Chaâbane (`tests/outils/directeur_temporaire.sh`) — mot de passe de test à usage unique — et l'effacent en partant ; plus aucune campagne ne rattache ni n'emprunte un compte de démonstration. Le rattachement déjà posé sur une base n'est **pas** retiré par la correction : il se clôt à la main (date de fin, [R1 § 2.2](R1_DAR_CHAABANE.md#22-clore-le-rattachement-du-compte-de-démonstration)), et le clore ne casse plus aucune campagne. **Reste ouvert, et assumé :** ces campagnes éprouvent les données réelles de Dar Chaâbane (inventaire, effectif, circuits) — c'est leur objet, une commune de test vide n'éprouverait rien — et y écrivent puis effacent leurs lignes `TEST`. D'où la règle, inchangée : aucune campagne sur la base d'une recette. |
| **Contrôle ajouté** | `recette:etat` signale tout compte de démonstration rattaché (v0.15.16). `module2` vérifie en partant que la commune a exactement les accès trouvés à l'arrivée — contre-épreuve faite : directeur temporaire laissé en place, le contrôle échoue (v0.15.17). |

### JC-002

| Champ | |
|---|---|
| **Date** | 9 octobre 2026 |
| **Trouvé par** | Relecture, en préparant la recette |
| **Où** | `FEUILLE_DE_ROUTE.md` § 8 ; panneau « À vérifier » de Dar Chaâbane |
| **Constat** | La feuille de route annonçait **14** lignes bloquantes au panneau de cohérence de Dar Chaâbane ; sur une base chargée dans l'ordre de référence, le panneau en compte **13** — une par circuit en régie sans agent affecté. |
| **Cause** | Non établie : le chiffre de 14 a été écrit à une date où les données ou les règles du panneau différaient peut-être. |
| **Portée** | Documentation seulement : le panneau calcule à chaque lecture, aucune donnée n'est touchée. Mais un chiffre recopié qui se dessèche est ce que `CLAUDE.md` § 7 interdit. |
| **Gravité** | D'apparence |
| **Correction** | v0.15.16 : la feuille de route donne 13, avec la date, et renvoie à `recette:etat`, qui recompte au lieu de citer. |
| **Contrôle ajouté** | Aucun chiffre figé : `recette:etat` le recalcule à chaque lecture. |

### JC-003

| Champ | |
|---|---|
| **Date** | 9 octobre 2026 |
| **Trouvé par** | Relecture des campagnes (une campagne ne se déclare jamais « sans objet », `CLAUDE.md` § 7) |
| **Où** | Campagne `fichiers`, partie 4 « Le citoyen » ; fonctionnalité B5.1.3 (preuve de traitement) |
| **Constat** | La partie 4 imprimait son titre et **n'exécutait aucun contrôle** : ses treize contrôles — dépôt d'une photo par un citoyen, preuve de traitement adressée, et B5.1.3 de bout en bout (la clôture d'une réclamation ouvre la photo à son auteur, et à lui seul) — étaient enveloppés dans des `if` qui se sautaient sans rien dire. La campagne se comptait réussie (26/26). |
| **Cause** | Elle cherchait un citoyen ayant la commune de son directeur ; le seul citoyen du jeu de référence n'a pas de commune. Masqué par ce saut, un second défaut : la réclamation d'essai portait la catégorie `depot_sauvage`, que la migration 024 a renommée — l'insertion n'aurait jamais pu réussir. |
| **Portée** | B5.1.3 était marqué « Fait — campagnes fichiers et citoyen » dans la feuille de route ; `citoyen` ne touche pas à la preuve de traitement : **aucune campagne n'éprouvait réellement B5.1.3**. Une fois les contrôles rendus à la campagne, ils passent : le comportement de la plateforme était juste, seul le test manquait. La même construction — un bloc conditionnel autour de contrôles — se trouve dans d'autres campagnes : 30 blocs dans 16 campagnes, **non audités** à ce jour (certains peuvent être légitimes). |
| **Gravité** | Gênant : une garantie annoncée n'était pas vérifiée |
| **Correction** | v0.15.18 : `fichiers` bâtit sa commune de test, son directeur temporaire et son citoyen (inscrit par l'API, adresse déclarée dans la commune) ; plus aucun contrôle conditionnel — un administrateur d'une autre commune absent fait **échouer** le contrôle au lieu de le sauter ; catégorie `point_noir`. La campagne passe de 26 à 40 contrôles. Elle ne dépend plus ni de Dar Chaâbane ni d'un compte de démonstration pour écrire. |
| **Contrôle ajouté** | Les quatorze contrôles de la partie 4 eux-mêmes, dont « la réclamation d'essai est ouverte ». L'audit des 30 autres blocs conditionnels reste à faire. |

### JC-004

| Champ | |
|---|---|
| **Date** | 9 octobre 2026 |
| **Trouvé par** | Audit des blocs conditionnels de toutes les campagnes (suite de JC-003), outil `scripts/skills/audit-blocs.py` |
| **Où** | Campagnes `module5` (deux blocs), `module6`, `suggestions` |
| **Constat** | Sur 33 blocs de contrôles placés sous condition (28 `if … fi`, 5 formes courtes `[ … ] && chk`), **4 sautaient des contrôles** sur le jeu de référence, sans le dire : `module5` — l'envoi réussi d'une notification et la garantie « l'historique retient le nombre, pas les noms », ainsi que le refus de cibler le secteur d'une autre commune ; `module6` — le refus d'une pesée sur l'engin d'une autre commune ; `suggestions` — le refus de rattacher une proposition au circuit d'une autre commune. Les 29 autres ont tourné. |
| **Cause** | Le contrôle se choisissait sur une donnée qu'on espérait trouver : un citoyen joignable dans la commune (il n'y en a aucun), un secteur, un engin ou un circuit dans « la première autre commune » par ordre alphabétique (elle n'en a pas). |
| **Portée** | Cinq contrôles qui ne tournaient pas. **Une fois rendus, quatre passent** : la plateforme se comportait bien. **Le cinquième attendait une réponse fausse** : rattacher une proposition au circuit d'une commune hors de son périmètre rend 404 (introuvable, `CLAUDE.md` § 5), pas 400 — le test, écrit sans jamais tourner, contredisait la règle. Le 400 existe bien : pour un directeur rattaché aux deux communes, qui voit le circuit ; il est désormais éprouvé aussi. Les 29 autres blocs tournent sur le jeu de référence, mais **restent fragiles** : si la donnée qu'ils cherchent disparaissait, ils se sauteraient en silence — l'outil d'audit le dirait. |
| **Gravité** | Gênant : des garanties annoncées n'étaient pas vérifiées |
| **Correction** | v0.15.19 : chaque contrôle bâtit l'objet qu'il éprouve, dans une commune de test retirée en partant — un secteur, une publication, un engin, une pesée, un circuit ; un citoyen d'essai rend un envoi possible, un carré de dix mètres sans adresse le rend impossible : les deux chemins tournent à chaque passage. Plus aucune condition autour de ces contrôles. |
| **Contrôle ajouté** | `scripts/skills/audit-blocs.py` : sur le journal d'un `npm test` de référence, il nomme tout contrôle sous condition qui n'a pas tourné, et sort en erreur. Éprouvé sur les campagnes d'avant la correction : il retrouve les cinq contrôles. |

### JC-005

| Champ | |
|---|---|
| **Date** | 9 octobre 2026 |
| **Trouvé par** | Relecture de la campagne `citoyen`, en l'étendant pour D-FNCT-1 |
| **Où** | Campagne `citoyen`, au début et à la fin |
| **Constat** | La campagne exécute `UPDATE citoyens SET commune_id = NULL, adresse = NULL, position = NULL, zone_id = NULL` **sans condition** : elle efface l'adresse de **tous** les citoyens de la base, pas seulement celle du compte d'essai. |
| **Cause** | Écrite pour une base de démonstration, où le seul citoyen est `citoyen.demo`. |
| **Portée** | Toute base sur laquelle `npm test` tourne — `MIGRER.bat`, `TESTS.bat`, dont celle du dossier principal. Sur une instance où de vrais citoyens auraient déclaré leur adresse, chaque passage des campagnes l'effacerait : plus d'horaires de collecte, plus de ciblage des notifications, sans que personne ne le voie. |
| **Gravité** | Bloquant pour toute base portant de vrais citoyens |
| **Correction** | **Ouverte.** Proposée : que la campagne bâtisse son propre citoyen d'essai (comme `fichiers` et `module5` depuis JC-003 et JC-004) et ne touche qu'à lui. En attendant : la règle de `CLAUDE.md` § 9 — aucune campagne sur une base réelle. |
| **Contrôle ajouté** | Aucun encore. |

### JC-006

| Champ | |
|---|---|
| **Date** | 9 octobre 2026 |
| **Trouvé par** | Essai de la route `POST /communes/localiser` (D-FNCT-1) |
| **Où** | Toutes les routes qui lisent un corps JSON (constaté sur `/communes/localiser` et `/citoyen/adresse`) |
| **Constat** | Un corps JSON mal formé reçoit **500 « Erreur interne du serveur »** au lieu d'un 400 qui dise que la requête est illisible. |
| **Cause** | Non établie ; vraisemblablement le gestionnaire d'erreurs ne reconnaît pas l'erreur d'analyse du corps levée par Express. |
| **Portée** | Toute l'API : un client mal écrit croit à une panne du serveur ; le journal compte de fausses erreurs internes. Aucune donnée n'est touchée. |
| **Gravité** | Gênant |
| **Correction** | **Ouverte.** |
| **Contrôle ajouté** | Aucun encore ; une campagne pourra envoyer un corps mal formé à une route et attendre 400. |

### JC-007

| Champ | |
|---|---|
| **Date** | 9 octobre 2026 |
| **Trouvé par** | D-FNCT-3, en étendant la campagne `decoupage` |
| **Où** | Campagne `decoupage`, section « Remise en état » ; commune de Djerba Midoun |
| **Constat** | La « remise en état » **effaçait** le contour officiel de Midoun (`boundary_geom = NULL`) et demandait de relancer l'import à la main. |
| **Cause** | Le contour officiel n'était pas remis : seul le tracé d'essai était retiré. |
| **Portée** | Toute base où `npm test` a tourné sans `import:decoupage` après : Midoun sans territoire — signalements non localisés, superficie et densités non calculables, la commune « hors de toute commune » pour l'application citoyenne (D-FNCT-1). Deux documents en ont gardé une mesure fausse : la note de v0.15.21 (rectifiée avant fusion) et la spécification du jalon 14 (« 348 communes sur 350 », rectifiée en v0.15.22). |
| **Gravité** | Gênant |
| **Correction** | v0.15.22 : la campagne rejoue l'import officiel en partant et vérifie que Midoun a retrouvé son contour officiel et sa superficie. |
| **Contrôle ajouté** | Deux contrôles en fin de campagne `decoupage`. |
