// Les conventions de propreté (jalon G, lots G4a et G4b, migrations 103 et 104).
//
//   GET    /conventions?communeId=…              la liste (statut calculé, établissement, document, à renouveler)
//   GET    /conventions/{id}                     la convention, ses lignes d'origine, ses avenants, ses termes en vigueur, sa version
//   POST   /conventions?communeId=…              un brouillon (et ses lignes)
//   PUT    /conventions/{id}                     le brouillon remplacé en entier (version lue)
//   DELETE /conventions/{id}?version=…           un brouillon retiré
//   POST   /conventions/{id}/instruire           brouillon → instruite (version lue)
//   POST   /conventions/{id}/reprendre           instruite → brouillon
//   POST   /conventions/{id}/signer              instruite → signée : le document scellé CV-… est émis
//   POST   /conventions/{id}/resilier            signée → résiliée (date, motif, pièce)
//   POST   /conventions/{id}/renouveler          signée → un brouillon qui commence le lendemain de sa fin (G4b)
//   POST   /conventions/{id}/avenants            un avenant brouillon d'une convention signée (G4b)
//   GET    /conventions/avenants/{id}            un avenant, ses lignes, sa version
//   PUT    /conventions/avenants/{id}            le brouillon d'avenant remplacé en entier (version lue)
//   DELETE /conventions/avenants/{id}?version=…  un brouillon d'avenant retiré
//   POST   /conventions/avenants/{id}/instruire  brouillon → instruit ; /reprendre : instruit → brouillon
//   POST   /conventions/avenants/{id}/signer     instruit → signé : le document scellé AV-… est émis
//
// UN AVENANT NE CHANGE QUE LES DÉCHETS COUVERTS, dont il donne la liste complète à
// compter de sa date d'effet. Les termes en vigueur à une date sont ceux du dernier
// avenant signé qui a pris effet (app.termes_convention), sinon ceux d'origine.
//
// LES GESTES SONT CEUX DE LA BASE. Instruire, signer, résilier passent par les
// fonctions de la migration 103, qui vérifient tout sous verrou au moment même
// (grille approuvée, tarif de la catégorie, flux de la liste nationale et aucun
// dangereux, chevauchement, base légale du jour) ; la route ne fait que traduire
// leurs refus en mots. « Active », « à venir », « expirée » se calculent ici,
// d'après les dates : rien ne les écrit.
//
// AUCUN MONTANT : la convention porte le mode et le tarif de la grille ; le montant
// dû vient de l'assiette (lot G6).
//
// Le directeur de la commune écrit ; la FNCT lit, sans geste ; un prestataire ne
// voit rien.

import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeRequise } from '../perimetre.js';

export const conventionsRouter = Router();

export const STATUTS_CONVENTION = ['brouillon', 'instruite', 'signee', 'resiliee'] as const;
export const ETATS_CONVENTION = ['brouillon', 'instruite', 'a_venir', 'active', 'expiree', 'resiliee', 'registre'] as const;
export const TYPES_CONVENTION = ['collecte', 'nettoyage', 'tri', 'autre'] as const;
export const MODES_TARIFICATION = ['forfait_annuel', 'forfait_mensuel', 'reel_levee', 'reel_poids'] as const;

