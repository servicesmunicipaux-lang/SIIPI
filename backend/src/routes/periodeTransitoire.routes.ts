// La période transitoire du secteur informel (lot I3, 18.3 ; migration 093).
//
//   GET    /periode-transitoire                              les règles du jour, l'état de chaque acteur, leur décompte
//   GET    /periode-transitoire/conversion                   le bilan de la conversion, mois par mois (exportable)
//   GET    /periode-transitoire/national                     la vue de la FNCT, par gouvernorat
//   GET    /periode-transitoire/acteurs/{id}                 l'accompagnement d'un acteur : étapes, agréments
//   POST   /periode-transitoire/acteurs/{id}/jalons          une étape franchie : sa date, sa pièce
//   DELETE /periode-transitoire/acteurs/{id}/jalons/{jalonId}
//   POST   /periode-transitoire/acteurs/{id}/agrements       un agrément délivré, tel qu'il a été délivré
//   DELETE /periode-transitoire/acteurs/{id}/agrements/{agrementId}
//
// Les règles (départ, durée, délai d'étalonnage, durée d'un agrément, liste
// des étapes) sont les paramètres nationaux datés du lot I1 : ce routeur n'en
// connaît aucune valeur. La base juge (app.situation_transitoire) ; sans date
// de départ, aucun acteur n'a d'état. SIIPI constate, il ne bloque personne,
// et il n'agrée pas : il enregistre l'agrément qu'un organisme a délivré.
//
// Les tonnes détournées sont déclarées (livraisons du registre des acteurs) :
// elles ne s'additionnent jamais au tonnage pesé.
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { exportable } from '../services/export.js';
import { JEU_CONVERSION_INFORMEL } from '../services/jeuxExport.js';
import { communeDemandee } from '../perimetre.js';

export const periodeTransitoireRouter = Router();

const LECTEURS = ['admin_commune', 'super_admin_fnct'] as const;
const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');
// Le jour à Tunis (UTC+1, sans heure d'été).
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const pasDansLAvenir = { message: "Cette date porte sur ce qui a eu lieu : elle ne peut pas être dans l'avenir." };
const estUuid = (s: string) => z.string().uuid().safeParse(s).success;
const nombre = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export const ETATS_TRANSITION = [
  'date_depart_non_fixee', 'regles_incompletes', 'formalise', 'avant_periode', 'peut_exercer', 'sans_demarche', 'a_regulariser',
] as const;

const CADRE_INACTIF =
  'Le cadre du secteur informel n’est pas en vigueur (projet de décret). La FNCT l’active quand le texte est publié ; d’ici là, rien ne s’inscrit.';

const REFUS: Record<string, number> = {
  CADRE_INACTIF: 409,
  JALON_FIGE: 409,
  JALON_PREALABLE: 409,
  JALON_AVENIR: 400,
  JALON_INCONNU: 400,
  AGREMENT_FIGE: 409,
  AGREMENT_CATEGORIE: 409,
  AGREMENT_AVENIR: 400,
};
const CONTRAINTES: Record<string, string> = {
  uq_jalon_acteur: 'Cette étape est déjà inscrite pour cet acteur : retirez-la pour en corriger la date ou la pièce.',
  agrements_organisme_nomme: 'Nommez l’organisme qui a délivré l’agrément (3 caractères au moins).',
  agrements_reference_donnee: 'Indiquez la référence de l’agrément, telle qu’elle figure sur la pièce.',
  agrements_echeance_apres: 'L’échéance d’un agrément suit sa délivrance.',
};
function refus(err: unknown): never {
  const e = err as { message?: string; constraint?: string; code?: string };
  if (e.code === '42501' || e.message?.startsWith('ACTEUR_INCONNU')) throw new ApiError(404, 'Acteur introuvable.');
  if (e.constraint && CONTRAINTES[e.constraint]) throw new ApiError(e.code === '23505' ? 409 : 400, CONTRAINTES[e.constraint]);
  const code = e.message?.match(/^([A-Z_]+): /)?.[1];
  if (code && REFUS[code]) {
    if (code === 'CADRE_INACTIF') throw new ApiError(409, CADRE_INACTIF);
    const texte = e.message!.slice(code.length + 2);
    throw new ApiError(REFUS[code], texte.charAt(0).toUpperCase() + texte.slice(1));
  }
  throw err;
}

function communeRequise(req: Parameters<typeof communeDemandee>[0]) {
  const c = communeDemandee(req);
  if (!c) throw new ApiError(400, 'Commune requise (paramètre communeId).');
  return c;
}

async function communeLisible(communeId: string) {
  const l = await queryOne<{ ok: boolean }>('SELECT app.can_read_commune($1) AS ok', [communeId]);
  if (!l?.ok) throw new ApiError(404, 'Commune introuvable.');
}

