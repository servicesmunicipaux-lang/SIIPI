import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';

export const peseesRouter = Router();

/**
 * Rubrique 4 — Pesées et traçabilité, volet saisie communale.
 *
 * CE QUI N'EST PAS ICI. L'import des classeurs ANGeD (B4.1) et le recoupement
 * avec leurs chiffres (B4.3) : l'interopérabilité avec leur plateforme n'est
 * pas possible aujourd'hui. Le registre est bâti pour les accueillir sans
 * migration le jour venu — voir la colonne `source` de la table.
 *
 * Le routeur existant `weighbridge.routes.ts` sert la table `pesees_anged`,
 * bâtie autour d'un ticket de pont-bascule. Les deux coexistent : une saisie
 * communale n'a pas de ticket ANGeD, et lui en fabriquer un serait inventer
 * l'identifiant d'un document qui n'existe pas.
 */

const TYPES_DECHET = ['menager', 'vert', 'ddc', 'encombrant', 'metal', 'tri', 'autre'] as const;

const PESEE_SELECT = `
  SELECT p.*,
         c.nom  AS circuit,
         COALESCE(v.registration, p.vehicule_immat) AS engin,
         v.charge_utile_t,
         round(p.poids_net_kg / 1000.0, 3) AS tonnage_t,
         -- Dépassement de charge utile, calculé ici pour que la liste le
         -- montre sans qu'on ait à croiser deux écrans.
         CASE WHEN v.charge_utile_t > 0 AND p.poids_net_kg > v.charge_utile_t * 1000
              THEN true ELSE false END AS surcharge
    FROM pesees p
    LEFT JOIN circuits  c ON c.id = p.circuit_id
    LEFT JOIN vehicules v ON v.id = p.vehicule_id
`;

// --- Liste ------------------------------------------------------------------

peseesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');

    const q = z
      .object({
        depuis: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        jusqua: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        circuitId: z.string().uuid().optional(),
        typeDechet: z.enum(TYPES_DECHET).optional(),
      })
      .parse(req.query);

    const conditions = ['p.deleted_at IS NULL', 'p.commune_id = $1'];
    const valeurs: unknown[] = [communeId];
    // Un mois par défaut : ouvrir le registre sur trois ans de lignes ne sert
    // personne, et la question du matin porte sur la semaine écoulée.
    valeurs.push(q.depuis ?? null);
    conditions.push(`p.date_pesee >= COALESCE($${valeurs.length}::date, CURRENT_DATE - 30)`);
    valeurs.push(q.jusqua ?? null);
    conditions.push(`p.date_pesee <= COALESCE($${valeurs.length}::date, CURRENT_DATE)`);
    if (q.circuitId) { valeurs.push(q.circuitId); conditions.push(`p.circuit_id = $${valeurs.length}`); }
    if (q.typeDechet) { valeurs.push(q.typeDechet); conditions.push(`p.type_dechet = $${valeurs.length}`); }

    res.json(
      await query(
        `${PESEE_SELECT} WHERE ${conditions.join(' AND ')}
          ORDER BY p.date_pesee DESC, c.nom NULLS LAST, p.voyage`,
        valeurs
      )
    );
  })
);

// --- Routes littérales, AVANT « /:id » --------------------------------------
//
// Le piège s'est présenté six fois dans ce projet.

/**
 * Ce qu'il reste à saisir aujourd'hui.
 *
 * La route qui décide si le registre sera tenu ou non. Elle rend les voyages
 * ATTENDUS, avec la pesée en face quand elle existe — donc les trous. Une
 * liste des seules pesées saisies ne montre jamais ce qu'on a oublié.
 */
peseesRouter.get(
  '/attendues',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const jour = typeof req.query.jour === 'string' && req.query.jour !== '' ? req.query.jour : null;
    res.json(
      jour
        ? await query('SELECT * FROM app.pesees_attendues($1, $2::date)', [communeId, jour])
        : await query('SELECT * FROM app.pesees_attendues($1)', [communeId])
    );
  })
);

peseesRouter.get(
  '/tonnages',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const depuis = typeof req.query.depuis === 'string' && req.query.depuis !== '' ? req.query.depuis : null;
    const jusqua = typeof req.query.jusqua === 'string' && req.query.jusqua !== '' ? req.query.jusqua : null;
    res.json(
      await query(
        `SELECT * FROM app.tonnages_commune($1,
            COALESCE($2::date, CURRENT_DATE - 30), COALESCE($3::date, CURRENT_DATE))`,
        [communeId, depuis, jusqua]
      )
    );
  })
);

