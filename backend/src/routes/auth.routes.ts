import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, signToken, type UserRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  commune_id: string | null;
  is_active: boolean;
  mot_de_passe_provisoire?: boolean;
}

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    // La table users est cloisonnée par RLS et n'est donc pas lisible avant
    // authentification. app.find_user_for_login est l'unique porte d'entrée
    // prévue pour ce cas (fonction SECURITY DEFINER, migration 013).
    const user = await queryOne<UserRow>('SELECT * FROM app.find_user_for_login($1)', [email]);

    if (!user || !user.is_active) {
      // Message volontairement identique pour email inconnu / mot de passe faux (anti-énumération de comptes)
      throw new ApiError(401, 'Identifiants incorrects.');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new ApiError(401, 'Identifiants incorrects.');
    }

    const token = signToken({ sub: user.id, role: user.role, communeId: user.commune_id });
    // Un compte ouvert il y a six mois et jamais utilisé se ferme ; encore
    // faut-il pouvoir le voir.
    await query('SELECT app.enregistrer_connexion($1)', [user.id]);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        communeId: user.commune_id,
        motDePasseProvisoire: user.mot_de_passe_provisoire === true,
      },
    });
  })
);

// GET /auth/me — permet au front-end de restaurer une session à partir d'un token stocké.
// Le jeton a déjà été vérifié par attachRequestContext ; requireAuth ne fait que
// refuser les requêtes sans jeton valide.
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await queryOne<UserRow>(
      'SELECT id, email, full_name, role, commune_id, mot_de_passe_provisoire FROM users WHERE id = $1',
      [req.user!.sub]
    );
    if (!user) throw new ApiError(401, 'Utilisateur introuvable.');
    res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      communeId: user.commune_id,
      motDePasseProvisoire: user.mot_de_passe_provisoire === true,
    });
  })
);

// Schémas exposés à la documentation OpenAPI (src/openapi/document.ts).
// La documentation importe les schémas de validation EUX-MÊMES : elle ne peut
// donc pas décrire un format différent de celui réellement contrôlé à l'exécution.
export {
  loginSchema as loginSchema,
};
