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
    | 'inconnu';
  nom: string | null;
  points: PointReleve[];
  /** [lng, lat][] — tracé destiné à l'affichage seul. */
  trace: [number, number][];
  /** Ce que le fichier dit de lui-même, repris sans retouche. */
  statistiques: Record<string, string>;
  /** Ce qui a été écarté, et pourquoi. Remonté à l'écran avant validation. */
  avertissements: string[];
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

/**
 * Classe un point d'après ses ÉTIQUETTES. Une étiquette présente mais inconnue
 * rend « autre » : le terrain a voulu dire quelque chose qu'on ne sait pas
 * lire, et le ranger d'office en porte-à-porte effacerait cette information.
 */
function classer(tags: string[]): TypePoint {
  for (const t of tags) {
    const cle = TAGS[sansAccent(t)];
    if (cle) return cle;
  }
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

export function lireKml(contenuFichier: Buffer | string): ResultatKml {
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

  // --- Famille A : waypoints -------------------------------------------------
  const avecPoint = placemarks.filter((p) => p.Point);
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
        type: classer(tags),
        lng: c?.[0] ?? null,
        lat: c?.[1] ?? null,
        precisionM: precision !== null && Number.isFinite(Number(precision)) ? Number(precision) : null,
        heureObservee: when ? heureLocale(when) : null,
        observation: contenu(pm.description),
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

    return { famille: 'waypoints', nom, points, trace: [], statistiques: {}, avertissements };
  }

  // --- Famille C : itinéraire dessiné ---------------------------------------
  const lignes = tousLes(doc, 'LineString');
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
        "Ce fichier est un itinéraire dessiné à la main : il montre le chemin prévu, non un relevé de terrain.",
      ],
    };
  }

  return {
    famille: 'inconnu',
    nom,
    points: [],
    trace: [],
    statistiques: {},
    avertissements: ['Aucun point ni tracé reconnu dans ce fichier.'],
  };
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

  const arretsBruts: { nom: string | null; lat: number; lng: number; when: string | null; desc: string | null }[] = [];
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
    type: classerLibelle(p.nom),
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
      points.push({
        voyage: 1,
        ordre: ++rang,
        nom: nomPoint,
        // Une propriété « type » ou « tags » est une étiquette délibérée : on
        // la traite comme telle. À défaut, on se rabat sur le libellé.
        type: typeBrut ? classer(typeBrut.split(',')) : classerLibelle(nomPoint),
        lat: c[1],
        lng: c[0],
        precisionM: null,
        heureObservee: null,
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
  // Un GeoJSON n'a pas d'ordre garanti : l'ordre du fichier est repris tel
  // quel, et il faut le dire plutôt que de laisser croire à une tournée.
  if (points.length > 1) {
    avertissements.push(
      "L'ordre de passage repris est celui du fichier. Un GeoJSON ne porte aucune heure de relevé : vérifiez-le, et complétez les heures à la main si nécessaire."
    );
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
