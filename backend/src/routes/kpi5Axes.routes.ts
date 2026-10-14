// Le tableau de bord des indicateurs (5 axes) et la préparation au décret
// DMA — Jalon 8 (TDR §3.2.10, A2.3, A3.1, A3.3, B7.4), refondu au lot 1 de la
// refonte : plus de barème, de note ni de classement, plus de validation des
// valeurs déclarées (SPEC_refonte_indicateurs_saisie.md, D1 et D3).
//
// Les calculs sont dans services/kpi5Axes.ts ; ici, les droits, les
// paramètres de requête et les déclarations.
//
// QUI VOIT QUOI.
//   - La commune : ses propres indicateurs, et les valeurs qu'elle déclare.
//   - La FNCT : tout, les agrégations, les alertes, les seuils, les districts ;
//     elle commente une déclaration, elle ne la saisit ni ne la bloque.
//   - Le prestataire : ses propres indicateurs de service (B7.4), rien de la
//     commune au-delà.

import { Router, type Request } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';
import { agreger, calculerCommune, catalogue, charger, parametres, repartition, type Niveau } from '../services/kpi5Axes.js';
import { exportable } from '../services/export.js';
import { JEU_REPARTITION_COMMUNES, JEU_SERIE_INDICATEUR } from '../services/jeuxExport.js';

export const kpi5AxesRouter = Router();

const ROLES = ['admin_commune', 'super_admin_fnct'] as const;

/** L'année en cours, à Tunis. */
const anneeCourante = () => new Date(Date.now() + 3_600_000).getUTCFullYear();

const anneeSchema = z.coerce.number().int().min(2020).max(2100);
const qAnnee = z.object({ annee: anneeSchema.optional() });
const qNiveau = z.object({
  annee: anneeSchema.optional(),
  niveau: z.enum(['commune', 'gouvernorat', 'district', 'national']).default('commune'),
});

/** Une commune que l'appelant peut lire comme commune ou comme FNCT — sinon 404. */
async function communeVisible(id: string) {
  const c = await queryOne<{ id: string }>('SELECT id FROM communes WHERE id = $1 AND app.can_write_commune(id)', [id]);
  if (!c) throw new ApiError(404, 'Commune introuvable.');
  return c.id;
}

async function districts() {
  const lignes = await query<{ code: string; nom: string }>('SELECT code, nom FROM districts_fnct ORDER BY ordre, nom');
  return new Map(lignes.map((d) => [d.code, d.nom]));
}

// ---------------------------------------------------------------------------
// 1. Le catalogue et les seuils nationaux
// ---------------------------------------------------------------------------

kpi5AxesRouter.get(
  '/indicateurs',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const [indicateurs, p] = await Promise.all([catalogue(), parametres()]);
    res.json({ indicateurs, parametres: p });
  })
);

export const parametresKpiSchema = z
  .object({
    reclamation_delai_heures: z.number().int().min(1).max(2160),
    taux_resolution_min: z.number().min(0).max(100),
    bachage_min: z.number().min(0).max(100),
    maintenance_min: z.number().min(0).max(100),
    dma_en_vigueur: z.union([z.literal(0), z.literal(1)]),
  })
  .partial()
  .strict();

kpi5AxesRouter.put(
  '/parametres',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = parametresKpiSchema.parse(req.body);
    for (const [cle, valeur] of Object.entries(d)) {
      await query('UPDATE parametres_kpi SET valeur = $2, updated_at = now(), updated_by = $3 WHERE cle = $1', [
        cle,
        valeur,
        req.user!.sub,
      ]);
    }
    res.json(await parametres());
  })
);

// ---------------------------------------------------------------------------
// 2. Les districts FNCT — définis par la FNCT, jamais supposés
// ---------------------------------------------------------------------------

kpi5AxesRouter.get(
  '/districts',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const [liste, rattachements, gouvernorats] = await Promise.all([
      query('SELECT code, nom, nom_ar, ordre FROM districts_fnct ORDER BY ordre, nom'),
      query('SELECT gouvernorat, district_code FROM gouvernorats_district ORDER BY gouvernorat'),
      query<{ gouvernorat: string }>(
        'SELECT DISTINCT gouvernorat FROM communes WHERE NOT est_demo AND deleted_at IS NULL ORDER BY gouvernorat'
      ),
    ]);
    res.json({ districts: liste, rattachements, gouvernorats: gouvernorats.map((g) => g.gouvernorat) });
  })
);

