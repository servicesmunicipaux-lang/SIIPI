// Rapports et études (TDR §3.2.9).
//
// LA FICHE, PAS LE FICHIER. Le dépôt des octets reste POST /fichiers, comme
// pour tout le reste de la plateforme (migration 041) : cette route ne fait
// que rattacher un titre, une catégorie et un auteur déclaré à un fichier déjà
// déposé — l'écran dépose d'abord (usage « rapport_etude »), puis appelle
// celle-ci avec l'URL rendue.

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';

export const rapportsEtudesRouter = Router();

const CATEGORIES = ['etude_technique', 'rapport_activite', 'audit', 'plan_action', 'autre'] as const;

const RAPPORT_SELECT = `
  SELECT r.id, r.commune_id, r.titre, r.categorie, r.auteur, r.date_document,
         r.fichier_url, r.nom_fichier, r.type_mime, r.taille_octets,
         r.depose_par, r.created_at
    FROM rapports_etudes r
`;

rapportsEtudesRouter.get(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const q = z.object({ categorie: z.enum(CATEGORIES).optional() }).parse(req.query);

    res.json(
      await query(
        `${RAPPORT_SELECT}
          WHERE r.deleted_at IS NULL AND r.commune_id = $1
            AND ($2::text IS NULL OR r.categorie = $2)
          ORDER BY r.created_at DESC`,
        [communeId, q.categorie ?? null]
      )
    );
  })
);

const depotSchema = z.object({
  titre: z.string().trim().min(3).max(200),
  categorie: z.enum(CATEGORIES).optional(),
  auteur: z.string().max(200).optional(),
  dateDocument: z.string().optional(),
  /** Chemin rendu par POST /fichiers, par exemple « /fichiers/<id> ». */
  fichierUrl: z.string().min(1).max(300),
  nomFichier: z.string().min(1).max(255),
  typeMime: z.string().max(150).optional(),
  tailleOctets: z.number().int().positive().optional(),
});

rapportsEtudesRouter.post(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const d = depotSchema.parse(req.body);

    const cree = await queryOne<{ id: string }>(
      `INSERT INTO rapports_etudes
         (commune_id, titre, categorie, auteur, date_document,
          fichier_url, nom_fichier, type_mime, taille_octets, depose_par)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        communeId,
        d.titre,
        d.categorie ?? 'autre',
        d.auteur ?? null,
        d.dateDocument ?? null,
        d.fichierUrl,
        d.nomFichier,
        d.typeMime ?? null,
        d.tailleOctets ?? null,
        req.user!.sub,
      ]
    );
    res.status(201).json(await queryOne(`${RAPPORT_SELECT} WHERE r.id = $1`, [cree!.id]));
  })
);

rapportsEtudesRouter.delete(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const [resultat] = await query<{ supprimer: boolean }>(
      'SELECT app.supprimer($1, $2) AS supprimer',
      ['rapports_etudes', req.params.id]
    );
    if (!resultat?.supprimer) throw new ApiError(404, 'Rapport introuvable.');
    res.status(204).end();
  })
);

export { depotSchema as rapportEtudeDepotSchema };
