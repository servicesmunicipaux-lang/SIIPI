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
| **Correction** | v0.15.48 : la campagne crée son citoyen d'essai et un citoyen « témoin » domicilié, ne touche qu'au premier, et efface les deux en partant. L'ancienne remise à zéro générale a disparu, au début comme à la fin. |
| **Contrôle ajouté** | Trois contrôles en fin de campagne `citoyen` : le témoin garde sa commune, son adresse, sa position et son secteur ; les deux citoyens de la campagne sont effacés ; tous les autres citoyens de la base sont tels qu'elle les a trouvés (empreinte prise avant le premier geste). Le témoin est bâti : sans lui, ce dernier contrôle passerait à vide sur une base où personne n'a d'adresse. Éprouvé à rebours : l'ancienne remise à zéro, réinjectée, fait échouer deux contrôles. |

### JC-006

| Champ | |
|---|---|
| **Date** | 9 octobre 2026 |
| **Trouvé par** | Essai de la route `POST /communes/localiser` (D-FNCT-1) |
| **Où** | Toutes les routes qui lisent un corps JSON (constaté sur `/communes/localiser` et `/citoyen/adresse`) |
| **Constat** | Un corps JSON mal formé reçoit **500 « Erreur interne du serveur »** au lieu d'un 400 qui dise que la requête est illisible. |
| **Cause** | Établie le 16 octobre 2026 : le gestionnaire d'erreurs ne reconnaissait pas les erreurs du lecteur de corps d'Express (`entity.parse.failed` 400, `entity.too.large` 413, `charset.unsupported` et `encoding.unsupported` 415), qui tombaient dans « erreur interne ». Le journal des requêtes, monté après les lecteurs, ne voyait même pas ces requêtes. |
| **Portée** | Toute l'API, et pas seulement le JSON mal formé : un corps trop gros (413) et un jeu de caractères ou une compression illisibles (415) recevaient aussi 500. Un client mal écrit croyait à une panne du serveur ; le journal comptait de fausses erreurs internes. Aucune donnée n'est touchée. |
| **Gravité** | Gênant |
| **Correction** | v0.15.49 : le gestionnaire d'erreurs rend le statut de l'erreur de lecture (400, 413, 415) avec un message qui dit quoi corriger ; le journal des requêtes passe avant les lecteurs de corps et consigne ces refus. |
| **Contrôle ajouté** | Campagne `corps-illisibles` (18 contrôles), sur sa propre API pour lire son journal : routes publiques, routes sous compte et `/fichiers` (lecteur à part, 70 Mo) ; aucune « [error] », aucune réponse 500. Éprouvée à rebours : avec l'ancien gestionnaire, 14 contrôles échouent. |

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

### JC-008

| Champ | |
|---|---|
| **Date** | 9 octobre 2026 |
| **Trouvé par** | D-FNCT-4, en ajoutant le volume de l'archive froide à l'image de production |
| **Où** | `backend/Dockerfile` (image de production) et `docker-compose.prod.yml` |
| **Constat** | L'image tourne sous l'utilisateur `node`, mais ne crée pas le dossier `/var/siipi/fichiers`. Un volume nommé monté sur un dossier absent de l'image naît propriété de root : `node` ne peut pas y écrire. Éprouvé sur l'image construite : écriture refusée dans un tel volume. |
| **Cause** | Le dossier du volume n'était pas préparé dans l'image avant `USER node`. |
| **Portée** | Toute installation faite avec `docker-compose.prod.yml` : aucun dépôt de photo ni de document n'aurait abouti (503 « volume non accessible »), et l'API l'aurait signalé au démarrage. Aucune installation de production n'existe encore : défaut latent, sans donnée touchée. L'environnement de développement (`docker-compose.yml`, conteneur en root) n'était pas concerné. |
| **Gravité** | Bloquant (pour une mise en production) |
| **Correction** | v0.15.23 : l'image crée `/var/siipi/fichiers` et `/var/siipi/archive` et les donne à `node`. Vérifié sur l'image reconstruite : les deux volumes neufs sont accessibles en écriture. |
| **Contrôle ajouté** | Aucun automatique : les campagnes tournent dans le conteneur de développement, pas dans l'image de production. La vérification est consignée dans la note de v0.15.23. |

### JC-009

