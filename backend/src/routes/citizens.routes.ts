import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const citizensRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
  fullName: z.string().min(2),
  phone: z.string().optional(),
});

// POST /citizens/register — inscription publique à l'application citoyenne.
// users et citoyens sont cloisonnés par RLS : aucune écriture n'est possible
// sans authentification. app.register_citizen (fonction SECURITY DEFINER,
// migration 013) est l'unique porte d'entrée prévue pour ce cas, et crée le
// compte et son profil citoyen dans une seule transaction.
citizensRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 12);

    try {
      const created = await queryOne(
        'SELECT * FROM app.register_citizen($1, $2, $3, $4)',
        [data.email.toLowerCase(), passwordHash, data.fullName, data.phone ?? null]
      );
      res.status(201).json(created);
    } catch (err: any) {
      if (err?.code === '23505' || err?.message?.includes('EMAIL_DEJA_UTILISE')) {
        throw new ApiError(409, 'Un compte existe déjà avec cet email.');
      }
      throw err;
    }
  })
);

// GET /citizens/me — profil citoyen (points, badges, récompenses) de l'utilisateur connecté
citizensRouter.get(
  '/me',
  requireAuth,
  requireRole('citoyen'),
  asyncHandler(async (req, res) => {
    const citizen = await queryOne('SELECT * FROM citoyens WHERE user_id = $1', [req.user!.sub]);
    if (!citizen) throw new ApiError(404, 'Profil citoyen introuvable.');
    const badges = await query('SELECT * FROM citizen_badges WHERE citizen_id = $1 ORDER BY unlocked_at DESC', [
      (citizen as any).id,
    ]);
    const rewards = await query('SELECT * FROM citizen_rewards WHERE citizen_id = $1', [(citizen as any).id]);
    res.json({ ...citizen, badges, rewards });
  })
);

// Schémas exposés à la documentation OpenAPI (src/openapi/document.ts).
// La documentation importe les schémas de validation EUX-MÊMES : elle ne peut
// donc pas décrire un format différent de celui réellement contrôlé à l'exécution.
export {
  registerSchema as citizenRegisterSchema,
};
