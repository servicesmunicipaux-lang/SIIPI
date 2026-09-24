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
import { provenanceSchema } from '../routes/observatoire.routes.js';
import {
  circuitCreateSchema,
  circuitUpdateSchema,
  controleSchema,
} from '../routes/circuits.routes.js';
import {
  passageSchema,
  incidentSchema,
  reponseIncidentSchema,
} from '../routes/passages.routes.js';
import {
  adresseSchema,
  annonceSchema,
  majAnnonceSchema,
  photoSchema,
  souscriptionSchema,
} from '../routes/citoyen.routes.js';
import { frontiereSchema } from '../routes/communes.routes.js';
import { fichierDepotSchema } from '../routes/fichiers.routes.js';
import { rapportEtudeDepotSchema } from '../routes/rapportsEtudes.routes.js';
import {
  propositionSchema as pointSuggereSchema,
  validationSchema as pointSuggereValidationSchema,
  refusSchema as pointSuggereRefusSchema,
} from '../routes/pointsSuggeres.routes.js';
import {
  collecteurSchema,
  majCollecteurSchema,
  demandeSchema,
  reponseSchema,
} from '../routes/enlevements.routes.js';

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
        description:
          "Commune de rattachement. null pour la FNCT — qui accède à toutes les communes — et pour les citoyens.",
        example: 'tunis_la_marsa',
      }),
      motDePasseProvisoire: z.boolean().openapi({
        description:
          "Vrai tant que le mot de passe fixé par un tiers n'a pas été remplacé. L'application barre l'accès au reste jusque-là : autrement, celui qui l'a fixé resterait en mesure d'agir au nom de son porteur.",
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
      // 'rejete' et non 'refuse' : c'est la valeur réellement stockée (la
      // route s'appelle /refuse, le statut qu'elle pose s'appelle 'rejete').
      // Le contrat annonçait l'autre, si bien qu'un client généré depuis ce
      // document n'aurait jamais reconnu une réclamation refusée.
      status: z
        .enum(['recu', 'en_cours', 'assigne', 'resolu', 'rejete'])
        .openapi({ description: 'Étapes du workflow de traitement (TDR §5.1).' }),
      priority: z.string(),
      citizen_name: z.string().nullable(),
      citizen_phone: z.string().nullable(),
      location_name: z.string().nullable(),
      lat: z.number().nullable(),
      lng: z.number().nullable(),
      photo_url: z.string().nullable(),
      photo_publique: z.boolean().openapi({
        description: 'Photo vérifiée par la commune et publiable sur la carte citoyenne.',
      }),
      resolved_photo_url: z.string().nullable(),
      assigned_prestataire_id: z.string().uuid().nullable(),
      rejection_reason: z.string().nullable(),
      resolved_at: z.string().nullable(),
      created_at: z.string(),
      notification_id: z.string().uuid().nullable().optional().openapi({
        description:
          'Dernière notification de décision envoyée au citoyen pour ce ticket (M6), s’il en existe une. Sert à afficher « Renvoyer » sur un échec.',
      }),
      notification_statut: z
        .enum(['livre', 'echec', 'non_abonne', 'non_souhaite', 'sans_souscription'])
        .nullable()
        .optional(),
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
      status: z.string().openapi({
        description:
          "Où il se trouve : en_tournee | au_depot | en_decharge | en_maintenance. Ce n'est PAS son état de marche — un engin en panne depuis huit mois est « au dépôt » comme celui qui repart demain.",
      }),
      etat: z.enum(['en_service', 'en_panne', 'a_reformer', 'reforme']).openapi({
        description:
          "S'il peut servir. Distinct de « status ». « a_reformer » n'est pas « en_panne » : le premier ne reviendra pas.",
      }),
      etat_depuis: z.string().nullable().openapi({
        description: "Depuis quand. Vide tant que la commune ne l'a pas renseigné : un inventaire ne dit pas l'ancienneté d'une panne.",
      }),
      motif_immobilisation: z.string().nullable().openapi({
        description:
          "Ce qui bloque, tel que le magasin l'écrit. Un parc immobilisé faute de marché conclu n'est pas un parc mal entretenu.",
      }),
      categorie: z.enum(['poids_lourd', 'engin_lourd', 'tracteur', 'remorque']).nullable(),
      marque: z.string().nullable(),
      date_premiere_circulation: z.string().nullable(),
      age_annees: z.number().int().nullable(),
      valeur_achat_tnd: z.number().nullable(),
      charge_utile_t: z.number().nullable(),
      domaine_emploi: z.string().nullable(),
      inventaire_le: z.string().nullable().openapi({
        description: "Date de l'inventaire dont provient la ligne. Un état du parc sans date ne vaut rien six mois plus tard.",
      }),
      attele_a: z.string().nullable().openapi({
        description: "Tracteur auquel cette remorque est attelée : l'unité de travail est l'attelage, pas le tracteur seul.",
      }),
      attele_a_immat: z.string().nullable(),
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

/**
 * Un écart constaté, quel qu'en soit le domaine.
 *
 * Déclaré une fois et partagé : la liste des domaines s'allonge à chaque
 * module (circuits et parc en 033, personnel en 034, communication en 035).
 * Répétée en ligne à chaque route, elle se périmait en silence — le
 * vérificateur de contrat compare les chemins servis, pas la forme des
 * réponses, et n'aurait rien dit.
 */
const Incoherence = registry.register(
  'Incoherence',
  z.object({
    gravite: z.enum(['bloquant', 'avertissement', 'information']),
    domaine: z.enum(['circuits', 'parc', 'personnel', 'communication', 'pesees']),
    sujet: z.string(),
    sujet_id: z.string(),
    constat: z.string().openapi({ description: 'Ce qui a été vu.' }),
    quoi_faire: z.string().openapi({ description: "Ce qu'il y a à faire — pas une injonction." }),
  })
);

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


const EtatDuParc = registry.register(
  'EtatDuParc',
  z
    .object({
      commune_id: z.string().nullable(),
      total: z.number().int(),
      en_service: z.number().int(),
      en_panne: z.number().int(),
      a_reformer: z.number().int(),
      reforme: z.number().int(),
      remorques: z.number().int(),
      taux_disponibilite: z.number().nullable().openapi({
        description:
          "Part des engins en service, remorques exclues : une remorque n'a pas de moteur à tomber en panne et suit l'état de son tracteur.",
      }),
      age_moyen_annees: z.number().nullable(),
      valeur_parc_tnd: z.number().nullable(),
      immobilises_sans_motif: z.number().int().openapi({
        description:
          "Engins à l'arrêt dont personne n'a écrit pourquoi. Les compter rend l'oubli visible : un engin sans motif est un engin que personne ne réparera.",
      }),
      inventaire_le: z.string().nullable().openapi({
        description:
          "Date du dernier inventaire. Un état du parc lu sans savoir de quand il date se prend pour l'état d'aujourd'hui, et l'on décide sur des pannes réparées depuis six mois.",
      }),
    })
    .passthrough()
    .openapi('EtatDuParc')
);

const vehiculeSchemaDoc = z.object({
  registration: z.string(),
  type: z.string(),
  categorie: z.enum(['poids_lourd', 'engin_lourd', 'tracteur', 'remorque']).nullable().optional(),
  marque: z.string().nullable().optional(),
  datePremiereCirculation: z.string().nullable().optional(),
  valeurAchatTnd: z.number().nullable().optional(),
  chargeUtileT: z.number().nullable().optional(),
  capacityM3: z.number().nullable().optional(),
  domaineEmploi: z.string().nullable().optional(),
  etat: z.enum(['en_service', 'en_panne', 'a_reformer', 'reforme']).optional(),
  etatDepuis: z.string().nullable().optional(),
  motifImmobilisation: z.string().nullable().optional(),
  atteleA: z.string().nullable().optional(),
});

registry.registerPath({
  method: 'get',
  path: '/trucks/etat',
  tags: ['Flotte'],
  summary: 'État du parc matériel',
  description:
    "Le premier chiffre que cherche un responsable de propreté : quelle part du parc peut servir. À Dar Chaabane, 16 engins sur 29 au 19 avril 2024.",
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: { 200: json(EtatDuParc, 'État du parc.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'post',
  path: '/trucks',
  tags: ['Flotte'],
  summary: 'Enregistrer un engin',
  security: SECURISE,
  request: {
    query: z.object({ communeId: paramCommuneId.optional() }),
    body: { content: { 'application/json': { schema: vehiculeSchemaDoc } } },
  },
  responses: { 201: json(Vehicule, 'Engin enregistré.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/trucks/{id}',
  tags: ['Flotte'],
  summary: 'Modifier un engin',
  description:
    "Changer l'état sans préciser depuis quand pose la date du jour : l'agent saisit au moment où il constate, et un parc dont on ignore l'ancienneté des pannes ne se pilote pas.",
  security: SECURISE,
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: vehiculeSchemaDoc.partial() } } },
  },
  responses: { 200: json(Vehicule, 'Engin modifié.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/trucks/{id}',
  tags: ['Flotte'],
  summary: "Retirer un engin de l'inventaire",
  description:
    "Pour la ligne saisie par erreur ou le doublon d'immatriculation — un engin réformé se déclare par son ÉTAT, pas en le retirant du parc. Suppression logique : les pesées et les tournées passées continuent de désigner l'engin qui les a faites. Refusée (409) tant qu'un circuit actif s'appuie sur lui, et la réponse les nomme.",
  security: SECURISE,
  request: { params: z.object({ id: z.string().openapi({ param: { name: 'id', in: 'path' } }) }) },
  responses: { 204: { description: 'Engin retiré.' }, ...REPONSES_COMMUNES },
});

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

registry.registerPath({
  method: 'patch',
  path: '/tickets/{id}/notification/renvoyer',
  tags: ['Réclamations'],
  summary: 'Relancer manuellement la notification de décision',
  description:
    'Une seule tentative automatique (M6) : un échec n’est jamais réessayé en silence, mais un agent peut relancer explicitement. Réservé à la dernière notification de décision de ce ticket, et seulement si elle est en échec.',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: json(Reclamation, 'Notification relancée ; réclamation renvoyée avec son nouveau statut.'), ...REPONSES_COMMUNES },
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

// --- Observatoire national -------------------------------------------------

const LigneGouvernorat = registry.register(
  'LigneGouvernorat',
  z
    .object({
      gouvernorat: z.string().openapi({ example: 'Sfax' }),
      communes: z.number().int(),
      communes_actives: z.number().int().openapi({ description: 'Communes où quelqu’un a saisi quelque chose.' }),
      communes_incompletes: z.number().int().openapi({ description: 'Aucune saisie ni pesée importée (badge orange, TDR §3.1.2).' }),
      communes_desactivees: z.number().int(),
      population: z.number().int(),
      tonnage_jour: z.number().nullable(),
      production_kg_hab_jour: z.number().nullable().openapi({ description: 'Production spécifique, pondérée par la population.' }),
      taux_collecte: z.number().nullable().openapi({ description: 'Moyenne pondérée par la population, non arithmétique.' }),
      indice_proprete: z.number().nullable(),
      pcgd_valides: z.number().int(),
      reclamations_ouvertes: z.number().int(),
      reclamations_30j: z.number().int(),
      delai_traitement_jours: z.number().nullable(),
      communes_donnees_mesurees: z.number().int(),
      communes_donnees_estimees: z.number().int(),
      derniere_activite: z.string().nullable(),
    })
    .openapi('LigneGouvernorat')
);

const StatutCommune = registry.register(
  'StatutCommune',
  z
    .object({
      commune_id: z.string(),
      name: z.string(),
      name_ar: z.string().nullable(),
      gouvernorat: z.string(),
      population: z.number().int(),
      is_pilot: z.boolean(),
      donnees_source: z.enum(['estime', 'declare', 'mesure']),
      pcgd_status: z.string().nullable(),
      statut: z.enum(['active', 'incomplete', 'desactivee']),
      derniere_activite: z.string().nullable(),
      ecritures_30j: z.number().int(),
      a_des_pesees: z.boolean(),
    })
    .openapi('StatutCommune')
);

registry.registerPath({
  method: 'get',
  path: '/observatoire/gouvernorats',
  tags: ['Observatoire national'],
  summary: 'Tableau de bord par gouvernorat',
  description:
    'Une ligne par gouvernorat : déploiement, production et collecte, qualité de service. Les moyennes sont pondérées par la population — une moyenne arithmétique donnerait le même poids à une commune de 2 000 habitants qu’au Grand Tunis.',
  security: SECURISE,
  responses: { 200: json(z.array(LigneGouvernorat), 'Les 24 gouvernorats.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'get',
  path: '/observatoire/deploiement',
  tags: ['Observatoire national'],
  summary: 'Statut de déploiement des 350 communes',
  description:
    'Le statut n’est pas saisi : il se déduit du journal d’audit et des pesées importées. Une commune est active dès que quelqu’un y a écrit quelque chose.',
  security: SECURISE,
  responses: { 200: json(z.array(StatutCommune), 'Les 350 communes.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'patch',
  path: '/observatoire/communes/{id}/provenance',
  tags: ['Observatoire national'],
  summary: 'Qualifier la provenance des données d’une commune',
  description:
    'estime (ordre de grandeur, à remplacer) | declare (saisi par la commune) | mesure (issu des pesées ANGeD). Toutes les communes sont « estime » par défaut : une donnée n’est réputée fiable que lorsque quelqu’un l’a attestée.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: provenanceSchema } } },
  },
  responses: { 200: json(z.any(), 'Provenance mise à jour.'), ...REPONSES_COMMUNES },
});

// --- Circuits et contrôle terrain ------------------------------------------

const Circuit = registry.register(
  'Circuit',
  z
    .object({
      id: z.string().uuid(),
      commune_id: z.string(),
      commune_nom: z.string(),
      nom: z.string(),
      code: z.string().nullable(),
      prestataire_id: z.string().uuid().nullable(),
      prestataire_nom: z.string().nullable().openapi({ description: 'Null si le circuit est assuré en régie communale.' }),
      zone_id: z.string().uuid().nullable(),
      zone_nom: z.string().nullable(),
      vehicule_id: z.string().nullable(),
      jours_passage: z.array(z.number().int()).openapi({ description: 'Jours prévus, 1 = lundi … 7 = dimanche.' }),
      type_dechet: z.string().nullable(),
      actif: z.boolean(),
      date_debut: z.string().openapi({
        description:
          "Date à partir de laquelle le circuit est dû. Aucun passage n'est attendu avant : un circuit saisi aujourd'hui ne crée pas de manquements rétroactifs.",
      }),
      date_fin: z.string().nullable().openapi({
        description: 'Fin de service, null si le circuit court toujours. Clôt les attentes sans effacer les constats déjà saisis.',
      }),
      description: z.string().nullable(),
      mode_collecte: z.enum(['porte_a_porte', 'conteneurs', 'mixte']).openapi({
        description:
          "Porte-à-porte (باب/باب) ou conteneurs (حاويات). Décide de la nature des arrêts : repères de tournée, ou points fixes ayant une identité et un état.",
      }),
      voyages_par_jour: z.number().int().openapi({
        description:
          "Rotations prévues par jour de passage. Six des huit circuits de Dar Chaabane en font deux : n'en compter qu'une afficherait le prestataire à la moitié du service rendu.",
      }),
      duree_prevue_minutes: z.number().int().nullable().openapi({
        description: 'Durée DÉCLARÉE au registre communal, jamais une mesure.',
      }),
      longueur_declaree_km: z.number().nullable().openapi({
        description: 'Longueur DÉCLARÉE au registre communal. Les relevés GPS donnent des ordres de grandeur différents ; l\'écart s\'arbitre avec la commune.',
      }),
      taille_equipe: z.number().int().nullable(),
      trace_source: z.enum(['kmz_prevu', 'gps_observe', 'saisie']).nullable().openapi({
        description: "Provenance du tracé : itinéraire dessiné, relevé GPS, ou saisie. Le tracé sert à l'affichage, jamais à une règle métier.",
      }),
      nb_points: z.number().int().openapi({ description: "Nombre d'arrêts enregistrés sur le circuit." }),
      // --- Fiche d'identité (relevé d'affectation du matériel) -------------
      secteur_code: z.string().nullable().openapi({
        description:
          "Code du secteur (S01…). Chaînon entre le registre communal, qui numérote les circuits, et les relevés GPS, qui portent des noms de quartier.",
      }),
      secteur_nom: z.string().nullable(),
      poste: z.enum(['jour', 'nuit', 'mixte']).nullable().openapi({
        description: "Un circuit de nuit ne se contrôle pas le matin.",
      }),
      heure_depart: z.string().nullable(),
      heure_fin: z.string().nullable(),
      lieu_dechargement: z.string().nullable(),
      vehicule_code: z.string().nullable().openapi({
        description: "Engin de collecte (BB1, TA1…). Il ramasse ET évacue vers le centre de transfert.",
      }),
      vehicule_immat: z.string().nullable(),
      engin_appui_code: z.string().nullable().openapi({
        description:
          "Engin de remplacement en cas de panne de l'engin de collecte (BT1, Ta01…). L'engin de collecte assure lui-même l'évacuation vers le centre de transfert ; l'engin d'appui ne travaille pas en parallèle, il prend le relais.",
      }),
      engin_appui_immat: z.string().nullable(),
      // --- Campagne d'observation : des MESURES, datées --------------------
      etude_date: z.string().nullable().openapi({
        description:
          "Date de la campagne dont proviennent les valeurs « etude_* ». Sans elle, ces chiffres passeraient pour des propriétés du circuit, ce qu'ils ne sont pas.",
      }),
      etude_temps_parc_min: z.number().int().nullable(),
      etude_temps_dechargement_min: z.number().int().nullable(),
      etude_temps_retour_min: z.number().int().nullable(),
      etude_temps_collecte_min: z.number().int().nullable(),
      etude_distance_parc_km: z.number().nullable(),
      etude_distance_dechargement_km: z.number().nullable(),
      etude_distance_retour_km: z.number().nullable(),
      etude_distance_collecte_km: z.number().nullable().openapi({
        description: "Distance MESURÉE. À ne pas confondre avec longueur_declaree_km, qui vient du registre communal.",
      }),
      etude_tonnage_t: z.number().nullable(),
      etude_consommation_l: z.number().nullable(),
      // --- Provenance du tracé et des arrêts -------------------------------
      trace_importee_le: z.string().nullable(),
      trace_fichier: z.string().nullable(),
      points_importes_le: z.string().nullable(),
      points_fichier: z.string().nullable(),
      chauffeur_nom: z.string().nullable().openapi({ description: 'Chauffeur affecté en cours, null si aucun.' }),
      trace: z.any().nullable().openapi({ description: 'Tracé GeoJSON MultiLineString, importé et non dessiné.' }),
    })
    .passthrough()
    .openapi('Circuit')
);



// --- Comptes et accès -------------------------------------------------------

const Compte = registry.register(
  'Compte',
  z
    .object({
      id: z.string().uuid(),
      email: z.string(),
      full_name: z.string(),
      role: z.string(),
      commune_id: z.string().nullable(),
      commune_nom: z.string().nullable(),
      phone: z.string().nullable(),
      is_active: z.boolean(),
      mot_de_passe_provisoire: z.boolean().openapi({
        description:
          "Le mot de passe a été fixé par un tiers : son porteur doit le remplacer avant toute autre action.",
      }),
      derniere_connexion: z.string().nullable().openapi({
        description: "Null si le compte n'a jamais servi — un accès ouvert et jamais utilisé se referme.",
      }),
      cree_par_nom: z.string().nullable(),
      created_at: z.string(),
    })
    .passthrough()
    .openapi('Compte')
);

const compteCreateSchema = z.object({
  email: z.string().email(),
  fullName: z.string(),
  role: z.enum(['admin_commune', 'gestionnaire_prestataire', 'citoyen']).openapi({
    description: "« super_admin_fnct » est absent : une commune ne crée pas de compte national, et un déclencheur le refuse au niveau de la base.",
  }),
  communeId: z.string().optional(),
  phone: z.string().optional(),
});

registry.registerPath({
  method: 'get',
  path: '/comptes',
  tags: ['Comptes et accès'],
  summary: "Comptes d'une commune",
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: { 200: json(z.array(Compte), 'Comptes visibles.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'post',
  path: '/comptes',
  tags: ['Comptes et accès'],
  summary: 'Ouvrir un compte',
  description:
    "Le mot de passe provisoire figure dans la réponse et nulle part ailleurs : il n'est stocké qu'en empreinte et ne pourra pas être relu. Son porteur doit le remplacer à la première connexion.",
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: compteCreateSchema } } } },
  responses: {
    201: json(Compte.extend({ motDePasseProvisoire: z.string() }), 'Compte ouvert.'),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/comptes/{id}',
  tags: ['Comptes et accès'],
  summary: 'Modifier un compte',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            fullName: z.string().optional(),
            role: z.enum(['admin_commune', 'gestionnaire_prestataire', 'citoyen']).optional(),
            phone: z.string().nullable().optional(),
            isActive: z.boolean().optional(),
          }),
        },
      },
    },
  },
  responses: { 200: json(Compte, 'Compte modifié.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/comptes/{id}/mot-de-passe',
  tags: ['Comptes et accès'],
  summary: 'Réinitialiser le mot de passe d’un compte',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: json(
      z.object({ id: z.string().uuid(), full_name: z.string(), motDePasseProvisoire: z.string() }),
      'Nouveau mot de passe provisoire, affiché une seule fois.'
    ),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'post',
  path: '/comptes/moi/mot-de-passe',
  tags: ['Comptes et accès'],
  summary: 'Changer son propre mot de passe',
  description: "Ouvert à tous les rôles : c'est ce qui permet de remplacer un mot de passe provisoire sans dépendre de qui l'a fixé.",
  security: SECURISE,
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ motDePasseActuel: z.string(), nouveauMotDePasse: z.string().min(10) }),
        },
      },
    },
  },
  responses: { 204: { description: 'Mot de passe remplacé.' }, ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/comptes/{id}',
  tags: ['Comptes et accès'],
  summary: 'Fermer un compte',
  description: "Suppression logique : un compte effacé emporterait l'imputabilité de tout ce qu'il a saisi.",
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Compte fermé.' }, ...REPONSES_COMMUNES },
});

