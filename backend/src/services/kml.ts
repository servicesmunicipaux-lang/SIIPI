// ---------------------------------------------------------------------------
// Lecture des fichiers KML/KMZ de relevé terrain.
//
// Écrit APRÈS examen des 27 fichiers de Dar Chaabane El Fehri, et non sur une
// hypothèse : les trois familles ci-dessous sont celles réellement produites
// par la commune en avril et mai 2024. Un parseur écrit à l'avance aurait
// manqué les deux pièges décrits plus bas.
//
//   A. WAYPOINTS — application « GPS Waypoints ».
//      <Folder><name>Waypoints</name>, un <Placemark> par arrêt, avec
//      <Point>, <TimeStamp><when> et un <ExtendedData> portant accuracy,
//      provider et surtout « tags » : le vocabulaire métier saisi par l'agent
//      (« porte à porte », « point de collecte », « début collecte »,
//      « fin collecte », « point noir », « centre de transfert »,
//      « hors conteneur », « parc municipal »).
//      → ce sont les POINTS DE COLLECTE.
//
//   B. MY TRACKS (Daniel Qin) — <gx:Track> de plusieurs milliers de couples
//      <when>/<gx:coord>, encadré de deux repères « Début » et « Fin », et
//      une description contenant les statistiques de la tournée.
//      → c'est le TRACÉ OBSERVÉ, et lui seul : aucun arrêt n'y est identifié.
//
//   C. KMZ dessiné à la main (Google Earth) — un <Placemark> unique avec un
//      <LineString>, nommé en arabe (« مسلك 2 »).
//      → c'est l'ITINÉRAIRE PRÉVU.
//
// PIÈGE 1 — LES FUSEAUX NE CONCORDENT PAS.
//   Les fichiers Waypoints horodatent en heure LOCALE tout en écrivant le
//   suffixe « Z », qui signifie UTC. Vérifié sur la tournée « Cité chata2 » du
//   23 mai 2024, dont les deux fichiers existent : la trace My Tracks commence
//   à 06:34:58Z (vrai UTC) et le premier waypoint porte 07:35:41Z, soit
//   3 643 secondes plus tard — une heure pleine, plus les 43 secondes qu'il a
//   fallu à l'agent pour poser son premier repère. Pris au pied de la lettre,
//   un passage relevé à 7 h 35 serait enregistré à 8 h 35 : une heure de
//   décalage sur toutes les heures de passage du pays.
//   On lit donc l'heure des waypoints comme une heure locale.
//
// PIÈGE 2 — LE FICHIER CONTIENT PLUS QUE LA TOURNÉE.
//   Le relevé commence au parc municipal et finit au centre de transfert. Les
//   repères « début collecte » et « fin collecte » délimitent la partie qui
//   est réellement de la collecte. Sans eux, on compterait le trajet de
//   desserte comme des arrêts de collecte.
// ---------------------------------------------------------------------------

import { XMLParser } from 'fast-xml-parser';
import { inflateRawSync } from 'node:zlib';
import type { JeuExport } from './export.js';
import { lireTableau, messageLecture, normaliser } from './import.js';
import { JEU_POINTS } from './jeuxExport.js';

export type TypePoint =
  | 'porte_a_porte'
  | 'point_de_collecte'
  | 'debut_collecte'
  | 'fin_collecte'
  | 'point_noir'
  | 'centre_transfert'
  | 'hors_conteneur'
  | 'parc_municipal'
  | 'autre';

export interface PointReleve {
  /** Rotation à laquelle l'arrêt appartient (1 s'il n'y en a qu'une). */
  voyage: number;
  ordre: number;
  nom: string | null;
  type: TypePoint;
  lat: number;
  lng: number;
  precisionM: number | null;
  /** Heure locale « HH:MM:SS », telle que relevée. */
  heureObservee: string | null;
  observation: string | null;
}

export interface ResultatKml {
  famille:
    | 'waypoints'
    | 'trace_gps'
    | 'itineraire_dessine'
    | 'gpx'
    | 'geojson'
    | 'csv'
    | 'multicouche'
    | 'inconnu';
  nom: string | null;
  points: PointReleve[];
  /** [lng, lat][] — tracé destiné à l'affichage seul. */
  trace: [number, number][];
  /** Ce que le fichier dit de lui-même, repris sans retouche. */
  statistiques: Record<string, string>;
  /** Ce qui a été écarté, et pourquoi. Remonté à l'écran avant validation. */
  avertissements: string[];
  /** Les couches d'un KML/KMZ (ses dossiers), pour choisir laquelle importer. */
  couches?: CoucheReleve[];
}

// ---------------------------------------------------------------------------
// LES FICHIERS À PLUSIEURS COUCHES — les exports ArcGIS (v0.15.2).
//
// Un KMZ exporté d'ArcGIS (« Layer to KML ») ne décrit pas UNE tournée : il
// porte TOUTE la base d'une étude, une couche par dossier. Celui des circuits
// existants de M'hamdia (PCGD 2026) contient les points de collecte des trois
// bennes tasseuses, les noms des cités, les dépotoirs sauvages, trois tracés
// de circuit, douze circuits de tracteur dessinés en SURFACES, la zone non
// couverte et la limite de la commune. Lu d'un bloc, il rendait 125 « arrêts »
// (points de collecte, noms de cités et dépotoirs mêlés) et UN tracé fait des
// trois circuits mis bout à bout.
//
// Les attributs d'une entité n'y sont pas dans <ExtendedData> mais dans un
// TABLEAU HTML de sa <description> (« Circuit | Circuit Benne Taseuse 01 »).
//
// On lit donc les couches, on les décrit, et on laisse CHOISIR : la couche à
// importer, et au besoin un filtre sur un attribut — les points d'un seul
// circuit. Un fichier qui n'a qu'une couche de points et qu'une couche de
// lignes (un relevé terrain, un fichier exporté par SIIPI) se lit comme avant.
// ---------------------------------------------------------------------------

