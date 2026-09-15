import express from 'express';
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

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '5mb' })); // limite volontairement large pour les photos en base64 des signalements citoyens
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

app.use('/auth', authRouter);
app.use('/communes', communesRouter);
app.use('/trucks', trucksRouter);
app.use('/containers', containersRouter);
app.use('/tickets', ticketsRouter);
app.use('/weighbridge', weighbridgeRouter);
app.use('/citizens', citizensRouter);
app.use('/barbechas', barbechasRouter);
app.use('/kpi', kpiRouter);
app.use('/zones', zonesRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[siipi-backend] API démarrée sur http://localhost:${config.port} (CORS autorisé : ${config.corsOrigin})`);
});

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
