import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { etatDeLaBase } from '../etatBase.js';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Les erreurs du lecteur de corps (body-parser) portent un « type » et un
// statut 4xx qu'elles déclarent elles-mêmes publiables (« expose »). On garde
// leur statut, et on dit en français ce que l'appelant doit corriger.
const MESSAGES_CORPS: Record<string, string> = {
  'entity.parse.failed':
    'Corps de la requête illisible : le JSON est mal formé. Vérifiez les guillemets, les virgules et les accolades, puis renvoyez la requête.',
  'entity.too.large':
    'Corps de la requête trop volumineux. Réduisez-le ; un fichier se dépose par la route /fichiers.',
  'charset.unsupported': 'Jeu de caractères non pris en charge : envoyez le JSON en UTF-8.',
  'encoding.unsupported': 'Compression du corps non prise en charge : envoyez le JSON sans compression.',
};

function corpsIllisible(err: unknown): { statut: number; message: string } | null {
  const e = err as { type?: unknown; status?: unknown; expose?: unknown } | null;
  if (!e || typeof e.type !== 'string' || typeof e.status !== 'number' || e.expose !== true) return null;
  if (e.status < 400 || e.status > 499) return null;
  return { statut: e.status, message: MESSAGES_CORPS[e.type] ?? 'Requête illisible : vérifiez son corps et ses en-têtes.' };
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
  // Un corps que le lecteur JSON d'Express n'a pas pu lire (JC-006). C'est la
  // requête qui est en faute, pas le serveur : la renvoyer en 500 faisait
  // croire à une panne au client mal écrit, et remplissait le journal de
  // fausses erreurs internes.
  const lecture = corpsIllisible(err);
  if (lecture) {
    return res.status(lecture.statut).json({ error: lecture.message });
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

  // Avant de répondre « erreur interne », on regarde si la base est en état
  // de servir. Sur une installation où les migrations n'ont pas tourné, la
  // première connexion échouait en 500 (table, schéma ou rôle introuvable) :
  // la cause était connue, le remède aussi, mais l'écran ne disait ni l'un ni
  // l'autre. Le contrôle ne coûte qu'en cas d'erreur, jamais sur le trajet
  // normal d'une requête.
  etatDeLaBase()
    .catch(() => null)
    .then((etat) => {
      if (etat && etat.status !== 'ok') {
        return res.status(503).json({ error: etat.message });
      }
      console.error('[error]', err);
      return res.status(500).json({ error: 'Erreur interne du serveur.' });
    });
}

export function asyncHandler<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
