// Les registres qui automatisent les sources des KPI — Jalon 8, lot 2.
//
// Ce que la commune déclarait une fois l'an dans sa fiche d'évaluation, elle
// le tient désormais au fil de l'eau, et la plateforme le mesure :
//   /poi                      les lieux (marchés, cimetières, abattoirs…)
//   /registres/carburant      les pleins des engins (coût global à la tonne)
//   /registres/fins-de-poste  la check-list du chauffeur, benne bâchée (M1-9)
//   /registres/epi            la dotation en équipements de protection (M1-6)
//   /registres/incidents      le journal des incidents du travail (axe 5)
//   /registres/commerces      les commerces et institutions à conventionner
//   /registres/conventions    leurs conventions de propreté (M2-2)
//
// Les nettoyages eux-mêmes sont des actions planifiées (Jalon 6) de type
// « nettoyage », rattachées à un lieu : voir attributsPoints.routes.ts.
//
// Une ressource d'une autre commune répond 404, jamais 403 : on vérifie
// qu'elle est visible (RLS) avant d'appeler app.supprimer, qui est SECURITY
// DEFINER.

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';

export const poiRouter = Router();
export const registresRouter = Router();

const ROLES = ['admin_commune', 'super_admin_fnct'] as const;
const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const pasDansLAvenir = { message: "Une saisie de registre porte sur ce qui a eu lieu : la date ne peut pas être dans l'avenir." };

function communeRequise(req: Parameters<typeof communeDemandee>[0]) {
  const c = communeDemandee(req);
  if (!c) throw new ApiError(400, 'Commune requise.');
  return c;
}

