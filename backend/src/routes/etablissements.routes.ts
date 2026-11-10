// Les établissements de la commune (jalon G, lot G2a, migration 099) — la table
// `commerces` étendue ; l'écran dit « Établissements ».
//
//   GET    /etablissements?communeId=…                 la liste, filtrable, exportable (csv, xlsx)
//   GET    /etablissements/garde-identite?communeId=…  peut-on enregistrer une identité ? (et pourquoi pas)
//   GET    /etablissements/{id}
//   POST   /etablissements?communeId=…                 une inscription (saisie), avec ses doublons probables
//   PUT    /etablissements/{id}                        la fiche, remplacée en entier
//   POST   /etablissements/{id}/statut                 fermer (date, motif), signaler à vérifier, rouvrir
//   GET    /etablissements/{id}/identite               l'identité du responsable : le seul directeur, lecture journalisée
//   PUT    /etablissements/{id}/identite               … écrite seulement quand la garde le permet
//   DELETE /etablissements/{id}/identite               … retirée
//
// UN ÉTABLISSEMENT NE SE SUPPRIME PAS (G-4) : il se ferme, avec sa date et son
// motif ; aucune route ne le retire, et la base refuse qu'on le fasse.
//
// UN DOUBLON PROBABLE EST MESURÉ, JAMAIS FUSIONNÉ : même raison sociale, ou une
// position à moins de 5 m d'un autre établissement — l'inscription se fait, et
// la réponse les nomme pour que la commune décide (fermer l'un « doublon », ou
// garder les deux). Deux boutiques voisines sont souvent à moins de 5 m.
//
// La commune écrit (son directeur) ; la FNCT lit, sans geste.

import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { exportable } from '../services/export.js';
import { JEU_ETABLISSEMENTS } from '../services/jeuxExport.js';
import { empreinteCin, normaliserCin } from '../services/identites.js';
import { communeRequise } from '../perimetre.js';
import { UNITES_ECHELLE } from './listesAssimiles.routes.js';

export const etablissementsRouter = Router();

export const STATUTS_ETABLISSEMENT = ['actif', 'ferme', 'a_verifier'] as const;
export const SOURCES_ETABLISSEMENT = ['anterieur', 'saisie', 'import_tcl', 'open_data', 'kobo'] as const;
export const IDENTIFIANTS_ETABLISSEMENT = ['matricule', 'cin', 'a_completer'] as const;

