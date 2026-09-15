# Analyse technique — Plateforme SIIPI (FNCT / ANGeD)

**Système d'Information Intelligent pour la Propreté Intercommunale**
Analyse réalisée à partir du code source complet du projet (dossier `nacer` : `src/`, `scripts/`, fichiers de configuration à la racine).

---

## 1. Ce qu'est réellement SIIPI aujourd'hui

Après lecture complète du code, il faut être direct sur un point essentiel avant tout le reste : **SIIPI n'est pas, à ce stade, une plateforme logicielle fonctionnelle**. C'est une **application de démonstration/simulation** générée avec Google AI Studio (Gemini), sous forme d'un site React à page unique (SPA) qui *met en scène* à quoi ressemblerait le futur système, ainsi que le déroulé complet d'un projet de développement de 9 mois en 8 phases.

Concrètement :

- Il n'y a **aucun back-end réel**. Le `package.json` liste `express`, mais aucun fichier serveur (`server.js`, routes API) n'existe dans le dépôt fourni, et aucun appel `fetch`/`axios` vers une API n'apparaît nulle part dans le code source (vérifié par recherche exhaustive).
- Il n'y a **aucune base de données**. Aucune dépendance PostgreSQL, MySQL, MongoDB, Prisma, etc. La seule « persistance » de l'application est le **`localStorage` du navigateur** (fichier `communesDirectoryData.ts`), qui stocke localement, sur la machine de l'utilisateur uniquement, les modifications faites à la fiche d'une commune. Rien n'est partagé entre utilisateurs, rien n'est sauvegardé côté serveur.
- Il n'y a **aucune authentification**. Le changement de « rôle » (Admin national, Directeur municipal, Citoyen, Agent terrain, GDMA...) se fait par un simple bouton dans la barre de navigation (`Navbar.tsx`) — n'importe qui ouvrant la page peut se déclarer « Admin FNCT/ANGeD » en un clic.
- Le SDK `@google/genai` (Gemini) est bien présent en dépendance et déclaré dans `metadata.json` (`MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`), mais **aucun appel réel à l'API Gemini n'existe dans le code** — la fonctionnalité « IA » n'est pas implémentée, seulement prévue/annoncée.
- Les **8 phases du projet** (visibles dans le module « Console Phases & IA ») sont toutes marquées `status: 'completed'` dans le fichier `data/phasesAndSpecs.ts`, avec des résultats de tests « passed », des chiffres de charge (« 68 ms de latence », « 50 000 utilisateurs simultanés », « zéro vulnérabilité critique »), des résultats de pilote (« -14,8 % de carburant », « 4,2h de résolution moyenne »)... **Ce sont des textes rédigés en dur dans le code**, pas des résultats de tests exécutés. Aucun test, aucune charge, aucun audit de sécurité n'a réellement eu lieu.

En résumé : c'est une **vitrine interactive très soignée** — presque un « pitch produit » exécutable — qui simule l'expérience utilisateur finale et présente une proposition d'architecture technique complète, mais **rien de ce qui est montré comme « livré » ou « validé » ne l'est réellement**. C'est un point à connaître absolument avant toute présentation à la direction FNCT/ANGeD, pour ne pas laisser croire — même involontairement — qu'un système testé et audité existe déjà.

---

## 2. Ce qui est réellement solide dans ce travail

Cela dit, la valeur de ce prototype ne doit pas être sous-estimée : sur le plan **conceptuel et métier**, le travail est sérieux et démontre une bonne compréhension du secteur des déchets municipaux tunisien.

