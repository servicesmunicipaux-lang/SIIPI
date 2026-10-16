// Portail national — l'observatoire de la FNCT.
//
// Ces points d'entrée servent un usage précis : suivre le déploiement de la
// plateforme sur les 350 communes, et situer chaque gouvernorat. Ils renvoient
// des agrégats déjà calculés par la base, pour que l'interface n'ait pas à
// recomposer 24 gouvernorats à partir de 350 fiches à chaque affichage.

import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { exportable } from '../services/export.js';
import { JEU_ACTIVITE, JEU_COMMUNES, JEU_GOUVERNORATS } from '../services/jeuxExport.js';

export const observatoireRouter = Router();

// GET /observatoire/gouvernorats — une ligne par gouvernorat, tout l'écran national.
observatoireRouter.get(
  '/gouvernorats',
  requireAuth,
  exportable(JEU_GOUVERNORATS),
  asyncHandler(async (_req, res) => {
    const lignes = await query('SELECT * FROM app.tableau_gouvernorats()');
    res.json(lignes);
  })
);

// GET /observatoire/deploiement — statut de chaque commune (actif / incomplet /
// désactivé), déduit de l'activité réelle et non d'une saisie manuelle.
observatoireRouter.get(
  '/deploiement',
  requireAuth,
  exportable(JEU_COMMUNES),
  asyncHandler(async (_req, res) => {
    const lignes = await query(`
      SELECT s.commune_id, c.name, c.name_ar, c.gouvernorat, c.population,
             c.is_pilot, c.donnees_source, c.pcgd_status,
             s.statut, s.derniere_activite, s.ecritures_30j, s.a_des_pesees
        FROM app.statut_communes() s
        JOIN communes c ON c.id = s.commune_id
       ORDER BY c.gouvernorat, c.name
    `);
    res.json(lignes);
  })
);

// GET /observatoire/activite — le déploiement mois par mois (refonte, lot 4a).
//
// Pour chaque mois : les communes qui saisissent, celles qui ont commencé mais
// n'ont rien saisi ce mois-là (inactives), celles qui n'ont pas encore commencé,
// et les désactivées — pour tout le pays, par gouvernorat ou par district.
// Une « saisie » est le fait de la commune elle-même (app._saisies_communales,
// migration 072) : ni la FNCT, ni les citoyens. La commune de démonstration
// n'y est pas.
export const qActiviteSchema = z.object({
  debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.'),
  fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.'),
  niveau: z.enum(['national', 'gouvernorat', 'district']).default('national'),
});

export interface LigneActivite {
  mois: string;
  cle: string;
  nom: string | null;
  communes: number;
  saisissent: number;
  inactives: number;
  pas_demarrees: number;
  desactivees: number;
}

observatoireRouter.get(
  '/activite',
  requireAuth,
  requireRole('super_admin_fnct'),
  exportable(JEU_ACTIVITE),
  asyncHandler(async (req, res) => {
    const q = qActiviteSchema.parse(req.query);
    if (q.debut > q.fin) throw new ApiError(400, 'Le début doit précéder la fin.');
    let lignes: { mois: string; commune_id: string; gouvernorat: string; district: string | null; activee: boolean; premiere_saisie: string | null; saisies: string }[];
    try {
      lignes = await query(
        'SELECT mois, commune_id, gouvernorat, district, activee, premiere_saisie, saisies FROM app.activite_communes($1::date, $2::date)',
        [q.debut, q.fin]
      );
    } catch (err) {
      const m = (err as { message?: string }).message ?? '';
      const code = m.split(':')[0];
      if (code === 'ACTIVITE_BORNES' || code === 'ACTIVITE_ETENDUE') throw new ApiError(400, m.slice(code.length + 2));
      throw err;
    }
    const noms = new Map(
      (await query<{ code: string; nom: string }>('SELECT code, nom FROM districts_fnct')).map((d) => [d.code, d.nom])
    );
    const groupes = new Map<string, LigneActivite>();
    for (const l of lignes) {
      const cle = q.niveau === 'national' ? 'national' : q.niveau === 'gouvernorat' ? l.gouvernorat : (l.district ?? 'non_rattache');
      const id = `${l.mois}|${cle}`;
      let g = groupes.get(id);
      if (!g) {
        g = {
          mois: l.mois,
          cle,
          nom: q.niveau === 'national' ? null : q.niveau === 'gouvernorat' ? cle : (noms.get(cle) ?? null),
          communes: 0,
          saisissent: 0,
          inactives: 0,
          pas_demarrees: 0,
          desactivees: 0,
        };
        groupes.set(id, g);
      }
      g.communes++;
      // Le dernier jour du mois : une commune a « commencé » ce mois-là si sa
      // première saisie est antérieure ou égale à cette date.
      const [a, m] = l.mois.split('-').map(Number);
      const finDuMois = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
      if (!l.activee) g.desactivees++;
      else if (!l.premiere_saisie || l.premiere_saisie > finDuMois) g.pas_demarrees++;
      else if (Number(l.saisies) > 0) g.saisissent++;
      else g.inactives++;
    }
    res.json(
      [...groupes.values()].sort(
        (x, y) => x.mois.localeCompare(y.mois) || (x.cle === 'non_rattache' ? 1 : y.cle === 'non_rattache' ? -1 : (x.nom ?? x.cle).localeCompare(y.nom ?? y.cle))
      )
    );
  })
);

