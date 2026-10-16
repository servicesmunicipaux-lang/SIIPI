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
// LES GABARITS (src/documents/gabarits.ts) sont construits depuis la décision du
// 16 octobre 2026 et s'impriment « modèle provisoire » jusqu'à leur validation
// par un chef de dépôt. Ils sont aussi le contrat du contenu : l'émission refuse
// un champ obligatoire absent et un champ que le gabarit ne sait pas imprimer —
// le contenu est figé dès l'émission, une erreur ne se rattrape plus.
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';
import { champsManquants, GABARITS, schemaContenu, type TypeDocument } from '../documents/gabarits.js';
import { rendreDocument, type DocumentAImprimer } from '../documents/impression.js';

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

// Littéraux avant /:id.
documentsRouter.get(
  '/gabarits',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (_req, res) => {
    res.json(Object.values(GABARITS));
  })
);

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

// L'impression : une page A4 bilingue (src/documents/impression.ts). La ligne
// est lue sous les règles de lecture du registre : un document d'une autre
// commune est introuvable.
documentsRouter.get(
  '/:id/impression',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new ApiError(404, 'Document introuvable.');
    const doc = await queryOne<DocumentAImprimer & { commune: string; commune_ar: string | null; gouvernorat: string; gouvernorat_ar: string | null }>(
      `SELECT d.type_document, d.numero_affiche, d.exercice, d.statut, d.contenu, d.motif_annulation, d.empreinte_contenu,
              to_char(d.emis_le AT TIME ZONE 'Africa/Tunis', 'YYYY-MM-DD') AS emis_le,
              c.name AS commune, c.name_ar AS commune_ar, c.gouvernorat, g.nom_ar AS gouvernorat_ar
         FROM documents_emis d
         JOIN communes c ON c.id = d.commune_id
         LEFT JOIN gouvernorats_noms g ON g.gouvernorat = c.gouvernorat
        WHERE d.id = $1`,
      [req.params.id]
    );
    if (!doc) throw new ApiError(404, 'Document introuvable.');
    const auteur = await queryOne<{ full_name: string | null }>('SELECT full_name FROM users WHERE id = $1', [req.user?.sub ?? null]);
    res
      .type('html')
      .set('Cache-Control', 'no-store')
      .send(rendreDocument(doc, doc, auteur?.full_name ?? '—'));
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
    const manquants = champsManquants(d.type as TypeDocument, d.contenu);
    if (manquants.length) throw new ApiError(400, `Champ(s) obligatoire(s) du ${GABARITS[d.type as TypeDocument].fr.toLowerCase()} : ${manquants.join(', ')}.`);
    const verifie = schemaContenu(d.type as TypeDocument).safeParse(d.contenu);
    if (!verifie.success) {
      const inconnus = Object.keys(d.contenu).filter((k) => !GABARITS[d.type as TypeDocument].champs.some((c) => c.cle === k));
      throw new ApiError(
        400,
        inconnus.length
          ? `Champ(s) que le gabarit n'imprime pas : ${inconnus.join(', ')}. Le contenu d'un document est figé à l'émission : il doit suivre son gabarit.`
          : `Contenu non conforme au gabarit : ${verifie.error.issues.map((i) => i.message).join(' ; ')}`
      );
    }
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
      // Le contenu vérifié (textes rognés), celui qui sera figé.
      JSON.stringify(verifie.data),
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
