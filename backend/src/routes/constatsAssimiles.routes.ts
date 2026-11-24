// Les manquements des établissements (jalon G, lot G7a, migration 107).
//
//   GET  /constats-assimiles?communeId=&type=&statut=&commerceId=&mois=   la liste
//   POST /constats-assimiles?communeId=…                  un constat, avec ses photos déjà déposées
//   POST /constats-assimiles/sanctions/{id}/annuler       une sanction annulée, avec son motif
//   GET  /constats-assimiles/{id}                         le constat, ses photos, l'historique de ses sanctions
//   POST /constats-assimiles/{id}/photos                  des photos jointes (dans le délai de saisie)
//   POST /constats-assimiles/{id}/lever | /annuler-levee | /classer | /annuler     les gestes (version lue)
//   POST /constats-assimiles/{id}/sanctions               une sanction (arrêté, procès-verbal…), sans montant
//
// LA COMMUNE CONSTATE, LA FNCT LIT, un prestataire ne voit rien. Les règles sont
// celles de la base (déclencheurs et fonctions de 107) ; la route traduit leurs
// refus en mots.
//
// AUCUNE ROUTE NE REND L'AUTEUR d'un geste (précision P3 du 23/11/2026) : ni
// colonne d'auteur, ni jointure sur users, et des photos ne sortent que
// l'identifiant, l'adresse, le type, la taille et la date — jamais la fiche du
// fichier, qui porte son déposant. L'auteur est au journal d'audit seulement.

import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeRequise } from '../perimetre.js';
import { contientUnIdentifiant } from '../services/importPersonnel.js';

export const constatsAssimilesRouter = Router();

export const TYPES_CONSTAT = [
  'depot_hors_conteneur',
  'conteneur_non_conforme',
  'debordement',
  'tri_non_respecte',
  'absence_convention',
  'autre',
] as const;
export const STATUTS_CONSTAT = ['constate', 'leve', 'classe', 'annule'] as const;
export const NATURES_SANCTION = ['arrete', 'proces_verbal', 'autre'] as const;

const dateIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.')
  .refine((j) => {
    const d = new Date(`${j}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === j;
  }, 'Cette date n’existe pas : vérifiez le jour et le mois.')
  .refine((j) => j >= '2000-01-01' && j <= '2100-12-31', 'Date hors de l’intervalle admis (2000 à 2100).');
const sansOctetNul = (t: string) => !t.includes('\u0000');
const texte = (min: number, max: number, libelle: string) =>
  z
    .string()
    .trim()
    .refine(sansOctetNul, 'Un texte ne peut pas contenir de caractère nul (\\u0000).')
    .refine((t) => [...t].length >= min && [...t].length <= max, `${libelle} : de ${min} à ${max} caractères.`);
const versionLue = z.string().regex(/^\d{1,20}$/, 'La version du constat lue est attendue : rouvrez-le, puis recommencez.');
const motif = texte(5, 300, 'Motif');
const idsPhotos = z.array(z.string().uuid('Photo : identifiant de fichier attendu.')).max(10, 'Un constat porte 10 photos au plus.');

export const constatSchema = z
  .object({
    commerceId: z.string().uuid('Établissement : identifiant attendu.'),
    dateConstat: dateIso,
    type: z.enum(TYPES_CONSTAT),
    description: texte(1, 500, 'Description').nullable().optional(),
    photos: idsPhotos.optional(),
  })
  .strict()
  .refine((c) => c.type !== 'autre' || Boolean(c.description), { message: 'Un manquement « autre » se décrit.', path: ['description'] });
export const photosConstatSchema = z.object({ version: versionLue, photos: idsPhotos.min(1, 'Au moins une photo.') }).strict();
export const leveeConstatSchema = z
  .object({ version: versionLue, date: dateIso, observation: texte(1, 300, 'Observation').nullable().optional() })
  .strict();
export const motifConstatSchema = z.object({ version: versionLue, motif }).strict();
export const sanctionSchema = z
  .object({
    version: versionLue,
    nature: z.enum(NATURES_SANCTION),
    // Le numéro tel que le document le porte : lettres, chiffres, « / - . ° » ; jamais une phrase.
    reference: texte(3, 200, 'Référence').refine((r) => /^[\p{L}\p{N}\s°/.()_-]+$/u.test(r), 'Référence : lettres, chiffres, espaces et « / - . ° ( ) _ » seulement, telle que le document la porte.'),
    dateDecision: dateIso,
    observation: texte(1, 300, 'Observation').nullable().optional(),
  })
  .strict();
export const annulationSanctionSchema = z
  .object({ version: z.string().regex(/^\d{1,20}$/, 'La version de la sanction lue est attendue : rouvrez le constat, puis recommencez.'), motif })
  .strict();
export const qConstats = z
  .object({
    communeId: z.string().optional(),
    type: z.enum(TYPES_CONSTAT).optional(),
    statut: z.enum(STATUTS_CONSTAT).optional(),
    commerceId: z.string().uuid('Établissement : identifiant attendu.').optional(),
    mois: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mois attendu au format AAAA-MM.').optional(),
  })
  .strict();

const ACTE_DE_LA_COMMUNE = 'La commune constate les manquements et décide des sanctions ; la FNCT les lit.';
const fnctLitSeulement = (req: Request, _res: Response, next: NextFunction) =>
  next(req.user?.role === 'super_admin_fnct' ? new ApiError(403, ACTE_DE_LA_COMMUNE) : undefined);
const directeurSeul = [requireAuth, fnctLitSeulement, requireRole('admin_commune')];
const lecteurs = [requireAuth, requireRole('admin_commune', 'super_admin_fnct')];

/** Un champ libre décrit le fait, jamais la personne : refusé avant toute écriture. */
function sansIdentifiant(valeur: string | null | undefined, champ: string) {
  if (valeur && contientUnIdentifiant(valeur)) {
    throw new ApiError(
      400,
      `Le champ « ${champ} » semble porter un numéro de CIN ou de téléphone (huit chiffres) : SIIPI ne le garde jamais (loi organique n° 2004-63). Décrivez le manquement sans nommer ni identifier de personne.`
    );
  }
}

const REFUS: Record<string, number> = {
  CONSTAT_FUTUR: 400,
  CONSTAT_DELAI: 400,
  CONSTAT_DELAI_PHOTO: 400,
  CONSTAT_DELAI_ABSENT: 422,
  CONSTAT_ETABLISSEMENT: 400,
  CONSTAT_IDENTIFIANT: 400,
  CONSTAT_MOTIF: 400,
  CONSTAT_LEVEE_A_VENIR: 400,
  CONSTAT_LEVEE_AVANT: 400,
  SANCTION_DATE: 400,
  PHOTO_COMMUNE: 400,
  PHOTO_USAGE: 400,
  CONSTAT_ETABLISSEMENT_FERME: 409,
  CONSTAT_FIGE: 409,
  CONSTAT_TRANSITION: 409,
  CONSTAT_VERSION: 409,
  CONSTAT_SANCTION_VALIDE: 409,
  SANCTION_STATUT_CONSTAT: 409,
  SANCTION_DEJA_ANNULEE: 409,
  SANCTION_VERSION: 409,
  SANCTION_UNIQUE: 409,
  SANCTION_FIGEE: 409,
  PHOTO_STATUT: 409,
  PHOTO_MAX: 409,
  PHOTO_DEJA_JOINTE: 409,
  PHOTO_FIGEE: 409,
};
const CONTRAINTES: Record<string, string> = {
  constats_assimiles_description: 'Description : de 1 à 500 caractères.',
  constats_assimiles_autre_description: 'Un manquement « autre » se décrit.',
  constats_assimiles_textes: 'Observation : 300 caractères au plus ; un motif, de 5 à 300 caractères.',
  constats_assimiles_levee_date: 'La levée suit le constat : sa date n’est pas antérieure à celle des faits.',
  constats_assimiles_statut_colonnes: 'Ce geste ne laisse pas le constat dans un état cohérent : rouvrez-le, puis recommencez.',
  sanctions_constats_reference: 'Référence : de 3 à 200 caractères, lettres, chiffres, espaces et « / - . ° ( ) _ », telle que le document la porte.',
  sanctions_constats_observation: 'Observation : 300 caractères au plus.',
  sanctions_constats_statut_colonnes: 'Une sanction s’annule avec un motif (de 5 à 300 caractères).',
};

function refus(err: unknown): never {
  if (err instanceof ApiError) throw err;
  const e = err as { message?: string; constraint?: string; code?: string };
  if (e.code === '42501' || e.code === 'P0002' ||
      ['CONSTAT_HORS_PERIMETRE', 'CONSTAT_INTROUVABLE', 'SANCTION_INTROUVABLE'].includes(e.message ?? '')) {
    throw new ApiError(404, 'Constat, sanction ou commune introuvable.');
  }
  if (e.constraint === 'uq_sanctions_constats_valide') {
    throw new ApiError(409, 'Ce constat porte déjà une sanction valide : annulez-la, avec son motif, avant d’en enregistrer une nouvelle.');
  }
  if (e.constraint === 'uq_photos_constats_fichier') throw new ApiError(409, 'Cette photo est déjà jointe à un constat.');
  if (e.constraint && CONTRAINTES[e.constraint]) throw new ApiError(400, CONTRAINTES[e.constraint]);
  const code = e.message?.match(/^([A-Z_]+): /)?.[1];
  if (code && REFUS[code]) {
    const t = (e.message as string).slice(code.length + 2);
    throw new ApiError(REFUS[code], t.charAt(0).toUpperCase() + t.slice(1));
  }
  throw err;
}

const estUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const idRequis = (s: string, quoi = 'Constat') => {
  if (!estUuid(s)) throw new ApiError(404, `${quoi} introuvable.`);
  return s;
};

// Les colonnes du constat, sans auteur. « À revoir » est calculé par la base, en
// français et en arabe ; il ne change rien au constat.
const SELECT_CONSTATS = `
  SELECT k.id, k.xmin::text AS version, k.commune_id, k.commerce_id, co.nom AS etablissement, co.statut AS etablissement_statut,
         k.date_constat, k.type, k.description, k.statut, k.leve_le, k.observation_levee,
         k.levee_annulee_le, k.motif_annulation_levee, k.classe_le, k.motif_classement, k.annule_le, k.motif_annulation,
         k.created_at, k.updated_at,
         (SELECT count(*)::int FROM photos_constats_assimiles p WHERE p.constat_id = k.id) AS nb_photos,
         EXISTS (SELECT 1 FROM sanctions_constats s WHERE s.constat_id = k.id AND s.statut = 'valide') AS sanction_valide,
         (SELECT jsonb_build_object('code', r.code, 'message', r.message, 'message_ar', r.message_ar)
            FROM app.constat_a_revoir(k.id) r LIMIT 1) AS a_revoir
    FROM constats_assimiles k
    LEFT JOIN commerces co ON co.id = k.commerce_id`;

async function lireConstat(id: string) {
  const c = await queryOne(`${SELECT_CONSTATS} WHERE k.id = $1`, [id]);
  if (!c) throw new ApiError(404, 'Constat introuvable.');
  // Des photos, l'identifiant, l'adresse, le type, la taille et la date : jamais la
  // fiche du fichier, qui porte son déposant.
  const photos = await query(
    `SELECT p.fichier_id, '/fichiers/' || p.fichier_id AS url, f.type_mime, f.taille_octets, p.created_at
       FROM photos_constats_assimiles p JOIN fichiers f ON f.id = p.fichier_id
      WHERE p.constat_id = $1 ORDER BY p.created_at, p.id`,
    [id]
  );
  const sanctions = await query(
    `SELECT s.id, s.xmin::text AS version, s.nature, s.reference, s.date_decision, s.observation, s.statut, s.annulee_le, s.motif_annulation, s.created_at
       FROM sanctions_constats s WHERE s.constat_id = $1 ORDER BY s.created_at, s.id`,
    [id]
  );
  // Chaque geste, dans l'ordre où il a été fait : une levée annulée puis refaite y
  // garde ses deux dates et ses deux motifs, que la ligne du constat ne garde plus.
  const historique = await query(
    `SELECT h.geste, h.date_effet, h.texte, h.created_at
       FROM historique_constats_assimiles h WHERE h.constat_id = $1 ORDER BY h.ordre`,
    [id]
  );
  return { ...c, photos, sanctions, historique };
}

constatsAssimilesRouter.get(
  '/',
  ...lecteurs,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const q = qConstats.parse(req.query);
    const conditions = ['k.commune_id = $1'];
    const valeurs: unknown[] = [communeId];
    if (q.type) conditions.push(`k.type = $${valeurs.push(q.type)}`);
    if (q.statut) conditions.push(`k.statut = $${valeurs.push(q.statut)}`);
    if (q.commerceId) conditions.push(`k.commerce_id = $${valeurs.push(q.commerceId)}`);
    if (q.mois) conditions.push(`to_char(k.date_constat, 'YYYY-MM') = $${valeurs.push(q.mois)}`);
    res.json(await query(`${SELECT_CONSTATS} WHERE ${conditions.join(' AND ')} ORDER BY k.date_constat DESC, k.created_at DESC`, valeurs));
  })
);

constatsAssimilesRouter.post(
  '/',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const d = constatSchema.parse(req.body);
    sansIdentifiant(d.description, 'description');
    try {
      const id = await withTransaction(async (client) => {
        const [r] = (
          await client.query<{ id: string }>(
            `INSERT INTO constats_assimiles (commune_id, commerce_id, date_constat, type, description)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [communeId, d.commerceId, d.dateConstat, d.type, d.description || null]
          )
        ).rows;
        for (const fichier of d.photos ?? []) {
          await client.query('INSERT INTO photos_constats_assimiles (constat_id, fichier_id) VALUES ($1, $2)', [r.id, fichier]);
        }
        return r.id;
      });
      res.status(201).json(await lireConstat(id));
    } catch (err) {
      refus(err);
    }
  })
);

