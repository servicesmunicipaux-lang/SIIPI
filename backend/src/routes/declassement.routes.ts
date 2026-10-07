// Le dossier de déclassement (lot 16.4, migration 059) — référentiel du dépôt
// municipal, diapos 83 à 85.
//
//   /declassement/constat              par engin : âge, cumul des dépenses
//                                      et seuil de 80 % affiché, rapport de
//                                      rendement — calculés par la base
//   /declassement/immobilisations      les périodes où un engin n'a pas servi
//   /declassement/dossiers             la liste de proposition (diapo 85)
//   /declassement/dossiers/:id         le dossier : constat figé et du jour,
//                                      inventaire des dépenses, pièces,
//                                      circuit, pièces obligatoires manquantes
//   /declassement/dossiers/:id/etapes  le circuit d'autorisation, dans l'ordre
//                                      que la base impose
//   /declassement/dossiers/:id/pieces  les pièces jointes (POST /fichiers d'abord)
//
// La plateforme instruit, elle ne décide pas : le seuil de 80 % s'affiche
// « atteint / non atteint », il ne déclasse rien, et un engin adjugé ne passe
// pas « réformé » de lui-même. Proposer, inscrire une étape, joindre une pièce
// sont des actes de la commune : son admin. La FNCT lit.
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';

export const declassementRouter = Router();

const LECTEURS = ['admin_commune', 'super_admin_fnct'] as const;
const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');
// Le jour à Tunis (UTC+1, sans heure d'été).
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const anneeCourante = () => Number(aujourdhui().slice(0, 4));
const pasDansLAvenir = { message: "Cette date porte sur ce qui a eu lieu : elle ne peut pas être dans l'avenir." };
const estUuid = (s: string) => z.string().uuid().safeParse(s).success;

export const MOTIFS_DECLASSEMENT = [
  'depenses_80', 'pannes_repetees', 'reparation_excessive', 'service_degrade', 'mauvais_usage',
] as const;
export const ETAPES_DECLASSEMENT = [
  'accord_commune', 'avis_domaines', 'avis_controle_technique', 'publicite_legale', 'adjudication', 'sans_suite',
] as const;
export const NATURES_PIECE = [
  'facture_acquisition', 'inventaire_depenses', 'rapport_rendement', 'devis_reparation',
  'decision_commune', 'avis_domaines', 'avis_controle_technique', 'publicite', 'pv_adjudication', 'autre',
] as const;

function communeRequise(req: Parameters<typeof communeDemandee>[0]) {
  const c = communeDemandee(req);
  if (!c) throw new ApiError(400, 'Commune requise (paramètre communeId).');
  return c;
}