async function retirer(table: string, id: string, nom: string) {
  const visible = await queryOne(`SELECT id FROM ${table} WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (!visible) throw new ApiError(404, `${nom} introuvable.`);
  await query('SELECT app.supprimer($1, $2)', [table, id]);
}

/** Un engin ou un agent visible (RLS) — sa commune fait foi. */
async function communeDe(table: 'vehicules' | 'personnel' | 'commerces', id: string, nom: string) {
  const r = await queryOne<{ commune_id: string }>(`SELECT commune_id FROM ${table} WHERE id::text = $1 AND deleted_at IS NULL`, [id]);
  if (!r) throw new ApiError(404, `${nom} introuvable.`);
  return r.commune_id;
}

// ===========================================================================
// 1. Les lieux (POI)
// ===========================================================================

export const TYPES_POI = ['marche', 'cimetiere', 'abattoir', 'ecole', 'sante', 'autre'] as const;

// L'état de propreté d'un lieu se lit sur ses nettoyages : jamais nettoyé et
// rien de prévu, c'est « non renseigné » — pas « sale ».
const POI_SELECT = `
  SELECT p.id, p.commune_id, p.nom, p.type, p.adresse, p.actif, p.zone_id, z.name AS zone_nom,
         ST_Y(p.geom)::double precision AS lat, ST_X(p.geom)::double precision AS lng,
         n.dernier AS dernier_nettoyage, n.prochain AS prochain_nettoyage, n.en_retard AS nettoyages_en_retard,
         CASE WHEN n.dernier IS NULL AND n.prochain IS NULL AND n.en_retard = 0 THEN 'non_renseigne'
              WHEN n.en_retard > 0 THEN 'en_retard'
              WHEN n.dernier IS NOT NULL AND n.dernier >= (now() AT TIME ZONE 'Africa/Tunis')::date - 7 THEN 'propre'
              WHEN n.prochain IS NOT NULL THEN 'nettoyage_prevu'
              ELSE 'a_surveiller' END AS etat,
         p.created_at, p.updated_at
    FROM poi p
    LEFT JOIN zones_collecte z ON z.id = p.zone_id
    LEFT JOIN LATERAL (
      SELECT max(COALESCE(a.terminee_le::date, a.date_prevue)) FILTER (WHERE a.statut = 'terminee') AS dernier,
             min(a.date_prevue) FILTER (WHERE a.statut = 'planifiee' AND a.date_prevue >= (now() AT TIME ZONE 'Africa/Tunis')::date) AS prochain,
             count(*) FILTER (WHERE a.statut = 'planifiee' AND COALESCE(a.date_fin, a.date_prevue) < (now() AT TIME ZONE 'Africa/Tunis')::date)::int AS en_retard
        FROM actions_planifiees a
       WHERE a.poi_id = p.id AND a.type = 'nettoyage' AND a.deleted_at IS NULL
    ) n ON true
`;

poiRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const q = z.object({ type: z.enum(TYPES_POI).optional() }).parse({ type: req.query.type || undefined });
    res.json(
      await query(
        `${POI_SELECT} WHERE p.commune_id = $1 AND p.deleted_at IS NULL AND ($2::text IS NULL OR p.type = $2) ORDER BY p.type, p.nom`,
        [communeId, q.type ?? null]
      )
    );
  })
);

export const poiSchema = z.object({
  nom: z.string().trim().min(1).max(160),
  type: z.enum(TYPES_POI),
  lat: z.number().min(30).max(38),
  lng: z.number().min(7).max(12.5),
  adresse: z.string().trim().max(300).nullable().optional(),
  zoneId: z.string().uuid().nullable().optional(),
  actif: z.boolean().optional(),
});

poiRouter.post(
  '/',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const d = poiSchema.parse(req.body);
    const cree = await queryOne<{ id: string }>(
      `INSERT INTO poi (commune_id, nom, type, geom, adresse, zone_id, actif, created_by)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7, COALESCE($8, true), $9) RETURNING id`,
      [communeId, d.nom, d.type, d.lng, d.lat, d.adresse || null, d.zoneId ?? null, d.actif ?? null, req.user!.sub]
    );
    res.status(201).json(await queryOne(`${POI_SELECT} WHERE p.id = $1`, [cree!.id]));
  })
);

poiRouter.patch(
  '/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = poiSchema.partial().parse(req.body);
    const p = await queryOne<{ id: string }>('SELECT id FROM poi WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!p) throw new ApiError(404, 'Lieu introuvable.');
    if ((d.lat === undefined) !== (d.lng === undefined)) throw new ApiError(400, 'Une position se donne en latitude ET longitude.');
    await query(
      `UPDATE poi SET nom = COALESCE($2, nom), type = COALESCE($3, type),
              geom = CASE WHEN $4::float8 IS NULL THEN geom ELSE ST_SetSRID(ST_MakePoint($5, $4), 4326) END,
              adresse = CASE WHEN $6::boolean THEN $7 ELSE adresse END,
              zone_id = CASE WHEN $8::boolean THEN $9::uuid ELSE zone_id END,
              actif = COALESCE($10, actif)
        WHERE id = $1 AND deleted_at IS NULL`,
      [p.id, d.nom ?? null, d.type ?? null, d.lat ?? null, d.lng ?? null, d.adresse !== undefined, d.adresse || null,
       d.zoneId !== undefined, d.zoneId ?? null, d.actif ?? null]
    );
    res.json(await queryOne(`${POI_SELECT} WHERE p.id = $1`, [p.id]));
  })
);

poiRouter.delete(
  '/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    await retirer('poi', req.params.id, 'Lieu');
    res.status(204).end();
  })
);

// ===========================================================================
// 2. Les pleins de carburant
// ===========================================================================

export const pleinSchema = z.object({
  vehiculeId: z.string().min(1),
  datePlein: dateIso.refine((d) => d <= aujourdhui(), pasDansLAvenir),
  litres: z.number().positive().max(2000),
  montantTnd: z.number().min(0).max(1_000_000),
  kilometrage: z.number().int().min(0).max(10_000_000).nullable().optional(),
});

registresRouter.get(
  '/carburant',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const q = z.object({ vehiculeId: z.string().optional() }).parse(req.query);
    res.json(
      await query(
        `SELECT f.id, f.vehicule_id, v.registration, f.date_plein, f.litres::float, f.montant_tnd::float, f.kilometrage, f.created_at
           FROM fuel_logs f JOIN vehicules v ON v.id = f.vehicule_id
          WHERE f.commune_id = $1 AND f.deleted_at IS NULL AND ($2::text IS NULL OR f.vehicule_id = $2)
          ORDER BY f.date_plein DESC, f.created_at DESC`,
        [communeId, q.vehiculeId ?? null]
      )
    );
  })
);

registresRouter.post(
  '/carburant',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = pleinSchema.parse(req.body);
    const communeId = await communeDe('vehicules', d.vehiculeId, 'Engin');
    res.status(201).json(
      await queryOne(
        `INSERT INTO fuel_logs (commune_id, vehicule_id, date_plein, litres, montant_tnd, kilometrage, saisi_par)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, vehicule_id, date_plein, litres::float, montant_tnd::float, kilometrage`,
        [communeId, d.vehiculeId, d.datePlein, d.litres, d.montantTnd, d.kilometrage ?? null, req.user!.sub]
      )
    );
  })
);

registresRouter.delete(
  '/carburant/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    try {
      await retirer('fuel_logs', req.params.id, 'Plein');
    } catch (err) {
      // Un plein justifié par un bon encore valable (lot 16.3) : la base le
      // refuse, et dit quoi faire — annuler le bon, qui retire le plein.
      const message = (err as { message?: string }).message ?? '';
      if (message.includes('PLEIN_SOUS_BON')) throw new ApiError(409, message.replace(/^.*PLEIN_SOUS_BON: /, ''));
      throw err;
    }
    res.status(204).end();
  })
);

// ===========================================================================
// 3. La fin de poste du chauffeur
// ===========================================================================

export const finDePosteSchema = z.object({
  vehiculeId: z.string().min(1),
  jour: dateIso.refine((d) => d <= aujourdhui(), pasDansLAvenir),
  // Obligatoire : ni vide, ni « on verra ». Oui ou non.
  benneBachee: z.boolean({ required_error: 'La question « benne bâchée avant transit » est obligatoire.' }),
  circuitId: z.string().uuid().nullable().optional(),
  chauffeurId: z.string().uuid().nullable().optional(),
  observation: z.string().trim().max(1000).nullable().optional(),
});

registresRouter.get(
  '/fins-de-poste',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const q = z.object({ vehiculeId: z.string().optional() }).parse(req.query);
    res.json(
      await query(
        `SELECT f.id, f.vehicule_id, v.registration, f.jour, f.benne_bachee, f.circuit_id, c.nom AS circuit_nom,
                f.chauffeur_id, p.nom_complet AS chauffeur, f.observation, f.created_at
           FROM fins_de_poste f JOIN vehicules v ON v.id = f.vehicule_id
           LEFT JOIN circuits c ON c.id = f.circuit_id
           LEFT JOIN personnel p ON p.id = f.chauffeur_id
          WHERE f.commune_id = $1 AND f.deleted_at IS NULL AND ($2::text IS NULL OR f.vehicule_id = $2)
          ORDER BY f.jour DESC, f.created_at DESC`,
        [communeId, q.vehiculeId ?? null]
      )
    );
  })
);

registresRouter.post(
  '/fins-de-poste',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = finDePosteSchema.parse(req.body);
    const communeId = await communeDe('vehicules', d.vehiculeId, 'Engin');
    if (d.chauffeurId && (await communeDe('personnel', d.chauffeurId, 'Chauffeur')) !== communeId) {
      throw new ApiError(400, "Le chauffeur n'est pas de la commune de l'engin.");
    }
    res.status(201).json(
      await queryOne(
        `INSERT INTO fins_de_poste (commune_id, vehicule_id, circuit_id, chauffeur_id, jour, benne_bachee, observation, saisi_par)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [communeId, d.vehiculeId, d.circuitId ?? null, d.chauffeurId ?? null, d.jour, d.benneBachee, d.observation || null, req.user!.sub]
      )
    );
  })
);

