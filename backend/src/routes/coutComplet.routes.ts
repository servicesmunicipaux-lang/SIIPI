// Le rejeu du coût complet d'une étude de bureau d'études (lot 17.5).
//
//   GET    /cout-complet/etudes              les études d'une commune
//   POST   /cout-complet/etudes              charger un fichier « agrégats de PCGD »
//   GET    /cout-complet/etudes/{id}         l'étude, ses chiffres déclarés, et le
//                                            rejeu : Z = (A+B)+(C+D), comparaison aux
//                                            totaux publiés, dénominateurs, écarts E1–E8
//   DELETE /cout-complet/etudes/{id}         retirer l'étude (pour la recharger)
//
// Les chiffres sont DÉCLARÉS par le bureau d'études : SIIPI les rejoue et
// montre les écarts, sans les trancher. Des coûts : la commune et la FNCT.
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';
import { rejouer, type ConstatLecture, type ValeurDeclaree } from '../services/coutComplet.js';
import { FichierInvalide, lireFichierPcgd } from '../services/importCoutComplet.js';

export const coutCompletRouter = Router();

const ROLES = ['admin_commune', 'super_admin_fnct'] as const;
const estUuid = (s: string) => z.string().uuid().safeParse(s).success;
// Gouvernorat comparé sans casse ni accents : « Ben Arous » = « ben arous ».
const normaliser = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

function communeRequise(req: Parameters<typeof communeDemandee>[0]) {
  const c = communeDemandee(req);
  if (!c) throw new ApiError(400, 'Commune requise (paramètre communeId).');
  return c;
}

const COLONNES_ETUDE = `
  e.id, e.commune_id, e.exercice, e.document, e.bureau_etudes, e.lu_le, e.tonnage_pese_t::float, e.tonnage_source,
  e.population, e.population_source, e.menages, e.provenance, e.created_at`;

coutCompletRouter.get(
  '/etudes',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    res.json(
      await query(
        `SELECT ${COLONNES_ETUDE} FROM etudes_cout_complet e
          WHERE e.commune_id = $1 AND e.deleted_at IS NULL
          ORDER BY e.exercice DESC, e.created_at DESC`,
        [communeId]
      )
    );
  })
);

export const chargementEtudeSchema = z
  .object({
    // Le fichier « agrégats de PCGD » tel quel (objet JSON). Sa structure est
    // contrôlée à la lecture, avec un message qui dit quoi corriger.
    fichier: z.record(z.unknown()),
  })
  .strict();

async function etudeComplete(id: string) {
  const etude = await queryOne<{ id: string; tonnage_pese_t: number | null; population: number | null; menages: number | null }>(
    `SELECT ${COLONNES_ETUDE} FROM etudes_cout_complet e WHERE e.id = $1 AND e.deleted_at IS NULL`,
    [id]
  );
  if (!etude) throw new ApiError(404, 'Étude introuvable.');
  const valeurs = await query<ValeurDeclaree>(
    `SELECT nature, code, montant::float, numerateur::float, pas_arrondi::float, retenue, reference
       FROM valeurs_cout_complet WHERE etude_id = $1 ORDER BY nature, code, retenue DESC, created_at`,
    [id]
  );
  const constats = await query<ConstatLecture>(
    'SELECT code, sujet, constat FROM constats_lecture_cout_complet WHERE etude_id = $1 ORDER BY code, created_at',
    [id]
  );
  return { ...etude, valeurs, constats, rejeu: rejouer(etude, valeurs, constats) };
}

coutCompletRouter.post(
  '/etudes',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const { fichier } = chargementEtudeSchema.parse(req.body);
    let lu;
    try {
      lu = lireFichierPcgd(fichier);
    } catch (err) {
      if (err instanceof FichierInvalide) throw new ApiError(400, err.message);
      throw err;
    }
    // La commune visible (RLS) ; son gouvernorat doit être celui du fichier :
    // charger M'hamdia dans la mauvaise commune serait silencieux sinon.
    const commune = await queryOne<{ id: string; gouvernorat: string | null }>(
      'SELECT id, gouvernorat FROM communes WHERE id = $1',
      [communeId]
    );
    if (!commune) throw new ApiError(404, 'Commune introuvable.');
    if (lu.gouvernorat && commune.gouvernorat && normaliser(lu.gouvernorat) !== normaliser(commune.gouvernorat)) {
      throw new ApiError(
        400,
        `Le fichier porte sur le gouvernorat « ${lu.gouvernorat} », la commune choisie est dans « ${commune.gouvernorat} ». Vérifiez la commune.`
      );
    }
    let id: string;
    try {
      id = await withTransaction(async (client) => {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO etudes_cout_complet
             (commune_id, exercice, document, bureau_etudes, tonnage_pese_t, tonnage_source, population, population_source,
              menages, importe_par)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, app.current_user_id()) RETURNING id`,
          [communeId, lu.exercice, lu.document, lu.bureau_etudes, lu.tonnage_pese_t, lu.tonnage_source, lu.population,
           lu.population_source, lu.menages]
        );
        const etude = rows[0].id;
        for (const v of lu.valeurs) {
          await client.query(
            `INSERT INTO valeurs_cout_complet (etude_id, commune_id, nature, code, montant, numerateur, pas_arrondi, retenue, reference)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [etude, communeId, v.nature, v.code, v.montant, v.numerateur, v.pas_arrondi, v.retenue, v.reference]
          );
        }
        for (const c of lu.constats) {
          await client.query(
            'INSERT INTO constats_lecture_cout_complet (etude_id, commune_id, code, sujet, constat) VALUES ($1, $2, $3, $4, $5)',
            [etude, communeId, c.code, c.sujet, c.constat]
          );
        }
        return etude;
      });
    } catch (err) {
      const e = err as { code?: string; constraint?: string };
      if (e.code === '23505' && e.constraint === 'uq_etude_cout_complet') {
        throw new ApiError(409, 'Cette étude est déjà chargée pour cette commune et cet exercice. Retirez-la d’abord pour la recharger.');
      }
      if (e.code === '42501') throw new ApiError(404, 'Commune introuvable.');
      throw err;
    }
    res.status(201).json(await etudeComplete(id));
  })
);

coutCompletRouter.get(
  '/etudes/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    if (!estUuid(req.params.id)) throw new ApiError(404, 'Étude introuvable.');
    res.json(await etudeComplete(req.params.id));
  })
);

coutCompletRouter.delete(
  '/etudes/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const existe = estUuid(req.params.id)
      ? await queryOne('SELECT id FROM etudes_cout_complet WHERE id = $1 AND deleted_at IS NULL', [req.params.id])
      : null;
    if (!existe) throw new ApiError(404, 'Étude introuvable.');
    await query("SELECT app.supprimer('etudes_cout_complet', $1)", [req.params.id]);
    res.status(204).end();
  })
);
