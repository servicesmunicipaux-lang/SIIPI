import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const trucksRouter = Router();

trucksRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = typeof req.query.communeId === 'string' ? req.query.communeId : req.user?.communeId ?? undefined;
    const rows = communeId
      ? await query('SELECT * FROM vehicules WHERE commune_id = $1 ORDER BY registration', [communeId])
      : await query('SELECT * FROM vehicules ORDER BY registration');
    res.json(rows);
  })
);

const positionSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  currentSpeedKmH: z.number().optional(),
  fuelLevelPercent: z.number().optional(),
  currentWeightTons: z.number().optional(),
  status: z.enum(['en_tournee', 'au_depot', 'en_decharge', 'en_maintenance']).optional(),
  completedStops: z.number().int().optional(),
});

// PATCH /trucks/:id/position — ingestion télématique (à appeler depuis le futur module GPS embarqué).
// Rôles autorisés selon le CDC : Admin Commune (rubrique "Engins & GMAO", §B2) et
// Gestionnaire Prestataire (privé) pour les véhicules de sa flotte sous contrat.
// (Il n'existe pas de rôle de connexion "agent de terrain" distinct dans la matrice RBAC du CDC.)
trucksRouter.patch(
  '/:id/position',
  requireAuth,
  requireRole('admin_commune', 'gestionnaire_prestataire', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const truck = await queryOne<{ commune_id: string }>('SELECT commune_id FROM vehicules WHERE id = $1', [req.params.id]);
    if (!truck) throw new ApiError(404, 'Véhicule introuvable.');

    // Un directeur municipal ou un gestionnaire prestataire ne peut mettre à jour que les véhicules de sa propre commune.
    if (req.user!.role !== 'super_admin_fnct' && req.user!.communeId !== truck.commune_id) {
      throw new ApiError(403, "Vous n'êtes pas autorisé à agir sur ce véhicule.");
    }

    const data = positionSchema.parse(req.body);
    const updated = await queryOne(
      `UPDATE vehicules
          SET lat = $1, lng = $2,
              current_speed_kmh = COALESCE($3, current_speed_kmh),
              fuel_level_percent = COALESCE($4, fuel_level_percent),
              current_weight_tons = COALESCE($5, current_weight_tons),
              status = COALESCE($6, status),
              completed_stops = COALESCE($7, completed_stops)
        WHERE id = $8
        RETURNING *`,
      [
        data.lat,
        data.lng,
        data.currentSpeedKmH ?? null,
        data.fuelLevelPercent ?? null,
        data.currentWeightTons ?? null,
        data.status ?? null,
        data.completedStops ?? null,
        req.params.id,
      ]
    );
    res.json(updated);
  })
);
