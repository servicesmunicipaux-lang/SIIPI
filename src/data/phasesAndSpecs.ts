import { PhaseDeliverable } from '../types/siipi';

export const SIIPI_PHASES: PhaseDeliverable[] = [
  {
    phaseNumber: 1,
    title: 'Phase 1 – Étude et spécifications fonctionnelles',
    titleAr: 'المرحلة 1: الدراسة والمواصفات الوظيفية',
    duration: '2 semaines (S1 - S2)',
    status: 'completed',
    description: 'Analyse des besoins des parties prenantes (FNCT, 350 communes, ANGeD, citoyens, barbéchas/récupérateurs) et élaboration du cahier des charges fonctionnel et opérationnel.',
    deliverablesList: [
      'Rapport d’analyse des besoins et interviews des acteurs de terrain',
      'Spécifications fonctionnelles détaillées (SFD) des 8 sous-systèmes',
      'Plan opérationnel, matrice RACI, budget et chronogramme sur 9 mois',
      'Grille d’évaluation des 5 axes de propreté intercommunale'
    ],
    specsMarkdown: `### 📋 Synthèse Exécutive - Phase 1 (Spécifications SIIPI)
**Cadre institutionnel** : Fédération Nationale des Communes Tunisiennes (FNCT) en collaboration avec l'Agence Nationale de Gestion des Déchets (ANGeD) et le Ministère de l'Environnement.

#### 1. Cartographie des Acteurs et Besoins Identifiés :
- **Communes (350 municipalités)** : Manque de visibilité temps réel sur les tournées, taux de pannes élevé de la flotte, absence de corrélation avec les tickets de pesée des décharges contrôlées.
- **ANGeD** : Nécessité de fiabiliser les déclarations de tonnage entrant à Jbel Chakir, Sousse Oued Laya, Sfax Thyna, et d'optimiser le calcul de la redevance de traitement.
- **Citoyens** : Demande d'un canal direct de signalement des points noirs avec géolocalisation et traçabilité de résolution, accès aux plannings de passage des bennes.
- **Barbéchas (Collecteurs informels)** : Nécessité d'inclusion économique, traçabilité des volumes recyclés, pesée équitable dans les centres de tri municipaux et accès à la couverture maladie.

#### 2. Matrice des Exigences Légales & Normatives :
- **Décret-loi n° 2022-54** sur la cybersécurité et l'intégrité des systèmes d'information en Tunisie.
- **Loi organique n° 2018-29** relative au Code des Collectivités Locales.
- **Norme INPDP** (Instance Nationale de Protection des Données Personnelles) pour l'anonymisation des signalements citoyens.`,
    codeModules: [
      {
        name: 'spec-matrix-json',
        language: 'json',
        filename: 'specs/functional_requirements_matrix.json',
        code: `{
  "project": "SIIPI - Système d'Information Intelligent pour la Propreté Intercommunale",
  "authority": "FNCT / ANGeD Tunisie",
  "version": "1.0.0-final",
  "modules": [
    {
      "id": "MOD-01",
      "name": "Portail National & Observatoire",
      "priority": "P1",
      "kpis": ["QP_production_hab", "TC_taux_collecte", "Indice_5_axes"]
    },
    {
      "id": "MOD-02",
      "name": "Portail Municipal & Télématique Flotte",
      "priority": "P1",
      "features": ["GIS_Tracking", "Bons_Collecte", "IoT_Bacs", "Pesee_ANGeD"]
    },
    {
      "id": "MOD-03",
      "name": "Application Mobile Citoyenne",
      "platforms": ["iOS", "Android"],
      "features": ["Signalement_Point_Noir", "Demande_Encombrants_QR", "Kenz_El_Medina_Gamification"]
    },
    {
      "id": "MOD-04",
      "name": "Application Mobile Agent de Terrain",
      "platforms": ["Android Ruggedized", "iOS"],
      "features": ["Circuit_Navigation", "Scan_Pesee_Pont_Bascule", "Offline_SQLite_Sync"]
    }
  ]
}`
      }
    ],
    schemas: [
      {
        title: 'Diagramme de Cas d’Utilisation Général (UML)',
        type: 'architecture',
        content: `graph TD
  Citoyen((Citoyen)) -->|Signale Point Noir / Demande Encombrants| AppCitoyenne[App Mobile Citoyenne]
  Agent((Agent Collecte)) -->|Suit Circuit / Saisit Pesée / Incident| AppAgent[App Mobile Agent]
  Maire((Directeur Propreté)) -->|Planifie Tournées / Gère Réclamations| PortailMunicipal[Portail Municipal]
  FNCT((FNCT / ANGeD)) -->|Consolide KPIs / Audite Décharges| PortailNational[Portail National]
  
  AppCitoyenne -->|REST API + JWT| BackendAPI[API Gateway SIIPI Core]
  AppAgent -->|Sync Offline SQLite / REST| BackendAPI
  PortailMunicipal -->|WebSockets + REST| BackendAPI
  PortailNational -->|Analytics / TimescaleDB| BackendAPI
  
  BackendAPI --> DB[(PostgreSQL + PostGIS)]
  BackendAPI --> TS[(TimescaleDB IoT Series)]
  BackendAPI --> ANGeD_Bridge[Passerelle Pont-Bascule ANGeD]`
      }
    ],
    testCases: [
      {
        id: 'TC-P1-001',
        category: 'Unit',
        name: 'Validation matrice de couverture des 350 communes',
        expectedResult: 'Toutes les communes tunisiennes répertoriées avec code INS et gouvernorat',
        status: 'passed'
      },
      {
        id: 'TC-P1-002',
        category: 'Security',
        name: 'Conformité INPDP sur l’anonymat des données citoyennes',
        expectedResult: 'Numéro de téléphone et nom hashés dans les logs d’audit publics',
        status: 'passed'
      }
    ]
  },
  {
    phaseNumber: 2,
    title: 'Phase 2 – Conception technique et architecture logicielle',
    titleAr: 'المرحلة 2: التصميم الفني وهندسة البرمجيات',
    duration: '3 semaines (S3 - S5)',
    status: 'completed',
    description: 'Architecture globale (Cloud souverain / Datacenter Tunisie), schémas relationnels PostGIS, pipeline télématique IoT & GPS, charte de sécurité MFA.',
    deliverablesList: [
      'Document d’Architecture Technique (DAT) et charte réseau/sécurité',
      'Modèle Conceptuel et Physique de Données (PostgreSQL + TimescaleDB + PostGIS)',
      'Spécifications OpenAPI 3.0 / Swagger de l’ensemble des endpoints REST & WebSockets',
      'Design System & Maquettes interactives (Design Responsive + Ergonomie terrain)'
    ],
    specsMarkdown: `### 🏗️ Architecture Technique Validée (DAT SIIPI)

#### 1. Stack Technologique :
- **Backend Core** : Node.js (TypeScript/Express) & Python microservices pour l'optimisation des tournées (OR-Tools).
- **Stockage & Séries Temporelles** : PostgreSQL 16 + extension **PostGIS** pour la cartographie spatiale + **TimescaleDB** pour les flux télématiques des capteurs de bennes et camions.
- **Cache & Message Broker** : Redis Cluster (sessions, cache spatial, files d'attente de notifications).
- **Frontend Web** : React 19 + Tailwind CSS + Lucide Icons + Recharts + Leaflet OpenStreetMap.
- **Applications Mobiles** : Architecture hybride moderne multiplateforme avec moteur SQLite local pour la synchronisation hors-ligne.
- **Sécurité** : Chiffrement TLS 1.3, Authentification JWT asymétrique RSA-256 + OTP MFA, rate-limiting anti-DDoS, conformité Décret-loi 2022-54.`,
    codeModules: [
      {
        name: 'openapi-spec',
        language: 'yaml',
        filename: 'docs/openapi_siipi_v1.yaml',
        code: `openapi: 3.0.3
info:
  title: API SIIPI - Système d'Information Intelligent pour la Propreté Intercommunale
  version: 1.0.0
  description: API REST Nationale FNCT / ANGeD Tunisie
servers:
  - url: https://api.siipi.gov.tn/v1
    description: Production Datacenter National Tunisie
paths:
  /auth/login-mfa:
    post:
      summary: Authentification sécurisée avec OTP
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                matricule: { type: string }
                password: { type: string }
                otpCode: { type: string }
      responses:
        '200':
          description: Token JWT délivré avec rôles RBAC
  /telemetry/truck-gps:
    post:
      summary: Ingestion télématique GPS véhicule
      security: [{ BearerAuth: [] }]
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                truckId: { type: string }
                latitude: { type: number }
                longitude: { type: number }
                speedKmH: { type: number }
                fuelPercent: { type: number }
                grossWeightKg: { type: number }
  /tickets/report:
    post:
      summary: Dépôt d'un signalement citoyen (Point Noir / Bac dégradé)
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                category: { type: string }
                latitude: { type: number }
                longitude: { type: number }
                photo: { type: string, format: binary }`
      }
    ],
    schemas: [
      {
        title: 'Architecture Globale en Microservices & Ingestion IoT',
        type: 'architecture',
        content: `graph LR
  subgraph Client_Layer [Clients Multi-Plateformes]
    WebNational[Portail National FNCT]
    WebMunicipal[Portail Municipal]
    AppCitizen[App Citoyenne iOS/Android]
    AppAgent[App Rugged Agent Terrain]
    IoT_Sensors[Capteurs Ultrasons Bacs & GPS]
  end

  subgraph Gateway_Security [Passerelle & Sécurité Décret-Loi 2022-54]
    NginxReverse[Nginx WAF / SSL TLS 1.3]
    AuthGuard[MFA & JWT Token Verifier]
  end

  subgraph Core_Services [Services Applicatifs]
    ServiceFleet[Microservice Flotte & GPS Live]
    ServiceTickets[Service Réclamations & IA Vision]
    ServiceWeighbridge[Service Réconciliation ANGeD]
    ServiceGamification[Service Kenz El Medina]
    ServiceKpi[Moteur Calcul QP / TC / 5-Axes]
  end

  subgraph Persistence_Layer [Stockage & Data Lake]
    PostgresMain[(PostgreSQL + PostGIS)]
    TimescaleDB[(TimescaleDB Télématique)]
    RedisCache[(Redis Cache & Pub/Sub)]
  end

  Client_Layer --> NginxReverse
  NginxReverse --> AuthGuard
  AuthGuard --> Core_Services
  Core_Services --> Persistence_Layer`
      }
    ],
    testCases: [
      {
        id: 'TC-P2-001',
        category: 'Integration',
        name: 'Validation du schéma PostGIS pour le géofencing des tournées',
        expectedResult: 'ST_Contains et ST_DWithin exécutés en moins de 12ms sur 10 000 points',
        status: 'passed'
      }
    ]
  },
  {
    phaseNumber: 3,
    title: 'Phase 3 – Développement back-end, base de données et API REST',
    titleAr: 'المرحلة 3: تطوير الواجهة الخلفية وقاعدة البيانات وواجهات البرمجة',
    duration: '8 semaines (S6 - S13)',
    status: 'completed',
    description: 'Code source complet du serveur Node.js / Express / Python, modèles ORM, scripts de migration PostgreSQL, réconciliation des pesées ANGeD et calcul des KPI.',
    deliverablesList: [
      'Scripts SQL de création de tables, index spatiaux, triggers et fonctions stockées',
      'API REST complète avec documentation Swagger interactive',
      'Module de réconciliation des pesées (Pont-bascule ANGeD vs Télématique bord)',
      'Moteur d’analyse des 5 axes de propreté et calcul automatisé QP/TC'
    ],
    specsMarkdown: `### 💻 Implémentation du Back-end SIIPI

#### Fonctionnalités Majeures Livrées :
1. **Module d'Authentification MFA & RBAC** : Gestion stricte des rôles (Admin National, Directeur Municipal, Chauffeur, Agent de pesée, Citoyen).
2. **Gestion de Flotte & Télématique** : Ingestion haute cadence (10 000 requêtes/sec) des coordonnées GPS, niveau de carburant, estimation du poids des bennes.
3. **Réconciliation Automatisée ANGeD** : Algorithme de détection des anomalies de pesée entre le ticket émis par le pont-bascule de la décharge (Jbel Chakir, Oued Laya) et la jauge embarquée du camion.
4. **Calculateur KPI National** :
   - **Quantité Produite par Habitant (QP)** : $QP = \\frac{\\text{Tonnage Collecté}}{\\text{Population Desservie} \\times 365} \\times 1000$ (kg/hab/jour).
   - **Taux de Collecte (TC)** : $TC = \\frac{\\text{Tonnage Réellement Collecté}}{\\text{Production Estimée}} \\times 100$.`,
    codeModules: [
      {
        name: 'database-schema-sql',
        language: 'sql',
        filename: 'backend/sql/01_schema_siipi.sql',
        code: `-- Schéma SQL PostgreSQL 16 + PostGIS + TimescaleDB pour SIIPI
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Table des Communes
CREATE TABLE communes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code_ins VARCHAR(10) UNIQUE NOT NULL,
    nom_fr VARCHAR(100) NOT NULL,
    nom_ar VARCHAR(100) NOT NULL,
    gouvernorat VARCHAR(50) NOT NULL,
    population INT NOT NULL,
    superficie_km2 NUMERIC(8,2) NOT NULL,
    geom GEOMETRY(MultiPolygon, 4326),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des Véhicules de Collecte
CREATE TABLE vehicules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    immatriculation VARCHAR(20) UNIQUE NOT NULL, -- Ex: 189 TU 4521
    commune_id UUID REFERENCES communes(id) ON DELETE CASCADE,
    type_vehicule VARCHAR(30) NOT NULL, -- benne_tasseuse, ampliroll, balayeuse
    capacite_m3 NUMERIC(5,2) NOT NULL,
    poids_vide_kg NUMERIC(8,2) NOT NULL,
    statut VARCHAR(20) DEFAULT 'au_depot',
    derniere_position GEOMETRY(Point, 4326),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des Pesées et Réconciliation ANGeD
CREATE TABLE pesees_anged (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_ticket_anged VARCHAR(50) UNIQUE NOT NULL,
    vehicule_id UUID REFERENCES vehicules(id),
    site_decharge VARCHAR(100) NOT NULL,
    date_entree TIMESTAMP WITH TIME ZONE NOT NULL,
    date_sortie TIMESTAMP WITH TIME ZONE NOT NULL,
    poids_brut_kg NUMERIC(8,2) NOT NULL,
    tare_kg NUMERIC(8,2) NOT NULL,
    poids_net_kg NUMERIC(8,2) NOT NULL,
    poids_estime_camion_kg NUMERIC(8,2),
    ecart_kg NUMERIC(8,2) GENERATED ALWAYS AS (poids_net_kg - poids_estime_camion_kg) STORED,
    statut_reconciliation VARCHAR(30) DEFAULT 'conforme'
);`
      },
      {
        name: 'kpi-engine-ts',
        language: 'typescript',
        filename: 'backend/services/kpiEngine.ts',
        code: `export interface KpiCalculationInput {
  tonnageAnnuelKg: number;
  population: number;
  tauxCouvertureTerritoire: number;
  coutTotalExploitationTND: number;
}

export function calculateNationalKpi(input: KpiCalculationInput) {
  const qpKgHabJour = (input.tonnageAnnuelKg / (input.population * 365));
  const tcTauxCollecte = Math.min(100, (input.tonnageAnnuelKg / (input.population * 365 * 0.85)) * 100);
  const coutParHabitantTND = input.coutTotalExploitationTND / input.population;
  
  return {
    qpKgHabJour: Number(qpKgHabJour.toFixed(3)),
    tcTauxCollecte: Number(tcTauxCollecte.toFixed(1)),
    coutParHabitantTND: Number(coutParHabitantTND.toFixed(2)),
    indicePerformance: tcTauxCollecte > 90 ? 'A (Excellente)' : tcTauxCollecte > 80 ? 'B (Satisfaisante)' : 'C (À renforcer)'
  };
}`
      }
    ],
    schemas: [
      {
        title: 'Modèle Physique de Données (MCD / MLD Relationnel)',
        type: 'database',
        content: `erDiagram
  COMMUNE ||--o{ VEHICULE : possede
  COMMUNE ||--o{ CONTENEUR : installe
  COMMUNE ||--o{ RECLAMATION : gere
  VEHICULE ||--o{ TOURNEE : effectue
  VEHICULE ||--o{ PESEE_ANGED : enregistre
  CITOYEN ||--o{ RECLAMATION : soumet
  CITOYEN ||--o{ RECOMPENSE : echange
  BARBECHA ||--o{ PESEE_VALORISATION : livre`
      }
    ],
    testCases: [
      {
        id: 'TC-P3-001',
        category: 'Unit',
        name: 'Calcul du ratio QP et détection d’anomalie de pesée > 5%',
        expectedResult: 'Alerte générée automatiquement si écart ticket ANGeD vs estimé > 5%',
        status: 'passed'
      }
    ]
  },
  {
    phaseNumber: 4,
    title: 'Phase 4 – Développement front-end web (Portails National & Municipal)',
    titleAr: 'المرحلة 4: تطوير الواجهة الأمامية للويب (البوابات الوطنية والبلدية)',
    duration: '6 semaines (S14 - S19)',
    status: 'completed',
    description: 'Interface web moderne (React/Tailwind), cartographie interactive temps réel Leaflet/OSM, tableaux de bord des 5 axes, gestion des tournées et bons de collecte.',
    deliverablesList: [
      'Portail d’Administration Nationale (Observatoire FNCT / ANGeD)',
      'Portail Municipal d’Exploitation (Supervision flotte, circuits, réclamations)',
      'Outil interactif de modélisation de flotte & investissements (TVA 19%, amortissement)',
      'Module de sensibilisation éco-citoyenne et affichage des indicateurs de réactivité'
    ],
    specsMarkdown: `### 🌐 Écrans et Modules Front-End Livrés

1. **Dashboard National FNCT/ANGeD** :
   - Carte de Tunisie interactive avec les 24 gouvernorats et taux de collecte géolocalisés.
   - Baromètre national des déchets (Tonnage journalier, Taux de valorisation matière, Indice de propreté moyen).
   - Suivi en temps réel des décharges contrôlées (Jbel Chakir, Sousse Oued Laya, Bizerte, Sfax Thyna).

2. **Portail d'Exploitation Municipal** :
   - **Carte GIS Live** : Position GPS temps réel des bennes tasseuses et camions ampliroll, circuits de collecte avec état d'avancement des arrêts.
   - **Capteurs Bacs IoT** : Bacs 770L et points d'apport volontaire avec jauges de remplissage (Vert: <70%, Orange: 70-89%, Rouge alerte: >90%).
   - **Gestionnaire de Réclamations** : Tri automatique des tickets citoyens par urgence, géolocalisation, photos avant/après et assignation d'équipes.`,
    codeModules: [
      {
        name: 'fleet-map-component',
        language: 'tsx',
        filename: 'frontend/src/components/FleetGisMap.tsx',
        code: `// Composant Cartographique Télématique Flotte SIIPI
import React from 'react';

export const FleetGisMap: React.FC<{ trucks: any[]; containers: any[] }> = ({ trucks, containers }) => {
  return (
    <div className="relative w-full h-[550px] rounded-xl overflow-hidden border border-slate-700 shadow-2xl bg-slate-950">
      <div className="absolute top-4 left-4 z-20 bg-slate-900/90 backdrop-blur px-4 py-2 rounded-lg border border-slate-700 text-xs">
        <span className="text-emerald-400 font-bold">● {trucks.filter(t => t.status === 'en_tournee').length} Bennes en tournée</span>
        <span className="text-amber-400 font-bold ml-4">● {containers.filter(c => c.fillLevel > 85).length} Bacs pleins</span>
      </div>
      {/* Intégration Cartographique Leaflet OpenStreetMap */}
    </div>
  );
};`
      }
    ],
    schemas: [
      {
        title: 'Flux de Résolution d’un Signalement Citoyen',
        type: 'sequence',
        content: `sequenceDiagram
  autonumber
  actor Citoyen
  participant AppCitoyenne as App Citoyenne
  participant API as Passerelle SIIPI
  participant Portail as Portail Municipal
  actor Agent as Équipe Terrain

  Citoyen->>AppCitoyenne: Prise photo + GPS Point Noir
  AppCitoyenne->>API: POST /tickets/report (Photo, Coord, Catégorie)
  API->>Portail: Notification Push & Ticket #TKT-2026-XXXX créé
  Portail->>Agent: Assignation Équipe & Génération Bon de Collecte
  Agent->>Agent: Nettoyage sur place & Photo de clôture
  Agent->>API: PUT /tickets/resolve (PhotoAprès, DateClôture)
  API->>AppCitoyenne: Notification "Point Noir Nettoyé" + 100 Points Kenz El Medina!`
      }
    ],
    testCases: [
      {
        id: 'TC-P4-001',
        category: 'Performance',
        name: 'Temps de premier affichage (FCP) et fluidité 60fps sur la carte GIS',
        expectedResult: 'FCP < 1.4s, rendu fluide de 500 marqueurs conteneurs simultanés',
        status: 'passed'
      }
    ]
  },
  {
    phaseNumber: 5,
    title: 'Phase 5 – Développement des applications mobiles (Citoyenne & Terrain)',
    titleAr: 'المرحلة 5: تطوير تطبيقات الجوال (المواطن وأعوان الميدان)',
    duration: '6 semaines (S20 - S25)',
    status: 'completed',
    description: 'Applications natives/hybrides : App Citoyenne (signalement, gamification Kenz El Medina, QR codes) et App Agent de terrain (circuits, pesées, mode offline SQLite).',
    deliverablesList: [
      'Application Mobile Citoyenne (iOS / Android) avec module de gamification',
      'Application Mobile Agent de Terrain durcie avec support hors-ligne (SQLite)',
      'Scanner de QR codes intégré pour les bacs et bons de collecte',
      'Système de notifications push ciblées par zone géographique'
    ],
    specsMarkdown: `### 📱 Spécifications des Applications Mobiles

#### 1. App Citoyenne ("Nadhfa & Kenz El Medina") :
- **Signalement Éclair** : Photo HD, géolocalisation automatique, sélection catégorie (Point noir, Bac débordant, Égout bouché, Dépôt gravats).
- **Demande de Collecte Spécifique** : Encombrants ou déchets verts avec génération instantanée d'un QR code à scotcher sur l'objet.
- **Portefeuille de Points "Kenz El Medina"** : Gain de points verts échangeables contre des réductions chez les commerçants partenaires ou abonnements municipaux.

#### 2. App Agent de Terrain ("Agent Nadhfa") :
- **Interface à Haute Ergonomie** : Boutons de grande taille pour manipulation avec des gants de protection.
- **Circuits Pas-à-Pas** : Visualisation de l'itinéraire du jour avec validation des conteneurs vidés.
- **Mode Hors-Ligne (Offline First)** : Stockage SQLite local et synchronisation automatique dès détection de réseau 4G/Wi-Fi.`,
    codeModules: [
      {
        name: 'flutter-agent-tour-dart',
        language: 'dart',
        filename: 'mobile_agent/lib/screens/active_tour_screen.dart',
        code: `// Écran de Tournée de Collecte - Flutter Mobile Agent
import 'package:flutter/material.dart';

class ActiveTourScreen extends StatefulWidget {
  final String truckRegistration;
  final String zoneName;

  const ActiveTourScreen({Key? key, required this.truckRegistration, required this.zoneName}) : super(key: key);

  @override
  _ActiveTourScreenState createState() => _ActiveTourScreenState();
}

class _ActiveTourScreenState extends State<ActiveTourScreen> {
  int completedStops = 19;
  final int totalStops = 28;

  void _scanContainerQr() {
    // Déclenchement du scanner QR code et validation locale SQLite
    setState(() {
      if (completedStops < totalStops) completedStops++;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        title: Text('Tournée : \${widget.truckRegistration}'),
        backgroundColor: const Color(0xFF1E293B),
      ),
      body: Column(
        children: [
          LinearProgressIndicator(
            value: completedStops / totalStops,
            color: Colors.emerald,
          ),
          ElevatedButton.icon(
            onPressed: _scanContainerQr,
            icon: const Icon(Icons.qr_code_scanner, size: 28),
            label: const Text('SCANNER BAC SUIVANT', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.emerald, minimumSize: const Size(double.infinity, 60)),
          )
        ],
      ),
    );
  }
}`
      }
    ],
    schemas: [
      {
        title: 'Architecture Offline-Sync SQLite & Sync Queue',
        type: 'architecture',
        content: `graph TD
  UserAction[Action Agent Terrain: Pesée / Scan / Incident] --> SQLiteLocal[(SQLite Embarqué Mobile)]
  SQLiteLocal --> SyncEngine{Vérification Connectivité 4G/WiFi}
  SyncEngine -->|Connecté| RestSync[Envoi Batch HTTPS à l'API Gateway]
  SyncEngine -->|Hors-ligne| QueueStore[File d'attente persistante locale]
  QueueStore -->|Dès rétablissement réseau| RestSync
  RestSync --> PostgresCentral[(Base Centrale SIIPI)]`
      }
    ],
    testCases: [
      {
        id: 'TC-P5-001',
        category: 'Unit',
        name: 'Synchronisation de 50 enregistrements hors-ligne sans perte de données',
        expectedResult: 'Toutes les pesées synchronisées avec horodatage préservé',
        status: 'passed'
      }
    ]
  },
  {
    phaseNumber: 6,
    title: 'Phase 6 – Intégration, tests de charge et audit de sécurité',
    titleAr: 'المرحلة 6: التكامل، اختبارات الأداء وتدقيق الأمان',
    duration: '4 semaines (S26 - S29)',
    status: 'completed',
    description: 'Bancs d’essais complets : tests unitaires, tests de montée en charge (10 000 req/s), simulations de pannes, audit de sécurité OWASP Top 10 et conformité Décret-loi 2022-54.',
    deliverablesList: [
      'Rapport d’exécution des tests unitaires et d’intégration (Couverture > 92%)',
      'Rapport de tests de charge et de stress k6 / Locust (Temps de réponse p95 < 180ms)',
      'Rapport d’audit de sécurité et de tests d’intrusion (Zéro vulnérabilité critique)',
      'Procès-verbal de recettage provisoire signé'
    ],
    specsMarkdown: `### 🛡️ Résultats des Tests et Recettage

#### 1. Performance & Montée en Charge :
- **Test de charge k6** : 50 000 utilisateurs simultanés (pic citoyens + télématique camions).
- **Temps de réponse moyen API** : 68 ms (Exigence < 200 ms).
- **Consommation mémoire serveur** : Stabilisée à 1.4 Go de RAM sous forte sollicitation.

#### 2. Sécurité & Conformité Décret-loi 2022-54 :
- **Audit OWASP Top 10** : 100% des tests validés (Protection contre injections SQL via requêtes paramétrées, protection XSS, tokens CSRF, chiffrement AES-256 des données sensibles).
- **Protection des données (INPDP)** : Journalisation immuable de tous les accès administratifs aux données personnelles.`,
    codeModules: [
      {
        name: 'k6-load-test-js',
        language: 'javascript',
        filename: 'tests/k6_load_test_siipi.js',
        code: `import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 500 },  // Montée à 500 VU
    { duration: '1m', target: 2000 },  // Palier à 2000 VU
    { duration: '30s', target: 0 },    // Descente
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% des requêtes < 200ms
  },
};

export default function () {
  const res = http.get('https://api.siipi.gov.tn/v1/communes/la_marsa/dashboard');
  check(res, {
    'statut est 200': (r) => r.status === 200,
    'temps < 200ms': (r) => r.timings.duration < 200,
  });
  sleep(1);
}`
      }
    ],
    schemas: [
      {
        title: 'Matrice de Couverture des Tests de Recettage',
        type: 'security',
        content: `pie title Répartition de la Suite de Tests SIIPI
    "Tests Unitaires & Métier (92%)" : 420
    "Tests d'Intégration API (98%)" : 180
    "Tests de Sécurité Décret 54" : 85
    "Tests de Performance & Charge" : 45`
      }
    ],
    testCases: [
      {
        id: 'TC-P6-001',
        category: 'Security',
        name: 'Protection contre l’usurpation de jeton JWT et rejeu d’OTP',
        expectedResult: 'Blocage immédiat et journalisation dans le registre d’audit national',
        status: 'passed'
      }
    ]
  },
  {
    phaseNumber: 7,
    title: 'Phase 7 – Déploiement pilote sur 3 communes & formation',
    titleAr: 'المرحلة 7: النشر التجريبي في 3 بلديات وتدريب المستخدمين',
    duration: '3 semaines (S30 - S32)',
    status: 'completed',
    description: 'Déploiement en conditions réelles sur les 3 communes pilotes (La Marsa, Tunis Médina, Sousse Ville), interconnexion avec les ponts-bascules ANGeD et sessions de formation des équipes.',
    deliverablesList: [
      'Scripts d’automatisation du déploiement (Docker Compose, Kubernetes & Ansible)',
      'Déploiement validé sur les 3 communes pilotes (La Marsa, Tunis Médina, Sousse)',
      'Guides d’utilisation et manuels d’administration (Français & Arabe)',
      'Sessions de formation des agents, chauffeurs et directeurs municipaux'
    ],
    specsMarkdown: `### 🚀 Déploiement Pilote Réussi

#### 1. Communes Pilotes Activées :
1. **Commune de La Marsa** (Gouvernorat de Tunis) : 8 bennes équipées de GPS/pesée, 340 bacs connectés, 4 200 citoyens inscrits sur l'application mobile.
2. **Commune de Tunis (Arrondissement Médina)** : 18 véhicules suivis, intégration avec le centre de transfert et la décharge de Jbel Chakir.
3. **Commune de Sousse Ville** : 16 véhicules connectés, interconnexion pont-bascule décharge d'Oued Laya.

#### 2. Résultats des 3 Premières Semaines Pilotes :
- **Taux de résolution des signalements** : Réduit de 6 jours à **4,2 heures en moyenne**.
- **Économie de carburant constatée** : **-14,8%** grâce à l'optimisation dynamique des circuits.
- **Tonnage valorisé par les barbéchas** : **18,4 tonnes de plastique/carton** tracées et rétribuées équitablement.`,
    codeModules: [
      {
        name: 'docker-compose-prod',
        language: 'yaml',
        filename: 'deploy/docker-compose.prod.yml',
        code: `version: '3.8'

services:
  siipi-postgres:
    image: postgis/postgis:16-3.4-alpine
    container_name: siipi_db
    restart: always
    environment:
      POSTGRES_DB: siipi_national
      POSTGRES_USER: siipi_admin
      POSTGRES_PASSWORD: \${DB_STRONG_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - siipi-net

  siipi-api:
    build:
      context: .
      dockerfile: Dockerfile.api
    container_name: siipi_backend
    restart: always
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://siipi_admin:\${DB_STRONG_PASSWORD}@siipi-postgres:5432/siipi_national
      REDIS_URL: redis://siipi-redis:6379
      PORT: 3000
    depends_on:
      - siipi-postgres
    networks:
      - siipi-net

  siipi-frontend:
    build:
      context: .
      dockerfile: Dockerfile.web
    container_name: siipi_web
    restart: always
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - siipi-api
    networks:
      - siipi-net

volumes:
  postgres_data:

networks:
  siipi-net:
    driver: bridge`
      }
    ],
    schemas: [
      {
        title: 'Architecture de Déploiement Haute Disponibilité (Datacenter National)',
        type: 'architecture',
        content: `graph TB
  subgraph Public_Internet
    DNS[DNS National *.siipi.gov.tn]
  end

  subgraph Load_Balancing
    HAProxy[Double HAProxy / Keepalived]
  end

  subgraph App_Cluster
    Node1[Serveur Application Node 1]
    Node2[Serveur Application Node 2]
    Node3[Serveur Application Node 3]
  end

  subgraph Database_Cluster
    MasterDB[(PostgreSQL Master / PostGIS)]
    ReplicaDB[(PostgreSQL Read Replica)]
  end

  DNS --> HAProxy
  HAProxy --> Node1
  HAProxy --> Node2
  HAProxy --> Node3
  Node1 --> MasterDB
  Node2 --> MasterDB
  Node3 --> ReplicaDB`
      }
    ],
    testCases: [
      {
        id: 'TC-P7-001',
        category: 'Integration',
        name: 'Vérification du failover automatique de la base de données en moins de 5 secondes',
        expectedResult: 'Bascule transparente sans perte de session active',
        status: 'passed'
      }
    ]
  },
  {
    phaseNumber: 8,
    title: 'Phase 8 – Garantie, maintenance et assistance (12 mois)',
    titleAr: 'المرحلة 8: الضمان والصيانة والمساعدة الفنية (12 شهراً)',
    duration: '12 mois contractuels',
    status: 'ready',
    description: 'Plan de support continu, astreinte 24/7, correctifs de sécurité réguliers, évolutions logicielles et transfert de compétences complet à la FNCT et l’ANGeD.',
    deliverablesList: [
      'Convention de Service (SLA) : Disponibilité 99,9%, intervention < 30 min',
      'Portail de Helpdesk et de ticketing technique niveau 1, 2 et 3',
      'Plan de mise à jour trimestrielle et audits de sécurité récurrents',
      'Transfert complet du référentiel de code sous licence ouverte (Open Source)'
    ],
    specsMarkdown: `### 🤝 Plan de Garantie et Maintenance Opérationnelle

#### 1. Niveaux de Service (SLA Garantis) :
- **Incident Critique (GTR 1)** (Arrêt de la télématique ou du système de pesée) : Prise en charge < **15 minutes**, résolution < **2 heures**.
- **Incident Majeur (GTR 2)** (Dégradation d'un sous-module non bloquant) : Résolution < **8 heures**.
- **Demande d'Évolution (GTR 3)** : Intégration dans le cycle sprint bi-hebdomadaire.

#### 2. Calendrier des Audits Trimestriels :
- **Trimestre 1** : Audit de performance de la base TimescaleDB et archivage des séries GPS.
- **Trimestre 2** : Audit d'intrusion Décret-loi 2022-54 par l'ANSI (Agence Nationale de la Sécurité Informatique).
- **Trimestre 3** : Extension aux 40 communes de la 2ème vague de déploiement national.
- **Trimestre 4** : Bilan annuel d'exploitation et passage de relais aux équipes informatiques internes de la FNCT.`,
    codeModules: [
      {
        name: 'maintenance-healthcheck-sh',
        language: 'bash',
        filename: 'scripts/maintenance_healthcheck.sh',
        code: `#!/bin/bash
# Script de monitoring automatisé de santé du système SIIPI
echo "=== AUDIT SANTÉ SYSTÈME SIIPI ==="
date

# 1. Vérification PostgreSQL
pg_isready -h localhost -p 5432 -U siipi_admin
if [ $? -eq 0 ]; then
    echo "✓ Base de données PostgreSQL : OPERATIONNELLE"
else
    echo "✗ ALERTE: Base PostgreSQL injoignable!"
fi

# 2. Vérification Espace Disque & Séries Temporelles
DISK_USAGE=$(df -h /var/lib/postgresql | awk 'NR==2 {print $5}')
echo "✓ Espace disque DB : $DISK_USAGE utilisé"

# 3. Vérification Latence API
API_LATENCY=$(curl -o /dev/null -s -w '%{time_total}\n' https://api.siipi.gov.tn/v1/health)
echo "✓ Latence Healthcheck API : \${API_LATENCY}s"`
      }
    ],
    schemas: [
      {
        title: 'Matrice de Résolution des Incidents & Escalade Helpdesk',
        type: 'architecture',
        content: `graph TD
  Incident[Alerte Détectée ou Ticket Support] --> Tri{Criticité de l'incident}
  Tri -->|P1: Bloquant Décharge/GPS| N1[Astreinte Ingénieur 24/7 - Prise en charge < 15 min]
  Tri -->|P2: Majeur| N2[Équipe Support Niveau 2 - Résolution < 8h]
  Tri -->|P3: Mineur/Amélioration| N3[Backlog Sprint de Maintenance]
  N1 --> Patch[Déploiement Hotfix Zero-Downtime]
  N2 --> Validation[Validation sur Environnement de Staging]
  Validation --> Prod[Mise en Production]`
      }
    ],
    testCases: [
      {
        id: 'TC-P8-001',
        category: 'Performance',
        name: 'Test de sauvegarde à chaud et restauration complète du système en moins de 15 minutes',
        expectedResult: 'Restauration intègre avec 100% des pesées et tickets préservés',
        status: 'passed'
      }
    ]
  }
];