registresRouter.delete(
  '/fins-de-poste/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    await retirer('fins_de_poste', req.params.id, 'Fin de poste');
    res.status(204).end();
  })
);

// ===========================================================================
// 4. La dotation en EPI et le journal des incidents du travail
// ===========================================================================

export const TYPES_EPI = ['gants', 'chaussures', 'gilet', 'tenue', 'masque', 'casque', 'lunettes', 'kit_complet', 'autre'] as const;

export const dotationSchema = z
  .object({
    personnelId: z.string().uuid(),
    typeEpi: z.enum(TYPES_EPI),
    dateRemise: dateIso.refine((d) => d <= aujourdhui(), pasDansLAvenir),
    dateRenouvellement: dateIso.nullable().optional(),
  })
  .refine((d) => !d.dateRenouvellement || d.dateRenouvellement >= d.dateRemise, {
    message: 'Le renouvellement précède la remise.',
    path: ['dateRenouvellement'],
  });

registresRouter.get(
  '/epi',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    res.json(
      await query(
        `SELECT d.id, d.personnel_id, p.nom_complet, p.fonction, d.type_epi, d.date_remise, d.date_renouvellement,
                (d.date_renouvellement IS NULL OR d.date_renouvellement >= (now() AT TIME ZONE 'Africa/Tunis')::date) AS en_cours
           FROM dotations_epi d JOIN personnel p ON p.id = d.personnel_id
          WHERE d.commune_id = $1 AND d.deleted_at IS NULL
          ORDER BY d.date_remise DESC, p.nom_complet`,
        [communeId]
      )
    );
  })
);

