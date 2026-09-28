// Champs libres, étiquettes et actions planifiées sur les points de collecte
// — le Jalon 6 (TDR §3.2.3, B3.4 et B3.5).
//
// Ce que la commune fait ici, elle le fait seule : ajouter une colonne à son
// tableau des points, la renseigner (un point, ou trente d'un coup), étiqueter
// des points, et planifier une action sur une sélection. Le filtrage et
// l'export passent par la liste des points existante (GET /circuits/points),
// pour que l'export reprenne exactement ce que l'écran montre.
//
// Les définitions de champs et les étiquettes se lisent comme les points (le
// prestataire d'un circuit les voit) ; seules la commune et la FNCT écrivent,
// et les actions planifiées restent l'affaire de la commune (migration 047).

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';

export const attributsPointsRouter = Router();

const ROLES = ['admin_commune', 'super_admin_fnct'] as const;
export const TYPES_CHAMP = ['texte', 'nombre', 'oui_non', 'liste', 'date'] as const;
export const COULEURS = ['ardoise', 'rouge', 'orange', 'ambre', 'vert', 'emeraude', 'bleu', 'violet', 'rose'] as const;
export const STATUTS_ACTION = ['planifiee', 'terminee', 'annulee'] as const;

/** Au-delà, le tableau n'est plus lisible : c'est un autre outil qu'il faut. */
const MAX_CHAMPS = 40;
const MAX_POINTS_LOT = 5000;

const dateIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.')
  .refine((d) => !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime()) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), {
    message: 'Date inexistante.',
  });

/** Aujourd'hui à Tunis (UTC+1, sans heure d'été). */
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

function communeRequise(req: Parameters<typeof communeDemandee>[0]): string {
  const communeId = communeDemandee(req);
  if (!communeId) throw new ApiError(400, 'Commune requise.');
  return communeId;
}

// ---------------------------------------------------------------------------
// Les valeurs : contrôlées contre la définition du champ
// ---------------------------------------------------------------------------

export interface Champ {
  id: string;
  commune_id: string;
  libelle: string;
  libelle_ar: string | null;
  type: (typeof TYPES_CHAMP)[number];
  options: string[];
  ordre: number;
}

const CHAMP_COLONNES = 'id, commune_id, libelle, libelle_ar, type, options, ordre, created_at, updated_at';

/** Les champs vivants d'une commune, lus sous RLS. */
export async function champsDeCommune(communeId: string): Promise<Champ[]> {
  return query<Champ>(
    `SELECT ${CHAMP_COLONNES} FROM champs_points
      WHERE commune_id = $1 AND deleted_at IS NULL
      ORDER BY ordre, lower(libelle)`,
    [communeId]
  );
}

type Valeur = string | number | boolean | null;

/**
 * Une valeur saisie, ramenée au type du champ — ou une erreur qui dit
 * pourquoi. Tolérante sur la forme (« 12,5 », « oui »), stricte sur le fond :
 * une valeur qu'on ne saurait pas filtrer ne rentre pas.
 */
function normaliser(champ: Champ, brut: unknown): Valeur {
  if (brut === null || brut === undefined || (typeof brut === 'string' && brut.trim() === '')) return null;
  const nom = `« ${champ.libelle} »`;
  switch (champ.type) {
    case 'texte': {
      const texte = String(brut).trim();
      if (texte.length > 500) throw new ApiError(400, `${nom} : 500 caractères au plus.`);
      return texte;
    }
    case 'nombre': {
      const n = typeof brut === 'number' ? brut : Number(String(brut).trim().replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(n)) throw new ApiError(400, `${nom} attend un nombre.`);
      return n;
    }
    case 'oui_non': {
      if (typeof brut === 'boolean') return brut;
      const t = String(brut).trim().toLowerCase();
      if (['true', 'oui', '1', 'نعم'].includes(t)) return true;
      if (['false', 'non', '0', 'لا'].includes(t)) return false;
      throw new ApiError(400, `${nom} attend oui ou non.`);
    }
    case 'liste': {
      const texte = String(brut).trim();
      if (!champ.options.includes(texte)) {
        throw new ApiError(400, `${nom} : « ${texte} » ne fait pas partie des choix (${champ.options.join(', ')}).`);
      }
      return texte;
    }
    case 'date': {
      const texte = String(brut).trim();
      if (!dateIso.safeParse(texte).success) throw new ApiError(400, `${nom} attend une date AAAA-MM-JJ.`);
      return texte;
    }
  }
}

