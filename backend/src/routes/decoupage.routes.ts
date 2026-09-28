// Le découpage communal validé et versionné — Jalon 7, lot 2 (TDR §3.2.8,
// C2.5 et C2.6).
//
// La commune propose son découpage — son périmètre et ses secteurs — tel
// qu'elle veut qu'il soit ; la FNCT compare à l'état en vigueur, valide ou
// refuse motif à l'appui. Chaque état validé est une version numérotée, qu'on
// peut réappliquer : c'est le « retour à la version précédente ».
//
// L'application d'une version (app.valider_version_decoupage, migration 049)
// se fait en base, sous le contrôle du rôle FNCT : c'est la base, et non
// cette route, qui garantit qu'une commune ne valide pas sa propre frontière.

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';
import { controlerTrace, polygoneSchema } from '../services/geometrie.js';

export const decoupageRouter = Router();

const ROLES = ['admin_commune', 'super_admin_fnct'] as const;
const STATUTS = ['soumise', 'validee', 'refusee', 'retiree'] as const;

const VERSION_SELECT = `
  SELECT v.id, v.commune_id, c.name AS commune_nom, v.numero, v.statut, v.origine, v.directe,
         v.perimetre_modifie, v.zones_modifiees,
         jsonb_array_length(v.zones)::int AS nb_secteurs,
         CASE WHEN v.perimetre IS NULL THEN NULL
              ELSE round((ST_Area(v.perimetre::geography) / 1000000)::numeric, 2)::float END AS surface_km2,
         v.note, v.motif_refus, v.restaure_de, r.numero AS restaure_de_numero,
         app.auteur_version(v.id, v.soumise_par) AS soumise_par_nom, v.soumise_le,
         app.auteur_version(v.id, v.decidee_par) AS decidee_par_nom, v.decidee_le,
         (v.statut = 'validee' AND v.numero = (SELECT max(x.numero) FROM versions_decoupage x
                                                WHERE x.commune_id = v.commune_id AND x.statut = 'validee')) AS en_vigueur
    FROM versions_decoupage v
    JOIN communes c ON c.id = v.commune_id
    LEFT JOIN versions_decoupage r ON r.id = v.restaure_de
`;

interface Version {
  id: string;
  commune_id: string;
  numero: number | null;
  statut: (typeof STATUTS)[number];
  directe: boolean;
  en_vigueur: boolean;
}

/** Une version visible (RLS) — sinon 404, jamais 403. */
async function version(id: string): Promise<Version & Record<string, unknown>> {
  const v = await queryOne<Version & Record<string, unknown>>(`${VERSION_SELECT} WHERE v.id = $1`, [id]);
  if (!v) throw new ApiError(404, 'Version introuvable.');
  return v;
}

/** Traduit les refus de la base en réponses lisibles. */
function traduire(err: unknown): never {
  const message = err instanceof Error ? err.message : '';
  if (message.includes('VALIDATION_RESERVEE_FNCT')) throw new ApiError(403, 'La validation du découpage est réservée à la FNCT.');
  if (message.includes('VERSION_DEJA_DECIDEE')) throw new ApiError(409, 'Cette version a déjà été décidée.');
  if (message.includes('SECTEUR_AUTRE_COMMUNE')) throw new ApiError(400, "Un secteur désigné appartient à une autre commune.");
  if ((err as { code?: string })?.code === '23505') {
    throw new ApiError(409, 'Une proposition de découpage est déjà en attente pour cette commune : retirez-la ou attendez la décision de la FNCT.');
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

decoupageRouter.get(
  '/versions',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const q = z
      .object({ statut: z.enum(STATUTS).optional(), communeId: z.string().optional() })
      .parse(req.query);
    // La FNCT sans commune désignée voit toutes les communes : c'est sa liste
    // de propositions à instruire.
    const communeId = req.user!.role === 'super_admin_fnct' ? (q.communeId ?? null) : communeDemandee(req);
    if (req.user!.role !== 'super_admin_fnct' && !communeId) throw new ApiError(400, 'Commune requise.');
    res.json(
      await query(
        `${VERSION_SELECT}
          WHERE ($1::text IS NULL OR v.commune_id = $1) AND ($2::text IS NULL OR v.statut = $2)
          ORDER BY (v.statut = 'soumise') DESC, v.numero DESC NULLS FIRST, v.soumise_le DESC`,
        [communeId, q.statut ?? null]
      )
    );
  })
);

