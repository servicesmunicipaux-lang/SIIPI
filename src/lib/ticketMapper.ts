import { TicketReport } from '../types/siipi';

// Ligne brute renvoyée par PostgreSQL pour la table `tickets` (colonnes snake_case).
// Voir backend/migrations/005_tickets.sql et 011_tickets_workflow_cdc.sql.
export interface ApiTicketRow {
  id: string;
  ticket_number: string;
  commune_id: string;
  category: TicketReport['category'];
  status: TicketReport['status'];
  priority: TicketReport['priority'];
  title: string;
  description: string | null;
  citizen_id: string | null;
  citizen_name: string | null;
  citizen_phone: string | null;
  location_name: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  resolved_at: string | null;
  assigned_team: string | null;
  photo_url: string | null;
  resolved_photo_url: string | null;
  qr_code: string | null;
  assigned_prestataire_id: string | null;
  rejection_reason: string | null;
  accepted_at: string | null;
}

export function mapApiTicketToFrontend(row: ApiTicketRow): TicketReport {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    category: row.category,
    status: row.status,
    priority: row.priority,
    title: row.title,
    description: row.description ?? '',
    citizenName: row.citizen_name ?? '',
    citizenPhone: row.citizen_phone ?? '',
    locationName: row.location_name ?? '',
    coordinates: [row.lat ?? 0, row.lng ?? 0],
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
    assignedTeam: row.assigned_team ?? undefined,
    photoUrl: row.photo_url ?? '',
    resolvedPhotoUrl: row.resolved_photo_url ?? undefined,
    qrCode: row.qr_code ?? undefined,
    assignedPrestataireId: row.assigned_prestataire_id ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    acceptedAt: row.accepted_at ?? undefined,
    communeId: row.commune_id,
  };
}

// Payload attendu par POST /tickets (voir backend/src/routes/tickets.routes.ts).
export interface CreateTicketInput {
  communeId: string;
  category: TicketReport['category'];
  title: string;
  description?: string;
  citizenName?: string;
  citizenPhone?: string;
  locationName?: string;
  lat?: number;
  lng?: number;
  photoUrl?: string;
}