// ---------------------------------------------------------------------------
// Module 4 : personnel, affectations, présence et coût du service.
//
// Ce bloc ne décrit AUCUN salaire individuel ni aucune donnée de santé — la
// base n'en porte pas. L'argent n'apparaît qu'au niveau du service et de
// l'année (/personnel/cout), sans clé permettant d'en redescendre vers une
// personne. C'est la minimisation exigée par le décret-loi n° 2022-54, rendue
// vérifiable : elle se lit dans le contrat d'API.
// ---------------------------------------------------------------------------

const FONCTIONS_AGENT = [
  'chauffeur', 'agent', 'chef_equipe', 'agent_balayage', 'encadrement',
  'ripeur', 'tractoriste', 'mecanicien', 'jardinier',
  'agent_hygiene', 'magasinier', 'gardien', 'administratif',
] as const;
const SERVICES_AGENT = ['proprete', 'espaces_verts', 'hygiene', 'atelier', 'administratif'] as const;
const STATUTS_AGENT = ['titulaire', 'contractuel', 'occasionnel', 'mise_a_disposition', 'prestataire'] as const;
const AFFECTATIONS_AGENT = ['circuit', 'balayage', 'point_fixe', 'atelier', 'encadrement', 'administratif'] as const;
const MOTIFS_ABSENCE_DOC = [
  'conge', 'repos', 'formation', 'absence_justifiee',
  'absence_non_justifiee', 'detachement', 'autre',
] as const;

const Agent = registry.register(
  'Agent',
  z
    .object({
      id: z.string().uuid(),
      commune_id: z.string(),
      matricule: z.string().nullable(),
      nom_complet: z.string(),
      fonction: z.enum(FONCTIONS_AGENT),
      grade: z.string().nullable().openapi({
        description: 'Grade statutaire tel qu’il figure au registre communal (عامل, تقني رئيس…).',
      }),
      classe: z.number().int().nullable().openapi({
        description: 'صنف — classe statutaire. 4 à 8 pour les ouvriers de propreté de Dar Chaabane.',
      }),
      echelon: z.number().int().nullable(),
      statut: z.enum(STATUTS_AGENT),
      service: z.enum(SERVICES_AGENT),
      affectation: z.enum(AFFECTATIONS_AGENT).nullable(),
      date_recrutement: z.string().nullable(),
      date_depart: z.string().nullable(),
      permis: z.array(z.string()).nullable().openapi({
        description: 'Catégories détenues. Seule donnée qui dise qui peut conduire quel engin.',
      }),
      observation: z.string().nullable(),
      actif: z.boolean(),
      circuits_affectes: z.number().int().nullable(),
      circuits: z.string().nullable(),
    })
    .openapi({
      description:
        'Fiche d’affectation d’un agent. Elle ne porte ni CIN, ni téléphone, ni salaire, ni donnée de santé : la table n’a pas ces colonnes, de sorte qu’aucune route ne puisse les servir un jour par inadvertance.',
    })
);

const agentSchemaDoc = z.object({
  nomComplet: z.string(),
  matricule: z.string().nullable().optional(),
  fonction: z.enum(FONCTIONS_AGENT),
  grade: z.string().nullable().optional(),
  classe: z.number().int().nullable().optional(),
  echelon: z.number().int().nullable().optional(),
  statut: z.enum(STATUTS_AGENT).optional(),
  service: z.enum(SERVICES_AGENT).optional(),
  affectation: z.enum(AFFECTATIONS_AGENT).nullable().optional(),
  dateRecrutement: z.string().nullable().optional(),
  dateDepart: z.string().nullable().optional(),
  permis: z.array(z.string()).nullable().optional(),
  observation: z.string().nullable().optional(),
  actif: z.boolean().optional(),
});

const LigneEffectif = registry.register(
  'LigneEffectif',
  z.object({
    service: z.string(),
    fonction: z.string(),
    statut: z.string(),
    effectif: z.number().int(),
    affectes_circuit: z.number().int().openapi({
      description: 'Combien, dans ce groupe, sont effectivement affectés à un circuit. L’écart avec l’effectif est la question que le module pose.',
    }),
  })
);

const MembreEquipe = registry.register(
  'MembreEquipe',
  z.object({
    affectation_id: z.string().uuid().openapi({
      description:
        "Identifiant de l'AFFECTATION, non de l'agent : c'est l'affectation qu'on clôt pour retirer quelqu'un d'un circuit. L'agent, lui, reste au registre.",
    }),
    personnel_id: z.string().uuid(),
    nom_complet: z.string(),
    matricule: z.string().nullable(),
    fonction: z.string(),
    role: z.string().openapi({
      description:
        "Rôle TENU SUR CE CIRCUIT (chauffeur, agent, chef d'équipe). Distinct de la fonction, qui est le métier au registre : un tractoriste peut tenir le rôle d'agent sur une tournée de balayage.",
    }),
    depuis: z.string().nullable(),
    present: z.boolean().nullable().openapi({
      description:
        'Pointé présent, pointé absent, ou pas encore pointé — trois états distincts. Nul ne veut pas dire absent.',
    }),
  })
);

const EquipeDuJour = registry.register(
  'EquipeDuJour',
  z.object({
    circuit_id: z.string().uuid(),
    circuit: z.string(),
    taille_prevue: z.number().int().nullable(),
    affectes: z.number().int(),
    presents: z.number().int(),
    absents: z.number().int(),
    chauffeur: z.boolean().nullable().openapi({
      description: 'Un chauffeur est-il affecté. Un circuit motorisé sans chauffeur est la première chose à voir le matin.',
    }),
    membres: z.array(MembreEquipe).openapi({
      description:
        "L'équipe en place ce jour-là. Tableau vide, jamais nul : à l'écran, « personne » et « pas encore chargé » ne doivent pas se ressembler.",
    }),
  })
);

const CoutService = registry.register(
  'CoutService',
  z
    .object({
      annee: z.number().int(),
      effectif_total: z.number().int(),
      masse_salariale_tnd: z.number().nullable(),
      cout_moyen_agent_tnd: z.number().nullable(),
      evolution_pct: z.number().nullable(),
      source: z.string().nullable(),
    })
    .openapi({
      description:
        'Coût du service par exercice. Niveau service uniquement. Le coût à la tonne n’y figure pas tant que les pesées ne sont pas en base : un ratio calculé sur un tonnage estimé serait plus nuisible qu’utile.',
    })
);

const LignePresence = registry.register(
  'LignePresence',
  z.object({
    personnel_id: z.string().uuid(),
    nom_complet: z.string(),
    fonction: z.string(),
    service: z.string(),
    presence_id: z.string().uuid().nullable(),
    present: z.boolean().nullable().openapi({ description: 'null = pas encore pointé.' }),
    motif_absence: z.enum(MOTIFS_ABSENCE_DOC).nullable(),
    circuit_id: z.string().uuid().nullable(),
    circuit: z.string().nullable(),
    voyage: z.number().int().nullable(),
    observation: z.string().nullable(),
  })
);