// L'an 0000 n'existe pas pour PostgreSQL (500) ; un 30 février non plus.
const dateIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.')
  .refine((j) => {
    const d = new Date(`${j}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === j;
  }, 'Cette date n’existe pas : vérifiez le jour et le mois.')
  .refine((j) => j >= '2000-01-01' && j <= '2100-12-31', 'Date hors de l’intervalle admis (2000 à 2100).');
const sansOctetNul = (t: string) => !t.includes('\u0000');
const OCTET_NUL = 'Un texte ne peut pas contenir de caractère nul (\\u0000).';
const texte = (min: number, max: number, libelle: string) =>
  z
    .string()
    .trim()
    .refine(sansOctetNul, OCTET_NUL)
    .refine((t) => [...t].length >= min && [...t].length <= max, `${libelle} : de ${min} à ${max} caractères.`);
// La version d'une convention lue : le xmin de sa ligne, que chaque écriture renouvelle.
const versionLue = z.string().regex(/^\d{1,20}$/, 'La version de la convention lue est attendue : rouvrez-la, puis recommencez.');

/**
 * La fin la plus tardive d'une convention annuelle : la veille du même jour, un an
 * après. Comme PostgreSQL (date + 1 an) : un 29 février donne le 28 février de
 * l'année suivante, puis la veille — sans quoi l'écran proposerait une fin que la
 * base refuse.
 */
function finMaximale(debut: string): string {
  // zod exécute le .refine même quand la date est déjà refusée par son format :
  // une date illisible ne doit pas lever ici (RangeError, donc 500), mais laisser
  // le refus du format répondre 400.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(debut)) return '9999-12-31';
  const [a, m, j] = debut.split('-').map(Number);
  const jours = new Date(Date.UTC(a + 1, m, 0)).getUTCDate();
  const d = new Date(Date.UTC(a + 1, m - 1, Math.min(j, jours)));
  if (Number.isNaN(d.getTime())) return '9999-12-31';
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const ligneConventionSchema = z
  .object({
    fluxCode: z.string().trim().regex(/^[a-z][a-z0-9_]{2,60}$/, 'Flux attendu (code de la liste nationale des déchets assimilés).'),
    conteneurId: z.string().trim().min(1).max(100).refine(sansOctetNul, OCTET_NUL).nullable().optional(),
    leveesParSemaine: z.number().int('Un nombre entier de levées par semaine.').min(1, 'Au moins une levée par semaine.').max(21, 'Au plus 21 levées par semaine.'),
    // La base garde le volume au dixième de litre : une valeur qui s'y arrondirait à zéro est refusée ici.
    volumeLitres: z
      .number()
      .max(100_000, 'Au plus 100 000 L par levée.')
      .refine((v) => Math.round(v * 10) / 10 > 0, 'Le volume par levée est positif (au dixième de litre).')
      .nullable()
      .optional(),
  })
  .strict();

export const conventionSchema = z
  .object({
    commerceId: z.string().uuid('Établissement : identifiant attendu.'),
    type: z.enum(TYPES_CONVENTION).default('collecte'),
    dateDebut: dateIso,
    dateFin: dateIso,
    observation: texte(0, 1000, 'Observation').nullable().optional(),
    lignes: z.array(ligneConventionSchema).max(20, 'Au plus 20 flux par convention.').default([]),
  })
  .strict()
  .refine((d) => d.dateFin >= d.dateDebut, { message: 'La fin précède le début.', path: ['dateFin'] })
  .refine((d) => d.dateFin <= finMaximale(d.dateDebut), {
    message: 'Une convention est annuelle : elle finit au plus tard la veille du même jour, un an après son début.',
    path: ['dateFin'],
  })
  .refine((d) => new Set(d.lignes.map((l) => l.fluxCode)).size === d.lignes.length, {
    message: 'Un flux ne figure qu’une fois dans une convention.',
    path: ['lignes'],
  });

export const modificationConventionSchema = z
  .object({
    version: versionLue,
    type: z.enum(TYPES_CONVENTION).default('collecte'),
    dateDebut: dateIso,
    dateFin: dateIso,
    observation: texte(0, 1000, 'Observation').nullable().optional(),
    lignes: z.array(ligneConventionSchema).max(20, 'Au plus 20 flux par convention.').default([]),
  })
  .strict()
  .refine((d) => d.dateFin >= d.dateDebut, { message: 'La fin précède le début.', path: ['dateFin'] })
  .refine((d) => d.dateFin <= finMaximale(d.dateDebut), {
    message: 'Une convention est annuelle : elle finit au plus tard la veille du même jour, un an après son début.',
    path: ['dateFin'],
  })
  .refine((d) => new Set(d.lignes.map((l) => l.fluxCode)).size === d.lignes.length, {
    message: 'Un flux ne figure qu’une fois dans une convention.',
    path: ['lignes'],
  });

export const versionConventionSchema = z.object({ version: versionLue }).strict();
export const signatureConventionSchema = z
  .object({ version: versionLue, dateSignature: dateIso, referenceSignature: texte(3, 200, 'Référence de la signature') })
  .strict();
export const resiliationConventionSchema = z
  .object({
    version: versionLue,
    dateResiliation: dateIso,
    motif: texte(5, 1000, 'Motif'),
    reference: texte(3, 200, 'Pièce de la résiliation'),
  })
  .strict();
export const STATUTS_AVENANT = ['brouillon', 'instruit', 'signe'] as const;

const lignesSaisies = z.array(ligneConventionSchema).max(20, 'Au plus 20 flux par avenant.').default([]);
const fluxUniques = (d: { lignes: { fluxCode: string }[] }) => new Set(d.lignes.map((l) => l.fluxCode)).size === d.lignes.length;
export const avenantSchema = z
  .object({
    dateEffet: dateIso,
    observation: texte(0, 1000, 'Observation').nullable().optional(),
    lignes: lignesSaisies,
  })
  .strict()
  .refine(fluxUniques, { message: 'Un flux ne figure qu’une fois dans un avenant.', path: ['lignes'] });
export const modificationAvenantSchema = z
  .object({
    version: z.string().regex(/^\d{1,20}$/, 'La version de l’avenant lue est attendue : rouvrez-le, puis recommencez.'),
    dateEffet: dateIso,
    observation: texte(0, 1000, 'Observation').nullable().optional(),
    lignes: lignesSaisies,
  })
  .strict()
  .refine(fluxUniques, { message: 'Un flux ne figure qu’une fois dans un avenant.', path: ['lignes'] });

export const qConventions = z.object({
  statut: z.enum(STATUTS_CONVENTION).optional(),
  commerceId: z.string().uuid().optional(),
});

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------
// L'état se calcule d'après les dates, à Tunis : une convention signée est « à
// venir » avant son début, « active » jusqu'à sa fin effective (la veille d'une
// résiliation), puis « expirée » — ou « résiliée » quand elle l'a été.
const SELECT_CONVENTIONS = `
  SELECT cv.id, cv.xmin::text AS version, cv.commune_id, cv.commerce_id, c.nom AS etablissement, c.statut AS statut_etablissement,
         c.categorie_activite, c.matricule_fiscal, cv.nature, cv.statut, cv.type, cv.exercice, cv.date_debut, cv.date_fin,
         CASE
           WHEN cv.nature = 'registre' THEN 'registre'
           WHEN cv.statut IN ('brouillon', 'instruite') THEN cv.statut
           -- Résiliée avant (ou le jour de) son début, elle ne couvrira jamais un jour :
           -- « résiliée » tout de suite, jamais « à venir ».
           WHEN cv.statut = 'resiliee' AND cv.date_resiliation <= cv.date_debut THEN 'resiliee'
           WHEN app.jour_tunis() < cv.date_debut THEN 'a_venir'
           WHEN app.jour_tunis() <= (CASE WHEN cv.date_resiliation IS NOT NULL THEN LEAST(cv.date_fin, cv.date_resiliation - 1) ELSE cv.date_fin END)
             THEN 'active'
           WHEN cv.statut = 'resiliee' THEN 'resiliee'
           ELSE 'expiree'
         END AS etat,
         cv.grille_id, g.intitule AS grille, g.reference_arrete, cv.mode_tarification, cv.tarif::float AS tarif,
         cv.date_signature, cv.reference_signature, cv.document_id, d.numero_affiche AS numero_document,
         cv.date_resiliation, cv.motif_resiliation, cv.reference_resiliation, cv.observation,
         cv.instruite_le, cv.signee_le, cv.resiliee_le, cv.created_at, cv.updated_at,
         cv.convention_precedente_id, dp.numero_affiche AS numero_precedente,
         -- La convention renouvelée a été résiliée depuis : constaté, jamais corrigé ici.
         CASE WHEN cv.convention_precedente_id IS NOT NULL THEN cp.statut = 'resiliee' END AS precedente_resiliee,
         rn.id AS renouvellement_id, rn.statut AS statut_renouvellement,
         -- À renouveler : signée, non résiliée, sans renouvellement, et qui finit dans
         -- moins de 60 jours. Un signal de la liste, jamais un avis ni une notification.
         (cv.statut = 'signee' AND rn.id IS NULL
          AND cv.date_fin BETWEEN app.jour_tunis() AND app.jour_tunis() + 59) AS a_renouveler,
         (SELECT count(*)::int FROM avenants_convention a
           WHERE a.convention_id = cv.id AND a.statut = 'signe' AND a.deleted_at IS NULL) AS avenants_signes
    FROM conventions_commerciales cv
    JOIN commerces c ON c.id = cv.commerce_id
    LEFT JOIN grilles_tarifaires g ON g.id = cv.grille_id
    LEFT JOIN documents_emis d ON d.id = cv.document_id
    LEFT JOIN conventions_commerciales cp ON cp.id = cv.convention_precedente_id
    LEFT JOIN documents_emis dp ON dp.id = cp.document_id
    LEFT JOIN LATERAL (
      SELECT r.id, r.statut FROM conventions_commerciales r
       WHERE r.convention_precedente_id = cv.id AND r.deleted_at IS NULL LIMIT 1) rn ON true`;

// Le libellé d'un flux : le dernier inscrit dans la liste nationale, même fermé
// depuis (une convention ancienne garde le nom de ce qu'elle couvrait).
const LIBELLE_FLUX = `
    LEFT JOIN LATERAL (
      SELECT e.libelle_fr, e.libelle_ar FROM elements_listes_nationales e
       WHERE e.liste = 'flux_assimiles' AND e.code = l.flux_code AND e.retire_le IS NULL
       ORDER BY e.date_effet DESC NULLS LAST LIMIT 1) f ON true`;
// Les lignes d'origine d'une convention ($1), ou celles d'un avenant ($1).
const LIGNES = (de: 'convention' | 'avenant') => `
  SELECT l.id, l.flux_code, f.libelle_fr AS flux_fr, f.libelle_ar AS flux_ar, l.conteneur_id, k.code AS conteneur,
         l.levees_par_semaine, l.volume_litres::float AS volume_litres, l.ordre
    FROM lignes_convention l
    LEFT JOIN conteneurs k ON k.id = l.conteneur_id
    ${LIBELLE_FLUX}
   WHERE ${de === 'convention' ? 'l.convention_id = $1 AND l.avenant_id IS NULL' : 'l.avenant_id = $1'} AND l.deleted_at IS NULL
   ORDER BY l.ordre, l.flux_code`;
// Les termes en vigueur aujourd'hui (à Tunis) : ceux du dernier avenant signé qui a
// pris effet, sinon ceux d'origine — une seule définition, celle de la base.
const TERMES = `
  SELECT l.flux_code, f.libelle_fr AS flux_fr, f.libelle_ar AS flux_ar, l.conteneur_id, k.code AS conteneur,
         l.levees_par_semaine, l.volume_litres::float AS volume_litres, l.ordre, l.avenant_id
    FROM app.termes_convention($1, app.jour_tunis()) l
    LEFT JOIN conteneurs k ON k.id = l.conteneur_id
    ${LIBELLE_FLUX}
   ORDER BY l.ordre, l.flux_code`;
const SELECT_AVENANTS = `
  SELECT a.id, a.xmin::text AS version, a.convention_id, a.commune_id, a.numero, a.statut, a.date_effet, a.observation,
         a.instruit_le, a.date_signature, a.reference_signature, a.document_id, d.numero_affiche AS numero_document,
         a.signe_le, a.created_at, a.updated_at
    FROM avenants_convention a
    LEFT JOIN documents_emis d ON d.id = a.document_id`;

const estUuid = (s: string) => z.string().uuid().safeParse(s).success;

async function lireAvenant(id: string) {
  if (!estUuid(id)) throw new ApiError(404, 'Avenant introuvable.');
  const a = await queryOne<Record<string, unknown> & { id: string }>(`${SELECT_AVENANTS} WHERE a.id = $1 AND a.deleted_at IS NULL`, [id]);
  if (!a) throw new ApiError(404, 'Avenant introuvable.');
  return { ...a, lignes: await query(LIGNES('avenant'), [id]) };
}

async function lireConvention(id: string) {
  if (!estUuid(id)) throw new ApiError(404, 'Convention introuvable.');
  const cv = await queryOne<Record<string, unknown> & { id: string; commune_id: string; version: string }>(
    `${SELECT_CONVENTIONS} WHERE cv.id = $1 AND cv.deleted_at IS NULL`,
    [id]
  );
  if (!cv) throw new ApiError(404, 'Convention introuvable.');
  const avenants = await query<Record<string, unknown> & { id: string }>(
    `${SELECT_AVENANTS} WHERE a.convention_id = $1 AND a.deleted_at IS NULL ORDER BY a.numero NULLS LAST, a.date_effet, a.created_at`,
    [id]
  );
  return {
    ...cv,
    lignes: await query(LIGNES('convention'), [id]),
    termes_en_vigueur: await query(TERMES, [id]),
    avenants: await Promise.all(avenants.map(async (a) => ({ ...a, lignes: await query(LIGNES('avenant'), [a.id]) }))),
  };
}

// ---------------------------------------------------------------------------
// Les refus de la base, en mots
// ---------------------------------------------------------------------------
const REFUS: Record<string, number> = {
  REGISTRE_FERME: 409,
  CONVENTION_NAISSANCE: 400,
  CONVENTION_HORS_PERIMETRE: 404,
  ETABLISSEMENT_FERME: 409,
  CATEGORIE_REQUISE: 409,
  CONVENTION_FIGEE: 409,
  CONVENTION_TRANSITION: 409,
  CONVENTION_VERSION: 409,
  FLUX_INCONNU: 400,
  FLUX_DANGEREUX: 400,
  CONTENEUR_AUTRE_COMMUNE: 400,
  CONVENTION_AUTRE: 400,
  LIGNE_FIGEE: 409,
  GRILLE_ABSENTE: 409,
  TARIF_ABSENT: 409,
  LIGNES_ABSENTES: 409,
  CHEVAUCHEMENT: 409,
  GRILLE_CHANGEE: 409,
  BASE_LEGALE_ABSENTE: 409,
  SIGNATURE_DATE: 400,
  SIGNATURE_PIECE: 400,
  RESILIATION_DATE: 400,
  RESILIATION_MOTIF: 400,
  DOCUMENT_INCOMPLET: 409,
  RENOUVELLEMENT_PRECEDENTE: 409,
  RENOUVELLEMENT_DATES: 400,
  RENOUVELLEMENT_EXISTANT: 409,
  AVENANT_NAISSANCE: 400,
  AVENANT_CONVENTION: 409,
  AVENANT_DATE: 400,
  AVENANT_ORDRE: 409,
  AVENANT_FIGE: 409,
  AVENANT_TRANSITION: 409,
  AVENANT_VERSION: 409,
  AVENANT_RENOUVELLEMENT: 409,
  CONTENEUR_RETIRE: 409,
};
const CONTRAINTES: Record<string, string> = {
  conventions_annuelle: 'Une convention est annuelle : elle finit au plus tard la veille du même jour, un an après son début.',
  uq_ligne_convention_flux: 'Un flux ne figure qu’une fois dans une convention.',
  uq_ligne_avenant_flux: 'Un flux ne figure qu’une fois dans un avenant.',
  lignes_convention_levees: 'De 1 à 21 levées par semaine.',
  lignes_convention_volume: 'Le volume par levée est positif (au plus 100 000 L).',
};

function refus(err: unknown): never {
  if (err instanceof ApiError) throw err;
  const e = err as { message?: string; constraint?: string; code?: string };
  // Hors du périmètre du directeur, une convention, un établissement ou une commune
  // sont introuvables : un refus renseignerait sur leur existence.
  if (e.code === '42501' || e.code === 'P0002' || e.message === 'CONVENTION_INTROUVABLE' || e.message === 'AVENANT_INTROUVABLE') {
    throw new ApiError(404, 'Convention, avenant, établissement ou commune introuvable.');
  }
  // Deux renouvellements demandés en même temps : le second trouve le premier.
  if (e.constraint === 'uq_conventions_renouvellement') {
    throw new ApiError(409, 'Cette convention a déjà son renouvellement ; ouvrez-le.');
  }
  if (e.code === '23503' && e.constraint?.includes('conteneur')) throw new ApiError(400, 'Ce conteneur n’existe pas.');
  if (e.constraint && CONTRAINTES[e.constraint]) throw new ApiError(400, CONTRAINTES[e.constraint]);
  const code = e.message?.match(/^([A-Z_]+): /)?.[1];
  if (code && REFUS[code]) {
    const t = (e.message as string).slice(code.length + 2);
    throw new ApiError(REFUS[code], t.charAt(0).toUpperCase() + t.slice(1));
  }
  throw err;
}

const ACTE_DE_LA_COMMUNE =
  'La commune passe ses conventions : son directeur les rédige, les instruit, les signe, les modifie par avenant, les renouvelle et les résilie ; la FNCT les lit.';
const fnctLitSeulement = (req: Request, _res: Response, next: NextFunction) =>
  next(req.user?.role === 'super_admin_fnct' ? new ApiError(403, ACTE_DE_LA_COMMUNE) : undefined);
const directeurSeul = [requireAuth, fnctLitSeulement, requireRole('admin_commune')];
const lecteurs = [requireAuth, requireRole('admin_commune', 'super_admin_fnct')];

type Ligne = z.infer<typeof ligneConventionSchema>;
async function ecrireLignes(
  client: { query: (t: string, p: unknown[]) => Promise<unknown> },
  conventionId: string,
  communeId: string,
  lignes: Ligne[],
  avenantId: string | null = null
) {
  for (const [i, l] of lignes.entries()) {
    await client.query(
      `INSERT INTO lignes_convention (convention_id, commune_id, avenant_id, flux_code, conteneur_id, levees_par_semaine, volume_litres, ordre)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [conventionId, communeId, avenantId, l.fluxCode, l.conteneurId ?? null, l.leveesParSemaine, l.volumeLitres ?? null, i]
    );
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
conventionsRouter.get(
  '/',
  ...lecteurs,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const f = qConventions.parse({ statut: req.query.statut, commerceId: req.query.commerceId });
    res.json(
      await query(
        `${SELECT_CONVENTIONS}
          WHERE cv.commune_id = $1 AND cv.deleted_at IS NULL
            AND ($2::text IS NULL OR cv.statut = $2) AND ($3::uuid IS NULL OR cv.commerce_id = $3)
          ORDER BY cv.date_debut DESC, c.nom`,
        [communeId, f.statut ?? null, f.commerceId ?? null]
      )
    );
  })
);