export interface CoucheReleve {
  /** Identifiant de la couche : le chemin de ses dossiers. */
  chemin: string;
  /** Le nom du dossier, tel qu'on le montre. */
  nom: string;
  points: number;
  lignes: number;
  surfaces: number;
  /** Attributs métier de la couche, avec leurs valeurs distinctes (40 au plus). */
  attributs: { nom: string; valeurs: string[]; plusDeValeurs: boolean }[];
}

export interface OptionsLecture {
  /** Chemin de la couche à importer (voir CoucheReleve.chemin). */
  couche?: string;
  /** Ne garder que les entités dont l'attribut vaut (ou commence par) la valeur. « Nom » désigne le nom de l'entité. */
  filtre?: { attribut: string; valeur: string; operateur?: 'egal' | 'commence_par' };
  /** Type donné aux points qui n'en portent aucun (une couche de dépotoirs → point noir). */
  typePoints?: TypePoint;
}

// Les champs techniques d'ArcGIS, qui ne disent rien de la tournée.
const ATTRIBUTS_TECHNIQUES = new Set(
  ['oid', 'oid_', 'fid', 'id', 'objectid', 'symbolid', 'altmode', 'base', 'snippet', 'popupinfo', 'haslabel',
    'labelid', 'folderpath', 'shape', 'shape_length', 'shape_area', 'shape_leng', 'x', 'y', 'z']
);

const nettoyerHtml = (s: string) =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** Les attributs d'une entité, d'où qu'ils viennent : ExtendedData, SchemaData, ou le tableau HTML d'ArcGIS. */
function attributsDe(pm: Record<string, unknown>): Record<string, string> {
  const a: Record<string, string> = {};
  for (const d of tousLes(pm.ExtendedData, 'Data')) {
    const k = texte(d['@name']);
    const v = texte(d.value);
    if (k && v !== null) a[k] = v;
  }
  for (const d of tousLes(pm.ExtendedData, 'SimpleData')) {
    const k = texte(d['@name']);
    const v = texte(d);
    if (k && v !== null) a[k] = v;
  }
  const desc = contenu(pm.description);
  if (desc && /<td/i.test(desc)) {
    // ArcGIS imbrique le tableau des attributs dans une cellule d'un autre
    // (dont la première ligne porte le nom de l'entité). On ne lit que les
    // tableaux les plus intérieurs, et leurs lignes à deux cellules :
    // « clé | valeur ». Lu d'un bloc, le nom de l'entité se collait à la
    // première clé (« PT_a3PP FID »).
    for (const [, corps] of desc.matchAll(/<table[^>]*>((?:(?!<table)[\s\S])*?)<\/table>/gi)) {
      for (const [, k, v] of corps.matchAll(
        /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi
      )) {
        const cle = nettoyerHtml(k);
        if (cle && !(cle in a)) a[cle] = nettoyerHtml(v);
      }
    }
  }
  return a;
}

const attributsMetier = (a: Record<string, string>) =>
  Object.entries(a).filter(([k]) => !ATTRIBUTS_TECHNIQUES.has(k.toLowerCase()) && k.toLowerCase() !== 'name');

interface ElementCouche {
  pm: Record<string, unknown>;
  chemin: string;
  nom: string;
}

