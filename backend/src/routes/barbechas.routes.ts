import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const barbechasRouter = Router();

barbechasRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = typeof req.query.communeId === 'string' ? req.query.communeId : undefined;
    const rows = communeId
      ? await query('SELECT * FROM barbechas WHERE commune_id = $1 ORDER BY name', [communeId])
      : await query('SELECT * FROM barbechas ORDER BY name');
    res.json(rows);
  })
);

barbechasRouter.get(
  '/:id/deliveries',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await query('SELECT * FROM barbecha_deliveries WHERE barbecha_id = $1 ORDER BY delivered_at DESC', [
      req.params.id,
    ]);
    res.json(rows);
  })
);

const deliverySchema = z.object({
  material: z.enum(['PET_plastique', 'PEHD', 'Carton', 'Aluminium', 'Cuivre']),
  weightKg: z.number().positive(),
  hubName: z.string().optional(),
});

const UNIT_PRICES_TND: Record<string, number> = {
  PET_plastique: 1.1,
  PEHD: 0.95,
  Carton: 0.35,
  Aluminium: 2.5,
  Cuivre: 8.0,
};

// POST /barbechas/:id/deliveries — pesée d'achat au centre de tri social.
// Le montant est calculé côté serveur (jamais fourni par le client) pour éviter toute falsification.
// Note : le module GDMA/Barbécha n'apparaît pas dans le cahier des charges officiel FNCT
// (il vient du prototype d'origine). Il est conservé fonctionnel mais géré par l'Admin
// Commune (il n'existe pas de rôle de connexion "acteur GDMA" distinct dans le CDC) —
// à statuer avec la FNCT : module Phase 2+ ou à retirer du périmètre.
barbechasRouter.post(
  '/:id/deliveries',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const data = deliverySchema.parse(req.body);
    const barbecha = await queryOne('SELECT id FROM barbechas WHERE id = $1', [req.params.id]);
    if (!barbecha) throw new ApiError(404, 'Barbécha introuvable.');

    const unitPrice = UNIT_PRICES_TND[data.material];
    const amountTnd = Number((data.weightKg * unitPrice).toFixed(2));

    const delivery = await queryOne(
      `INSERT INTO barbecha_deliveries (barbecha_id, material, weight_kg, amount_tnd, hub_name)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, data.material, data.weightKg, amountTnd, data.hubName ?? null]
    );
    res.status(201).json(delivery);
  })
);

// Schémas exposés à la documentation OpenAPI (src/openapi/document.ts).
// La documentation importe les schémas de validation EUX-MÊMES : elle ne peut
// donc pas décrire un format différent de celui réellement contrôlé à l'exécution.
export {
  deliverySchema as barbechaDeliverySchema,
};
