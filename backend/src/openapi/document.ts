// ============================================================================
// Contrat d'API SIIPI — document OpenAPI 3.1
//
// Le TDR (§4.2) fait de la documentation OpenAPI une exigence d'interopérabilité :
// c'est par ce contrat que dialogueront les ERP, GMAO, plateformes GPS et
// futurs modules, et c'est à partir de lui que le front-end sera écrit.
//
// Principe : la documentation IMPORTE les schémas de validation utilisés à
// l'exécution par les routes. Elle ne peut donc pas décrire un format
// différent de celui réellement contrôlé — contrairement à une documentation
// écrite à la main, qui se périme au premier changement de code.
//
// Ce qu'elle ne garantit pas toute seule : qu'aucune route n'a été oubliée.
// C'est le rôle de src/openapi/verifierContrat.ts (npm run verifier:contrat),
// qui compare ces chemins aux routes réellement montées par Express et échoue
// à la moindre différence.
// ============================================================================

import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { loginSchema } from '../routes/auth.routes.js';
import { communeUpdateSchema } from '../routes/communes.routes.js';
import { truckPositionSchema } from '../routes/trucks.routes.js';
import {
  ticketCreateSchema,
  ticketRefuseSchema,
  ticketAssignSchema,
  ticketTreatSchema,
} from '../routes/tickets.routes.js';
import { weighbridgeCreateSchema } from '../routes/weighbridge.routes.js';
import { citizenRegisterSchema } from '../routes/citizens.routes.js';
import { barbechaDeliverySchema } from '../routes/barbechas.routes.js';
import { nationalKpiSchema, fiveAxisSchema } from '../routes/kpi.routes.js';
import { zoneCreateSchema, zoneUpdateSchema } from '../routes/zones.routes.js';

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

// ---------------------------------------------------------------------------
// Authentification
// ---------------------------------------------------------------------------

const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description:
    "Jeton obtenu par POST /auth/login, à renvoyer dans l'en-tête Authorization. " +
    'Il porte le rôle et la commune de rattachement de son porteur : ce sont eux qui ' +
    'déterminent, en base, les données visibles (cloisonnement RLS).',
});

const SECURISE = [{ [bearerAuth.name]: [] }];

// ---------------------------------------------------------------------------
// Schémas partagés
// ---------------------------------------------------------------------------

const Erreur = registry.register(
  'Erreur',
  z
    .object({
      error: z.string().openapi({ example: 'Accès refusé pour ce rôle.' }),
      details: z.any().optional().openapi({ description: 'Détail des champs invalides (erreurs 400).' }),
    })
    .openapi('Erreur')
);

const Role = z
  .enum(['super_admin_fnct', 'admin_commune', 'gestionnaire_prestataire', 'citoyen'])
  .openapi({
    description:
      'Rôle RBAC officiel (TDR §5, matrice de permissions). Détermine le périmètre de données accessible.',
  });

const Utilisateur = registry.register(
  'Utilisateur',
  z
    .object({
      id: z.string().uuid(),
      email: z.string().email(),
      fullName: z.string(),
      role: Role,
      communeId: z.string().nullable().openapi({
        description: "Commune de rattachement. null pour la FNCT et pour les citoyens.",
        example: 'tunis_la_marsa',
      }),
    })
    .openapi('Utilisateur')
);

const Commune = registry.register(
  'Commune',
  z
    .object({
      id: z.string().openapi({ example: 'tunis_la_marsa' }),
      name: z.string().openapi({ example: 'La Marsa' }),
      name_ar: z.string().nullable().openapi({ example: 'المرسى' }),
      gouvernorat: z.string().openapi({ example: 'Tunis' }),
      population: z.number().int(),
      area_km2: z.number().nullable(),
      waste_tons_per_day: z.number().nullable(),
      collection_rate: z.number().nullable(),
      cleanliness_index: z.number().nullable(),
      is_pilot: z.boolean().openapi({ description: 'Commune pilote du MVP (TDR §1.2).' }),
      has_pcgd: z.boolean().nullable(),
      pcgd_status: z.string().nullable(),
      lat: z.number().nullable(),
      lng: z.number().nullable(),
    })
    .passthrough()
    .openapi('Commune')
);

