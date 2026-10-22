import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { etatDeLaBase } from '../etatBase.js';
import { pool } from '../db.js';

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

/**
 * Une clé étrangère refusée parce que l'APPELANT n'existe plus dans `users`.
 *
 * Le jeton est signé et porte l'identifiant du compte ; l'API ne relit pas la
 * table à chaque requête. Quand la base est rechargée (jeu d'essai, restauration)
 * ou le compte supprimé, une session ouverte avant continue de lire — et son
 * premier dépôt échoue sur « déposé par », que le message ci-dessous traduisait
 * par « requête incohérente » : la personne cherchait un défaut dans son fichier,
 * alors qu'il suffisait de se reconnecter. C'est la session qu'il faut dire
 * périmée, et le 401 renvoie l'écran à la connexion.
 */
async function sessionPerimee(err: unknown, req: Request): Promise<boolean> {
  const sub = req.user?.sub;
  const detail = (err as { detail?: unknown } | null)?.detail;
  // PostgreSQL masque la valeur de la clé quand la table est cloisonnée : on ne
  // peut pas y relire l'identifiant. On sait seulement que la clé visait `users`,
  // et on vérifie directement si l'appelant y est encore.
  if (typeof sub !== 'string' || typeof detail !== 'string' || !detail.includes('table "users"')) return false;
  try {
    const { rows } = await pool.query('SELECT 1 FROM users WHERE id = $1', [sub]);
    return rows.length === 0;
  } catch {
    return false;
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
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
    // l'API mais refusée par le modèle de données — sauf si c'est la session
    // elle-même dont le compte a disparu.
    return void (code === '23503' ? sessionPerimee(err, req) : Promise.resolve(false))
      .then((perimee) =>
        perimee
          ? res.status(401).json({
              error: 'Votre session ne correspond plus à un compte (la base a été rechargée, ou le compte a été supprimé) : reconnectez-vous.',
            })
          : res.status(400).json({ error: 'Requête incohérente avec les données existantes.' })
      );
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
