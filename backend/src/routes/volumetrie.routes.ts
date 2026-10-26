// Le moteur volumétrique (lot 17.2, migration 088).
//
//   GET  /volumetrie/densites                    la matrice : chaque valeur, en vigueur ou non
//   POST /volumetrie/densites                    une nouvelle valeur datée (FNCT)
//   POST /volumetrie/densites/{id}/retrait       retirer une valeur saisie à tort (FNCT)
//   GET  /volumetrie/tonnage?communeId&mois      le tonnage estimé d'un mois, circuit par circuit
//
// Le calcul vit dans la base (app.tonnage_estime) : un seul endroit, que la
// campagne `volumetrie` éprouve contre un témoin indépendant. La route n'additionne
// rien — en particulier, jamais l'estimé au pesé.
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { exportable } from '../services/export.js';
import { JEU_TONNAGE_ESTIME } from '../services/jeuxExport.js';
import { communeDemandee } from '../perimetre.js';

export const volumetrieRouter = Router();

const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');
// Le jour à Tunis (UTC+1, sans heure d'été).
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

const COLONNES_DENSITE = `
  d.id, d.flux, d.equipement, d.tranche_m3::text AS tranche_m3,
  lower(d.tranche_m3)::float8 AS tranche_min_m3, upper(d.tranche_m3)::float8 AS tranche_max_m3,
  lower_inc(d.tranche_m3) AS tranche_min_incluse, upper_inc(d.tranche_m3) AS tranche_max_incluse,
  d.densite_min::float8 AS densite_min, d.densite_max::float8 AS densite_max,
  d.date_effet, d.source, d.created_at, d.retire_le, d.motif_retrait`;

volumetrieRouter.get(
  '/densites',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const jour = aujourdhui();
    const lignes = await query<{ id: string; equipement: string; tranche_m3: string | null; date_effet: string; retire_le: string | null }>(
      `SELECT ${COLONNES_DENSITE} FROM densites_reference d
         LEFT JOIN classes_engins k ON k.code = d.equipement
        ORDER BY COALESCE(k.ordre, 99), d.equipement, lower(d.tranche_m3) NULLS FIRST, d.date_effet DESC, d.created_at DESC`
    );
    // La valeur en vigueur d'un équipement et d'une tranche : la plus récente des
    // valeurs non retirées déjà entrées en vigueur.
    const enVigueur = new Set<string>();
    const vues = new Set<string>();
    for (const l of lignes) {
      const cle = `${l.equipement}|${l.tranche_m3 ?? ''}`;
      if (l.retire_le === null && l.date_effet <= jour && !vues.has(cle)) {
        vues.add(cle);
        enVigueur.add(l.id);
      }
    }
    res.json(lignes.map((l) => ({ ...l, en_vigueur: enVigueur.has(l.id) })));
  })
);

export const retraitDensiteSchema = z
  .object({ motif: z.string().trim().min(5, 'Dites pourquoi cette valeur est retirée (5 caractères au moins).').max(500) })
  .strict();

volumetrieRouter.post(
  '/densites/:id/retrait',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const { motif } = retraitDensiteSchema.parse(req.body);
    if (!z.string().uuid().safeParse(req.params.id).success) throw new ApiError(404, 'Valeur introuvable.');
    const ligne = await queryOne(
      `UPDATE densites_reference d
          SET retire_le = now(), retire_par = app.current_user_id(), motif_retrait = $2
        WHERE d.id = $1 AND d.retire_le IS NULL
        RETURNING ${COLONNES_DENSITE}`,
      [req.params.id, motif]
    );
    if (!ligne) throw new ApiError(404, 'Valeur introuvable, ou déjà retirée.');
    res.json(ligne);
  })
);

// Une nouvelle valeur reprend l'équipement et la tranche d'une valeur existante :
// les tranches elles-mêmes ne se redessinent que par migration, avec la décision
// qui les fonde.
export const valeurDensiteSchema = z
  .object({
    reprend: z.string().uuid(),
    densiteMin: z.number().positive().max(2),
    densiteMax: z.number().positive().max(2),
    dateEffet: dateIso,
    source: z.string().trim().min(5, 'Citez la source de la valeur : la référence, le tableau, la décision.').max(500),
  })
  .strict()
  .refine((d) => d.densiteMin <= d.densiteMax, {
    message: 'La densité minimale ne peut pas dépasser la maximale. Pour une valeur unique, donnez la même aux deux bornes.',
    path: ['densiteMin'],
  });

volumetrieRouter.post(
  '/densites',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = valeurDensiteSchema.parse(req.body);
    const base = await queryOne<{ flux: string; equipement: string; tranche_m3: string | null }>(
      'SELECT flux, equipement, tranche_m3::text AS tranche_m3 FROM densites_reference WHERE id = $1',
      [d.reprend]
    );
    if (!base) throw new ApiError(404, 'La valeur à réviser est introuvable.');
    try {
      res.status(201).json(
        await queryOne(
          `INSERT INTO densites_reference AS d (flux, equipement, tranche_m3, densite_min, densite_max, date_effet, source, saisi_par)
           VALUES ($1, $2, $3::numrange, $4, $5, $6, $7, app.current_user_id())
           RETURNING ${COLONNES_DENSITE}`,
          [base.flux, base.equipement, base.tranche_m3, d.densiteMin, d.densiteMax, d.dateEffet, d.source]
        )
      );
    } catch (err) {
      const e = err as { code?: string; message?: string; constraint?: string };
      if (e.constraint === 'densites_date_plausible') throw new ApiError(400, 'La date d’effet ne peut pas précéder l’an 2000.');
      // Les refus du déclencheur (benne qui tasse moins dense qu'une benne qui ne
      // tasse pas) disent eux-mêmes ce qui ne va pas.
      if (e.code === '23514' && !e.constraint && e.message) throw new ApiError(400, e.message);
      throw err;
    }
  })
);

const moisSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mois attendu au format AAAA-MM.');

volumetrieRouter.get(
  '/tonnage',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  exportable(JEU_TONNAGE_ESTIME, (req) => [communeDemandee(req), req.query.mois].filter(Boolean).join('-') || undefined),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const mois = moisSchema.parse(req.query.mois ?? aujourdhui().slice(0, 7));
    // Hors du périmètre, la commune est introuvable, pas « refusée ».
    const lisible = await queryOne<{ ok: boolean }>('SELECT app.can_read_commune($1) AS ok', [communeId]);
    if (!lisible?.ok) throw new ApiError(404, 'Commune introuvable.');
    res.json(
      await query(
        `SELECT circuit_id, circuit, type_dechet, vehicule_immat, porteur_immat, classe,
                volume_m3::float8 AS volume_m3, volume_provenance,
                densite_min::float8 AS densite_min, densite_max::float8 AS densite_max, densite_source,
                voyages_attendus, voyages_peses, voyages_estimes,
                tonnage_min_t::float8 AS tonnage_min_t, tonnage_max_t::float8 AS tonnage_max_t,
                tonnage_pese_t::float8 AS tonnage_pese_t, manque
           FROM app.tonnage_estime($1, $2::date)`,
        [communeId, `${mois}-01`]
      )
    );
  })
);