const Presence = registry.register(
  'Presence',
  z.object({
    id: z.string().uuid(),
    commune_id: z.string(),
    personnel_id: z.string().uuid(),
    jour: z.string(),
    present: z.boolean(),
    motif_absence: z.enum(MOTIFS_ABSENCE_DOC).nullable(),
    circuit_id: z.string().uuid().nullable(),
    voyage: z.number().int(),
    observation: z.string().nullable(),
  })
);

const presenceSchemaDoc = z.object({
  personnelId: z.string().uuid(),
  jour: z.string().optional(),
  present: z.boolean(),
  motifAbsence: z.enum(MOTIFS_ABSENCE_DOC).nullable().optional(),
  circuitId: z.string().uuid().nullable().optional(),
  voyage: z.number().int().optional(),
  observation: z.string().nullable().optional(),
});

const Affectation = registry.register(
  'Affectation',
  z.object({
    id: z.string().uuid(),
    circuit_id: z.string().uuid(),
    personnel_id: z.string().uuid(),
    role: z.enum(['chauffeur', 'agent', 'chef_equipe']),
    date_debut: z.string(),
    date_fin: z.string().nullable(),
  })
);

const EffectifService = registry.register(
  'EffectifService',
  z.object({
    id: z.string().uuid(),
    commune_id: z.string(),
    annee: z.number().int(),
    service: z.enum(SERVICES_AGENT),
    effectif_ouvriers: z.number().int().nullable(),
    effectif_encadrement: z.number().int().nullable(),
    effectif_contractuels: z.number().int().nullable(),
    masse_salariale_tnd: z.number().nullable(),
    masse_salariale_ouvriers_tnd: z.number().nullable(),
    source: z.string().nullable(),
    observation: z.string().nullable(),
  })
);

const effectifSchemaDoc = z.object({
  annee: z.number().int(),
  service: z.enum(SERVICES_AGENT).optional(),
  effectifOuvriers: z.number().int().nullable().optional(),
  effectifEncadrement: z.number().int().nullable().optional(),
  effectifContractuels: z.number().int().nullable().optional(),
  masseSalarialeTnd: z.number().nullable().optional(),
  masseSalarialeOuvriersTnd: z.number().nullable().optional(),
  source: z.string().nullable().optional(),
  observation: z.string().nullable().optional(),
});

registry.registerPath({
  method: 'get',
  path: '/personnel',
  tags: ['Personnel'],
  summary: 'Effectif de la commune',
  description:
    "L'ordre n'est pas alphabétique : encadrement, chefs d'équipe puis chauffeurs d'abord — ceux dont l'absence arrête une tournée entière. Les agents partis restent consultables (inclureInactifs=true) : un registre qui efface les partants ne permet plus de relire une tournée d'il y a six mois.",
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      service: z.enum(SERVICES_AGENT).optional(),
      fonction: z.enum(FONCTIONS_AGENT).optional(),
      inclureInactifs: z.enum(['true', 'false']).optional(),
    }),
  },
  responses: { 200: json(z.array(Agent), 'Effectif.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'get',
  path: '/personnel/effectif',
  tags: ['Personnel'],
  summary: "Effectif par service, fonction et statut",
  description:
    "À Dar Chaabane : 60 ouvriers et 1 cadre technique. Un seul encadrant pour soixante personnes — ce chiffre commande toute l'ergonomie de la plateforme.",
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: { 200: json(z.array(LigneEffectif), 'Effectif agrégé.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/personnel/equipes',
  tags: ['Personnel'],
  summary: 'Équipes du jour, circuit par circuit',
  description:
    "Pour chaque circuit actif : la taille d'équipe prévue à la fiche, les agents affectés, ceux pointés présents.",
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      jour: z.string().optional().openapi({ description: 'AAAA-MM-JJ. Aujourd’hui par défaut.' }),
    }),
  },
  responses: { 200: json(z.array(EquipeDuJour), 'Équipes.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/personnel/cout',
  tags: ['Personnel'],
  summary: 'Masse salariale du service par exercice',
  description:
    "Dar Chaabane : 1 168 566 TND en 2021, 1 324 500 en 2024 — +13,3 % en trois ans à effectif constant. Niveau service uniquement : aucune ligne ne désigne une personne.",
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      service: z.enum(SERVICES_AGENT).optional(),
    }),
  },
  responses: { 200: json(z.array(CoutService), 'Coût par exercice.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/personnel/presences',
  tags: ['Personnel'],
  summary: 'Feuille de présence du jour',
  description:
    "Rend TOUT l'effectif, pointé ou non : un écran qui n'affiche que les lignes déjà saisies ne montre jamais ceux qu'on a oubliés — or c'est exactement ce que le responsable cherche le matin.",
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      jour: z.string().optional(),
    }),
  },
  responses: { 200: json(z.array(LignePresence), 'Feuille de présence.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'put',
  path: '/personnel/presences',
  tags: ['Personnel'],
  summary: 'Pointer la présence',
  description:
    "Accepte une ligne ou la feuille entière : le pointage du matin se fait d'un seul geste. Le vocabulaire des motifs ne comporte volontairement aucun terme médical — une absence pour raison de santé se saisit « absence_justifiee », ce qui suffit à l'exploitation et évite de constituer un dossier médical à l'insu de la commune.",
  security: SECURISE,
  request: {
    body: {
      content: {
        'application/json': { schema: z.union([presenceSchemaDoc, z.array(presenceSchemaDoc)]) },
      },
    },
  },
  responses: { 200: json(z.union([Presence, z.array(Presence)]), 'Présence enregistrée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'put',
  path: '/personnel/effectifs',
  tags: ['Personnel'],
  summary: 'Déclarer effectif et masse salariale d’un exercice',
  description:
    "Le seul endroit du module où figure de l'argent, et il est au niveau du service. Un chiffre sans origine n'étant pas opposable, le champ « source » dit d'où il vient en clair.",
  security: SECURISE,
  request: {
    query: z.object({ communeId: paramCommuneId.optional() }),
    body: { content: { 'application/json': { schema: effectifSchemaDoc } } },
  },
  responses: { 200: json(EffectifService, 'Exercice enregistré.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/personnel',
  tags: ['Personnel'],
  summary: 'Inscrire un agent',
  security: SECURISE,
  request: {
    query: z.object({ communeId: paramCommuneId.optional() }),
    body: { content: { 'application/json': { schema: agentSchemaDoc } } },
  },
  responses: { 201: json(Agent, 'Agent inscrit.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/personnel/{id}',
  tags: ['Personnel'],
  summary: 'Fiche d’un agent',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }) }) },
  responses: { 200: json(Agent, 'Fiche.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/personnel/{id}',
  tags: ['Personnel'],
  summary: 'Modifier la fiche d’un agent',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }) }),
    body: { content: { 'application/json': { schema: agentSchemaDoc.partial() } } },
  },
  responses: { 200: json(Agent, 'Fiche modifiée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/personnel/{id}',
  tags: ['Personnel'],
  summary: 'Retirer un agent du registre',
  description:
    "Suppression logique : le pointage du mois dernier et les tournées déjà faites gardent l'agent qui les a faites. Refusée (409) tant que l'agent tient un poste, et la réponse nomme les circuits — retirer en silence un chauffeur affecté laisserait une tournée apparemment pourvue par quelqu'un qui n'est plus au registre. À ne pas confondre avec « désactiver » : un agent inactif est en poste et ne travaille pas ce mois-ci ; un agent retiré est une ligne saisie par erreur.",
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }) }) },
  responses: { 204: { description: 'Agent retiré.' }, ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/personnel/{id}/affectations',
  tags: ['Personnel'],
  summary: 'Affecter un agent à un circuit',
  description:
    "Un agent ne peut être affecté qu'à un circuit de sa propre commune : la base le refuse. Il PEUT en revanche servir deux circuits le même jour — à Dar Chaabane, le camion 02 214 147 dessert Jadid le matin et Barnousa l'après-midi, et son équipe fait de même. Ce n'est signalé que si les horaires se chevauchent.",
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }) }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            circuitId: z.string().uuid(),
            role: z.enum(['chauffeur', 'agent', 'chef_equipe']).optional(),
            dateDebut: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: { 201: json(Affectation, 'Agent affecté.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/personnel/{id}/affectations/{affectationId}',
  tags: ['Personnel'],
  summary: 'Clore ou modifier une affectation',
  description:
    "On ne supprime pas une affectation, on la clôt : la tournée de la semaine dernière doit rester lisible avec l'équipe qui l'a réellement faite.",
  security: SECURISE,
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
      affectationId: z.string().uuid().openapi({ param: { name: 'affectationId', in: 'path' } }),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            dateFin: z.string().nullable().optional(),
            role: z.enum(['chauffeur', 'agent', 'chef_equipe']).optional(),
          }),
        },
      },
    },
  },
  responses: { 200: json(Affectation, 'Affectation mise à jour.'), ...REPONSES_COMMUNES },
});

// ---------------------------------------------------------------------------
// Module 5 : communication et relation citoyen.
//
// Une remarque qui se lit dans ce contrat : aucune route ne rend la liste des
// citoyens d'un périmètre. app.compter_destinataires en rend le NOMBRE, et
// c'est tout ce dont un agent communal a besoin pour juger si son message
// part au bon endroit (décret-loi n° 2022-54).
// ---------------------------------------------------------------------------

const TYPES_PUBLICATION = ['sondage', 'projet', 'notification'] as const;
const STATUTS_PUBLICATION = ['brouillon', 'publiee', 'close', 'archivee'] as const;
const PERIMETRES_PUBLICATION = ['commune', 'zones', 'circuits', 'polygone'] as const;
const TYPES_FOYER_DOC = ['menage', 'commerce', 'administration', 'industrie'] as const;

const Destinataires = registry.register(
  'Destinataires',
  z
    .object({
      joignables: z.number().int().openapi({ description: 'Recevront le message.' }),
      sans_adresse: z.number().int().openapi({
        description:
          "Inscrits dans la commune sans domicile renseigné : hors de tout périmètre géographique, invisibles au ciblage. Une commune qui croit toucher tout le monde décide sur un chiffre faux.",
      }),
      desabonnes: z.number().int().openapi({ description: 'Dans le périmètre, mais ont refusé les notifications.' }),
    })
    .openapi({
      description:
        'Trois nombres, jamais une liste. Un agent a besoin de savoir COMBIEN de foyers son message touche, jamais QUI habite dans le polygone qu’il vient de dessiner.',
    })
);

const Publication = registry.register(
  'Publication',
  z.object({
    id: z.string().uuid(),
    commune_id: z.string(),
    type: z.enum(TYPES_PUBLICATION),
    titre_fr: z.string(),
    titre_ar: z.string().nullable(),
    contenu_fr: z.string().nullable(),
    contenu_ar: z.string().nullable(),
    perimetre_type: z.enum(PERIMETRES_PUBLICATION),
    zone_ids: z.array(z.string().uuid()).nullable(),
    circuit_ids: z.array(z.string().uuid()).nullable(),
    cible_types: z.array(z.enum(TYPES_FOYER_DOC)).nullable().openapi({
      description: 'NULL = tous, y compris ceux qui n’ont pas déclaré leur type : ne pas savoir n’exclut pas.',
    }),
    statut: z.enum(STATUTS_PUBLICATION),
    date_debut: z.string().nullable(),
    date_fin: z.string().nullable(),
    publiee_le: z.string().nullable(),
    projet_nature: z.enum(['communal', 'associatif']).nullable(),
    projet_etat: z.enum(['en_preparation', 'actif', 'termine']).nullable(),
    visible_citoyen: z.boolean(),
    est_exemple: z.boolean().openapi({
      description:
        'Contenu de démonstration. La base refuse de le publier vers les citoyens : un sondage d’exemple pris pour une consultation réelle est un incident, pas une gêne.',
    }),
    joignables: z.number().int().nullable(),
    sans_adresse: z.number().int().nullable(),
    desabonnes: z.number().int().nullable(),
    questions: z.number().int().nullable(),
    repondants: z.number().int().nullable(),
    documents: z.number().int().nullable(),
    dernier_envoi: z.string().nullable(),
  })
);

const publicationSchemaDoc = z.object({
  type: z.enum(TYPES_PUBLICATION),
  titreFr: z.string(),
  titreAr: z.string().nullable().optional(),
  contenuFr: z.string().nullable().optional(),
  contenuAr: z.string().nullable().optional(),
  perimetreType: z.enum(PERIMETRES_PUBLICATION).optional(),
  zoneIds: z.array(z.string().uuid()).nullable().optional(),
  circuitIds: z.array(z.string().uuid()).nullable().optional(),
  perimetre: z.unknown().nullable().optional(),
  cibleTypes: z.array(z.enum(TYPES_FOYER_DOC)).nullable().optional(),
  dateDebut: z.string().nullable().optional(),
  dateFin: z.string().nullable().optional(),
  projetNature: z.enum(['communal', 'associatif']).nullable().optional(),
  projetEtat: z.enum(['en_preparation', 'actif', 'termine']).nullable().optional(),
  visibleCitoyen: z.boolean().optional(),
  estExemple: z.boolean().optional(),
});

const SondageQuestion = registry.register(
  'SondageQuestion',
  z.object({
    id: z.string().uuid(),
    publication_id: z.string().uuid(),
    ordre: z.number().int(),
    libelle_fr: z.string(),
    libelle_ar: z.string().nullable(),
    type: z.enum(['choix_unique', 'choix_multiple', 'texte', 'note']),
    options_fr: z.array(z.string()).nullable(),
    options_ar: z.array(z.string()).nullable().openapi({
      description:
        'Même longueur que options_fr, imposé par la base : décalées d’un cran, l’arabophone ne coche pas ce qu’il croit cocher et le dépouillement est faux sans que personne ne le voie.',
    }),
    obligatoire: z.boolean(),
  })
);

const questionSchemaDoc = z.object({
  libelleFr: z.string(),
  libelleAr: z.string().nullable().optional(),
  type: z.enum(['choix_unique', 'choix_multiple', 'texte', 'note']).optional(),
  optionsFr: z.array(z.string()).nullable().optional(),
  optionsAr: z.array(z.string()).nullable().optional(),
  obligatoire: z.boolean().optional(),
});

