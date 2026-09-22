import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { queryOne } from '../db.js';

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

/**
 * Un directeur municipal ne peut agir que sur une commune où il a des droits.
 *
 * « Sa commune » n'est PAS seulement `users.commune_id`. Depuis la migration
 * 020, un compte peut être rattaché à plusieurs communes par
 * `utilisateur_communes` — un prestataire sous contrat avec plusieurs
 * communes, mais aussi un directeur qui suit une intercommunalité.
 * `users.commune_id` ne porte que le rattachement PRINCIPAL.
 *
 * Ne comparer que ce rattachement principal produisait un 403 sur la deuxième
 * commune d'un compte multi-communes alors que la base, elle, lui accordait
 * l'accès : le panneau de cohérence se fermait sur un « Vous n'êtes pas
 * autorisé » incompréhensible pour un utilisateur qui voyait par ailleurs les
 * données de cette commune. La référence, ici comme dans les politiques RLS,
 * est app.mes_communes() — une seule définition du périmètre, qui tient compte
 * des rattachements échus.
 *
 * Le rattachement principal est testé d'abord, sans aller en base : le cas
 * mono-commune, qui est la quasi-totalité du trafic, ne paie pas de requête.
 */
export function requireCommuneAccess(getCommuneId: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentification requise.' });
    if (req.user.role === 'super_admin_fnct') return next();

    const targetCommuneId = getCommuneId(req);
    if (!targetCommuneId) {
      return res.status(403).json({ error: "Vous n'êtes pas autorisé à agir sur cette commune." });
    }
    if (req.user.communeId === targetCommuneId) return next();

    // Rattachement secondaire : seule la base sait, car le JWT ne porte que la
    // commune principale. Requête volontairement minuscule et lue dans le
    // contexte de sécurité de l'appelant.
    queryOne<{ communes: string[] | null }>('SELECT app.mes_communes() AS communes')
      .then((ligne) => {
        if (ligne?.communes?.includes(targetCommuneId)) return next();
        return res.status(403).json({ error: "Vous n'êtes pas autorisé à agir sur cette commune." });
      })
      .catch(next);
  };
}