const StatistiquesNationales = registry.register(
  'StatistiquesNationales',
  z
    .object({
      total_communes: z.number().int().openapi({ example: 350 }),
      with_pcgd_valid: z.number().int(),
      in_progress_pcgd: z.number().int(),
      total_population: z.string(),
      total_waste_daily_tons: z.string(),
      total_governorates: z.number().int().openapi({ example: 24 }),
    })
    .openapi('StatistiquesNationales')
);

const Reclamation = registry.register(
  'Reclamation',
  z
    .object({
      id: z.string().uuid(),
      ticket_number: z.string().openapi({ example: 'TKT-2026-4063' }),
      commune_id: z.string(),
      category: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      status: z
        .enum(['recu', 'en_cours', 'assigne', 'resolu', 'refuse'])
        .openapi({ description: 'Étapes du workflow de traitement (TDR §5.1).' }),
      priority: z.string(),
      citizen_name: z.string().nullable(),
      citizen_phone: z.string().nullable(),
      lat: z.number().nullable(),
      lng: z.number().nullable(),
      photo_url: z.string().nullable(),
      assigned_prestataire_id: z.string().uuid().nullable(),
      rejection_reason: z.string().nullable(),
      created_at: z.string(),
    })
    .passthrough()
    .openapi('Reclamation')
);

const Vehicule = registry.register(
  'Vehicule',
  z
    .object({
      id: z.string(),
      registration: z.string(),
      commune_id: z.string(),
      type: z.string(),
      status: z.string(),
      lat: z.number().nullable(),
      lng: z.number().nullable(),
      zone_id: z.string().uuid().nullable(),
    })
    .passthrough()
    .openapi('Vehicule')
);

const Conteneur = registry.register(
  'Conteneur',
  z.object({ id: z.string(), commune_id: z.string(), fill_level: z.number().nullable() })
    .passthrough()
    .openapi('Conteneur')
);

const Pesee = registry.register(
  'Pesee',
  z
    .object({
      id: z.string().uuid(),
      ticket_number_anged: z.string(),
      commune_id: z.string(),
      landfill_site: z.string(),
      net_weight_kg: z.number(),
      anomaly_detected: z.boolean().nullable().openapi({
        description: "Écart entre l'estimation embarquée et la pesée ANGeD, détecté par la base.",
      }),
    })
    .passthrough()
    .openapi('Pesee')
);

const Zone = registry.register(
  'ZoneDeCollecte',
  z
    .object({
      id: z.string().uuid(),
      commune_id: z.string(),
      name: z.string(),
      code: z.string().nullable(),
      color: z.string().nullable(),
      status: z.string(),
      assigned_prestataire_id: z.string().uuid().nullable(),
      assigned_prestataire_name: z.string().nullable(),
      geometry: z.any().openapi({ description: 'Géométrie GeoJSON (Polygon ou MultiPolygon), WGS 84.' }),
    })
    .passthrough()
    .openapi('ZoneDeCollecte')
);

const ResultatKpiNational = registry.register(
  'ResultatKpiNational',
  z
    .object({
      qpKgHabJour: z.number().openapi({ description: 'Production spécifique, en kg par habitant et par jour.' }),
      tcTauxCollecte: z.number().openapi({ description: 'Taux de collecte, en %.' }),
      coutParHabitantTND: z.number().nullable(),
      indicePerformance: z.enum(['A (Excellente)', 'B (Satisfaisante)', 'C (À renforcer)']),
    })
    .openapi('ResultatKpiNational')
);

const ScoreCinqAxes = registry.register(
  'ScoreCinqAxes',
  z
    .object({
      id: z.string().uuid(),
      commune_id: z.string(),
      efficacite_operationnelle: z.string(),
      qualite_service: z.string(),
      performance_environnementale: z.string(),
      performance_economique: z.string(),
      securite_rh: z.string(),
      overall_score: z.string(),
      computed_at: z.string(),
    })
    .passthrough()
    .openapi('ScoreCinqAxes')
);

const Barbecha = registry.register(
  'Barbecha',
  z.object({ id: z.string().uuid(), commune_id: z.string().nullable() }).passthrough().openapi('Barbecha')
);

// ---------------------------------------------------------------------------
// Réponses réutilisables
// ---------------------------------------------------------------------------

