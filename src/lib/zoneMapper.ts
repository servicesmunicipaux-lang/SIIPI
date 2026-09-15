import { CollectionZone, CollectionZoneGeoJSON } from '../types/siipi';

// Ligne brute renvoyée par PostgreSQL pour zones_collecte (voir
// backend/migrations/012_decoupage_communal.sql et backend/src/routes/zones.routes.ts).
export interface ApiZoneRow {
  id: string;
  commune_id: string;
  name: string;
  code: string | null;
  description: string | null;
  color: string;
  collection_frequency: string | null;
  estimated_population: number | null;
  status: 'active' | 'inactive';
  assigned_prestataire_id: string | null;
  assigned_prestataire_name: string | null;
  geometry: CollectionZoneGeoJSON;
  created_at: string;
  updated_at: string;
}

export function mapApiZoneToFrontend(row: ApiZoneRow): CollectionZone {
  return {
    id: row.id,
    communeId: row.commune_id,
    name: row.name,
    code: row.code ?? undefined,
    description: row.description ?? undefined,
    color: row.color,
    collectionFrequency: row.collection_frequency ?? undefined,
    estimatedPopulation: row.estimated_population ?? undefined,
    status: row.status,
    assignedPrestataireId: row.assigned_prestataire_id ?? undefined,
    assignedPrestataireName: row.assigned_prestataire_name ?? undefined,
    geometry: row.geometry,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Payload attendu par POST/PATCH /zones.
export interface ZoneWritePayload {
  communeId?: string;
  name?: string;
  code?: string;
  description?: string;
  color?: string;
  collectionFrequency?: string;
  estimatedPopulation?: number;
  assignedPrestataireId?: string | null;
  status?: 'active' | 'inactive';
  geometry?: CollectionZoneGeoJSON;
}
