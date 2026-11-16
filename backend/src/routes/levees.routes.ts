// Les levées des établissements sous convention (jalon G, lot G5a, migration 105).
//
//   GET  /levees/feuille?circuitId=…&date=…      la feuille du jour d'un circuit (commune, FNCT, prestataire du circuit)
//   GET  /levees?communeId=…                     le registre des levées (commune, FNCT), avec ce qui est « à revoir »
//   POST /levees                                 un lot de la feuille : saisi par la commune (validé d'emblée) ou proposé par le prestataire
//   POST /levees/valider                         des propositions validées (directeur)
//   POST /levees/ecarter                         des propositions écartées, avec un motif (directeur)
//   POST /levees/{id}/annuler                    une levée validée annulée, avec un motif (directeur)
//   POST /levees/import/colonnes?communeId=…     les colonnes d'un export Kobo et la correspondance proposée (rien n'est écrit)
//   POST /levees/import?communeId=…              l'aperçu ligne par ligne (valider: false), puis les propositions (valider: true)
//   GET  /levees/imports?communeId=…             le journal des imports validés
//
// LES RÈGLES SONT CELLES DE LA BASE. Une levée ne naît que par
// app.enregistrer_levees, qui l'examine (app._examiner_levee) : desserte du jour,
// convention signée en vigueur, flux de ses termes, voyage du circuit, ni double ni
// date future. La route ne fait que traduire les refus en mots.
//
// LE PRESTATAIRE ne lit jamais la table des levées : il voit sa feuille (sans
// convention ni tarif) et y propose. Ce qui n'est pas sur sa feuille lui est
// introuvable.
//
// L'APERÇU D'IMPORT N'EST JAMAIS REPRIS DE L'ÉCRAN : à la validation, le fichier est
// relu et examiné de nouveau, sous le verrou des écritures de la commune.

import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeRequise } from '../perimetre.js';
import { formeEntete, lireTableur, problemesCorrespondanceDe, proposerCorrespondanceDe } from '../services/tableur.js';
import {
  CHAMPS_LEVEES,
  CLES_CHAMPS_LEVEES,
  lireLignes,
  type ChampLevee,
  type CircuitConnu,
  type CorrespondanceLevees,
  type EtablissementConnu,
  type FluxConnu,
} from '../services/importLevees.js';

export const leveesRouter = Router();

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
const motif = texte(5, 500, 'Motif');

export const STATUTS_LEVEE = ['proposee', 'validee', 'ecartee', 'annulee'] as const;
export const SOURCES_LEVEE = ['portail', 'prestataire', 'kobo'] as const;

export const qFeuille = z.object({
  circuitId: z.string().uuid('Circuit : identifiant attendu.'),
  date: dateIso.optional(),
});

export const lotLeveesSchema = z
  .object({
    circuitId: z.string().uuid('Circuit : identifiant attendu.'),
    date: dateIso,
    voyage: z.number().int().min(1, 'Voyage : de 1 à 6.').max(6, 'Voyage : de 1 à 6.'),
    heure: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure attendue au format HH:MM.').nullable().optional(),
    levees: z
      .array(
        z
          .object({
            commerceId: z.string().uuid('Établissement : identifiant attendu.'),
            fluxCode: z.string().trim().regex(/^[a-z][a-z0-9_]{2,60}$/, 'Flux attendu (code de la liste nationale des déchets assimilés).'),
            cle: z.string().trim().min(8, 'Clé d’envoi : 8 caractères au moins.').max(100).refine(sansOctetNul, OCTET_NUL),
          })
          .strict()
      )
      .min(1, 'Cochez au moins une levée.')
      .max(500, 'Au plus 500 levées par envoi.'),
  })
  .strict();

const ids = z.array(z.string().uuid('Levée : identifiant attendu.')).min(1, 'Choisissez au moins une levée.').max(500, 'Au plus 500 levées à la fois.');
export const validationLeveesSchema = z.object({ ids }).strict();
export const ecartLeveesSchema = z.object({ ids, motif }).strict();
export const annulationLeveeSchema = z.object({ motif }).strict();

