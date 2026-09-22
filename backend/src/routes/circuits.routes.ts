// Circuits de collecte et contrôle terrain quotidien.
//
// Le module qui crée de la donnée dans l'espace communal : sans lui, le portail
// municipal n'affiche que ce que la commune a saisi ailleurs, c'est-à-dire rien.
//
// Le contrôle terrain donne au directeur de propreté une trace de performance
// indépendante des réclamations citoyennes — la seule dont il disposait
// jusqu'ici, et dont il se méfie à juste titre.

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';

export const circuitsRouter = Router();

const CIRCUIT_SELECT = `
  SELECT c.id, c.commune_id, co.name AS commune_nom, c.nom, c.code, c.description,
         c.prestataire_id, p.full_name AS prestataire_nom,
         c.zone_id, z.name AS zone_nom, c.vehicule_id,
         c.jours_passage, c.type_dechet, c.actif,
         c.date_debut, c.date_fin,
         c.mode_collecte, c.voyages_par_jour, c.duree_prevue_minutes,
         c.longueur_declaree_km, c.taille_equipe, c.trace_source,
         c.secteur_code, c.secteur_nom, c.poste, c.heure_depart, c.heure_fin,
         c.lieu_dechargement, c.vehicule_code, c.vehicule_immat,
         c.engin_appui_code, c.engin_appui_immat,
         c.etude_date, c.etude_temps_parc_min, c.etude_temps_dechargement_min,
         c.etude_temps_retour_min, c.etude_temps_collecte_min,
         c.etude_distance_parc_km, c.etude_distance_dechargement_km,
         c.etude_distance_retour_km, c.etude_distance_collecte_km,
         c.etude_tonnage_t, c.etude_consommation_l,
         c.trace_importee_le, c.trace_fichier, c.points_importes_le, c.points_fichier,
         -- Nombre d'arrêts et chauffeur en cours : la liste des circuits les
         -- affiche, et les charger en une requête évite un appel par ligne.
         (SELECT count(*) FROM points_collecte pc
           WHERE pc.circuit_id = c.id AND pc.deleted_at IS NULL) AS nb_points,
         (SELECT pe.nom_complet FROM circuit_equipe ce
             JOIN personnel pe ON pe.id = ce.personnel_id
            WHERE ce.circuit_id = c.id AND ce.role = 'chauffeur'
              AND ce.date_fin IS NULL LIMIT 1) AS chauffeur_nom,
         ST_AsGeoJSON(c.trace)::json AS trace,
         c.created_at, c.updated_at
    FROM circuits c
    -- Le nom de la commune voyage avec le circuit : un prestataire qui
    -- travaille pour trois communes lisait sinon « medenine_djerba_midoun »
    -- dans son écran de tournée.
    JOIN communes co           ON co.id = c.commune_id
    LEFT JOIN users p          ON p.id = c.prestataire_id
    LEFT JOIN zones_collecte z ON z.id = c.zone_id
`;

// ---------------------------------------------------------------------------
// Circuits
// ---------------------------------------------------------------------------

circuitsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req) ?? undefined;
    const lignes = communeId
      ? await query(`${CIRCUIT_SELECT} WHERE c.deleted_at IS NULL AND c.commune_id = $1 ORDER BY c.nom`, [communeId])
      : await query(`${CIRCUIT_SELECT} WHERE c.deleted_at IS NULL ORDER BY c.commune_id, c.nom`);
    res.json(lignes);
  })
);

// « HH:MM » ou « HH:MM:SS ».
const HEURE = /^\d{2}:\d{2}(:\d{2})?$/;

/**
 * Correspondance champ d'API → colonne, partagée par la création et la mise à
 * jour.
 *
 * Elle était écrite deux fois : une liste de colonnes dans l'INSERT, une table
 * dans le PATCH. Chaque champ ajouté devait l'être aux deux endroits, et
 * l'oubli ne se voyait pas — le champ partait simplement à la trappe à la
 * création, en silence, pendant que la modification le prenait. Une seule
 * source, donc.
 */
