// La carte de pré-collecteur (lot I2, 18.2 ; migration 092).
//
//   GET    /cartes-precollecteur                         les demandes de la commune, leur état, les pièces exigées
//   POST   /cartes-precollecteur/demandes                une demande : l'acteur, la date, les secteurs
//   DELETE /cartes-precollecteur/demandes/{id}           retirer une demande, avant la décision
//   POST   /cartes-precollecteur/demandes/{id}/pieces    une attestation reçue : sa date, sa référence
//   DELETE /cartes-precollecteur/demandes/{id}/pieces/{pieceId}
//   POST   /cartes-precollecteur/demandes/{id}/accord    accorder : la carte est émise, scellée
//   POST   /cartes-precollecteur/demandes/{id}/refus     refuser, motivé
//   POST   /cartes-precollecteur/demandes/{id}/retrait   retirer une carte accordée, motivé
//
// Ce routeur ne décide rien lui-même : la base vérifie (pièces du jour de la
// demande, secteurs, catégorie, règle de validité du jour de la décision) et
// émet la carte par app.accorder_carte, dans une seule transaction. Écrire est
// l'acte du directeur de la commune ; la FNCT lit.
//
// Aucun nom ici : la carte et la demande ne portent que le pseudonyme. Le nom
// s'ajoute à l'impression (GET /documents/{id}/impression), pour le directeur.
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';

export const cartesPrecollecteurRouter = Router();

const LECTEURS = ['admin_commune', 'super_admin_fnct'] as const;
const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');
const estUuid = (s: string) => z.string().uuid().safeParse(s).success;

const CADRE_INACTIF =
  'Le cadre du secteur informel n’est pas en vigueur (projet de décret). La FNCT l’active quand le texte est publié ; d’ici là, aucune carte ne se demande ni ne s’accorde.';

// Les refus de la base, rendus en mots : 409 quand l'état des choses s'y oppose,
// 400 quand la saisie est en cause.
const REFUS: Record<string, number> = {
  CADRE_INACTIF: 409,
  CARTE_CATEGORIE: 409,
  CARTE_PIECES: 409,
  CARTE_ZONES: 409,
  CARTE_REGLE: 409,
  CARTE_EN_COURS: 409,
  CARTE_DECIDEE: 409,
  CARTE_RETIREE: 409,
  CARTE_NON_ACCORDEE: 409,
  CARTE_FIGEE: 409,
  CARTE_PRECEDENTE: 400,
  CARTE_PIECE: 400,
  CARTE_ZONE: 400,
  CARTE_DATE: 400,
  CARTE_DECISION: 400,
};
const CONTRAINTES: Record<string, string> = {
  demandes_carte_decision_complete: 'Un refus se motive (5 caractères au moins).',
  demandes_carte_retrait_motive: 'Un retrait se motive (5 caractères au moins).',
  uq_demande_carte_en_attente: 'Une demande de cet acteur attend déjà sa décision : décidez-la, ou retirez-la.',
  uq_piece_demande: 'Cette pièce est déjà enregistrée pour cette demande : retirez-la pour en corriger la date ou la référence.',
};
function refus(err: unknown): never {
  const e = err as { message?: string; constraint?: string; code?: string };
  if (e.code === '42501' || e.message === 'DEMANDE_INCONNUE') throw new ApiError(404, 'Demande introuvable.');
  if (e.message === 'ACCES_REFUSE') throw new ApiError(403, 'La carte est un acte du directeur de la commune.');
  if (e.constraint && CONTRAINTES[e.constraint]) throw new ApiError(e.code === '23505' ? 409 : 400, CONTRAINTES[e.constraint]);
  const code = e.message?.match(/^([A-Z_]+): /)?.[1];
  if (code && REFUS[code]) {
    if (code === 'CADRE_INACTIF') throw new ApiError(409, CADRE_INACTIF);
    const texte = e.message!.slice(code.length + 2);
    throw new ApiError(REFUS[code], texte.charAt(0).toUpperCase() + texte.slice(1));
  }
  throw err;
}

