import { createRequire } from 'node:module';
import path from 'node:path';

import express, { type Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config } from './config.js';
import { pool } from './db.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { attachRequestContext } from './middleware/requestContext.js';

import { authRouter } from './routes/auth.routes.js';
import { communesRouter } from './routes/communes.routes.js';
import { trucksRouter } from './routes/trucks.routes.js';
import { containersRouter } from './routes/containers.routes.js';
import { ticketsRouter } from './routes/tickets.routes.js';
import { weighbridgeRouter } from './routes/weighbridge.routes.js';
import { citizensRouter } from './routes/citizens.routes.js';
import { barbechasRouter } from './routes/barbechas.routes.js';
import { kpiRouter } from './routes/kpi.routes.js';
import { zonesRouter } from './routes/zones.routes.js';
import { observatoireRouter } from './routes/observatoire.routes.js';
import { circuitsRouter } from './routes/circuits.routes.js';
import { pointsRouter } from './routes/pointsCollecte.routes.js';
import { comptesRouter } from './routes/comptes.routes.js';
import { personnelRouter } from './routes/personnel.routes.js';
import { communicationRouter } from './routes/communication.routes.js';
import { peseesRouter } from './routes/pesees.routes.js';
import { publicationsCitoyenRouter } from './routes/publicationsCitoyen.routes.js';
import { passagesRouter } from './routes/passages.routes.js';
import { fichiersRouter } from './routes/fichiers.routes.js';
import {
  pointsSuggeresRouter,
  pointsSuggeresCitoyenRouter,
} from './routes/pointsSuggeres.routes.js';
import { citoyenRouter } from './routes/citoyen.routes.js';
import { enlevementsRouter } from './routes/enlevements.routes.js';
import { genererDocumentOpenApi } from './openapi/document.js';


/** Emplacement des fichiers de Swagger UI installés avec les dépendances. */
function swaggerUiPath(): string {
  const require = createRequire(import.meta.url);
  return path.dirname(require.resolve('swagger-ui-dist/package.json'));
}

// Page de documentation, servie localement (aucun appel à un CDN, aucune
// ressource externe : elle reste consultable sur un réseau fermé).
//
// Le script d'initialisation est servi comme un fichier à part plutôt
// qu'écrit dans la page : la politique de sécurité de contenu appliquée par
// helmet interdit les scripts en ligne, et la relâcher pour la documentation
// l'aurait relâchée pour toute l'application.
const PAGE_DOCUMENTATION = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API SIIPI &mdash; documentation</title>
    <link rel="stylesheet" href="/docs/assets/swagger-ui.css" />
    <style>body { margin: 0; } .topbar { display: none; }</style>
  </head>
  <body>
    <div id="swagger"></div>
    <script src="/docs/assets/swagger-ui-bundle.js"></script>
    <script src="/docs/init.js"></script>
  </body>
