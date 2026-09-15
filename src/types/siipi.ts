export type Language = 'fr' | 'ar';

export type UserRole = 
  | 'national_admin'      // FNCT / ANGeD / Observatoire
  | 'municipal_manager'   // Directeur des services municipaux
  | 'citizen'             // Citoyen
  | 'field_agent'         // Chauffeur / Agent de collecte
  | 'gdma_actor'          // Barbécha / Association / Entreprise
  | 'engineering_hub';    // Console de développement & Phases

export interface Commune {
  id: string;
  name: string;
  nameAr: string;
  gouvernorat: string;
  population: number;
  areaKm2: number;
  wasteTonsPerDay: number;
  collectionRate: number; // %
  cleanlinessIndex: number; // out of 100
  activeTrucks: number;
  totalContainers: number;
  openTickets: number;
  isPilot: boolean;
  coordinates: [number, number]; // [lat, lng]
  logoUrl?: string; // URL or base64 data-URL for the official municipal crest/logo
  
  // Contact info (Annuaire FNCT 2023)
  phone?: string;
  fax?: string;
  email?: string;
  address?: string;

  // Waste Management & PCGD (Plan Communal de Gestion des Déchets)
  hasPcgd?: boolean;
  pcgdStatus?: 'valide' | 'en_cours' | 'non_existant' | 'a_actualiser';
  pcgdValidationDate?: string;
  wasteManagementMode?: 'regie_directe' | 'sous_traitance_privee' | 'mixte' | 'delegation_sp';
  landfillSite?: string;
  collectionFrequency?: string;
  tclRecoveryRate?: number; // %
  responsibleOfficer?: string;
  responsiblePhone?: string;
  notes?: string;
}

export interface Truck {
  id: string;
  registration: string; // Ex: 145 TU 8920
  type: 'benne_tasseuse' | 'camion_ampliroll' | 'balayeuse' | 'tracteur_remorque';
  capacityM3: number;
  status: 'en_tournee' | 'au_depot' | 'en_decharge' | 'en_maintenance';
  currentSpeedKmH: number;
  fuelLevelPercent: number;
  currentWeightTons: number;
  maxWeightTons: number;
  driverName: string;
  assignedZone: string;
  coordinates: [number, number]; // [lat, lng]
  lastUpdate: string;
  completedStops: number;
  totalStops: number;
}

export interface ContainerSensor {
  id: string;
  code: string; // Ex: CONT-MARSA-042
  type: 'om_menagers' | 'plastique' | 'carton' | 'verre' | 'organique';
  fillLevel: number; // 0 - 100%
  batteryLevel: number;
  temperatureC: number;
  status: 'normal' | 'a_collecter' | 'alerte_debordement' | 'incendie_detecte';
  locationName: string;
  coordinates: [number, number];
  lastEmptied: string;
}

export interface TicketReport {
  id: string;
  ticketNumber: string;
  category: 'point_noir' | 'conteneur_plein' | 'conteneur_deteriore' | 'encombrants' | 'dechets_verts' | 'gravats' | 'autre';
  status: 'recu' | 'assigne' | 'en_cours' | 'resolu' | 'rejete';
  priority: 'basse' | 'moyenne' | 'haute' | 'urgente';
  title: string;
  description: string;
  citizenName: string;
  citizenPhone: string;
  locationName: string;
  coordinates: [number, number];
  createdAt: string;
  resolvedAt?: string;
  assignedTeam?: string;
  photoUrl: string;
  resolvedPhotoUrl?: string;
  qrCode?: string;
  // Workflow réclamations (CDC) — voir backend/src/routes/tickets.routes.ts
  assignedPrestataireId?: string; // Gestionnaire Prestataire auquel le ticket a été transféré
  rejectionReason?: string;       // motif saisi par l'Admin Commune en cas de refus
  acceptedAt?: string;
  communeId?: string;
}

// Module "Découpage communal" — secteurs/zones de collecte internes à une commune
// (voir backend/migrations/012_decoupage_communal.sql et backend/src/routes/zones.routes.ts).
export interface CollectionZoneGeoJSON {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: any;
}

export interface CollectionZone {
  id: string;
  communeId: string;
  name: string;
  code?: string;
  description?: string;
  color: string;
  collectionFrequency?: string;
  estimatedPopulation?: number;
  status: 'active' | 'inactive';
  assignedPrestataireId?: string;
  assignedPrestataireName?: string;
  geometry: CollectionZoneGeoJSON;
  createdAt: string;
  updatedAt: string;
}

export interface CommuneBoundary {
  communeId: string;
  geometry: CollectionZoneGeoJSON | null;
}

export interface WeighbridgeRecord {
  id: string;
  ticketNumberANGeD: string;
  truckId: string;
  truckReg: string;
  communeName: string;
  landfillSite: string; // Ex: Décharge Contrôlée de Jbel Chakir
  timestampIn: string;
  timestampOut: string;
  grossWeightKg: number;
  tareWeightKg: number;
  netWeightKg: number;
  onboardEstimateKg: number;
  discrepancyKg: number;
  discrepancyPercent: number;
  status: 'conforme' | 'ecart_acceptable' | 'anomalie_pesee';
}

export interface CitizenProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  points: number;
  level: string;
  levelBadge: string;
  co2SavedKg: number;
  badges: Array<{
    id: string;
    title: string;
    description: string;
    icon: string;
    unlockedAt: string;
  }>;
  rewards: Array<{
    id: string;
    title: string;
    pointsCost: number;
    partner: string;
    claimed: boolean;
  }>;
}

export interface BarbechaProfile {
  id: string;
  codeId: string; // Ex: BARB-TN-088
  name: string;
  cin: string;
  zone: string;
  vehicleType: 'charette' | 'tricycle_electrique' | 'triporteur_moteur';
  collectedTotalKg: number;
  earningsThisMonthTND: number;
  healthInsuranceStatus: 'active' | 'en_cours';
  recentDeliveries: Array<{
    date: string;
    material: 'PET_plastique' | 'PEHD' | 'Carton' | 'Aluminium' | 'Cuivre';
    weightKg: number;
    amountTND: number;
    hubName: string;
  }>;
}

// 5 axes officiels — cahier des charges FNCT/ANGeD §3.2.10.
export interface FiveAxisScore {
  efficaciteOperationnelle: number;    // Axe 1: Efficacité opérationnelle (0-100)
  qualiteService: number;              // Axe 2: Qualité de service (0-100)
  performanceEnvironnementale: number; // Axe 3: Performance environnementale (0-100)
  performanceEconomique: number;       // Axe 4: Performance économique (0-100)
  securiteRh: number;                  // Axe 5: Sécurité et Ressources Humaines (0-100)
  overallScore: number;
}

export interface PhaseDeliverable {
  phaseNumber: number;
  title: string;
  titleAr: string;
  duration: string;
  status: 'completed' | 'in_progress' | 'ready';
  description: string;
  deliverablesList: string[];
  specsMarkdown: string;
  codeModules: Array<{
    name: string;
    language: string;
    filename: string;
    code: string;
  }>;
  schemas: Array<{
    title: string;
    type: 'database' | 'architecture' | 'sequence' | 'security';
    content: string;
  }>;
  testCases: Array<{
    id: string;
    category: 'Unit' | 'Integration' | 'Security' | 'Performance';
    name: string;
    expectedResult: string;
    status: 'passed' | 'running' | 'pending';
  }>;
}