/** L'engin visible (RLS) — sa commune fait foi. 404 sinon, jamais 403. */
async function engin(id: string) {
  const v = await queryOne<{ id: string; commune_id: string }>(
    'SELECT id, commune_id FROM vehicules WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  if (!v) throw new ApiError(404, 'Engin introuvable.');
  return v;
}

/** Le dossier visible (RLS : la commune et la FNCT). 404 sinon. */
async function dossier(id: string) {
  const d = estUuid(id)
    ? await queryOne<{ id: string; commune_id: string; vehicule_id: string; statut: string; annee_rendement: number }>(
        'SELECT id, commune_id, vehicule_id, statut, annee_rendement FROM dossiers_declassement WHERE id = $1',
        [id]
      )
    : null;
  if (!d) throw new ApiError(404, 'Dossier introuvable.');
  return d;
}

// Les refus de la base (migration 059) portent un code suivi du message à
// montrer : on rend le message, avec le statut qui convient.
const REFUS_CODES: Record<string, number> = {
  IMMOBILISATION_AVENIR: 400,
  IMMOBILISATION_DATES: 400,
  IMMOBILISATION_CHEVAUCHEMENT: 409,
  DOSSIER_AVENIR: 400,
  DOSSIER_ENGIN_REFORME: 409,
  DOSSIER_DEJA_ADJUGE: 409,
  DOSSIER_FIGE: 409,
  DOSSIER_CLOS: 409,
  ETAPE_AVENIR: 400,
  ETAPE_DATE: 400,
  ETAPE_PREALABLE: 409,
  ETAPE_DEPENDANTE: 409,
  PIECE_FICHIER: 400,
  FICHIER_PIECE_DECLASSEMENT: 409,
};
const REFUS_CONTRAINTES: Record<string, [number, string]> = {
  immobilisations_fin_apres_debut: [400, 'La fin d’une immobilisation ne peut pas précéder son début.'],
  uq_dossier_declassement_ouvert: [409, 'Un dossier de déclassement est déjà en cours pour cet engin.'],
  dossiers_expose_renseigne: [400, 'Le rapport détaillé doit exposer la situation de l’engin (20 caractères au moins).'],
  uq_etape_declassement: [409, 'Cette étape est déjà inscrite au dossier. Retirez-la d’abord pour la corriger.'],
  etapes_sens_requis: [400, 'Un accord ou un avis porte son sens (favorable ou défavorable) ; les autres étapes n’en portent pas.'],
  etapes_mode_adjudication: [400, 'L’adjudication précise son mode (pli fermé ou enchère publique) ; les autres étapes n’en ont pas.'],
  etapes_montant_adjuge: [400, 'Le montant adjugé ne se porte que sur l’adjudication.'],
  etapes_motif_sans_suite: [400, 'Clore un dossier sans suite exige d’en dire le motif (observation).'],
  uq_piece_declassement: [409, 'Ce fichier est déjà joint à ce dossier.'],
};

function refus(err: unknown): never {
  const e = err as { code?: string; message?: string; constraint?: string };
  if (e.constraint && REFUS_CONTRAINTES[e.constraint]) {
    const [statut, message] = REFUS_CONTRAINTES[e.constraint];
    throw new ApiError(statut, message);
  }
  const code = e.message?.match(/^([A-Z_]+): /)?.[1];
  if (code && REFUS_CODES[code]) throw new ApiError(REFUS_CODES[code], e.message!.slice(code.length + 2));
  throw err;
}

// ===========================================================================
// 1. Le constat par engin
// ===========================================================================

const COLONNES_CONSTAT = `
  vehicule_id, registration, type_engin, categorie, marque, etat, date_premiere_circulation,
  age_annees::float, valeur_achat_tnd::float, cumul_depenses_tnd::float, interventions, interventions_sans_cout,
  part_depenses_pct::float, seuil_80, pannes_12_mois, annee, jours_immobilisation, debut_immobilisation_inconnu,
  jours_travailles, rapport_rendement::float`;

export const anneeSchema = z.coerce.number().int().min(2000).max(2100);

declassementRouter.get(
  '/constat',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const { annee } = z.object({ annee: anneeSchema.optional() }).parse(req.query);
    const a = annee ?? anneeCourante();
    res.json({
      communeId,
      annee: a,
      engins: await query(`SELECT ${COLONNES_CONSTAT} FROM app.constat_declassement($1, $2)`, [communeId, a]),
    });
  })
);

// ===========================================================================
// 2. Les immobilisations
// ===========================================================================

const SELECT_IMMOBILISATION = `
  SELECT i.id, i.vehicule_id, v.registration, i.debut, i.fin, i.motif, i.origine,
         (COALESCE(i.fin, (now() AT TIME ZONE 'Africa/Tunis')::date) - i.debut + 1) AS jours, i.created_at
    FROM immobilisations_engins i JOIN vehicules v ON v.id = i.vehicule_id`;

declassementRouter.get(
  '/immobilisations',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const q = z.object({ vehiculeId: z.string().optional() }).parse(req.query);
    res.json(
      await query(
        `${SELECT_IMMOBILISATION}
          WHERE i.commune_id = $1 AND i.deleted_at IS NULL AND ($2::text IS NULL OR i.vehicule_id = $2)
          ORDER BY i.debut DESC, v.registration`,
        [communeId, q.vehiculeId ?? null]
      )
    );
  })
);

