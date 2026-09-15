// Script de seed : importe le vrai référentiel des 350 communes et crée des comptes
// de démonstration pour chaque rôle, afin d'avoir un système bout-en-bout testable
// dès la première installation (au lieu des tableaux "mock" en dur du prototype).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CommuneSeed {
  id: string;
  name: string;
  nameAr: string;
  gouvernorat: string;
  population: number;
  areaKm2: number;
  wasteTonsPerDay: number;
  collectionRate: number;
  cleanlinessIndex: number;
  activeTrucks: number;
  totalContainers: number;
  openTickets: number;
  isPilot: boolean;
  coordinates: [number, number];
  phone?: string;
  fax?: string;
  email?: string;
  address?: string;
  hasPcgd?: boolean;
  pcgdStatus?: string;
  pcgdValidationDate?: string;
  wasteManagementMode?: string;
  landfillSite?: string;
  collectionFrequency?: string;
  tclRecoveryRate?: number;
  responsibleOfficer?: string;
  responsiblePhone?: string;
  notes?: string;
}

const DEMO_PASSWORD = 'Siipi2026!'; // à changer immédiatement après la première connexion

// Communes pilotes. Le CDC (§1.2) prévoit une approche MVP itérative sur un petit nombre
// de communes ; le périmètre de démonstration a depuis été élargi à 5 communes pilotes à la
// demande de la FNCT : les 2 communes pilotes historiques (La Marsa, Sfax) + les 3 communes
// de l'île de Djerba (Houmt Souk, Midoun, Ajim), pour couvrir un territoire insulaire à
// gestion des déchets mutualisée. Choix à confirmer avec la FNCT pour le déploiement réel.
const PILOT_COMMUNE_1_ID = 'tunis_la_marsa'; // commune pilote historique du prototype (La Marsa)
const PILOT_COMMUNE_2_ID = 'sfax_sfax_ville_medina'; // 2e commune pilote (diversité géographique/taille)
const PILOT_COMMUNE_3_ID = 'medenine_djerba_houmt_souk'; // Djerba — chef-lieu / port principal
const PILOT_COMMUNE_4_ID = 'medenine_djerba_midoun'; // Djerba — zone touristique
const PILOT_COMMUNE_5_ID = 'medenine_djerba_ajim'; // Djerba — village de potiers & bac vers Jorf

async function seedCommunes() {
  const raw = fs.readFileSync(path.resolve(__dirname, 'data', 'communes_350.json'), 'utf-8');
  const communes: CommuneSeed[] = JSON.parse(raw);

  console.log(`[seed] Import de ${communes.length} communes...`);
  for (const c of communes) {
    await pool.query(
      `INSERT INTO communes (
         id, name, name_ar, gouvernorat, population, area_km2, waste_tons_per_day,
         collection_rate, cleanliness_index, active_trucks, total_containers, open_tickets,
         is_pilot, lat, lng, phone, fax, email, address, has_pcgd, pcgd_status,
         pcgd_validation_date, waste_management_mode, landfill_site, collection_frequency,
         tcl_recovery_rate, responsible_officer, responsible_phone, notes
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
       )
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, name_ar = EXCLUDED.name_ar, gouvernorat = EXCLUDED.gouvernorat,
         population = EXCLUDED.population, area_km2 = EXCLUDED.area_km2,
         waste_tons_per_day = EXCLUDED.waste_tons_per_day, collection_rate = EXCLUDED.collection_rate,
         cleanliness_index = EXCLUDED.cleanliness_index, active_trucks = EXCLUDED.active_trucks,
         total_containers = EXCLUDED.total_containers, open_tickets = EXCLUDED.open_tickets,
         is_pilot = EXCLUDED.is_pilot, lat = EXCLUDED.lat, lng = EXCLUDED.lng`,
      [
        c.id, c.name, c.nameAr, c.gouvernorat, c.population, c.areaKm2, c.wasteTonsPerDay,
        c.collectionRate, c.cleanlinessIndex, c.activeTrucks, c.totalContainers, c.openTickets,
        c.isPilot, c.coordinates[0], c.coordinates[1], c.phone ?? null, c.fax ?? null,
        c.email ?? null, c.address ?? null, c.hasPcgd ?? false, c.pcgdStatus ?? null,
        c.pcgdValidationDate ?? null, c.wasteManagementMode ?? null, c.landfillSite ?? null,
        c.collectionFrequency ?? null, c.tclRecoveryRate ?? null, c.responsibleOfficer ?? null,
        c.responsiblePhone ?? null, c.notes ?? null,
      ]
    );
  }
  console.log('[seed] Communes importées.');
}