const LigneDepouillement = registry.register(
  'LigneDepouillement',
  z.object({
    question_id: z.string().uuid(),
    ordre: z.number().int(),
    libelle_fr: z.string(),
    libelle_ar: z.string().nullable(),
    type: z.string(),
    option_rang: z.number().int().nullable(),
    option_fr: z.string().nullable(),
    option_ar: z.string().nullable(),
    reponses: z.number().int(),
    note_moyenne: z.number().nullable(),
  })
);

const EnvoiNotification = registry.register(
  'EnvoiNotification',
  z.object({
    id: z.string().uuid(),
    publication_id: z.string().uuid(),
    commune_id: z.string(),
    canal: z.enum(['push', 'sms', 'email']),
    destinataires: z.number().int(),
    sans_adresse: z.number().int(),
    desabonnes: z.number().int(),
    perimetre_resume: z.string().nullable(),
    created_at: z.string(),
    // Joints depuis la publication. Sans eux, l'historique des envois
    // n'affiche qu'une date et un nombre : on sait qu'un message est parti à
    // douze mille foyers, pas lequel. La route les servait déjà ; seule la
    // documentation les ignorait — et le front, qui se type dessus, recevait
    // une colonne vide.
    titre_fr: z.string(),
    type: z.enum(TYPES_PUBLICATION),
  })
);

const PublicationDocument = registry.register(
  'PublicationDocument',
  z.object({
    id: z.string().uuid(),
    publication_id: z.string().uuid(),
    nom: z.string(),
    url: z.string(),
    type_mime: z.string().nullable(),
    taille_octets: z.number().int().nullable(),
    created_at: z.string(),
  })
);

const PublicationCitoyen = registry.register(
  'PublicationCitoyen',
  z
    .object({
      id: z.string().uuid(),
      type: z.enum(TYPES_PUBLICATION),
      titre_fr: z.string(),
      titre_ar: z.string().nullable(),
      contenu_fr: z.string().nullable(),
      contenu_ar: z.string().nullable(),
      date_debut: z.string().nullable(),
      date_fin: z.string().nullable(),
      projet_etat: z.string().nullable(),
      publiee_le: z.string().nullable(),
      a_repondu: z.boolean(),
    })
    .openapi({
      description:
        'Le miroir exact du ciblage défini par la commune — ni plus, ni moins. Le citoyen ne voit ni les brouillons, ni les contenus d’exemple, ni les projets que la commune n’a pas rendus publics.',
    })
);

const idPublication = z.string().uuid().openapi({ param: { name: 'id', in: 'path' } });

