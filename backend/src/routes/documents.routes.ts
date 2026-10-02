// Les documents à numérotation scellée (lot 16.2, migration 057).
//
// Quatre pièces opposables du dépôt municipal : ordre de mission, bon de
// sortie carburant, bon de travail maintenance, fiche de déclaration de panne.
// Ce routeur n'écrit rien lui-même : il appelle app.emettre_document() et
// app.annuler_document(), les deux seules portes que la base ouvre — c'est
// elle qui attribue le numéro sous verrou, fige le contenu et refuse tout le
// reste. Il n'y a ni PUT ni DELETE : un document émis ne se modifie pas et ne
// s'efface pas.
//
// La mise en page (PDF bilingue) attend les gabarits validés par un chef de
// dépôt (SPEC_v0.16 § 6) ; le contenu est conservé tel qu'émis pour qu'elle le
// relise le jour venu.
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';

export const documentsRouter = Router();

const TYPES = ['ordre_mission', 'bon_carburant', 'bon_travail', 'declaration_panne'] as const;

const filtresSchema = z.object({
  type: z.enum(TYPES).optional(),
  exercice: z.coerce.number().int().min(2000).max(2100).optional(),
  statut: z.enum(['emis', 'annule']).optional(),
});

documentsRouter.get(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const f = filtresSchema.parse(req.query);
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise (paramètre communeId).');
    const lignes = await query(
      `SELECT * FROM documents_emis
        WHERE commune_id = $1
          AND ($2::text IS NULL OR type_document = $2)
          AND ($3::int IS NULL OR exercice = $3)
          AND ($4::text IS NULL OR statut = $4)
        ORDER BY type_document, exercice DESC, numero DESC`,
      [communeId, f.type ?? null, f.exercice ?? null, f.statut ?? null]
    );
    res.json(lignes);
  })
);

// Littéral avant /:id.
documentsRouter.get(
  '/trous',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise (paramètre communeId).');
    res.json(await query('SELECT * FROM app.trous_documents($1)', [communeId]));
  })
);

documentsRouter.get(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const doc = await queryOne('SELECT * FROM documents_emis WHERE id = $1', [req.params.id]);
    if (!doc) throw new ApiError(404, 'Document introuvable.');
    res.json(doc);
  })
);

export const emissionSchema = z
  .object({
    type: z.enum(TYPES),
    // Les champs du gabarit. Tant que les gabarits ne sont pas validés, le
    // contenu reste libre — mais jamais vide : un numéro sans contenu
    // prouverait l'existence d'une pièce sans dire laquelle.
    contenu: z.record(z.unknown()).refine((c) => Object.keys(c).length > 0, 'Le contenu du document est vide.'),
    objet: z
      .object({
        type: z.enum(['vehicule', 'circuit', 'personnel', 'intervention']),
        id: z.string().min(1),
      })
      .optional(),
  })
  .strict();

// L'objet d'un document (l'engin d'un ordre de mission, d'un bon carburant…)
// doit appartenir à la commune qui l'émet : sinon la pièce mentionnerait un
// bien qu'elle ne gère pas.
const TABLE_DE_L_OBJET: Record<string, string> = {
  vehicule: 'vehicules',
  circuit: 'circuits',
  personnel: 'personnel',
  intervention: 'interventions_maintenance',
};

documentsRouter.post(
  '/',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const d = emissionSchema.parse(req.body);
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise (paramètre communeId).');
    if (d.objet) {
      // Nom de table issu d'une liste fixe ci-dessus, jamais de la requête.
      const objet = await queryOne(
        `SELECT 1 FROM ${TABLE_DE_L_OBJET[d.objet.type]} WHERE id::text = $1 AND commune_id = $2 AND deleted_at IS NULL`,
        [d.objet.id, communeId]
      );
      if (!objet) throw new ApiError(400, 'L’objet du document est introuvable dans cette commune.');
    }
    const doc = await queryOne('SELECT * FROM app.emettre_document($1, $2, $3::jsonb, $4, $5)', [
      communeId,
      d.type,
      JSON.stringify(d.contenu),
      d.objet?.type ?? null,
      d.objet?.id ?? null,
    ]);
    res.status(201).json(doc);
  })
);

export const annulationSchema = z
  .object({
    motif: z.string().trim().min(5, 'Le motif d’annulation compte au moins cinq caractères.').max(500),
  })
  .strict();

documentsRouter.post(
  '/:id/annuler',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const { motif } = annulationSchema.parse(req.body);
    const doc = await queryOne<{ statut: string; numero_affiche: string }>(
      'SELECT statut, numero_affiche FROM documents_emis WHERE id = $1',
      [req.params.id]
    );
    if (!doc) throw new ApiError(404, 'Document introuvable.');
    if (doc.statut === 'annule') throw new ApiError(409, `Le document ${doc.numero_affiche} est déjà annulé.`);
    res.json(await queryOne('SELECT * FROM app.annuler_document($1, $2)', [req.params.id, motif]));
  })
);
