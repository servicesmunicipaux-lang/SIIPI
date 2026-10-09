// Point d'entrée du serveur. La construction de l'application vit dans app.ts,
// pour que les tests et les outils (génération du contrat d'API, vérification
// de couverture des routes) puissent la charger sans ouvrir de port réseau.
import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { preparerRacine, racine } from './services/fichiers.js';
import { signalerComptesDeDemonstration } from './comptesDemonstration.js';
import { demarrerPlanificateurConservation } from './services/conservationMedias.js';
import { etablirNatureInstance, RefusDemarrage } from './instance.js';

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

// La nature de l'instance (D-FNCT-5) s'établit AVANT d'ouvrir le port : une
// contradiction entre la demande et la base — FORMATION=true sur la base de
// production, par exemple — arrête le processus sans qu'une seule requête ait
// été servie. Une base injoignable ou pas encore migrée n'arrête rien : /health
// le dira, et la nature s'établira à la première connexion.
let nature: Awaited<ReturnType<typeof etablirNatureInstance>> | null = null;
try {
  nature = await etablirNatureInstance();
  console.log(`[siipi-backend] instance : ${nature}`);
} catch (err) {
  if (err instanceof RefusDemarrage) {
    console.error(`[siipi-backend] DÉMARRAGE REFUSÉ : ${err.message}`);
    process.exit(1);
  }
  console.error(`[siipi-backend] Nature de l'instance non établie : ${err instanceof Error ? err.message : err}`);
}

app.listen(config.port, () => {
  console.log(
    `[siipi-backend] API démarrée sur http://localhost:${config.port} ` +
      `(CORS autorisé : ${config.corsOrigin}) — documentation sur /docs`
  );
  // Sur une instance de production seulement : ailleurs, ces comptes servent tels quels.
  if (nature === 'production') void signalerComptesDeDemonstration();
  // Conservation des photos (D-FNCT-4) : seulement si SIIPI_CONSERVATION_MEDIAS=active.
  demarrerPlanificateurConservation();
});

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
