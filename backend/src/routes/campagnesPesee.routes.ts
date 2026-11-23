// Les campagnes de pesée et les densités des assimilés (jalon G, lot G5b, migration 106).
//
//   GET    /campagnes-pesee?communeId=…                la liste des campagnes
//   POST   /campagnes-pesee?communeId=…                une campagne en brouillon (établissements ou ménages)
//   POST   /campagnes-pesee/pesees/{id}/annuler        une pesée annulée, avec son motif (campagne ouverte)
//   GET    /campagnes-pesee/{id}                       la campagne, ses résultats et ses écartés (une fois close)
//   PUT    /campagnes-pesee/{id}                       le brouillon modifié, ou la fin prévue d'une campagne ouverte (version lue)
//   DELETE /campagnes-pesee/{id}?version=…             un brouillon retiré
//   POST   /campagnes-pesee/{id}/ouvrir | /clore       les gestes (version lue) ; la clôture calcule et fige
//   GET    /campagnes-pesee/{id}/pesees                les pesées
//   POST   /campagnes-pesee/{id}/pesees                un lot de pesées saisies au portail
//   GET    /campagnes-pesee/{id}/menages               l'échantillon de ménages (le directeur seul)
//   POST   /campagnes-pesee/{id}/menages               un ménage : habitants et tranche ; la base pose son code
//   POST   /campagnes-pesee/{id}/import/colonnes       les colonnes d'un export Kobo et la correspondance proposée
//   POST   /campagnes-pesee/{id}/import                l'aperçu, puis l'écriture (valider: true)
//   GET    /campagnes-pesee/{id}/imports               le journal des imports
//   POST   /campagnes-pesee/{id}/adopter               la densité d'une catégorie adoptée par la commune
//   GET    /densites-assimiles?communeId=…             les densités de la commune et du pays
//   POST   /densites-assimiles?communeId=…             une densité saisie (TADAEEM ou défaut, avec sa pièce)
//   POST   /densites-assimiles/{id}/retirer            une densité retirée, avec son motif
//
// LE CALCUL EST CELUI DE LA BASE (app.calculer_campagne), à la clôture, figé : la
// route ne fait que lire les résultats. Une pesée et une campagne obéissent à leurs
// déclencheurs ; la route traduit leurs refus en mots.
//
// Le directeur de la commune écrit ; la FNCT lit (jamais un ménage) et tient les
// densités du pays ; un prestataire ne voit rien.

import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeRequise } from '../perimetre.js';
import { formeEntete, lireTableur, problemesCorrespondanceDe, proposerCorrespondanceDe } from '../services/tableur.js';
import {
  CHAMPS_PESEES,
  CLES_CHAMPS_PESEES,
  lirePesees,
  problemesDuree,
  type ChampPesee,
  type CorrespondancePesees,
  type EtablissementConnu,
} from '../services/importPesees.js';

export const campagnesPeseeRouter = Router();
export const densitesAssimilesRouter = Router();

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
const versionLue = z.string().regex(/^\d{1,20}$/, 'La version de la campagne lue est attendue : rouvrez-la, puis recommencez.');
const motif = texte(5, 500, 'Motif');

export const OBJETS_CAMPAGNE = ['etablissements', 'menages'] as const;
export const STATUTS_CAMPAGNE = ['brouillon', 'ouverte', 'close'] as const;
export const TRANCHES_REVENU = ['bas', 'moyen', 'eleve'] as const;
export const SOURCES_DENSITE = ['campagne', 'tadaeem', 'defaut'] as const;

export const campagneSchema = z
  .object({
    objet: z.enum(OBJETS_CAMPAGNE),
    intitule: texte(3, 200, 'Intitulé'),
    protocole: texte(1, 2000, 'Protocole').nullable().optional(),
    dateDebut: dateIso,
    dateFin: dateIso,
    observation: texte(1, 1000, 'Observation').nullable().optional(),
  })
  .strict();
export const modificationCampagneSchema = z
  .object({
    version: versionLue,
    intitule: texte(3, 200, 'Intitulé').optional(),
    protocole: texte(1, 2000, 'Protocole').nullable().optional(),
    dateDebut: dateIso.optional(),
    dateFin: dateIso.optional(),
    observation: texte(1, 1000, 'Observation').nullable().optional(),
  })
  .strict();
export const versionCampagneSchema = z.object({ version: versionLue }).strict();

const nombre = (min: number, max: number, libelle: string) =>
  z.number({ invalid_type_error: `${libelle} : un nombre attendu.` }).gt(min, `${libelle} : plus de ${min}.`).max(max, `${libelle} : ${max} au plus.`);
// Jamais plus de décimales que la colonne n'en garde : la base arrondirait en silence,
// et un remplissage de 0,04 % deviendrait 0, refusé pour tout le lot.
const auPlusDecimales = (d: number) => (n: number) => Math.abs(n - Number(n.toFixed(d))) <= 1e-9 * Math.max(1, Math.abs(n));
const nombreDecimal = (min: number, max: number, libelle: string, d: number) =>
  nombre(min, max, libelle).refine(auPlusDecimales(d), `${libelle} : ${d} décimale${d > 1 ? 's' : ''} au plus.`);