export const immobilisationSchema = z
  .object({
    vehiculeId: z.string().min(1),
    debut: dateIso.refine((d) => d <= aujourdhui(), pasDansLAvenir),
    // Dernier jour d'immobilisation, compris. Absent : l'engin est toujours à l'arrêt.
    fin: dateIso.refine((d) => d <= aujourdhui(), pasDansLAvenir).nullable().optional(),
    motif: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

declassementRouter.post(
  '/immobilisations',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    const d = immobilisationSchema.parse(req.body);
    const v = await engin(d.vehiculeId);
    let id: string | undefined;
    try {
      id = (
        await queryOne<{ id: string }>(
          `INSERT INTO immobilisations_engins (commune_id, vehicule_id, debut, fin, motif, origine, saisi_par)
           VALUES ($1, $2, $3, $4, $5, 'saisie', app.current_user_id()) RETURNING id`,
          [v.commune_id, v.id, d.debut, d.fin ?? null, d.motif ?? null]
        )
      )?.id;
    } catch (err) {
      refus(err);
    }
    res.status(201).json(await queryOne(`${SELECT_IMMOBILISATION} WHERE i.id = $1`, [id]));
  })
);

export const finImmobilisationSchema = z
  .object({ fin: dateIso.refine((d) => d <= aujourdhui(), pasDansLAvenir) })
  .strict();

declassementRouter.patch(
  '/immobilisations/:id/fin',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    const { fin } = finImmobilisationSchema.parse(req.body);
    const existe = estUuid(req.params.id)
      ? await queryOne('SELECT id FROM immobilisations_engins WHERE id = $1 AND deleted_at IS NULL', [req.params.id])
      : null;
    if (!existe) throw new ApiError(404, 'Immobilisation introuvable.');
    try {
      await query('UPDATE immobilisations_engins SET fin = $2 WHERE id = $1', [req.params.id, fin]);
    } catch (err) {
      refus(err);
    }
    res.json(await queryOne(`${SELECT_IMMOBILISATION} WHERE i.id = $1`, [req.params.id]));
  })
);

declassementRouter.delete(
  '/immobilisations/:id',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    const existe = estUuid(req.params.id)
      ? await queryOne('SELECT id FROM immobilisations_engins WHERE id = $1 AND deleted_at IS NULL', [req.params.id])
      : null;
    if (!existe) throw new ApiError(404, 'Immobilisation introuvable.');
    await query("SELECT app.supprimer('immobilisations_engins', $1)", [req.params.id]);
    res.status(204).end();
  })
);

// ===========================================================================
// 3. Les dossiers
// ===========================================================================

// La liste de proposition au déclassement (diapo 85) : type, marque,
// matricule, âge en années décimales AU JOUR DE LA PROPOSITION, date, motifs.
declassementRouter.get(
  '/dossiers',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const q = z.object({ statut: z.enum(['en_cours', 'adjuge', 'sans_suite']).optional() }).parse(req.query);
    res.json(
      await query(
        `SELECT d.id, d.vehicule_id, v.registration, v.type AS type_engin, v.marque,
                (d.constat->>'age_annees')::float AS age_annees, d.date_proposition, d.motifs, d.statut,
                d.constat->>'seuil_80' AS seuil_80, (d.constat->>'part_depenses_pct')::float AS part_depenses_pct,
                e.etape AS derniere_etape, e.date_etape AS date_derniere_etape
           FROM dossiers_declassement d
           JOIN vehicules v ON v.id = d.vehicule_id
           LEFT JOIN LATERAL (
             SELECT etape, date_etape FROM etapes_declassement
              WHERE dossier_id = d.id AND deleted_at IS NULL
              ORDER BY date_etape DESC, created_at DESC LIMIT 1
           ) e ON true
          WHERE d.commune_id = $1 AND ($2::text IS NULL OR d.statut = $2)
          ORDER BY d.date_proposition DESC, v.registration`,
        [communeId, q.statut ?? null]
      )
    );
  })
);

