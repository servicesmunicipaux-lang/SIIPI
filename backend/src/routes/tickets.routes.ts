import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { journaliserAccesCitoyens } from '../services/accessLog.js';
import { notifierDecisionReclamation, renvoyerNotification } from '../services/notifications.js';

export const ticketsRouter = Router();

// Le statut de la dernière notification de décision, jointe à chaque ticket
// pour que l'écran puisse afficher un échec et proposer de le relancer sans
// appel supplémentaire. La jointure suit les mêmes politiques RLS que toute
// autre lecture de notifications_citoyen : un Gestionnaire Prestataire ne
// verra jamais cette colonne renseignée (il n'a pas à agir dessus).
const TICKET_SELECT = `
  SELECT t.*, n.id AS notification_id, n.statut AS notification_statut
    FROM tickets t
    LEFT JOIN LATERAL (
      SELECT nc.id, nc.statut
        FROM notifications_citoyen nc
       WHERE nc.reference_id = t.id AND nc.type = 'decision_reclamation' AND nc.canal = 'push'
       ORDER BY nc.date_envoi DESC
       LIMIT 1
    ) n ON true
`;

ticketsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = typeof req.query.communeId === 'string' ? req.query.communeId : req.user?.communeId ?? undefined;
    // Un Gestionnaire Prestataire peut filtrer sur les tickets qui lui ont été
    // transférés (?assignedToMe=true), plutôt que de voir tout le trafic de la commune.
    const assignedToMe = req.query.assignedToMe === 'true';
    if (assignedToMe && req.user) {
      const rows = await query(
        `${TICKET_SELECT} WHERE t.assigned_prestataire_id = $1 ORDER BY t.created_at DESC`,
        [req.user.sub]
      );
      // Les réclamations portent le nom et le téléphone déclarés par le citoyen :
      // toute consultation par un agent est journalisée (loi organique 2004-63).
      await journaliserAccesCitoyens('GET /tickets?assignedToMe', rows);
      return res.json(rows);
    }
    const rows = communeId
      ? await query(`${TICKET_SELECT} WHERE t.commune_id = $1 ORDER BY t.created_at DESC`, [communeId])
      : await query(`${TICKET_SELECT} ORDER BY t.created_at DESC LIMIT 500`);
    await journaliserAccesCitoyens('GET /tickets', rows);
    res.json(rows);
  })
);

const createSchema = z.object({
  communeId: z.string(),
  category: z.enum(['point_noir', 'conteneur_plein', 'conteneur_deteriore', 'encombrants', 'dechets_verts', 'ddc', 'autre']),
  title: z.string().min(3),
  description: z.string().optional(),
  citizenName: z.string().optional(),
  citizenPhone: z.string().optional(),
  locationName: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  photoUrl: z.string().optional(),
});

// POST /tickets — signalement citoyen (appli citoyenne)
ticketsRouter.post(
  '/',
  requireAuth,
  requireRole('citoyen', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const ticketNumber = `TKT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Relie le ticket au profil citoyen (points/badges) quand l'auteur est un citoyen
    // authentifié, pour permettre un futur écran "mes signalements" côté app citoyenne.
    const qui = req.user;
    if (!qui) throw new ApiError(401, 'Authentification requise.');
    let citizenId: string | null = null;
    if (qui.role === 'citoyen') {
      const citizen = await queryOne<{ id: string }>('SELECT id FROM citoyens WHERE user_id = $1', [qui.sub]);
      citizenId = citizen?.id ?? null;
    }

    const created = await queryOne(
      `INSERT INTO tickets (ticket_number, commune_id, category, title, description, citizen_id, citizen_name, citizen_phone, location_name, lat, lng, photo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        ticketNumber,
        data.communeId,
        data.category,
        data.title,
        data.description ?? null,
        citizenId,
        data.citizenName ?? null,
        data.citizenPhone ?? null,
        data.locationName ?? null,
        data.lat ?? null,
        data.lng ?? null,
        data.photoUrl ?? null,
      ]
    );
    res.status(201).json(created);
  })
);

