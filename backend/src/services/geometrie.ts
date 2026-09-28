// Contrôle d'un tracé saisi à la main ou importé : périmètre communal ou
// secteur de collecte.
//
// Un tracé peut sortir du pays, s'auto-intersecter, ou se réduire à un point :
// trois erreurs qu'aucune contrainte de colonne n'attrape, et qui ne se
// verraient qu'en ouvrant la carte des mois plus tard. L'enveloppe de la
// Tunisie continentale et insulaire tient dans 7°E–12,5°E et 30°N–38°N.

import { z } from 'zod';
import { queryOne } from '../db.js';
import { ApiError } from '../middleware/errorHandler.js';

export const polygoneSchema = z.object({
  type: z.enum(['Polygon', 'MultiPolygon']),
  coordinates: z.array(z.any()).min(1),
});

export type Polygone = z.infer<typeof polygoneSchema>;

/**
 * Refuse (400) un tracé invalide, hors de Tunisie ou plus petit que
 * `surfaceMinKm2`, en nommant ce qui ne va pas. `quoi` est repris dans le
 * message : « Le secteur « Nord » sort… ».
 */
export async function controlerTrace(geometrie: Polygone, quoi: string, surfaceMinKm2: number): Promise<number> {
  let controle: { valide: boolean; dans_tunisie: boolean; surface: number } | null;
  try {
    controle = await queryOne(
      `WITH g AS (
         SELECT ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))) AS geom
       )
       SELECT ST_IsValid(geom) AS valide,
              ST_Within(geom, ST_MakeEnvelope(7.0, 30.0, 12.5, 38.0, 4326)) AS dans_tunisie,
              (ST_Area(geom::geography) / 1000000)::double precision AS surface
         FROM g`,
      [JSON.stringify(geometrie)]
    );
  } catch {
    throw new ApiError(400, `${quoi} : tracé illisible.`);
  }
  if (!controle?.valide) throw new ApiError(400, `${quoi} : le tracé est géométriquement invalide (contour qui se recoupe).`);
  if (!controle.dans_tunisie) throw new ApiError(400, `${quoi} : le tracé sort des limites du territoire tunisien.`);
  if (!(controle.surface > surfaceMinKm2)) throw new ApiError(400, `${quoi} : le tracé est vide ou trop petit.`);
  return controle.surface;
}