const COLONNES: Record<string, string> = {
  nom: 'nom',
  code: 'code',
  description: 'description',
  prestataireId: 'prestataire_id',
  zoneId: 'zone_id',
  vehiculeId: 'vehicule_id',
  joursPassage: 'jours_passage',
  typeDechet: 'type_dechet',
  dateDebut: 'date_debut',
  dateFin: 'date_fin',
  modeCollecte: 'mode_collecte',
  voyagesParJour: 'voyages_par_jour',
  dureePrevueMinutes: 'duree_prevue_minutes',
  longueurDeclareeKm: 'longueur_declaree_km',
  tailleEquipe: 'taille_equipe',
  secteurCode: 'secteur_code',
  secteurNom: 'secteur_nom',
  poste: 'poste',
  heureDepart: 'heure_depart',
  heureFin: 'heure_fin',
  lieuDechargement: 'lieu_dechargement',
  vehiculeCode: 'vehicule_code',
  vehiculeImmat: 'vehicule_immat',
  enginAppuiCode: 'engin_appui_code',
  enginAppuiImmat: 'engin_appui_immat',
  etudeDate: 'etude_date',
  etudeTempsParcMin: 'etude_temps_parc_min',
  etudeTempsDechargementMin: 'etude_temps_dechargement_min',
  etudeTempsRetourMin: 'etude_temps_retour_min',
  etudeTempsCollecteMin: 'etude_temps_collecte_min',
  etudeDistanceParcKm: 'etude_distance_parc_km',
  etudeDistanceDechargementKm: 'etude_distance_dechargement_km',
  etudeDistanceRetourKm: 'etude_distance_retour_km',
  etudeDistanceCollecteKm: 'etude_distance_collecte_km',
  etudeTonnageT: 'etude_tonnage_t',
  etudeConsommationL: 'etude_consommation_l',
  actif: 'actif',
};

/** Transtypage explicite là où PostgreSQL ne devine pas depuis un paramètre. */
function typer(cle: string, position: number): string {
  if (cle === 'joursPassage') return `$${position}::smallint[]`;
  if (cle === 'dateDebut' || cle === 'dateFin' || cle === 'etudeDate') return `$${position}::date`;
  if (cle === 'heureDepart' || cle === 'heureFin') return `$${position}::time`;
  return `$${position}`;
}