- **Couverture fonctionnelle cohérente** : Portail national (observatoire FNCT/ANGeD), portail municipal, appli citoyenne, appli agent de terrain, et surtout un module dédié aux **Barbéchas / GDMA** (collecteurs informels, associations, entreprises) — c'est le point le plus intéressant du projet, car il adresse un vrai angle mort souvent ignoré dans ce type de plateforme : l'inclusion économique du secteur informel de récupération.
- **Le référentiel des 350 communes** (`communes_350.json`, généré par `scripts/gov_part1-4.cjs`) contient des données d'identité qui semblent provenir d'une vraie base (nom, population, téléphone, fax, email, adresse — cohérent avec un « annuaire FNCT 2023 » cité en commentaire). C'est potentiellement réutilisable comme référentiel de base.
- **Attention portée à la conformité réglementaire tunisienne** : Décret-loi n° 2022-54 (cybersécurité), Code des collectivités locales (loi 2018-29), norme INPDP — les bons textes sont cités, ce qui montre que la dimension légale locale a été prise en compte dans la réflexion, même si rien n'est encore implémenté.
- **Le modèle des « 5 axes » de propreté** (gouvernance, couverture, flotte, sensibilisation citoyenne, viabilité financière) est une grille d'évaluation pertinente et le simulateur d'investissement flotte (CAPEX/OPEX, TVA 19 %, coût par habitant) est un outil d'aide à la décision réaliste dans sa logique de calcul.
- Le choix technique **Leaflet + OpenStreetMap** plutôt que Google Maps est judicieux pour une institution publique (pas de facturation à l'usage, pas de dépendance à une clé API commerciale).

---

## 3. Point de vigilance important : données « live » vs données fabriquées

Dans `scripts/build_full_directory.cjs`, les indicateurs opérationnels (taux de collecte, indice de propreté, nombre de camions actifs, nombre de conteneurs, tickets ouverts) ne sont **pas des données réelles** : ils sont calculés par une formule utilisant l'opérateur modulo sur la population (`pop % 10`, `pop % 15`, etc.) pour produire des chiffres qui « ont l'air réalistes » mais sont entièrement fabriqués commune par commune. De même, les sites de décharge, les modes de gestion (régie directe / sous-traitance) sont assignés de façon cyclique, pas à partir de la réalité de chaque commune.

Autrement dit : le référentiel d'**identité** des communes (nom, coordonnées, contact) a probablement une base réelle, mais tous les **indicateurs de performance** affichés dans les tableaux de bord sont des données de démonstration générées automatiquement. Si ce prototype est montré à des décideurs, il est essentiel de préciser clairement laquelle des deux catégories ils regardent.

---

## 4. Ce qu'il manque pour transformer ce prototype en vraie plateforme nationale

Le document `phasesAndSpecs.ts` propose en réalité une **architecture cible tout à fait raisonnable** (PostgreSQL + PostGIS + TimescaleDB, Redis, API REST/OpenAPI, JWT + MFA, Docker/Kubernetes, apps mobiles offline-first en SQLite). Le vrai travail à faire est de la construire, puisque rien n'existe encore :

1. **Back-end réel** : API REST (Node/Express ou équivalent), avec authentification et autorisation par rôle (RBAC) — indispensable dès lors que des données de citoyens, d'agents et de 350 communes coexistent sur une même plateforme.
2. **Base de données persistante et partagée** : PostgreSQL/PostGIS est le bon choix pour ce type de données géospatiales ; à créer entièrement (le SQL fourni dans les specs est un point de départ correct, pas un schéma déployé).
3. **Authentification et gestion des rôles** : actuellement, changer de rôle est un simple clic côté client — à remplacer par un vrai système de comptes (a minima JWT, idéalement MFA pour les comptes administrateurs, comme le prévoit d'ailleurs le document de specs).
4. **Décision sur l'hébergement** : les specs mentionnent un « Datacenter National Tunisie », mais le `.env.example` et `metadata.json` pointent vers une infrastructure Google Cloud Run (typique d'AI Studio). Ce point mérite d'être tranché tôt, notamment pour des raisons de souveraineté des données publiques/citoyennes tunisiennes.
5. **Confirmer la protection de la clé Gemini** : bon point actuel — la clé `GEMINI_API_KEY` n'est pas préfixée `VITE_`, donc elle ne devrait pas être incluse dans le bundle envoyé au navigateur. À vérifier néanmoins dès qu'un vrai appel serveur sera implémenté, pour s'assurer qu'elle ne transite jamais côté client.
6. **Bilinguisme FR/AR réellement opérationnel** : la bascule RTL existe déjà dans `App.tsx` (bon réflexe), mais l'essentiel des textes (specs, phases, notifications) ne sont écrits qu'en français dans le code — la traduction arabe reste à généraliser si le portail citoyen doit être réellement bilingue.
7. **Cohérence de l'outillage** : un `bun.lock` est présent, mais tous les scripts (`package.json`) sont écrits pour `npm`/`vite` standard — à clarifier pour éviter les dérives de dépendances entre développeurs.
8. **Tests, CI et sécurité** : aucun framework de test (Jest/Vitest), aucune CI visible. Les chiffres de tests de charge et d'audit sécurité affichés dans l'interface sont fictifs — un vrai plan de tests reste entièrement à écrire.

---

## 5. Conclusion

SIIPI est, à ce stade, une **maquette conceptuelle exécutable de très bonne qualité visuelle et fonctionnelle**, construite avec un outil de génération IA (Google AI Studio/Gemini), pas un système en production. Elle est utile comme **support de vision et de cadrage** — pour obtenir un budget, valider une feuille de route avec l'ANGeD, ou recueillir l'adhésion des communes pilotes — mais elle ne doit pas être présentée comme un système déjà développé, testé ou déployé : aucune des données « en direct », aucun des résultats de tests, d'audit de sécurité ou de pilote n'est réel.

La bonne nouvelle est que la réflexion fonctionnelle et l'architecture technique cible proposées dans les fichiers de spécifications (`data/phasesAndSpecs.ts`) constituent une base de cahier des charges tout à fait exploitable pour lancer un vrai développement, si l'objectif est de poursuivre ce projet au-delà du stade de démonstration.

---

*Analyse basée sur l'ensemble des fichiers du dossier `nacer` (src/, scripts/) fournis par l'utilisateur, ainsi que sur les fichiers de configuration du dépôt (`package.json`, `metadata.json`, `.env.example`, `vite.config.ts`).*