// GET /observatoire/contours-gouvernorats — la carte nationale (lot 4a).
//
// Dissoudre 350 communes en 24 gouvernorats prend quelques secondes : le
// résultat est gardé en mémoire, et recalculé seulement quand le découpage a
// changé (une commune modifiée ou retirée change la signature).
let contoursEnCache: { signature: string; geojson: unknown } | null = null;

observatoireRouter.get(
  '/contours-gouvernorats',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const [sig] = await query<{ signature: string }>(
      `SELECT count(*) || '|' || COALESCE(max(updated_at)::text, '') || '|' || count(*) FILTER (WHERE deleted_at IS NOT NULL) AS signature
         FROM communes WHERE boundary_geom IS NOT NULL AND NOT est_demo`
    );
    if (!contoursEnCache || contoursEnCache.signature !== sig.signature) {
      const lignes = await query<{ gouvernorat: string; communes: string; geojson: string }>(
        'SELECT gouvernorat, communes, geojson FROM app.contours_gouvernorats(0.005)'
      );
      contoursEnCache = {
        signature: sig.signature,
        geojson: {
          type: 'FeatureCollection',
          features: lignes.map((l) => ({
            type: 'Feature',
            properties: { gouvernorat: l.gouvernorat, communes: Number(l.communes) },
            geometry: JSON.parse(l.geojson),
          })),
        },
      };
    }
    res.json(contoursEnCache.geojson);
  })
);

// GET /observatoire/carte-communes — la carte des communes (lot S0 : carte du
// conseiller SIG, 16 octobre 2026).
//
// Les 350 communes réelles, leur contour simplifié et leur fiche : nom en
// français et en arabe, gouvernorat, district, type, population (avec sa
// provenance : une estimation ne se lit pas comme un recensement), superficie,
// secteurs, code. La superficie est celle du contour officiel, calculée sur
// l'ellipsoïde : la carte du conseiller donnait l'aire en projection Web
// Mercator, gonflée de 39 % au sud à 58 % au nord, et des densités d'autant
// trop basses. Gardée en mémoire tant que le découpage et ses districts ne
// changent pas.
let carteEnCache: { signature: string; geojson: unknown } | null = null;

observatoireRouter.get(
  '/carte-communes',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const [sig] = await query<{ signature: string }>(
      `SELECT (SELECT count(*) || '|' || COALESCE(max(updated_at)::text, '') || '|' || count(*) FILTER (WHERE deleted_at IS NOT NULL)
                 FROM communes WHERE boundary_geom IS NOT NULL AND NOT est_demo)
              || '|' || (SELECT count(*) || '|' || COALESCE(max(updated_at)::text, '') FROM gouvernorats_district) AS signature`
    );
    if (!carteEnCache || carteEnCache.signature !== sig.signature) {
      const lignes = await query<{
        id: string; nom: string; nom_ar: string | null; gouvernorat: string; district: string | null; type: string | null;
        population: number | null; provenance: string | null; superficie_km2: string | null; secteurs: number | null;
        code: number | null; geojson: string;
      }>(
        `SELECT c.id, c.name AS nom, c.name_ar AS nom_ar, c.gouvernorat, gd.district_code AS district, c.type_commune AS type,
                -- La colonne vaut 0 par défaut (schéma d'origine) : 0 habitant est une
                -- population jamais saisie, pas une commune vide (règle d'or 1.1).
                NULLIF(c.population, 0) AS population,
                CASE WHEN NULLIF(c.population, 0) IS NULL THEN NULL ELSE c.donnees_source END AS provenance,
                round((ST_Area(c.boundary_geom::geography) / 1e6)::numeric, 2) AS superficie_km2,
                c.nb_secteurs AS secteurs, c.code_municipalite AS code,
                ST_AsGeoJSON(ST_SimplifyPreserveTopology(c.boundary_geom, 0.001), 5) AS geojson
           FROM communes c
           LEFT JOIN gouvernorats_district gd ON gd.gouvernorat = c.gouvernorat
          WHERE c.boundary_geom IS NOT NULL AND NOT c.est_demo AND c.deleted_at IS NULL
          ORDER BY c.gouvernorat, c.name`
      );
      carteEnCache = {
        signature: sig.signature,
        geojson: {
          type: 'FeatureCollection',
          features: lignes.map(({ geojson, superficie_km2, ...p }) => ({
            type: 'Feature',
            properties: { ...p, superficie_km2: superficie_km2 == null ? null : Number(superficie_km2) },
            geometry: JSON.parse(geojson),
          })),
        },
      };
    }
    res.json(carteEnCache.geojson);
  })
);