export const peseeSchema = z
  .object({
    commerceId: z.string().uuid('Établissement : identifiant attendu.').optional(),
    menageId: z.string().uuid('Ménage : identifiant attendu.').optional(),
    date: dateIso,
    poidsKg: nombreDecimal(0, 5000, 'Poids (kg)', 3),
    dureeJours: nombreDecimal(0, 31, 'Durée couverte (jours)', 6),
    contenant: texte(1, 60, 'Contenant').nullable().optional(),
    volumeLitres: nombreDecimal(0, 30000, 'Volume du contenant (L)', 1).nullable().optional(),
    remplissagePct: nombreDecimal(0, 100, 'Remplissage (%)', 1).nullable().optional(),
    // Une clé de machine, jamais un texte : une pesée de ménage n'a aucun champ où glisser un nom.
    cle: z.string().trim().regex(/^[A-Za-z0-9_-]{8,64}$/, 'Clé d’envoi : de 8 à 64 lettres, chiffres, tirets ou soulignés (un identifiant posé par l’écran).'),
  })
  .strict()
  .refine((p) => Boolean(p.commerceId) !== Boolean(p.menageId), { message: 'Une pesée vise un établissement OU un ménage.', path: ['commerceId'] });
export const lotPeseesSchema = z
  .object({ pesees: z.array(peseeSchema).min(1, 'Au moins une pesée.').max(500, 'Au plus 500 pesées par envoi.') })
  .strict();
export const annulationPeseeSchema = z.object({ motif }).strict();
export const menageSchema = z
  .object({
    habitants: z.number().int('Un nombre entier d’habitants.').min(1, 'Au moins un habitant.').max(30, 'Au plus 30 habitants.'),
    trancheRevenu: z.enum(TRANCHES_REVENU),
  })
  .strict();
export const adoptionSchema = z.object({ categorie: z.string().trim().regex(/^[a-z][a-z0-9_]{2,60}$/, 'Catégorie : un code de la liste nationale.') }).strict();
export const densiteSchema = z
  .object({
    portee: z.enum(['commune', 'nationale']),
    categorie: z.string().trim().regex(/^[a-z][a-z0-9_]{2,60}$/, 'Catégorie : un code de la liste nationale.'),
    densiteMin: nombre(0, 2000, 'Densité minimale (kg/m³)'),
    densiteMax: nombre(0, 2000, 'Densité maximale (kg/m³)'),
    mediane: nombre(0, 2000, 'Médiane (kg/m³)').nullable().optional(),
    source: z.enum(['tadaeem', 'defaut']),
    reference: texte(5, 300, 'Pièce de référence'),
    dateEffet: dateIso,
  })
  .strict()
  .refine((d) => d.densiteMin <= d.densiteMax, { message: 'La densité minimale ne dépasse pas la maximale.', path: ['densiteMin'] });
export const retraitDensiteAssimilesSchema = z.object({ motif }).strict();

export const fichierPeseesSchema = z
  .object({
    nomFichier: texte(1, 255, 'Nom du fichier'),
    contenu: z.string().min(1, 'Le fichier est vide.').max(8_000_000, 'Fichier trop volumineux (6 Mo au plus).').regex(/^[A-Za-z0-9+/=\s]+$/, 'Contenu attendu en base64.'),
  })
  .strict();
const correspondancePeseesSchema = z
  .object(
    Object.fromEntries(CLES_CHAMPS_PESEES.map((c) => [c, z.string().max(300).refine(sansOctetNul, OCTET_NUL).nullable().optional()])) as Record<
      ChampPesee,
      z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>
    >
  )
  .strict();
export const importPeseesSchema = fichierPeseesSchema.extend({ correspondance: correspondancePeseesSchema, valider: z.boolean().default(false) }).strict();

export const qCampagnes = z.object({ communeId: z.string().optional() });

const ACTE_DE_LA_COMMUNE = 'La commune mène ses campagnes de pesée et adopte ses densités ; la FNCT les lit.';
const fnctLitSeulement = (req: Request, _res: Response, next: NextFunction) =>
  next(req.user?.role === 'super_admin_fnct' ? new ApiError(403, ACTE_DE_LA_COMMUNE) : undefined);
const directeurSeul = [requireAuth, fnctLitSeulement, requireRole('admin_commune')];
const lecteurs = [requireAuth, requireRole('admin_commune', 'super_admin_fnct')];

