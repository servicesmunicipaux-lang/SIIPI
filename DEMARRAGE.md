# SIIPI — démarrer la plateforme sur un poste

**Une seule entrée : `DEMARRER.bat`.** Ce document l'explique et donne les
mêmes commandes pour un poste sans Windows. S'ils divergent un jour, c'est le
`.bat` qui fait foi — et ce document qui est en retard.

> Jusqu'à la v0.15.2, trois documents décrivaient le démarrage (`README.md`,
> ce fichier et `GUIDE_DEMARRAGE.md`), plus un script PowerShell abandonné. Ils
> se contredisaient sur le mot de passe de la base, le port d'Adminer et le
> nombre de migrations. Il n'en reste qu'un.

## Prérequis

[Docker Desktop](https://www.docker.com/products/docker-desktop/), démarré.
Rien d'autre : Node.js, PostgreSQL et PostGIS tournent dans les conteneurs.

## Premier démarrage

Double-cliquez sur **`DEMARRER.bat`**. Il écrit tout ce qu'il fait dans
`demarrage.txt`, à côté de lui : en cas de problème, ce fichier suffit.

| Étape | Ce qui se passe |
|---|---|
| 1 | Docker répond-il ? |
| 2 | Ménage des conteneurs d'un lancement précédent (les **données** sont dans des volumes : elles restent) |
| 3 | Base PostgreSQL + PostGIS, attente qu'elle accepte les connexions |
| 4 | Dépendances de l'API (plusieurs minutes la première fois) |
| 5 | Migrations — le migrateur dit combien il en applique, et **s'arrête** si une migration déjà appliquée a été modifiée |
| 6 | Les 350 communes et les comptes de démonstration |
| 7 | Les territoires officiels (découpage communal) |
| 8 | La commune pilote **Dar Chaabane El Fehri** : circuits, parc, personnel (noms fictifs), exemples de communication |
| 9 | La plateforme en arrière-plan, puis le contrôle de `/health` |

Il est **rejouable** : relancé sur une installation existante, il applique les
migrations en attente et recharge les jeux sans les dupliquer.

L'ordre des étapes 5 à 8 est celui d'une installation réelle, et celui dans
lequel les campagnes de tests sont écrites (`CLAUDE.md` § 7).

### Sans Windows — les mêmes étapes

```bash
docker compose up -d db
docker compose run --rm api npm install --no-audit --no-fund
docker compose run --rm api npm run migrate
docker compose run --rm api npm run seed
docker compose run --rm api npm run import:decoupage
docker compose run --rm api npm run seed:dar-chaabane
docker compose run --rm api npm run seed:parc
docker compose run --rm api npm run seed:personnel
docker compose run --rm api npm run seed:communication
docker compose up -d
curl http://localhost:4000/health
```

## Adresses

| Quoi | Où |
|---|---|
| Plateforme | http://localhost:3000 |
| Contrat d'API (documentation vivante) | http://localhost:4000/docs |
| État de la base | http://localhost:4000/health |
| Adminer (consultation de la base) | http://localhost:8081 — système PostgreSQL, serveur `db`, utilisateur `siipi_admin`, mot de passe : voir ci-dessous |

Le front installe ses paquets à son premier lancement : comptez quelques
minutes avant que le port 3000 réponde.

## Comptes de démonstration

Mot de passe commun : `Siipi2026!`

| Espace | Compte |
|---|---|
| Observatoire national (FNCT) | `admin.national@siipi.tn` |
| Portail municipal | `directeur.houmtsouk@siipi.tn` (aussi `directeur.midoun`, `directeur.ajim`, `directeur.marsa`, `directeur.sfax`) |
| Espace prestataire | `prestataire.houmtsouk@siipi.tn` (aussi `.midoun`, `.ajim`, `.marsa`) |
| Application citoyenne | `citoyen.demo@siipi.tn` — ou une inscription depuis l'écran de connexion |

**Dar Chaabane El Fehri n'a pas de compte propre.** L'administrateur national
ouvre le portail de n'importe quelle commune : *Annuaire des communes* →
*Ouvrir le portail*.

## Mots de passe et fichier `.env`

En développement, **aucun fichier `.env` n'est nécessaire** : le
`docker-compose.yml` porte des valeurs par défaut, dont le mot de passe de la
base, `siipi_dev_password`.

| Fichier | Sert à |
|---|---|
| `.env.example` → `.env` (racine) | Remplacer les valeurs par défaut du Compose : `DB_PASSWORD`, `JWT_SECRET`, `CORS_ORIGIN`… |
| `backend/.env.example` → `backend/.env` | Seulement pour lancer l'API **hors conteneur** (`npm run dev` sur le poste), contre la base du Compose. Son mot de passe doit être celui du Compose |

Un `.env` n'est jamais versionné.

## Au quotidien

| Script | Quand |
|---|---|
| `DEMARRER.bat` | Premier démarrage, ou remise en route complète |
| `RELANCER.bat` | Recrée le seul conteneur du front, après un changement de sa configuration |
| `MIGRER.bat` | **Après toute mise à jour du code** : migrations, jeux, types du front, typage, puis `npm test` |
| `TESTS.bat` | Le contrat d'API et toutes les campagnes de tests |
| `VERIFIER.bat` / `DIAGNOSTIC.bat` | Diagnostic en lecture seule |
| `RECHARGER_DAR_CHAABANE.bat` | Recharge le registre de Dar Chaabane |
| `CHARGER_DJERBA.bat` | Charge les relevés GPS réels de Djerba depuis le dossier de la mission (jamais copié dans le dépôt) |
| `POUSSER.bat` | Envoi vers GitHub |

## Quand quelque chose ne va pas

Ouvrez **http://localhost:4000/health**. Il distingue trois pannes, et dit pour
chacune la commande qui la corrige :

| `database` | Cause | Remède |
|---|---|---|
| `unreachable` | Le conteneur de la base ne tourne pas | `docker compose ps`, puis `DEMARRER.bat` |
| `non_initialisee` | Aucune migration appliquée | `DEMARRER.bat` |
| `migrations_en_attente` | La base est plus ancienne que le code | `MIGRER.bat` |

Tant que la base n'est pas en état, la connexion le dit aussi (code 503 et la
même explication) au lieu d'une « erreur interne du serveur ».

Le migrateur qui s'arrête sur « migration modifiée après application » n'est pas
en panne : une migration appliquée ne se modifie pas, on en ajoute une nouvelle.

## Vérifier que tout est sain

Double-cliquez sur `TESTS.bat`, ou :

```bash
docker compose exec -T api npm test
```

Le contrat d'API, puis **toutes** les campagnes inscrites dans
`backend/package.json`. Aucun nombre n'est écrit ici : il change à chaque lot,
et la sortie de la commande est la seule à le connaître. Un seul échec doit
arrêter une mise en service.

## Avant tout déploiement réel

Ce poste de développement n'est pas un serveur de production.

- `JWT_SECRET` fort (`openssl rand -hex 32`) — l'API refuse de démarrer en
  production avec la valeur de développement.
- `DB_PASSWORD` fort (`openssl rand -base64 24`).
- Comptes de démonstration retirés ou leurs mots de passe changés.
- Clés VAPID régénérées une fois pour toutes (`npm run vapid:generer`, voir
  `backend/.env.example`).
- Sauvegarde de la base (`pg_dump`) **et** du volume `siipi_fichiers` (photos et
  documents ne sont pas en base).
- Hébergement en Tunisie ; données personnelles : loi organique n° 2004-63
  (`CLAUDE.md` § 2).
- Audit de sécurité du back-end avant toute mise en production.
