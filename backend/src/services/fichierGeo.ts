// La lecture d'un fichier de limites : Shapefile, KML/KMZ ou GeoJSON (lot C2.2).
//
// Une commune qui a fait relever son périmètre ou ses secteurs reçoit du
// géomètre ou du bureau d'études un Shapefile (le format d'ArcGIS et de QGIS),
// un KML (Google Earth) ou un GeoJSON. Ce module en tire des entités —
// géométrie et attributs — dans le système de coordonnées DU FICHIER ; la route
// les reprojette en WGS 84 dans PostGIS, qui connaît les systèmes tunisiens.
//
// LA PROJECTION NE SE DEVINE PAS. Un Shapefile dit la sienne dans son .prj ;
// SIIPI reconnaît les systèmes en usage en Tunisie (WGS 84, UTM 32N, Carthage
// UTM 32N, Nord et Sud Tunisie, Web Mercator). Un système inconnu est refusé,
// en le nommant : des coordonnées lues dans le mauvais système placeraient la
// commune à des centaines de kilomètres, et la carte n'en dirait rien. Sans
// .prj, on n'accepte que des coordonnées qui sont manifestement des degrés en
// Tunisie, et on le dit.
//
// L'ENCODAGE DES ATTRIBUTS NON PLUS : le .cpg le donne ; sans lui, UTF-8 s'il
// est valide, sinon Windows-1252 — et un avertissement, car un nom arabe écrit
// en Windows-1256 sans .cpg serait illisible.

import { XMLParser } from 'fast-xml-parser';
import { estZip, lireZip, type EntreeZip } from './zip.js';

export class ErreurFichierGeo extends Error {}

export type Geometrie =
  | { type: 'Point'; coordinates: number[] }
  | { type: 'MultiPoint'; coordinates: number[][] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'MultiLineString'; coordinates: number[][][] }
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

export type EntiteGeo = { geometrie: Geometrie | null; proprietes: Record<string, unknown>; couche: string | null };

export type FichierGeoLu = {
  format: 'shapefile' | 'kml' | 'kmz' | 'geojson';
  /** Le système de coordonnées du fichier (code EPSG). */
  srid: number;
  projection: string;
  entites: EntiteGeo[];
  avertissements: string[];
};

/** Les systèmes en usage en Tunisie que SIIPI sait reprojeter, et leur nom. */
export const SYSTEMES: Record<number, string> = {
  4326: 'WGS 84 (degrés)',
  32632: 'WGS 84 / UTM zone 32N',
  22332: 'Carthage / UTM zone 32N',
  22391: 'Carthage / Nord Tunisie',
  22392: 'Carthage / Sud Tunisie',
  3857: 'WGS 84 / Pseudo-Mercator (Web Mercator)',
};

// --- Le système de coordonnées -------------------------------------------------

const sansPonctuation = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Le code EPSG d'un .prj (WKT ESRI ou OGC), ou null s'il n'est pas reconnu. */
export function sridDuPrj(wkt: string): number | null {
  // Une autorité EPSG explicite, sur le système projeté ou géographique de tête, fait foi.
  const tete = wkt.match(/^\s*(PROJCS|PROJCRS|GEOGCS|GEOGCRS)\s*\[/i);
  const autorites = [...wkt.matchAll(/(?:AUTHORITY|ID)\s*\[\s*"EPSG"\s*,\s*"?(\d+)"?\s*\]/gi)].map((m) => Number(m[1]));
  if (tete && autorites.length) {
    const derniere = autorites[autorites.length - 1];
    if (SYSTEMES[derniere]) return derniere;
  }
  const nom = sansPonctuation(wkt.match(/^\s*\w+\s*\[\s*"([^"]+)"/)?.[1] ?? '');
  const projete = /^\s*PROJ/i.test(wkt);
  if (!projete && (nom.includes('wgs1984') || nom === 'wgs84')) return 4326;
  if (nom.includes('carthage') && nom.includes('utm') && nom.includes('32n')) return 22332;
  if (nom.includes('nordtunisie')) return 22391;
  if (nom.includes('sudtunisie')) return 22392;
  if ((nom.includes('wgs1984') || nom.includes('wgs84')) && nom.includes('utm') && nom.includes('32n')) return 32632;
  if (nom.includes('webmercator') || nom.includes('pseudomercator') || nom.includes('mercatorauxiliarysphere')) return 3857;
  return null;
}

function nomDuPrj(wkt: string): string {
  return wkt.match(/^\s*\w+\s*\[\s*"([^"]+)"/)?.[1] ?? 'sans nom';
}

const DANS_LA_TUNISIE_EN_DEGRES = (x: number, y: number) => x >= 6 && x <= 13 && y >= 29 && y <= 38.5;

function etendue(entites: EntiteGeo[]): number[][] {
  const pts: number[][] = [];
  const parcourir = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') pts.push(c as number[]);
    else if (Array.isArray(c)) c.forEach(parcourir);
  };
  for (const e of entites) if (e.geometrie) parcourir(e.geometrie.coordinates);
  return pts;
}

// --- Shapefile -------------------------------------------------------------------

const aireSignee = (anneau: number[][]) => {
  let a = 0;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) a += (anneau[i][0] - anneau[j][0]) * (anneau[i][1] + anneau[j][1]);
  return a / 2; // > 0 : sens des aiguilles d'une montre (l'extérieur, en Shapefile)
};