async function cadreActif() {
  const l = await queryOne<{ actif: boolean }>('SELECT app.cadre_secteur_informel_actif() AS actif');
  return Boolean(l?.actif);
}

/** L'acteur visible (RLS) — 404 sinon, jamais 403. */
async function acteur(id: string) {
  const a = estUuid(id)
    ? await queryOne<{ id: string; commune_id: string; id_precollecteur: string; categorie: string | null }>(
        'SELECT id, commune_id, id_precollecteur, categorie FROM barbechas WHERE id = $1 AND deleted_at IS NULL',
        [id]
      )
    : null;
  if (!a) throw new ApiError(404, 'Acteur introuvable.');
  return a;
}

// --- Les règles du jour et l'état de chaque acteur -------------------------

const situationQuery = z.object({ date: dateIso.optional() }).passthrough();

periodeTransitoireRouter.get(
  '/',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const { date } = situationQuery.parse(req.query);
    await communeLisible(communeId);
    const jour = date ?? aujourdhui();
    const periode = await queryOne('SELECT * FROM app.periode_transitoire($1::date)', [jour]);
    const acteurs = await query<{ etat: string }>('SELECT * FROM app.situation_transitoire($1, $2::date)', [communeId, jour]);
    // Le décompte par état, sans total ni pourcentage : des effectifs, pas un score.
    const etats = Object.fromEntries(ETATS_TRANSITION.map((e) => [e, acteurs.filter((a) => a.etat === e).length]));
    res.json({ communeId, jour, cadre_actif: await cadreActif(), periode, etats, acteurs });
  })
);

// --- Le bilan de la conversion ------------------------------------------------

const conversionQuery = z
  .object({ annee: z.coerce.number().int().min(2000).max(2100).optional() })
  .passthrough();

periodeTransitoireRouter.get(
  '/conversion',
  requireAuth,
  requireRole(...LECTEURS),
  exportable(JEU_CONVERSION_INFORMEL, (req) => [communeDemandee(req), req.query.annee].filter(Boolean).join('-') || undefined),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const annee = conversionQuery.parse(req.query).annee ?? Number(aujourdhui().slice(0, 4));
    await communeLisible(communeId);
    const mois = (await query<Record<string, unknown>>('SELECT * FROM app.conversion_informel($1, $2)', [communeId, annee])).map((m) => ({
      ...m,
      ...Object.fromEntries(
        ['tonnes_detournees', 'tonnes_sans_taux', 'redevance_evitee_tnd', 'poids_moyen_voyage_t', 'voyages_economises'].map((k) => [k, nombre(m[k])])
      ),
      taux_appliques: Array.isArray(m.taux_appliques) ? (m.taux_appliques as unknown[]).map(Number) : null,
    }));
    // L'export (Excel, CSV) est le tableau des mois.
    if (req.query.format !== undefined) {
      res.json(mois);
      return;
    }
    res.json({ communeId, annee, provenance: 'declaree', mois });
  })
);

// --- La vue nationale ---------------------------------------------------------

periodeTransitoireRouter.get(
  '/national',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const { date } = situationQuery.parse(req.query);
    const jour = date ?? aujourdhui();
    const lignes = (await query<Record<string, unknown> & { gouvernorat: string }>('SELECT * FROM app.secteur_informel_national($1::date)', [jour]))
      .map((l) => ({ ...l, tonnes_detournees: nombre(l.tonnes_detournees) }))
      // L'ordre alphabétique de la langue, jamais un rang.
      .sort((a, b) => a.gouvernorat.localeCompare(b.gouvernorat, 'fr'));
    res.json({ jour, cadre_actif: await cadreActif(), gouvernorats: lignes });
  })
);

// --- L'accompagnement d'un acteur --------------------------------------------

async function accompagnement(a: { id: string; id_precollecteur: string; categorie: string | null }) {
  const jalonsPossibles = await query(
    `SELECT code, libelle_fr, libelle_ar FROM app.liste_nationale('jalons_accompagnement', app.jour_tunis())`
  );
  // Le libellé d'une étape est celui de la liste du jour où elle a été franchie.
  const jalons = await query(
    `SELECT j.id, j.jalon_code, l.libelle_fr, l.libelle_ar, j.date_jalon, j.reference, j.observation
       FROM jalons_acteurs j
       LEFT JOIN LATERAL app.liste_nationale('jalons_accompagnement', j.date_jalon) l ON l.code = j.jalon_code
      WHERE j.acteur_id = $1 AND j.deleted_at IS NULL
      ORDER BY j.date_jalon, j.created_at`,
    [a.id]
  );
  // L'échéance que la durée en vigueur à la délivrance donnerait : montrée à
  // côté de celle de la pièce, jamais à sa place.
  const agrements = await query(
    `SELECT g.id, g.organisme, g.reference, g.date_delivrance, g.date_echeance, g.observation,
            v.valeur_nombre::int AS duree_mois_en_vigueur,
            (g.date_delivrance + make_interval(months => v.valeur_nombre::int) - interval '1 day')::date::text AS echeance_selon_duree
       FROM agrements_intermediaires g
       LEFT JOIN LATERAL app.parametre_national('informel_duree_agrement_mois', g.date_delivrance) v ON true
      WHERE g.acteur_id = $1 AND g.deleted_at IS NULL
      ORDER BY g.date_delivrance, g.created_at`,
    [a.id]
  );
  return { acteur: a, jalons_possibles: jalonsPossibles, jalons, agrements };
}