/**
 * { idChamp: valeur } → ce qu'il faut poser et ce qu'il faut effacer. Un
 * identifiant qui n'est pas un champ vivant de la commune est refusé : une
 * valeur écrite sous une clé que rien ne décrit ne se reverrait jamais.
 */
function preparerAttributs(champs: Champ[], saisie: Record<string, unknown>) {
  const parId = new Map(champs.map((c) => [c.id, c]));
  const poser: Record<string, Valeur> = {};
  const effacer: string[] = [];
  for (const [id, brut] of Object.entries(saisie)) {
    const champ = parId.get(id);
    if (!champ) throw new ApiError(400, `Champ inconnu : ${id}.`);
    const v = normaliser(champ, brut);
    if (v === null) effacer.push(id);
    else poser[id] = v;
  }
  return { poser, effacer };
}

/** Les étiquettes demandées, toutes vivantes et de la commune — ou 400. */
async function etiquettesValides(communeId: string, ids: string[]) {
  const uniques = [...new Set(ids)];
  if (uniques.length === 0) return uniques;
  const trouvees = await query<{ id: string }>(
    `SELECT id FROM etiquettes_points WHERE id = ANY($1::uuid[]) AND commune_id = $2 AND deleted_at IS NULL`,
    [uniques, communeId]
  );
  if (trouvees.length !== uniques.length) throw new ApiError(400, 'Étiquette inconnue dans cette commune.');
  return uniques;
}

/**
 * Les points désignés, tous visibles (RLS) et d'une même commune. Un seul
 * absent et c'est 404 : un lot appliqué « sauf ceux qu'on ne voit pas »
 * laisserait croire que tout a été fait.
 */
async function pointsDuLot(ids: string[]): Promise<{ communeId: string; ids: string[] }> {
  const uniques = [...new Set(ids)];
  const lignes = await query<{ id: string; commune_id: string }>(
    'SELECT id, commune_id FROM points_collecte WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL',
    [uniques]
  );
  if (lignes.length !== uniques.length) throw new ApiError(404, 'Point introuvable.');
  const communes = new Set(lignes.map((l) => l.commune_id));
  if (communes.size > 1) throw new ApiError(400, "Un lot ne porte que sur les points d'une seule commune.");
  return { communeId: lignes[0].commune_id, ids: uniques };
}

const saisieAttributs = z.record(z.string().uuid(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

/** L'écriture commune au point seul et au lot. */
async function modifierPoints(
  ids: string[],
  communeId: string,
  d: { attributs?: Record<string, unknown>; etiquettes?: string[]; ajouterEtiquettes?: string[]; retirerEtiquettes?: string[] }
) {
  const clauses: string[] = [];
  const valeurs: unknown[] = [ids];
  if (d.attributs && Object.keys(d.attributs).length > 0) {
    const { poser, effacer } = preparerAttributs(await champsDeCommune(communeId), d.attributs);
    valeurs.push(JSON.stringify(poser), effacer);
    clauses.push(`attributs = (attributs || $${valeurs.length - 1}::jsonb) - $${valeurs.length}::text[]`);
  }
  if (d.etiquettes) {
    valeurs.push(await etiquettesValides(communeId, d.etiquettes));
    clauses.push(`etiquettes = $${valeurs.length}::uuid[]`);
  } else if (d.ajouterEtiquettes?.length || d.retirerEtiquettes?.length) {
    valeurs.push(await etiquettesValides(communeId, d.ajouterEtiquettes ?? []), d.retirerEtiquettes ?? []);
    // L'ordre de pose est gardé ; une étiquette déjà présente n'est pas doublée.
    clauses.push(
      `etiquettes = ARRAY(
         SELECT e FROM unnest(etiquettes || $${valeurs.length - 1}::uuid[]) WITH ORDINALITY AS u(e, rang)
          WHERE e <> ALL ($${valeurs.length}::uuid[])
          GROUP BY e ORDER BY min(rang))`
    );
  }
  if (clauses.length === 0) throw new ApiError(400, 'Rien à modifier.');
  const modifies = await query<{ id: string }>(
    `UPDATE points_collecte SET ${clauses.join(', ')}, updated_at = now()
      WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
      RETURNING id`,
    valeurs
  );
  return modifies.length;
}

// ---------------------------------------------------------------------------
// 1. Les champs libres (B3.4)
// ---------------------------------------------------------------------------

attributsPointsRouter.get(
  '/champs',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    // Le nombre de points renseignés : c'est ce qu'il faut savoir avant de
    // retirer un champ ou d'en retoucher les choix.
    res.json(
      await query(
        `SELECT ${CHAMP_COLONNES.split(', ').map((c) => `c.${c}`).join(', ')},
                (SELECT count(*)::int FROM points_collecte p
                  WHERE p.commune_id = c.commune_id AND p.deleted_at IS NULL
                    AND p.attributs ? c.id::text) AS nb_renseignes
           FROM champs_points c
          WHERE c.commune_id = $1 AND c.deleted_at IS NULL
          ORDER BY c.ordre, lower(c.libelle)`,
        [communeId]
      )
    );
  })
);

