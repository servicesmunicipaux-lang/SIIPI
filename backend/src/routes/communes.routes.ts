import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole, requireCommuneAccess } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const communesRouter = Router();

// GET /communes — annuaire complet (public en lecture : utilisé par le portail national et municipal)
communesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const gouvernorat = typeof req.query.gouvernorat === 'string' ? req.query.gouvernorat : null;
    // La commune de démonstration (jumeau numérique) n'est pas une commune :
    // l'annuaire ne la montre que si on la demande — le sélecteur de la FNCT,
    // qui doit pouvoir ouvrir son portail.
    const avecDemo = req.query.avecDemo === '1';
    const rows = await query(
      `SELECT * FROM communes
        WHERE ($1::text IS NULL OR gouvernorat = $1) AND ($2 OR NOT est_demo)
        ORDER BY name`,
      [gouvernorat, avecDemo]
    );
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
     WHERE NOT est_demo
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

// --- Paramètres de la commune (TDR §3.2.6, B6.2) ----------------------------
//
// Des règles de service, les mêmes pour toute l'équipe : au bout de combien
// de jours une réclamation devient un retard, quel préavis par défaut pour
// l'entretien. Sans ligne en base, les valeurs par défaut s'appliquent — et
// l'écran les montre comme telles, pour qu'on sache qu'elles n'ont jamais été
// choisies.

const PARAMETRES_DEFAUT = {
  delai_reclamation_jours: 7,
  seuil_entretien_km: 1000,
  seuil_entretien_jours: 30,
  alerter_actions_retard: true,
  objectif_balayage_ml_j: null as number | null,
  recepisse_inpdp: null as string | null,
  recepisse_inpdp_date: null as string | null,
};

export const parametresCommuneSchema = z
  .object({
    delaiReclamationJours: z.number().int().min(1).max(90).optional(),
    seuilEntretienKm: z.number().int().min(0).max(100_000).optional(),
    seuilEntretienJours: z.number().int().min(0).max(365).optional(),
    alerterActionsRetard: z.boolean().optional(),
    // La cible du balayage mesuré (M1-1) ; null l'efface.
    objectifBalayageMlJ: z.number().positive().max(10_000_000).nullable().optional(),
  })
  .strict();

/** Les paramètres d'une commune, défauts compris (lus sous RLS). */
export async function parametresDeCommune(communeId: string) {
  const ligne = await queryOne<typeof PARAMETRES_DEFAUT & { updated_at: string; auteur: string | null }>(
    `SELECT p.delai_reclamation_jours, p.seuil_entretien_km, p.seuil_entretien_jours,
            p.alerter_actions_retard, p.objectif_balayage_ml_j::float AS objectif_balayage_ml_j,
            p.recepisse_inpdp, p.recepisse_inpdp_date,
            p.updated_at, u.full_name AS auteur
       FROM parametres_commune p LEFT JOIN users u ON u.id = p.updated_by
      WHERE p.commune_id = $1`,
    [communeId]
  );
  return ligne
    ? { commune_id: communeId, ...ligne, par_defaut: false }
    : { commune_id: communeId, ...PARAMETRES_DEFAUT, updated_at: null, auteur: null, par_defaut: true };
}

communesRouter.get(
  '/:id/parametres',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  requireCommuneAccess((req) => req.params.id),
  asyncHandler(async (req, res) => {
    res.json(await parametresDeCommune(req.params.id));
  })
);