// Les chemins littéraux avant /:id.
constatsAssimilesRouter.post(
  '/sanctions/:id/annuler',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = idRequis(req.params.id, 'Sanction');
    const d = annulationSanctionSchema.parse(req.body);
    sansIdentifiant(d.motif, 'motif');
    try {
      const s = await withTransaction(
        async (client) => (await client.query<{ constat_id: string }>('SELECT constat_id FROM app.annuler_sanction($1, $2, $3)', [id, d.version, d.motif])).rows[0]
      );
      res.json(await lireConstat(s.constat_id));
    } catch (err) {
      refus(err);
    }
  })
);

constatsAssimilesRouter.get(
  '/:id',
  ...lecteurs,
  asyncHandler(async (req, res) => {
    res.json(await lireConstat(idRequis(req.params.id)));
  })
);

constatsAssimilesRouter.post(
  '/:id/photos',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = idRequis(req.params.id);
    const d = photosConstatSchema.parse(req.body);
    try {
      await withTransaction(async (client) => client.query('SELECT app.joindre_photos_constat($1, $2, $3::uuid[])', [id, d.version, d.photos]));
      res.status(201).json(await lireConstat(id));
    } catch (err) {
      refus(err);
    }
  })
);

constatsAssimilesRouter.post(
  '/:id/lever',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = idRequis(req.params.id);
    const d = leveeConstatSchema.parse(req.body);
    sansIdentifiant(d.observation, 'observation');
    try {
      await withTransaction(async (client) =>
        client.query('SELECT id FROM app.lever_constat($1, $2, $3, $4)', [id, d.version, d.date, d.observation || null])
      );
      res.json(await lireConstat(id));
    } catch (err) {
      refus(err);
    }
  })
);

