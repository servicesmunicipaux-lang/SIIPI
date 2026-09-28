// Maintenance des engins — la GMAO du Jalon 5 (TDR §3.2.2, B2.2 et B2.3).
//
// Trois choses, dans l'ordre où un chef de parc s'en sert :
//   1. les échéances — ce qui est en retard ou à prévoir, calculé à partir de
//      la dernière intervention de chaque type (jamais stocké : une échéance
//      écrite en base resterait fausse après une intervention saisie) ;
//   2. le carnet d'entretien — chaque intervention, son coût, son kilométrage ;
//   3. les plans — « vidange tous les 10 000 km ou tous les 180 jours ».
//
// Des coûts et des pannes : la commune et la FNCT seulement (migration 046).

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';
import { exportable } from '../services/export.js';
import { JEU_ECHEANCES, JEU_INTERVENTIONS } from '../services/jeuxExport.js';

export const maintenanceRouter = Router();

const TYPES = [
  'vidange', 'revision', 'pneumatiques', 'freinage', 'hydraulique',
  'electricite', 'carrosserie', 'controle_technique', 'reparation', 'autre',
] as const;
const NATURES = ['preventive', 'corrective'] as const;
const STATUTS = ['en_retard', 'a_prevoir', 'a_verifier', 'a_jour'] as const;

const ROLES = ['admin_commune', 'super_admin_fnct'] as const;
const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');

/** Aujourd'hui à Tunis (UTC+1, sans heure d'été). */
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

/** L'engin, lu sous RLS : invisible, il est introuvable (jamais « interdit »). */
async function engin(id: string) {
  const v = await queryOne<{ id: string; commune_id: string; kilometrage: number | null; kilometrage_le: string | null }>(
    'SELECT id, commune_id, kilometrage, kilometrage_le FROM vehicules WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  if (!v) throw new ApiError(404, 'Engin introuvable.');
  return v;
}

// ---------------------------------------------------------------------------
// 1. Échéances (B2.3)
// ---------------------------------------------------------------------------

maintenanceRouter.get(
  '/echeances',
  requireAuth,
  requireRole(...ROLES),
  exportable(JEU_ECHEANCES, (req) => communeDemandee(req) ?? undefined),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const q = z
      .object({ statut: z.enum(STATUTS).optional(), vehiculeId: z.string().optional() })
      .parse(req.query);
    res.json(
      await query(
        `SELECT * FROM app.echeances_entretien($1)
          WHERE ($2::text IS NULL OR statut = $2) AND ($3::text IS NULL OR vehicule_id = $3)`,
        [communeId, q.statut ?? null, q.vehiculeId ?? null]
      )
    );
  })
);

// ---------------------------------------------------------------------------
// 2. Carnet d'entretien (B2.2)
// ---------------------------------------------------------------------------

const INTERVENTION_SELECT = `
  SELECT i.id, i.commune_id, i.vehicule_id, v.registration, i.date_intervention, i.type, i.nature,
         i.description, i.cout_tnd, i.kilometrage, i.prestataire, i.created_at, i.updated_at
    FROM interventions_maintenance i
    JOIN vehicules v ON v.id = i.vehicule_id
`;

const champsIntervention = {
  vehiculeId: z.string().min(1),
  dateIntervention: dateIso.refine((d) => d <= aujourdhui(), {
    message: "Une intervention se saisit une fois faite : la date ne peut pas être dans l'avenir.",
  }),
  type: z.enum(TYPES),
  nature: z.enum(NATURES).optional(),
  description: z.string().max(2000).nullable().optional(),
  coutTnd: z.number().min(0).max(1_000_000_000).nullable().optional(),
  kilometrage: z.number().int().min(0).max(10_000_000).nullable().optional(),
  prestataire: z.string().max(200).nullable().optional(),
};
const interventionSchema = z.object(champsIntervention);
const majInterventionSchema = z.object(champsIntervention).omit({ vehiculeId: true }).partial();

maintenanceRouter.get(
  '/interventions',
  requireAuth,
  requireRole(...ROLES),
  exportable(JEU_INTERVENTIONS, (req) => communeDemandee(req) ?? undefined),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const q = z
      .object({
        vehiculeId: z.string().optional(),
        type: z.enum(TYPES).optional(),
        depuis: dateIso.optional(),
        jusqua: dateIso.optional(),
      })
      .parse(req.query);
    res.json(
      await query(
        `${INTERVENTION_SELECT}
          WHERE i.deleted_at IS NULL AND i.commune_id = $1
            AND ($2::text IS NULL OR i.vehicule_id = $2)
            AND ($3::text IS NULL OR i.type = $3)
            AND ($4::date IS NULL OR i.date_intervention >= $4)
            AND ($5::date IS NULL OR i.date_intervention <= $5)
          ORDER BY i.date_intervention DESC, i.created_at DESC`,
        [communeId, q.vehiculeId ?? null, q.type ?? null, q.depuis ?? null, q.jusqua ?? null]
      )
    );
  })
);