type Etape = { etape: string; sens: string | null };
type Constat = { cumul_depenses_tnd: number | null; jours_immobilisation: number | null; jours_travailles: number | null };

/**
 * Ce qui peut s'inscrire ensuite. Miroir, pour l'écran, de la règle que la
 * base tient (app.controler_etape_declassement) : si les deux divergeaient,
 * c'est la base qui refuserait.
 */
function etapesPossibles(statut: string, etapes: Etape[]): string[] {
  if (statut !== 'en_cours') return [];
  const a = (e: string) => etapes.find((x) => x.etape === e);
  const possibles: string[] = [];
  if (!a('accord_commune')) possibles.push('accord_commune');
  if (a('accord_commune')?.sens === 'favorable') {
    if (!a('avis_domaines')) possibles.push('avis_domaines');
    if (!a('avis_controle_technique')) possibles.push('avis_controle_technique');
  }
  if (a('avis_domaines')?.sens === 'favorable' && a('avis_controle_technique')?.sens === 'favorable' && !a('publicite_legale')) {
    possibles.push('publicite_legale');
  }
  if (a('publicite_legale') && !a('adjudication')) possibles.push('adjudication');
  possibles.push('sans_suite');
  return possibles;
}

/**
 * Les quatre pièces obligatoires (diapo 83). L'inventaire des dépenses et le
 * rapport de rendement, SIIPI les calcule quand les registres sont tenus ; la
 * facture se joint ; le coût estimatif se renseigne ou se joint (devis).
 */
function completude(pieces: { nature: string }[], duJour: Constat | null, coutEstime: number | null) {
  const jointe = (n: string) => pieces.some((p) => p.nature === n);
  const statut = (n: string, autre: 'calculee' | 'renseignee' | null) => (jointe(n) ? 'jointe' : autre ?? 'manquante');
  return [
    { piece: 'facture_acquisition', statut: statut('facture_acquisition', null) },
    { piece: 'inventaire_depenses', statut: statut('inventaire_depenses', duJour?.cumul_depenses_tnd != null ? 'calculee' : null) },
    {
      piece: 'rapport_rendement',
      statut: statut(
        'rapport_rendement',
        duJour?.jours_immobilisation != null && duJour?.jours_travailles != null ? 'calculee' : null
      ),
    },
    { piece: 'devis_reparation', statut: statut('devis_reparation', coutEstime != null ? 'renseignee' : null) },
  ];
}

async function dossierComplet(id: string) {
  const d = await queryOne<{
    id: string; commune_id: string; vehicule_id: string; statut: string; annee_rendement: number;
    cout_reparation_estime_tnd: number | null;
  }>(
    `SELECT d.id, d.commune_id, d.vehicule_id, v.registration, v.type AS type_engin, v.marque, v.etat AS etat_engin,
            d.date_proposition, d.motifs, d.expose, d.cout_reparation_estime_tnd::float, d.annee_rendement,
            d.constat, d.statut, d.created_at
       FROM dossiers_declassement d JOIN vehicules v ON v.id = d.vehicule_id
      WHERE d.id = $1`,
    [id]
  );
  if (!d) throw new ApiError(404, 'Dossier introuvable.');
  const duJour = await queryOne<Constat>(
    `SELECT ${COLONNES_CONSTAT} FROM app.constat_declassement($1, $2, $3)`,
    [d.commune_id, d.annee_rendement, d.vehicule_id]
  );
  const etapes = await query<Etape>(
    `SELECT id, etape, date_etape, sens, reference, observation, mode_adjudication, montant_adjuge_tnd::float, created_at
       FROM etapes_declassement WHERE dossier_id = $1 AND deleted_at IS NULL
      ORDER BY date_etape, created_at`,
    [id]
  );
  const pieces = await query<{ nature: string }>(
    `SELECT p.id, p.nature, p.fichier_id, f.nom_original, f.type_mime, f.taille_octets,
            '/fichiers/' || f.id AS url, p.created_at
       FROM pieces_declassement p JOIN fichiers f ON f.id = p.fichier_id
      WHERE p.dossier_id = $1 AND p.deleted_at IS NULL
      ORDER BY p.created_at`,
    [id]
  );
  // L'inventaire des dépenses de l'engin depuis son acquisition : le carnet
  // d'entretien, tel quel. Une ligne sans coût reste visible : c'est elle qui
  // rend le seuil « indéterminé ».
  const depenses = await query(
    `SELECT id, date_intervention, type, nature, description, cout_tnd::float, prestataire
       FROM interventions_maintenance WHERE vehicule_id = $1 AND deleted_at IS NULL
      ORDER BY date_intervention, created_at`,
    [d.vehicule_id]
  );
  return {
    ...d,
    constat_du_jour: duJour ?? null,
    etapes,
    pieces,
    depenses,
    completude: completude(pieces, duJour ?? null, d.cout_reparation_estime_tnd),
    etapes_possibles: etapesPossibles(d.statut, etapes),
  };
}