export const qLevees = z
  .object({
    communeId: z.string().optional(),
    depuis: dateIso.optional(),
    jusqua: dateIso.optional(),
    statut: z.enum(STATUTS_LEVEE).optional(),
    circuitId: z.string().uuid().optional(),
    commerceId: z.string().uuid().optional(),
  })
  .refine((q) => !q.depuis || !q.jusqua || q.depuis <= q.jusqua, { message: 'La période commence après sa fin : inversez les dates.', path: ['depuis'] });

export const fichierLeveesSchema = z
  .object({
    nomFichier: texte(1, 255, 'Nom du fichier'),
    contenu: z
      .string()
      .min(1, 'Le fichier est vide.')
      .max(8_000_000, 'Fichier trop volumineux (6 Mo au plus).')
      .regex(/^[A-Za-z0-9+/=\s]+$/, 'Contenu attendu en base64.'),
  })
  .strict();
const correspondanceLeveesSchema = z
  .object(
    Object.fromEntries(CLES_CHAMPS_LEVEES.map((c) => [c, z.string().max(300).refine(sansOctetNul, OCTET_NUL).nullable().optional()])) as Record<
      ChampLevee,
      z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>
    >
  )
  .strict();
export const importLeveesSchema = fichierLeveesSchema
  .extend({ correspondance: correspondanceLeveesSchema, valider: z.boolean().default(false) })
  .strict();

const ACTE_DE_LA_COMMUNE =
  'La commune saisit, importe, valide, écarte et annule les levées ; le prestataire du circuit les propose ; la FNCT les lit.';
const fnctLitSeulement = (req: Request, _res: Response, next: NextFunction) =>
  next(req.user?.role === 'super_admin_fnct' ? new ApiError(403, ACTE_DE_LA_COMMUNE) : undefined);
const directeurSeul = [requireAuth, fnctLitSeulement, requireRole('admin_commune')];
const lecteurs = [requireAuth, requireRole('admin_commune', 'super_admin_fnct')];

// ---------------------------------------------------------------------------
// Les refus de la base, en mots
// ---------------------------------------------------------------------------
const REFUS: Record<string, number> = {
  LEVEE_ETABLISSEMENT: 400,
  LEVEE_FUTURE: 400,
  ETABLISSEMENT_FERME: 409,
  LEVEE_SANS_DESSERTE: 409,
  LEVEE_AUTRE_CIRCUIT: 409,
  LEVEE_VOYAGE_A_PRECISER: 400,
  LEVEE_VOYAGE: 400,
  LEVEE_SANS_CONVENTION: 409,
  LEVEE_FLUX_A_PRECISER: 400,
  LEVEE_FLUX: 409,
  LEVEE_DOUBLON: 409,
  LEVEE_HORS_CONTRAT: 409,
  LEVEE_SOURCE: 400,
  LEVEE_AUCUNE: 400,
  LEVEE_CLE_REUTILISEE: 409,
  LEVEE_DEJA_INSTRUITE: 409,
  LEVEE_A_REPROPOSER: 409,
  LEVEE_MOTIF: 400,
  LEVEE_FIGEE: 409,
};

function refus(err: unknown): never {
  if (err instanceof ApiError) throw err;
  const e = err as { message?: string; constraint?: string; code?: string };
  // Hors du périmètre (et, pour un prestataire, hors de sa feuille), une levée, un
  // établissement ou un circuit sont introuvables : un refus renseignerait.
  if (e.code === '42501' || e.code === 'P0002' || ['LEVEE_HORS_PERIMETRE', 'LEVEE_INTROUVABLE', 'CIRCUIT_INTROUVABLE'].includes(e.message ?? '')) {
    throw new ApiError(404, 'Levée, établissement ou circuit introuvable.');
  }
  // Deux envois concurrents de la même levée : le second trouve le premier.
  if (e.constraint === 'uq_levees_voyage') throw new ApiError(409, 'Cette levée vient d’être enregistrée ou proposée pour ce voyage : la feuille est à jour.');
  if (e.constraint === 'uq_levees_cle') throw new ApiError(409, 'Cette clé d’envoi a déjà servi : rien n’est enregistré.');
  if (e.constraint === 'levees_cle') throw new ApiError(400, 'Une clé d’envoi dépasse 200 caractères : choisissez une colonne de clé plus courte.');
  const code = e.message?.match(/^([A-Z_]+): /)?.[1];
  if (code && REFUS[code]) {
    const t = (e.message as string).slice(code.length + 2);
    throw new ApiError(REFUS[code], t.charAt(0).toUpperCase() + t.slice(1));
  }
  throw err;
}

