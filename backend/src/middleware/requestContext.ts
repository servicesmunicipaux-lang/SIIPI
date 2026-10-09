import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { ANONYMOUS_CONTEXT, runWithContext } from '../context.js';
import { MESSAGE_MOT_DE_PASSE_A_CHANGER } from '../motDePassePublic.js';
import type { AuthTokenPayload } from './auth.js';

/**
 * Ce qu'ouvre un jeton à mot de passe provisoire (D-FNCT-5) : savoir qui l'on
 * est, choisir sa langue, et remplacer le mot de passe. Rien d'autre — pas même
 * une lecture. Sans ce verrou côté serveur, l'écran de changement ne serait
 * qu'une suggestion : n'importe quel client appelant l'API directement aurait
 * agi avec le mot de passe que le cadre a dicté.
 */
const OUVERT_AU_PROVISOIRE = new Set([
  'GET /auth/me',
  'POST /comptes/moi/mot-de-passe',
  'PUT /comptes/moi/preferences',
  'GET /instance',
  'GET /health',
]);

/**
 * Décode le jeton d'authentification s'il est présent et installe le contexte
 * de sécurité pour toute la durée du traitement de la requête.
 *
 * Ce middleware n'AUTORISE rien : un jeton absent ou invalide laisse la
 * requête en contexte anonyme, et c'est `requireAuth` qui répondra 401. Il
 * garantit seulement que chaque requête SQL déclenchée ensuite s'exécute avec
 * la bonne identité vis-à-vis des politiques de cloisonnement (RLS).
 */
export function attachRequestContext(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice('Bearer '.length), config.jwtSecret) as AuthTokenPayload;
      if (payload.provisoire && !OUVERT_AU_PROVISOIRE.has(`${req.method} ${req.path}`)) {
        res.status(403).json({ error: MESSAGE_MOT_DE_PASSE_A_CHANGER, code: 'MOT_DE_PASSE_A_CHANGER' });
        return;
      }
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
