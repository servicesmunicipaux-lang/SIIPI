// L'import des établissements (jalon G, lot G2b, migration 102) : la liste TCL de
// la commune ou un jeu open data, en CSV ou en Excel, TELS QU'ILS SONT.
//
//   POST /etablissements/import/colonnes?communeId=…    les colonnes du fichier et la correspondance proposée (rien n'est écrit)
//   POST /etablissements/import?communeId=…             l'aperçu ligne par ligne (valider: false), puis l'écriture (valider: true)
//   GET  /etablissements/imports?communeId=…            le journal des imports validés
//   GET  /etablissements/correspondances-activites?…    l'activité du fichier → la catégorie, par commune
//   PUT  /etablissements/correspondances-activites?…    une correspondance posée ou corrigée
//
// Monté AVANT le routeur des établissements : ses chemins littéraux passent avant
// « /etablissements/:id » (CLAUDE.md § 5, « les littéraux avant /:id »).
//
// L'APERÇU N'EST JAMAIS REPRIS DE L'ÉCRAN. À la validation, le fichier est relu et
// rapproché de nouveau, dans l'état de la base à cet instant ; seules ses lignes
// valides s'écrivent, en une transaction, et la correspondance retenue est gardée
// pour l'import suivant.
//
// Le directeur de la commune importe ; la FNCT lit le journal et les correspondances.

import { createHash } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { decoder, LIGNES_MAX, lireCsvNumerote } from '../services/import.js';
import { ErreurXlsx, estXlsx, lireXlsx } from '../services/xlsx.js';
import {
  CHAMPS_IMPORT,
  CLES_CHAMPS,
  entetesUniques,
  ligneDesEntetes,
  PRECISION_MINIMALE,
  formeActivite,
  motifDoublon,
  problemesCorrespondance,
  proposerCorrespondance,
  rapprocher,
  SOURCES_IMPORT,
  type CategorieDuJour,
  type Correspondance,
  type CorrespondanceActivite,
  type Existant,
  type LigneRapprochee,
  type RangeeFichier,
} from '../services/importEtablissements.js';
import { communeRequise } from '../perimetre.js';

export const importEtablissementsRouter = Router();

const OCTET_NUL = 'Un texte ne peut pas contenir de caractère nul (\\u0000).';
const sansOctetNul = (t: string) => !t.includes('\u0000');
const texte = (min: number, max: number, libelle: string) =>
  z
    .string()
    .trim()
    .refine(sansOctetNul, OCTET_NUL)
    .refine((t) => [...t].length >= min && [...t].length <= max, `${libelle} : de ${min} à ${max} caractères.`);

export const fichierImportSchema = z
  .object({
    source: z.enum(SOURCES_IMPORT),
    nomFichier: texte(1, 255, 'Nom du fichier'),
    contenu: z
      .string()
      .min(1, 'Le fichier est vide.')
      .max(8_000_000, 'Fichier trop volumineux (6 Mo au plus).')
      .regex(/^[A-Za-z0-9+/=\s]+$/, 'Contenu attendu en base64.'),
  })
  .strict();

const correspondanceSchema = z
  .object(Object.fromEntries(CLES_CHAMPS.map((c) => [c, z.string().max(300).refine(sansOctetNul, OCTET_NUL).nullable().optional()])) as Record<
    (typeof CLES_CHAMPS)[number],
    z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString>>>
  >)
  .strict();

