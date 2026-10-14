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
import { exportable, type JeuExport } from '../services/export.js';
import { comparer } from './comparaison.js';
import { fiabilite, type EntreeBilan, type RoleEntree } from './fiabilite.js';
import { calculerWapla, DEFAUTS_WAPLA, entreesSchema, ErreurMoteur, VERSION_MOTEUR, type ResultatWapla } from './moteur.js';

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

// ---------------------------------------------------------------------------
// L'export d'un bilan (lot W3 ; SPEC § 6, point 4)
// ---------------------------------------------------------------------------
//
// Une ligne par chiffre : la mention de méthode d'abord, puis TOUTES les
// entrées du moteur — celles du bilan avec leur provenance, et les valeurs par
// défaut de l'UNIDO qu'il a utilisées, nommées comme telles — puis les
// résultats. Un fichier sorti de la plateforme garde ainsi ce qui permet de le
// relire : d'où vient chaque chiffre, et ce qu'il doit à des hypothèses.

const PROVENANCES_EXPORT = {
  siipi_mesure: { fr: 'Mesuré (SIIPI)', ar: 'مقيس (المنصة)' },
  siipi_declare: { fr: 'Déclaré (SIIPI)', ar: 'مصرّح به (المنصة)' },
  saisie_commune: { fr: 'Saisi par la commune', ar: 'أدخلته البلدية' },
  reference_tunisienne: { fr: 'Référence nationale', ar: 'مرجع وطني' },
  defaut_wapla: { fr: 'Valeur par défaut UNIDO', ar: 'قيمة افتراضية لليونيدو' },
  non_renseigne: { fr: 'Non renseigné', ar: 'غير مُدخل' },
};

export const JEU_WAPLA_BILAN: JeuExport = {
  nom: 'bilan-wapla',
  titre: { fr: 'Bilan WaPla — estimation de planification', ar: 'حصيلة WaPla — تقدير للتخطيط' },
  colonnes: [
    {
      cle: 'rubrique', fr: 'Rubrique', ar: 'الباب',
      libelles: {
        methode: { fr: 'Méthode', ar: 'المنهجية' },
        entree: { fr: 'Entrée', ar: 'مُدخل' },
        flux: { fr: 'Flux de matière', ar: 'تدفق المواد' },
        ges: { fr: 'Gaz à effet de serre', ar: 'غازات الاحتباس الحراري' },
        upops: { fr: 'Dioxines et furanes (uPOPs)', ar: 'الديوكسينات والفيورانات' },
        cout: { fr: 'Coûts', ar: 'الكلفة' },
      },
    },
    { cle: 'cle', fr: 'Code', ar: 'الرمز' },
    { cle: 'valeur', fr: 'Valeur', ar: 'القيمة', type: 'nombre' },
    { cle: 'unite', fr: 'Unité', ar: 'الوحدة' },
    { cle: 'provenance', fr: 'Provenance', ar: 'المصدر', libelles: PROVENANCES_EXPORT },
    { cle: 'source', fr: 'Source ou précision', ar: 'المرجع أو التوضيح' },
  ],
};

type LigneExport = { rubrique: string; cle: string; valeur: number | null; unite: string; provenance: string | null; source: string | null };

/** Une valeur du moteur pour le tableur : un booléen devient 1 ou 0, et l'unité le dit. */
const valeurTableur = (v: unknown): number | null => (typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'number' ? v : null);

