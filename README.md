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

## Propriété et conformité

Code source propriété de la FNCT. Données hébergées en Tunisie.
Le traitement des données personnelles relève du décret-loi n° 2022-54 ;
la gestion des déchets, de la loi n° 96-41 et du décret sur le tri à la source.
