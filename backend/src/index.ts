// Point d'entrée du serveur. La construction de l'application vit dans app.ts,
// pour que les tests et les outils (génération du contrat d'API, vérification
// de couverture des routes) puissent la charger sans ouvrir de port réseau.
import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

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