/** La demande visible (RLS) — 404 sinon, jamais 403. */
async function demande(id: string) {
  const d = estUuid(id)
    ? await queryOne<{ id: string; commune_id: string; decision: string | null }>(
        'SELECT id, commune_id, decision FROM demandes_carte_precollecteur WHERE id = $1',
        [id]
      )
    : null;
  if (!d) throw new ApiError(404, 'Demande introuvable.');
  return d;
}

// Une ligne par demande, avec son état du jour, ses secteurs, ses pièces et la
// liste exigée le jour où elle a été déposée.
const SELECT_DEMANDES = `
  SELECT d.id, d.acteur_id, b.id_precollecteur, d.date_demande,
         d.carte_precedente_id, prec.numero_affiche AS carte_precedente,
         d.decision, d.date_decision, d.motif_refus,
         d.document_id, e.numero_affiche, d.date_debut, d.date_fin, d.retrait_le, d.motif_retrait,
         app.etat_carte(d, e.statut, app.jour_tunis()) AS etat,
         COALESCE((SELECT json_agg(json_build_object('id', z.id, 'nom', z.name) ORDER BY z.name)
                     FROM zones_demande_carte zd JOIN zones_collecte z ON z.id = zd.zone_id
                    WHERE zd.demande_id = d.id), '[]') AS zones,
         COALESCE((SELECT json_agg(json_build_object(
                     'code', l.code, 'libelle_fr', l.libelle_fr, 'libelle_ar', l.libelle_ar,
                     'piece_id', p.id, 'date_piece', p.date_piece, 'reference', p.reference) ORDER BY l.ordre, l.code)
                     FROM app.liste_nationale('pieces_carte_precollecteur', d.date_demande) l
                     LEFT JOIN pieces_demande_carte p
                            ON p.demande_id = d.id AND p.piece_code = l.code AND p.deleted_at IS NULL), '[]') AS pieces
    FROM demandes_carte_precollecteur d
    JOIN barbechas b ON b.id = d.acteur_id
    LEFT JOIN documents_emis e ON e.id = d.document_id
    LEFT JOIN documents_emis prec ON prec.id = d.carte_precedente_id`;

cartesPrecollecteurRouter.get(
  '/',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise (paramètre communeId).');
    const [cadre] = await query<{ actif: boolean }>('SELECT app.cadre_secteur_informel_actif() AS actif');
    res.json({
      cadre_actif: Boolean(cadre?.actif),
      demandes: await query(`${SELECT_DEMANDES} WHERE d.commune_id = $1 ORDER BY d.date_demande DESC, d.created_at DESC`, [communeId]),
    });
  })
);

export const demandeCarteSchema = z
  .object({
    acteurId: z.string().uuid(),
    dateDemande: dateIso,
    zones: z.array(z.string().uuid()).min(1, 'La carte donne accès à des secteurs : choisissez-en au moins un.').max(100),
    // Pour un renouvellement : la carte renouvelée.
    cartePrecedenteId: z.string().uuid().nullable().optional(),
  })
  .strict();

