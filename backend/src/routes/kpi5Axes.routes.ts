// Le tableau de bord KPI 5 axes, le Concours national de propreté et la
// préparation au décret DMA — Jalon 8 (TDR §3.2.10, A2.3, A3.1, A3.3, B7.4).
//
// Les calculs sont dans services/kpi5Axes.ts ; ici, les droits, les
// paramètres de requête, la fiche d'évaluation et ses étapes.
//
// QUI VOIT QUOI.
//   - La commune : ses propres indicateurs et sa fiche d'évaluation.
//   - La FNCT : tout, les classements et les agrégations, les alertes, le
//     barème, les districts, et la validation des fiches.
//   - Le prestataire : ses propres indicateurs de service (B7.4), rien de la
//     commune au-delà.

import { Router, type Request } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';
import { exportable } from '../services/export.js';
import { JEU_CONCOURS } from '../services/jeuxExport.js';
import {
  agreger,
  calculerCommune,
  catalogue,
  charger,
  classement,
  marquerOfficiel,
  parametres,
  type Niveau,
} from '../services/kpi5Axes.js';

export const kpi5AxesRouter = Router();

const ROLES = ['admin_commune', 'super_admin_fnct'] as const;

/** L'année en cours, à Tunis. */
const anneeCourante = () => new Date(Date.now() + 3_600_000).getUTCFullYear();

const anneeSchema = z.coerce.number().int().min(2020).max(2100);
const qAnnee = z.object({ annee: anneeSchema.optional() });
const qNiveau = z.object({
  annee: anneeSchema.optional(),
  niveau: z.enum(['commune', 'gouvernorat', 'district', 'national']).default('commune'),
  officiel: z.enum(['true', 'false']).optional(),
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
// 1. Le catalogue, le barème, les paramètres nationaux
// ---------------------------------------------------------------------------

kpi5AxesRouter.get(
  '/indicateurs',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const [indicateurs, p] = await Promise.all([catalogue(), parametres()]);
    res.json({ indicateurs, parametres: p });
  })
);

export const baremeSchema = z.object({
  // Les points des 19 indicateurs du Concours, tous ; leur somme fait 100.
  points: z.record(z.string(), z.number().min(0).max(100)),
  // Vrai : la FNCT confirme que c'est le barème ministériel — l'écran
  // cesse de le dire provisoire.
  confirmer: z.boolean().optional(),
});

kpi5AxesRouter.put(
  '/bareme',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = baremeSchema.parse(req.body);
    const codes = (await catalogue()).filter((i) => i.famille === 'concours').map((i) => i.code);
    const manquants = codes.filter((c) => !(c in d.points));
    const inconnus = Object.keys(d.points).filter((c) => !codes.includes(c));
    if (manquants.length || inconnus.length) {
      throw new ApiError(400, `Le barème porte sur les ${codes.length} indicateurs du Concours, et eux seuls.`);
    }
    const total = Object.values(d.points).reduce((s, x) => s + x, 0);
    if (Math.abs(total - 100) > 0.01) throw new ApiError(400, `Le barème doit totaliser 100 points (il en fait ${total}).`);
    await withTransaction(async (client) => {
      for (const [code, points] of Object.entries(d.points)) {
        await client.query('UPDATE indicateurs_kpi SET points = $2, updated_at = now(), updated_by = $3 WHERE code = $1', [
          code,
          points,
          req.user!.sub,
        ]);
      }
      if (d.confirmer) {
        await client.query(
          `UPDATE parametres_kpi SET valeur = 0, updated_at = now(), updated_by = $1 WHERE cle = 'bareme_provisoire'`,
          [req.user!.sub]
        );
      }
    });
    res.json({ indicateurs: await catalogue(), parametres: await parametres() });
  })
);