const json = (schema: any, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

const REPONSES_COMMUNES = {
  400: json(Erreur, 'Requête invalide — le détail indique les champs en cause.'),
  401: json(Erreur, 'Authentification requise, ou jeton expiré.'),
  403: json(Erreur, 'Rôle insuffisant, ou action hors du périmètre de votre commune.'),
  404: json(Erreur, 'Ressource introuvable — ou hors de votre périmètre : le cloisonnement ne révèle pas son existence.'),
};

const paramCommuneId = z.string().openapi({
  param: { name: 'communeId', in: 'query' },
  example: 'tunis_la_marsa',
  description: 'Commune concernée. Par défaut, celle de rattachement de l’utilisateur connecté.',
});

// ---------------------------------------------------------------------------
// Chemins
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Supervision'],
  summary: "État de santé de l'API",
  description: "Sans authentification. Utilisé par Docker et par la supervision du serveur.",
  responses: {
    200: json(z.object({ status: z.literal('ok'), database: z.literal('connected') }), 'API et base disponibles.'),
    503: json(z.object({ status: z.literal('degraded'), database: z.literal('unreachable') }), 'Base injoignable.'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/openapi.json',
  tags: ['Supervision'],
  summary: 'Contrat d’API au format OpenAPI 3.1',
  description:
    'Sans authentification. Sert à générer un client typé ou à configurer un intégrateur (TDR §4.2).',
  responses: { 200: json(z.any(), 'Document OpenAPI.') },
});

registry.registerPath({
  method: 'get',
  path: '/docs/init.js',
  tags: ['Supervision'],
  summary: 'Script d’initialisation de la documentation',
  description: 'Détail d’implémentation de la page /docs. Sans intérêt pour un intégrateur.',
  responses: { 200: { description: 'JavaScript.' } },
});

registry.registerPath({
  method: 'get',
  path: '/docs',
  tags: ['Supervision'],
  summary: 'Documentation interactive',
  description:
    'Interface de lecture et d’essai du contrat, servie par la plateforme elle-même : aucune ressource externe, la documentation reste consultable sur un réseau fermé.',
  responses: { 200: { description: 'Page HTML.' } },
});

// --- Authentification ------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/auth/login',
  tags: ['Authentification'],
  summary: 'Se connecter',
  description:
    'Renvoie un jeton JWT valable 8 heures. Limité à 20 tentatives par quart d’heure et par adresse IP.',
  request: { body: { content: { 'application/json': { schema: loginSchema } } } },
  responses: {
    200: json(z.object({ token: z.string(), user: Utilisateur }), 'Connexion réussie.'),
    401: json(Erreur, 'Identifiants incorrects — message identique que l’email soit inconnu ou le mot de passe faux.'),
    429: json(Erreur, 'Trop de tentatives.'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/auth/me',
  tags: ['Authentification'],
  summary: 'Profil de l’utilisateur connecté',
  description: 'Permet au client de restaurer une session à partir d’un jeton conservé.',
  security: SECURISE,
  responses: { 200: json(Utilisateur, 'Profil.'), 401: REPONSES_COMMUNES[401] },
});

// --- Communes --------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/communes',
  tags: ['Communes'],
  summary: 'Annuaire des 350 communes',
  description:
    'Visible par tout utilisateur authentifié, quelle que soit sa commune : le TDR en fait un référentiel national partagé, support de la comparaison entre communes.',
  security: SECURISE,
  responses: { 200: json(z.array(Commune), 'Les 350 communes.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'get',
  path: '/communes/stats',
  tags: ['Communes'],
  summary: 'Agrégats nationaux',
  description: 'Population, tonnage journalier, couverture PCGD — pour le tableau de bord national (TDR §3.1.3).',
  security: SECURISE,
  responses: { 200: json(StatistiquesNationales, 'Agrégats.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'get',
  path: '/communes/boundaries',
  tags: ['Communes'],
  summary: 'Frontières communales (GeoJSON)',
  description: 'Contours réels des communes, pour la cartographie nationale. Réponse volumineuse (~1 Mo).',
  security: SECURISE,
  responses: { 200: json(z.any(), 'FeatureCollection GeoJSON.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'get',
  path: '/communes/{id}',
  tags: ['Communes'],
  summary: 'Fiche d’une commune',
  security: SECURISE,
  request: { params: z.object({ id: z.string().openapi({ example: 'tunis_la_marsa' }) }) },
  responses: { 200: json(Commune, 'Fiche.'), 401: REPONSES_COMMUNES[401], 404: REPONSES_COMMUNES[404] },
});

registry.registerPath({
  method: 'get',
  path: '/communes/{id}/boundary',
  tags: ['Communes'],
  summary: 'Frontière d’une commune (GeoJSON)',
  security: SECURISE,
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: json(z.any(), 'Géométrie GeoJSON.'), 401: REPONSES_COMMUNES[401], 404: REPONSES_COMMUNES[404] },
});

registry.registerPath({
  method: 'get',
  path: '/communes/{id}/prestataires',
  tags: ['Communes'],
  summary: 'Prestataires privés opérant dans la commune',
  description: 'Sert à choisir le destinataire d’un transfert de réclamation (TDR §5.1.4).',
  security: SECURISE,
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: json(z.array(Utilisateur), 'Prestataires.'), 401: REPONSES_COMMUNES[401], 403: REPONSES_COMMUNES[403] },
});

registry.registerPath({
  method: 'patch',
  path: '/communes/{id}',
  tags: ['Communes'],
  summary: 'Mettre à jour la fiche d’une commune',
  description:
    'Réservé à l’Admin Commune pour SA commune, et à la FNCT partout. Toute modification est journalisée (auteur, horodatage, valeur avant/après).',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: communeUpdateSchema } } },
  },
  responses: { 200: json(Commune, 'Fiche mise à jour.'), ...REPONSES_COMMUNES },
});