const REFUS: Record<string, number> = {
  CAMPAGNE_NAISSANCE: 400,
  CAMPAGNE_FIGEE: 409,
  CAMPAGNE_TRANSITION: 409,
  CAMPAGNE_VERSION: 409,
  CAMPAGNE_PESEES_APRES: 409,
  CAMPAGNE_VIDE: 409,
  CAMPAGNE_SEUIL_ABSENT: 409,
  MENAGE_CAMPAGNE: 409,
  MENAGE_FIGE: 409,
  PESEE_FIGEE: 409,
  PESEE_CAMPAGNE: 409,
  PESEE_FUTURE: 400,
  PESEE_PERIODE: 400,
  PESEE_CIBLE: 400,
  PESEE_ETABLISSEMENT: 400,
  PESEE_CATEGORIE_REQUISE: 409,
  ETABLISSEMENT_FERME: 409,
  PESEE_DUREE_DU_JOUR: 409,
  PESEE_DENSITE: 400,
  PESEE_SOURCE: 400,
  PESEE_AUCUNE: 400,
  PESEE_CLE_REUTILISEE: 409,
  PESEE_DEJA_ANNULEE: 409,
  PESEE_MOTIF: 400,
  DENSITE_CATEGORIE: 400,
  DENSITE_FIGEE: 409,
  DENSITE_ADOPTION: 409,
  DENSITE_SOUS_SEUIL: 409,
  DENSITE_EXISTANTE: 409,
  DENSITE_MOTIF: 400,
};
const CONTRAINTES: Record<string, string> = {
  campagnes_periode: 'Une campagne dure au plus 61 jours, et finit après son début.',
  campagnes_intitule: 'Intitulé : de 3 à 200 caractères.',
  pesees_campagne_menage: 'Une pesée de ménage ne porte que son poids et sa durée.',
  pesees_campagne_poids: 'Poids : de plus de 0 à 5 000 kg (3 décimales au plus).',
  pesees_campagne_duree: 'Durée couverte : de plus de 0 à 31 jours.',
  pesees_campagne_volume: 'Volume du contenant : de plus de 0 à 30 000 L (1 décimale au plus).',
  pesees_campagne_remplissage: 'Remplissage : de plus de 0 à 100 % (1 décimale au plus).',
  densites_assimiles_bornes: 'La densité minimale ne dépasse pas la maximale, ni 2 000 kg/m³ ; la médiane est entre les deux.',
  densites_assimiles_origine: 'Une densité saisie cite sa pièce de référence ; une densité de campagne s’adopte depuis la campagne.',
};

function refus(err: unknown): never {
  if (err instanceof ApiError) throw err;
  const e = err as { message?: string; constraint?: string; code?: string };
  if (e.code === '42501' || e.code === 'P0002' ||
      ['CAMPAGNE_HORS_PERIMETRE', 'CAMPAGNE_INTROUVABLE', 'PESEE_INTROUVABLE', 'DENSITE_HORS_PERIMETRE', 'DENSITE_INTROUVABLE'].includes(e.message ?? '')) {
    throw new ApiError(404, 'Campagne, pesée, densité ou commune introuvable.');
  }
  if (e.constraint === 'uq_densites_assimiles') throw new ApiError(409, 'Une densité de cette catégorie vaut déjà à cette date : retirez-la d’abord, avec son motif.');
  if (e.constraint === 'uq_pesees_campagne_cle') throw new ApiError(409, 'Cette clé d’envoi a déjà servi : rien n’est enregistré.');
  if (e.constraint && CONTRAINTES[e.constraint]) throw new ApiError(400, CONTRAINTES[e.constraint]);
  // Un ratio hors des colonnes : des pesées absurdes, qu'il faut retrouver et annuler.
  if (e.code === '22003') throw new ApiError(409, 'Un résultat dépasse ce que la base peut garder : une pesée porte un poids, un volume ou une durée absurde ; retrouvez-la dans la liste et annulez-la.');
  const code = e.message?.match(/^([A-Z_]+): /)?.[1];
  if (code && REFUS[code]) {
    const t = (e.message as string).slice(code.length + 2);
    throw new ApiError(REFUS[code], t.charAt(0).toUpperCase() + t.slice(1));
  }
  throw err;
}

const estUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const idRequis = (s: string, quoi = 'Campagne') => {
  if (!estUuid(s)) throw new ApiError(404, `${quoi} introuvable.`);
  return s;
};
/** Une campagne que l'appelant ne lit pas est introuvable : sa liste n'est pas « vide ». */
async function campagneLisible(id: string) {
  if (!(await queryOne('SELECT 1 FROM campagnes_pesee WHERE id = $1 AND deleted_at IS NULL', [idRequis(id)]))) throw new ApiError(404, 'Campagne introuvable.');
  return id;
}

export const SELECT_CAMPAGNES = `
  SELECT c.id, c.xmin::text AS version, c.commune_id, c.objet, c.intitule, c.protocole, c.date_debut, c.date_fin, c.statut,
         c.ouverte_le, c.close_le, c.seuil_applique, c.observation, c.created_at, c.updated_at,
         ef.pesees, ef.etablissements, ef.menages
    FROM campagnes_pesee c
    -- Des comptes lus par la base : sous la RLS, la FNCT lirait « 0 ménage » dans une
    -- campagne de ménages qui en compte, un zéro à la place d'une donnée qu'elle ne lit pas.
    CROSS JOIN LATERAL app.effectifs_campagne(c.id) ef`;

async function lireCampagne(id: string) {
  const c = await queryOne<Record<string, unknown> & { statut: string }>(`${SELECT_CAMPAGNES} WHERE c.id = $1 AND c.deleted_at IS NULL`, [id]);
  if (!c) throw new ApiError(404, 'Campagne introuvable.');
  const resultats = await query(
    `SELECT r.groupe, r.sous_groupe, r.indicateur, r.n, r.q1::float8 AS q1, r.mediane::float8 AS mediane, r.q3::float8 AS q3,
            r.seuil_atteint, r.masque,
            EXISTS (SELECT 1 FROM densites_assimiles d WHERE d.campagne_id = r.campagne_id AND d.categorie_activite = r.groupe AND d.retire_le IS NULL) AS adoptee
       FROM resultats_campagne r WHERE r.campagne_id = $1
      ORDER BY r.groupe, r.indicateur, r.sous_groupe`,
    [id]
  );
  // Les écartés se comptent par raison ; la liste nominative des établissements se
  // lit avec leurs mesures, celle des ménages n'est jamais rendue.
  const ecartes = await query('SELECT groupe, indicateur, raison, nombre FROM app.ecartes_campagne($1)', [id]);
  const mesures = await query(
    `SELECT m.commerce_id, co.nom AS etablissement, m.groupe, m.sous_groupe, m.indicateur, m.valeur::float8 AS valeur, m.raison_ecart
       FROM mesures_campagne m JOIN commerces co ON co.id = m.commerce_id
      WHERE m.campagne_id = $1 AND m.commerce_id IS NOT NULL
      ORDER BY m.groupe, m.indicateur, lower(co.nom)`,
    [id]
  );
  return { ...c, resultats, ecartes, mesures };
}

