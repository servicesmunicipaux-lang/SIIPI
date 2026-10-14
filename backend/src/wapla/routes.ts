// Les routes de la couche WaPla (lot W2a ; SPEC_wapla § 2 et § 3).
//
// Elles vivent avec la couche, sous /wapla, et n'écrivent que dans le schéma
// `wapla`. Ce qu'elles lisent de SIIPI passe par wapla.amorce_commune, qui
// s'exécute avec les droits de l'appelant : une commune hors du périmètre est
// introuvable (404), et les règles de lecture de SIIPI valent ici aussi.
//
// LES RÉFÉRENCES TUNISIENNES (le climat par gouvernorat) sont tenues par la
// FNCT : datées, sourcées, jamais corrigées ni effacées — une valeur fausse se
// retire avec son motif, et la suivante prend sa place (règle d'or 1.4).
//
// LES BILANS (lot W2b) sont ceux de la commune : elle les crée, les complète,
// les calcule ; la FNCT les lit, sauf les illustratifs. Le calcul se fait ici,
// avec le moteur corrigé ; la base garde le résultat et sa version.

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';
import { fiabilite, type EntreeBilan, type RoleEntree } from './fiabilite.js';
import { calculerWapla, DEFAUTS_WAPLA, entreesSchema, ErreurMoteur, VERSION_MOTEUR } from './moteur.js';

export const waplaRouter = Router();

const ROLES = ['admin_commune', 'super_admin_fnct'] as const;
const anneeTunis = () => Number(new Date(Date.now() + 3_600_000).toISOString().slice(0, 4));

/** La commune demandée, si l'appelant peut la lire ; une autre est introuvable (404), jamais « refusée ». */
async function commune(req: Parameters<typeof communeDemandee>[0]): Promise<string> {
  const id = communeDemandee(req);
  if (!id) throw new ApiError(400, 'Commune requise (paramètre communeId).');
  const c = await queryOne<{ id: string }>('SELECT id FROM communes WHERE id = $1 AND app.can_read_commune(id)', [id]);
  if (!c) throw new ApiError(404, 'Commune introuvable.');
  return c.id;
}

// ---------------------------------------------------------------------------
// L'amorce : ce que SIIPI propose pour chaque entrée de WaPla
// ---------------------------------------------------------------------------

export const qAmorceSchema = z.object({
  exercice: z.coerce.number().int().min(2000).max(2100),
});

export type LigneAmorce = {
  cle: string;
  ordre: number;
  valeur: number | null;
  provenance: 'siipi_mesure' | 'siipi_declare' | 'reference_tunisienne' | null;
  source: string;
  detail: Record<string, unknown> | null;
  manque: string | null;
  ecart: string | null;
};

waplaRouter.get(
  '/amorce',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const q = qAmorceSchema.parse(req.query);
    const communeId = await commune(req);
    if (q.exercice > anneeTunis()) {
      throw new ApiError(400, `L'exercice ${q.exercice} n'a pas commencé : choisissez l'année en cours ou une année passée.`);
    }
    const lignes = await query<Omit<LigneAmorce, 'valeur'> & { valeur: string | null }>(
      'SELECT cle, ordre, valeur, provenance, source, detail, manque, ecart FROM wapla.amorce_commune($1, $2) ORDER BY ordre',
      [communeId, q.exercice]
    );
    res.json({
      commune_id: communeId,
      exercice: q.exercice,
      entrees: lignes.map((l) => ({ ...l, valeur: l.valeur == null ? null : Number(l.valeur) })),
    });
  })
);

// ---------------------------------------------------------------------------
// Les références tunisiennes (FNCT)
// ---------------------------------------------------------------------------

export const CODES_REFERENCE = ['precipitations_annuelles_mm', 'temperature_moyenne_c'] as const;

export const facteurReferenceSchema = z
  .object({
    code: z.enum(CODES_REFERENCE),
    gouvernorat: z.string().trim().min(1).max(100),
    valeur: z.number(),
    source: z.string().trim().min(1, 'La source est obligatoire : un chiffre sans source ne se discute pas.').max(300),
    dateEffet: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.'),
  })
  .strict()
  .superRefine((f, ctx) => {
    const [min, max] = f.code === 'precipitations_annuelles_mm' ? [0, 3000] : [-10, 40];
    if (f.valeur < min || f.valeur > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['valeur'],
        message: `Hors des bornes plausibles pour la Tunisie (${min} à ${max}) : vérifiez l'unité.`,
      });
    }
  });

export const retraitFacteurSchema = z.object({ motif: z.string().trim().min(1, 'Le motif du retrait est obligatoire.').max(500) }).strict();

