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
import { truckPositionSchema, importParcSchema } from '../routes/trucks.routes.js';
import { importPersonnelSchema } from '../routes/personnel.routes.js';
import {
  ticketCreateSchema,
  ticketRefuseSchema,
  ticketAssignSchema,
  ticketTreatSchema,
} from '../routes/tickets.routes.js';
import { weighbridgeCreateSchema } from '../routes/weighbridge.routes.js';
import { citizenRegisterSchema } from '../routes/citizens.routes.js';
import { barbechaDeliverySchema, barbechaRevenusSchema, identiteSchema } from '../routes/barbechas.routes.js';
import { nationalKpiSchema, fiveAxisSchema } from '../routes/kpi.routes.js';
import { zoneCreateSchema, zoneUpdateSchema } from '../routes/zones.routes.js';
import { provenanceSchema, hebergementSchema, cadreInformelSchema, qActiviteSchema } from '../routes/observatoire.routes.js';
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
import { frontiereSchema, recepisseInpdpSchema, populationCommuneSchema } from '../routes/communes.routes.js';
import { demandeDemoSchema } from '../routes/demo.routes.js';
import { emissionSchema, annulationSchema } from '../routes/documents.routes.js';
import { carnetSchema, retourSchema, bonCarburantSchema, quotaSchema, uniteCompteurSchema } from '../routes/exploitation.routes.js';
import {
  configurationSchema as configurationGpsSchema,
  essaiSchema as essaiGpsSchema,
  boitierSchema as boitierGpsSchema,
  clotureSchema as clotureGpsSchema,
  tracesSchema as tracesGpsSchema,
  correspondanceSchema as correspondanceGpsSchema,
} from '../routes/gps.routes.js';
import {
  dossierSchema,
  majDossierSchema,
  etapeSchema,
  pieceSchema,
  immobilisationSchema,
  finImmobilisationSchema,
  MOTIFS_DECLASSEMENT,
  ETAPES_DECLASSEMENT,
  NATURES_PIECE,
} from '../routes/declassement.routes.js';
import { valeurParametreSchema, retraitValeurSchema } from '../routes/parametresNationaux.routes.js';
import { valeurDensiteSchema, retraitDensiteSchema } from '../routes/volumetrie.routes.js';
import { chargementEtudeSchema } from '../routes/coutComplet.routes.js';
import { inscriptionActeurSchema, faitsActeurSchema, demarcheSchema } from '../routes/acteursInformels.routes.js';
import { elementListeSchema, finElementSchema, retraitElementSchema } from '../routes/reglesInformel.routes.js';
import {
  demandeCarteSchema,
  pieceCarteSchema,
  accordCarteSchema,
  refusCarteSchema,
  retraitCarteSchema,
} from '../routes/cartesPrecollecteur.routes.js';
import { jalonActeurSchema, agrementSchema, ETATS_TRANSITION } from '../routes/periodeTransitoire.routes.js';
import { demandeRestaurationSchema, fichierDepotSchema } from '../routes/fichiers.routes.js';
import { depotLogoSchema } from '../routes/logosCommunes.routes.js';
import { elementSchema as elementBibliothequeSchema, qLignesSchema as qLignesBibliothequeSchema } from '../routes/bibliotheque.routes.js';
import { rapportEtudeDepotSchema, rapportEtudeVersionSchema } from '../routes/rapportsEtudes.routes.js';
import { contactSchema, majContactSchema, importContactsSchema } from '../routes/contacts.routes.js';
import {
  interventionSchema,
  majInterventionSchema,
  planSchema,
  majPlanSchema,
  releveSchema,
  TYPES_INTERVENTION,
  NATURES_INTERVENTION,
  STATUTS_ECHEANCE,
} from '../routes/maintenance.routes.js';
import {
  preferencesSchema,
  FORMATS_DATE,
  UNITES_MASSE,
  UNITES_VOLUME,
  UNITES_SURFACE,
  DOMAINES_ALERTE,
  GRAVITES,
} from '../preferences.js';
import { parametresCommuneSchema, localisationSchema } from '../routes/communes.routes.js';
import { lectureFichierGeoSchema, propositionDecoupageSchema } from '../routes/decoupage.routes.js';
import {
  commentaireFnctSchema,
  declarationsSchema,
  districtsSchema,
  parametresKpiSchema,
  qCompletudeSchema,
  qManquesSchema,
  qRepartitionSchema,
  qSerieSchema,
  qSeriesCommuneSchema,
} from '../routes/kpi5Axes.routes.js';
import { caracterisationSchema, pcgdSchema } from '../routes/references.routes.js';
import { qIndicateursCommunicationSchema } from '../routes/communication.routes.js';
// La couche WaPla documente ses routes ici, comme les autres : le contrat est un.
import {
  creationBilanSchema,
  creationScenarioSchema,
  hypotheseSchema,
  facteurReferenceSchema,
  GRANDEURS_AGREGEES,
  qAgregatsSchema,
  qAmorceSchema,
  reglageSchema,
  retraitFacteurSchema,
  saisieEntreeSchema,
} from '../wapla/routes.js';
import {
  poiSchema,
  pleinSchema,
  finDePosteSchema,
  dotationSchema,
  incidentSchema as incidentTravailSchema,
  commerceSchema,
  conventionSchema,
  TYPES_POI,
} from '../routes/sourcesKpi.routes.js';
import {
  champSchema,
  majChampSchema,
  etiquetteSchema,
  lotSchema,
  attributsPointSchema,
  actionSchema,
  majActionSchema,
  pointsActionSchema,
  avancementSchema,
  TYPES_CHAMP,
  COULEURS,
  STATUTS_ACTION,
} from '../routes/attributsPoints.routes.js';
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

const Preferences = registry.register(
  'Preferences',
  z
    .object({
      langue: z.enum(['fr', 'ar']).nullable().openapi({ description: 'null : rien de choisi, le navigateur garde sa langue.' }),
      formatDate: z.enum(FORMATS_DATE),
      unites: z.object({ masse: z.enum(UNITES_MASSE), volume: z.enum(UNITES_VOLUME), surface: z.enum(UNITES_SURFACE) }),
      alertes: z.object({
        domainesMasques: z.array(z.enum(DOMAINES_ALERTE)).openapi({
          description: 'Domaines du panneau « À vérifier » que la personne ne veut plus voir. Un avis bloquant reste toujours affiché.',
        }),
        graviteMin: z.enum(GRAVITES),
      }),
    })
    .openapi('Preferences')
);

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
      preferences: Preferences,
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
      gouvernorat_ar: z.string().nullable().optional().openapi({ description: 'Le nom arabe du gouvernorat (GET /communes/{id} seulement).', example: 'تونس' }),
      population: z.number().int(),
      area_km2: z.number().nullable(),
      waste_tons_per_day: z.number().nullable(),
      collection_rate: z.number().nullable(),
      cleanliness_index: z.number().nullable(),
      is_pilot: z.boolean().openapi({ description: 'Commune pilote du MVP (TDR §1.2).' }),
      est_demo: z.boolean().openapi({ description: 'Commune de démonstration fictive (jumeau numérique). Absente de l’annuaire sauf `avecDemo=1`.' }),
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
      classe_collecte: z.string().nullable().openapi({ description: "Classe de collecte (lot T). Vide tant que la commune ne l'a pas choisie." }),
      acquis_par_don: z.boolean().openapi({ description: 'Reçu en don : non amorti (lot C).' }),
      volume_provenance: z.enum(['constructeur', 'mesure', 'declare']).nullable(),
      travail_classe: z.string().nullable().openapi({
        description: "La classe de la benne qui travaille : celle de l'engin, ou pour un tracteur celle de sa seule remorque attelée.",
      }),
      travail_volume_m3: z.number().nullable(),
      travail_volume_provenance: z.enum(['constructeur', 'mesure', 'declare']).nullable(),
      travail_porteur_immat: z.string().nullable().openapi({ description: 'L’engin qui porte cette benne (la remorque, pour un tracteur).' }),
      travail_manque: z.enum(['remorque_absente', 'remorques_multiples', 'classe', 'volume', 'classe_et_volume']).nullable().openapi({
        description: "Ce qui empêche de connaître la benne de travail. SIIPI ne choisit jamais entre deux remorques attelées.",
      }),
      kilometrage: z.number().int().nullable().openapi({
        description: 'Dernier kilométrage connu (Jalon 5). Relevé à l’écran, ou relevé à la hausse par une intervention qui en porte un plus élevé.',
      }),
      kilometrage_le: z.string().nullable(),
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
  z
    .object({
      id: z.string().uuid(),
      id_precollecteur: z.string().openapi({ description: 'Identifiant communal PSEUDONYME (BARB-<COMMUNE>-<ANNÉE>-NNNN).' }),
      zone: z.string().nullable(),
      commune_id: z.string().nullable(),
      vehicle_type: z.string().nullable(),
      collected_total_kg: z.number(),
      created_at: z.string(),
    })
    .openapi('Barbecha', {
      description:
        'Registre pseudonyme des pré-collecteurs (lot 16.1) : aucune donnée d’identité. Pseudonyme et non anonyme — tant que la table d’identité existe, la donnée reste personnelle.',
    })
);

// ---------------------------------------------------------------------------
// Réponses réutilisables
// ---------------------------------------------------------------------------

const json = (schema: any, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

/**
 * Une route de liste exportable (Jalon 4, services/export.ts) : la même
 * réponse en JSON, ou en fichier avec `?format=csv|xlsx`. Même requête, mêmes
 * filtres, même cloisonnement — seule la représentation change.
 */
const jsonOuExport = (schema: any, description: string) => ({
  description: `${description} Avec \`?format=csv\` ou \`?format=xlsx\`, le même contenu en fichier à télécharger.`,
  content: {
    'application/json': { schema },
    'text/csv': {
      schema: z.string().openapi({
        description: 'UTF-8 avec BOM, séparateur « ; », virgule décimale. Textes commençant par = + - @ neutralisés.',
      }),
    },
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
      schema: z.string().openapi({ format: 'binary', description: 'Nombres et dates typés ; feuille de droite à gauche si `langue=ar`.' }),
    },
  },
});

const LigneImport = z.object({
  numero: z.number().int().openapi({ description: 'Numéro de ligne dans le fichier, en-tête compris.' }),
  action: z.enum(['creer', 'maj', 'inchange', 'doublon', 'erreur']),
  libelle: z.string(),
  erreurs: z.array(z.string()),
  champs: z.array(z.string()).optional().openapi({ description: 'Pour une mise à jour : les colonnes modifiées.' }),
});

const ApercuImportCsv = registry.register(
  'ApercuImportCsv',
  z.object({
    fichier: z.string(),
    colonnesReconnues: z.array(z.string()),
    colonnesIgnorees: z.array(z.string()).openapi({ description: 'Colonnes calculées ou inconnues : jamais écrites.' }),
    avertissements: z.array(z.string()),
    resume: z.record(z.number().int()),
    lignes: z.array(LigneImport),
    ecrit: z.boolean(),
    crees: z.number().int().optional(),
    modifies: z.number().int().optional(),
  })
);

const DESCRIPTION_IMPORT_CSV =
  "Le fichier en base64. En-têtes reconnus en français, en arabe ou par leur code — ceux d'un export de cet écran conviennent tels quels, valeurs codées comprises (« En panne », « معطّبة »). Séparateur « ; », « , » ou tabulation, déduit de l'en-tête ; UTF-8 (avec ou sans BOM) ou, à défaut, Windows-1252 avec un avertissement. 5 000 lignes au plus.";

const paramsExport = {
  format: z.enum(['csv', 'xlsx']).optional().openapi({ description: 'Télécharger la liste en fichier plutôt qu’en JSON.' }),
  langue: z.enum(['fr', 'ar']).optional().openapi({ description: 'Langue des en-têtes et des libellés du fichier (défaut : fr).' }),
};

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
    sujet_ar: z.string().nullable().openapi({ description: 'Le sujet en arabe quand c’est un libellé fixe (« Réclamations ») ; null pour un nom propre, qui passe tel quel.' }),
    constat_ar: z.string().nullable().openapi({ description: 'Le constat en arabe ; null si aucun modèle de services/avisAr.ts ne reconnaît le texte français (l’écran affiche alors le français).' }),
    quoi_faire_ar: z.string().nullable().openapi({ description: 'Ce qu’il y a à faire, en arabe ; null si aucun modèle ne reconnaît le texte français.' }),
  })
);

const EnvoiCourriel = z.object({ statut: z.enum(['envoye', 'echec', 'non_configure']), erreur: z.string().optional() }).openapi({
  description: 'Issue de l’envoi : « envoye » (accepté par le serveur SMTP), « echec » (avec le message du serveur), « non_configure » (aucun serveur désigné : rien n’est parti).',
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
  path: '/instance',
  tags: ['Supervision'],
  summary: "Nature de l'instance : développement, formation ou production",
  description:
    "Sans authentification (D-FNCT-5). La nature est celle que la base garde : fixée au premier démarrage en production ou en " +
    'formation, définitive. Une base de production le reste même servie avec une configuration de développement ; une base ' +
    "de formation affiche un bandeau rouge permanent, dès l'écran de connexion.",
  responses: {
    200: json(
      z.object({
        nature: z.enum(['developpement', 'formation', 'production']),
        bandeauFormation: z.boolean().openapi({ description: '« BASE DE FORMATION — Données fictives. » à afficher en permanence.' }),
      }),
      'Nature de l’instance.'
    ),
  },
});

registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Supervision'],
  summary: "État de santé de l'API",
  description:
    "Sans authentification. Utilisé par Docker et par la supervision du serveur. Distingue une base injoignable, une base " +
    'jamais initialisée (aucune migration appliquée) et une base plus ancienne que le code (migrations en attente), ' +
    'et dit pour chacune la commande qui la corrige.',
  responses: {
    200: json(
      z.object({
        status: z.literal('ok'),
        database: z.literal('connected'),
        migrations: z.number().int().openapi({ description: 'Nombre de migrations appliquées.' }),
      }),
      'API et base disponibles, schéma à jour.'
    ),
    503: json(
      z.object({
        status: z.literal('degraded'),
        database: z.enum(['unreachable', 'non_initialisee', 'migrations_en_attente']),
        message: z.string().openapi({ description: 'Cause et commande à lancer, en français.' }),
        migrationsEnAttente: z.number().int().optional(),
      }),
      'Base injoignable, non initialisée ou en retard sur le code.'
    ),
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
    'Renvoie un jeton JWT valable 8 heures. Limité à 20 tentatives par quart d’heure et par adresse IP. Un compte au mot de ' +
    'passe provisoire reçoit un jeton qui n’ouvre que GET /auth/me, PUT /comptes/moi/preferences et ' +
    'POST /comptes/moi/mot-de-passe : toute autre route répond 403 « Vous devez changer votre mot de passe avant de ' +
    'continuer. » (code MOT_DE_PASSE_A_CHANGER) tant qu’il n’est pas remplacé (D-FNCT-5).',
  request: { body: { content: { 'application/json': { schema: loginSchema } } } },
  responses: {
    200: json(z.object({ token: z.string(), user: Utilisateur }), 'Connexion réussie.'),
    401: json(Erreur, 'Identifiants incorrects — message identique que l’email soit inconnu ou le mot de passe faux.'),
    403: json(
      Erreur,
      'Sur une instance de production seulement : le mot de passe des comptes de démonstration, publié avec le code, n’ouvre ' +
        'aucun compte — refusé avant toute recherche du compte, il ne renseigne pas sur son existence ; et les comptes de ' +
        'démonstration eux-mêmes sont refusés, quel que soit leur mot de passe (D-FNCT-5). Le premier compte réel de la FNCT ' +
        'se crée avec `npm run compte:fnct:creer:prod -- <adresse> "<nom>"`.'
    ),
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
    'Visible par tout utilisateur authentifié, quelle que soit sa commune : le TDR en fait un référentiel national partagé, support de la comparaison entre communes. ' +
    'La commune de démonstration (jumeau numérique) n’y figure que sur demande, avec `avecDemo=1`.',
  security: SECURISE,
  request: {
    query: z.object({
      gouvernorat: z.string().optional(),
      avecDemo: z.enum(['1']).optional().openapi({ description: 'Inclure la commune de démonstration (sélecteur de la FNCT).' }),
    }),
  },
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
  method: 'post',
  path: '/communes/localiser',
  tags: ['Communes'],
  summary: 'Dans quelle commune se trouve une position ? (D-FNCT-1, application citoyenne)',
  description:
    'Le citoyen confirme la commune proposée, ou la choisit lui-même : la plateforme propose, elle ne décide pas. ' +
    '« Trouvée » seulement si un seul contour contient le point ; hors de tout contour (en mer, hors du pays, commune ' +
    'sans contour en base) ou dans deux : non trouvée, raison donnée. La position voyage dans le corps de la requête — ' +
    'jamais dans l’URL, qui irait au journal d’accès — et n’est écrite nulle part (loi organique n° 2004-63).',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: localisationSchema } } } },
  responses: {
    200: json(
      z.union([
        z.object({
          trouvee: z.literal(true),
          commune: z.object({ id: z.string(), name: z.string(), name_ar: z.string().nullable(), gouvernorat: z.string().nullable() }),
        }),
        z.object({ trouvee: z.literal(false), raison: z.enum(['hors_commune', 'ambigue']) }),
      ]),
      'Commune trouvée, ou raison pour laquelle elle ne l’est pas.'
    ),
    ...REPONSES_COMMUNES,
  },
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
  capacityM3: z.number().positive().nullable().optional().openapi({ description: 'Volume de la benne (m³). Pour un attelage, il se porte sur la remorque.' }),
  acquisParDon: z.boolean().optional().openapi({ description: 'Engin reçu en don : il n’est pas amorti dans le coût de collecte (lot C).' }),
  classeCollecte: z.string().nullable().optional().openapi({
    description: "Classe de collecte (GET /trucks/classes). Elle doit convenir au type ; un tracteur n'en porte pas, sa remorque oui. Jamais déduite du type.",
  }),
  volumeProvenance: z.enum(['constructeur', 'mesure', 'declare']).nullable().optional().openapi({
    description: 'Ce qui garantit le volume. Une provenance suppose un volume.',
  }),
  domaineEmploi: z.string().nullable().optional(),
  etat: z.enum(['en_service', 'en_panne', 'a_reformer', 'reforme']).optional(),
  etatDepuis: z.string().nullable().optional(),
  motifImmobilisation: z.string().nullable().optional(),
  atteleA: z.string().nullable().optional(),
});

const ClasseEngin = registry.register(
  'ClasseEngin',
  z
    .object({
      code: z.string(),
      libelle_fr: z.string(),
      libelle_ar: z.string(),
      compactant: z.boolean(),
      volume_ref_min_m3: z.number().nullable(),
      volume_ref_max_m3: z.number().nullable().openapi({
        description: 'Plage de volume de référence. Un volume hors plage est signalé dans « À vérifier », jamais refusé. Vide si la référence ne donne pas de plage.',
      }),
      types_compatibles: z.array(z.string()),
      source: z.string(),
    })
    .openapi('ClasseEngin')
);

