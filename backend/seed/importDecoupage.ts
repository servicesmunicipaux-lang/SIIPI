// Import du découpage communal officiel des 350 communes.
//
//   npm run import:decoupage
//
// Remplace l'ancien import OpenStreetMap (importBoundaries.ts), qui appariait
// les communes par proximité de nom et laissait la majorité d'entre elles sans
// frontière. Ici l'appariement n'est PAS recalculé à l'exécution : il a été
// établi une fois, vérifié, et figé dans seed/data/appariement_communes.json.
//
// C'est délibéré. Un appariement approximatif rejoué à chaque import peut
// donner un résultat différent selon la version de la bibliothèque ou l'ordre
// des lignes, et attribuer un jour la frontière d'une commune à sa voisine.
// Une frontière fausse est pire qu'une frontière absente : elle ne se voit
// pas, et tout ce qui en dépend — surfaces, appartenance d'un signalement,
// comparaisons — devient faux en silence.

import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Contexte FNCT, comme migrate.ts et seed.ts. L'affectation doit précéder le
// CHARGEMENT de src/db.ts, et les imports statiques d'un module ES sont tous
// exécutés avant la première ligne de code : d'où l'import dynamique. Écrit
// autrement, le script tourne en contexte anonyme, le cloisonnement RLS lui
// masque les 350 communes, et il rapporte tranquillement « 0 frontière
// importée, 0 commune sur 0 » — un échec qui ressemble à un succès.
process.env.SIIPI_DB_CONTEXT = 'server';
const { pool, query } = await import('../src/db.js');

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DOSSIER = path.join(ICI, 'data');

interface Proprietes {
  code_municipalite: number;
  nom_municipalite_fr: string;
  nom_municipalite_ar: string;
  code_gouvernorat: number;
  nom_gouvernorat_fr: string;
  sum_popula: number | null;
  sum_nbsect: number | null;
  type_mun_fr: string | null;
}

interface Entite {
  properties: Proprietes;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
}

/**
 * Système de coordonnées déclaré par le fichier.
 *
 * La norme GeoJSON (RFC 7946) impose le WGS84 en degrés, mais les exports
 * ArcGIS conservent souvent la projection de travail et la déclarent dans un
 * membre « crs » non standard. La couche nationale est ainsi en EPSG:3857
 * (Web Mercator, en mètres).
 *
 * Importer ces mètres comme des degrés ne provoque AUCUNE erreur : PostGIS
 * ramène les coordonnées hors limites dans l'intervalle valide en émettant un
 * simple avertissement, et l'on obtient 350 communes situées quelque part au
 * large, avec des superficies de cent millions de kilomètres carrés. Le seul
 * moyen de s'en apercevoir est de regarder une carte — ou de lire cette ligne.
 */
function srid(geojson: { crs?: { properties?: { name?: string } } }): number {
  const nom = geojson.crs?.properties?.name ?? 'EPSG:4326';
  const code = Number.parseInt(nom.replace(/^.*[:.](\d+)$/, '$1'), 10);
  if (!Number.isFinite(code)) {
    throw new Error(`Système de coordonnées illisible : ${nom}`);
  }
  return code;
}

async function lireGeoJsonCompresse(
  fichier: string
): Promise<{ features: Entite[]; crs?: { properties?: { name?: string } } }> {
  const morceaux: Buffer[] = [];
  const flux = createReadStream(fichier).pipe(createGunzip());
  for await (const morceau of flux) morceaux.push(morceau as Buffer);
  return JSON.parse(Buffer.concat(morceaux).toString('utf8'));
}

