// Stockage des fichiers déposés : reconnaissance du type, nettoyage, écriture.
//
// TROIS PRINCIPES, ET CHACUN A SA RAISON.
//
// 1. LE TYPE EST CELUI DES OCTETS. Ce que le client annonce — extension,
//    en-tête déclaré — n'est pas une information, c'est une affirmation. Un
//    exécutable renommé « photo.jpg » l'annoncerait tout aussi bien. Seule la
//    signature binaire est examinée, et un fichier dont la signature n'est pas
//    reconnue est refusé, jamais « stocké au cas où ».
//
// 2. LES MÉTADONNÉES DE PHOTO NE SURVIVENT PAS AU DÉPÔT. Un téléphone écrit
//    dans chaque photo la position GPS, l'heure, le modèle de l'appareil et
//    parfois le nom de son propriétaire. Un citoyen qui signale un dépôt
//    sauvage devant chez lui transmettrait ainsi, sans le savoir, les
//    coordonnées de son domicile — et la commune les conserverait des années.
//    Le décret-loi n° 2022-54 appelle cela une collecte sans finalité ni
//    consentement ; c'en est une.
//
//    La position n'est pas jetée pour autant : elle est RENDUE À L'APPELANT,
//    qui peut la proposer à la personne (« utiliser la position de la photo ? »)
//    et ne l'enregistrer que si elle accepte. La différence entre les deux
//    gestes est exactement la différence entre une donnée fournie et une
//    donnée prélevée.
//
// 3. LE NOM DU FICHIER NE CONSTRUIT JAMAIS UN CHEMIN. Le nom d'origine est
//    conservé pour le proposer au téléchargement, et c'est tout. Le chemin est
//    bâti à partir de l'identifiant tiré par la base — un « ../../etc/passwd »
//    déposé comme nom de fichier n'a aucune conséquence.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

export type TypeFichier = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

/** Plafond appliqué au fichier DÉCODÉ. La base porte la même valeur. */
export const TAILLE_MAX_OCTETS = 8 * 1024 * 1024;

const EXTENSIONS: Record<TypeFichier, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/**
 * Le type réel, d'après les premiers octets.
 *
 * Renvoie null pour tout ce qui n'est pas explicitement reconnu — y compris un
 * SVG, qui est un document exécutable déguisé en image et n'a rien à faire
 * dans un stockage servi aux navigateurs.
 */
