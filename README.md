<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/0e775f59-6778-4020-8c36-4871c3165d92

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

---

## Back-end réel (API + base de données)

Ce front-end fonctionnait initialement avec des données 100% simulées (aucun
serveur, aucune base, `localStorage` comme seule persistance). Un vrai
back-end a été ajouté dans le dossier [`backend/`](backend/) : API REST
Node/Express, base PostgreSQL + PostGIS, authentification JWT par rôle
(RBAC). Voir **[GUIDE_DEMARRAGE.md](GUIDE_DEMARRAGE.md)** pour la procédure
complète de démarrage (base de données, migrations, seed, API, front-end).