/** Chaque Placemark, avec le dossier qui le contient. */
function placemarksParCouche(doc: unknown): ElementCouche[] {
  const res: ElementCouche[] = [];
  const visiter = (n: unknown, chemin: string[]) => {
    if (n === null || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach((x) => visiter(x, chemin));
    for (const [cle, val] of Object.entries(n as Record<string, unknown>)) {
      if (cle === 'Placemark') {
        for (const pm of tableau(val as unknown) as Record<string, unknown>[]) {
          res.push({ pm, chemin: chemin.join(' / '), nom: chemin[chemin.length - 1] ?? '' });
        }
      } else if (cle === 'Folder' || cle === 'Document') {
        for (const f of tableau(val as unknown) as Record<string, unknown>[]) {
          visiter(f, [...chemin, contenu(f?.name) ?? '(sans nom)']);
        }
      } else if (typeof val === 'object') {
        visiter(val, chemin);
      }
    }
  };
  visiter(doc, []);
  return res;
}

function resumerCouches(elements: ElementCouche[]): CoucheReleve[] {
  const parChemin = new Map<string, { nom: string; items: ElementCouche[] }>();
  for (const e of elements) {
    const c = parChemin.get(e.chemin) ?? { nom: e.nom, items: [] };
    c.items.push(e);
    parChemin.set(e.chemin, c);
  }
  return [...parChemin.entries()].map(([chemin, { nom, items }]) => {
    const valeurs = new Map<string, Set<string>>();
    for (const { pm } of items) {
      for (const [k, v] of attributsMetier(attributsDe(pm))) {
        if (!v) continue;
        const s = valeurs.get(k) ?? new Set<string>();
        s.add(v);
        valeurs.set(k, s);
      }
    }
    return {
      chemin,
      nom,
      points: items.filter(({ pm }) => tousLes(pm, 'Point').length > 0 && tousLes(pm, 'LineString').length === 0).length,
      lignes: items.filter(({ pm }) => tousLes(pm, 'LineString').length > 0).length,
      surfaces: items.filter(({ pm }) => tousLes(pm, 'Polygon').length > 0).length,
      attributs: [...valeurs.entries()].map(([k, s]) => ({
        nom: k,
        valeurs: [...s].sort((a, b) => a.localeCompare(b, 'fr')).slice(0, 40),
        plusDeValeurs: s.size > 40,
      })),
    };
  });
}

function retenir(e: ElementCouche, filtre: NonNullable<OptionsLecture['filtre']>): boolean {
  const a = attributsDe(e.pm);
  const v = filtre.attribut === 'Nom' ? contenu(e.pm.name) ?? '' : a[filtre.attribut] ?? '';
  return filtre.operateur === 'commence_par' ? v.startsWith(filtre.valeur) : v === filtre.valeur;
}

// Le vocabulaire des agents, tel qu'il figure dans les fichiers. La clé est
// écrite sans accent ni casse pour absorber les variantes de saisie.
const TAGS: Record<string, TypePoint> = {
  'porte a porte': 'porte_a_porte',
  'point de collecte': 'point_de_collecte',
  'debut collecte': 'debut_collecte',
  'fin collecte': 'fin_collecte',
  'point noir': 'point_noir',
  'centre de transfert': 'centre_transfert',
  // Le code de la plateforme lui-même (« centre_transfert »), tel qu'un
  // export GeoJSON ou QGIS l'écrit.
  'centre transfert': 'centre_transfert',
  'sortie centre': 'centre_transfert',
  'hors conteneur': 'hors_conteneur',
  'parc municipal': 'parc_municipal',
};

// Les soulignés et les tirets deviennent des espaces : le même type s'écrit
// « porte à porte » dans un relevé terrain et « porte_a_porte » dans un export
// QGIS, et ce sont bien deux écritures de la même chose.
const sansAccent = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

// Le vocabulaire des relevés de Djerba (mission FNCT, février-juin 2026) : les
// agents y ont compté les contenants plutôt que d'écrire « point de collecte »
// — « 3 conteneur metallique », « 2 demi-fût », « 240 L Plastique x2 »,
// « bac 120 L » — et noté le ramassage manuel (« hand picked », « sot en
// plastique ») plutôt que « porte à porte ». Un nombre en tête et un « xN » en
// queue sont retirés avant la lecture (voir reconnaitre()).
const MOTIFS: [RegExp, TypePoint][] = [
  [/^conteneurs? (metallique|plastique)s?$/, 'point_de_collecte'],
  [/^demi futs?$/, 'point_de_collecte'],
  [/^(\d+ )?l plastique$/, 'point_de_collecte'],
  [/^bacs?( \d+ l)?$/, 'point_de_collecte'],
  [/^(hand picked|sot en plastique|(debut|fin) porte a porte)$/, 'porte_a_porte'],
];

/** Le type que désigne UNE étiquette, ou null si elle ne désigne pas un type. */
function reconnaitre(tag: string): TypePoint | null {
  const s = sansAccent(tag);
  if (TAGS[s]) return TAGS[s];
  const nu = s.replace(/^\d+\s*/, '').replace(/\s*x\s*\d+$/, '');
  if (TAGS[nu]) return TAGS[nu];
  for (const [motif, type] of MOTIFS) if (motif.test(nu)) return type;
  return null;
}

// Quand un point porte plusieurs étiquettes de type, la plus parlante
// l'emporte, quel que soit l'ordre de saisie. « 4 conteneur metallique, point
// noir » est un point noir ; « 2 conteneur metallique, Hors conteneur » est un
// point de collecte dont les déchets débordent — le débordement est un ÉTAT
// du point, pas sa nature.
const PRIORITE: TypePoint[] = [
  'debut_collecte',
  'fin_collecte',
  'centre_transfert',
  'parc_municipal',
  'point_noir',
  'point_de_collecte',
  'hors_conteneur',
  'porte_a_porte',
];

/**
 * Classe un point d'après ses ÉTIQUETTES. Une étiquette présente mais inconnue
 * rend « autre » : le terrain a voulu dire quelque chose qu'on ne sait pas
 * lire, et le ranger d'office en porte-à-porte effacerait cette information.
 * Les étiquettes d'état (« CASSÉ », « vide », « dechet vert »…) ne désignent
 * pas un type : elles n'empêchent pas un point d'être reconnu.
 */
export function classer(tags: string[]): TypePoint {
  let meilleur: TypePoint | null = null;
  for (const t of tags) {
    const type = reconnaitre(t);
    if (type && (meilleur === null || PRIORITE.indexOf(type) < PRIORITE.indexOf(meilleur))) meilleur = type;
  }
  if (meilleur) return meilleur;
  return tags.length > 0 ? 'autre' : 'porte_a_porte';
}

/**
 * Classe d'après un LIBELLÉ, ce qui n'est pas la même chose.
 *
 * « WPT 86 » est un numéro d'ordre, pas une catégorie : le passer à classer()
 * rendait « autre » pour tous les points d'un fichier GPX, alors qu'aucun
 * n'était étiqueté. Un nom qui ne dit rien laisse donc le type par défaut, et
 * seul un nom qui reprend le vocabulaire du terrain — « début collecte »,
 * « point noir » — le renseigne.
 */
function classerLibelle(libelle: string | null): TypePoint {
  if (!libelle) return 'porte_a_porte';
  const normalise = sansAccent(libelle);
  for (const [terme, type] of Object.entries(TAGS)) {
    if (normalise.includes(terme)) return type;
  }
  return 'porte_a_porte';
}

const tableau = <T,>(x: T | T[] | undefined): T[] =>
  x === undefined ? [] : Array.isArray(x) ? x : [x];

/** « 10.74986597,36.46948895[,alt] » → [lng, lat] */
function coord(texte: string): [number, number] | null {
  const p = texte.trim().split(',');
  const lng = Number(p[0]);
  const lat = Number(p[1]);
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

/**
 * Heure LOCALE d'un <when> de fichier Waypoints. Le « Z » final y est un
 * artefact de l'application, pas une déclaration d'UTC (voir PIÈGE 1) : on
 * prend donc les chiffres tels qu'écrits, sans conversion.
 */
function heureLocale(when: string): string | null {
  const m = when.match(/T(\d{2}):(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}:${m[3]}` : null;
}

function texte(x: unknown): string | null {
  if (x === null || x === undefined) return null;
  if (typeof x === 'object' && '#text' in (x as Record<string, unknown>)) {
    const v = (x as Record<string, unknown>)['#text'];
    return v === null || v === undefined ? null : String(v).trim() || null;
  }
  const s = String(x).trim();
  return s || null;
}

const parseur = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  cdataPropName: '#cdata',
  textNodeName: '#text',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

/** Récupère le texte d'un nœud, que fast-xml-parser l'ait mis en CDATA ou non. */
function contenu(n: unknown): string | null {
  if (n === null || n === undefined) return null;
  if (typeof n === 'object') {
    const o = n as Record<string, unknown>;
    if ('#cdata' in o) return texte(o['#cdata']);
    if ('#text' in o) return texte(o['#text']);
    return null;
  }
  return texte(n);
}

/** Descend récursivement et ramène tous les nœuds portant ce nom. */
function tousLes(racine: unknown, nom: string): Record<string, unknown>[] {
  const trouves: Record<string, unknown>[] = [];
  const visiter = (n: unknown) => {
    if (n === null || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visiter);
    const o = n as Record<string, unknown>;
    for (const [cle, val] of Object.entries(o)) {
      if (cle === nom) tableau(val as unknown).forEach((x) => trouves.push(x as Record<string, unknown>));
      visiter(val);
    }
  };
  visiter(racine);
  return trouves;
}

export function lireKml(contenuFichier: Buffer | string, options: OptionsLecture = {}): ResultatKml {
  const brut = Buffer.isBuffer(contenuFichier) ? contenuFichier : Buffer.from(contenuFichier);

  // GeoJSON : reconnu à son contenu et non à son extension. Un fichier renommé
  // .kml par mégarde reste lisible, et c'est ce qui arrive quand les fichiers
  // circulent par courriel entre services.
  const debut = brut.subarray(0, 512).toString('utf-8').trimStart();
  if (debut.startsWith('{') || debut.startsWith('[')) {
    return lireGeoJson(brut.toString('utf-8'));
  }
  if (debut.includes('<gpx') || debut.includes('<trk') || debut.includes('<wpt')) {
    return lireGpx(brut.toString('utf-8'));
  }
  // CSV (B3.1) : ni XML, ni JSON, ni archive, et une ligne d'en-tête découpée
  // par « ; », « , » ou une tabulation.
  const estZip = brut[0] === 0x50 && brut[1] === 0x4b;
  if (!estZip && !debut.startsWith('<') && /[;,\t]/.test(debut.split(/\r?\n/)[0] ?? '')) {
    return lireCsvPoints(brut);
  }

  let xml: string;
  if (brut[0] === 0x50 && brut[1] === 0x4b) {
    // KMZ : une archive zip contenant doc.kml. On extrait la première entrée
    // dont le nom finit par .kml plutôt que de supposer « doc.kml ».
    xml = extraireKmz(brut);
  } else {
    xml = brut.toString('utf-8');
  }

  const doc = parseur.parse(xml);
  const avertissements: string[] = [];
  const nom = contenu(tousLes(doc, 'Document')[0]?.name) ?? null;

  const placemarks = tousLes(doc, 'Placemark');
  const aTrack = xml.includes('<gx:Track') || xml.includes('<Track');

  // --- Famille B : trace My Tracks ------------------------------------------
  if (aTrack) {
    const trace: [number, number][] = [];
    for (const c of tousLes(doc, 'coord')) {
      const t = texte(c);
      if (!t) continue;
      const [lng, lat] = t.split(/\s+/).map(Number);
      if (Number.isFinite(lng) && Number.isFinite(lat)) trace.push([lng, lat]);
    }
    const statistiques: Record<string, string> = {};
    for (const pm of placemarks) {
      const d = contenu(pm.description);
      if (d && d.includes('Total distance')) {
        for (const [, k, v] of d.matchAll(/([A-Za-z ]+):\s*([^\n]+?)(?=\s{2,}|\n|$)/g)) {
          const cle = k.trim();
          if (cle && v.trim()) statistiques[cle] = v.trim();
        }
      }
    }
    avertissements.push(
      "Ce fichier est un relevé GPS : il porte le trajet suivi, mais n'identifie aucun arrêt. " +
        'Le tracé sera enregistré pour l’affichage ; les points de collecte doivent venir d’un fichier de waypoints.'
    );
    return { famille: 'trace_gps', nom, points: [], trace, statistiques, avertissements };
  }

  // --- Les couches -----------------------------------------------------------
  const elements = placemarksParCouche(doc);
  const couches = resumerCouches(elements);
  const plusieurs = couches.filter((c) => c.points > 0).length > 1 || couches.filter((c) => c.lignes > 0).length > 1;

  if (plusieurs && !options.couche) {
    // Rien n'est deviné : quelle couche porte les arrêts du circuit, et lesquels,
    // c'est à l'agent de le dire.
    return {
      famille: 'multicouche',
      nom,
      points: [],
      trace: [],
      statistiques: {},
      avertissements: [
        `Ce fichier contient ${couches.length} couches (${couches.map((c) => c.nom).join(', ')}). ` +
          'Choisissez celle à importer, et au besoin filtrez-la sur un attribut — les points d’un seul circuit.',
      ],
      couches,
    };
  }

  let choisis = options.couche ? elements.filter((e) => e.chemin === options.couche) : elements;
  if (options.couche && choisis.length === 0) {
    avertissements.push(`La couche « ${options.couche} » n'existe pas dans ce fichier.`);
  }
  if (options.filtre) {
    const avant = choisis.length;
    choisis = choisis.filter((e) => retenir(e, options.filtre!));
    avertissements.push(
      `Filtre « ${options.filtre.attribut} ${options.filtre.operateur === 'commence_par' ? 'commence par' : '='} ` +
        `${options.filtre.valeur} » : ${choisis.length} entité(s) retenue(s) sur ${avant}.`
    );
  }
  const selection = choisis.map((e) => e.pm);
  const surfaces = selection.filter((pm) => tousLes(pm, 'Polygon').length > 0).length;
  if (surfaces > 0) {
    avertissements.push(
      `${surfaces} surface(s) ignorée(s) : une surface délimite une zone (secteur, circuit de porte-à-porte dessiné en ` +
        "polygone), elle ne décrit ni un itinéraire ni des arrêts. Les secteurs s'importent par le découpage communal."
    );
  }

  // --- Famille A : waypoints -------------------------------------------------
  const avecPoint = selection.filter((p) => p.Point);
  if (avecPoint.length > 0) {
    const bruts = avecPoint.map((pm) => {
      const c = coord(texte((pm.Point as Record<string, unknown>).coordinates) ?? '');
      const donnees = tousLes(pm.ExtendedData, 'Data');
      const lire = (n: string) =>
        texte(donnees.find((d) => d['@name'] === n)?.value) ?? null;
      const tags = (lire('tags') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const when = texte(tousLes(pm.TimeStamp, 'when')[0]) ?? null;
      const precision = lire('accuracy');
      return {
        nom: contenu(pm.name),
        type: tags.length === 0 && options.typePoints ? options.typePoints : classer(tags),
        lng: c?.[0] ?? null,
        lat: c?.[1] ?? null,
        precisionM: precision !== null && Number.isFinite(Number(precision)) ? Number(precision) : null,
        heureObservee: when ? heureLocale(when) : null,
        observation: observationDe(pm),
        when,
      };
    });

    const sansCoord = bruts.filter((p) => p.lat === null).length;
    if (sansCoord > 0) avertissements.push(`${sansCoord} point(s) sans coordonnées ont été écartés.`);
    let retenus = bruts.filter((p) => p.lat !== null);

    // L'ordre du fichier fait foi — la commune le confirme, et les horodatages
    // le vérifient. On le DIT plutôt que de le supposer : si les heures ne sont
    // pas croissantes, l'ordre est peut-être celui d'une autre logique, et
    // l'utilisateur doit le savoir avant de valider.
    const heures = retenus.map((p) => p.when).filter(Boolean) as string[];
    const croissant = heures.every((h, i) => i === 0 || heures[i - 1] <= h);
    if (heures.length > 1 && !croissant) {
      avertissements.push(
        "Les horodatages ne suivent pas l'ordre du fichier : l'ordre de passage proposé est celui du fichier, à vérifier."
      );
    } else if (heures.length === 0 && retenus.length > 1) {
      // Une couche SIG (ArcGIS, QGIS) n'est pas un relevé : ses points sont
      // rangés dans l'ordre de leur saisie dans la base, qui n'est pas celui
      // de la tournée. Le dire, plutôt que présenter cet ordre comme observé.
      avertissements.push(
        "Ce fichier ne porte aucune heure : l'ordre de passage proposé est celui du fichier, pas celui de la tournée. À vérifier et corriger."
      );
    }

    // Découpage en voyages, par les repères « début collecte ».
    //
    // Un même relevé peut couvrir plusieurs rotations : celui du 21 mai 2024
    // à Dar Chaabane porte deux « début collecte » (07:31 et 09:21), séparés
    // par un passage au centre de transfert à 08:59. Les fondre en une seule
    // suite mélangerait deux itinéraires qui ne desservent pas les mêmes rues.
    //
    // Ce qui précède le premier « début collecte » est le trajet depuis le
    // parc, et ce qui suit le dernier « fin collecte » le retour au centre de
    // transfert : ni l'un ni l'autre n'est de la collecte.
    const debuts = retenus
      .map((p, i) => (p.type === 'debut_collecte' ? i : -1))
      .filter((i) => i >= 0);

    let tranches: { voyage: number; debut: number; fin: number }[];
    if (debuts.length === 0) {
      const iFin = retenus.map((p) => p.type).lastIndexOf('fin_collecte');
      tranches = [{ voyage: 1, debut: 0, fin: iFin >= 0 ? iFin : retenus.length - 1 }];
      avertissements.push(
        "Aucun repère « début collecte » dans ce fichier : tous les points sont rattachés à un seul voyage, " +
          'trajets de desserte éventuels compris.'
      );
    } else {
      tranches = debuts.map((d, k) => {
        const borneSuivante = k + 1 < debuts.length ? debuts[k + 1] : retenus.length;
        // La tranche s'arrête au dernier « fin collecte » qui la précède, et à
        // défaut juste avant le début suivant.
        let fin = borneSuivante - 1;
        for (let j = borneSuivante - 1; j > d; j--) {
          if (retenus[j].type === 'fin_collecte') { fin = j; break; }
        }
        return { voyage: k + 1, debut: d, fin };
      });
      const gardes = tranches.reduce((n, t) => n + (t.fin - t.debut + 1), 0);
      const ecartes = retenus.length - gardes;
      if (ecartes > 0) {
        avertissements.push(
          `${ecartes} point(s) hors des repères de collecte ont été écartés ` +
            '(trajet depuis le parc, retour au centre de transfert).'
        );
      }
      if (tranches.length > 1) {
        avertissements.push(
          `${tranches.length} voyages distincts ont été reconnus dans ce relevé, d'après les repères « début collecte ».`
        );
      }
    }

    const points: PointReleve[] = [];
    for (const t of tranches) {
      let rang = 0;
      for (let i = t.debut; i <= t.fin; i++) {
        const p = retenus[i];
        points.push({
          voyage: t.voyage,
          ordre: ++rang,
          nom: p.nom,
          type: p.type,
          lat: p.lat as number,
          lng: p.lng as number,
          precisionM: p.precisionM,
          heureObservee: p.heureObservee,
          observation: p.observation,
        });
      }
    }

    const imprecis = points.filter((p) => (p.precisionM ?? 0) > 15).length;
    if (imprecis > 0) {
      avertissements.push(
        `${imprecis} point(s) relevés à plus de 15 m de précision : ils situent une rue, pas une adresse.`
      );
    }

    // Un tracé peut accompagner les arrêts (fichier exporté par SIIPI, ou
    // dessiné dans Google Earth) : on le lit, sans le poser d'office — c'est
    // à l'appelant de demander l'itinéraire (voir la route d'import).
    const traceJointe: [number, number][] = [];
    for (const l of tousLes(selection, 'LineString')) {
      for (const bloc of (texte(l.coordinates) ?? '').trim().split(/\s+/)) {
        const c = coord(bloc);
        if (c) traceJointe.push(c);
      }
    }

    return { famille: 'waypoints', nom, points, trace: traceJointe, statistiques: {}, avertissements, couches };
  }

  // --- Famille C : itinéraire dessiné ---------------------------------------
  const lignes = tousLes(selection, 'LineString');
  if (lignes.length > 0) {
    const trace: [number, number][] = [];
    for (const l of lignes) {
      for (const bloc of (texte(l.coordinates) ?? '').trim().split(/\s+/)) {
        const c = coord(bloc);
        if (c) trace.push(c);
      }
    }
    return {
      famille: 'itineraire_dessine',
      nom: nom ?? contenu(placemarks[0]?.name) ?? null,
      points: [],
      trace,
      statistiques: {},
      avertissements: [
        ...avertissements,
        "Ce fichier est un itinéraire dessiné à la main : il montre le chemin prévu, non un relevé de terrain.",
      ],
      couches,
    };
  }

  return {
    famille: 'inconnu',
    nom,
    points: [],
    trace: [],
    statistiques: {},
    avertissements: [...avertissements, 'Aucun point ni tracé reconnu dans ce fichier.'],
    couches,
  };
}

/**
 * L'observation d'un arrêt : sa description, sauf quand c'est le tableau
 * d'attributs d'ArcGIS — on en garde alors les attributs métier, lisibles
 * (« Circuit : Circuit Benne Taseuse 01 »), et non le HTML.
 */
function observationDe(pm: Record<string, unknown>): string | null {
  const d = contenu(pm.description);
  if (!d || !/<td/i.test(d)) return d;
  const utiles = attributsMetier(attributsDe(pm)).filter(([, v]) => v);
  return utiles.length ? utiles.map(([k, v]) => `${k} : ${v}`).join(' ; ') : null;
}


// ---------------------------------------------------------------------------
// GPX — le format des GPS de randonnée et de la plupart des applications de
// suivi. Trois éléments nous intéressent :
//   <wpt>  un point isolé, marqué à la main  → arrêt
//   <rtept> un point d'un itinéraire planifié → arrêt
//   <trkpt> un point d'une trace enregistrée  → tracé
//
// La distinction compte : un fichier GPX peut porter les trois, et confondre
// les points de trace avec des arrêts créerait des milliers d'arrêts là où il
// y en a vingt.
//
// L'heure d'un <time> GPX est en UTC véritable — contrairement aux relevés
// « GPS Waypoints » de Dar Chaabane, qui écrivent l'heure locale avec un « Z ».
// On convertit donc vers l'heure locale tunisienne, alors que là-bas on
// prenait les chiffres tels quels. Les deux traitements sont opposés parce que
// les deux formats le sont, et c'est précisément le genre de détail qu'un
// parseur écrit à l'avance aurait manqué.
// ---------------------------------------------------------------------------

/** Décalage de la Tunisie : UTC+1 toute l'année, sans heure d'été. */
const DECALAGE_TUNISIE_MINUTES = 60;

function heureDepuisUtc(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const local = new Date(d.getTime() + DECALAGE_TUNISIE_MINUTES * 60_000);
  return local.toISOString().slice(11, 19);
}

function lireGpx(xml: string): ResultatKml {
  const doc = parseur.parse(xml);
  const avertissements: string[] = [];
  const nom =
    contenu(tousLes(doc, 'metadata')[0]?.name) ??
    contenu(tousLes(doc, 'trk')[0]?.name) ??
    null;

  const arretsBruts: { nom: string | null; lat: number; lng: number; when: string | null; desc: string | null; type: string | null }[] = [];
  const lirePoints = (noeuds: Record<string, unknown>[]) => {
    for (const n of noeuds) {
      const lat = Number(n['@lat']);
      const lng = Number(n['@lon']);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      arretsBruts.push({
        nom: contenu(n.name),
        lat,
        lng,
        when: texte(n.time),
        desc: contenu(n.desc) ?? contenu(n.cmt),
        // <type> : la catégorie du point, quand le fichier la porte (export SIIPI).
        type: contenu(n.type),
      });
    }
  };
  lirePoints(tousLes(doc, 'wpt'));
  const nbWpt = arretsBruts.length;
  lirePoints(tousLes(doc, 'rtept'));
  if (arretsBruts.length > nbWpt) {
    avertissements.push(
      `${arretsBruts.length - nbWpt} point(s) d'itinéraire planifié (rtept) ont été ajoutés aux arrêts.`
    );
  }

  const trace: [number, number][] = [];
  for (const p of tousLes(doc, 'trkpt')) {
    const lat = Number(p['@lat']);
    const lng = Number(p['@lon']);
    if (Number.isFinite(lat) && Number.isFinite(lng)) trace.push([lng, lat]);
  }
  if (trace.length > 0 && arretsBruts.length === 0) {
    avertissements.push(
      "Ce fichier ne porte qu'une trace enregistrée, sans arrêt marqué. Le tracé sera conservé pour l'affichage ; " +
        'les points de collecte doivent venir d’un fichier qui en contient.'
    );
  }

  const points: PointReleve[] = arretsBruts.map((p, i) => ({
    voyage: 1,
    ordre: i + 1,
    nom: p.nom,
    type: p.type ? classer([p.type]) : classerLibelle(p.nom),
    lat: p.lat,
    lng: p.lng,
    precisionM: null,
    heureObservee: p.when ? heureDepuisUtc(p.when) : null,
    observation: p.desc,
  }));

  if (points.some((p) => p.heureObservee)) {
    avertissements.push(
      'Les heures du fichier GPX sont en temps universel : elles ont été converties en heure locale (UTC+1).'
    );
  }

  return { famille: 'gpx', nom, points, trace, statistiques: {}, avertissements };
}

// ---------------------------------------------------------------------------
// CSV — un tableau d'arrêts, typiquement l'export de la carte communale
// retouché dans un tableur, ou une liste tenue à la main.
//
// Les colonnes sont celles de l'export (services/jeuxExport.ts) : latitude et
// longitude obligatoires, le reste facultatif. La colonne « Circuit » d'un
// export est ignorée : l'import se fait circuit par circuit, depuis la fiche
// du circuit visé.
// ---------------------------------------------------------------------------

const TYPES_POINT_EXPORT = JEU_POINTS.colonnes.find((c) => c.cle === 'type')?.libelles ?? {};
// Le type est reconnu ici plutôt que par lireTableau : un type inconnu ne rend
// pas la ligne invalide, il la range en « autre », comme pour un KML.
const JEU_POINTS_IMPORT: JeuExport = {
  ...JEU_POINTS,
  colonnes: JEU_POINTS.colonnes.map((c) => (c.cle === 'type' ? { ...c, libelles: undefined } : c)),
};

function typeDepuisTexte(v: string): TypePoint {
  const cible = normaliser(v);
  for (const [code, lib] of Object.entries(TYPES_POINT_EXPORT)) {
    if (cible === normaliser(code) || cible === normaliser(lib.fr) || cible === normaliser(lib.ar)) {
      return code as TypePoint;
    }
  }
  return classer([v]);
}

function lireCsvPoints(brut: Buffer): ResultatKml {
  let tableau;
  try {
    tableau = lireTableau(JEU_POINTS_IMPORT, brut);
  } catch (err) {
    throw new Error(messageLecture(err));
  }
  const avertissements = [...tableau.avertissements];
  const reconnues = new Set(tableau.colonnesReconnues.map(normaliser));
  const aColonne = (cle: string) =>
    JEU_POINTS.colonnes
      .filter((c) => c.import === cle)
      .some((c) => [c.cle, c.fr, c.ar, ...(c.alias ?? [])].some((e) => reconnues.has(normaliser(e))));
  if (!aColonne('lat') || !aColonne('lng')) {
    throw new Error('CSV sans colonnes « Latitude » et « Longitude »');
  }
  if (tableau.colonnesIgnorees.length > 0) {
    avertissements.push(`Colonnes non importées : ${tableau.colonnesIgnorees.join(', ')}.`);
  }

  const bruts: Array<PointReleve & { rang: number }> = [];
  for (const l of tableau.lignes) {
    const v = l.valeurs;
    const lat = typeof v.lat === 'number' ? v.lat : NaN;
    const lng = typeof v.lng === 'number' ? v.lng : NaN;
    if (l.erreurs.length > 0 || !(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180)) {
      avertissements.push(
        `Ligne ${l.numero} écartée : ${l.erreurs.length ? l.erreurs.join(' ') : 'latitude ou longitude absente ou hors limites.'}`
      );
      continue;
    }
    let heure: string | null = null;
    if (typeof v.heureObservee === 'string') {
      const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(v.heureObservee.trim());
      if (m && Number(m[1]) < 24 && Number(m[2]) < 60) heure = `${m[1].padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}`;
      else avertissements.push(`Ligne ${l.numero} : heure « ${v.heureObservee} » illisible, laissée vide.`);
    }
    const voyage = typeof v.voyage === 'number' && v.voyage >= 1 ? Math.floor(v.voyage) : 1;
    bruts.push({
      rang: typeof v.ordre === 'number' ? v.ordre : Number.MAX_SAFE_INTEGER,
      voyage,
      ordre: 0,
      nom: typeof v.nom === 'string' ? v.nom : null,
      type: typeof v.type === 'string' ? typeDepuisTexte(v.type) : 'porte_a_porte',
      lat,
      lng,
      precisionM: typeof v.precisionM === 'number' ? v.precisionM : null,
      heureObservee: heure,
      observation: typeof v.observation === 'string' ? v.observation : null,
    });
  }

  // L'ordre de passage est unique par voyage (index idx_points_collecte_ordre) :
  // on reprend l'ordre du fichier, puis on renumérote 1, 2, 3… sans trou ni
  // doublon — un fichier retouché à la main en porte presque toujours.
  bruts.sort((a, b) => a.voyage - b.voyage || a.rang - b.rang);
  const compteurs = new Map<number, number>();
  const points: PointReleve[] = bruts.map(({ rang: _rang, ...p }) => {
    const n = (compteurs.get(p.voyage) ?? 0) + 1;
    compteurs.set(p.voyage, n);
    return { ...p, ordre: n };
  });

  return { famille: 'csv', nom: null, points, trace: [], statistiques: {}, avertissements };
}

// ---------------------------------------------------------------------------
// GeoJSON — le format d'export de QGIS, ArcGIS et des portails de données.
//
// Les propriétés d'une entité n'ont pas de nom normalisé : « name », « nom »,
// « libelle », « NOM »… On cherche donc parmi les intitulés courants plutôt
// que d'en imposer un que les fichiers existants n'emploieraient pas.
// ---------------------------------------------------------------------------

function propriete(props: Record<string, unknown>, noms: string[]): string | null {
  for (const cle of Object.keys(props)) {
    if (noms.includes(sansAccent(cle))) {
      const v = props[cle];
      if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
    }
  }
  return null;
}

function lireGeoJson(texteJson: string): ResultatKml {
  let doc: unknown;
  try {
    doc = JSON.parse(texteJson);
  } catch {
    throw new Error('GEOJSON_ILLISIBLE');
  }

  const avertissements: string[] = [];
  const entites: { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> }[] =
    Array.isArray(doc)
      ? (doc as [])
      : ((doc as { type?: string; features?: [] }).type === 'FeatureCollection'
          ? ((doc as { features?: [] }).features ?? [])
          : [doc as never]);

  const points: PointReleve[] = [];
  const trace: [number, number][] = [];
  let rang = 0;

  const ajouterLigne = (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    for (const s of coords as unknown[]) {
      if (Array.isArray(s) && typeof s[0] === 'number' && typeof s[1] === 'number') {
        trace.push([s[0], s[1]]);
      }
    }
  };

  for (const e of entites) {
    const g = e?.geometry ?? (e as unknown as { type?: string; coordinates?: unknown });
    const props = (e?.properties ?? {}) as Record<string, unknown>;
    const type = g?.type;
    const c = g?.coordinates;

    if (type === 'Point' && Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      const nomPoint = propriete(props, ['name', 'nom', 'libelle', 'label', 'titre', 'title']);
      const typeBrut = propriete(props, ['type', 'categorie', 'category', 'tags', 'tag']);
      // Le voyage, l'heure relevée et la précision, quand le fichier les
      // porte — c'est le cas d'un circuit exporté par SIIPI. Une valeur hors
      // forme est ignorée plutôt que devinée.
      const voyage = Number(propriete(props, ['voyage', 'rotation']) ?? NaN);
      const heure = propriete(props, ['heure observee', 'heure relevee', 'heure']);
      const precision = propriete(props, ['precision m', 'precision', 'accuracy']);
      points.push({
        voyage: Number.isInteger(voyage) && voyage >= 1 && voyage <= 6 ? voyage : 1,
        ordre: ++rang,
        nom: nomPoint,
        // Une propriété « type » ou « tags » est une étiquette délibérée : on
        // la traite comme telle. À défaut, on se rabat sur le libellé.
        type: typeBrut ? classer(typeBrut.split(',')) : classerLibelle(nomPoint),
        lat: c[1],
        lng: c[0],
        precisionM: precision !== null && Number.isFinite(Number(precision)) ? Number(precision) : null,
        heureObservee: heure && /^\d{2}:\d{2}(:\d{2})?$/.test(heure) ? `${heure}:00`.slice(0, 8) : null,
        observation: propriete(props, ['description', 'commentaire', 'observation', 'remarque']),
      });
    } else if (type === 'LineString') {
      ajouterLigne(c);
    } else if (type === 'MultiLineString' && Array.isArray(c)) {
      for (const ligne of c as unknown[]) ajouterLigne(ligne);
    } else if (type === 'MultiPoint' && Array.isArray(c)) {
      for (const s of c as unknown[]) {
        if (Array.isArray(s) && typeof s[0] === 'number' && typeof s[1] === 'number') {
          points.push({
            voyage: 1,
            ordre: ++rang,
            nom: null,
            type: 'porte_a_porte',
            lat: s[1],
            lng: s[0],
            precisionM: null,
            heureObservee: null,
            observation: null,
          });
        }
      }
    } else if (type === 'Polygon' || type === 'MultiPolygon') {
      avertissements.push(
        'Ce fichier contient des surfaces (polygones) : elles décrivent des secteurs, pas une tournée, et ont été ignorées.'
      );
    }
  }

  if (points.length === 0 && trace.length === 0) {
    avertissements.push("Aucun point ni ligne exploitable dans ce fichier.");
  }
  // Le rang se compte dans chaque voyage, comme partout ailleurs : deux
  // rotations ne partagent pas la même suite de numéros.
  const rangs = new Map<number, number>();
  for (const p of points) {
    const r = (rangs.get(p.voyage) ?? 0) + 1;
    rangs.set(p.voyage, r);
    p.ordre = r;
  }
  // Un GeoJSON n'a pas d'ordre garanti : l'ordre du fichier est repris tel
  // quel, et il faut le dire plutôt que de laisser croire à une tournée.
  if (points.length > 1 && !points.some((p) => p.heureObservee)) {
    avertissements.push(
      "L'ordre de passage repris est celui du fichier. Un GeoJSON ne porte aucune heure de relevé : vérifiez-le, et complétez les heures à la main si nécessaire."
    );
  } else if (points.length > 1) {
    avertissements.push("L'ordre de passage repris est celui du fichier : vérifiez-le.");
  }

  return {
    famille: 'geojson',
    nom: null,
    points,
    trace,
    statistiques: {},
    avertissements,
  };
}

// Lecture minimale d'une archive zip : on ne dépend pas d'une bibliothèque
// supplémentaire pour extraire un unique fichier d'un KMZ.
function extraireKmz(buf: Buffer): string {
  let i = 0;
  while (i < buf.length - 4) {
    if (buf.readUInt32LE(i) !== 0x04034b50) break;
    const compression = buf.readUInt16LE(i + 8);
    const tailleCompressee = buf.readUInt32LE(i + 18);
    const longueurNom = buf.readUInt16LE(i + 26);
    const longueurExtra = buf.readUInt16LE(i + 28);
    const debutNom = i + 30;
    const nomEntree = buf.subarray(debutNom, debutNom + longueurNom).toString('utf-8');
    const debutDonnees = debutNom + longueurNom + longueurExtra;
    const donnees = buf.subarray(debutDonnees, debutDonnees + tailleCompressee);
    if (nomEntree.toLowerCase().endsWith('.kml')) {
      // 0 = stocké tel quel, 8 = dégonflage BRUT (deflate sans en-tête zlib),
      // d'où inflateRawSync et non unzipSync, qui attendrait un en-tête.
      return compression === 0 ? donnees.toString('utf-8') : inflateRawSync(donnees).toString('utf-8');
    }
    i = debutDonnees + tailleCompressee;
  }
  throw new Error('KMZ_SANS_KML');
}