export const parametresKpiSchema = z
  .object({
    reclamation_delai_heures: z.number().int().min(1).max(2160),
    taux_resolution_min: z.number().min(0).max(100),
    bachage_min: z.number().min(0).max(100),
    maintenance_min: z.number().min(0).max(100),
    couverture_classement_min: z.number().min(0).max(100),
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
      query<{ gouvernorat: string }>('SELECT DISTINCT gouvernorat FROM communes ORDER BY gouvernorat'),
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
      (await query<{ gouvernorat: string }>('SELECT DISTINCT gouvernorat FROM communes')).map((g) => g.gouvernorat)
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
// 3. La fiche d'évaluation annuelle
// ---------------------------------------------------------------------------

const paramsFiche = (req: Request) =>
  z.object({ communeId: z.string().min(1), annee: anneeSchema }).parse(req.params);

async function fiche(communeId: string, annee: number) {
  return queryOne<{ id: string; statut: string; commune_id: string }>(
    'SELECT * FROM evaluations_kpi WHERE commune_id = $1 AND annee = $2',
    [communeId, annee]
  );
}

kpi5AxesRouter.get(
  '/evaluations/:communeId/:annee',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const { communeId, annee } = paramsFiche(req);
    await communeVisible(communeId);
    const f = await fiche(communeId, annee);
    const valeurs = f
      ? await query(
          `SELECT v.indicateur_code AS code, v.valeur::float, v.cible::float, v.commentaire, v.updated_at, u.full_name AS saisi_par
             FROM valeurs_kpi v LEFT JOIN users u ON u.id = v.saisi_par
            WHERE v.evaluation_id = $1 ORDER BY v.indicateur_code`,
          [f.id]
        )
      : [];
    // De quoi pré-remplir une cible sans la deviner : ce que SIIPI sait déjà
    // (effectif ouvrier déclaré, conteneurs et secteurs enregistrés).
    const indications = await queryOne(
      `SELECT (SELECT effectif_ouvriers FROM effectifs_service WHERE commune_id = $1 AND annee = $2 AND service = 'proprete' LIMIT 1) AS effectif_ouvriers,
              (SELECT count(*)::int FROM conteneurs WHERE commune_id = $1 AND deleted_at IS NULL) AS conteneurs,
              (SELECT count(*)::int FROM zones_collecte WHERE commune_id = $1 AND deleted_at IS NULL) AS secteurs,
              (SELECT count(*)::int FROM actions_planifiees WHERE commune_id = $1 AND deleted_at IS NULL
                  AND statut = 'terminee' AND extract(year FROM date_prevue) = $2) AS actions_terminees`,
      [communeId, annee]
    );
    res.json({ fiche: f, valeurs, indications });
  })
);

const saisieSchema = z
  .object({
    valeur: z.number().min(0).max(1e12),
    cible: z.number().positive().max(1e12).nullable().optional(),
    commentaire: z.string().trim().max(2000).nullable().optional(),
  })
  .nullable();

export const ficheSchema = z
  .object({
    a_abattoir: z.boolean().nullable(),
    decharge_controlee_anged: z.boolean().nullable(),
    experience_innovante: z.boolean().nullable(),
    agent_reclamations: z.boolean().nullable(),
    // null retire la valeur : l'indicateur redevient « non renseigné ».
    valeurs: z.record(z.string(), saisieSchema),
  })
  .partial()
  .strict();