registry.registerPath({
  method: 'get',
  path: '/communication',
  tags: ['Communication'],
  summary: 'Sondages, projets et notifications de la commune',
  description:
    "Les brouillons d’abord : ce sont eux qui attendent une décision. Une liste qui s’ouvre sur l’archive fait chercher au milieu de ce qui est fini.",
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      type: z.enum(TYPES_PUBLICATION).optional(),
      statut: z.enum(STATUTS_PUBLICATION).optional(),
    }),
  },
  responses: { 200: json(z.array(Publication), 'Publications.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/communication/apercu',
  tags: ['Communication'],
  summary: 'Combien de foyers ce périmètre touche — avant d’écrire quoi que ce soit',
  description:
    "La route la plus importante du module. Un agent qui dessine un polygone doit savoir, AVANT de rédiger, combien de foyers il touche et surtout combien il rate faute d’adresse renseignée. Sans cela il publie dans le vide et n’en saura jamais rien.",
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      perimetreType: z.enum(PERIMETRES_PUBLICATION).optional(),
      zoneIds: z.string().optional().openapi({ description: 'Identifiants séparés par des virgules.' }),
      circuitIds: z.string().optional().openapi({ description: 'Identifiants séparés par des virgules.' }),
      perimetre: z.string().optional().openapi({ description: 'Polygone dessiné, en GeoJSON.' }),
      cibleTypes: z.string().optional().openapi({ description: 'Types de foyer, séparés par des virgules.' }),
    }),
  },
  responses: { 200: json(Destinataires, 'Décompte.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/communication/envois',
  tags: ['Communication'],
  summary: 'Historique des envois',
  description:
    "Date, périmètre, volumes. Jamais la liste des destinataires : un envoi se justifie par son périmètre et son volume ; la liste nominative ne sert aucune opération et constitue un fichier de destinataires.",
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: { 200: json(z.array(EnvoiNotification), 'Envois.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/communication/coherence',
  tags: ['Communication'],
  summary: 'Les messages qui ne parviendront à personne',
  description:
    "La panne la plus silencieuse qui soit : l’agent a fait son travail, l’écran n’a rien dit, et rien n’est arrivé.",
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: { 200: json(z.array(Incoherence), 'Points à vérifier.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/communication',
  tags: ['Communication'],
  summary: 'Créer un sondage, un projet ou une notification',
  security: SECURISE,
  request: {
    query: z.object({ communeId: paramCommuneId.optional() }),
    body: { content: { 'application/json': { schema: publicationSchemaDoc } } },
  },
  responses: { 201: json(Publication, 'Créée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/communication/{id}',
  tags: ['Communication'],
  summary: 'Une publication et son décompte de destinataires',
  security: SECURISE,
  request: { params: z.object({ id: idPublication }) },
  responses: { 200: json(Publication, 'Publication.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/communication/{id}',
  tags: ['Communication'],
  summary: 'Modifier une publication',
  security: SECURISE,
  request: {
    params: z.object({ id: idPublication }),
    body: { content: { 'application/json': { schema: publicationSchemaDoc.partial() } } },
  },
  responses: { 200: json(Publication, 'Modifiée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/communication/{id}/publier',
  tags: ['Communication'],
  summary: 'Mettre en ligne, clore ou archiver',
  description:
    "Publier et envoyer sont deux gestes distincts : publier rend le contenu visible dans l’application citoyenne, envoyer pousse une notification. Un projet s’affiche sans réveiller les téléphones.",
  security: SECURISE,
  request: {
    params: z.object({ id: idPublication }),
    body: { content: { 'application/json': { schema: z.object({ statut: z.enum(STATUTS_PUBLICATION).optional() }) } } },
  },
  responses: { 200: json(Publication, 'Statut changé.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/communication/{id}/envoyer',
  tags: ['Communication'],
  summary: 'Envoyer la notification et l’inscrire à l’historique',
  description: [
    "Un envoi vers zéro destinataire est refusé : inscrire « 0 destinataires » à l’historique laisserait l’agent croire que c’est parti.",
    '',
    "Canal « push » : l’envoi est réel (Web Push), un par citoyen abonné du périmètre — voir migration 044. Canaux « sms » et « email » : le choix est enregistré, mais rien n’est encore émis derrière (décision de fournisseur en attente, feuille de route §7.2).",
  ].join('\n'),
  security: SECURISE,
  request: {
    params: z.object({ id: idPublication }),
    body: { content: { 'application/json': { schema: z.object({ canal: z.enum(['push', 'sms', 'email']).optional() }) } } },
  },
  responses: { 201: json(EnvoiNotification, 'Envoi enregistré.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/communication/{id}/questions',
  tags: ['Communication'],
  summary: 'Les questions d’un sondage',
  security: SECURISE,
  request: { params: z.object({ id: idPublication }) },
  responses: { 200: json(z.array(SondageQuestion), 'Questions.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'put',
  path: '/communication/{id}/questions',
  tags: ['Communication'],
  summary: 'Remplacer le questionnaire',
  description:
    "Refusé dès qu’une réponse est arrivée : modifier une question déjà répondue change rétroactivement le sens des réponses — « êtes-vous satisfait ? » devenu « êtes-vous mécontent ? », et les mêmes « oui » comptés à l’envers.",
  security: SECURISE,
  request: {
    params: z.object({ id: idPublication }),
    body: { content: { 'application/json': { schema: z.array(questionSchemaDoc) } } },
  },
  responses: {
    200: json(z.array(SondageQuestion), 'Questionnaire remplacé.'),
    409: json(Erreur, 'Le sondage a déjà reçu des réponses.'),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'get',
  path: '/communication/{id}/depouillement',
  tags: ['Communication'],
  summary: 'Résultat d’un sondage',
  description:
    "Par question et par option. Aucune réponse individuelle n’en sort : le résultat d’une consultation est un agrégat, et le lire autrement serait lire l’opinion de quelqu’un.",
  security: SECURISE,
  request: { params: z.object({ id: idPublication }) },
  responses: { 200: json(z.array(LigneDepouillement), 'Dépouillement.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/communication/{id}/documents',
  tags: ['Communication'],
  summary: 'Pièces jointes d’un projet',
  security: SECURISE,
  request: { params: z.object({ id: idPublication }) },
  responses: { 200: json(z.array(PublicationDocument), 'Documents.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/communication/{id}/documents',
  tags: ['Communication'],
  summary: 'Joindre un document à un projet',
  security: SECURISE,
  request: {
    params: z.object({ id: idPublication }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            nom: z.string(),
            url: z.string(),
            typeMime: z.string().nullable().optional(),
            tailleOctets: z.number().int().nullable().optional(),
          }),
        },
      },
    },
  },
  responses: { 201: json(PublicationDocument, 'Document joint.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/citoyen/publications',
  tags: ['Espace citoyen'],
  summary: 'Ce qui s’adresse à moi',
  description:
    'Le miroir exact du ciblage défini par la commune. Ni brouillons, ni contenus d’exemple, ni projets non rendus publics.',
  security: SECURISE,
  request: { query: z.object({ type: z.enum(TYPES_PUBLICATION).optional() }) },
  responses: { 200: json(z.array(PublicationCitoyen), 'Publications.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'get',
  path: '/citoyen/publications/{id}/questions',
  tags: ['Espace citoyen'],
  summary: 'Les questions d’un sondage qui m’est adressé',
  description:
    'Rendues seulement si la publication s’adresse réellement à ce citoyen : sans ce contrôle, un identifiant deviné donnerait accès au questionnaire d’une autre commune.',
  security: SECURISE,
  request: { params: z.object({ id: idPublication }) },
  responses: { 200: json(z.array(SondageQuestion), 'Questions.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/citoyen/publications/{id}/reponses',
  tags: ['Espace citoyen'],
  summary: 'Répondre à un sondage',
  description:
    'La zone du répondant est figée au moment de la réponse : un redécoupage six mois plus tard ne doit pas réécrire l’origine géographique de réponses déjà données.',
  security: SECURISE,
  request: {
    params: z.object({ id: idPublication }),
    body: {
      content: {
        'application/json': {
          schema: z.union([
            z.object({
              questionId: z.string().uuid(),
              choix: z.array(z.number().int()).nullable().optional(),
              texte: z.string().nullable().optional(),
              note: z.number().int().nullable().optional(),
            }),
            z.array(
              z.object({
                questionId: z.string().uuid(),
                choix: z.array(z.number().int()).nullable().optional(),
                texte: z.string().nullable().optional(),
                note: z.number().int().nullable().optional(),
              })
            ),
          ]),
        },
      },
    },
  },
  responses: { 201: json(z.array(z.object({ id: z.string().uuid() })), 'Réponses enregistrées.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/citoyen/type-foyer',
  tags: ['Espace citoyen'],
  summary: 'Déclarer la nature de mon point desservi',
  description:
    'Facultatif, et il faut que cela le reste : ne pas l’avoir renseigné n’exclut d’aucun ciblage. Un commerce qui ne s’est pas déclaré reçoit les messages destinés à tous, pas rien.',
  security: SECURISE,
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ typeFoyer: z.enum(TYPES_FOYER_DOC).nullable() }),
        },
      },
    },
  },
  responses: {
    200: json(z.object({ id: z.string().uuid(), type_foyer: z.string().nullable() }), 'Enregistré.'),
    ...REPONSES_COMMUNES,
  },
});

// ---------------------------------------------------------------------------
// Rubrique 4 : pesées et traçabilité — volet saisie communale.
//
// Ce qui n'y figure pas, et pourquoi : l'import ANGeD (B4.1) et le recoupement
// avec leurs chiffres (B4.3). L'interopérabilité avec leur plateforme n'est pas
// possible aujourd'hui. Le registre est bâti pour les accueillir sans migration
// le jour venu.
// ---------------------------------------------------------------------------

const TYPES_DECHET_DOC = ['menager', 'vert', 'ddc', 'encombrant', 'metal', 'tri', 'autre'] as const;

// « Pesee » est déjà pris : c'est le ticket du pont-bascule de l'ANGeD,
// déclaré plus haut. Les deux objets coexistent parce que les deux réalités
// coexistent — un bon d'ANGeD et une ligne de registre communal ne sont pas la
// même chose, et les confondre sous un seul nom aurait fini par les confondre
// tout court.
const PeseeCommunale = registry.register(
  'PeseeCommunale',
  z.object({
    id: z.string().uuid(),
    commune_id: z.string(),
    date_pesee: z.string(),
    circuit_id: z.string().uuid().nullable(),
    circuit: z.string().nullable(),
    voyage: z.number().int(),
    vehicule_id: z.string().nullable(),
    vehicule_immat: z.string().nullable(),
    engin: z.string().nullable(),
    charge_utile_t: z.number().nullable(),
    type_dechet: z.enum(TYPES_DECHET_DOC),
    poids_net_kg: z.number(),
    poids_brut_kg: z.number().nullable(),
    poids_tare_kg: z.number().nullable(),
    tonnage_t: z.number().nullable(),
    surcharge: z.boolean().openapi({
      description:
        "Le poids dépasse la charge utile de l'engin. Une décimale déplacée donne ce résultat ; une surcharge réelle aussi. Les deux appellent une action, mais pas la même.",
    }),
    destination: z.string().nullable(),
    bon_numero: z.string().nullable(),
    observation: z.string().nullable(),
    source: z.enum(['saisie_communale', 'anged', 'prestataire']).openapi({
      description:
        "N'a qu'une valeur aujourd'hui, et c'est voulu : la colonne évite la migration du jour où l'ANGeD ouvrira ses données.",
    }),
  })
);

const peseeSchemaDoc = z.object({
  datePesee: z.string().optional(),
  circuitId: z.string().uuid().nullable().optional(),
  voyage: z.number().int().optional(),
  vehiculeId: z.string().nullable().optional(),
  vehiculeImmat: z.string().nullable().optional(),
  typeDechet: z.enum(TYPES_DECHET_DOC).optional(),
  poidsNetKg: z.number(),
  poidsBrutKg: z.number().nullable().optional(),
  poidsTareKg: z.number().nullable().optional(),
  destination: z.string().nullable().optional(),
  bonNumero: z.string().nullable().optional(),
  observation: z.string().nullable().optional(),
});

const PeseeAttendue = registry.register(
  'PeseeAttendue',
  z
    .object({
      circuit_id: z.string().uuid(),
      circuit: z.string(),
      voyage: z.number().int(),
      type_dechet: z.string().nullable(),
      vehicule_id: z.string().nullable(),
      vehicule_immat: z.string().nullable(),
      pesee_id: z.string().uuid().nullable(),
      poids_net_kg: z.number().nullable(),
    })
    .openapi({
      description:
        "Un voyage attendu ce jour-là, avec sa pesée quand elle existe. pesee_id nul = reste à saisir. Rend les trous, pas les réussites.",
    })
);

const TonnageCircuit = registry.register(
  'TonnageCircuit',
  z.object({
    circuit_id: z.string().uuid().nullable(),
    circuit: z.string(),
    type_dechet: z.string(),
    pesees: z.number().int(),
    tonnage_t: z.number(),
    moyenne_t: z.number(),
  })
);

const TonnageMensuel = registry.register(
  'TonnageMensuel',
  z.object({
    annee: z.number().int(),
    mois: z.number().int(),
    tonnage_t: z.number(),
    pesees: z.number().int(),
    kg_hab_jour: z.number().nullable().openapi({
      description:
        'Production spécifique. NULL quand la population est inconnue : une division par zéro déguisée en « 0 kg/hab » serait pire que pas de chiffre.',
    }),
  })
);

const idPesee = z.string().uuid().openapi({ param: { name: 'id', in: 'path' } });

registry.registerPath({
  method: 'get',
  path: '/pesees',
  tags: ['Pesées'],
  summary: 'Registre des pesées',
  description: 'Les trente derniers jours par défaut : la question du matin porte sur la semaine écoulée, pas sur trois ans.',
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      depuis: z.string().optional(),
      jusqua: z.string().optional(),
      circuitId: z.string().uuid().optional(),
      typeDechet: z.enum(TYPES_DECHET_DOC).optional(),
    }),
  },
  responses: { 200: json(z.array(PeseeCommunale), 'Pesées.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/pesees/attendues',
  tags: ['Pesées'],
  summary: 'Ce qu’il reste à peser aujourd’hui',
  description:
    "La route qui décide si le registre sera tenu ou non. Elle rend les voyages ATTENDUS d'après les jours de passage et le nombre de voyages de la fiche, avec la pesée en face quand elle existe. Les circuits confiés à un prestataire en sont exclus : ce n'est pas la commune qui pèse ses tonnages.",
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional(), jour: z.string().optional() }) },
  responses: { 200: json(z.array(PeseeAttendue), 'Voyages attendus.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/pesees/tonnages',
  tags: ['Pesées'],
  summary: 'Tonnage par circuit et par flux',
  security: SECURISE,
  request: {
    query: z.object({ communeId: paramCommuneId.optional(), depuis: z.string().optional(), jusqua: z.string().optional() }),
  },
  responses: { 200: json(z.array(TonnageCircuit), 'Tonnages.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/pesees/mensuel',
  tags: ['Pesées'],
  summary: 'Tonnage mensuel et production spécifique',
  description: 'La saisonnalité demandée à l’axe 1 des indicateurs, et les kg par habitant et par jour — le seul chiffre qui permette de se comparer à une commune de taille différente.',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional(), annee: z.string().optional() }) },
  responses: { 200: json(z.array(TonnageMensuel), 'Tonnage mensuel.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/pesees/coherence',
  tags: ['Pesées'],
  summary: 'Ce que les pesées font apparaître',
  description:
    "Croisé avec le parc et les circuits : tonnage au-dessus de la charge utile, pesée un jour sans passage, engin déclaré en panne, immatriculation introuvable, circuit sans aucune pesée depuis trente jours.",
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: { 200: json(z.array(Incoherence), 'Points à vérifier.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/pesees',
  tags: ['Pesées'],
  summary: 'Saisir une pesée',
  description:
    "Seul le poids NET est obligatoire : c'est celui que l'agent a sous les yeux. Brut et tare ne se demandent que s'il a le bon du pont-bascule ; les réclamer sinon produit des tares inventées. Quand les trois sont donnés, la base vérifie qu'ils s'accordent.",
  security: SECURISE,
  request: {
    query: z.object({ communeId: paramCommuneId.optional() }),
    body: { content: { 'application/json': { schema: peseeSchemaDoc } } },
  },
  responses: { 201: json(PeseeCommunale, 'Pesée enregistrée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/pesees/{id}',
  tags: ['Pesées'],
  summary: 'Une pesée',
  security: SECURISE,
  request: { params: z.object({ id: idPesee }) },
  responses: { 200: json(PeseeCommunale, 'Pesée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/pesees/{id}',
  tags: ['Pesées'],
  summary: 'Corriger une pesée',
  security: SECURISE,
  request: {
    params: z.object({ id: idPesee }),
    body: { content: { 'application/json': { schema: peseeSchemaDoc.partial() } } },
  },
  responses: { 200: json(PeseeCommunale, 'Pesée corrigée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/pesees/{id}',
  tags: ['Pesées'],
  summary: 'Annuler une pesée',
  description:
    "Suppression logique. Un registre numérique conforme au décret (B4.5) ne peut pas perdre de lignes : une pesée annulée reste, datée et imputée.",
  security: SECURISE,
  request: { params: z.object({ id: idPesee }) },
  responses: { 204: { description: 'Pesée annulée.' }, ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/circuits/{id}/trace',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Retirer l’itinéraire importé',
  description:
    "Se tromper de fichier est banal — deux relevés du même secteur, deux voyages du même matin. Sans cette route, l'erreur se payait d'une reprise à la main. La géométrie et sa provenance repartent à zéro ensemble : une provenance qui survit à ce qu'elle décrivait ment.",
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }) }) },
  responses: { 204: { description: 'Itinéraire retiré.' }, ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/circuits/{id}/points',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Retirer tous les arrêts importés',
  description:
    "Suppression LOGIQUE : un arrêt retiré aujourd'hui doit rester lisible dans un contrôle terrain d'il y a trois semaines. Seule la provenance est réellement effacée. Rend le nombre d'arrêts retirés.",
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }) }) },
  responses: {
    200: json(z.object({ retires: z.number().int() }), 'Arrêts retirés.'),
    ...REPONSES_COMMUNES,
  },
});

// --- Module 2 : points de collecte -----------------------------------------

const PointCollecte = registry.register(
  'PointCollecte',
  z
    .object({
      id: z.string().uuid(),
      circuit_id: z.string().uuid(),
      commune_id: z.string(),
      voyage: z.number().int().openapi({
        description: "Rotation à laquelle l'arrêt appartient. Déduite des repères « début collecte » du relevé, 1 sinon.",
      }),
      ordre: z.number().int().openapi({ description: "Rang dans l'ordre de passage, à l'intérieur du voyage." }),
      circuit_nom: z.string().nullable(),
      nom: z.string().nullable(),
      type: z
        .enum([
          'porte_a_porte',
          'point_de_collecte',
          'debut_collecte',
          'fin_collecte',
          'point_noir',
          'centre_transfert',
          'hors_conteneur',
          'parc_municipal',
          'autre',
        ])
        .openapi({ description: 'Vocabulaire relevé sur le terrain à Dar Chaabane, non une nomenclature inventée.' }),
      lat: z.number(),
      lng: z.number(),
      precision_m: z.number().nullable().openapi({
        description: "Précision du relevé GPS, en mètres. À 3 m on désigne une porte, à 20 m un côté de rue : l'effacer prêterait au point une exactitude qu'il n'a pas.",
      }),
      heure_observee: z.string().nullable().openapi({
        description: "Heure constatée lors d'un suivi GPS. Jamais renseignée à partir d'une estimation.",
      }),
      heure_estimee: z.string().nullable().openapi({
        description: "Heure attendue, saisie par la commune. Coexiste avec l'observée : on ne remplace pas une mesure par une estimation.",
      }),
      observation: z.string().nullable(),
      source: z.enum(['import_kml', 'saisie']),
      actif: z.boolean(),
    })
    .passthrough()
    .openapi('PointCollecte')
);

const ApercuImport = registry.register(
  'ApercuImport',
  z
    .object({
      fichier: z.string(),
      cible: z.enum(['auto', 'trace', 'points']),
      poseraPoints: z.boolean(),
      poseraTrace: z.boolean(),
      famille: z
        .enum(['waypoints', 'trace_gps', 'itineraire_dessine', 'gpx', 'geojson', 'inconnu'])
        .openapi({
        description:
          'waypoints = relevé d\'arrêts (GPS Waypoints) ; trace_gps = trajet suivi (My Tracks) ; itineraire_dessine = KMZ tracé à la main.',
      }),
      nomReleve: z.string().nullable(),
      nbPoints: z.number().int(),
      nbVoyages: z.number().int(),
      nbSommetsTrace: z.number().int(),
      statistiques: z.record(z.string()).openapi({ description: 'Ce que le fichier dit de lui-même, repris sans retouche.' }),
      avertissements: z.array(z.string()).openapi({
        description: "Ce qui a été écarté et pourquoi. À montrer avant validation, pas après.",
      }),
      points: z.array(z.any()),
      ecrit: z.boolean().openapi({ description: 'false en aperçu : la base n\'a pas été touchée.' }),
      crees: z.number().int().optional(),
      remplaces: z.number().int().optional(),
    })
    .passthrough()
    .openapi('ApercuImport')
);

const pointCreateSchema = z.object({
  nom: z.string().optional(),
  type: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  voyage: z.number().int().optional(),
  ordre: z.number().int().optional(),
  heureEstimee: z.string().optional(),
  observation: z.string().optional(),
});

const importKmlSchema = z.object({
  nomFichier: z.string(),
  contenu: z.string().openapi({ description: 'Le fichier KML ou KMZ encodé en base64.' }),
  valider: z.boolean().optional().openapi({
    description: "false (défaut) : aperçu, rien n'est écrit. true : les arrêts sont créés.",
  }),
  remplacer: z.boolean().optional(),
  cible: z.enum(['auto', 'trace', 'points']).optional().openapi({
    description:
      "Ce que l'on pose. Un circuit a un itinéraire ET des arrêts, qui arrivent dans des fichiers distincts. « auto » prend tout ce que le fichier contient ; « trace » et « points » n'en prennent qu'une part, et signalent ce qui est ignoré.",
  }),
});


registry.registerPath({
  method: 'get',
  path: '/communes/{id}/coherence',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Écarts entre le registre des circuits et l’inventaire du parc',
  description:
    "Recoupe les deux registres et pose des questions datées : un circuit confié à un engin en panne, une immatriculation introuvable au parc, un circuit sans arrêt, un engin immobilisé sans motif. Ne corrige rien — une plateforme qui nettoierait ces écarts seule ferait disparaître le seul signal disponible sur la qualité des données.",
  security: SECURISE,
  // « paramCommuneId » est un paramètre NOMMÉ « communeId » : le réutiliser
  // pour un segment d'URL appelé « id » fait entrer en collision deux noms
  // dans le document OpenAPI. On décrit donc le paramètre de chemin en clair.
  request: {
    params: z.object({
      id: z.string().openapi({ description: 'Identifiant de la commune.', example: 'nabeul_dar_chaabane_el_fehri' }),
    }),
  },
  responses: {
    200: json(z.array(Incoherence), 'Écarts constatés.'),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'get',
  path: '/circuits/points',
  tags: ['Circuits et contrôle terrain'],
  summary: "Tous les arrêts d'une commune, tous circuits confondus",
  description:
    "Sert la carte communale : c'est la vue qu'on ouvre pour savoir ce qui est desservi et ce qui ne l'est pas.",
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: { 200: json(z.array(PointCollecte), 'Arrêts de la commune.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'get',
  path: '/circuits/{id}/points',
  tags: ['Circuits et contrôle terrain'],
  summary: "Arrêts d'un circuit, dans l'ordre de passage",
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: json(z.array(PointCollecte), 'Arrêts du circuit.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'post',
  path: '/circuits/{id}/points',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Ajouter un arrêt',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: pointCreateSchema } } },
  },
  responses: { 201: json(PointCollecte, 'Arrêt créé.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/circuits/{id}/points/{pointId}',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Modifier un arrêt',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid(), pointId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: pointCreateSchema.partial() } } },
  },
  responses: { 200: json(PointCollecte, 'Arrêt modifié.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/circuits/{id}/points/{pointId}',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Supprimer un arrêt',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid(), pointId: z.string().uuid() }) },
  responses: { 204: { description: 'Arrêt supprimé.' }, ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/circuits/{id}/import-kml',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Importer un relevé KML ou KMZ',
  description:
    "En deux temps. Sans « valider », la réponse décrit ce qui serait créé sans rien écrire : un relevé de Dar Chaabane porte jusqu'à 113 arrêts, et les écrire au premier clic obligerait à défaire à la main ce qu'on n'a pas relu.",
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: importKmlSchema } } },
  },
  responses: {
    200: json(ApercuImport, "Aperçu : rien n'a été écrit."),
    201: json(ApercuImport, 'Arrêts créés.'),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'get',
  path: '/circuits/{id}/historique',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Historique des modifications du circuit et de ses arrêts',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: json(
      z.array(
        z.object({
          operation: z.string(),
          changed_at: z.string(),
          changed_by_role: z.string().nullable(),
          changed_fields: z.array(z.string()).nullable(),
          auteur: z.string().nullable(),
          old_data: z.any().nullable(),
          new_data: z.any().nullable(),
        })
      ),
      'Journal des modifications.'
    ),
    ...REPONSES_COMMUNES,
  },
});

const ControleTerrain = registry.register(
  'ControleTerrain',
  z
    .object({
      id: z.string().uuid(),
      circuit_id: z.string().uuid(),
      circuit_nom: z.string().optional(),
      commune_id: z.string(),
      date_controle: z.string(),
      voyage: z.number().int().openapi({
        description: 'Rang de la rotation contrôlée. Un circuit à voyage unique garde toujours 1 (migration 029).',
      }),
      etat: z.enum(['fait', 'partiel', 'non_fait']),
      remarque: z.string().nullable(),
      photo_url: z.string().nullable(),
      controle_par: z.string().uuid().nullable(),
    })
    .passthrough()
    .openapi('ControleTerrain')
);

const PerformancePrestataire = registry.register(
  'PerformancePrestataire',
  z
    .object({
      prestataire_id: z.string().uuid(),
      prestataire_nom: z.string(),
      commune_id: z.string(),
      circuits: z.number().int(),
      passages_attendus: z.number().int().openapi({ description: "Déduits des jours de passage déclarés, bornés à la période de service du circuit : rien n'est dû avant sa date de début ni après sa date de fin." }),
      controles_saisis: z.number().int(),
      controles_fait: z.number().int(),
      controles_partiel: z.number().int(),
      controles_non_fait: z.number().int(),
      taux_realisation: z.number().nullable().openapi({ description: 'Part des passages contrôlés jugés faits, un passage partiel comptant pour moitié.' }),
      taux_couverture: z.number().nullable().openapi({ description: "Part des passages prévus qui ont été contrôlés. Sans elle, 100 % sur deux contrôles paraîtrait excellent." }),
      reclamations_transferees: z.number().int(),
      reclamations_traitees: z.number().int(),
      delai_moyen_heures: z.number().nullable(),
    })
    .openapi('PerformancePrestataire')
);

registry.registerPath({
  method: 'get',
  path: '/circuits',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Circuits de collecte',
  description:
    'Un circuit est une tournée, distincte de la zone qui est un territoire. Le prestataire ne voit que les circuits qui lui sont confiés.',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: { 200: json(z.array(Circuit), 'Circuits visibles.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'post',
  path: '/circuits',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Créer un circuit',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: circuitCreateSchema } } } },
  responses: { 201: json(Circuit, 'Circuit créé.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/circuits/{id}',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Modifier un circuit',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: circuitUpdateSchema } } },
  },
  responses: { 200: json(Circuit, 'Circuit modifié.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/circuits/{id}',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Supprimer un circuit',
  description: 'Suppression logique : le circuit et son historique de contrôles restent conservés.',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Circuit supprimé.' }, ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/circuits/controles',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Enregistrer un constat de terrain',
  description:
    "Un constat par circuit et par jour : un second envoi sur la même date corrige le premier plutôt que d'empiler deux vérités contradictoires. Réservé à la commune — le prestataire évalué ne peut pas modifier son propre constat, il peut seulement le lire pour le contester.",
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: controleSchema } } } },
  responses: { 201: json(ControleTerrain, 'Constat enregistré.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/circuits/controles',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Historique des constats',
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      depuis: z.string().optional().openapi({ param: { name: 'depuis', in: 'query' }, example: '2026-09-01' }),
    }),
  },
  responses: { 200: json(z.array(ControleTerrain), 'Constats visibles.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'get',
  path: '/circuits/performance',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Performance des prestataires',
  description:
    "Croise les constats de terrain et le traitement des réclamations, en gardant les deux sources SÉPARÉES. Un score unique masquerait qu'une commune sans application citoyenne n'a tout simplement pas de réclamations — et ferait passer son prestataire pour exemplaire.",
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      depuis: z.string().optional().openapi({ param: { name: 'depuis', in: 'query' } }),
      jusqua: z.string().optional().openapi({ param: { name: 'jusqua', in: 'query' } }),
    }),
  },
  responses: { 200: json(z.array(PerformancePrestataire), 'Performance sur la période.'), 401: REPONSES_COMMUNES[401] },
});

// --- Espace prestataire : passages, incidents, confrontation ---------------

const DeclarationPassage = registry.register(
  'DeclarationPassage',
  z
    .object({
      id: z.string().uuid(),
      circuit_id: z.string().uuid(),
      circuit_nom: z.string().optional(),
      commune_id: z.string(),
      date_passage: z.string(),
      voyage: z.number().int().openapi({
        description: 'Rang de la rotation déclarée. Un circuit à voyage unique garde toujours 1 (migration 029).',
      }),
      statut: z.enum(['effectue', 'partiel', 'impossible']),
      heure_debut: z.string().nullable(),
      heure_fin: z.string().nullable(),
      mode_saisie: z.enum(['terrain', 'bureau']).openapi({
        description: 'Conditions de la déclaration. Une saisie faite au bureau le soir n’a pas la force d’un relevé horodaté sur place.',
      }),
      position_source: z.enum(['appareil', 'saisie', 'absente']).openapi({
        description: 'Origine de la position. Une position annoncée comme relevée par l’appareil mais absente serait un mensonge silencieux dans une pièce qui sert de preuve : le serveur la force à « absente ».',
      }),
      agent_nom: z.string().nullable().openapi({ description: 'Agent ayant effectué la tournée, tant que les chauffeurs n’ont pas de compte individuel.' }),
      photo_url: z.string().nullable(),
      remarque: z.string().nullable(),
    })
    .passthrough()
    .openapi('DeclarationPassage')
);

const Incident = registry.register(
  'Incident',
  z
    .object({
      id: z.string().uuid(),
      commune_id: z.string(),
      circuit_id: z.string().uuid().nullable(),
      circuit_nom: z.string().nullable().optional(),
      date_incident: z.string(),
      type: z.enum(['acces_bloque', 'point_sature', 'panne_vehicule', 'dechets_non_conformes', 'decharge_fermee', 'autre']),
      description: z.string().nullable(),
      photo_url: z.string().nullable(),
      statut: z.enum(['ouvert', 'pris_en_compte', 'clos']),
      reponse_commune: z.string().nullable().optional(),
    })
    .passthrough()
    .openapi('Incident')
);

const LigneConfrontation = registry.register(
  'LigneConfrontation',
  z
    .object({
      circuit_id: z.string().uuid(),
      circuit_nom: z.string(),
      commune_id: z.string(),
      prestataire_nom: z.string().nullable(),
      jour: z.string(),
      declaration: z.string().nullable().openapi({ description: 'Ce que le prestataire a déclaré.' }),
      constat: z.string().nullable().openapi({ description: 'Ce que la commune a constaté.' }),
      incident: z.string().nullable().openapi({ description: 'Incident signalé ce jour-là, qui peut expliquer un passage manqué.' }),
      situation: z.enum(['concordant', 'divergent', 'non_controle', 'non_declare', 'silence']),
      mode_saisie: z.string().nullable(),
      position_source: z.string().nullable(),
    })
    .openapi('LigneConfrontation')
);

registry.registerPath({
  method: 'post',
  path: '/passages',
  tags: ['Espace prestataire'],
  summary: 'Déclarer un passage',
  description:
    'Le registre du prestataire, symétrique du constat de la commune. Une déclaration par circuit et par jour ; un second envoi corrige le premier.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: passageSchema } } } },
  responses: { 201: json(DeclarationPassage, 'Passage déclaré.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/passages',
  tags: ['Espace prestataire'],
  summary: 'Historique des passages déclarés',
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      depuis: z.string().optional().openapi({ param: { name: 'depuis', in: 'query' } }),
    }),
  },
  responses: { 200: json(z.array(DeclarationPassage), 'Passages visibles.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'post',
  path: '/passages/incidents',
  tags: ['Espace prestataire'],
  summary: 'Signaler un incident de terrain',
  description:
    "Accès bloqué, point saturé, panne : des faits qui ne relèvent pas du prestataire et qui expliquent qu'un passage n'ait pas eu lieu. Sans ce canal, la commune compte un manquement qui ne lui est pas imputable — et le prestataire retourne à WhatsApp.",
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: incidentSchema } } } },
  responses: { 201: json(Incident, 'Incident signalé.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/passages/incidents',
  tags: ['Espace prestataire'],
  summary: 'Incidents signalés',
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      statut: z.enum(['ouvert', 'pris_en_compte', 'clos']).optional().openapi({ param: { name: 'statut', in: 'query' } }),
    }),
  },
  responses: { 200: json(z.array(Incident), 'Incidents visibles.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'patch',
  path: '/passages/incidents/{id}',
  tags: ['Espace prestataire'],
  summary: 'Répondre à un incident',
  description: 'Prise en charge par la commune. Le prestataire qui a signalé ne peut pas clore lui-même.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: reponseIncidentSchema } } },
  },
  responses: { 200: json(Incident, 'Incident mis à jour.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/passages/confrontation',
  tags: ['Espace prestataire'],
  summary: 'Confronter les deux registres',
  description:
    "Pour chaque passage prévu : ce que le prestataire a déclaré face à ce que la commune a constaté. Quand les deux concordent, l'affaire est réglée. Quand elles divergent, on n'a plus une parole contre une autre mais un désaccord daté, localisé et photographié — donc arbitrable.",
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      depuis: z.string().optional().openapi({ param: { name: 'depuis', in: 'query' } }),
      jusqua: z.string().optional().openapi({ param: { name: 'jusqua', in: 'query' } }),
    }),
  },
  responses: { 200: json(z.array(LigneConfrontation), 'Confrontation sur la période.'), 401: REPONSES_COMMUNES[401] },
});

const Contrat = registry.register(
  'Contrat',
  z
    .object({
      commune_id: z.string(),
      commune_nom: z.string(),
      commune_nom_ar: z.string().nullable(),
      contrat_reference: z.string().nullable(),
      date_debut: z.string().nullable(),
      date_fin: z.string().nullable().openapi({
        description: 'Passée, le rattachement ne donne plus aucun accès aux données de la commune.',
      }),
      actif: z.boolean(),
    })
    .openapi('Contrat')
);

registry.registerPath({
  method: 'get',
  path: '/passages/mes-contrats',
  tags: ['Espace prestataire'],
  summary: 'Mes communes sous contrat',
  description:
    'Un prestataire peut travailler pour plusieurs communes avec un seul compte. C’est la contrepartie de la traçabilité : des comptes partagés rendraient les déclarations inattribuables.',
  security: SECURISE,
  responses: { 200: json(z.array(Contrat), 'Contrats du prestataire connecté.'), 401: REPONSES_COMMUNES[401] },
});


// --- Espace citoyen : adresse, horaires, annonces, carte publique ----------

const AdresseCitoyen = registry.register(
  'AdresseCitoyen',
  z
    .object({
      citizen_id: z.string().uuid(),
      commune_id: z.string().nullable(),
      adresse: z.string().nullable(),
      zone_id: z.string().uuid().nullable().openapi({
        description:
          'Zone de collecte contenant le domicile. NULL si la commune n’a pas encore découpé son territoire — les horaires sont alors donnés à l’échelle de la commune.',
      }),
      lat: z.number().nullable(),
      lng: z.number().nullable(),
    })
    .passthrough()
    .openapi('AdresseCitoyen')
);

const HoraireCollecte = registry.register(
  'HoraireCollecte',
  z
    .object({
      circuit_id: z.string().uuid(),
      circuit_nom: z.string(),
      type_dechet: z.string().nullable(),
      jours_passage: z.array(z.number().int()).openapi({
        description: 'Jours de passage prévus, 1 = lundi … 7 = dimanche.',
        example: [1, 3, 5],
      }),
      precision_source: z.enum(['zone', 'commune']).openapi({
        description:
          'zone : l’adresse tombe dans une zone de collecte, l’horaire la concerne précisément. commune : aucun découpage applicable, tous les circuits de la commune sont listés. Le front doit rendre la différence visible — un horaire imprécis affiché comme exact fait sortir les poubelles le mauvais jour.',
      }),
      prochain_passage: z.string().nullable().openapi({
        description: 'Prochaine date de passage, annonces de suppression et de report déjà déduites.',
      }),
      annonce_type: z.enum(['suppression', 'report', 'ajout', 'information']).nullable(),
      annonce_message: z.string().nullable(),
      annonce_message_ar: z.string().nullable(),
      annonce_date: z.string().nullable(),
    })
    .openapi('HoraireCollecte')
);

const AnnonceCollecte = registry.register(
  'AnnonceCollecte',
  z
    .object({
      id: z.string().uuid(),
      commune_id: z.string(),
      circuit_id: z.string().uuid().nullable().openapi({
        description: 'NULL : l’annonce porte sur toute la commune.',
      }),
      type: z.enum(['suppression', 'report', 'ajout', 'information']),
      date_debut: z.string(),
      date_fin: z.string(),
      date_report: z.string().nullable(),
      message_fr: z.string(),
      message_ar: z.string().nullable(),
      publiee: z.boolean(),
    })
    .passthrough()
    .openapi('AnnonceCollecte')
);

const PointCartePublique = registry.register(
  'PointCartePublique',
  z
    .object({
      id: z.string().uuid(),
      commune_id: z.string(),
      categorie: z.string(),
      statut: z.string(),
      titre: z.string(),
      lat: z.number().nullable().openapi({
        description: 'Position arrondie à une grille d’environ 110 m. L’arrondi est fait en base : aucune coordonnée exacte ne sort du serveur.',
      }),
      lng: z.number().nullable(),
      photo_url: z.string().nullable().openapi({
        description: 'Présente uniquement si la commune a validé la photo pour publication.',
      }),
      signale_le: z.string(),
      resolu_le: z.string().nullable(),
      delai_jours: z.number().int().nullable(),
    })
    .openapi('PointCartePublique')
);

registry.registerPath({
  method: 'post',
  path: '/citoyen/adresse',
  tags: ['Espace citoyen'],
  summary: 'Déclarer son adresse',
  description:
    'Le lien qui manquait entre un compte citoyen et un circuit de collecte. Sans adresse, « quand passe-t-on chez moi ? » n’a pas de réponse.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: adresseSchema } } } },
  responses: { 200: json(AdresseCitoyen, 'Adresse enregistrée, zone résolue.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/citoyen/adresse',
  tags: ['Espace citoyen'],
  summary: 'Mon adresse',
  security: SECURISE,
  responses: { 200: json(AdresseCitoyen, 'Adresse du citoyen connecté.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/citoyen/horaires',
  tags: ['Espace citoyen'],
  summary: 'Quand passe-t-on chez moi ?',
  description:
    'La question qui fait installer l’application. Les circuits desservant l’adresse déclarée, leurs jours de passage, la date du prochain passage — annonces de report et de suppression déjà prises en compte.',
  security: SECURISE,
  request: {
    query: z.object({
      jours: z.string().optional().openapi({
        param: { name: 'jours', in: 'query' },
        description: 'Fenêtre de calcul du prochain passage, en jours (1 à 60, par défaut 14).',
      }),
    }),
  },
  responses: { 200: json(z.array(HoraireCollecte), 'Horaires de collecte.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/citoyen/annonces',
  tags: ['Espace citoyen'],
  summary: 'Annoncer un changement de collecte',
  description:
    'Jour férié, panne de benne, route coupée. Un calendrier théorique que la réalité dément une fois sur trois cesse d’être consulté.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: annonceSchema } } } },
  responses: { 201: json(AnnonceCollecte, 'Annonce publiée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/citoyen/annonces',
  tags: ['Espace citoyen'],
  summary: 'Annonces en cours',
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      archivees: z.enum(['true', 'false']).optional().openapi({ param: { name: 'archivees', in: 'query' } }),
    }),
  },
  responses: { 200: json(z.array(AnnonceCollecte), 'Annonces visibles.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'patch',
  path: '/citoyen/annonces/{id}',
  tags: ['Espace citoyen'],
  summary: 'Corriger une annonce',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: majAnnonceSchema } } },
  },
  responses: { 200: json(AnnonceCollecte, 'Annonce mise à jour.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/citoyen/annonces/{id}',
  tags: ['Espace citoyen'],
  summary: 'Retirer une annonce',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Annonce retirée (suppression logique, conservée au journal).' }, ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/citoyen/carte',
  tags: ['Espace citoyen'],
  summary: 'Carte publique des signalements',
  description: [
    'Seule route ouverte sans authentification, avec la connexion et l’inscription.',
    '',
    'Couverture complète, identification nulle : tous les signalements des communes actives,',
    'tous les statuts — mais ni nom, ni téléphone, ni description en texte libre, une position',
    'arrondie à environ 110 m et une photo publiée seulement si la commune l’a validée.',
    'Le filtrage est fait en base, dans une fonction : un garde-fou qu’on peut contourner en',
    'écrivant une autre requête n’en est pas un (décret-loi n° 2022-54, principe de minimisation).',
  ].join('\n'),
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      depuis: z.string().optional().openapi({ param: { name: 'depuis', in: 'query' } }),
    }),
  },
  responses: { 200: json(z.array(PointCartePublique), 'Signalements publiés.') },
});

registry.registerPath({
  method: 'patch',
  path: '/citoyen/signalements/{id}/photo',
  tags: ['Espace citoyen'],
  summary: 'Valider la photo d’un signalement pour publication',
  description:
    'La commune vérifie qu’on n’y voit ni visage, ni plaque, ni intérieur privé. Un clic dans l’écran de traitement : elle regarde déjà la photo pour instruire le signalement.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: photoSchema } } },
  },
  responses: { 200: json(z.any(), 'Statut de publication mis à jour.'), ...REPONSES_COMMUNES },
});

// --- Notifications push (Jalon 2, lot 1) ------------------------------------
//
// Le citoyen s'abonne lui-même : aucune de ces routes n'est ouverte à une
// commune, qui n'a par ailleurs aucun moyen de lister les abonnés (voir le
// tag Communication et la migration 044).

registry.registerPath({
  method: 'get',
  path: '/citoyen/push/cle-publique',
  tags: ['Espace citoyen'],
  summary: 'Clé publique VAPID',
  description:
    "Publique par nature (elle est faite pour être distribuée aux navigateurs) : ne pas la coder en dur côté front permet de la faire tourner sans nouvelle mise en production. Rend `null` tant qu'aucune clé n'est configurée côté serveur — l'abonnement reste alors impossible, sans faire échouer le reste de l'application.",
  security: SECURISE,
  responses: { 200: json(z.object({ clePublique: z.string().nullable() }), 'Clé publique.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/citoyen/push/souscriptions',
  tags: ['Espace citoyen'],
  summary: 'Enregistrer ce navigateur pour les notifications push',
  description:
    "Un même navigateur qui se réabonne remplace sa fiche plutôt que d'en accumuler une seconde (contrainte d'unicité sur l'endpoint).",
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: souscriptionSchema } } } },
  responses: { 201: json(z.object({ ok: z.boolean() }), 'Souscription enregistrée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/citoyen/push/souscriptions',
  tags: ['Espace citoyen'],
  summary: 'Retirer ce navigateur des notifications push',
  security: SECURISE,
  request: {
    body: { content: { 'application/json': { schema: z.object({ endpoint: z.string() }) } } },
  },
  responses: { 204: { description: 'Souscription retirée.' }, ...REPONSES_COMMUNES },
});

// --- Historique « Mes notifications » et préférences (M6) -------------------
//
// L'historique est écrit même quand rien n'a été envoyé (désabonné,
// préférence désactivée, aucun navigateur) : voir la migration 044 et
// services/notifications.ts. Ces routes ne renvoient jamais que les lignes
// du citoyen appelant — la politique RLS s'en charge, pas un filtre ici.

const CANAUX_NOTIFICATION = ['push', 'sms', 'email'] as const;
const TYPES_NOTIFICATION_OPENAPI = ['decision_reclamation', 'invitation_sondage', 'notification_ciblee'] as const;

const NotificationCitoyen = registry.register(
  'NotificationCitoyen',
  z.object({
    id: z.string().uuid(),
    type: z.enum(TYPES_NOTIFICATION_OPENAPI),
    canal: z.literal('push'),
    titre: z.string(),
    corps: z.string(),
    metadata: z.record(z.any()).nullable(),
    lu: z.boolean(),
    statut: z.enum(['livre', 'echec', 'non_abonne', 'non_souhaite', 'sans_souscription']),
    date_envoi: z.string(),
  })
);

const PreferenceNotification = registry.register(
  'PreferenceNotification',
  z.object({
    canal: z.enum(CANAUX_NOTIFICATION),
    type: z.enum(TYPES_NOTIFICATION_OPENAPI),
    active: z.boolean(),
  })
);

registry.registerPath({
  method: 'get',
  path: '/citoyen/notifications',
  tags: ['Espace citoyen'],
  summary: 'Mon historique de notifications',
  description:
    'Chronologique, y compris les tentatives qui n’ont rien envoyé (désabonné, préférence désactivée, aucun navigateur) : c’est l’historique réel, pas seulement les envois réussis.',
  security: SECURISE,
  request: { query: z.object({ nonLues: z.enum(['true', 'false']).optional() }) },
  responses: { 200: json(z.array(NotificationCitoyen), 'Notifications, plus récentes en premier.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'put',
  path: '/citoyen/notifications/{id}/lu',
  tags: ['Espace citoyen'],
  summary: 'Marquer une notification comme lue',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: json(z.object({ id: z.string().uuid(), lu: z.boolean() }), 'Notification mise à jour.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'put',
  path: '/citoyen/notifications/tout-lu',
  tags: ['Espace citoyen'],
  summary: 'Tout marquer comme lu',
  security: SECURISE,
  responses: { 200: json(z.object({ maj: z.number() }), 'Nombre de notifications marquées comme lues.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/citoyen/preferences',
  tags: ['Espace citoyen'],
  summary: 'Mes préférences de notification',
  description:
    'Une combinaison canal × type absente de la base vaut « activé » (table creuse, voir migration 044) : cette route complète toujours les 9 combinaisons, jamais un sous-ensemble.',
  security: SECURISE,
  responses: { 200: json(z.array(PreferenceNotification), 'Préférences effectives.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'put',
  path: '/citoyen/preferences',
  tags: ['Espace citoyen'],
  summary: 'Modifier mes préférences de notification',
  security: SECURISE,
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ preferences: z.array(PreferenceNotification).min(1) }),
        },
      },
    },
  },
  responses: { 204: { description: 'Préférences enregistrées.' }, ...REPONSES_COMMUNES },
});

// --- Flux occasionnels : déchets verts, DDC, encombrants ------------------
//
// Aucun circuit ne dessert ces déchets. Le citoyen demande un enlèvement à sa
// commune, qui répond par un montant et une date ou l'oriente vers un
// collecteur agréé ANGeD. Le recours au collecteur informel étant désormais
// illégal, ces routes sont l'alternative que l'interdiction suppose.

const CollecteurAgree = registry.register(
  'CollecteurAgree',
  z
    .object({
      id: z.string().uuid(),
      commune_id: z.string(),
      raison_sociale: z.string(),
      agrement_anged: z.string().nullable().openapi({
        description:
          'Référence de l’agrément ANGeD. Seule clé permettant de rapprocher un jour 350 annuaires communaux d’un référentiel national.',
      }),
      types_dechets: z.array(z.enum(['vert', 'ddc', 'encombrant', 'metal', 'autre'])),
      telephone: z.string().nullable(),
      email: z.string().nullable(),
      zone_intervention: z.string().nullable(),
      tarif_indicatif: z.string().nullable(),
      actif: z.boolean(),
    })
    .passthrough()
    .openapi('CollecteurAgree')
);

const DemandeEnlevement = registry.register(
  'DemandeEnlevement',
  z
    .object({
      id: z.string().uuid(),
      numero: z.string().openapi({ example: 'ENL-2026-48213' }),
      commune_id: z.string(),
      type_dechet: z.enum(['vert', 'ddc', 'encombrant', 'metal', 'autre']),
      volume_estime_m3: z.number().nullable().openapi({
        description: 'Estimation du citoyen, destinée à dimensionner la tournée — pas à facturer.',
      }),
      adresse: z.string().nullable(),
      acces: z.enum(['rue', 'cour', 'etage', 'difficile']).nullable(),
      statut: z.enum(['recue', 'planifiee', 'realisee', 'orientee_collecteur', 'refusee', 'annulee']),
      date_prevue: z.string().nullable(),
      montant_dt: z.number().nullable().openapi({
        description:
          'Montant annoncé par la commune. La plateforme n’affiche aucun tarif de son propre chef : très peu de communes disposent d’une grille votée.',
      }),
      reponse_commune: z.string().nullable(),
      collecteur_id: z.string().uuid().nullable(),
      // Dénormalisés dans la réponse : une orientation vers un collecteur sans
      // le numéro à composer laisse le citoyen exactement où il était.
      collecteur_nom: z.string().nullable().optional(),
      collecteur_telephone: z.string().nullable().optional(),
      date_realisation: z.string().nullable().optional(),
      paiement_statut: z.enum(['non_du', 'du', 'regle']),
      paiement_mode: z.enum(['espece', 'en_ligne', 'virement', 'autre']).nullable().optional(),
      created_at: z.string().optional(),
    })
    .passthrough()
    .openapi('DemandeEnlevement')
);

registry.registerPath({
  method: 'post',
  path: '/enlevements/collecteurs',
  tags: ['Flux occasionnels'],
  summary: 'Inscrire un collecteur agréé',
  description:
    'Annuaire tenu par chaque commune pour son territoire. Un citoyen à qui l’on interdit le collecteur informel sans lui montrer l’alternative légale ne change pas de pratique.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: collecteurSchema } } } },
  responses: { 201: json(CollecteurAgree, 'Collecteur inscrit.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/enlevements/collecteurs',
  tags: ['Flux occasionnels'],
  summary: 'Collecteurs agréés',
  description:
    'Lisible par tout utilisateur authentifié, y compris hors de la commune : un annuaire de service public n’est pas une donnée opérationnelle cloisonnée. Les fiches désactivées restent chez leur commune.',
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      type: z
        .enum(['vert', 'ddc', 'encombrant', 'metal', 'autre'])
        .optional()
        .openapi({ param: { name: 'type', in: 'query' } }),
    }),
  },
  responses: { 200: json(z.array(CollecteurAgree), 'Collecteurs visibles.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'patch',
  path: '/enlevements/collecteurs/{id}',
  tags: ['Flux occasionnels'],
  summary: 'Corriger une fiche collecteur',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: majCollecteurSchema } } },
  },
  responses: { 200: json(CollecteurAgree, 'Fiche mise à jour.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/enlevements/collecteurs/{id}',
  tags: ['Flux occasionnels'],
  summary: 'Retirer un collecteur de l’annuaire',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Retiré (suppression logique).' }, ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/enlevements',
  tags: ['Flux occasionnels'],
  summary: 'Demander un enlèvement',
  description:
    'Déchets verts, déchets de démolition et construction (DDC), encombrants : le citoyen décrit et localise, la commune répond avec un montant et une date. La demande est rattachée au compte connecté, jamais à un identifiant fourni par le client.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: demandeSchema } } } },
  responses: { 201: json(DemandeEnlevement, 'Demande enregistrée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/enlevements',
  tags: ['Flux occasionnels'],
  summary: 'Demandes visibles',
  description:
    'Un citoyen voit les siennes, une commune celles de son territoire. Une demande contient l’adresse d’un particulier et la date à laquelle il attend un camion : elle ne sort pas de ce périmètre.',
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      statut: z
        .enum(['recue', 'planifiee', 'realisee', 'orientee_collecteur', 'refusee', 'annulee'])
        .optional()
        .openapi({ param: { name: 'statut', in: 'query' } }),
    }),
  },
  responses: { 200: json(z.array(DemandeEnlevement), 'Demandes visibles.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'patch',
  path: '/enlevements/{id}',
  tags: ['Flux occasionnels'],
  summary: 'Répondre à une demande',
  description:
    'Montant, date, orientation vers un collecteur agréé, constat de paiement. Le paiement lui-même reste hors plateforme : la commune enregistre ce qu’elle a encaissé.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: reponseSchema } } },
  },
  responses: { 200: json(DemandeEnlevement, 'Demande mise à jour.'), ...REPONSES_COMMUNES },
});


// --- Découpage communal officiel -------------------------------------------

registry.registerPath({
  method: 'put',
  path: '/communes/{id}/frontiere',
  tags: ['Communes'],
  summary: 'Rectifier la limite d’une commune',
  description: [
    'Réservé à la FNCT, et la règle est portée par un déclencheur en base, pas par cette route :',
    'une commune qui pourrait redessiner sa propre limite pourrait s’attribuer un quartier voisin,',
    'avec ses signalements, ses tonnages et ses indicateurs.',
    '',
    'Le tracé est refusé s’il se recoupe, s’il sort du territoire tunisien ou s’il est vide.',
    'La superficie et la traçabilité (source, auteur, date) sont recalculées par la base.',
  ].join('\n'),
  security: SECURISE,
  request: {
    params: z.object({ id: paramCommuneId.openapi({ param: { name: 'id', in: 'path' } }) }),
    body: { content: { 'application/json': { schema: frontiereSchema } } },
  },
  responses: { 200: json(z.any(), 'Limite mise à jour.'), ...REPONSES_COMMUNES },
});

// ---------------------------------------------------------------------------
// Fichiers déposés
// ---------------------------------------------------------------------------

const USAGES_FICHIER = [
  'reclamation', 'preuve_traitement', 'constat_terrain', 'passage',
  'incident', 'suggestion_point', 'document_projet', 'enlevement',
  'rapport_etude', 'autre',
] as const;

const TYPES_MIME_FICHIER = [
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

const Fichier = registry.register(
  'Fichier',
  z.object({
    id: z.string().uuid(),
    commune_id: z.string(),
    nom_original: z.string().openapi({
      description:
        "Le nom tel que la personne l'a donné. Sert à proposer un nom au téléchargement ; ne construit jamais un chemin.",
    }),
    type_mime: z.enum(TYPES_MIME_FICHIER).openapi({
      description:
        "Déduit de la SIGNATURE BINAIRE au dépôt, jamais de ce que le client annonce. Un exécutable renommé « photo.jpg » est refusé (415). Les types Word/Excel/PowerPoint ne sont acceptés que pour l'usage « rapport_etude ».",
    }),
    taille_octets: z.number().int().openapi({
      description: "Taille APRÈS nettoyage des métadonnées, donc parfois inférieure au fichier envoyé.",
    }),
    sha256: z.string(),
    visibilite: z.enum(['commune', 'citoyen', 'publique']).openapi({
      description:
        "commune : le service, ses prestataires rattachés, la FNCT. citoyen : les mêmes, plus un citoyen nommément désigné — c'est ainsi que l'auteur d'une réclamation voit la photo « après traitement ». publique : tout le monde, sur décision de la commune uniquement.",
    }),
    destinataire_citoyen_id: z.string().uuid().nullable(),
    usage: z.enum(USAGES_FICHIER).nullable(),
    televerse_par: z.string().uuid().nullable(),
    created_at: z.string(),
  })
);

const FichierDepose = registry.register(
  'FichierDepose',
  Fichier.extend({
    url: z.string().openapi({ description: "Chemin de lecture des octets, à ranger dans la colonne photo_url du registre concerné." }),
    positionPhoto: z
      .object({ lat: z.number(), lng: z.number() })
      .nullable()
      .openapi({
        description:
          "Position que l'appareil avait écrite dans la photo. Elle est RENDUE mais jamais conservée : l'écran peut la proposer (« utiliser la position de la photo ? ») et ne l'enregistrer que si la personne accepte. La différence entre une donnée fournie et une donnée prélevée tient tout entière dans cette question posée.",
      }),
  })
);

registry.registerPath({
  method: 'post',
  path: '/fichiers',
  tags: ['Fichiers'],
  summary: 'Déposer une photo ou un document',
  description: [
    "Le fichier voyage en base64, comme le relevé KML du module 2 : une seule façon de poster dans toute l'API, et un appel qui se rejoue à la main.",
    '',
    "Le type est déterminé par les OCTETS, jamais par le nom ni par l'en-tête annoncé (415 sinon). Les métadonnées EXIF des photos — position GPS, modèle de l'appareil, nom du propriétaire — sont retirées avant écriture ; la position trouvée est rendue dans la réponse, à proposer à la personne plutôt qu'à enregistrer à son insu (décret-loi n° 2022-54).",
    '',
    'Plafond : 8 Mo une fois décodé (413 au-delà), 50 Mo pour un rapport ou une étude (usage « rapport_etude », seul à accepter aussi les documents Word, Excel et PowerPoint). Un citoyen dépose pour sa propre commune ; un agent, pour une commune où il écrit.',
  ].join('\n'),
  security: SECURISE,
  request: {
    query: z.object({ communeId: z.string().optional() }),
    body: { content: { 'application/json': { schema: fichierDepotSchema } } },
  },
  responses: { 201: json(FichierDepose, 'Fichier déposé.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/fichiers/occupation',
  tags: ['Fichiers'],
  summary: 'Ce que le volume porte pour une commune',
  description:
    "Par usage. Un stockage de fichiers sans moyen de savoir ce qu'il contient devient, en deux ans, un disque plein que personne n'ose toucher.",
  security: SECURISE,
  request: { query: z.object({ communeId: z.string().optional() }) },
  responses: {
    200: json(
      z.array(z.object({ usage: z.string(), nombre: z.number().int(), octets: z.number().int() })),
      'Occupation.'
    ),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'get',
  path: '/fichiers/{id}',
  tags: ['Fichiers'],
  summary: 'Lire les octets',
  description:
    "Servi avec le type réel et « nosniff » : un fichier déposé par un utilisateur ne doit jamais pouvoir être pris pour du HTML par un navigateur. Un fichier hors du périmètre de l'appelant est INTROUVABLE (404) et non refusé — un refus renseignerait sur son existence.",
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: 'Les octets.',
      content: {
        'image/jpeg': { schema: { type: 'string', format: 'binary' } as any },
        'image/png': { schema: { type: 'string', format: 'binary' } as any },
        'image/webp': { schema: { type: 'string', format: 'binary' } as any },
        'application/pdf': { schema: { type: 'string', format: 'binary' } as any },
      },
    },
    304: { description: 'Inchangé depuis la dernière lecture (ETag).' },
    503: { description: "La fiche existe, les octets sont introuvables sur le volume." },
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/fichiers/{id}',
  tags: ['Fichiers'],
  summary: 'Changer la visibilité',
  description:
    "Rendre une photo publique, ou l'en retirer. Décision de la commune, jamais du déposant : un citoyen ne peut pas rendre sa propre photo publique.",
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            visibilite: z.enum(['commune', 'citoyen', 'publique']),
            destinataireCitoyenId: z.string().uuid().nullable().optional(),
          }),
        },
      },
    },
  },
  responses: { 200: json(Fichier, 'Visibilité modifiée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/fichiers/{id}',
  tags: ['Fichiers'],
  summary: 'Retirer un fichier',
  description:
    "Retrait LOGIQUE. Les octets restent sur le volume : les effacer relève d'une purge datée, pas du geste d'un utilisateur. Tant qu'elle n'existe pas, mieux vaut un disque qui grossit qu'une pièce justificative qui disparaît d'un clic.",
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Fichier retiré.' }, ...REPONSES_COMMUNES },
});

// ---------------------------------------------------------------------------
// Rapports et études (TDR §3.2.9)
// ---------------------------------------------------------------------------

const CATEGORIES_RAPPORT = ['etude_technique', 'rapport_activite', 'audit', 'plan_action', 'autre'] as const;

const RapportEtude = registry.register(
  'RapportEtude',
  z.object({
    id: z.string().uuid(),
    commune_id: z.string(),
    titre: z.string(),
    categorie: z.enum(CATEGORIES_RAPPORT),
    auteur: z.string().nullable().openapi({
      description: "Déclaré en texte libre : un bureau d'études externe ou une direction régionale n'a pas de compte sur la plateforme.",
    }),
    date_document: z.string().nullable(),
    fichier_url: z.string().openapi({ description: 'Chemin de lecture des octets, rendu par POST /fichiers au dépôt.' }),
    nom_fichier: z.string(),
    type_mime: z.string().nullable(),
    taille_octets: z.number().int().nullable(),
    depose_par: z.string().uuid().nullable(),
    created_at: z.string(),
  })
);

registry.registerPath({
  method: 'get',
  path: '/rapports-etudes',
  tags: ['Rapports et études'],
  summary: "Liste des rapports et études d'une commune",
  security: SECURISE,
  request: {
    query: z.object({ communeId: z.string().optional(), categorie: z.enum(CATEGORIES_RAPPORT).optional() }),
  },
  responses: { 200: json(z.array(RapportEtude), 'Rapports et études.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/rapports-etudes',
  tags: ['Rapports et études'],
  summary: 'Enregistrer un rapport ou une étude',
  description:
    "N'enregistre que la fiche : le fichier lui-même est déposé d'abord par POST /fichiers (usage « rapport_etude », jusqu'à 50 Mo, PDF ou document Word/Excel/PowerPoint), et son URL est celle qu'on donne ici.",
  security: SECURISE,
  request: {
    query: z.object({ communeId: z.string().optional() }),
    body: { content: { 'application/json': { schema: rapportEtudeDepotSchema } } },
  },
  responses: { 201: json(RapportEtude, 'Fiche enregistrée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/rapports-etudes/{id}',
  tags: ['Rapports et études'],
  summary: 'Retirer un rapport ou une étude',
  description:
    'Retrait LOGIQUE, comme partout : le fichier déposé reste sur le volume, seule la fiche disparaît de la liste.',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Rapport retiré.' }, ...REPONSES_COMMUNES },
});

// ---------------------------------------------------------------------------
// Points de collecte proposés par les citoyens (TDR M3.1 / 5.5.2)
// ---------------------------------------------------------------------------

const PointSuggere = registry.register(
  'PointSuggere',
  z.object({
    id: z.string().uuid(),
    commune_id: z.string(),
    nom: z.string().nullable().openapi({
      description: "Ce que le citoyen appelle l'endroit, dans ses mots — « en face de la mosquée ». Non normalisé : c'est ainsi qu'un agent le retrouvera.",
    }),
    commentaire: z.string().nullable(),
    lat: z.number(),
    lng: z.number(),
    precision_m: z.number().nullable().openapi({
      description: 'Précision du relevé du téléphone, en mètres. À 5 m on désigne une porte, à 60 m un quartier.',
    }),
    photo_url: z.string().nullable(),
    statut: z.enum(['en_attente', 'valide', 'refuse']),
    motif_refus: z.string().nullable(),
    decide_le: z.string().nullable(),
    point_collecte_id: z.string().uuid().nullable().openapi({
      description: "Le point réellement créé lorsque la proposition a été retenue — ce qui permet de répondre, six mois plus tard, à « qu'est devenue ma proposition ? ».",
    }),
    created_at: z.string(),
    voisin_nom: z.string().nullable(),
    voisin_circuit: z.string().nullable(),
    voisin_distance_m: z.number().nullable().openapi({
      description:
        "Distance au point de collecte actif le plus proche. Une proposition à quinze mètres d'un arrêt déjà desservi est un doublon, et le citoyen ne peut pas le savoir — il ne voit pas la tournée. Ce chiffre le dit en une seconde. Il mesure, il ne conclut pas.",
    }),
  })
);

registry.registerPath({
  method: 'post',
  path: '/citoyen/points-suggeres',
  tags: ['Espace citoyen'],
  summary: 'Proposer un point de collecte manquant',
  description:
    "Géolocalisation, photo facultative, et le nom que le citoyen donne à l'endroit. La proposition naît « en attente » : personne ne dépose une demande déjà validée par elle-même.",
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: pointSuggereSchema } } } },
  responses: { 201: json(PointSuggere, 'Proposition enregistrée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/citoyen/points-suggeres',
  tags: ['Espace citoyen'],
  summary: 'Mes propositions et ce qu’elles sont devenues',
  description:
    "La moitié qui manque le plus souvent aux dispositifs de participation : on peut proposer, on ne peut pas savoir. Le statut, le motif de refus s'il y en a un, et le point créé s'il y en a un.",
  security: SECURISE,
  responses: { 200: json(z.array(PointSuggere), 'Propositions.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/points-suggeres',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Propositions citoyennes à instruire',
  description:
    "Les demandes en attente d'abord, et les plus anciennes en tête : une proposition vieille de trois mois est celle qui a le plus abîmé la confiance. Chaque ligne porte la distance au point existant le plus proche.",
  security: SECURISE,
  request: {
    query: z.object({
      communeId: z.string().optional(),
      statut: z.enum(['en_attente', 'valide', 'refuse']).optional(),
    }),
  },
  responses: { 200: json(z.array(PointSuggere), 'Propositions.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/points-suggeres/{id}/valider',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Retenir une proposition et la rattacher à une tournée',
  description: [
    "Crée l'arrêt dans le circuit choisi, avec sa provenance inscrite (source « suggestion_citoyen ») : un arrêt proposé par un habitant n'a pas la même valeur de preuve qu'un relevé GPS du service.",
    '',
    "Sans « ordre », le rang est DÉDUIT du point voisin le plus proche, et la déduction est écrite dans l'observation de l'arrêt. Ajouter l'arrêt en fin de tournée prétendrait que le camion y passe en dernier — faux dès que le point est au milieu du secteur, et les horaires annoncés aux habitants s'en trouvent aussitôt faussés. La réponse porte « ordreDeduit » pour que l'écran le dise plutôt que de laisser croire à un choix.",
  ].join('\n'),
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: pointSuggereValidationSchema } } },
  },
  responses: { 200: json(z.any(), 'Proposition retenue.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/points-suggeres/{id}/refuser',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Refuser une proposition, avec motif',
  description:
    "Le motif est obligatoire, côté API comme en base. Un refus sans motif transforme un outil de participation en boîte noire, et la fois suivante plus personne ne propose rien.",
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: pointSuggereRefusSchema } } },
  },
  responses: { 200: json(PointSuggere, 'Proposition refusée.'), ...REPONSES_COMMUNES },
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
      version: '0.4.0',
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
      { name: 'Comptes et accès', description: 'Ouverture et révision des accès, par la commune elle-même.' },
      { name: 'Pesées', description: "Registre communal des pesées : un tonnage rattaché au circuit qui l'a produit. L'import ANGeD attend que l'interopérabilité soit possible." },
      { name: 'Communication', description: "Sondages, projets et notifications ciblées par périmètre géographique. Les décomptes de destinataires sont rendus en nombre, jamais en liste (décret-loi n° 2022-54)." },
      { name: 'Personnel', description: "Effectif du service, affectation aux circuits, présence quotidienne et coût du service. Aucun salaire individuel, aucune donnée de santé (décret-loi n° 2022-54)." },
      { name: 'Circuits et contrôle terrain', description: 'Tournées de collecte et constats quotidiens (espace communal).' },
      { name: 'Espace prestataire', description: 'Registre du prestataire privé : passages, incidents, confrontation avec le constat communal.' },
      { name: 'Espace citoyen', description: 'Horaires de collecte, annonces et carte publique des signalements (TDR §3.3).' },
      { name: 'Flux occasionnels', description: 'Déchets verts, déchets de démolition et construction (DDC) et encombrants : demandes d’enlèvement et collecteurs agréés ANGeD.' },
      { name: 'Observatoire national', description: 'Portail FNCT : déploiement et comparaison entre territoires.' },
      { name: 'Fichiers', description: "Photos et documents déposés : preuve de traitement d'une réclamation, photo de signalement, constat de terrain, documents de projet, rapports et études. Type déduit des octets, métadonnées EXIF retirées au dépôt." },
      { name: 'Rapports et études', description: "Métadonnées des rapports et études d'une commune (TDR §3.2.9) : titre, catégorie, auteur déclaré, date. Le fichier lui-même est déposé par POST /fichiers." },
      { name: 'Supervision', description: "État de santé de l'API." },
    ],
  });
}
