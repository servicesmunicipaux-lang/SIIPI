import { Commune } from '../types/siipi';

// Ligne brute renvoyée par PostgreSQL (colonnes snake_case ; les colonnes NUMERIC
// arrivent en chaînes de caractères via le driver `pg`, d'où les conversions Number()).
export interface ApiCommuneRow {
  id: string;
  name: string;
  name_ar: string;
  gouvernorat: string;
  population: number;
  area_km2: string | number | null;
  waste_tons_per_day: string | number | null;
  collection_rate: string | number | null;
  cleanliness_index: string | number | null;
  active_trucks: number;
  total_containers: number;
  open_tickets: number;
  is_pilot: boolean;
  lat: number | null;
  lng: number | null;
  logo_url: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  address: string | null;
  has_pcgd: boolean;
  pcgd_status: Commune['pcgdStatus'] | null;
  pcgd_validation_date: string | null;
  waste_management_mode: Commune['wasteManagementMode'] | null;
  landfill_site: string | null;
  collection_frequency: string | null;
  tcl_recovery_rate: string | number | null;
  responsible_officer: string | null;
  responsible_phone: string | null;
  notes: string | null;
}

const toNumber = (v: string | number | null | undefined): number => (v === null || v === undefined ? 0 : Number(v));

export function mapApiCommuneToFrontend(row: ApiCommuneRow): Commune {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.name_ar,
    gouvernorat: row.gouvernorat,
    population: row.population,
    areaKm2: toNumber(row.area_km2),
    wasteTonsPerDay: toNumber(row.waste_tons_per_day),
    collectionRate: toNumber(row.collection_rate),
    cleanlinessIndex: toNumber(row.cleanliness_index),
    activeTrucks: row.active_trucks,
    totalContainers: row.total_containers,
    openTickets: row.open_tickets,
    isPilot: row.is_pilot,
    coordinates: [row.lat ?? 0, row.lng ?? 0],
    logoUrl: row.logo_url ?? undefined,
    phone: row.phone ?? undefined,
    fax: row.fax ?? undefined,
    email: row.email ?? undefined,
    address: row.address ?? undefined,
    hasPcgd: row.has_pcgd,
    pcgdStatus: row.pcgd_status ?? undefined,
    pcgdValidationDate: row.pcgd_validation_date ?? undefined,
    wasteManagementMode: row.waste_management_mode ?? undefined,
    landfillSite: row.landfill_site ?? undefined,
    collectionFrequency: row.collection_frequency ?? undefined,
    tclRecoveryRate: row.tcl_recovery_rate !== null ? toNumber(row.tcl_recovery_rate) : undefined,
    responsibleOfficer: row.responsible_officer ?? undefined,
    responsiblePhone: row.responsible_phone ?? undefined,
    notes: row.notes ?? undefined,
  };
}

// Traduit les champs Commune (camelCase, front-end) vers les clés attendues par
// PATCH /communes/:id côté API (voir backend/src/routes/communes.routes.ts).
export function mapCommunePatchToApi(patch: Partial<Commune>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.phone !== undefined) out.phone = patch.phone;
  if (patch.fax !== undefined) out.fax = patch.fax;
  if (patch.email !== undefined) out.email = patch.email;
  if (patch.address !== undefined) out.address = patch.address;
  if (patch.logoUrl !== undefined) out.logoUrl = patch.logoUrl;
  if (patch.hasPcgd !== undefined) out.hasPcgd = patch.hasPcgd;
  if (patch.pcgdStatus !== undefined) out.pcgdStatus = patch.pcgdStatus;
  if (patch.pcgdValidationDate !== undefined) out.pcgdValidationDate = patch.pcgdValidationDate;
  if (patch.wasteManagementMode !== undefined) out.wasteManagementMode = patch.wasteManagementMode;
  if (patch.landfillSite !== undefined) out.landfillSite = patch.landfillSite;
  if (patch.collectionFrequency !== undefined) out.collectionFrequency = patch.collectionFrequency;
  if (patch.tclRecoveryRate !== undefined) out.tclRecoveryRate = patch.tclRecoveryRate;
  if (patch.responsibleOfficer !== undefined) out.responsibleOfficer = patch.responsibleOfficer;
  if (patch.responsiblePhone !== undefined) out.responsiblePhone = patch.responsiblePhone;
  if (patch.notes !== undefined) out.notes = patch.notes;
  return out;
}
