// Client HTTP vers l'API SIIPI.
//
// Les types des réponses sont générés depuis le contrat OpenAPI servi par
// l'API (npm run types:api) : un champ renommé côté serveur casse la
// compilation du front-end au lieu de produire une page blanche à l'exécution.

import type { paths } from './api-types';

// Toutes les requêtes passent par /api, sur l'origine de la page : le serveur
// de développement (vite.config.ts) et le reverse proxy de production y font
// tous deux suivre vers l'API. Le navigateur n'a donc jamais à franchir une
// frontière d'origine — ce qui supprime CORS en développement et évite les
// blocages de requêtes vers un autre port de localhost.
const BASE = import.meta.env.VITE_API_URL || '/api';
const CLE_JETON = 'siipi.jeton';

export class ErreurApi extends Error {
  constructor(
    public readonly statut: number,
    message: string
  ) {
    super(message);
    this.name = 'ErreurApi';
  }
}

export function lireJeton(): string | null {
  try {
    return window.localStorage.getItem(CLE_JETON);
  } catch {
    return null;
  }
}

export function ecrireJeton(jeton: string | null): void {
  try {
    if (jeton) window.localStorage.setItem(CLE_JETON, jeton);
    else window.localStorage.removeItem(CLE_JETON);
  } catch {
    // Sans stockage, la session ne survit pas au rechargement.
  }
}

async function requete<T>(chemin: string, options: RequestInit = {}): Promise<T> {
  const jeton = lireJeton();
  const entetes: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (jeton) entetes.Authorization = `Bearer ${jeton}`;

  let reponse: Response;
  try {
    reponse = await fetch(`${BASE}${chemin}`, { ...options, headers: entetes });
  } catch {
    throw new ErreurApi(0, "Le serveur est injoignable. Vérifiez que l'API est démarrée.");
  }

  if (!reponse.ok) {
    let message = `Erreur ${reponse.status}`;
    try {
      const corps = await reponse.json();
      if (corps?.error) message = corps.error;
    } catch {
      /* réponse non JSON */
    }
    throw new ErreurApi(reponse.status, message);
  }

  if (reponse.status === 204) return undefined as T;
  return (await reponse.json()) as T;
}

type Reponse<C extends keyof paths, M extends keyof paths[C]> = paths[C][M] extends {
  responses: { 200: { content: { 'application/json': infer R } } };
}
  ? R
  : never;

/**
 * Comme ci-dessus, pour une route qui CRÉE : sa réponse porte 201, non 200.
 * Deux aides plutôt qu'une seule qui accepterait les deux : un dépôt qui se
 * mettrait à répondre 200 serait un changement de contrat, et il doit casser
 * la compilation plutôt que passer inaperçu.
 */
type ReponseCreee<C extends keyof paths, M extends keyof paths[C]> = paths[C][M] extends {
  responses: { 201: { content: { 'application/json': infer R } } };
}
  ? R
  : never;

/**
 * Le CORPS attendu par une route, tel que le contrat le décrit.
 *
 * Les entrées de ce client prennent historiquement un `Record<string, unknown>`
 * : le contrat protège alors ce qui revient de l'API, mais rien de ce qu'on lui
 * envoie. Un champ mal orthographié part sans bruit, l'API l'ignore, et la
 * donnée manque en base sans qu'aucune erreur n'apparaisse nulle part.
 *
 * À employer pour les nouvelles entrées, et à étendre aux anciennes au fil des
 * passages.
 */
type Corps<C extends keyof paths, M extends keyof paths[C]> = paths[C][M] extends {
  requestBody: { content: { 'application/json': infer B } };
}
  ? B
  : never;

export type Utilisateur = Reponse<'/auth/me', 'get'>;
export type LigneGouvernorat = Reponse<'/observatoire/gouvernorats', 'get'>[number];
export type StatutCommune = Reponse<'/observatoire/deploiement', 'get'>[number];

// --- Espace citoyen --------------------------------------------------------
export type AdresseCitoyen = Reponse<'/citoyen/adresse', 'get'>;
export type HoraireCollecte = Reponse<'/citoyen/horaires', 'get'>[number];
export type AnnonceCollecte = Reponse<'/citoyen/annonces', 'get'>[number];
export type PointCarte = Reponse<'/citoyen/carte', 'get'>[number];
export type CollecteurAgree = Reponse<'/enlevements/collecteurs', 'get'>[number];

