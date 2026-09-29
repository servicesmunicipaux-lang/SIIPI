// ---------------------------------------------------------------------------
// Le fichier géographique d'un circuit : son tracé et ses arrêts, en GPX, KML
// ou GeoJSON.
//
// Un circuit doit pouvoir SORTIR de la plateforme comme il y est entré : pour
// l'ouvrir dans QGIS ou Google Earth, le confier à un prestataire, le charger
// dans un GPS de bord, ou le réimporter dans un autre circuit. Les trois
// fichiers sont donc écrits pour être relus par le lecteur de relevés de
// SIIPI (services/kml.ts) sans rien perdre de ce qui compte : le type de
// chaque arrêt, son voyage et son rang, son heure relevée.
//
//   - GPX : <trk> pour le tracé, <wpt> pour les arrêts, le type dans <type>.
//     Les heures y sont en UTC, comme le veut le format.
//   - KML : un dossier « Waypoints » (la forme des relevés terrain, heure
//     locale) et le tracé en <LineString>.
//   - GeoJSON : une entité par arrêt, une pour le tracé, toutes les colonnes
//     du tableau des points en propriétés — y compris les champs libres de la
//     commune, sous leur libellé.
// ---------------------------------------------------------------------------

export const FORMATS_FICHIER = ['gpx', 'kml', 'geojson'] as const;
export type FormatFichier = (typeof FORMATS_FICHIER)[number];

export const TYPES_MIME: Record<FormatFichier, string> = {
  gpx: 'application/gpx+xml',
  kml: 'application/vnd.google-earth.kml+xml',
  geojson: 'application/geo+json',
};

export interface CircuitFichier {
  nom: string;
  code: string | null;
  /** Date à laquelle rattacher les heures relevées (campagne, sinon début de service). */
  dateReference: string | null;
  traceSource: string | null;
  /** [lng, lat][][] — une ligne par segment. */
  lignes: [number, number][][];
}

export interface PointFichier {
  voyage: number;
  ordre: number;
  nom: string | null;
  type: string;
  lat: number;
  lng: number;
  precision_m: number | string | null;
  heure_observee: string | null;
  heure_estimee: string | null;
  observation: string | null;
  /** Champs libres, déjà traduits en { libellé : valeur }. */
  champs: Record<string, unknown>;
  etiquettes: string[];
}

// Le vocabulaire que le lecteur de relevés reconnaît : écrire le type ainsi,
// c'est garantir qu'un fichier exporté se réimporte à l'identique.
const LIBELLE_TYPE: Record<string, string> = {
  porte_a_porte: 'porte à porte',
  point_de_collecte: 'point de collecte',
  debut_collecte: 'début collecte',
  fin_collecte: 'fin collecte',
  point_noir: 'point noir',
  centre_transfert: 'centre de transfert',
  hors_conteneur: 'hors conteneur',
  parc_municipal: 'parc municipal',
  autre: 'autre',
};

const xml = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const heure = (h: string | null) => (h && /^\d{2}:\d{2}/.test(h) ? h.slice(0, 8).padEnd(8, ':00').slice(0, 8) : null);