export const dossierSchema = z
  .object({
    vehiculeId: z.string().min(1),
    motifs: z.array(z.enum(MOTIFS_DECLASSEMENT)).min(1).max(5)
      .refine((m) => new Set(m).size === m.length, { message: 'Un motif ne se cite qu’une fois.' }),
    expose: z.string().trim().min(20, 'Le rapport détaillé doit exposer la situation de l’engin (20 caractères au moins).').max(10_000),
    coutReparationEstimeTnd: z.number().min(0).max(100_000_000).nullable().optional(),
    dateProposition: dateIso.refine((d) => d <= aujourdhui(), pasDansLAvenir).optional(),
    anneeRendement: anneeSchema.optional(),
  })
  .strict();

declassementRouter.post(
  '/dossiers',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const d = dossierSchema.parse(req.body);
    const v = await engin(d.vehiculeId);
    let id: string | undefined;
    try {
      id = (
        await queryOne<{ id: string }>(
          `INSERT INTO dossiers_declassement
             (commune_id, vehicule_id, motifs, expose, cout_reparation_estime_tnd, date_proposition, annee_rendement)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, (now() AT TIME ZONE 'Africa/Tunis')::date), $7)
           RETURNING id`,
          [v.commune_id, v.id, d.motifs, d.expose, d.coutReparationEstimeTnd ?? null, d.dateProposition ?? null, d.anneeRendement ?? null]
        )
      )?.id;
    } catch (err) {
      refus(err);
    }
    res.status(201).json(await dossierComplet(id!));
  })
);

declassementRouter.get(
  '/dossiers/:id',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    await dossier(req.params.id);
    res.json(await dossierComplet(req.params.id));
  })
);

export const majDossierSchema = z
  .object({
    motifs: z.array(z.enum(MOTIFS_DECLASSEMENT)).min(1).max(5)
      .refine((m) => new Set(m).size === m.length, { message: 'Un motif ne se cite qu’une fois.' }),
    expose: z.string().trim().min(20).max(10_000),
    coutReparationEstimeTnd: z.number().min(0).max(100_000_000).nullable(),
  })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'Aucun champ à mettre à jour.' });

declassementRouter.patch(
  '/dossiers/:id',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const d = majDossierSchema.parse(req.body);
    await dossier(req.params.id);
    const clauses: string[] = [];
    const valeurs: unknown[] = [req.params.id];
    const poser = (colonne: string, valeur: unknown) => {
      valeurs.push(valeur);
      clauses.push(`${colonne} = $${valeurs.length}`);
    };
    if (d.motifs !== undefined) poser('motifs', d.motifs);
    if (d.expose !== undefined) poser('expose', d.expose);
    if (d.coutReparationEstimeTnd !== undefined) poser('cout_reparation_estime_tnd', d.coutReparationEstimeTnd);
    try {
      const ligne = await queryOne(`UPDATE dossiers_declassement SET ${clauses.join(', ')} WHERE id = $1 RETURNING id`, valeurs);
      // Visible mais pas modifiable : la FNCT ne passe pas requireRole ; un
      // admin d'une autre commune ne voit pas le dossier. Reste le cas d'un
      // rattachement échu entre les deux requêtes.
      if (!ligne) throw new ApiError(404, 'Dossier introuvable.');
    } catch (err) {
      if (err instanceof ApiError) throw err;
      refus(err);
    }
    res.json(await dossierComplet(req.params.id));
  })
);

