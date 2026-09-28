// Rapports et études (TDR §3.2.9).
//
// LA FICHE, PAS LE FICHIER. Le dépôt des octets reste POST /fichiers, comme
// pour tout le reste de la plateforme (migration 041) : cette route ne fait
// que rattacher un titre, une catégorie et un auteur déclaré à un fichier déjà
// déposé — l'écran dépose d'abord (usage « rapport_etude »), puis appelle
// celle-ci avec l'URL rendue.
//
// VERSIONS (C3.6, migration 045). Une nouvelle version est une nouvelle
// ligne rattachée à la première par `document_id` : la précédente n'est
// jamais écrasée. La liste ne montre que la dernière version de chaque
// document ; l'historique complet se lit par document.

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';

export const rapportsEtudesRouter = Router();

const CATEGORIES = ['etude_technique', 'rapport_activite', 'audit', 'plan_action', 'autre'] as const;

const COLONNES = `
  r.id, r.document_id, r.version, r.commune_id, r.titre, r.categorie, r.auteur,
  r.date_document, r.fichier_url, r.nom_fichier, r.type_mime, r.taille_octets,
  r.depose_par, r.created_at
`;

interface LigneRapport {
  id: string;
  document_id: string;
  version: number;
  commune_id: string;
  titre: string;
  categorie: string;
  auteur: string | null;
  date_document: string | null;
}

rapportsEtudesRouter.get(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const q = z.object({ categorie: z.enum(CATEGORIES).optional() }).parse(req.query);

    // La dernière version de chaque document, avec le nombre de versions :
    // le filtre de catégorie porte sur la version courante, celle qu'on lit.
    res.json(
      await query(
        `SELECT * FROM (
           SELECT DISTINCT ON (r.document_id) ${COLONNES},
                  (count(*) OVER (PARTITION BY r.document_id))::int AS nb_versions
             FROM rapports_etudes r
            WHERE r.deleted_at IS NULL AND r.commune_id = $1
            ORDER BY r.document_id, r.version DESC
         ) d
          WHERE ($2::text IS NULL OR d.categorie = $2)
          ORDER BY d.created_at DESC`,
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

// Une nouvelle version reprend par défaut les métadonnées de la précédente :
// seul le fichier est obligatoire.
const versionSchema = depotSchema.partial({ titre: true });

async function inserer(
  communeId: string,
  documentId: string | null,
  version: number,
  d: z.infer<typeof versionSchema> & { titre: string },
  deposePar: string
) {
  const cree = await queryOne<{ id: string }>(
    `INSERT INTO rapports_etudes
       (commune_id, document_id, version, titre, categorie, auteur, date_document,
        fichier_url, nom_fichier, type_mime, taille_octets, depose_par)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      communeId,
      documentId,
      version,
      d.titre,
      d.categorie ?? 'autre',
      d.auteur ?? null,
      d.dateDocument ?? null,
      d.fichierUrl,
      d.nomFichier,
      d.typeMime ?? null,
      d.tailleOctets ?? null,
      deposePar,
    ]
  );
  return queryOne(`SELECT ${COLONNES} FROM rapports_etudes r WHERE r.id = $1`, [cree!.id]);
}

rapportsEtudesRouter.post(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const d = depotSchema.parse(req.body);
    res.status(201).json(await inserer(communeId, null, 1, d, req.user!.sub));
  })
);

/** La dernière version encore en ligne du document auquel appartient `id`. */
async function derniereVersion(id: string): Promise<LigneRapport> {
  const ligne = await queryOne<LigneRapport>(
    `SELECT ${COLONNES} FROM rapports_etudes r
      WHERE r.deleted_at IS NULL
        AND r.document_id = (SELECT document_id FROM rapports_etudes WHERE id = $1)
      ORDER BY r.version DESC
      LIMIT 1`,
    [id]
  );
  if (!ligne) throw new ApiError(404, 'Rapport introuvable.');
  return ligne;
}

rapportsEtudesRouter.get(
  '/:id/versions',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const courante = await derniereVersion(req.params.id);
    res.json(
      await query(
        `SELECT ${COLONNES} FROM rapports_etudes r
          WHERE r.deleted_at IS NULL AND r.document_id = $1
          ORDER BY r.version DESC`,
        [courante.document_id]
      )
    );
  })
);

rapportsEtudesRouter.post(
  '/:id/versions',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = versionSchema.parse(req.body);
    const courante = await derniereVersion(req.params.id);
    // Le numéro suivant se calcule sur TOUTES les versions, retirées
    // comprises : un numéro déjà attribué ne se réattribue jamais.
    const suivant = await queryOne<{ n: number }>(
      'SELECT app.prochaine_version_rapport($1) AS n',
      [courante.document_id]
    );
    const cree = await inserer(
      courante.commune_id,
      courante.document_id,
      suivant!.n,
      {
        ...d,
        titre: d.titre ?? courante.titre,
        categorie: d.categorie ?? (courante.categorie as (typeof CATEGORIES)[number]),
        auteur: d.auteur ?? courante.auteur ?? undefined,
        dateDocument: d.dateDocument ?? courante.date_document ?? undefined,
      },
      req.user!.sub
    );
    res.status(201).json(cree);
  })
);

// Retirer un document, c'est retirer toutes ses versions : laisser la
// version 1 en ligne après avoir « supprimé » la 2 ferait réapparaître un
// document qu'on croyait retiré.
rapportsEtudesRouter.delete(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const courante = await derniereVersion(req.params.id);
    const versions = await query<{ id: string }>(
      'SELECT id FROM rapports_etudes WHERE deleted_at IS NULL AND document_id = $1',
      [courante.document_id]
    );
    for (const v of versions) {
      await query('SELECT app.supprimer($1, $2)', ['rapports_etudes', v.id]);
    }
    res.status(204).end();
  })
);

export { depotSchema as rapportEtudeDepotSchema, versionSchema as rapportEtudeVersionSchema };
