import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const weighbridgeRouter = Router();

weighbridgeRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = typeof req.query.communeId === 'string' ? req.query.communeId : req.user?.communeId ?? undefined;
    const rows = communeId
      ? await query('SELECT * FROM pesees_anged WHERE commune_id = $1 ORDER BY timestamp_in DESC', [communeId])
      : await query('SELECT * FROM pesees_anged ORDER BY timestamp_in DESC LIMIT 200');
    res.json(rows);
  })
);

const createSchema = z.object({
  ticketNumberAnged: z.string(),
  vehiculeId: z.string().optional(),
  truckReg: z.string().optional(),
  communeId: z.string(),
  landfillSite: z.string(),
  timestampIn: z.string(),
  timestampOut: z.string().optional(),
  grossWeightKg: z.number(),
  tareWeightKg: z.number(),
  onboardEstimateKg: z.number().optional(),
});

// POST /weighbridge — enregistrement d'une pesée au pont-bascule ANGeD.
// Le statut de conformité (conforme / ecart_acceptable / anomalie_pesee) est calculé
// automatiquement en base par le trigger pesees_set_status (migration 006).
// Selon le CDC, les pesées sont saisies par l'Admin Commune (pas de rôle "agent de
// terrain" distinct dans la matrice RBAC officielle).
weighbridgeRouter.post(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const created = await queryOne(
      `INSERT INTO pesees_anged
         (ticket_number_anged, vehicule_id, truck_reg, commune_id, landfill_site, timestamp_in, timestamp_out, gross_weight_kg, tare_weight_kg, onboard_estimate_kg)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        data.ticketNumberAnged,
        data.vehiculeId ?? null,
        data.truckReg ?? null,
        data.communeId,
        data.landfillSite,
        data.timestampIn,
        data.timestampOut ?? null,
        data.grossWeightKg,
        data.tareWeightKg,
        data.onboardEstimateKg ?? null,
      ]
    );
    res.status(201).json(created);
  })
);

// Schémas exposés à la documentation OpenAPI (src/openapi/document.ts).
// La documentation importe les schémas de validation EUX-MÊMES : elle ne peut
// donc pas décrire un format différent de celui réellement contrôlé à l'exécution.
export {
  createSchema as weighbridgeCreateSchema,
};