function contient(anneau: number[][], [x, y]: number[]) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i];
    const [xj, yj] = anneau[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

/** Les anneaux d'un enregistrement Polygon, rangés en polygones : extérieurs horaires, trous antihoraires. */
function polygonesDesAnneaux(anneaux: number[][][], avertir: (m: string) => void): Geometrie {
  const exterieurs: number[][][][] = [];
  const trous: number[][][] = [];
  for (const a of anneaux) (aireSignee(a) >= 0 ? exterieurs.push([a]) : trous.push(a));
  for (const t of trous) {
    const hote = exterieurs.find((p) => contient(p[0], t[0]));
    if (hote) hote.push(t);
    else {
      // Un anneau antihoraire hors de tout extérieur : un fichier qui n'a pas suivi
      // le sens de la norme. On le garde comme extérieur, et on le dit.
      exterieurs.push([t.slice().reverse()]);
      avertir('Un anneau tourné dans le mauvais sens a été lu comme un contour extérieur.');
    }
  }
  return exterieurs.length === 1 ? { type: 'Polygon', coordinates: exterieurs[0] } : { type: 'MultiPolygon', coordinates: exterieurs };
}

function lireShp(shp: Buffer, avertir: (m: string) => void): (Geometrie | null)[] {
  if (shp.length < 100 || shp.readInt32BE(0) !== 9994) throw new ErreurFichierGeo('Le fichier .shp est illisible (en-tête absent).');
  const geometries: (Geometrie | null)[] = [];
  let p = 100;
  while (p + 8 <= shp.length) {
    const longueur = shp.readInt32BE(p + 4) * 2;
    const c = p + 8;
    if (c + longueur > shp.length) throw new ErreurFichierGeo('Le fichier .shp est tronqué.');
    const type = longueur >= 4 ? shp.readInt32LE(c) : 0;
    const point = (o: number) => [shp.readDoubleLE(o), shp.readDoubleLE(o + 8)];
    if (type === 0) geometries.push(null);
    else if (type === 1 || type === 11 || type === 21) geometries.push({ type: 'Point', coordinates: point(c + 4) });
    else if (type === 8 || type === 18 || type === 28) {
      const n = shp.readInt32LE(c + 36);
      geometries.push({ type: 'MultiPoint', coordinates: Array.from({ length: n }, (_, i) => point(c + 40 + 16 * i)) });
    } else if ([3, 13, 23, 5, 15, 25].includes(type)) {
      const parts = shp.readInt32LE(c + 36);
      const n = shp.readInt32LE(c + 40);
      const debuts = Array.from({ length: parts }, (_, i) => shp.readInt32LE(c + 44 + 4 * i));
      const o = c + 44 + 4 * parts;
      const anneaux = debuts.map((d, i) => Array.from({ length: (debuts[i + 1] ?? n) - d }, (_, k) => point(o + 16 * (d + k))));
      if ([3, 13, 23].includes(type)) {
        geometries.push(anneaux.length === 1 ? { type: 'LineString', coordinates: anneaux[0] } : { type: 'MultiLineString', coordinates: anneaux });
      } else geometries.push(polygonesDesAnneaux(anneaux, avertir));
    } else throw new ErreurFichierGeo(`Type de forme Shapefile non pris en charge (${type}).`);
    p = c + longueur;
  }
  return geometries;
}

function decodeurDuCpg(cpg: string | null, avertir: (m: string) => void): (b: Buffer) => string {
  if (cpg) {
    const t = cpg.trim().toLowerCase().replace(/^ansi\s*/, '');
    const libelle = t === '65001' || t === 'utf8' ? 'utf-8' : /^\d{3,4}$/.test(t) ? `windows-${t}` : t.replace(/^cp/, 'windows-');
    try {
      const d = new TextDecoder(libelle);
      return (b) => d.decode(b);
    } catch {
      avertir(`Encodage « ${cpg.trim()} » du .cpg inconnu : attributs lus en UTF-8.`);
    }
  }
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const ansi = new TextDecoder('windows-1252');
  let averti = false;
  return (b) => {
    try {
      return utf8.decode(b);
    } catch {
      if (!averti) {
        avertir('Attributs ni en UTF-8 ni accompagnés d’un .cpg : lus en Windows-1252. Un nom arabe serait illisible : joignez le .cpg.');
        averti = true;
      }
      return ansi.decode(b);
    }
  };
}

function lireDbf(dbf: Buffer, decoder: (b: Buffer) => string): Record<string, unknown>[] {
  if (dbf.length < 32) throw new ErreurFichierGeo('Le fichier .dbf est illisible.');
  const n = dbf.readUInt32LE(4);
  const longueurEntete = dbf.readUInt16LE(8);
  const longueurLigne = dbf.readUInt16LE(10);
  const champs: { nom: string; type: string; longueur: number }[] = [];
  for (let p = 32; p + 32 <= longueurEntete && dbf[p] !== 0x0d; p += 32) {
    const brut = dbf.subarray(p, p + 11);
    const fin = brut.indexOf(0);
    champs.push({ nom: decoder(brut.subarray(0, fin < 0 ? 11 : fin)).trim(), type: String.fromCharCode(dbf[p + 11]), longueur: dbf[p + 16] });
  }
  const lignes: Record<string, unknown>[] = [];
  for (let k = 0; k < n; k++) {
    let p = longueurEntete + k * longueurLigne;
    if (p + longueurLigne > dbf.length) break;
    const supprimee = dbf[p] === 0x2a;
    p += 1;
    const ligne: Record<string, unknown> = {};
    for (const c of champs) {
      const brut = dbf.subarray(p, p + c.longueur);
      p += c.longueur;
      const texte = decoder(brut).replace(/\0/g, '').trim();
      if (c.type === 'N' || c.type === 'F') ligne[c.nom] = texte === '' || /^\*+$/.test(texte) ? null : Number(texte);
      else if (c.type === 'L') ligne[c.nom] = /^[TtYy]$/.test(texte) ? true : /^[FfNn]$/.test(texte) ? false : null;
      else if (c.type === 'D') ligne[c.nom] = /^\d{8}$/.test(texte) ? `${texte.slice(0, 4)}-${texte.slice(4, 6)}-${texte.slice(6, 8)}` : null;
      else ligne[c.nom] = texte === '' ? null : texte;
    }
    if (!supprimee) lignes.push(ligne);
    else lignes.push({ __supprimee: true });
  }
  return lignes;
}

function lireShapefile(entrees: EntreeZip[]): FichierGeoLu {
  const avertissements: string[] = [];
  const avertir = (m: string) => {
    if (!avertissements.includes(m)) avertissements.push(m);
  };
  const base = (nom: string) => nom.replace(/\.[^./]+$/, '').toLowerCase();
  const trouver = (b: string, ext: string) => entrees.find((e) => base(e.nom) === b && e.nom.toLowerCase().endsWith(ext));
  const couches = entrees.filter((e) => e.nom.toLowerCase().endsWith('.shp') && !e.nom.startsWith('__MACOSX'));
  if (!couches.length) throw new ErreurFichierGeo('L’archive ne contient ni Shapefile (.shp) ni KML.');

  const entites: EntiteGeo[] = [];
  let srid: number | null = null;
  let projection = '';
  for (const shp of couches) {
    const b = base(shp.nom);
    const nomCouche = shp.nom.replace(/^.*\//, '').replace(/\.shp$/i, '');
    const dbf = trouver(b, '.dbf');
    const prj = trouver(b, '.prj');
    const cpg = trouver(b, '.cpg');
    if (!dbf) throw new ErreurFichierGeo(`La couche « ${nomCouche} » n’a pas de .dbf : joignez les fichiers .shp, .shx, .dbf et .prj ensemble.`);

    let sridCouche: number;
    let nomProjection: string;
    if (prj) {
      const wkt = prj.donnees.toString('utf-8');
      const s = sridDuPrj(wkt);
      if (s == null) {
        throw new ErreurFichierGeo(
          `Système de coordonnées « ${nomDuPrj(wkt)} » (couche « ${nomCouche} ») non reconnu. SIIPI lit : ${Object.values(SYSTEMES).join(', ')}. Reprojetez la couche dans l’un d’eux (QGIS : Exporter, puis choisir le SCR).`
        );
      }
      sridCouche = s;
      nomProjection = SYSTEMES[s];
    } else {
      sridCouche = 4326;
      nomProjection = SYSTEMES[4326];
    }

    const geometries = lireShp(shp.donnees, avertir);
    const lignes = lireDbf(dbf.donnees, decodeurDuCpg(cpg ? cpg.donnees.toString('utf-8') : null, avertir));
    if (lignes.length !== geometries.length) {
      avertir(`La couche « ${nomCouche} » compte ${geometries.length} formes et ${lignes.length} lignes d’attributs : vérifiez qu’elles vont ensemble.`);
    }
    const lues: EntiteGeo[] = geometries
      .map((g, i) => ({ geometrie: g, proprietes: lignes[i] ?? {}, couche: couches.length > 1 ? nomCouche : null }))
      .filter((e) => !e.proprietes.__supprimee);

    if (!prj) {
      const pts = etendue(lues);
      if (!pts.length || !pts.every(([x, y]) => DANS_LA_TUNISIE_EN_DEGRES(x, y))) {
        throw new ErreurFichierGeo(
          `La couche « ${nomCouche} » n’a pas de .prj et ses coordonnées ne sont pas des degrés en Tunisie : joignez le fichier .prj, qui dit dans quel système elles sont écrites.`
        );
      }
      avertir(`La couche « ${nomCouche} » n’a pas de .prj : ses coordonnées, des degrés en Tunisie, ont été lues en WGS 84.`);
    }
    if (srid != null && srid !== sridCouche) {
      throw new ErreurFichierGeo('Les couches de l’archive ne sont pas dans le même système de coordonnées : envoyez-les une à une.');
    }
    srid = sridCouche;
    projection = nomProjection;
    entites.push(...lues);
  }
  return { format: 'shapefile', srid: srid ?? 4326, projection, entites, avertissements };
}

// --- KML / KMZ -------------------------------------------------------------------

const parseur = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true });