// --- Flotte ----------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/trucks',
  tags: ['Flotte'],
  summary: 'Engins de collecte',
  description:
    'Cloisonné : la commune voit sa flotte, la FNCT voit tout, et un prestataire privé ne voit que les engins affectés à ses zones (TDR §3.2.11).',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: { 200: json(z.array(Vehicule), 'Engins visibles.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'patch',
  path: '/trucks/{id}/position',
  tags: ['Flotte'],
  summary: 'Remonter la position d’un engin',
  description:
    'Point d’entrée télématique (TDR §3.2.2, B2.5). Ces remontées sont volontairement exclues du journal d’audit : elles arrivent en continu et n’ont pas de valeur probante.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: truckPositionSchema } } },
  },
  responses: { 200: json(Vehicule, 'Position enregistrée.'), ...REPONSES_COMMUNES },
});

// --- Conteneurs ------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/containers',
  tags: ['Conteneurs'],
  summary: 'Conteneurs et points d’apport',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: { 200: json(z.array(Conteneur), 'Conteneurs visibles.'), 401: REPONSES_COMMUNES[401] },
});

// --- Réclamations ----------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/tickets',
  tags: ['Réclamations'],
  summary: 'Réclamations',
  description:
    'Le citoyen voit les siennes, la commune celles de son territoire, le prestataire uniquement celles qui lui ont été transférées (?assignedToMe=true). Toute consultation par un agent est journalisée : les réclamations portent le nom et le téléphone déclarés par le citoyen.',
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      assignedToMe: z.enum(['true', 'false']).optional().openapi({
        param: { name: 'assignedToMe', in: 'query' },
        description: 'Réservé au Gestionnaire Prestataire : seulement les réclamations qui lui sont transférées.',
      }),
    }),
  },
  responses: { 200: json(z.array(Reclamation), 'Réclamations visibles.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'post',
  path: '/tickets',
  tags: ['Réclamations'],
  summary: 'Déposer une réclamation',
  description: 'Réservé au citoyen (application mobile, TDR §3.3 M4). Le statut initial est « recu ».',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: ticketCreateSchema } } } },
  responses: { 201: json(Reclamation, 'Réclamation créée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/tickets/{id}/accept',
  tags: ['Réclamations'],
  summary: 'Accepter une réclamation',
  description: 'Étape 1 du workflow (TDR §5.1.2). Réservé à l’Admin Commune. Statut : recu → en_cours.',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: json(Reclamation, 'Réclamation acceptée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/tickets/{id}/refuse',
  tags: ['Réclamations'],
  summary: 'Refuser une réclamation',
  description: 'Le motif est obligatoire et communiqué au citoyen (TDR §5.1.2).',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: ticketRefuseSchema } } },
  },
  responses: { 200: json(Reclamation, 'Réclamation refusée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/tickets/{id}/assign',
  tags: ['Réclamations'],
  summary: 'Transférer à un prestataire privé',
  description:
    'TDR §5.1.4. Le prestataire pourra traiter la réclamation mais jamais la refuser. Statut : → assigne.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: ticketAssignSchema } } },
  },
  responses: { 200: json(Reclamation, 'Réclamation transférée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/tickets/{id}/treat',
  tags: ['Réclamations'],
  summary: 'Traiter une réclamation',
  description:
    'Photo « après traitement » et passage en resolu (TDR §5.1.3). Accessible à la commune et au prestataire à qui elle a été transférée.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: ticketTreatSchema } } },
  },
  responses: { 200: json(Reclamation, 'Réclamation traitée.'), ...REPONSES_COMMUNES },
});