// L'an 0000 n'existe pas pour PostgreSQL (500) ; un 30 février non plus.
const dateIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.')
  .refine((j) => {
    const d = new Date(`${j}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === j;
  }, 'Cette date n’existe pas : vérifiez le jour et le mois.')
  .refine((j) => j >= '1900-01-01' && j <= '2100-12-31', 'Date hors de l’intervalle admis (1900 à 2100).');
// L'octet nul est du JSON valide, mais PostgreSQL refuse de le garder.
const sansOctetNul = (t: string) => !t.includes('\u0000');
const OCTET_NUL = 'Un texte ne peut pas contenir de caractère nul (\\u0000).';
// zod compte les unités UTF-16, la base les caractères.
const auMoinsCaracteres = (n: number) => (t: string) => [...t].length >= n;
const texte = (max: number) => z.string().trim().max(max).refine(sansOctetNul, OCTET_NUL);

/**
 * Le matricule fiscal tel qu'on le saisit (« 1234567 a / A / M / 000 ») ramené
 * à sa forme normalisée (« 1234567AAM000 ») : c'est elle que la base garde, et
 * sur elle que se juge le doublon.
 */
export function normaliserMatricule(brut: string): string {
  return brut.toUpperCase().replace(/[\s./\\-]/g, '');
}
export const MATRICULE_VALIDE = /^[0-9]{7}[A-Z]([A-Z]{2}[0-9]{3})?$/;
const matricule = z
  .string()
  .max(40)
  .transform(normaliserMatricule)
  .refine(
    (m) => MATRICULE_VALIDE.test(m),
    'Matricule fiscal : sept chiffres et la lettre clé (1234567A), puis, s’ils sont connus, le code TVA, le code catégorie et le numéro d’établissement (1234567A/A/M/000).'
  );

export const etablissementSchema = z
  .object({
    nom: texte(200).refine(auMoinsCaracteres(1), 'La raison sociale est obligatoire.'),
    // Commerce ou institution publique : la nature que lit l'indicateur M2-2.
    categorie: z.enum(['commerce', 'institution']).default('commerce'),
    categorieActivite: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{2,60}$/, 'Catégorie d’activité attendue (code de la liste nationale, ex. : hotel).'),
    activite: texte(200).nullable().optional(),
    matriculeFiscal: matricule.nullable().optional(),
    adresse: texte(300).nullable().optional(),
    zoneId: z.string().uuid('Secteur : identifiant attendu.').nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    precisionM: z.number().positive('La précision est positive.').max(1000, 'Précision au-delà de 1 000 m : la position ne vaut rien.').nullable().optional(),
    uniteEchelle: z.enum(UNITES_ECHELLE).nullable().optional(),
    valeurEchelle: z.number().positive('Le nombre d’unités est positif.').max(10_000_000).nullable().optional(),
    surfaceM2: z.number().positive('La surface est positive.').max(10_000_000).nullable().optional(),
    produitDangereux: z.boolean().default(false),
  })
  .strict()
  .refine(
    (d) => (d.latitude == null) === (d.longitude == null) && (d.latitude == null) === (d.precisionM == null),
    { message: 'Une position se donne entière : latitude, longitude et précision, ou rien.', path: ['latitude'] }
  )
  .refine((d) => d.latitude == null || (d.latitude >= 30.2 && d.latitude <= 37.6 && d.longitude! >= 7.5 && d.longitude! <= 11.7), {
    message: 'Cette position n’est pas en Tunisie : vérifiez l’ordre latitude, longitude.',
    path: ['latitude'],
  })
  .refine((d) => (d.uniteEchelle == null) === (d.valeurEchelle == null), {
    message: 'Une unité d’échelle se donne avec son nombre (ex. : 40 chambres), ou pas du tout.',
    path: ['valeurEchelle'],
  });

export const statutEtablissementSchema = z
  .object({
    statut: z.enum(STATUTS_ETABLISSEMENT),
    // La date d'une fermeture constatée ; sans objet pour les autres statuts.
    date: dateIso.optional(),
    motif: texte(500).refine(auMoinsCaracteres(5), 'Dites pourquoi (5 caractères au moins).'),
  })
  .strict()
  .refine((d) => (d.statut === 'ferme') === (d.date !== undefined), {
    message: 'Une fermeture se date ; les autres changements de statut ne portent pas de date.',
    path: ['date'],
  });

export const identiteEtablissementSchema = z
  .object({
    nomResponsable: texte(200).refine(auMoinsCaracteres(1), 'Le nom du responsable est obligatoire.'),
    // Huit chiffres, avec ou sans l'indicatif +216 et les espaces.
    telephone: z
      .string()
      .max(30)
      .transform((t) => t.replace(/\D/g, '').replace(/^216(?=\d{8}$)/, ''))
      .refine((t) => /^[0-9]{8}$/.test(t), 'Téléphone : huit chiffres attendus.')
      .nullable()
      .optional(),
    // Facultatif ; le message d'erreur ne reprend jamais la valeur saisie.
    cin: z
      .string()
      .max(30)
      .refine((v) => normaliserCin(v).length === 8, 'CIN : huit chiffres attendus.')
      .optional(),
  })
  .strict();

export const qEtablissements = z.object({
  statut: z.enum(STATUTS_ETABLISSEMENT).optional(),
  categorieActivite: z.string().regex(/^[a-z][a-z0-9_]{2,60}$/).optional(),
  zoneId: z.string().uuid().optional(),
  q: texte(100).optional(),
});

const SELECT_ETABLISSEMENTS = `
  SELECT c.id, c.commune_id, c.nom, c.categorie, c.activite, c.categorie_activite,
         cat.libelle_fr AS categorie_activite_fr, cat.libelle_ar AS categorie_activite_ar,
         c.matricule_fiscal, app.statut_identifiant_commerce(c.id) AS statut_identifiant,
         c.adresse, c.zone_id, z.name AS secteur,
         ST_Y(c.geom)::float AS latitude, ST_X(c.geom)::float AS longitude, c.precision_m::float AS precision_m,
         c.unite_echelle, c.valeur_echelle::float AS valeur_echelle, c.surface_m2::float AS surface_m2,
         c.produit_dangereux, c.statut, c.ferme_le, c.motif_statut, c.source_creation, c.created_at, c.updated_at,
         EXISTS (SELECT 1 FROM conventions_commerciales cv
                  WHERE cv.commerce_id = c.id AND cv.deleted_at IS NULL
                    AND cv.date_debut <= app.jour_tunis() AND (cv.date_fin IS NULL OR cv.date_fin >= app.jour_tunis())) AS sous_convention
    FROM commerces c
    LEFT JOIN zones_collecte z ON z.id = c.zone_id
    LEFT JOIN LATERAL (
      SELECT e.libelle_fr, e.libelle_ar FROM elements_listes_nationales e
       WHERE e.liste = 'categories_activite_assimiles' AND e.code = c.categorie_activite AND e.retire_le IS NULL
       ORDER BY e.date_effet DESC NULLS LAST LIMIT 1) cat ON true`;

const ACTE_DE_LA_COMMUNE = 'La commune recense ses établissements : son directeur les inscrit et les tient à jour ; la FNCT les lit.';

const REFUS: Record<string, number> = {
  CATEGORIE_INCONNUE: 400,
  UNITE_ECHELLE: 400,
  SECTEUR_AUTRE_COMMUNE: 400,
  FERMETURE_FUTURE: 400,
  ETABLISSEMENT_JAMAIS_SUPPRIME: 409,
  SOURCE_FIGEE: 409,
  IDENTITE_HEBERGEMENT: 409,
  IDENTITE_RECEPISSE: 409,
};
const CONTRAINTES: Record<string, string> = {
  commerces_matricule_format: 'Matricule fiscal mal formé : sept chiffres et la lettre clé, puis, s’ils sont connus, le code TVA, le code catégorie et le numéro d’établissement.',
  commerces_position_tunisie: 'Cette position n’est pas en Tunisie : vérifiez l’ordre latitude, longitude.',
  commerces_position_relevee: 'Une position se donne avec sa précision (au plus 1 000 m).',
  commerces_echelle_entiere: 'Une unité d’échelle se donne avec son nombre, positif.',
  commerces_statut_motive: 'Un établissement fermé ou à vérifier porte son motif (5 caractères au moins).',
  commerces_fermeture_plausible: 'Une date de fermeture ne précède pas l’an 2000.',
  commerces_fermeture_datee: 'Une fermeture se date, et seule une fermeture porte une date.',
  commerces_surface_positive: 'La surface est positive.',
  commerces_categorie_activite_requise: 'La catégorie d’activité est obligatoire.',
};

async function refus(err: unknown): Promise<never> {
  if (err instanceof ApiError) throw err;
  const e = err as { message?: string; constraint?: string; code?: string };
  // Hors du périmètre du directeur, un établissement ou une commune est
  // introuvable : un refus renseignerait sur son existence (CLAUDE.md § 5).
  if (e.code === '42501') throw new ApiError(404, 'Établissement ou commune introuvable.');
  if (e.code === '23505' && e.constraint === 'uq_commerces_matricule') {
    throw new ApiError(409, 'Ce matricule fiscal est déjà celui d’un établissement de la commune : ouvrez sa fiche plutôt que d’en inscrire un second.');
  }
  if (e.constraint && CONTRAINTES[e.constraint]) throw new ApiError(400, CONTRAINTES[e.constraint]);
  const code = e.message?.match(/^([A-Z_]+): /)?.[1];
  if (code && REFUS[code]) {
    const texteRefus = e.message!.slice(code.length + 2);
    throw new ApiError(REFUS[code], texteRefus.charAt(0).toUpperCase() + texteRefus.slice(1));
  }
  throw err;
}

const estUuid = (s: string) => z.string().uuid().safeParse(s).success;

async function lireEtablissement(id: string) {
  if (!estUuid(id)) throw new ApiError(404, 'Établissement introuvable.');
  const ligne = await queryOne(`${SELECT_ETABLISSEMENTS} WHERE c.id = $1 AND c.deleted_at IS NULL`, [id]);
  if (!ligne) throw new ApiError(404, 'Établissement introuvable.');
  return ligne as Record<string, unknown> & { id: string; commune_id: string; nom: string };
}

/**
 * Les doublons probables d'un établissement : même raison sociale (sans casse
 * ni espaces superflus), ou une position à moins de 5 m. Mesurés et montrés,
 * jamais fusionnés.
 */
async function doublonsProbables(e: { id: string; commune_id: string }) {
  return query(
    `SELECT o.id, o.nom, o.statut,
            CASE WHEN c.geom IS NOT NULL AND o.geom IS NOT NULL
                 THEN round(ST_Distance(c.geom::geography, o.geom::geography)::numeric, 1)::float END AS distance_m,
            (lower(regexp_replace(btrim(o.nom), '\\s+', ' ', 'g')) = lower(regexp_replace(btrim(c.nom), '\\s+', ' ', 'g'))) AS meme_nom
       FROM commerces c JOIN commerces o
         ON o.commune_id = c.commune_id AND o.id <> c.id AND o.deleted_at IS NULL
      WHERE c.id = $1
        AND (lower(regexp_replace(btrim(o.nom), '\\s+', ' ', 'g')) = lower(regexp_replace(btrim(c.nom), '\\s+', ' ', 'g'))
             OR (c.geom IS NOT NULL AND o.geom IS NOT NULL AND ST_DWithin(c.geom::geography, o.geom::geography, 5)))
      ORDER BY o.nom`,
    [e.id]
  );
}

const point = (d: z.infer<typeof etablissementSchema>) =>
  d.latitude == null ? null : `SRID=4326;POINT(${d.longitude} ${d.latitude})`;

// ---------------------------------------------------------------------------
// Lecture — DÉCLARÉES AVANT tout « /:id »
// ---------------------------------------------------------------------------
etablissementsRouter.get(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  exportable(JEU_ETABLISSEMENTS, (req) => (typeof req.query.communeId === 'string' ? req.query.communeId : undefined)),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const f = qEtablissements.parse({
      statut: req.query.statut,
      categorieActivite: req.query.categorieActivite,
      zoneId: req.query.zoneId,
      q: req.query.q,
    });
    const recherche = f.q ? `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
    res.json(
      await query(
        `${SELECT_ETABLISSEMENTS}
          WHERE c.commune_id = $1 AND c.deleted_at IS NULL
            AND ($2::text IS NULL OR c.statut = $2)
            AND ($3::text IS NULL OR c.categorie_activite = $3)
            AND ($4::uuid IS NULL OR c.zone_id = $4)
            AND ($5::text IS NULL OR c.nom ILIKE $5 OR c.matricule_fiscal ILIKE $5 OR c.adresse ILIKE $5)
          ORDER BY lower(c.nom), c.created_at`,
        [communeId, f.statut ?? null, f.categorieActivite ?? null, f.zoneId ?? null, recherche]
      )
    );
  })
);

