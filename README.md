# SIIPI — Système d'Information Intelligent pour la Propreté Intercommunale

Plateforme nationale de gestion intelligente des déchets ménagers et
assimilés, portée par la **Fédération Nationale des Communes Tunisiennes**
(FNCT) à travers le réseau WAMA-NET, en lien avec l'ANGeD : observatoire
national, portails municipaux, espace prestataire et application citoyenne
(FR/AR, RTL).

## Démarrer

Tout tourne en conteneurs Docker — voir **[DEMARRAGE.md](DEMARRAGE.md)** pour
les trois commandes qui lancent la base, les migrations, le jeu de données de
démonstration, l'API et le front-end, et **[GUIDE_DEMARRAGE.md](GUIDE_DEMARRAGE.md)**
pour la procédure détaillée.

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