const optionsSchema = z
  .array(z.string().trim().min(1).max(80))
  .max(50)
  .transform((o) => [...new Set(o)]);

export const champSchema = z.object({
  libelle: z.string().trim().min(1).max(80),
  libelleAr: z.string().trim().max(80).nullable().optional(),
  type: z.enum(TYPES_CHAMP),
  options: optionsSchema.optional(),
  ordre: z.number().int().min(0).max(10_000).optional(),
});

attributsPointsRouter.post(
  '/champs',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const d = champSchema.parse(req.body);
    const options = d.type === 'liste' ? (d.options ?? []) : [];
    if (d.type === 'liste' && options.length === 0) {
      throw new ApiError(400, 'Un champ « liste » a besoin d’au moins un choix.');
    }
    if (d.type !== 'liste' && d.options?.length) {
      throw new ApiError(400, 'Seul un champ « liste » porte des choix.');
    }
    const existants = await champsDeCommune(communeId);
    if (existants.length >= MAX_CHAMPS) {
      throw new ApiError(400, `${MAX_CHAMPS} champs au plus par commune : retirez-en un avant d’en ajouter.`);
    }
    if (existants.some((c) => c.libelle.trim().toLowerCase() === d.libelle.toLowerCase())) {
      throw new ApiError(409, `Un champ « ${d.libelle} » existe déjà.`);
    }
    const ordre = d.ordre ?? (existants.length ? Math.max(...existants.map((c) => c.ordre)) + 1 : 0);
    const cree = await queryOne(
      `INSERT INTO champs_points (commune_id, libelle, libelle_ar, type, options, ordre, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${CHAMP_COLONNES}`,
      [communeId, d.libelle, d.libelleAr || null, d.type, options, ordre, req.user!.sub]
    );
    res.status(201).json({ ...cree, nb_renseignes: 0 });
  })
);

export const majChampSchema = z.object({
  libelle: z.string().trim().min(1).max(80).optional(),
  libelleAr: z.string().trim().max(80).nullable().optional(),
  // Accepté seulement s'il ne change pas : voir la migration 047.
  type: z.enum(TYPES_CHAMP).optional(),
  options: optionsSchema.optional(),
  ordre: z.number().int().min(0).max(10_000).optional(),
});

