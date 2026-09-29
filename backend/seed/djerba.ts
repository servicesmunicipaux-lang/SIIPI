// ---------------------------------------------------------------------------
// Données réelles de Djerba : Houmt Souk, Midoun, Ajim.
//
// Source : la mission de suivi GPS de la FNCT (février-juin 2026), livrée en
// un dossier qui n'est PAS versionné ici — il contient les noms des
// chauffeurs, et le dépôt est public. Le script le lit là où on le pose :
//
//   DJERBA_DIR=/chemin/vers/le/dossier npm run seed:djerba
//
// Ce que le dossier contient, et ce qu'on en fait :
//
//   Mission_FNCT.xlsx         L'index des sorties : une ligne par sortie
//                             (commune, arrondissement, circuit, engin,
//                             immatriculation, heures de pesée, tonnage net),
//                             et le nom du fichier GPS de la sortie quand il
//                             y en a un. → circuits, engins, et la campagne
//                             d'observation de chaque circuit (tonnage compris).
//                             Pesées en table sur demande seulement
//                             (DJERBA_PESEES=1) : voir plus bas pourquoi.
//   GPX_FILES/*.gpx           Le tracé de chaque sortie (Geo Tracker), en
//                             UTC véritable. → tracé du circuit, distances.
//   GPSWpts-…-all_wpts.kml    TOUS les arrêts de TOUTES les sorties, relevés
//                             à la main (application « GPS Waypoints »), dans
//                             un seul fichier. → points de collecte.
//
// RATTACHER UN ARRÊT À SA SORTIE. Le fichier d'arrêts ne dit pas à quelle
// sortie appartient un arrêt : on le déduit de l'heure. Chaque sortie a une
// fenêtre (du premier au dernier point de son tracé) ; un arrêt pris dans une
// fenêtre appartient à cette sortie. Une sortie sans tracé (interrompue) prend
// les arrêts qui suivent son heure de départ et que nulle autre ne réclame.
// Vérifié sur le jeu de juin 2026 : 3 497 arrêts, 43 fenêtres, tous rattachés.
//
// LE PIÈGE DES FUSEAUX, UNE FOIS DE PLUS. Les arrêts sont horodatés en heure
// LOCALE suivie d'un « Z » (même défaut qu'à Dar Chaabane, voir
// services/kml.ts), les tracés GPX en UTC véritable. Lus ainsi, 3 430 arrêts
// sur 3 497 tombent dans une fenêtre de sortie ; lus tous deux comme UTC,
// 2 852 seulement. On ajoute donc une heure aux tracés, et rien aux arrêts.
//
// CE QUI N'EST PAS REPRIS, À DESSEIN.
//   - Les chauffeurs. Leur nom n'a aucune utilité pour décrire une tournée
//     (décret-loi 2022-54) ; il est même retiré du nom des arrêts où l'agent
//     l'avait écrit (« debut hdada arkou <nom> »). Et créer des agents fictifs
//     fausserait l'effectif de la commune, qui entre dans les indicateurs.
//   - Les lieux (marchés, cimetières, abattoirs) : aucun n'est situé dans le
//     relevé. Un circuit nommé « Mahboubine-Abbatoir » ne dit pas où est
//     l'abattoir ; on ne l'invente pas.
//   - Une valeur marquée « Fill Later », « Missing » ou en erreur dans
//     l'index : elle reste vide. Une donnée manquante n'est pas un zéro.
//   - Les engins sans immatriculation (Houmt Souk, février) : un engin sans
//     plaque ne s'identifie pas ; il est décrit dans la fiche du circuit.
//
// SÉCURITÉ. Chaque commune est écrite dans une transaction ouverte AU NOM DE
// SON DIRECTEUR (rôle siipi_app, admin_commune) : les politiques RLS
// s'appliquent à chaque ligne, et une ligne de Midoun ne peut pas atterrir à
// Ajim. Le script ne s'accorde aucun privilège que le directeur n'a pas.
//
// Rejouable : un circuit se reconnaît à son code, un engin à son identifiant,
// une pesée à sa date, son engin et son poids. Les arrêts d'un circuit sont
// remplacés (suppression logique) tant qu'aucun n'a été saisi à la main.
// ---------------------------------------------------------------------------

process.env.SIIPI_DB_CONTEXT = 'server';
const { pool } = await import('../src/db.js');
const { lireKml } = await import('../src/services/kml.js');

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type pg from 'pg';

const DOSSIER = process.env.DJERBA_DIR ?? join(process.cwd(), 'seed', 'data', 'djerba');
const LOG = (m: string) => console.log(`[djerba] ${m}`);

const COMMUNES: Record<string, { id: string; code: string }> = {
  'houmt souk': { id: 'medenine_djerba_houmt_souk', code: 'HS' },
  midoun: { id: 'medenine_djerba_midoun', code: 'MID' },
  ajim: { id: 'medenine_djerba_ajim', code: 'AJI' },
};

const HEURE = 3_600_000;
const JOUR = 24 * HEURE;

const sansAccent = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

// ---------------------------------------------------------------------------
// 1. Lecture de l'index Excel — sans bibliothèque : un .xlsx est une archive
//    zip de fichiers XML, et le dépôt a déjà de quoi lire l'un et l'autre.
// ---------------------------------------------------------------------------