waplaRouter.get(
  '/bilans/:id/export',
  requireAuth,
  requireRole(...ROLES),
  exportable(JEU_WAPLA_BILAN, (req) => req.params.id?.slice(0, 8)),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const b = await bilanVisible(id);
    const entrees = await entreesDu(id);
    const lignes: LigneExport[] = [
      {
        rubrique: 'methode', cle: 'mention', valeur: null, unite: '', provenance: null,
        source:
          `Estimation de planification — méthode UNIDO WaPla (TU Wien, 2021), réécrite pour la FNCT ; exercice ${b.exercice} ; ` +
          (b.statut === 'calcule' ? `moteur ${b.version_moteur}, niveau ${b.niveau}` : 'bilan non calculé (brouillon)') +
          '. Une estimation, jamais une mesure.',
      },
    ];
    for (const cle of CLES_MOTEUR) {
      const e = entrees.get(cle);
      const defaut = DEFAUTS_WAPLA[cle];
      const valeur = e ? e.valeur : defaut;
      lignes.push({
        rubrique: 'entree',
        cle,
        valeur: valeurTableur(valeur),
        unite: typeof valeur === 'boolean' ? '1 = oui, 0 = non' : '',
        provenance: e ? e.provenance : defaut == null ? 'non_renseigne' : 'defaut_wapla',
        source: e?.source ?? null,
      });
    }
    if (b.statut === 'calcule' && b.resultat) {
      const r = b.resultat as {
        flux: Record<string, number | null>;
        ges: Record<string, number | null>;
        upops: Record<string, number>;
        couts: { procedes: Record<string, { total: number | null }>; total: number | null };
      };
      for (const [cle, v] of Object.entries(r.flux)) if (v != null) lignes.push({ rubrique: 'flux', cle, valeur: v, unite: 't/an', provenance: null, source: null });
      for (const [cle, v] of Object.entries(r.ges)) if (v != null) lignes.push({ rubrique: 'ges', cle, valeur: v, unite: 't CO2-éq/an', provenance: null, source: cle === 'total' ? 'potentiel engagé : tout le méthane à venir de la tonne déposée cette année' : null });
      for (const [cle, v] of Object.entries(r.upops)) lignes.push({ rubrique: 'upops', cle, valeur: v, unite: 'mg TEQ/an', provenance: null, source: null });
      for (const [cle, p] of Object.entries(r.couts.procedes)) lignes.push({ rubrique: 'cout', cle, valeur: p.total, unite: 'TND/an', provenance: p.total == null ? 'non_renseigne' : null, source: null });
      lignes.push({ rubrique: 'cout', cle: 'total', valeur: r.couts.total, unite: 'TND/an', provenance: r.couts.total == null ? 'non_renseigne' : null, source: null });
    }
    res.json(lignes);
  })
);

// ---------------------------------------------------------------------------
// Les scénarios (lot W4a ; SPEC § 5 et § 6, point 3)
// ---------------------------------------------------------------------------
//
// Un scénario part d'un bilan CALCULÉ : il en copie les entrées (avec leur
// provenance), la commune y change des hypothèses, le calcul le compare au
// statu quo. Figé, il ne change plus — la base le tient.

type LigneScenario = {
  id: string; bilan_id: string; commune_id: string; nom: string; description: string | null;
  statut: 'brouillon' | 'calcule' | 'fige'; version_moteur: string | null; resultat: unknown; statu_quo: unknown;
  comparaison: unknown; calcule_le: string | null; fige_le: string | null; cree_le: string;
};
const COLONNES_SCENARIO =
  'id, bilan_id, commune_id, nom, description, statut, version_moteur, resultat, statu_quo, comparaison, calcule_le, fige_le, cree_le';

async function scenarioVisible(id: string): Promise<LigneScenario> {
  const s = await queryOne<LigneScenario>(`SELECT ${COLONNES_SCENARIO} FROM wapla.scenarios WHERE id = $1`, [id]);
  if (!s) throw new ApiError(404, 'Scénario introuvable.');
  return s;
}

async function scenarioComplet(id: string) {
  const s = await scenarioVisible(id);
  const entrees = await query<EntreeBilan & { source: string | null; saisi_le: string }>(
    'SELECT cle, valeur, provenance, source, detail, saisi_le FROM wapla.entrees_scenario WHERE scenario_id = $1 ORDER BY cle',
    [id]
  );
  return { ...s, entrees };
}

/** Une écriture refusée parce que le scénario est figé : 409, avec le message de la base. */
function refusFige(err: unknown): never {
  const m = (err as { message?: string }).message ?? '';
  if (m.startsWith('SCENARIO_FIGE')) throw new ApiError(409, m.replace(/^SCENARIO_FIGE:\s*/, ''));
  throw err;
}

export const creationScenarioSchema = z
  .object({
    nom: z.string().trim().min(1, 'Le scénario a besoin d’un nom.').max(120),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

waplaRouter.get(
  '/bilans/:id/scenarios',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    await bilanVisible(id);
    res.json(
      await query(
        `SELECT id, bilan_id, nom, description, statut, version_moteur, comparaison, calcule_le, fige_le, cree_le
           FROM wapla.scenarios WHERE bilan_id = $1 ORDER BY cree_le`,
        [id]
      )
    );
  })
);

waplaRouter.post(
  '/bilans/:id/scenarios',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const d = creationScenarioSchema.parse(req.body);
    const b = await bilanVisible(id);
    if (b.statut !== 'calcule') {
      throw new ApiError(400, 'Calculez d’abord le bilan : un scénario se compare à un statu quo calculé.');
    }
    const qui = req.user?.sub ?? null;
    const scenarioId = await withTransaction(async (client) => {
      const s = await client.query<{ id: string }>(
        'INSERT INTO wapla.scenarios (bilan_id, commune_id, nom, description, cree_par) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [id, b.commune_id, d.nom, d.description ?? null, qui]
      );
      // Les entrées du statu quo, avec leur provenance : le point de départ.
      await client.query(
        `INSERT INTO wapla.entrees_scenario (scenario_id, commune_id, cle, valeur, provenance, source, detail, saisi_par)
         SELECT $1, e.commune_id, e.cle, e.valeur, e.provenance, e.source, e.detail, $3
           FROM wapla.entrees e WHERE e.bilan_id = $2`,
        [s.rows[0].id, id, qui]
      );
      return s.rows[0].id;
    });
    res.status(201).json(await scenarioComplet(scenarioId));
  })
);

