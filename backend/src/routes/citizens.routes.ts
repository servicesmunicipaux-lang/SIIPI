import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const citizensRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
  fullName: z.string().min(2),
  phone: z.string().optional(),
});

// POST /citizens/register — inscription publique à l'application citoyenne
citizensRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const existing = await queryOne('SELECT id FROM users WHERE email = $1', [data.email.toLowerCase()]);
    if (existing) throw new ApiError(409, 'Un compte existe déjà avec cet email.');

    const passwordHash = await bcrypt.hash(data.password, 12);

    const citizen = await withTransaction(async (client) => {
      const { rows: userRows } = await client.query(
        `INSERT INTO users (email, password_hash, full_name, phone, role)
         VALUES ($1,$2,$3,$4,'citoyen') RETURNING id, email, full_name, role`,
        [data.email.toLowerCase(), passwordHash, data.fullName, data.phone ?? null]
      );
      const user = userRows[0];
      const { rows: citizenRows } = await client.query(
        `INSERT INTO citoyens (user_id) VALUES ($1) RETURNING *`,
        [user.id]
      );
      return { user, citizen: citizenRows[0] };
    });

    res.status(201).json(citizen);
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
