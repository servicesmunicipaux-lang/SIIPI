import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const containersRouter = Router();

containersRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = typeof req.query.communeId === 'string' ? req.query.communeId : req.user?.communeId ?? undefined;
    const alertOnly = req.query.alertOnly === 'true';
    const conditions: string[] = [];
    const params: any[] = [];
    if (communeId) {
      params.push(communeId);
      conditions.push(`commune_id = $${params.length}`);
    }
    if (alertOnly) {
      conditions.push(`status IN ('alerte_debordement', 'incendie_detecte')`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await query(`SELECT * FROM conteneurs ${where} ORDER BY fill_level DESC`, params);
    res.json(rows);
  })
);
