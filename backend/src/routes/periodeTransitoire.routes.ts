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
// Une date bien formée doit aussi exister : « 2026-02-30 » passerait le motif et
// ferait échouer PostgreSQL (500) au lieu d'un refus qui dit quoi corriger. L'an
// 0000, que JavaScript accepte et PostgreSQL refuse, est hors des bornes du métier.
const dateIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.')
  .refine((d) => {
    const t = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
  }, 'Cette date n’existe pas au calendrier : vérifiez le jour et le mois (AAAA-MM-JJ).')
  .refine((d) => d >= '2000-01-01' && d <= '2100-12-31', 'Date attendue entre le 01/01/2000 et le 31/12/2100.');
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
// Les trois contraintes d'agrément sont aussi contrôlées par zod, avec les mêmes
// messages : celles-ci ne servent que de filet si les deux venaient à diverger.
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
  // Un caractère de contrôle (l'octet nul) ferait échouer PostgreSQL (500) : un
  // tel identifiant ne désigne aucune commune.
  if (/[\u0000-\u001f]/.test(c)) throw new ApiError(404, 'Commune introuvable.');
  return c;
}

// La commune doit exister : can_read_commune est vrai pour la FNCT quelle que soit
// la chaîne, et une faute de frappe se serait lue « aucun acteur, 0 par état ». La
// politique de lecture de `communes` écarte aussi une commune retirée.
async function communeLisible(communeId: string) {
  const l = await queryOne('SELECT id FROM communes WHERE id = $1 AND app.can_read_commune(id)', [communeId]);
  if (!l) throw new ApiError(404, 'Commune introuvable.');
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

// Les schémas de requête sont exportés pour le contrat (document.ts) : il les
// reprend tels quels, il ne les recopie pas.
export const situationQuery = z.object({ date: dateIso.optional() }).passthrough();
// La vue nationale ne se lit pas dans l'avenir : ses tonnes s'arrêtent au dernier
// mois clos, et un mois clos l'est au jour où l'on lit.
export const nationalQuery = z.object({ date: dateIso.refine((d) => d <= aujourdhui(), pasDansLAvenir).optional() }).passthrough();

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

export const conversionQuery = z
  .object({
    annee: z.coerce
      .number({ invalid_type_error: 'Année attendue : un nombre de quatre chiffres (AAAA).' })
      .int('Année attendue : un nombre de quatre chiffres (AAAA).')
      .min(2000, 'Année attendue entre 2000 et 2100.')
      .max(2100, 'Année attendue entre 2000 et 2100.')
      .optional(),
  })
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
    // L'export (Excel, CSV) est le tableau des mois ; les taux appliqués y
    // deviennent un texte, une cellule ne portant pas de liste — à virgule
    // décimale, comme les nombres du même fichier.
    if (req.query.format !== undefined) {
      res.json(
        mois.map((m) => ({
          ...m,
          taux_appliques: m.taux_appliques?.map((t) => String(t).replace('.', ',')).join(' ; ') ?? null,
        }))
      );
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
    const { date } = nationalQuery.parse(req.query);
    const jour = date ?? aujourdhui();
    const lignes = (await query<Record<string, unknown> & { gouvernorat: string }>('SELECT * FROM app.secteur_informel_national($1::date)', [jour]))
      .map((l) => ({ ...l, tonnes_detournees: nombre(l.tonnes_detournees) }))
      // L'ordre alphabétique de la langue, jamais un rang.
      .sort((a, b) => a.gouvernorat.localeCompare(b.gouvernorat, 'fr'));
    res.json({ jour, cadre_actif: await cadreActif(), gouvernorats: lignes });
  })
);

// --- L'accompagnement d'un acteur --------------------------------------------