// ===========================================================================
// 4. Le circuit d'autorisation
// ===========================================================================

export const etapeSchema = z
  .object({
    etape: z.enum(ETAPES_DECLASSEMENT),
    dateEtape: dateIso.refine((d) => d <= aujourdhui(), pasDansLAvenir),
    sens: z.enum(['favorable', 'defavorable']).nullable().optional(),
    reference: z.string().trim().max(200).nullable().optional(),
    observation: z.string().trim().max(2000).nullable().optional(),
    modeAdjudication: z.enum(['pli_ferme', 'enchere_publique']).nullable().optional(),
    montantAdjugeTnd: z.number().min(0).max(100_000_000).nullable().optional(),
  })
  .strict();

declassementRouter.post(
  '/dossiers/:id/etapes',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const e = etapeSchema.parse(req.body);
    const d = await dossier(req.params.id);
    try {
      await query(
        `INSERT INTO etapes_declassement
           (commune_id, dossier_id, etape, date_etape, sens, reference, observation, mode_adjudication, montant_adjuge_tnd)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [d.commune_id, d.id, e.etape, e.dateEtape, e.sens ?? null, e.reference ?? null, e.observation ?? null,
         e.modeAdjudication ?? null, e.montantAdjugeTnd ?? null]
      );
    } catch (err) {
      refus(err);
    }
    res.status(201).json(await dossierComplet(d.id));
  })
);

declassementRouter.delete(
  '/dossiers/:id/etapes/:etapeId',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const d = await dossier(req.params.id);
    const existe = estUuid(req.params.etapeId)
      ? await queryOne('SELECT id FROM etapes_declassement WHERE id = $1 AND dossier_id = $2 AND deleted_at IS NULL', [
          req.params.etapeId, d.id,
        ])
      : null;
    if (!existe) throw new ApiError(404, 'Étape introuvable.');
    try {
      await query("SELECT app.supprimer('etapes_declassement', $1)", [req.params.etapeId]);
    } catch (err) {
      refus(err);
    }
    res.json(await dossierComplet(d.id));
  })
);

// ===========================================================================
// 5. Les pièces jointes
// ===========================================================================

export const pieceSchema = z
  .object({
    // Le fichier déposé d'abord par POST /fichiers (usage « declassement »).
    fichierId: z.string().uuid(),
    nature: z.enum(NATURES_PIECE),
  })
  .strict();

declassementRouter.post(
  '/dossiers/:id/pieces',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const p = pieceSchema.parse(req.body);
    const d = await dossier(req.params.id);
    try {
      await query(
        'INSERT INTO pieces_declassement (commune_id, dossier_id, fichier_id, nature) VALUES ($1, $2, $3, $4)',
        [d.commune_id, d.id, p.fichierId, p.nature]
      );
    } catch (err) {
      refus(err);
    }
    res.status(201).json(await dossierComplet(d.id));
  })
);

declassementRouter.delete(
  '/dossiers/:id/pieces/:pieceId',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const d = await dossier(req.params.id);
    const existe = estUuid(req.params.pieceId)
      ? await queryOne('SELECT id FROM pieces_declassement WHERE id = $1 AND dossier_id = $2 AND deleted_at IS NULL', [
          req.params.pieceId, d.id,
        ])
      : null;
    if (!existe) throw new ApiError(404, 'Pièce introuvable.');
    try {
      await query("SELECT app.supprimer('pieces_declassement', $1)", [req.params.pieceId]);
    } catch (err) {
      refus(err);
    }
    res.json(await dossierComplet(d.id));
  })
);