// ---------------------------------------------------------------------------
// Les avenants (G4b) — les chemins littéraux d'abord
// ---------------------------------------------------------------------------
conventionsRouter.get(
  '/avenants/:id',
  ...lecteurs,
  asyncHandler(async (req, res) => {
    res.json(await lireAvenant(req.params.id));
  })
);

conventionsRouter.put(
  '/avenants/:id',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!estUuid(id)) throw new ApiError(404, 'Avenant introuvable.');
    const d = modificationAvenantSchema.parse(req.body);
    try {
      await withTransaction(async (client) => {
        // La convention d'abord, puis l'avenant : l'ordre des verrous de la base.
        const a = await client.query<{ convention_id: string }>(
          'SELECT convention_id FROM avenants_convention WHERE id = $1 AND deleted_at IS NULL',
          [id]
        );
        if (a.rowCount === 0) throw new ApiError(404, 'Avenant introuvable.');
        await client.query('SELECT 1 FROM conventions_commerciales WHERE id = $1 FOR UPDATE', [a.rows[0].convention_id]);
        const r = await client.query<{ commune_id: string; convention_id: string }>(
          `UPDATE avenants_convention SET date_effet = $2, observation = $3
            WHERE id = $1 AND deleted_at IS NULL AND statut = 'brouillon' AND xmin::text = $4
            RETURNING commune_id, convention_id`,
          [id, d.dateEffet, d.observation || null, d.version]
        );
        if (r.rowCount === 0) {
          const etat = await client.query<{ statut: string }>('SELECT statut FROM avenants_convention WHERE id = $1 AND deleted_at IS NULL', [id]);
          if (etat.rowCount === 0) throw new ApiError(404, 'Avenant introuvable.');
          if (etat.rows[0].statut !== 'brouillon') {
            throw new ApiError(409, etat.rows[0].statut === 'instruit'
              ? 'Un avenant instruit se reprend en brouillon avant d’être modifié.'
              : 'Un avenant signé ne se modifie plus ; un nouvel avenant le corrige.');
          }
          throw new ApiError(409, 'L’avenant a changé depuis que vous l’avez ouvert ; relisez-le, puis recommencez.');
        }
        await client.query('SELECT app.retirer_lignes_avenant($1)', [id]);
        await ecrireLignes(client, r.rows[0].convention_id, r.rows[0].commune_id, d.lignes, id);
      });
    } catch (err) {
      refus(err);
    }
    res.json(await lireAvenant(id));
  })
);