async function run() {
  const appariement: Record<string, { commune_id: string; nom_source: string }> = JSON.parse(
    await readFile(path.join(DOSSIER, 'appariement_communes.json'), 'utf8')
  );
  const geojson = await lireGeoJsonCompresse(path.join(DOSSIER, 'decoupage_communal.geojson.gz'));
  const sridSource = srid(geojson);

  console.log(
    `[decoupage] ${geojson.features.length} entités dans la couche officielle (EPSG:${sridSource}).`
  );

  let importees = 0;
  const sansCorrespondance: string[] = [];

  for (const entite of geojson.features) {
    const p = entite.properties;
    const cible = appariement[String(p.code_municipalite)];
    if (!cible) {
      sansCorrespondance.push(`${p.nom_municipalite_fr} (${p.nom_gouvernorat_fr})`);
      continue;
    }

    // ST_Multi : la couche mélange Polygon et MultiPolygon (six communes
    // insulaires ou morcelées). La colonne n'accepte que MultiPolygon —
    // uniformiser ici évite six exceptions à traiter partout ailleurs.
    // ST_MakeValid : quelques anneaux de la couche s'auto-intersectent ;
    // sans cela, la moindre requête spatiale sur ces communes échoue.
    const lignes = await query<{ id: string }>(
      `UPDATE communes
          SET boundary_geom = ST_Multi(ST_MakeValid(
                ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($2), $7::integer), 4326))),
              code_municipalite = $3,
              code_gouvernorat  = $4,
              nb_secteurs       = $5,
              type_commune      = $6,
              boundary_source   = 'officiel'
        WHERE id = $1
      RETURNING id`,
      [
        cible.commune_id,
        JSON.stringify(entite.geometry),
        p.code_municipalite,
        p.code_gouvernorat,
        p.sum_nbsect,
        p.type_mun_fr,
        sridSource,
      ]
    );
    if (lignes.length > 0) importees += 1;
    else sansCorrespondance.push(`${p.nom_municipalite_fr} → ${cible.commune_id} (absente en base)`);
  }

  // La superficie est recalculée depuis le tracé et non reprise du fichier :
  // la couche source la donne dans une projection métrique, et une conversion
  // approximative produirait des surfaces fausses de plusieurs pour cent.
  await query(
    `UPDATE communes
        SET area_km2 = ROUND((ST_Area(boundary_geom::geography) / 1000000)::numeric, 2)
      WHERE boundary_geom IS NOT NULL`
  );

  // Le point de chaque commune (lat/lng) servait jusqu'ici à centrer les
  // cartes. Confronté au territoire officiel, il tombe HORS de sa propre
  // commune pour plusieurs dizaines d'entre elles — un centrage qui envoie
  // l'utilisateur chez la voisine. On ne recalcule que ceux-là, et avec
  // ST_PointOnSurface plutôt que ST_Centroid : le centroïde d'une commune en
  // croissant ou en archipel tombe lui aussi à l'extérieur, alors que
  // PointOnSurface est garanti sur le territoire.
  const recentrees = await query<{ id: string; name: string }>(
    `UPDATE communes
        SET lat  = ST_Y(ST_PointOnSurface(boundary_geom)),
            lng  = ST_X(ST_PointOnSurface(boundary_geom)),
            geom = ST_PointOnSurface(boundary_geom)
      WHERE boundary_geom IS NOT NULL
        AND (geom IS NULL OR NOT ST_Intersects(boundary_geom, geom))
    RETURNING id, name`
  );

  const [bilan] = await query<{ avec: number; total: number }>(
    `SELECT count(*) FILTER (WHERE boundary_geom IS NOT NULL) AS avec, count(*) AS total FROM communes`
  );

  console.log(`[decoupage] ${importees} frontières importées.`);
  console.log(`[decoupage] ${bilan.avec} communes sur ${bilan.total} ont désormais un territoire.`);
  if (recentrees.length > 0) {
    console.log(
      `[decoupage] ${recentrees.length} commune(s) dont le point de repère tombait hors de leur propre territoire ont été recentrées.`
    );
  }

  if (sansCorrespondance.length > 0) {
    console.warn(`[decoupage] ${sansCorrespondance.length} entité(s) sans correspondance :`);
    for (const nom of sansCorrespondance) console.warn(`  - ${nom}`);
  }

  const orphelines = await query<{ id: string; name: string; gouvernorat: string }>(
    `SELECT id, name, gouvernorat FROM communes WHERE boundary_geom IS NULL ORDER BY gouvernorat, name`
  );
  if (orphelines.length > 0) {
    console.warn(`[decoupage] ${orphelines.length} commune(s) sans frontière :`);
    for (const c of orphelines) console.warn(`  - ${c.name} (${c.gouvernorat}) [${c.id}]`);
  }

  await pool.end();
}

run().catch(async (err) => {
  console.error('[decoupage] Échec :', err);
  await pool.end();
  process.exit(1);
});