// PATCH /observatoire/communes/:id/provenance — qualifier la provenance des
// données d'une commune. Réservé à la FNCT : c'est elle qui atteste qu'une
// valeur cesse d'être une estimation.
const provenanceSchema = z.object({
  donneesSource: z.enum(['estime', 'declare', 'mesure']),
});

observatoireRouter.patch(
  '/communes/:id/provenance',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const { donneesSource } = provenanceSchema.parse(req.body);
    const [commune] = await query(
      `UPDATE communes
          SET donnees_source = $2,
              donnees_qualifiees_le = now(),
              donnees_qualifiees_par = $3
        WHERE id = $1
      RETURNING id, name, donnees_source, donnees_qualifiees_le`,
      [req.params.id, donneesSource, req.user!.sub]
    );
    // Aucune ligne modifiée : commune inexistante, ou hors du périmètre de
    // l'appelant. Sans ce contrôle, la requête répondrait 200 avec un corps
    // vide et laisserait croire que la qualification a eu lieu.
    if (!commune) throw new ApiError(404, 'Commune introuvable.');
    res.json(commune);
  })
);

// GET|PUT /observatoire/hebergement-identites — l'hébergement des identités
// nominatives est-il accrédité ? (lot 16.1, SPEC_v0.16 R3). Tant qu'il ne
// l'est pas, la base refuse toute identité de pré-collecteur, dans toutes les
// communes. Seule la FNCT le déclare, en citant la pièce qui le fonde : la
// base refuse « accrédité » sans référence.
const hebergementSchema = z
  .object({
    accredite: z.boolean(),
    reference: z.string().trim().min(1).max(300).nullable().optional(),
  })
  .strict()
  .refine((d) => !d.accredite || Boolean(d.reference), {
    message: 'Citez la pièce qui fonde l’accréditation (arrêté, convention d’hébergement…).',
    path: ['reference'],
  });

const lireHebergement = async () => {
  const [ligne] = await query<{ valeur: string; reference: string | null; updated_at: string }>(
    "SELECT valeur, reference, updated_at FROM parametres_nationaux WHERE cle = 'hebergement_pii_accredite'"
  );
  return { accredite: ligne?.valeur === 'true', reference: ligne?.reference ?? null, depuis: ligne?.updated_at ?? null };
};

observatoireRouter.get(
  '/hebergement-identites',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await lireHebergement());
  })
);

observatoireRouter.put(
  '/hebergement-identites',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = hebergementSchema.parse(req.body);
    await query(
      `UPDATE parametres_nationaux
          SET valeur = $1, reference = $2, updated_at = now(), updated_by = app.current_user_id()
        WHERE cle = 'hebergement_pii_accredite'`,
      [d.accredite ? 'true' : 'false', d.accredite ? d.reference : (d.reference ?? null)]
    );
    res.json(await lireHebergement());
  })
);

// GET|PUT /observatoire/cadre-secteur-informel — le décret sur le tri à la
// source (art. 13) est-il en vigueur ? (lot 18.1). Tant qu'il ne l'est pas, la
// base refuse toute écriture au registre des acteurs informels, dans toutes
// les communes. Même forme que l'hébergement : la FNCT seule l'active, en
// citant le texte publié — la base refuse « actif » sans référence.
const cadreInformelSchema = z
  .object({
    actif: z.boolean(),
    reference: z.string().trim().min(1).max(300).nullable().optional(),
  })
  .strict()
  .refine((d) => !d.actif || Boolean(d.reference), {
    message: 'Citez le texte publié qui met le cadre en vigueur (décret, numéro du JORT).',
    path: ['reference'],
  });

const lireCadreInformel = async () => {
  const [ligne] = await query<{ valeur: string; reference: string | null; updated_at: string }>(
    "SELECT valeur, reference, updated_at FROM parametres_nationaux WHERE cle = 'cadre_secteur_informel_actif'"
  );
  return { actif: ligne?.valeur === 'true', reference: ligne?.reference ?? null, depuis: ligne?.updated_at ?? null };
};

observatoireRouter.get(
  '/cadre-secteur-informel',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await lireCadreInformel());
  })
);

observatoireRouter.put(
  '/cadre-secteur-informel',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = cadreInformelSchema.parse(req.body);
    await query(
      `UPDATE parametres_nationaux
          SET valeur = $1, reference = $2, updated_at = now(), updated_by = app.current_user_id()
        WHERE cle = 'cadre_secteur_informel_actif'`,
      [d.actif ? 'true' : 'false', d.actif ? d.reference : (d.reference ?? null)]
    );
    res.json(await lireCadreInformel());
  })
);

// GET /observatoire/corrections-referentiel — les corrections apportées au
// référentiel des communes par décision de la FNCT (D-FNCT-3 : Zarzouna
// rattachée à Bizerte, El Hchachna commune à part entière), avec leur source.
// Lues par une fonction : la commune rattachée est retirée, et la politique de
// `communes` ne la montre plus — son nom doit pourtant rester lisible ici.
observatoireRouter.get(
  '/corrections-referentiel',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await query('SELECT * FROM app.corrections_referentiel()'));
  })
);

export { provenanceSchema, hebergementSchema, cadreInformelSchema };