kpi5AxesRouter.put(
  '/evaluations/:communeId/:annee',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const { communeId, annee } = paramsFiche(req);
    await communeVisible(communeId);
    const d = ficheSchema.parse(req.body);
    const cat = new Map((await catalogue()).map((i) => [i.code, i]));

    for (const [code, v] of Object.entries(d.valeurs ?? {})) {
      const ind = cat.get(code);
      if (!ind || ind.mode !== 'saisi') throw new ApiError(400, `« ${code} » ne se saisit pas : il est calculé par la plateforme, ou n'existe pas.`);
      if (!v) continue;
      if (ind.saisie === 'taux' && v.valeur > 100) throw new ApiError(400, `« ${ind.libelle_fr} » est un taux : 100 % au plus.`);
      if (ind.saisie === 'ratio' && !v.cible) throw new ApiError(400, `« ${ind.libelle_fr} » se rapporte à une cible : ${ind.libelle_cible ?? 'cible'} requise.`);
      if (ind.saisie === 'ratio' && v.cible && v.valeur > v.cible * 10) {
        throw new ApiError(400, `« ${ind.libelle_fr} » : la valeur dépasse dix fois la cible — une erreur de saisie ?`);
      }
    }

    const existante = await fiche(communeId, annee);
    if (existante?.statut === 'validee') {
      throw new ApiError(409, 'Cette fiche est validée par la FNCT : elle doit d’abord être rouverte.');
    }

    const id = await withTransaction(async (client) => {
      const f = await client.query<{ id: string }>(
        `INSERT INTO evaluations_kpi (commune_id, annee) VALUES ($1, $2)
         ON CONFLICT (commune_id, annee) DO UPDATE SET updated_at = now()
         RETURNING id`,
        [communeId, annee]
      );
      const ficheId = f.rows[0].id;
      const drapeaux = (['a_abattoir', 'decharge_controlee_anged', 'experience_innovante', 'agent_reclamations'] as const).filter(
        (k) => k in d
      );
      if (drapeaux.length) {
        await client.query(
          `UPDATE evaluations_kpi SET ${drapeaux.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`,
          [ficheId, ...drapeaux.map((k) => d[k])]
        );
      }
      for (const [code, v] of Object.entries(d.valeurs ?? {})) {
        if (!v) {
          await client.query('DELETE FROM valeurs_kpi WHERE evaluation_id = $1 AND indicateur_code = $2', [ficheId, code]);
        } else {
          await client.query(
            `INSERT INTO valeurs_kpi (evaluation_id, commune_id, indicateur_code, valeur, cible, commentaire, saisi_par)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (evaluation_id, indicateur_code) DO UPDATE SET
               valeur = EXCLUDED.valeur, cible = EXCLUDED.cible, commentaire = EXCLUDED.commentaire,
               saisi_par = EXCLUDED.saisi_par, updated_at = now()`,
            [ficheId, communeId, code, v.valeur, v.cible ?? null, v.commentaire || null, req.user!.sub]
          );
        }
      }
      // Une fiche soumise que la COMMUNE retouche repasse en brouillon : la
      // FNCT ne valide pas autre chose que ce qu'on lui a soumis. La FNCT,
      // elle, peut corriger pendant l'instruction sans la renvoyer.
      if (req.user!.role !== 'super_admin_fnct') {
        await client.query(`UPDATE evaluations_kpi SET statut = 'brouillon' WHERE id = $1 AND statut = 'soumise'`, [ficheId]);
      }
      return ficheId;
    });
    res.json(await queryOne('SELECT * FROM evaluations_kpi WHERE id = $1', [id]));
  })
);

kpi5AxesRouter.post(
  '/evaluations/:communeId/:annee/soumettre',
  requireAuth,
  requireRole(...ROLES),
  asyncHandler(async (req, res) => {
    const { communeId, annee } = paramsFiche(req);
    await communeVisible(communeId);
    const f = await fiche(communeId, annee);
    if (!f) throw new ApiError(404, 'Aucune fiche pour cette année.');
    if (f.statut !== 'brouillon') throw new ApiError(409, 'Seule une fiche en brouillon se soumet.');
    res.json(
      await queryOne(
        `UPDATE evaluations_kpi SET statut = 'soumise', soumise_par = $2, soumise_le = now(), motif_renvoi = NULL
          WHERE id = $1 RETURNING *`,
        [f.id, req.user!.sub]
      )
    );
  })
);

kpi5AxesRouter.post(
  '/evaluations/:communeId/:annee/valider',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const { communeId, annee } = paramsFiche(req);
    const f = await fiche(communeId, annee);
    if (!f) throw new ApiError(404, 'Aucune fiche pour cette année.');
    if (f.statut !== 'soumise') throw new ApiError(409, 'Seule une fiche soumise se valide.');
    res.json(
      await queryOne(
        `UPDATE evaluations_kpi SET statut = 'validee', validee_par = $2, validee_le = now() WHERE id = $1 RETURNING *`,
        [f.id, req.user!.sub]
      )
    );
  })
);