maintenanceRouter.post(
  '/interventions',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = interventionSchema.parse(req.body);
    // La commune est celle de l'ENGIN, pas celle que l'appelant annonce : une
    // panne n'est pas rattachable à la commune de son choix.
    const v = await engin(d.vehiculeId);
    const cree = await queryOne<{ id: string }>(
      `INSERT INTO interventions_maintenance
         (commune_id, vehicule_id, date_intervention, type, nature, description, cout_tnd,
          kilometrage, prestataire, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [v.commune_id, v.id, d.dateIntervention, d.type, d.nature ?? 'corrective', d.description ?? null,
       d.coutTnd ?? null, d.kilometrage ?? null, d.prestataire ?? null, req.user!.sub]
    );
    res.status(201).json(await queryOne(`${INTERVENTION_SELECT} WHERE i.id = $1`, [cree!.id]));
  })
);

maintenanceRouter.patch(
  '/interventions/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = majInterventionSchema.parse(req.body);
    const colonnes: Record<string, string> = {
      dateIntervention: 'date_intervention', type: 'type', nature: 'nature', description: 'description',
      coutTnd: 'cout_tnd', kilometrage: 'kilometrage', prestataire: 'prestataire',
    };
    const clauses: string[] = [];
    const valeurs: unknown[] = [req.params.id];
    for (const [cle, colonne] of Object.entries(colonnes)) {
      if (!(cle in d)) continue;
      valeurs.push((d as Record<string, unknown>)[cle] ?? null);
      clauses.push(`${colonne} = $${valeurs.length}${cle === 'dateIntervention' ? '::date' : ''}`);
    }
    if (clauses.length === 0) throw new ApiError(400, 'Aucun champ à mettre à jour.');
    const modifie = await queryOne(
      `UPDATE interventions_maintenance SET ${clauses.join(', ')} WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      valeurs
    );
    if (!modifie) throw new ApiError(404, 'Intervention introuvable.');
    res.json(await queryOne(`${INTERVENTION_SELECT} WHERE i.id = $1`, [req.params.id]));
  })
);

/** Retrait logique, après un contrôle de visibilité sous RLS (404, jamais 403). */
async function retirer(table: 'interventions_maintenance' | 'plans_entretien', id: string, nom: string) {
  const visible = await queryOne(`SELECT id FROM ${table} WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (!visible) throw new ApiError(404, `${nom} introuvable.`);
  await query('SELECT app.supprimer($1, $2)', [table, id]);
}

maintenanceRouter.delete(
  '/interventions/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    await retirer('interventions_maintenance', req.params.id, 'Intervention');
    res.status(204).end();
  })
);

// ---------------------------------------------------------------------------
// 3. Plans d'entretien (B2.3)
// ---------------------------------------------------------------------------

const PLAN_SELECT = `
  SELECT p.id, p.commune_id, p.vehicule_id, v.registration, p.type, p.libelle,
         p.intervalle_km, p.intervalle_jours, p.seuil_alerte_km, p.seuil_alerte_jours,
         p.reference_date, p.reference_km, p.created_at
    FROM plans_entretien p
    JOIN vehicules v ON v.id = p.vehicule_id
`;

const unIntervalle = {
  message: 'Un plan doit porter un intervalle en kilomètres ou en jours — sans quoi il ne déclencherait jamais rien.',
  path: ['intervalleKm'],
};
const champsPlan = {
  vehiculeId: z.string().min(1),
  type: z.enum(TYPES),
  libelle: z.string().max(200).nullable().optional(),
  intervalleKm: z.number().int().positive().max(1_000_000).nullable().optional(),
  intervalleJours: z.number().int().positive().max(3650).nullable().optional(),
  seuilAlerteKm: z.number().int().min(0).max(100_000).optional(),
  seuilAlerteJours: z.number().int().min(0).max(365).optional(),
  referenceDate: dateIso.optional(),
  referenceKm: z.number().int().min(0).max(10_000_000).nullable().optional(),
};
const planSchema = z.object(champsPlan).refine((p) => p.intervalleKm != null || p.intervalleJours != null, unIntervalle);
const majPlanSchema = z.object(champsPlan).omit({ vehiculeId: true }).partial();

maintenanceRouter.get(
  '/plans',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const q = z.object({ vehiculeId: z.string().optional() }).parse(req.query);
    res.json(
      await query(
        `${PLAN_SELECT} WHERE p.deleted_at IS NULL AND p.commune_id = $1 AND ($2::text IS NULL OR p.vehicule_id = $2)
          ORDER BY v.registration, p.type`,
        [communeId, q.vehiculeId ?? null]
      )
    );
  })
);

maintenanceRouter.post(
  '/plans',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = planSchema.parse(req.body);
    const v = await engin(d.vehiculeId);
    const cree = await queryOne<{ id: string }>(
      `INSERT INTO plans_entretien
         (commune_id, vehicule_id, type, libelle, intervalle_km, intervalle_jours,
          seuil_alerte_km, seuil_alerte_jours, reference_date, reference_km, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::date, CURRENT_DATE), $10, $11)
       RETURNING id`,
      [v.commune_id, v.id, d.type, d.libelle ?? null, d.intervalleKm ?? null, d.intervalleJours ?? null,
       d.seuilAlerteKm ?? 1000, d.seuilAlerteJours ?? 30, d.referenceDate ?? null,
       // Sans point de départ fourni, le compte au kilomètre part du
       // kilométrage connu de l'engin au moment où le plan est posé.
       d.referenceKm !== undefined ? d.referenceKm : v.kilometrage, req.user!.sub]
    );
    res.status(201).json(await queryOne(`${PLAN_SELECT} WHERE p.id = $1`, [cree!.id]));
  })
);

maintenanceRouter.patch(
  '/plans/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = majPlanSchema.parse(req.body);
    const colonnes: Record<string, string> = {
      type: 'type', libelle: 'libelle', intervalleKm: 'intervalle_km', intervalleJours: 'intervalle_jours',
      seuilAlerteKm: 'seuil_alerte_km', seuilAlerteJours: 'seuil_alerte_jours',
      referenceDate: 'reference_date', referenceKm: 'reference_km',
    };
    const clauses: string[] = [];
    const valeurs: unknown[] = [req.params.id];
    for (const [cle, colonne] of Object.entries(colonnes)) {
      if (!(cle in d)) continue;
      valeurs.push((d as Record<string, unknown>)[cle] ?? null);
      clauses.push(`${colonne} = $${valeurs.length}${cle === 'referenceDate' ? '::date' : ''}`);
    }
    if (clauses.length === 0) throw new ApiError(400, 'Aucun champ à mettre à jour.');
    // La contrainte « au moins un intervalle » de la base refuse qu'on retire
    // les deux : l'erreur remonte en 400.
    const modifie = await queryOne(
      `UPDATE plans_entretien SET ${clauses.join(', ')} WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      valeurs
    );
    if (!modifie) throw new ApiError(404, 'Plan introuvable.');
    res.json(await queryOne(`${PLAN_SELECT} WHERE p.id = $1`, [req.params.id]));
  })
);

