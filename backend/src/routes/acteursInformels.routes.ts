// Le registre communal des acteurs informels (lot 18.1, migration 064).
// Projet de décret sur le tri à la source, art. 13.1 — NON EN VIGUEUR :
// tout s'écrit derrière le paramètre national `cadre_secteur_informel_actif`.
//
//   GET    /acteurs-informels                          le registre (pseudonyme) et
//                                                      l'état du cadre
//   POST   /acteurs-informels                          inscrire un acteur
//   PUT    /acteurs-informels/{id}/faits               catégorie déclarée et faits
//   GET    /acteurs-informels/{id}/demarches           la démarche de formalisation
//   POST   /acteurs-informels/{id}/demarches           une étape datée
//   DELETE /acteurs-informels/{id}/demarches/{did}     retirer une étape saisie à tort
//
// L'identité (nom, empreinte du CIN) reste où le lot 16.1 l'a mise :
// /barbechas/{id}/identite, lue par le seul admin de la commune. Ce registre ne
// porte que le pseudonyme. Aucune position, aucun rendement individuel, aucun
// paiement.
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';

export const acteursInformelsRouter = Router();

const LECTEURS = ['admin_commune', 'super_admin_fnct'] as const;
const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');
// Le jour à Tunis (UTC+1, sans heure d'été).
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const pasDansLAvenir = { message: "Cette date porte sur ce qui a été constaté : elle ne peut pas être dans l'avenir." };
const estUuid = (s: string) => z.string().uuid().safeParse(s).success;

function communeRequise(req: Parameters<typeof communeDemandee>[0]) {
  const c = communeDemandee(req);
  if (!c) throw new ApiError(400, 'Commune requise (paramètre communeId).');
  return c;
}

const CADRE_INACTIF =
  'Le cadre du secteur informel n’est pas en vigueur (projet de décret). La FNCT l’active quand le texte est publié ; d’ici là, le registre est fermé en écriture.';

async function cadreActif() {
  const l = await queryOne<{ actif: boolean }>('SELECT app.cadre_secteur_informel_actif() AS actif');
  return Boolean(l?.actif);
}

/** L'acteur visible (RLS) — 404 sinon, jamais 403. */
async function acteur(id: string) {
  const a = estUuid(id)
    ? await queryOne<{ id: string; commune_id: string }>('SELECT id, commune_id FROM barbechas WHERE id = $1 AND deleted_at IS NULL', [id])
    : null;
  if (!a) throw new ApiError(404, 'Acteur introuvable.');
  return a;
}

const REFUS: Record<string, number> = {
  CADRE_INACTIF: 409,
  FAITS_AVENIR: 400,
  DEMARCHE_AVENIR: 400,
  DEMARCHE_DATE: 400,
  DEMARCHE_PREALABLE: 409,
  DEMARCHE_ABOUTIE: 409,
};
const CONTRAINTES: Record<string, string> = {
  demarches_entamee_referencee:
    'Une démarche entamée se prouve par sa pièce : indiquez la référence (récépissé de dépôt, numéro d’enregistrement).',
  demarches_interruption_motivee: 'Une démarche interrompue se motive (5 caractères au moins).',
  barbechas_faits_dates: 'Des faits relevés se datent : indiquez la date du relevé.',
};
function refus(err: unknown): never {
  const e = err as { message?: string; constraint?: string; code?: string };
  // Lisible mais pas inscriptible (une autre commune, vue par la FNCT ou par
  // un rattachement en lecture) : introuvable, comme partout.
  if (e.code === '42501') throw new ApiError(404, 'Acteur introuvable.');
  if (e.constraint && CONTRAINTES[e.constraint]) throw new ApiError(400, CONTRAINTES[e.constraint]);
  const code = e.message?.match(/^([A-Z_]+): /)?.[1];
  if (code && REFUS[code]) {
    if (code === 'CADRE_INACTIF') throw new ApiError(409, CADRE_INACTIF);
    const texte = e.message!.slice(code.length + 2);
    throw new ApiError(REFUS[code], texte.charAt(0).toUpperCase() + texte.slice(1));
  }
  throw err;
}

const SELECT_ACTEUR = `
  SELECT b.id, b.id_precollecteur, b.zone, b.vehicle_type, b.categorie, b.dispose_local, b.achete_aux_pairs,
         b.vehicule_motorise, b.faits_releves_le,
         app.categorie_impliquee(b.dispose_local, b.achete_aux_pairs) AS categorie_impliquee,
         d.statut AS derniere_demarche, d.date_statut AS date_derniere_demarche
    FROM barbechas b
    LEFT JOIN LATERAL (
      SELECT statut, date_statut FROM demarches_formalisation
       WHERE acteur_id = b.id AND deleted_at IS NULL
       ORDER BY date_statut DESC, created_at DESC LIMIT 1
    ) d ON true`;

acteursInformelsRouter.get(
  '/',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const cadre = await queryOne<{ valeur: string; reference: string | null }>(
      "SELECT valeur, reference FROM parametres_nationaux WHERE cle = 'cadre_secteur_informel_actif'"
    );
    res.json({
      communeId,
      cadre_actif: cadre?.valeur === 'true',
      reference_cadre: cadre?.reference ?? null,
      acteurs: await query(
        `${SELECT_ACTEUR} WHERE b.commune_id = $1 AND b.deleted_at IS NULL ORDER BY b.id_precollecteur`,
        [communeId]
      ),
    });
  })
);