// ---------------------------------------------------------------------------
// La feuille du jour
// ---------------------------------------------------------------------------
leveesRouter.get(
  '/feuille',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct', 'gestionnaire_prestataire'),
  asyncHandler(async (req, res) => {
    const q = qFeuille.parse(req.query);
    try {
      const circuit = await queryOne<{ voyages_par_jour: number; jours_passage: number[] }>(
        `SELECT c.id, c.nom, c.code, c.commune_id, c.voyages_par_jour, c.jours_passage, c.date_debut, c.date_fin, c.actif,
                COALESCE($2::date, app.jour_tunis()) AS date,
                (extract(isodow FROM COALESCE($2::date, app.jour_tunis()))::int = ANY (c.jours_passage)) AS passe_ce_jour
           FROM circuits c WHERE c.id = $1 AND c.deleted_at IS NULL`,
        [q.circuitId, q.date ?? null]
      );
      if (!circuit) throw new ApiError(404, 'Circuit introuvable.');
      // Le volume (numeric) sortirait en texte : il est rendu en nombre, comme le contrat l'annonce.
      const lignes = await query(
        `SELECT f.desserte_id, f.commerce_id, f.etablissement, f.adresse, f.ferme, f.point_id, f.point_nom, f.point_voyage, f.point_ordre,
                f.point_retire, f.convention_id, f.etat_convention, f.flux_code, f.flux_fr, f.flux_ar, f.conteneur_id, f.conteneur_code,
                f.levees_par_semaine, f.volume_litres::float8 AS volume_litres, f.levees
           FROM app.feuille_levees($1, COALESCE($2::date, app.jour_tunis())) f`,
        [q.circuitId, q.date ?? null]
      );
      res.json({ circuit, lignes });
    } catch (err) {
      refus(err);
    }
  })
);

// ---------------------------------------------------------------------------
// Le registre (commune, FNCT)
// ---------------------------------------------------------------------------
export const SELECT_LEVEES = `
  SELECT l.id, l.commune_id, l.convention_id, cv_doc.numero_affiche AS numero_convention,
         l.commerce_id, co.nom AS etablissement, co.matricule_fiscal,
         l.desserte_id, l.circuit_id, c.nom AS circuit, l.point_id, p.nom AS point,
         l.flux_code, f.libelle_fr AS flux_fr, f.libelle_ar AS flux_ar, l.conteneur_id, k.code AS conteneur,
         l.date_levee, to_char(l.heure_levee, 'HH24:MI') AS heure_levee, l.voyage, l.source, l.statut,
         l.valide_le, l.ecartee_le, l.motif_ecart, l.annulee_le, l.motif_annulation, l.observation,
         l.import_id, l.import_ligne, l.created_at,
         ar.code AS a_revoir, ar.message AS a_revoir_message,
         count(*) OVER ()::int AS total
    FROM levees l
    JOIN commerces co ON co.id = l.commerce_id
    LEFT JOIN circuits c ON c.id = l.circuit_id
    LEFT JOIN points_collecte p ON p.id = l.point_id
    LEFT JOIN conteneurs k ON k.id = l.conteneur_id
    LEFT JOIN conventions_commerciales cv ON cv.id = l.convention_id
    LEFT JOIN documents_emis cv_doc ON cv_doc.id = cv.document_id
    LEFT JOIN LATERAL (
      SELECT e.libelle_fr, e.libelle_ar FROM elements_listes_nationales e
       WHERE e.liste = 'flux_assimiles' AND e.code = l.flux_code AND e.retire_le IS NULL
       ORDER BY e.date_effet DESC LIMIT 1) f ON true
    LEFT JOIN LATERAL app.levee_a_revoir(l.id) ar ON true`;