conventionsRouter.delete(
  '/avenants/:id',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!estUuid(id)) throw new ApiError(404, 'Avenant introuvable.');
    const { version } = versionConventionSchema.parse({ version: req.query.version });
    try {
      await withTransaction(async (client) => {
        const a = await client.query<{ convention_id: string }>(
          'SELECT convention_id FROM avenants_convention WHERE id = $1 AND deleted_at IS NULL',
          [id]
        );
        if (a.rowCount === 0) throw new ApiError(404, 'Avenant introuvable.');
        await client.query('SELECT 1 FROM conventions_commerciales WHERE id = $1 FOR UPDATE', [a.rows[0].convention_id]);
        const r = await client.query<{ version: string; statut: string }>(
          'SELECT xmin::text AS version, statut FROM avenants_convention WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
          [id]
        );
        if (r.rowCount === 0) throw new ApiError(404, 'Avenant introuvable.');
        if (r.rows[0].statut !== 'brouillon') {
          throw new ApiError(409, 'Seul un avenant brouillon se retire ; un avenant signé se corrige par un nouvel avenant.');
        }
        if (r.rows[0].version !== version) {
          throw new ApiError(409, 'L’avenant a changé depuis que vous l’avez ouvert ; relisez-le, puis recommencez.');
        }
        await client.query("SELECT app.supprimer('avenants_convention', $1)", [id]);
      });
    } catch (err) {
      refus(err);
    }
    res.status(204).end();
  })
);