const circuitCreateSchema = z.object({
  communeId: z.string(),
  nom: z.string().min(2),
  code: z.string().optional(),
  description: z.string().optional(),
  prestataireId: z.string().uuid().nullable().optional(),
  zoneId: z.string().uuid().nullable().optional(),
  vehiculeId: z.string().nullable().optional(),
  // 1 = lundi … 7 = dimanche.
  joursPassage: z.array(z.number().int().min(1).max(7)).default([]),
  typeDechet: z.string().optional(),
  // Période de service. Par défaut le circuit est dû à partir d'aujourd'hui :
  // sans cette borne, un circuit saisi ce matin arriverait avec un mois de
  // passages « non déclarés » qui n'ont jamais été dus (migration 026).
  // La commune la recule quand elle enregistre après coup une tournée qui
  // roule depuis des mois, et pose dateFin en fin de contrat.
  dateDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  // Mode de collecte : il décide de la nature des arrêts. En porte-à-porte,
  // les points sont des repères de tournée ; en conteneurs, ils désignent des
  // points fixes qui ont une identité et un état.
  modeCollecte: z.enum(['porte_a_porte', 'conteneurs', 'mixte']).default('porte_a_porte'),
  // Rotations par jour. Six des huit circuits de Dar Chaabane en font deux :
  // n'en compter qu'une afficherait le prestataire à la moitié du service
  // rendu alors qu'il fait sa tournée entière.
  voyagesParJour: z.number().int().min(1).max(6).default(1),
  dureePrevueMinutes: z.number().int().positive().max(1440).optional(),
  // Longueur DÉCLARÉE au registre communal, jamais une mesure.
  longueurDeclareeKm: z.number().positive().max(999).optional(),
  tailleEquipe: z.number().int().min(1).max(20).optional(),

  // --- Fiche d'identité, d'après le relevé d'affectation du matériel -------
  //
  // Facultatifs ET annulables. « .optional() » seul aurait suffi à ne pas les
  // exiger, mais aurait refusé « null » : un champ vidé à l'écran serait
  // revenu inchangé, et l'utilisateur aurait cru avoir effacé une valeur
  // toujours en base. Un formulaire qui ment sur ce qu'il a enregistré est
  // pire qu'un formulaire qui refuse.
  secteurCode: z.string().max(20).nullable().optional(),
  secteurNom: z.string().max(120).nullable().optional(),
  poste: z.enum(['jour', 'nuit', 'mixte']).nullable().optional(),
  heureDepart: z.string().regex(HEURE).nullable().optional(),
  heureFin: z.string().regex(HEURE).nullable().optional(),
  lieuDechargement: z.string().max(160).nullable().optional(),
  vehiculeCode: z.string().max(40).nullable().optional(),
  vehiculeImmat: z.string().max(40).nullable().optional(),
  enginAppuiCode: z.string().max(40).nullable().optional(),
  enginAppuiImmat: z.string().max(40).nullable().optional(),

  // --- Campagne d'observation : des MESURES, datées -----------------------
  etudeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  etudeTempsParcMin: z.number().int().min(0).max(1440).nullable().optional(),
  etudeTempsDechargementMin: z.number().int().min(0).max(1440).nullable().optional(),
  etudeTempsRetourMin: z.number().int().min(0).max(1440).nullable().optional(),
  etudeTempsCollecteMin: z.number().int().min(0).max(1440).nullable().optional(),
  etudeDistanceParcKm: z.number().min(0).max(9999).nullable().optional(),
  etudeDistanceDechargementKm: z.number().min(0).max(9999).nullable().optional(),
  etudeDistanceRetourKm: z.number().min(0).max(9999).nullable().optional(),
  etudeDistanceCollecteKm: z.number().min(0).max(9999).nullable().optional(),
  etudeTonnageT: z.number().min(0).max(9999).nullable().optional(),
  etudeConsommationL: z.number().min(0).max(9999).nullable().optional(),
});

circuitsRouter.post(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = circuitCreateSchema.parse(req.body) as Record<string, unknown>;

    const colonnes = ['commune_id'];
    const valeurs: unknown[] = [d.communeId];
    const emplacements = ['$1'];

    for (const [cle, colonne] of Object.entries(COLONNES)) {
      if (!(cle in d) || d[cle] === undefined) continue;
      valeurs.push(d[cle]);
      colonnes.push(colonne);
      emplacements.push(typer(cle, valeurs.length));
    }
    // À défaut de date de début, le circuit est dû à partir d'aujourd'hui :
    // jamais avant (migration 026).
    if (!colonnes.includes('date_debut')) {
      colonnes.push('date_debut');
      emplacements.push('CURRENT_DATE');
    }

    const cree = await queryOne<{ id: string }>(
      `INSERT INTO circuits (${colonnes.join(', ')})
       VALUES (${emplacements.join(', ')})
       RETURNING id`,
      valeurs
    );
    const circuit = await queryOne(`${CIRCUIT_SELECT} WHERE c.id = $1`, [cree!.id]);
    res.status(201).json(circuit);
  })
);

const circuitUpdateSchema = circuitCreateSchema.partial().omit({ communeId: true }).extend({
  actif: z.boolean().optional(),
});

circuitsRouter.patch(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = circuitUpdateSchema.parse(req.body) as Record<string, unknown>;
    const clauses: string[] = [];
    const valeurs: unknown[] = [];
    // Même table de correspondance qu'à la création : un champ ajouté à
    // COLONNES est pris par les deux, et l'on ne peut plus en oublier un.
    for (const [cle, colonne] of Object.entries(COLONNES)) {
      if (!(cle in d)) continue;
      valeurs.push(d[cle]);
      clauses.push(`${colonne} = ${typer(cle, valeurs.length)}`);
    }
    if (clauses.length === 0) throw new ApiError(400, 'Aucun champ à mettre à jour.');
    clauses.push('updated_at = now()');
    valeurs.push(req.params.id);

    const modifie = await queryOne<{ id: string }>(
      `UPDATE circuits SET ${clauses.join(', ')} WHERE id = $${valeurs.length} RETURNING id`,
      valeurs
    );
    if (!modifie) throw new ApiError(404, 'Circuit introuvable.');
    res.json(await queryOne(`${CIRCUIT_SELECT} WHERE c.id = $1`, [req.params.id]));
  })
);