// --- Espace communal -------------------------------------------------------
export type Circuit = Reponse<'/circuits', 'get'>[number];
export type Compte = Reponse<'/comptes', 'get'>[number];
export type Vehicule = Reponse<'/trucks', 'get'>[number];
export type EtatDuParc = Reponse<'/trucks/etat', 'get'>;
export type Agent = Reponse<'/personnel', 'get'>[number];
export type LigneEffectif = Reponse<'/personnel/effectif', 'get'>[number];
export type EquipeDuJour = Reponse<'/personnel/equipes', 'get'>[number];
export type FichierDepose = ReponseCreee<'/fichiers', 'post'>;
export type CoutService = Reponse<'/personnel/cout', 'get'>[number];
export type LignePresence = Reponse<'/personnel/presences', 'get'>[number];
export type Publication = Reponse<'/communication', 'get'>[number];
export type Destinataires = Reponse<'/communication/apercu', 'get'>;
export type SondageQuestion = Reponse<'/communication/{id}/questions', 'get'>[number];
export type LigneDepouillement = Reponse<'/communication/{id}/depouillement', 'get'>[number];
export type EnvoiNotification = Reponse<'/communication/envois', 'get'>[number];
export type Pesee = Reponse<'/pesees', 'get'>[number];
export type PeseeAttendue = Reponse<'/pesees/attendues', 'get'>[number];
export type TonnageCircuit = Reponse<'/pesees/tonnages', 'get'>[number];
export type TonnageMensuel = Reponse<'/pesees/mensuel', 'get'>[number];
export type Incoherence = Reponse<'/communes/{id}/coherence', 'get'>[number];
export type ControleTerrain = Reponse<'/circuits/controles', 'get'>[number];
export type PerformancePrestataire = Reponse<'/circuits/performance', 'get'>[number];
export type LigneConfrontation = Reponse<'/passages/confrontation', 'get'>[number];
export type IncidentPrestataire = Reponse<'/passages/incidents', 'get'>[number];
export type Reclamation = Reponse<'/tickets', 'get'>[number];

// --- Découpage communal ----------------------------------------------------
export interface FrontiereCommune {
  id: string;
  name: string;
  nameAr: string | null;
  gouvernorat: string;
  codeMunicipalite: number | null;
  population: number;
  areaKm2: number | null;
  isPilot: boolean;
  source: 'officiel' | 'osm' | 'corrige_fnct' | null;
}

export interface CollectionFrontieres {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: FrontiereCommune;
    geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
  }>;
}

// --- Espace prestataire ----------------------------------------------------
export type DeclarationPassage = Reponse<'/passages', 'get'>[number];
export type Contrat = Reponse<'/passages/mes-contrats', 'get'>[number];

export interface SaisiePassage {
  circuitId: string;
  datePassage?: string;
  statut: 'effectue' | 'partiel' | 'impossible';
  modeSaisie?: 'terrain' | 'bureau';
  lat?: number;
  lng?: number;
  positionSource?: 'appareil' | 'saisie' | 'absente';
  remarque?: string;
}

export type EtatControle = 'fait' | 'partiel' | 'non_fait';

export interface SaisieCircuit {
  communeId: string;
  nom: string;
  code?: string;
  prestataireId?: string | null;
  joursPassage: number[];
  typeDechet?: string;
  // AAAA-MM-JJ. Absente, la base retient aujourd'hui.
  dateDebut?: string;
  dateFin?: string | null;
  modeCollecte?: 'porte_a_porte' | 'conteneurs' | 'mixte';
  voyagesParJour?: number;
  dureePrevueMinutes?: number;
  longueurDeclareeKm?: number;
  tailleEquipe?: number;
}

export interface PointCollecte {
  id: string;
  circuit_id: string;
  voyage: number;
  ordre: number;
  nom: string | null;
  type: string;
  lat: number;
  lng: number;
  precision_m: number | null;
  heure_observee: string | null;
  heure_estimee: string | null;
  observation: string | null;
  source: 'import_kml' | 'saisie';
}