etablissementsRouter.get(
  '/garde-identite',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const garde = await queryOne<{ accredite: boolean; recepisse: boolean }>(
      `SELECT COALESCE((SELECT valeur = 'true' FROM parametres_nationaux WHERE cle = 'hebergement_pii_accredite'), false) AS accredite,
              EXISTS (SELECT 1 FROM parametres_commune WHERE commune_id = $1 AND recepisse_inpdp IS NOT NULL) AS recepisse`,
      [communeId]
    );
    res.json({ communeId, accredite: garde?.accredite ?? false, recepisse: garde?.recepisse ?? false });
  })
);

etablissementsRouter.get(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    res.json(await lireEtablissement(req.params.id));
  })
);

// ---------------------------------------------------------------------------
// Écriture — le directeur de la commune
// ---------------------------------------------------------------------------
// La FNCT lit, elle n'écrit pas : le refus le dit plutôt qu'un 403 muet.
const fnctLitSeulement = (req: Request, _res: Response, next: NextFunction) =>
  next(req.user?.role === 'super_admin_fnct' ? new ApiError(403, ACTE_DE_LA_COMMUNE) : undefined);
const directeurSeul = [requireAuth, fnctLitSeulement, requireRole('admin_commune')];

etablissementsRouter.post(
  '/',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const d = etablissementSchema.parse(req.body);
    let id: string | undefined;
    try {
      const cree = await queryOne<{ id: string }>(
        `INSERT INTO commerces
           (commune_id, nom, categorie, activite, categorie_activite, matricule_fiscal, adresse, zone_id, geom, precision_m,
            unite_echelle, valeur_echelle, surface_m2, produit_dangereux, source_creation, saisi_par)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::geometry, $10, $11, $12, $13, $14, 'saisie', app.current_user_id())
         RETURNING id`,
        [communeId, d.nom, d.categorie, d.activite || null, d.categorieActivite, d.matriculeFiscal ?? null, d.adresse || null,
         d.zoneId ?? null, point(d), d.precisionM ?? null, d.uniteEchelle ?? null, d.valeurEchelle ?? null, d.surfaceM2 ?? null,
         d.produitDangereux]
      );
      id = cree?.id;
    } catch (err) {
      await refus(err);
    }
    const e = await lireEtablissement(id!);
    res.status(201).json({ ...e, doublons_probables: await doublonsProbables(e) });
  })
);