</html>`;

const SCRIPT_DOCUMENTATION = `window.ui = SwaggerUIBundle({
  url: '/openapi.json',
  dom_id: '#swagger',
  deepLinking: true,
  persistAuthorization: true,
  docExpansion: 'list',
  defaultModelsExpandDepth: 0,
  tryItOutEnabled: true,
});`;

export const app = express();

// helmet applique une politique de sécurité de contenu stricte. La page de
// documentation charge ses propres scripts depuis /docs/assets : on l'autorise
// explicitement, sans relâcher la politique pour le reste de l'API.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
      },
    },
  })
);
app.use(cors({ origin: config.corsOrigin, credentials: true }));
// 12 Mo : le plafond d'un fichier est de 8 Mo une fois DÉCODÉ, et l'encodage
// base64 l'alourdit d'un tiers — 8 Mo deviennent 10,7 Mo sur le fil. Une
// limite calée sur les 8 Mo aurait refusé, sans explication utilisable, toute
// photo un peu grande : Express répond 413 avant que la route n'ait pu dire
// laquelle des deux tailles pose problème.
app.use(express.json({ limit: '12mb' }));
app.use(morgan(config.isProduction ? 'combined' : 'dev'));

// Identifie l'appelant et installe le contexte lu par les politiques de
// cloisonnement de la base (RLS). Doit précéder toutes les routes.
app.use(attachRequestContext);

// Anti-bruteforce sur les routes d'authentification/inscription (au-delà : back-off nécessaire)
// Ne limiter QUE les points d'entrée qui tentent de deviner un mot de passe.
// Attention : ce limiteur compte par adresse IP. Une commune entière derrière
// une seule sortie internet partage la même IP — l'appliquer à tout /auth
// verrouillait aussi GET /auth/me, que le front-end appelle à chaque
// chargement de page, et bloquait donc tout le service municipal au bout de
// 20 ouvertures de page.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/auth/login', authLimiter);
app.use('/citizens/register', authLimiter);

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'unreachable' });
  }
});

/**
 * Table de montage des routeurs métier.
 *
 * Elle est exportée pour que l'outil de vérification du contrat d'API
 * (npm run verifier:contrat) puisse énumérer les routes réellement servies et
 * les confronter à celles déclarées dans la documentation OpenAPI. Sans cette
 * table, la documentation pourrait se périmer sans que rien ne le signale.
 */
export const ROUTEURS: Array<[string, Router]> = [
  ['/auth', authRouter],
  ['/communes', communesRouter],
  ['/trucks', trucksRouter],
  ['/containers', containersRouter],
  ['/tickets', ticketsRouter],
  ['/weighbridge', weighbridgeRouter],
  ['/citizens', citizensRouter],
  ['/barbechas', barbechasRouter],
  ['/kpi', kpiRouter],
  ['/zones', zonesRouter],
  ['/observatoire', observatoireRouter],
  ['/comptes', comptesRouter],
  ['/personnel', personnelRouter],
  ['/communication', communicationRouter],
  ['/pesees', peseesRouter],
  // Monté AVANT citoyenRouter, volontairement : si celui-ci sert un jour un
  // « /:quelquechose » à sa racine, il capturerait « /citoyen/publications ».
  // L'ordre de cette table est l'ordre d'essai d'Express ; ce qui n'est pas
  // reconnu ici retombe naturellement sur le routeur suivant.
  ['/citoyen', publicationsCitoyenRouter],
  ['/circuits', circuitsRouter],
  // Monté sur le même préfixe : les chemins /circuits/:id/points et
  // /circuits/:id/import-kml sont plus profonds que /circuits/:id et ne les
  // masquent pas.
  ['/circuits', pointsRouter],
  ['/passages', passagesRouter],
  ['/citoyen', citoyenRouter],
  ['/enlevements', enlevementsRouter],
  ['/fichiers', fichiersRouter],
  ['/points-suggeres', pointsSuggeresRouter],
  // Monté sur le préfixe citoyen : la proposition et son suivi appartiennent
  // à l'espace du citoyen, l'instruction à celui de la commune. Deux publics,
  // deux chemins — ils ne voient pas les mêmes lignes.
  ['/citoyen', pointsSuggeresCitoyenRouter],
];

for (const [prefixe, routeur] of ROUTEURS) {
  app.use(prefixe, routeur);
}

/** Routes servies directement par l'application, hors routeurs métier. */
export const ROUTES_DIRECTES = ['GET /health', 'GET /openapi.json', 'GET /docs', 'GET /docs/init.js'];

// --- Contrat d'API (TDR §4.2) ----------------------------------------------
// Servi par la plateforme elle-même, sans dépendance à un service externe :
// la documentation reste consultable sur un réseau fermé ou un datacenter
// national sans accès internet.
const documentOpenApi = genererDocumentOpenApi();

app.get('/openapi.json', (_req, res) => {
  res.json(documentOpenApi);
});

app.get('/docs', (_req, res) => {
  res.type('html').send(PAGE_DOCUMENTATION);
});
app.get('/docs/init.js', (_req, res) => {
  res.type('application/javascript').send(SCRIPT_DOCUMENTATION);
});
app.use('/docs/assets', express.static(swaggerUiPath(), { maxAge: '1d', index: false }));

app.use(notFoundHandler);
app.use(errorHandler);