leveesRouter.get(
  '/',
  ...lecteurs,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const q = qLevees.parse(req.query);
    // Par défaut, les trente jours qui finissent à la borne haute : une liste sans
    // borne grossirait sans fin. Au-delà de 2 000 lignes, « total » dit combien il y en
    // a : une liste tronquée ne passe jamais pour complète.
    const lignes = await query(
      `${SELECT_LEVEES}
        WHERE l.commune_id = $1
          AND l.date_levee >= COALESCE($2::date, COALESCE($3::date, app.jour_tunis()) - 30)
          AND l.date_levee <= COALESCE($3::date, app.jour_tunis())
          AND ($4::text IS NULL OR l.statut = $4)
          AND ($5::uuid IS NULL OR l.circuit_id = $5)
          AND ($6::uuid IS NULL OR l.commerce_id = $6)
        ORDER BY (l.statut = 'proposee') DESC, l.date_levee DESC, lower(co.nom), l.voyage
        LIMIT 2000`,
      [communeId, q.depuis ?? null, q.jusqua ?? null, q.statut ?? null, q.circuitId ?? null, q.commerceId ?? null]
    );
    res.json(lignes);
  })
);

leveesRouter.get(
  '/imports',
  ...lecteurs,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    res.json(
      await query(
        `SELECT i.id, i.nom_fichier, i.empreinte_fichier, i.correspondance, i.nb_proposees, i.nb_deja_recues, i.nb_erreurs,
                i.created_at, u.full_name AS saisi_par_nom
           FROM imports_levees i LEFT JOIN users u ON u.id = i.saisi_par
          WHERE i.commune_id = $1 AND i.deleted_at IS NULL
          ORDER BY i.created_at DESC`,
        [communeId]
      )
    );
  })
);

// ---------------------------------------------------------------------------
// Un lot de la feuille : la commune saisit, le prestataire propose
// ---------------------------------------------------------------------------
leveesRouter.post(
  '/',
  requireAuth,
  fnctLitSeulement,
  requireRole('admin_commune', 'gestionnaire_prestataire'),
  asyncHandler(async (req, res) => {
    const d = lotLeveesSchema.parse(req.body);
    const source = req.user?.role === 'admin_commune' ? 'portail' : 'prestataire';
    try {
      const circuit = await queryOne<{ commune_id: string }>('SELECT commune_id FROM circuits WHERE id = $1 AND deleted_at IS NULL', [d.circuitId]);
      if (!circuit) throw new ApiError(404, 'Circuit introuvable.');
      const lignes = d.levees.map((l, i) => ({
        n: i + 1,
        commerce: l.commerceId,
        flux: l.fluxCode,
        jour: d.date,
        voyage: d.voyage,
        heure: d.heure ?? null,
        circuit: d.circuitId,
        cle: `${source}:${l.cle}`,
      }));
      const ecrites = await withTransaction(async (client) => {
        const r = await client.query(`SELECT * FROM app.enregistrer_levees($1, $2, $3::jsonb, NULL)`, [
          circuit.commune_id,
          source,
          JSON.stringify(lignes),
        ]);
        return r.rows;
      });
      res.status(201).json({ levees: ecrites });
    } catch (err) {
      refus(err);
    }
  })
);

// ---------------------------------------------------------------------------
// Les gestes de la commune
// ---------------------------------------------------------------------------
leveesRouter.post(
  '/valider',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const d = validationLeveesSchema.parse(req.body);
    try {
      const r = await withTransaction(async (client) => (await client.query('SELECT id FROM app.valider_levees($1::uuid[])', [d.ids])).rows);
      res.json({ validees: r.length });
    } catch (err) {
      refus(err);
    }
  })
);