peseesRouter.get(
  '/mensuel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const annee = typeof req.query.annee === 'string' && /^\d{4}$/.test(req.query.annee)
      ? Number(req.query.annee) : null;
    res.json(await query('SELECT * FROM app.tonnage_mensuel($1, $2::integer)', [communeId, annee]));
  })
);

peseesRouter.get(
  '/coherence',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    res.json(await query('SELECT * FROM app.incoherences_pesees($1)', [communeId]));
  })
);

// --- Saisie -----------------------------------------------------------------

const peseeSchema = z.object({
  datePesee: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  circuitId: z.string().uuid().nullable().optional(),
  voyage: z.number().int().min(1).optional(),
  vehiculeId: z.string().nullable().optional(),
  vehiculeImmat: z.string().max(40).nullable().optional(),
  typeDechet: z.enum(TYPES_DECHET).optional(),
  poidsNetKg: z.number().positive(),
  poidsBrutKg: z.number().positive().nullable().optional(),
  poidsTareKg: z.number().min(0).nullable().optional(),
  destination: z.string().max(200).nullable().optional(),
  bonNumero: z.string().max(60).nullable().optional(),
  observation: z.string().max(500).nullable().optional(),
});

const COLONNES: Record<string, string> = {
  datePesee: 'date_pesee',
  circuitId: 'circuit_id',
  voyage: 'voyage',
  vehiculeId: 'vehicule_id',
  vehiculeImmat: 'vehicule_immat',
  typeDechet: 'type_dechet',
  poidsNetKg: 'poids_net_kg',
  poidsBrutKg: 'poids_brut_kg',
  poidsTareKg: 'poids_tare_kg',
  destination: 'destination',
  bonNumero: 'bon_numero',
  observation: 'observation',
};

const typer = (cle: string, pos: number) => {
  if (cle === 'datePesee') return `$${pos}::date`;
  if (cle === 'voyage') return `$${pos}::smallint`;
  return `$${pos}`;
};

peseesRouter.post(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = peseeSchema.parse(req.body) as Record<string, unknown>;
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');

    const colonnes = ['commune_id', 'saisi_par'];
    const emplacements = ['$1', '$2'];
    const valeurs: unknown[] = [communeId, req.user!.sub];
    for (const [cle, colonne] of Object.entries(COLONNES)) {
      if (!(cle in d) || d[cle] === undefined) continue;
      valeurs.push(d[cle]);
      colonnes.push(colonne);
      emplacements.push(typer(cle, valeurs.length));
    }
    const cree = await queryOne<{ id: string }>(
      `INSERT INTO pesees (${colonnes.join(', ')}) VALUES (${emplacements.join(', ')}) RETURNING id`,
      valeurs
    );
    res.status(201).json(await queryOne(`${PESEE_SELECT} WHERE p.id = $1`, [cree!.id]));
  })
);

peseesRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const p = await queryOne(`${PESEE_SELECT} WHERE p.id = $1 AND p.deleted_at IS NULL`, [req.params.id]);
    if (!p) throw new ApiError(404, 'Pesée introuvable.');
    res.json(p);
  })
);

peseesRouter.patch(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = peseeSchema.partial().parse(req.body) as Record<string, unknown>;
    const clauses: string[] = [];
    const valeurs: unknown[] = [];
    for (const [cle, colonne] of Object.entries(COLONNES)) {
      if (!(cle in d)) continue;
      valeurs.push(d[cle]);
      clauses.push(`${colonne} = ${typer(cle, valeurs.length)}`);
    }
    if (clauses.length === 0) throw new ApiError(400, 'Aucun champ à mettre à jour.');
    valeurs.push(req.params.id);

    const modifie = await queryOne<{ id: string }>(
      `UPDATE pesees SET ${clauses.join(', ')}
        WHERE id = $${valeurs.length} AND deleted_at IS NULL RETURNING id`,
      valeurs
    );
    if (!modifie) throw new ApiError(404, 'Pesée introuvable.');
    res.json(await queryOne(`${PESEE_SELECT} WHERE p.id = $1`, [req.params.id]));
  })
);

// Suppression LOGIQUE. Un registre numérique conforme au décret (B4.5) ne peut
// pas perdre de lignes : une pesée annulée reste, datée et imputée.
peseesRouter.delete(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const supprime = await queryOne<{ id: string }>(
      `UPDATE pesees SET deleted_at = now(), deleted_by = $1
        WHERE id = $2 AND deleted_at IS NULL RETURNING id`,
      [req.user!.sub, req.params.id]
    );
    if (!supprime) throw new ApiError(404, 'Pesée introuvable.');
    res.status(204).end();
  })
);