etablissementsRouter.put(
  '/:id',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const e = await lireEtablissement(req.params.id);
    const d = etablissementSchema.parse(req.body);
    try {
      const maj = await queryOne(
        `UPDATE commerces
            SET nom = $2, categorie = $3, activite = $4, categorie_activite = $5, matricule_fiscal = $6, adresse = $7,
                zone_id = $8, geom = $9::geometry, precision_m = $10, unite_echelle = $11, valeur_echelle = $12,
                surface_m2 = $13, produit_dangereux = $14
          WHERE id = $1 AND deleted_at IS NULL
          RETURNING id`,
        [e.id, d.nom, d.categorie, d.activite || null, d.categorieActivite, d.matriculeFiscal ?? null, d.adresse || null,
         d.zoneId ?? null, point(d), d.precisionM ?? null, d.uniteEchelle ?? null, d.valeurEchelle ?? null, d.surfaceM2 ?? null,
         d.produitDangereux]
      );
      if (!maj) throw new ApiError(404, 'Établissement introuvable.');
    } catch (err) {
      await refus(err);
    }
    const lu = await lireEtablissement(e.id);
    res.json({ ...lu, doublons_probables: await doublonsProbables(lu) });
  })
);

etablissementsRouter.post(
  '/:id/statut',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const e = await lireEtablissement(req.params.id);
    const d = statutEtablissementSchema.parse(req.body);
    if (e.statut === d.statut) {
      throw new ApiError(409, d.statut === 'ferme' ? 'Cet établissement est déjà fermé.' : d.statut === 'actif' ? 'Cet établissement est déjà actif.' : 'Cet établissement est déjà à vérifier.');
    }
    try {
      const maj = await queryOne(
        `UPDATE commerces SET statut = $2, ferme_le = $3, motif_statut = $4
          WHERE id = $1 AND deleted_at IS NULL AND statut = $5 RETURNING id`,
        [e.id, d.statut, d.statut === 'ferme' ? d.date : null, d.motif, e.statut]
      );
      if (!maj) throw new ApiError(409, 'Le statut de cet établissement a changé entre-temps : rechargez-le.');
    } catch (err) {
      await refus(err);
    }
    res.json(await lireEtablissement(e.id));
  })
);

