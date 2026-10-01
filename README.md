# SIIPI — Système d'Information Intelligent pour la Propreté Intercommunale

Plateforme nationale de gestion intelligente des déchets ménagers et
assimilés, portée par la **Fédération Nationale des Communes Tunisiennes**
(FNCT) à travers le réseau WAMA-NET, en lien avec l'ANGeD : observatoire
national, portails municipaux, espace prestataire et application citoyenne
(FR/AR, RTL).

## Démarrer

Sous Windows, double-cliquez sur **`DEMARRER.bat`** : rien d'autre à installer
que Docker Desktop. **[DEMARRAGE.md](DEMARRAGE.md)** explique ce qu'il fait,
donne les mêmes commandes pour un autre système, les comptes de démonstration
et ce qu'il faut faire quand `/health` signale une panne.

## Où en est le projet

**[FEUILLE_DE_ROUTE.md](FEUILLE_DE_ROUTE.md)** confronte, fonctionnalité par
fonctionnalité, le cahier des charges à ce que la plateforme fait réellement
aujourd'hui — avec la preuve (migration, route, campagne de tests) pour
chaque ligne déjà faite. **[CHANGELOG.md](CHANGELOG.md)** suit l'avancement
par jalon, version par version.

## Structure du dépôt

- [`backend/`](backend/) — API REST Node.js/Express + TypeScript, base
  PostgreSQL/PostGIS (cloisonnement par commune via RLS), migrations et
  campagnes de tests.
- [`web/`](web/) — front-end React + Vite, bilingue FR/AR avec support RTL :
  observatoire national, portail communal, espace prestataire, application
  citoyenne.
- `docker-compose.yml` — l'environnement de développement complet (base, API,
  front-end, Adminer).