attributsPointsRouter.patch(
  '/champs/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = majChampSchema.parse(req.body);
    const champ = await queryOne<Champ>(
      `SELECT ${CHAMP_COLONNES} FROM champs_points WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (!champ) throw new ApiError(404, 'Champ introuvable.');
    if (d.type && d.type !== champ.type) {
      throw new ApiError(
        400,
        'Le type d’un champ ne change pas : les valeurs déjà saisies ne le suivraient pas. Créez un autre champ, puis retirez celui-ci.'
      );
    }
    if (d.options && champ.type !== 'liste') throw new ApiError(400, 'Seul un champ « liste » porte des choix.');
    if (d.options) {
      if (d.options.length === 0) throw new ApiError(400, 'Un champ « liste » a besoin d’au moins un choix.');
      // Un choix encore porté par des points ne disparaît pas de la liste :
      // ces points afficheraient une valeur qu'on ne peut plus choisir ni
      // filtrer.
      const retires = champ.options.filter((o) => !d.options!.includes(o));
      if (retires.length) {
        const utilises = await query<{ valeur: string; n: number }>(
          `SELECT attributs ->> $1 AS valeur, count(*)::int AS n FROM points_collecte
            WHERE commune_id = $2 AND deleted_at IS NULL AND attributs ->> $1 = ANY($3::text[])
            GROUP BY 1`,
          [champ.id, champ.commune_id, retires]
        );
        if (utilises.length) {
          throw new ApiError(
            409,
            `Choix encore utilisé : ${utilises.map((u) => `« ${u.valeur} » (${u.n} point${u.n > 1 ? 's' : ''})`).join(', ')}. Changez d’abord la valeur de ces points.`
          );
        }
      }
    }
    if (d.libelle && d.libelle.toLowerCase() !== champ.libelle.trim().toLowerCase()) {
      const autres = await champsDeCommune(champ.commune_id);
      if (autres.some((c) => c.id !== champ.id && c.libelle.trim().toLowerCase() === d.libelle!.toLowerCase())) {
        throw new ApiError(409, `Un champ « ${d.libelle} » existe déjà.`);
      }
    }
    const modifie = await queryOne(
      `UPDATE champs_points
          SET libelle = COALESCE($2, libelle),
              libelle_ar = CASE WHEN $3::boolean THEN $4 ELSE libelle_ar END,
              options = COALESCE($5::text[], options),
              ordre = COALESCE($6, ordre)
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING ${CHAMP_COLONNES}`,
      [
        champ.id,
        d.libelle ?? null,
        d.libelleAr !== undefined,
        d.libelleAr || null,
        d.options ?? null,
        d.ordre ?? null,
      ]
    );
    if (!modifie) throw new ApiError(404, 'Champ introuvable.');
    res.json(modifie);
  })
);

/** Visible sous RLS d'abord : une ressource d'une autre commune est introuvable. */
async function retirer(table: 'champs_points' | 'etiquettes_points' | 'actions_planifiees', id: string, nom: string) {
  const visible = await queryOne(`SELECT id FROM ${table} WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (!visible) throw new ApiError(404, `${nom} introuvable.`);
  await query('SELECT app.supprimer($1, $2)', [table, id]);
}

// Retirer un champ ne réécrit aucun point : les valeurs restent dans leur
// historique, elles ne s'affichent plus, ne se filtrent plus, ne s'exportent
// plus.
attributsPointsRouter.delete(
  '/champs/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    await retirer('champs_points', req.params.id, 'Champ');
    res.status(204).end();
  })
);

// ---------------------------------------------------------------------------
// 2. Les étiquettes (B3.5)
// ---------------------------------------------------------------------------

const ETIQUETTE_COLONNES = 'id, commune_id, nom, couleur, created_at, updated_at';

attributsPointsRouter.get(
  '/etiquettes',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    res.json(
      await query(
        `SELECT ${ETIQUETTE_COLONNES.split(', ').map((c) => `e.${c}`).join(', ')},
                (SELECT count(*)::int FROM points_collecte p
                  WHERE p.commune_id = e.commune_id AND p.deleted_at IS NULL
                    AND e.id = ANY (p.etiquettes)) AS nb_points
           FROM etiquettes_points e
          WHERE e.commune_id = $1 AND e.deleted_at IS NULL
          ORDER BY lower(e.nom)`,
        [communeId]
      )
    );
  })
);

export const etiquetteSchema = z.object({
  nom: z.string().trim().min(1).max(60),
  couleur: z.enum(COULEURS).optional(),
});

attributsPointsRouter.post(
  '/etiquettes',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const d = etiquetteSchema.parse(req.body);
    const doublon = await queryOne(
      `SELECT id FROM etiquettes_points WHERE commune_id = $1 AND deleted_at IS NULL AND lower(btrim(nom)) = lower($2)`,
      [communeId, d.nom]
    );
    if (doublon) throw new ApiError(409, `L’étiquette « ${d.nom} » existe déjà.`);
    const cree = await queryOne(
      `INSERT INTO etiquettes_points (commune_id, nom, couleur, created_by)
       VALUES ($1, $2, $3, $4) RETURNING ${ETIQUETTE_COLONNES}`,
      [communeId, d.nom, d.couleur ?? 'ardoise', req.user!.sub]
    );
    res.status(201).json({ ...cree, nb_points: 0 });
  })
);

