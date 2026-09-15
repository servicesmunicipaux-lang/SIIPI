import pg from 'pg';
import { config } from './config.js';
import { currentContext } from './context.js';

// Les scripts d'administration (migrations, seed, imports) n'ont pas de
// requête HTTP et donc pas de contexte utilisateur. Ils ouvrent leurs
// connexions avec le contexte FNCT, déclaré directement dans le paquet de
// connexion PostgreSQL. Activé en positionnant SIIPI_DB_CONTEXT=server AVANT
// le chargement de ce module (voir migrate.ts et seed/seed.ts).
const isServerScript = process.env.SIIPI_DB_CONTEXT === 'server';
const SERVER_USER_ID = '00000000-0000-0000-0000-000000000000';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  ...(isServerScript
    ? { options: `-c app.role=super_admin_fnct -c app.user_id=${SERVER_USER_ID}` }
    : {}),
});

pool.on('error', (err) => {
  // Erreur sur une connexion inactive du pool : à journaliser, ne doit pas planter le process.
  console.error('[db] Erreur inattendue sur le pool PostgreSQL', err);
});

/**
 * Exécute `fn` sur une connexion dédiée, dans une transaction dont le contexte
 * de sécurité est celui de la requête HTTP en cours. C'est ce contexte que
 * lisent les politiques RLS définies dans la migration 013.
 *
 * Toutes les requêtes de l'API passent par ici : une requête émise sans
 * contexte est vue comme anonyme et ne renvoie aucune ligne métier.
 */
async function withSecurityContext<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const context = currentContext();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!isServerScript) {
      // set_config(..., is_local = true) : la valeur ne survit pas à la
      // transaction, donc elle ne peut pas fuir vers la requête suivante qui
      // réutilisera cette connexion du pool.
      await client.query(
        `SELECT set_config('app.user_id', $1, true),
                set_config('app.role', $2, true),
                set_config('app.commune_id', $3, true)`,
        [context.userId ?? '', context.role, context.communeId ?? '']
      );
      // Indispensable : PostgreSQL n'applique aucune politique RLS à un
      // super-utilisateur ni au propriétaire d'une table sans FORCE, et
      // l'image Docker crée justement le compte de la base en
      // super-utilisateur. L'API endosse donc, le temps de la transaction,
      // un rôle sans privilège auquel les politiques s'appliquent pleinement
      // (rôle créé par la migration 013). SET LOCAL : l'effet disparaît au
      // COMMIT, la connexion retourne intacte dans le pool.
      await client.query('SET LOCAL ROLE siipi_app');
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  return withSecurityContext(async (client) => {
    const result = await client.query(text, params);
    return result.rows as T[];
  });
}

export async function queryOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Exécute une série de requêtes dans une transaction unique. */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  return withSecurityContext(fn);
}