export const importEtablissementsSchema = fichierImportSchema
  .extend({
    correspondance: correspondanceSchema,
    licence: texte(2, 200, 'Licence').nullable().optional(),
    producteur: texte(2, 200, 'Producteur').nullable().optional(),
    urlSource: z
      .string()
      .trim()
      .max(500)
      .regex(/^https?:\/\/\S+$/, 'Adresse de la source : http:// ou https://.')
      .nullable()
      .optional(),
    precisionFichier: z
      .number()
      .min(PRECISION_MINIMALE, 'La précision va de 0,1 à 1 000 m (la base la garde au dixième de mètre).')
      .max(1000, 'Précision au-delà de 1 000 m : la position ne vaut rien.')
      .nullable()
      .optional(),
    valider: z.boolean().default(false),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.source === 'open_data' && (!d.licence || !d.producteur)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['licence'],
        message: 'Un jeu open data s’importe avec sa licence et son producteur : une donnée réutilisée dit d’où elle vient et à quelles conditions.',
      });
    }
  });

export const correspondanceActiviteSchema = z
  .object({
    activite: texte(1, 200, 'Activité'),
    categorieActivite: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{2,60}$/, 'Catégorie d’activité attendue (code de la liste nationale, ex. : hotel).'),
  })
  .strict();

// ---------------------------------------------------------------------------
// Lecture du fichier
// ---------------------------------------------------------------------------
type Fichier = {
  entetes: string[];
  rangees: RangeeFichier[];
  avertissements: string[];
  feuille: string | null;
  empreinte: string;
  ligneEntetes: number;
};

function lireFichier(contenu: string): Fichier {
  const octets = Buffer.from(contenu, 'base64');
  if (octets.length === 0) throw new ApiError(400, 'Le fichier est vide.');
  const empreinte = createHash('sha256').update(octets).digest('hex');
  const avertissements: string[] = [];
  let rangees: RangeeFichier[];
  let feuille: string | null = null;
  // L'ancien format binaire d'Excel (.xls) : SIIPI ne le lit pas, et le dit.
  if (octets.length >= 8 && octets.readUInt32BE(0) === 0xd0cf11e0) {
    throw new ApiError(400, 'Ancien format Excel (.xls) : ouvrez le fichier dans le tableur et enregistrez-le en .xlsx ou en CSV.');
  }
  if (estXlsx(octets)) {
    try {
      const lu = lireXlsx(octets);
      rangees = lu.rangees;
      feuille = lu.feuille;
      if (lu.autresFeuilles > 0) {
        avertissements.push(`Seule la première feuille (« ${lu.feuille} ») est lue ; le classeur en compte ${lu.autresFeuilles + 1}.`);
      }
    } catch (err) {
      throw new ApiError(400, err instanceof ErreurXlsx ? err.message : 'Classeur illisible.');
    }
  } else {
    rangees = lireCsvNumerote(decoder(octets, avertissements));
  }
  if (rangees.length === 0) throw new ApiError(400, 'Le fichier ne contient aucune ligne.');
  // Une liste administrative commence souvent par un titre : les en-têtes sont la
  // première ligne qui en a l'allure, et ce qui la précède est dit, pas importé.
  const i = ligneDesEntetes(rangees);
  if (i > 0) {
    avertissements.push(
      `Les en-têtes sont lus ligne ${rangees[i].ligne} ; ${i === 1 ? 'la ligne qui la précède est laissée de côté' : `les ${i} lignes qui la précèdent sont laissées de côté`} (titre du document).`
    );
  }
  const entetes = entetesUniques(rangees[i].cellules);
  const donnees = rangees.slice(i + 1);
  if (donnees.length === 0) throw new ApiError(400, 'Le fichier ne porte que sa ligne d’en-têtes : aucune ligne à importer.');
  if (donnees.length > LIGNES_MAX) throw new ApiError(400, `${donnees.length} lignes : ${LIGNES_MAX} au plus par import. Découpez le fichier.`);
  return { entetes, rangees: donnees, avertissements, feuille, empreinte, ligneEntetes: rangees[i].ligne };
}

// ---------------------------------------------------------------------------
// Ce que la base sait déjà — lu hors transaction pour l'aperçu, dans la
// transaction (et sous verrou) pour l'écriture.
// ---------------------------------------------------------------------------
type Lecteur = <T>(sql: string, params?: unknown[]) => Promise<T[]>;
const horsTransaction: Lecteur = (sql, params = []) => query(sql, params as never[]);
const dans = (client: PoolClient): Lecteur => async (sql, params = []) => (await client.query(sql, params as never[])).rows;