attributsPointsRouter.patch(
  '/etiquettes/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = etiquetteSchema.partial().parse(req.body);
    const e = await queryOne<{ id: string; commune_id: string }>(
      'SELECT id, commune_id FROM etiquettes_points WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!e) throw new ApiError(404, 'Étiquette introuvable.');
    if (d.nom) {
      const doublon = await queryOne(
        `SELECT id FROM etiquettes_points
          WHERE commune_id = $1 AND deleted_at IS NULL AND lower(btrim(nom)) = lower($2) AND id <> $3`,
        [e.commune_id, d.nom, e.id]
      );
      if (doublon) throw new ApiError(409, `L’étiquette « ${d.nom} » existe déjà.`);
    }
    res.json(
      await queryOne(
        `UPDATE etiquettes_points SET nom = COALESCE($2, nom), couleur = COALESCE($3, couleur)
          WHERE id = $1 AND deleted_at IS NULL RETURNING ${ETIQUETTE_COLONNES}`,
        [e.id, d.nom ?? null, d.couleur ?? null]
      )
    );
  })
);

attributsPointsRouter.delete(
  '/etiquettes/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    await retirer('etiquettes_points', req.params.id, 'Étiquette');
    res.status(204).end();
  })
);

// ---------------------------------------------------------------------------
// 3. Renseigner les points : un par un, ou par lot
// ---------------------------------------------------------------------------

export const lotSchema = z.object({
  pointIds: z.array(z.string().uuid()).min(1).max(MAX_POINTS_LOT),
  attributs: saisieAttributs.optional(),
  ajouterEtiquettes: z.array(z.string().uuid()).max(50).optional(),
  retirerEtiquettes: z.array(z.string().uuid()).max(50).optional(),
});

// Trente points d'un coup : c'est la condition du test de validation, et la
// seule façon raisonnable de renseigner un champ nouveau sur une commune
// entière. Tout ou rien : une seule instruction UPDATE, après contrôle de
// chaque point et de chaque valeur.
attributsPointsRouter.post(
  '/lot',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = lotSchema.parse(req.body);
    const lot = await pointsDuLot(d.pointIds);
    const modifies = await modifierPoints(lot.ids, lot.communeId, d);
    res.json({ modifies });
  })
);

export const attributsPointSchema = z.object({
  // Fusionnés : seuls les champs nommés changent ; null efface.
  attributs: saisieAttributs.optional(),
  // Remplace la liste entière.
  etiquettes: z.array(z.string().uuid()).max(50).optional(),
});

attributsPointsRouter.patch(
  '/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = attributsPointSchema.parse(req.body);
    const lot = await pointsDuLot([req.params.id]);
    await modifierPoints(lot.ids, lot.communeId, d);
    res.json(
      await queryOne('SELECT id, attributs, etiquettes, updated_at FROM points_collecte WHERE id = $1', [
        req.params.id,
      ])
    );
  })
);

// ---------------------------------------------------------------------------
// 4. Les actions planifiées (B3.5)
// ---------------------------------------------------------------------------

// « en_retard » n'est pas un statut qu'on saisit : c'est une action encore
// planifiée dont la date est passée. Il se calcule, comme une échéance.
const ACTION_SELECT = `
  SELECT a.id, a.commune_id, a.titre, a.description, a.date_prevue, a.date_fin, a.responsable,
         a.statut, a.terminee_le, a.created_at, a.updated_at,
         (SELECT count(*)::int FROM actions_points ap
            JOIN points_collecte p ON p.id = ap.point_id AND p.deleted_at IS NULL
           WHERE ap.action_id = a.id) AS nb_points,
         (SELECT count(*)::int FROM actions_points ap
            JOIN points_collecte p ON p.id = ap.point_id AND p.deleted_at IS NULL
           WHERE ap.action_id = a.id AND ap.fait_le IS NOT NULL) AS nb_faits,
         CASE WHEN a.statut = 'planifiee' AND COALESCE(a.date_fin, a.date_prevue) < $TODAY::date
              THEN 'en_retard' ELSE a.statut END AS etat
    FROM actions_planifiees a
`;
const actionSelect = (indexDate: number) => ACTION_SELECT.replace('$TODAY', `$${indexDate}`);

