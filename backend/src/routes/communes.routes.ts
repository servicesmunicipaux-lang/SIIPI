import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole, requireCommuneAccess } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const communesRouter = Router();

// GET /communes — annuaire complet (public en lecture : utilisé par le portail national et municipal)
communesRouter.get(
  '/',
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
communesRouter.get(
  '/boundaries',
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT id, name, ST_AsGeoJSON(boundary_geom)::json AS geometry
         FROM communes
        WHERE boundary_geom IS NOT NULL
        ORDER BY name`
    );
    res.json({
      type: 'FeatureCollection',
      features: rows.map((r: any) => ({
        type: 'Feature',
        properties: { id: r.id, name: r.name },
        geometry: r.geometry,
      })),
    });
  })
);

communesRouter.get(
  '/:id',
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
      `SELECT id, full_name, email FROM users WHERE role = 'gestionnaire_prestataire' AND commune_id = $1 ORDER BY full_name`,
      [req.params.id]
    );
    res.json(rows);
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