leveesRouter.post(
  '/ecarter',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const d = ecartLeveesSchema.parse(req.body);
    try {
      const r = await withTransaction(
        async (client) => (await client.query('SELECT id FROM app.ecarter_levees($1::uuid[], $2)', [d.ids, d.motif])).rows
      );
      res.json({ ecartees: r.length });
    } catch (err) {
      refus(err);
    }
  })
);

// ---------------------------------------------------------------------------
// L'import d'un export Kobo
// ---------------------------------------------------------------------------
type Lecteur = <T>(sql: string, params?: unknown[]) => Promise<T[]>;
const horsTransaction: Lecteur = (sql, params = []) => query(sql, params as never[]);
const dans = (client: PoolClient): Lecteur => async (sql, params = []) => (await client.query(sql, params as never[])).rows;

/** Hors du périmètre du directeur, la commune est introuvable (un refus renseignerait sur son existence). */
async function exigerPerimetre(communeId: string) {
  const r = await queryOne<{ ok: boolean }>('SELECT app.peut_emettre_document($1) AS ok', [communeId]);
  if (!r?.ok) throw new ApiError(404, 'Commune introuvable.');
}

export type ActionLevee = 'proposer' | 'deja_recue' | 'erreur';

/** Chaque ligne du fichier, lue puis examinée par la base, sans rien écrire. */
async function examiner(lire: Lecteur, communeId: string, f: ReturnType<typeof lireTableur>, correspondance: CorrespondanceLevees, xlsx: boolean) {
  const [etablissements, flux, circuits] = await Promise.all([
    lire<EtablissementConnu>('SELECT id, matricule_fiscal FROM commerces WHERE commune_id = $1 AND deleted_at IS NULL', [communeId]),
    lire<FluxConnu>(
      `SELECT DISTINCT ON (code) code, libelle_fr, libelle_ar FROM elements_listes_nationales
        WHERE liste = 'flux_assimiles' AND retire_le IS NULL ORDER BY code, date_effet DESC`
    ),
    lire<CircuitConnu>('SELECT id, code, nom FROM circuits WHERE commune_id = $1 AND deleted_at IS NULL', [communeId]),
  ]);
  const lues = lireLignes({ entetes: f.entetes, rangees: f.rangees, correspondance, xlsx, calendrier1904: f.calendrier1904, etablissements, flux, circuits });

  // Une même clé deux fois dans le fichier : une soumission à plusieurs levées sans son index de répétition.
  const vuesCle = new Map<string, number>();
  for (const l of lues) {
    if (!l.cleEnvoi || l.erreurs.length) continue;
    const avant = vuesCle.get(l.cleEnvoi);
    if (avant) l.erreurs.push(`même clé que la ligne ${avant} : choisissez aussi la colonne de l’index de répétition.`);
    else vuesCle.set(l.cleEnvoi, l.numero);
  }

  // Déjà reçues : la clé est en base. Même contenu → « déjà reçue » ; sinon, erreur.
  const cles = lues.filter((l) => l.cleEnvoi && !l.erreurs.length).map((l) => l.cleEnvoi as string);
  const recues = new Map(
    (
      await lire<{ cle_envoi: string; commerce_id: string; date_levee: string; flux_code: string; voyage: number; statut: string }>(
        'SELECT cle_envoi, commerce_id, date_levee, flux_code, voyage, statut FROM levees WHERE commune_id = $1 AND cle_envoi = ANY ($2::text[])',
        [communeId, cles]
      )
    ).map((r) => [r.cle_envoi, r])
  );

  const aExaminer = lues.filter((l) => !l.erreurs.length && !recues.has(l.cleEnvoi as string));
  const examens = new Map(
    (
      await lire<{ n: number; code: string | null; message: string | null; flux_code: string | null; voyage: number | null }>(
        'SELECT * FROM app.examiner_levees($1, $2::jsonb)',
        [
          communeId,
          JSON.stringify(aExaminer.map((l) => ({ n: l.numero, commerce: l.commerceId, flux: l.fluxCode, jour: l.jour, voyage: l.voyage, circuit: l.circuitId }))),
        ]
      )
    ).map((e) => [e.n, e])
  );

  // Deux lignes du fichier pour la même levée (établissement, flux, jour, voyage).
  const vuesLevee = new Map<string, number>();
  return lues.map((l) => {
    let action: ActionLevee = 'erreur';
    const erreurs = [...l.erreurs];
    let fluxCode = l.fluxCode;
    let voyage = l.voyage;
    let statut: string | null = null;
    if (!erreurs.length) {
      const recue = recues.get(l.cleEnvoi as string);
      if (recue) {
        if (recue.commerce_id === l.commerceId && recue.date_levee === l.jour && (!l.fluxCode || recue.flux_code === l.fluxCode) && (!l.voyage || recue.voyage === l.voyage)) {
          action = 'deja_recue';
          fluxCode = recue.flux_code;
          voyage = recue.voyage;
          statut = recue.statut;
        } else {
          erreurs.push('cette soumission a déjà été reçue avec un autre contenu (modifiée dans Kobo après coup ?) : elle n’est pas proposée de nouveau.');
        }
      } else {
        const e = examens.get(l.numero);
        if (!e) erreurs.push('ligne non examinée.');
        else if (e.code) erreurs.push((e.message ?? e.code).replace(/^./, (c) => c.toUpperCase()));
        else {
          fluxCode = e.flux_code;
          voyage = e.voyage;
          const cle = `${l.commerceId}|${fluxCode}|${l.jour}|${voyage}`;
          const avant = vuesLevee.get(cle);
          if (avant) erreurs.push(`même levée que la ligne ${avant} (même établissement, flux, jour et voyage).`);
          else {
            vuesLevee.set(cle, l.numero);
            action = 'proposer';
          }
        }
      }
    }
    return {
      numero: l.numero,
      action,
      erreurs,
      etablissement: l.brut.etablissement,
      commerce_id: l.commerceId,
      date: l.jour ?? l.brut.date,
      heure: l.heure,
      flux_code: fluxCode,
      voyage,
      circuit_id: l.circuitId,
      statut,
      _ligne: l,
    };
  });
}

