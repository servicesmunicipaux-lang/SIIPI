// Espace du prestataire privé : déclaration de passage et signalement
// d'incidents.
//
// Le prestataire tient son propre registre — la commune tient le sien
// (controles_terrain). Les deux restent indépendants : si l'une des parties
// pouvait réécrire le registre de l'autre, leur confrontation ne prouverait
// plus rien.

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';

export const passagesRouter = Router();

// ---------------------------------------------------------------------------
// Déclaration de passage
// ---------------------------------------------------------------------------

const passageSchema = z.object({
  circuitId: z.string().uuid(),
  datePassage: z.string().optional(),
  statut: z.enum(['effectue', 'partiel', 'impossible']),
  heureDebut: z.string().optional(),
  heureFin: z.string().optional(),
  // Conditions de la déclaration : ce sont elles qui en fixent la valeur
  // probante. Le client déclare ce qu'il sait ; le serveur ne l'invente pas.
  modeSaisie: z.enum(['terrain', 'bureau']).default('terrain'),
  lat: z.number().optional(),
  lng: z.number().optional(),
  positionSource: z.enum(['appareil', 'saisie', 'absente']).default('absente'),
  agentNom: z.string().optional(),
  photoUrl: z.string().optional(),
  remarque: z.string().optional(),
});

passagesRouter.post(
  '/',
  requireAuth,
  requireRole('gestionnaire_prestataire', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = passageSchema.parse(req.body);

    const circuit = await queryOne<{ commune_id: string }>(
      'SELECT commune_id FROM circuits WHERE id = $1 AND deleted_at IS NULL',
      [d.circuitId]
    );
    if (!circuit) throw new ApiError(404, 'Circuit introuvable.');

    // Une position annoncée comme relevée par l'appareil mais absente serait
    // un mensonge silencieux dans une pièce qui sert de preuve.
    const positionSource =
      d.lat === undefined || d.lng === undefined ? 'absente' : d.positionSource;

    const declaration = await queryOne(
      `INSERT INTO declarations_passage
         (circuit_id, commune_id, date_passage, statut, heure_debut, heure_fin,
          mode_saisie, position, position_source, declare_par, agent_nom, photo_url, remarque)
       VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5::timestamptz, $6::timestamptz,
               $7,
               CASE WHEN $8::double precision IS NULL OR $9::double precision IS NULL
                    THEN NULL
                    ELSE ST_SetSRID(ST_MakePoint($9, $8), 4326) END,
               $10, $11, $12, $13, $14)
       ON CONFLICT (circuit_id, date_passage) DO UPDATE
         SET statut = EXCLUDED.statut,
             heure_debut = EXCLUDED.heure_debut,
             heure_fin = EXCLUDED.heure_fin,
             mode_saisie = EXCLUDED.mode_saisie,
             position = EXCLUDED.position,
             position_source = EXCLUDED.position_source,
             agent_nom = EXCLUDED.agent_nom,
             photo_url = EXCLUDED.photo_url,
             remarque = EXCLUDED.remarque,
             updated_at = now()
       RETURNING id, circuit_id, commune_id, date_passage, statut, heure_debut, heure_fin,
                 mode_saisie, position_source, agent_nom, photo_url, remarque, created_at`,
      [
        d.circuitId,
        circuit.commune_id,
        d.datePassage ?? null,
        d.statut,
        d.heureDebut ?? null,
        d.heureFin ?? null,
        d.modeSaisie,
        d.lat ?? null,
        d.lng ?? null,
        positionSource,
        req.user!.sub,
        d.agentNom ?? null,
        d.photoUrl ?? null,
        d.remarque ?? null,
      ]
    );
    res.status(201).json(declaration);
  })
);

passagesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    const depuis = typeof req.query.depuis === 'string' ? req.query.depuis : null;

    const lignes = await query(
      `SELECT d.id, d.circuit_id, c.nom AS circuit_nom, d.commune_id, d.date_passage,
              d.statut, d.heure_debut, d.heure_fin, d.mode_saisie, d.position_source,
              ST_Y(d.position) AS lat, ST_X(d.position) AS lng,
              d.agent_nom, d.photo_url, d.remarque, d.declare_par, d.created_at
         FROM declarations_passage d
         JOIN circuits c ON c.id = d.circuit_id
        WHERE d.deleted_at IS NULL
          AND ($1::text IS NULL OR d.commune_id = $1)
          AND ($2::date IS NULL OR d.date_passage >= $2::date)
        ORDER BY d.date_passage DESC, c.nom`,
      [communeId, depuis]
    );
    res.json(lignes);
  })
);