const COLONNES_FACTEUR = 'id, code, gouvernorat, valeur, source, date_effet, saisi_le, retire_le, motif_retrait';
type LigneFacteur = { valeur: string } & Record<string, unknown>;
const enNombre = (l: LigneFacteur) => ({ ...l, valeur: Number(l.valeur) });

waplaRouter.get(
  '/facteurs-reference',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    // Les valeurs retirées restent lisibles, sur demande : c'est l'historique.
    const avecRetirees = req.query.retirees === '1';
    const lignes = await query<LigneFacteur>(
      `SELECT ${COLONNES_FACTEUR} FROM wapla.facteurs_reference
        WHERE $1 OR retire_le IS NULL
        ORDER BY gouvernorat, code, date_effet DESC`,
      [avecRetirees]
    );
    res.json(lignes.map(enNombre));
  })
);

waplaRouter.post(
  '/facteurs-reference',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const f = facteurReferenceSchema.parse(req.body);
    const gouvernorat = await queryOne(
      'SELECT 1 FROM communes WHERE gouvernorat = $1 AND NOT est_demo AND deleted_at IS NULL LIMIT 1',
      [f.gouvernorat]
    );
    if (!gouvernorat) throw new ApiError(400, `Gouvernorat inconnu : « ${f.gouvernorat} ». Écrivez-le comme dans la fiche des communes.`);
    try {
      const ligne = await queryOne<LigneFacteur>(
        `INSERT INTO wapla.facteurs_reference (code, gouvernorat, valeur, source, date_effet, saisi_par)
         VALUES ($1, $2, $3, $4, $5::date, $6)
         RETURNING ${COLONNES_FACTEUR}`,
        [f.code, f.gouvernorat, f.valeur, f.source, f.dateEffet, req.user?.sub ?? null]
      );
      res.status(201).json(enNombre(ligne as LigneFacteur));
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ApiError(409, 'Une valeur en vigueur existe déjà pour ce gouvernorat, ce code et cette date : retirez-la d’abord, avec son motif.');
      }
      throw err;
    }
  })
);

waplaRouter.post(
  '/facteurs-reference/:id/retrait',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { motif } = retraitFacteurSchema.parse(req.body);
    const ligne = await queryOne<LigneFacteur>(
      `UPDATE wapla.facteurs_reference SET retire_le = now(), retire_par = $2, motif_retrait = $3
        WHERE id = $1 AND retire_le IS NULL
        RETURNING ${COLONNES_FACTEUR}`,
      [id, req.user?.sub ?? null, motif]
    );
    if (!ligne) throw new ApiError(404, 'Valeur introuvable, ou déjà retirée.');
    res.json(enNombre(ligne));
  })
);

// ---------------------------------------------------------------------------
// Les réglages de la FNCT
// ---------------------------------------------------------------------------

export const reglageSchema = z.object({ valeur: z.number().min(0).max(1) }).strict();

waplaRouter.get(
  '/reglages',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (_req, res) => {
    const lignes = await query<{ cle: string; valeur: string; libelle: string; modifie_le: string }>(
      'SELECT cle, valeur, libelle, modifie_le FROM wapla.reglages ORDER BY cle'
    );
    res.json(lignes.map((l) => ({ ...l, valeur: Number(l.valeur) })));
  })
);

waplaRouter.put(
  '/reglages/seuil_defauts_etaye',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const { valeur } = reglageSchema.parse(req.body);
    const ligne = await queryOne<{ cle: string; valeur: string }>(
      `UPDATE wapla.reglages SET valeur = $1, modifie_par = $2, modifie_le = now()
        WHERE cle = 'seuil_defauts_etaye' RETURNING cle, valeur`,
      [valeur, req.user?.sub ?? null]
    );
    if (!ligne) throw new ApiError(404, 'Réglage introuvable.');
    res.json({ ...ligne, valeur: Number(ligne.valeur) });
  })
);

// ---------------------------------------------------------------------------
// Les bilans
// ---------------------------------------------------------------------------

/** Les entrées que le moteur connaît : les clés de son schéma, et elles seules. */
const CLES_MOTEUR = Object.keys(entreesSchema.shape) as (keyof typeof entreesSchema.shape)[];

// SPEC § 3.3 : ni centre de tri ni incinération dans le statu quo d'une
// commune tunisienne ; ils ne s'activent que dans un scénario qui les projette.
const STATU_QUO_TUNISIEN = [
  { cle: 'mrf', valeur: false, source: 'SPEC WaPla § 3.3 : pas de centre de tri dans le statu quo tunisien' },
  { cle: 'incineration', valeur: false, source: 'SPEC WaPla § 3.3 : pas d’incinération dans le statu quo tunisien' },
];