function resume(lignes: Array<{ action: ActionLevee }>) {
  return {
    proposer: lignes.filter((l) => l.action === 'proposer').length,
    deja_recue: lignes.filter((l) => l.action === 'deja_recue').length,
    erreur: lignes.filter((l) => l.action === 'erreur').length,
  };
}

const sansInterne = <T extends { _ligne: unknown }>(l: T) => {
  const { _ligne, ...reste } = l;
  void _ligne;
  return reste;
};

leveesRouter.post(
  '/import/colonnes',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const d = fichierLeveesSchema.parse(req.body);
    await exigerPerimetre(communeId);
    const f = lireTableur(d.contenu);
    const modele = await queryOne<{ correspondance: CorrespondanceLevees }>(
      'SELECT correspondance FROM modeles_import_levees WHERE commune_id = $1 AND deleted_at IS NULL',
      [communeId]
    );
    const { correspondance, provenance } = proposerCorrespondanceDe<ChampLevee>(CHAMPS_LEVEES, f.entetes, modele?.correspondance ?? null);
    res.json({
      fichier: d.nomFichier,
      feuille: f.feuille,
      avertissements: f.avertissements,
      ligneEntetes: f.ligneEntetes,
      lignes: f.rangees.length,
      entetes: f.entetes,
      exemples: f.rangees.slice(0, 3).map((r) => f.entetes.map((_, i) => r.cellules[i] ?? '')),
      champs: CHAMPS_LEVEES.map(({ cle, fr, ar, obligatoire }) => ({ cle, fr, ar, obligatoire })),
      correspondance,
      provenance,
      modeleEnregistre: Boolean(modele),
    });
  })
);

