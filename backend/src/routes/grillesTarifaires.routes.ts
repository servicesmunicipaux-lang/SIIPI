// Les grilles tarifaires des conventions de propreté (jalon G, lot G1, migration
// 098) : une par arrêté municipal, avec ses tarifs par catégorie d'activité et
// leurs majorations.
//
//   GET    /grilles-tarifaires?communeId=…             les grilles de la commune, leur état du jour
//   GET    /grilles-tarifaires/en-vigueur?communeId=…&date=…   la grille approuvée qui s'applique à une date
//   GET    /grilles-tarifaires/{id}
//   POST   /grilles-tarifaires?communeId=…             un projet de grille, avec ses lignes
//   PUT    /grilles-tarifaires/{id}                    le projet, remplacé en entier
//   POST   /grilles-tarifaires/{id}/approbation        l'approbation de la tutelle, enregistrée
//   POST   /grilles-tarifaires/{id}/cloture            la date de fin d'une grille approuvée
//   DELETE /grilles-tarifaires/{id}                    le retrait d'un projet
//
// La commune écrit (son directeur) ; la FNCT lit, elle ne fixe pas les tarifs
// d'une commune. Une grille approuvée est figée, et la base le tient : ces
// routes ne font que dire ses refus en mots. Aucun montant n'est calculé ici.
import { Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';

export const grillesTarifairesRouter = Router();

const LECTEURS = ['admin_commune', 'super_admin_fnct'] as const;
export const MODES_TARIF = ['forfait_annuel', 'forfait_mensuel', 'reel_levee', 'reel_poids'] as const;
export const CRITERES_MAJORATION = ['surface_m2', 'frequence_hebdo', 'capacite_conteneur_l', 'nb_points_vente'] as const;

// Une date qui n'existe pas (le 30 février) est refusée ici : la base la
// rejetterait d'une erreur de conversion, rendue en 500.
const dateIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.')
  .refine((j) => {
    const d = new Date(`${j}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === j;
  }, 'Cette date n’existe pas : vérifiez le jour et le mois.');
const estUuid = (s: string) => z.string().uuid().safeParse(s).success;

const ACTE_DU_DIRECTEUR = 'Une grille tarifaire est un acte de la commune : son directeur l’enregistre, la FNCT la lit.';

// Les refus de la base, rendus en mots : 409 quand l'état des choses s'y oppose,
// 400 quand la saisie est en cause.
const REFUS: Record<string, number> = {
  GRILLE_FIGEE: 409,
  GRILLE_CLOSE: 409,
  GRILLE_RETIREE: 409,
  GRILLE_DEJA_APPROUVEE: 409,
  GRILLE_CHEVAUCHEMENT: 409,
  GRILLE_VIDE: 409,
  GRILLE_APPROBATION: 409,
  GRILLE_NAISSANCE: 400,
  GRILLE_DATE_APPROBATION: 400,
  CATEGORIE_INCONNUE: 400,
  MAJORATION_CHEVAUCHEMENT: 400,
  MAJORATION_ORDRE: 400,
  LIGNE_FIGEE: 409,
};
const CONTRAINTES: Record<string, string> = {
  uq_ligne_grille_categorie: 'Une catégorie d’activité a un seul tarif par grille.',
  grilles_fin_apres_effet: 'La date de fin suit la date d’effet.',
  grilles_dates_plausibles: 'Les dates de l’arrêté, de la délibération et d’effet ne précèdent pas l’an 2000.',
  grilles_fin_referencee: 'La fin d’une grille approuvée cite sa pièce (le nouvel arrêté).',
  grilles_arrete_reference: 'La référence de l’arrêté est obligatoire.',
  majoration_tranche: 'Une tranche va d’une borne basse positive à une borne haute plus grande (ou sans plafond).',
};
function refus(err: unknown): never {
  if (err instanceof ApiError) throw err;
  const e = err as { message?: string; constraint?: string; code?: string };
  if (e.message === 'GRILLE_INTROUVABLE' || e.code === 'P0002') throw new ApiError(404, 'Grille introuvable.');
  // Hors du périmètre du directeur, une grille ou une commune est introuvable :
  // un refus renseignerait sur son existence (CLAUDE.md § 5).
  if (e.code === '42501') throw new ApiError(404, 'Grille ou commune introuvable.');
  if (e.message === 'ACCES_REFUSE') throw new ApiError(403, ACTE_DU_DIRECTEUR);
  if (e.constraint && CONTRAINTES[e.constraint]) throw new ApiError(e.code === '23505' ? 409 : 400, CONTRAINTES[e.constraint]);
  const code = e.message?.match(/^([A-Z_]+): /)?.[1];
  if (code && REFUS[code]) {
    const texte = e.message!.slice(code.length + 2);
    throw new ApiError(REFUS[code], texte.charAt(0).toUpperCase() + texte.slice(1));
  }
  throw err;
}

// Une grille, avec son état du jour et ses lignes ; une ligne, avec le libellé
// de sa catégorie et ses majorations dans leur ordre d'application.
const SELECT_GRILLES = `
  SELECT g.id, g.commune_id, g.intitule, g.reference_arrete, g.date_arrete,
         g.reference_deliberation, g.date_deliberation, g.date_effet, g.date_fin, g.reference_fin,
         g.date_approbation_tutelle, g.reference_approbation, g.approuve_le, g.created_at, g.updated_at,
         CASE WHEN g.date_approbation_tutelle IS NULL THEN 'projet'
              WHEN g.date_effet > app.jour_tunis() THEN 'a_venir'
              WHEN g.date_fin IS NOT NULL AND g.date_fin <= app.jour_tunis() THEN 'close'
              ELSE 'en_vigueur' END AS etat,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'id', l.id, 'categorie', l.categorie_code,
                    'categorie_fr', (SELECT e.libelle_fr FROM elements_listes_nationales e
                                      WHERE e.liste = 'categories_activite_assimiles' AND e.code = l.categorie_code AND e.retire_le IS NULL
                                      ORDER BY e.date_effet DESC NULLS LAST LIMIT 1),
                    'categorie_ar', (SELECT e.libelle_ar FROM elements_listes_nationales e
                                      WHERE e.liste = 'categories_activite_assimiles' AND e.code = l.categorie_code AND e.retire_le IS NULL
                                      ORDER BY e.date_effet DESC NULLS LAST LIMIT 1),
                    'mode', l.mode, 'tarif', l.tarif::float, 'ordre', l.ordre,
                    'majorations', COALESCE((
                      SELECT json_agg(json_build_object(
                               'id', m.id, 'critere', m.critere, 'borne_min', m.borne_min::float,
                               'borne_max', m.borne_max::float, 'effet', m.effet, 'valeur', m.valeur::float, 'ordre', m.ordre)
                             ORDER BY m.ordre, m.borne_min)
                        FROM criteres_majoration m WHERE m.ligne_id = l.id AND m.deleted_at IS NULL), '[]'))
                  ORDER BY l.ordre, l.categorie_code)
             FROM lignes_grille l WHERE l.grille_id = g.id AND l.deleted_at IS NULL), '[]') AS lignes
    FROM grilles_tarifaires g`;

async function lireGrille(id: string) {
  const g = estUuid(id) ? await queryOne(`${SELECT_GRILLES} WHERE g.id = $1`, [id]) : null;
  if (!g) throw new ApiError(404, 'Grille introuvable.');
  return g;
}

export const majorationSchema = z
  .object({
    critere: z.enum(CRITERES_MAJORATION),
    borneMin: z.number().min(0).max(1e9).default(0),
    // Vide : sans plafond.
    borneMax: z.number().positive().max(1e9).nullable().optional(),
    effet: z.enum(['coefficient', 'ajout']),
    valeur: z.number().positive('Un coefficient ou un ajout est strictement positif.').max(1e9),
    ordre: z.number().int().min(1).max(100),
  })
  .strict()
  .refine((m) => m.borneMax == null || m.borneMax > m.borneMin, {
    message: 'La borne haute d’une tranche dépasse sa borne basse.',
    path: ['borneMax'],
  });

export const ligneGrilleSchema = z
  .object({
    categorie: z.string().trim().regex(/^[a-z][a-z0-9_]{2,60}$/, 'Code de catégorie d’activité attendu (liste nationale).'),
    mode: z.enum(MODES_TARIF),
    tarif: z.number().positive('Un tarif est strictement positif.').max(1e9),
    majorations: z.array(majorationSchema).max(40).default([]),
  })
  .strict();

export const grilleSchema = z
  .object({
    intitule: z.string().trim().max(200).nullable().optional(),
    referenceArrete: z.string().trim().min(3, 'La référence de l’arrêté est obligatoire.').max(300),
    dateArrete: dateIso,
    referenceDeliberation: z.string().trim().max(300).nullable().optional(),
    dateDeliberation: dateIso.nullable().optional(),
    dateEffet: dateIso,
    dateFin: dateIso.nullable().optional(),
    lignes: z.array(ligneGrilleSchema).max(200).default([]),
  })
  .strict()
  .refine((g) => !g.dateFin || g.dateFin > g.dateEffet, { message: 'La date de fin suit la date d’effet.', path: ['dateFin'] })
  .refine((g) => new Set(g.lignes.map((l) => l.categorie)).size === g.lignes.length, {
    message: 'Une catégorie d’activité a un seul tarif par grille.',
    path: ['lignes'],
  });

export const approbationGrilleSchema = z
  .object({
    dateApprobation: dateIso,
    reference: z.string().trim().min(3, 'Citez la pièce de l’approbation de la tutelle (lettre, visa).').max(300),
  })
  .strict();

export const clotureGrilleSchema = z
  .object({
    dateFin: dateIso,
    reference: z.string().trim().min(3, 'Citez la pièce qui met fin à cette grille (le nouvel arrêté).').max(300),
  })
  .strict();

type Grille = z.infer<typeof grilleSchema>;

/** Les lignes d'un projet et leurs majorations, dans la transaction de la grille. */
async function ecrireLignes(client: pg.PoolClient, grilleId: string, lignes: Grille['lignes']) {
  for (const [i, l] of lignes.entries()) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO lignes_grille (grille_id, commune_id, categorie_code, mode, tarif, ordre)
       SELECT $1, g.commune_id, $2, $3, $4, $5 FROM grilles_tarifaires g WHERE g.id = $1
       RETURNING id`,
      [grilleId, l.categorie, l.mode, l.tarif, i + 1]
    );
    for (const m of l.majorations) {
      await client.query(
        `INSERT INTO criteres_majoration (ligne_id, commune_id, critere, borne_min, borne_max, effet, valeur, ordre)
         VALUES ($1, (SELECT commune_id FROM lignes_grille WHERE id = $1), $2, $3, $4, $5, $6, $7)`,
        [rows[0].id, m.critere, m.borneMin, m.borneMax ?? null, m.effet, m.valeur, m.ordre]
      );
    }
  }
}

