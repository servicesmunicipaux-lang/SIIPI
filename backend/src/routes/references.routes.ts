// Les données de référence de la commune (refonte, lot 2a ; SPEC_refonte § 2.3) :
// le PCGD comme donnée, et la caractérisation des déchets (D6) avec la
// composition retenue.
//
// QUI ÉCRIT QUOI. La commune tient son PCGD et ses études ; la FNCT les lit,
// et ne saisit que la moyenne nationale de l'ANGeD. La base le tient
// (migration 069) ; les routes le disent aussi, pour un refus lisible.
//
// LA COMPOSITION RETENUE N'EST JAMAIS INVENTÉE : sans étude de la commune ni
// moyenne nationale saisie, il n'y en a pas — « non renseignée » (règle d'or 1.1).

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';

export const referencesRouter = Router();

const ROLES = ['admin_commune', 'super_admin_fnct'] as const;
const idSchema = z.string().uuid();

/** La commune demandée, si l'appelant peut la lire ; une autre est introuvable (404), jamais « refusée ». */
async function commune(req: Parameters<typeof communeDemandee>[0]): Promise<string> {
  const id = communeDemandee(req);
  if (!id) throw new ApiError(400, 'Commune requise (paramètre communeId).');
  const c = await queryOne<{ id: string }>('SELECT id FROM communes WHERE id = $1 AND app.can_read_commune(id)', [id]);
  if (!c) throw new ApiError(404, 'Commune introuvable.');
  return c.id;
}

// ---------------------------------------------------------------------------
// La nomenclature des fractions (provisoire, à aligner sur celle de l'ANGeD)
// ---------------------------------------------------------------------------

referencesRouter.get(
  '/fractions',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await query('SELECT code, libelle_fr, libelle_ar FROM fractions_reference ORDER BY ordre, code'));
  })
);

// ---------------------------------------------------------------------------
// Le PCGD
// ---------------------------------------------------------------------------

export const pcgdSchema = z
  .object({
    statut: z.enum(['en_preparation', 'adopte', 'en_revision']),
    anneeAdoption: z.number().int().min(2000).max(2100).nullable().optional(),
    horizon: z.number().int().min(2000).max(2100).nullable().optional(),
    bureauEtudes: z.string().trim().max(200).nullable().optional(),
    rapportId: idSchema.nullable().optional(),
    observation: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

referencesRouter.get(
  '/pcgd',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    res.json(
      await query(
        `SELECT p.id, p.commune_id, p.statut, p.annee_adoption, p.horizon, p.bureau_etudes, p.rapport_id,
                r.titre AS rapport_titre, p.observation, p.saisi_le, u.full_name AS saisi_par
           FROM pcgd p
           LEFT JOIN rapports_etudes r ON r.id = p.rapport_id AND r.deleted_at IS NULL
           LEFT JOIN users u ON u.id = p.saisi_par
          WHERE p.commune_id = $1
          ORDER BY coalesce(p.annee_adoption, 0) DESC, p.saisi_le DESC`,
        [await commune(req)]
      )
    );
  })
);

referencesRouter.post(
  '/pcgd',
  requireAuth,
  // La commune tient son PCGD ; la FNCT le lit (la base le tient aussi).
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const communeId = await commune(req);
    const d = pcgdSchema.parse(req.body);
    const qui = req.user;
    if (!qui) throw new ApiError(401, 'Authentification requise.');
    if (d.statut === 'adopte' && d.anneeAdoption == null) {
      throw new ApiError(400, 'Un PCGD adopté l’a été une année : indiquer l’année d’adoption.');
    }
    if (d.horizon != null && d.anneeAdoption != null && d.horizon < d.anneeAdoption) {
      throw new ApiError(400, 'L’horizon du plan ne peut pas précéder son adoption.');
    }
    const ligne = await queryOne(
      `INSERT INTO pcgd (commune_id, statut, annee_adoption, horizon, bureau_etudes, rapport_id, observation, saisi_par)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [communeId, d.statut, d.anneeAdoption ?? null, d.horizon ?? null, d.bureauEtudes || null, d.rapportId ?? null, d.observation || null, qui.sub]
    );
    res.status(201).json(ligne);
  })
);

referencesRouter.patch(
  '/pcgd/:id',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const d = pcgdSchema.partial().parse(req.body);
    const champs: Record<string, string> = {
      statut: 'statut', anneeAdoption: 'annee_adoption', horizon: 'horizon',
      bureauEtudes: 'bureau_etudes', rapportId: 'rapport_id', observation: 'observation',
    };
    const cles = Object.keys(d).filter((k) => k in champs) as (keyof typeof d)[];
    if (cles.length === 0) throw new ApiError(400, 'Rien à modifier.');
    const ligne = await queryOne(
      `UPDATE pcgd SET ${cles.map((k, i) => `${champs[k]} = $${i + 2}`).join(', ')} WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id, ...cles.map((k) => (d[k] === '' ? null : d[k] ?? null))]
    );
    if (!ligne) throw new ApiError(404, 'PCGD introuvable.');
    res.json(ligne);
  })
);

// ---------------------------------------------------------------------------
// La caractérisation des déchets (D6)
// ---------------------------------------------------------------------------