for (const [geste, fonction] of [
  ['instruire', 'app.instruire_avenant($1, $2)'],
  ['reprendre', 'app.reprendre_avenant($1, $2)'],
] as const) {
  conventionsRouter.post(
    `/avenants/:id/${geste}`,
    ...directeurSeul,
    asyncHandler(async (req, res) => {
      const id = req.params.id;
      if (!estUuid(id)) throw new ApiError(404, 'Avenant introuvable.');
      const d = versionConventionSchema.parse(req.body);
      try {
        await query(`SELECT ${fonction}`, [id, d.version]);
      } catch (err) {
        refus(err);
      }
      res.json(await lireAvenant(id));
    })
  );
}

conventionsRouter.post(
  '/avenants/:id/signer',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!estUuid(id)) throw new ApiError(404, 'Avenant introuvable.');
    const d = signatureConventionSchema.parse(req.body);
    try {
      await query('SELECT app.signer_avenant($1, $2, $3, $4)', [id, d.version, d.dateSignature, d.referenceSignature]);
    } catch (err) {
      refus(err);
    }
    res.json(await lireAvenant(id));
  })
);

// ---------------------------------------------------------------------------
// La convention
// ---------------------------------------------------------------------------
conventionsRouter.get(
  '/:id',
  ...lecteurs,
  asyncHandler(async (req, res) => {
    res.json(await lireConvention(req.params.id));
  })
);