grillesTarifairesRouter.get(
  '/',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise (paramètre communeId).');
    res.json(await query(`${SELECT_GRILLES} WHERE g.commune_id = $1 AND g.deleted_at IS NULL ORDER BY g.date_effet DESC, g.created_at DESC`, [communeId]));
  })
);

// DÉCLARÉE AVANT « /:id » : les littéraux d'abord.
export const qGrilleEnVigueur = z.object({ date: dateIso.optional() });
grillesTarifairesRouter.get(
  '/en-vigueur',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise (paramètre communeId).');
    const { date } = qGrilleEnVigueur.parse({ date: req.query.date });
    const ligne = await queryOne<{ id: string | null }>('SELECT app.grille_en_vigueur($1, COALESCE($2::date, app.jour_tunis())) AS id', [
      communeId,
      date ?? null,
    ]);
    res.json({ grille: ligne?.id ? await lireGrille(ligne.id) : null });
  })
);

grillesTarifairesRouter.get(
  '/:id',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    res.json(await lireGrille(req.params.id));
  })
);

grillesTarifairesRouter.post(
  '/',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise (paramètre communeId).');
    const d = grilleSchema.parse(req.body);
    let id = '';
    try {
      await withTransaction(async (client) => {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO grilles_tarifaires
             (commune_id, intitule, reference_arrete, date_arrete, reference_deliberation, date_deliberation,
              date_effet, date_fin, saisi_par)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, app.current_user_id())
           RETURNING id`,
          [communeId, d.intitule || null, d.referenceArrete, d.dateArrete, d.referenceDeliberation || null,
           d.dateDeliberation ?? null, d.dateEffet, d.dateFin ?? null]
        );
        id = rows[0].id;
        await ecrireLignes(client, id, d.lignes);
      });
    } catch (err) {
      refus(err);
    }
    res.status(201).json(await lireGrille(id));
  })
);

grillesTarifairesRouter.put(
  '/:id',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const g = await lireGrille(req.params.id) as { id: string; etat: string };
    if (g.etat !== 'projet') {
      throw new ApiError(409, 'Une grille approuvée ne se modifie plus ; un nouvel arrêté fait une nouvelle grille.');
    }
    const d = grilleSchema.parse(req.body);
    try {
      await withTransaction(async (client) => {
        const maj = await client.query(
          `UPDATE grilles_tarifaires
              SET intitule = $2, reference_arrete = $3, date_arrete = $4, reference_deliberation = $5,
                  date_deliberation = $6, date_effet = $7, date_fin = $8
            WHERE id = $1 AND deleted_at IS NULL AND date_approbation_tutelle IS NULL
            RETURNING id`,
          [g.id, d.intitule || null, d.referenceArrete, d.dateArrete, d.referenceDeliberation || null,
           d.dateDeliberation ?? null, d.dateEffet, d.dateFin ?? null]
        );
        if (maj.rows.length === 0) {
          throw new ApiError(409, 'Cette grille a changé entre-temps (approuvée ou retirée) : rechargez-la.');
        }
        await client.query('SELECT app.retirer_lignes_projet($1)', [g.id]);
        await ecrireLignes(client, g.id, d.lignes);
      });
    } catch (err) {
      refus(err);
    }
    res.json(await lireGrille(g.id));
  })
);

grillesTarifairesRouter.post(
  '/:id/approbation',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const d = approbationGrilleSchema.parse(req.body);
    if (!estUuid(req.params.id)) throw new ApiError(404, 'Grille introuvable.');
    try {
      await queryOne('SELECT id FROM app.approuver_grille($1, $2, $3)', [req.params.id, d.dateApprobation, d.reference]);
    } catch (err) {
      refus(err);
    }
    res.json(await lireGrille(req.params.id));
  })
);

grillesTarifairesRouter.post(
  '/:id/cloture',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const d = clotureGrilleSchema.parse(req.body);
    const g = await lireGrille(req.params.id) as { id: string; etat: string; date_fin: string | null };
    if (g.etat === 'projet') throw new ApiError(409, 'Un projet se modifie : sa date de fin se corrige avec le reste de la grille.');
    try {
      const ligne = await queryOne(
        `UPDATE grilles_tarifaires SET date_fin = $2, reference_fin = $3
          WHERE id = $1 AND deleted_at IS NULL AND date_approbation_tutelle IS NOT NULL
          RETURNING id`,
        [g.id, d.dateFin, d.reference]
      );
      if (!ligne) throw new ApiError(404, 'Grille introuvable.');
    } catch (err) {
      refus(err);
    }
    res.json(await lireGrille(g.id));
  })
);

grillesTarifairesRouter.delete(
  '/:id',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const g = await lireGrille(req.params.id) as { id: string };
    try {
      const r = await queryOne<{ supprimer: boolean }>("SELECT app.supprimer('grilles_tarifaires', $1)", [g.id]);
      if (!r?.supprimer) throw new ApiError(404, 'Grille introuvable.');
    } catch (err) {
      refus(err);
    }
    res.status(204).end();
  })
);