export interface ApercuImport {
  fichier: string;
  /** Ce qui a été demandé : l'itinéraire, les arrêts, ou tout. */
  cible: 'auto' | 'trace' | 'points';
  /** Ce qui sera réellement posé, une fois la demande croisée au contenu. */
  poseraPoints: boolean;
  poseraTrace: boolean;
  famille: 'waypoints' | 'trace_gps' | 'itineraire_dessine' | 'gpx' | 'geojson' | 'inconnu';
  nomReleve: string | null;
  nbPoints: number;
  nbVoyages: number;
  nbSommetsTrace: number;
  statistiques: Record<string, string>;
  avertissements: string[];
  points: {
    voyage: number;
    ordre: number;
    nom: string | null;
    type: string;
    lat: number;
    lng: number;
    precisionM: number | null;
    heureObservee: string | null;
  }[];
  ecrit: boolean;
  crees?: number;
  remplaces?: number;
}
export type DemandeEnlevement = Reponse<'/enlevements', 'get'>[number];
export type TypeDechetOccasionnel = 'vert' | 'ddc' | 'encombrant' | 'metal' | 'autre';

export interface SaisieDemande {
  typeDechet: TypeDechetOccasionnel;
  volumeM3?: number | null;
  description?: string | null;
  adresse?: string | null;
  lat?: number | null;
  lng?: number | null;
  acces?: 'rue' | 'cour' | 'etage' | 'difficile' | null;
  dateSouhaitee?: string | null;
}
export type Commune = {
  id: string;
  name: string;
  name_ar?: string | null;
  governorate?: string | null;
};

export interface SaisieAdresse {
  communeId: string;
  adresse: string;
  lat?: number;
  lng?: number;
}

export interface SaisieSignalement {
  communeId: string;
  category: string;
  title: string;
  description?: string;
  lat?: number;
  lng?: number;
  photoUrl?: string;
}

/**
 * Les octets d'un fichier déposé, en objet-URL affichable.
 *
 * POURQUOI PASSER PAR UN FETCH plutôt que de poser l'adresse dans un
 * `<img src>`. La lecture d'un fichier exige un jeton, et une balise `img`
 * n'en transmet aucun. La parade courante — glisser le jeton dans l'URL —
 * l'inscrirait dans les journaux du serveur, dans l'historique du navigateur
 * et dans l'en-tête « Referer » de toute page visitée ensuite. Un jeton qui
 * ouvre l'ensemble du portail municipal n'a rien à faire dans une adresse.
 *
 * L'objet-URL rendu ici DOIT être libéré par l'appelant (URL.revokeObjectURL)
 * quand il ne sert plus : sans cela, une liste de réclamations parcourue
 * pendant une heure retient en mémoire toutes les photos affichées.
 */
export async function lireOctetsFichier(chemin: string): Promise<string> {
  const jeton = lireJeton();
  const reponse = await fetch(`${BASE}${chemin}`, {
    headers: jeton ? { Authorization: `Bearer ${jeton}` } : {},
  });
  if (!reponse.ok) {
    throw new ErreurApi(
      reponse.status,
      reponse.status === 404
        ? "Ce fichier est introuvable, ou hors de votre périmètre."
        : `Erreur ${reponse.status}`
    );
  }
  return URL.createObjectURL(await reponse.blob());
}

/** Un fichier choisi à l'écran, prêt à être posté : nom et contenu en base64. */
export function lireFichierLocal(f: File): Promise<{ nomFichier: string; contenu: string }> {
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onerror = () => rejeter(new ErreurApi(0, 'Le fichier n’a pas pu être lu.'));
    lecteur.onload = () => {
      const brut = String(lecteur.result ?? '');
      // FileReader rend « data:<type>;base64,<contenu> ». Le type annoncé est
      // laissé de côté : c'est l'API qui décide, d'après les octets.
      resoudre({ nomFichier: f.name, contenu: brut.slice(brut.indexOf(',') + 1) });
    };
    lecteur.readAsDataURL(f);
  });
}