const liste = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
const texte = (x: unknown): string => (typeof x === 'object' && x !== null ? String((x as Record<string, unknown>)['#text'] ?? '') : String(x ?? ''));

function anneauKml(lr: unknown): number[][] {
  const coordonnees = texte((lr as Record<string, unknown>)?.coordinates).trim();
  return coordonnees
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.split(',').slice(0, 2).map(Number));
}

function lireKmlPolygones(xml: string, format: 'kml' | 'kmz'): FichierGeoLu {
  const doc = parseur.parse(xml);
  const placemarks: Record<string, unknown>[] = [];
  const chercher = (n: unknown): void => {
    if (Array.isArray(n)) n.forEach(chercher);
    else if (n && typeof n === 'object') {
      for (const [k, v] of Object.entries(n)) {
        if (k === 'Placemark') placemarks.push(...(liste(v) as Record<string, unknown>[]));
        else chercher(v);
      }
    }
  };
  chercher(doc);
  const entites: EntiteGeo[] = [];
  for (const pm of placemarks) {
    const polygones: Record<string, unknown>[] = [];
    const geo = (n: unknown): void => {
      if (Array.isArray(n)) n.forEach(geo);
      else if (n && typeof n === 'object') {
        for (const [k, v] of Object.entries(n)) {
          if (k === 'Polygon') polygones.push(...(liste(v) as Record<string, unknown>[]));
          else if (k === 'MultiGeometry') geo(v);
        }
      }
    };
    geo(pm);
    if (!polygones.length) continue;
    const coords = polygones.map((pg) => [
      anneauKml((pg.outerBoundaryIs as Record<string, unknown>)?.LinearRing),
      ...liste(pg.innerBoundaryIs as unknown).map((ib) => anneauKml((ib as Record<string, unknown>)?.LinearRing)),
    ]);
    const proprietes: Record<string, unknown> = {};
    if (pm.name !== undefined) proprietes.name = texte(pm.name);
    for (const d of liste((pm.ExtendedData as Record<string, unknown>)?.Data as unknown)) {
      const o = d as Record<string, unknown>;
      if (o['@name']) proprietes[String(o['@name'])] = texte(o.value);
    }
    for (const sd of liste(((pm.ExtendedData as Record<string, unknown>)?.SchemaData as Record<string, unknown>)?.SimpleData as unknown)) {
      const o = sd as Record<string, unknown>;
      if (o['@name']) proprietes[String(o['@name'])] = texte(o);
    }
    entites.push({
      geometrie: coords.length === 1 ? { type: 'Polygon', coordinates: coords[0] } : { type: 'MultiPolygon', coordinates: coords },
      proprietes,
      couche: null,
    });
  }
  return { format, srid: 4326, projection: SYSTEMES[4326], entites, avertissements: [] };
}