registresRouter.post(
  '/epi',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = dotationSchema.parse(req.body);
    const communeId = await communeDe('personnel', d.personnelId, 'Agent');
    res.status(201).json(
      await queryOne(
        `INSERT INTO dotations_epi (commune_id, personnel_id, type_epi, date_remise, date_renouvellement, saisi_par)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [communeId, d.personnelId, d.typeEpi, d.dateRemise, d.dateRenouvellement ?? null, req.user!.sub]
      )
    );
  })
);

registresRouter.delete(
  '/epi/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    await retirer('dotations_epi', req.params.id, 'Dotation');
    res.status(204).end();
  })
);

export const incidentSchema = z.object({
  personnelId: z.string().uuid().nullable().optional(),
  dateIncident: dateIso.refine((d) => d <= aujourdhui(), pasDansLAvenir),
  type: z.enum(['accident', 'presque_accident', 'agression', 'maladie_professionnelle', 'autre']),
  gravite: z.enum(['benin', 'avec_arret', 'grave']),
  joursArret: z.number().int().min(0).max(3650).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});

registresRouter.get(
  '/incidents',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    res.json(
      await query(
        `SELECT i.id, i.personnel_id, p.nom_complet, i.date_incident, i.type, i.gravite, i.jours_arret, i.description, i.created_at
           FROM incidents_travail i LEFT JOIN personnel p ON p.id = i.personnel_id
          WHERE i.commune_id = $1 AND i.deleted_at IS NULL
          ORDER BY i.date_incident DESC, i.created_at DESC`,
        [communeId]
      )
    );
  })
);

registresRouter.post(
  '/incidents',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = incidentSchema.parse(req.body);
    const communeId = d.personnelId ? await communeDe('personnel', d.personnelId, 'Agent') : communeRequise(req);
    res.status(201).json(
      await queryOne(
        `INSERT INTO incidents_travail (commune_id, personnel_id, date_incident, type, gravite, jours_arret, description, saisi_par)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [communeId, d.personnelId ?? null, d.dateIncident, d.type, d.gravite, d.joursArret ?? null, d.description || null, req.user!.sub]
      )
    );
  })
);

registresRouter.delete(
  '/incidents/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    await retirer('incidents_travail', req.params.id, 'Incident');
    res.status(204).end();
  })
);

// ===========================================================================
// 5. Les commerces et leurs conventions de propreté
// ===========================================================================

export const commerceSchema = z.object({
  nom: z.string().trim().min(1).max(160),
  categorie: z.enum(['commerce', 'institution']).optional(),
  activite: z.string().trim().max(160).nullable().optional(),
  adresse: z.string().trim().max(300).nullable().optional(),
  actif: z.boolean().optional(),
});

