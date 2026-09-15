import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

// Rôles RBAC officiels — cahier des charges FNCT/ANGeD §5 (matrice de permissions).
export type UserRole = 'super_admin_fnct' | 'admin_commune' | 'gestionnaire_prestataire' | 'citoyen';

export interface AuthTokenPayload {
  sub: string;       // user id
  role: UserRole;
  communeId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });
}

/** Vérifie le JWT envoyé dans l'en-tête Authorization: Bearer <token>. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
}

/** À utiliser après requireAuth : autorise uniquement les rôles listés. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentification requise.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé pour ce rôle.' });
    }
    next();
  };
}

/** Un directeur municipal ne peut agir que sur sa propre commune (sauf super_admin_fnct, qui voit tout). */
export function requireCommuneAccess(getCommuneId: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentification requise.' });
    if (req.user.role === 'super_admin_fnct') return next();
    const targetCommuneId = getCommuneId(req);
    if (req.user.communeId && targetCommuneId && req.user.communeId === targetCommuneId) {
      return next();
    }
    return res.status(403).json({ error: "Vous n'êtes pas autorisé à agir sur cette commune." });
  };
}
