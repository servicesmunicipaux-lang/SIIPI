import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Ressource introuvable.' });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Requête invalide.', details: err.flatten() });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  // Refus opposé par la base elle-même. Une politique RLS qui bloque une
  // écriture hors périmètre n'est pas une panne : c'est le cloisonnement qui
  // fonctionne. Le renvoyer en 500 avait deux effets fâcheux — le client
  // croyait à un incident et réessayait, et les vraies pannes se noyaient
  // dans un journal rempli de refus normaux.
  const code = (err as { code?: string } | null)?.code;
  if (code === '42501') {
    return res.status(403).json({ error: 'Action hors du périmètre de votre commune.' });
  }
  if (code === '23505') {
    return res.status(409).json({ error: 'Cette ressource existe déjà.' });
  }
  if (code === '23503' || code === '23514') {
    // Clé étrangère ou contrainte de cohérence : la requête est recevable pour
    // l'API mais refusée par le modèle de données.
    return res.status(400).json({ error: 'Requête incohérente avec les données existantes.' });
  }
  if (code === '22P02') {
    // Un identifiant mal formé dans l'URL — « /comptes/moi » là où un UUID est
    // attendu. C'est une requête invalide, pas une panne : la renvoyer en 500
    // envoyait l'appelant chercher un incident inexistant.
    return res.status(400).json({ error: 'Identifiant invalide.' });
  }

  console.error('[error]', err);
  return res.status(500).json({ error: 'Erreur interne du serveur.' });
}

export function asyncHandler<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