registry.registerPath({
  method: 'get',
  path: '/trucks/classes',
  tags: ['Flotte'],
  summary: 'Classes de collecte des engins (référentiel national)',
  description:
    "Lot T. Le référentiel des classes d'engins de collecte des DMA, avec leurs types compatibles et leur plage de volume de référence, chacune avec sa source. Lecture seule : une classe nouvelle passe par une migration.",
  security: SECURISE,
  responses: { 200: json(z.array(ClasseEngin), 'Classes, dans leur ordre.'), 401: REPONSES_COMMUNES[401] },
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
  method: 'post',
  path: '/trucks/import',
  tags: ['Flotte'],
  summary: 'Importer ou mettre à jour le parc depuis un CSV',
  description:
    "Un engin se reconnaît à son immatriculation. Inconnu : il est créé (le type est alors obligatoire). Connu : seules les cases remplies sont comparées — une case vide n'efface jamais une valeur saisie à l'écran, et réimporter un export tel quel ne change rien (« inchange »). Âge, attelage et date d'inventaire sont calculés ou gérés ailleurs : ignorés. Le fichier en base64 ; en-têtes et valeurs codées reconnus en français, en arabe ou par leur code. Sans « valider », rien n'est écrit.",
  security: SECURISE,
  request: {
    query: z.object({ communeId: paramCommuneId.optional() }),
    body: { content: { 'application/json': { schema: importParcSchema } } },
  },
  responses: {
    200: json(ApercuImportCsv, "Aperçu : rien n'a été écrit."),
    201: json(ApercuImportCsv, 'Parc mis à jour.'),
    ...REPONSES_COMMUNES,
  },
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
  request: { query: z.object({ communeId: paramCommuneId.optional(), ...paramsExport }) },
  responses: { 200: jsonOuExport(z.array(Vehicule), 'Engins visibles.'), 400: REPONSES_COMMUNES[400], 401: REPONSES_COMMUNES[401] },
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
  summary: 'Pré-collecteurs recensés (registre pseudonyme)',
  description:
    'Module hérité du prototype, absent du TDR officiel. Depuis le lot 16.1 : ni nom, ni CIN, ni assurance maladie, ni revenu individuel.',
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

const IdentitePrecollecteur = registry.register(
  'IdentitePrecollecteur',
  z.object({
    barbecha_id: z.string().uuid(),
    nom_complet: z.string(),
    cin_enregistre: z.boolean().openapi({ description: 'Une empreinte de CIN est enregistrée. Ni le CIN ni l’empreinte ne sortent.' }),
    created_at: z.string(),
    updated_at: z.string(),
  })
);

const DESCRIPTION_IDENTITE =
  'Le seul admin de la commune — pas la FNCT (403), pas une autre commune (404). Le CIN n’est jamais stocké : seule son ' +
  'empreinte HMAC-SHA256, sous une clé hors de la base, sert au dédoublonnage. La base refuse toute écriture tant que la FNCT ' +
  'n’a pas déclaré l’hébergement accrédité, et pour une commune sans récépissé INPDP (409). Chaque lecture est journalisée.';

registry.registerPath({
  method: 'get',
  path: '/barbechas/{id}/identite',
  tags: ['GDMA'],
  summary: 'Identité d’un pré-collecteur',
  description: DESCRIPTION_IDENTITE,
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: json(IdentitePrecollecteur, 'Identité.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'put',
  path: '/barbechas/{id}/identite',
  tags: ['GDMA'],
  summary: 'Enregistrer l’identité d’un pré-collecteur',
  description: DESCRIPTION_IDENTITE,
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: identiteSchema } } },
  },
  responses: { 200: json(IdentitePrecollecteur, 'Identité enregistrée.'), 409: json(Erreur, 'Hébergement non accrédité, récépissé INPDP absent, ou CIN déjà enregistré.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/barbechas/{id}/identite',
  tags: ['GDMA'],
  summary: 'Retirer l’identité d’un pré-collecteur',
  description: 'Retrait logique, par le seul admin de la commune ; toujours possible, accréditation révoquée ou non.',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Identité retirée.' }, ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/barbechas/revenus',
  tags: ['GDMA'],
  summary: 'Revenu des pré-collecteurs, par zone et par mois',
  description:
    'Recalculé depuis les livraisons. Sous cinq pré-collecteurs distincts dans une zone, le poids et le montant sont masqués ' +
    '(`masque = true`, valeurs nulles) : une moyenne sur deux personnes est un revenu individuel. Il n’existe plus de revenu individuel.',
  security: SECURISE,
  request: { query: barbechaRevenusSchema.extend({ communeId: paramCommuneId.optional() }) },
  responses: {
    200: json(
      z.object({
        communeId: z.string(),
        mois: z.string(),
        seuil: z.number().int(),
        zones: z.array(
          z.object({
            zone: z.string(),
            participants: z.number().int(),
            livraisons: z.number().int(),
            poids_kg: z.number().nullable(),
            montant_tnd: z.number().nullable(),
            masque: z.boolean(),
          })
        ),
      }),
      'Revenus agrégés.'
    ),
    ...REPONSES_COMMUNES,
  },
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
  description:
    'Géométrie GeoJSON en WGS 84. Réservé à la FNCT depuis le Jalon 7 : une commune propose son découpage (POST /decoupage/propositions), elle ne le modifie plus directement (403). Chaque création par la FNCT crée une version du découpage.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: zoneCreateSchema } } } },
  responses: { 201: json(Zone, 'Secteur créé.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/zones/{id}',
  tags: ['Découpage communal'],
  summary: 'Modifier un secteur de collecte',
  description:
    'La commune modifie les attributs de service (couleur, fréquence, population, prestataire, statut). Le nom, le code et le tracé relèvent du découpage : réservés à la FNCT (403 pour la commune, qui passe par une proposition), et versionnés.',
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
    'Suppression logique, réservée à la FNCT depuis le Jalon 7 (la commune propose le retrait d’un secteur par une proposition de découpage). Le secteur reste conservé et se rétablit en restaurant une version antérieure (C2.6).',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Secteur supprimé.' }, ...REPONSES_COMMUNES },
});

// --- Découpage validé et versionné (Jalon 7, C2.5 et C2.6) -----------------

const TAG_DECOUPAGE = 'Découpage communal';

const VersionDecoupage = registry.register(
  'VersionDecoupage',
  z
    .object({
      id: z.string().uuid(),
      commune_id: z.string(),
      commune_nom: z.string(),
      numero: z.number().int().nullable().openapi({ description: 'Attribué à la validation (1, 2, 3… par commune).' }),
      statut: z.enum(['soumise', 'validee', 'refusee', 'retiree']),
      origine: z.enum(['initiale', 'proposition', 'correction_fnct', 'restauration']),
      directe: z.boolean().openapi({ description: 'Action directe de la FNCT, validée aussitôt.' }),
      perimetre_modifie: z.boolean(),
      zones_modifiees: z.boolean(),
      nb_secteurs: z.number().int(),
      surface_km2: z.number().nullable(),
      note: z.string().nullable(),
      motif_refus: z.string().nullable(),
      restaure_de: z.string().uuid().nullable(),
      restaure_de_numero: z.number().int().nullable(),
      soumise_par_nom: z.string().nullable(),
      soumise_le: z.string(),
      decidee_par_nom: z.string().nullable(),
      decidee_le: z.string().nullable(),
      en_vigueur: z.boolean(),
    })
    .openapi('VersionDecoupage')
);

const SecteurVersion = z.object({ id: z.string(), name: z.string() });

const VersionDecoupageDetail = registry.register(
  'VersionDecoupageDetail',
  VersionDecoupage.extend({
    perimetre: z.any().nullable().openapi({ description: 'GeoJSON (MultiPolygon).' }),
    zones: z.array(z.record(z.string(), z.any())),
    perimetre_actuel: z.any().nullable(),
    zones_actuelles: z.array(z.record(z.string(), z.any())),
    perimetre_change: z.boolean(),
    surface_actuelle_km2: z.number().nullable(),
    ajoutes: z.array(SecteurVersion),
    modifies: z.array(SecteurVersion),
    retires: z.array(SecteurVersion),
    avertissements: z.array(z.string()).openapi({ description: 'Secteur qui déborde du périmètre, secteurs qui se chevauchent.' }),
  }).openapi('VersionDecoupageDetail')
);

const idVersion = z.object({ id: z.string().uuid() });
const STATUTS_VERSION = ['soumise', 'validee', 'refusee', 'retiree'] as const;

registry.registerPath({
  method: 'get',
  path: '/decoupage/versions',
  tags: [TAG_DECOUPAGE],
  summary: 'Propositions et versions du découpage',
  description: 'Pour la FNCT sans commune désignée : toutes les communes (sa liste de propositions à instruire avec `statut=soumise`).',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional(), statut: z.enum(STATUTS_VERSION).optional() }) },
  responses: { 200: json(z.array(VersionDecoupage), 'Versions, les propositions en attente d’abord.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/decoupage/versions/{id}',
  tags: [TAG_DECOUPAGE],
  summary: 'Une version, l’état en vigueur, et ce qui les sépare',
  security: SECURISE,
  request: { params: idVersion },
  responses: { 200: json(VersionDecoupageDetail, 'Version détaillée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/decoupage/lire-fichier',
  tags: [TAG_DECOUPAGE],
  summary: 'Lire un fichier de limites : Shapefile (zip), KML, KMZ ou GeoJSON (C2.2)',
  description:
    'Rend les formes du fichier en WGS 84 (EPSG:4326), avec leurs attributs, pour que l’écran les montre avant toute proposition : rien n’est enregistré. Systèmes reconnus : WGS 84, WGS 84 / UTM 32N, Carthage / UTM 32N, Carthage / Nord et Sud Tunisie, Web Mercator ; un autre est refusé en le nommant, jamais deviné. Les attributs d’un Shapefile sont décodés selon son .cpg. Une forme invalide est signalée, pas corrigée.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: lectureFichierGeoSchema } } } },
  responses: {
    200: json(
      z.object({
        format: z.enum(['shapefile', 'kml', 'kmz', 'geojson']),
        projection: z.string(),
        srid_source: z.number().int(),
        avertissements: z.array(z.string()),
        geojson: z.object({
          type: z.literal('FeatureCollection'),
          features: z.array(
            z.object({ type: z.literal('Feature'), properties: z.record(z.string(), z.any()), geometry: z.record(z.string(), z.any()) })
          ),
        }),
      }),
      'Les formes, en WGS 84.'
    ),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'post',
  path: '/decoupage/propositions',
  tags: [TAG_DECOUPAGE],
  summary: 'Proposer un découpage (C2.5)',
  description:
    'Le périmètre et/ou l’ensemble des secteurs voulus. Un secteur en vigueur absent de la liste sera retiré à la validation. Une seule proposition en attente par commune (409).',
  security: SECURISE,
  request: {
    query: z.object({ communeId: paramCommuneId.optional() }),
    body: { content: { 'application/json': { schema: propositionDecoupageSchema } } },
  },
  responses: { 201: json(VersionDecoupage, 'Proposition soumise.'), ...REPONSES_COMMUNES, 409: { description: 'Une proposition est déjà en attente.' } },
});

registry.registerPath({
  method: 'post',
  path: '/decoupage/versions/{id}/valider',
  tags: [TAG_DECOUPAGE],
  summary: 'Valider une proposition (FNCT)',
  description: 'Applique le périmètre et les secteurs, puis numérote la version. Fige d’abord l’état présent en version 1 si la commune n’en a aucune.',
  security: SECURISE,
  request: { params: idVersion },
  responses: { 200: json(VersionDecoupage, 'Version validée et appliquée.'), ...REPONSES_COMMUNES, 409: { description: 'Déjà décidée.' } },
});

registry.registerPath({
  method: 'post',
  path: '/decoupage/versions/{id}/refuser',
  tags: [TAG_DECOUPAGE],
  summary: 'Refuser une proposition (FNCT), motif à l’appui',
  security: SECURISE,
  request: { params: idVersion, body: { content: { 'application/json': { schema: z.object({ motif: z.string().min(5) }) } } } },
  responses: { 200: json(VersionDecoupage, 'Proposition refusée.'), ...REPONSES_COMMUNES, 409: { description: 'Déjà décidée.' } },
});

registry.registerPath({
  method: 'post',
  path: '/decoupage/versions/{id}/retirer',
  tags: [TAG_DECOUPAGE],
  summary: 'Retirer sa proposition en attente',
  security: SECURISE,
  request: { params: idVersion },
  responses: { 200: json(VersionDecoupage, 'Proposition retirée.'), ...REPONSES_COMMUNES, 409: { description: 'Plus en attente.' } },
});

registry.registerPath({
  method: 'post',
  path: '/decoupage/versions/{id}/restaurer',
  tags: [TAG_DECOUPAGE],
  summary: 'Revenir à une version précédente (C2.6)',
  description:
    'Crée une nouvelle version, copie de celle désignée : appliquée aussitôt par la FNCT, soumise à la FNCT quand c’est la commune qui la demande. L’historique ne se réécrit pas.',
  security: SECURISE,
  request: { params: idVersion, body: { content: { 'application/json': { schema: z.object({ note: z.string().optional() }) } } } },
  responses: { 201: json(VersionDecoupage, 'Restauration appliquée (FNCT) ou proposée (commune).'), ...REPONSES_COMMUNES },
});

// --- Tableau de bord des indicateurs (5 axes) et préparation DMA (Jalon 8 ;
// refonte, lot 1 : plus de barème, de note ni de classement ; déclarations)

const TAG_KPI = 'Indicateurs';

const DeclarationRetenue = z
  .object({
    id: z.string().uuid(),
    saisi_par: z.string().nullable(),
    saisi_le: z.string(),
    commentaire_fnct: z.string().nullable(),
    commente_le: z.string().nullable(),
  })
  .openapi({ description: 'La déclaration retenue : qui l’a saisie, quand, et le commentaire éventuel de la FNCT (D3).' });

const ResultatIndicateur = registry.register(
  'ResultatIndicateur',
  z
    .object({
      code: z.string().openapi({ example: 'M1-2', description: 'Identifiant interne, jamais affiché.' }),
      famille: z.enum(['indicateur', 'dma', 'donnee']),
      axe: z.number().int(),
      libelle_fr: z.string(),
      libelle_ar: z.string(),
      unite: z.string().nullable(),
      mode: z.enum(['calcule', 'saisi']),
      statut: z.enum(['renseigne', 'non_renseigne', 'sans_objet']).openapi({
        description:
          'Une donnée manquante est « non_renseigne », jamais un zéro. « sans_objet » : le profil de la commune le dit (pas d’abattoir, décharge contrôlée par l’ANGeD).',
      }),
      source: z.enum(['mesure', 'declare']).nullable().openapi({
        description: 'Mesuré par un registre de la plateforme, sinon déclaré par la commune (badge « déclaré »), sinon null. La mesure prime.',
      }),
      valeur: z.number().nullable(),
      cible: z.number().nullable(),
      taux_atteinte: z.number().nullable().openapi({
        description:
          'Lecture entre 0 et 1 d’un indicateur rapporté à un objectif (la valeur sur la cible, ou le pourcentage). Nourrit les indices des axes, la préparation DMA et les alertes ; ce n’est pas une note.',
      }),
      detail: z.record(z.string(), z.any()),
      commentaire: z.string().nullable(),
      declaration: DeclarationRetenue.nullable(),
    })
    .openapi('ResultatIndicateur')
);

const Axe = z.object({ axe: z.number().int(), indice: z.number().nullable(), renseignes: z.number().int(), notes: z.number().int() });
const Dma = z.object({
  indice: z.number().nullable(),
  niveau: z.enum(['non_evalue', 'initial', 'en_preparation', 'avance', 'pret']),
  renseignes: z.number().int(),
  total: z.number().int(),
});
const Couverture = z
  .object({ calculables: z.number().int(), total: z.number().int() })
  .openapi({ description: '« 14 indicateurs calculables sur 19 » : les indicateurs sans objet sortent du total.' });
const ProfilCommune = z.object({ a_abattoir: z.boolean().nullable(), decharge_controlee_anged: z.boolean().nullable() });

const KpiCommune = registry.register(
  'KpiCommune',
  z
    .object({
      annee: z.number().int(),
      parametres: z.record(z.string(), z.number()),
      commune_id: z.string(),
      nom: z.string(),
      nom_ar: z.string().nullable(),
      gouvernorat: z.string(),
      district: z.string().nullable(),
      population: z.number().nullable(),
      profil: ProfilCommune,
      indicateurs: z.array(ResultatIndicateur),
      couverture: Couverture,
      axes: z.array(Axe),
      dma: Dma,
    })
    .openapi('KpiCommune')
);

const qKpiNiveau = z.object({
  annee: z.number().int().optional(),
  niveau: z.enum(['commune', 'gouvernorat', 'district', 'national']).optional(),
});
const Declaration = registry.register(
  'DeclarationIndicateur',
  z
    .object({
      id: z.string().uuid(),
      code: z.string(),
      valeur: z.number(),
      cible: z.number().nullable(),
      commentaire: z.string().nullable(),
      saisi_le: z.string(),
      saisi_par: z.string().nullable(),
      commentaire_fnct: z.string().nullable(),
      commente_le: z.string().nullable(),
    })
    .openapi('DeclarationIndicateur')
);
const pDeclarations = z.object({ communeId: z.string(), annee: z.number().int() });

// Le catalogue (lot 3a : granularité et formule en arabe).
const IndicateurCatalogue = registry.register(
  'IndicateurCatalogue',
  z.object({
    code: z.string(),
    famille: z.enum(['indicateur', 'dma', 'donnee']),
    module: z.string().nullable(),
    axe: z.number().int(),
    libelle_fr: z.string(),
    libelle_ar: z.string(),
    description: z.string().nullable().openapi({ description: 'La formule et les sources, en français.' }),
    description_ar: z.string().nullable().openapi({ description: 'La formule et les sources, en arabe.' }),
    mode: z.enum(['calcule', 'saisi']),
    saisie: z.enum(['ratio', 'taux', 'nombre', 'montant']).nullable(),
    libelle_valeur: z.string().nullable(),
    libelle_cible: z.string().nullable(),
    unite: z.string().nullable(),
    ordre: z.number().int(),
    granularite: z.enum(['mensuelle', 'annuelle', 'actuelle']).openapi({
      description: 'Le pas le plus fin auquel la valeur a un sens : mensuelle (registres datés), annuelle, actuelle (un état d’aujourd’hui).',
    }),
    fourchette: z.boolean().openapi({
      description: 'La valeur est une fourchette : « valeur » en est la borne basse, detail.valeur_max la haute. Aucun point milieu, aucun repère de gouvernorat.',
    }),
  }).passthrough()
);

registry.registerPath({
  method: 'get', path: '/kpi/indicateurs', tags: [TAG_KPI],
  summary: 'Le catalogue des indicateurs et les seuils nationaux',
  security: SECURISE,
  responses: { 200: json(z.object({ indicateurs: z.array(IndicateurCatalogue), parametres: z.record(z.string(), z.number()) }), 'Catalogue.'), 401: REPONSES_COMMUNES[401] },
});
registry.registerPath({
  method: 'put', path: '/kpi/parametres', tags: [TAG_KPI],
  summary: 'Seuils d’alerte nationaux et état du décret DMA (FNCT, A3.3)',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: parametresKpiSchema } } } },
  responses: { 200: json(z.record(z.string(), z.number()), 'Paramètres.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get', path: '/kpi/districts', tags: [TAG_KPI],
  summary: 'Les districts FNCT et le rattachement des gouvernorats',
  description:
    'Les cinq districts du décret n° 2023-589 du 21 septembre 2023 (D-FNCT-2, migration 078), ou ceux que la FNCT a définis depuis, avec leur source ; le district de chaque gouvernorat ; les gouvernorats des communes réelles.',
  security: SECURISE,
  responses: {
    200: json(
      z.object({
        districts: z.array(
          z.object({ code: z.string(), nom: z.string(), nom_ar: z.string().nullable(), ordre: z.number().int(), source: z.string().nullable() })
        ),
        rattachements: z.array(z.object({ gouvernorat: z.string(), district_code: z.string() })),
        gouvernorats: z.array(z.string()),
      }),
      'Districts.'
    ),
    401: REPONSES_COMMUNES[401],
  },
});
registry.registerPath({
  method: 'put', path: '/kpi/districts', tags: [TAG_KPI],
  summary: 'Définir les districts FNCT (FNCT)',
  description:
    'Remplace le découpage : chaque gouvernorat d’une commune réelle reçoit un district (sinon 400, avec la liste des oubliés), et la source du découpage est citée.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: districtsSchema } } } },
  responses: { 200: json(z.object({ districts: z.number().int(), rattaches: z.number().int() }), 'Districts enregistrés.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get', path: '/kpi/declarations/{communeId}/{annee}', tags: [TAG_KPI],
  summary: 'Les valeurs déclarées par une commune pour une année, et son profil',
  description:
    'Les déclarations en vigueur (une valeur absente est non renseignée), qui les a saisies et quand, le commentaire de la FNCT, et des indications pour les cibles (effectif, conteneurs, secteurs).',
  security: SECURISE,
  request: { params: pDeclarations },
  responses: {
    200: json(
      z.object({ profil: ProfilCommune, declarations: z.array(Declaration), indications: z.record(z.string(), z.any()).nullable() }),
      'Déclarations.'
    ),
    ...REPONSES_COMMUNES,
  },
});
registry.registerPath({
  method: 'put', path: '/kpi/declarations/{communeId}/{annee}', tags: [TAG_KPI],
  summary: 'Déclarer des valeurs (la commune)',
  description:
    'Une valeur déclarée vaut dès qu’elle est enregistrée, sans validation (D3). Une correction remplace la précédente, que le journal d’audit garde ; `null` retire la déclaration (retrait logique). Réservé à la commune : la FNCT commente, elle ne déclare pas à sa place (403).',
  security: SECURISE,
  request: { params: pDeclarations, body: { content: { 'application/json': { schema: declarationsSchema } } } },
  responses: { 200: json(z.object({ enregistrees: z.number().int() }), 'Déclarations enregistrées.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'post', path: '/kpi/commentaires-fnct/{declarationId}', tags: [TAG_KPI],
  summary: 'Commenter une valeur déclarée (FNCT)',
  description: 'Le commentaire se lit à côté de la valeur ; il ne la bloque pas et ne la modifie pas (D3). Une chaîne vide le retire.',
  security: SECURISE,
  request: { params: z.object({ declarationId: z.string().uuid() }), body: { content: { 'application/json': { schema: commentaireFnctSchema } } } },
  responses: { 200: json(z.record(z.string(), z.any()), 'Déclaration commentée.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get', path: '/kpi/5-axes', tags: [TAG_KPI],
  summary: 'Les indicateurs d’une commune : 5 axes, couverture et préparation DMA',
  description:
    'Chaque indicateur porte son statut et sa source ; un indicateur sans source reste non renseigné et sort des moyennes. La couverture se dit en clair (« 14 indicateurs calculables sur 19 »).',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional(), annee: z.number().int().optional() }) },
  responses: { 200: json(KpiCommune, 'Indicateurs de la commune.'), ...REPONSES_COMMUNES },
});
// Les séries, ce qui manque, le repère du gouvernorat (refonte, lot 3a).
const PointSerie = registry.register(
  'PointSerie',
  z.object({
    periode_debut: z.string().openapi({ format: 'date' }),
    periode_fin: z.string().openapi({ format: 'date' }),
    valeur: z.number(),
    taux_atteinte: z.number().nullable().openapi({ description: 'Entre 0 et 1 pour un indicateur rapporté à un objectif ; null sinon.' }),
    source: z.enum(['mesure', 'declare']),
    detail: z.record(z.string(), z.any()),
  })
);
const PointReference = registry.register(
  'PointReferenceGouvernorat',
  z.object({
    periode_debut: z.string().openapi({ format: 'date' }),
    periode_fin: z.string().openapi({ format: 'date' }),
    moyenne: z.number(),
    communes: z.number().int().openapi({ description: 'Le nombre de communes du gouvernorat qui ont une valeur — jamais lesquelles.' }),
  })
);
const ManqueIndicateur = registry.register(
  'ManqueIndicateur',
  z.object({
    groupe: z.number().int().openapi({ description: 'Il faut chaque groupe ; dans un groupe, une source suffit.' }),
    ordre: z.number().int(),
    source: z.string(),
    nature: z.enum(['formulaire', 'ecran', 'parametre', 'declaration', 'citoyen', 'fnct']),
    cible: z.string().nullable().openapi({
      description: 'Ce qui la complète : le type du formulaire d’ajout, l’écran du portail, le paramètre, ou l’indicateur à déclarer.',
    }),
    declare_code: z.string().nullable(),
    libelle_fr: z.string(),
    libelle_ar: z.string(),
  })
);
const qSerieDoc = qSerieSchema.extend({ communeId: paramCommuneId.optional() });
registry.registerPath({
  method: 'get', path: '/kpi/serie', tags: [TAG_KPI],
  summary: 'La série d’un indicateur : par mois ou par année',
  description:
    'Une ligne par période qui a une valeur, aucune pour une période sans donnée : un mois sans pesée est un trou dans la courbe, jamais un zéro (règle d’or 1.1). Le point annuel est celui de la carte de l’indicateur. Chaque point porte sa source (mesuré ou déclaré). Au plus 36 mois ou 10 ans.',
  security: SECURISE,
  request: { query: qSerieDoc.extend(paramsExport) },
  responses: { 200: jsonOuExport(z.array(PointSerie), 'La série.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get', path: '/kpi/reference-gouvernorat', tags: [TAG_KPI],
  summary: 'Le repère du gouvernorat sur le graphique d’un indicateur',
  description:
    'Par période, la moyenne des communes du gouvernorat qui ont une valeur, seulement quand elles sont au moins cinq (seuil de la FNCT). Aucune commune n’est nommée.',
  security: SECURISE,
  request: { query: qSerieDoc },
  responses: { 200: json(z.array(PointReference), 'Le repère, période par période.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get', path: '/kpi/manques', tags: [TAG_KPI],
  summary: 'Ce qui manque à un indicateur pour se calculer',
  description:
    'Les dépendances non tenues de l’indicateur pour l’année, avec ce qui les complète. Un indicateur calculé se complète par ses données sources, jamais en saisissant le résultat. Vide pour un indicateur calculable ou sans objet.',
  security: SECURISE,
  request: { query: qManquesSchema.extend({ communeId: paramCommuneId.optional() }) },
  responses: { 200: json(z.array(ManqueIndicateur), 'Ce qui manque.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get', path: '/kpi/series', tags: [TAG_KPI],
  summary: 'Les séries mensuelles de tous les indicateurs d’une commune',
  description:
    'Les petites courbes des cartes : chaque mois calculé une seule fois pour tous les indicateurs de granularité mensuelle. Mêmes règles que `/kpi/serie` — un mois sans donnée n’a pas de ligne. Au plus 24 mois.',
  security: SECURISE,
  request: { query: qSeriesCommuneSchema.extend({ communeId: paramCommuneId.optional() }) },
  responses: {
    200: json(z.array(PointSerie.omit({ detail: true }).extend({ code: z.string() })), 'Les points, indicateur par indicateur.'),
    ...REPONSES_COMMUNES,
  },
});
registry.registerPath({
  method: 'get', path: '/kpi/dependances', tags: [TAG_KPI],
  summary: 'Les sources de chaque indicateur',
  description: 'Les dépendances du catalogue (groupes : il faut chacun, une source par groupe suffit), avec ce qui complète chaque source.',
  security: SECURISE,
  responses: {
    200: json(z.array(ManqueIndicateur.extend({ indicateur_code: z.string() })), 'Les dépendances.'),
    401: REPONSES_COMMUNES[401],
  },
});
const ElementCompletude = registry.register(
  'ElementCompletude',
  z.object({
    code: z.string(),
    rubrique: z.enum(['reference', 'registre_mois']).openapi({
      description: '« reference » : une donnée qui se pose une fois et se tient à jour ; « registre_mois » : un registre tenu chaque mois.',
    }),
    ordre: z.number().int(),
    libelle_fr: z.string(),
    libelle_ar: z.string(),
    aide_fr: z.string(),
    aide_ar: z.string(),
    nature: z.enum(['formulaire', 'ecran', 'parametre']),
    cible: z.string().openapi({ description: 'Le type du formulaire d’ajout, l’écran du portail ou le paramètre qui le complète.' }),
    present: z.boolean(),
    nombre: z.number().nullable().openapi({
      description: 'Ce qu’il y a derrière un élément présent (circuits, habitants, pleins du mois…). Vide quand l’élément est à ajouter : jamais « 0 ».',
    }),
    annee: z.number().int().nullable().openapi({ description: 'L’année de la donnée ou l’année concernée (PCGD, caractérisation, effectif).' }),
    indicateurs: z.array(z.string()).openapi({ description: 'Les indicateurs qu’il débloque, lus dans les dépendances du catalogue.' }),
  })
);
registry.registerPath({
  method: 'get', path: '/kpi/completude', tags: [TAG_KPI],
  summary: '« Ma commune dans SIIPI » : ce qui est présent, ce qui est à ajouter',
  description:
    'Les données de référence de la commune et les registres du mois, chacun présent ou à ajouter, avec ce qui le complète et les indicateurs qu’il débloque. Une commune à la fois, sans total, sans pourcentage, sans rang : une liste de choses à faire, pas une note. Le jour ne peut pas être dans le futur.',
  security: SECURISE,
  request: {
    query: qCompletudeSchema.extend({
      communeId: paramCommuneId.optional(),
      jour: qCompletudeSchema.shape.jour.openapi({
        description: 'Le jour de référence (par défaut, aujourd’hui à Tunis) : les registres portent sur son mois, jusqu’à lui.',
      }),
    }),
  },
  responses: {
    200: json(z.object({ jour: z.string(), elements: z.array(ElementCompletude) }), 'La liste, élément par élément.'),
    ...REPONSES_COMMUNES,
  },
});
const GroupeRepartitionDoc = registry.register(
  'GroupeRepartition',
  z.object({
    cle: z.string(),
    nom: z.string().nullable(),
    communes: z.number().int().openapi({ description: 'Les communes du groupe (« sur 31 »).' }),
    communes_renseignees: z.number().int().openapi({ description: 'Celles qui ont une valeur (« 12 communes »).' }),
    communes_mesurees: z.number().int(),
    communes_declarees: z.number().int(),
    valeur_moyenne: z.number().nullable(),
    valeur_max_moyenne: z.number().nullable().openapi({ description: 'Pour une fourchette : la moyenne des bornes hautes ; valeur_moyenne est celle des basses.' }),
    taux_moyen: z.number().nullable().openapi({ description: 'Moyenne des taux d’atteinte (0 à 1).' }),
  })
);
const ValeurCommuneDoc = registry.register(
  'ValeurIndicateurCommune',
  z.object({
    commune_id: z.string(),
    nom: z.string(),
    nom_ar: z.string().nullable(),
    gouvernorat: z.string(),
    district: z.string().nullable(),
    statut: z.enum(['renseigne', 'non_renseigne', 'sans_objet']),
    source: z.enum(['mesure', 'declare']).nullable(),
    valeur: z.number().nullable(),
    valeur_max: z.number().nullable().openapi({ description: 'Pour une fourchette : la borne haute.' }),
    taux_atteinte: z.number().nullable(),
  })
);
registry.registerPath({
  method: 'get', path: '/kpi/repartition', tags: [TAG_KPI],
  summary: 'La répartition d’un indicateur par gouvernorat, district ou commune (FNCT)',
  description:
    'Par groupe : la moyenne, et sur combien de communes elle porte (« 12 communes sur 31 »), mesurées et déclarées à part. Au niveau commune : la valeur de chacune, par ordre alphabétique. Aucun rang, aucun ordre par valeur. Sans la commune de démonstration.',
  security: SECURISE,
  request: { query: qRepartitionSchema.extend(paramsExport) },
  responses: { 200: jsonOuExport(z.array(z.union([GroupeRepartitionDoc, ValeurCommuneDoc])), 'La répartition.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get', path: '/kpi/national', tags: [TAG_KPI],
  summary: 'Les 5 axes agrégés par commune, gouvernorat, district ou national (FNCT, A3.1)',
  description: 'Les agrégats joignent tonnages pesés et taux de résolution recomposé depuis les comptes. Aucun classement.',
  security: SECURISE,
  request: { query: qKpiNiveau },
  responses: { 200: json(z.array(z.record(z.string(), z.any())), 'Agrégats.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get', path: '/kpi/dma', tags: [TAG_KPI],
  summary: 'Préparation au tri à la source (décret DMA, dispositif d’anticipation) — FNCT',
  security: SECURISE,
  request: { query: qKpiNiveau },
  responses: { 200: json(z.object({ en_vigueur: z.boolean(), lignes: z.array(z.record(z.string(), z.any())) }), 'Maturité.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get', path: '/kpi/alertes', tags: [TAG_KPI],
  summary: 'Alertes nationales selon les seuils de la FNCT (A3.3)',
  security: SECURISE,
  request: { query: z.object({ annee: z.number().int().optional() }) },
  responses: {
    200: json(z.array(z.object({ commune_id: z.string(), nom: z.string(), gouvernorat: z.string(), gravite: z.string(), code: z.string(), constat: z.string() })), 'Alertes.'),
    ...REPONSES_COMMUNES,
  },
});
registry.registerPath({
  method: 'get', path: '/kpi/prestataire', tags: [TAG_KPI],
  summary: 'Tableau de bord restreint du prestataire (B7.4)',
  security: SECURISE,
  request: { query: z.object({ annee: z.number().int().optional() }) },
  responses: { 200: json(z.object({ annee: z.number().int(), lignes: z.array(z.record(z.string(), z.any())) }), 'Ses indicateurs de service.'), ...REPONSES_COMMUNES },
});

// --- Données de référence : PCGD et caractérisation des déchets (refonte, lot 2a)

const TAG_REF = 'Données de référence';
const pCommuneRef = z.object({ communeId: paramCommuneId.optional() });
const Fraction = z.object({ fraction: z.string(), pourcentage: z.number() });
const Caracterisation = registry.register(
  'Caracterisation',
  z
    .object({
      id: z.string().uuid(),
      commune_id: z.string().nullable().openapi({ description: 'NULL : la moyenne nationale de l’ANGeD.' }),
      niveau_source: z.enum(['moyenne_nationale_anged', 'etude_anged_commune', 'pcgd', 'autre_etude']),
      annee: z.number().int(),
      methode: z.string().nullable(),
      saison: z.string().nullable(),
      rapport_id: z.string().uuid().nullable(),
      pcgd_id: z.string().uuid().nullable(),
      saisi_le: z.string(),
      saisi_par: z.string().nullable(),
      fractions: z.array(Fraction).nullable(),
    })
    .openapi('Caracterisation')
);
const CaracterisationRetenue = registry.register(
  'CaracterisationRetenue',
  z
    .object({
      caracterisation_id: z.string().uuid(),
      niveau_source: z.enum(['moyenne_nationale_anged', 'etude_anged_commune', 'pcgd', 'autre_etude']),
      annee: z.number().int(),
      commune_id: z.string().nullable(),
      methode: z.string().nullable(),
      saison: z.string().nullable(),
      fractions: z.array(Fraction).nullable(),
    })
    .openapi('CaracterisationRetenue')
);
const Pcgd = registry.register(
  'Pcgd',
  z
    .object({
      id: z.string().uuid(),
      commune_id: z.string(),
      statut: z.enum(['en_preparation', 'adopte', 'en_revision']),
      annee_adoption: z.number().int().nullable(),
      horizon: z.number().int().nullable(),
      bureau_etudes: z.string().nullable(),
      rapport_id: z.string().uuid().nullable(),
      rapport_titre: z.string().nullable(),
      observation: z.string().nullable(),
      saisi_le: z.string(),
      saisi_par: z.string().nullable(),
    })
    .openapi('Pcgd')
);

registry.registerPath({
  method: 'get', path: '/references/fractions', tags: [TAG_REF],
  summary: 'La nomenclature des fractions de la caractérisation',
  description: 'Provisoire : à aligner sur celle des études ANGeD, fournie par la FNCT.',
  security: SECURISE,
  responses: { 200: json(z.array(z.object({ code: z.string(), libelle_fr: z.string(), libelle_ar: z.string() })), 'Fractions.'), 401: REPONSES_COMMUNES[401] },
});
registry.registerPath({
  method: 'get', path: '/references/pcgd', tags: [TAG_REF],
  summary: 'Les PCGD d’une commune',
  security: SECURISE,
  request: { query: pCommuneRef },
  responses: { 200: json(z.array(Pcgd), 'PCGD.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'post', path: '/references/pcgd', tags: [TAG_REF],
  summary: 'Enregistrer le PCGD de la commune',
  description: 'Réservé à la commune. Un PCGD adopté a une année d’adoption ; son horizon ne la précède pas (400 sinon, et la base le refuse aussi).',
  security: SECURISE,
  request: { query: pCommuneRef, body: { content: { 'application/json': { schema: pcgdSchema } } } },
  responses: { 201: json(z.object({ id: z.string().uuid() }), 'PCGD enregistré.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'patch', path: '/references/pcgd/{id}', tags: [TAG_REF],
  summary: 'Modifier un PCGD (statut, adoption, horizon…)',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }), body: { content: { 'application/json': { schema: pcgdSchema.partial() } } } },
  responses: { 200: json(z.object({ id: z.string().uuid() }), 'PCGD modifié.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get', path: '/references/caracterisations', tags: [TAG_REF],
  summary: 'Les caractérisations d’une commune, et les moyennes nationales',
  description: 'Sans communeId (FNCT) : les moyennes nationales de l’ANGeD seules.',
  security: SECURISE,
  request: { query: pCommuneRef },
  responses: { 200: json(z.array(Caracterisation), 'Caractérisations.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'post', path: '/references/caracterisations', tags: [TAG_REF],
  summary: 'Enregistrer une caractérisation des déchets',
  description:
    'Une étude de la commune (étude ANGeD, PCGD, autre étude) par la commune ; la moyenne nationale de l’ANGeD par la FNCT seule (403 sinon). Les fractions totalisent 100 % à 1 près, aucune n’est négative : refusé sinon (400), par la base aussi.',
  security: SECURISE,
  request: { query: pCommuneRef, body: { content: { 'application/json': { schema: caracterisationSchema } } } },
  responses: { 201: json(z.object({ id: z.string().uuid() }), 'Caractérisation enregistrée.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get', path: '/references/caracterisation-retenue', tags: [TAG_REF],
  summary: 'La composition des déchets retenue pour une commune',
  description:
    'La source la plus précise, puis la plus récente : étude ANGeD de la commune, PCGD, autre étude, moyenne nationale ANGeD — avec son niveau et son année. `null` : rien n’existe, la composition est non renseignée (jamais supposée).',
  security: SECURISE,
  request: { query: pCommuneRef.extend({ date: z.string().optional().openapi({ example: '2026-10-12' }) }) },
  responses: { 200: json(z.union([CaracterisationRetenue, z.null()]), 'Composition retenue, ou null.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'delete', path: '/references/{table}/{id}', tags: [TAG_REF],
  summary: 'Retirer un PCGD ou une caractérisation (retrait logique)',
  security: SECURISE,
  request: { params: z.object({ table: z.enum(['pcgd', 'caracterisations']), id: z.string().uuid() }) },
  responses: { 204: { description: 'Retiré.' }, ...REPONSES_COMMUNES },
});

// --- Les registres qui automatisent les sources des KPI (lot « sources KPI ») -

const TAG_WAPLA = 'WaPla (planification)';
const EntreeAmorce = registry.register(
  'EntreeAmorceWapla',
  z.object({
    cle: z.string().openapi({ description: 'L’entrée du moteur WaPla (waste_in, tc_1, ghg_1…), ou dechets_collectes_t, le tonnage pesé dont le taux de collecte se déduit.' }),
    ordre: z.number().int(),
    valeur: z.number().nullable().openapi({ description: 'Vide quand SIIPI ne tient pas la donnée : jamais 0 (règle d’or 1.1).' }),
    provenance: z.enum(['siipi_mesure', 'siipi_declare', 'reference_tunisienne']).nullable(),
    source: z.string().openapi({ description: 'D’où vient la valeur, en clair.' }),
    detail: z.record(z.string(), z.unknown()).nullable(),
    manque: z.string().nullable().openapi({ description: 'Pourquoi l’entrée est vide, et ce qu’il faut compléter.' }),
    ecart: z.string().nullable().openapi({ description: 'Un écart à montrer (taux de collecte au-delà de 1, exercice pesé en partie…), jamais corrigé en silence.' }),
  })
);
const FacteurReference = registry.register(
  'FacteurReferenceWapla',
  z.object({
    id: z.string().uuid(),
    code: z.enum(['precipitations_annuelles_mm', 'temperature_moyenne_c']),
    gouvernorat: z.string(),
    valeur: z.number(),
    source: z.string(),
    date_effet: z.string(),
    saisi_le: z.string(),
    retire_le: z.string().nullable(),
    motif_retrait: z.string().nullable(),
    periode: z.string().nullable().openapi({ description: 'La période des normales (« 1991-2020 ») ; vide pour une valeur saisie sans provenance de station.' }),
    methode_rattachement: z.enum(['station_unique', 'plus_proche_voisin']).nullable(),
    stations_utilisees: z.array(z.string()).nullable().openapi({ description: 'Les stations NOAA dont vient la valeur (« TUNIS_CARTHAGE »).' }),
    distance_km: z.number().nullable().openapi({ description: 'La distance à la station voisine, pour une normale estimée.' }),
    label: z.enum(['stationnaire', 'estimee']).nullable(),
  })
);
registry.registerPath({
  method: 'get', path: '/wapla/amorce', tags: [TAG_WAPLA],
  summary: 'L’amorce d’un bilan WaPla : ce que SIIPI propose pour chaque entrée',
  description:
    'Pour chaque entrée que SIIPI peut alimenter (gisement, tonnage pesé, taux de collecte, gasoil de collecte, coût complet, redevance ANGeD, composition, climat) : la valeur, sa provenance et sa source, ou ce qui manque. Lecture seule ; la couche WaPla lit SIIPI, SIIPI ne la lit jamais. L’exercice ne peut pas être dans le futur.',
  security: SECURISE,
  request: { query: qAmorceSchema.extend({ communeId: paramCommuneId.optional() }) },
  responses: {
    200: json(z.object({ commune_id: z.string(), exercice: z.number().int(), entrees: z.array(EntreeAmorce) }), 'L’amorce, entrée par entrée.'),
    ...REPONSES_COMMUNES,
  },
});
registry.registerPath({
  method: 'get', path: '/wapla/facteurs-reference', tags: [TAG_WAPLA],
  summary: 'Les références tunisiennes de la couche WaPla (climat par gouvernorat)',
  description: 'Les valeurs en vigueur ; avec retirees=1, aussi les valeurs retirées et leur motif.',
  security: SECURISE,
  request: { query: z.object({ retirees: z.enum(['1']).optional() }) },
  responses: { 200: json(z.array(FacteurReference), 'Les références.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'post', path: '/wapla/facteurs-reference', tags: [TAG_WAPLA],
  summary: 'Saisir une référence tunisienne (FNCT)',
  description: 'Réservé à la FNCT. Datée et sourcée ; bornes plausibles pour la Tunisie ; une seule valeur en vigueur par gouvernorat, code et date (409 sinon).',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: facteurReferenceSchema } } } },
  responses: { 201: json(FacteurReference, 'Référence enregistrée.'), 409: json(Erreur, 'Une valeur en vigueur existe déjà pour ce gouvernorat, ce code et cette date : la retirer d’abord.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'post', path: '/wapla/facteurs-reference/{id}/retrait', tags: [TAG_WAPLA],
  summary: 'Retirer une référence (FNCT), avec son motif',
  description: 'Une référence ne se corrige ni ne s’efface : elle se retire, et reste lisible avec son motif.',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }), body: { content: { 'application/json': { schema: retraitFacteurSchema } } } },
  responses: { 200: json(FacteurReference, 'Référence retirée.'), ...REPONSES_COMMUNES },
});

const ProvenanceWapla = z.enum(['siipi_mesure', 'siipi_declare', 'saisie_commune', 'reference_tunisienne', 'defaut_wapla']);
const EntreeBilanWapla = registry.register(
  'EntreeBilanWapla',
  z.object({
    cle: z.string(),
    valeur: z.union([z.number(), z.boolean()]),
    provenance: ProvenanceWapla,
    source: z.string().nullable(),
    detail: z.record(z.string(), z.unknown()).nullable(),
    saisi_le: z.string(),
  })
);
const BilanWapla = registry.register(
  'BilanWapla',
  z.object({
    id: z.string().uuid(),
    commune_id: z.string(),
    exercice: z.number().int(),
    statut: z.enum(['brouillon', 'calcule']),
    version_moteur: z.string().nullable(),
    resultat: z.record(z.string(), z.unknown()).nullable().openapi({
      description: 'Le résultat du moteur corrigé (flux, uPOPs, GES, climat, coûts) : une estimation de planification, jamais une mesure.',
    }),
    niveau: z.enum(['etaye', 'indicatif', 'illustratif']).nullable(),
    fiabilite: z.record(z.string(), z.unknown()).nullable(),
    calcule_le: z.string().nullable(),
    cree_le: z.string(),
    entrees: z.array(EntreeBilanWapla),
    roles: z.array(z.object({ cle: z.string(), role: z.enum(['cle', 'comptee']), groupe: z.string() })),
    a_traiter: z.array(z.string()).openapi({ description: 'Les entrées clés à traiter avant le calcul (une valeur, ou la valeur par défaut gardée exprès).' }),
  })
);
const pBilan = z.object({ id: z.string().uuid() });
registry.registerPath({
  method: 'get', path: '/wapla/reglages', tags: [TAG_WAPLA],
  summary: 'Les réglages de la couche WaPla (seuil de fiabilité)',
  security: SECURISE,
  responses: {
    200: json(z.array(z.object({ cle: z.string(), valeur: z.number(), libelle: z.string(), modifie_le: z.string() })), 'Les réglages.'),
    ...REPONSES_COMMUNES,
  },
});
registry.registerPath({
  method: 'put', path: '/wapla/reglages/seuil_defauts_etaye', tags: [TAG_WAPLA],
  summary: 'Régler le seuil « étayé » / « indicatif » (FNCT)',
  description: 'La part des entrées comptées restées par défaut au-delà de laquelle un bilan est indicatif (0 à 1).',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: reglageSchema } } } },
  responses: { 200: json(z.object({ cle: z.string(), valeur: z.number() }), 'Réglage enregistré.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get', path: '/wapla/bilans', tags: [TAG_WAPLA],
  summary: 'Les bilans WaPla d’une commune',
  description: 'La FNCT ne voit pas les bilans illustratifs (la base le tient).',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: { 200: json(z.array(BilanWapla.omit({ resultat: true, fiabilite: true, entrees: true, roles: true, a_traiter: true })), 'Les bilans.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'post', path: '/wapla/bilans', tags: [TAG_WAPLA],
  summary: 'Ouvrir le bilan d’un exercice (commune)',
  description: 'Réservé à la commune. Le bilan naît de l’amorce : chaque entrée que SIIPI tient y entre avec sa provenance ; ni centre de tri ni incinération dans le statu quo (SPEC § 3.3). Un bilan par exercice (409 sinon).',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }), body: { content: { 'application/json': { schema: creationBilanSchema } } } },
  responses: {
    201: json(BilanWapla, 'Bilan ouvert.'),
    409: json(Erreur, 'La commune a déjà un bilan pour cet exercice.'),
    ...REPONSES_COMMUNES,
  },
});
registry.registerPath({
  method: 'get', path: '/wapla/bilans/{id}', tags: [TAG_WAPLA],
  summary: 'Un bilan WaPla : entrées, résultat, niveau de fiabilité',
  security: SECURISE,
  request: { params: pBilan },
  responses: { 200: json(BilanWapla, 'Le bilan.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'put', path: '/wapla/bilans/{id}/entrees/{cle}', tags: [TAG_WAPLA],
  summary: 'Saisir une entrée, ou garder exprès la valeur par défaut de l’UNIDO (commune)',
  description: 'Une saisie rend le résultat caduc : le bilan revient au brouillon. La valeur suit les bornes de l’outil.',
  security: SECURISE,
  request: {
    params: pBilan.extend({ cle: z.string() }),
    body: { content: { 'application/json': { schema: saisieEntreeSchema } } },
  },
  responses: { 200: json(BilanWapla, 'Le bilan, à jour.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'post', path: '/wapla/bilans/{id}/calcul', tags: [TAG_WAPLA],
  summary: 'Calculer le bilan avec le moteur corrigé (commune)',
  description: 'Refusé tant qu’une entrée clé n’est pas traitée. Le résultat garde la version du moteur ; le niveau de fiabilité est établi au même moment.',
  security: SECURISE,
  request: { params: pBilan },
  responses: { 200: json(BilanWapla, 'Le bilan calculé.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get', path: '/wapla/bilans/{id}/export', tags: [TAG_WAPLA],
  summary: 'Le bilan, ligne par ligne, pour l’export (Excel, CSV)',
  description:
    'La mention de méthode, puis toutes les entrées du moteur — celles du bilan avec leur provenance, et les valeurs par défaut de l’UNIDO utilisées, nommées comme telles —, puis les résultats d’un bilan calculé : flux, GES (potentiel engagé), uPOPs, coûts. Avec format=csv ou xlsx : le fichier.',
  security: SECURISE,
  request: { params: pBilan, query: z.object(paramsExport) },
  responses: {
    200: jsonOuExport(
      z.array(z.object({
        rubrique: z.enum(['methode', 'entree', 'flux', 'ges', 'upops', 'cout']),
        cle: z.string(),
        valeur: z.number().nullable(),
        unite: z.string(),
        provenance: z.string().nullable(),
        source: z.string().nullable(),
      })),
      'Les lignes du bilan.'
    ),
    ...REPONSES_COMMUNES,
  },
});
registry.registerPath({
  method: 'post', path: '/wapla/bilans/{id}/retrait', tags: [TAG_WAPLA],
  summary: 'Retirer un bilan (commune) — suppression logique',
  security: SECURISE,
  request: { params: pBilan },
  responses: { 204: { description: 'Bilan retiré.' }, ...REPONSES_COMMUNES },
});

const ComparaisonWapla = registry.register(
  'ComparaisonWapla',
  z.object({
    indicateurs: z.record(z.string(), z.object({ statu_quo: z.number(), scenario: z.number(), ecart: z.number() })).openapi({
      description: 'mise_en_decharge_t, brule_air_libre_t, ges_t_co2e (potentiel engagé), upops_mg_teq : statu quo, scénario, écart.',
    }),
    cout: z.object({
      ecart: z.number().nullable().openapi({ description: 'TND/an que le scénario ajoute (procédés ajoutés seulement) ; null tant qu’un coût manque.' }),
      procedes_ajoutes: z.array(z.enum(['compostage', 'mrf', 'incineration'])),
      couts_manquants: z.array(z.enum(['compostage', 'mrf', 'incineration'])),
      detail: z.record(z.string(), z.number().nullable()),
    }),
  })
);
const ScenarioWapla = registry.register(
  'ScenarioWapla',
  z.object({
    id: z.string().uuid(),
    bilan_id: z.string().uuid(),
    commune_id: z.string(),
    nom: z.string(),
    description: z.string().nullable(),
    statut: z.enum(['brouillon', 'calcule', 'fige']),
    version_moteur: z.string().nullable(),
    resultat: z.record(z.string(), z.unknown()).nullable(),
    statu_quo: z.record(z.string(), z.unknown()).nullable().openapi({ description: 'Le résultat du statu quo, copié au calcul du scénario.' }),
    comparaison: ComparaisonWapla.nullable(),
    calcule_le: z.string().nullable(),
    fige_le: z.string().nullable(),
    cree_le: z.string(),
    entrees: z.array(EntreeBilanWapla.extend({
      provenance: z.enum(['siipi_mesure', 'siipi_declare', 'saisie_commune', 'reference_tunisienne', 'defaut_wapla', 'hypothese_scenario']),
    })),
  })
);
const pScenario = z.object({ id: z.string().uuid() });
registry.registerPath({
  method: 'get', path: '/wapla/bilans/{id}/scenarios', tags: [TAG_WAPLA],
  summary: 'Les scénarios d’un bilan',
  security: SECURISE,
  request: { params: pBilan },
  responses: { 200: json(z.array(ScenarioWapla.omit({ resultat: true, statu_quo: true, entrees: true, commune_id: true })), 'Les scénarios.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'post', path: '/wapla/bilans/{id}/scenarios', tags: [TAG_WAPLA],
  summary: 'Créer un scénario à partir d’un bilan calculé (commune)',
  description: 'Le scénario copie les entrées du statu quo, avec leur provenance. Refusé tant que le bilan n’est pas calculé.',
  security: SECURISE,
  request: { params: pBilan, body: { content: { 'application/json': { schema: creationScenarioSchema } } } },
  responses: { 201: json(ScenarioWapla, 'Scénario créé.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get', path: '/wapla/scenarios/{id}', tags: [TAG_WAPLA],
  summary: 'Un scénario : hypothèses, résultat, comparaison au statu quo',
  security: SECURISE,
  request: { params: pScenario },
  responses: { 200: json(ScenarioWapla, 'Le scénario.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'put', path: '/wapla/scenarios/{id}/entrees/{cle}', tags: [TAG_WAPLA],
  summary: 'Poser une hypothèse de scénario (commune)',
  description: 'L’entrée prend la provenance « hypothese_scenario » ; le calcul du scénario devient caduc. Un scénario figé refuse (409).',
  security: SECURISE,
  request: { params: pScenario.extend({ cle: z.string() }), body: { content: { 'application/json': { schema: hypotheseSchema } } } },
  responses: { 200: json(ScenarioWapla, 'Le scénario, à jour.'), 409: json(Erreur, 'Le scénario est figé.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'post', path: '/wapla/scenarios/{id}/calcul', tags: [TAG_WAPLA],
  summary: 'Calculer le scénario et le comparer au statu quo (commune)',
  description: 'Moteur corrigé ; le résultat du statu quo est copié dans le scénario. L’écart de coût ne porte que sur les procédés que le scénario ajoute (SPEC § 5).',
  security: SECURISE,
  request: { params: pScenario },
  responses: { 200: json(ScenarioWapla, 'Le scénario calculé.'), 409: json(Erreur, 'Le scénario est figé.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'post', path: '/wapla/scenarios/{id}/figer', tags: [TAG_WAPLA],
  summary: 'Figer un scénario calculé (commune)',
  description: 'Un scénario figé garde ses entrées, son résultat, la version du moteur et sa comparaison : la base refuse toute modification.',
  security: SECURISE,
  request: { params: pScenario },
  responses: { 200: json(ScenarioWapla, 'Le scénario figé.'), 409: json(Erreur, 'Déjà figé.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'post', path: '/wapla/scenarios/{id}/retrait', tags: [TAG_WAPLA],
  summary: 'Retirer un scénario (commune) — suppression logique',
  security: SECURISE,
  request: { params: pScenario },
  responses: { 204: { description: 'Scénario retiré.' }, ...REPONSES_COMMUNES },
});

// Lot W5 : les agrégats nationaux. Ni rang, ni ligne par commune.
const AgregatWapla = z.object({
  communes_etayees: z.number().int().openapi({ description: 'N : les communes dont le bilan de l’exercice est étayé.' }),
  communes: z.number().int().openapi({ description: 'M : les communes réelles du territoire, avec ou sans bilan.' }),
  valeurs: z
    .record(z.enum(GRANDEURS_AGREGEES), z.number())
    .nullable()
    .openapi({ description: 'Les sommes sur les N communes ; null quand N = 0 (jamais 0).' }),
});
registry.registerPath({
  method: 'get', path: '/wapla/agregats', tags: [TAG_WAPLA],
  summary: 'Agrégats nationaux des bilans étayés (FNCT)',
  description:
    'Par gouvernorat et par district, les seuls bilans calculés et étayés de l’exercice, d’une commune réelle (ni la commune de démonstration, ni une commune retirée), avec leur nombre : « N communes sur M ». Gisement, déchets mis en décharge, brûlés à l’air libre, GES (potentiel engagé), dioxines et furanes. Aucun rang, aucune ligne par commune ; les gouvernorats par ordre alphabétique, les districts dans l’ordre de la FNCT. Estimation de planification — méthode UNIDO WaPla.',
  security: SECURISE,
  request: { query: qAgregatsSchema },
  responses: {
    200: json(
      z.object({
        exercice: z.number().int(),
        grandeurs: z.array(z.enum(GRANDEURS_AGREGEES)),
        national: AgregatWapla,
        districts: z.array(
          AgregatWapla.extend({
            code: z.string().nullable().openapi({ description: 'null : les gouvernorats rattachés à aucun district.' }),
            nom: z.string().nullable(),
            nom_ar: z.string().nullable(),
          })
        ),
        gouvernorats: z.array(AgregatWapla.extend({ gouvernorat: z.string(), district: z.string().nullable() })),
      }),
      'Les agrégats de l’exercice.'
    ),
    ...REPONSES_COMMUNES,
  },
});

const TAG_SOURCES = 'Registres et lieux';
const Ligne = z.record(z.string(), z.any());
const pId = z.object({ id: z.string().uuid() });
const qCommuneSeule = z.object({ communeId: paramCommuneId.optional() });

const Lieu = registry.register(
  'Lieu',
  z
    .object({
      id: z.string().uuid(),
      commune_id: z.string(),
      nom: z.string(),
      type: z.enum(TYPES_POI),
      lat: z.number(),
      lng: z.number(),
      adresse: z.string().nullable(),
      actif: z.boolean(),
      zone_id: z.string().uuid().nullable(),
      zone_nom: z.string().nullable(),
      dernier_nettoyage: z.string().nullable(),
      prochain_nettoyage: z.string().nullable(),
      nettoyages_en_retard: z.number().int(),
      etat: z.enum(['non_renseigne', 'en_retard', 'propre', 'nettoyage_prevu', 'a_surveiller']),
    })
    .openapi('Lieu')
);

registry.registerPath({
  method: 'get', path: '/poi', tags: [TAG_SOURCES],
  summary: 'Les lieux de la commune (marchés, cimetières, abattoirs, écoles, santé)',
  description: 'Avec leur état de propreté, lu sur les actions de nettoyage : jamais nettoyé et rien de prévu, c’est « non renseigné ».',
  security: SECURISE,
  request: { query: qCommuneSeule.extend({ type: z.enum(TYPES_POI).optional() }) },
  responses: { 200: json(z.array(Lieu), 'Lieux.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'post', path: '/poi', tags: [TAG_SOURCES], summary: 'Ajouter un lieu', security: SECURISE,
  description: 'Le secteur de collecte se déduit de la position quand il n’est pas précisé.',
  request: { query: qCommuneSeule, body: { content: { 'application/json': { schema: poiSchema } } } },
  responses: { 201: json(Lieu, 'Lieu créé.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'patch', path: '/poi/{id}', tags: [TAG_SOURCES], summary: 'Modifier un lieu', security: SECURISE,
  request: { params: pId, body: { content: { 'application/json': { schema: poiSchema.partial() } } } },
  responses: { 200: json(Lieu, 'Lieu modifié.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'delete', path: '/poi/{id}', tags: [TAG_SOURCES], summary: 'Retirer un lieu', security: SECURISE,
  request: { params: pId }, responses: { 204: { description: 'Lieu retiré.' }, ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get', path: '/citoyen/lieux', tags: ['Espace citoyen'],
  summary: 'Les marchés et cimetières d’une commune et leur état de propreté (public)',
  description: 'Sans authentification, comme la carte publique. Seuls les marchés et les cimetières sortent — jamais un abattoir — et seulement pour la commune désignée.',
  request: { query: z.object({ communeId: z.string() }) },
  responses: {
    200: json(z.array(z.object({ id: z.string().uuid(), nom: z.string(), type: z.enum(['marche', 'cimetiere']), lat: z.number(), lng: z.number(),
      dernier_nettoyage: z.string().nullable(), prochain_nettoyage: z.string().nullable(),
      etat: z.enum(['non_renseigne', 'propre', 'nettoyage_prevu', 'a_surveiller']) })), 'Lieux publics.'),
    400: REPONSES_COMMUNES[400],
  },
});

for (const [chemin, nom, schema, resume] of [
  ['carburant', 'Plein', pleinSchema, 'Les pleins de carburant des engins (coût global à la tonne)'],
  ['fins-de-poste', 'Fin de poste', finDePosteSchema, 'La check-list de fin de poste — « benne bâchée avant transit », obligatoire (M1-9)'],
  ['epi', 'Dotation', dotationSchema, 'La dotation en équipements de protection individuelle (M1-6)'],
  ['incidents', 'Incident', incidentTravailSchema, 'Le journal des incidents du travail (axe 5) — un journal vide ne dit pas « zéro accident »'],
  ['commerces', 'Commerce', commerceSchema, 'Les commerces et institutions à conventionner (M2-2)'],
  ['conventions', 'Convention', conventionSchema, 'Les conventions de propreté des commerces (M2-2)'],
] as const) {
  registry.registerPath({
    method: 'get', path: `/registres/${chemin}`, tags: [TAG_SOURCES], summary: resume, security: SECURISE,
    request: { query: qCommuneSeule }, responses: { 200: json(z.array(Ligne), 'Registre.'), ...REPONSES_COMMUNES },
  });
  registry.registerPath({
    method: 'post', path: `/registres/${chemin}`, tags: [TAG_SOURCES], summary: `${nom} : saisie`, security: SECURISE,
    request: { query: qCommuneSeule, body: { content: { 'application/json': { schema: schema as any } } } },
    responses: { 201: json(Ligne, 'Ligne enregistrée.'), ...REPONSES_COMMUNES },
  });
  registry.registerPath({
    method: 'delete', path: `/registres/${chemin}/{id}`, tags: [TAG_SOURCES], summary: `${nom} : retrait logique`, security: SECURISE,
    request: { params: pId }, responses: { 204: { description: 'Retiré.' }, ...REPONSES_COMMUNES },
  });
}
registry.registerPath({
  method: 'patch', path: '/registres/commerces/{id}', tags: [TAG_SOURCES], summary: 'Modifier un commerce', security: SECURISE,
  request: { params: pId, body: { content: { 'application/json': { schema: commerceSchema.partial() } } } },
  responses: { 200: json(Ligne, 'Commerce modifié.'), ...REPONSES_COMMUNES },
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
      tonnage_jour_estime: z.number().nullable().openapi({ description: 'Tonnage de référence des communes à données estimées. Jamais additionné aux autres.' }),
      tonnage_jour_declare: z.number().nullable().openapi({ description: 'Tonnage de référence des communes à données déclarées.' }),
      tonnage_jour_mesure: z.number().nullable().openapi({ description: 'Tonnage de référence des communes à données mesurées.' }),
      tonnage_pese_12m_t: z.number().nullable().openapi({ description: 'Pesées réelles des douze derniers mois, en tonnes.' }),
      communes_pesees: z.number().int().openapi({ description: 'Communes qui ont au moins une pesée réelle sur ces douze mois.' }),
      taux_collecte: z.number().nullable().openapi({ description: 'Moyenne pondérée par la population, non arithmétique.' }),
      indice_proprete: z.number().nullable(),
      pcgd_valides: z.number().int(),
      reclamations_ouvertes: z.number().int(),
      reclamations_30j: z.number().int(),
      delai_traitement_jours: z.number().nullable(),
      communes_donnees_mesurees: z.number().int(),
      communes_donnees_declarees: z.number().int(),
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
  request: { query: z.object(paramsExport) },
  responses: { 200: jsonOuExport(z.array(LigneGouvernorat), 'Les 24 gouvernorats.'), 400: REPONSES_COMMUNES[400], 401: REPONSES_COMMUNES[401] },
});

const LigneActiviteDoc = registry.register(
  'LigneActivite',
  z.object({
    mois: z.string().openapi({ format: 'date' }),
    cle: z.string(),
    nom: z.string().nullable(),
    communes: z.number().int(),
    saisissent: z.number().int().openapi({ description: 'Communes qui ont saisi au moins une donnée dans le mois.' }),
    inactives: z.number().int().openapi({ description: 'Communes qui ont déjà saisi, mais rien ce mois-là.' }),
    pas_demarrees: z.number().int().openapi({ description: 'Communes activées qui n’ont encore rien saisi.' }),
    desactivees: z.number().int(),
  })
);
registry.registerPath({
  method: 'get',
  path: '/observatoire/activite',
  tags: ['Observatoire national'],
  summary: 'Le déploiement mois par mois (FNCT)',
  description:
    'Pour chaque mois : les communes qui saisissent, les inactives, celles qui n’ont pas encore démarré, les désactivées — pour le pays, par gouvernorat ou par district. Une saisie est le fait de la commune elle-même : ni la FNCT, ni les citoyens. La commune de démonstration n’y est pas. Au plus 24 mois.',
  security: SECURISE,
  request: { query: qActiviteSchema.extend(paramsExport) },
  responses: { 200: jsonOuExport(z.array(LigneActiviteDoc), 'Le déploiement, mois par mois.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get',
  path: '/observatoire/contours-gouvernorats',
  tags: ['Observatoire national'],
  summary: 'Les contours des 24 gouvernorats',
  description: 'Dissous à partir des communes réelles, simplifiés pour une carte nationale (GeoJSON). Sans la commune de démonstration.',
  security: SECURISE,
  responses: {
    200: json(
      z.object({
        type: z.literal('FeatureCollection'),
        features: z.array(
          z.object({
            type: z.literal('Feature'),
            properties: z.object({ gouvernorat: z.string(), communes: z.number().int() }),
            geometry: z.record(z.string(), z.any()),
          })
        ),
      }),
      'Les contours.'
    ),
    401: REPONSES_COMMUNES[401],
  },
});

registry.registerPath({
  method: 'get',
  path: '/observatoire/carte-communes',
  tags: ['Observatoire national'],
  summary: 'La carte des communes (contours et fiches)',
  description:
    'Les communes réelles (ni la commune de démonstration, ni une commune retirée), leur contour officiel simplifié et leur fiche : noms FR/AR, gouvernorat, district FNCT, type, population et sa provenance, superficie calculée sur l’ellipsoïde à partir du contour, secteurs, code. Une valeur absente est null, jamais 0.',
  security: SECURISE,
  responses: {
    200: json(
      z.object({
        type: z.literal('FeatureCollection'),
        features: z.array(
          z.object({
            type: z.literal('Feature'),
            properties: z.object({
              id: z.string(),
              nom: z.string(),
              nom_ar: z.string().nullable(),
              gouvernorat: z.string(),
              district: z.string().nullable(),
              type: z.string().nullable(),
              population: z.number().int().nullable(),
              provenance: z.string().nullable().openapi({ description: 'Provenance de la population : estime, declare, mesure…' }),
              superficie_km2: z.number().nullable(),
              secteurs: z.number().int().nullable(),
              code: z.number().int().nullable(),
            }),
            geometry: z.record(z.string(), z.any()),
          })
        ),
      }),
      'Les communes.'
    ),
    401: REPONSES_COMMUNES[401],
  },
});

registry.registerPath({
  method: 'get',
  path: '/observatoire/deploiement',
  tags: ['Observatoire national'],
  summary: 'Statut de déploiement des 350 communes',
  description:
    'Le statut n’est pas saisi : il se déduit du journal d’audit et des pesées importées. Une commune est active dès que quelqu’un y a écrit quelque chose.',
  security: SECURISE,
  request: { query: z.object(paramsExport) },
  responses: { 200: jsonOuExport(z.array(StatutCommune), 'Les 350 communes.'), 400: REPONSES_COMMUNES[400], 401: REPONSES_COMMUNES[401] },
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

const Hebergement = registry.register(
  'HebergementIdentites',
  z.object({
    accredite: z.boolean(),
    reference: z.string().nullable().openapi({ description: 'La pièce qui fonde l’accréditation.' }),
    depuis: z.string().nullable(),
  })
);

registry.registerPath({
  method: 'get',
  path: '/observatoire/hebergement-identites',
  tags: ['Observatoire'],
  summary: 'L’hébergement des identités nominatives est-il accrédité ?',
  description: 'Tant qu’il ne l’est pas, la base refuse toute identité de pré-collecteur, dans toutes les communes (lot 16.1).',
  security: SECURISE,
  responses: { 200: json(Hebergement, 'État.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'put',
  path: '/observatoire/hebergement-identites',
  tags: ['Observatoire'],
  summary: 'Déclarer l’hébergement des identités accrédité, ou le révoquer',
  description: 'FNCT seulement. « Accrédité » exige la référence de la pièce qui le fonde ; la base la refuse sans elle.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: hebergementSchema } } } },
  responses: { 200: json(Hebergement, 'État mis à jour.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'put',
  path: '/communes/{id}/recepisse-inpdp',
  tags: ['Communes'],
  summary: 'Récépissé de déclaration INPDP de la commune',
  description:
    'Sans récépissé, la base refuse d’enregistrer la moindre identité de pré-collecteur dans la commune (loi organique n° 2004-63, lot 16.1). ' +
    'null referme la porte sans effacer les identités déjà enregistrées.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: recepisseInpdpSchema } } },
  },
  responses: { 200: json(z.any(), 'Paramètres de la commune.'), ...REPONSES_COMMUNES },
});

// --- Documents à numérotation scellée (lot 16.2) ---------------------------

const DocumentEmis = registry.register(
  'DocumentEmis',
  z.object({
    id: z.string().uuid(),
    commune_id: z.string(),
    type_document: z.enum(['ordre_mission', 'bon_carburant', 'bon_travail', 'declaration_panne', 'carte_precollecteur']),
    exercice: z.number().int(),
    numero: z.number().int().openapi({ description: 'Rang continu dans le registre commune × type × exercice. Jamais réutilisé.' }),
    numero_affiche: z.string().openapi({ example: 'BC-2026-00042' }),
    contenu: z.record(z.unknown()).openapi({ description: 'Contenu tel qu’émis, figé.' }),
    empreinte_contenu: z.string().openapi({ description: 'SHA-256 du contenu à l’émission.' }),
    objet_type: z.string().nullable(),
    objet_id: z.string().nullable(),
    emis_le: z.string(),
    emis_par: z.string().uuid().nullable(),
    statut: z.enum(['emis', 'annule']),
    annule_le: z.string().nullable(),
    annule_par: z.string().uuid().nullable(),
    motif_annulation: z.string().nullable(),
  })
);

const DESCRIPTION_SCELLE =
  'Numéro continu par commune, type et exercice, attribué par la base sous verrou dans la même transaction que le document : ' +
  'deux émissions simultanées reçoivent deux numéros distincts, une émission qui échoue n’en consomme aucun. Un document émis ' +
  'ne se modifie pas et ne s’efface pas ; seule l’annulation motivée est permise, et le numéro reste au registre.';

registry.registerPath({
  method: 'get',
  path: '/documents',
  tags: ['Documents'],
  summary: 'Registre des documents émis',
  description: DESCRIPTION_SCELLE,
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      type: z.enum(['ordre_mission', 'bon_carburant', 'bon_travail', 'declaration_panne', 'carte_precollecteur']).optional(),
      exercice: z.number().int().optional(),
      statut: z.enum(['emis', 'annule']).optional(),
    }),
  },
  responses: { 200: json(z.array(DocumentEmis), 'Documents.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/documents/trous',
  tags: ['Documents'],
  summary: 'Numéros attribués sans document au registre',
  description: 'Ne devrait jamais rien rendre. Une ligne signale une manipulation hors de l’application : la plateforme la montre au lieu de la taire.',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: {
    200: json(z.array(z.object({ type_document: z.string(), exercice: z.number().int(), numero_manquant: z.number().int() })), 'Trous.'),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'get',
  path: '/documents/gabarits',
  tags: ['Documents'],
  summary: 'Les gabarits des documents scellés (lot 16.2 ; carte de pré-collecteur, lot I2)',
  description:
    'Pour chaque type : titres FR/AR, référence, champs (clé, libellés, nature, obligatoire, unité), signatures, et statut — « provisoire » jusqu’à la validation par un chef de dépôt (décision du 16/10/2026). Le contenu d’un document émis doit suivre son gabarit.',
  security: SECURISE,
  responses: {
    200: json(
      z.array(
        z.object({
          type: z.enum(['ordre_mission', 'bon_carburant', 'bon_travail', 'declaration_panne', 'carte_precollecteur']),
          statut: z.enum(['provisoire', 'valide']),
          fr: z.string(),
          ar: z.string(),
          reference: z.object({ fr: z.string(), ar: z.string() }),
          champs: z.array(
            z.object({
              cle: z.string(),
              fr: z.string(),
              ar: z.string(),
              nature: z.enum(['texte', 'texte_long', 'date', 'nombre', 'oui_non']),
              requis: z.boolean().optional(),
              unite: z.string().optional(),
              imprimeSeulement: z.literal(true).optional().openapi({
                description: 'Imprimé, jamais scellé : la valeur s’ajoute à l’impression pour qui a le droit de la lire (le nom du titulaire d’une carte).',
              }),
              cache: z.literal(true).optional().openapi({ description: 'Scellé, jamais imprimé en case (sert un bandeau).' }),
            })
          ),
          signatures: z.array(z.object({ fr: z.string(), ar: z.string() })),
        })
      ),
      'Les gabarits.'
    ),
    401: REPONSES_COMMUNES[401],
  },
});

registry.registerPath({
  method: 'get',
  path: '/documents/{id}',
  tags: ['Documents'],
  summary: 'Un document émis',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: json(DocumentEmis, 'Document.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/documents/{id}/impression',
  tags: ['Documents'],
  summary: 'Imprimer un document : page A4 bilingue (HTML)',
  description:
    'En-tête de l’État, du gouvernorat et de la commune ; numéro d’ordre ; référence ; champs du gabarit (un champ vide reste vide) ; signatures ; mention d’édition (heure de Tunis, auteur) et empreinte du contenu. Bandeau « modèle provisoire » tant que le gabarit n’est pas validé ; un document annulé s’imprime barré, avec son motif. ' +
    'Une carte de pré-collecteur porte le nom de son titulaire pour le seul directeur de la commune (lu dans la table d’identité, ' +
    'lecture journalisée) ; pour la FNCT, la case reste vide. Une carte accordée sur une règle provisoire le dit en bandeau.',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'La page imprimable.', content: { 'text/html': { schema: z.string() } } },
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'post',
  path: '/documents',
  tags: ['Documents'],
  summary: 'Émettre un document',
  description:
    DESCRIPTION_SCELLE +
    ' Réservé à l’admin de la commune : émettre une pièce de la commune est un acte de la commune, pas de la FNCT. ' +
    'L’objet éventuel (engin, circuit, agent, intervention) doit appartenir à la commune.',
  security: SECURISE,
  request: {
    query: z.object({ communeId: paramCommuneId.optional() }),
    body: { content: { 'application/json': { schema: emissionSchema } } },
  },
  responses: { 201: json(DocumentEmis, 'Document émis.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/documents/{id}/annuler',
  tags: ['Documents'],
  summary: 'Annuler un document, avec un motif',
  description: 'Le numéro reste au registre et le contenu reste lisible. Un document déjà annulé répond 409. Réservé à l’admin de la commune.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: annulationSchema } } },
  },
  responses: { 200: json(DocumentEmis, 'Document annulé.'), 409: json(Erreur, 'Déjà annulé.'), ...REPONSES_COMMUNES },
});

// --- Exploitation des engins : carnet de bord, carburant (lot 16.3) --------

const SortieCarnet = registry.register(
  'SortieCarnet',
  z.object({
    id: z.string().uuid(),
    vehicule_id: z.string(),
    registration: z.string(),
    unite_compteur: z.enum(['km', 'heures']),
    jour: z.string(),
    seance: z.enum(['matin', 'apres_midi', 'nuit']),
    chauffeur_id: z.string().uuid().nullable(),
    chauffeur_matricule: z.string().nullable(),
    chauffeur_nom: z.string().nullable(),
    circuit_id: z.string().uuid().nullable(),
    circuit_nom: z.string().nullable(),
    heure_sortie: z.string().nullable(),
    heure_retour: z.string().nullable(),
    compteur_sortie: z.number(),
    compteur_retour: z.number().nullable(),
    parcouru: z.number().nullable().openapi({ description: 'Calculé par la base (retour − sortie), jamais saisi. En km ou en heures selon l’engin.' }),
    bon_pesee_numero: z.string().nullable(),
    tonnage_t: z.number().nullable(),
    observation: z.string().nullable(),
    created_at: z.string(),
  })
);

const paramMois = z.string().openapi({ param: { name: 'mois', in: 'query' }, example: '2026-07', description: 'Mois au format AAAA-MM.' });

registry.registerPath({
  method: 'get',
  path: '/exploitation/carnets',
  tags: ['Exploitation'],
  summary: 'Carnet de bord (sorties des engins)',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional(), vehiculeId: z.string().optional(), mois: paramMois.optional() }) },
  responses: { 200: json(z.array(SortieCarnet), 'Sorties.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/exploitation/carnets',
  tags: ['Exploitation'],
  summary: 'Enregistrer une sortie au carnet de bord',
  description:
    'Une sortie par engin, par jour et par séance (409 sinon). Le compteur au retour peut attendre que l’engin rentre ; il ne ' +
    'peut jamais être inférieur au compteur à la sortie. La distance parcourue se déduit des deux compteurs, elle ne se saisit pas. ' +
    'Le chauffeur et le circuit appartiennent à la commune de l’engin.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: carnetSchema } } } },
  responses: { 201: json(SortieCarnet, 'Sortie enregistrée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/exploitation/carnets/{id}/retour',
  tags: ['Exploitation'],
  summary: 'Saisir le retour d’une sortie',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: retourSchema } } },
  },
  responses: { 200: json(SortieCarnet, 'Sortie complétée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/exploitation/carnets/{id}',
  tags: ['Exploitation'],
  summary: 'Retirer une sortie (retrait logique)',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Sortie retirée.' }, ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/exploitation/bons-carburant',
  tags: ['Exploitation'],
  summary: 'Émettre un bon de sortie carburant',
  description:
    'Émet le bon numéroté (registre scellé, BC-AAAA-NNNNN) ET enregistre le plein qu’il justifie, dans la même transaction. ' +
    'Annuler le bon (POST /documents/{id}/annuler) retire le plein ; un plein sous bon valable ne se retire pas autrement. ' +
    'Réservé à l’admin de la commune.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: bonCarburantSchema } } } },
  responses: { 201: json(DocumentEmis, 'Bon émis.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/exploitation/quotas',
  tags: ['Exploitation'],
  summary: 'Quotas mensuels de carburant par engin',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: {
    200: json(
      z.array(z.object({ id: z.string().uuid(), vehicule_id: z.string(), registration: z.string(), litres_mois: z.number(), depuis: z.string(), created_at: z.string() })),
      'Quotas.'
    ),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'post',
  path: '/exploitation/quotas',
  tags: ['Exploitation'],
  summary: 'Fixer le quota mensuel d’un engin, à une date',
  description: 'Le quota d’un mois est celui en vigueur au premier jour du mois. Un nouveau quota s’ajoute ; l’ancien reste pour relire les mois passés.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: quotaSchema } } } },
  responses: {
    201: json(z.object({ id: z.string().uuid(), vehicule_id: z.string(), litres_mois: z.number(), depuis: z.string() }), 'Quota fixé.'),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'delete',
  path: '/exploitation/quotas/{id}',
  tags: ['Exploitation'],
  summary: 'Retirer un quota (retrait logique)',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Quota retiré.' }, ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'put',
  path: '/exploitation/engins/{id}/unite-compteur',
  tags: ['Exploitation'],
  summary: 'Unité du compteur d’un engin (km ou heures)',
  description: 'Décide du ratio : L/100 km pour un compteur kilométrique, L/heure pour un compteur horaire.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: uniteCompteurSchema } } },
  },
  responses: { 200: json(z.object({ id: z.string(), registration: z.string(), unite_compteur: z.string() }), 'Unité enregistrée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/exploitation/consommation',
  tags: ['Exploitation'],
  summary: 'Consommation par engin et par mois : litres, distance, L/100 km, écart au quota',
  description:
    'Ratio mensuel du référentiel (diapo 44), exprimé en litres aux 100 km (L/heure pour un compteur horaire). Une source absente ' +
    'rend null, jamais 0 : sans carnet de bord, pas de ratio ; sans quota, pas d’écart. Aucun ratio par chauffeur.',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional(), mois: paramMois }) },
  responses: {
    200: json(
      z.object({
        communeId: z.string(),
        mois: z.string(),
        engins: z.array(
          z.object({
            vehicule_id: z.string(),
            registration: z.string(),
            unite_compteur: z.enum(['km', 'heures']),
            quota_litres: z.number().nullable(),
            litres: z.number().nullable(),
            pleins: z.number().int(),
            parcouru: z.number().nullable(),
            seances: z.number().int(),
            litres_100km: z.number().nullable(),
            litres_heure: z.number().nullable(),
            ecart_quota_litres: z.number().nullable(),
            ecart_quota_pct: z.number().nullable(),
            sorties_ouvertes: z.number().int(),
          })
        ),
      }),
      'Consommation.'
    ),
    ...REPONSES_COMMUNES,
  },
});

// --- Dossier de déclassement (lot 16.4) -----------------------------------

const SEUIL_80 = z.enum(['atteint', 'non_atteint', 'indetermine', 'non_calculable']).openapi({
  description:
    'Le seuil de 80 % du prix d’acquisition (référentiel, diapo 83), AFFICHÉ — il ne déclasse rien. indetermine : non atteint, ' +
    'mais des interventions n’ont pas de coût ; non_calculable : pas de valeur d’achat, ou carnet d’entretien non tenu.',
});

const ConstatEngin = registry.register(
  'ConstatDeclassement',
  z.object({
    vehicule_id: z.string(),
    registration: z.string(),
    type_engin: z.string(),
    categorie: z.string().nullable(),
    marque: z.string().nullable(),
    etat: z.string(),
    date_premiere_circulation: z.string().nullable(),
    age_annees: z.number().nullable().openapi({ description: 'Âge en années décimales (diapo 85), depuis la première mise en circulation.' }),
    valeur_achat_tnd: z.number().nullable(),
    cumul_depenses_tnd: z.number().nullable().openapi({ description: 'Entretien et réparation depuis l’acquisition (carburant exclu). Null si le carnet d’entretien n’est pas tenu.' }),
    interventions: z.number().int().nullable(),
    interventions_sans_cout: z.number().int().nullable(),
    part_depenses_pct: z.number().nullable(),
    seuil_80: SEUIL_80,
    pannes_12_mois: z.number().int().nullable(),
    annee: z.number().int(),
    jours_immobilisation: z.number().int().nullable().openapi({ description: 'Dans l’année. Null si le registre des immobilisations n’est pas tenu, ou si le début de l’immobilisation en cours est inconnu.' }),
    debut_immobilisation_inconnu: z.boolean(),
    jours_travailles: z.number().int().nullable().openapi({ description: 'Jours distincts au carnet de bord dans l’année. Null si la commune ne tient pas le carnet cette année-là.' }),
    rapport_rendement: z.number().nullable().openapi({ description: 'Jours d’immobilisation / jours travaillés.' }),
  })
);

const Immobilisation = registry.register(
  'ImmobilisationEngin',
  z.object({
    id: z.string().uuid(),
    vehicule_id: z.string(),
    registration: z.string(),
    debut: z.string(),
    fin: z.string().nullable().openapi({ description: 'Dernier jour d’immobilisation, compris. Null : toujours à l’arrêt.' }),
    motif: z.string().nullable(),
    origine: z.enum(['saisie', 'etat_engin']),
    jours: z.number().int(),
    created_at: z.string(),
  })
);

const LigneDossier = z.object({
  id: z.string().uuid(),
  vehicule_id: z.string(),
  registration: z.string(),
  type_engin: z.string(),
  marque: z.string().nullable(),
  age_annees: z.number().nullable(),
  date_proposition: z.string(),
  motifs: z.array(z.enum(MOTIFS_DECLASSEMENT)),
  statut: z.enum(['en_cours', 'adjuge', 'sans_suite']),
  seuil_80: SEUIL_80,
  part_depenses_pct: z.number().nullable(),
  derniere_etape: z.enum(ETAPES_DECLASSEMENT).nullable(),
  date_derniere_etape: z.string().nullable(),
});

const DossierDeclassement = registry.register(
  'DossierDeclassement',
  z.object({
    id: z.string().uuid(),
    commune_id: z.string(),
    vehicule_id: z.string(),
    registration: z.string(),
    type_engin: z.string(),
    marque: z.string().nullable(),
    etat_engin: z.string(),
    date_proposition: z.string(),
    motifs: z.array(z.enum(MOTIFS_DECLASSEMENT)),
    expose: z.string(),
    cout_reparation_estime_tnd: z.number().nullable(),
    annee_rendement: z.number().int(),
    constat: ConstatEngin.openapi({ description: 'Le constat FIGÉ au jour de la proposition.' }),
    statut: z.enum(['en_cours', 'adjuge', 'sans_suite']),
    created_at: z.string(),
    constat_du_jour: ConstatEngin.nullable(),
    etapes: z.array(
      z.object({
        id: z.string().uuid(),
        etape: z.enum(ETAPES_DECLASSEMENT),
        date_etape: z.string(),
        sens: z.enum(['favorable', 'defavorable']).nullable(),
        reference: z.string().nullable(),
        observation: z.string().nullable(),
        mode_adjudication: z.enum(['pli_ferme', 'enchere_publique']).nullable(),
        montant_adjuge_tnd: z.number().nullable(),
        created_at: z.string(),
      })
    ),
    pieces: z.array(
      z.object({
        id: z.string().uuid(),
        nature: z.enum(NATURES_PIECE),
        fichier_id: z.string().uuid(),
        nom_original: z.string(),
        type_mime: z.string(),
        taille_octets: z.number().int(),
        url: z.string(),
        created_at: z.string(),
      })
    ),
    depenses: z.array(
      z.object({
        id: z.string().uuid(),
        date_intervention: z.string(),
        type: z.string(),
        nature: z.string(),
        description: z.string().nullable(),
        cout_tnd: z.number().nullable(),
        prestataire: z.string().nullable(),
      })
    ).openapi({ description: 'L’inventaire des dépenses de l’engin depuis son acquisition : son carnet d’entretien.' }),
    completude: z.array(
      z.object({
        piece: z.enum(['facture_acquisition', 'inventaire_depenses', 'rapport_rendement', 'devis_reparation']),
        statut: z.enum(['jointe', 'calculee', 'renseignee', 'manquante']),
      })
    ).openapi({ description: 'Les quatre pièces obligatoires (diapo 83) et leur état. Affiché, jamais bloquant.' }),
    etapes_possibles: z.array(z.enum(ETAPES_DECLASSEMENT)),
  })
);

const paramAnnee = z.coerce.number().int().openapi({ param: { name: 'annee', in: 'query' }, example: 2026, description: 'Année du rapport de rendement. Par défaut, l’année en cours.' });

registry.registerPath({
  method: 'get',
  path: '/declassement/constat',
  tags: ['Déclassement'],
  summary: 'Constat par engin : âge, cumul des dépenses et seuil de 80 %, rapport de rendement',
  description:
    'Calculé par la base (app.constat_declassement). Une source non tenue rend null, jamais 0. Les engins déjà réformés n’y figurent pas.',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional(), annee: paramAnnee.optional() }) },
  responses: {
    200: json(z.object({ communeId: z.string(), annee: z.number().int(), engins: z.array(ConstatEngin) }), 'Constat.'),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'get',
  path: '/declassement/immobilisations',
  tags: ['Déclassement'],
  summary: 'Périodes d’immobilisation des engins',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional(), vehiculeId: z.string().optional() }) },
  responses: { 200: json(z.array(Immobilisation), 'Périodes.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/declassement/immobilisations',
  tags: ['Déclassement'],
  summary: 'Inscrire une période d’immobilisation',
  description:
    'Pour le passé, ou une panne connue. Les périodes s’ouvrent et se ferment aussi d’elles-mêmes quand l’état de l’engin change. ' +
    'Deux périodes d’un même engin ne se chevauchent pas (409) ; ni le début ni la fin ne sont dans l’avenir.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: immobilisationSchema } } } },
  responses: { 201: json(Immobilisation, 'Période inscrite.'), 409: json(Erreur, 'Chevauchement.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/declassement/immobilisations/{id}/fin',
  tags: ['Déclassement'],
  summary: 'Fermer (ou corriger la fin d’) une période d’immobilisation',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: finImmobilisationSchema } } },
  },
  responses: { 200: json(Immobilisation, 'Période mise à jour.'), 409: json(Erreur, 'Chevauchement.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/declassement/immobilisations/{id}',
  tags: ['Déclassement'],
  summary: 'Retirer une période d’immobilisation (retrait logique)',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Période retirée.' }, ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/declassement/dossiers',
  tags: ['Déclassement'],
  summary: 'Liste de proposition au déclassement (diapo 85)',
  description: 'Type, marque, matricule, âge en années décimales au jour de la proposition, date, motifs — et où en est le circuit.',
  security: SECURISE,
  request: {
    query: z.object({ communeId: paramCommuneId.optional(), statut: z.enum(['en_cours', 'adjuge', 'sans_suite']).optional() }),
  },
  responses: { 200: json(z.array(LigneDossier), 'Dossiers.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/declassement/dossiers',
  tags: ['Déclassement'],
  summary: 'Proposer un engin au déclassement',
  description:
    'Ouvre le dossier : motifs (conditions de la diapo 83), rapport détaillé, coût estimatif de la réparation. Le constat est calculé ' +
    'et figé par la base au jour de la proposition. Un seul dossier en cours par engin (409). Réservé à l’admin de la commune.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: dossierSchema } } } },
  responses: { 201: json(DossierDeclassement, 'Dossier ouvert.'), 409: json(Erreur, 'Dossier déjà en cours, ou engin réformé.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/declassement/dossiers/{id}',
  tags: ['Déclassement'],
  summary: 'Un dossier de déclassement : constat figé et du jour, dépenses, pièces, circuit',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: json(DossierDeclassement, 'Dossier.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/declassement/dossiers/{id}',
  tags: ['Déclassement'],
  summary: 'Corriger les motifs, le rapport ou le coût estimatif',
  description: 'Tant qu’aucune étape du circuit n’est inscrite. Ensuite, le dossier est figé (409).',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: majDossierSchema } } },
  },
  responses: { 200: json(DossierDeclassement, 'Dossier corrigé.'), 409: json(Erreur, 'Dossier figé.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/declassement/dossiers/{id}/etapes',
  tags: ['Déclassement'],
  summary: 'Inscrire une étape du circuit d’autorisation',
  description:
    'Dans l’ordre que la base impose : accord de l’administration communale ; avis des Domaines de l’État et du contrôle technique ' +
    '(après un accord favorable) ; publicité légale (après deux avis favorables) ; adjudication, qui clôt le dossier. « sans_suite », ' +
    'avec son motif, le clôt à tout moment. Une date ne précède ni la proposition ni l’étape précédente, et n’est pas dans l’avenir. ' +
    'L’engin adjugé ne passe pas « réformé » de lui-même : « À vérifier » le rappelle. Réservé à l’admin de la commune.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: etapeSchema } } },
  },
  responses: { 201: json(DossierDeclassement, 'Étape inscrite.'), 409: json(Erreur, 'Étape prématurée, en double, ou dossier clos.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/declassement/dossiers/{id}/etapes/{etapeId}',
  tags: ['Déclassement'],
  summary: 'Retirer une étape saisie à tort',
  description: 'Tant que le dossier est en cours et qu’aucune étape suivante ne s’appuie sur elle (409 sinon).',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid(), etapeId: z.string().uuid() }) },
  responses: { 200: json(DossierDeclassement, 'Étape retirée.'), 409: json(Erreur, 'Étape dont une autre dépend, ou dossier clos.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/declassement/dossiers/{id}/pieces',
  tags: ['Déclassement'],
  summary: 'Joindre une pièce au dossier',
  description: 'Le fichier est déposé d’abord par POST /fichiers (usage « declassement ») ; il appartient à la commune du dossier.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: pieceSchema } } },
  },
  responses: { 201: json(DossierDeclassement, 'Pièce jointe.'), 409: json(Erreur, 'Fichier déjà joint.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/declassement/dossiers/{id}/pieces/{pieceId}',
  tags: ['Déclassement'],
  summary: 'Retirer une pièce jointe',
  description: 'Tant que le dossier est en cours : les pièces d’un dossier clos restent (409).',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid(), pieceId: z.string().uuid() }) },
  responses: { 200: json(DossierDeclassement, 'Pièce retirée.'), 409: json(Erreur, 'Dossier clos.'), ...REPONSES_COMMUNES },
});

// --- Paramètres nationaux historisés (lot 17.3) ----------------------------

const ValeurParametreNational = registry.register(
  'ValeurParametreNational',
  z.object({
    id: z.string().uuid(),
    code: z.string(),
    date_effet: z.string().openapi({ description: 'Premier jour où la valeur s’applique ; peut être dans l’avenir.' }),
    valeur_nombre: z.number().nullable(),
    valeur_fr: z.string().nullable(),
    valeur_ar: z.string().nullable(),
    valeur_date: z.string().nullable().openapi({ description: 'Pour un paramètre de nature date : la date elle-même (AAAA-MM-JJ).' }),
    provisoire: z.boolean(),
    reference: z.string().nullable(),
    created_at: z.string(),
    retire_le: z.string().nullable(),
    motif_retrait: z.string().nullable(),
  })
);

registry.registerPath({
  method: 'get',
  path: '/parametres-nationaux',
  tags: ['Paramètres nationaux'],
  summary: 'Les paramètres nationaux : valeur en vigueur, valeurs à venir, historique',
  description:
    'Redevance ANGeD, ministère de tutelle, formule d’en-tête des documents, coût de collecte, et les règles du secteur informel ' +
    '(rubrique « secteur_informel » : durées du projet de décret, date de départ de la période transitoire). Chaque valeur porte ' +
    'sa date d’effet ; la valeur d’une date est la dernière entrée en vigueur. « en_vigueur » est null tant qu’aucune ne ' +
    's’applique. Lisible par tout utilisateur authentifié.',
  security: SECURISE,
  responses: {
    200: json(
      z.array(
        z.object({
          code: z.string(),
          nature: z.enum(['nombre', 'texte', 'date']),
          unite: z.string().nullable(),
          borne_min: z.number().nullable(),
          borne_max: z.number().nullable(),
          entier: z.boolean().openapi({ description: 'Un nombre entier est exigé (une durée en mois).' }),
          rubrique: z.enum(['general', 'secteur_informel']),
          libelle_fr: z.string(),
          libelle_ar: z.string(),
          description: z.string(),
          en_vigueur: ValeurParametreNational.nullable(),
          a_venir: z.array(ValeurParametreNational),
          historique: z.array(ValeurParametreNational),
        })
      ),
      'Paramètres.'
    ),
    ...REPONSES_COMMUNES,
  },
});

const ReferenceCoutEngin = registry.register(
  'ReferenceCoutEngin',
  z.object({
    id: z.string().uuid(),
    classe: z.string(),
    tranche_m3: z.string().nullable().openapi({ description: 'Tranche de volume de la benne ; vide : tout volume.' }),
    prix_neuf_tnd: z.number().nullable(),
    conso_l_seance: z.number().nullable(),
    date_effet: z.string(),
    source: z.string(),
    retire_le: z.string().nullable(),
  })
);

registry.registerPath({
  method: 'get',
  path: '/cout-collecte/references',
  tags: ['Volumétrie'],
  summary: 'Les prix et consommations indicatifs du guide, par classe d’engin',
  description:
    'Lot C. Lecture seule : ils ne servent qu’à défaut du prix d’achat réel ou d’un plein enregistré, et le coût le dit (« prix du guide », « ratio du guide »).',
  security: SECURISE,
  responses: {
    200: { description: 'Les références.', content: { 'application/json': { schema: z.array(ReferenceCoutEngin) } } },
    ...REPONSES_COMMUNES,
  },
});

const ProvenanceCout = z.enum(['reel', 'ratio_guide', 'prix_guide', 'don', 'sans_activite']).nullable();
const CoutCollecteCircuit = z.object({
  circuit_id: z.string().uuid(),
  circuit: z.string(),
  vehicule_immat: z.string().nullable(),
  cle_engin: z.enum(['km', 'voyages']).nullable().openapi({ description: 'Comment le coût de l’engin se ventile : kilomètres du carnet de bord, sinon voyages attendus.' }),
  personnel_tnd: z.number().nullable(),
  personnel_cle: z.enum(['pointage', 'equipe']).nullable(),
  carburant_tnd: z.number().nullable(),
  carburant_provenance: ProvenanceCout,
  entretien_tnd: z.number().nullable(),
  entretien_provenance: ProvenanceCout,
  amortissement_tnd: z.number().nullable(),
  amortissement_provenance: ProvenanceCout,
  redevance_tnd: z.number().nullable(),
  total_tnd: z.number().nullable().openapi({ description: 'Coût direct (A + B), seulement si aucune composante ne manque.' }),
  pese_t: z.number().nullable(),
  voyages_attendus: z.number().int(),
  voyages_peses: z.number().int(),
  cout_tonne: z.number().nullable().openapi({ description: 'Seulement quand tous les voyages attendus sont pesés : jamais sur un tonnage estimé.' }),
  manque: z.array(z.enum(['personnel', 'engin', 'carburant', 'entretien', 'amortissement', 'redevance'])),
});
const CoutCollecteEngin = z.object({
  vehicule_id: z.string(),
  immat: z.string(),
  classe: z.string().nullable(),
  volume_m3: z.number().nullable(),
  membres: z.array(z.string()).openapi({ description: 'L’engin et sa remorque attelée : une unité de travail.' }),
  age_ans: z.number().int().nullable(),
  valeur_tnd: z.number().nullable(),
  valeur_provenance: ProvenanceCout,
  duree_ans: z.number().nullable().openapi({ description: 'La plus grande de la durée de référence et de l’âge (décision du 26/10/2026).' }),
  amortissement_tnd: z.number().nullable(),
  amortissement_provenance: ProvenanceCout,
  entretien_tnd: z.number().nullable(),
  entretien_provenance: ProvenanceCout,
  carburant_tnd: z.number().nullable(),
  carburant_provenance: ProvenanceCout,
  seances: z.number().int(),
});
const CoutCollecte = registry.register(
  'CoutCollecte',
  z.object({
    periode: z.string(),
    debut: z.string(),
    fin: z.string(),
    circuits: z.array(CoutCollecteCircuit),
    engins: z.array(CoutCollecteEngin),
    indirects: z
      .object({
        etude_id: z.string().uuid(),
        document: z.string(),
        exercice: z.number().int(),
        parc_tnd: z.number().nullable(),
        administration_tnd: z.number().nullable(),
        indirects_tnd: z.number().nullable(),
      })
      .nullable()
      .openapi({ description: 'Frais indirects (C + D) d’une étude de coût complet de l’exercice (17.5). Aucun forfait n’en tient lieu.' }),
    commune: z.object({
      circuits_complets: z.number().int(),
      circuits: z.number().int(),
      cout_direct_tnd: z.number().nullable().openapi({ description: 'Seulement si chaque circuit a son coût.' }),
      cout_complet_tnd: z.number().nullable(),
      population: z.number().nullable(),
      cout_direct_par_habitant: z.number().nullable().openapi({ description: 'Sur une année seulement.' }),
      cout_complet_par_habitant: z.number().nullable(),
    }),
  })
);

registry.registerPath({
  method: 'get',
  path: '/cout-collecte',
  tags: ['Volumétrie'],
  summary: 'Le coût de collecte d’une période, par circuit et par engin',
  description:
    'Lot C. Personnel, carburant, entretien, amortissement et redevance, chacun avec sa provenance : réel d’abord ; à défaut, ratio ou prix du guide, dit tel ; sinon absent, et le total n’existe pas. Frais indirects seulement d’une étude de coût complet. Coût à la tonne sur le seul pesé, quand tous les voyages sont pesés. L’export (format) rend le tableau des circuits. Hors du périmètre : 404.',
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      periode: z.string().regex(/^\d{4}(-\d{2})?$/).optional().openapi({ description: 'AAAA-MM (un mois) ou AAAA (une année) ; le mois en cours par défaut.' }),
      ...paramsExport,
    }),
  },
  responses: { 200: jsonOuExport(CoutCollecte, 'Le coût de la période.'), ...REPONSES_COMMUNES },
});

const DensiteReference = registry.register(
  'DensiteReference',
  z
    .object({
      id: z.string().uuid(),
      flux: z.enum(['dma']),
      equipement: z.string().openapi({ description: 'Une classe d’engin (GET /trucks/classes), ou poubelles_conteneurs.' }),
      tranche_m3: z.string().nullable().openapi({ description: 'Tranche de volume, en intervalle ([7,8], (8,)). Vide : tout volume.' }),
      tranche_min_m3: z.number().nullable(),
      tranche_max_m3: z.number().nullable(),
      tranche_min_incluse: z.boolean().nullable(),
      tranche_max_incluse: z.boolean().nullable(),
      densite_min: z.number(),
      densite_max: z.number().openapi({ description: 'Densité en t/m³. Égale au minimum quand la référence ne donne qu’une valeur.' }),
      date_effet: z.string(),
      source: z.string(),
      created_at: z.string(),
      retire_le: z.string().nullable(),
      motif_retrait: z.string().nullable(),
      en_vigueur: z.boolean().optional().openapi({ description: 'La valeur appliquée aujourd’hui à cet équipement et cette tranche.' }),
    })
    .openapi('DensiteReference')
);

const TonnageEstimeCircuit = registry.register(
  'TonnageEstimeCircuit',
  z
    .object({
      circuit_id: z.string().uuid(),
      circuit: z.string(),
      type_dechet: z.string().nullable(),
      vehicule_immat: z.string().nullable(),
      porteur_immat: z.string().nullable().openapi({ description: 'L’engin qui porte la benne (la remorque, pour un tracteur).' }),
      classe: z.string().nullable(),
      volume_m3: z.number().nullable(),
      volume_provenance: z.enum(['constructeur', 'mesure', 'declare']).nullable(),
      densite_min: z.number().nullable(),
      densite_max: z.number().nullable(),
      densite_source: z.string().nullable(),
      voyages_attendus: z.number().int(),
      voyages_peses: z.number().int(),
      voyages_estimes: z.number().int().openapi({ description: 'Les voyages attendus sans pesée : les seuls qui s’estiment.' }),
      tonnage_min_t: z.number().nullable(),
      tonnage_max_t: z.number().nullable().openapi({
        description: 'Fourchette du tonnage estimé des voyages non pesés, benne pleine. Vide si rien n’est à estimer, ou s’il manque quelque chose.',
      }),
      tonnage_pese_t: z.number().nullable().openapi({ description: 'Le pesé du mois, à part : jamais ajouté à l’estimation.' }),
      manque: z
        .enum(['flux_non_renseigne', 'flux_sans_densite', 'circuit_sans_engin', 'remorque_absente', 'remorques_multiples',
               'classe', 'volume', 'classe_et_volume', 'aucun_voyage_attendu', 'densite_absente'])
        .nullable(),
    })
    .openapi('TonnageEstimeCircuit')
);

registry.registerPath({
  method: 'get',
  path: '/volumetrie/densites',
  tags: ['Volumétrie'],
  summary: 'La matrice des densités',
  description:
    'Lot 17.2. Chaque valeur, par équipement et tranche de volume, avec sa date d’effet et sa source ; en_vigueur marque celle qui s’applique aujourd’hui. Les retirées restent lisibles.',
  security: SECURISE,
  responses: { 200: json(z.array(DensiteReference), 'La matrice et son historique.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'post',
  path: '/volumetrie/densites',
  tags: ['Volumétrie'],
  summary: 'Ajouter une valeur datée à la matrice',
  description:
    'FNCT seule. La valeur reprend l’équipement et la tranche d’une valeur existante (« reprend ») : les tranches ne se redessinent que par migration. La base refuse une benne qui tasse moins dense qu’une benne qui ne tasse pas.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: valeurDensiteSchema } } } },
  responses: { 201: json(DensiteReference, 'Valeur ajoutée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/volumetrie/densites/{id}/retrait',
  tags: ['Volumétrie'],
  summary: 'Retirer une densité saisie à tort',
  description: 'FNCT seule, avec un motif. La valeur reste lisible ; l’estimation ne l’utilise plus.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: retraitDensiteSchema } } },
  },
  responses: { 200: json(DensiteReference, 'Valeur retirée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/volumetrie/tonnage',
  tags: ['Volumétrie'],
  summary: 'Le tonnage estimé d’un mois, par circuit',
  description:
    'Les voyages attendus jusqu’à aujourd’hui ; ceux qui ont une pesée sont comptés pesés et ne s’estiment pas. Pour les autres : volume de la benne de travail × densité du jour, en fourchette, benne pleine. Le pesé est rendu à côté, jamais additionné. Sans tout ce qu’il faut, « manque » dit quoi. Hors du périmètre : 404.',
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      mois: z.string().regex(/^\d{4}-\d{2}$/).optional().openapi({ description: 'AAAA-MM ; le mois en cours par défaut.' }),
      ...paramsExport,
    }),
  },
  responses: { 200: jsonOuExport(z.array(TonnageEstimeCircuit), 'Une ligne par circuit en régie.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/parametres-nationaux/valeurs/{id}/retrait',
  tags: ['Paramètres nationaux'],
  summary: 'Retirer une valeur saisie à tort',
  description: 'Avec un motif. La valeur reste lisible dans l’historique ; les calculs ne l’utilisent plus. Réservé à la FNCT.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: retraitValeurSchema } } },
  },
  responses: { 200: json(ValeurParametreNational, 'Valeur retirée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/parametres-nationaux/{code}',
  tags: ['Paramètres nationaux'],
  summary: 'Ajouter une valeur datée à un paramètre national',
  description:
    'Une valeur ne se réécrit pas : un changement s’ajoute avec sa date d’effet. Un nombre pour la redevance (strictement entre ses ' +
    'bornes, entier pour une durée) ; un intitulé en français ET en arabe pour un texte ; une date pour la date de départ de la ' +
    'période transitoire. Provisoire par défaut ; une valeur officielle cite sa pièce (la base le refuse sinon). Une seconde valeur ' +
    'à la même date : 409. Réservé à la FNCT.',
  security: SECURISE,
  request: {
    params: z.object({ code: z.string() }),
    body: { content: { 'application/json': { schema: valeurParametreSchema } } },
  },
  responses: { 201: json(ValeurParametreNational, 'Valeur ajoutée.'), 409: json(Erreur, 'Une valeur commence déjà à cette date.'), ...REPONSES_COMMUNES },
});

// --- Rejeu du coût complet (lot 17.5) ---------------------------------------

const EtudeCoutComplet = registry.register(
  'EtudeCoutComplet',
  z.object({
    id: z.string().uuid(),
    commune_id: z.string(),
    exercice: z.number().int(),
    document: z.string(),
    bureau_etudes: z.string().nullable(),
    lu_le: z.string().nullable(),
    tonnage_pese_t: z.number().nullable().openapi({ description: 'Tonnage PESÉ de l’exercice cité par l’étude.' }),
    tonnage_source: z.string().nullable(),
    population: z.number().int().nullable(),
    population_source: z.string().nullable(),
    menages: z.number().int().nullable(),
    provenance: z.literal('declare_bureau_etudes'),
    created_at: z.string(),
  })
);

const Intervalle = z.object({ min: z.number(), max: z.number() }).nullable();
const PosteRejeu = z.object({
  code: z.string(),
  montant: z.number().nullable().openapi({ description: 'null : le rapport ne donne pas ce poste (non renseigné, jamais 0).' }),
  reference: z.string().nullable(),
  variantes: z.array(z.object({ montant: z.number().nullable(), reference: z.string().nullable() })),
});
const BlocRejeu = z.object({ montant: z.number().nullable(), postes: z.array(PosteRejeu) });
const Comparaison = z.object({ siipi: z.number().nullable(), publie: z.number().nullable(), ecart: z.number().nullable() });

const RejeuCoutComplet = registry.register(
  'RejeuCoutComplet',
  z.object({
    formule: z.string(),
    blocs: z.object({ A: BlocRejeu, B: BlocRejeu, C: BlocRejeu, D: BlocRejeu }),
    X: z.number().nullable(),
    Y: z.number().nullable(),
    Z: z.number().nullable(),
    complet: z.boolean().openapi({ description: 'Vrai si les quatre blocs sont renseignés.' }),
    comparaison: z.object({ A: Comparaison, X: Comparaison, Y: Comparaison, Z: Comparaison }),
    recalcul_tonnage_pese: z.object({
      tonnage_pese: z.number().nullable(),
      cout_par_tonne: z.number().nullable(),
      direct_par_tonne: z.number().nullable(),
      indirect_par_tonne: z.number().nullable(),
    }),
    ratios: z.array(
      z.object({
        code: z.string(),
        valeur: z.number(),
        pas_arrondi: z.number(),
        numerateur: z.number().nullable(),
        unite: z.enum(['t', 'jours', 'habitants', 'menages', 'habitats']),
        denominateur_implicite: z.number().nullable(),
        intervalle: Intervalle.openapi({ description: 'Dénominateur compatible avec le ratio publié, compte tenu de son arrondi.' }),
        denominateur_declare: z.number().nullable(),
        compatible: z.boolean().nullable(),
        recalcule: z.number().nullable(),
      })
    ),
    ecarts: z.array(
      z.object({
        code: z.string().openapi({ description: 'E1 à E8.' }),
        statut: z.enum(['constate', 'aucun', 'non_verifiable', 'declare']),
        donnees: z.record(z.unknown()),
        notes: z.array(z.object({ sujet: z.string(), constat: z.string() })),
      })
    ),
  })
);

const EtudeCoutCompletDetail = registry.register(
  'EtudeCoutCompletDetail',
  EtudeCoutComplet.extend({
    valeurs: z.array(
      z.object({
        nature: z.enum(['poste', 'total', 'ratio', 'flux']),
        code: z.string(),
        montant: z.number().nullable(),
        numerateur: z.number().nullable(),
        pas_arrondi: z.number().nullable(),
        retenue: z.boolean(),
        reference: z.string().nullable(),
      })
    ),
    constats: z.array(z.object({ code: z.string(), sujet: z.string(), constat: z.string() })),
    rejeu: RejeuCoutComplet,
  })
);

registry.registerPath({
  method: 'get',
  path: '/cout-complet/etudes',
  tags: ['Coût complet'],
  summary: 'Les études de coût complet chargées pour une commune',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: { 200: json(z.array(EtudeCoutComplet), 'Études.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/cout-complet/etudes',
  tags: ['Coût complet'],
  summary: 'Charger un fichier « agrégats de PCGD » (chiffres déclarés par un bureau d’études)',
  description:
    'Agrégats seulement : un fichier qui porte un champ de nom, de CIN, de téléphone ou de salaire individuel est refusé. Le ' +
    'gouvernorat du fichier doit être celui de la commune. Les chiffres principaux sont retenus, les autres versions publiées ' +
    'rangées comme variantes ; un poste que la lecture n’a pas trouvé est rangé « absent » (non renseigné, jamais 0). Une étude ' +
    'déjà chargée pour la commune et l’exercice : 409, la retirer d’abord.',
  security: SECURISE,
  request: {
    query: z.object({ communeId: paramCommuneId.optional() }),
    body: { content: { 'application/json': { schema: chargementEtudeSchema } } },
  },
  responses: { 201: json(EtudeCoutCompletDetail, 'Étude chargée, avec son rejeu.'), 409: json(Erreur, 'Déjà chargée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/cout-complet/etudes/{id}',
  tags: ['Coût complet'],
  summary: 'Une étude et son rejeu : Z = (A+B)+(C+D), totaux publiés, dénominateurs, écarts E1 à E8',
  description:
    'Le rejeu n’est pas stocké : il se calcule à chaque lecture sur les chiffres déclarés. Un ratio publié est arrondi : son ' +
    'dénominateur implicite est un intervalle, et un dénominateur déclaré hors de cet intervalle est un écart. Les écarts sont ' +
    'montrés, jamais tranchés.',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: json(EtudeCoutCompletDetail, 'Étude et rejeu.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/cout-complet/etudes/{id}',
  tags: ['Coût complet'],
  summary: 'Retirer une étude (retrait logique), pour la recharger',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Étude retirée.' }, ...REPONSES_COMMUNES },
});

// --- Le registre des acteurs informels (lot 18.1) --------------------------

const CadreInformel = registry.register(
  'CadreSecteurInformel',
  z.object({
    actif: z.boolean(),
    reference: z.string().nullable().openapi({ description: 'Le texte publié qui met le cadre en vigueur.' }),
    depuis: z.string().nullable(),
  })
);

registry.registerPath({
  method: 'get',
  path: '/observatoire/cadre-secteur-informel',
  tags: ['Observatoire'],
  summary: 'Le cadre du secteur informel (décret sur le tri à la source, art. 13) est-il en vigueur ?',
  description: 'Tant qu’il ne l’est pas, la base refuse toute écriture au registre des acteurs informels, dans toutes les communes (lot 18.1).',
  security: SECURISE,
  responses: { 200: json(CadreInformel, 'État.'), 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'get',
  path: '/observatoire/corrections-referentiel',
  tags: ['Observatoire'],
  summary: 'Les corrections du référentiel des communes décidées par la FNCT, avec leur source',
  description:
    'D-FNCT-3 : Zarzouna rattachée à la commune de Bizerte (retirée du référentiel, jamais effacée), El Hchachna commune à ' +
    'part entière. Une commune rattachée n’apparaît plus nulle part ailleurs dans l’API ; son nom reste lisible ici. ' +
    'D-NOMS-AR-1 : douze noms arabes corrigés, l’ancien et le nouveau nom rendus.',
  security: SECURISE,
  responses: {
    200: json(
      z.array(
        z.object({
          decision: z.string(),
          nature: z.enum(['rattachee', 'creee', 'nom_arabe']),
          commune: z.string(),
          commune_ar: z.string().nullable(),
          gouvernorat: z.string().nullable(),
          cible: z.string().nullable(),
          cible_ar: z.string().nullable(),
          source: z.string(),
          decidee_le: z.string(),
          // Une correction de nom (D-NOMS-AR-1) : l'ancien nom reste lisible.
          ancien_nom: z.string().nullable(),
          nouveau_nom: z.string().nullable(),
        })
      ),
      'Corrections, la plus récente d’abord.'
    ),
    401: REPONSES_COMMUNES[401],
  },
});

registry.registerPath({
  method: 'put',
  path: '/observatoire/cadre-secteur-informel',
  tags: ['Observatoire'],
  summary: 'Déclarer le cadre du secteur informel en vigueur, ou le suspendre',
  description: 'FNCT seulement. « En vigueur » exige la référence du texte publié ; la base la refuse sans elle.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: cadreInformelSchema } } } },
  responses: { 200: json(CadreInformel, 'État mis à jour.'), ...REPONSES_COMMUNES },
});

// --- La carte de pré-collecteur (lot I2, 18.2) -------------------------------

const DemandeCarte = registry.register(
  'DemandeCarte',
  z.object({
    id: z.string().uuid(),
    acteur_id: z.string().uuid(),
    id_precollecteur: z.string().openapi({ description: 'Le pseudonyme de l’acteur ; aucun nom.' }),
    date_demande: z.string(),
    carte_precedente_id: z.string().uuid().nullable(),
    carte_precedente: z.string().nullable().openapi({ description: 'Numéro de la carte renouvelée.' }),
    decision: z.enum(['accordee', 'refusee']).nullable(),
    date_decision: z.string().nullable(),
    motif_refus: z.string().nullable(),
    document_id: z.string().uuid().nullable(),
    numero_affiche: z.string().nullable().openapi({ example: 'CP-2026-00001' }),
    date_debut: z.string().nullable(),
    date_fin: z.string().nullable(),
    retrait_le: z.string().nullable(),
    motif_retrait: z.string().nullable(),
    etat: z.enum(['demandee', 'refusee', 'annulee', 'retiree', 'a_venir', 'expiree', 'valide']),
    zones: z.array(z.object({ id: z.string().uuid(), nom: z.string() })),
    pieces: z
      .array(
        z.object({
          code: z.string(),
          libelle_fr: z.string(),
          libelle_ar: z.string(),
          piece_id: z.string().uuid().nullable(),
          date_piece: z.string().nullable(),
          reference: z.string().nullable(),
        })
      )
      .openapi({ description: 'Les pièces exigées le jour de la demande ; « piece_id » null : pas encore reçue.' }),
  })
);

const DESCRIPTION_CARTE =
  'Projet de décret, art. 13.1 (lot 18.2). Derrière l’interrupteur du cadre du secteur informel : tant qu’il est éteint, toute ' +
  'écriture est refusée (409). Écrire est l’acte du directeur de la commune ; la FNCT lit. Gratuite : aucun champ de paiement.';

registry.registerPath({
  method: 'get',
  path: '/cartes-precollecteur',
  tags: ['Secteur informel'],
  summary: 'Les demandes de carte de la commune, leur état du jour, leurs pièces et leurs secteurs',
  description: DESCRIPTION_CARTE,
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: {
    200: json(z.object({ cadre_actif: z.boolean(), demandes: z.array(DemandeCarte) }), 'Demandes, la plus récente d’abord.'),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'post',
  path: '/cartes-precollecteur/demandes',
  tags: ['Secteur informel'],
  summary: 'Enregistrer une demande de carte : l’acteur, la date de dépôt, les secteurs d’accès',
  description:
    DESCRIPTION_CARTE +
    ' L’acteur doit être déclaré pré-collecteur ; une seule demande en attente par acteur (409). Un renouvellement nomme la carte renouvelée.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: demandeCarteSchema } } } },
  responses: { 201: json(DemandeCarte, 'Demande enregistrée.'), 409: json(Erreur, 'Refusée en l’état.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/cartes-precollecteur/demandes/{id}',
  tags: ['Secteur informel'],
  summary: 'Retirer une demande saisie à tort, avant sa décision',
  description: 'Retrait logique. Une demande décidée ne se retire pas (409) : une carte accordée se retire, motivée.',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Demande retirée.' }, 409: json(Erreur, 'Demande décidée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/cartes-precollecteur/demandes/{id}/pieces',
  tags: ['Secteur informel'],
  summary: 'Enregistrer une pièce reçue : sa date, sa référence',
  description:
    'La pièce doit figurer dans la liste nationale en vigueur le jour de la demande (400 sinon). Jamais le document lui-même : ' +
    'l’original reste au dossier papier de la commune.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: pieceCarteSchema } } },
  },
  responses: { 201: json(DemandeCarte, 'Pièce enregistrée.'), 409: json(Erreur, 'Pièce déjà enregistrée, ou demande décidée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/cartes-precollecteur/demandes/{id}/pieces/{pieceId}',
  tags: ['Secteur informel'],
  summary: 'Retirer une pièce enregistrée à tort, avant la décision',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid(), pieceId: z.string().uuid() }) },
  responses: { 200: json(DemandeCarte, 'Pièce retirée.'), 409: json(Erreur, 'Demande décidée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/cartes-precollecteur/demandes/{id}/accord',
  tags: ['Secteur informel'],
  summary: 'Accorder la carte : elle est émise, scellée et numérotée',
  description:
    'Dans une seule transaction (app.accorder_carte) : pré-collecteur déclaré, toutes les pièces exigées le jour de la demande, ' +
    'au moins un secteur, une durée de validité en vigueur le jour de la décision (sinon 409 : aucune validité n’est inventée). ' +
    'Un acteur dont la carte est encore valable ne reçoit qu’un renouvellement, qui commence le lendemain de sa fin. Aucun nom ' +
    'n’est scellé.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: accordCarteSchema } } },
  },
  responses: { 200: json(DemandeCarte, 'Carte accordée.'), 409: json(Erreur, 'Refusé en l’état.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/cartes-precollecteur/demandes/{id}/refus',
  tags: ['Secteur informel'],
  summary: 'Refuser une demande, motivée',
  description: 'Aucun document n’est émis. Une décision ne se change pas.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: refusCarteSchema } } },
  },
  responses: { 200: json(DemandeCarte, 'Demande refusée.'), 409: json(Erreur, 'Déjà décidée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/cartes-precollecteur/demandes/{id}/retrait',
  tags: ['Secteur informel'],
  summary: 'Retirer une carte accordée, à une date et pour un motif',
  description:
    'La carte a valu jusqu’à la veille ; elle reste au registre des documents, numéro compris. Un retrait n’est pas une annulation ' +
    '(erreur d’émission, POST /documents/{id}/annuler).',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: retraitCarteSchema } } },
  },
  responses: { 200: json(DemandeCarte, 'Carte retirée.'), 409: json(Erreur, 'Pas de carte accordée, ou déjà retirée.'), ...REPONSES_COMMUNES },
});

// --- La période transitoire (lot I3, 18.3) ----------------------------------

const DESCRIPTION_TRANSITION =
  'Projet de décret, art. 13 (lot 18.3). Les règles (départ, durée, délai d’étalonnage, durée d’un agrément, étapes) sont les ' +
  'paramètres nationaux datés du lot I1 ; sans date de départ, aucun acteur n’a d’état. SIIPI constate, il ne bloque rien, et ' +
  'n’agrée personne. Écrire est l’acte du directeur de la commune, derrière l’interrupteur du cadre (409 s’il est éteint) ; la FNCT lit.';

const paramDateTransition = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .openapi({ description: 'Une date du calendrier, AAAA-MM-JJ (aujourd’hui à Tunis par défaut). Une date inexistante est refusée (400).' });

const PeriodeTransitoireDoc = z.object({
  debut: z.string().nullable(),
  duree_mois: z.number().int().nullable(),
  fin: z.string().nullable().openapi({ description: 'Dernier jour de la période ; null sans départ ou sans durée.' }),
  delai_etalonnage_mois: z.number().int().nullable(),
  fin_etalonnage: z.string().nullable(),
  provisoire: z.boolean().openapi({ description: 'Une règle repose sur le projet de décret.' }),
  manque: z.array(z.string()).openapi({ description: 'Les paramètres sans valeur en vigueur à la date.' }),
});

const SituationActeur = registry.register(
  'SituationActeur',
  z.object({
    acteur_id: z.string().uuid(),
    id_precollecteur: z.string().openapi({ description: 'Le pseudonyme ; aucun nom.' }),
    categorie: z.enum(['pre_collecteur', 'intermediaire']).nullable(),
    derniere_demarche: z.string().nullable(),
    date_derniere_demarche: z.string().nullable(),
    jalons_franchis: z.number().int().openapi({ description: 'Étapes franchies parmi celles de la liste en vigueur à la date.' }),
    jalons_en_vigueur: z.number().int(),
    agrement_echeance: z.string().nullable().openapi({ description: 'Intermédiaire seulement.' }),
    agrement_valable: z.boolean().nullable(),
    etalonnage_enregistre: z.boolean().nullable(),
    etat: z.enum(ETATS_TRANSITION),
  })
);

const Accompagnement = registry.register(
  'AccompagnementActeur',
  z.object({
    acteur: z.object({ id: z.string().uuid(), id_precollecteur: z.string(), categorie: z.string().nullable() }),
    jalons_possibles: z.array(z.object({ code: z.string(), libelle_fr: z.string(), libelle_ar: z.string() })).openapi({
      description:
        'La liste nationale des étapes en vigueur à la date demandée (aujourd’hui par défaut), un élément par code : une étape se juge sur la liste du jour où elle a été franchie.',
    }),
    jalons: z.array(
      z.object({
        id: z.string().uuid(),
        jalon_code: z.string(),
        libelle_fr: z.string().nullable(),
        libelle_ar: z.string().nullable(),
        date_jalon: z.string(),
        reference: z.string().nullable(),
        observation: z.string().nullable(),
      })
    ),
    agrements: z.array(
      z.object({
        id: z.string().uuid(),
        organisme: z.string(),
        reference: z.string(),
        date_delivrance: z.string(),
        date_echeance: z.string().openapi({ description: 'Celle de la pièce, recopiée telle quelle.' }),
        observation: z.string().nullable(),
        duree_mois_en_vigueur: z.number().int().nullable(),
        echeance_selon_duree: z
          .string()
          .nullable()
          .openapi({ description: 'Ce que la durée nationale en vigueur à la délivrance donnerait ; montrée à côté, jamais à la place.' }),
        ecart_duree: z
          .boolean()
          .nullable()
          .openapi({ description: 'L’échéance de la pièce sort des bornes de la durée en vigueur à la délivrance (celles de « À vérifier ») ; null sans durée en vigueur.' }),
      })
    ),
  })
);

const MoisConversion = registry.register(
  'MoisConversionInformel',
  z.object({
    annee: z.number().int(),
    mois: z.number().int(),
    acteurs: z.number().int().nullable(),
    livraisons: z.number().int().nullable(),
    tonnes_detournees: z.number().nullable().openapi({ description: 'Déclarées ; jamais additionnées au tonnage pesé.' }),
    tonnes_sans_taux: z.number().nullable(),
    redevance_evitee_tnd: z
      .number()
      .nullable()
      .openapi({ description: 'Au taux en vigueur le jour de chaque livraison ; hypothèse : ces tonnes seraient parties en décharge.' }),
    taux_appliques: z.array(z.number()).nullable(),
    redevance_provisoire: z.boolean(),
    voyages_peses: z.number().int(),
    poids_moyen_voyage_t: z
      .number()
      .nullable()
      .openapi({ description: 'Voyages pesés de circuit, ordures ménagères, du même mois ; null sans pesée.' }),
    voyages_economises: z.number().nullable(),
    masque: z.boolean().openapi({ description: 'Lu par la FNCT, un mois de moins de 5 acteurs est masqué.' }),
  })
);

registry.registerPath({
  method: 'get',
  path: '/periode-transitoire',
  tags: ['Secteur informel'],
  summary: 'Les règles de la période à une date, et l’état de chaque acteur de la commune',
  description:
    DESCRIPTION_TRANSITION +
    ' Avec « date », la situation à ce jour-là : les règles en vigueur à cette date, et les faits datés de cette date ou avant, ' +
    'tels qu’ils sont inscrits aujourd’hui — une démarche reportée après coup avec sa vraie date compte au jour où elle a eu lieu. ' +
    'Commune inconnue ou retirée : 404.',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional(), date: paramDateTransition }) },
  responses: {
    200: json(
      z.object({
        communeId: z.string(),
        jour: z.string(),
        cadre_actif: z.boolean(),
        periode: PeriodeTransitoireDoc,
        etats: z.record(z.string(), z.number().int()).openapi({ description: 'Le nombre d’acteurs par état ; ni total, ni pourcentage.' }),
        acteurs: z.array(SituationActeur),
      }),
      'La situation.'
    ),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'get',
  path: '/periode-transitoire/conversion',
  tags: ['Secteur informel'],
  summary: 'Le bilan de la conversion, mois par mois (provenance déclarée)',
  description:
    'Tonnes détournées (livraisons du registre des acteurs), redevance ANGeD évitée, voyages économisés. Un mois sans livraison n’a pas de ligne. ' +
    'Commune inconnue ou retirée : 404.',
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      annee: z.number().int().min(2000).max(2100).optional().openapi({ description: 'L’année civile (défaut : l’année en cours à Tunis).' }),
      ...paramsExport,
    }),
  },
  responses: {
    200: jsonOuExport(
      z.object({ communeId: z.string(), annee: z.number().int(), provenance: z.literal('declaree'), mois: z.array(MoisConversion) }),
      'Le bilan ; en fichier, le tableau des mois.'
    ),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'get',
  path: '/periode-transitoire/national',
  tags: ['Secteur informel'],
  summary: 'La vue nationale, par gouvernorat (FNCT)',
  description:
    'Par gouvernorat, dans l’ordre alphabétique, « N communes sur M » : acteurs inscrits, cartes valables, démarches en cours, formalisés, ' +
    'agréments valables au jour demandé — tout compte de 1 à 4 est masqué (null, nommé dans « masques »). Puis les tonnes détournées ' +
    '(déclarées) des mois civils clos de l’année du dernier mois clos, sommées sur les seuls mois où une commune a eu au moins 5 acteurs ' +
    'livreurs ; les mois écartés sont comptés (mois_masques). Aucun rang, aucune ligne par commune.',
  security: SECURISE,
  request: { query: z.object({ date: paramDateTransition }) },
  responses: {
    200: json(
      z.object({
        jour: z.string(),
        cadre_actif: z.boolean(),
        gouvernorats: z.array(
          z.object({
            gouvernorat: z.string(),
            gouvernorat_ar: z.string().nullable(),
            communes_avec_acteurs: z.number().int(),
            communes: z.number().int(),
            acteurs: z.number().int().nullable(),
            cartes_valables: z.number().int().nullable(),
            demarches_en_cours: z.number().int().nullable(),
            formalises: z.number().int().nullable(),
            agrements_valables: z.number().int().nullable(),
            tonnes_detournees: z.number().nullable().openapi({ description: 'null : aucune livraison, ou rien que des mois masqués.' }),
            tonnes_du: z.string().openapi({ description: '1er janvier de l’année du dernier mois clos.' }),
            tonnes_au: z.string().openapi({ description: 'Dernier jour du dernier mois clos.' }),
            mois_masques: z.number().int().openapi({ description: 'Mois de commune écartés des tonnes : moins de 5 acteurs livreurs.' }),
            masques: z.array(z.string()),
          })
        ),
      }),
      'La vue nationale.'
    ),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'get',
  path: '/periode-transitoire/acteurs/{id}',
  tags: ['Secteur informel'],
  summary: 'L’accompagnement d’un acteur : étapes franchies, agréments',
  description: DESCRIPTION_TRANSITION + ' Avec « date », les étapes proposées sont celles de la liste en vigueur à cette date.',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }), query: z.object({ date: paramDateTransition }) },
  responses: { 200: json(Accompagnement, 'L’accompagnement.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/periode-transitoire/acteurs/{id}/jalons',
  tags: ['Secteur informel'],
  summary: 'Inscrire une étape d’accompagnement franchie : sa date, sa pièce',
  description:
    DESCRIPTION_TRANSITION +
    ' L’étape doit figurer dans la liste nationale en vigueur à sa date (400), suivre une démarche entamée (409), et n’être inscrite qu’une fois (409).',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: jalonActeurSchema } } },
  },
  responses: { 201: json(Accompagnement, 'Étape inscrite.'), 409: json(Erreur, 'Refusée en l’état.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/periode-transitoire/acteurs/{id}/jalons/{jalonId}',
  tags: ['Secteur informel'],
  summary: 'Retirer une étape inscrite à tort',
  description: 'Retrait logique ; une étape ne se réécrit pas.',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid(), jalonId: z.string().uuid() }) },
  responses: { 200: json(Accompagnement, 'Étape retirée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/periode-transitoire/acteurs/{id}/agrements',
  tags: ['Secteur informel'],
  summary: 'Enregistrer l’agrément délivré à un intermédiaire, tel que l’organisme l’a délivré',
  description:
    DESCRIPTION_TRANSITION +
    ' Pour un acteur déclaré intermédiaire seulement (409). L’échéance est celle de la pièce ; un écart avec la durée nationale en vigueur à la délivrance est signalé dans « À vérifier », jamais corrigé.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: agrementSchema } } },
  },
  responses: { 201: json(Accompagnement, 'Agrément enregistré.'), 409: json(Erreur, 'Refusé en l’état.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/periode-transitoire/acteurs/{id}/agrements/{agrementId}',
  tags: ['Secteur informel'],
  summary: 'Retirer un agrément enregistré à tort',
  description: 'Retrait logique ; un agrément enregistré ne se réécrit pas.',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid(), agrementId: z.string().uuid() }) },
  responses: { 200: json(Accompagnement, 'Agrément retiré.'), ...REPONSES_COMMUNES },
});

// --- Les règles du secteur informel (lot I1) --------------------------------

const LISTE_NATIONALE = z.enum(['pieces_carte_precollecteur', 'jalons_accompagnement']);

const ElementListeNationale = registry.register(
  'ElementListeNationale',
  z.object({
    id: z.string().uuid(),
    liste: LISTE_NATIONALE,
    code: z.string(),
    libelle_fr: z.string(),
    libelle_ar: z.string(),
    ordre: z.number().int(),
    date_effet: z.string(),
    date_fin: z.string().nullable().openapi({ description: 'Premier jour où l’élément ne s’applique plus ; null : toujours en vigueur.' }),
    reference_fin: z.string().nullable(),
    provisoire: z.boolean(),
    reference: z.string().nullable(),
    created_at: z.string(),
    retire_le: z.string().nullable(),
    motif_retrait: z.string().nullable(),
  })
);

registry.registerPath({
  method: 'get',
  path: '/regles-informel',
  tags: ['Paramètres nationaux'],
  summary: 'Les règles du secteur informel : interrupteur, période transitoire, pièces exigées, étapes d’accompagnement',
  description:
    'Ce que le projet de décret fixe (art. 13.1), tenu en données nationales datées. La période transitoire est calculée avec les ' +
    'paramètres en vigueur ce jour ; sans date de départ, « fin » et « fin_etalonnage » sont null et « manque » nomme ce qui ' +
    'manque — jamais une date inventée. Chaque élément de liste porte son état du jour. Lisible par tout utilisateur authentifié.',
  security: SECURISE,
  responses: {
    200: json(
      z.object({
        jour: z.string(),
        cadre: z.object({ actif: z.boolean(), reference: z.string().nullable() }),
        periode: z.object({
          debut: z.string().nullable(),
          duree_mois: z.number().int().nullable(),
          fin: z.string().nullable().openapi({ description: 'Dernier jour de la période.' }),
          delai_etalonnage_mois: z.number().int().nullable(),
          fin_etalonnage: z.string().nullable(),
          provisoire: z.boolean().openapi({ description: 'Une règle utilisée repose sur le projet de décret.' }),
          manque: z.array(z.string()).openapi({ description: 'Codes des paramètres sans valeur en vigueur.' }),
        }),
        listes: z.array(
          z.object({
            liste: LISTE_NATIONALE,
            elements: z.array(ElementListeNationale.extend({ etat: z.enum(['en_vigueur', 'a_venir', 'ferme', 'retire']) })),
          })
        ),
      }),
      'Règles.'
    ),
    401: REPONSES_COMMUNES[401],
  },
});

registry.registerPath({
  method: 'post',
  path: '/regles-informel/listes/{liste}',
  tags: ['Paramètres nationaux'],
  summary: 'Ajouter un élément daté à une liste nationale du secteur informel',
  description:
    'Une pièce exigée pour la carte, ou une étape d’accompagnement. Provisoire par défaut ; un élément officiel cite son texte. ' +
    'Un élément de même code déjà en vigueur : 409. Réservé à la FNCT.',
  security: SECURISE,
  request: {
    params: z.object({ liste: LISTE_NATIONALE }),
    body: { content: { 'application/json': { schema: elementListeSchema } } },
  },
  responses: { 201: json(ElementListeNationale, 'Élément ajouté.'), 409: json(Erreur, 'Code déjà en vigueur.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/regles-informel/elements/{id}/fin',
  tags: ['Paramètres nationaux'],
  summary: 'Fermer un élément à une date : il cesse de s’appliquer',
  description:
    'Le texte a changé. Avec la pièce qui le fonde ; une fois. Ce qui a été décidé avant cette date garde la liste de son jour. ' +
    'Réservé à la FNCT.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: finElementSchema } } },
  },
  responses: { 200: json(ElementListeNationale, 'Élément fermé.'), 409: json(Erreur, 'Déjà fermé.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/regles-informel/elements/{id}/retrait',
  tags: ['Paramètres nationaux'],
  summary: 'Retirer un élément saisi à tort',
  description: 'Avec un motif. L’élément reste lisible ; il ne s’applique plus à aucune date. Réservé à la FNCT.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: retraitElementSchema } } },
  },
  responses: { 200: json(ElementListeNationale, 'Élément retiré.'), ...REPONSES_COMMUNES },
});

const ActeurInformel = registry.register(
  'ActeurInformel',
  z.object({
    id: z.string().uuid(),
    id_precollecteur: z.string().openapi({ description: 'Le pseudonyme, attribué par la base : <COMMUNE>-I0001.' }),
    zone: z.string().nullable(),
    vehicle_type: z.string().nullable(),
    categorie: z.enum(['pre_collecteur', 'intermediaire']).nullable().openapi({ description: 'La catégorie déclarée par la commune.' }),
    dispose_local: z.boolean().nullable().openapi({ description: 'null : non renseigné, jamais « non ».' }),
    achete_aux_pairs: z.boolean().nullable(),
    vehicule_motorise: z.boolean().nullable(),
    faits_releves_le: z.string().nullable(),
    categorie_impliquee: z
      .enum(['pre_collecteur', 'intermediaire'])
      .nullable()
      .openapi({ description: 'Ce que les faits impliquent. Un écart avec la catégorie déclarée est montré dans « À vérifier », jamais corrigé.' }),
    derniere_demarche: z.string().nullable(),
    date_derniere_demarche: z.string().nullable(),
  })
);

const RegistreInformel = registry.register(
  'RegistreActeursInformels',
  z.object({
    communeId: z.string(),
    cadre_actif: z.boolean(),
    reference_cadre: z.string().nullable(),
    acteurs: z.array(ActeurInformel),
  })
);

const DemarcheFormalisation = registry.register(
  'DemarcheFormalisation',
  z.object({
    id: z.string().uuid(),
    statut: z.enum(['demarche_entamee', 'en_accompagnement', 'formalisee', 'interrompue']),
    date_statut: z.string(),
    reference: z.string().nullable(),
    observation: z.string().nullable(),
    created_at: z.string(),
  })
);

const paramActeur = z.object({ id: z.string().uuid() });

registry.registerPath({
  method: 'get',
  path: '/acteurs-informels',
  tags: ['GDMA'],
  summary: 'Le registre communal des acteurs informels (pseudonyme) et l’état du cadre national',
  description:
    'Pseudonyme seulement : l’identité reste sous /barbechas/{id}/identite. Aucune position, aucun rendement individuel. Lisible même ' +
    'quand le cadre n’est pas en vigueur ; seule l’écriture est fermée.',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional() }) },
  responses: { 200: json(RegistreInformel, 'Registre.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/acteurs-informels',
  tags: ['GDMA'],
  summary: 'Inscrire un acteur informel',
  description:
    'Admin de la commune. Le pseudonyme est attribué par la base. Catégorie déclarée et faits datés ; un fait inconnu reste null. ' +
    'Cadre national pas en vigueur : 409, et la base refuse de toute façon.',
  security: SECURISE,
  request: {
    query: z.object({ communeId: paramCommuneId.optional() }),
    body: { content: { 'application/json': { schema: inscriptionActeurSchema } } },
  },
  responses: { 201: json(ActeurInformel, 'Acteur inscrit.'), 409: json(Erreur, 'Cadre pas en vigueur.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'put',
  path: '/acteurs-informels/{id}/faits',
  tags: ['GDMA'],
  summary: 'Catégorie déclarée et faits relevés d’un acteur',
  security: SECURISE,
  request: { params: paramActeur, body: { content: { 'application/json': { schema: faitsActeurSchema } } } },
  responses: { 200: json(ActeurInformel, 'Acteur mis à jour.'), 409: json(Erreur, 'Cadre pas en vigueur.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/acteurs-informels/{id}/demarches',
  tags: ['GDMA'],
  summary: 'Les étapes de la démarche de formalisation d’un acteur',
  security: SECURISE,
  request: { params: paramActeur },
  responses: { 200: json(z.array(DemarcheFormalisation), 'Étapes, de la plus ancienne à la plus récente.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/acteurs-informels/{id}/demarches',
  tags: ['GDMA'],
  summary: 'Ajouter une étape datée à la démarche de formalisation',
  description:
    'Une étape ne se modifie pas. « Entamée » exige sa pièce, « interrompue » son motif ; l’accompagnement et la formalisation ' +
    'supposent une démarche entamée ; rien ne suit une démarche aboutie ; les dates ne reculent pas et ne sont pas dans l’avenir.',
  security: SECURISE,
  request: { params: paramActeur, body: { content: { 'application/json': { schema: demarcheSchema } } } },
  responses: {
    201: json(z.array(DemarcheFormalisation), 'Étapes après l’ajout.'),
    409: json(Erreur, 'Cadre pas en vigueur, ou étape hors de l’ordre.'),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'delete',
  path: '/acteurs-informels/{id}/demarches/{demarcheId}',
  tags: ['GDMA'],
  summary: 'Retirer une étape saisie à tort (retrait logique)',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid(), demarcheId: z.string().uuid() }) },
  responses: { 204: { description: 'Étape retirée.' }, ...REPONSES_COMMUNES },
});

// --- Mode démo : le jumeau numérique (lot S1) ------------------------------

const EtatDemo = registry.register(
  'EtatDemo',
  z.object({
    communeId: z.string(),
    chargee: z.boolean().openapi({ description: 'Vrai si la commune de démonstration existe, avec son jeu.' }),
    periode: z.object({ debut: z.string(), fin: z.string() }).openapi({ description: 'Les trois mois simulés, fixes.' }),
    compteurs: z.record(z.number().int()).openapi({ description: 'Lignes chargées, par table. Vide si rien n’est chargé.' }),
  })
);

registry.registerPath({
  method: 'get',
  path: '/demo',
  tags: ['Observatoire'],
  summary: 'État du jeu de démonstration (jumeau numérique)',
  description: 'FNCT seulement. La commune de démonstration est fictive, marquée `est_demo`, et exclue de toute agrégation nationale.',
  security: SECURISE,
  responses: { 200: json(EtatDemo, 'État du jeu.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/demo/charger',
  tags: ['Observatoire'],
  summary: 'Charger, ou recharger à l’identique, le jeu de démonstration',
  description:
    'FNCT seulement. Trois mois d’activité simulée (fichier versionné, graine fixe) dans une commune de démonstration ; un jeu déjà ' +
    'chargé est d’abord retiré. Chaque ligne porte `provenance = simule`. Une commune réelle est refusée (409), et la base refuse ' +
    'de toute façon une ligne simulée hors d’une commune de démonstration.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: demandeDemoSchema } } } },
  responses: { 201: json(EtatDemo, 'Jeu chargé.'), 409: json(Erreur, 'Commune réelle.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/demo/retirer',
  tags: ['Observatoire'],
  summary: 'Retirer le jeu de démonstration',
  description:
    'FNCT seulement. Efface la commune de démonstration et tout ce qu’elle contient — exception assumée à la suppression logique : ' +
    'rien de ce qui est effacé n’a eu lieu. Une commune réelle est refusée (409), par la route puis par la base.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: demandeDemoSchema } } } },
  responses: {
    200: json(
      z.object({ communeId: z.string(), retiree: z.literal(true), lignesEffacees: z.number().int() }),
      'Jeu retiré (lignesEffacees : pesées, présences et réclamations).'
    ),
    409: json(Erreur, 'Commune réelle.'),
    ...REPONSES_COMMUNES,
  },
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
    "Le mot de passe provisoire part par courriel à son titulaire quand un serveur SMTP est désigné (`courriel.statut = envoye`), et n'est alors PAS dans la réponse. Sinon (`non_configure`, `echec`), il figure dans la réponse et nulle part ailleurs : il n'est stocké qu'en empreinte et ne pourra pas être relu. Il n'ouvre que son propre remplacement, à la première connexion.",
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: compteCreateSchema } } } },
  responses: {
    201: json(Compte.extend({ courriel: EnvoiCourriel, motDePasseProvisoire: z.string().optional() }), 'Compte ouvert.'),
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
  method: 'get',
  path: '/courriel/etat',
  tags: ['Paramètres nationaux'],
  summary: 'État du serveur de courriel',
  description: 'Réservé à la FNCT. Le serveur SMTP désigné par l’exploitant (variables SMTP_*), sa sécurité, s’il est authentifié, l’expéditeur — jamais le mot de passe.',
  security: SECURISE,
  responses: {
    200: json(
      z.object({
        configure: z.boolean(),
        serveur: z.string().nullable(),
        securite: z.enum(['starttls', 'tls', 'aucune']),
        authentifie: z.boolean(),
        expediteur: z.string(),
      }),
      'État du serveur de courriel.'
    ),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'post',
  path: '/courriel/essai',
  tags: ['Paramètres nationaux'],
  summary: 'Envoyer un courriel d’essai',
  description: 'Réservé à la FNCT. Le courriel part à l’adresse du compte qui le demande, et à nulle autre : SIIPI n’est pas un relais.',
  security: SECURISE,
  responses: {
    200: json(EnvoiCourriel.extend({ destinataire: z.string() }), 'Issue de l’essai.'),
    ...REPONSES_COMMUNES,
  },
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
      z.object({
        id: z.string().uuid(), full_name: z.string(), courriel: EnvoiCourriel, motDePasseProvisoire: z.string().optional(),
      }),
      'Nouveau mot de passe provisoire : envoyé par courriel, ou affiché une seule fois s’il n’est pas parti.'
    ),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'post',
  path: '/comptes/moi/mot-de-passe',
  tags: ['Comptes et accès'],
  summary: 'Changer son propre mot de passe',
  description:
    "Ouvert à tous les rôles : c'est ce qui permet de remplacer un mot de passe provisoire sans dépendre de qui l'a fixé. " +
    'Le mot de passe des comptes de démonstration, publié avec le code, est refusé comme nouveau mot de passe (400), en tout environnement. ' +
    'Rend un nouveau jeton : celui de la connexion portait la marque « provisoire » et n’ouvrait que ce changement (D-FNCT-5).',
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
  responses: {
    200: json(z.object({ token: z.string() }), 'Mot de passe remplacé ; nouveau jeton, qui ouvre toute la plateforme.'),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'get',
  path: '/comptes/moi/preferences',
  tags: ['Comptes et accès'],
  summary: 'Ses préférences : langue, format de date, unités, alertes',
  description: 'Valeurs par défaut comprises : une clé jamais choisie est rendue avec son défaut.',
  security: SECURISE,
  responses: { 200: json(Preferences, 'Préférences.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'put',
  path: '/comptes/moi/preferences',
  tags: ['Comptes et accès'],
  summary: 'Changer ses préférences',
  description: 'Changement partiel : seules les clés envoyées changent. Ouvert à tous les rôles ; chacun ne règle que son propre compte.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: preferencesSchema } } } },
  responses: { 200: json(Preferences, 'Préférences enregistrées.'), ...REPONSES_COMMUNES },
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
// personne. C'est la minimisation exigée par la loi organique n° 2004-63, rendue
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
    "Le seul endroit du module où figure de l'argent, et il est au niveau du service. Un chiffre sans origine n'étant pas opposable, le champ « source » dit d'où il vient en clair. Sur un exercice déjà déclaré, un champ absent du corps garde sa valeur ; un champ envoyé à null l'efface.",
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
  method: 'post',
  path: '/personnel/import',
  tags: ['Personnel'],
  summary: 'Importer le registre du personnel depuis un CSV',
  description:
    "Préparation de la recette R1. Quatre colonnes : Nom, Prénom, Fonction, Statut (en-têtes et valeurs en français, en arabe ou par leur code). Un fichier qui porte un salaire, un numéro de CIN, une donnée de santé, une adresse ou un téléphone est refusé en entier (400), la colonne nommée ; une case de huit chiffres aussi. Un agent déjà au registre (même nom et prénom, dans un ordre ou dans l'autre) n'est pas créé une seconde fois : sa fonction et son statut sont mis à jour s'ils ont changé. Sans « valider », rien n'est écrit. Hors du périmètre : 404.",
  security: SECURISE,
  request: {
    query: z.object({ communeId: paramCommuneId.optional() }),
    body: { content: { 'application/json': { schema: importPersonnelSchema } } },
  },
  responses: {
    200: json(ApercuImportCsv, "Aperçu : rien n'a été écrit."),
    201: json(ApercuImportCsv, 'Registre mis à jour.'),
    ...REPONSES_COMMUNES,
  },
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
// part au bon endroit (loi organique n° 2004-63).
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
    projet_porteur: z.enum(['commune', 'association', 'autre']).nullable().openapi({
      description: 'Qui porte le projet (D5) : un projet associatif est un projet dont le porteur est une association.',
    }),
    projet_porteur_nom: z.string().nullable(),
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
  projetPorteur: z.enum(['commune', 'association', 'autre']).nullable().optional(),
  projetPorteurNom: z.string().nullable().optional().openapi({ description: 'Obligatoire quand le porteur n’est pas la commune (400 sinon).' }),
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

const TauxCommunication = z.object({ numerateur: z.number().int(), denominateur: z.number().int(), valeur: z.number().nullable().openapi({ description: 'Entre 0 et 1 ; null sans dénominateur, jamais 0.' }) });
registry.registerPath({
  method: 'get',
  path: '/communication/indicateurs',
  tags: ['Communication'],
  summary: 'Indicateurs de communication : délai, volumétrie, taux (B5.5.4)',
  description:
    'Sur une période en dates de Tunis : publications publiées, envois, destinataires joints et non joints, envois individuels par issue, points proposés, répondants ; délai médian de décision sur un point proposé et points en attente ; taux de livraison, de lecture, de portée, de validation des points proposés, de participation aux sondages. Que des totaux, jamais une ligne par citoyen (loi organique n° 2004-63). Un taux sans dénominateur est null, jamais 0. Directeur de la commune ou FNCT ; une commune hors périmètre est introuvable.',
  security: SECURISE,
  request: { query: qIndicateursCommunicationSchema },
  responses: {
    200: json(
      z.object({
        commune_id: z.string(),
        periode: z.object({ debut: z.string(), fin: z.string() }),
        volumetrie: z.object({
          publications: z.object({ notification: z.number().int(), sondage: z.number().int(), projet: z.number().int() }),
          envois: z.number().int(),
          destinataires: z.number().int(),
          sans_adresse: z.number().int(),
          desabonnes: z.number().int(),
          envois_individuels: z.object({
            total: z.number().int(), livre: z.number().int(), echec: z.number().int(), non_abonne: z.number().int(),
            non_souhaite: z.number().int(), sans_souscription: z.number().int(),
          }),
          courriels: z.object({
            total: z.number().int(), envoye: z.number().int(), echec: z.number().int(), non_configure: z.number().int(),
          }),
          suggestions_recues: z.number().int(),
          repondants_sondage: z.number().int(),
        }),
        delais: z.object({
          decision_suggestion_h: z.object({ mediane: z.number().nullable(), decisions: z.number().int() }),
          suggestions_en_attente: z.object({ nombre: z.number().int(), plus_ancienne_jours: z.number().int().nullable() }),
        }),
        taux: z.object({
          livraison: TauxCommunication,
          lecture: TauxCommunication,
          portee: TauxCommunication,
          validation_suggestions: TauxCommunication,
          participation_sondages: TauxCommunication,
        }),
      }),
      'Les indicateurs de la période.'
    ),
    ...REPONSES_COMMUNES,
  },
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
  request: { params: z.object({ id: idPublication }), query: z.object(paramsExport) },
  responses: { 200: jsonOuExport(z.array(LigneDepouillement), 'Dépouillement.'), ...REPONSES_COMMUNES },
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
  path: '/pesees/production-specifique',
  tags: ['Pesées'],
  summary: 'Production spécifique par mois : kg/hab/jour sur la population permanente et, en saison, sur la population présente',
  description:
    'Les deux ratios côte à côte (lot 17.1). La population permanente est celle que la commune retient, sinon celle du recensement ' +
    '(source_population le dit). Pour un mois de saison, le ratio retenu est celui de la population présente. L’écart au repère ' +
    'théorique de la commune s’affiche ; il ne se corrige pas. Une population ou un repère absents rendent null, jamais 0.',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional(), annee: z.string().optional() }) },
  responses: {
    200: json(
      z.array(
        z.object({
          annee: z.number().int(),
          mois: z.number().int(),
          tonnes: z.number(),
          jours: z.number().int(),
          population_permanente: z.number().int().nullable(),
          source_population: z.enum(['declaree', 'recensement']).nullable(),
          kg_hab_j_permanente: z.number().nullable(),
          en_saison: z.boolean(),
          population_saisonniere: z.number().int().nullable(),
          kg_hab_j_saison: z.number().nullable(),
          kg_hab_j_retenu: z.number().nullable(),
          production_theorique: z.number().nullable(),
          ecart_theorique_pct: z.number().nullable(),
        })
      ),
      'Production spécifique mensuelle.'
    ),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'get',
  path: '/pesees/redevance',
  tags: ['Pesées'],
  summary: 'Redevance ANGeD par mois, au taux de la date de chaque pesée',
  description:
    'Chaque pesée est valorisée au taux de la redevance en vigueur à SA date (paramètre national daté, lot 17.3) — jamais au taux du ' +
    'jour du calcul. Une pesée antérieure à toute valeur n’a pas de taux : son tonnage est compté à part et le montant porte sur le ' +
    'reste ; montant null s’il n’y a rien de taxable. « provisoire » : un taux provisoire a servi (barème officiel non saisi).',
  security: SECURISE,
  request: { query: z.object({ communeId: paramCommuneId.optional(), annee: z.string().optional() }) },
  responses: {
    200: json(
      z.array(
        z.object({
          annee: z.number().int(),
          mois: z.number().int(),
          pesees: z.number().int(),
          tonnes: z.number(),
          tonnes_sans_taux: z.number(),
          montant_tnd: z.number().nullable(),
          taux_appliques: z.array(z.number()).nullable(),
          provisoire: z.boolean(),
        })
      ),
      'Redevance mensuelle.'
    ),
    ...REPONSES_COMMUNES,
  },
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
      resorbe_le: z.string().nullable().openapi({ description: 'Pour un point noir : le jour où il a été résorbé. Vide : toujours là.' }),
      attributs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).openapi({
        description:
          'Valeurs des champs libres de la commune (Jalon 6), indexées par l’identifiant du champ (GET /points/champs). Une clé absente est une case vide.',
      }),
      etiquettes: z.array(z.string().uuid()).openapi({
        description: 'Étiquettes du point (GET /points/etiquettes). Une étiquette retirée n’apparaît plus.',
      }),
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
        .enum(['waypoints', 'trace_gps', 'itineraire_dessine', 'gpx', 'geojson', 'csv', 'multicouche', 'inconnu'])
        .openapi({
        description:
          'waypoints = relevé d\'arrêts (GPS Waypoints) ; trace_gps = trajet suivi (My Tracks) ; itineraire_dessine = KMZ tracé à la main ; multicouche = fichier à plusieurs couches (export ArcGIS) dont il faut choisir la couche.',
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
      couches: z
        .array(
          z.object({
            chemin: z.string().openapi({ description: 'Identifiant de la couche (chemin de ses dossiers), à renvoyer dans « couche ».' }),
            nom: z.string(),
            points: z.number().int(),
            lignes: z.number().int(),
            surfaces: z.number().int(),
            attributs: z.array(z.object({ nom: z.string(), valeurs: z.array(z.string()), plusDeValeurs: z.boolean() })),
          })
        )
        .openapi({ description: 'Les couches du fichier (KML/KMZ), pour choisir laquelle importer. Vide pour un fichier sans dossiers.' }),
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
  resorbeLe: z.string().nullable().optional().openapi({
    description: 'Pour un point noir : le jour où il a été résorbé (lot K). Il reste à l’inventaire ; null le rouvre. Refusé pour un autre type, ou dans l’avenir.',
  }),
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
  couche: z.string().optional().openapi({
    description: "Chemin de la couche à importer, parmi celles que l'aperçu décrit (« couches »). Requis pour un fichier à plusieurs couches.",
  }),
  filtre: z
    .object({
      attribut: z.string().openapi({ description: 'Nom de l’attribut, ou « Nom » pour le nom de l’entité.' }),
      valeur: z.string(),
      operateur: z.enum(['egal', 'commence_par']).optional(),
    })
    .optional()
    .openapi({ description: 'Ne garder que les entités de la couche dont l’attribut vaut (ou commence par) la valeur.' }),
  typePoints: z
    .enum(['porte_a_porte', 'point_de_collecte', 'debut_collecte', 'fin_collecte', 'point_noir', 'centre_transfert', 'hors_conteneur', 'parc_municipal', 'autre'])
    .optional()
    .openapi({ description: 'Type donné aux points qui n’en portent aucun.' }),
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

const ParametresCommune = registry.register(
  'ParametresCommune',
  z
    .object({
      commune_id: z.string(),
      delai_reclamation_jours: z.number().int(),
      seuil_entretien_km: z.number().int(),
      seuil_entretien_jours: z.number().int(),
      alerter_actions_retard: z.boolean(),
      objectif_balayage_ml_j: z.number().nullable().openapi({ description: 'Cible du balayage mesuré (M1-1), en mètres linéaires par jour.' }),
      population_recensement: z.number().int().nullable().openapi({ description: 'Population du recensement (communes.population) : celle qui s’applique tant que la commune n’en retient pas une autre.' }),
      population_permanente: z.number().int().nullable().openapi({ description: 'Population permanente retenue par la commune (lot 17.1) ; null : le recensement s’applique.' }),
      population_permanente_source: z.string().nullable(),
      population_saisonniere: z.number().int().nullable().openapi({ description: 'Population présente en saison, permanents compris.' }),
      saison_debut_mois: z.number().int().nullable(),
      saison_fin_mois: z.number().int().nullable(),
      production_theorique_kg_hab_j: z.number().nullable().openapi({ description: 'Production spécifique théorique, repère du pesé.' }),
      production_theorique_source: z.string().nullable(),
      updated_at: z.string().nullable(),
      auteur: z.string().nullable(),
      par_defaut: z.boolean().openapi({ description: 'Vrai tant que la commune n’a jamais enregistré ses paramètres.' }),
    })
    .openapi('ParametresCommune')
);

registry.registerPath({
  method: 'get',
  path: '/communes/{id}/parametres',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Les seuils de la commune',
  description:
    'Délai d’alerte des réclamations, préavis d’entretien par défaut, alerte des actions en retard. Ils alimentent le panneau « À vérifier » (GET /communes/{id}/coherence).',
  security: SECURISE,
  request: { params: z.object({ id: z.string().openapi({ description: 'Identifiant de la commune.' }) }) },
  responses: { 200: json(ParametresCommune, 'Paramètres, défauts compris.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'put',
  path: '/communes/{id}/parametres',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Changer les seuils de la commune',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().openapi({ description: 'Identifiant de la commune.' }) }),
    body: { content: { 'application/json': { schema: parametresCommuneSchema } } },
  },
  responses: { 200: json(ParametresCommune, 'Paramètres enregistrés.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'put',
  path: '/communes/{id}/population',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Population permanente, population de saison, production théorique (lot 17.1)',
  description:
    'Corps complet : chaque champ est donné, null l’efface. Une population permanente ou une production théorique se donne avec sa ' +
    'source ; la saison se donne d’un bloc (population présente, mois de début, mois de fin — elle peut chevaucher l’année). La ' +
    'population de saison comprend les permanents : inférieure à la population permanente retenue, elle est refusée.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().openapi({ description: 'Identifiant de la commune.' }) }),
    body: { content: { 'application/json': { schema: populationCommuneSchema } } },
  },
  responses: { 200: json(ParametresCommune, 'Paramètres enregistrés.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/circuits/points',
  tags: ['Circuits et contrôle terrain'],
  summary: "Tous les arrêts d'une commune, tous circuits confondus",
  description:
    "Sert la carte communale : c'est la vue qu'on ouvre pour savoir ce qui est desservi et ce qui ne l'est pas.",
  security: SECURISE,
  request: {
    query: z.object({
      communeId: paramCommuneId.optional(),
      circuitId: z.string().uuid().optional(),
      type: z.string().optional().openapi({ description: 'Type de point (porte_a_porte, point_noir…).' }),
      actif: z.enum(['true', 'false']).optional(),
      etiquettes: z.string().optional().openapi({
        description: 'Identifiants d’étiquettes séparés par des virgules : le point doit les porter toutes.',
      }),
      champId: z.string().uuid().optional().openapi({ description: 'Filtre sur un champ libre de la commune.' }),
      operateur: z.enum(['egal', 'contient', 'renseigne', 'vide']).optional().openapi({
        description:
          'Par défaut : « renseigne » sans valeur, « contient » pour un champ texte, « egal » sinon. Pour oui/non, la valeur est oui|non (ou true|false).',
      }),
      valeur: z.string().optional(),
      actionId: z.string().uuid().optional().openapi({ description: 'Les points visés par une action planifiée.' }),
      ...paramsExport,
    }),
  },
  responses: {
    200: jsonOuExport(
      z.array(PointCollecte),
      'Arrêts de la commune, filtrés. À l’export, les étiquettes (par leur nom) et les champs libres de la commune s’ajoutent en colonnes.'
    ),
    400: REPONSES_COMMUNES[400],
    401: REPONSES_COMMUNES[401],
  },
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
  summary: 'Importer un relevé KML, KMZ, GPX, GeoJSON ou CSV',
  description:
    "Le format est reconnu au contenu, pas à l'extension. Un CSV porte au moins « Latitude » et « Longitude » (les en-têtes de l'export de la carte communale sont reconnus, en français ou en arabe) ; l'ordre de passage y est renuméroté par voyage. En deux temps. Sans « valider », la réponse décrit ce qui serait créé sans rien écrire : un relevé de Dar Chaabane porte jusqu'à 113 arrêts, et les écrire au premier clic obligerait à défaire à la main ce qu'on n'a pas relu.",
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
  path: '/circuits/{id}/fichier',
  tags: ['Circuits et contrôle terrain'],
  summary: 'Télécharger le circuit (tracé et arrêts) en GPX, KML ou GeoJSON',
  description:
    "Le circuit tel qu'il est en base, prêt à ouvrir dans QGIS, Google Earth ou un GPS, et à réimporter dans SIIPI sans perte : le type de chaque arrêt, son voyage, son rang et son heure relevée y sont écrits dans la forme que le lecteur de relevés reconnaît. Le GeoJSON porte aussi les champs libres de la commune (sous leur libellé) et les étiquettes.",
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    query: z.object({ format: z.enum(['gpx', 'kml', 'geojson']).default('geojson') }),
  },
  responses: {
    200: {
      description: 'Le fichier, en pièce jointe nommée d’après le code du circuit.',
      content: {
        'application/gpx+xml': { schema: z.string() },
        'application/vnd.google-earth.kml+xml': { schema: z.string() },
        'application/geo+json': { schema: z.string() },
      },
    },
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
    'écrivant une autre requête n’en est pas un (loi organique n° 2004-63, principe de minimisation).',
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
    'Une combinaison canal × type absente de la base vaut « activé » pour le push, « désactivé » pour le courriel (sur demande, migration 081) et pour le SMS (non émis) : cette route complète toujours les 9 combinaisons, jamais un sous-ensemble.',
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
    compressee_le: z.string().nullable().openapi({
      description:
        "Date de la compression de conservation (D-FNCT-4) : à 36 mois, une photo est servie en JPEG qualité 70, 500 Ko au plus, et son original part dans l'archive froide. type_mime, taille_octets et sha256 restent ceux de l'ORIGINAL — la fiche du dépôt n'est jamais réécrite.",
    }),
    taille_compressee_octets: z.number().int().nullable().openapi({ description: 'Poids de la version compressée servie.' }),
    original_restaure_le: z.string().nullable().openapi({
      description: "Date de restauration de l'original depuis l'archive froide, sur demande de la FNCT.",
    }),
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
    "Le type est déterminé par les OCTETS, jamais par le nom ni par l'en-tête annoncé (415 sinon). Les métadonnées EXIF des photos — position GPS, modèle de l'appareil, nom du propriétaire — sont retirées avant écriture ; la position trouvée est rendue dans la réponse, à proposer à la personne plutôt qu'à enregistrer à son insu (loi organique n° 2004-63).",
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

// --- Le logo d'une commune (jalon D, D1 ; migration 083) ----------------------
const LogoDepose = registry.register(
  'LogoCommuneDepose',
  z.object({
    id: z.string().uuid(),
    communeId: z.string(),
    fichierId: z.string().uuid(),
    type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
    tailleOctets: z.number().int(),
    remplace: z.boolean().openapi({ description: 'Un logo était en vigueur : il est retiré, et reste dans l’historique.' }),
  })
);
registry.registerPath({
  method: 'post',
  path: '/communes/{id}/logo',
  tags: ['Communes'],
  summary: 'Déposer ou remplacer le logo de la commune',
  description: [
    'La commune dépose son logo elle-même ; la FNCT, en secours, pour n’importe quelle commune. Le fichier voyage en base64, comme tout dépôt de l’API.',
    '',
    'Le type est reconnu par les OCTETS : PNG, JPEG, WebP, ou SVG statique (415 sinon). Un SVG qui contient un script, un gestionnaire d’événement (on…), une adresse javascript:, un objet étranger, une entité ou un lien extérieur est REFUSÉ, jamais réécrit. Les métadonnées des images sont retirées. 1 Mo au plus (413).',
    '',
    'Remplacer un logo retire l’ancien, qui reste dans l’historique (règle 1.4) ; dépôt et retrait passent au journal d’audit. Une commune hors du périmètre de l’appelant est introuvable (404).',
  ].join('\n'),
  security: SECURISE,
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: depotLogoSchema } } },
  },
  responses: { 201: json(LogoDepose, 'Logo déposé.'), 413: json(Erreur, 'Plus de 1 Mo.'), 415: json(Erreur, 'Pas une image, ou un SVG actif.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'post',
  path: '/communes/{id}/logo/retrait',
  tags: ['Communes'],
  summary: 'Retirer le logo en vigueur',
  description: 'Le logo cesse d’être en vigueur et reste dans l’historique ; le portail affiche alors l’emblème aux initiales. 404 sans logo en vigueur.',
  security: SECURISE,
  request: { params: z.object({ id: z.string() }) },
  responses: { 204: { description: 'Retiré.' }, ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get',
  path: '/communes/{id}/logo',
  tags: ['Communes'],
  summary: 'Le logo en vigueur',
  description: 'Les octets, avec leur type réel, « nosniff », une politique de sécurité fermée (un SVG ne peut rien exécuter ni charger) et une empreinte en ETag. Lisible de tout compte : c’est l’identité de la commune. 404 sans logo : l’écran affiche l’emblème aux initiales.',
  security: SECURISE,
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: 'Le logo.',
      content: {
        'image/png': { schema: { type: 'string', format: 'binary' } as any },
        'image/jpeg': { schema: { type: 'string', format: 'binary' } as any },
        'image/webp': { schema: { type: 'string', format: 'binary' } as any },
        'image/svg+xml': { schema: { type: 'string', format: 'binary' } as any },
      },
    },
    304: { description: 'Inchangé depuis la dernière lecture (ETag).' },
    ...REPONSES_COMMUNES,
  },
});
registry.registerPath({
  method: 'get',
  path: '/communes/{id}/logos',
  tags: ['Communes'],
  summary: 'L’historique des logos de la commune',
  description: 'Chaque logo déposé, du plus récent au plus ancien, avec ses dates de dépôt et de retrait ; un seul est en vigueur.',
  security: SECURISE,
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: json(
      z.array(z.object({
        id: z.string().uuid(), fichier_id: z.string().uuid(), nom_original: z.string(), type_mime: z.string(),
        taille_octets: z.number().int(), depose_le: z.string(), retire_le: z.string().nullable(), en_vigueur: z.boolean(),
      })),
      'L’historique.'
    ),
    ...REPONSES_COMMUNES,
  },
});

const IndicateurAccueil = registry.register(
  'IndicateurAccueil',
  z.object({
    code: z.string(),
    libelle_fr: z.string(),
    libelle_ar: z.string(),
    unite: z.string().nullable(),
    valeur: z.number().nullable(),
    cible: z.number().nullable().openapi({ description: 'L’objectif déclaré par la commune ; null quand elle n’en a pas.' }),
    taux_atteinte: z.number().nullable().openapi({ description: 'Entre 0 et 1 pour un indicateur rapporté à un objectif ; null sinon.' }),
    source: z.enum(['mesure', 'declare']).nullable(),
  })
);
const AccueilCommune = registry.register(
  'AccueilCommune',
  z.object({
    jour: z.string().openapi({ description: 'Le jour à Tunis, AAAA-MM-JJ.' }),
    annee: z.number().int(),
    commune_vide: z.boolean().openapi({
      description: 'Vrai quand la commune n’a rien saisi elle-même (population et périmètre, qui viennent du référentiel national, ne comptent pas) : l’écran ouvre le parcours de démarrage au lieu d’un tableau vide.',
    }),
    constat: z.object({
      attendus: z.number().int().openapi({ description: 'Les circuits actifs attendus aujourd’hui.' }),
      saisis: z.number().int().openapi({ description: 'Ceux dont le constat du jour est posé.' }),
    }),
    va_bien: z.object({
      objectif_atteint: z.array(IndicateurAccueil).openapi({ description: 'Les indicateurs calculés dont l’objectif déclaré est atteint. Un indicateur sans objectif n’y figure jamais.' }),
      calcules: z.array(IndicateurAccueil).openapi({ description: 'Les autres indicateurs calculés ou déclarés, sans jugement : une valeur et sa source.' }),
      registres: z.array(z.object({
        code: z.string(), libelle_fr: z.string(), libelle_ar: z.string(),
        nombre: z.number().nullable().openapi({ description: 'Ce qu’il y a dans le registre ce mois-ci ; null quand l’élément n’a pas de compte.' }),
      })).openapi({ description: 'Les registres tenus ce mois-ci.' }),
    }),
    a_agir: z.object({
      a_verifier: z.array(Incoherence).openapi({ description: 'Les écarts de « À vérifier », tous : l’écran applique les préférences de l’utilisateur.' }),
      non_renseignes: z.array(z.object({ code: z.string(), libelle_fr: z.string(), libelle_ar: z.string() }))
        .openapi({ description: 'Les indicateurs applicables dont la valeur n’est pas renseignée : jamais un zéro.' }),
      entretiens: z.array(z.object({
        plan_id: z.string(), vehicule_id: z.string(), registration: z.string(), libelle: z.string(),
        echeance_date: z.string().nullable(), jours_restants: z.number().int().nullable(),
        statut: z.enum(['en_retard', 'a_prevoir', 'a_verifier']),
      })).openapi({ description: 'Les entretiens dus, en retard d’abord ; les plans à jour n’y figurent pas.' }),
    }),
  })
);
registry.registerPath({
  method: 'get',
  path: '/communes/{id}/accueil',
  tags: ['Communes'],
  summary: 'L’accueil du portail : ce qui va bien, ce qui demande une action',
  description:
    'Une réponse pour l’écran d’arrivée du portail communal (jalon D, lot D2). Elle réunit, sans rien recalculer d’autre, les indicateurs du service des 5 axes, les registres de « Ma commune dans SIIPI », les écarts de « À vérifier », les entretiens dus et l’avancement du constat du jour. Ni total, ni pourcentage, ni note ; une donnée absente reste absente, jamais un zéro.',
  security: SECURISE,
  request: { params: z.object({ id: z.string().openapi({ description: 'Identifiant de la commune.', example: 'nabeul_dar_chaabane_el_fehri' }) }) },
  responses: {
    200: json(AccueilCommune, 'La synthèse du jour.'),
    ...REPONSES_COMMUNES,
  },
});

const ElementBibliotheque = z.enum([
  'pcgd', 'rapports_etudes', 'cout_complet', 'caracterisation', 'population', 'pesees', 'circuits', 'points', 'reclamations',
]);
const TerritoireBibliotheque = z.object({
  cle: z.string(),
  nom: z.string(),
  communes: z.number().int().openapi({ description: 'Les communes réelles du territoire (le « M » de « N sur M »).' }),
  communes_avec: z.number().int().openapi({ description: 'Celles qui tiennent cet élément dans SIIPI (le « N »). Zéro est un vrai zéro : aucune n’en a.' }),
  nombre: z.number().int(),
  derniere: z.string().nullable(),
});
const LigneBibliotheque = registry.register(
  'LigneBibliotheque',
  z.object({
    commune_id: z.string(),
    commune: z.string(),
    commune_ar: z.string().nullable(),
    gouvernorat: z.string(),
    intitule: z.string().nullable().openapi({ description: 'Le titre d’un document ; le niveau de la source pour une caractérisation ; absent pour une série.' }),
    annee: z.number().int().nullable(),
    auteur: z.string().nullable(),
    statut: z.string().nullable().openapi({ description: 'Le statut d’un PCGD, la catégorie d’un rapport ou le niveau de source d’une caractérisation.' }),
    nature: z.string().nullable().openapi({ description: '« pese » pour les pesées ; « declaree » ou « estimee » pour la population.' }),
    nombre: z.number().int().openapi({ description: 'Le nombre d’éléments — ou la population, pour l’élément « population ».' }),
    premiere: z.string().nullable(),
    derniere: z.string().nullable(),
    mois_couverts: z.number().int().nullable().openapi({ description: 'Pour les pesées : le nombre de mois où il y en a.' }),
  })
);
const BibliothequeCatalogue = registry.register(
  'BibliothequeCatalogue',
  z.object({
    communes_total: z.number().int().openapi({ description: 'Les communes réelles : ni la démonstration, ni une commune retirée.' }),
    elements: z.array(
      z.object({
        element: ElementBibliotheque,
        groupe: z.enum(['documents', 'references', 'series']),
        communes_avec: z.number().int(),
        nombre: z.number().int(),
        premiere: z.string().nullable(),
        derniere: z.string().nullable(),
        repartition: z.record(z.string(), z.number().int()).openapi({
          description: 'Le nombre de communes par statut, niveau ou nature (adopté, en préparation… ; estimée, déclarée…) ; vide quand l’élément n’en distingue pas.',
        }),
      })
    ),
  })
);
const BibliothequeDetail = registry.register(
  'BibliothequeDetail',
  z.object({
    element: ElementBibliotheque,
    groupe: z.enum(['documents', 'references', 'series']),
    communes_total: z.number().int(),
    communes_avec: z.number().int(),
    repartition: z.record(z.string(), z.number().int()),
    gouvernorats: z.array(TerritoireBibliotheque).openapi({ description: 'Dans l’ordre alphabétique : un catalogue, pas un classement.' }),
    districts: z.array(TerritoireBibliotheque),
    lignes: z.array(LigneBibliotheque),
  })
);
registry.registerPath({
  method: 'get',
  path: '/bibliotheque',
  tags: ['Observatoire national'],
  summary: 'La bibliothèque nationale des données : le catalogue (FNCT)',
  description:
    'Neuf éléments — PCGD, études et rapports, coût complet, caractérisation, population, pesées, circuits, points relevés, réclamations — avec, pour chacun, « N communes sur M », la période couverte et la répartition par statut ou nature. Lecture seule, réservée à la FNCT, aucun accès aux fichiers eux-mêmes. Un élément qu’aucune commune n’a rend zéro commune, jamais une valeur posée à sa place.',
  security: SECURISE,
  responses: { 200: json(BibliothequeCatalogue, 'Le catalogue.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get',
  path: '/bibliotheque/lignes',
  tags: ['Observatoire national'],
  summary: 'La bibliothèque à plat, exportable (FNCT)',
  description:
    'Une ligne par document, et une ligne par commune pour les séries et les références, dans l’ordre alphabétique (gouvernorat, commune, intitulé). Excel ou CSV avec `format`. Le catalogue d’un élément se filtre avec `element`.',
  security: SECURISE,
  request: { query: qLignesBibliothequeSchema.extend(paramsExport) },
  responses: { 200: jsonOuExport(z.array(LigneBibliotheque.extend({ nombre: z.number().int() })), 'Les lignes.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get',
  path: '/bibliotheque/{element}',
  tags: ['Observatoire national'],
  summary: 'Un élément de la bibliothèque : par territoire, puis commune par commune (FNCT)',
  description:
    'Par gouvernorat et par district FNCT (« N communes sur M », ordre alphabétique), puis les lignes : le titre, l’auteur, l’année et le statut des documents d’une commune, ou le nombre et la période de ses séries. Un élément inconnu est introuvable (404).',
  security: SECURISE,
  request: { params: elementBibliothequeSchema },
  responses: { 200: json(BibliothequeDetail, 'L’élément en détail.'), ...REPONSES_COMMUNES },
});

// ---------------------------------------------------------------------------
// Le connecteur GPS (lot 17.4a)
// ---------------------------------------------------------------------------
const ConfigurationGps = registry.register(
  'ConfigurationGps',
  z.object({
    configure: z.boolean(),
    commune_id: z.string(),
    id: z.string().uuid().optional(),
    nom: z.string().optional(),
    mode: z.enum(['pull', 'push']).optional(),
    url: z.string().nullable().optional(),
    cadence_minutes: z.number().int().optional(),
    authentification: z.enum(['bearer', 'entete', 'parametre', 'aucune']).optional(),
    nom_champ_auth: z.string().nullable().optional(),
    correspondance: correspondanceGpsSchema.optional(),
    actif: z.boolean().optional(),
    jeton_enregistre_le: z.string().nullable().optional(),
    secret_webhook_enregistre_le: z.string().nullable().optional(),
    webhook_chemin: z.string().nullable().optional(),
    derniere_interrogation_le: z.string().nullable().optional(),
    dernier_releve_recu_le: z.string().nullable().optional(),
    dernier_echec_le: z.string().nullable().optional(),
    dernier_echec_message: z.string().nullable().optional(),
    mis_a_jour_le: z.string().optional(),
  })
);
const PositionLueGps = z.object({
  boitier: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  horodatage: z.string().nullable(),
  horodatage_brut: z.string().nullable(),
  vitesse: z.number().nullable(),
  cap: z.number().nullable(),
});
const BilanGps = z.object({ recues: z.number().int(), enregistrees: z.number().int(), doublons: z.number().int(), signalees: z.number().int() });
const ResultatGps = registry.register(
  'ResultatInterrogationGps',
  z.object({
    statut: z.enum(['ok', 'essai', 'echec']),
    recues: z.number().int().optional(),
    enregistrees: z.number().int().optional(),
    doublons: z.number().int().optional(),
    signalees: z.number().int().optional(),
    lues: z.number().int().optional(),
    apercu: z.array(PositionLueGps).optional(),
    message: z.string().optional(),
  })
);
const BoitierGps = registry.register(
  'BoitierGps',
  z.object({
    id: z.string().uuid(),
    identifiant: z.string(),
    vehicule_id: z.string(),
    registration: z.string().nullable().optional(),
    date_debut: z.string(),
    date_fin: z.string().nullable(),
    actif: z.boolean().optional(),
  })
);
const qCommuneGps = z.object({ communeId: paramCommuneId.optional() });
const corpsJson = (schema: any) => ({ body: { content: { 'application/json': { schema } } } });

registry.registerPath({
  method: 'get',
  path: '/gps/configuration',
  tags: ['Connecteur GPS'],
  summary: 'Le fournisseur GPS de la commune',
  description:
    'La commune et la FNCT ; le prestataire non. Jamais un secret : seulement la date où le jeton et le secret du webhook ont été enregistrés. L’état du dernier relevé reçu et du dernier échec (sans jeton ni paramètre d’adresse). Une commune hors du périmètre est introuvable (404).',
  security: SECURISE,
  request: { query: qCommuneGps },
  responses: { 200: json(ConfigurationGps, 'La configuration, ou configure = false.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'put',
  path: '/gps/configuration',
  tags: ['Connecteur GPS'],
  summary: 'Paramétrer le fournisseur GPS (commune seule)',
  description:
    'La commune seule ; la FNCT lit. Mode pull (SIIPI interroge l’adresse à la cadence) ou push (webhook signé). Le jeton s’écrit et ne se relit jamais : absent, celui qui est enregistré reste. Il est chiffré dans l’API avant d’entrer en base.',
  security: SECURISE,
  request: { query: qCommuneGps, ...corpsJson(configurationGpsSchema) },
  responses: { 200: json(ConfigurationGps, 'La configuration enregistrée, sans secret.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'post',
  path: '/gps/configuration/secret-webhook',
  tags: ['Connecteur GPS'],
  summary: 'Générer le secret du webhook (montré une seule fois)',
  description:
    'Un fournisseur en push signe chaque envoi avec ce secret (HMAC-SHA256 de « horodatage.corps »). Le secret est rendu ICI, une fois ; il n’est plus jamais affiché. En générer un nouveau remplace l’ancien.',
  security: SECURISE,
  request: { query: qCommuneGps },
  responses: {
    201: json(z.object({ secret: z.string(), webhook_chemin: z.string(), avertissement: z.string() }), 'Le secret, une seule fois.'),
    ...REPONSES_COMMUNES,
  },
});
registry.registerPath({
  method: 'post',
  path: '/gps/configuration/essai',
  tags: ['Connecteur GPS'],
  summary: 'Essayer la correspondance, sans rien enregistrer',
  description:
    'Interroge le fournisseur une fois (pull), ou lit un exemple collé (`exemple`, pour un fournisseur en push), et rend les cinq premières positions telles que la correspondance les lit. Rien n’est enregistré : c’est l’outil pour régler la correspondance, ou la vérifier quand le fournisseur change son API.',
  security: SECURISE,
  request: { query: qCommuneGps, ...corpsJson(essaiGpsSchema) },
  responses: { 200: json(ResultatGps, 'L’essai, ou son échec.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'post',
  path: '/gps/configuration/interroger',
  tags: ['Connecteur GPS'],
  summary: 'Interroger le fournisseur maintenant',
  description: 'Une interrogation enregistrée, hors de la cadence : positions tracées, doublons, signalées. Un échec est noté, il ne bloque rien.',
  security: SECURISE,
  request: { query: qCommuneGps },
  responses: { 200: json(ResultatGps, 'Le bilan, ou l’échec.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get',
  path: '/gps/boitiers',
  tags: ['Connecteur GPS'],
  summary: 'Les boîtiers et leurs engins',
  security: SECURISE,
  request: { query: qCommuneGps },
  responses: { 200: json(z.array(BoitierGps), 'Les correspondances, en cours d’abord.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'post',
  path: '/gps/boitiers',
  tags: ['Connecteur GPS'],
  summary: 'Rattacher un boîtier à un engin',
  description:
    'La commune seule. Un boîtier ne se rattache qu’à un engin de la commune ; un boîtier déjà en service doit d’abord être clos (409). Les positions signalées avant ce rattachement ne sont pas reprises en silence.',
  security: SECURISE,
  request: { query: qCommuneGps, ...corpsJson(boitierGpsSchema) },
  responses: { 201: json(BoitierGps, 'La correspondance.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'post',
  path: '/gps/boitiers/{id}/cloture',
  tags: ['Connecteur GPS'],
  summary: 'Clore une correspondance boîtier → engin',
  description: 'Elle n’est pas effacée : les traces d’avant gardent l’engin qui les portait.',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }), ...corpsJson(clotureGpsSchema) },
  responses: { 200: json(BoitierGps, 'La correspondance close.'), ...REPONSES_COMMUNES },
});
registry.registerPath({
  method: 'get',
  path: '/gps/non-rattachees',
  tags: ['Connecteur GPS'],
  summary: 'Les positions signalées, par boîtier et par motif',
  description: 'Boîtier sans engin, hors de Tunisie, horodatage illisible ou impossible, coordonnées illisibles : jamais rattachées au hasard. Le dernier horodatage brut dit pourquoi une date n’a pas été lue.',
  security: SECURISE,
  request: { query: qCommuneGps },
  responses: {
    200: json(
      z.array(
        z.object({
          boitier: z.string().nullable(),
          motif: z.enum(['boitier_inconnu', 'hors_tunisie', 'horodatage_invalide', 'coordonnees_invalides']),
          nombre: z.number().int(),
          premiere_recue: z.string(),
          derniere_recue: z.string(),
          dernier_horodatage_brut: z.string().nullable(),
        })
      ),
      'Les positions signalées.'
    ),
    ...REPONSES_COMMUNES,
  },
});
registry.registerPath({
  method: 'get',
  path: '/gps/traces',
  tags: ['Connecteur GPS'],
  summary: 'Les traces des engins',
  description: 'Sans engin : la dernière position de chacun. Avec un engin : sa trace d’un jour (heure de Tunis), au plus 5 000 points. Provenance « GPS fournisseur » : une trace ne modifie aucun circuit ni point relevé.',
  security: SECURISE,
  request: { query: qCommuneGps.merge(tracesGpsSchema) },
  responses: {
    200: json(
      z.object({
        dernieres: z
          .array(z.object({ vehicule_id: z.string(), registration: z.string().nullable(), horodatage: z.string(), lat: z.number(), lng: z.number(), vitesse_kmh: z.number().nullable() }))
          .optional(),
        vehicule_id: z.string().optional(),
        jour: z.string().optional(),
        points: z.array(z.object({ horodatage: z.string(), lat: z.number(), lng: z.number(), vitesse_kmh: z.number().nullable(), cap: z.number().nullable() })).optional(),
      }),
      'Les dernières positions, ou la trace d’un jour.'
    ),
    ...REPONSES_COMMUNES,
  },
});
registry.registerPath({
  method: 'post',
  path: '/gps/webhook/{fournisseurId}',
  tags: ['Connecteur GPS'],
  summary: 'Recevoir les positions d’un fournisseur (webhook signé)',
  description:
    'Sans compte. Chaque envoi porte `X-SIIPI-Horodatage` (secondes Unix) et `X-SIIPI-Signature: sha256=<HMAC-SHA256 hex du « horodatage.corps » avec le secret de la commune>`. Sans signature, signature fausse, ou horodatage à plus de 5 minutes : 401. Fournisseur inconnu, interrogé (pull) ou éteint : 404. Débit limité par fournisseur (429). Le corps se lit selon la correspondance de la commune.',
  request: {
    params: z.object({ fournisseurId: z.string().uuid() }),
    headers: z.object({ 'X-SIIPI-Horodatage': z.string(), 'X-SIIPI-Signature': z.string() }),
    body: { content: { 'application/json': { schema: z.unknown() } } },
  },
  responses: {
    200: json(BilanGps, 'Le bilan : reçues, tracées, doublons, signalées.'),
    400: json(z.object({ error: z.string() }), 'Corps illisible, ou correspondance qui ne trouve pas les positions.'),
    401: json(z.object({ error: z.string() }), 'Signature absente, fausse ou trop ancienne.'),
    404: json(z.object({ error: z.string() }), 'Fournisseur introuvable.'),
    429: json(z.object({ error: z.string() }), 'Trop d’envois.'),
  },
});

const EtatExploitation = registry.register(
  'EtatExploitation',
  z.object({
    disponible: z.boolean(),
    verifie_le: z.string().nullable(),
    age_minutes: z.number().int().nullable(),
    perime: z.boolean().nullable(),
    alertes_configurees: z.boolean().nullable(),
    controles: z.array(
      z.object({
        controle: z.enum(['api', 'frontal', 'certificat', 'sauvegarde', 'copie', 'disque']),
        etat: z.enum(['ok', 'panne', 'avertissement', 'non_verifie']),
        depuis: z.string().nullable(),
        message: z.string().nullable(),
        message_ar: z.string().nullable(),
      })
    ),
    derniere_alerte: z.object({ le: z.string(), sujet: z.string(), envoyee: z.boolean() }).nullable(),
  })
);
registry.registerPath({
  method: 'get',
  path: '/supervision/etat',
  tags: ['Paramètres nationaux'],
  summary: 'L’état de l’exploitation (FNCT)',
  description:
    'Réservé à la FNCT. Le dernier constat de la surveillance (service à part, chantier P, lot P5) : l’API, le site, le certificat, la sauvegarde, sa copie hors du serveur, le disque — chacun ok, en panne, à surveiller ou non vérifié, depuis quand, avec son message en français et en arabe. Un constat de plus de trois intervalles est dit périmé ; sans constat, `disponible` est faux et rien n’est supposé. Ni les destinataires des alertes ni le serveur de courriel ne sortent.',
  security: SECURISE,
  responses: { 200: json(EtatExploitation, 'L’état de l’exploitation.'), ...REPONSES_COMMUNES },
});

const PassageConservation = registry.register(
  'PassageConservation',
  z.object({
    id: z.number().int(),
    debut: z.string(),
    fin: z.string().nullable(),
    declenche_par: z.enum(['planificateur', 'commande']),
    perimetre: z.string().nullable().openapi({ description: 'NULL : le passage national du mois. Une commune : un passage restreint lancé à la main.' }),
    perimetre_nom: z.string().nullable().optional().openapi({ description: 'Nom de la commune du périmètre, pour l’affichage.' }),
    perimetre_nom_ar: z.string().nullable().optional(),
    statut: z.enum(['en_cours', 'termine', 'refuse']).openapi({
      description: '« refuse » : le passage n’a touché à rien — archive froide absente ou non initialisée, par exemple. Le motif le dit.',
    }),
    motif_refus: z.string().nullable(),
    photos_eligibles: z.number().int().openapi({ description: 'Photos de plus de 36 mois encore entières au début du passage.' }),
    photos_compressees: z.number().int(),
    octets_avant: z.number(),
    octets_apres: z.number(),
    anomalies: z.array(z.object({ fichier: z.string(), raison: z.string() })).openapi({
      description:
        'Photos laissées entières, et pourquoi (original introuvable, empreinte différente de la fiche, image illisible…). Constatées, jamais « réparées » : elles seront reprises au passage suivant.',
    }),
  })
);

const DemandeRestauration = registry.register(
  'DemandeRestauration',
  z.object({
    id: z.string().uuid(),
    fichier_id: z.string().uuid(),
    commune_id: z.string(),
    motif: z.string(),
    demandee_par: z.string().uuid().nullable(),
    demandee_le: z.string(),
    echeance: z.string().openapi({ description: 'Date de la demande plus le délai de restauration (48 heures).' }),
    statut: z.enum(['demandee', 'restauree']),
    restauree_le: z.string().nullable(),
    tentatives: z.number().int(),
    derniere_tentative_le: z.string().nullable(),
    derniere_erreur: z.string().nullable().openapi({
      description: 'archive_absente, original_introuvable ou empreinte_differente. Un original qui ne correspond plus à sa fiche n’est jamais restauré.',
    }),
  })
);

registry.registerPath({
  method: 'get',
  path: '/fichiers/conservation',
  tags: ['Fichiers'],
  summary: 'Conservation des photos : passages et restaurations (FNCT)',
  description:
    "La tâche mensuelle de conservation (D-FNCT-4) vue de la FNCT : ses paramètres, ses douze derniers passages, les demandes de restauration — les ouvertes d'abord, avec leur échéance et leur retard éventuel — et deux compteurs nationaux.",
  security: SECURISE,
  responses: {
    200: json(
      z.object({
        parametres: z.array(z.object({ cle: z.string(), valeur: z.string() })),
        passages: z.array(PassageConservation),
        demandes: z.array(
          DemandeRestauration.omit({ demandee_par: true }).extend({
            commune: z.string(),
            commune_ar: z.string().nullable(),
            nom_original: z.string(),
            en_retard: z.boolean().openapi({ description: 'Encore ouverte alors que l’échéance est passée.' }),
          })
        ),
        photos_compressees: z.number().int(),
        photos_en_attente: z.number().int().openapi({
          description: 'Photos qui ont l’âge et sont encore entières : ce que le prochain passage compressera.',
        }),
      }),
      'État de la conservation.'
    ),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'post',
  path: '/fichiers/{id}/restauration',
  tags: ['Fichiers'],
  summary: "Demander la restauration d'un original (FNCT)",
  description:
    "L'original d'une photo compressée est dans l'archive froide. La FNCT seule en demande la restauration, motif à l'appui ; la tâche de conservation la sert dès que l'archive est accessible, sous 48 heures. 409 si la photo n'est pas compressée, déjà restaurée, ou si une demande est déjà ouverte. La demande et la restauration sont au journal d'audit.",
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: demandeRestaurationSchema } } },
  },
  responses: {
    201: json(DemandeRestauration, 'Demande ouverte.'),
    409: { description: 'Rien à restaurer, déjà restauré, ou déjà demandé.' },
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'get',
  path: '/fichiers/{id}/original',
  tags: ['Fichiers'],
  summary: "Lire l'original restauré (FNCT)",
  description:
    "Les octets de l'original, une fois restauré depuis l'archive froide. Réservé à la FNCT : la version compressée reste celle que tout le monde voit. 409 tant que la photo n'est pas compressée, ou que son original n'est pas restauré.",
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: "Les octets de l'original.",
      content: {
        'image/jpeg': { schema: { type: 'string', format: 'binary' } as any },
        'image/png': { schema: { type: 'string', format: 'binary' } as any },
        'image/webp': { schema: { type: 'string', format: 'binary' } as any },
      },
    },
    409: { description: 'Pas compressée, ou original pas encore restauré.' },
    503: { description: "Restauré, mais les octets sont introuvables sur le volume." },
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'get',
  path: '/fichiers/{id}',
  tags: ['Fichiers'],
  summary: 'Lire les octets',
  description:
    "Servi avec le type réel et « nosniff » : un fichier déposé par un utilisateur ne doit jamais pouvoir être pris pour du HTML par un navigateur. Un fichier hors du périmètre de l'appelant est INTROUVABLE (404) et non refusé — un refus renseignerait sur son existence. Une photo compressée (D-FNCT-4) est servie dans sa version compressée, en JPEG, à la même adresse : le citoyen la consulte toujours.",
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
    "Retrait LOGIQUE. Les octets restent sur le volume : aucun geste d'un utilisateur ne les efface. Seule la tâche de conservation (D-FNCT-4) change leur forme, à 36 mois : version compressée en ligne, original dans l'archive froide — jamais détruit.",
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
    document_id: z.string().uuid().openapi({
      description: "Identifiant commun à toutes les versions d'un même document : l'id de sa version 1.",
    }),
    version: z.number().int().openapi({ description: 'Numéro de version, à partir de 1. Une version antérieure n’est jamais écrasée.' }),
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
  responses: {
    200: json(
      z.array(RapportEtude.extend({ nb_versions: z.number().int() })),
      'Dernière version de chaque document, avec son nombre de versions.'
    ),
    ...REPONSES_COMMUNES,
  },
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
    'Retrait LOGIQUE, comme partout, et de TOUTES les versions du document : laisser la version 1 en ligne après avoir retiré la 2 ferait réapparaître un document qu’on croyait retiré. Les fichiers déposés restent sur le volume.',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Rapport retiré.' }, ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/rapports-etudes/{id}/versions',
  tags: ['Rapports et études'],
  summary: 'Historique des versions d’un document',
  description: 'Toutes les versions en ligne du document auquel appartient `id`, la plus récente en tête — chacune datée et imputée.',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: json(z.array(RapportEtude), 'Versions, de la plus récente à la plus ancienne.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/rapports-etudes/{id}/versions',
  tags: ['Rapports et études'],
  summary: 'Déposer une nouvelle version',
  description:
    "Une nouvelle ligne rattachée au même document, numérotée à la suite — la précédente reste consultable. Seul le fichier est obligatoire : titre, catégorie, auteur et date sont repris de la version courante s'ils ne sont pas fournis. Le fichier est déposé d'abord par POST /fichiers (usage « rapport_etude »).",
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: rapportEtudeVersionSchema } } },
  },
  responses: { 201: json(RapportEtude, 'Nouvelle version enregistrée.'), ...REPONSES_COMMUNES },
});

// ---------------------------------------------------------------------------
// Maintenance des engins — GMAO (Jalon 5, B2.2 et B2.3)
// ---------------------------------------------------------------------------

const Intervention = registry.register(
  'InterventionMaintenance',
  z.object({
    id: z.string().uuid(),
    commune_id: z.string(),
    vehicule_id: z.string(),
    registration: z.string(),
    date_intervention: z.string(),
    type: z.enum(TYPES_INTERVENTION),
    nature: z.enum(NATURES_INTERVENTION),
    description: z.string().nullable(),
    cout_tnd: z.string().nullable().openapi({ description: 'En dinars, au millime (NUMERIC rendu en chaîne pour ne rien arrondir).' }),
    kilometrage: z.number().int().nullable(),
    prestataire: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
);

const PlanEntretien = registry.register(
  'PlanEntretien',
  z.object({
    id: z.string().uuid(),
    commune_id: z.string(),
    vehicule_id: z.string(),
    registration: z.string(),
    type: z.enum(TYPES_INTERVENTION),
    libelle: z.string().nullable(),
    intervalle_km: z.number().int().nullable(),
    intervalle_jours: z.number().int().nullable(),
    seuil_alerte_km: z.number().int(),
    seuil_alerte_jours: z.number().int(),
    reference_date: z.string(),
    reference_km: z.number().int().nullable(),
    created_at: z.string(),
  })
);

const EcheanceEntretien = registry.register(
  'EcheanceEntretien',
  z.object({
    plan_id: z.string().uuid(),
    vehicule_id: z.string(),
    registration: z.string(),
    type_engin: z.string().nullable(),
    type: z.enum(TYPES_INTERVENTION),
    libelle: z.string().nullable(),
    derniere_date: z.string().nullable(),
    dernier_km: z.number().int().nullable(),
    km_actuel: z.number().int().nullable(),
    km_releve_le: z.string().nullable(),
    echeance_date: z.string().nullable(),
    echeance_km: z.number().int().nullable().openapi({
      description: 'Vide si le plan a un intervalle au kilomètre mais que la dernière intervention a été saisie sans kilométrage : l’échéance est alors inconnue, jamais devinée.',
    }),
    jours_restants: z.number().int().nullable(),
    km_restants: z.number().int().nullable(),
    statut: z.enum(STATUTS_ECHEANCE),
  })
);

const idTexte = z.object({ id: z.string() });
const idUuid = z.object({ id: z.string().uuid() });

registry.registerPath({
  method: 'get',
  path: '/maintenance/echeances',
  tags: ['Maintenance'],
  summary: "Échéances d'entretien (B2.3)",
  description:
    "Une ligne par plan d'entretien : échéance en date et/ou en kilomètres, calculée depuis la dernière intervention du même type — jamais stockée, si bien qu'une alerte disparaît d'elle-même dès que l'intervention est saisie. « a_prevoir » : l'échéance entre dans le seuil d'alerte du plan. En retard d'abord.",
  security: SECURISE,
  request: {
    query: z.object({
      communeId: z.string().optional(),
      statut: z.enum(STATUTS_ECHEANCE).optional(),
      vehiculeId: z.string().optional(),
      ...paramsExport,
    }),
  },
  responses: { 200: jsonOuExport(z.array(EcheanceEntretien), 'Échéances, en retard d’abord.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/maintenance/interventions',
  tags: ['Maintenance'],
  summary: "Carnet d'entretien (B2.2)",
  security: SECURISE,
  request: {
    query: z.object({
      communeId: z.string().optional(),
      vehiculeId: z.string().optional(),
      type: z.enum(TYPES_INTERVENTION).optional(),
      depuis: z.string().optional(),
      jusqua: z.string().optional(),
      ...paramsExport,
    }),
  },
  responses: { 200: jsonOuExport(z.array(Intervention), 'Interventions, les plus récentes en tête.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/maintenance/interventions',
  tags: ['Maintenance'],
  summary: 'Saisir une intervention',
  description:
    "Rattachée à la commune de l'ENGIN, pas à celle qu'annonce l'appelant. Une date future est refusée : une intervention se saisit une fois faite. Un kilométrage plus élevé que le compteur connu met celui-ci à jour ; jamais l'inverse.",
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: interventionSchema } } } },
  responses: { 201: json(Intervention, 'Intervention enregistrée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/maintenance/interventions/{id}',
  tags: ['Maintenance'],
  summary: 'Corriger une intervention',
  security: SECURISE,
  request: { params: idUuid, body: { content: { 'application/json': { schema: majInterventionSchema } } } },
  responses: { 200: json(Intervention, 'Intervention corrigée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/maintenance/interventions/{id}',
  tags: ['Maintenance'],
  summary: 'Retirer une intervention',
  description: "Retrait logique : l'intervention sort du carnet et des échéances, mais reste en base, datée et imputée.",
  security: SECURISE,
  request: { params: idUuid },
  responses: { 204: { description: 'Intervention retirée.' }, ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/maintenance/plans',
  tags: ['Maintenance'],
  summary: "Plans d'entretien",
  security: SECURISE,
  request: { query: z.object({ communeId: z.string().optional(), vehiculeId: z.string().optional() }) },
  responses: { 200: json(z.array(PlanEntretien), 'Plans.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/maintenance/plans',
  tags: ['Maintenance'],
  summary: "Poser un plan d'entretien",
  description:
    "Un type d'intervention et un intervalle en kilomètres et/ou en jours. Point de départ tant qu'aucune intervention de ce type n'existe : la référence fournie, sinon la date du jour et le kilométrage connu de l'engin.",
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: planSchema } } } },
  responses: { 201: json(PlanEntretien, 'Plan enregistré.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/maintenance/plans/{id}',
  tags: ['Maintenance'],
  summary: "Modifier un plan d'entretien",
  security: SECURISE,
  request: { params: idUuid, body: { content: { 'application/json': { schema: majPlanSchema } } } },
  responses: { 200: json(PlanEntretien, 'Plan modifié.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/maintenance/plans/{id}',
  tags: ['Maintenance'],
  summary: "Retirer un plan d'entretien",
  security: SECURISE,
  request: { params: idUuid },
  responses: { 204: { description: 'Plan retiré.' }, ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'put',
  path: '/maintenance/engins/{id}/kilometrage',
  tags: ['Maintenance'],
  summary: 'Relever le compteur d’un engin',
  description:
    'Un relevé inférieur au précédent est refusé (400), sauf `forcer: true` — le cas d’un compteur remplacé. Une date future est refusée.',
  security: SECURISE,
  request: { params: idTexte, body: { content: { 'application/json': { schema: releveSchema } } } },
  responses: {
    200: json(
      z.object({ id: z.string(), registration: z.string(), kilometrage: z.number().int(), kilometrage_le: z.string() }),
      'Compteur relevé.'
    ),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'get',
  path: '/maintenance/bilan',
  tags: ['Maintenance'],
  summary: 'Ce que coûte chaque engin (12 mois glissants)',
  description: "Nombre d'interventions, coût total et part corrective : c'est ce que l'axe 3 des KPI rapportera au tonnage (Jalon 8).",
  security: SECURISE,
  request: { query: z.object({ communeId: z.string().optional() }) },
  responses: {
    200: json(
      z.array(
        z.object({
          vehicule_id: z.string(),
          registration: z.string(),
          interventions_12_mois: z.number().int(),
          cout_12_mois_tnd: z.number(),
          cout_correctif_12_mois_tnd: z.number(),
          derniere_intervention: z.string().nullable(),
        })
      ),
      'Un engin par ligne, le plus coûteux en tête.'
    ),
    ...REPONSES_COMMUNES,
  },
});

// ---------------------------------------------------------------------------
// Points : champs libres, étiquettes, actions planifiées (Jalon 6)
// ---------------------------------------------------------------------------

const TAG_POINTS = 'Points : champs libres et actions';

const ChampPoint = registry.register(
  'ChampPoint',
  z
    .object({
      id: z.string().uuid(),
      commune_id: z.string(),
      libelle: z.string(),
      libelle_ar: z.string().nullable(),
      type: z.enum(TYPES_CHAMP),
      options: z.array(z.string()).openapi({ description: 'Choix proposés (champ « liste » seulement).' }),
      ordre: z.number().int(),
      nb_renseignes: z.number().int().optional().openapi({ description: 'Points de la commune où le champ est renseigné.' }),
    })
    .openapi('ChampPoint')
);

const EtiquettePoint = registry.register(
  'EtiquettePoint',
  z
    .object({
      id: z.string().uuid(),
      commune_id: z.string(),
      nom: z.string(),
      couleur: z.enum(COULEURS),
      nb_points: z.number().int().optional(),
    })
    .openapi('EtiquettePoint')
);

const ActionPlanifiee = registry.register(
  'ActionPlanifiee',
  z
    .object({
      id: z.string().uuid(),
      commune_id: z.string(),
      titre: z.string(),
      description: z.string().nullable(),
      date_prevue: z.string(),
      date_fin: z.string().nullable(),
      responsable: z.string().nullable(),
      statut: z.enum(STATUTS_ACTION),
      etat: z.enum(['planifiee', 'en_retard', 'terminee', 'annulee']).openapi({
        description: '« en_retard » : encore planifiée alors que sa date (de fin, à défaut prévue) est passée. Calculé, jamais saisi.',
      }),
      terminee_le: z.string().nullable(),
      nb_points: z.number().int(),
      nb_faits: z.number().int(),
      type: z.enum(['generale', 'nettoyage']),
      poi_id: z.string().uuid().nullable(),
      poi_nom: z.string().nullable(),
      poi_type: z.string().nullable(),
      metres_lineaires: z.number().nullable().openapi({ description: 'Saisis à la clôture d’un nettoyage : source mesurée du balayage (M1-1).' }),
    })
    .openapi('ActionPlanifiee')
);

const ActionDetaillee = registry.register(
  'ActionDetaillee',
  ActionPlanifiee.extend({
    points: z.array(
      z.object({
        id: z.string().uuid(),
        circuit_id: z.string().uuid(),
        circuit_nom: z.string(),
        voyage: z.number().int(),
        ordre: z.number().int(),
        nom: z.string().nullable(),
        type: z.string(),
        lat: z.number(),
        lng: z.number(),
        fait_le: z.string().nullable(),
        fait_par: z.string().nullable(),
      })
    ),
  }).openapi('ActionDetaillee')
);

const qCommune = z.object({ communeId: paramCommuneId.optional() });

registry.registerPath({
  method: 'get',
  path: '/points/champs',
  tags: [TAG_POINTS],
  summary: 'Les champs libres du tableau des points',
  security: SECURISE,
  request: { query: qCommune },
  responses: { 200: json(z.array(ChampPoint), 'Champs de la commune, dans l’ordre du tableau.'), 400: REPONSES_COMMUNES[400], 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'post',
  path: '/points/champs',
  tags: [TAG_POINTS],
  summary: 'Ajouter un champ libre',
  description: 'Texte, nombre, oui/non, liste de choix ou date. Le type ne change plus ensuite. 40 champs au plus par commune.',
  security: SECURISE,
  request: { query: qCommune, body: { content: { 'application/json': { schema: champSchema } } } },
  responses: { 201: json(ChampPoint, 'Champ créé.'), ...REPONSES_COMMUNES, 409: { description: 'Un champ de même libellé existe déjà.' } },
});

registry.registerPath({
  method: 'patch',
  path: '/points/champs/{id}',
  tags: [TAG_POINTS],
  summary: 'Renommer un champ, en retoucher les choix ou le rang',
  description: 'Un changement de type est refusé (400). Un choix encore porté par des points ne peut pas être retiré (409).',
  security: SECURISE,
  request: { params: idUuid, body: { content: { 'application/json': { schema: majChampSchema } } } },
  responses: { 200: json(ChampPoint, 'Champ modifié.'), ...REPONSES_COMMUNES, 409: { description: 'Libellé en double, ou choix encore utilisé.' } },
});

registry.registerPath({
  method: 'delete',
  path: '/points/champs/{id}',
  tags: [TAG_POINTS],
  summary: 'Retirer un champ libre',
  description: 'Retrait logique : aucune valeur n’est réécrite, elles restent dans l’historique des points.',
  security: SECURISE,
  request: { params: idUuid },
  responses: { 204: { description: 'Champ retiré.' }, ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/points/etiquettes',
  tags: [TAG_POINTS],
  summary: 'Les étiquettes de la commune',
  security: SECURISE,
  request: { query: qCommune },
  responses: { 200: json(z.array(EtiquettePoint), 'Étiquettes, avec le nombre de points qui les portent.'), 400: REPONSES_COMMUNES[400], 401: REPONSES_COMMUNES[401] },
});

registry.registerPath({
  method: 'post',
  path: '/points/etiquettes',
  tags: [TAG_POINTS],
  summary: 'Créer une étiquette',
  security: SECURISE,
  request: { query: qCommune, body: { content: { 'application/json': { schema: etiquetteSchema } } } },
  responses: { 201: json(EtiquettePoint, 'Étiquette créée.'), ...REPONSES_COMMUNES, 409: { description: 'Une étiquette de même nom existe déjà.' } },
});

registry.registerPath({
  method: 'patch',
  path: '/points/etiquettes/{id}',
  tags: [TAG_POINTS],
  summary: 'Renommer une étiquette ou en changer la couleur',
  security: SECURISE,
  request: { params: idUuid, body: { content: { 'application/json': { schema: etiquetteSchema.partial() } } } },
  responses: { 200: json(EtiquettePoint, 'Étiquette modifiée.'), ...REPONSES_COMMUNES, 409: { description: 'Nom en double.' } },
});

registry.registerPath({
  method: 'delete',
  path: '/points/etiquettes/{id}',
  tags: [TAG_POINTS],
  summary: 'Retirer une étiquette',
  security: SECURISE,
  request: { params: idUuid },
  responses: { 204: { description: 'Étiquette retirée.' }, ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/points/lot',
  tags: [TAG_POINTS],
  summary: 'Renseigner un champ ou étiqueter plusieurs points d’un coup',
  description:
    'Tout ou rien : un point invisible donne 404, une valeur qui ne correspond pas au type du champ donne 400, et rien n’est écrit. Une valeur null efface la case.',
  security: SECURISE,
  request: { body: { content: { 'application/json': { schema: lotSchema } } } },
  responses: { 200: json(z.object({ modifies: z.number().int() }), 'Points modifiés.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/points/{id}',
  tags: [TAG_POINTS],
  summary: 'Renseigner les champs libres ou les étiquettes d’un point',
  description: '`attributs` se fusionne (null efface une case) ; `etiquettes` remplace la liste entière.',
  security: SECURISE,
  request: { params: idUuid, body: { content: { 'application/json': { schema: attributsPointSchema } } } },
  responses: {
    200: json(
      z.object({ id: z.string().uuid(), attributs: z.record(z.string(), z.any()), etiquettes: z.array(z.string().uuid()), updated_at: z.string() }),
      'Point modifié.'
    ),
    ...REPONSES_COMMUNES,
  },
});

registry.registerPath({
  method: 'get',
  path: '/points/actions',
  tags: [TAG_POINTS],
  summary: 'Les actions planifiées sur les points',
  security: SECURISE,
  request: { query: qCommune.extend({ statut: z.enum(STATUTS_ACTION).optional() }) },
  responses: { 200: json(z.array(ActionPlanifiee), 'Actions, les planifiées d’abord, par date.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/points/actions',
  tags: [TAG_POINTS],
  summary: 'Planifier une action sur une sélection de points',
  description:
    'La commune de l’action est celle des points. Les points sont arrêtés à la création : une étiquette posée plus tard n’agrandit pas l’action.',
  security: SECURISE,
  request: { query: qCommune, body: { content: { 'application/json': { schema: actionSchema } } } },
  responses: { 201: json(ActionPlanifiee, 'Action planifiée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'get',
  path: '/points/actions/{id}',
  tags: [TAG_POINTS],
  summary: 'Une action et ses points, avec leur avancement',
  security: SECURISE,
  request: { params: idUuid },
  responses: { 200: json(ActionDetaillee, 'Action détaillée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/points/actions/{id}',
  tags: [TAG_POINTS],
  summary: 'Modifier, terminer ou annuler une action',
  security: SECURISE,
  request: { params: idUuid, body: { content: { 'application/json': { schema: majActionSchema } } } },
  responses: { 200: json(ActionPlanifiee, 'Action modifiée.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/points/actions/{id}',
  tags: [TAG_POINTS],
  summary: 'Retirer une action',
  security: SECURISE,
  request: { params: idUuid },
  responses: { 204: { description: 'Action retirée.' }, ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/points/actions/{id}/points',
  tags: [TAG_POINTS],
  summary: 'Ajouter des points à une action, ou en retirer',
  security: SECURISE,
  request: { params: idUuid, body: { content: { 'application/json': { schema: pointsActionSchema } } } },
  responses: { 200: json(ActionPlanifiee, 'Action mise à jour.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/points/actions/{id}/avancement',
  tags: [TAG_POINTS],
  summary: 'Pointer des points faits (ou les dé-pointer)',
  description: '« Fait » porte sa date et son auteur. Un point absent de l’action donne 404, et rien n’est écrit.',
  security: SECURISE,
  request: { params: idUuid, body: { content: { 'application/json': { schema: avancementSchema } } } },
  responses: { 200: json(ActionPlanifiee, 'Avancement mis à jour.'), ...REPONSES_COMMUNES },
});

// ---------------------------------------------------------------------------
// Imports CSV (Jalon 4, lot 2) — même calque que l'import KML : sans
// « valider », un aperçu qui n'écrit rien ; avec, une transaction.
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/contacts/import',
  tags: ['Contacts'],
  summary: 'Importer des contacts depuis un CSV',
  description: `${DESCRIPTION_IMPORT_CSV} Un contact déjà présent (même nom, et même téléphone ou même courriel) n'est pas recréé : réimporter un export ne double pas l'annuaire. Seules les lignes « creer » sont écrites.`,
  security: SECURISE,
  request: {
    query: z.object({ communeId: z.string().optional() }),
    body: { content: { 'application/json': { schema: importContactsSchema } } },
  },
  responses: {
    200: json(ApercuImportCsv, "Aperçu : rien n'a été écrit."),
    201: json(ApercuImportCsv, 'Contacts créés.'),
    ...REPONSES_COMMUNES,
  },
});

// ---------------------------------------------------------------------------
// Contacts (TDR §3.2.7)
// ---------------------------------------------------------------------------

const CATEGORIES_CONTACT = ['administration', 'prestataire', 'association', 'fournisseur', 'elu', 'autre'] as const;

const Contact = registry.register(
  'Contact',
  z.object({
    id: z.string().uuid(),
    commune_id: z.string(),
    nom_complet: z.string(),
    organisation: z.string().nullable(),
    fonction: z.string().nullable(),
    categorie: z.enum(CATEGORIES_CONTACT),
    telephone: z.string().nullable(),
    email: z.string().nullable(),
    notes: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
);

registry.registerPath({
  method: 'get',
  path: '/contacts',
  tags: ['Contacts'],
  summary: "Annuaire de travail d'une commune",
  description:
    'Interlocuteurs externes, sans compte sur la plateforme. Lecture réservée à la commune et à la FNCT : un prestataire rattaché n’y a pas accès (données personnelles de tiers, loi organique 2004-63).',
  security: SECURISE,
  request: {
    query: z.object({
      communeId: z.string().optional(),
      categorie: z.enum(CATEGORIES_CONTACT).optional(),
      q: z.string().optional().openapi({ description: 'Recherche sur le nom, l’organisation ou la fonction.' }),
      ...paramsExport,
    }),
  },
  responses: { 200: jsonOuExport(z.array(Contact), 'Contacts, par ordre alphabétique.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'post',
  path: '/contacts',
  tags: ['Contacts'],
  summary: 'Ajouter un contact',
  description: 'Au moins un téléphone ou un courriel : une fiche sans moyen de joindre la personne n’est pas un contact.',
  security: SECURISE,
  request: {
    query: z.object({ communeId: z.string().optional() }),
    body: { content: { 'application/json': { schema: contactSchema } } },
  },
  responses: { 201: json(Contact, 'Contact ajouté.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'patch',
  path: '/contacts/{id}',
  tags: ['Contacts'],
  summary: 'Modifier un contact',
  description: 'Un champ absent ne change pas ; un champ vidé (« » ou null) s’efface.',
  security: SECURISE,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: majContactSchema } } },
  },
  responses: { 200: json(Contact, 'Contact modifié.'), ...REPONSES_COMMUNES },
});

registry.registerPath({
  method: 'delete',
  path: '/contacts/{id}',
  tags: ['Contacts'],
  summary: 'Retirer un contact',
  description: 'Retrait logique : la fiche disparaît de l’annuaire mais reste en base, datée et imputée.',
  security: SECURISE,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Contact retiré.' }, ...REPONSES_COMMUNES },
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
      version: '0.15.85',
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
        'tracées séparément, conformément à la loi organique n° 2004-63.',
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
      { name: 'Communication', description: "Sondages, projets et notifications ciblées par périmètre géographique. Les décomptes de destinataires sont rendus en nombre, jamais en liste (loi organique n° 2004-63)." },
      { name: 'Personnel', description: "Effectif du service, affectation aux circuits, présence quotidienne et coût du service. Aucun salaire individuel, aucune donnée de santé (loi organique n° 2004-63)." },
      { name: 'Circuits et contrôle terrain', description: 'Tournées de collecte et constats quotidiens (espace communal).' },
      { name: 'Espace prestataire', description: 'Registre du prestataire privé : passages, incidents, confrontation avec le constat communal.' },
      { name: 'Espace citoyen', description: 'Horaires de collecte, annonces et carte publique des signalements (TDR §3.3).' },
      { name: 'Flux occasionnels', description: 'Déchets verts, déchets de démolition et construction (DDC) et encombrants : demandes d’enlèvement et collecteurs agréés ANGeD.' },
      { name: 'Observatoire national', description: 'Portail FNCT : déploiement et comparaison entre territoires.' },
      { name: 'Fichiers', description: "Photos et documents déposés : preuve de traitement d'une réclamation, photo de signalement, constat de terrain, documents de projet, rapports et études. Type déduit des octets, métadonnées EXIF retirées au dépôt." },
      { name: 'Rapports et études', description: "Métadonnées des rapports et études d'une commune (TDR §3.2.9) : titre, catégorie, auteur déclaré, date. Le fichier lui-même est déposé par POST /fichiers. Versionnement : une nouvelle version ne remplace jamais la précédente." },
      { name: 'Maintenance', description: "GMAO (TDR §3.2.2, Jalon 5) : carnet d'entretien des engins, plans d'entretien périodique et échéances calculées depuis la dernière intervention. Commune et FNCT seulement." },
      { name: 'Points : champs libres et actions', description: "Tableau attributaire des points de collecte (TDR §3.2.3, Jalon 6) : champs libres définis par la commune, étiquettes, actions planifiées sur une sélection et leur avancement. Filtrage et export par GET /circuits/points." },
      { name: 'Registres et lieux', description: "Lieux (marchés, cimetières, abattoirs…), pleins de carburant, fins de poste, dotations EPI, incidents du travail, commerces et conventions : les registres qui font mesurer par la plateforme ce que la fiche d’évaluation faisait déclarer." },
      { name: 'Contacts', description: "Annuaire de travail d'une commune (TDR §3.2.7) : interlocuteurs externes sans compte sur la plateforme. Lecture réservée à la commune et à la FNCT." },
      { name: 'Supervision', description: "État de santé de l'API." },
    ],
  });
}
