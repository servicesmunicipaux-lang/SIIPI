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

## Production et formation

Une instance SIIPI est de l'une de trois natures. **La base la retient** : la
première fois qu'elle est servie en production ou en formation, elle le devient
pour toujours (décision FNCT D-FNCT-5).

| Nature | Comment | Comptes de démonstration (`Siipi2026!`) |
|---|---|---|
| Développement | `docker-compose.yml`, `DEMARRER.bat` | Ouverts |
| Production | `PRODUCTION=true`, ou l'image de production (`NODE_ENV=production`) | **Refusés**, quel que soit leur mot de passe ; la base les désactive |
| Formation | `FORMATION=true` (et `PRODUCTION=false`), sur une base **dédiée** | Ouverts ; bandeau rouge permanent « BASE DE FORMATION — Données fictives. » |

**Mettre en production** (`docker-compose.prod.yml`, `PRODUCTION=true` par défaut) :

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm api npm run migrate:prod
docker compose -f docker-compose.prod.yml run --rm api npm run compte:fnct:creer:prod -- prenom.nom@fnct.org.tn "Prénom Nom"
```

La dernière commande crée le premier compte réel de la FNCT et affiche une fois
son mot de passe provisoire. À la première connexion, la personne doit le
changer : tant qu'elle ne l'a pas fait, l'API refuse toute autre action.

**Ouvrir une instance de formation** : un autre nom d'instance, donc d'autres
conteneurs et une autre base. Dans son `.env` :

```bash
SIIPI_INSTANCE=siipi-formation
PRODUCTION=false
FORMATION=true
```

puis les mêmes commandes avec `-p siipi-formation` (et un autre port pour
l'API si les deux instances partagent un serveur). Les comptes de démonstration
y fonctionnent, et chaque écran porte le bandeau rouge.

**Ce qui est refusé au démarrage**, même par erreur de configuration :
`FORMATION=true` sur une base de production ; une base de formation servie avec
`PRODUCTION=true` ; `FORMATION=true` et `PRODUCTION=true` ensemble. Une base de
production servie sans `PRODUCTION` reste une instance de production : ses
comptes de démonstration restent refusés.

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
