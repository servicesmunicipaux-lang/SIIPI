// Les conventions de propreté (jalon G, lot G4a, migration 103).
//
//   GET    /conventions?communeId=…              la liste (statut calculé, établissement, document)
//   GET    /conventions/{id}                     la convention, ses lignes, sa version
//   POST   /conventions?communeId=…              un brouillon (et ses lignes)
//   PUT    /conventions/{id}                     le brouillon remplacé en entier (version lue)
//   DELETE /conventions/{id}?version=…           un brouillon retiré
//   POST   /conventions/{id}/instruire           brouillon → instruite (version lue)
//   POST   /conventions/{id}/reprendre           instruite → brouillon
//   POST   /conventions/{id}/signer              instruite → signée : le document scellé CV-… est émis
//   POST   /conventions/{id}/resilier            signée → résiliée (date, motif, pièce)
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

/** Le lendemain d'un an après le début, moins un jour : une convention est annuelle. */
function finMaximale(debut: string): string {
  const d = new Date(`${debut}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
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
           WHEN app.jour_tunis() < cv.date_debut THEN 'a_venir'
           WHEN app.jour_tunis() <= (CASE WHEN cv.date_resiliation IS NOT NULL THEN LEAST(cv.date_fin, cv.date_resiliation - 1) ELSE cv.date_fin END)
             THEN 'active'
           WHEN cv.statut = 'resiliee' THEN 'resiliee'
           ELSE 'expiree'
         END AS etat,
         cv.grille_id, g.intitule AS grille, g.reference_arrete, cv.mode_tarification, cv.tarif::float AS tarif,
         cv.date_signature, cv.reference_signature, cv.document_id, d.numero_affiche AS numero_document,
         cv.date_resiliation, cv.motif_resiliation, cv.reference_resiliation, cv.observation,
         cv.instruite_le, cv.signee_le, cv.resiliee_le, cv.created_at, cv.updated_at
    FROM conventions_commerciales cv
    JOIN commerces c ON c.id = cv.commerce_id
    LEFT JOIN grilles_tarifaires g ON g.id = cv.grille_id
    LEFT JOIN documents_emis d ON d.id = cv.document_id`;

const LIGNES = `
  SELECT lc.id, lc.flux_code, f.libelle_fr AS flux_fr, f.libelle_ar AS flux_ar, lc.conteneur_id, k.code AS conteneur,
         lc.levees_par_semaine, lc.volume_litres::float AS volume_litres, lc.ordre
    FROM lignes_convention lc
    LEFT JOIN conteneurs k ON k.id = lc.conteneur_id
    LEFT JOIN LATERAL (
      SELECT e.libelle_fr, e.libelle_ar FROM elements_listes_nationales e
       WHERE e.liste = 'flux_assimiles' AND e.code = lc.flux_code AND e.retire_le IS NULL
       ORDER BY e.date_effet DESC NULLS LAST LIMIT 1) f ON true
   WHERE lc.convention_id = $1 AND lc.deleted_at IS NULL
   ORDER BY lc.ordre, lc.flux_code`;

const estUuid = (s: string) => z.string().uuid().safeParse(s).success;

async function lireConvention(id: string) {
  if (!estUuid(id)) throw new ApiError(404, 'Convention introuvable.');
  const cv = await queryOne<Record<string, unknown> & { id: string; commune_id: string; version: string }>(
    `${SELECT_CONVENTIONS} WHERE cv.id = $1 AND cv.deleted_at IS NULL`,
    [id]
  );
  if (!cv) throw new ApiError(404, 'Convention introuvable.');
  return { ...cv, lignes: await query(LIGNES, [id]) };
}

// ---------------------------------------------------------------------------
// Les refus de la base, en mots
// ---------------------------------------------------------------------------
const REFUS: Record<string, number> = {
  REGISTRE_FERME: 409,
  CONVENTION_NAISSANCE: 400,
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
};
const CONTRAINTES: Record<string, string> = {
  conventions_annuelle: 'Une convention est annuelle : elle finit au plus tard la veille du même jour, un an après son début.',
  uq_ligne_convention_flux: 'Un flux ne figure qu’une fois dans une convention.',
  lignes_convention_levees: 'De 1 à 21 levées par semaine.',
  lignes_convention_volume: 'Le volume par levée est positif (au plus 100 000 L).',
};

function refus(err: unknown): never {
  if (err instanceof ApiError) throw err;
  const e = err as { message?: string; constraint?: string; code?: string };
  // Hors du périmètre du directeur, une convention, un établissement ou une commune
  // sont introuvables : un refus renseignerait sur leur existence.
  if (e.code === '42501' || e.code === 'P0002' || e.message === 'CONVENTION_INTROUVABLE') {
    throw new ApiError(404, 'Convention, établissement ou commune introuvable.');
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

const ACTE_DE_LA_COMMUNE = 'La commune passe ses conventions : son directeur les rédige, les instruit, les signe et les résilie ; la FNCT les lit.';
const fnctLitSeulement = (req: Request, _res: Response, next: NextFunction) =>
  next(req.user?.role === 'super_admin_fnct' ? new ApiError(403, ACTE_DE_LA_COMMUNE) : undefined);
const directeurSeul = [requireAuth, fnctLitSeulement, requireRole('admin_commune')];
const lecteurs = [requireAuth, requireRole('admin_commune', 'super_admin_fnct')];

type Ligne = z.infer<typeof ligneConventionSchema>;
async function ecrireLignes(client: { query: (t: string, p: unknown[]) => Promise<unknown> }, conventionId: string, communeId: string, lignes: Ligne[]) {
  for (const [i, l] of lignes.entries()) {
    await client.query(
      `INSERT INTO lignes_convention (convention_id, commune_id, flux_code, conteneur_id, levees_par_semaine, volume_litres, ordre)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [conventionId, communeId, l.fluxCode, l.conteneurId ?? null, l.leveesParSemaine, l.volumeLitres ?? null, i]
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