conventionsRouter.post(
  '/',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const d = conventionSchema.parse(req.body);
    let id = '';
    try {
      id = await withTransaction(async (client) => {
        const r = await client.query<{ id: string }>(
          `INSERT INTO conventions_commerciales
             (commune_id, commerce_id, nature, statut, type, exercice, date_debut, date_fin, observation, saisi_par)
           VALUES ($1, $2, 'convention', 'brouillon', $3, extract(year FROM $4::date), $4, $5, $6, app.current_user_id())
           RETURNING id`,
          [communeId, d.commerceId, d.type, d.dateDebut, d.dateFin, d.observation || null]
        );
        await ecrireLignes(client, r.rows[0].id, communeId, d.lignes);
        return r.rows[0].id;
      });
    } catch (err) {
      refus(err);
    }
    res.status(201).json(await lireConvention(id));
  })
);

conventionsRouter.put(
  '/:id',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!estUuid(id)) throw new ApiError(404, 'Convention introuvable.');
    const d = modificationConventionSchema.parse(req.body);
    try {
      await withTransaction(async (client) => {
        // La version lue est comparée dans la mise à jour même : une écriture
        // concurrente validée entre-temps a renouvelé le xmin, et la ligne ne
        // répond plus.
        const r = await client.query<{ commune_id: string }>(
          `UPDATE conventions_commerciales
              SET type = $2, date_debut = $3, date_fin = $4, exercice = extract(year FROM $3::date), observation = $5
            WHERE id = $1 AND deleted_at IS NULL AND nature = 'convention' AND statut = 'brouillon' AND xmin::text = $6
            RETURNING commune_id`,
          [id, d.type, d.dateDebut, d.dateFin, d.observation || null, d.version]
        );
        if (r.rowCount === 0) {
          const etat = await client.query<{ statut: string | null; nature: string }>(
            'SELECT statut, nature FROM conventions_commerciales WHERE id = $1 AND deleted_at IS NULL',
            [id]
          );
          if (etat.rowCount === 0) throw new ApiError(404, 'Convention introuvable.');
          if (etat.rows[0].nature === 'registre') throw new ApiError(409, 'Le registre simple d’avant le jalon G se lit, il ne se modifie plus.');
          if (etat.rows[0].statut !== 'brouillon') {
            throw new ApiError(409, `Une convention ${etat.rows[0].statut === 'instruite' ? 'instruite se reprend en brouillon avant d’être modifiée' : 'signée ne se modifie plus ; elle se résilie'}.`);
          }
          throw new ApiError(409, 'La convention a changé depuis que vous l’avez ouverte ; relisez-la, puis recommencez.');
        }
        await client.query('SELECT app.retirer_lignes_convention($1)', [id]);
        await ecrireLignes(client, id, r.rows[0].commune_id, d.lignes);
      });
    } catch (err) {
      refus(err);
    }
    res.json(await lireConvention(id));
  })
);

