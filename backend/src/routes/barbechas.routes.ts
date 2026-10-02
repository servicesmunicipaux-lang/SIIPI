// Le registre des pré-collecteurs (« barbechas »), mis en conformité au lot
// 16.1 (docs/specs_metier/SPEC_v0.16.md, R1-R3, migration 056).
//
// Deux registres, deux publics :
//   /barbechas                  le registre PSEUDONYME — id_precollecteur,
//                               zone, véhicule, cumul pesé. Ce que voient les
//                               pesées, les bilans et les exports.
//   /barbechas/:id/identite     le nom et l'empreinte du CIN, lus et écrits par
//                               le seul admin de la commune — pas la FNCT. La
//                               base refuse toute écriture sans hébergement
//                               accrédité ni récépissé INPDP ; chaque lecture
//                               est journalisée.
//   /barbechas/revenus          le revenu par zone et par mois, masqué sous
//                               cinq pré-collecteurs. Il n'existe plus de
//                               revenu individuel.
//
// Le vocabulaire est « pseudonyme », jamais « anonyme » (R1) : tant que la
// table d'identité relie l'identifiant à une personne, la donnée reste
// personnelle, et un mot faux se retournerait contre la commune lors d'un
// contrôle.
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';
import { empreinteCin, normaliserCin } from '../services/identites.js';

export const barbechasRouter = Router();

const COLONNES = 'id, id_precollecteur, zone, commune_id, vehicle_type, collected_total_kg, created_at';

barbechasRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = typeof req.query.communeId === 'string' ? req.query.communeId : undefined;
    const rows = communeId
      ? await query(`SELECT ${COLONNES} FROM barbechas WHERE commune_id = $1 ORDER BY id_precollecteur`, [communeId])
      : await query(`SELECT ${COLONNES} FROM barbechas ORDER BY id_precollecteur`);
    res.json(rows);
  })
);

// Déclarée AVANT /:id : sinon « revenus » serait pris pour un identifiant.
const revenusSchema = z.object({
  mois: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mois attendu au format AAAA-MM.'),
});

barbechasRouter.get(
  '/revenus',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const { mois } = revenusSchema.parse(req.query);
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise (paramètre communeId).');
    const zones = await query('SELECT * FROM app.revenus_precollecteurs($1, $2::date)', [communeId, `${mois}-01`]);
    res.json({ communeId, mois, seuil: 5, zones });
  })
);

barbechasRouter.get(
  '/:id/deliveries',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await query('SELECT * FROM barbecha_deliveries WHERE barbecha_id = $1 ORDER BY delivered_at DESC', [
      req.params.id,
    ]);
    res.json(rows);
  })
);

// ---------------------------------------------------------------------------
// L'identité : le seul admin de la commune
// ---------------------------------------------------------------------------

/** Le pré-collecteur, s'il est visible de l'appelant (RLS) ; 404 sinon, jamais 403. */
async function precollecteurVisible(id: string) {
  const b = await queryOne<{ id: string; commune_id: string }>('SELECT id, commune_id FROM barbechas WHERE id = $1', [id]);
  if (!b) throw new ApiError(404, 'Pré-collecteur introuvable.');
  return b;
}

barbechasRouter.get(
  '/:id/identite',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const b = await precollecteurVisible(req.params.id);
    // L'empreinte ne sort pas : elle ne sert qu'au dédoublonnage, et l'écran
    // n'a besoin que de savoir si un CIN a été enregistré.
    const identite = await queryOne(
      `SELECT barbecha_id, nom_complet, empreinte_cin IS NOT NULL AS cin_enregistre, created_at, updated_at
         FROM donnees_personnelles_barbechas WHERE barbecha_id = $1`,
      [b.id]
    );
    if (!identite) throw new ApiError(404, 'Aucune identité enregistrée pour ce pré-collecteur.');
    await query('SELECT app.enregistrer_acces_identites($1, ARRAY[$2]::uuid[], $3)', [
      'GET /barbechas/:id/identite',
      b.id,
      b.commune_id,
    ]);
    res.json(identite);
  })
);

export const identiteSchema = z
  .object({
    nomComplet: z.string().trim().min(1).max(200),
    // Facultatif : sans lui, pas de dédoublonnage, mais une identité quand même.
    // Le message d'erreur ne reprend jamais la valeur saisie.
    cin: z
      .string()
      .refine((v) => normaliserCin(v).length === 8, 'CIN : huit chiffres attendus.')
      .optional(),
  })
  .strict();