export const districtsSchema = z.object({
  districts: z
    .array(
      z.object({
        code: z.string().regex(/^[a-z0-9_-]{1,40}$/, 'Code en minuscules, chiffres, tirets.'),
        nom: z.string().trim().min(1).max(80),
        nom_ar: z.string().trim().max(80).nullable().optional(),
      })
    )
    .max(20),
  // Gouvernorat → code du district ; absent ou null : non rattaché.
  rattachements: z.record(z.string(), z.string().nullable()),
});

kpi5AxesRouter.put(
  '/districts',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = districtsSchema.parse(req.body);
    const codes = new Set(d.districts.map((x) => x.code));
    if (codes.size !== d.districts.length) throw new ApiError(400, 'Deux districts portent le même code.');
    const gouvernorats = new Set(
      (await query<{ gouvernorat: string }>('SELECT DISTINCT gouvernorat FROM communes WHERE NOT est_demo AND deleted_at IS NULL')).map(
        (g) => g.gouvernorat
      )
    );
    for (const [g, code] of Object.entries(d.rattachements)) {
      if (!gouvernorats.has(g)) throw new ApiError(400, `Gouvernorat inconnu : ${g}.`);
      if (code && !codes.has(code)) throw new ApiError(400, `District inconnu : ${code}.`);
    }
    await withTransaction(async (client) => {
      await client.query('DELETE FROM gouvernorats_district');
      await client.query('DELETE FROM districts_fnct WHERE NOT (code = ANY($1::text[]))', [[...codes]]);
      for (const [i, x] of d.districts.entries()) {
        await client.query(
          `INSERT INTO districts_fnct (code, nom, nom_ar, ordre) VALUES ($1, $2, $3, $4)
           ON CONFLICT (code) DO UPDATE SET nom = EXCLUDED.nom, nom_ar = EXCLUDED.nom_ar, ordre = EXCLUDED.ordre`,
          [x.code, x.nom, x.nom_ar || null, i]
        );
      }
      for (const [g, code] of Object.entries(d.rattachements)) {
        if (code) await client.query('INSERT INTO gouvernorats_district (gouvernorat, district_code) VALUES ($1, $2)', [g, code]);
      }
    });
    res.json({ districts: d.districts.length, rattaches: Object.values(d.rattachements).filter(Boolean).length });
  })
);

// ---------------------------------------------------------------------------
// 3. Les déclarations de la commune (refonte, lot 1 ; D3)
//
// Une valeur déclarée vaut dès qu'elle est enregistrée : plus de brouillon, de
// soumission ni de validation. Une correction remplace la précédente, que le
// journal d'audit garde ; une case vidée retire la déclaration (retrait
// logique) et l'indicateur redevient « non renseigné » — il ne devient pas
// zéro. La base tient les mêmes règles (migration 068).
// ---------------------------------------------------------------------------

const paramsDeclarations = (req: Request) =>
  z.object({ communeId: z.string().min(1), annee: anneeSchema }).parse(req.params);

const ERREURS_DECLARATION: Record<string, number> = {
  DECLARATION_INDICATEUR_CALCULE: 400,
  DECLARATION_TAUX: 400,
  DECLARATION_CIBLE: 400,
};

