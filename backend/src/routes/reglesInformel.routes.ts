// Les règles du secteur informel (lot I1, migration 091) : ce que le projet de
// décret fixe, tenu en données nationales datées plutôt qu'écrit dans le code.
//
//   GET  /regles-informel                              l'interrupteur, la période
//                                                      transitoire calculée, les
//                                                      deux listes et leur historique
//   POST /regles-informel/listes/{liste}               un élément nouveau, daté
//   POST /regles-informel/elements/{id}/fin            il cesse de s'appliquer à une date
//   POST /regles-informel/elements/{id}/retrait        il avait été saisi à tort
//
// Les durées et la date de départ sont des paramètres nationaux ordinaires
// (/parametres-nationaux, rubrique « secteur_informel ») : ils se règlent par
// les mêmes routes que la redevance ANGeD.
//
// Lecture : tout utilisateur authentifié — une commune lit les pièces qu'on lui
// demandera. Écriture : la FNCT seule ; la base le tient aussi (RLS).
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const reglesInformelRouter = Router();

export const LISTES_NATIONALES = ['pieces_carte_precollecteur', 'jalons_accompagnement'] as const;

const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');
// Le jour à Tunis (UTC+1, sans heure d'été).
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

const COLONNES_ELEMENT = `
  e.id, e.liste, e.code, e.libelle_fr, e.libelle_ar, e.ordre, e.date_effet, e.date_fin, e.reference_fin,
  e.provisoire, e.reference, e.created_at, e.retire_le, e.motif_retrait`;

type Element = { liste: string; date_effet: string; date_fin: string | null; retire_le: string | null };

// L'état d'un élément au jour dit. « retire » l'emporte : une erreur de saisie
// n'a jamais été la règle, quelle que soit sa date.
const etatElement = (e: Element, jour: string) =>
  e.retire_le ? 'retire' : e.date_effet > jour ? 'a_venir' : e.date_fin && e.date_fin <= jour ? 'ferme' : 'en_vigueur';

reglesInformelRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const jour = aujourdhui();
    const [cadre] = await query<{ valeur: string; reference: string | null }>(
      "SELECT valeur, reference FROM parametres_nationaux WHERE cle = 'cadre_secteur_informel_actif'"
    );
    const periode = await queryOne('SELECT * FROM app.periode_transitoire($1::date)', [jour]);
    const elements = await query<Element>(
      `SELECT ${COLONNES_ELEMENT} FROM elements_listes_nationales e ORDER BY e.liste, e.ordre, e.code, e.date_effet, e.created_at`
    );
    res.json({
      jour,
      cadre: { actif: cadre?.valeur === 'true', reference: cadre?.reference ?? null },
      periode,
      listes: LISTES_NATIONALES.map((liste) => ({
        liste,
        elements: elements.filter((e) => e.liste === liste).map((e) => ({ ...e, etat: etatElement(e, jour) })),
      })),
    });
  })
);

export const elementListeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{2,60}$/, 'Le code s’écrit en minuscules, chiffres et tiret bas, 3 à 61 caractères (ex. : photo_identite).'),
    libelleFr: z.string().trim().min(1, 'Le libellé en français est obligatoire.').max(200),
    libelleAr: z.string().trim().min(1, 'Le libellé en arabe est obligatoire.').max(200),
    ordre: z.number().int().min(0).max(10_000).default(0),
    dateEffet: dateIso,
    // Provisoire par défaut : un élément ne devient officiel qu'en citant son texte.
    provisoire: z.boolean().default(true),
    reference: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((d) => d.provisoire || Boolean(d.reference), {
    message: 'Un élément officiel cite le texte qui le fonde ; sinon, cochez « provisoire ».',
    path: ['reference'],
  });

export const finElementSchema = z
  .object({
    dateFin: dateIso,
    reference: z.string().trim().min(5, 'Citez le texte qui met fin à cet élément (5 caractères au moins).').max(500),
  })
  .strict();

export const retraitElementSchema = z
  .object({ motif: z.string().trim().min(5, 'Dites pourquoi cet élément est retiré (5 caractères au moins).').max(500) })
  .strict();

// Les refus de la base, rendus en mots.
const traduireRefus = (err: unknown): never => {
  const e = err as { code?: string; message?: string; constraint?: string };
  if (e.code === '23505') {
    throw new ApiError(409, 'Un élément de ce code est déjà en vigueur dans cette liste. Fermez-le à une date, ou retirez-le s’il était faux.');
  }
  if (e.constraint === 'elements_date_plausible') throw new ApiError(400, 'La date d’effet ne peut pas précéder l’an 2000.');
  if (e.constraint === 'elements_fin_apres_effet') throw new ApiError(400, 'La fin doit suivre la date d’effet de l’élément.');
  const code = e.message?.match(/^(ELEMENT_[A-Z]+): /)?.[1];
  if (code) throw new ApiError(409, e.message!.slice(code.length + 2));
  throw err;
};

// DÉCLARÉES AVANT tout « /:param » de même forme : les littéraux d'abord.
reglesInformelRouter.post(
  '/listes/:liste',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    if (!(LISTES_NATIONALES as readonly string[]).includes(req.params.liste)) throw new ApiError(404, 'Liste nationale inconnue.');
    const d = elementListeSchema.parse(req.body);
    try {
      res.status(201).json(
        await queryOne(
          `INSERT INTO elements_listes_nationales AS e
             (liste, code, libelle_fr, libelle_ar, ordre, date_effet, provisoire, reference, saisi_par)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, app.current_user_id())
           RETURNING ${COLONNES_ELEMENT}`,
          [req.params.liste, d.code, d.libelleFr, d.libelleAr, d.ordre, d.dateEffet, d.provisoire, d.reference || null]
        )
      );
    } catch (err) {
      traduireRefus(err);
    }
  })
);

reglesInformelRouter.post(
  '/elements/:id/fin',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = finElementSchema.parse(req.body);
    if (!z.string().uuid().safeParse(req.params.id).success) throw new ApiError(404, 'Élément introuvable.');
    try {
      const ligne = await queryOne(
        `UPDATE elements_listes_nationales e SET date_fin = $2, reference_fin = $3
          WHERE e.id = $1 AND e.retire_le IS NULL
          RETURNING ${COLONNES_ELEMENT}`,
        [req.params.id, d.dateFin, d.reference]
      );
      if (!ligne) throw new ApiError(404, 'Élément introuvable, ou retiré.');
      res.json(ligne);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      traduireRefus(err);
    }
  })
);

reglesInformelRouter.post(
  '/elements/:id/retrait',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const { motif } = retraitElementSchema.parse(req.body);
    if (!z.string().uuid().safeParse(req.params.id).success) throw new ApiError(404, 'Élément introuvable.');
    const ligne = await queryOne(
      `UPDATE elements_listes_nationales e
          SET retire_le = now(), retire_par = app.current_user_id(), motif_retrait = $2
        WHERE e.id = $1 AND e.retire_le IS NULL
        RETURNING ${COLONNES_ELEMENT}`,
      [req.params.id, motif]
    );
    if (!ligne) throw new ApiError(404, 'Élément introuvable, ou déjà retiré.');
    res.json(ligne);
  })
);