/** Nom de fichier sûr : le code du circuit, à défaut son nom. */
export function nomFichier(c: CircuitFichier, format: FormatFichier): string {
  const base = (c.code || c.nom)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9؀-ۿ]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${base || 'circuit'}.${format}`;
}

// La description d'un arrêt ne porte QUE l'observation de l'agent : c'est ce
// que le lecteur de relevés en refait à la réimportation. Le reste (voyage,
// étiquettes, champs libres) voyage dans des champs à part.
const observation = (p: PointFichier) => p.observation ?? '';

export function versGpx(c: CircuitFichier, points: PointFichier[]): string {
  const wpts = points.map((p) => {
    const h = heure(p.heure_observee);
    // Une heure relevée est locale (UTC+1) ; le GPX veut de l'UTC.
    const quand =
      h && c.dateReference ? new Date(Date.parse(`${c.dateReference}T${h}Z`) - 3_600_000).toISOString().replace('.000', '') : null;
    return (
      `  <wpt lat="${p.lat}" lon="${p.lng}">\n` +
      (quand ? `    <time>${quand}</time>\n` : '') +
      `    <name>${xml(p.nom ?? `Arrêt ${p.voyage}.${p.ordre}`)}</name>\n` +
      (p.observation ? `    <desc>${xml(observation(p))}</desc>\n` : '') +
      `    <type>${xml(LIBELLE_TYPE[p.type] ?? p.type)}</type>\n` +
      `  </wpt>`
    );
  });
  const trk = c.lignes.length
    ? `  <trk>\n    <name>${xml(c.nom)}</name>\n` +
      c.lignes
        .map((l) => `    <trkseg>\n${l.map(([x, y]) => `      <trkpt lat="${y}" lon="${x}"/>`).join('\n')}\n    </trkseg>`)
        .join('\n') +
      '\n  </trk>'
    : '';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="SIIPI — FNCT" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    `  <metadata><name>${xml(c.nom)}</name></metadata>\n` +
    [...wpts, trk].filter(Boolean).join('\n') +
    '\n</gpx>\n'
  );
}

export function versKml(c: CircuitFichier, points: PointFichier[]): string {
  const placemarks = points.map((p) => {
    const h = heure(p.heure_observee);
    // Heure LOCALE suivie d'un « Z » : c'est la forme des relevés « GPS
    // Waypoints » que le lecteur de SIIPI attend (voir services/kml.ts).
    const quand = h ? `${c.dateReference ?? '1970-01-01'}T${h}Z` : null;
    const donnees = [
      ['tags', LIBELLE_TYPE[p.type] ?? p.type],
      ['voyage', p.voyage],
      ['ordre', p.ordre],
      ['accuracy', p.precision_m ?? ''],
      ['etiquettes', p.etiquettes.join(', ')],
      ...Object.entries(p.champs),
    ]
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .map(([k, v]) => `<Data name="${xml(k)}"><value>${xml(v)}</value></Data>`)
      .join('');
    return (
      `      <Placemark><name>${xml(p.nom ?? `Arrêt ${p.voyage}.${p.ordre}`)}</name>` +
      (quand ? `<TimeStamp><when>${quand}</when></TimeStamp>` : '') +
      (p.observation ? `<description>${xml(observation(p))}</description>` : '') +
      `<Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>` +
      `<ExtendedData>${donnees}</ExtendedData></Placemark>`
    );
  });
  const trace = c.lignes.length
    ? `    <Placemark><name>${xml(c.nom)} — tracé</name><MultiGeometry>` +
      c.lignes.map((l) => `<LineString><coordinates>${l.map(([x, y]) => `${x},${y},0`).join(' ')}</coordinates></LineString>`).join('') +
      '</MultiGeometry></Placemark>\n'
    : '';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n' +
    `    <name>${xml(c.nom)}</name>\n` +
    trace +
    (points.length ? `    <Folder>\n      <name>Waypoints</name>\n${placemarks.join('\n')}\n    </Folder>\n` : '') +
    '  </Document>\n</kml>\n'
  );
}

export function versGeoJson(c: CircuitFichier, points: PointFichier[]): string {
  const entites: unknown[] = [];
  if (c.lignes.length) {
    entites.push({
      type: 'Feature',
      geometry: { type: 'MultiLineString', coordinates: c.lignes },
      properties: { circuit: c.nom, code: c.code, element: 'trace', source: c.traceSource },
    });
  }
  for (const p of points) {
    entites.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: {
        circuit: c.nom,
        element: 'arret',
        voyage: p.voyage,
        ordre: p.ordre,
        nom: p.nom,
        type: p.type,
        precision_m: p.precision_m === null ? null : Number(p.precision_m),
        heure_observee: heure(p.heure_observee),
        heure_estimee: heure(p.heure_estimee),
        observation: p.observation,
        etiquettes: p.etiquettes,
        ...p.champs,
      },
    });
  }
  return JSON.stringify({ type: 'FeatureCollection', name: c.nom, features: entites }, null, 1);
}
