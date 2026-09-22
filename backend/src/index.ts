// Point d'entrée du serveur. La construction de l'application vit dans app.ts,
// pour que les tests et les outils (génération du contrat d'API, vérification
// de couverture des routes) puissent la charger sans ouvrir de port réseau.
import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { preparerRacine, racine } from './services/fichiers.js';

// Le volume de stockage est éprouvé AU DÉMARRAGE, pas au premier dépôt. Un
// volume non monté se découvrirait autrement le jour où un agent envoie la
// preuve de traitement d'une réclamation — au plus mauvais moment, et sous la
// forme d'une erreur qu'il prendra pour la sienne.
preparerRacine()
  .then(() => console.log(`[siipi-backend] stockage des fichiers : ${racine()}`))
  .catch((err) => {
    console.error(
      `[siipi-backend] ATTENTION : le stockage des fichiers (${racine()}) n'est pas accessible en écriture. ` +
        `Les dépôts de photos et de documents échoueront. Détail : ${err instanceof Error ? err.message : err}`
    );
  });

app.listen(config.port, () => {
  console.log(
    `[siipi-backend] API démarrée sur http://localhost:${config.port} ` +
      `(CORS autorisé : ${config.corsOrigin}) — documentation sur /docs`
  );
});

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
