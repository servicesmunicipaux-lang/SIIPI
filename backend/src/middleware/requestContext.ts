import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { ANONYMOUS_CONTEXT, runWithContext } from '../context.js';
import type { AuthTokenPayload } from './auth.js';

/**
 * Décode le jeton d'authentification s'il est présent et installe le contexte
 * de sécurité pour toute la durée du traitement de la requête.
 *
 * Ce middleware n'AUTORISE rien : un jeton absent ou invalide laisse la
 * requête en contexte anonyme, et c'est `requireAuth` qui répondra 401. Il
 * garantit seulement que chaque requête SQL déclenchée ensuite s'exécute avec
 * la bonne identité vis-à-vis des politiques de cloisonnement (RLS).
 */
export function attachRequestContext(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice('Bearer '.length), config.jwtSecret) as AuthTokenPayload;
      req.user = payload;
      return runWithContext(
        { userId: payload.sub, role: payload.role, communeId: payload.communeId },
        () => next()
      );
    } catch {
      // Jeton expiré, falsifié ou illisible : on poursuit en anonyme.
    }
  }

  return runWithContext(ANONYMOUS_CONTEXT, () => next());
}