circuitsRouter.delete(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const [resultat] = await query<{ supprimer: boolean }>('SELECT app.supprimer($1, $2) AS supprimer', [
      'circuits',
      req.params.id,
    ]);
    if (!resultat?.supprimer) throw new ApiError(404, 'Circuit introuvable.');
    res.status(204).send();
  })
);

// ---------------------------------------------------------------------------
// Contrôle terrain
//
// Le prestataire LIT les constats qui le concernent mais ne les écrit pas :
// un constat de performance perdrait toute valeur si la partie évaluée pouvait
// le modifier. Il doit en revanche pouvoir le voir, pour le contester.
// ---------------------------------------------------------------------------

const controleSchema = z.object({
  circuitId: z.string().uuid(),
  dateControle: z.string().optional(),
  etat: z.enum(['fait', 'partiel', 'non_fait']),
  remarque: z.string().optional(),
  photoUrl: z.string().optional(),
});

circuitsRouter.post(
  '/controles',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = controleSchema.parse(req.body);

    const circuit = await queryOne<{ commune_id: string }>(
      'SELECT commune_id FROM circuits WHERE id = $1 AND deleted_at IS NULL',
      [d.circuitId]
    );
    if (!circuit) throw new ApiError(404, 'Circuit introuvable.');

    // Un seul constat par circuit et par jour : deux agents qui contrôlent le
    // même circuit doivent se corriger, pas empiler deux vérités.
    const enregistre = await queryOne(
      `INSERT INTO controles_terrain
         (circuit_id, commune_id, date_controle, etat, remarque, photo_url, controle_par)
       VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6, $7)
       ON CONFLICT (circuit_id, date_controle) DO UPDATE
         SET etat = EXCLUDED.etat,
             remarque = EXCLUDED.remarque,
             photo_url = EXCLUDED.photo_url,
             controle_par = EXCLUDED.controle_par,
             updated_at = now()
       RETURNING *`,
      [
        d.circuitId,
        circuit.commune_id,
        d.dateControle ?? null,
        d.etat,
        d.remarque ?? null,
        d.photoUrl ?? null,
        req.user!.sub,
      ]
    );
    res.status(201).json(enregistre);
  })
);

circuitsRouter.get(
  '/controles',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req) ?? undefined;
    const depuis = typeof req.query.depuis === 'string' ? req.query.depuis : null;

    const lignes = await query(
      `SELECT ct.id, ct.circuit_id, c.nom AS circuit_nom, ct.commune_id,
              ct.date_controle, ct.etat, ct.remarque, ct.photo_url,
              ct.controle_par, u.full_name AS controle_par_nom, ct.created_at
         FROM controles_terrain ct
         JOIN circuits c ON c.id = ct.circuit_id
         LEFT JOIN users u ON u.id = ct.controle_par
        WHERE ct.deleted_at IS NULL
          AND ($1::text IS NULL OR ct.commune_id = $1)
          AND ($2::date IS NULL OR ct.date_controle >= $2::date)
        ORDER BY ct.date_controle DESC, c.nom`,
      [communeId ?? null, depuis]
    );
    res.json(lignes);
  })
);

// ---------------------------------------------------------------------------
// Performance des prestataires
// ---------------------------------------------------------------------------

circuitsRouter.get(
  '/performance',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    const depuis = typeof req.query.depuis === 'string' ? req.query.depuis : null;
    const jusqua = typeof req.query.jusqua === 'string' ? req.query.jusqua : null;

    const lignes = await query(
      `SELECT * FROM app.performance_prestataires(
          $1::text,
          COALESCE($2::date, CURRENT_DATE - 30),
          COALESCE($3::date, CURRENT_DATE))`,
      [communeId, depuis, jusqua]
    );
    res.json(lignes);
  })
);

export { circuitCreateSchema, circuitUpdateSchema, controleSchema };