// Les étapes proposées sont celles de la liste en vigueur à la date de l'étape
// que la commune s'apprête à inscrire (aujourd'hui sans date) : c'est sur elle que
// la base jugera. Deux éléments du même code peuvent se chevaucher un jour, quand
// la FNCT ferme l'ancien après l'entrée en vigueur du nouveau : un seul par code,
// le plus récent.
async function accompagnement(a: { id: string; id_precollecteur: string; categorie: string | null }, date?: string) {
  const jalonsPossibles = await query(
    `SELECT code, libelle_fr, libelle_ar FROM (
       SELECT DISTINCT ON (code) code, libelle_fr, libelle_ar, ordre
         FROM app.liste_nationale('jalons_accompagnement', COALESCE($1::date, app.jour_tunis()))
        ORDER BY code, date_effet DESC) l
      ORDER BY ordre, code`,
    [date ?? null]
  );
  // Le libellé d'une étape est celui de la liste du jour où elle a été franchie.
  const jalons = await query(
    `SELECT j.id, j.jalon_code, l.libelle_fr, l.libelle_ar, j.date_jalon, j.reference, j.observation
       FROM jalons_acteurs j
       LEFT JOIN LATERAL (
         SELECT x.libelle_fr, x.libelle_ar FROM app.liste_nationale('jalons_accompagnement', j.date_jalon) x
          WHERE x.code = j.jalon_code ORDER BY x.date_effet DESC LIMIT 1
       ) l ON true
      WHERE j.acteur_id = $1 AND j.deleted_at IS NULL
      ORDER BY j.date_jalon, j.created_at`,
    [a.id]
  );
  // L'échéance que la durée en vigueur à la délivrance donnerait : montrée à
  // côté de celle de la pièce, jamais à sa place. L'écart se juge avec les bornes
  // de « À vérifier » (la veille du même quantième, ou ce jour-là) : l'écran et
  // l'avis ne doivent pas se contredire.
  const agrements = await query(
    `SELECT g.id, g.organisme, g.reference, g.date_delivrance, g.date_echeance, g.observation,
            v.valeur_nombre::int AS duree_mois_en_vigueur,
            (g.date_delivrance + make_interval(months => v.valeur_nombre::int) - interval '1 day')::date::text AS echeance_selon_duree,
            CASE WHEN v.valeur_nombre IS NOT NULL THEN
              g.date_echeance NOT BETWEEN (g.date_delivrance + make_interval(months => v.valeur_nombre::int) - interval '1 day')::date
                                      AND (g.date_delivrance + make_interval(months => v.valeur_nombre::int))::date
            END AS ecart_duree
       FROM agrements_intermediaires g
       LEFT JOIN LATERAL app.parametre_national('informel_duree_agrement_mois', g.date_delivrance) v ON true
      WHERE g.acteur_id = $1 AND g.deleted_at IS NULL
      ORDER BY g.date_delivrance, g.created_at`,
    [a.id]
  );
  return {
    acteur: { id: a.id, id_precollecteur: a.id_precollecteur, categorie: a.categorie },
    jalons_possibles: jalonsPossibles,
    jalons,
    agrements,
  };
}

periodeTransitoireRouter.get(
  '/acteurs/:id',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    const { date } = situationQuery.parse(req.query);
    res.json(await accompagnement(await acteur(req.params.id), date));
  })
);

export const jalonActeurSchema = z
  .object({
    jalonCode: z.string().trim().min(1, 'Choisissez l’étape franchie.').max(60, 'Code d’étape trop long (60 caractères au plus).'),
    dateJalon: dateIso.refine((d) => d <= aujourdhui(), pasDansLAvenir),
    reference: z.string().trim().max(200, 'La référence tient en 200 caractères au plus.').nullable().optional(),
    observation: z.string().trim().max(1000, 'L’observation tient en 1000 caractères au plus.').nullable().optional(),
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
    organisme: z
      .string()
      .trim()
      .min(3, 'Nommez l’organisme qui a délivré l’agrément (3 caractères au moins).')
      .max(200, 'Le nom de l’organisme tient en 200 caractères au plus.'),
    reference: z
      .string()
      .trim()
      .min(1, 'Indiquez la référence de l’agrément, telle qu’elle figure sur la pièce.')
      .max(200, 'La référence tient en 200 caractères au plus.'),
    dateDelivrance: dateIso.refine((d) => d <= aujourdhui(), pasDansLAvenir),
    dateEcheance: dateIso,
    observation: z.string().trim().max(1000, 'L’observation tient en 1000 caractères au plus.').nullable().optional(),
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
