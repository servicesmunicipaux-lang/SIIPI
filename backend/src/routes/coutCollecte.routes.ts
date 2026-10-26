// Le coût de collecte, par circuit et par engin (lot C, migration 090).
//
//   GET /cout-collecte?communeId&periode=AAAA-MM|AAAA
//
// Le calcul vit dans la base (app.cout_collecte_circuits, app.cout_collecte_engins,
// app.cout_collecte_indirects). La route n'additionne que ce qui est complet : un
// total de commune ne se donne que si chaque circuit a le sien, et le coût complet
// que si les frais indirects d'une étude existent. Aucun forfait n'en tient lieu.
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { exportable } from '../services/export.js';
import { JEU_COUT_COLLECTE } from '../services/jeuxExport.js';
import { communeDemandee } from '../perimetre.js';

export const coutCollecteRouter = Router();

// Le mois courant à Tunis (UTC+1, sans heure d'été).
const moisCourant = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 7);
const periodeSchema = z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, 'Période attendue : AAAA-MM (un mois) ou AAAA (une année).');

/** Les bornes d'une période « AAAA-MM » ou « AAAA ». */
function bornes(periode: string): { debut: string; fin: string; annuelle: boolean } {
  if (periode.length === 4) return { debut: `${periode}-01-01`, fin: `${periode}-12-31`, annuelle: true };
  const [a, m] = periode.split('-').map(Number);
  const dernier = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { debut: `${periode}-01`, fin: `${periode}-${String(dernier).padStart(2, '0')}`, annuelle: false };
}

const COLONNES_NOMBRES = [
  'personnel_tnd', 'carburant_tnd', 'entretien_tnd', 'amortissement_tnd', 'redevance_tnd', 'total_tnd', 'pese_t', 'cout_tonne',
];

// Les prix et consommations indicatifs du guide, en lecture : la commune voit sur
// quoi repose une composante dite « prix du guide » ou « ratio du guide ».
coutCollecteRouter.get(
  '/references',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (_req, res) => {
    const lignes = await query<Record<string, unknown>>(
      `SELECT r.id, r.classe, r.tranche_m3::text AS tranche_m3, r.prix_neuf_tnd::float8 AS prix_neuf_tnd,
              r.conso_l_seance::float8 AS conso_l_seance, r.date_effet, r.source, r.retire_le
         FROM references_cout_engins r
        ORDER BY r.classe, lower(r.tranche_m3) NULLS FIRST, r.date_effet`
    );
    res.json(lignes);
  })
);

coutCollecteRouter.get(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  exportable(JEU_COUT_COLLECTE, (req) => [communeDemandee(req), req.query.periode].filter(Boolean).join('-') || undefined),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const periode = periodeSchema.parse(req.query.periode ?? moisCourant());
    const lisible = await queryOne<{ ok: boolean }>('SELECT app.can_read_commune($1) AS ok', [communeId]);
    if (!lisible?.ok) throw new ApiError(404, 'Commune introuvable.');
    const { debut, fin, annuelle } = bornes(periode);

    const circuits = (
      await query<Record<string, unknown>>('SELECT * FROM app.cout_collecte_circuits($1, $2::date, $3::date)', [communeId, debut, fin])
    ).map((c) => ({
      ...c,
      ...Object.fromEntries(COLONNES_NOMBRES.map((k) => [k, c[k] == null ? null : Number(c[k])])),
    })) as (Record<string, unknown> & { total_tnd: number | null; pese_t: number | null; personnel_tnd: number | null })[];
    // L'export (Excel, CSV) est le tableau des circuits, une ligne par circuit.
    if (req.query.format !== undefined) {
      res.json(circuits);
      return;
    }
    const engins = (
      await query<Record<string, unknown>>('SELECT * FROM app.cout_collecte_engins($1, $2::date, $3::date)', [communeId, debut, fin])
    ).map((e) => ({
      ...e,
      ...Object.fromEntries(
        ['volume_m3', 'valeur_tnd', 'duree_ans', 'amortissement_tnd', 'entretien_tnd', 'carburant_tnd'].map((k) => [k, e[k] == null ? null : Number(e[k])])
      ),
    }));
    const indirect = await queryOne<Record<string, unknown>>('SELECT * FROM app.cout_collecte_indirects($1, $2::date, $3::date)', [communeId, debut, fin]);
    const population = await queryOne<{ population: number | null }>(
      `SELECT COALESCE(pc.population_permanente, NULLIF(c.population, 0)) AS population
         FROM communes c LEFT JOIN parametres_commune pc ON pc.commune_id = c.id WHERE c.id = $1`,
      [communeId]
    );

    // Un total de commune ne se donne que si chaque circuit a le sien : une somme
    // de circuits complets et incomplets se lirait comme le coût de la commune.
    const complets = circuits.length > 0 && circuits.every((c) => c.total_tnd != null);
    const direct = complets ? circuits.reduce((s, c) => s + (c.total_tnd ?? 0), 0) : null;
    const indirects = indirect?.indirects_tnd == null ? null : Number(indirect.indirects_tnd);
    const complet = direct != null && indirects != null ? direct + indirects : null;
    // Le coût par habitant n'a de sens que sur une année.
    const parHabitant = (v: number | null) =>
      annuelle && v != null && population?.population ? Math.round((1000 * v) / population.population) / 1000 : null;

    res.json({
      periode,
      debut,
      fin,
      circuits,
      engins,
      indirects: indirect
        ? {
            etude_id: indirect.etude_id,
            document: indirect.document,
            exercice: indirect.exercice,
            parc_tnd: indirect.parc_tnd == null ? null : Number(indirect.parc_tnd),
            administration_tnd: indirect.administration_tnd == null ? null : Number(indirect.administration_tnd),
            indirects_tnd: indirects,
          }
        : null,
      commune: {
        circuits_complets: circuits.filter((c) => c.total_tnd != null).length,
        circuits: circuits.length,
        cout_direct_tnd: direct == null ? null : Math.round(direct * 1000) / 1000,
        cout_complet_tnd: complet == null ? null : Math.round(complet * 1000) / 1000,
        population: population?.population ?? null,
        cout_direct_par_habitant: parHabitant(direct),
        cout_complet_par_habitant: parHabitant(complet),
      },
    });
  })
);