for (const [geste, fonction] of [
  ['annuler-levee', 'app.annuler_levee'],
  ['classer', 'app.classer_constat'],
  ['annuler', 'app.annuler_constat'],
] as const) {
  constatsAssimilesRouter.post(
    `/:id/${geste}`,
    ...directeurSeul,
    asyncHandler(async (req, res) => {
      const id = idRequis(req.params.id);
      const d = motifConstatSchema.parse(req.body);
      sansIdentifiant(d.motif, 'motif');
      try {
        await withTransaction(async (client) => client.query(`SELECT id FROM ${fonction}($1, $2, $3)`, [id, d.version, d.motif]));
        res.json(await lireConstat(id));
      } catch (err) {
        refus(err);
      }
    })
  );
}

constatsAssimilesRouter.post(
  '/:id/sanctions',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = idRequis(req.params.id);
    const d = sanctionSchema.parse(req.body);
    sansIdentifiant(d.observation, 'observation');
    try {
      await withTransaction(async (client) =>
        client.query('SELECT id FROM app.enregistrer_sanction($1, $2, $3, $4, $5, $6)', [
          id,
          d.version,
          d.nature,
          d.reference,
          d.dateDecision,
          d.observation || null,
        ])
      );
      res.status(201).json(await lireConstat(id));
    } catch (err) {
      refus(err);
    }
  })
);
