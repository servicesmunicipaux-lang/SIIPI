import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole, requireCommuneAccess } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const communesRouter = Router();

// GET /communes — annuaire complet (public en lecture : utilisé par le portail national et municipal)
communesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const gouvernorat = typeof req.query.gouvernorat === 'string' ? req.query.gouvernorat : undefined;
    const rows = gouvernorat
      ? await query('SELECT * FROM communes WHERE gouvernorat = $1 ORDER BY name', [gouvernorat])
      : await query('SELECT * FROM communes ORDER BY name');
    res.json(rows);
  })
);

communesRouter.get(
  '/stats',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const stats = await queryOne(`
      SELECT
        COUNT(*)::int AS total_communes,
        COUNT(*) FILTER (WHERE pcgd_status = 'valide')::int AS with_pcgd_valid,
        COUNT(*) FILTER (WHERE pcgd_status = 'en_cours')::int AS in_progress_pcgd,
        COALESCE(SUM(population), 0)::bigint AS total_population,
        ROUND(COALESCE(SUM(waste_tons_per_day), 0)::numeric, 1) AS total_waste_daily_tons,
        COUNT(DISTINCT gouvernorat)::int AS total_governorates
      FROM communes
    `);
    res.json(stats);
  })
);

// GET /communes/boundaries — frontières réelles (GeoJSON) de toutes les communes qui en
// disposent, pour affichage sur la carte nationale. Environ 90% des 350 communes ont une
// frontière importée depuis OpenStreetMap (voir backend/seed/importBoundaries.ts) ; les
// autres n'apparaissent pas ici et restent affichées par leur seul point lat/lng.
// IMPORTANT : cette route doit rester déclarée avant GET /:id, sinon Express
// interpréterait "boundaries" comme un :id.
// GET /communes/boundaries — toutes les limites communales, en GeoJSON.
//
// Servi SIMPLIFIÉ par défaut. Le tracé officiel des 349 communes pèse une
// vingtaine de méga-octets en pleine résolution : un fond de carte national à
// cette précision met une minute à arriver sur une connexion tunisienne
// moyenne pour un résultat visuellement identique à 1 200 pixels de large.
// tolerance=0 rend le tracé exact, pour un export ou une impression.
communesRouter.get(
  '/boundaries',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tolerance = Number.parseFloat(String(req.query.tolerance ?? '0.001'));
    const communes =
      typeof req.query.communes === 'string' && req.query.communes !== ''
        ? req.query.communes.split(',')
        : null;

    const rows = await query<any>('SELECT * FROM app.frontieres_communes($1::text[], $2)', [
      communes,
      Number.isFinite(tolerance) ? Math.min(Math.max(tolerance, 0), 0.05) : 0.001,
    ]);

    res.json({
      type: 'FeatureCollection',
      features: rows.map((r) => ({
        type: 'Feature',
        properties: {
          id: r.id,
          name: r.name,
          nameAr: r.name_ar,
          gouvernorat: r.gouvernorat,
          codeMunicipalite: r.code_municipalite,
          population: r.population,
          areaKm2: r.area_km2,
          isPilot: r.is_pilot,
          source: r.boundary_source,
        },
        geometry: r.frontiere,
      })),
    });
  })
);

communesRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const commune = await queryOne('SELECT * FROM communes WHERE id = $1', [req.params.id]);
    if (!commune) throw new ApiError(404, 'Commune introuvable.');
    res.json(commune);
  })
);

// GET /communes/:id/boundary — frontière réelle (GeoJSON) d'une seule commune,
// utilisée par l'écran "Découpage communal" du Portail Municipal comme fond de
// carte pour dessiner les secteurs de collecte. Peut être null si la commune
// n'a pas encore de frontière importée.
communesRouter.get(
  '/:id/boundary',
  requireAuth,
  asyncHandler(async (req, res) => {
    const row = await queryOne<{ id: string; geometry: any }>(
      `SELECT id, ST_AsGeoJSON(boundary_geom)::json AS geometry FROM communes WHERE id = $1`,
      [req.params.id]
    );
    if (!row) throw new ApiError(404, 'Commune introuvable.');
    res.json({ communeId: row.id, geometry: row.geometry });
  })
);