conventionsRouter.delete(
  '/:id',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!estUuid(id)) throw new ApiError(404, 'Convention introuvable.');
    const { version } = versionConventionSchema.parse({ version: req.query.version });
    try {
      await withTransaction(async (client) => {
        const r = await client.query<{ version: string; statut: string | null }>(
          `SELECT xmin::text AS version, statut FROM conventions_commerciales
            WHERE id = $1 AND deleted_at IS NULL AND nature = 'convention' FOR UPDATE`,
          [id]
        );
        if (r.rowCount === 0) throw new ApiError(404, 'Convention introuvable.');
        if (r.rows[0].statut !== 'brouillon') {
          throw new ApiError(409, 'Seule une convention brouillon se retire ; une convention signée se résilie.');
        }
        if (r.rows[0].version !== version) {
          throw new ApiError(409, 'La convention a changé depuis que vous l’avez ouverte ; relisez-la, puis recommencez.');
        }
        await client.query("SELECT app.supprimer('conventions_commerciales', $1)", [id]);
      });
    } catch (err) {
      refus(err);
    }
    res.status(204).end();
  })
);

for (const [geste, fonction] of [
  ['instruire', 'app.instruire_convention($1, $2)'],
  ['reprendre', 'app.reprendre_convention($1, $2)'],
] as const) {
  conventionsRouter.post(
    `/:id/${geste}`,
    ...directeurSeul,
    asyncHandler(async (req, res) => {
      const id = req.params.id;
      if (!estUuid(id)) throw new ApiError(404, 'Convention introuvable.');
      const d = versionConventionSchema.parse(req.body);
      try {
        await query(`SELECT ${fonction}`, [id, d.version]);
      } catch (err) {
        refus(err);
      }
      res.json(await lireConvention(id));
    })
  );
}

