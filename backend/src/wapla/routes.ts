// Les routes de la couche WaPla (lot W2a ; SPEC_wapla § 2 et § 3).
//
// Elles vivent avec la couche, sous /wapla, et n'écrivent que dans le schéma
// `wapla`. Ce qu'elles lisent de SIIPI passe par wapla.amorce_commune, qui
// s'exécute avec les droits de l'appelant : une commune hors du périmètre est
// introuvable (404), et les règles de lecture de SIIPI valent ici aussi.
//
// LES RÉFÉRENCES TUNISIENNES (le climat par gouvernorat) sont tenues par la
// FNCT : datées, sourcées, jamais corrigées ni effacées — une valeur fausse se
// retire avec son motif, et la suivante prend sa place (règle d'or 1.4).

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';

export const waplaRouter = Router();

const ROLES = ['admin_commune', 'super_admin_fnct'] as const;
const anneeTunis = () => Number(new Date(Date.now() + 3_600_000).toISOString().slice(0, 4));

/** La commune demandée, si l'appelant peut la lire ; une autre est introuvable (404), jamais « refusée ». */
async function commune(req: Parameters<typeof communeDemandee>[0]): Promise<string> {
  const id = communeDemandee(req);
  if (!id) throw new ApiError(400, 'Commune requise (paramètre communeId).');
  const c = await queryOne<{ id: string }>('SELECT id FROM communes WHERE id = $1 AND app.can_read_commune(id)', [id]);
  if (!c) throw new ApiError(404, 'Commune introuvable.');
  return c.id;
}

// ---------------------------------------------------------------------------
// L'amorce : ce que SIIPI propose pour chaque entrée de WaPla
// ---------------------------------------------------------------------------

export const qAmorceSchema = z.object({
  exercice: z.coerce.number().int().min(2000).max(2100),
});

export type LigneAmorce = {
  cle: string;
  ordre: number;
  valeur: number | null;
  provenance: 'siipi_mesure' | 'siipi_declare' | 'reference_tunisienne' | null;
  source: string;
  detail: Record<string, unknown> | null;
  manque: string | null;
  ecart: string | null;
};

waplaRouter.get(
  '/amorce',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const q = qAmorceSchema.parse(req.query);
    const communeId = await commune(req);
    if (q.exercice > anneeTunis()) {
      throw new ApiError(400, `L'exercice ${q.exercice} n'a pas commencé : choisissez l'année en cours ou une année passée.`);
    }
    const lignes = await query<Omit<LigneAmorce, 'valeur'> & { valeur: string | null }>(
      'SELECT cle, ordre, valeur, provenance, source, detail, manque, ecart FROM wapla.amorce_commune($1, $2) ORDER BY ordre',
      [communeId, q.exercice]
    );
    res.json({
      commune_id: communeId,
      exercice: q.exercice,
      entrees: lignes.map((l) => ({ ...l, valeur: l.valeur == null ? null : Number(l.valeur) })),
    });
  })
);

// ---------------------------------------------------------------------------
// Les références tunisiennes (FNCT)
// ---------------------------------------------------------------------------

export const CODES_REFERENCE = ['precipitations_annuelles_mm', 'temperature_moyenne_c'] as const;

export const facteurReferenceSchema = z
  .object({
    code: z.enum(CODES_REFERENCE),
    gouvernorat: z.string().trim().min(1).max(100),
    valeur: z.number(),
    source: z.string().trim().min(1, 'La source est obligatoire : un chiffre sans source ne se discute pas.').max(300),
    dateEffet: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.'),
  })
  .strict()
  .superRefine((f, ctx) => {
    const [min, max] = f.code === 'precipitations_annuelles_mm' ? [0, 3000] : [-10, 40];
    if (f.valeur < min || f.valeur > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['valeur'],
        message: `Hors des bornes plausibles pour la Tunisie (${min} à ${max}) : vérifiez l'unité.`,
      });
    }
  });

export const retraitFacteurSchema = z.object({ motif: z.string().trim().min(1, 'Le motif du retrait est obligatoire.').max(500) }).strict();

const COLONNES_FACTEUR = 'id, code, gouvernorat, valeur, source, date_effet, saisi_le, retire_le, motif_retrait';
type LigneFacteur = { valeur: string } & Record<string, unknown>;
const enNombre = (l: LigneFacteur) => ({ ...l, valeur: Number(l.valeur) });

waplaRouter.get(
  '/facteurs-reference',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    // Les valeurs retirées restent lisibles, sur demande : c'est l'historique.
    const avecRetirees = req.query.retirees === '1';
    const lignes = await query<LigneFacteur>(
      `SELECT ${COLONNES_FACTEUR} FROM wapla.facteurs_reference
        WHERE $1 OR retire_le IS NULL
        ORDER BY gouvernorat, code, date_effet DESC`,
      [avecRetirees]
    );
    res.json(lignes.map(enNombre));
  })
);

waplaRouter.post(
  '/facteurs-reference',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const f = facteurReferenceSchema.parse(req.body);
    const gouvernorat = await queryOne(
      'SELECT 1 FROM communes WHERE gouvernorat = $1 AND NOT est_demo AND deleted_at IS NULL LIMIT 1',
      [f.gouvernorat]
    );
    if (!gouvernorat) throw new ApiError(400, `Gouvernorat inconnu : « ${f.gouvernorat} ». Écrivez-le comme dans la fiche des communes.`);
    try {
      const ligne = await queryOne<LigneFacteur>(
        `INSERT INTO wapla.facteurs_reference (code, gouvernorat, valeur, source, date_effet, saisi_par)
         VALUES ($1, $2, $3, $4, $5::date, $6)
         RETURNING ${COLONNES_FACTEUR}`,
        [f.code, f.gouvernorat, f.valeur, f.source, f.dateEffet, req.user?.sub ?? null]
      );
      res.status(201).json(enNombre(ligne as LigneFacteur));
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ApiError(409, 'Une valeur en vigueur existe déjà pour ce gouvernorat, ce code et cette date : retirez-la d’abord, avec son motif.');
      }
      throw err;
    }
  })
);

waplaRouter.post(
  '/facteurs-reference/:id/retrait',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { motif } = retraitFacteurSchema.parse(req.body);
    const ligne = await queryOne<LigneFacteur>(
      `UPDATE wapla.facteurs_reference SET retire_le = now(), retire_par = $2, motif_retrait = $3
        WHERE id = $1 AND retire_le IS NULL
        RETURNING ${COLONNES_FACTEUR}`,
      [id, req.user?.sub ?? null, motif]
    );
    if (!ligne) throw new ApiError(404, 'Valeur introuvable, ou déjà retirée.');
    res.json(enNombre(ligne));
  })
);
