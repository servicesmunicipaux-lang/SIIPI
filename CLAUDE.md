# CLAUDE.md — mémoire de travail du projet SIIPI

Ce fichier est lu au début de chaque session. Il contient ce qu'il faut savoir
**avant** de toucher au code : les commandes, les conventions, et les cinq
règles qu'on ne discute pas.

> **Système d'Information Intelligent pour la Propreté Intercommunale**
> Fédération Nationale des Communes Tunisiennes — 350 communes.
> Propriété intellectuelle : FNCT. Hébergement : Tunisie (décret-loi n° 2022-54).

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

### 1.5 La plateforme constate, elle ne corrige pas

Quand deux registres se contredisent, on **montre l'écart** avec ce qu'il y a à
faire — jamais une réconciliation silencieuse. C'est l'objet de
`app.incoherences_commune()`. Une plateforme qui « nettoierait » ces écarts
ferait disparaître le seul signal disponible sur la qualité des données de la
commune.

---

## 2. Ce qu'on ne stocke jamais

Décret-loi n° 2022-54. La base **n'a pas** ces colonnes, et c'est vérifié par
les campagnes de tests avant toute autre chose :

| Interdit | Pourquoi |
|---|---|
| Salaire individuel, prime, indemnité | Le coût existe au niveau du **service** et de l'**année** (`effectifs_service`) |
| CIN, numéro de pièce d'identité | Aucune finalité dans un outil de propreté |
| Donnée de santé, diagnostic, motif médical | Le vocabulaire des absences ne comporte volontairement **aucun** terme médical |
| Adresse personnelle d'un agent | — |

**Donnée de test :** toute donnée personnelle fournie en test (CIN, téléphone,
salaire, nom d'agent) est remplacée par une valeur **fictive de même format et
de même longueur**.

**Photos :** les métadonnées EXIF sont retirées au dépôt. La position GPS qu'elles
contiennent est **rendue à l'appelant** pour qu'il la propose — jamais conservée
à l'insu de la personne qui a pris la photo.

---

## 3. Commandes

### Poste de travail (Windows, Docker Desktop)

| Script | Ce qu'il fait |
|---|---|
| `DEMARRER.bat` | Premier démarrage : conteneurs, migrations, jeu de démonstration |
| `RELANCER.bat` | Redémarrage simple |
| `MIGRER.bat` | **Le passage obligé après toute modification** : migrations, seeds, régénération des types du front, contrat d'API, typage, et les 33 campagnes de tests |
| `TESTS.bat` | Les campagnes seules |
| `VERIFIER.bat` | Diagnostic en lecture seule |
| `CHARGER_DJERBA.bat` / `RECHARGER_DAR_CHAABANE.bat` | Rechargement des jeux réels |
| `POUSSER.bat` | Envoi vers GitHub (les identifiants restent chez l'utilisateur) |

### Dans les conteneurs

```bash
docker compose exec -T api npm run migrate            # migrations en attente
docker compose exec -T api npm run verifier:contrat   # toute route servie est documentée
docker compose exec -T api npm test                   # les 33 campagnes
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
| Base | PostgreSQL 16 + PostGIS 3.4 | 52 migrations, rejouées sur base neuve à chaque livraison |
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

### Base de données

- Une migration est **numérotée, jamais modifiée après application** : on en
  ajoute une nouvelle.
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

---

## 7. Protocole de validation — avant toute livraison

Dans cet ordre, sans en sauter un :

1. **Chaîne de migrations rejouée sur une base neuve** (000 → la dernière), puis
   la nouvelle migration **rejouée une seconde fois** pour prouver son
   idempotence.
2. **`npm run lint`** côté backend **et** côté web. Le front n'est pas typé par
   Vite : il se transpile sans vérifier, et c'est ainsi qu'un composant a planté
   au rendu sur une propriété jamais déclarée.
3. **`npm run verifier:contrat`** : toute route servie est documentée.
4. **Les campagnes concernées**, et `npm test` avant une version.
5. **Relecture de la taille ET du contenu des fichiers livrés.** Cinq livraisons
   ont rapporté un succès en posant une version périmée sur le disque. Une
   comparaison de taille ne suffit pas sur un fichier accentué : chercher une
   phrase que seule la nouvelle version contient.

### Écrire une campagne de tests

Elle commence par ce que la plateforme **refuse** : un module se juge d'abord à
ce qu'il n'a pas laissé entrer. Elle bâtit ses propres données (`TEST-…`) et les
nettoie — travailler sur le jeu de Dar Chaabane l'abîme à chaque passage.
Enregistrement dans `backend/package.json` et dans `MIGRER.bat`.

---

## 8. Repères du dépôt

```
backend/
  migrations/      052 fichiers numérotés — l'ordre fait foi
  src/routes/      une route par domaine ; les littéraux avant /:id
  src/services/    kml.ts (imports géographiques), fichiers.ts (stockage, EXIF)
  src/openapi/     document.ts — le contrat, généré depuis les schémas zod
  seed/            jeux réels : Dar Chaabane, Djerba (Houmt Souk, Midoun, Ajim)
  tests/           33 campagnes, lancées par tests/executer.sh
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