conventionsRouter.post(
  '/:id/signer',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!estUuid(id)) throw new ApiError(404, 'Convention introuvable.');
    const d = signatureConventionSchema.parse(req.body);
    try {
      await query('SELECT app.signer_convention($1, $2, $3, $4)', [id, d.version, d.dateSignature, d.referenceSignature]);
    } catch (err) {
      refus(err);
    }
    res.json(await lireConvention(id));
  })
);

conventionsRouter.post(
  '/:id/resilier',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!estUuid(id)) throw new ApiError(404, 'Convention introuvable.');
    const d = resiliationConventionSchema.parse(req.body);
    try {
      await query('SELECT app.resilier_convention($1, $2, $3, $4, $5)', [id, d.version, d.dateResiliation, d.motif, d.reference]);
    } catch (err) {
      refus(err);
    }
    res.json(await lireConvention(id));
  })
);

// Le renouvellement (G4b) : un brouillon, qui reprend les termes en vigueur à la fin
// de la convention. Un flux qui n'est plus en vigueur, ou devenu dangereux, n'est pas
// repris ; un conteneur retiré ne suit pas sa ligne : la réponse nomme l'un et l'autre
// (« non_reprises », avec leur motif), rien n'est remplacé en silence.
conventionsRouter.post(
  '/:id/renouveler',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!estUuid(id)) throw new ApiError(404, 'Convention introuvable.');
    const d = versionConventionSchema.parse(req.body);
    let nouvelle = '';
    try {
      const r = await queryOne<{ id: string }>('SELECT (app.renouveler_convention($1, $2)).id', [id, d.version]);
      nouvelle = r?.id ?? '';
    } catch (err) {
      refus(err);
    }
    if (!nouvelle) throw new ApiError(404, 'Convention introuvable.');
    const nonReprises = await query(
      `SELECT l.flux_code, f.libelle_fr AS flux_fr, f.libelle_ar AS flux_ar,
              CASE WHEN n.id IS NULL THEN 'flux' ELSE 'conteneur' END AS motif
         FROM conventions_commerciales p
         CROSS JOIN LATERAL app.termes_convention(p.id, p.date_fin) l
         ${LIBELLE_FLUX}
         LEFT JOIN lignes_convention n
           ON n.convention_id = $2 AND n.avenant_id IS NULL AND n.deleted_at IS NULL AND n.flux_code = l.flux_code
        WHERE p.id = $1
          AND (n.id IS NULL OR (l.conteneur_id IS NOT NULL AND n.conteneur_id IS NULL))
        ORDER BY l.ordre, l.flux_code`,
      [id, nouvelle]
    );
    res.status(201).json({ ...(await lireConvention(nouvelle)), non_reprises: nonReprises });
  })
);

conventionsRouter.post(
  '/:id/avenants',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!estUuid(id)) throw new ApiError(404, 'Convention introuvable.');
    const d = avenantSchema.parse(req.body);
    let avenant = '';
    try {
      avenant = await withTransaction(async (client) => {
        // La convention lue dans le périmètre du directeur (sinon introuvable),
        // verrouillée : l'ordre des verrous de la base, la convention d'abord.
        const cv = await client.query<{ commune_id: string }>(
          `SELECT commune_id FROM conventions_commerciales WHERE id = $1 AND deleted_at IS NULL AND nature = 'convention' FOR UPDATE`,
          [id]
        );
        if (cv.rowCount === 0) throw new ApiError(404, 'Convention introuvable.');
        const r = await client.query<{ id: string }>(
          `INSERT INTO avenants_convention (convention_id, commune_id, statut, date_effet, observation, saisi_par)
           VALUES ($1, $2, 'brouillon', $3, $4, app.current_user_id()) RETURNING id`,
          [id, cv.rows[0].commune_id, d.dateEffet, d.observation || null]
        );
        await ecrireLignes(client, id, cv.rows[0].commune_id, d.lignes, r.rows[0].id);
        return r.rows[0].id;
      });
    } catch (err) {
      refus(err);
    }
    res.status(201).json(await lireAvenant(avenant));
  })
);