communesRouter.put(
  '/:id/parametres',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  requireCommuneAccess((req) => req.params.id),
  asyncHandler(async (req, res) => {
    const d = parametresCommuneSchema.parse(req.body);
    const commune = await queryOne('SELECT id FROM communes WHERE id = $1', [req.params.id]);
    if (!commune) throw new ApiError(404, 'Commune introuvable.');
    await query(
      `INSERT INTO parametres_commune
         (commune_id, delai_reclamation_jours, seuil_entretien_km, seuil_entretien_jours, alerter_actions_retard, updated_by,
          objectif_balayage_ml_j)
       VALUES ($1, COALESCE($2, 7), COALESCE($3, 1000), COALESCE($4, 30), COALESCE($5, true), $6, $8)
       ON CONFLICT (commune_id) DO UPDATE SET
         delai_reclamation_jours = COALESCE($2, parametres_commune.delai_reclamation_jours),
         seuil_entretien_km = COALESCE($3, parametres_commune.seuil_entretien_km),
         seuil_entretien_jours = COALESCE($4, parametres_commune.seuil_entretien_jours),
         alerter_actions_retard = COALESCE($5, parametres_commune.alerter_actions_retard),
         objectif_balayage_ml_j = CASE WHEN $7::boolean THEN $8 ELSE parametres_commune.objectif_balayage_ml_j END,
         updated_by = $6`,
      [
        req.params.id,
        d.delaiReclamationJours ?? null,
        d.seuilEntretienKm ?? null,
        d.seuilEntretienJours ?? null,
        d.alerterActionsRetard ?? null,
        req.user!.sub,
        d.objectifBalayageMlJ !== undefined,
        d.objectifBalayageMlJ ?? null,
      ]
    );
    res.json(await parametresDeCommune(req.params.id));
  })
);

// PUT /communes/:id/recepisse-inpdp — le récépissé de déclaration du
// traitement des identités de pré-collecteurs auprès de l'INPDP (lot 16.1,
// SPEC_v0.16 R3). Sans lui, la base refuse d'enregistrer la moindre identité
// dans la commune. Effacer le récépissé (null) referme cette porte, sans
// effacer les identités déjà enregistrées : leur retrait est un acte distinct.
export const recepisseInpdpSchema = z
  .object({
    numero: z.string().trim().min(1).max(100).nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.').nullable(),
  })
  .strict()
  .refine((d) => (d.numero === null) === (d.date === null), 'Le numéro et la date du récépissé vont ensemble.');

communesRouter.put(
  '/:id/recepisse-inpdp',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  requireCommuneAccess((req) => req.params.id),
  asyncHandler(async (req, res) => {
    const d = recepisseInpdpSchema.parse(req.body);
    const commune = await queryOne('SELECT id FROM communes WHERE id = $1', [req.params.id]);
    if (!commune) throw new ApiError(404, 'Commune introuvable.');
    await query(
      `INSERT INTO parametres_commune (commune_id, recepisse_inpdp, recepisse_inpdp_date, updated_by)
       VALUES ($1, $2, $3::date, app.current_user_id())
       ON CONFLICT (commune_id) DO UPDATE SET
         recepisse_inpdp = $2, recepisse_inpdp_date = $3::date, updated_by = app.current_user_id()`,
      [req.params.id, d.numero, d.date]
    );
    res.json(await parametresDeCommune(req.params.id));
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
      // Une correction directe de la FNCT est une version du découpage comme
      // une autre (migration 049) : l'état antérieur est figé s'il ne l'était
      // pas, et le nouvel état entre dans l'historique, d'où l'on peut revenir.
      const existe = await queryOne('SELECT id FROM communes WHERE id = $1', [req.params.id]);
      if (!existe) throw new ApiError(404, 'Commune introuvable.');
      const commune = await withTransaction(async (client) => {
        await client.query('SELECT app.avant_correction_fnct($1)', [req.params.id]);
        const r = await client.query(
          `UPDATE communes
              SET boundary_geom = ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326))),
                  boundary_source = 'corrige_fnct'
            WHERE id = $1
          RETURNING id, name, area_km2, boundary_source, boundary_maj_le, boundary_maj_par`,
          [req.params.id, JSON.stringify(geometry)]
        );
        await client.query('SELECT app.apres_correction_fnct($1, $2)', [req.params.id, 'Périmètre corrigé directement par la FNCT.']);
        return r.rows[0];
      });
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