/** Hors du périmètre du directeur, la commune est introuvable (un refus renseignerait sur son existence). */
async function exigerPerimetre(communeId: string) {
  const r = await queryOne<{ ok: boolean }>('SELECT app.peut_emettre_document($1) AS ok', [communeId]);
  if (!r?.ok) throw new ApiError(404, 'Commune introuvable.');
}

/** Tout ce que le rapprochement lit de la base, d'un même lecteur. */
async function etatDeLaCommune(lire: Lecteur, communeId: string, source: string, empreinte: string) {
  const categories = await lire<CategorieDuJour>(
    `SELECT code, libelle_fr, libelle_ar FROM app.liste_nationale('categories_activite_assimiles', app.jour_tunis()) ORDER BY libelle_fr`
  );
  const existants = await lire<Existant>(
    `SELECT id, nom, statut, matricule_fiscal, activite, categorie_activite, adresse,
            ST_Y(geom)::float AS latitude, ST_X(geom)::float AS longitude, surface_m2::float AS surface_m2,
            import_id, source_creation
       FROM commerces WHERE commune_id = $1 AND deleted_at IS NULL ORDER BY created_at, id`,
    [communeId]
  );
  const correspondancesActivites = await lire<CorrespondanceActivite>(
    `SELECT activite, categorie_activite FROM correspondances_activites WHERE commune_id = $1 AND deleted_at IS NULL`,
    [communeId]
  );
  // Les lignes déjà écrites depuis ce même fichier (même empreinte, même type), avec l'établissement créé.
  const deja = await lire<{ import_ligne: number; id: string }>(
    `SELECT c.import_ligne, c.id FROM commerces c JOIN imports_etablissements i ON i.id = c.import_id
      WHERE i.commune_id = $1 AND i.source = $2 AND i.empreinte_fichier = $3 AND c.deleted_at IS NULL`,
    [communeId, source, empreinte]
  );
  return { categories, existants, correspondancesActivites, dejaImportees: new Map(deja.map((x) => [x.import_ligne, x.id])) };
}

const ACTE_DE_LA_COMMUNE = 'La commune importe sa liste d’établissements : son directeur le fait ; la FNCT lit.';
const fnctLitSeulement = (req: Request, _res: Response, next: NextFunction) =>
  next(req.user?.role === 'super_admin_fnct' ? new ApiError(403, ACTE_DE_LA_COMMUNE) : undefined);
const directeurSeul = [requireAuth, fnctLitSeulement, requireRole('admin_commune')];

const resumer = (lignes: LigneRapprochee[]) => {
  const n = (a: LigneRapprochee['action']) => lignes.filter((l) => l.action === a).length;
  return { creer: n('creer'), a_verifier: n('a_verifier'), rattacher: n('rattacher'), inchange: n('inchange'), sans_categorie: n('sans_categorie'), erreur: n('erreur') };
};

/** Les activités qui attendent leur catégorie, chacune une fois, avec le nombre de lignes qui l'attendent. */
function activitesSansCategorie(lignes: LigneRapprochee[]) {
  const parForme = new Map<string, { activite: string; lignes: number }>();
  for (const l of lignes) {
    if (l.action !== 'sans_categorie' || !l.activite) continue;
    const f = formeActivite(l.activite);
    const deja = parForme.get(f);
    if (deja) deja.lignes++;
    else parForme.set(f, { activite: l.activite, lignes: 1 });
  }
  return [...parForme.values()].sort((a, b) => b.lignes - a.lignes || a.activite.localeCompare(b.activite, 'fr'));
}