registresRouter.get(
  '/commerces',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    res.json(
      await query(
        `SELECT c.*, EXISTS (
                  SELECT 1 FROM conventions_commerciales cv
                   WHERE cv.commerce_id = c.id AND cv.deleted_at IS NULL
                     AND cv.date_debut <= (now() AT TIME ZONE 'Africa/Tunis')::date
                     AND (cv.date_fin IS NULL OR cv.date_fin >= (now() AT TIME ZONE 'Africa/Tunis')::date)) AS sous_convention
           FROM commerces c WHERE c.commune_id = $1 AND c.deleted_at IS NULL ORDER BY c.nom`,
        [communeId]
      )
    );
  })
);

registresRouter.post(
  '/commerces',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const d = commerceSchema.parse(req.body);
    res.status(201).json(
      await queryOne(
        `INSERT INTO commerces (commune_id, nom, categorie, activite, adresse, actif)
         VALUES ($1, $2, COALESCE($3, 'commerce'), $4, $5, COALESCE($6, true)) RETURNING *`,
        [communeId, d.nom, d.categorie ?? null, d.activite || null, d.adresse || null, d.actif ?? null]
      )
    );
  })
);

registresRouter.patch(
  '/commerces/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = commerceSchema.partial().parse(req.body);
    const modifie = await queryOne(
      `UPDATE commerces SET nom = COALESCE($2, nom), categorie = COALESCE($3, categorie),
              activite = CASE WHEN $4::boolean THEN $5 ELSE activite END,
              adresse = CASE WHEN $6::boolean THEN $7 ELSE adresse END,
              actif = COALESCE($8, actif), updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [req.params.id, d.nom ?? null, d.categorie ?? null, d.activite !== undefined, d.activite || null,
       d.adresse !== undefined, d.adresse || null, d.actif ?? null]
    );
    if (!modifie) throw new ApiError(404, 'Commerce introuvable.');
    res.json(modifie);
  })
);

registresRouter.delete(
  '/commerces/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    await retirer('commerces', req.params.id, 'Commerce');
    res.status(204).end();
  })
);

export const conventionSchema = z
  .object({
    commerceId: z.string().uuid(),
    type: z.enum(['collecte', 'nettoyage', 'tri', 'autre']),
    dateDebut: dateIso,
    dateFin: dateIso.nullable().optional(),
    tonnageEstime: z.number().min(0).max(100_000).nullable().optional(),
    observation: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((d) => !d.dateFin || d.dateFin >= d.dateDebut, { message: 'La fin précède le début.', path: ['dateFin'] });

registresRouter.get(
  '/conventions',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    res.json(
      await query(
        `SELECT cv.id, cv.commerce_id, c.nom AS commerce, c.categorie, cv.type, cv.date_debut, cv.date_fin,
                cv.tonnage_estime::float, cv.observation,
                (cv.date_debut <= (now() AT TIME ZONE 'Africa/Tunis')::date
                  AND (cv.date_fin IS NULL OR cv.date_fin >= (now() AT TIME ZONE 'Africa/Tunis')::date)) AS active
           FROM conventions_commerciales cv JOIN commerces c ON c.id = cv.commerce_id
          WHERE cv.commune_id = $1 AND cv.deleted_at IS NULL
          ORDER BY cv.date_debut DESC`,
        [communeId]
      )
    );
  })
);

registresRouter.post(
  '/conventions',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = conventionSchema.parse(req.body);
    const communeId = await communeDe('commerces', d.commerceId, 'Commerce');
    res.status(201).json(
      await queryOne(
        `INSERT INTO conventions_commerciales (commune_id, commerce_id, type, date_debut, date_fin, tonnage_estime, observation, saisi_par)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [communeId, d.commerceId, d.type, d.dateDebut, d.dateFin ?? null, d.tonnageEstime ?? null, d.observation || null, req.user!.sub]
      )
    );
  })
);

registresRouter.delete(
  '/conventions/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    await retirer('conventions_commerciales', req.params.id, 'Convention');
    res.status(204).end();
  })
);