// --- GeoJSON ---------------------------------------------------------------------

function lireGeojson(json: unknown): FichierGeoLu {
  const o = json as Record<string, unknown>;
  const avertissements: string[] = [];
  // L'ancien membre « crs » (GeoJSON 2008), que QGIS écrit encore quand la couche n'est pas en WGS 84.
  const nomCrs = String(((o?.crs as Record<string, unknown>)?.properties as Record<string, unknown>)?.name ?? '');
  let srid = 4326;
  if (nomCrs) {
    const code = Number(nomCrs.match(/EPSG:*(\d+)/i)?.[1] ?? (/CRS84$/i.test(nomCrs) ? 4326 : NaN));
    if (!SYSTEMES[code]) {
      throw new ErreurFichierGeo(`Système de coordonnées « ${nomCrs} » non reconnu. SIIPI lit : ${Object.values(SYSTEMES).join(', ')}.`);
    }
    srid = code;
  }
  const features =
    o?.type === 'FeatureCollection'
      ? (liste(o.features as unknown) as Record<string, unknown>[])
      : o?.type === 'Feature'
        ? [o]
        : [{ type: 'Feature', geometry: o, properties: {} }];
  const entites: EntiteGeo[] = features.map((f) => ({
    geometrie: (f.geometry as Geometrie) ?? null,
    proprietes: (f.properties as Record<string, unknown>) ?? {},
    couche: null,
  }));
  if (!entites.some((e) => e.geometrie)) throw new ErreurFichierGeo('Le GeoJSON ne contient aucune géométrie.');
  if (srid === 4326 && !etendue(entites).every(([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90)) {
    throw new ErreurFichierGeo('Ce GeoJSON n’est pas en degrés et ne dit pas son système : exportez-le en WGS 84 (EPSG:4326).');
  }
  return { format: 'geojson', srid, projection: SYSTEMES[srid], entites, avertissements };
}

// --- L'entrée ----------------------------------------------------------------------

export function lireFichierGeo(contenu: Buffer, nomFichier: string): FichierGeoLu {
  if (!contenu.length) throw new ErreurFichierGeo('Le fichier est vide.');
  if (estZip(contenu)) {
    const entrees = lireZip(contenu);
    if (entrees.some((e) => e.nom.toLowerCase().endsWith('.shp'))) return lireShapefile(entrees);
    const kml = entrees.find((e) => e.nom.toLowerCase().endsWith('.kml'));
    if (kml) return lireKmlPolygones(kml.donnees.toString('utf-8'), 'kmz');
    throw new ErreurFichierGeo('L’archive ne contient ni Shapefile (.shp) ni KML.');
  }
  if (/\.shp$/i.test(nomFichier)) {
    throw new ErreurFichierGeo('Un Shapefile est fait de plusieurs fichiers (.shp, .shx, .dbf, .prj) : envoyez-les ensemble, dans une archive zip.');
  }
  const debut = contenu.subarray(0, 200).toString('utf-8').replace(/^﻿/, '').trimStart();
  if (debut.startsWith('<')) return lireKmlPolygones(contenu.toString('utf-8'), 'kml');
  if (debut.startsWith('{')) {
    let json: unknown;
    try {
      json = JSON.parse(contenu.toString('utf-8').replace(/^﻿/, ''));
    } catch {
      throw new ErreurFichierGeo('Le GeoJSON est mal formé.');
    }
    return lireGeojson(json);
  }
  throw new ErreurFichierGeo('Format non reconnu : SIIPI lit un Shapefile (zip), un KML, un KMZ ou un GeoJSON.');
}
