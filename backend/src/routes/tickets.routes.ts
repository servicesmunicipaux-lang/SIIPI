import { Router, type Request } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { journaliserAccesCitoyens } from '../services/accessLog.js';

export const ticketsRouter = Router();

ticketsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = typeof req.query.communeId === 'string' ? req.query.communeId : req.user?.communeId ?? undefined;
    // Un Gestionnaire Prestataire peut filtrer sur les tickets qui lui ont été
    // transférés (?assignedToMe=true), plutôt que de voir tout le trafic de la commune.
    const assignedToMe = req.query.assignedToMe === 'true';
    if (assignedToMe && req.user) {
      const rows = await query('SELECT * FROM tickets WHERE assigned_prestataire_id = $1 ORDER BY created_at DESC', [
        req.user.sub,
      ]);
      // Les réclamations portent le nom et le téléphone déclarés par le citoyen :
      // toute consultation par un agent est journalisée (décret-loi 2022-54).
      await journaliserAccesCitoyens('GET /tickets?assignedToMe', rows);
      return res.json(rows);
    }
    const rows = communeId
      ? await query('SELECT * FROM tickets WHERE commune_id = $1 ORDER BY created_at DESC', [communeId])
      : await query('SELECT * FROM tickets ORDER BY created_at DESC LIMIT 500');
    await journaliserAccesCitoyens('GET /tickets', rows);
    res.json(rows);
  })
);

const createSchema = z.object({
  communeId: z.string(),
  category: z.enum(['point_noir', 'conteneur_plein', 'conteneur_deteriore', 'encombrants', 'dechets_verts', 'gravats', 'autre']),
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
    let citizenId: string | null = null;
    if (req.user!.role === 'citoyen') {
      const citizen = await queryOne<{ id: string }>('SELECT id FROM citoyens WHERE user_id = $1', [req.user!.sub]);
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
}

async function loadTicketOrThrow(id: string): Promise<TicketRow> {
  const ticket = await queryOne<TicketRow>(
    'SELECT id, commune_id, status, assigned_prestataire_id FROM tickets WHERE id = $1',
    [id]
  );
  if (!ticket) throw new ApiError(404, 'Ticket introuvable.');
  return ticket;
}

/** Un Admin Commune ne peut agir que sur les tickets de sa propre commune (sauf Super Admin FNCT, qui voit tout). */
function assertCommuneAccess(req: Request, ticket: TicketRow) {
  if (req.user!.role !== 'super_admin_fnct' && req.user!.communeId !== ticket.commune_id) {
    throw new ApiError(403, "Vous n'êtes pas autorisé à agir sur les réclamations de cette commune.");
  }
}

const CLOSED_STATUSES = new Set(['resolu', 'rejete']);

// PATCH /tickets/:id/accept — l'Admin Commune prend en charge une réclamation reçue.
ticketsRouter.patch(
  '/:id/accept',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const ticket = await loadTicketOrThrow(req.params.id);
    assertCommuneAccess(req, ticket);
    if (ticket.status !== 'recu') {
      throw new ApiError(400, `Ce ticket ne peut pas être accepté (statut actuel : "${ticket.status}").`);
    }
    const updated = await queryOne(
      `UPDATE tickets SET status = 'en_cours', accepted_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
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
    assertCommuneAccess(req, ticket);
    if (CLOSED_STATUSES.has(ticket.status)) {
      throw new ApiError(400, `Ce ticket est déjà clôturé (statut actuel : "${ticket.status}").`);
    }
    const updated = await queryOne(
      `UPDATE tickets SET status = 'rejete', rejection_reason = $1 WHERE id = $2 RETURNING *`,
      [data.reason, req.params.id]
    );
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
    assertCommuneAccess(req, ticket);
    if (CLOSED_STATUSES.has(ticket.status)) {
      throw new ApiError(400, `Ce ticket est déjà clôturé (statut actuel : "${ticket.status}").`);
    }

    const prestataire = await queryOne<{ id: string; full_name: string; role: string; commune_id: string | null }>(
      'SELECT id, full_name, role, commune_id FROM users WHERE id = $1',
      [data.prestataireUserId]
    );
    if (!prestataire || prestataire.role !== 'gestionnaire_prestataire') {
      throw new ApiError(400, "L'utilisateur désigné n'est pas un Gestionnaire Prestataire.");
    }
    if (prestataire.commune_id !== ticket.commune_id) {
      throw new ApiError(400, "Ce Gestionnaire Prestataire n'est pas rattaché à la commune de ce ticket.");
    }

    const updated = await queryOne(
      `UPDATE tickets
          SET status = 'assigne',
              assigned_prestataire_id = $1,
              assigned_team = $2,
              accepted_at = COALESCE(accepted_at, now())
        WHERE id = $3
        RETURNING *`,
      [prestataire.id, prestataire.full_name, req.params.id]
    );
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

    if (req.user!.role === 'gestionnaire_prestataire') {
      if (ticket.assigned_prestataire_id !== req.user!.sub) {
        throw new ApiError(403, "Cette réclamation ne vous a pas été transférée.");
      }
    } else {
      assertCommuneAccess(req, ticket);
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
        WHERE id = $4
        RETURNING *`,
      [data.status, data.resolvedPhotoUrl ?? null, resolvedAt, req.params.id]
    );
    res.json(updated);
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