function lireZip(buf: Buffer): Map<string, Buffer> {
  // Le répertoire central, à la fin de l'archive, donne des tailles fiables
  // même quand l'en-tête local les laisse à zéro (bit 3 des drapeaux).
  let fin = buf.length - 22;
  while (fin >= 0 && buf.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('Archive zip illisible (répertoire central absent).');
  const nb = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const fichiers = new Map<string, Buffer>();
  for (let k = 0; k < nb; k++) {
    const methode = buf.readUInt16LE(p + 10);
    const taille = buf.readUInt32LE(p + 20);
    const lnom = buf.readUInt16LE(p + 28);
    const lextra = buf.readUInt16LE(p + 30);
    const lcomm = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nom = buf.subarray(p + 46, p + 46 + lnom).toString('utf-8');
    const debut = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const donnees = buf.subarray(debut, debut + taille);
    fichiers.set(nom, methode === 0 ? donnees : inflateRawSync(donnees));
    p += 46 + lnom + lextra + lcomm;
  }
  return fichiers;
}

const decoderXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Première feuille d'un classeur, en lignes de cellules (texte brut ou null). */
function lireFeuille(chemin: string): (string | null)[][] {
  const zip = lireZip(readFileSync(chemin));
  const partagees = [...(zip.get('xl/sharedStrings.xml')?.toString('utf-8') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(
    (m) => decoderXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))
  );
  const feuille = zip.get('xl/worksheets/sheet1.xml')?.toString('utf-8');
  if (!feuille) throw new Error('Feuille « sheet1 » absente du classeur.');
  const colonne = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const lignes: (string | null)[][] = [];
  // Une ligne vide s'écrit <row …/> : sans cette alternative, elle avalerait
  // la ligne suivante.
  for (const [, contenu = ''] of feuille.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const ligne: (string | null)[] = [];
    for (const [, attrs, corps] of contenu.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attrs.match(/r="([A-Z]+\d+)"/)![1];
      const type = attrs.match(/t="(\w+)"/)?.[1];
      const v = corps?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const inline = corps?.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
      ligne[colonne(ref)] =
        type === 's' && v !== undefined ? partagees[Number(v)]
        : type === 'inlineStr' ? decoderXml(inline ?? '')
        : v !== undefined ? decoderXml(v)
        : null;
    }
    lignes.push(Array.from(ligne, (x) => x ?? null));
  }
  return lignes;
}

/** Un nombre de l'index, ou null s'il n'y en a pas (« Fill Later », « #VALUE! »…). */
const nombre = (v: string | null | undefined): number | null => {
  if (v === null || v === undefined || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Date série Excel (jours depuis le 30/12/1899) → minuit de ce jour, en
// millisecondes « heure locale naïve » : toutes les heures du script sont
// exprimées ainsi, sans fuseau, pour que l'arithmétique reste simple.
const dateExcel = (serie: number) => Date.UTC(1899, 11, 30) + Math.round(serie) * JOUR;
const fractionJour = (f: number) => Math.round(f * 86_400) * 1000;
const jourIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const heureIso = (ms: number) => new Date(ms).toISOString().slice(11, 19);

// ---------------------------------------------------------------------------
// 2. Les sorties
// ---------------------------------------------------------------------------

interface PointTrace {
  t: number; // heure locale naïve, ms
  lat: number;
  lng: number;
}

interface Sortie {
  ligne: number;
  fichier: string | null;
  communeId: string;
  communeCode: string;
  jour: number; // minuit local
  depart: number | null;
  p1: number | null;
  p2: number | null;
  arrondissement: string | null;
  circuit: string | null;
  remarque: string | null;
  camion: string | null;
  modele: string | null;
  immat: string | null;
  tonnageKg: number | null;
  trace: PointTrace[];
  fenetre: [number, number] | null;
  arrets: Arret[];
}

interface Arret {
  t: number;
  bloc: string; // le <Placemark> d'origine, tel quel
  nom: string;
  tags: string[];
  lat: number;
  lng: number;
}

function lireIndex(conducteurs: Set<string>): Sortie[] {
  const lignes = lireFeuille(join(DOSSIER, 'Mission_FNCT.xlsx'));
  const entete = lignes[0].map((h) => (h ? sansAccent(h) : ''));
  const col = (nom: string) => {
    const i = entete.indexOf(nom);
    if (i < 0) throw new Error(`Colonne « ${nom} » absente de Mission_FNCT.xlsx.`);
    return i;
  };
  const C = {
    fichier: col('kml file'),
    date: col('starting date'),
    depart: col('starting timepoint'),
    p1: col('weighting p1 timepoint'),
    p2: col('weighting p2 timepoint'),
    commune: col('commune'),
    arrondissement: col('arrondissement'),
    circuit: col('circuit'),
    conducteur: col('conducteur'),
    remarque: col('remarque'),
    camion: col('camion'),
    modele: col('modele'),
    immat: col('immatricule'),
    tonnage: col('tonnage'),
  };
  const sorties: Sortie[] = [];
  lignes.slice(1).forEach((l, i) => {
    const commune = l[C.commune] ? COMMUNES[sansAccent(l[C.commune]!)] : undefined;
    const serie = nombre(l[C.date]);
    if (!commune || serie === null) return;
    // Le nom du chauffeur ne sert qu'à le retirer des noms d'arrêts.
    for (const mot of sansAccent(l[C.conducteur] ?? '').split(' ')) if (mot.length >= 4) conducteurs.add(mot);
    const jour = dateExcel(serie);
    const f = (k: number) => {
      const n = nombre(l[k]);
      return n === null || n < 0 || n >= 1 ? null : fractionJour(n);
    };
    const texte = (k: number) => (l[k] && l[k]!.trim() ? l[k]!.trim() : null);
    sorties.push({
      ligne: i + 2,
      fichier: texte(C.fichier)?.replace(/\.(kml|gpx)$/i, '') ?? null,
      communeId: commune.id,
      communeCode: commune.code,
      jour,
      depart: f(C.depart),
      p1: f(C.p1),
      p2: f(C.p2),
      arrondissement: texte(C.arrondissement),
      circuit: texte(C.circuit),
      remarque: texte(C.remarque),
      camion: texte(C.camion),
      modele: texte(C.modele),
      immat: texte(C.immat),
      tonnageKg: nombre(l[C.tonnage]) !== null && nombre(l[C.tonnage])! > 0 ? nombre(l[C.tonnage]) : null,
      trace: [],
      fenetre: null,
      arrets: [],
    });
  });
  return sorties;
}

function lireTrace(fichier: string): PointTrace[] {
  const chemin = join(DOSSIER, 'GPX_FILES', `${fichier}.gpx`);
  if (!existsSync(chemin)) return [];
  const xml = readFileSync(chemin, 'utf-8');
  const points: PointTrace[] = [];
  // Les <trkpt> seulement : les <wpt> de Geo Tracker sont des arrêts détectés
  // automatiquement (« Stop for ~2 min »), pas des points de collecte.
  for (const [, lat, lng, corps] of xml.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)"\s*>([\s\S]*?)<\/trkpt>/g)) {
    const quand = corps.match(/<time>([^<]+)<\/time>/)?.[1];
    if (!quand) continue;
    // UTC véritable → heure locale (UTC+1, sans heure d'été en Tunisie).
    points.push({ t: Date.parse(quand) + HEURE, lat: Number(lat), lng: Number(lng) });
  }
  return points;
}

function lireArrets(): Arret[] {
  const fichier = readdirSync(DOSSIER).find((f) => /^GPSWpts.*\.kml$/i.test(f));
  if (!fichier) throw new Error('Fichier des arrêts (GPSWpts-…kml) absent du dossier.');
  const xml = readFileSync(join(DOSSIER, fichier), 'utf-8');
  const arrets: Arret[] = [];
  for (const [bloc] of xml.matchAll(/<Placemark>[\s\S]*?<\/Placemark>/g)) {
    const quand = bloc.match(/<when>([^<]+)<\/when>/)?.[1];
    const coords = bloc.match(/<coordinates>([^<]+)<\/coordinates>/)?.[1];
    if (!quand || !coords) continue;
    const [lng, lat] = coords.trim().split(',').map(Number);
    const tags = decoderXml(bloc.match(/<Data name="tags">[\s\S]*?<value>([\s\S]*?)<\/value>/)?.[1] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    arrets.push({
      // Heure locale écrite avec un « Z » : on garde les chiffres tels quels.
      t: Date.parse(quand.replace(/Z$/, '') + 'Z'),
      bloc,
      nom: decoderXml(bloc.match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? '').trim(),
      tags,
      lat,
      lng,
    });
  }
  return arrets.sort((a, b) => a.t - b.t);
}

/** Répartit les arrêts entre les sorties d'après l'heure. Rend les orphelins. */
function rattacher(sorties: Sortie[], arrets: Arret[]): Arret[] {
  const MARGE = 20 * 60_000;
  const avecFenetre = sorties.filter((s) => s.fenetre);
  const restants: Arret[] = [];
  for (const a of arrets) {
    // 1. Dans une fenêtre de tracé.
    const dedans = avecFenetre.filter((s) => s.fenetre![0] <= a.t && a.t <= s.fenetre![1]);
    if (dedans.length >= 1) {
      dedans[0].arrets.push(a);
      continue;
    }
    // 2. Juste avant le départ ou juste après l'arrivée (le premier repère se
    //    pose parfois avant que le suivi ne démarre) : la fenêtre la plus proche.
    let proche: Sortie | null = null;
    let ecart = MARGE;
    for (const s of avecFenetre) {
      const e = a.t < s.fenetre![0] ? s.fenetre![0] - a.t : a.t - s.fenetre![1];
      if (e <= ecart) {
        ecart = e;
        proche = s;
      }
    }
    if (proche) proche.arrets.push(a);
    else restants.push(a);
  }
  // 3. Sorties sans tracé : les arrêts qui suivent leur départ, jusqu'à six
  //    heures et avant la sortie suivante.
  const orphelins: Arret[] = [];
  const sansTrace = sorties.filter((s) => !s.fenetre && s.depart !== null);
  for (const a of restants) {
    const s = sansTrace.find((x) => {
      const debut = x.jour + x.depart!;
      if (a.t < debut - MARGE || a.t > debut + 6 * HEURE) return false;
      return !avecFenetre.some((y) => y.fenetre![0] > debut && y.fenetre![0] <= a.t);
    });
    if (s) s.arrets.push(a);
    else orphelins.push(a);
  }
  return orphelins;
}

// ---------------------------------------------------------------------------
// 3. Ce que les étiquettes disent d'un arrêt
// ---------------------------------------------------------------------------

// Les contenants, comptés.
function compter(tags: string[]) {
  const n = { metal: 0, plastique: 0, demi: 0, bacs: 0 };
  for (const t of tags) {
    const s = sansAccent(t);
    // « 360 L Plastique », « 240 L Plastique x2 » : un bac d'un volume donné,
    // multiplié le cas échéant. Le nombre en tête est un volume, pas un compte.
    const bac = s.match(/^(\d+) l plastique(?: x ?(\d+))?$/) ?? s.match(/^bacs? \d+ l(?: x ?(\d+))?$/);
    if (bac) {
      n.bacs += Number(bac[2] ?? (s.startsWith('bac') ? bac[1] : undefined) ?? 1) || 1;
      continue;
    }
    const m = s.match(/^(?:(\d+) )?(.*?)(?: x ?(\d+))?$/)!;
    const k = (m[1] ? Number(m[1]) : 1) * (m[3] ? Number(m[3]) : 1);
    if (/^conteneurs? metalliques?$/.test(m[2])) n.metal += k;
    else if (/^conteneurs? plastiques?$/.test(m[2])) n.plastique += k;
    else if (/^demi futs?$/.test(m[2])) n.demi += k;
  }
  return n;
}

// Les états, en étiquettes de couleur (B3.5). Les autres mentions — « hand
// picked », « repetition »… — restent lisibles dans le relevé brut.
const ETATS: Record<string, [string, string]> = {
  casse: ['Conteneur cassé', 'rouge'],
  'hors conteneur': ['Déchets hors conteneur', 'orange'],
  vide: ['Vide au passage', 'bleu'],
  'dechet vert': ['Déchets verts', 'vert'],
  fumier: ['Fumier', 'ambre'],
  encombrant: ['Encombrants', 'violet'],
  'dechet de construction': ['Déchets de construction', 'ardoise'],
  'dechet dabattage': ["Déchets d'abattage", 'rose'],
  pneux: ['Pneus', 'emeraude'],
  prive: ['Point privé', 'violet'],
};

const CHAMPS: { cle: string; libelle: string; ar: string; type: 'nombre' | 'texte' | 'date' }[] = [
  { cle: 'metal', libelle: 'Conteneurs métalliques', ar: 'حاويات معدنية', type: 'nombre' },
  { cle: 'demi', libelle: 'Demi-fûts', ar: 'أنصاف براميل', type: 'nombre' },
  { cle: 'plastique', libelle: 'Conteneurs plastique', ar: 'حاويات بلاستيكية', type: 'nombre' },
  { cle: 'bacs', libelle: 'Bacs plastique', ar: 'حاويات صغيرة', type: 'nombre' },
  { cle: 'releve', libelle: 'Relevé terrain (étiquettes)', ar: 'ملاحظات المعاينة', type: 'texte' },
  { cle: 'date', libelle: 'Date du relevé', ar: 'تاريخ المعاينة', type: 'date' },
];

// ---------------------------------------------------------------------------
// 4. Le nom d'un arrêt, sans le nom de personne
// ---------------------------------------------------------------------------

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/**
 * Le nom d'un arrêt tel que l'agent l'a écrit, sauf s'il désigne une personne.
 * Un nom propre s'écrit de plusieurs façons (« Mohammed » à l'index,
 * « mohamed » sur le terrain) : la comparaison tolère une ou deux lettres
 * d'écart. Dans le
 * doute on retire tout le libellé, jamais un morceau : un nom tronqué ne
 * protège personne. Un point étiqueté « privé » perd aussi son nom — c'est une
 * habitation.
 */
function nomPublic(nom: string, tags: string[], conducteurs: Set<string>): { nom: string | null; retire: boolean } {
  const n = nom.trim();
  if (!n || /^(IMP|WPT)\s*\d+$/i.test(n)) return { nom: n || null, retire: false };
  const prefixe = n.match(/^(IMP|WPT)\s*\d+/i)?.[0] ?? null;
  const prive = tags.some((t) => sansAccent(t) === 'prive');
  const personne = sansAccent(n)
    .split(' ')
    .filter((m) => m.length >= 4)
    .some((m) => [...conducteurs].some((c) => distance(m, c) <= (Math.min(m.length, c.length) >= 7 ? 2 : 1)));
  return personne || prive ? { nom: prefixe, retire: true } : { nom: n, retire: false };
}

// ---------------------------------------------------------------------------
// 5. Géométrie
// ---------------------------------------------------------------------------

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Distance parcourue sur le tracé entre deux instants. */
function distanceEntre(trace: PointTrace[], debut: number, fin: number): number {
  const seg = trace.filter((p) => p.t >= debut && p.t <= fin);
  let km = 0;
  for (let i = 1; i < seg.length; i++) km += haversineKm(seg[i - 1], seg[i]);
  return km;
}

const minutes = (ms: number) => Math.round(ms / 60_000);
const arrondi = (x: number, n = 2) => Math.round(x * 10 ** n) / 10 ** n;

// ---------------------------------------------------------------------------
// 6. Écriture, commune par commune, au nom de son directeur
// ---------------------------------------------------------------------------

async function auNomDuDirecteur<T>(communeId: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dir = (
      await client.query<{ id: string; email: string }>(
        `SELECT id, email FROM users
          WHERE commune_id = $1 AND role = 'admin_commune' AND is_active AND deleted_at IS NULL
          ORDER BY created_at LIMIT 1`,
        [communeId]
      )
    ).rows[0];
    if (!dir) throw new Error(`Aucun directeur actif pour ${communeId} : rien n'est écrit au nom de personne.`);
    await client.query(
      `SELECT set_config('app.user_id', $1, true), set_config('app.role', 'admin_commune', true),
              set_config('app.commune_id', $2, true)`,
      [dir.id, communeId]
    );
    await client.query('SET LOCAL ROLE siipi_app');
    LOG(`${communeId} : écriture au nom de ${dir.email} (RLS appliquée)`);
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const identifiantEngin = (immat: string) => `djb-${immat.replace(/\D/g, '')}`;
const typeEngin = (camion: string | null) =>
  camion && /tasseuse/i.test(camion) ? 'benne_tasseuse' : camion && /bas?c?ulante/i.test(camion) ? 'camion' : 'autre';
const libelleEngin = (s: Sortie) =>
  [s.camion?.replace(/Baculante/i, 'Basculante'), s.modele].filter(Boolean).join(' ') || 'Engin non précisé';

const slug = (s: string) =>
  sansAccent(s)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Le code d'un circuit : stable d'un import à l'autre, c'est lui qui évite les doublons. */
const codeCircuit = (s: Sortie) =>
  `DJB-${s.communeCode}-${s.circuit ? slug(s.circuit) : `SANS-NOM-${jourIso(s.jour).replace(/-/g, '')}`}`;

async function main() {
  if (!existsSync(join(DOSSIER, 'Mission_FNCT.xlsx'))) {
    throw new Error(
      `Dossier de la mission introuvable (${DOSSIER}). Le poser, ou indiquer son chemin par DJERBA_DIR.`
    );
  }
  LOG(`dossier : ${DOSSIER}`);

  const conducteurs = new Set<string>();
  const sorties = lireIndex(conducteurs);
  for (const s of sorties) {
    if (!s.fichier) continue;
    s.trace = lireTrace(s.fichier);
    if (s.trace.length >= 2) s.fenetre = [s.trace[0].t, s.trace[s.trace.length - 1].t];
    else LOG(`AVERTISSEMENT ligne ${s.ligne} : tracé ${s.fichier}.gpx absent ou vide`);
  }
  const arrets = lireArrets();
  const orphelins = rattacher(sorties, arrets);
  LOG(
    `${sorties.length} sorties à l'index, dont ${sorties.filter((s) => s.fenetre).length} avec tracé ; ` +
      `${arrets.length} arrêts, ${arrets.length - orphelins.length} rattachés à une sortie` +
      (orphelins.length ? `, ${orphelins.length} sans sortie (écartés)` : '')
  );

  // --- Les arrêts de chaque sortie, lus par le lecteur de l'application -----
  //
  // On repasse par lireKml, et non par une lecture maison : l'import d'un
  // fichier depuis l'écran « Circuits » et ce script classent ainsi les
  // points de la même façon, voyages et repères de début et de fin compris.
  let nomsRetires = 0;
  const lus = new Map<Sortie, { points: ReturnType<typeof lireKml>['points']; arret: (p: { lat: number; lng: number; heureObservee: string | null }) => Arret | undefined }>();
  for (const s of sorties) {
    if (s.arrets.length === 0) continue;
    const kml =
      '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>' +
      `<name>${s.fichier ?? 'sortie'}</name><Folder><name>Waypoints</name>${s.arrets.map((a) => a.bloc).join('')}` +
      '</Folder></Document></kml>';
    const lu = lireKml(kml);
    const index = new Map(s.arrets.map((a) => [`${a.lng}|${a.lat}|${heureIso(a.t)}`, a]));
    lus.set(s, { points: lu.points, arret: (p) => index.get(`${p.lng}|${p.lat}|${p.heureObservee}`) });
  }

  // --- Les circuits : une sortie de référence par circuit -------------------
  //
  // Un circuit suivi plusieurs fois (Hdada-Arkou : trois sorties) n'a qu'une
  // liste d'arrêts : celle de la sortie la plus complète, la plus récente à
  // égalité. Les autres sorties restent dans la description et les pesées.
  interface Circuit {
    code: string;
    nom: string;
    communeId: string;
    sorties: Sortie[];
    reference: Sortie;
  }
  const circuits = new Map<string, Circuit>();
  for (const s of sorties) {
    if (!lus.has(s) && !s.circuit) continue;
    const nom = s.circuit ?? `Circuit sans nom — ${s.arrondissement ?? 'arrondissement non précisé'}, ${jourIso(s.jour)}`;
    const code = codeCircuit(s);
    const c = circuits.get(code) ?? { code, nom, communeId: s.communeId, sorties: [], reference: s };
    c.sorties.push(s);
    circuits.set(code, c);
  }
  for (const c of circuits.values()) {
    const avecPoints = c.sorties.filter((s) => (lus.get(s)?.points.length ?? 0) > 0);
    if (avecPoints.length === 0) continue;
    c.reference = avecPoints.reduce((m, s) =>
      lus.get(s)!.points.length > lus.get(m)!.points.length ||
      (lus.get(s)!.points.length === lus.get(m)!.points.length && s.jour + (s.depart ?? 0) > m.jour + (m.depart ?? 0))
        ? s
        : m
    );
  }
  const circuitsAvecPoints = [...circuits.values()].filter((c) => lus.get(c.reference)?.points.length);

  // --- Écriture -------------------------------------------------------------
  const bilan: Record<string, Record<string, number>> = {};
  for (const commune of Object.values(COMMUNES)) {
    const siennes = sorties.filter((s) => s.communeId === commune.id);
    if (siennes.length === 0) continue;
    const b = (bilan[commune.id] = { engins: 0, circuits: 0, arrets: 0, pesees: 0, peseesExistantes: 0, circuitsProteges: 0 });

    await auNomDuDirecteur(commune.id, async (db) => {
      // Les engins : ceux dont l'immatriculation a été relevée.
      const engins = new Map<string, Sortie>();
      for (const s of siennes) if (s.immat) engins.set(s.immat, s);
      for (const [immat, s] of engins) {
        const id = identifiantEngin(immat);
        const r = await db.query(
          `INSERT INTO vehicules (id, registration, commune_id, type, categorie, marque, domaine_emploi)
           VALUES ($1,$2,$3,$4,'poids_lourd',$5,'Propreté (levée des déchets)')
           ON CONFLICT (id) DO UPDATE SET registration = EXCLUDED.registration, type = EXCLUDED.type,
                  marque = EXCLUDED.marque
           RETURNING (xmax = 0) AS cree`,
          [id, immat, commune.id, typeEngin(s.camion), s.modele]
        );
        if (r.rows[0].cree) b.engins++;
      }

      // Les champs libres et les étiquettes de la commune (Jalon 6).
      const champs: Record<string, string> = {};
      for (const [i, ch] of CHAMPS.entries()) {
        const existant = await db.query<{ id: string }>(
          `SELECT id FROM champs_points WHERE commune_id = $1 AND lower(btrim(libelle)) = lower($2) AND deleted_at IS NULL`,
          [commune.id, ch.libelle]
        );
        champs[ch.cle] =
          existant.rows[0]?.id ??
          (
            await db.query<{ id: string }>(
              `INSERT INTO champs_points (commune_id, libelle, libelle_ar, type, ordre) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
              [commune.id, ch.libelle, ch.ar, ch.type, 100 + i]
            )
          ).rows[0].id;
      }
      const etiquettes: Record<string, string> = {};
      for (const [cle, [nom, couleur]] of Object.entries(ETATS)) {
        const existant = await db.query<{ id: string }>(
          `SELECT id FROM etiquettes_points WHERE commune_id = $1 AND lower(btrim(nom)) = lower($2) AND deleted_at IS NULL`,
          [commune.id, nom]
        );
        etiquettes[cle] =
          existant.rows[0]?.id ??
          (
            await db.query<{ id: string }>(
              `INSERT INTO etiquettes_points (commune_id, nom, couleur) VALUES ($1,$2,$3) RETURNING id`,
              [commune.id, nom, couleur]
            )
          ).rows[0].id;
      }

      // Les circuits.
      const idsCircuits = new Map<string, string>();
      for (const c of [...circuits.values()].filter((x) => x.communeId === commune.id)) {
        const ref = c.reference;
        const lu = lus.get(ref);
        const points = lu?.points ?? [];
        const voyages = points.length ? Math.max(...points.map((p) => p.voyage)) : 1;
        const pdc = points.filter((p) => p.type === 'point_de_collecte').length;
        const pap = points.filter((p) => p.type === 'porte_a_porte').length;
        const part = pdc + pap > 0 ? pdc / (pdc + pap) : null;
        const mode = part === null ? 'mixte' : part >= 0.8 ? 'conteneurs' : part <= 0.2 ? 'porte_a_porte' : 'mixte';

        // La campagne d'observation, sur la sortie de référence. Un temps de
        // collecte ne se mesure qu'entre les repères « début collecte » et
        // « fin collecte » posés par l'agent : sans eux, l'intervalle compterait
        // le trajet depuis le parc, et le chiffre serait faux sans le dire. Un
        // voyage sans ses deux repères laisse donc le temps et la distance vides.
        const instants = points.map((p) => lu!.arret(p)?.t ?? null);
        let tempsCollecte: number | null = null;
        let distCollecte: number | null = null;
        let complet = true;
        for (let v = 1; v <= voyages; v++) {
          const i0 = points.findIndex((p) => p.voyage === v);
          const i1 = points.map((p) => p.voyage).lastIndexOf(v);
          const t0 = instants[i0];
          const t1 = instants[i1];
          if (points[i0]?.type !== 'debut_collecte' || points[i1]?.type !== 'fin_collecte' || t0 === null || t1 === null) {
            complet = false;
            break;
          }
          tempsCollecte = (tempsCollecte ?? 0) + (t1 - t0);
          if (ref.trace.length) distCollecte = (distCollecte ?? 0) + distanceEntre(ref.trace, t0, t1);
        }
        if (!complet) {
          tempsCollecte = null;
          distCollecte = null;
        }
        const premier = points[0]?.type === 'debut_collecte' ? instants[0] : null;
        const parc =
          ref.fenetre && premier !== null && premier > ref.fenetre[0]
            ? { min: minutes(premier - ref.fenetre[0]), km: arrondi(distanceEntre(ref.trace, ref.fenetre[0], premier)) }
            : null;
        // Déchargement puis retour, au sens de la fiche du circuit : deux
        // TRAJETS, en minutes et en kilomètres — de la fin de collecte à la
        // sortie du pont-bascule (seconde pesée, P2), puis de là à la fin du
        // tracé, au parc. Le « temps de déchargement » de l'index (P2 − P1)
        // n'est que le passage sur la bascule : ce n'est pas la même mesure.
        const tFin = complet && points.length ? instants[points.length - 1] : null;
        let tP2 = ref.p2 !== null ? ref.jour + ref.p2 : null;
        if (tP2 !== null && tFin !== null && tP2 < tFin) tP2 += JOUR; // pesée passé minuit
        const trajets =
          ref.fenetre && tFin !== null && tP2 !== null && tP2 <= ref.fenetre[1]
            ? {
                dechMin: minutes(tP2 - tFin),
                dechKm: arrondi(distanceEntre(ref.trace, tFin, tP2)),
                retourMin: minutes(ref.fenetre[1] - tP2),
                retourKm: arrondi(distanceEntre(ref.trace, tP2, ref.fenetre[1])),
              }
            : null;

        const dates = [...new Set(c.sorties.map((s) => jourIso(s.jour)))].sort();
        const remarques = [...new Set(c.sorties.map((s) => s.remarque).filter(Boolean))];
        const engin = ref.immat ? `${libelleEngin(ref)} ${ref.immat}` : `${libelleEngin(ref)} (immatriculation non relevée)`;
        const description =
          `Relevé GPS de la mission FNCT — ${c.sorties.length} sortie(s) : ${dates.join(', ')}. ` +
          `Arrêts et tracé : sortie du ${jourIso(ref.jour)}. Engin : ${engin}.` +
          (remarques.length ? ` Remarques du relevé : ${remarques.join(' ; ')}.` : '');

        const trace =
          ref.trace.length >= 2 ? `LINESTRING(${ref.trace.map((p) => `${p.lng} ${p.lat}`).join(',')})` : null;
        const valeurs = [
          commune.id, // 1
          c.nom, // 2
          c.code, // 3
          description, // 4
          mode, // 5
          voyages, // 6
          ref.arrondissement, // 7
          ref.immat ? identifiantEngin(ref.immat) : null, // 8
          ref.immat, // 9
          dates[0], // 10
          jourIso(ref.jour), // 11
          tempsCollecte !== null ? minutes(tempsCollecte) : null, // 12
          distCollecte !== null ? arrondi(distCollecte) : null, // 13
          parc?.min ?? null, // 14
          parc?.km ?? null, // 15
          trajets?.dechMin ?? null, // 16
          ref.tonnageKg !== null ? arrondi(ref.tonnageKg / 1000, 3) : null, // 17
          trace, // 18
          ref.fichier ? `${ref.fichier}.gpx` : null, // 19
          trajets?.dechKm ?? null, // 20
          trajets?.retourMin ?? null, // 21
          trajets?.retourKm ?? null, // 22
        ];
        const existant = await db.query<{ id: string }>(
          'SELECT id FROM circuits WHERE commune_id = $1 AND code = $2 AND deleted_at IS NULL',
          [commune.id, c.code]
        );
        let id: string;
        if (existant.rows[0]) {
          id = existant.rows[0].id;
          await db.query(
            `UPDATE circuits SET nom=$2, description=$4, mode_collecte=$5, voyages_par_jour=$6, secteur_nom=$7,
                    vehicule_id=$8, vehicule_immat=$9, date_debut=$10::date, etude_date=$11::date,
                    etude_temps_collecte_min=$12, etude_distance_collecte_km=$13, etude_temps_parc_min=$14,
                    etude_distance_parc_km=$15, etude_temps_dechargement_min=$16, etude_tonnage_t=$17,
                    etude_distance_dechargement_km=$20, etude_temps_retour_min=$21, etude_distance_retour_km=$22,
                    trace = CASE WHEN $18::text IS NULL THEN trace ELSE ST_Multi(ST_SetSRID(ST_GeomFromText($18), 4326)) END,
                    trace_source = CASE WHEN $18::text IS NULL THEN trace_source ELSE 'gps_observe' END,
                    trace_fichier = COALESCE($19, trace_fichier),
                    trace_importee_le = CASE WHEN $18::text IS NULL THEN trace_importee_le ELSE now() END,
                    updated_at = now()
              WHERE id = $23 AND commune_id = $1 AND code = $3`,
            [...valeurs, id]
          );
        } else {
          id = (
            await db.query<{ id: string }>(
              `INSERT INTO circuits
                 (commune_id, nom, code, description, jours_passage, type_dechet, mode_collecte, voyages_par_jour,
                  secteur_nom, vehicule_id, vehicule_immat, date_debut, etude_date, etude_temps_collecte_min,
                  etude_distance_collecte_km, etude_temps_parc_min, etude_distance_parc_km,
                  etude_temps_dechargement_min, etude_tonnage_t, trace, trace_source, trace_fichier, trace_importee_le,
                  etude_distance_dechargement_km, etude_temps_retour_min, etude_distance_retour_km)
               VALUES ($1,$2,$3,$4, ARRAY[]::smallint[], 'menager', $5,$6,$7,$8,$9,$10::date,$11::date,$12,$13,$14,$15,$16,$17,
                       CASE WHEN $18::text IS NULL THEN NULL ELSE ST_Multi(ST_SetSRID(ST_GeomFromText($18), 4326)) END,
                       CASE WHEN $18::text IS NULL THEN NULL ELSE 'gps_observe' END, $19,
                       CASE WHEN $18::text IS NULL THEN NULL ELSE now() END, $20, $21, $22)
               RETURNING id`,
              valeurs
            )
          ).rows[0].id;
          b.circuits++;
        }
        idsCircuits.set(c.code, id);
        if (points.length === 0) continue;

        // Les arrêts : posés une fois. Un circuit qui en a déjà les garde — la
        // commune a pu depuis étiqueter un conteneur cassé ou corriger un
        // compte, et un réimport ne doit pas l'effacer en silence. On ne les
        // remplace que sur demande (DJERBA_REMPLACER=1), et jamais quand la
        // commune en a saisi elle-même.
        const deja = await db.query<{ n: number; saisis: number }>(
          `SELECT count(*)::int AS n, count(*) FILTER (WHERE source <> 'import_kml')::int AS saisis
             FROM points_collecte WHERE circuit_id = $1 AND deleted_at IS NULL`,
          [id]
        );
        if (deja.rows[0].saisis > 0 || (deja.rows[0].n > 0 && process.env.DJERBA_REMPLACER !== '1')) {
          b.circuitsProteges++;
          if (deja.rows[0].saisis > 0)
            LOG(`${c.code} : ${deja.rows[0].saisis} point(s) saisis par la commune — arrêts laissés en l'état`);
          continue;
        }
        await db.query(
          `UPDATE points_collecte SET deleted_at = now(), deleted_by = app.current_user_id()
            WHERE circuit_id = $1 AND deleted_at IS NULL`,
          [id]
        );
        for (const p of points) {
          const a = lu!.arret(p);
          const tags = a?.tags ?? [];
          const n = compter(tags);
          const attributs: Record<string, unknown> = {};
          for (const k of ['metal', 'demi', 'plastique', 'bacs'] as const) if (n[k] > 0) attributs[champs[k]] = n[k];
          if (tags.length) attributs[champs.releve] = tags.join(', ');
          if (a) attributs[champs.date] = jourIso(a.t - (a.t % JOUR));
          const ids = [...new Set(tags.map((t) => etiquettes[sansAccent(t)]).filter(Boolean))];
          const { nom, retire } = nomPublic(p.nom ?? '', tags, conducteurs);
          if (retire) nomsRetires++;
          await db.query(
            `INSERT INTO points_collecte
               (circuit_id, commune_id, voyage, ordre, nom, type, geom, precision_m, heure_observee, source,
                attributs, etiquettes)
             VALUES ($1,$2,$3,$4,$5,$6, ST_SetSRID(ST_MakePoint($7,$8),4326), $9, $10::time, 'import_kml',
                     $11::jsonb, $12::uuid[])`,
            [id, commune.id, p.voyage, p.ordre, nom, p.type, p.lng, p.lat, p.precisionM, p.heureObservee,
             JSON.stringify(attributs), ids]
          );
          b.arrets++;
        }
        await db.query(
          `UPDATE circuits SET points_importes_le = now(), points_fichier = $2 WHERE id = $1`,
          [id, `GPSWpts (mission FNCT), sortie du ${jourIso(ref.jour)}`]
        );
      }

      // Les pesées : une par sortie dont le tonnage a été relevé — SUR DEMANDE
      // SEULEMENT (DJERBA_PESEES=1). La mission a pesé un ÉCHANTILLON de
      // sorties, pas l'année : les indicateurs lisent la table des pesées
      // comme le tonnage de la commune, et 37 pesées y afficheraient Midoun à
      // 0,03 kg par habitant et par jour, trente fois moins que la réalité. Un
      // chiffre faux présenté comme mesuré. Par défaut, le tonnage de chaque
      // circuit reste donc dans sa fiche (campagne d'observation), daté.
      for (const s of process.env.DJERBA_PESEES === '1' ? siennes : []) {
        if (s.tonnageKg === null || !s.immat) continue;
        // Une pesée passé minuit appartient au lendemain (sorties de nuit).
        const jour = s.p1 !== null && s.depart !== null && s.p1 < s.depart ? s.jour + JOUR : s.jour;
        const circuitId = idsCircuits.get(codeCircuit(s)) ?? null;
        const vehiculeId = identifiantEngin(s.immat);
        const deja = await db.query(
          `SELECT 1 FROM pesees WHERE commune_id = $1 AND date_pesee = $2::date AND vehicule_id = $3
              AND poids_net_kg = $4 AND deleted_at IS NULL`,
          [commune.id, jourIso(jour), vehiculeId, s.tonnageKg]
        );
        if (deja.rowCount) {
          b.peseesExistantes++;
          continue;
        }
        const observation = [
          'Mission FNCT (index Mission_FNCT.xlsx)',
          s.p1 !== null ? `pesée P1 ${heureIso(s.p1).slice(0, 5)}` : null,
          s.p2 !== null ? `P2 ${heureIso(s.p2).slice(0, 5)}` : null,
          circuitId ? null : 'circuit non précisé au relevé',
          s.remarque,
        ]
          .filter(Boolean)
          .join(' — ');
        await db.query(
          `INSERT INTO pesees (commune_id, date_pesee, circuit_id, voyage, vehicule_id, vehicule_immat, type_dechet,
                               poids_net_kg, observation, source, saisi_par)
           VALUES ($1,$2::date,$3,1,$4,$5,'menager',$6,$7,'anged', app.current_user_id())`,
          [commune.id, jourIso(jour), circuitId, vehiculeId, s.immat, s.tonnageKg, observation]
        );
        b.pesees++;
      }
    });
  }

  // --- Bilan ----------------------------------------------------------------
  for (const [commune, b] of Object.entries(bilan)) {
    LOG(
      `${commune} : ${b.engins} engin(s) créé(s), ${b.circuits} circuit(s) créé(s), ${b.arrets} arrêt(s), ` +
        `${b.pesees} pesée(s)` +
        (b.peseesExistantes ? ` (+${b.peseesExistantes} déjà présentes)` : '') +
        (b.circuitsProteges ? `, arrêts déjà en place sur ${b.circuitsProteges} circuit(s) (laissés en l'état)` : '')
    );
  }
  LOG(`${circuitsAvecPoints.length} circuits avec arrêts ; ${nomsRetires} nom(s) d'arrêt retiré(s) (personne ou habitation)`);
  const sansTonnage = sorties.filter((s) => s.fichier && s.tonnageKg === null).length;
  if (process.env.DJERBA_PESEES !== '1') {
    LOG(
      'pesées : non créées — la mission a pesé un échantillon de sorties, que les indicateurs liraient comme ' +
        "l'année entière. Le tonnage est dans la fiche de chaque circuit. DJERBA_PESEES=1 pour les créer quand même."
    );
  } else if (sansTonnage) {
    LOG(`${sansTonnage} sortie(s) suivie(s) au GPS sans tonnage relevé : aucune pesée créée pour elles`);
  }
  await pool.end();
}

main().catch(async (err) => {
  console.error('[djerba] échec :', err instanceof Error ? (process.env.DEBUG ? err.stack : err.message) : err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