const champsFaits = {
  categorie: z.enum(['pre_collecteur', 'intermediaire']),
  // null : non renseigné — jamais pris pour « non ».
  disposeLocal: z.boolean().nullable(),
  acheteAuxPairs: z.boolean().nullable(),
  vehiculeMotorise: z.boolean().nullable(),
  faitsRelevesLe: dateIso.refine((d) => d <= aujourdhui(), pasDansLAvenir),
};

export const inscriptionActeurSchema = z
  .object({
    zone: z.string().trim().min(1).max(200),
    vehicleType: z.enum(['charette', 'tricycle_electrique', 'triporteur_moteur']).nullable().optional(),
    ...champsFaits,
  })
  .strict();

acteursInformelsRouter.post(
  '/',
  requireAuth,
  // Le registre est celui de la commune : son admin l'établit.
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const d = inscriptionActeurSchema.parse(req.body);
    if (!(await cadreActif())) throw new ApiError(409, CADRE_INACTIF);
    let id: string | undefined;
    // L'identifiant est attribué par la base ; deux inscriptions simultanées
    // pourraient viser le même numéro : on retente, l'unicité tranche.
    for (let essai = 0; essai < 3 && !id; essai++) {
      try {
        id = (
          await queryOne<{ id: string }>(
            `INSERT INTO barbechas (id_precollecteur, zone, commune_id, vehicle_type, categorie, dispose_local,
                                    achete_aux_pairs, vehicule_motorise, faits_releves_le)
             VALUES (app.prochain_identifiant_acteur($1), $2, $1, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [communeId, d.zone, d.vehicleType ?? null, d.categorie, d.disposeLocal, d.acheteAuxPairs, d.vehiculeMotorise,
             d.faitsRelevesLe]
          )
        )?.id;
      } catch (err) {
        const e = err as { code?: string; constraint?: string };
        if (e.code === '23505' && e.constraint === 'barbechas_code_id_key' && essai < 2) continue;
        if (e.code === '42501') throw new ApiError(404, 'Commune introuvable.');
        refus(err);
      }
    }
    res.status(201).json(await queryOne(`${SELECT_ACTEUR} WHERE b.id = $1`, [id]));
  })
);

export const faitsActeurSchema = z.object(champsFaits).strict();

acteursInformelsRouter.put(
  '/:id/faits',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const d = faitsActeurSchema.parse(req.body);
    const a = await acteur(req.params.id);
    try {
      await query(
        `UPDATE barbechas SET categorie = $2, dispose_local = $3, achete_aux_pairs = $4, vehicule_motorise = $5,
                faits_releves_le = $6 WHERE id = $1`,
        [a.id, d.categorie, d.disposeLocal, d.acheteAuxPairs, d.vehiculeMotorise, d.faitsRelevesLe]
      );
    } catch (err) {
      refus(err);
    }
    res.json(await queryOne(`${SELECT_ACTEUR} WHERE b.id = $1`, [a.id]));
  })
);

const SELECT_DEMARCHE = `
  SELECT id, statut, date_statut, reference, observation, created_at
    FROM demarches_formalisation`;

acteursInformelsRouter.get(
  '/:id/demarches',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    const a = await acteur(req.params.id);
    res.json(await query(`${SELECT_DEMARCHE} WHERE acteur_id = $1 AND deleted_at IS NULL ORDER BY date_statut, created_at`, [a.id]));
  })
);

export const demarcheSchema = z
  .object({
    statut: z.enum(['demarche_entamee', 'en_accompagnement', 'formalisee', 'interrompue']),
    dateStatut: dateIso.refine((d) => d <= aujourdhui(), pasDansLAvenir),
    reference: z.string().trim().max(200).nullable().optional(),
    observation: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

acteursInformelsRouter.post(
  '/:id/demarches',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const d = demarcheSchema.parse(req.body);
    const a = await acteur(req.params.id);
    try {
      await query(
        `INSERT INTO demarches_formalisation (commune_id, acteur_id, statut, date_statut, reference, observation, saisi_par)
         VALUES ($1, $2, $3, $4, $5, $6, app.current_user_id())`,
        [a.commune_id, a.id, d.statut, d.dateStatut, d.reference || null, d.observation || null]
      );
    } catch (err) {
      refus(err);
    }
    res.status(201).json(await query(`${SELECT_DEMARCHE} WHERE acteur_id = $1 AND deleted_at IS NULL ORDER BY date_statut, created_at`, [a.id]));
  })
);

acteursInformelsRouter.delete(
  '/:id/demarches/:demarcheId',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const a = await acteur(req.params.id);
    const existe = estUuid(req.params.demarcheId)
      ? await queryOne('SELECT id FROM demarches_formalisation WHERE id = $1 AND acteur_id = $2 AND deleted_at IS NULL', [
          req.params.demarcheId, a.id,
        ])
      : null;
    if (!existe) throw new ApiError(404, 'Étape introuvable.');
    await query("SELECT app.supprimer('demarches_formalisation', $1)", [req.params.demarcheId]);
    res.status(204).end();
  })
);