// GET /communes/:id/prestataires — liste des comptes Gestionnaire Prestataire (privé)
// rattachés à cette commune. Utilisé par le Portail Municipal pour transférer une
// réclamation (voir PATCH /tickets/:id/assign). Réservé à l'Admin Commune de cette
// commune et au Super Admin FNCT.
communesRouter.get(
  '/:id/prestataires',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  requireCommuneAccess((req) => req.params.id),
  asyncHandler(async (req, res) => {
    const rows = await query(
      // Un prestataire peut travailler pour plusieurs communes sans avoir
      // aucune d'elles pour commune principale : le rattachement fait foi
      // (migration 022), pas la colonne users.commune_id, qui n'en retient
      // qu'une. Sans l'union, une commune ne pouvait pas confier un circuit à
      // un prestataire rattaché chez elle en second.
      `SELECT DISTINCT u.id, u.full_name, u.email
         FROM users u
         LEFT JOIN utilisateur_communes uc
                ON uc.user_id = u.id
               AND uc.actif
               AND (uc.date_debut IS NULL OR uc.date_debut <= CURRENT_DATE)
               AND (uc.date_fin   IS NULL OR uc.date_fin   >= CURRENT_DATE)
        WHERE u.role = 'gestionnaire_prestataire'
          AND u.deleted_at IS NULL
          AND (u.commune_id = $1 OR uc.commune_id = $1)
        ORDER BY u.full_name`,
      [req.params.id]
    );
    res.json(rows);
  })
);

// GET /communes/:id/coherence — recoupement du registre des circuits et de
// l'inventaire du parc.
//
// Logé ici plutôt que sous /circuits ou /trucks parce qu'il porte justement sur
// ce qui relie les deux : un contrôle qui n'appartient à aucun des deux côtés.
communesRouter.get(
  '/:id/coherence',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  requireCommuneAccess((req) => req.params.id),
  asyncHandler(async (req, res) => {
    const lignes = await query('SELECT * FROM app.incoherences_commune($1)', [req.params.id]);
    res.json(lignes);
  })
);

// PUT /communes/:id/frontiere — rectification d'une limite communale.
//
// Réservée à la FNCT. La règle est portée par un déclencheur en base
// (migration 025) et non par ce contrôle de rôle : une limite qu'une commune
// pourrait redessiner lui permettrait de s'attribuer un quartier voisin, avec
// ses signalements et ses tonnages. requireRole n'est ici que la première
// porte — celle qui donne un message clair plutôt qu'une erreur de base.
export const frontiereSchema = z.object({
  geometry: z.object({
    type: z.enum(['Polygon', 'MultiPolygon']),
    coordinates: z.array(z.any()).min(1),
  }),
});

