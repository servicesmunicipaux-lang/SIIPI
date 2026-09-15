import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { calculateNationalKpi, calculateOverallScore } from '../services/kpiEngine.js';

export const kpiRouter = Router();

const nationalKpiSchema = z.object({
  tonnageAnnuelKg: z.number().positive(),
  population: z.number().positive(),
  coutTotalExploitationTND: z.number().optional(),
});

// POST /kpi/national — calcule QP/TC/coût par habitant à partir de valeurs saisies
// (utilisé par le simulateur d'investissement flotte).
kpiRouter.post(
  '/national',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = nationalKpiSchema.parse(req.body);
    res.json(calculateNationalKpi(input));
  })
);

// 5 axes officiels — cahier des charges FNCT/ANGeD §3.2.10.
const fiveAxisSchema = z.object({
  communeId: z.string(),
  efficaciteOperationnelle: z.number().min(0).max(100),
  qualiteService: z.number().min(0).max(100),
  performanceEnvironnementale: z.number().min(0).max(100),
  performanceEconomique: z.number().min(0).max(100),
  securiteRh: z.number().min(0).max(100),
});

// POST /kpi/five-axis — enregistre une évaluation "5 Axes" pour une commune
kpiRouter.post(
  '/five-axis',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const data = fiveAxisSchema.parse(req.body);
    const overallScore = calculateOverallScore(data);
    const saved = await queryOne(
      `INSERT INTO five_axis_scores
         (commune_id, efficacite_operationnelle, qualite_service, performance_environnementale, performance_economique, securite_rh)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        data.communeId,
        data.efficaciteOperationnelle,
        data.qualiteService,
        data.performanceEnvironnementale,
        data.performanceEconomique,
        data.securiteRh,
      ]
    );
    res.status(201).json({ ...saved, overallScore });
  })
);

// GET /kpi/five-axis/:communeId — dernière évaluation connue pour une commune
kpiRouter.get(
  '/five-axis/:communeId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const row = await queryOne(
      'SELECT * FROM five_axis_scores WHERE commune_id = $1 ORDER BY computed_at DESC LIMIT 1',
      [req.params.communeId]
    );
    if (!row) throw new ApiError(404, "Aucune évaluation 5 axes pour cette commune.");
    res.json(row);
  })
);