// ============================================================================
// Workflow de traitement des réclamations — conforme au CDC :
//   - L'Admin Commune (ou le Super Admin FNCT) peut ACCEPTER, REFUSER, ou
//     TRANSFÉRER une réclamation à un Gestionnaire Prestataire.
//   - Le Gestionnaire Prestataire peut uniquement TRAITER (faire avancer le statut)
//     une réclamation qui lui a été explicitement transférée — il ne peut jamais
//     la refuser.
// États : recu → (accept) → en_cours  |  (assign) → assigne → (treat) → en_cours → resolu
//         recu/en_cours/assigne → (refuse, Admin Commune/Super Admin uniquement) → rejete
// ============================================================================

interface TicketRow {
  id: string;
  commune_id: string;
  status: string;
  assigned_prestataire_id: string | null;
  citizen_id: string | null;
}

// Le chargement passe par la RLS de `tickets` : la commune et ses
// rattachements (app.mes_communes), la FNCT, le prestataire à qui la réclamation
// est transférée, le citoyen qui l'a déposée. Hors de ce périmètre, une
// réclamation est introuvable — c'est le seul contrôle de périmètre des routes
// qui suivent. Un second contrôle sur le rattachement PRINCIPAL du compte
// refusait, par un 403, un directeur rattaché à une seconde commune, à qui la
// base donnait pourtant ces réclamations (v0.15.87).
async function loadTicketOrThrow(id: string): Promise<TicketRow> {
  const ticket = await queryOne<TicketRow>(
    'SELECT id, commune_id, status, assigned_prestataire_id, citizen_id FROM tickets WHERE id = $1',
    [id]
  );
  if (!ticket) throw new ApiError(404, 'Ticket introuvable.');
  return ticket;
}

const CLOSED_STATUSES = new Set(['resolu', 'rejete']);

// Le statut lu au chargement peut avoir changé avant l'écriture (deux requêtes,
// deux transactions) : chaque écriture redit la condition, et une écriture qui
// ne touche aucune ligne est un conflit, jamais un succès muet — sinon un
// traitement chargé avant un refus réécrirait « résolu » par-dessus la décision
// de la commune, et le citoyen serait notifié d'une acceptation qui n'a pas eu
// lieu.

// PATCH /tickets/:id/accept — l'Admin Commune prend en charge une réclamation reçue.
ticketsRouter.patch(
  '/:id/accept',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const ticket = await loadTicketOrThrow(req.params.id);
    if (ticket.status !== 'recu') {
      throw new ApiError(400, `Ce ticket ne peut pas être accepté (statut actuel : "${ticket.status}").`);
    }
    const updated = await queryOne(
      `UPDATE tickets SET status = 'en_cours', accepted_at = now() WHERE id = $1 AND status = 'recu' RETURNING *`,
      [req.params.id]
    );
    if (!updated) throw new ApiError(409, 'Cette réclamation a changé entre-temps (décision ou retrait) : rechargez-la avant de recommencer.');

    // B5.1.2 : le citoyen apprend la décision. Un échec d'envoi ne défait pas
    // l'acceptation déjà actée — même précédent que l'ouverture de la photo
    // de traitement dans /treat, plus bas.
    try {
      await notifierDecisionReclamation(ticket.commune_id, ticket.citizen_id, ticket.id, 'acceptee');
    } catch (err) {
      console.error('[tickets] notification de décision (accept) non envoyée :', err);
    }

    res.json(updated);
  })
);

const refuseSchema = z.object({
  reason: z.string().min(3, 'Le motif de refus doit être précisé (au moins 3 caractères).'),
});

