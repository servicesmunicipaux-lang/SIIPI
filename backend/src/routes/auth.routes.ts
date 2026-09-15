import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { queryOne } from '../db.js';
import { signToken } from '../middleware/auth.js';
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
  role: 'super_admin_fnct' | 'admin_commune' | 'gestionnaire_prestataire' | 'citoyen';
  commune_id: string | null;
  is_active: boolean;
}

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await queryOne<UserRow>('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!user || !user.is_active) {
      // Message volontairement identique pour email inconnu / mot de passe faux (anti-énumération de comptes)
      throw new ApiError(401, 'Identifiants incorrects.');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new ApiError(401, 'Identifiants incorrects.');
    }

    const token = signToken({ sub: user.id, role: user.role, communeId: user.commune_id });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        communeId: user.commune_id,
      },
    });
  })
);

// GET /auth/me — permet au front-end de restaurer une session à partir d'un token stocké
authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new ApiError(401, 'Authentification requise.');
    const jwt = await import('jsonwebtoken');
    const { config } = await import('../config.js');
    try {
      const payload = jwt.default.verify(header.slice(7), config.jwtSecret) as { sub: string };
      const user = await queryOne<UserRow>(
        'SELECT id, email, full_name, role, commune_id FROM users WHERE id = $1',
        [payload.sub]
      );
      if (!user) throw new ApiError(401, 'Utilisateur introuvable.');
      res.json({
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        communeId: user.commune_id,
      });
    } catch {
      throw new ApiError(401, 'Token invalide ou expiré.');
    }
  })
);