// --- Pesées ----------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/weighbridge',
  tags: ['Pesées'],
  summary: 'Registre des pesées',
  description: 'Registre numérique conforme au décret (TDR §3.2.4, B4.5). Aucune ligne n’est jamais effacée.',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: { 200: json(z.array(Pesee), 'Pesées visibles.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'post',
  path: '/weighbridge',
  tags: ['Pesées'],
  summary: 'Enregistrer une pesée',
  description:
    'Le poids net et l’écart avec l’estimation embarquée sont calculés par la base, jamais fournis par le client.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: weighbridgeCreateSchema } } } },
  responses: { 201: json(Pesee, 'Pesée enregistrée.'), ...REPONSES_COMMUNES },
});

// --- Citoyens --------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/citizens/register',
  tags: ['Citoyens'],
  summary: 'Inscription à l’application citoyenne',
  description:
    'Sans authentification, limité à 20 inscriptions par quart d’heure et par adresse IP. Le TDR prévoit à terme une inscription par téléphone et code à usage unique (§3.3 M1).',
  request: { body: { content: { 'application/json': { schema: citizenRegisterSchema } } } },
  responses: {
    201: json(z.object({ user_id: z.string().uuid(), citizen_id: z.string().uuid(), email: z.string(), full_name: z.string() }), 'Compte créé.'),
    400: REPONSES_COMMUNES[400],
    409: json(Erreur, 'Un compte existe déjà avec cet email.'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/citizens/me',
  tags: ['Citoyens'],
  summary: 'Profil citoyen (points, badges, récompenses)',
  security: SECURISE,
  responses: {
    200: json(z.object({ id: z.string().uuid(), points: z.number().int() }).passthrough(), 'Profil citoyen.'),
    401: REPONSES_COMMUNES[401],
    403: REPONSES_COMMUNES[403],
  },
});

// --- GDMA / Barbéchas ------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/barbechas',
  tags: ['GDMA'],
  summary: 'Récupérateurs informels recensés',
  description:
    'Module hérité du prototype, absent du TDR officiel : son maintien dans le périmètre reste à arbitrer avec la FNCT.',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: { 200: json(z.array(Barbecha), 'Récupérateurs visibles.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'get',
  path: '/barbechas/{id}/deliveries',
  tags: ['GDMA'],
  summary: 'Apports d’un récupérateur',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: json(z.array(z.any()), 'Apports.'), 401: REPONSES_COMMUNES[401], 404: REPONSES_COMMUNES[404] },
});

registry.registerPath({
  method: 'post',
  path: '/barbechas/{id}/deliveries',
  tags: ['GDMA'],
  summary: 'Enregistrer un apport de matière triée',
  description: 'Le montant dû est calculé côté serveur à partir du barème, jamais transmis par le client.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: barbechaDeliverySchema } } },
  },
  responses: { 201: json(z.any(), 'Apport enregistré.'), ...REPONSES_COMMUNES },
});

// --- Indicateurs -----------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/kpi/national',
  tags: ['Indicateurs'],
  summary: 'Calculer les indicateurs nationaux',
  description:
    'Production spécifique, taux de collecte, coût par habitant. Calcul serveur (TDR §3.2.10, Axes 1 et 4).',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: nationalKpiSchema } } } },
  responses: { 200: json(ResultatKpiNational, 'Indicateurs calculés.'), 400: REPONSES_COMMUNES[400], 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'post',
  path: '/kpi/five-axis',
  tags: ['Indicateurs'],
  summary: 'Enregistrer une évaluation « 5 Axes »',
  description:
    'Les 5 axes officiels du TDR §3.2.10. Une commune ne peut noter qu’elle-même : la base refuse toute évaluation portant sur une autre commune.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: fiveAxisSchema } } } },
  responses: { 201: json(ScoreCinqAxes, 'Évaluation enregistrée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/kpi/five-axis/{communeId}',
  tags: ['Indicateurs'],
  summary: 'Dernière évaluation « 5 Axes » d’une commune',
  description:
    'Consultable par toutes les communes authentifiées : c’est le support de l’émulation entre communes voulue par la FNCT.',
  security: SECURISE,
  request: { params: z.object({ communeId: z.string() }) },
  responses: { 200: json(ScoreCinqAxes, 'Évaluation.'), 401: REPONSES_COMMUNES[401], 404: REPONSES_COMMUNES[404] },
});

// --- Découpage communal ----------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/zones',
  tags: ['Découpage communal'],
  summary: 'Secteurs de collecte d’une commune',
  description: 'TDR §3.2.8. Visible par la commune et par les prestataires y opérant, pas par les citoyens.',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: { 200: json(z.array(Zone), 'Secteurs.'), 400: REPONSES_COMMUNES[400], 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'get',
  path: '/zones/{id}',
  tags: ['Découpage communal'],
  summary: 'Un secteur de collecte',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: json(Zone, 'Secteur.'), 401: REPONSES_COMMUNES[401], 404: REPONSES_COMMUNES[404] },
});