| Champ | |
|---|---|
| **Date** | 16 octobre 2026 |
| **Trouvé par** | Relecture de la campagne `citoyen`, en corrigeant JC-005 |
| **Où** | Campagne `citoyen` ; commune de Djerba Houmt Souk |
| **Constat** | La campagne pose ses secteurs, ses circuits et ses annonces d'essai dans Houmt Souk, commune réelle, avec les comptes de démonstration `directeur.houmtsouk` et `prestataire.houmtsouk`. Elle les efface en partant. |
| **Cause** | Écrite avant la règle « jamais un compte de démonstration pour écrire dans une commune réelle » (JC-001). |
| **Portée** | Toute base sur laquelle `npm test` a tourné. Pendant la campagne, Houmt Souk porte des secteurs, des circuits, des annonces et un signalement `TEST` ; une campagne interrompue les y laisse jusqu'au passage suivant. **Constaté le 16 octobre 2026, plus grave** : un secteur posé par la FNCT passe par une correction directe du découpage (`app.avant_correction_fnct`), qui fige l'état présent en « version 1 » si la commune n'a aucune version. La campagne effaçait en partant les versions qui citaient ses secteurs, mais pas cette version 1, validée, d'origine « initiale », qui annonce une « première modification enregistrée par la plateforme » qui n'a jamais eu lieu. Reproduit sur la pile d'essai en lançant la campagne seule. **Elle n'est pas la seule** : dans un `npm test` complet, la campagne `suppression`, qui tourne avant elle, fige déjà cette version 1 dans Houmt Souk (et dans Midoun), et `decoupage` laisse à Midoun une version 2 « Périmètre corrigé directement par la FNCT » — voir JC-010. La base du dossier principal n'en porte aucune (vérifié le 16/10/2026). La campagne effaçait aussi pour de bon les versions 2 et 3 qu'elle avait validées dans une commune réelle. |
| **Gravité** | Bloquant (fausse l'historique du découpage d'une commune réelle) |
| **Correction** | v0.15.50 : la campagne travaille dans sa commune de test (`test_citoyen`), avec un directeur temporaire (`tests/outils/directeur_temporaire.sh`) ; les comptes de démonstration n'y servent plus qu'à des refus (une autre commune, un prestataire), sans rien écrire. Son nettoyage est borné à sa commune de test : une ligne égarée dans une commune réelle y reste, et les contrôles la voient. La correction de cette seule campagne n'empêche pas, à elle seule, une version fantôme de naître pendant `npm test` : `suppression` et `decoupage` en créent encore (JC-010, ouverte). Une version 1 déjà laissée dans Houmt Souk par un passage antérieur n'est **pas** retirée par la correction : elle se reconnaît à son origine « initiale », à sa date (celle d'un passage des campagnes) et à l'absence de toute modification réelle du découpage ; la retirer d'une base réelle est une décision de la FNCT. |
| **Contrôle ajouté** | Dix contrôles dans la campagne `citoyen` : pendant qu'elle a ses lignes en base (section 9 bis), puis en partant, aucune annonce, aucun secteur, aucun circuit, aucune version de découpage ni aucun signalement n'a été ajouté, modifié ou retiré hors de sa commune de test (empreinte de chaque table hors commune de test, prise avant le premier geste) ; plus un contrôle que la commune de test porte bien les lignes de la campagne. Éprouvé par trois mutants qui refont dans Houmt Souk un geste de l'ancienne campagne : une annonce (2 contrôles échouent : annonces pendant et en partant), un secteur (4 : secteurs et versions du découpage), un circuit (2 : circuits). |

### JC-010

| Champ | |
|---|---|
| **Date** | 16 octobre 2026 |
| **Trouvé par** | Inventaire des versions fantômes de JC-009 |
| **Où** | Campagnes `suppression` (Houmt Souk, Midoun) et `decoupage` (Midoun) |
| **Constat** | Après un `npm test` complet sur la pile d'essai, trois versions du découpage subsistent dans des communes réelles : à Houmt Souk et à Midoun, une version 1 « initiale » validée, figée par `suppression` quand la FNCT y pose son « Secteur temporaire de test » ; à Midoun, une version 2 « Périmètre corrigé directement par la FNCT », posée par `decoupage` en corrigeant la limite de la commune avec le compte de démonstration de la FNCT. `suppression` efface les versions qui citent son secteur, pas la version 1 ; `decoupage` rend la limite officielle de Midoun (JC-007) mais n'efface aucune version. |
| **Cause** | Toute correction directe de la FNCT (secteur ou limite) passe par `app.avant_correction_fnct`, qui fige l'état présent en version 1 si la commune n'en a aucune, puis par `app.apres_correction_fnct`, qui inscrit la correction en version suivante. Les deux campagnes ont été écrites avant cet historique (migration 049) ou sans le restaurer. `versions-decoupage`, qui travaille aussi à Houmt Souk, relève les versions trouvées et rend exactement celles-là : elle n'est pas en cause. |
| **Portée** | Toute base sur laquelle `npm test` a tourné depuis la migration 049 : l'historique du découpage de Houmt Souk et de Midoun porte des versions validées qui n'ont jamais eu lieu, dont une correction de périmètre attribuée à la FNCT. Un écran ou un export de l'historique les présenterait comme réelles. `suppression` laissait aussi, à chaque passage, un « Secteur temporaire » supprimé de plus dans Houmt Souk et Midoun, visible dans la liste de ce que ces communes ont retiré. **Inventaire du 19 octobre 2026** (requête en lecture seule ; l'heure qui fait foi est l'insertion de la version au journal d'audit, la signature est un geste d'essai à 60 s près dans la même commune) : base du dossier principal, aucune version ; pile d'essai, trois versions fantômes (Houmt Souk v1 et Midoun v1 par `suppression`, Midoun v2 par `decoupage`) ; ancien volume `nacer_siipi_postgres_data`, arrêté à la migration 012, sans historique du découpage — inspecté sur une copie, retirée ensuite. Autres postes : non accessibles d'ici. |
| **Gravité** | Bloquant (fausse l'historique du découpage de deux communes réelles) |
| **Correction** | v0.15.51 : `suppression` travaille dans deux communes de test, chacune avec son directeur temporaire ; `decoupage` lit toujours le référentiel réel, mais fait toutes ses écritures de limite sur une commune de test qui porte une copie de la limite de Midoun — elle n'a plus à rejouer l'import officiel (JC-007). Le retrait des versions déjà laissées sur une base réelle reste une décision de la FNCT ; la correction n'y touche pas. |
| **Contrôle ajouté** | `tests/outils/communes_reelles.sh` relève, hors des communes de test, les secteurs (retirés compris), les versions du découpage et la limite de chaque commune (tracé, provenance, superficie, date), et les compare pendant que la campagne a ses lignes en base, puis en partant : six contrôles dans `suppression` et dans `decoupage`, plus, dans chacune, un contrôle que la commune de test porte bien les gestes de la campagne. Éprouvé par deux mutants qui refont l'ancien geste dans une commune réelle : un secteur posé par la FNCT à Houmt Souk (`suppression` : 4 contrôles échouent — secteurs et versions, pendant et en partant) ; la limite de Midoun corrigée par la FNCT (`decoupage` : 5 — versions et limites, pendant et en partant, et la limite officielle de Midoun). |

### JC-011

| Champ | |
|---|---|
| **Date** | 19 octobre 2026 |
| **Trouvé par** | Revue des campagnes, après JC-009 et JC-010 (lecture du code) |
| **Où** | Quinze campagnes portent la sélection. Douze écrivent dans la commune du directeur choisi : `assainissement`, `champs-points`, `contacts`, `exports`, `imports`, `kpi-sources`, `maintenance`, `notifications`, `notifications-citoyen`, `parametres`, `rapports`, `releves-terrain`. Trois l'emploient autrement : `comptes` (la première commune active par identifiant, puis son directeur, et à défaut le premier directeur de la base), `simulation-3mois` et `suggestions` — leur usage exact est mesuré par la revue en cours. |
| **Constat** | Chacune prend pour directeur « le premier directeur de la base » — `SELECT email FROM users WHERE role = 'admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1` — se connecte avec le mot de passe de démonstration, et écrit dans la commune de ce directeur. Sur la pile d'essai, c'est le compte de démonstration `directeur.marsa@siipi.tn` (vérifié le 19/10/2026) : les douze campagnes écrivent dans La Marsa, commune réelle. |
| **Cause** | Écrites avant la règle « jamais un compte de démonstration pour écrire dans une commune réelle » (JC-001) et avant `tests/outils/directeur_temporaire.sh`. Le choix du compte n'est pas nommé : il dépend de l'ordre de création des comptes de la base. |
| **Portée** | Sur toute base où `npm test` tourne, les douze campagnes écrivent dans la commune du plus ancien directeur actif. Sur la pile d'essai, c'est un compte de démonstration et La Marsa. **Sur une base qui porterait de vrais directeurs créés avant les comptes de démonstration, ou des comptes de démonstration désactivés, ce serait le plus ancien directeur réel, dans sa propre commune** ; la connexion échouerait alors (mot de passe de démonstration), et la campagne aussi — mais rien n'empêche que le mot de passe soit le même. Ce que chaque campagne laisse après elle dans la commune est mesuré par la revue en cours sur la pile d'essai (empreinte de la base avant et après chaque campagne) et sera consigné à part. Rappel : aucune campagne ne tourne sur une base de recette ni de production (`CLAUDE.md` § 9). |
| **Gravité** | Bloquant (une campagne choisit implicitement le compte et la commune où elle écrit) |
| **Correction** | **Corrigée en partie** — v0.15.52 : `notifications`, `notifications-citoyen` et `kpi-sources` (lot A, avec JC-012). v0.15.53 : les douze autres (lot B) — `assainissement`, `champs-points`, `contacts`, `exports`, `imports`, `maintenance`, `parametres`, `rapports`, `releves-terrain`, `comptes`, `simulation-3mois`, `suggestions` — travaillent dans leurs communes de test avec des comptes temporaires ; `exports` et `imports` posent leurs points d'essai sur deux circuits de leur commune de test, plus sur deux circuits réels de Dar Chaabane ; `parametres` a son citoyen d'essai, au lieu de régler puis remettre à vide les préférences du compte de démonstration ; `comptes` a son agent de la FNCT temporaire, et son contrôle de cloisonnement ne se saute plus quand une seule commune est activée ; les contrôles posés sous condition de trouver un compte (`contacts`, `rapports`, `maintenance`, `champs-points`, `exports`, `imports`) ne le sont plus. **Reste ouverte — portée élargie le 19/10/2026** : en préparant la garde, une recherche plus large (`FROM users WHERE role = '…' … LIMIT 1`) trouve douze autres campagnes qui empruntent « le premier » compte d'un rôle — `acteurs-informels`, `cout-complet`, `declassement`, `exploitation`, `parametres-communaux`, `parametres-nationaux` et `mot-de-passe-public` (le premier directeur rattaché à une commune, qu'elles rattachent le temps de la campagne à leur commune de test) ; `module2`, `module3` et `kpi-5-axes` (le premier prestataire) ; `fichiers` (le premier directeur d'une autre commune). Elles seront traitées au lot B2, avec la garde. Proposée : chaque campagne bâtit sa commune de test et son directeur temporaire (`tests/outils/directeur_temporaire.sh`), comme `module2` à `module6` depuis JC-001 ; quand elle doit éprouver un jeu réel, elle le nomme et le restaure, avec un contrôle en partant ; et une garde dans le lanceur (`tests/executer.sh`) ou dans un contrôle commun, qui fasse échouer une campagne contenant encore le choix « premier directeur de la base ». |
| **Contrôle ajouté** | Aucun encore. |

### JC-012

| Champ | |
|---|---|
| **Date** | 19 octobre 2026 |
| **Trouvé par** | Revue empirique des 60 campagnes sur la pile d'essai : base neuve chargée dans l'ordre de référence, puis chaque campagne de la chaîne `npm test` entre deux empreintes de la base, prises hors des communes de test et de démonstration ; les modifications détaillées colonne par colonne en relançant les campagnes en cause |
| **Où** | Campagnes `cloisonnement`, `audit`, `notifications`, `notifications-citoyen`, `kpi-sources` ; commune de La Marsa |
| **Constat** | Ces campagnes laissent des lignes dans La Marsa, commune réelle, à chaque passage : `cloisonnement`, une réclamation « Test automatise de cloisonnement » résolue, sa notification de décision et une ligne de `five_axis_scores` ; `audit`, une réclamation « Test audit », et l'engin `trk-02` (210 TU 9832) laissé à une autre position et une autre vitesse ; `notifications` et `notifications-citoyen`, trois notifications de citoyen chacune, dont la réclamation a été effacée ; `kpi-sources`, une ligne de `parametres_commune` créée pour La Marsa (valeurs remises à vide, signée du directeur de démonstration). Après un seul `npm test` complet, la pile d'essai porte à La Marsa 4 réclamations d'essai, 2 lignes de score et 9 notifications orphelines. **Complété le 19/10/2026, en corrigeant** : `cloisonnement` réécrivait aussi les notes de la fiche de La Marsa (« mise a jour legitime ») et `audit` son taux de recouvrement de la TCL (63,5), sans les rendre. La revue ne les avait vus qu'en date : relancée sur une pile où la valeur était déjà écrite, la campagne ne changeait plus que `updated_at`. Une relance ne montre pas ce que le premier passage a déjà changé. **Et La Marsa paraît déployée** : une commune est « active » au tableau national dès qu'une écriture de son directeur ou de son prestataire figure au journal d'audit (`app._saisies_communales`, migration 072) ; les écritures que ces campagnes faisaient avec le directeur de démonstration de La Marsa y restent, le journal étant en ajout seul. La campagne `observatoire` s'appuyait sans le dire sur cet effet : « les communes où l'on a travaillé sont actives » se vérifiait sur n'importe quelle commune active, en pratique La Marsa. |
| **Cause** | Ces campagnes écrivent avec des comptes de démonstration dans une commune réelle (JC-011 pour trois d'entre elles) et ne nettoient pas tout ce qu'elles posent. |
| **Portée** | Toute base sur laquelle `npm test` a tourné : les lignes s'y cumulent à chaque passage. Une réclamation résolue et une ligne de score entrent dans les indicateurs de La Marsa ; les notifications orphelines dans son historique de communication. La base du dossier principal n'a pas été mesurée ici ; aucune campagne n'y tourne en principe (`CLAUDE.md` § 9). Le journal des accès aux données personnelles (`access_log`) reçoit aussi les lectures de ces campagnes : ce journal, en ajout seul comme le journal d'audit, consigne des lectures qui ont eu lieu ; il n'est pas retenu comme défaut. |
| **Gravité** | Bloquant (fausse les indicateurs d'une commune réelle) |
| **Correction** | v0.15.52 : les cinq campagnes travaillent dans leurs communes de test, avec des comptes temporaires de tout rôle (`tests/outils/comptes_temporaires.sh`) ; leur nettoyage est borné à ces communes. `cloisonnement` bâtit trois communes (deux engins, un conteneur, deux secteurs, deux directeurs, deux prestataires, un citoyen) ; `audit` deux (directeurs, citoyen, engin) ; `notifications` et `notifications-citoyen` une, et effacent désormais toutes les notifications de leur commune, pas seulement celles dont le titre est le leur ; `kpi-sources` deux. `observatoire` bâtit l'activité qu'elle contrôle : une commune de test où son directeur temporaire écrit (elle doit être « active ») et une où seule la FNCT écrit (elle doit rester « incomplete ») ; la provenance des données se qualifie sur la première, plus sur La Marsa. Les lignes déjà laissées à La Marsa sur une base où les campagnes ont tourné ne sont pas retirées par la correction. |
| **Contrôle ajouté** | `tests/outils/base_reelle.sh` relève chaque table qui porte `commune_id` (66 sur la pile d'essai), sur les seules lignes des communes réelles, et la fiche de chaque commune réelle, dates comprises, et les compare pendant que la campagne a ses lignes en base, puis en partant : deux contrôles dans chacune des cinq campagnes, plus un contrôle que la commune de test porte bien les gestes de la campagne. Éprouvé par cinq mutants qui refont l'ancien geste à La Marsa (une réclamation, le taux de la TCL, une notification ×2, un paramètre) : chacun fait échouer exactement les deux contrôles, en nommant la table touchée. |

### JC-013

| Champ | |
|---|---|
| **Date** | 19 octobre 2026 |
| **Trouvé par** | Même revue empirique que JC-012 |
| **Où** | `versions-decoupage`, `imports`, `districts`, `wapla-bilans`, `wapla-scenarios`, `observatoire`, `cloisonnement`, `audit`, `kpi-5-axes`, `kpi-sources`, `barbechas`, `acteurs-informels`, `enlevements` |
| **Constat** | Ces campagnes rendent les valeurs qu'elles ont modifiées, mais laissent une date fausse. Certaines dates disent quelque chose à l'écran : la date de modification de la limite de Houmt Souk (`communes.boundary_maj_le`, `versions-decoupage`) ; la date d'import des points de deux circuits de Dar Chaabane (`circuits.points_importes_le`, `imports`) ; les cinq districts recréés et les 24 gouvernorats touchés (`created_at`, `updated_at`, `districts`) ; la date de modification du réglage WaPla (`wapla.reglages.modifie_le`). Les autres ne portent qu'un `updated_at` (La Marsa dans `communes`, paramètres nationaux, paramètres des indicateurs, paramètres de La Marsa) ou l'`adresse_maj` du citoyen de démonstration. |
| **Cause** | Restaurer une valeur par une écriture déclenche les horodatages de la table ; les campagnes ne restaurent pas la date. |
| **Portée** | Toute base sur laquelle `npm test` a tourné : une limite paraît modifiée, des points paraissent importés, des districts paraissent redéfinis le jour des campagnes. Aucune valeur métier n'est fausse. |
| **Gravité** | Gênant |
| **Correction** | **Ouverte.** Proposée : selon la campagne, travailler dans une commune de test, ou restaurer aussi la date ; avec un contrôle en partant qui compare la ligne entière, dates comprises. |
| **Contrôle ajouté** | Aucun encore. |