// Ce que la base refuse et que le rapprochement aurait dû voir : dit en mots, jamais un 500.
const CONTRAINTES_IMPORT: Record<string, string> = {
  commerces_position_relevee: 'Une position du fichier a une précision que la base ne garde pas (au moins 0,1 m, au plus 1 000 m). Rien n’a été écrit.',
  commerces_position_tunisie: 'Une position du fichier n’est pas en Tunisie. Rien n’a été écrit.',
  commerces_surface_positive: 'Une surface du fichier est nulle une fois arrondie au centième de m². Rien n’a été écrit.',
  imports_etab_precision: 'La précision déclarée pour le fichier va de 0,1 à 1 000 m. Rien n’a été écrit.',
};

// ---------------------------------------------------------------------------
// Routes — les littéraux, avant tout « /:id » des établissements
// ---------------------------------------------------------------------------
importEtablissementsRouter.post(
  '/import/colonnes',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const d = fichierImportSchema.parse(req.body);
    await exigerPerimetre(communeId);
    const f = lireFichier(d.contenu);
    const modele = await queryOne<{ correspondance: Correspondance }>(
      `SELECT correspondance FROM modeles_import_etablissements WHERE commune_id = $1 AND source = $2 AND deleted_at IS NULL`,
      [communeId, d.source]
    );
    const { correspondance, provenance } = proposerCorrespondance(f.entetes, modele?.correspondance ?? null);
    res.json({
      fichier: d.nomFichier,
      source: d.source,
      feuille: f.feuille,
      avertissements: f.avertissements,
      ligneEntetes: f.ligneEntetes,
      lignes: f.rangees.length,
      entetes: f.entetes,
      exemples: f.rangees.slice(0, 3).map((r) => f.entetes.map((_, i) => (r.cellules[i] ?? '').trim())),
      champs: CHAMPS_IMPORT.map(({ cle, fr, ar, obligatoire }) => ({ cle, fr, ar, obligatoire })),
      correspondance,
      provenance,
      modeleEnregistre: Boolean(modele),
    });
  })
);