maintenanceRouter.delete(
  '/plans/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    await retirer('plans_entretien', req.params.id, 'Plan');
    res.status(204).end();
  })
);

// ---------------------------------------------------------------------------
// 4. Le compteur, et ce que coûte chaque engin
// ---------------------------------------------------------------------------

const releveSchema = z.object({
  kilometrage: z.number().int().min(0).max(10_000_000),
  date: dateIso.optional(),
  /** Compteur remplacé : le seul cas où un relevé peut être inférieur au précédent. */
  forcer: z.boolean().optional(),
});

maintenanceRouter.put(
  '/engins/:id/kilometrage',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = releveSchema.parse(req.body);
    const v = await engin(req.params.id);
    if (v.kilometrage != null && d.kilometrage < v.kilometrage && !d.forcer) {
      throw new ApiError(
        400,
        `Le compteur ne recule pas : dernier relevé ${v.kilometrage} km${v.kilometrage_le ? ` le ${v.kilometrage_le}` : ''}. ` +
          'Si le compteur a été remplacé, confirmez le relevé.'
      );
    }
    const date = d.date ?? aujourdhui();
    if (date > aujourdhui()) throw new ApiError(400, "Un relevé ne peut pas être daté de l'avenir.");
    await query('UPDATE vehicules SET kilometrage = $2, kilometrage_le = $3::date, last_update = now() WHERE id = $1', [
      v.id, d.kilometrage, date,
    ]);
    res.json(await queryOne('SELECT id, registration, kilometrage, kilometrage_le FROM vehicules WHERE id = $1', [v.id]));
  })
);

maintenanceRouter.get(
  '/bilan',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    // Douze mois glissants, et la part du curatif : c'est ce que l'axe 3 des
    // KPI rapportera au tonnage collecté (Jalon 8).
    res.json(
      await query(
        `SELECT v.id AS vehicule_id, v.registration,
                count(i.id)::int AS interventions_12_mois,
                COALESCE(sum(i.cout_tnd), 0)::float AS cout_12_mois_tnd,
                COALESCE(sum(i.cout_tnd) FILTER (WHERE i.nature = 'corrective'), 0)::float AS cout_correctif_12_mois_tnd,
                max(i.date_intervention) AS derniere_intervention
           FROM vehicules v
           LEFT JOIN interventions_maintenance i
                  ON i.vehicule_id = v.id AND i.deleted_at IS NULL
                 AND i.date_intervention > CURRENT_DATE - INTERVAL '12 months'
          WHERE v.commune_id = $1 AND v.deleted_at IS NULL
          GROUP BY v.id, v.registration
          ORDER BY cout_12_mois_tnd DESC, v.registration`,
        [communeId]
      )
    );
  })
);

export {
  interventionSchema,
  majInterventionSchema,
  planSchema,
  majPlanSchema,
  releveSchema,
  TYPES as TYPES_INTERVENTION,
  NATURES as NATURES_INTERVENTION,
  STATUTS as STATUTS_ECHEANCE,
};