/** Les refus de la base (migration 056), traduits en message qui dit quoi faire. */
function refusIdentite(err: unknown): never {
  const e = err as { code?: string; message?: string; constraint?: string };
  if (e.message?.includes('IDENTITE_HEBERGEMENT')) {
    throw new ApiError(409, "L'hébergement des identités n'est pas encore accrédité par la FNCT : aucune identité ne s'enregistre d'ici là.");
  }
  if (e.message?.includes('IDENTITE_RECEPISSE')) {
    throw new ApiError(409, 'Enregistrez d’abord le récépissé de déclaration INPDP de la commune (paramètres de la commune).');
  }
  if (e.code === '23505' && e.constraint === 'uq_identite_empreinte_cin') {
    throw new ApiError(409, 'Ce CIN est déjà enregistré pour un autre pré-collecteur de la commune.');
  }
  throw err;
}

barbechasRouter.put(
  '/:id/identite',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const d = identiteSchema.parse(req.body);
    const b = await precollecteurVisible(req.params.id);
    const empreinte = d.cin ? empreinteCin(b.commune_id, d.cin) : null;
    try {
      const existante = await queryOne<{ id: string }>(
        'SELECT id FROM donnees_personnelles_barbechas WHERE barbecha_id = $1',
        [b.id]
      );
      if (existante) {
        await query(
          `UPDATE donnees_personnelles_barbechas
              SET nom_complet = $2, empreinte_cin = COALESCE($3, empreinte_cin)
            WHERE id = $1`,
          [existante.id, d.nomComplet, empreinte]
        );
      } else {
        await query(
          `INSERT INTO donnees_personnelles_barbechas (barbecha_id, commune_id, nom_complet, empreinte_cin, created_by)
           VALUES ($1, $2, $3, $4, app.current_user_id())`,
          [b.id, b.commune_id, d.nomComplet, empreinte]
        );
      }
    } catch (err) {
      refusIdentite(err);
    }
    res.json(
      await queryOne(
        `SELECT barbecha_id, nom_complet, empreinte_cin IS NOT NULL AS cin_enregistre, created_at, updated_at
           FROM donnees_personnelles_barbechas WHERE barbecha_id = $1`,
        [b.id]
      )
    );
  })
);

barbechasRouter.delete(
  '/:id/identite',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const b = await precollecteurVisible(req.params.id);
    const identite = await queryOne<{ id: string }>(
      'SELECT id FROM donnees_personnelles_barbechas WHERE barbecha_id = $1',
      [b.id]
    );
    if (!identite) throw new ApiError(404, 'Aucune identité enregistrée pour ce pré-collecteur.');
    await query("SELECT app.supprimer('donnees_personnelles_barbechas', $1)", [identite.id]);
    res.status(204).end();
  })
);

// ---------------------------------------------------------------------------
// Les livraisons
// ---------------------------------------------------------------------------

const deliverySchema = z.object({
  material: z.enum(['PET_plastique', 'PEHD', 'Carton', 'Aluminium', 'Cuivre']),
  weightKg: z.number().positive(),
  hubName: z.string().optional(),
});

const UNIT_PRICES_TND: Record<string, number> = {
  PET_plastique: 1.1,
  PEHD: 0.95,
  Carton: 0.35,
  Aluminium: 2.5,
  Cuivre: 8.0,
};

// POST /barbechas/:id/deliveries — pesée d'achat au centre de tri social.
// Le montant est calculé côté serveur (jamais fourni par le client) pour éviter toute falsification.
// Note : le module GDMA/Barbécha n'apparaît pas dans le cahier des charges officiel FNCT
// (il vient du prototype d'origine). Il est conservé fonctionnel mais géré par l'Admin
// Commune (il n'existe pas de rôle de connexion "acteur GDMA" distinct dans le CDC) —
// à statuer avec la FNCT : module Phase 2+ ou à retirer du périmètre.
barbechasRouter.post(
  '/:id/deliveries',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const data = deliverySchema.parse(req.body);
    const barbecha = await queryOne('SELECT id FROM barbechas WHERE id = $1', [req.params.id]);
    if (!barbecha) throw new ApiError(404, 'Pré-collecteur introuvable.');

    const unitPrice = UNIT_PRICES_TND[data.material];
    const amountTnd = Number((data.weightKg * unitPrice).toFixed(2));

    const delivery = await queryOne(
      `INSERT INTO barbecha_deliveries (barbecha_id, material, weight_kg, amount_tnd, hub_name)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, data.material, data.weightKg, amountTnd, data.hubName ?? null]
    );
    res.status(201).json(delivery);
  })
);

// Schémas exposés à la documentation OpenAPI (src/openapi/document.ts).
// La documentation importe les schémas de validation EUX-MÊMES : elle ne peut
// donc pas décrire un format différent de celui réellement contrôlé à l'exécution.
export {
  deliverySchema as barbechaDeliverySchema,
  revenusSchema as barbechaRevenusSchema,
};
