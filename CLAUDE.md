# CLAUDE.md — mémoire de travail du projet SIIPI

Ce fichier est lu au début de chaque session. Il contient ce qu'il faut savoir
**avant** de toucher au code : les commandes, les conventions, et les cinq
règles qu'on ne discute pas.

> **Système d'Information Intelligent pour la Propreté Intercommunale**
> Fédération Nationale des Communes Tunisiennes — 350 communes.
> Propriété intellectuelle : FNCT. Hébergement : Tunisie. Données personnelles :
> voir « Références légales » au §2.

**Où reprendre :** `FEUILLE_DE_ROUTE.md` § 0 donne l'ordre des jalons (S0, puis v0.16 → v0.19), ce qui
est prêt et ce qui bloque. Les pièces métier sont dans `docs/specs_metier/` (lire `SPEC_v0.16.md`).

**Consigne de reprise (30/09/2026, nuit).** La recette terrain est différée : elle reste
l'objectif de clôture d'une version mais ne bloque plus l'ouverture des jalons
suivants. Les lots 17.1, 17.3 et 17.5 peuvent avancer en parallèle de R1 ; 17.2 et
17.4 restent suspendus à leurs préalables externes. Ordre : S0, S1 (jumeau
numérique), jalon 11. **S0 est fait (v0.15.2, v0.15.3) sauf la carte du conseiller SIG,
attendue lundi 5 octobre. S1 est fait (v0.15.4), 16.1 aussi (v0.15.5), et la mécanique de
16.2 (v0.15.6, numérotation scellée) ; sa mise en page attend les gabarits validés par un chef de
dépôt. 16.3 est fait (v0.15.7 : carnet de bord, bons de carburant, quota, L/100 km), 16.4
aussi (v0.15.8 : dossier de déclassement, seuil de 80 % affiché, rapport de rendement, circuit
d'autorisation). Le jalon 11 est développé ; reste la mise en page des documents de 16.2.
Au jalon 12, 17.3 est fait (v0.15.9 : paramètres nationaux datés, redevance ANGeD au taux de la
date de la pesée), 17.1 aussi (v0.15.10 : population permanente et de saison, production
théorique), 17.5 aussi (v0.15.11 : rejeu du coût complet d'un bureau d'études, écarts E1 à E8 ;
le fichier réel de M'hamdia reste hors du dépôt public). Restent 17.2 et 17.4, suspendus.**

---

## 1. Les cinq règles d'or

Elles priment sur toute élégance technique. Un correctif qui en viole une est un
défaut, pas un correctif.

### 1.1 Une donnée manquante n'est pas un zéro

Un indicateur dont la source n'est pas tenue **ne s'affiche pas**. Il n'affiche
pas `0`, il n'affiche pas `—` en prétendant calculer : il dit *non renseigné*.

> Un tableau de bord qui montre « 0 accident » alors que personne ne tient le
> registre des accidents est plus dangereux qu'un tableau vide : il sera lu
> comme vrai, et opposé un jour à un prestataire ou à un conseil municipal.

Concrètement : `app.mesures_kpi_auto()` ne rend **aucune ligne** quand le
registre qui la nourrit est vide. Ne jamais remplacer cette absence par un
`COALESCE(..., 0)`.

### 1.2 Le cloisonnement vit dans la base, jamais seulement dans l'écran

Chaque table métier porte `commune_id`, `ENABLE` **et** `FORCE ROW LEVEL
SECURITY`, et des politiques qui s'appuient sur `app.can_read_commune()` /
`app.can_write_commune()`. Une route qui oublierait de filtrer ne verra
malgré tout que les lignes autorisées.

**« Sa commune » a deux sens** et c'est la source de trois défauts passés :
`users.commune_id` est le rattachement **principal** ; `app.mes_communes()` est
le **périmètre réel**, rattachements multi-communes compris. Tout contrôle
d'accès se réfère au second.

### 1.3 L'heure est celle de Tunis (UTC+1)

Les colonnes `DATE` sont transmises **en texte**, sans conversion (voir
`backend/src/db.ts`). Par défaut le pilote en ferait un objet `Date` à minuit
heure serveur, que `JSON.stringify` convertirait en UTC : le 1er septembre
deviendrait `2026-08-31T23:00:00Z`, et un contrôle du lundi s'afficherait le
dimanche. **Le bug est invisible sur un serveur en UTC — donc invisible en
développement.**

### 1.4 Rien ne s'efface

Suppression **logique** partout : `deleted_at` + `deleted_by`, via
`app.supprimer(table, id)` — seule voie offerte à l'API, et sa liste blanche
dit ce qui est supprimable. Une affectation se **clôt** (`date_fin`), elle ne
disparaît pas : la tournée de la semaine dernière garde l'équipe qui l'a faite.

**Une seule exception, assumée : le jeu de démonstration** (jumeau numérique,
migration 055). `app.retirer_jeu_demo()` efface vraiment la commune de
démonstration et tout ce qu'elle contient. La suppression logique protège un
historique réel ; une pesée simulée n'est l'historique de rien, et la garder
« supprimée » laisserait du faux en base. L'exception est tenue par la base :
la fonction est réservée à la FNCT et refuse toute commune réelle.

### 1.5 La plateforme constate, elle ne corrige pas

Quand deux registres se contredisent, on **montre l'écart** avec ce qu'il y a à
faire — jamais une réconciliation silencieuse. C'est l'objet de
`app.incoherences_commune()`. Une plateforme qui « nettoierait » ces écarts
ferait disparaître le seul signal disponible sur la qualité des données de la
commune.

---

## 2. Ce qu'on ne stocke jamais

Protection des données personnelles (voir « Références légales » ci-dessous).
La base **n'a pas** ces colonnes, et c'est vérifié par les campagnes de tests
avant toute autre chose :

| Interdit | Pourquoi |
|---|---|
| Salaire individuel, prime, indemnité | Le coût existe au niveau du **service** et de l'**année** (`effectifs_service`) |
| CIN, numéro de pièce d'identité | Aucune finalité dans un outil de propreté. Seule exception, encadrée : l'**empreinte** HMAC du CIN d'un pré-collecteur, pour le dédoublonnage (lot 16.1) — le CIN lui-même n'est jamais écrit |
| Donnée de santé, diagnostic, motif médical | Le vocabulaire des absences ne comporte volontairement **aucun** terme médical |
| Adresse personnelle d'un agent | — |

**Donnée de test :** toute donnée personnelle fournie en test (CIN, téléphone,
salaire, nom d'agent) est remplacée par une valeur **fictive de même format et
de même longueur**.

**Photos :** les métadonnées EXIF sont retirées au dépôt. La position GPS qu'elles
contiennent est **rendue à l'appelant** pour qu'il la propose — jamais conservée
à l'insu de la personne qui a pris la photo.

### Références légales

Le texte qui régit les données à caractère personnel est la **loi organique n° 2004-63
du 27 juillet 2004**, appliquée par l'**INPDP** (Instance nationale de protection des
données personnelles). Jusqu'à confirmation par un juriste de la FNCT :

- dans tout document neuf, citer la **loi 2004-63** pour la minimisation, la
  finalité, l'information des personnes et la déclaration des traitements ;
- les anciennes références légales qui subsistent dans des commentaires, des
  migrations ou le contrat OpenAPI sont **retirées au lot S0** (voir
  `FEUILLE_DE_ROUTE.md` § 0) ; avant de toucher à une migration déjà appliquée,
  vérifier si le migrateur en contrôle l'empreinte ;
- la règle « toute donnée personnelle fournie en test est remplacée par une
  valeur fictive de même format et de même longueur » reste **inchangée**.

---

## 3. Commandes

### Poste de travail (Windows, Docker Desktop)

| Script | Ce qu'il fait |
|---|---|
| `DEMARRER.bat` | **Le seul guide de démarrage** (expliqué par `DEMARRAGE.md`) : conteneurs, migrations, jeux dans l'ordre de référence, contrôle de `/health`. Rejouable |
| `RELANCER.bat` | Redémarrage simple |
| `MIGRER.bat` | **Le passage obligé après toute modification** : migrations, seeds, régénération des types du front, typage, puis `npm test` — le contrat d'API et **toutes** les campagnes inscrites dans `backend/package.json` |
| `TESTS.bat` | Les campagnes seules |
| `VERIFIER.bat` | Diagnostic en lecture seule |
| `CHARGER_DJERBA.bat` / `RECHARGER_DAR_CHAABANE.bat` | Rechargement des jeux réels |
| `POUSSER.bat` | Envoi vers GitHub (les identifiants restent chez l'utilisateur) |

### Dans les conteneurs

```bash
docker compose exec -T api npm run migrate            # migrations en attente
docker compose exec -T api npm run verifier:contrat   # toute route servie est documentée
docker compose exec -T api npm test                   # verifier:contrat + toutes les campagnes (41 au 08/10/2026)
docker compose exec -T api npm run test:module4       # une seule campagne
docker compose run  --rm web npx tsc --noEmit         # typage du front
```

### Régénérer les types du front

```bash
docker compose run --rm web npx openapi-typescript http://api:4000/openapi.json -o src/lib/api-types.ts
```

> `npm run types:api` vise `localhost:4000`, ce qui est faux dans un conteneur :
> `localhost` y désigne **ce conteneur**. Les services s'adressent par leur nom.

---

## 4. Pile technique

| Couche | Choix | Note |
|---|---|---|
| Base | PostgreSQL 16 + PostGIS 3.4 | 62 migrations au 08/10/2026, rejouées sur base neuve à chaque livraison |
| API | Node 22 + Express + TypeScript (ESM) | zod pour la validation |
| Contrat | OpenAPI 3.1 **généré depuis les schémas zod d'exécution** | la documentation ne peut pas décrire autre chose que ce qui est contrôlé |
| Front | React 19 + Vite + Tailwind v4 + Leaflet | PWA (`manifest.webmanifest`, `sw.js`) |
| Langues | i18next — FR / AR avec RTL | |
| Déploiement | Docker Compose | volume `siipi_fichiers` pour les octets déposés |

---

## 5. Conventions de code

### Le code parle français

Noms de variables, de fonctions, de composants, commentaires, messages
d'erreur : **en français**. C'est la langue des personnes qui maintiendront ce
code à la FNCT. `communeDemandee`, `cheminRelatif`, `incoherences_commune`,
`PhotoDeposee` — pas `getCommune`, `relPath`, `FileImage`.

Exceptions : ce qu'impose une bibliothèque (`useEffect`, `className`), et les
identifiants du cahier des charges (`B5.1.3`, `M3.1`).

### Les commentaires disent *pourquoi*, jamais *quoi*

```ts
// ✗ Incrémente le compteur
// ✓ Le champ est remis à zéro : sans cela, rechoisir le même fichier après un
//   échec ne déclencherait aucun événement, et l'écran paraîtrait figé.
```

Un commentaire qui paraphrase le code est du bruit. Un commentaire qui explique
la décision — surtout le contre-exemple qu'elle évite — vaut une heure de
débogage six mois plus tard.

### TypeScript

`strict`, `noUnusedLocals`, `noUnusedParameters`. **Ne jamais faire taire le
compilateur avec `!` sur un objet d'authentification** : c'est ainsi que
`req.user!.id` (qui n'existe pas ; le champ est `sub`) a vécu neuf fois dans le
code, écrivant `NULL` dans toutes les colonnes d'imputation.

### Bilinguisme et RTL — non négociable

- Toute chaîne visible passe par `t('...')`, et la clé existe **dans `fr.json`
  et dans `ar.json`**. Une clé absente d'une des deux langues est un défaut.
- Propriétés **logiques** en Tailwind : `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`,
  jamais `ml-`/`mr-`/`left-`/`right-`.
- Toute mise en page se vérifie dans les deux sens.

### Navigation

Tout espace de travail à plusieurs écrans — portail communal **et** observatoire
national de la FNCT — navigue par `BarreLaterale` (pôles métier, rétractable,
tiroir sur téléphone, tiroir à droite en arabe). Pas de barre d'onglets
horizontale : sur téléphone, elle cache la majorité de ses onglets sans le dire.
Un nouvel écran se déclare dans le tableau `ENTREES` de l'espace concerné, avec
son pôle et ses deux libellés (FR et AR).

### Base de données

- Une migration est **numérotée, jamais modifiée après application** : on en
  ajoute une nouvelle. Depuis la v0.15.2, **le migrateur le vérifie** : il garde
  l'empreinte SHA-256 de chaque migration appliquée (`schema_migrations.empreinte`,
  fins de ligne ramenées à LF) et **s'arrête** si un fichier ne lui correspond
  plus. Un changement de texte dans une migration ancienne (un `COMMENT ON`, par
  exemple) se porte donc par une migration nouvelle — sinon il n'atteindrait que
  les bases créées après lui (voir `053_references_legales.sql`).
- Idempotente : `IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP ... IF EXISTS`.
- `CREATE OR REPLACE FUNCTION` ne peut pas changer un type de retour :
  `DROP FUNCTION IF EXISTS app.f(args);` d'abord — et **le `GRANT` qui suit
  devient alors indispensable**.
- Chaque table, chaque colonne non évidente porte un `COMMENT ON`. C'est la
  seule documentation que lira l'administrateur dans dix ans.
- Les contraintes portent les règles métier : un refus sans motif, une
  validation sans point créé, une décision sans date sont refusés **en base** —
  pas seulement dans l'écran.

### Routes Express

- Les chemins littéraux se déclarent **avant** `/:id`. Ce piège s'est présenté
  cinq fois : `/personnel/effectif` pris pour un identifiant.
- Erreurs : `ApiError(statut, message en français, actionnable)`. Le message dit
  quoi faire, pas seulement ce qui ne va pas.
- Un enregistrement hors périmètre est **introuvable** (404), jamais « refusé » :
  un refus renseignerait sur son existence.

---

## 6. Charte fonctionnelle

### Gouvernance

| Rôle | Périmètre |
|---|---|
| `super_admin_fnct` | Les 350 communes. Ne décide pas à la place d'une commune (ni acceptation de réclamation, ni validation de point) |
| `admin_commune` | Sa commune, ou l'ensemble de ses rattachements (`app.mes_communes()`) |
| `gestionnaire_prestataire` | Ses zones sous contrat. Traite une réclamation transférée, **ne peut pas la refuser** |
| `citoyen` | Ses propres données, ses propres signalements |

### Le fil rouge

**La commune décide, la plateforme instruit.** Elle prépare, mesure, signale et
propose — elle ne tranche pas à la place de l'agent. Un rang de tournée déduit
est *signalé comme déduit*. Un doublon probable est *mesuré*, pas supprimé.

### Documents administratifs

Les documents légaux (ordre de mission, bon de sortie carburant, fiche de
déclassement, bon de travail) suivent la forme attendue par l'administration
tunisienne : en-tête de la commune, références réglementaires, numérotation
continue, signatures. Ils sont **bilingues** et imprimables en A4.

**La numérotation est scellée par la base** (migration 057) : un document ne s'émet que
par `app.emettre_document()` (numéro attribué sous verrou, dans la même transaction),
ne s'annule que par `app.annuler_document()` (motif obligatoire, numéro conservé), et ne
se modifie ni ne s'efface. L'application n'a aucun droit d'écriture directe sur le
registre. Un nouveau type de document s'ajoute à la liste de `documents_emis` — jamais par
une table à part, qui aurait sa propre numérotation à prouver.

---

## 7. Protocole de validation — avant toute livraison

### Le critère d'acceptation

**Avant de commiter, l'unique critère d'acceptation technique est le passage
sans erreur de :**

1. **`npm run verifier:contrat`** — toute route servie est documentée ;
2. **toutes les campagnes `backend/tests/*.sh`** — pas « celles qui concernent
   la tâche ». Elles étaient 41 au 08/10/2026 (S0 a ajouté `assainissement`,
   S1 `simulation-3mois`, 16.1 `barbechas`, 16.2 `documents`, 16.3 `exploitation`,
   16.4 `declassement`, 17.3 `parametres-nationaux`, 17.1 `parametres-communaux`,
   17.5 `cout-complet`).

Les deux se lancent d'une seule commande, qui les enchaîne dans cet ordre :

```bash
docker compose exec -T api npm test
```

Le dossier `backend/tests/` contenait **42 fichiers `.sh`** au 08/10/2026 : 41
campagnes et `executer.sh`, le lanceur, qui n'est pas une campagne. Ces chiffres
ne sont pas des valeurs à retenir mais à **recalculer** — un critère d'acceptation qui se
dessèche sans bruit est pire qu'aucun :

```bash
ls backend/tests/*.sh | grep -vc executer                       # campagnes présentes
grep -o '"test": "[^"]*"' backend/package.json | grep -o 'executer.sh [a-z0-9-]*' | sort -u | wc -l   # campagnes enchaînées par npm test
```

Les deux nombres doivent être **égaux**. S'ils diffèrent, une campagne existe
sans être exécutée : la tâche n'est pas terminée. *(La seconde commande ne lit
que la chaîne `test` depuis la v0.15.2 : l'ancienne comptait aussi les scripts
`test:<campagne>`, si bien qu'une campagne retirée de la chaîne mais gardée en
script à part restait comptée.)*

**Une campagne ne se déclare jamais « sans objet ».** Jusqu'à la v0.15.2,
`suggestions` s'arrêtait en SUCCÈS quand elle ne trouvait pas de compte citoyen :
`npm test` la comptait réussie alors qu'aucun de ses contrôles n'avait tourné — et
ce silence cachait un défaut réel (migration 054). Une campagne bâtit ses propres
données ; si elle ne le peut pas, elle **échoue**.

**Ordre de chargement de référence** (celui d'une installation réelle, et celui
dans lequel les campagnes sont écrites) : `migrate`, `seed`, `import:decoupage`,
`seed:dar-chaabane`, `seed:parc`, `seed:personnel`, `seed:communication`.

**Aucun nombre de tests ne s'écrit** dans un message de commit, un rapport ou
un CHANGELOG sans avoir été lu dans la sortie d'une commande. Un chiffre
recopié d'un prompt ou d'un souvenir (« 240/240 ») n'a jamais été mesuré.

### Ce que le critère ne couvre pas

Les campagnes interrogent l'API et la base ; elles ne voient ni le front ni la
rejouabilité des migrations. Ces deux contrôles restent des **préconditions** :

1. **Chaîne de migrations rejouée sur une base neuve** (000 → la dernière), puis
   la nouvelle migration **rejouée une seconde fois** pour prouver son
   idempotence.
2. **`npm run lint`** côté backend **et** côté web. Le front n'est pas typé par
   Vite : il se transpile sans vérifier, et c'est ainsi qu'un composant a planté
   au rendu sur une propriété jamais déclarée. Typage de référence : TypeScript
   **5.8.x** (la 5.9 signale à tort une erreur dans `AbonnementPush.tsx`).

### Après le critère

3. **Relecture de la taille ET du contenu des fichiers livrés.** Cinq livraisons
   ont rapporté un succès en posant une version périmée sur le disque. Une
   comparaison de taille ne suffit pas sur un fichier accentué : chercher une
   phrase que seule la nouvelle version contient.
4. **Version.** Les deux `package.json` et leurs `package-lock.json` portent la
   version de la **dernière entrée du `CHANGELOG.md`**. On ne la monte qu'en
   clôturant un lot, dans le même commit que l'entrée du CHANGELOG — jamais
   avant, jamais après. Un décalage entre le commit annoncé et les fichiers est
   un défaut (constaté : v0.15.0 annoncée, fichiers restés à 0.14.0).

### Écrire une campagne de tests

Elle commence par ce que la plateforme **refuse** : un module se juge d'abord à
ce qu'il n'a pas laissé entrer. Elle bâtit ses propres données (`TEST-…`) et les
nettoie — travailler sur le jeu de Dar Chaabane l'abîme à chaque passage.
Enregistrement dans `backend/package.json` et dans `MIGRER.bat`.

**Témoin indépendant.** Quand une campagne vérifie un calcul, ses valeurs attendues viennent
d'un script qui ne lit que le fichier d'entrée et la méthode, jamais le code testé :
`jumeau_attendus.py` (S1), `cout_complet_attendus.py` (17.5, sur un jeu fictif de même structure
que le fichier réel, `tests/donnees/cout-complet-fictif.json`).

**Exception assumée : `simulation-3mois`.** Elle ne bâtit pas de lignes `TEST-…` :
elle charge le jeu du jumeau numérique (`backend/seed/data/jumeau_3mois.json`,
produit une fois pour toutes par `scripts/jumeau/generer.py`) dans sa commune de
démonstration fictive (`est_demo`), et la **retire** en partant. Ses lignes portent
`provenance = 'simule'` ; la base refuse une ligne simulée dans une commune réelle.
Ses valeurs attendues sont calculées par `backend/tests/jumeau_attendus.py`, qui ne
lit que le fichier du jeu et la définition des indicateurs — jamais le code testé.
Le jeu change ? On relance `generer.py` et on versionne le fichier : l'application
ne génère rien. Voir `FEUILLE_DE_ROUTE.md` § 6bis.

---

## 8. Repères du dépôt

```
backend/
  migrations/      062 fichiers numérotés au 08/10/2026 — l'ordre fait foi, l'empreinte aussi
  src/routes/      une route par domaine ; les littéraux avant /:id
  src/services/    kml.ts (imports géographiques), fichiers.ts (stockage, EXIF)
  src/openapi/     document.ts — le contrat, généré depuis les schémas zod
  seed/            jeux réels : Dar Chaabane, Djerba (Houmt Souk, Midoun, Ajim)
  tests/           41 campagnes au 08/10/2026, lancées par tests/executer.sh
web/
  src/composants/  communal/ · national/ · prestataire/ · kpi/ · registres/
  src/lib/api.ts   client HTTP ; api-types.ts est GÉNÉRÉ, ne pas l'écrire à la main
  src/locales/     fr.json · ar.json — les deux, toujours
scripts/skills/    outils de vérification interne (voir scripts/skills/README.md)
```

**Documents de référence :** `FEUILLE_DE_ROUTE.md` (les 96 fonctionnalités du
cahier des charges et leur état), `CHANGELOG.md` (l'avancement par jalon).

---

## 9. Terrain

Deux communes ont servi de terrain réel : **Dar Chaabane El Fehri** (circuits,
parc, effectif, pesées) et **Djerba** — Houmt Souk, Midoun, Ajim (relevés GPS,
prestataires). Aucune commune n'utilise encore la plateforme dans son travail
quotidien.

**Cinq défauts n'ont été révélés par aucune campagne automatisée.** Ils
n'apparaissaient qu'en usage réel. C'est l'argument, s'il en fallait un, pour
une recette terrain avant chaque jalon — et pour consigner chaque défaut trouvé
dans le journal des corrections avec sa **portée**, pas seulement sa cause.