export const caracterisationSchema = z
  .object({
    niveauSource: z.enum(['moyenne_nationale_anged', 'etude_anged_commune', 'pcgd', 'autre_etude']),
    annee: z.number().int().min(1990).max(2100),
    methode: z.string().trim().max(500).nullable().optional(),
    saison: z.enum(['annuelle', 'ete', 'hiver', 'autre']).nullable().optional(),
    rapportId: idSchema.nullable().optional(),
    pcgdId: idSchema.nullable().optional(),
    // Une ligne par fraction, en %. Le total doit faire 100 % à 1 près.
    fractions: z.record(z.string(), z.number().min(0).max(100)),
  })
  .strict();

const ERREURS: Record<string, number> = { CARACTERISATION_SOMME: 400 };

referencesRouter.get(
  '/caracterisations',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    // Sans commune : la FNCT lit les moyennes nationales seules.
    const communeId = communeDemandee(req) ? await commune(req) : null;
    res.json(
      await query(
        `SELECT c.id, c.commune_id, c.niveau_source, c.annee, c.methode, c.saison, c.rapport_id, c.pcgd_id,
                c.saisi_le, u.full_name AS saisi_par,
                (SELECT jsonb_agg(jsonb_build_object('fraction', f.fraction, 'pourcentage', f.pourcentage::float) ORDER BY r.ordre)
                   FROM fractions_caracterisation f JOIN fractions_reference r ON r.code = f.fraction
                  WHERE f.caracterisation_id = c.id) AS fractions
           FROM caracterisations c LEFT JOIN users u ON u.id = c.saisi_par
          WHERE (c.commune_id = $1 OR c.commune_id IS NULL)
          ORDER BY c.commune_id IS NULL, c.annee DESC, c.saisi_le DESC`,
        [communeId]
      )
    );
  })
);

referencesRouter.post(
  '/caracterisations',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = caracterisationSchema.parse(req.body);
    const qui = req.user;
    if (!qui) throw new ApiError(401, 'Authentification requise.');
    const nationale = d.niveauSource === 'moyenne_nationale_anged';
    // La FNCT saisit la moyenne nationale, et elle seule ; une commune saisit
    // ses propres études (la base tient la même règle).
    if (nationale && qui.role !== 'super_admin_fnct') {
      throw new ApiError(403, 'La moyenne nationale de l’ANGeD ne se saisit que par la FNCT.');
    }
    if (!nationale && qui.role === 'super_admin_fnct') {
      throw new ApiError(403, 'Une étude de la commune se saisit par la commune ; la FNCT ne saisit que la moyenne nationale.');
    }
    const communeId = nationale ? null : await commune(req);
    const codes = new Set((await query<{ code: string }>('SELECT code FROM fractions_reference')).map((f) => f.code));
    const inconnues = Object.keys(d.fractions).filter((c) => !codes.has(c));
    if (inconnues.length) throw new ApiError(400, `Fraction inconnue : ${inconnues.join(', ')}.`);
    const total = Object.values(d.fractions).reduce((s, x) => s + x, 0);
    if (total < 99 || total > 101) {
      throw new ApiError(400, `Les fractions totalisent ${Math.round(total * 100) / 100} % ; elles doivent faire 100 % (à 1 près).`);
    }
    try {
      const id = await withTransaction(async (client) => {
        const c = await client.query<{ id: string }>(
          `INSERT INTO caracterisations (commune_id, niveau_source, annee, methode, saison, rapport_id, pcgd_id, saisi_par)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [communeId, d.niveauSource, d.annee, d.methode || null, d.saison ?? null, d.rapportId ?? null, d.pcgdId ?? null, qui.sub]
        );
        for (const [fraction, pourcentage] of Object.entries(d.fractions)) {
          await client.query(
            'INSERT INTO fractions_caracterisation (caracterisation_id, fraction, pourcentage) VALUES ($1, $2, $3)',
            [c.rows[0].id, fraction, pourcentage]
          );
        }
        return c.rows[0].id;
      });
      res.status(201).json({ id });
    } catch (err) {
      const m = (err as { message?: string }).message ?? '';
      const code = m.split(':')[0];
      if (ERREURS[code]) throw new ApiError(ERREURS[code], m.slice(code.length + 2));
      throw err;
    }
  })
);

// La composition retenue : la source la plus précise, puis la plus récente,
// toujours avec son origine et son année. null : rien n'existe — non renseignée.
referencesRouter.get(
  '/caracterisation-retenue',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const communeId = await commune(req);
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().parse(req.query.date);
    res.json(await queryOne('SELECT * FROM app.caracterisation_retenue($1, $2::date)', [communeId, date ?? null]));
  })
);

// Retrait logique d'un PCGD ou d'une caractérisation (règle d'or 1.4).
referencesRouter.delete(
  '/:table/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const table = z.enum(['pcgd', 'caracterisations']).parse(req.params.table);
    const id = idSchema.parse(req.params.id);
    const fait = await queryOne<{ retire: boolean }>('SELECT app.retirer_reference($1, $2) AS retire', [table, id]);
    if (!fait?.retire) throw new ApiError(404, 'Introuvable.');
    res.status(204).end();
  })
);
