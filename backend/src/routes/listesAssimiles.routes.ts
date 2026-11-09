// Les listes nationales des déchets assimilés (jalon G, lot G1, migration 098) :
// les catégories d'activité des établissements, les flux assimilés et la base
// légale des conventions. Même mécanisme que les listes du secteur informel
// (091) : un élément daté ne se réécrit pas ; il se ferme à une date, ou se
// retire s'il était faux.
//
//   GET  /listes-assimiles                              les trois listes et leur historique
//   POST /listes-assimiles/listes/{liste}               un élément nouveau
//   POST /listes-assimiles/elements/{id}/application    la date d'application d'un texte
//                                                       inscrit sans elle, une fois
//   POST /listes-assimiles/elements/{id}/fin            il cesse de s'appliquer à une date
//   POST /listes-assimiles/elements/{id}/retrait        il avait été saisi à tort
//
// Un texte de la base légale peut s'inscrire SANS date d'application (le
// décret-loi n° 4 du 30 septembre 2026 attend la proclamation des résultats des
// élections municipales) : il est alors « en attente », jamais « en vigueur ».
//
// Lecture : tout utilisateur authentifié — une commune lit les catégories de sa
// grille. Écriture : la FNCT seule ; la base le tient aussi (RLS).
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const listesAssimilesRouter = Router();

export const LISTES_ASSIMILES = ['categories_activite_assimiles', 'flux_assimiles', 'base_legale_assimiles'] as const;
export const UNITES_ECHELLE = ['chambre', 'lit', 'chaise', 'table', 'etal', 'm2', 'eleve', 'employe'] as const;

