// Le mode démo de l'observatoire national (lot S1, FEUILLE_DE_ROUTE.md § 6bis).
//
// Réservé à la FNCT : charger le jeu crée une commune, ce qu'aucune commune ne
// peut faire. Le portail de la commune de démonstration s'ouvre ensuite comme
// celui de n'importe quelle commune, sous une bannière permanente.
//
//   GET  /demo           l'état : chargé ou non, la période, les volumes
//   POST /demo/charger   charge, ou recharge à l'identique
//   POST /demo/retirer   efface la commune de démonstration et tout son contenu
import { Router } from 'express';
import { z } from 'zod';
import { withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { chargerDemo, COMMUNE_DEMO, etatDemo, retirerDemo } from '../services/jumeau.js';

export const demoRouter = Router();

export const demandeDemoSchema = z.object({
  // Par défaut, la commune de démonstration du jeu. Une commune réelle est refusée (409).
  communeId: z.string().min(1).optional(),
});

demoRouter.get(
  '/',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (_req, res) => {
    res.json(await withTransaction((client) => etatDemo(client, COMMUNE_DEMO())));
  })
);

demoRouter.post(
  '/charger',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const { communeId } = demandeDemoSchema.parse(req.body ?? {});
    res.status(201).json(await withTransaction((client) => chargerDemo(client, communeId)));
  })
);

demoRouter.post(
  '/retirer',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const { communeId } = demandeDemoSchema.parse(req.body ?? {});
    const cible = communeId ?? COMMUNE_DEMO();
    const lignes = await withTransaction((client) => retirerDemo(client, cible));
    res.json({ communeId: cible, retiree: true, lignesEffacees: lignes });
  })
);