const rouvrirSchema = z.object({ motif: z.string().trim().min(5, 'Un renvoi se motive : la commune doit savoir quoi corriger.').max(2000) });

kpi5AxesRouter.post(
  '/evaluations/:communeId/:annee/rouvrir',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const { communeId, annee } = paramsFiche(req);
    const { motif } = rouvrirSchema.parse(req.body);
    const f = await fiche(communeId, annee);
    if (!f) throw new ApiError(404, 'Aucune fiche pour cette année.');
    if (f.statut === 'brouillon') throw new ApiError(409, 'Cette fiche est déjà en brouillon.');
    res.json(
      await queryOne(
        `UPDATE evaluations_kpi SET statut = 'brouillon', motif_renvoi = $2, validee_par = NULL, validee_le = NULL
          WHERE id = $1 RETURNING *`,
        [f.id, motif]
      )
    );
  })
);

// ---------------------------------------------------------------------------
// 4. Une commune : ses 5 axes, sa note, sa préparation DMA (A2.3 pour la FNCT)
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
// 5. Les vues nationales (FNCT) : Concours, 5 axes, DMA — par niveau
// ---------------------------------------------------------------------------

async function toutesLesCommunes(annee: number) {
  const ctx = await charger(annee);
  return { ctx, communes: ctx.communes.map((c) => calculerCommune(ctx, c.id)) };
}

kpi5AxesRouter.get(
  '/concours-national',
  requireAuth,
  requireRole('super_admin_fnct'),
  exportable(JEU_CONCOURS, (req) => String(req.query.annee ?? '')),
  asyncHandler(async (req, res) => {
    const q = qNiveau.parse(req.query);
    const annee = q.annee ?? anneeCourante();
    // Par défaut, le classement OFFICIEL : les seules fiches validées.
    const officiel = q.officiel !== 'false';
    const { communes } = await toutesLesCommunes(annee);
    if (q.niveau === 'commune') {
      // Une commune sans aucun indicateur renseigné n'a rien à faire dans un
      // classement, même en queue : elle n'y figurerait qu'avec un « — ».
      return res.json(classement(communes, officiel));
    }
    res.json(agreger(marquerOfficiel(communes, officiel), q.niveau as Exclude<Niveau, 'commune'>, await districts()));
  })
);

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
            concours: c.concours,
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
            .sort((a, b) => (b.dma.indice ?? 0) - (a.dma.indice ?? 0))
            .map((c) => ({
              commune_id: c.commune_id,
              nom: c.nom,
              gouvernorat: c.gouvernorat,
              dma: c.dma,
              indicateurs: c.indicateurs.filter((i) => i.famille === 'dma').map((i) => ({ code: i.code, statut: i.statut, valeur: i.valeur, cible: i.cible, note: i.note })),
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
        if (r?.statut !== 'renseigne' || r.note == null) continue;
        const v = Math.round(100 * r.note);
        if (v < seuil) alertes.push({ commune_id: c.commune_id, nom: c.nom, gouvernorat: c.gouvernorat, gravite: 'avertissement', code: cle, constat: texte(v) });
      }
    };
    sous('M3-1', p.taux_resolution_min, 'resolution_faible', (v) => `Réclamations : note de traitement de ${v} % (seuil : ${p.taux_resolution_min} %).`);
    sous('M1-9', p.bachage_min, 'bachage_insuffisant', (v) => `Bâchage des bennes : ${v} % (seuil : ${p.bachage_min} %).`);
    sous('M1-7', p.maintenance_min, 'maintenance_en_retard', (v) => `Plans d'entretien à jour : ${v} % (seuil : ${p.maintenance_min} %).`);

    for (const c of communes.filter((x) => x.fiche.statut === 'soumise')) {
      alertes.push({
        commune_id: c.commune_id,
        nom: c.nom,
        gouvernorat: c.gouvernorat,
        gravite: 'information',
        code: 'fiche_a_valider',
        constat: `Fiche d'évaluation ${annee} soumise, en attente de validation.`,
      });
    }

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
