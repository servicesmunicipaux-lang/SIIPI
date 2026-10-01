// Exécuteur de migrations minimaliste : applique dans l'ordre les fichiers
// backend/migrations/*.sql qui n'ont pas encore été appliqués (suivi dans
// la table schema_migrations créée par 000_init.sql).
//
// L'EMPREINTE (v0.15.2). Jusque-là, le migrateur ne suivait que le NOM d'une
// migration : un fichier déjà appliqué pouvait être modifié sans que rien ne
// le signale. Or une modification n'atteint que les bases créées APRÈS elle ;
// une base en service garde l'ancien état, et les deux divergent en silence.
// Chaque migration porte désormais l'empreinte SHA-256 de son contenu :
//   - une migration appliquée avant l'arrivée de l'empreinte reçoit celle du
//     fichier présent (état de référence) ;
//   - une migration dont le fichier ne correspond plus à l'empreinte arrête
//     le migrateur, qui dit laquelle et quoi faire : une migration ne se
//     modifie pas, on en ajoute une nouvelle.
// Les fins de ligne sont ramenées à LF avant le calcul : le même fichier
// relu sous Windows (CRLF) et sous Linux (LF) a la même empreinte.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Les migrations écrivent dans des tables cloisonnées par RLS : elles
// s'exécutent avec le contexte FNCT (voir src/db.ts).
process.env.SIIPI_DB_CONTEXT = 'server';
const { pool } = await import('./db.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '..', 'migrations');

const empreinte = (sql: string) => createHash('sha256').update(sql.replace(/\r\n/g, '\n'), 'utf8').digest('hex');

async function ensureTrackingTable() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS empreinte TEXT;
    COMMENT ON COLUMN schema_migrations.empreinte IS
      'SHA-256 du fichier appliqué (fins de ligne ramenées à LF). Un fichier qui ne correspond plus à son empreinte arrête le migrateur : une migration appliquée ne se modifie pas.';
  `);
}

async function run() {
  console.log(`[migrate] Dossier de migrations : ${migrationsDir}`);
  await ensureTrackingTable();

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows: applied } = await pool.query<{ filename: string; empreinte: string | null }>(
    'SELECT filename, empreinte FROM schema_migrations'
  );
  const appliquees = new Map(applied.map((r) => [r.filename, r.empreinte]));

  // Contrôle des migrations déjà appliquées, AVANT d'en appliquer une seule :
  // une nouvelle migration écrite sur un état qu'on croit connaître et qui ne
  // l'est plus aggraverait l'écart au lieu de le révéler.
  const modifiees: string[] = [];
  let referencees = 0;
  for (const file of files) {
    if (!appliquees.has(file)) continue;
    const actuelle = empreinte(fs.readFileSync(path.join(migrationsDir, file), 'utf-8'));
    const connue = appliquees.get(file);
    if (connue === null || connue === undefined) {
      await pool.query('UPDATE schema_migrations SET empreinte = $2 WHERE filename = $1', [file, actuelle]);
      referencees++;
    } else if (connue !== actuelle) {
      modifiees.push(file);
    }
  }
  if (referencees > 0) {
    console.log(`[migrate] Empreinte enregistrée pour ${referencees} migration(s) appliquée(s) avant son introduction.`);
  }
  if (modifiees.length > 0) {
    console.error(
      `[migrate] ARRÊT : ${modifiees.length} migration(s) déjà appliquée(s) ont été modifiées depuis :\n` +
        modifiees.map((f) => `  - ${f}`).join('\n') +
        '\n[migrate] Une migration appliquée ne se modifie pas : la modification n’atteindrait que les bases ' +
        'créées après elle. Rétablir le fichier d’origine (git checkout -- backend/migrations/<fichier>) et ' +
        'porter le changement dans une NOUVELLE migration.'
    );
    await pool.end();
    process.exit(1);
  }

  let appliedCount = 0;
  for (const file of files) {
    if (appliquees.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`[migrate] Application de ${file}...`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename, empreinte) VALUES ($1, $2)', [file, empreinte(sql)]);
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
