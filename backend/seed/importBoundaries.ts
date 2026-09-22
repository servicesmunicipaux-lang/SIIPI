// SUPERSÉDÉ par seed/importDecoupage.ts : cet import appariait les communes
// par proximité de nom sur des données OpenStreetMap et laissait la plupart
// d'entre elles sans frontière. Conservé pour mémoire, plus appelé.

// Script d'import des frontières administratives réelles des communes.
//
// Source : extrait OpenStreetMap (relations "boundary=municipality") fourni par
// la FNCT, apparié aux 350 communes de communes_350.json par nom puis par
// proximité géographique (voir la méthodologie dans GUIDE_DEMARRAGE.md).
// Le fichier backend/seed/data/communes_boundaries.json contient déjà le résultat
// de cet appariement (géométries simplifiées, un polygone MultiPolygon par
// commune reconnue) — ce script se contente de l'appliquer en base.
//
// Usage : cd backend && npm run import:boundaries
// (peut être relancé sans risque : ré-exécute juste les UPDATE)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Import géographique : contexte FNCT (tables cloisonnées par RLS, src/db.ts).
process.env.SIIPI_DB_CONTEXT = 'server';
const { pool } = await import('../src/db.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface BoundaryEntry {
  id: string;
  geometry: any; // GeoJSON MultiPolygon
}

async function run() {
  const filePath = path.join(__dirname, 'data', 'communes_boundaries.json');
  if (!fs.existsSync(filePath)) {
    console.error(`[import:boundaries] Fichier introuvable : ${filePath}`);
    process.exit(1);
  }
  const entries: BoundaryEntry[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  console.log(`[import:boundaries] ${entries.length} frontières communales à importer...`);

  let updated = 0;
  let skipped = 0;
  for (const entry of entries) {
    const result = await pool.query(
      `UPDATE communes SET boundary_geom = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) WHERE id = $2`,
      [JSON.stringify(entry.geometry), entry.id]
    );
    if (result.rowCount && result.rowCount > 0) {
      updated += 1;
    } else {
      skipped += 1;
      console.warn(`[import:boundaries] Commune inconnue en base, ignorée : ${entry.id}`);
    }
  }

  const [{ count }] = (
    await pool.query(`SELECT count(*)::int AS count FROM communes WHERE boundary_geom IS NOT NULL`)
  ).rows;

  console.log(`[import:boundaries] Terminé : ${updated} communes mises à jour, ${skipped} ignorées.`);
  console.log(`[import:boundaries] Total en base avec frontière réelle : ${count} / 350.`);
  await pool.end();
}

run().catch((err) => {
  console.error('[import:boundaries] Échec :', err);
  process.exit(1);
});