// Une date qui n'existe pas (le 30 février) est refusée ici : la base la
// rejetterait d'une erreur de conversion, rendue en 500.
// L'an 0000 n'existe pas pour PostgreSQL (500) : l'année est bornée ici.
const dateIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.')
  .refine((j) => {
    const d = new Date(`${j}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === j;
  }, 'Cette date n’existe pas : vérifiez le jour et le mois.')
  .refine((j) => j >= '1900-01-01' && j <= '2100-12-31', 'Date hors de l’intervalle admis (1900 à 2100).');
// L'octet nul est du JSON valide, mais PostgreSQL refuse de le garder dans un
// texte : sans ce refus, il finissait en erreur 500.
const sansOctetNul = (t: string) => !t.includes('\u0000');
const OCTET_NUL = 'Un texte ne peut pas contenir de caractère nul (\\u0000).';
// zod compte les unités UTF-16, la base compte les caractères : un caractère hors
// du plan de base (un chiffre mathématique gras copié d'un PDF) en vaut deux pour zod,
// un pour la base. Une longueur minimale se vérifie donc aussi en caractères —
// sinon la base refusait d'un message générique ce que zod avait laissé passer.
const auMoinsCaracteres = (n: number) => (t: string) => [...t].length >= n;
// Le jour à Tunis (UTC+1, sans heure d'été).
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

const COLONNES_ELEMENT = `
  e.id, e.liste, e.code, e.libelle_fr, e.libelle_ar, e.ordre, e.date_effet, e.date_fin, e.reference_fin,
  e.provisoire, e.reference, e.unites_echelle, e.dangereux, e.date_publication, e.reference_effet,
  e.created_at, e.retire_le, e.motif_retrait`;

type Element = { liste: string; date_effet: string | null; date_fin: string | null; retire_le: string | null };

// L'état d'un élément au jour dit. « retire » l'emporte : une erreur de saisie
// n'a jamais été la règle. Un texte sans date d'application est « en attente » :
// le comparer au jour le dirait en vigueur, ce qu'il n'est pas.
export const etatElement = (e: Element, jour: string) =>
  e.retire_le
    ? 'retire'
    : e.date_effet === null
      ? 'en_attente'
      : e.date_effet > jour
        ? 'a_venir'
        : e.date_fin && e.date_fin <= jour
          ? 'ferme'
          : 'en_vigueur';

listesAssimilesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const jour = aujourdhui();
    const elements = await query<Element>(
      `SELECT ${COLONNES_ELEMENT} FROM elements_listes_nationales e
        WHERE e.liste = ANY ($1::text[])
        ORDER BY e.liste, e.ordre, e.code, e.date_effet NULLS LAST, e.created_at`,
      [LISTES_ASSIMILES]
    );
    res.json({
      jour,
      listes: LISTES_ASSIMILES.map((liste) => ({
        liste,
        elements: elements.filter((e) => e.liste === liste).map((e) => ({ ...e, etat: etatElement(e, jour) })),
      })),
    });
  })
);

export const elementAssimileSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{2,60}$/, 'Le code s’écrit en minuscules, chiffres et tiret bas, 3 à 61 caractères (ex. : hotel).'),
    libelleFr: z.string().trim().min(1, 'Le libellé en français est obligatoire.').max(300).refine(sansOctetNul, OCTET_NUL),
    libelleAr: z.string().trim().min(1, 'Le libellé en arabe est obligatoire.').max(300).refine(sansOctetNul, OCTET_NUL),
    ordre: z.number().int().min(0).max(10_000).default(0),
    // Vide seulement pour un texte de la base légale dont l'application attend un événement.
    dateEffet: dateIso.nullable(),
    provisoire: z.boolean().default(true),
    reference: z.string().trim().max(500).refine(sansOctetNul, OCTET_NUL).nullable().optional(),
    unitesEchelle: z.array(z.enum(UNITES_ECHELLE)).min(1).max(UNITES_ECHELLE.length).optional(),
    dangereux: z.boolean().optional(),
    // Le Journal officiel de la République tunisienne paraît depuis 1956.
    datePublication: dateIso
      .refine((j) => j >= '1956-01-01', 'Une date de publication au JORT ne précède pas 1956.')
      .nullable()
      .optional(),
  })
  .strict()
  .refine((d) => d.provisoire || Boolean(d.reference), {
    message: 'Un élément officiel cite le texte qui le fonde ; sinon, cochez « provisoire ».',
    path: ['reference'],
  });

export const applicationElementSchema = z
  .object({
    dateEffet: dateIso,
    reference: z
      .string()
      .trim()
      .min(5, 'Citez la pièce qui fixe la date d’application (5 caractères au moins).')
      .max(500)
      .refine(sansOctetNul, OCTET_NUL)
      .refine(auMoinsCaracteres(5), 'Citez la pièce qui fixe la date d’application (5 caractères au moins).'),
  })
  .strict();

export const finElementAssimileSchema = z
  .object({
    dateFin: dateIso,
    reference: z
      .string()
      .trim()
      .min(5, 'Citez le texte qui met fin à cet élément (5 caractères au moins).')
      .max(500)
      .refine(sansOctetNul, OCTET_NUL)
      .refine(auMoinsCaracteres(5), 'Citez le texte qui met fin à cet élément (5 caractères au moins).'),
  })
  .strict();

export const retraitElementAssimileSchema = z
  .object({
    motif: z
      .string()
      .trim()
      .min(5, 'Dites pourquoi cet élément est retiré (5 caractères au moins).')
      .max(500)
      .refine(sansOctetNul, OCTET_NUL)
      .refine(auMoinsCaracteres(5), 'Dites pourquoi cet élément est retiré (5 caractères au moins).'),
  })
  .strict();

// Les attributs propres à chaque liste : ce que la base exige, dit avant elle.
function attributsDeLaListe(liste: string, d: z.infer<typeof elementAssimileSchema>) {
  const categorie = liste === 'categories_activite_assimiles';
  const flux = liste === 'flux_assimiles';
  const legale = liste === 'base_legale_assimiles';
  if (categorie !== Boolean(d.unitesEchelle?.length)) {
    throw new ApiError(400, categorie
      ? 'Une catégorie d’activité dit ses unités d’échelle (chambres, chaises, étals, m²…) : une au moins.'
      : 'Seule une catégorie d’activité porte des unités d’échelle.');
  }
  if (flux !== (d.dangereux !== undefined)) {
    throw new ApiError(400, flux ? 'Un flux assimilé dit s’il est dangereux ou non.' : 'Seul un flux assimilé porte le marqueur « dangereux ».');
  }
  if (!legale && d.datePublication) throw new ApiError(400, 'Seul un texte de la base légale porte une date de publication.');
  if (!legale && d.dateEffet === null) throw new ApiError(400, 'La date d’effet est obligatoire, sauf pour un texte de la base légale dont l’application attend un événement.');
  if (legale && d.datePublication && d.dateEffet && d.dateEffet < d.datePublication) {
    throw new ApiError(400, 'Un texte ne s’applique pas avant d’être publié : la date d’application suit la publication.');
  }
}

// Les refus de la base, rendus en mots.
const traduireRefus = (err: unknown): never => {
  const e = err as { code?: string; message?: string; constraint?: string };
  if (e.code === '23505') {
    throw new ApiError(409, 'Un élément de ce code est déjà ouvert dans cette liste. Fermez-le à une date, ou retirez-le s’il était faux.');
  }
  if (e.constraint === 'elements_date_plausible') {
    throw new ApiError(400, 'La date d’effet ne précède pas l’an 2000 (1956 pour un texte de la base légale).');
  }
  if (e.constraint === 'elements_publication_plausible') {
    throw new ApiError(400, 'La publication ne précède pas 1956, et la date d’application ne précède pas la publication.');
  }
  if (e.constraint === 'elements_fin_apres_effet') {
    throw new ApiError(400, 'La fin doit suivre la date d’application de l’élément ; un texte sans date d’application ne se ferme pas.');
  }
  if (e.constraint === 'elements_fin_referencee') throw new ApiError(400, 'Citez le texte qui met fin à cet élément (5 caractères au moins).');
  if (e.constraint === 'elements_retrait_motive') throw new ApiError(400, 'Dites pourquoi cet élément est retiré (5 caractères au moins).');
  // Une pièce trop courte (ELEMENT_EFFET) est une saisie à corriger : 400 ; un
  // élément figé, fermé, né autrement qu'ouvert : l'état des choses s'y oppose, 409.
  const code = e.message?.match(/^(ELEMENT_[A-Z]+): /)?.[1];
  if (code) {
    const texte = e.message!.slice(code.length + 2);
    throw new ApiError(code === 'ELEMENT_EFFET' ? 400 : 409, texte.charAt(0).toUpperCase() + texte.slice(1));
  }
  throw err;
};

const elementIntrouvable = () => new ApiError(404, 'Élément introuvable dans les listes des assimilés, ou retiré.');
const idValide = (id: string) => z.string().uuid().safeParse(id).success;

// DÉCLARÉES AVANT tout « /:param » de même forme : les littéraux d'abord.
listesAssimilesRouter.post(
  '/listes/:liste',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const liste = req.params.liste;
    if (!(LISTES_ASSIMILES as readonly string[]).includes(liste)) throw new ApiError(404, 'Liste des assimilés inconnue.');
    const d = elementAssimileSchema.parse(req.body);
    attributsDeLaListe(liste, d);
    try {
      res.status(201).json(
        await queryOne(
          `INSERT INTO elements_listes_nationales AS e
             (liste, code, libelle_fr, libelle_ar, ordre, date_effet, provisoire, reference,
              unites_echelle, dangereux, date_publication, saisi_par)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, app.current_user_id())
           RETURNING ${COLONNES_ELEMENT}`,
          [liste, d.code, d.libelleFr, d.libelleAr, d.ordre, d.dateEffet, d.provisoire, d.reference || null,
           d.unitesEchelle ?? null, d.dangereux ?? null, d.datePublication ?? null]
        )
      );
    } catch (err) {
      traduireRefus(err);
    }
  })
);

listesAssimilesRouter.post(
  '/elements/:id/application',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = applicationElementSchema.parse(req.body);
    if (!idValide(req.params.id)) throw elementIntrouvable();
    try {
      const ligne = await queryOne(
        `UPDATE elements_listes_nationales e SET date_effet = $2, reference_effet = $3
          WHERE e.id = $1 AND e.liste = 'base_legale_assimiles' AND e.retire_le IS NULL AND e.date_effet IS NULL
          RETURNING ${COLONNES_ELEMENT}`,
        [req.params.id, d.dateEffet, d.reference]
      );
      if (!ligne) throw new ApiError(404, 'Texte introuvable, retiré, ou dont la date d’application est déjà fixée.');
      res.json(ligne);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      traduireRefus(err);
    }
  })
);

listesAssimilesRouter.post(
  '/elements/:id/fin',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = finElementAssimileSchema.parse(req.body);
    if (!idValide(req.params.id)) throw elementIntrouvable();
    try {
      const ligne = await queryOne(
        `UPDATE elements_listes_nationales e SET date_fin = $2, reference_fin = $3
          WHERE e.id = $1 AND e.liste = ANY ($4::text[]) AND e.retire_le IS NULL
          RETURNING ${COLONNES_ELEMENT}`,
        [req.params.id, d.dateFin, d.reference, LISTES_ASSIMILES]
      );
      if (!ligne) throw elementIntrouvable();
      res.json(ligne);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      traduireRefus(err);
    }
  })
);

listesAssimilesRouter.post(
  '/elements/:id/retrait',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const { motif } = retraitElementAssimileSchema.parse(req.body);
    if (!idValide(req.params.id)) throw elementIntrouvable();
    try {
      const ligne = await queryOne(
        `UPDATE elements_listes_nationales e
            SET retire_le = now(), retire_par = app.current_user_id(), motif_retrait = $2
          WHERE e.id = $1 AND e.liste = ANY ($3::text[]) AND e.retire_le IS NULL
          RETURNING ${COLONNES_ELEMENT}`,
        [req.params.id, motif, LISTES_ASSIMILES]
      );
      if (!ligne) throw elementIntrouvable();
      res.json(ligne);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      traduireRefus(err);
    }
  })
);