kpi5AxesRouter.get(
  '/declarations/:communeId/:annee',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const { communeId, annee } = paramsDeclarations(req);
    await communeVisible(communeId);
    const [profil, declarations, indications] = await Promise.all([
      queryOne('SELECT a_abattoir, decharge_controlee_anged FROM parametres_commune WHERE commune_id = $1', [communeId]),
      query(
        `SELECT d.id, d.indicateur_code AS code, d.valeur::float, d.cible::float, d.commentaire, d.saisi_le,
                u.full_name AS saisi_par, d.commentaire_fnct, d.commente_le
           FROM declarations_indicateurs d LEFT JOIN users u ON u.id = d.saisi_par
          WHERE d.commune_id = $1 AND d.annee = $2 AND d.mois IS NULL AND d.deleted_at IS NULL
          ORDER BY d.indicateur_code`,
        [communeId, annee]
      ),
      // De quoi pré-remplir une cible sans la deviner : ce que SIIPI sait déjà
      // (effectif ouvrier déclaré, conteneurs et secteurs enregistrés).
      queryOne(
        `SELECT (SELECT effectif_ouvriers FROM effectifs_service WHERE commune_id = $1 AND annee = $2 AND service = 'proprete' LIMIT 1) AS effectif_ouvriers,
                (SELECT count(*)::int FROM conteneurs WHERE commune_id = $1 AND deleted_at IS NULL) AS conteneurs,
                (SELECT count(*)::int FROM zones_collecte WHERE commune_id = $1 AND deleted_at IS NULL) AS secteurs,
                (SELECT count(*)::int FROM actions_planifiees WHERE commune_id = $1 AND deleted_at IS NULL
                    AND statut = 'terminee' AND extract(year FROM date_prevue) = $2) AS actions_terminees`,
        [communeId, annee]
      ),
    ]);
    res.json({
      profil: profil ?? { a_abattoir: null, decharge_controlee_anged: null },
      declarations,
      indications,
    });
  })
);

const saisieSchema = z
  .object({
    valeur: z.number().min(0).max(1e12),
    cible: z.number().positive().max(1e12).nullable().optional(),
    commentaire: z.string().trim().max(2000).nullable().optional(),
  })
  .nullable();

export const declarationsSchema = z
  .object({
    // Ce que la commune dit d'elle-même : seul effet, rendre un indicateur
    // « sans objet » (pas d'abattoir, décharge contrôlée par l'ANGeD).
    profil: z
      .object({ a_abattoir: z.boolean().nullable(), decharge_controlee_anged: z.boolean().nullable() })
      .partial()
      .strict()
      .optional(),
    // null retire la déclaration : l'indicateur redevient « non renseigné ».
    valeurs: z.record(z.string(), saisieSchema).optional(),
  })
  .strict();

