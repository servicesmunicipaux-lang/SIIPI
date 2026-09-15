# Système d'Information Intelligent pour la Propreté Intercommunale

Plateforme nationale de gestion des déchets ménagers et assimilés, portée par
la **Fédération Nationale des Communes Tunisiennes (FNCT)** à travers le réseau
WAMA-NET, en lien avec l'**ANGeD**.

Objectif : fédérer les 350 communes tunisiennes autour d'un socle numérique
commun — portail national, portails municipaux, application citoyenne —
conformément aux termes de référence du projet (approche MVP itérative, §1.2).

## Architecture

| Composant | Technologie |
|---|---|
| Base de données | PostgreSQL 16 + PostGIS 3.4 |
| API | Node.js 22 + Express, REST, authentification JWT |
| Front-end web | React 19 + Vite + Leaflet |
| Exécution | Docker / Docker Compose |

## Démarrer en local

Prérequis : **Docker Desktop**.

```bash
# 1. Démarrer base + API + front-end
docker compose up

# 2. Au premier lancement uniquement : créer le schéma et charger les données
docker compose run --rm api npm run migrate
docker compose run --rm api npm run seed
docker compose run --rm api npm run import:boundaries
```

Une fois démarré :

| | Adresse |
|---|---|
| Front-end | http://localhost:3000 |
| API (état de santé) | http://localhost:4000/health |
| Adminer (inspection de la base) | http://localhost:8081 |

Comptes de démonstration créés par le seed : voir `GUIDE_DEMARRAGE.md`.

Arrêter : `docker compose down` (les données sont conservées) ou
`docker compose down -v` (efface aussi la base).

## Structure du dépôt

```
backend/          API REST, migrations SQL, scripts d'import
  migrations/     schéma de la base, appliqué dans l'ordre
  seed/data/      référentiel des 350 communes et frontières communales
src/              front-end React (en cours de reconstruction)
scripts/          outils de génération du référentiel des communes
GUIDE_DEMARRAGE.md  historique détaillé des itérations et des tests
```

## Journaux et conservation

Rien n'est jamais effacé de la base : une suppression positionne `deleted_at`,
la ligne disparaît des écrans mais reste conservée et restaurable. Le privilège
SQL `DELETE` est retiré à l'API.

Toute écriture est tracée en base par des déclencheurs SQL (`audit_log`) :
qui a modifié quoi, quand, et la valeur avant/après. Les consultations de
données personnelles de citoyens par un agent sont tracées séparément
(`access_log`). Les deux journaux sont en ajout seul : l'API peut les lire,
jamais les modifier ni les effacer.

Durées de conservation, définies dans la table `app_parametres` et donc
modifiables sans redéploiement :

| Journal | Durée | Motif |
|---|---|---|
| Écritures | 5 ans | Durée d'un mandat municipal : on peut toujours remonter à la mandature qui a pris une décision |
| Accès aux données citoyennes | 1 an | Volumétrie élevée, utilité décroissante, principe de minimisation |

La purge n'est pas automatique. À planifier une fois par jour sur le serveur :

```bash
docker compose -f docker-compose.prod.yml exec db \
  psql -U siipi_admin -d siipi_national -c "SELECT * FROM app.purger_journaux();"
```

## Tests

```bash
docker compose run --rm api npm test                    # tout (60 tests)
docker compose run --rm api npm run test:cloisonnement  # étanchéité entre communes
docker compose run --rm api npm run test:audit          # journaux d'audit
docker compose run --rm api npm run test:suppression    # suppression logique
```

## Propriété et conformité

Code source propriété de la FNCT. Données hébergées en Tunisie.
Le traitement des données personnelles relève du décret-loi n° 2022-54 ;
la gestion des déchets, de la loi n° 96-41 et du décret sur le tri à la source.