export const api = {
  connexion: (email: string, motDePasse: string) =>
    requete<{ token: string; user: Utilisateur }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: motDePasse }),
    }),
  moi: () => requete<Utilisateur>('/auth/me'),
  gouvernorats: () => requete<LigneGouvernorat[]>('/observatoire/gouvernorats'),
  deploiement: () => requete<StatutCommune[]>('/observatoire/deploiement'),

  // --- Espace citoyen ------------------------------------------------------
  communes: () => requete<Commune[]>('/communes'),

  // --- Comptes et accès ----------------------------------------------------
  comptes: (communeId?: string) =>
    requete<Compte[]>(`/comptes${communeId ? `?communeId=${encodeURIComponent(communeId)}` : ''}`),
  creerCompte: (saisie: {
    email: string;
    fullName: string;
    role: string;
    communeId?: string;
    phone?: string;
  }) =>
    // La réponse porte le mot de passe provisoire : c'est la SEULE fois qu'il
    // apparaît, il n'est stocké nulle part en clair.
    requete<Compte & { motDePasseProvisoire: string }>('/comptes', {
      method: 'POST',
      body: JSON.stringify(saisie),
    }),
  modifierCompte: (id: string, saisie: Record<string, unknown>) =>
    requete<Compte>(`/comptes/${id}`, { method: 'PATCH', body: JSON.stringify(saisie) }),
  reinitialiserMotDePasse: (id: string) =>
    requete<{ id: string; full_name: string; motDePasseProvisoire: string }>(
      `/comptes/${id}/mot-de-passe`,
      { method: 'POST', body: JSON.stringify({}) }
    ),
  changerMonMotDePasse: (saisie: { motDePasseActuel: string; nouveauMotDePasse: string }) =>
    requete<void>('/comptes/moi/mot-de-passe', { method: 'POST', body: JSON.stringify(saisie) }),
  monAdresse: () => requete<AdresseCitoyen>('/citoyen/adresse'),
  enregistrerAdresse: (saisie: SaisieAdresse) =>
    requete<AdresseCitoyen>('/citoyen/adresse', {
      method: 'POST',
      body: JSON.stringify(saisie),
    }),
  horaires: () => requete<HoraireCollecte[]>('/citoyen/horaires'),
  annonces: (communeId: string) =>
    requete<AnnonceCollecte[]>(`/citoyen/annonces?communeId=${encodeURIComponent(communeId)}`),
  // La carte publique est la seule lecture ouverte sans compte : elle
  // fonctionne donc aussi avant la connexion, et c'est volontaire — on peut
  // regarder ce que devient un signalement avant de décider d'en déposer un.
  cartePublique: (communeId?: string) =>
    requete<PointCarte[]>(
      `/citoyen/carte${communeId ? `?communeId=${encodeURIComponent(communeId)}` : ''}`
    ),
  signaler: (saisie: SaisieSignalement) =>
    requete<{ id: string; ticket_number: string }>('/tickets', {
      method: 'POST',
      body: JSON.stringify(saisie),
    }),
  mesSignalements: () => requete<any[]>('/tickets'),

  // --- Flux occasionnels : déchets verts, DDC, encombrants -------------
  collecteurs: (communeId: string, type?: string) =>
    requete<CollecteurAgree[]>(
      `/enlevements/collecteurs?communeId=${encodeURIComponent(communeId)}` +
        (type ? `&type=${encodeURIComponent(type)}` : '')
    ),
  mesDemandes: () => requete<DemandeEnlevement[]>('/enlevements'),
  demanderEnlevement: (saisie: SaisieDemande) =>
    requete<DemandeEnlevement>('/enlevements', { method: 'POST', body: JSON.stringify(saisie) }),

  // --- Espace communal -----------------------------------------------------
  // Comptes prestataires sous contrat avec cette commune, pour confier un
  // circuit. Une liste vide signifie « régie communale uniquement », ce qui
  // est le cas de la plupart des communes.
  prestataires: (communeId: string) =>
    requete<{ id: string; full_name: string; email: string }[]>(
      `/communes/${encodeURIComponent(communeId)}/prestataires`
    ),
  circuits: (communeId: string) =>
    requete<Circuit[]>(`/circuits?communeId=${encodeURIComponent(communeId)}`),
  creerCircuit: (saisie: SaisieCircuit) =>
    requete<Circuit>('/circuits', { method: 'POST', body: JSON.stringify(saisie) }),
  modifierCircuit: (id: string, saisie: Partial<SaisieCircuit>) =>
    requete<Circuit>(`/circuits/${id}`, { method: 'PATCH', body: JSON.stringify(saisie) }),
  supprimerCircuit: (id: string) => requete<void>(`/circuits/${id}`, { method: 'DELETE' }),

  // --- Points de collecte --------------------------------------------------
  pointsCollecte: (circuitId: string) =>
    requete<PointCollecte[]>(`/circuits/${circuitId}/points`),
  // Tous les arrêts d'une commune, tous circuits confondus : c'est la vue de
  // la carte communale, celle qui montre ce qui est desservi et ce qui ne
  // l'est pas.
  pointsCommune: (communeId: string) =>
    requete<(PointCollecte & { circuit_nom: string | null })[]>(
      `/circuits/points?communeId=${encodeURIComponent(communeId)}`
    ),
  ajouterPoint: (
    circuitId: string,
    saisie: { nom?: string; type?: string; lat: number; lng: number; voyage?: number; heureEstimee?: string }
  ) => requete<PointCollecte>(`/circuits/${circuitId}/points`, { method: 'POST', body: JSON.stringify(saisie) }),
  modifierPoint: (circuitId: string, pointId: string, saisie: Record<string, unknown>) =>
    requete<PointCollecte>(`/circuits/${circuitId}/points/${pointId}`, {
      method: 'PATCH',
      body: JSON.stringify(saisie),
    }),
  supprimerPoint: (circuitId: string, pointId: string) =>
    requete<void>(`/circuits/${circuitId}/points/${pointId}`, { method: 'DELETE' }),

  // Import d'un relevé. « valider » à false ne touche à rien : c'est l'aperçu.
  // Défaire un import. Les arrêts partent en suppression logique — un point
  // retiré aujourd'hui doit rester lisible dans un contrôle terrain d'il y a
  // trois semaines. Seule la provenance est réellement remise à zéro.
  supprimerTrace: (circuitId: string) =>
    requete<void>(`/circuits/${encodeURIComponent(circuitId)}/trace`, { method: 'DELETE' }),
  supprimerPoints: (circuitId: string) =>
    requete<{ retires: number }>(`/circuits/${encodeURIComponent(circuitId)}/points`, {
      method: 'DELETE',
    }),
  importerKml: (
    circuitId: string,
    saisie: {
      nomFichier: string;
      contenu: string;
      valider?: boolean;
      remplacer?: boolean;
      cible?: 'auto' | 'trace' | 'points';
    }
  ) =>
    requete<ApercuImport>(`/circuits/${circuitId}/import-kml`, {
      method: 'POST',
      body: JSON.stringify(saisie),
    }),

  historiqueCircuit: (circuitId: string) =>
    requete<
      {
        operation: string;
        changed_at: string;
        changed_by_role: string | null;
        changed_fields: string[] | null;
        old_data: Record<string, unknown> | null;
        new_data: Record<string, unknown> | null;
      }[]
    >(`/circuits/${circuitId}/historique`),

  controles: (communeId: string, depuis?: string) =>
    requete<ControleTerrain[]>(
      `/circuits/controles?communeId=${encodeURIComponent(communeId)}` +
        (depuis ? `&depuis=${depuis}` : '')
    ),
  enregistrerControle: (saisie: {
    circuitId: string;
    dateControle?: string;
    etat: EtatControle;
    remarque?: string;
  }) =>
    requete<ControleTerrain>('/circuits/controles', {
      method: 'POST',
      body: JSON.stringify(saisie),
    }),

  performance: (communeId: string, depuis: string, jusqua: string) =>
    requete<PerformancePrestataire[]>(
      `/circuits/performance?communeId=${encodeURIComponent(communeId)}&depuis=${depuis}&jusqua=${jusqua}`
    ),
  confrontation: (communeId: string, depuis: string, jusqua: string) =>
    requete<LigneConfrontation[]>(
      `/passages/confrontation?communeId=${encodeURIComponent(communeId)}&depuis=${depuis}&jusqua=${jusqua}`
    ),
  incidents: (communeId: string, statut?: string) =>
    requete<IncidentPrestataire[]>(
      `/passages/incidents?communeId=${encodeURIComponent(communeId)}` +
        (statut ? `&statut=${statut}` : '')
    ),
  repondreIncident: (id: string, statut: 'pris_en_compte' | 'clos', reponseCommune?: string) =>
    requete<IncidentPrestataire>(`/passages/incidents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ statut, reponseCommune }),
    }),

  reclamations: (communeId: string) =>
    requete<Reclamation[]>(`/tickets?communeId=${encodeURIComponent(communeId)}`),
  accepterReclamation: (id: string) =>
    requete<Reclamation>(`/tickets/${id}/accept`, { method: 'PATCH' }),
  refuserReclamation: (id: string, reason: string) =>
    requete<Reclamation>(`/tickets/${id}/refuse`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }),
  // La photo « après traitement » est facultative : il y a des traitements qui
  // ne se photographient pas. Quand elle est là, c'est l'API qui l'ouvre
  // ensuite au citoyen concerné — elle seule sait à quelle réclamation elle se
  // rattache, donc à qui l'ouvrir.
  traiterReclamation: (id: string, status: 'en_cours' | 'resolu', resolvedPhotoUrl?: string) =>
    requete<Reclamation>(`/tickets/${id}/treat`, {
      method: 'PATCH',
      body: JSON.stringify(resolvedPhotoUrl ? { status, resolvedPhotoUrl } : { status }),
    }),
  publierPhoto: (id: string, photoPublique: boolean) =>
    requete<unknown>(`/citoyen/signalements/${id}/photo`, {
      method: 'PATCH',
      body: JSON.stringify({ photoPublique }),
    }),

  // --- Espace prestataire --------------------------------------------------
  // Aucune commune n'est passée en paramètre : un prestataire peut travailler
  // pour plusieurs communes, et c'est le cloisonnement en base qui décide de
  // ce qu'il voit. Filtrer ici sur sa commune principale lui cacherait ses
  // autres contrats.
  mesCircuits: () => requete<Circuit[]>('/circuits'),
  mesPassages: (depuis?: string) =>
    requete<DeclarationPassage[]>(`/passages${depuis ? `?depuis=${depuis}` : ''}`),
  declarerPassage: (saisie: SaisiePassage) =>
    requete<DeclarationPassage>('/passages', { method: 'POST', body: JSON.stringify(saisie) }),
  mesIncidents: () => requete<IncidentPrestataire[]>('/passages/incidents'),
  signalerIncident: (saisie: {
    communeId: string;
    circuitId?: string | null;
    type: string;
    description?: string;
  }) =>
    requete<IncidentPrestataire>('/passages/incidents', {
      method: 'POST',
      body: JSON.stringify(saisie),
    }),
  mesContrats: () => requete<Contrat[]>('/passages/mes-contrats'),
  maConfrontation: (depuis: string, jusqua: string) =>
    requete<LigneConfrontation[]>(`/passages/confrontation?depuis=${depuis}&jusqua=${jusqua}`),

  // --- Découpage communal --------------------------------------------------
  // La tolérance est exprimée en degrés et simplifie le tracé côté serveur.
  // 0 rend la limite exacte : à réserver à l'édition et aux exports, car les
  // 349 tracés pleine résolution pèsent une vingtaine de méga-octets.
  frontieres: (communes?: string[], tolerance = 0.001) =>
    requete<CollectionFrontieres>(
      `/communes/boundaries?tolerance=${tolerance}` +
        (communes?.length ? `&communes=${encodeURIComponent(communes.join(','))}` : '')
    ),
  conteneurs: (communeId: string) =>
    requete<any[]>(`/containers?communeId=${encodeURIComponent(communeId)}`),
  engins: (communeId: string) =>
    requete<Vehicule[]>(`/trucks?communeId=${encodeURIComponent(communeId)}`),
  // Écarts entre le registre des circuits et l'inventaire du parc.
  coherence: (communeId: string) =>
    requete<Incoherence[]>(`/communes/${encodeURIComponent(communeId)}/coherence`),
  etatDuParc: (communeId: string) =>
    requete<EtatDuParc>(`/trucks/etat?communeId=${encodeURIComponent(communeId)}`),
  creerEngin: (communeId: string, saisie: Record<string, unknown>) =>
    requete<Vehicule>(`/trucks?communeId=${encodeURIComponent(communeId)}`, {
      method: 'POST',
      body: JSON.stringify(saisie),
    }),
  modifierEngin: (id: string, saisie: Record<string, unknown>) =>
    requete<Vehicule>(`/trucks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(saisie),
    }),
  // À ne pas confondre avec « réformer » : réformé est un ÉTAT du parc, qui se
  // déclare. Ceci retire du registre la ligne saisie par erreur.
  retirerEngin: (id: string) =>
    requete<void>(`/trucks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  // --- Module 4 : personnel -------------------------------------------------
  //
  // Aucune de ces routes ne rend un salaire individuel ni une donnée de santé :
  // la base n'en porte pas. Le coût existe au niveau du service et de l'année.
  personnel: (communeId: string) =>
    requete<Agent[]>(`/personnel?communeId=${encodeURIComponent(communeId)}`),
  effectif: (communeId: string) =>
    requete<LigneEffectif[]>(`/personnel/effectif?communeId=${encodeURIComponent(communeId)}`),
  equipesDuJour: (communeId: string, jour?: string) =>
    requete<EquipeDuJour[]>(
      `/personnel/equipes?communeId=${encodeURIComponent(communeId)}` +
        (jour ? `&jour=${encodeURIComponent(jour)}` : '')
    ),
  coutService: (communeId: string) =>
    requete<CoutService[]>(`/personnel/cout?communeId=${encodeURIComponent(communeId)}`),
  presences: (communeId: string, jour?: string) =>
    requete<LignePresence[]>(
      `/personnel/presences?communeId=${encodeURIComponent(communeId)}` +
        (jour ? `&jour=${encodeURIComponent(jour)}` : '')
    ),
  pointer: (lignes: Record<string, unknown> | Record<string, unknown>[]) =>
    requete<unknown>('/personnel/presences', { method: 'PUT', body: JSON.stringify(lignes) }),
  creerAgent: (communeId: string, saisie: Record<string, unknown>) =>
    requete<Agent>(`/personnel?communeId=${encodeURIComponent(communeId)}`, {
      method: 'POST',
      body: JSON.stringify(saisie),
    }),
  modifierAgent: (id: string, saisie: Record<string, unknown>) =>
    requete<Agent>(`/personnel/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(saisie),
    }),
  affecterAgent: (id: string, saisie: Record<string, unknown>) =>
    requete<unknown>(`/personnel/${encodeURIComponent(id)}/affectations`, {
      method: 'POST',
      body: JSON.stringify(saisie),
    }),
  retirerAgent: (id: string) =>
    requete<void>(`/personnel/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  cloreAffectation: (id: string, affectationId: string, dateFin: string) =>
    requete<unknown>(
      `/personnel/${encodeURIComponent(id)}/affectations/${encodeURIComponent(affectationId)}`,
      { method: 'PATCH', body: JSON.stringify({ dateFin }) }
    ),
  declarerEffectif: (communeId: string, saisie: Record<string, unknown>) =>
    requete<unknown>(`/personnel/effectifs?communeId=${encodeURIComponent(communeId)}`, {
      method: 'PUT',
      body: JSON.stringify(saisie),
    }),

  // --- Fichiers déposés ------------------------------------------------------
  //
  // Le fichier voyage en base64, comme le relevé KML du module 2.
  deposerFichier: (communeId: string, saisie: Corps<'/fichiers', 'post'>) =>
    requete<FichierDepose>(`/fichiers?communeId=${encodeURIComponent(communeId)}`, {
      method: 'POST',
      body: JSON.stringify(saisie),
    }),
  retirerFichier: (id: string) =>
    requete<void>(`/fichiers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  visibiliteFichier: (id: string, saisie: Record<string, unknown>) =>
    requete<unknown>(`/fichiers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(saisie),
    }),

  // --- Module 5 : communication ciblée ---------------------------------------
  //
  // Aucune de ces routes ne rend la liste des citoyens d'un périmètre : elles
  // en rendent le nombre. La différence entre les deux est celle entre un
  // outil de ciblage et un fichier de destinataires.
  publications: (communeId: string, type?: string) =>
    requete<Publication[]>(
      `/communication?communeId=${encodeURIComponent(communeId)}` +
        (type ? `&type=${encodeURIComponent(type)}` : '')
    ),
  // L'aperçu AVANT d'écrire quoi que ce soit : combien de foyers ce périmètre
  // touche, et surtout combien il rate faute d'adresse renseignée.
  apercuDestinataires: (
    communeId: string,
    p: { perimetreType: string; zoneIds?: string[]; circuitIds?: string[]; cibleTypes?: string[] }
  ) => {
    const q = new URLSearchParams({ communeId, perimetreType: p.perimetreType });
    if (p.zoneIds?.length) q.set('zoneIds', p.zoneIds.join(','));
    if (p.circuitIds?.length) q.set('circuitIds', p.circuitIds.join(','));
    if (p.cibleTypes?.length) q.set('cibleTypes', p.cibleTypes.join(','));
    return requete<Destinataires>(`/communication/apercu?${q.toString()}`);
  },
  envois: (communeId: string) =>
    requete<EnvoiNotification[]>(`/communication/envois?communeId=${encodeURIComponent(communeId)}`),
  coherenceCommunication: (communeId: string) =>
    requete<Incoherence[]>(`/communication/coherence?communeId=${encodeURIComponent(communeId)}`),
  creerPublication: (communeId: string, saisie: Record<string, unknown>) =>
    requete<Publication>(`/communication?communeId=${encodeURIComponent(communeId)}`, {
      method: 'POST',
      body: JSON.stringify(saisie),
    }),
  modifierPublication: (id: string, saisie: Record<string, unknown>) =>
    requete<Publication>(`/communication/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(saisie),
    }),
  publierPublication: (id: string, statut = 'publiee') =>
    requete<Publication>(`/communication/${encodeURIComponent(id)}/publier`, {
      method: 'POST',
      body: JSON.stringify({ statut }),
    }),
  envoyerPublication: (id: string, canal = 'push') =>
    requete<EnvoiNotification>(`/communication/${encodeURIComponent(id)}/envoyer`, {
      method: 'POST',
      body: JSON.stringify({ canal }),
    }),
  questionsSondage: (id: string) =>
    requete<SondageQuestion[]>(`/communication/${encodeURIComponent(id)}/questions`),
  enregistrerQuestions: (id: string, questions: Record<string, unknown>[]) =>
    requete<SondageQuestion[]>(`/communication/${encodeURIComponent(id)}/questions`, {
      method: 'PUT',
      body: JSON.stringify(questions),
    }),
  depouillement: (id: string) =>
    requete<LigneDepouillement[]>(`/communication/${encodeURIComponent(id)}/depouillement`),

  // --- Rubrique 4 : pesées et traçabilité, saisie communale -------------------
  //
  // Pas d'import ANGeD : l'interopérabilité avec leur plateforme n'est pas
  // possible aujourd'hui. Le registre est bâti pour les accueillir le jour venu.
  pesees: (communeId: string, p?: { depuis?: string; jusqua?: string; circuitId?: string }) => {
    const q = new URLSearchParams({ communeId });
    if (p?.depuis) q.set('depuis', p.depuis);
    if (p?.jusqua) q.set('jusqua', p.jusqua);
    if (p?.circuitId) q.set('circuitId', p.circuitId);
    return requete<Pesee[]>(`/pesees?${q.toString()}`);
  },
  // Les voyages ATTENDUS, avec la pesée en face quand elle existe : c'est ce
  // qui manque qu'il faut montrer, pas ce qui est déjà fait.
  peseesAttendues: (communeId: string, jour?: string) =>
    requete<PeseeAttendue[]>(
      `/pesees/attendues?communeId=${encodeURIComponent(communeId)}` +
        (jour ? `&jour=${encodeURIComponent(jour)}` : '')
    ),
  tonnages: (communeId: string, depuis?: string, jusqua?: string) => {
    const q = new URLSearchParams({ communeId });
    if (depuis) q.set('depuis', depuis);
    if (jusqua) q.set('jusqua', jusqua);
    return requete<TonnageCircuit[]>(`/pesees/tonnages?${q.toString()}`);
  },
  tonnageMensuel: (communeId: string, annee?: number) =>
    requete<TonnageMensuel[]>(
      `/pesees/mensuel?communeId=${encodeURIComponent(communeId)}` + (annee ? `&annee=${annee}` : '')
    ),
  coherencePesees: (communeId: string) =>
    requete<Incoherence[]>(`/pesees/coherence?communeId=${encodeURIComponent(communeId)}`),
  creerPesee: (communeId: string, saisie: Record<string, unknown>) =>
    requete<Pesee>(`/pesees?communeId=${encodeURIComponent(communeId)}`, {
      method: 'POST',
      body: JSON.stringify(saisie),
    }),
  modifierPesee: (id: string, saisie: Record<string, unknown>) =>
    requete<Pesee>(`/pesees/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(saisie) }),
  annulerPesee: (id: string) => requete<void>(`/pesees/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  zones: (communeId: string) => requete<any[]>(`/zones?communeId=${encodeURIComponent(communeId)}`),

  enregistrerFrontiere: (communeId: string, geometry: unknown) =>
    requete<unknown>(`/communes/${communeId}/frontiere`, {
      method: 'PUT',
      body: JSON.stringify({ geometry }),
    }),

  creerAnnonce: (saisie: Record<string, unknown>) =>
    requete<AnnonceCollecte>('/citoyen/annonces', { method: 'POST', body: JSON.stringify(saisie) }),
  supprimerAnnonce: (id: string) => requete<void>(`/citoyen/annonces/${id}`, { method: 'DELETE' }),
};
