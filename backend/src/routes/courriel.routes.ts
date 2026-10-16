// ---------------------------------------------------------------------------
// Le serveur de courriel, vu par la FNCT (v0.15.47).
//
// L'état dit si un serveur est désigné, lequel, et comment on s'y authentifie —
// jamais le mot de passe. L'essai n'écrit qu'à l'adresse du compte qui le
// demande : une route qui enverrait à une adresse choisie ferait de SIIPI un
// relais ouvert, au nom de la FNCT.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { envoyerCourriel, etatCourriel } from '../services/courriel.js';

export const courrielRouter = Router();

courrielRouter.get(
  '/etat',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (_req, res) => {
    res.json(etatCourriel());
  })
);

courrielRouter.post(
  '/essai',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const moi = await queryOne<{ email: string }>('SELECT email FROM users WHERE id = $1', [req.user?.sub]);
    if (!moi) throw new ApiError(404, 'Compte introuvable.');
    const r = await envoyerCourriel(
      moi.email,
      'SIIPI — courriel d’essai',
      'Ce courriel d’essai a été demandé depuis les paramètres nationaux de SIIPI.\n'
        + 'S’il vous parvient, le serveur de courriel désigné accepte les envois de la plateforme.'
    );
    res.json({ destinataire: moi.email, ...r });
  })
);