importEtablissementsRouter.post(
  '/import',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const d = importEtablissementsSchema.parse(req.body);
    await exigerPerimetre(communeId);
    const f = lireFichier(d.contenu);
    const problemes = problemesCorrespondance(f.entetes, d.correspondance);
    if (problemes.length > 0) throw new ApiError(400, `Correspondance des colonnes à revoir : ${problemes.join(' ')}`);

    const rapprocherSelon = (etat: Awaited<ReturnType<typeof etatDeLaCommune>>) =>
      rapprocher({
        source: d.source,
        entetes: f.entetes,
        rangees: f.rangees,
        correspondance: d.correspondance,
        ...etat,
        precisionFichier: d.precisionFichier ?? null,
      });
    const apercuDe = (lignes: LigneRapprochee[]) => ({
      fichier: d.nomFichier,
      source: d.source,
      feuille: f.feuille,
      avertissements: f.avertissements,
      resume: resumer(lignes),
      activitesSansCategorie: activitesSansCategorie(lignes),
      lignes: lignes.map(({ saisie: _saisie, ...l }) => l),
    });

    if (!d.valider) {
      const lignes = rapprocherSelon(await etatDeLaCommune(horsTransaction, communeId, d.source, f.empreinte));
      return res.json({ ...apercuDe(lignes), ecrit: false });
    }

    let resultat: { importId: string; lignes: LigneRapprochee[] };
    try {
      resultat = await withTransaction(async (client) => {
        // Deux validations de la même commune se suivent : la seconde relit la base
        // après la première, et ne recrée pas ce que la première vient d'écrire.
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('import_etablissements:' || $1))`, [communeId]);
        const lignes = rapprocherSelon(await etatDeLaCommune(dans(client), communeId, d.source, f.empreinte));
        const resume = resumer(lignes);
        const aEcrire = lignes.filter((l) => l.saisie && (l.action === 'creer' || l.action === 'a_verifier' || l.action === 'rattacher'));
        if (aEcrire.length === 0) throw new ApiError(400, 'Rien à inscrire ni à compléter dans ce fichier : relisez l’aperçu.');

        const imp = await client.query<{ id: string }>(
          `INSERT INTO imports_etablissements
             (commune_id, source, nom_fichier, empreinte_fichier, licence, producteur, url_source, precision_declaree, correspondance,
              nb_crees, nb_a_verifier, nb_rattaches, nb_inchanges, nb_sans_categorie, nb_erreurs, saisi_par)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, app.current_user_id()) RETURNING id`,
          [communeId, d.source, d.nomFichier, f.empreinte, d.licence ?? null, d.producteur ?? null, d.urlSource ?? null,
           d.precisionFichier ?? null, JSON.stringify(d.correspondance), resume.creer, resume.a_verifier, resume.rattacher,
           resume.inchange, resume.sans_categorie, resume.erreur]
        );
        const id = imp.rows[0].id;
        for (const l of aEcrire) {
          const s = l.saisie!;
          const point = s.latitude == null ? null : `SRID=4326;POINT(${s.longitude} ${s.latitude})`;
          if (l.action === 'rattacher') {
            // Seules les cases vides se remplissent, tenu par la requête elle-même :
            // une valeur saisie à l'écran entre-temps n'est pas écrasée.
            await client.query(
              `UPDATE commerces
                  SET adresse = COALESCE(adresse, $3),
                      activite = COALESCE(activite, $4),
                      categorie_activite = COALESCE(categorie_activite, $5),
                      surface_m2 = COALESCE(surface_m2, $6),
                      geom = CASE WHEN geom IS NULL THEN $7::geometry ELSE geom END,
                      precision_m = CASE WHEN geom IS NULL THEN $8 ELSE precision_m END
                WHERE id = $1 AND commune_id = $2 AND deleted_at IS NULL`,
              [l.rattache_a!.id, communeId, s.adresse, s.activite, s.categorie_activite, s.surface_m2, point, s.precision_m]
            );
          } else {
            await client.query(
              `INSERT INTO commerces
                 (commune_id, nom, categorie, activite, categorie_activite, matricule_fiscal, adresse, geom, precision_m, surface_m2,
                  statut, motif_statut, source_creation, saisi_par, import_id, import_ligne)
               VALUES ($1, $2, 'commerce', $3, $4, $5, $6, $7::geometry, $8, $9, $10, $11, $12, app.current_user_id(), $13, $14)`,
              [communeId, s.nom, s.activite, s.categorie_activite, s.matricule_fiscal, s.adresse, point, s.precision_m, s.surface_m2,
               l.action === 'a_verifier' ? 'a_verifier' : 'actif',
               l.action === 'a_verifier' ? motifDoublon(l.doublon!, d.nomFichier) : null,
               d.source, id, l.numero]
            );
          }
        }
        // La correspondance retenue sert à l'import suivant de ce type de fichier — y
        // compris ce qui n'a « aucune colonne » : ce choix aussi se garde.
        await client.query(
          `INSERT INTO modeles_import_etablissements (commune_id, source, correspondance, saisi_par)
           VALUES ($1, $2, $3, app.current_user_id())
           ON CONFLICT (commune_id, source) WHERE deleted_at IS NULL
           DO UPDATE SET correspondance = EXCLUDED.correspondance, saisi_par = EXCLUDED.saisi_par`,
          [communeId, d.source, JSON.stringify(Object.fromEntries(CLES_CHAMPS.map((c) => [c, d.correspondance[c] ?? null])))]
        );
        return { importId: id, lignes };
      });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      const e = err as { code?: string; constraint?: string; message?: string };
      if (e.code === '42501') throw new ApiError(404, 'Commune introuvable.');
      if (e.code === '23505' && e.constraint === 'uq_commerces_matricule') {
        throw new ApiError(409, 'Un établissement de même matricule a été inscrit pendant l’import : relancez l’aperçu, rien n’a été écrit.');
      }
      if (e.message?.startsWith('CATEGORIE_INCONNUE')) {
        throw new ApiError(409, 'Une catégorie a été fermée par la FNCT pendant l’import : relancez l’aperçu, rien n’a été écrit.');
      }
      if (e.constraint && CONTRAINTES_IMPORT[e.constraint]) throw new ApiError(400, CONTRAINTES_IMPORT[e.constraint]);
      throw err;
    }
    const resume = resumer(resultat.lignes);
    res.status(201).json({
      ...apercuDe(resultat.lignes),
      ecrit: true,
      importId: resultat.importId,
      crees: resume.creer,
      aVerifier: resume.a_verifier,
      rattaches: resume.rattacher,
    });
  })
);

importEtablissementsRouter.get(
  '/imports',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    res.json(
      await query(
        `SELECT i.id, i.commune_id, i.source, i.nom_fichier, i.empreinte_fichier, i.licence, i.producteur, i.url_source,
                i.precision_declaree::float AS precision_declaree, i.correspondance,
                i.nb_crees, i.nb_a_verifier, i.nb_rattaches, i.nb_inchanges, i.nb_sans_categorie, i.nb_erreurs,
                u.full_name AS saisi_par_nom, i.created_at
           FROM imports_etablissements i LEFT JOIN users u ON u.id = i.saisi_par
          WHERE i.commune_id = $1 AND i.deleted_at IS NULL
          ORDER BY i.created_at DESC`,
        [communeId]
      )
    );
  })
);

importEtablissementsRouter.get(
  '/correspondances-activites',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    res.json(
      await query(
        `SELECT ca.id, ca.commune_id, ca.activite, ca.categorie_activite,
                cat.libelle_fr AS categorie_activite_fr, cat.libelle_ar AS categorie_activite_ar,
                EXISTS (SELECT 1 FROM app.liste_nationale('categories_activite_assimiles', app.jour_tunis()) e
                         WHERE e.code = ca.categorie_activite) AS en_vigueur,
                ca.updated_at
           FROM correspondances_activites ca
           LEFT JOIN LATERAL (
             SELECT e.libelle_fr, e.libelle_ar FROM elements_listes_nationales e
              WHERE e.liste = 'categories_activite_assimiles' AND e.code = ca.categorie_activite AND e.retire_le IS NULL
              ORDER BY e.date_effet DESC NULLS LAST LIMIT 1) cat ON true
          WHERE ca.commune_id = $1 AND ca.deleted_at IS NULL
          ORDER BY ca.activite`,
        [communeId]
      )
    );
  })
);

importEtablissementsRouter.put(
  '/correspondances-activites',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const d = correspondanceActiviteSchema.parse(req.body);
    const forme = formeActivite(d.activite);
    if (!forme) throw new ApiError(400, 'Activité : des lettres ou des chiffres, au moins.');
    await exigerPerimetre(communeId);
    try {
      const r = await queryOne(
        `INSERT INTO correspondances_activites (commune_id, activite_forme, activite, categorie_activite, saisi_par)
         VALUES ($1, $2, $3, $4, app.current_user_id())
         ON CONFLICT (commune_id, activite_forme) WHERE deleted_at IS NULL
         DO UPDATE SET activite = EXCLUDED.activite, categorie_activite = EXCLUDED.categorie_activite, saisi_par = EXCLUDED.saisi_par
         RETURNING id, commune_id, activite, categorie_activite, updated_at`,
        [communeId, forme, d.activite, d.categorieActivite]
      );
      res.json(r);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e.code === '42501') throw new ApiError(404, 'Commune introuvable.');
      if (e.message?.startsWith('CATEGORIE_INCONNUE: ')) {
        const m = e.message.slice('CATEGORIE_INCONNUE: '.length);
        throw new ApiError(400, m.charAt(0).toUpperCase() + m.slice(1));
      }
      throw err;
    }
  })
);