type LigneBilan = {
  id: string; commune_id: string; exercice: number; statut: 'brouillon' | 'calcule';
  version_moteur: string | null; resultat: unknown; niveau: string | null; fiabilite: unknown;
  calcule_le: string | null; cree_le: string;
};
const COLONNES_BILAN = 'id, commune_id, exercice, statut, version_moteur, resultat, niveau, fiabilite, calcule_le, cree_le';

async function bilanVisible(id: string): Promise<LigneBilan> {
  const b = await queryOne<LigneBilan>(`SELECT ${COLONNES_BILAN} FROM wapla.bilans WHERE id = $1`, [id]);
  if (!b) throw new ApiError(404, 'Bilan introuvable.');
  return b;
}

async function entreesDu(bilanId: string): Promise<Map<string, EntreeBilan & { source: string | null; saisi_le: string }>> {
  const lignes = await query<EntreeBilan & { source: string | null; saisi_le: string }>(
    'SELECT cle, valeur, provenance, source, detail, saisi_le FROM wapla.entrees WHERE bilan_id = $1 ORDER BY cle',
    [bilanId]
  );
  return new Map(lignes.map((l) => [l.cle, l]));
}

async function contexteFiabilite() {
  const roles = await query<RoleEntree>('SELECT cle, role, groupe FROM wapla.cles_entrees ORDER BY ordre');
  const seuil = await queryOne<{ valeur: string }>("SELECT valeur FROM wapla.reglages WHERE cle = 'seuil_defauts_etaye'");
  if (!seuil) throw new ApiError(500, 'Le seuil de fiabilité de la FNCT est introuvable (wapla.reglages).');
  return { roles, seuil: Number(seuil.valeur) };
}

export const creationBilanSchema = z.object({ exercice: z.number().int().min(2000).max(2100) }).strict();

waplaRouter.get(
  '/bilans',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const communeId = await commune(req);
    res.json(
      await query(
        `SELECT id, commune_id, exercice, statut, version_moteur, niveau, calcule_le, cree_le
           FROM wapla.bilans WHERE commune_id = $1 ORDER BY exercice DESC`,
        [communeId]
      )
    );
  })
);

waplaRouter.post(
  '/bilans',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const { exercice } = creationBilanSchema.parse(req.body);
    const communeId = await commune(req);
    if (exercice > anneeTunis()) {
      throw new ApiError(400, `L'exercice ${exercice} n'a pas commencé : choisissez l'année en cours ou une année passée.`);
    }
    const qui = req.user?.sub ?? null;
    try {
      const id = await withTransaction(async (client) => {
        const b = await client.query<{ id: string }>(
          'INSERT INTO wapla.bilans (commune_id, exercice, cree_par) VALUES ($1, $2, $3) RETURNING id',
          [communeId, exercice, qui]
        );
        const bilanId = b.rows[0].id;
        // L'amorce : chaque entrée que SIIPI tient entre avec sa provenance.
        const amorce = await client.query<{ cle: string; valeur: string; provenance: string; source: string; detail: unknown }>(
          `SELECT cle, valeur, provenance, source, detail FROM wapla.amorce_commune($1, $2)
            WHERE valeur IS NOT NULL AND cle = ANY($3)`,
          [communeId, exercice, CLES_MOTEUR]
        );
        for (const a of amorce.rows) {
          await client.query(
            `INSERT INTO wapla.entrees (bilan_id, commune_id, cle, valeur, provenance, source, detail, saisi_par)
             VALUES ($1, $2, $3, to_jsonb($4::numeric), $5, $6, $7, $8)`,
            [bilanId, communeId, a.cle, a.valeur, a.provenance, a.source, a.detail, qui]
          );
        }
        for (const s of STATU_QUO_TUNISIEN) {
          await client.query(
            `INSERT INTO wapla.entrees (bilan_id, commune_id, cle, valeur, provenance, source, saisi_par)
             VALUES ($1, $2, $3, to_jsonb($4::boolean), 'reference_tunisienne', $5, $6)`,
            [bilanId, communeId, s.cle, s.valeur, s.source, qui]
          );
        }
        return bilanId;
      });
      res.status(201).json(await bilanComplet(id));
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ApiError(409, `La commune a déjà un bilan pour ${exercice} : complétez-le, ou retirez-le d'abord.`);
      }
      throw err;
    }
  })
);