attributsPointsRouter.get(
  '/actions',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const communeId = communeRequise(req);
    const q = z.object({ statut: z.enum(STATUTS_ACTION).optional() }).parse(req.query);
    res.json(
      await query(
        `${actionSelect(3)}
          WHERE a.commune_id = $1 AND a.deleted_at IS NULL AND ($2::text IS NULL OR a.statut = $2)
          ORDER BY (a.statut = 'planifiee') DESC, a.date_prevue, a.created_at`,
        [communeId, q.statut ?? null, aujourdhui()]
      )
    );
  })
);

async function action(id: string) {
  const a = await queryOne<{ id: string; commune_id: string; date_prevue: string; date_fin: string | null }>(
    `${actionSelect(2)} WHERE a.id = $1 AND a.deleted_at IS NULL`,
    [id, aujourdhui()]
  );
  if (!a) throw new ApiError(404, 'Action introuvable.');
  return a;
}

attributsPointsRouter.get(
  '/actions/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const a = await action(req.params.id);
    const points = await query(
      `SELECT p.id, p.circuit_id, c.nom AS circuit_nom, p.voyage, p.ordre, p.nom, p.type,
              ST_Y(p.geom)::double precision AS lat, ST_X(p.geom)::double precision AS lng,
              ap.fait_le, u.full_name AS fait_par
         FROM actions_points ap
         JOIN points_collecte p ON p.id = ap.point_id AND p.deleted_at IS NULL
         JOIN circuits c ON c.id = p.circuit_id
         LEFT JOIN users u ON u.id = ap.fait_par
        WHERE ap.action_id = $1
        ORDER BY c.nom, p.voyage, p.ordre`,
      [a.id]
    );
    res.json({ ...a, points });
  })
);

const champsAction = {
  titre: z.string().trim().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  datePrevue: dateIso,
  dateFin: dateIso.nullable().optional(),
  responsable: z.string().trim().max(200).nullable().optional(),
};
const periodeCoherente = {
  message: 'La date de fin précède la date prévue.',
  path: ['dateFin'],
};

export const actionSchema = z
  .object({ ...champsAction, pointIds: z.array(z.string().uuid()).min(1).max(MAX_POINTS_LOT) })
  .refine((d) => !d.dateFin || d.dateFin >= d.datePrevue, periodeCoherente);

