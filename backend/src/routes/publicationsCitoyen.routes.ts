import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const publicationsCitoyenRouter = Router();

/**
 * Le côté citoyen du module 5.
 *
 * POURQUOI UN ROUTEUR SÉPARÉ. Le citoyen n'a pas le droit de lire la table
 * `publications` : il y verrait les brouillons de sa commune, les contenus
 * d'exemple et les projets que la commune n'a pas rendus publics. Il a en
 * revanche le droit de savoir ce qui s'adresse à LUI. Ces deux choses
 * passent par app.publications_citoyen(), une fonction SECURITY DEFINER qui
 * applique exactement le même ciblage que la commune a défini — ni plus, ni
 * moins.
 */

publicationsCitoyenRouter.get(
  '/publications',
  requireAuth,
  asyncHandler(async (req, res) => {
    const type = typeof req.query.type === 'string' && req.query.type !== '' ? req.query.type : null;
    res.json(await query('SELECT * FROM app.publications_citoyen($1)', [type]));
  })
);

publicationsCitoyenRouter.get(
  '/publications/:id/questions',
  requireAuth,
  asyncHandler(async (req, res) => {
    // On ne rend les questions que si la publication s'adresse réellement à ce
    // citoyen : sans ce contrôle, un identifiant deviné donnerait accès au
    // questionnaire d'un sondage d'une autre commune.
    const visible = await queryOne<{ id: string }>(
      'SELECT id FROM app.publications_citoyen(NULL) WHERE id = $1',
      [req.params.id]
    );
    if (!visible) throw new ApiError(404, 'Sondage introuvable.');

    // Sans les réponses des autres : le citoyen répond, il ne dépouille pas.
    res.json(
      await query(
        `SELECT id, ordre, libelle_fr, libelle_ar, type, options_fr, options_ar, obligatoire
           FROM sondage_questions WHERE publication_id = $1 ORDER BY ordre`,
        [req.params.id]
      )
    );
  })
);

const reponseSchema = z.object({
  questionId: z.string().uuid(),
  choix: z.array(z.number().int().min(1)).max(20).nullable().optional(),
  texte: z.string().max(2000).nullable().optional(),
  note: z.number().int().min(0).max(10).nullable().optional(),
});

publicationsCitoyenRouter.post(
  '/publications/:id/reponses',
  requireAuth,
  asyncHandler(async (req, res) => {
    const corps = Array.isArray(req.body) ? req.body : [req.body];
    const reponses = z.array(reponseSchema).min(1).max(30).parse(corps);

    const visible = await queryOne<{ id: string; type: string }>(
      'SELECT id, type FROM app.publications_citoyen(NULL) WHERE id = $1',
      [req.params.id]
    );
    if (!visible) throw new ApiError(404, 'Sondage introuvable ou clos.');
    if (visible.type !== 'sondage') throw new ApiError(400, 'Cette publication n’est pas un sondage.');

    const moi = await queryOne<{ id: string; zone_id: string | null }>(
      'SELECT id, zone_id FROM citoyens WHERE user_id = $1 AND deleted_at IS NULL',
      [req.user!.sub]
    );
    if (!moi) throw new ApiError(404, 'Profil citoyen introuvable.');

    const enregistrees = [];
    for (const r of reponses) {
      // La zone est figée au moment de la réponse : un redécoupage six mois
      // plus tard ne doit pas réécrire l'origine géographique des réponses.
      const ligne = await queryOne(
        `INSERT INTO sondage_reponses
           (question_id, publication_id, citoyen_id, zone_id, choix, texte, note)
         VALUES ($1, $2, $3, $4, $5::smallint[], $6, $7::smallint)
         RETURNING id, question_id, created_at`,
        [r.questionId, req.params.id, moi.id, moi.zone_id,
         r.choix ?? null, r.texte ?? null, r.note ?? null]
      );
      enregistrees.push(ligne);
    }
    res.status(201).json(enregistrees);
  })
);

/**
 * Le citoyen déclare la nature de son point desservi.
 *
 * Facultatif, et il faut que cela le reste : ne pas l'avoir renseigné
 * n'exclut d'aucun ciblage (voir app.compter_destinataires). Un commerce qui
 * ne s'est pas déclaré reçoit les messages destinés à tous, pas rien.
 */
publicationsCitoyenRouter.patch(
  '/type-foyer',
  requireAuth,
  asyncHandler(async (req, res) => {
    const d = z
      .object({
        typeFoyer: z.enum(['menage', 'commerce', 'administration', 'industrie']).nullable(),
      })
      .parse(req.body);

    const modifie = await queryOne(
      `UPDATE citoyens SET type_foyer = $1
        WHERE user_id = $2 AND deleted_at IS NULL
        RETURNING id, type_foyer`,
      [d.typeFoyer, req.user!.sub]
    );
    if (!modifie) throw new ApiError(404, 'Profil citoyen introuvable.');
    res.json(modifie);
  })
);