periodeTransitoireRouter.get(
  '/acteurs/:id',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    res.json(await accompagnement(await acteur(req.params.id)));
  })
);

export const jalonActeurSchema = z
  .object({
    jalonCode: z.string().trim().min(1).max(60),
    dateJalon: dateIso.refine((d) => d <= aujourdhui(), pasDansLAvenir),
    reference: z.string().trim().max(200).nullable().optional(),
    observation: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

periodeTransitoireRouter.post(
  '/acteurs/:id/jalons',
  requireAuth,
  // L'accompagnement est l'acte du directeur de la commune ; la FNCT lit.
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const d = jalonActeurSchema.parse(req.body);
    const a = await acteur(req.params.id);
    if (!(await cadreActif())) throw new ApiError(409, CADRE_INACTIF);
    try {
      await query(
        `INSERT INTO jalons_acteurs (commune_id, acteur_id, jalon_code, date_jalon, reference, observation, saisi_par)
         VALUES ($1, $2, $3, $4, $5, $6, app.current_user_id())`,
        [a.commune_id, a.id, d.jalonCode, d.dateJalon, d.reference || null, d.observation || null]
      );
    } catch (err) {
      refus(err);
    }
    res.status(201).json(await accompagnement(a));
  })
);

periodeTransitoireRouter.delete(
  '/acteurs/:id/jalons/:jalonId',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const a = await acteur(req.params.id);
    const existe = estUuid(req.params.jalonId)
      ? await queryOne('SELECT id FROM jalons_acteurs WHERE id = $1 AND acteur_id = $2 AND deleted_at IS NULL', [req.params.jalonId, a.id])
      : null;
    if (!existe) throw new ApiError(404, 'Étape introuvable.');
    try {
      await query("SELECT app.supprimer('jalons_acteurs', $1)", [req.params.jalonId]);
    } catch (err) {
      refus(err);
    }
    res.json(await accompagnement(a));
  })
);

export const agrementSchema = z
  .object({
    organisme: z.string().trim().min(3).max(200),
    reference: z.string().trim().min(1).max(200),
    dateDelivrance: dateIso.refine((d) => d <= aujourdhui(), pasDansLAvenir),
    dateEcheance: dateIso,
    observation: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine((d) => d.dateEcheance > d.dateDelivrance, { message: 'L’échéance d’un agrément suit sa délivrance.', path: ['dateEcheance'] });

periodeTransitoireRouter.post(
  '/acteurs/:id/agrements',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const d = agrementSchema.parse(req.body);
    const a = await acteur(req.params.id);
    if (!(await cadreActif())) throw new ApiError(409, CADRE_INACTIF);
    try {
      await query(
        `INSERT INTO agrements_intermediaires (commune_id, acteur_id, organisme, reference, date_delivrance, date_echeance, observation, saisi_par)
         VALUES ($1, $2, $3, $4, $5, $6, $7, app.current_user_id())`,
        [a.commune_id, a.id, d.organisme, d.reference, d.dateDelivrance, d.dateEcheance, d.observation || null]
      );
    } catch (err) {
      refus(err);
    }
    res.status(201).json(await accompagnement(a));
  })
);

periodeTransitoireRouter.delete(
  '/acteurs/:id/agrements/:agrementId',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const a = await acteur(req.params.id);
    const existe = estUuid(req.params.agrementId)
      ? await queryOne('SELECT id FROM agrements_intermediaires WHERE id = $1 AND acteur_id = $2 AND deleted_at IS NULL', [
          req.params.agrementId, a.id,
        ])
      : null;
    if (!existe) throw new ApiError(404, 'Agrément introuvable.');
    try {
      await query("SELECT app.supprimer('agrements_intermediaires', $1)", [req.params.agrementId]);
    } catch (err) {
      refus(err);
    }
    res.json(await accompagnement(a));
  })
);
