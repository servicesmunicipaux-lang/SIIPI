// Les paramètres nationaux historisés (lot 17.3, migration 060).
//
//   GET  /parametres-nationaux                         chaque paramètre : sa valeur
//                                                      en vigueur, celles à venir,
//                                                      tout l'historique
//   POST /parametres-nationaux/{code}                  une nouvelle valeur, datée
//   POST /parametres-nationaux/valeurs/{id}/retrait    retirer une valeur saisie à tort
//
// Lecture : tout utilisateur authentifié — une commune voit le taux qu'on lui
// applique. Écriture : la FNCT seule ; la base le tient aussi (RLS). Une valeur
// ne se réécrit jamais : un tarif change à une date, une nouvelle ligne
// s'ajoute.
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const parametresNationauxRouter = Router();

const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');
// Le jour à Tunis (UTC+1, sans heure d'été).
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

const COLONNES_VALEUR = `
  v.id, v.code, v.date_effet, v.valeur_nombre::float, v.valeur_fr, v.valeur_ar, v.provisoire, v.reference,
  v.created_at, v.retire_le, v.motif_retrait`;

parametresNationauxRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const jour = aujourdhui();
    const definitions = await query<{ code: string }>(
      `SELECT code, nature, unite, borne_min::float, borne_max::float, libelle_fr, libelle_ar, description
         FROM definitions_parametres_nationaux ORDER BY ordre, code`
    );
    const valeurs = await query<{ id: string; code: string; date_effet: string; retire_le: string | null }>(
      `SELECT ${COLONNES_VALEUR} FROM valeurs_parametres_nationaux v ORDER BY v.code, v.date_effet DESC, v.created_at DESC`
    );
    res.json(
      definitions.map((d) => {
        const actives = valeurs.filter((v) => v.code === d.code && v.retire_le === null);
        return {
          ...d,
          // La plus récente des valeurs déjà entrées en vigueur ; null si
          // aucune : l'écran dit « non renseigné », il n'invente rien.
          en_vigueur: actives.find((v) => v.date_effet <= jour) ?? null,
          a_venir: actives.filter((v) => v.date_effet > jour).reverse(),
          historique: valeurs.filter((v) => v.code === d.code),
        };
      })
    );
  })
);

export const retraitValeurSchema = z
  .object({ motif: z.string().trim().min(5, 'Dites pourquoi cette valeur est retirée (5 caractères au moins).').max(500) })
  .strict();

// DÉCLARÉE AVANT « /:code » : « valeurs » serait sinon lu comme un code.
parametresNationauxRouter.post(
  '/valeurs/:id/retrait',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const { motif } = retraitValeurSchema.parse(req.body);
    if (!z.string().uuid().safeParse(req.params.id).success) throw new ApiError(404, 'Valeur introuvable.');
    const ligne = await queryOne(
      `UPDATE valeurs_parametres_nationaux v
          SET retire_le = now(), retire_par = app.current_user_id(), motif_retrait = $2
        WHERE v.id = $1 AND v.retire_le IS NULL
        RETURNING ${COLONNES_VALEUR}`,
      [req.params.id, motif]
    );
    if (!ligne) throw new ApiError(404, 'Valeur introuvable, ou déjà retirée.');
    res.json(ligne);
  })
);

export const valeurParametreSchema = z
  .object({
    dateEffet: dateIso,
    valeurNombre: z.number().nullable().optional(),
    valeurFr: z.string().trim().max(300).nullable().optional(),
    valeurAr: z.string().trim().max(300).nullable().optional(),
    // Provisoire par défaut : une valeur ne devient officielle qu'en citant sa pièce.
    provisoire: z.boolean().default(true),
    reference: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((d) => d.provisoire || Boolean(d.reference), {
    message: 'Une valeur officielle cite la pièce qui la fonde (barème, arrêté, circulaire) ; sinon, cochez « provisoire ».',
    path: ['reference'],
  });

parametresNationauxRouter.post(
  '/:code',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = valeurParametreSchema.parse(req.body);
    const def = await queryOne('SELECT code FROM definitions_parametres_nationaux WHERE code = $1', [req.params.code]);
    if (!def) throw new ApiError(404, 'Paramètre national inconnu.');
    try {
      res.status(201).json(
        await queryOne(
          `INSERT INTO valeurs_parametres_nationaux AS v
             (code, date_effet, valeur_nombre, valeur_fr, valeur_ar, provisoire, reference, saisi_par)
           VALUES ($1, $2, $3, $4, $5, $6, $7, app.current_user_id())
           RETURNING ${COLONNES_VALEUR}`,
          [req.params.code, d.dateEffet, d.valeurNombre ?? null, d.valeurFr || null, d.valeurAr || null, d.provisoire,
           d.reference || null]
        )
      );
    } catch (err) {
      const e = err as { code?: string; message?: string; constraint?: string };
      if (e.code === '23505') {
        throw new ApiError(409, 'Une valeur commence déjà à cette date pour ce paramètre. Retirez-la d’abord si elle était fausse.');
      }
      if (e.constraint === 'valeurs_date_plausible') throw new ApiError(400, 'La date d’effet ne peut pas précéder l’an 2000.');
      const code = e.message?.match(/^(PARAMETRE_[A-Z]+): /)?.[1];
      if (code) throw new ApiError(400, e.message!.slice(code.length + 2));
      throw err;
    }
  })
);