communesRouter.put(
  '/:id/frontiere',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const { geometry } = frontiereSchema.parse(req.body);

    // Un tracé rectifié à la main peut sortir du pays, s'auto-intersecter, ou
    // se réduire à un point : trois erreurs qu'aucune contrainte de colonne
    // n'attrape, et qui ne se verraient qu'en ouvrant la carte des mois plus
    // tard. L'enveloppe de la Tunisie continentale et insulaire tient dans
    // 7°E–12,5°E et 30°N–38°N.
    const [controle] = await query<{ valide: boolean; dans_tunisie: boolean; surface: number }>(
      `WITH g AS (
         SELECT ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))) AS geom
       )
       SELECT ST_IsValid(geom) AS valide,
              ST_Within(geom, ST_MakeEnvelope(7.0, 30.0, 12.5, 38.0, 4326)) AS dans_tunisie,
              (ST_Area(geom::geography) / 1000000)::double precision AS surface
         FROM g`,
      [JSON.stringify(geometry)]
    );

    if (!controle?.valide) {
      throw new ApiError(400, 'Le tracé est géométriquement invalide (contour qui se recoupe).');
    }
    if (!controle.dans_tunisie) {
      throw new ApiError(400, 'Le tracé sort des limites du territoire tunisien.');
    }
    if (!(controle.surface > 0.01)) {
      throw new ApiError(400, 'Le tracé est vide ou trop petit pour être une commune.');
    }

    try {
      const commune = await queryOne(
        `UPDATE communes
            SET boundary_geom = ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326))),
                boundary_source = 'corrige_fnct'
          WHERE id = $1
        RETURNING id, name, area_km2, boundary_source, boundary_maj_le, boundary_maj_par`,
        [req.params.id, JSON.stringify(geometry)]
      );
      if (!commune) throw new ApiError(404, 'Commune introuvable.');
      res.json(commune);
    } catch (err: any) {
      if (err?.message?.includes('FRONTIERE_RESERVEE_FNCT')) {
        throw new ApiError(403, 'La modification des limites communales est réservée à la FNCT.');
      }
      throw err;
    }
  })
);

const updateSchema = z.object({
  phone: z.string().optional(),
  fax: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  logoUrl: z.string().optional(),
  hasPcgd: z.boolean().optional(),
  pcgdStatus: z.enum(['valide', 'en_cours', 'non_existant', 'a_actualiser']).optional(),
  pcgdValidationDate: z.string().optional(),
  wasteManagementMode: z.enum(['regie_directe', 'sous_traitance_privee', 'mixte', 'delegation_sp']).optional(),
  landfillSite: z.string().optional(),
  collectionFrequency: z.string().optional(),
  tclRecoveryRate: z.number().optional(),
  responsibleOfficer: z.string().optional(),
  responsiblePhone: z.string().optional(),
  notes: z.string().optional(),
});

// PATCH /communes/:id — remplace le mécanisme "localStorage override" du prototype.
// Réservé au Super Admin FNCT et à l'Admin Commune de la commune concernée.
communesRouter.patch(
  '/:id',
  requireAuth,
  requireRole('super_admin_fnct', 'admin_commune'),
  requireCommuneAccess((req) => req.params.id),
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const fieldsMap: Record<string, string> = {
      phone: 'phone',
      fax: 'fax',
      email: 'email',
      address: 'address',
      logoUrl: 'logo_url',
      hasPcgd: 'has_pcgd',
      pcgdStatus: 'pcgd_status',
      pcgdValidationDate: 'pcgd_validation_date',
      wasteManagementMode: 'waste_management_mode',
      landfillSite: 'landfill_site',
      collectionFrequency: 'collection_frequency',
      tclRecoveryRate: 'tcl_recovery_rate',
      responsibleOfficer: 'responsible_officer',
      responsiblePhone: 'responsible_phone',
      notes: 'notes',
    };

    const setClauses: string[] = [];
    const values: any[] = [];
    for (const [key, column] of Object.entries(fieldsMap)) {
      if (key in data) {
        values.push((data as any)[key]);
        setClauses.push(`${column} = $${values.length}`);
      }
    }
    if (setClauses.length === 0) {
      throw new ApiError(400, 'Aucun champ à mettre à jour.');
    }
    values.push(req.params.id);

    const updated = await queryOne(
      `UPDATE communes SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!updated) throw new ApiError(404, 'Commune introuvable.');
    res.json(updated);
  })
);

// Schémas exposés à la documentation OpenAPI (src/openapi/document.ts).
// La documentation importe les schémas de validation EUX-MÊMES : elle ne peut
// donc pas décrire un format différent de celui réellement contrôlé à l'exécution.
export {
  updateSchema as communeUpdateSchema,
};