// Comptes de démonstration — 4 rôles RBAC officiels du CDC (§5, matrice de permissions) :
// Super Admin FNCT, Admin Commune (un par commune pilote), Gestionnaire Prestataire (privé), Citoyen.
// ('agent de terrain' et 'acteur GDMA/Barbécha' ne sont plus des rôles de connexion distincts —
// voir migration 010 — leurs vues restent accessibles depuis le portail Admin Commune.)
async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const demoUsers = [
    { email: 'admin.national@siipi.tn', fullName: 'Amira Ben Slimane', role: 'super_admin_fnct', communeId: null },
    { email: 'directeur.marsa@siipi.tn', fullName: 'Nabil Charfi', role: 'admin_commune', communeId: PILOT_COMMUNE_1_ID },
    { email: 'directeur.sfax@siipi.tn', fullName: 'Ines Kammoun', role: 'admin_commune', communeId: PILOT_COMMUNE_2_ID },
    { email: 'prestataire.marsa@siipi.tn', fullName: 'Sami Gharbi', role: 'gestionnaire_prestataire', communeId: PILOT_COMMUNE_1_ID },
    // Île de Djerba — 3 communes pilotes, chacune avec son Admin Commune et son
    // Gestionnaire Prestataire (privé), pour un scénario de démonstration complet.
    { email: 'directeur.houmtsouk@siipi.tn', fullName: 'Karim Bouaziz', role: 'admin_commune', communeId: PILOT_COMMUNE_3_ID },
    { email: 'directeur.midoun@siipi.tn', fullName: 'Sonia Fersi', role: 'admin_commune', communeId: PILOT_COMMUNE_4_ID },
    { email: 'directeur.ajim@siipi.tn', fullName: 'Hedi Mestiri', role: 'admin_commune', communeId: PILOT_COMMUNE_5_ID },
    { email: 'prestataire.houmtsouk@siipi.tn', fullName: 'Mounir Sassi', role: 'gestionnaire_prestataire', communeId: PILOT_COMMUNE_3_ID },
    { email: 'prestataire.midoun@siipi.tn', fullName: 'Rim Jaziri', role: 'gestionnaire_prestataire', communeId: PILOT_COMMUNE_4_ID },
    { email: 'prestataire.ajim@siipi.tn', fullName: 'Walid Ben Younes', role: 'gestionnaire_prestataire', communeId: PILOT_COMMUNE_5_ID },
    { email: 'citoyen.demo@siipi.tn', fullName: 'Yassine Belhadj', role: 'citoyen', communeId: null },
  ] as const;

  for (const u of demoUsers) {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, commune_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, role`,
      [u.email, passwordHash, u.fullName, u.role, u.communeId]
    );
    const user = rows[0];
    if (user && user.role === 'citoyen') {
      await pool.query('INSERT INTO citoyens (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
    }
  }
  console.log(`[seed] Comptes de démonstration créés (mot de passe commun : "${DEMO_PASSWORD}").`);
}

// Jeux de données de démonstration pour les 2 communes pilotes officielles du CDC.
async function seedFleetAndOperations() {
  const trucks = [
    { id: 'trk-01', registration: '189 TU 4521', communeId: PILOT_COMMUNE_1_ID, type: 'benne_tasseuse', capacityM3: 16, driverName: 'Moncef Ben Salem', zone: 'Zone Marsa Plage & Saf-Saf', lat: 36.8835, lng: 10.3282 },
    { id: 'trk-02', registration: '210 TU 9832', communeId: PILOT_COMMUNE_1_ID, type: 'benne_tasseuse', capacityM3: 16, driverName: 'Kamel Trabelsi', zone: 'Zone Gammarth Village', lat: 36.9125, lng: 10.2941 },
    { id: 'trk-03', registration: '117 TU 7710', communeId: PILOT_COMMUNE_2_ID, type: 'benne_tasseuse', capacityM3: 18, driverName: 'Anis Jendoubi', zone: 'Zone Médina & Corniche', lat: 34.7398, lng: 10.7601 },
    { id: 'trk-04', registration: '405 TU 3312', communeId: PILOT_COMMUNE_3_ID, type: 'benne_tasseuse', capacityM3: 16, driverName: 'Youssef Zaïbi', zone: 'Centre-Ville & Marché Houmt Souk', lat: 33.8755, lng: 10.8587 },
    { id: 'trk-05', registration: '512 TU 6644', communeId: PILOT_COMMUNE_4_ID, type: 'camion_ampliroll', capacityM3: 20, driverName: 'Adel Chaabane', zone: 'Zone Touristique Sidi Mahres', lat: 33.8102, lng: 10.9945 },
    { id: 'trk-06', registration: '298 TU 1187', communeId: PILOT_COMMUNE_5_ID, type: 'tracteur_remorque', capacityM3: 10, driverName: 'Foued Marzouki', zone: 'Village & Port d\'Ajim', lat: 33.7218, lng: 10.7512 },
  ];
  for (const t of trucks) {
    await pool.query(
      `INSERT INTO vehicules (id, registration, commune_id, type, capacity_m3, status, driver_name, assigned_zone, lat, lng, total_stops)
       VALUES ($1,$2,$3,$4,$5,'en_tournee',$6,$7,$8,$9,28)
       ON CONFLICT (id) DO NOTHING`,
      [t.id, t.registration, t.communeId, t.type, t.capacityM3, t.driverName, t.zone, t.lat, t.lng]
    );
  }

  const containers = [
    { id: 'cnt-01', code: 'CONT-MARSA-012', communeId: PILOT_COMMUNE_1_ID, type: 'om_menagers', fillLevel: 88, locationName: 'Place Saf-Saf, Marsa Ville', lat: 36.8812, lng: 10.3245, status: 'a_collecter' },
    { id: 'cnt-02', code: 'CONT-MARSA-044', communeId: PILOT_COMMUNE_1_ID, type: 'plastique', fillLevel: 96, locationName: 'Avenue de la République', lat: 36.8845, lng: 10.3298, status: 'alerte_debordement' },
    { id: 'cnt-03', code: 'CONT-SFAX-021', communeId: PILOT_COMMUNE_2_ID, type: 'om_menagers', fillLevel: 74, locationName: 'Avenue Habib Bourguiba, Sfax', lat: 34.7406, lng: 10.7603, status: 'a_collecter' },
    { id: 'cnt-04', code: 'CONT-HSOUK-007', communeId: PILOT_COMMUNE_3_ID, type: 'om_menagers', fillLevel: 82, locationName: 'Marché Central, Houmt Souk', lat: 33.8758, lng: 10.8590, status: 'a_collecter' },
    { id: 'cnt-05', code: 'CONT-MIDOUN-015', communeId: PILOT_COMMUNE_4_ID, type: 'verre', fillLevel: 65, locationName: 'Zone Hôtelière, Sidi Mahres', lat: 33.8110, lng: 10.9950, status: 'a_collecter' },
    { id: 'cnt-06', code: 'CONT-AJIM-003', communeId: PILOT_COMMUNE_5_ID, type: 'om_menagers', fillLevel: 91, locationName: "Port d'Ajim, embarcadère", lat: 33.7215, lng: 10.7508, status: 'alerte_debordement' },
  ];
  for (const c of containers) {
    await pool.query(
      `INSERT INTO conteneurs (id, code, commune_id, type, fill_level, status, location_name, lat, lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [c.id, c.code, c.communeId, c.type, c.fillLevel, c.status, c.locationName, c.lat, c.lng]
    );
  }

  // Module Barbécha : conservé fonctionnel (voir note dans backend/src/routes/barbechas.routes.ts),
  // toujours rattaché à la commune pilote 1 pour la démonstration.
  await pool.query(
    `INSERT INTO barbechas (code_id, name, zone, commune_id, vehicle_type, health_insurance_status)
     VALUES ('BARB-MARSA-04','Salem Bouazizi','La Marsa & Bhar Lazreg',$1,'tricycle_electrique','active')
     ON CONFLICT (code_id) DO NOTHING`,
    [PILOT_COMMUNE_1_ID]
  );

  console.log('[seed] Flotte, conteneurs et barbécha de démonstration créés (communes pilotes : La Marsa, Sfax, Djerba (Houmt Souk, Midoun, Ajim)).');
}