/** Un bilan, ses entrées, et ce qui manque encore avant le calcul. */
async function bilanComplet(id: string) {
  const b = await bilanVisible(id);
  const entrees = await entreesDu(id);
  const { roles, seuil } = await contexteFiabilite();
  const etat = fiabilite(entrees, roles, seuil);
  return {
    ...b,
    entrees: [...entrees.values()],
    roles,
    a_traiter: etat.cles_manquantes,
  };
}

waplaRouter.get(
  '/bilans/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    res.json(await bilanComplet(z.string().uuid().parse(req.params.id)));
  })
);

export const saisieEntreeSchema = z.union([
  z.object({ valeur: z.union([z.number(), z.boolean()]) }).strict(),
  z.object({ defaut: z.literal(true) }).strict(),
]);

waplaRouter.put(
  '/bilans/:id/entrees/:cle',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const cle = req.params.cle;
    if (!(CLES_MOTEUR as string[]).includes(cle)) {
      throw new ApiError(400, `Entrée inconnue du moteur : « ${cle} ».`);
    }
    const corps = saisieEntreeSchema.parse(req.body);
    const b = await bilanVisible(id);
    let valeur: number | boolean;
    let provenance: 'saisie_commune' | 'defaut_wapla';
    if ('defaut' in corps) {
      // Garder la valeur par défaut de l'UNIDO, exprès : elle compte comme
      // telle dans le niveau de fiabilité. Un coût n'en a pas.
      const d = DEFAUTS_WAPLA[cle as keyof typeof DEFAUTS_WAPLA];
      if (d == null) throw new ApiError(400, `« ${cle} » n'a pas de valeur par défaut dans l'outil : saisissez-la.`);
      valeur = d as number | boolean;
      provenance = 'defaut_wapla';
    } else {
      const v = entreesSchema.shape[cle as keyof typeof entreesSchema.shape].safeParse(corps.valeur);
      if (!v.success || v.data == null) {
        throw new ApiError(400, `Valeur refusée pour « ${cle} » : ${v.success ? 'une valeur est attendue' : v.error.issues[0].message}.`);
      }
      valeur = v.data as number | boolean;
      provenance = 'saisie_commune';
    }
    const ecrite = await queryOne(
      `INSERT INTO wapla.entrees (bilan_id, commune_id, cle, valeur, provenance, source, detail, saisi_par)
       VALUES ($1, $2, $3, $4::jsonb, $5, NULL, NULL, $6)
       ON CONFLICT (bilan_id, cle) DO UPDATE
         SET valeur = EXCLUDED.valeur, provenance = EXCLUDED.provenance, source = NULL, detail = NULL,
             saisi_le = now(), saisi_par = EXCLUDED.saisi_par
       RETURNING cle`,
      [id, b.commune_id, cle, JSON.stringify(valeur), provenance, req.user?.sub ?? null]
    );
    if (!ecrite) throw new ApiError(404, 'Bilan introuvable.');
    res.json(await bilanComplet(id));
  })
);

waplaRouter.post(
  '/bilans/:id/calcul',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    await bilanVisible(id);
    const entrees = await entreesDu(id);
    const { roles, seuil } = await contexteFiabilite();
    const etat = fiabilite(entrees, roles, seuil);
    if (!etat.niveau) {
      throw new ApiError(
        400,
        `Avant le calcul, traitez ces entrées clés — une valeur, ou la valeur par défaut gardée exprès : ${etat.cles_manquantes.join(', ')}.`
      );
    }
    const donnees: Record<string, unknown> = { ...DEFAUTS_WAPLA };
    for (const e of entrees.values()) donnees[e.cle] = e.valeur;
    let resultat;
    try {
      resultat = calculerWapla(donnees, { mode: 'corrige' });
    } catch (err) {
      if (err instanceof ErreurMoteur) throw new ApiError(400, err.message);
      throw err;
    }
    const ligne = await queryOne(
      `UPDATE wapla.bilans
          SET statut = 'calcule', resultat = $2, version_moteur = $3, niveau = $4, fiabilite = $5,
              calcule_le = now(), calcule_par = $6
        WHERE id = $1 RETURNING id`,
      [id, resultat, VERSION_MOTEUR, etat.niveau, etat, req.user?.sub ?? null]
    );
    if (!ligne) throw new ApiError(404, 'Bilan introuvable.');
    res.json(await bilanComplet(id));
  })
);

waplaRouter.post(
  '/bilans/:id/retrait',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const r = await queryOne<{ retire: boolean }>('SELECT wapla.retirer_bilan($1) AS retire', [id]);
    if (!r?.retire) throw new ApiError(404, 'Bilan introuvable.');
    res.status(204).end();
  })
);