waplaRouter.get(
  '/scenarios/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    res.json(await scenarioComplet(z.string().uuid().parse(req.params.id)));
  })
);

export const hypotheseSchema = z.object({ valeur: z.union([z.number(), z.boolean()]) }).strict();

waplaRouter.put(
  '/scenarios/:id/entrees/:cle',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const cle = req.params.cle;
    if (!(CLES_MOTEUR as string[]).includes(cle)) throw new ApiError(400, `Entrée inconnue du moteur : « ${cle} ».`);
    const { valeur: brute } = hypotheseSchema.parse(req.body);
    const v = entreesSchema.shape[cle as keyof typeof entreesSchema.shape].safeParse(brute);
    if (!v.success || v.data == null) {
      throw new ApiError(400, `Valeur refusée pour « ${cle} » : ${v.success ? 'une valeur est attendue' : v.error.issues[0].message}.`);
    }
    const s = await scenarioVisible(id);
    try {
      await query(
        `INSERT INTO wapla.entrees_scenario (scenario_id, commune_id, cle, valeur, provenance, source, detail, saisi_par)
         VALUES ($1, $2, $3, $4::jsonb, 'hypothese_scenario', NULL, NULL, $5)
         ON CONFLICT (scenario_id, cle) DO UPDATE
           SET valeur = EXCLUDED.valeur, provenance = 'hypothese_scenario', source = NULL, detail = NULL,
               saisi_le = now(), saisi_par = EXCLUDED.saisi_par`,
        [id, s.commune_id, cle, JSON.stringify(v.data), req.user?.sub ?? null]
      );
    } catch (err) {
      refusFige(err);
    }
    res.json(await scenarioComplet(id));
  })
);

waplaRouter.post(
  '/scenarios/:id/calcul',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const s = await scenarioVisible(id);
    if (s.statut === 'fige') throw new ApiError(409, 'Ce scénario est figé : il ne se recalcule plus. Copiez-le dans un nouveau scénario.');
    const b = await bilanVisible(s.bilan_id);
    if (b.statut !== 'calcule' || !b.resultat) {
      throw new ApiError(400, 'Le statu quo n’est plus calculé (une de ses entrées a changé) : recalculez le bilan d’abord.');
    }
    const entrees = await query<{ cle: string; valeur: number | boolean }>(
      'SELECT cle, valeur FROM wapla.entrees_scenario WHERE scenario_id = $1',
      [id]
    );
    const donnees: Record<string, unknown> = { ...DEFAUTS_WAPLA };
    for (const e of entrees) donnees[e.cle] = e.valeur;
    let resultat;
    try {
      resultat = calculerWapla(donnees, { mode: 'corrige' });
    } catch (err) {
      if (err instanceof ErreurMoteur) throw new ApiError(400, err.message);
      throw err;
    }
    const comparaison = comparer(b.resultat as ResultatWapla, resultat);
    await query(
      `UPDATE wapla.scenarios
          SET statut = 'calcule', resultat = $2, statu_quo = $3, comparaison = $4, version_moteur = $5,
              calcule_le = now(), calcule_par = $6
        WHERE id = $1`,
      [id, resultat, b.resultat, comparaison, VERSION_MOTEUR, req.user?.sub ?? null]
    );
    res.json(await scenarioComplet(id));
  })
);

waplaRouter.post(
  '/scenarios/:id/figer',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const s = await scenarioVisible(id);
    if (s.statut === 'fige') throw new ApiError(409, 'Ce scénario est déjà figé.');
    if (s.statut !== 'calcule') throw new ApiError(400, 'Calculez le scénario avant de le figer : on fige des chiffres, pas un brouillon.');
    await query(`UPDATE wapla.scenarios SET statut = 'fige', fige_le = now(), fige_par = $2 WHERE id = $1`, [id, req.user?.sub ?? null]);
    res.json(await scenarioComplet(id));
  })
);

waplaRouter.post(
  '/scenarios/:id/retrait',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const r = await queryOne<{ retire: boolean }>('SELECT wapla.retirer_scenario($1) AS retire', [id]);
    if (!r?.retire) throw new ApiError(404, 'Scénario introuvable.');
    res.status(204).end();
  })
);
