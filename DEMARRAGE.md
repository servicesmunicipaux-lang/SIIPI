# SIIPI — démarrage sur votre poste

Trois commandes, dans cet ordre. Tout tourne en conteneurs : rien à installer
d'autre que Docker Desktop.

```bash
docker compose up -d db          # la base PostgreSQL + PostGIS
docker compose run --rm api npm run migrate        # les 26 migrations
docker compose run --rm api npm run seed           # les 350 communes + comptes de démonstration
docker compose run --rm api npm run import:decoupage   # les 349 territoires officiels
docker compose up                # l'API et le front-end
```

- Plateforme : http://localhost:3000
- Contrat d'API (documentation vivante) : http://localhost:4000/docs
- Base de données : http://localhost:8080 (Adminer)

## Comptes de démonstration

Mot de passe commun : `Siipi2026!`

| Espace | Compte |
|---|---|
| Observatoire national (FNCT) | `admin.national@siipi.tn` |
| Portail municipal | `directeur.houmtsouk@siipi.tn` |
| Espace prestataire | `prestataire.houmtsouk@siipi.tn` |
| Application citoyenne | `citoyen.demo@siipi.tn` |

## Vérifier que tout est sain

```bash
docker compose run --rm api npm test
```

240 tests. Ils vérifient le cloisonnement entre communes, le journal d'audit,
la suppression logique, les circuits et le contrôle terrain, l'espace
prestataire, l'espace citoyen, les flux occasionnels (DDC) et le découpage
communal. Un seul échec doit arrêter la mise en service : chacun de ces tests
correspond à un défaut réel déjà rencontré.

## Ce qui reste à décider

- **Zarzouna / El Hchachna (Bizerte)** : la couche officielle et le référentiel
  de la plateforme ne listent pas la même commune. Zarzouna reste sans
  territoire tant que l'arbitrage n'est pas rendu.
- **Stockage des photos** : décidé (volume disque), pas encore branché.
- **Import des pesées ANGeD** : attend un fichier Excel réel pour être écrit
  contre les vraies colonnes.
- **Découpage en 5 districts FNCT** : la base ne connaît que les 24 gouvernorats.