cartesPrecollecteurRouter.post(
  '/demandes',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const d = demandeCarteSchema.parse(req.body);
    // L'acteur visible (RLS) : celui d'une autre commune est introuvable.
    const acteur = await queryOne<{ id: string }>('SELECT id FROM barbechas WHERE id = $1 AND deleted_at IS NULL', [d.acteurId]);
    if (!acteur) throw new ApiError(404, 'Acteur introuvable.');
    let id = '';
    try {
      id = await withTransaction(async (client) => {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO demandes_carte_precollecteur (commune_id, acteur_id, date_demande, carte_precedente_id, saisi_par)
           VALUES ('', $1, $2, $3, app.current_user_id()) RETURNING id`,
          [d.acteurId, d.dateDemande, d.cartePrecedenteId ?? null]
        );
        for (const zone of new Set(d.zones)) {
          await client.query(`INSERT INTO zones_demande_carte (demande_id, zone_id, commune_id) VALUES ($1, $2, '')`, [rows[0].id, zone]);
        }
        return rows[0].id;
      });
    } catch (err) {
      refus(err);
    }
    res.status(201).json(await queryOne(`${SELECT_DEMANDES} WHERE d.id = $1`, [id]));
  })
);

cartesPrecollecteurRouter.delete(
  '/demandes/:id',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const d = await demande(req.params.id);
    try {
      await query("SELECT app.supprimer('demandes_carte_precollecteur', $1)", [d.id]);
    } catch (err) {
      refus(err);
    }
    res.status(204).end();
  })
);

export const pieceCarteSchema = z
  .object({
    pieceCode: z.string().trim().min(1).max(61),
    datePiece: dateIso,
    reference: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

cartesPrecollecteurRouter.post(
  '/demandes/:id/pieces',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const p = pieceCarteSchema.parse(req.body);
    const d = await demande(req.params.id);
    try {
      await query(
        `INSERT INTO pieces_demande_carte (demande_id, commune_id, piece_code, date_piece, reference, saisi_par)
         VALUES ($1, '', $2, $3, $4, app.current_user_id())`,
        [d.id, p.pieceCode, p.datePiece, p.reference || null]
      );
    } catch (err) {
      refus(err);
    }
    res.status(201).json(await queryOne(`${SELECT_DEMANDES} WHERE d.id = $1`, [d.id]));
  })
);

cartesPrecollecteurRouter.delete(
  '/demandes/:id/pieces/:pieceId',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const d = await demande(req.params.id);
    const piece = estUuid(req.params.pieceId)
      ? await queryOne('SELECT id FROM pieces_demande_carte WHERE id = $1 AND demande_id = $2', [req.params.pieceId, d.id])
      : null;
    if (!piece) throw new ApiError(404, 'Pièce introuvable.');
    try {
      await query("SELECT app.supprimer('pieces_demande_carte', $1)", [req.params.pieceId]);
    } catch (err) {
      refus(err);
    }
    res.json(await queryOne(`${SELECT_DEMANDES} WHERE d.id = $1`, [d.id]));
  })
);

export const accordCarteSchema = z.object({ dateDecision: dateIso }).strict();
export const refusCarteSchema = z
  .object({
    dateDecision: dateIso,
    motif: z.string().trim().min(5, 'Un refus se motive (5 caractères au moins).').max(1000),
  })
  .strict();
export const retraitCarteSchema = z
  .object({
    dateRetrait: dateIso,
    motif: z.string().trim().min(5, 'Un retrait se motive (5 caractères au moins).').max(1000),
  })
  .strict();

cartesPrecollecteurRouter.post(
  '/demandes/:id/accord',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const { dateDecision } = accordCarteSchema.parse(req.body);
    const d = await demande(req.params.id);
    try {
      await query('SELECT app.accorder_carte($1, $2)', [d.id, dateDecision]);
    } catch (err) {
      refus(err);
    }
    res.json(await queryOne(`${SELECT_DEMANDES} WHERE d.id = $1`, [d.id]));
  })
);

cartesPrecollecteurRouter.post(
  '/demandes/:id/refus',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const r = refusCarteSchema.parse(req.body);
    const d = await demande(req.params.id);
    try {
      await query('SELECT app.refuser_carte($1, $2, $3)', [d.id, r.dateDecision, r.motif]);
    } catch (err) {
      refus(err);
    }
    res.json(await queryOne(`${SELECT_DEMANDES} WHERE d.id = $1`, [d.id]));
  })
);

cartesPrecollecteurRouter.post(
  '/demandes/:id/retrait',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const r = retraitCarteSchema.parse(req.body);
    const d = await demande(req.params.id);
    try {
      await query('SELECT app.retirer_carte($1, $2, $3)', [d.id, r.dateRetrait, r.motif]);
    } catch (err) {
      refus(err);
    }
    res.json(await queryOne(`${SELECT_DEMANDES} WHERE d.id = $1`, [d.id]));
  })
);