attributsPointsRouter.post(
  '/actions',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = actionSchema.parse(req.body);
    // La commune est celle des points : une action n'est pas planifiable sur
    // les points d'une autre commune, quelle que soit celle qu'on annonce.
    const lot = await pointsDuLot(d.pointIds);
    const demandee = communeDemandee(req);
    if (req.user!.role === 'super_admin_fnct' && demandee && demandee !== lot.communeId) {
      throw new ApiError(400, 'Les points désignés ne sont pas de cette commune.');
    }
    const id = await withTransaction(async (client) => {
      const cree = await client.query<{ id: string }>(
        `INSERT INTO actions_planifiees (commune_id, titre, description, date_prevue, date_fin, responsable, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [lot.communeId, d.titre, d.description || null, d.datePrevue, d.dateFin ?? null, d.responsable || null, req.user!.sub]
      );
      await client.query(
        `INSERT INTO actions_points (action_id, point_id, commune_id)
         SELECT $1, unnest($2::uuid[]), $3`,
        [cree.rows[0].id, lot.ids, lot.communeId]
      );
      return cree.rows[0].id;
    });
    res.status(201).json(await action(id));
  })
);

export const majActionSchema = z.object({
  titre: champsAction.titre.optional(),
  description: champsAction.description,
  datePrevue: dateIso.optional(),
  dateFin: champsAction.dateFin,
  responsable: champsAction.responsable,
  statut: z.enum(STATUTS_ACTION).optional(),
});

attributsPointsRouter.patch(
  '/actions/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = majActionSchema.parse(req.body);
    const a = await action(req.params.id);
    const debut = d.datePrevue ?? String(a.date_prevue).slice(0, 10);
    const fin = d.dateFin === undefined ? (a.date_fin ? String(a.date_fin).slice(0, 10) : null) : d.dateFin;
    if (fin && fin < debut) throw new ApiError(400, periodeCoherente.message);
    await query(
      `UPDATE actions_planifiees
          SET titre = COALESCE($2, titre),
              description = CASE WHEN $3::boolean THEN $4 ELSE description END,
              date_prevue = $5,
              date_fin = $6,
              responsable = CASE WHEN $7::boolean THEN $8 ELSE responsable END,
              statut = COALESCE($9, statut),
              terminee_le = CASE
                WHEN $9 = 'terminee' AND statut <> 'terminee' THEN now()
                WHEN $9 IS NOT NULL AND $9 <> 'terminee' THEN NULL
                ELSE terminee_le END
        WHERE id = $1 AND deleted_at IS NULL`,
      [
        a.id,
        d.titre ?? null,
        d.description !== undefined,
        d.description || null,
        debut,
        fin,
        d.responsable !== undefined,
        d.responsable || null,
        d.statut ?? null,
      ]
    );
    res.json(await action(a.id));
  })
);

attributsPointsRouter.delete(
  '/actions/:id',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    await retirer('actions_planifiees', req.params.id, 'Action');
    res.status(204).end();
  })
);

// Ajouter ou retirer des points d'une action : on le dit, point par point. Une
// étiquette posée plus tard n'agrandit pas une campagne déjà annoncée.
export const pointsActionSchema = z
  .object({
    ajouter: z.array(z.string().uuid()).max(MAX_POINTS_LOT).optional(),
    retirer: z.array(z.string().uuid()).max(MAX_POINTS_LOT).optional(),
  })
  .refine((d) => (d.ajouter?.length ?? 0) + (d.retirer?.length ?? 0) > 0, { message: 'Rien à modifier.' });

attributsPointsRouter.post(
  '/actions/:id/points',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = pointsActionSchema.parse(req.body);
    const a = await action(req.params.id);
    if (d.ajouter?.length) {
      const lot = await pointsDuLot(d.ajouter);
      if (lot.communeId !== a.commune_id) throw new ApiError(400, "Ces points ne sont pas de la commune de l'action.");
    }
    await withTransaction(async (client) => {
      if (d.retirer?.length) {
        await client.query('DELETE FROM actions_points WHERE action_id = $1 AND point_id = ANY($2::uuid[])', [
          a.id,
          d.retirer,
        ]);
      }
      if (d.ajouter?.length) {
        await client.query(
          `INSERT INTO actions_points (action_id, point_id, commune_id)
           SELECT $1, unnest($2::uuid[]), $3
           ON CONFLICT (action_id, point_id) DO NOTHING`,
          [a.id, [...new Set(d.ajouter)], a.commune_id]
        );
      }
    });
    res.json(await action(a.id));
  })
);

// L'avancement, point par point : « fait » porte sa date et son auteur.
export const avancementSchema = z.object({
  pointIds: z.array(z.string().uuid()).min(1).max(MAX_POINTS_LOT),
  fait: z.boolean(),
});

attributsPointsRouter.post(
  '/actions/:id/avancement',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const d = avancementSchema.parse(req.body);
    const a = await action(req.params.id);
    const ids = [...new Set(d.pointIds)];
    // Vérifié AVANT d'écrire : un lot à moitié appliqué laisserait croire
    // que tout a été pointé.
    const presents = await query('SELECT 1 FROM actions_points WHERE action_id = $1 AND point_id = ANY($2::uuid[])', [
      a.id,
      ids,
    ]);
    if (presents.length !== ids.length) throw new ApiError(404, 'Point absent de cette action.');
    await query(
      `UPDATE actions_points
          SET fait_le = CASE WHEN $3::boolean THEN COALESCE(fait_le, now()) END,
              fait_par = CASE WHEN $3::boolean THEN COALESCE(fait_par, $4::uuid) END
        WHERE action_id = $1 AND point_id = ANY($2::uuid[])`,
      [a.id, ids, d.fait, req.user!.sub]
    );
    res.json(await action(a.id));
  })
);