interface DjerbaZoneSeed {
  communeId: string;
  name: string;
  code: string;
  collectionFrequency: string;
  estimatedPopulation: number;
  color: string;
  prestataireEmail: string;
  geometry: any; // GeoJSON MultiPolygon, pré-calculé (voir backend/seed/data/djerba_zones.json)
}

// Module "Découpage communal" (migration 012) : un secteur de collecte de démonstration
// par commune pilote de Djerba, pour que l'onglet "Découpage Communal" ne soit pas vide à
// la première connexion. Chaque secteur est un polygone réel (dérivé de la frontière
// administrative importée depuis OpenStreetMap, voir backend/seed/importBoundaries.ts) et
// est assigné au Gestionnaire Prestataire de la commune correspondante.
async function seedDjerbaZones() {
  const filePath = path.resolve(__dirname, 'data', 'djerba_zones.json');
  if (!fs.existsSync(filePath)) {
    console.warn('[seed] djerba_zones.json introuvable — secteurs de démonstration ignorés.');
    return;
  }
  const zones: DjerbaZoneSeed[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  for (const z of zones) {
    // zones_collecte n'a pas de contrainte d'unicité naturelle (id = UUID généré) : on
    // vérifie d'abord l'existence par (commune_id, code) pour que le seed reste rejouable
    // sans dupliquer les secteurs de démonstration à chaque exécution.
    const existing = await pool.query('SELECT id FROM zones_collecte WHERE commune_id = $1 AND code = $2', [
      z.communeId,
      z.code,
    ]);
    if (existing.rows.length > 0) continue;

    const prestataire = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [z.prestataireEmail]);
    const admin = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE commune_id = $1 AND role = 'admin_commune' LIMIT 1",
      [z.communeId]
    );
    await pool.query(
      `INSERT INTO zones_collecte
         (commune_id, name, code, description, color, collection_frequency, estimated_population, assigned_prestataire_id, geom, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON($9)), 4326), $10)`,
      [
        z.communeId,
        z.name,
        z.code,
        'Secteur de démonstration créé automatiquement à la mise en place de la commune pilote.',
        z.color,
        z.collectionFrequency,
        z.estimatedPopulation,
        prestataire.rows[0]?.id ?? null,
        JSON.stringify(z.geometry),
        admin.rows[0]?.id ?? null,
      ]
    );
  }
  console.log(`[seed] ${zones.length} secteur(s) de collecte de démonstration créés pour Djerba.`);
}

async function run() {
  await withTransaction(async () => {
    await seedCommunes();
    await seedUsers();
    await seedFleetAndOperations();
    await seedDjerbaZones();
  });
  console.log('[seed] Terminé.');
  await pool.end();
}

run().catch((err) => {
  console.error('[seed] Échec :', err);
  process.exit(1);
});