kpi5AxesRouter.put(
  '/declarations/:communeId/:annee',
  requireAuth,
  // La commune déclare ; la FNCT commente, elle ne saisit pas à sa place
  // (CLAUDE.md § 6). La base le refuse aussi (migration 068).
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const { communeId, annee } = paramsDeclarations(req);
    await communeVisible(communeId);
    const d = declarationsSchema.parse(req.body);
    const qui = req.user;
    if (!qui) throw new ApiError(401, 'Authentification requise.');
    const cat = new Map((await catalogue()).map((i) => [i.code, i]));

    for (const [code, v] of Object.entries(d.valeurs ?? {})) {
      const ind = cat.get(code);
      if (!ind || ind.mode !== 'saisi') throw new ApiError(400, `« ${code} » ne se déclare pas : il est calculé par la plateforme, ou n'existe pas.`);
      if (!v) continue;
      if (ind.saisie === 'taux' && v.valeur > 100) throw new ApiError(400, `« ${ind.libelle_fr} » est un taux : 100 % au plus.`);
      if (ind.saisie === 'ratio' && !v.cible) throw new ApiError(400, `« ${ind.libelle_fr} » se rapporte à une cible : ${ind.libelle_cible ?? 'cible'} requise.`);
      if (ind.saisie === 'ratio' && v.cible && v.valeur > v.cible * 10) {
        throw new ApiError(400, `« ${ind.libelle_fr} » : la valeur dépasse dix fois la cible — une erreur de saisie ?`);
      }
    }

    try {
      await withTransaction(async (client) => {
        const champs = (['a_abattoir', 'decharge_controlee_anged'] as const).filter((k) => d.profil && k in d.profil);
        if (d.profil && champs.length) {
          const profil = d.profil;
          await client.query(
            `INSERT INTO parametres_commune (commune_id, ${champs.join(', ')})
             VALUES ($1, ${champs.map((_, i) => `$${i + 2}`).join(', ')})
             ON CONFLICT (commune_id) DO UPDATE SET ${champs.map((k) => `${k} = EXCLUDED.${k}`).join(', ')}, updated_at = now()`,
            [communeId, ...champs.map((k) => profil[k] ?? null)]
          );
        }
        for (const [code, v] of Object.entries(d.valeurs ?? {})) {
          if (!v) {
            await client.query('SELECT app.retirer_declaration($1, $2, $3)', [communeId, code, annee]);
            continue;
          }
          // Une correction remplace la déclaration en vigueur ; le journal
          // d'audit garde la précédente.
          const maj = await client.query(
            `UPDATE declarations_indicateurs
                SET valeur = $4, cible = $5, commentaire = $6, saisi_par = $7, saisi_le = now()
              WHERE commune_id = $1 AND indicateur_code = $2 AND annee = $3 AND mois IS NULL AND deleted_at IS NULL`,
            [communeId, code, annee, v.valeur, v.cible ?? null, v.commentaire || null, qui.sub]
          );
          if (maj.rowCount === 0) {
            await client.query(
              `INSERT INTO declarations_indicateurs (commune_id, indicateur_code, annee, valeur, cible, commentaire, saisi_par)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [communeId, code, annee, v.valeur, v.cible ?? null, v.commentaire || null, qui.sub]
            );
          }
        }
      });
    } catch (err) {
      const m = (err as { message?: string }).message ?? '';
      const code = m.split(':')[0];
      const statut = ERREURS_DECLARATION[code];
      if (statut) throw new ApiError(statut, m.slice(code.length + 2));
      throw err;
    }
    res.json({ enregistrees: Object.keys(d.valeurs ?? {}).length });
  })
);

export const commentaireFnctSchema = z.object({ commentaire: z.string().trim().max(2000) }).strict();

// Le commentaire de la FNCT sur une valeur déclarée (D3) : il se lit à côté de
// la valeur, il ne la bloque pas. Une chaîne vide le retire.
kpi5AxesRouter.post(
  '/commentaires-fnct/:declarationId',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const { commentaire } = commentaireFnctSchema.parse(req.body);
    if (!/^[0-9a-f-]{36}$/i.test(req.params.declarationId)) throw new ApiError(404, 'Déclaration introuvable.');
    try {
      res.json(await queryOne('SELECT * FROM app.commenter_declaration($1, $2)', [req.params.declarationId, commentaire]));
    } catch (err) {
      const m = (err as { message?: string }).message ?? '';
      if (m.startsWith('DECLARATION_INTROUVABLE')) throw new ApiError(404, 'Déclaration introuvable.');
      throw err;
    }
  })
);

// ---------------------------------------------------------------------------
// 4. Une commune : ses 5 axes, sa couverture, sa préparation DMA (A2.3 pour la FNCT)
// ---------------------------------------------------------------------------

kpi5AxesRouter.get(
  '/5-axes',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const q = qAnnee.parse(req.query);
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    await communeVisible(communeId);
    const annee = q.annee ?? anneeCourante();
    const ctx = await charger(annee, [communeId]);
    res.json({ annee, parametres: ctx.parametres, ...calculerCommune(ctx, communeId) });
  })
);

// ---------------------------------------------------------------------------
// 4 bis. Les séries, ce qui manque, le repère du gouvernorat (refonte, lot 3a)
// ---------------------------------------------------------------------------
//
// UNE VALEUR, PAS DEUX. Le point annuel d'une série est calculé par le même
// service que la carte de l'indicateur (charger + calculerCommune) : la courbe
// et la carte ne peuvent pas dire deux chiffres différents pour la même année.
// Le pas mensuel vient de app.serie_indicateur (migration 070), qui rejoue le
// même calcul sur chaque mois.

const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');
export const qSerieSchema = z.object({
  code: z.string().trim().min(1).max(40),
  debut: dateIso,
  fin: dateIso,
  pas: z.enum(['mois', 'annee']),
});
export const qManquesSchema = z.object({
  code: z.string().trim().min(1).max(40),
  annee: anneeSchema.optional(),
});

const ERREURS_SERIE = new Set(['SERIE_INDICATEUR', 'SERIE_PAS', 'SERIE_BORNES', 'SERIE_ETENDUE']);

/** Une erreur codée de la base (« SERIE_PAS: … ») devient un 400 au message lisible. */
async function avecErreursSerie<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (err) {
    const m = (err as { message?: string }).message ?? '';
    const code = m.split(':')[0];
    if (ERREURS_SERIE.has(code)) throw new ApiError(400, m.slice(code.length + 2));
    throw err;
  }
}

/** Le jour à Tunis, au format AAAA-MM-JJ. */
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

async function indicateurConnu(code: string) {
  const ind = (await catalogue()).find((i) => i.code === code);
  if (!ind) throw new ApiError(400, `Indicateur inconnu : ${code}.`);
  return ind;
}

export interface PointSerie {
  periode_debut: string;
  periode_fin: string;
  valeur: number;
  taux_atteinte: number | null;
  source: 'mesure' | 'declare';
  detail: Record<string, unknown>;
}

kpi5AxesRouter.get(
  '/serie',
  requireAuth,
  requireRole(...ROLES),
  exportable(JEU_SERIE_INDICATEUR, (req) => {
    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    return [communeDemandee(req), code].filter(Boolean).join('-') || undefined;
  }),
  asyncHandler(async (req, res) => {
    const q = qSerieSchema.parse(req.query);
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    await communeVisible(communeId);
    const ind = await indicateurConnu(q.code);
    if (q.debut > q.fin) throw new ApiError(400, 'Le début doit précéder la fin.');

    if (q.pas === 'mois') {
      const lignes = await avecErreursSerie(() =>
        query<{ periode_debut: string; periode_fin: string; valeur: string; note: string | null; source: PointSerie['source']; detail: Record<string, unknown> }>(
          'SELECT periode_debut, periode_fin, valeur, note, source, detail FROM app.serie_indicateur($1, $2, $3::date, $4::date, $5)',
          [communeId, q.code, q.debut, q.fin, q.pas]
        )
      );
      const points: PointSerie[] = lignes.map((l) => ({
        periode_debut: l.periode_debut,
        periode_fin: l.periode_fin,
        valeur: Number(l.valeur),
        taux_atteinte: l.note == null ? null : Number(l.note),
        source: l.source,
        detail: l.detail ?? {},
      }));
      res.json(points);
      return;
    }

    const premiere = Number(q.debut.slice(0, 4));
    const derniere = Math.min(Number(q.fin.slice(0, 4)), anneeCourante());
    if (derniere - premiere > 10) throw new ApiError(400, 'Une série couvre au plus 10 ans.');
    const points: PointSerie[] = [];
    for (let annee = premiere; annee <= derniere; annee++) {
      // Un état d'aujourd'hui (plans d'entretien, circuits enregistrés) ne se
      // reporte pas sur les années passées.
      if (ind.granularite === 'actuelle' && annee !== anneeCourante()) continue;
      const ctx = await charger(annee, [communeId]);
      const r = calculerCommune(ctx, communeId).indicateurs.find((x) => x.code === q.code);
      // Une année sans valeur n'a pas de point (règle d'or 1.1).
      if (!r || r.valeur == null || r.statut === 'sans_objet' || r.source == null) continue;
      points.push({
        periode_debut: `${annee}-01-01`,
        periode_fin: annee === anneeCourante() ? aujourdhui() : `${annee}-12-31`,
        valeur: r.valeur,
        taux_atteinte: r.taux_atteinte,
        source: r.source,
        detail: r.detail,
      });
    }
    res.json(points);
  })
);

kpi5AxesRouter.get(
  '/reference-gouvernorat',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const q = qSerieSchema.parse(req.query);
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    await communeVisible(communeId);
    await indicateurConnu(q.code);
    const lignes = await avecErreursSerie(() =>
      query<{ periode_debut: string; periode_fin: string; moyenne: string; communes: number }>(
        'SELECT periode_debut, periode_fin, moyenne, communes FROM app.reference_gouvernorat($1, $2, $3::date, $4::date, $5)',
        [communeId, q.code, q.debut, q.fin, q.pas]
      )
    );
    res.json(lignes.map((l) => ({ ...l, moyenne: Number(l.moyenne) })));
  })
);

kpi5AxesRouter.get(
  '/manques',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const q = qManquesSchema.parse(req.query);
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    await communeVisible(communeId);
    await indicateurConnu(q.code);
    const annee = q.annee ?? anneeCourante();
    const fin = annee === anneeCourante() ? aujourdhui() : `${annee}-12-31`;
    res.json(
      await query(
        `SELECT groupe, ordre, source, nature, cible, declare_code, libelle_fr, libelle_ar
           FROM app.manques_indicateur($1, $2, $3::date, $4::date)`,
        [communeId, q.code, `${annee}-01-01`, fin]
      )
    );
  })
);

export const qSeriesCommuneSchema = z.object({ debut: dateIso, fin: dateIso });

// Les petites courbes des cartes (lot 3b) : toutes les séries mensuelles d'une
// commune en un passage (migration 071), chaque mois calculé une seule fois.
kpi5AxesRouter.get(
  '/series',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const q = qSeriesCommuneSchema.parse(req.query);
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    await communeVisible(communeId);
    if (q.debut > q.fin) throw new ApiError(400, 'Le début doit précéder la fin.');
    const lignes = await avecErreursSerie(() =>
      query<{ code: string; periode_debut: string; periode_fin: string; valeur: string; note: string | null; source: PointSerie['source'] }>(
        'SELECT code, periode_debut, periode_fin, valeur, note, source FROM app.series_commune($1, $2::date, $3::date)',
        [communeId, q.debut, q.fin]
      )
    );
    res.json(
      lignes.map((l) => ({
        code: l.code,
        periode_debut: l.periode_debut,
        periode_fin: l.periode_fin,
        valeur: Number(l.valeur),
        taux_atteinte: l.note == null ? null : Number(l.note),
        source: l.source,
      }))
    );
  })
);

// Les sources de chaque indicateur, pour la partie « formule et sources » du
// panneau (lot 3b) : la même donnée que « ce qui manque », sans le filtre.
kpi5AxesRouter.get(
  '/dependances',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(
      await query(
        `SELECT d.indicateur_code, d.groupe, d.ordre, s.code AS source, s.nature,
                CASE WHEN s.nature = 'declaration' THEN d.declare_code ELSE s.cible END AS cible, d.declare_code,
                CASE WHEN s.nature = 'declaration' THEN s.libelle_fr || ' : ' || k.libelle_fr ELSE s.libelle_fr END AS libelle_fr,
                CASE WHEN s.nature = 'declaration' THEN s.libelle_ar || ': ' || k.libelle_ar ELSE s.libelle_ar END AS libelle_ar
           FROM dependances_indicateurs d
           JOIN sources_indicateurs s ON s.code = d.source
           LEFT JOIN indicateurs_kpi k ON k.code = d.declare_code
          ORDER BY d.indicateur_code, d.groupe, d.ordre`
      )
    );
  })
);

// « Ma commune dans SIIPI » (lot 5 ; SPEC § 2.4). Une commune à la fois, sans
// total ni pourcentage : une liste de choses à faire, pas une note. Il n'existe
// volontairement pas de version « toutes les communes » — elle deviendrait un
// classement de complétude.
export const qCompletudeSchema = z.object({
  jour: dateIso
    .refine((j) => !Number.isNaN(Date.parse(`${j}T00:00:00Z`)) && new Date(`${j}T00:00:00Z`).toISOString().startsWith(j), 'Cette date n’existe pas.')
    .optional(),
});

kpi5AxesRouter.get(
  '/completude',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const q = qCompletudeSchema.parse(req.query);
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise : précisez communeId.');
    await communeVisible(communeId);
    const jour = q.jour ?? aujourdhui();
    if (jour > aujourdhui()) throw new ApiError(400, 'Le jour de référence ne peut pas être dans le futur : choisissez aujourd’hui ou une date passée.');
    const lignes = await query<{ nombre: string | null } & Record<string, unknown>>(
      `SELECT code, rubrique, ordre, libelle_fr, libelle_ar, aide_fr, aide_ar, nature, cible,
              present, nombre, annee, indicateurs
         FROM app.completude_commune($1, $2::date)`,
      [communeId, jour]
    );
    res.json({ jour, elements: lignes.map((l) => ({ ...l, nombre: l.nombre == null ? null : Number(l.nombre) })) });
  })
);

// ---------------------------------------------------------------------------
// 5. Les vues nationales (FNCT) : 5 axes, DMA — par niveau
// ---------------------------------------------------------------------------

async function toutesLesCommunes(annee: number) {
  const ctx = await charger(annee);
  return { ctx, communes: ctx.communes.map((c) => calculerCommune(ctx, c.id)) };
}

kpi5AxesRouter.get(
  '/national',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const q = qNiveau.parse(req.query);
    const annee = q.annee ?? anneeCourante();
    const { communes } = await toutesLesCommunes(annee);
    if (q.niveau === 'commune') {
      return res.json(
        communes
          // Seules les communes dont au moins un axe est renseigné : les
          // autres n'ont aucun chiffre à montrer.
          .filter((c) => c.axes.some((a) => a.indice != null) || c.indicateurs.some((i) => i.famille === 'donnee' && i.valeur != null))
          .map((c) => ({
            commune_id: c.commune_id,
            nom: c.nom,
            gouvernorat: c.gouvernorat,
            district: c.district,
            axes: c.axes,
            couverture: c.couverture,
            dma: c.dma,
          }))
      );
    }
    res.json(agreger(communes, q.niveau as Exclude<Niveau, 'commune'>, await districts()));
  })
);

kpi5AxesRouter.get(
  '/dma',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const q = qNiveau.parse(req.query);
    const annee = q.annee ?? anneeCourante();
    const { ctx, communes } = await toutesLesCommunes(annee);
    const lignes =
      q.niveau === 'commune'
        ? communes
            .filter((c) => c.dma.indice != null)
            // Par nom, jamais par indice : une liste rangée du meilleur au
            // moins bon serait un palmarès (SPEC refonte, D1 et § 4).
            .sort((a, b) => a.nom.localeCompare(b.nom))
            .map((c) => ({
              commune_id: c.commune_id,
              nom: c.nom,
              gouvernorat: c.gouvernorat,
              dma: c.dma,
              indicateurs: c.indicateurs
                .filter((i) => i.famille === 'dma')
                .map((i) => ({ code: i.code, statut: i.statut, valeur: i.valeur, cible: i.cible, taux_atteinte: i.taux_atteinte })),
            }))
        : agreger(communes, q.niveau as Exclude<Niveau, 'commune'>, await districts()).map((g) => ({
            cle: g.cle,
            nom: g.nom,
            communes: g.communes,
            dma: g.dma,
          }));
    res.json({ en_vigueur: ctx.parametres.dma_en_vigueur === 1, lignes });
  })
);

// ---------------------------------------------------------------------------
// 5 bis. La répartition d'un indicateur (refonte, lot 4a ; SPEC_refonte § 4)
// ---------------------------------------------------------------------------
//
// Par gouvernorat, par district ou pour tout le pays : la moyenne, et sur
// combien de communes elle porte. Au niveau commune (la FNCT a un accès
// complet) : la valeur de chacune, par ordre alphabétique — aucun rang.

export const qRepartitionSchema = z.object({
  annee: anneeSchema.optional(),
  code: z.string().trim().min(1).max(40),
  niveau: z.enum(['commune', 'gouvernorat', 'district', 'national']).default('gouvernorat'),
});

kpi5AxesRouter.get(
  '/repartition',
  requireAuth,
  requireRole('super_admin_fnct'),
  exportable(JEU_REPARTITION_COMMUNES, (req) => (typeof req.query.code === 'string' ? req.query.code : undefined)),
  asyncHandler(async (req, res) => {
    const q = qRepartitionSchema.parse(req.query);
    const ind = (await catalogue()).find((i) => i.code === q.code);
    if (!ind) throw new ApiError(400, `Indicateur inconnu : ${q.code}.`);
    const annee = q.annee ?? anneeCourante();
    const { communes } = await toutesLesCommunes(annee);
    if (q.niveau !== 'commune') {
      res.json(repartition(communes, q.code, q.niveau, await districts()));
      return;
    }
    const noms = await districts();
    res.json(
      communes
        .map((c) => {
          const r = c.indicateurs.find((i) => i.code === q.code);
          return {
            commune_id: c.commune_id,
            nom: c.nom,
            nom_ar: c.nom_ar,
            gouvernorat: c.gouvernorat,
            district: c.district ? (noms.get(c.district) ?? c.district) : null,
            statut: r?.statut ?? 'non_renseigne',
            source: r?.source ?? null,
            valeur: r?.valeur ?? null,
            taux_atteinte: r?.taux_atteinte ?? null,
          };
        })
        .sort((a, b) => a.nom.localeCompare(b.nom))
    );
  })
);

// ---------------------------------------------------------------------------
// 6. Les alertes nationales (A3.3)
// ---------------------------------------------------------------------------

kpi5AxesRouter.get(
  '/alertes',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const annee = qAnnee.parse(req.query).annee ?? anneeCourante();
    const { ctx, communes } = await toutesLesCommunes(annee);
    const p = ctx.parametres;
    const alertes: { commune_id: string; nom: string; gouvernorat: string; gravite: string; code: string; constat: string }[] = [];
    const par = new Map(communes.map((c) => [c.commune_id, c]));

    // Les réclamations qui attendent au-delà du seuil national (en heures).
    const attente = await query<{ commune_id: string; n: number; heures_max: number }>(
      `SELECT commune_id, count(*)::int AS n, max(extract(epoch FROM now() - created_at) / 3600)::int AS heures_max
         FROM tickets
        WHERE deleted_at IS NULL AND status IN ('recu', 'assigne', 'en_cours')
          AND created_at < now() - make_interval(hours => $1)
        GROUP BY commune_id`,
      [p.reclamation_delai_heures]
    );
    for (const a of attente) {
      const c = par.get(a.commune_id);
      if (!c) continue;
      alertes.push({
        commune_id: c.commune_id,
        nom: c.nom,
        gouvernorat: c.gouvernorat,
        gravite: a.heures_max >= 3 * p.reclamation_delai_heures ? 'bloquant' : 'avertissement',
        code: 'reclamations_en_attente',
        constat: `${a.n} réclamation(s) en attente depuis plus de ${p.reclamation_delai_heures} h (la plus ancienne : ${a.heures_max} h).`,
      });
    }

    const sous = (code: string, seuil: number, cle: string, texte: (v: number) => string) => {
      for (const c of communes) {
        const r = c.indicateurs.find((i) => i.code === code);
        if (r?.statut !== 'renseigne' || r.taux_atteinte == null) continue;
        const v = Math.round(100 * r.taux_atteinte);
        if (v < seuil) alertes.push({ commune_id: c.commune_id, nom: c.nom, gouvernorat: c.gouvernorat, gravite: 'avertissement', code: cle, constat: texte(v) });
      }
    };
    sous('M3-1', p.taux_resolution_min, 'resolution_faible', (v) => `Réclamations : taux de traitement de ${v} % (seuil : ${p.taux_resolution_min} %).`);
    sous('M1-9', p.bachage_min, 'bachage_insuffisant', (v) => `Bâchage des bennes : ${v} % (seuil : ${p.bachage_min} %).`);
    sous('M1-7', p.maintenance_min, 'maintenance_en_retard', (v) => `Plans d'entretien à jour : ${v} % (seuil : ${p.maintenance_min} %).`);

    const rang: Record<string, number> = { bloquant: 0, avertissement: 1, information: 2 };
    res.json(alertes.sort((a, b) => rang[a.gravite] - rang[b.gravite] || a.nom.localeCompare(b.nom)));
  })
);

// ---------------------------------------------------------------------------
// 7. Le tableau de bord restreint du prestataire (B7.4)
// ---------------------------------------------------------------------------

kpi5AxesRouter.get(
  '/prestataire',
  requireAuth,
  requireRole('gestionnaire_prestataire'),
  asyncHandler(async (req, res) => {
    const annee = qAnnee.parse(req.query).annee ?? anneeCourante();
    const fin = annee === anneeCourante() ? new Date(Date.now() + 3_600_000).toISOString().slice(0, 10) : `${annee}-12-31`;
    // La fonction existante (migration 029) lit sous la RLS du prestataire ;
    // on n'en garde que ses propres lignes.
    const lignes = await query(
      `SELECT * FROM app.performance_prestataires(NULL, $1::date, $2::date) WHERE prestataire_id = $3`,
      [`${annee}-01-01`, fin, req.user!.sub]
    );
    res.json({ annee, lignes });
  })
);