export function reconnaitreType(o: Buffer): TypeFichier | null {
  if (o.length < 12) return null;
  // JPEG : SOI, puis un marqueur.
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return 'image/jpeg';
  // PNG : signature de huit octets, dont deux sauts de ligne qui détectent un
  // transfert texte ayant corrompu le fichier.
  if (o.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  // WebP : conteneur RIFF, puis le type de contenu.
  if (o.subarray(0, 4).toString('latin1') === 'RIFF' && o.subarray(8, 12).toString('latin1') === 'WEBP')
    return 'image/webp';
  if (o.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

export type PositionPhoto = { lat: number; lng: number };

// --- EXIF -------------------------------------------------------------------

/** Une valeur RATIONAL : deux entiers 32 bits, numérateur puis dénominateur. */
function rationnel(o: Buffer, pos: number, petitBoutiste: boolean): number {
  const num = petitBoutiste ? o.readUInt32LE(pos) : o.readUInt32BE(pos);
  const den = petitBoutiste ? o.readUInt32LE(pos + 4) : o.readUInt32BE(pos + 4);
  return den === 0 ? 0 : num / den;
}

/**
 * La position écrite par l'appareil, si elle y est.
 *
 * Lecture volontairement étroite : on cherche le pointeur vers le répertoire
 * GPS dans l'IFD0, puis quatre étiquettes. Tout le reste de l'EXIF est ignoré,
 * et la moindre incohérence fait renoncer — une photo sans position est le cas
 * normal, pas une anomalie à forcer.
 */
function lirePositionExif(exif: Buffer): PositionPhoto | null {
  try {
    // En-tête TIFF : l'ordre des octets, puis 42, puis l'offset de l'IFD0.
    const ordre = exif.subarray(0, 2).toString('latin1');
    if (ordre !== 'II' && ordre !== 'MM') return null;
    const pb = ordre === 'II';
    const u16 = (p: number) => (pb ? exif.readUInt16LE(p) : exif.readUInt16BE(p));
    const u32 = (p: number) => (pb ? exif.readUInt32LE(p) : exif.readUInt32BE(p));
    if (u16(2) !== 42) return null;

    const ifd0 = u32(4);
    if (ifd0 + 2 > exif.length) return null;

    let offsetGps = 0;
    const n0 = u16(ifd0);
    for (let i = 0; i < n0; i++) {
      const e = ifd0 + 2 + i * 12;
      if (e + 12 > exif.length) return null;
      if (u16(e) === 0x8825) { offsetGps = u32(e + 8); break; }  // GPSInfoIFDPointer
    }
    if (offsetGps === 0 || offsetGps + 2 > exif.length) return null;

    let lat: number | null = null, lng: number | null = null;
    let refLat = 'N', refLng = 'E';
    const nGps = u16(offsetGps);
    for (let i = 0; i < nGps; i++) {
      const e = offsetGps + 2 + i * 12;
      if (e + 12 > exif.length) return null;
      const etiquette = u16(e);
      const type = u16(e + 2);
      const nb = u32(e + 4);

      if ((etiquette === 0x0001 || etiquette === 0x0003) && type === 2) {
        // ASCII d'un ou deux octets : tient dans le champ lui-même.
        const c = exif.subarray(e + 8, e + 9).toString('latin1');
        if (etiquette === 0x0001) refLat = c; else refLng = c;
      }
      if ((etiquette === 0x0002 || etiquette === 0x0004) && type === 5 && nb === 3) {
        // Trois RATIONALs : degrés, minutes, secondes. 24 octets, donc
        // toujours à un offset, jamais dans le champ.
        const p = u32(e + 8);
        if (p + 24 > exif.length) return null;
        const d = rationnel(exif, p, pb);
        const m = rationnel(exif, p + 8, pb);
        const s = rationnel(exif, p + 16, pb);
        const valeur = d + m / 60 + s / 3600;
        if (etiquette === 0x0002) lat = valeur; else lng = valeur;
      }
    }
    if (lat === null || lng === null) return null;
    if (refLat === 'S') lat = -lat;
    if (refLng === 'W') lng = -lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    // Une photo « à zéro zéro » vient d'un appareil dont le GPS n'avait pas
    // encore accroché. C'est un point au large du Ghana, pas une position.
    if (lat === 0 && lng === 0) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/**
 * Retire de l'image tout ce qui n'est pas l'image, et rend au passage la
 * position que l'appareil y avait écrite.
 *
 * JPEG : les segments APP1 à APP15 et les commentaires sautent — c'est là que
 * vivent EXIF, XMP et les blocs Photoshop. APP0 (JFIF) reste : il porte la
 * densité d'affichage, pas des données personnelles.
 *
 * PNG et WebP : seuls les blocs indispensables au rendu sont conservés.
 *
 * PDF : laissé intact. Ce sont des documents déposés par la commune, non des
 * photos de téléphone, et réécrire un PDF à l'aveugle c'est risquer de le
 * casser pour un bénéfice nul.
 */
export function nettoyer(octets: Buffer, type: TypeFichier): { octets: Buffer; position: PositionPhoto | null } {
  if (type === 'image/jpeg') return nettoyerJpeg(octets);
  if (type === 'image/png') return { octets: nettoyerPng(octets), position: null };
  if (type === 'image/webp') return { octets: nettoyerWebp(octets), position: null };
  return { octets, position: null };
}

function nettoyerJpeg(o: Buffer): { octets: Buffer; position: PositionPhoto | null } {
  const morceaux: Buffer[] = [Buffer.from([0xff, 0xd8])];
  let position: PositionPhoto | null = null;
  let i = 2;

  while (i + 4 <= o.length) {
    if (o[i] !== 0xff) break;            // flux inattendu : on s'arrête là
    const marqueur = o[i + 1];
    if (marqueur === 0xd9) break;         // EOI
    if (marqueur === 0xda) {              // SOS : les données d'image suivent
      morceaux.push(o.subarray(i));
      i = o.length;
      break;
    }
    const taille = o.readUInt16BE(i + 2);
    if (taille < 2 || i + 2 + taille > o.length) break;
    const segment = o.subarray(i, i + 2 + taille);

    // APP1 porteur d'EXIF : on y lit la position avant de le jeter.
    if (marqueur === 0xe1 && segment.subarray(4, 10).toString('latin1') === 'Exif\u0000\u0000') {
      position = position ?? lirePositionExif(segment.subarray(10));
    }
    const aJeter = (marqueur >= 0xe1 && marqueur <= 0xef) || marqueur === 0xfe;
    if (!aJeter) morceaux.push(segment);
    i += 2 + taille;
  }
  // Si l'on n'a jamais atteint SOS, le fichier est tronqué : on rend l'original
  // plutôt qu'une image amputée. Un fichier abîmé se constate, il ne se
  // fabrique pas.
  if (i < o.length) return { octets: o, position };
  return { octets: Buffer.concat(morceaux), position };
}

const PNG_BLOCS_GARDES = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS']);

function nettoyerPng(o: Buffer): Buffer {
  const morceaux: Buffer[] = [o.subarray(0, 8)];
  let i = 8;
  while (i + 8 <= o.length) {
    const taille = o.readUInt32BE(i);
    const nom = o.subarray(i + 4, i + 8).toString('latin1');
    const fin = i + 12 + taille;
    if (taille > o.length || fin > o.length) return o;   // fichier douteux : intact
    if (PNG_BLOCS_GARDES.has(nom)) morceaux.push(o.subarray(i, fin));
    i = fin;
    if (nom === 'IEND') break;
  }
  return Buffer.concat(morceaux);
}

const WEBP_BLOCS_JETES = new Set(['EXIF', 'XMP ']);

function nettoyerWebp(o: Buffer): Buffer {
  const morceaux: Buffer[] = [];
  let i = 12;
  while (i + 8 <= o.length) {
    const taille = o.readUInt32LE(i + 4);
    // Les blocs RIFF sont alignés sur deux octets.
    const fin = i + 8 + taille + (taille % 2);
    if (fin > o.length) return o;
    const nom = o.subarray(i, i + 4).toString('latin1');
    if (!WEBP_BLOCS_JETES.has(nom)) morceaux.push(o.subarray(i, Math.min(fin, o.length)));
    i = fin;
  }
  if (morceaux.length === 0) return o;
  const corps = Buffer.concat(morceaux);
  const entete = Buffer.alloc(12);
  o.copy(entete, 0, 0, 12);
  entete.writeUInt32LE(corps.length + 4, 4);   // taille RIFF = « WEBP » + blocs
  return Buffer.concat([entete, corps]);
}

// --- Disque -----------------------------------------------------------------

export function empreinte(octets: Buffer): string {
  return createHash('sha256').update(octets).digest('hex');
}

/**
 * Le chemin sous lequel un fichier est rangé : commune, année, mois,
 * identifiant. Découpé ainsi pour trois raisons — un dossier de cent mille
 * entrées est pénible à parcourir, l'archivage d'une année se fait alors d'un
 * seul déplacement, et tout ce qui appartient à une commune se sauvegarde ou
 * s'efface sans requête.
 */
export function cheminRelatif(communeId: string, id: string, type: TypeFichier, le = new Date()): string {
  const annee = le.getUTCFullYear();
  const mois = String(le.getUTCMonth() + 1).padStart(2, '0');
  // La commune vient du référentiel, pas de l'utilisateur ; on la borne
  // néanmoins, parce qu'un jour quelqu'un appellera cette fonction autrement.
  const commune = communeId.replace(/[^a-z0-9_-]/gi, '_');
  return `${commune}/${annee}/${mois}/${id}.${EXTENSIONS[type]}`;
}

/** Racine de stockage, absolue et résolue une fois pour toutes. */
export function racine(): string {
  return resolve(process.env.SIIPI_FICHIERS_DIR ?? '/var/siipi/fichiers');
}

/**
 * Le chemin absolu d'un fichier, après vérification qu'il reste bien SOUS la
 * racine. La vérification est redondante — les chemins sont fabriqués par
 * `cheminRelatif` — et c'est précisément pourquoi elle est ici : le jour où un
 * chemin viendra d'ailleurs, elle sera déjà en place.
 */
export function cheminAbsolu(relatif: string): string {
  const base = racine();
  const complet = resolve(base, relatif);
  if (complet !== base && !complet.startsWith(base + sep)) {
    throw new Error(`Chemin de fichier hors de la racine de stockage : ${relatif}`);
  }
  return complet;
}

export async function ecrire(relatif: string, octets: Buffer): Promise<void> {
  const complet = cheminAbsolu(relatif);
  await mkdir(dirname(complet), { recursive: true });
  await writeFile(complet, octets, { mode: 0o640 });
}

export async function lire(relatif: string): Promise<Buffer> {
  return readFile(cheminAbsolu(relatif));
}

/** Utilisé au démarrage : mieux vaut découvrir un volume non monté à vide. */
export async function preparerRacine(): Promise<void> {
  await mkdir(join(racine()), { recursive: true });
}