registry.registerPath({
  method: 'post',
  path: '/zones',
  tags: ['Découpage communal'],
  summary: 'Créer un secteur de collecte',
  description: 'Géométrie GeoJSON en WGS 84. Réservé à l’Admin Commune pour sa commune, et à la FNCT.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: zoneCreateSchema } } } },
  responses: { 201: json(Zone, 'Secteur créé.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/zones/{id}',
  tags: ['Découpage communal'],
  summary: 'Modifier un secteur de collecte',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: zoneUpdateSchema } } },
  },
  responses: { 200: json(Zone, 'Secteur modifié.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/zones/{id}',
  tags: ['Découpage communal'],
  summary: 'Supprimer un secteur de collecte',
  description:
    'Suppression logique : le secteur disparaît des écrans mais reste conservé et restaurable, conformément à l’exigence d’historique du TDR (§3.2.8, C2.6).',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Secteur supprimé.' }, ...REPONSES_COMMUNES },
});

// ---------------------------------------------------------------------------
// Génération
// ---------------------------------------------------------------------------

export function genererDocumentOpenApi() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: "API du Système d'Information Intelligent pour la Propreté Intercommunale",
      version: '0.1.0',
      description: [
        "API de la plateforme nationale de gestion des déchets ménagers et assimilés,",
        'portée par la Fédération Nationale des Communes Tunisiennes (FNCT) à travers le',
        'réseau WAMA-NET, en lien avec l’ANGeD.',
        '',
        '### Ce que ce contrat ne montre pas',
        '',
        "Le périmètre de données n'est pas défini par les routes mais par la base elle-même",
        '(Row-Level Security). Deux utilisateurs appelant exactement la même URL reçoivent',
        'des réponses différentes selon leur rôle et leur commune de rattachement. Une réponse',
        'vide ou un 404 signifient donc souvent « hors de votre périmètre » plutôt que',
        '« inexistant » — et c’est volontaire : le cloisonnement ne révèle pas ce qui existe',
        'ailleurs.',
        '',
        '### Journalisation',
        '',
        'Toute écriture est tracée en base (auteur, horodatage, valeur avant/après) et',
        'conservée cinq ans. Les consultations de données personnelles de citoyens sont',
        'tracées séparément, conformément au décret-loi n° 2022-54.',
      ].join('\n'),
      contact: { name: 'FNCT — réseau WAMA-NET' },
    },
    servers: [
      { url: 'http://localhost:4000', description: 'Développement local' },
      { url: '/api', description: 'Déploiement derrière un reverse proxy' },
    ],
    tags: [
      { name: 'Authentification', description: 'Connexion et session.' },
      { name: 'Communes', description: 'Référentiel national des 350 communes.' },
      { name: 'Réclamations', description: 'Signalements citoyens et leur instruction (TDR §5.1).' },
      { name: 'Découpage communal', description: 'Secteurs de collecte (TDR §3.2.8).' },
      { name: 'Flotte', description: 'Engins et télématique (TDR §3.2.2).' },
      { name: 'Conteneurs', description: "Conteneurs et points d'apport volontaire." },
      { name: 'Pesées', description: 'Registre des pesées ANGeD (TDR §3.2.4).' },
      { name: 'Indicateurs', description: 'KPI nationaux et évaluation 5 Axes (TDR §3.2.10).' },
      { name: 'Citoyens', description: 'Comptes et profils de l’application citoyenne.' },
      { name: 'GDMA', description: 'Récupérateurs informels — périmètre à arbitrer.' },
      { name: 'Supervision', description: "État de santé de l'API." },
    ],
  });
}