decoupageRouter.get(
  '/versions/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const v = await version(req.params.id);
    // La version, l'état en vigueur, et ce qui les sépare : c'est ce que la
    // FNCT regarde pour décider, et ce que la commune regarde pour restaurer.
    const detail = await queryOne<Record<string, unknown>>(
      `WITH v AS (SELECT * FROM versions_decoupage WHERE id = $1),
            c AS (SELECT boundary_geom FROM communes WHERE id = (SELECT commune_id FROM v)),
            vz AS (SELECT e ->> 'id' AS id, e ->> 'name' AS name, e ->> 'code' AS code,
                          ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON(e ->> 'geometry')), 4326) AS geom
                     FROM v, jsonb_array_elements(v.zones) e),
            az AS (SELECT id::text AS id, name, code, geom FROM zones_collecte
                    WHERE commune_id = (SELECT commune_id FROM v) AND deleted_at IS NULL)
       SELECT ST_AsGeoJSON(v.perimetre)::json AS perimetre,
              v.zones,
              ST_AsGeoJSON(c.boundary_geom)::json AS perimetre_actuel,
              app.secteurs_en_vigueur(v.commune_id) AS zones_actuelles,
              (v.perimetre IS DISTINCT FROM c.boundary_geom
                 AND NOT COALESCE(ST_Equals(v.perimetre, c.boundary_geom), false)) AS perimetre_change,
              CASE WHEN c.boundary_geom IS NULL THEN NULL
                   ELSE round((ST_Area(c.boundary_geom::geography) / 1000000)::numeric, 2)::float END AS surface_actuelle_km2,
              COALESCE((SELECT json_agg(json_build_object('id', vz.id, 'name', vz.name) ORDER BY vz.name)
                          FROM vz WHERE NOT EXISTS (SELECT 1 FROM az WHERE az.id = vz.id)), '[]') AS ajoutes,
              COALESCE((SELECT json_agg(json_build_object('id', vz.id, 'name', vz.name) ORDER BY vz.name)
                          FROM vz JOIN az ON az.id = vz.id
                         WHERE NOT ST_Equals(vz.geom, az.geom) OR vz.name IS DISTINCT FROM az.name
                            OR vz.code IS DISTINCT FROM az.code), '[]') AS modifies,
              COALESCE((SELECT json_agg(json_build_object('id', az.id, 'name', az.name) ORDER BY az.name)
                          FROM az WHERE NOT EXISTS (SELECT 1 FROM vz WHERE vz.id = az.id)), '[]') AS retires,
              -- Ce qui mérite un regard avant de valider : un secteur qui
              -- déborde du périmètre, deux secteurs qui se chevauchent.
              COALESCE((SELECT json_agg(t) FROM (
                 SELECT format('Le secteur « %s » déborde du périmètre communal (%s %% de sa surface).',
                               vz.name, round((100 * ST_Area(ST_Difference(vz.geom, p.g)) / NULLIF(ST_Area(vz.geom), 0))::numeric)) AS t
                   FROM vz, (SELECT COALESCE(v.perimetre, c.boundary_geom) AS g) p
                  WHERE p.g IS NOT NULL AND ST_Area(ST_Difference(vz.geom, p.g)) > 0.05 * ST_Area(vz.geom)
                 UNION ALL
                 SELECT format('Les secteurs « %s » et « %s » se chevauchent.', a.name, b.name)
                   FROM vz a JOIN vz b ON a.id < b.id
                  WHERE ST_Intersects(a.geom, b.geom)
                    AND ST_Area(ST_Intersection(a.geom, b.geom)) > 0.01 * LEAST(ST_Area(a.geom), ST_Area(b.geom))
              ) s), '[]') AS avertissements
         FROM v, c`,
      [v.id]
    );
    res.json({ ...v, ...detail });
  })
);

// ---------------------------------------------------------------------------
// La proposition (commune ou FNCT)
// ---------------------------------------------------------------------------

const secteurSchema = z.object({
  // Absent : un secteur nouveau, qui recevra son identifiant ici.
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(40).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur attendue au format #RRGGBB.').nullable().optional(),
  collectionFrequency: z.string().max(80).nullable().optional(),
  estimatedPopulation: z.number().int().nonnegative().nullable().optional(),
  geometry: polygoneSchema,
});

