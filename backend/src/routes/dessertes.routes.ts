// Les dessertes des établissements (jalon G, lot G5a, migration 105).
//
//   GET    /dessertes?communeId=…        les dessertes (en cours, à clôturer, toutes), avec leur période effective
//   POST   /dessertes?communeId=…        une desserte : un établissement → un point d'arrêt d'un circuit, du … au …
//   PUT    /dessertes/{id}               la clôture (date de fin) ou l'observation (version lue)
//   DELETE /dessertes/{id}?version=…     une desserte posée à tort, qui n'a servi à aucune levée
//
// « DESSERVI » SE CALCULE : la desserte qui couvre le jour. Sa fin effective est la
// plus proche de sa date de fin, de la fin du circuit, du retrait du point ou du
// circuit (app.fin_desserte) ; rien ne la réécrit. Une desserte arrêtée par le
// retrait de son point est « à clôturer » : la commune la clôt, puis ouvre la
// suivante le lendemain.
//
// Le directeur de la commune écrit ; la FNCT lit ; le prestataire passe par la
// feuille du jour (/levees/feuille).

import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeRequise } from '../perimetre.js';

export const dessertesRouter = Router();

const dateIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.')
  .refine((j) => {
    const d = new Date(`${j}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === j;
  }, 'Cette date n’existe pas : vérifiez le jour et le mois.')
  .refine((j) => j >= '2000-01-01' && j <= '2100-12-31', 'Date hors de l’intervalle admis (2000 à 2100).');
const sansOctetNul = (t: string) => !t.includes('\u0000');
const observation = z
  .string()
  .trim()
  .refine(sansOctetNul, 'Un texte ne peut pas contenir de caractère nul (\\u0000).')
  .refine((t) => [...t].length <= 1000, 'Observation : 1 000 caractères au plus.');
const versionLue = z.string().regex(/^\d{1,20}$/, 'La version de la desserte lue est attendue : rouvrez-la, puis recommencez.');

export const ETATS_DESSERTE = ['en_cours', 'a_venir', 'a_cloturer', 'terminee'] as const;

export const desserteSchema = z
  .object({
    commerceId: z.string().uuid('Établissement : identifiant attendu.'),
    pointId: z.string().uuid('Point d’arrêt : identifiant attendu.'),
    dateDebut: dateIso,
    dateFin: dateIso.nullable().optional(),
    observation: observation.nullable().optional(),
  })
  .strict()
  .refine((d) => !d.dateFin || d.dateFin >= d.dateDebut, { message: 'La fin ne précède pas le début.', path: ['dateFin'] });

export const modificationDesserteSchema = z
  .object({
    version: versionLue,
    dateFin: dateIso.nullable(),
    observation: observation.nullable().optional(),
  })
  .strict();

export const qDessertes = z.object({
  communeId: z.string().optional(),
  commerceId: z.string().uuid().optional(),
  circuitId: z.string().uuid().optional(),
  // actives (défaut) : en cours, à venir ou à clôturer ; toutes : avec les terminées.
  etat: z.enum(['actives', 'toutes']).optional(),
});

const ACTE_DE_LA_COMMUNE = 'La commune pose et clôt les dessertes de ses établissements ; la FNCT les lit.';
const fnctLitSeulement = (req: Request, _res: Response, next: NextFunction) =>
  next(req.user?.role === 'super_admin_fnct' ? new ApiError(403, ACTE_DE_LA_COMMUNE) : undefined);
const directeurSeul = [requireAuth, fnctLitSeulement, requireRole('admin_commune')];
const lecteurs = [requireAuth, requireRole('admin_commune', 'super_admin_fnct')];

const REFUS: Record<string, number> = {
  DESSERTE_FIGEE: 409,
  DESSERTE_LEVEES: 409,
  DESSERTE_LEVEES_APRES: 409,
  DESSERTE_POINT: 400,
  DESSERTE_POINT_TYPE: 400,
  DESSERTE_CIRCUIT_PERIODE: 400,
  DESSERTE_CHEVAUCHEMENT: 409,
  ETABLISSEMENT_FERME: 409,
};
const CONTRAINTES: Record<string, string> = {
  dessertes_periode: 'La fin d’une desserte ne précède pas son début.',
  dessertes_observation: 'Observation : 1 000 caractères au plus.',
};

function refus(err: unknown): never {
  if (err instanceof ApiError) throw err;
  const e = err as { message?: string; constraint?: string; code?: string };
  // Hors du périmètre du directeur, une desserte, un établissement ou un point sont
  // introuvables : un refus renseignerait sur leur existence.
  if (e.code === '42501' || e.code === 'P0002' || e.message === 'DESSERTE_HORS_PERIMETRE') {
    throw new ApiError(404, 'Desserte, établissement, point ou commune introuvable.');
  }
  if (e.code === '23503') throw new ApiError(404, 'Établissement ou point d’arrêt introuvable.');
  if (e.constraint && CONTRAINTES[e.constraint]) throw new ApiError(400, CONTRAINTES[e.constraint]);
  const code = e.message?.match(/^([A-Z_]+): /)?.[1];
  if (code && REFUS[code]) {
    const t = (e.message as string).slice(code.length + 2);
    throw new ApiError(REFUS[code], t.charAt(0).toUpperCase() + t.slice(1));
  }
  throw err;
}

// L'état se calcule d'après le jour de Tunis et la période effective.
export const SELECT_DESSERTES = `
  SELECT d.id, d.xmin::text AS version, d.commune_id, d.commerce_id, co.nom AS etablissement, co.statut AS statut_etablissement,
         co.matricule_fiscal, d.circuit_id, c.nom AS circuit, c.code AS circuit_code,
         d.point_id, p.nom AS point, p.ordre AS point_ordre, p.voyage AS point_voyage,
         d.date_debut, d.date_fin, fe.debut AS debut_effectif, fe.fin AS fin_effective, fe.raison AS raison_fin,
         -- « À clôturer » : arrêtée par un fait extérieur (point ou circuit retiré, circuit
         -- échu) avant la date que la desserte porte. La commune la clôt ; rien ne le fait à sa place.
         CASE
           WHEN ((fe.raison IN ('point_retire', 'circuit_retire') AND fe.fin <= app.jour_tunis())
                 OR (fe.raison = 'circuit_echu' AND fe.fin < app.jour_tunis()))
                AND (d.date_fin IS NULL OR d.date_fin > fe.fin) THEN 'a_cloturer'
           WHEN fe.fin IS NOT NULL AND fe.fin < app.jour_tunis() THEN 'terminee'
           WHEN fe.debut > app.jour_tunis() THEN 'a_venir'
           ELSE 'en_cours'
         END AS etat,
         d.observation,
         (SELECT count(*)::int FROM levees l WHERE l.desserte_id = d.id AND l.statut IN ('proposee', 'validee')) AS levees,
         d.created_at, d.updated_at
    FROM dessertes_commerces d
    JOIN commerces co ON co.id = d.commerce_id
    JOIN LATERAL app.fin_desserte(d.id) fe ON true
    LEFT JOIN circuits c ON c.id = d.circuit_id
    LEFT JOIN points_collecte p ON p.id = d.point_id`;

async function lireDesserte(id: string) {
  const [d] = await query(`${SELECT_DESSERTES} WHERE d.id = $1 AND d.deleted_at IS NULL`, [id]);
  if (!d) throw new ApiError(404, 'Desserte introuvable.');
  return d;
}

dessertesRouter.get(
  '/',
  ...lecteurs,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const q = qDessertes.parse(req.query);
    const lignes = await query<{ etat: string }>(
      `${SELECT_DESSERTES}
        WHERE d.commune_id = $1 AND d.deleted_at IS NULL
          AND ($2::uuid IS NULL OR d.commerce_id = $2) AND ($3::uuid IS NULL OR d.circuit_id = $3)
        ORDER BY lower(co.nom), d.date_debut DESC`,
      [communeId, q.commerceId ?? null, q.circuitId ?? null]
    );
    res.json(q.etat === 'toutes' ? lignes : lignes.filter((l) => l.etat !== 'terminee'));
  })
);

dessertesRouter.post(
  '/',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const d = desserteSchema.parse(req.body);
    try {
      const [r] = await query<{ id: string }>(
        `INSERT INTO dessertes_commerces (commune_id, commerce_id, point_id, date_debut, date_fin, observation)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [communeId, d.commerceId, d.pointId, d.dateDebut, d.dateFin ?? null, d.observation || null]
      );
      res.status(201).json(await lireDesserte(r.id));
    } catch (err) {
      refus(err);
    }
  })
);