// ---------------------------------------------------------------------------
// Incidents de terrain
// ---------------------------------------------------------------------------

const incidentSchema = z.object({
  communeId: z.string(),
  circuitId: z.string().uuid().nullable().optional(),
  dateIncident: z.string().optional(),
  type: z.enum([
    'acces_bloque',
    'point_sature',
    'panne_vehicule',
    'dechets_non_conformes',
    'decharge_fermee',
    'autre',
  ]),
  description: z.string().optional(),
  photoUrl: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

passagesRouter.post(
  '/incidents',
  requireAuth,
  asyncHandler(async (req, res) => {
    const d = incidentSchema.parse(req.body);
    const incident = await queryOne(
      `INSERT INTO incidents
         (commune_id, circuit_id, date_incident, type, description, photo_url, position, declare_par)
       VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6,
               CASE WHEN $7::double precision IS NULL OR $8::double precision IS NULL
                    THEN NULL ELSE ST_SetSRID(ST_MakePoint($8, $7), 4326) END,
               $9)
       RETURNING id, commune_id, circuit_id, date_incident, type, description,
                 photo_url, statut, declare_par, created_at`,
      [
        d.communeId,
        d.circuitId ?? null,
        d.dateIncident ?? null,
        d.type,
        d.description ?? null,
        d.photoUrl ?? null,
        d.lat ?? null,
        d.lng ?? null,
        req.user!.sub,
      ]
    );
    res.status(201).json(incident);
  })
);

passagesRouter.get(
  '/incidents',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    const statut = typeof req.query.statut === 'string' ? req.query.statut : null;

    const lignes = await query(
      `SELECT i.id, i.commune_id, i.circuit_id, c.nom AS circuit_nom, i.date_incident,
              i.type, i.description, i.photo_url, i.statut, i.reponse_commune,
              ST_Y(i.position) AS lat, ST_X(i.position) AS lng,
              i.declare_par, u.full_name AS declare_par_nom, i.created_at
         FROM incidents i
         LEFT JOIN circuits c ON c.id = i.circuit_id
         LEFT JOIN users u    ON u.id = i.declare_par
        WHERE i.deleted_at IS NULL
          AND ($1::text IS NULL OR i.commune_id = $1)
          AND ($2::text IS NULL OR i.statut = $2)
        ORDER BY i.date_incident DESC, i.created_at DESC`,
      [communeId, statut]
    );
    res.json(lignes);
  })
);

// La commune répond à un incident. Réservé à la commune : c'est sa prise en
// charge, pas celle du prestataire qui l'a signalé.
const reponseIncidentSchema = z.object({
  statut: z.enum(['pris_en_compte', 'clos']),
  reponseCommune: z.string().optional(),
});

passagesRouter.patch(
  '/incidents/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = reponseIncidentSchema.parse(req.body);
    const incident = await queryOne(
      `UPDATE incidents
          SET statut = $2, reponse_commune = COALESCE($3, reponse_commune),
              traite_par = $4, traite_le = now(), updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, statut, reponse_commune, traite_par, traite_le`,
      [req.params.id, d.statut, d.reponseCommune ?? null, req.user!.sub]
    );
    if (!incident) throw new ApiError(404, 'Incident introuvable.');
    res.json(incident);
  })
);

// ---------------------------------------------------------------------------
// Confrontation des deux registres
// ---------------------------------------------------------------------------

passagesRouter.get(
  '/confrontation',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    const depuis = typeof req.query.depuis === 'string' ? req.query.depuis : null;
    const jusqua = typeof req.query.jusqua === 'string' ? req.query.jusqua : null;

    const lignes = await query(
      `SELECT * FROM app.confrontation_passages(
          $1::text,
          COALESCE($2::date, CURRENT_DATE - 30),
          COALESCE($3::date, CURRENT_DATE))`,
      [communeId, depuis, jusqua]
    );
    res.json(lignes);
  })
);

// Contrats du prestataire connecté : « visibilité sur son propre contrat ».
passagesRouter.get(
  '/mes-contrats',
  requireAuth,
  asyncHandler(async (req, res) => {
    const lignes = await query(
      `SELECT uc.commune_id, c.name AS commune_nom, c.name_ar AS commune_nom_ar,
              uc.contrat_reference, uc.date_debut, uc.date_fin, uc.actif
         FROM utilisateur_communes uc
         JOIN communes c ON c.id = uc.commune_id
        WHERE uc.user_id = $1
        ORDER BY c.name`,
      [req.user!.sub]
    );
    res.json(lignes);
  })
);

export { passageSchema, incidentSchema, reponseIncidentSchema };