// PATCH /tickets/:id/refuse — l'Admin Commune (ou le Super Admin FNCT) refuse une réclamation.
// Le Gestionnaire Prestataire n'a jamais accès à cette route (voir requireRole ci-dessous) :
// conformément au CDC, il peut traiter un ticket transféré mais jamais le refuser.
ticketsRouter.patch(
  '/:id/refuse',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const data = refuseSchema.parse(req.body);
    const ticket = await loadTicketOrThrow(req.params.id);
    if (CLOSED_STATUSES.has(ticket.status)) {
      throw new ApiError(400, `Ce ticket est déjà clôturé (statut actuel : "${ticket.status}").`);
    }
    const updated = await queryOne(
      `UPDATE tickets SET status = 'rejete', rejection_reason = $1
        WHERE id = $2 AND status NOT IN ('resolu', 'rejete') RETURNING *`,
      [data.reason, req.params.id]
    );
    if (!updated) throw new ApiError(409, 'Cette réclamation a changé entre-temps (décision ou retrait) : rechargez-la avant de recommencer.');

    // B5.1.2 : le motif fait partie du message, un refus muet ne se justifie
    // pas plus ici que pour une proposition de point citoyen.
    try {
      await notifierDecisionReclamation(ticket.commune_id, ticket.citizen_id, ticket.id, 'refusee', data.reason);
    } catch (err) {
      console.error('[tickets] notification de décision (refuse) non envoyée :', err);
    }

    res.json(updated);
  })
);

const assignSchema = z.object({
  prestataireUserId: z.string().uuid(),
});

// PATCH /tickets/:id/assign — l'Admin Commune transfère une réclamation à un
// Gestionnaire Prestataire (privé) de sa commune, qui pourra ensuite la traiter.
ticketsRouter.patch(
  '/:id/assign',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const data = assignSchema.parse(req.body);
    const ticket = await loadTicketOrThrow(req.params.id);
    if (CLOSED_STATUSES.has(ticket.status)) {
      throw new ApiError(400, `Ce ticket est déjà clôturé (statut actuel : "${ticket.status}").`);
    }

    // Rattaché par sa commune principale ou par un contrat en cours : la base le
    // dit (095), le directeur ne lisant pas la fiche d'un compte d'une autre
    // commune principale.
    const prestataire = await queryOne<{ id: string; full_name: string }>(
      'SELECT id, full_name FROM app.prestataire_de_commune($1, $2)',
      [data.prestataireUserId, ticket.commune_id]
    );
    if (!prestataire) {
      throw new ApiError(
        400,
        "Ce compte n'est pas un Gestionnaire Prestataire actif rattaché à la commune de ce ticket (commune principale ou contrat en cours)."
      );
    }

    const updated = await queryOne(
      `UPDATE tickets
          SET status = 'assigne',
              assigned_prestataire_id = $1,
              assigned_team = $2,
              accepted_at = COALESCE(accepted_at, now())
        WHERE id = $3 AND status NOT IN ('resolu', 'rejete')
        RETURNING *`,
      [prestataire.id, prestataire.full_name, req.params.id]
    );
    if (!updated) throw new ApiError(409, 'Cette réclamation a changé entre-temps (décision ou retrait) : rechargez-la avant de recommencer.');
    res.json(updated);
  })
);

const treatSchema = z.object({
  status: z.enum(['en_cours', 'resolu']),
  resolvedPhotoUrl: z.string().optional(),
});