campagnesPeseeRouter.get(
  '/',
  ...lecteurs,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    res.json(await query(`${SELECT_CAMPAGNES} WHERE c.commune_id = $1 AND c.deleted_at IS NULL ORDER BY c.date_debut DESC, c.created_at DESC`, [communeId]));
  })
);

campagnesPeseeRouter.post(
  '/',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const d = campagneSchema.parse(req.body);
    try {
      const [r] = await query<{ id: string }>(
        `INSERT INTO campagnes_pesee (commune_id, objet, intitule, protocole, date_debut, date_fin, observation)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [communeId, d.objet, d.intitule, d.protocole || null, d.dateDebut, d.dateFin, d.observation || null]
      );
      res.status(201).json(await lireCampagne(r.id));
    } catch (err) {
      refus(err);
    }
  })
);

// Les chemins littéraux avant /:id.
campagnesPeseeRouter.post(
  '/pesees/:id/annuler',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = idRequis(req.params.id, 'Pesée');
    const d = annulationPeseeSchema.parse(req.body);
    try {
      const p = await withTransaction(async (client) => (await client.query('SELECT id, campagne_id, statut FROM app.annuler_pesee($1, $2)', [id, d.motif])).rows[0]);
      res.json(p);
    } catch (err) {
      refus(err);
    }
  })
);

campagnesPeseeRouter.get(
  '/:id',
  ...lecteurs,
  asyncHandler(async (req, res) => {
    res.json(await lireCampagne(idRequis(req.params.id)));
  })
);

campagnesPeseeRouter.put(
  '/:id',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = idRequis(req.params.id);
    const d = modificationCampagneSchema.parse(req.body);
    try {
      await withTransaction(async (client) => {
        const lue = await client.query<{ version: string }>(
          'SELECT xmin::text AS version FROM campagnes_pesee WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
          [id]
        );
        if (lue.rowCount === 0) throw new ApiError(404, 'Campagne introuvable.');
        if (lue.rows[0].version !== d.version) throw new ApiError(409, 'Cette campagne a changé depuis que vous l’avez ouverte : elle est à jour, recommencez.');
        const champs: Array<[string, unknown]> = [];
        if (d.intitule !== undefined) champs.push(['intitule', d.intitule]);
        if (d.protocole !== undefined) champs.push(['protocole', d.protocole || null]);
        if (d.dateDebut !== undefined) champs.push(['date_debut', d.dateDebut]);
        if (d.dateFin !== undefined) champs.push(['date_fin', d.dateFin]);
        if (d.observation !== undefined) champs.push(['observation', d.observation || null]);
        if (champs.length === 0) return;
        await client.query(
          `UPDATE campagnes_pesee SET ${champs.map(([c], i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`,
          [id, ...champs.map(([, v]) => v)]
        );
      });
      res.json(await lireCampagne(id));
    } catch (err) {
      refus(err);
    }
  })
);

campagnesPeseeRouter.delete(
  '/:id',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = idRequis(req.params.id);
    const version = versionLue.parse(req.query.version);
    try {
      await withTransaction(async (client) => {
        const lue = await client.query<{ version: string }>('SELECT xmin::text AS version FROM campagnes_pesee WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
        if (lue.rowCount === 0) throw new ApiError(404, 'Campagne introuvable.');
        if (lue.rows[0].version !== version) throw new ApiError(409, 'Cette campagne a changé depuis que vous l’avez ouverte : elle est à jour, recommencez.');
        await client.query(`SELECT app.supprimer('campagnes_pesee', $1)`, [id]);
      });
      res.status(204).end();
    } catch (err) {
      refus(err);
    }
  })
);

for (const [geste, fonction] of [['ouvrir', 'app.ouvrir_campagne'], ['clore', 'app.clore_campagne']] as const) {
  campagnesPeseeRouter.post(
    `/:id/${geste}`,
    ...directeurSeul,
    asyncHandler(async (req, res) => {
      const id = idRequis(req.params.id);
      const d = versionCampagneSchema.parse(req.body);
      try {
        await withTransaction(async (client) => client.query(`SELECT id FROM ${fonction}($1, $2)`, [id, d.version]));
        res.json(await lireCampagne(id));
      } catch (err) {
        refus(err);
      }
    })
  );
}

campagnesPeseeRouter.get(
  '/:id/pesees',
  ...lecteurs,
  asyncHandler(async (req, res) => {
    const id = await campagneLisible(req.params.id);
    res.json(
      await query(
        `SELECT p.id, p.commerce_id, co.nom AS etablissement, p.menage_id, m.code AS menage, p.date_pesee, p.jour_campagne,
                p.poids_kg::float8 AS poids_kg, p.duree_jours::float8 AS duree_jours, p.contenant, p.volume_litres::float8 AS volume_litres,
                p.remplissage_pct::float8 AS remplissage_pct, p.categorie_activite, p.unite_echelle, p.valeur_echelle::float8 AS valeur_echelle,
                p.source, p.statut, p.motif_annulation, p.import_id, p.import_ligne, p.created_at
           FROM pesees_campagne p
           LEFT JOIN commerces co ON co.id = p.commerce_id
           LEFT JOIN menages_echantillon m ON m.id = p.menage_id
          WHERE p.campagne_id = $1
          ORDER BY p.date_pesee DESC, lower(COALESCE(co.nom, m.code)), p.created_at`,
        [id]
      )
    );
  })
);

campagnesPeseeRouter.post(
  '/:id/pesees',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = idRequis(req.params.id);
    const d = lotPeseesSchema.parse(req.body);
    const lignes = d.pesees.map((p, i) => ({
      n: i + 1,
      commerce: p.commerceId ?? null,
      menage: p.menageId ?? null,
      jour: p.date,
      poids: p.poidsKg,
      duree: p.dureeJours,
      contenant: p.contenant ?? null,
      volume: p.volumeLitres ?? null,
      remplissage: p.remplissagePct ?? null,
      cle: `portail:${p.cle}`,
    }));
    try {
      const ecrites = await withTransaction(
        async (client) => (await client.query(`SELECT * FROM app.enregistrer_pesees($1, 'portail', $2::jsonb, NULL)`, [id, JSON.stringify(lignes)])).rows
      );
      res.status(201).json({ pesees: ecrites });
    } catch (err) {
      refus(err);
    }
  })
);

campagnesPeseeRouter.get(
  '/:id/menages',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = await campagneLisible(req.params.id);
    res.json(
      await query(
        `SELECT m.id, m.code, m.habitants, m.tranche_revenu,
                (SELECT count(*)::int FROM pesees_campagne p WHERE p.menage_id = m.id AND p.statut = 'valide') AS pesees
           FROM menages_echantillon m WHERE m.campagne_id = $1 ORDER BY m.rang`,
        [id]
      )
    );
  })
);

campagnesPeseeRouter.post(
  '/:id/menages',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = idRequis(req.params.id);
    const d = menageSchema.parse(req.body);
    try {
      const [m] = await query<{ id: string; code: string }>(
        `INSERT INTO menages_echantillon (campagne_id, commune_id, habitants, tranche_revenu)
         SELECT c.id, c.commune_id, $2, $3 FROM campagnes_pesee c WHERE c.id = $1 AND c.deleted_at IS NULL
         RETURNING id, code, habitants, tranche_revenu`,
        [id, d.habitants, d.trancheRevenu]
      );
      if (!m) throw new ApiError(404, 'Campagne introuvable.');
      res.status(201).json(m);
    } catch (err) {
      refus(err);
    }
  })
);

campagnesPeseeRouter.post(
  '/:id/adopter',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = idRequis(req.params.id);
    const d = adoptionSchema.parse(req.body);
    try {
      const densite = await withTransaction(async (client) => (await client.query('SELECT * FROM app.adopter_densite($1, $2)', [id, d.categorie])).rows[0]);
      res.status(201).json(await lireDensite(densite.id));
    } catch (err) {
      refus(err);
    }
  })
);

// ---------------------------------------------------------------------------
// L'import d'un export Kobo (campagne d'établissements ouverte)
// ---------------------------------------------------------------------------
type Lecteur = <T>(sql: string, params?: unknown[]) => Promise<T[]>;
const horsTransaction: Lecteur = (sql, params = []) => query(sql, params as never[]);
const dans = (client: PoolClient): Lecteur => async (sql, params = []) => (await client.query(sql, params as never[])).rows;

type CampagneLue = { id: string; commune_id: string; objet: string; statut: string; date_debut: string; date_fin: string };
async function campagneImportable(lire: Lecteur, id: string): Promise<CampagneLue> {
  const [c] = await lire<CampagneLue>(
    'SELECT id, commune_id, objet, statut, date_debut, date_fin FROM campagnes_pesee WHERE id = $1 AND deleted_at IS NULL AND app.peut_emettre_document(commune_id)',
    [id]
  );
  if (!c) throw new ApiError(404, 'Campagne introuvable.');
  if (c.objet !== 'etablissements') throw new ApiError(409, 'Seules les pesées d’établissements s’importent ; une campagne de ménages n’a, pour l’instant, que son modèle.');
  if (c.statut !== 'ouverte') throw new ApiError(409, 'Une pesée s’importe dans une campagne ouverte.');
  return c;
}

export type ActionPesee = 'enregistrer' | 'deja_recue' | 'erreur';

/** Chaque ligne lue, puis confrontée à la campagne et à ce que la base sait, sans rien écrire. */
async function examiner(lire: Lecteur, c: CampagneLue, f: ReturnType<typeof lireTableur>, correspondance: CorrespondancePesees, xlsx: boolean) {
  const etablissements = await lire<EtablissementConnu & { nom: string; statut: string; ferme_le: string | null; categorie_activite: string | null }>(
    'SELECT id, matricule_fiscal, nom, statut, ferme_le, categorie_activite FROM commerces WHERE commune_id = $1 AND deleted_at IS NULL',
    [c.commune_id]
  );
  const parId = new Map(etablissements.map((e) => [e.id, e]));
  const lues = lirePesees({ entetes: f.entetes, rangees: f.rangees, correspondance, xlsx, calendrier1904: f.calendrier1904, etablissements });
  const jour = (await lire<{ j: string }>('SELECT app.jour_tunis()::text AS j'))[0].j;
  type Existante = {
    cle_envoi: string; commerce_id: string; date_pesee: string; poids_kg: string; duree_jours: string; volume_litres: string | null;
    remplissage_pct: string | null; contenant: string | null; campagne_id: string; statut: string; source: string;
  };
  const existantes = await lire<Existante>(
    `SELECT cle_envoi, commerce_id, date_pesee, poids_kg::text, duree_jours::text, volume_litres::text, remplissage_pct::text, contenant,
            campagne_id, statut, source
       FROM pesees_campagne WHERE commune_id = $1 AND (cle_envoi = ANY ($2::text[]) OR (campagne_id = $3 AND statut = 'valide'))`,
    [c.commune_id, lues.map((l) => l.cleEnvoi).filter(Boolean), c.id]
  );
  const parCle = new Map(existantes.map((e) => [e.cle_envoi, e]));
  const valides = existantes.filter((e) => e.campagne_id === c.id && e.statut === 'valide');
  // Les durées déjà enregistrées pour un établissement un jour donné : celles des pesées
  // valides seulement — une pesée annulée pour sa durée ne bloque pas sa correction.
  const dureeDuJour = new Map<string, number>();
  for (const e of valides) dureeDuJour.set(`${e.commerce_id}|${e.date_pesee}`, Number(e.duree_jours));
  // Les nombres se comparent sous la forme que la base leur donne (numeric), jamais en flottant.
  const enBase = (n: number | null, d: number) => (n === null ? null : n.toFixed(d));
  const memeNombre = (base: string | null, lu: number | null, d: number) =>
    base === null || lu === null ? base === lu : Number(base).toFixed(d) === enBase(lu, d);
  const memeContenu = (e: Existante, l: (typeof lues)[number]) =>
    e.campagne_id === c.id && e.commerce_id === l.commerceId && e.date_pesee === l.jour &&
    memeNombre(e.poids_kg, l.poids, 3) && Number(e.duree_jours) === l.duree &&
    memeNombre(e.volume_litres, l.volume, 1) && memeNombre(e.remplissage_pct, l.remplissage, 1) && (e.contenant ?? null) === (l.contenant ?? null);
  // Une même pesée sous une autre clé (soumission recréée dans Kobo, autre colonne de
  // clé) s'additionnerait à la première : elle est montrée, jamais fusionnée.
  const signature = (commerce: string | null, jour: string | null, poids: number | null, duree: number | null) =>
    `${commerce}|${jour}|${enBase(poids, 3)}|${duree}`;
  const parSignature = new Map<string, Existante>();
  for (const e of valides) if (e.source === 'kobo') parSignature.set(signature(e.commerce_id, e.date_pesee, Number(e.poids_kg), Number(e.duree_jours)), e);
  const vuesCle = new Map<string, number>();

  return lues.map((l) => {
    const erreurs = [...l.erreurs];
    let action: ActionPesee = 'erreur';
    if (!erreurs.length && l.cleEnvoi) {
      const avant = vuesCle.get(l.cleEnvoi);
      if (avant) erreurs.push(`même clé que la ligne ${avant} : choisissez aussi la colonne du rang de répétition.`);
      else vuesCle.set(l.cleEnvoi, l.numero);
    }
    if (!erreurs.length) {
      const recue = parCle.get(l.cleEnvoi as string);
      if (recue) {
        if (memeContenu(recue, l)) {
          action = 'deja_recue';
        } else {
          erreurs.push('cette soumission a déjà été reçue avec un autre contenu (modifiée dans Kobo après coup ?) : elle n’est pas enregistrée de nouveau.');
        }
      } else {
        const e = parId.get(l.commerceId as string);
        const j = l.jour as string;
        if (j > jour) erreurs.push(`une pesée se constate après coup : le ${j} n’est pas encore arrivé.`);
        else if (j < c.date_debut || j > c.date_fin) erreurs.push(`la campagne court du ${c.date_debut} au ${c.date_fin} : le ${j} n’en fait pas partie.`);
        else if (e?.statut === 'ferme' && e.ferme_le && e.ferme_le <= j) erreurs.push(`« ${e.nom} » est fermé depuis le ${e.ferme_le}.`);
        else if (e && !e.categorie_activite) erreurs.push(`« ${e.nom} » n’a pas de catégorie d’activité.`);
        else {
          const cle = `${l.commerceId}|${j}`;
          const d = dureeDuJour.get(cle);
          const jumelle = parSignature.get(signature(l.commerceId, j, l.poids, l.duree));
          if (d !== undefined && d !== l.duree) erreurs.push(`une pesée du ${j} de cet établissement couvre déjà ${d} jour(s) : les pesées d’un même jour couvrent la même durée.`);
          else if (jumelle) {
            erreurs.push(
              `doublon probable : une pesée importée du même établissement, du même jour, de même poids et de même durée est déjà enregistrée sous une autre clé (« ${jumelle.cle_envoi.replace(/^kobo:/, '')} ») ; ` +
                'si ce sont deux pesées distinctes, saisissez celle-ci au portail.'
            );
          } else {
            dureeDuJour.set(cle, l.duree as number);
            action = 'enregistrer';
          }
        }
      }
    }
    return { numero: l.numero, action, erreurs, etablissement: l.etablissement, commerce_id: l.commerceId, date: l.jour, poids_kg: l.poids, duree_jours: l.duree, _ligne: l };
  });
}

const resume = (lignes: Array<{ action: ActionPesee }>) => ({
  enregistrer: lignes.filter((l) => l.action === 'enregistrer').length,
  deja_recue: lignes.filter((l) => l.action === 'deja_recue').length,
  erreur: lignes.filter((l) => l.action === 'erreur').length,
});
const sansInterne = <T extends { _ligne: unknown }>(l: T) => {
  const { _ligne, ...reste } = l;
  void _ligne;
  return reste;
};

campagnesPeseeRouter.post(
  '/:id/import/colonnes',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = idRequis(req.params.id);
    const d = fichierPeseesSchema.parse(req.body);
    const c = await campagneImportable(horsTransaction, id);
    const f = lireTableur(d.contenu);
    const modele = await queryOne<{ correspondance: CorrespondancePesees }>(
      'SELECT correspondance FROM modeles_import_pesees WHERE commune_id = $1 AND deleted_at IS NULL',
      [c.commune_id]
    );
    const { correspondance, provenance } = proposerCorrespondanceDe<ChampPesee>(CHAMPS_PESEES, f.entetes, modele?.correspondance ?? null);
    res.json({
      fichier: d.nomFichier,
      feuille: f.feuille,
      avertissements: f.avertissements,
      ligneEntetes: f.ligneEntetes,
      lignes: f.rangees.length,
      entetes: f.entetes,
      exemples: f.rangees.slice(0, 3).map((r) => f.entetes.map((_, i) => r.cellules[i] ?? '')),
      champs: CHAMPS_PESEES.map(({ cle, fr, ar, obligatoire }) => ({ cle, fr, ar, obligatoire })),
      correspondance,
      provenance,
      modeleEnregistre: Boolean(modele),
    });
  })
);

campagnesPeseeRouter.post(
  '/:id/import',
  ...directeurSeul,
  asyncHandler(async (req, res) => {
    const id = idRequis(req.params.id);
    const d = importPeseesSchema.parse(req.body);
    await campagneImportable(horsTransaction, id);
    const f = lireTableur(d.contenu);
    const xlsx = f.feuille !== null;
    const problemes = [...problemesCorrespondanceDe<ChampPesee>(CHAMPS_PESEES, f.entetes, d.correspondance), ...problemesDuree(d.correspondance)];
    if (problemes.length) throw new ApiError(400, `Correspondance des colonnes à revoir : ${problemes.join(' ')}`);
    const correspondance = Object.fromEntries(CLES_CHAMPS_PESEES.map((k) => [k, d.correspondance[k] ?? null])) as CorrespondancePesees;
    // Changer de colonne de clé en cours de campagne ferait revenir chaque pesée déjà
    // importée « à enregistrer », et ses kilos compteraient deux fois.
    const precedent = await queryOne<{ cle: string | null }>(
      `SELECT correspondance->>'cle' AS cle FROM imports_pesees WHERE campagne_id = $1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1`,
      [id]
    );
    if (precedent?.cle && precedent.cle !== correspondance.cle) {
      throw new ApiError(
        409,
        `Les pesées de cette campagne ont été importées avec la clé « ${precedent.cle} » : gardez cette colonne jusqu’à la clôture, ` +
          `sans quoi chaque pesée déjà reçue reviendrait comme nouvelle et compterait deux fois.`
      );
    }
    const racine = f.entetes.find((e) => ['meta rootuuid', 'rootuuid'].includes(formeEntete(e)));
    if (racine && correspondance.cle !== racine) {
      f.avertissements.push(
        `Le fichier porte « ${racine} », la clé qui ne change pas quand une soumission est modifiée dans Kobo ; la clé retenue est « ${correspondance.cle} » : une soumission modifiée y paraîtra nouvelle. ` +
          'Choisissez-la au premier import d’une campagne : on n’en change plus ensuite.'
      );
    }

    if (!d.valider) {
      const c = await campagneImportable(horsTransaction, id);
      const lignes = await examiner(horsTransaction, c, f, correspondance, xlsx);
      res.json({ fichier: d.nomFichier, feuille: f.feuille, avertissements: f.avertissements, resume: resume(lignes), lignes: lignes.map(sansInterne), ecrit: false });
      return;
    }
    try {
      const r = await withTransaction(async (client) => {
        // La campagne, verrouillée en lecture : sa clôture attend la fin de l'import.
        await client.query('SELECT 1 FROM campagnes_pesee WHERE id = $1 FOR SHARE', [id]);
        const c = await campagneImportable(dans(client), id);
        const lignes = await examiner(dans(client), c, f, correspondance, xlsx);
        const aEcrire = lignes.filter((l) => l.action === 'enregistrer');
        if (aEcrire.length === 0) throw new ApiError(400, 'Rien à enregistrer : chaque ligne est déjà reçue ou porte une erreur (voir l’aperçu).');
        const s = resume(lignes);
        const imp = await client.query<{ id: string }>(
          `INSERT INTO imports_pesees (commune_id, campagne_id, nom_fichier, empreinte_fichier, correspondance, nb_enregistrees, nb_deja_recues, nb_erreurs, saisi_par)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, app.current_user_id()) RETURNING id`,
          [c.commune_id, id, d.nomFichier, f.empreinte, JSON.stringify(correspondance), s.enregistrer, s.deja_recue, s.erreur]
        );
        const importId = imp.rows[0].id;
        await client.query(`SELECT * FROM app.enregistrer_pesees($1, 'kobo', $2::jsonb, $3)`, [
          id,
          JSON.stringify(
            aEcrire.map((l) => ({
              n: l.numero,
              commerce: l._ligne.commerceId,
              jour: l._ligne.jour,
              poids: l._ligne.poids,
              duree: l._ligne.duree,
              contenant: l._ligne.contenant,
              volume: l._ligne.volume,
              remplissage: l._ligne.remplissage,
              cle: l._ligne.cleEnvoi,
              ligne: l.numero,
            }))
          ),
          importId,
        ]);
        await client.query(
          `INSERT INTO modeles_import_pesees (commune_id, correspondance, saisi_par) VALUES ($1, $2::jsonb, app.current_user_id())
           ON CONFLICT (commune_id) WHERE deleted_at IS NULL
           DO UPDATE SET correspondance = EXCLUDED.correspondance, saisi_par = EXCLUDED.saisi_par, updated_at = now()`,
          [c.commune_id, JSON.stringify(correspondance)]
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
        enregistrees: r.s.enregistrer,
      });
    } catch (err) {
      refus(err);
    }
  })
);

campagnesPeseeRouter.get(
  '/:id/imports',
  ...lecteurs,
  asyncHandler(async (req, res) => {
    const id = await campagneLisible(req.params.id);
    res.json(
      await query(
        `SELECT i.id, i.nom_fichier, i.empreinte_fichier, i.correspondance, i.nb_enregistrees, i.nb_deja_recues, i.nb_erreurs, i.created_at,
                u.full_name AS saisi_par_nom
           FROM imports_pesees i LEFT JOIN users u ON u.id = i.saisi_par
          WHERE i.campagne_id = $1 AND i.deleted_at IS NULL ORDER BY i.created_at DESC`,
        [id]
      )
    );
  })
);

// ---------------------------------------------------------------------------
// Les densités des assimilés
// ---------------------------------------------------------------------------
const SELECT_DENSITES = `
  SELECT d.id, d.commune_id, CASE WHEN d.commune_id IS NULL THEN 'nationale' ELSE 'commune' END AS portee,
         d.categorie_activite, cat.libelle_fr AS categorie_fr, cat.libelle_ar AS categorie_ar,
         d.densite_min::float8 AS densite_min, d.densite_max::float8 AS densite_max, d.mediane::float8 AS mediane,
         d.source, d.campagne_id, c.intitule AS campagne, d.reference, d.date_effet, d.created_at,
         d.retire_le, d.motif_retrait
    FROM densites_assimiles d
    LEFT JOIN campagnes_pesee c ON c.id = d.campagne_id
    LEFT JOIN LATERAL (
      SELECT e.libelle_fr, e.libelle_ar FROM elements_listes_nationales e
       WHERE e.liste = 'categories_activite_assimiles' AND e.code = d.categorie_activite AND e.retire_le IS NULL
       ORDER BY e.date_effet DESC LIMIT 1) cat ON true`;

async function lireDensite(id: string) {
  const d = await queryOne(`${SELECT_DENSITES} WHERE d.id = $1`, [id]);
  if (!d) throw new ApiError(404, 'Densité introuvable.');
  return d;
}

densitesAssimilesRouter.get(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    // Sans commune, la FNCT lit les densités du pays ; avec, celles de la commune et du pays.
    const communeId = typeof req.query.communeId === 'string' && req.query.communeId !== '' ? communeRequise(req) : null;
    if (!communeId && req.user?.role !== 'super_admin_fnct') throw new ApiError(400, 'Commune requise (paramètre communeId).');
    res.json(
      await query(
        `${SELECT_DENSITES} WHERE (d.commune_id IS NULL OR d.commune_id = $1)
          ORDER BY (d.retire_le IS NOT NULL), lower(d.categorie_activite), (d.commune_id IS NULL), d.date_effet DESC`,
        [communeId]
      )
    );
  })
);

densitesAssimilesRouter.post(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = densiteSchema.parse(req.body);
    // Le pays : la FNCT ; une commune : son directeur. La base le tient aussi.
    let communeId: string | null = null;
    if (d.portee === 'nationale') {
      if (req.user?.role !== 'super_admin_fnct') throw new ApiError(403, 'Une densité nationale est tenue par la FNCT.');
    } else {
      if (req.user?.role === 'super_admin_fnct') throw new ApiError(403, ACTE_DE_LA_COMMUNE);
      communeId = communeRequise(req);
    }
    try {
      const [r] = await query<{ id: string }>(
        `INSERT INTO densites_assimiles (commune_id, categorie_activite, densite_min, densite_max, mediane, source, reference, date_effet)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [communeId, d.categorie, d.densiteMin, d.densiteMax, d.mediane ?? null, d.source, d.reference, d.dateEffet]
      );
      res.status(201).json(await lireDensite(r.id));
    } catch (err) {
      refus(err);
    }
  })
);

densitesAssimilesRouter.post(
  '/:id/retirer',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const id = idRequis(req.params.id, 'Densité');
    const d = retraitDensiteAssimilesSchema.parse(req.body);
    try {
      await withTransaction(async (client) => client.query('SELECT id FROM app.retirer_densite($1, $2)', [id, d.motif]));
      res.json(await lireDensite(id));
    } catch (err) {
      refus(err);
    }
  })
);