// ---------------------------------------------------------------------------
// L'identité du responsable : le seul directeur
// ---------------------------------------------------------------------------
const COLONNES_IDENTITE = 'commerce_id, nom_responsable, telephone, empreinte_cin IS NOT NULL AS cin_enregistre, created_at, updated_at';

etablissementsRouter.get(
  '/:id/identite',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const e = await lireEtablissement(req.params.id);
    // L'empreinte ne sort pas : elle ne sert qu'à identifier, et l'écran n'a
    // besoin que de savoir si un CIN a été enregistré.
    const identite = await queryOne(`SELECT ${COLONNES_IDENTITE} FROM identites_commerces WHERE commerce_id = $1`, [e.id]);
    if (!identite) throw new ApiError(404, 'Aucune identité enregistrée pour cet établissement.');
    await query('SELECT app.enregistrer_acces_identites_commerces($1, ARRAY[$2]::uuid[], $3)', [
      'GET /etablissements/:id/identite',
      e.id,
      e.commune_id,
    ]);
    res.json(identite);
  })
);

etablissementsRouter.put(
  '/:id/identite',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const d = identiteEtablissementSchema.parse(req.body);
    const e = await lireEtablissement(req.params.id);
    const empreinte = d.cin ? empreinteCin(e.commune_id, d.cin) : null;
    try {
      const existante = await queryOne<{ id: string }>('SELECT id FROM identites_commerces WHERE commerce_id = $1', [e.id]);
      if (existante) {
        await query(
          `UPDATE identites_commerces
              SET nom_responsable = $2, telephone = $3, empreinte_cin = COALESCE($4, empreinte_cin)
            WHERE id = $1`,
          [existante.id, d.nomResponsable, d.telephone ?? null, empreinte]
        );
      } else {
        await query(
          `INSERT INTO identites_commerces (commerce_id, commune_id, nom_responsable, telephone, empreinte_cin, created_by)
           VALUES ($1, $2, $3, $4, $5, app.current_user_id())`,
          [e.id, e.commune_id, d.nomResponsable, d.telephone ?? null, empreinte]
        );
      }
    } catch (err) {
      await refus(err);
    }
    res.json(await queryOne(`SELECT ${COLONNES_IDENTITE} FROM identites_commerces WHERE commerce_id = $1`, [e.id]));
  })
);

etablissementsRouter.delete(
  '/:id/identite',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const e = await lireEtablissement(req.params.id);
    const identite = await queryOne<{ id: string }>('SELECT id FROM identites_commerces WHERE commerce_id = $1', [e.id]);
    if (!identite) throw new ApiError(404, 'Aucune identité enregistrée pour cet établissement.');
    await query("SELECT app.supprimer('identites_commerces', $1)", [identite.id]);
    res.status(204).end();
  })
);