leveesRouter.post(
  '/import',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const d = importLeveesSchema.parse(req.body);
    await exigerPerimetre(communeId);
    const f = lireTableur(d.contenu);
    const xlsx = f.feuille !== null;
    const problemes = problemesCorrespondanceDe<ChampLevee>(CHAMPS_LEVEES, f.entetes, d.correspondance);
    if (problemes.length) throw new ApiError(400, `Correspondance des colonnes à revoir : ${problemes.join(' ')}`);
    const correspondance = Object.fromEntries(CLES_CHAMPS_LEVEES.map((c) => [c, d.correspondance[c] ?? null])) as CorrespondanceLevees;

    const racine = f.entetes.find((e) => ['meta rootuuid', 'rootuuid'].includes(formeEntete(e)));
    if (racine && correspondance.cle !== racine) {
      f.avertissements.push(
        `Le fichier porte « ${racine} », la clé qui ne change pas quand une soumission est modifiée dans Kobo ; la clé retenue est « ${correspondance.cle} » : une soumission modifiée y paraîtra nouvelle.`
      );
    }

    if (!d.valider) {
      const lignes = await examiner(horsTransaction, communeId, f, correspondance, xlsx);
      res.json({ fichier: d.nomFichier, feuille: f.feuille, avertissements: f.avertissements, resume: resume(lignes), lignes: lignes.map(sansInterne), ecrit: false });
      return;
    }

    try {
      const r = await withTransaction(async (client) => {
        // Le même verrou que toute écriture de levées de la commune : l'aperçu se
        // refait ici, dans l'état de la base à cet instant.
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('levees:' || $1))`, [communeId]);
        const lignes = await examiner(dans(client), communeId, f, correspondance, xlsx);
        const aProposer = lignes.filter((l) => l.action === 'proposer');
        if (aProposer.length === 0) {
          throw new ApiError(400, 'Rien à proposer : chaque ligne est déjà reçue ou porte une erreur (voir l’aperçu).');
        }
        const s = resume(lignes);
        const imp = await client.query<{ id: string }>(
          `INSERT INTO imports_levees (commune_id, nom_fichier, empreinte_fichier, correspondance, nb_proposees, nb_deja_recues, nb_erreurs, saisi_par)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, app.current_user_id()) RETURNING id`,
          [communeId, d.nomFichier, f.empreinte, JSON.stringify(correspondance), s.proposer, s.deja_recue, s.erreur]
        );
        const importId = imp.rows[0].id;
        await client.query(`SELECT * FROM app.enregistrer_levees($1, 'kobo', $2::jsonb, $3)`, [
          communeId,
          JSON.stringify(
            aProposer.map((l) => ({
              n: l.numero,
              commerce: l._ligne.commerceId,
              flux: l.flux_code,
              jour: l._ligne.jour,
              voyage: l.voyage,
              heure: l._ligne.heure,
              circuit: l._ligne.circuitId,
              cle: l._ligne.cleEnvoi,
              ligne: l.numero,
            }))
          ),
          importId,
        ]);
        await client.query(
          `INSERT INTO modeles_import_levees (commune_id, correspondance, saisi_par)
           VALUES ($1, $2::jsonb, app.current_user_id())
           ON CONFLICT (commune_id) WHERE deleted_at IS NULL
           DO UPDATE SET correspondance = EXCLUDED.correspondance, saisi_par = EXCLUDED.saisi_par, updated_at = now()`,
          [communeId, JSON.stringify(correspondance)]
        );
        return { lignes, importId, s };
      });
      res.status(201).json({
        fichier: d.nomFichier,
        feuille: f.feuille,
        avertissements: f.avertissements,
        resume: r.s,
        lignes: r.lignes.map(sansInterne),
        ecrit: true,
        importId: r.importId,
        proposees: r.s.proposer,
      });
    } catch (err) {
      refus(err);
    }
  })
);

// ---------------------------------------------------------------------------
// Les chemins à identifiant, après les littéraux
// ---------------------------------------------------------------------------
leveesRouter.post(
  '/:id/annuler',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new ApiError(404, 'Levée introuvable.');
    const d = annulationLeveeSchema.parse(req.body);
    try {
      await withTransaction(async (client) => client.query('SELECT id FROM app.annuler_levee($1, $2)', [id.data, d.motif]));
      const [l] = await query(`${SELECT_LEVEES} WHERE l.id = $1`, [id.data]);
      res.json(l);
    } catch (err) {
      refus(err);
    }
  })
);