dessertesRouter.put(
  '/:id',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new ApiError(404, 'Desserte introuvable.');
    const d = modificationDesserteSchema.parse(req.body);
    try {
      await withTransaction(async (client) => {
        const lue = await client.query<{ version: string }>(
          'SELECT xmin::text AS version FROM dessertes_commerces WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
          [id.data]
        );
        if (lue.rowCount === 0) throw new ApiError(404, 'Desserte introuvable.');
        if (lue.rows[0].version !== d.version) {
          throw new ApiError(409, 'Cette desserte a changé depuis que vous l’avez ouverte : la liste est à jour, recommencez.');
        }
        await client.query(
          `UPDATE dessertes_commerces SET date_fin = $2, observation = CASE WHEN $3::boolean THEN $4 ELSE observation END WHERE id = $1`,
          [id.data, d.dateFin, d.observation !== undefined, d.observation || null]
        );
      });
      res.json(await lireDesserte(id.data));
    } catch (err) {
      refus(err);
    }
  })
);

dessertesRouter.delete(
  '/:id',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new ApiError(404, 'Desserte introuvable.');
    const version = versionLue.parse(req.query.version);
    try {
      await withTransaction(async (client) => {
        const lue = await client.query<{ version: string }>(
          'SELECT xmin::text AS version FROM dessertes_commerces WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
          [id.data]
        );
        if (lue.rowCount === 0) throw new ApiError(404, 'Desserte introuvable.');
        if (lue.rows[0].version !== version) {
          throw new ApiError(409, 'Cette desserte a changé depuis que vous l’avez ouverte : la liste est à jour, recommencez.');
        }
        await client.query(`SELECT app.supprimer('dessertes_commerces', $1)`, [id.data]);
      });
      res.status(204).end();
    } catch (err) {
      refus(err);
    }
  })
);