export const propositionDecoupageSchema = z
  .object({
    // Absent : le périmètre n'est pas touché. null : il est retiré.
    perimetre: polygoneSchema.nullable().optional(),
    // Absent : les secteurs ne sont pas touchés. Présent : l'ensemble voulu —
    // un secteur en vigueur qui n'y figure pas sera retiré.
    zones: z.array(secteurSchema).max(300).optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .refine((d) => d.perimetre !== undefined || d.zones !== undefined, {
    message: 'Une proposition doit porter sur le périmètre, sur les secteurs, ou sur les deux.',
  });

decoupageRouter.post(
  '/propositions',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const d = propositionDecoupageSchema.parse(req.body);
    const commune = await queryOne('SELECT id FROM communes WHERE id = $1', [communeId]);
    if (!commune) throw new ApiError(404, 'Commune introuvable.');

    if (d.perimetre) await controlerTrace(d.perimetre, 'Périmètre', 0.01);
    const zones = d.zones ?? [];
    for (const z of zones) await controlerTrace(z.geometry, `Secteur « ${z.name} »`, 0.0001);

    // Un identifiant fourni désigne un secteur de CETTE commune — vivant, ou
    // retiré qu'on veut rétablir. Lu sans filtre de suppression : c'est une
    // vérification d'appartenance, pas un affichage.
    const ids = zones.map((z) => z.id).filter((x): x is string => !!x);
    if (new Set(ids).size !== ids.length) throw new ApiError(400, 'Un même secteur figure deux fois dans la proposition.');
    if (ids.length) {
      const connus = await queryOne<{ n: number }>(
        'SELECT count(*)::int AS n FROM zones_collecte WHERE id = ANY($1::uuid[]) AND commune_id = $2',
        [ids, communeId]
      );
      if (connus!.n !== ids.length) throw new ApiError(400, "Un secteur désigné n'existe pas dans cette commune.");
    }

    const secteurs = zones.map((z) => ({
      id: z.id ?? randomUUID(),
      name: z.name,
      code: z.code || null,
      description: z.description || null,
      color: z.color || null,
      collection_frequency: z.collectionFrequency || null,
      estimated_population: z.estimatedPopulation ?? null,
      geometry: z.geometry,
    }));

    try {
      const cree = await queryOne<{ id: string }>(
        `INSERT INTO versions_decoupage
           (commune_id, statut, origine, perimetre, perimetre_modifie, zones, zones_modifiees, note, soumise_par)
         SELECT $1, 'soumise', 'proposition',
                CASE WHEN $2::boolean THEN ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326)))
                     ELSE c.boundary_geom END,
                $2, CASE WHEN $4::boolean THEN $5::jsonb ELSE app.secteurs_en_vigueur($1) END, $4, $6, $7
           FROM communes c WHERE c.id = $1
         RETURNING id`,
        [
          communeId,
          d.perimetre !== undefined,
          d.perimetre ? JSON.stringify(d.perimetre) : null,
          d.zones !== undefined,
          JSON.stringify(secteurs),
          d.note || null,
          req.user!.sub,
        ]
      );
      res.status(201).json(await version(cree!.id));
    } catch (err) {
      traduire(err);
    }
  })
);

// ---------------------------------------------------------------------------
// La décision (FNCT)
// ---------------------------------------------------------------------------

decoupageRouter.post(
  '/versions/:id/valider',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const v = await version(req.params.id);
    try {
      await query('SELECT app.valider_version_decoupage($1)', [v.id]);
    } catch (err) {
      traduire(err);
    }
    res.json(await version(v.id));
  })
);

const refusSchema = z.object({ motif: z.string().trim().min(5, 'Un refus se motive : la commune doit savoir quoi corriger.').max(2000) });

decoupageRouter.post(
  '/versions/:id/refuser',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const { motif } = refusSchema.parse(req.body);
    const v = await version(req.params.id);
    if (v.statut !== 'soumise') throw new ApiError(409, 'Cette version a déjà été décidée.');
    await query(
      `UPDATE versions_decoupage SET statut = 'refusee', motif_refus = $2, decidee_par = $3, decidee_le = now()
        WHERE id = $1 AND statut = 'soumise'`,
      [v.id, motif, req.user!.sub]
    );
    res.json(await version(v.id));
  })
);

decoupageRouter.post(
  '/versions/:id/retirer',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const v = await version(req.params.id);
    if (v.statut !== 'soumise' || v.directe) throw new ApiError(409, 'Seule une proposition en attente peut être retirée.');
    await query(`UPDATE versions_decoupage SET statut = 'retiree' WHERE id = $1 AND statut = 'soumise'`, [v.id]);
    res.json(await version(v.id));
  })
);

// ---------------------------------------------------------------------------
// Le retour à une version précédente (C2.6)
//
// La FNCT restaure directement ; la commune propose la restauration, que la
// FNCT validera comme n'importe quelle proposition. Dans les deux cas, c'est
// une NOUVELLE version qui naît : l'historique ne se réécrit pas.
// ---------------------------------------------------------------------------

const restaurationSchema = z.object({ note: z.string().trim().max(2000).optional() });

decoupageRouter.post(
  '/versions/:id/restaurer',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const { note } = restaurationSchema.parse(req.body ?? {});
    const source = await version(req.params.id);
    if (source.statut !== 'validee') throw new ApiError(400, 'Seule une version validée peut être restaurée.');
    if (source.en_vigueur) throw new ApiError(400, 'Cette version est déjà celle en vigueur.');
    const fnct = req.user!.role === 'super_admin_fnct';
    const texte = note || `Retour à la version ${source.numero}.`;

    try {
      const id = await withTransaction(async (client) => {
        const cree = await client.query<{ id: string }>(
          `INSERT INTO versions_decoupage
             (commune_id, statut, origine, directe, perimetre, perimetre_modifie, zones, zones_modifiees,
              note, restaure_de, soumise_par)
           SELECT commune_id, 'soumise', 'restauration', $2, perimetre, true, zones, true, $3, id, $4
             FROM versions_decoupage WHERE id = $1
           RETURNING id`,
          [source.id, fnct, texte, req.user!.sub]
        );
        if (fnct) await client.query('SELECT app.valider_version_decoupage($1)', [cree.rows[0].id]);
        return cree.rows[0].id;
      });
      res.status(201).json(await version(id));
    } catch (err) {
      traduire(err);
    }
  })
);
