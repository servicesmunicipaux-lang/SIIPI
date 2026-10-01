// L'ÉTAT DE LA BASE, DIT EN CLAIR. Sur un premier démarrage où les migrations
// n'avaient pas tourné, /health répondait « ok, connected » — la base répondait
// bien, elle était seulement vide — et la connexion échouait sur une « Erreur
// interne du serveur » qui n'indiquait ni la cause ni le remède. La personne
// qui installait la plateforme cherchait une panne de l'API.
//
// Ce module distingue les trois états qui empêchent la plateforme de servir,
// et dit pour chacun la commande qui le corrige. Il est lu par /health et par
// le gestionnaire d'erreurs, qui le consulte avant de répondre 500.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

// Même résolution que le migrateur (src/migrate.ts) : backend/migrations en
// développement, dist/migrations dans l'image de production (voir Dockerfile).
const dossierMigrations = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export type EtatBase =
  | { status: 'ok'; database: 'connected'; migrations: number }
  | {
      status: 'degraded';
      database: 'unreachable' | 'non_initialisee' | 'migrations_en_attente';
      message: string;
      migrationsEnAttente?: number;
    };

export async function etatDeLaBase(): Promise<EtatBase> {
  try {
    await pool.query('SELECT 1');
  } catch {
    return {
      status: 'degraded',
      database: 'unreachable',
      message: 'Base de données injoignable : vérifiez que le conteneur « db » tourne (docker compose ps), puis relancez DEMARRER.bat.',
    };
  }

  // Requêtes directes sur le pool, hors contexte de sécurité : la table de
  // suivi des migrations n'est pas cloisonnée, et sur une base vide le rôle
  // siipi_app qu'endosse l'API n'existe peut-être pas encore.
  const { rows } = await pool.query<{ suivi: boolean }>(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS suivi"
  );
  const appliquees = rows[0]?.suivi
    ? (await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename)
    : [];
  if (appliquees.length === 0) {
    return {
      status: 'degraded',
      database: 'non_initialisee',
      message:
        'Base non initialisée : aucune migration n’a été appliquée. Lancez DEMARRER.bat (ou, dans le conteneur api : npm run migrate puis npm run seed).',
    };
  }

  // Un dossier illisible (image construite sans lui) ne doit pas faire passer
  // une base saine pour dégradée : on ne compte alors que ce qui est appliqué.
  let fichiers: string[] = [];
  try {
    fichiers = fs.readdirSync(dossierMigrations).filter((f) => f.endsWith('.sql'));
  } catch {
    fichiers = [];
  }
  const dejaFaites = new Set(appliquees);
  const enAttente = fichiers.filter((f) => !dejaFaites.has(f)).length;
  if (enAttente > 0) {
    return {
      status: 'degraded',
      database: 'migrations_en_attente',
      migrationsEnAttente: enAttente,
      message: `${enAttente} migration(s) en attente : la base est plus ancienne que le code. Lancez MIGRER.bat (ou, dans le conteneur api : npm run migrate).`,
    };
  }

  return { status: 'ok', database: 'connected', migrations: appliquees.length };
}
