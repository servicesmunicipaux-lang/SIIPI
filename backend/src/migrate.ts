// Exécuteur de migrations minimaliste : applique dans l'ordre les fichiers
// backend/migrations/*.sql qui n'ont pas encore été appliqués (suivi dans
// la table schema_migrations créée par 000_init.sql).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Les migrations écrivent dans des tables cloisonnées par RLS : elles
// s'exécutent avec le contexte FNCT (voir src/db.ts).
process.env.SIIPI_DB_CONTEXT = 'server';
const { pool } = await import('./db.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '..', 'migrations');

async function ensureTrackingTable() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function run() {
  console.log(`[migrate] Dossier de migrations : ${migrationsDir}`);
  await ensureTrackingTable();

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows: applied } = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  const appliedSet = new Set(applied.map((r) => r.filename));

  let appliedCount = 0;
  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`[migrate] Application de ${file}...`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      appliedCount++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[migrate] Échec sur ${file} :`, err);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log(appliedCount > 0 ? `[migrate] ${appliedCount} migration(s) appliquée(s).` : '[migrate] Base déjà à jour.');
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