// PATCH /tickets/:id/treat — fait avancer le traitement d'une réclamation
// ("en_cours" ou "resolu" uniquement — jamais "rejete", voir /refuse).
// - Le Gestionnaire Prestataire ne peut traiter que les tickets qui lui ont été
//   explicitement transférés (assigned_prestataire_id = son propre compte).
// - L'Admin Commune / le Super Admin FNCT peuvent traiter directement les tickets
//   de leur commune, transférés ou non.
ticketsRouter.patch(
  '/:id/treat',
  requireAuth,
  requireRole('gestionnaire_prestataire', 'admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const data = treatSchema.parse(req.body);
    const ticket = await loadTicketOrThrow(req.params.id);
    const qui = req.user;
    if (!qui) throw new ApiError(401, 'Authentification requise.');

    // La RLS ne montre au prestataire que les réclamations qui lui sont
    // transférées ; le contrôle reste écrit pour le jour où elle s'élargirait.
    if (qui.role === 'gestionnaire_prestataire' && ticket.assigned_prestataire_id !== qui.sub) {
      throw new ApiError(404, 'Ticket introuvable.');
    }

    if (CLOSED_STATUSES.has(ticket.status)) {
      throw new ApiError(400, `Ce ticket est déjà clôturé (statut actuel : "${ticket.status}").`);
    }

    const resolvedAt = data.status === 'resolu' ? new Date() : null;
    const updated = await queryOne(
      `UPDATE tickets
          SET status = $1,
              resolved_photo_url = COALESCE($2, resolved_photo_url),
              resolved_at = COALESCE($3, resolved_at)
        WHERE id = $4 AND status NOT IN ('resolu', 'rejete')
        RETURNING *`,
      [data.status, data.resolvedPhotoUrl ?? null, resolvedAt, req.params.id]
    );
    if (!updated) throw new ApiError(409, 'Cette réclamation a changé entre-temps (décision ou retrait) : rechargez-la avant de recommencer.');

    // LA PREUVE DE TRAITEMENT DOIT ÊTRE VISIBLE PAR CELUI QUI A SIGNALÉ.
    //
    // Un fichier déposé sur la plateforme est, par défaut, lisible du seul
    // service de la commune. La photo « après traitement » ne vaut pourtant
    // que si le citoyen la voit : c'est la réponse qu'on lui doit (B5.1.3, M5).
    //
    // L'ouverture se fait ICI plutôt qu'au dépôt, et c'est délibéré : à cet
    // endroit seulement on sait à quelle réclamation la photo se rattache, et
    // donc à QUI l'ouvrir. Un écran qui aurait dû y penser lui-même l'aurait
    // oublié un jour — et le citoyen aurait reçu une notification renvoyant
    // vers une image qu'il n'a pas le droit de voir.
    //
    // Nommément, jamais globalement : l'album de la commune ne s'ouvre pas aux
    // autres citoyens pour autant.
    const fichier = /^\/fichiers\/([0-9a-f-]{36})$/i.exec(data.resolvedPhotoUrl ?? '');
    if (fichier && ticket.citizen_id) {
      await query(
        `UPDATE fichiers
            SET visibilite = 'citoyen', destinataire_citoyen_id = $1
          WHERE id = $2 AND commune_id = $3 AND deleted_at IS NULL`,
        [ticket.citizen_id, fichier[1], ticket.commune_id]
      );
    }

    res.json(updated);
  })
);

// PATCH /tickets/:id/notification/renvoyer — relance manuelle d'une
// notification de décision ÉCHOUÉE. Jamais automatique (une seule tentative
// — voir notifications.ts) : c'est un geste d'agent, explicite.
ticketsRouter.patch(
  '/:id/notification/renvoyer',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const ticket = await loadTicketOrThrow(req.params.id);

    const notif = await queryOne<{ id: string }>(
      `SELECT id FROM notifications_citoyen
        WHERE reference_id = $1 AND type = 'decision_reclamation' AND canal = 'push'
        ORDER BY date_envoi DESC LIMIT 1`,
      [req.params.id]
    );
    if (!notif) throw new ApiError(404, 'Aucune notification à relancer pour ce ticket.');

    await renvoyerNotification(notif.id);
    res.json(await queryOne(`${TICKET_SELECT} WHERE t.id = $1`, [req.params.id]));
  })
);

// Schémas exposés à la documentation OpenAPI (src/openapi/document.ts).
// La documentation importe les schémas de validation EUX-MÊMES : elle ne peut
// donc pas décrire un format différent de celui réellement contrôlé à l'exécution.
export {
  createSchema as ticketCreateSchema,
  refuseSchema as ticketRefuseSchema,
  assignSchema as ticketAssignSchema,
  treatSchema as ticketTreatSchema,
};
