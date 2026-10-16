// Lecture d'une archive zip, sans bibliothèque supplémentaire (lot C2.2).
//
// Un Shapefile voyage en zip (.shp, .shx, .dbf, .prj, .cpg), un KMZ aussi. On
// lit le RÉPERTOIRE CENTRAL, à la fin de l'archive, et non les seuls en-têtes
// locaux : un zip écrit par Windows ou par QGIS en flux met la taille des
// données APRÈS elles (« descripteur de données »), et l'en-tête local dit 0 —
// une lecture naïve n'y trouverait rien.
//
// UNE ARCHIVE SE MÉFIE D'ELLE-MÊME : on refuse plus de 200 entrées, et l'on ne
// décompresse jamais au-delà de la taille annoncée ni au-delà d'un plafond
// (une « bombe » de quelques Ko qui se déplie en gigaoctets ferait tomber l'API).

import { inflateRawSync } from 'node:zlib';

export class ErreurZip extends Error {}

export type EntreeZip = { nom: string; donnees: Buffer };

const MAX_ENTREES = 200;
const MAX_TOTAL = 200 * 1024 * 1024;

export const estZip = (b: Buffer) => b.length >= 4 && b.readUInt32LE(0) === 0x04034b50;

export function lireZip(buf: Buffer): EntreeZip[] {
  // La fin du répertoire central : signature 0x06054b50, dans les 64 Ko de la fin.
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new ErreurZip('Archive zip illisible : sa fin (répertoire central) est introuvable.');
  const nombre = buf.readUInt16LE(fin + 10);
  const debutRepertoire = buf.readUInt32LE(fin + 16);
  if (nombre > MAX_ENTREES) throw new ErreurZip(`Archive de ${nombre} fichiers : ${MAX_ENTREES} au plus.`);

  const entrees: EntreeZip[] = [];
  let total = 0;
  let p = debutRepertoire;
  for (let k = 0; k < nombre; k++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ErreurZip('Archive zip abîmée : répertoire central incohérent.');
    const drapeaux = buf.readUInt16LE(p + 8);
    const methode = buf.readUInt16LE(p + 10);
    const tailleCompressee = buf.readUInt32LE(p + 20);
    const tailleReelle = buf.readUInt32LE(p + 24);
    const longueurNom = buf.readUInt16LE(p + 28);
    const longueurExtra = buf.readUInt16LE(p + 30);
    const longueurCommentaire = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    // Bit 11 : nom en UTF-8 ; sinon CP437, dont les noms de Shapefile restent ASCII en pratique.
    const nom = buf.subarray(p + 46, p + 46 + longueurNom).toString(drapeaux & 0x800 ? 'utf-8' : 'latin1');
    p += 46 + longueurNom + longueurExtra + longueurCommentaire;

    if (nom.endsWith('/')) continue; // un dossier
    if (drapeaux & 0x1) throw new ErreurZip(`« ${nom} » est chiffré : envoyez l'archive sans mot de passe.`);
    total += tailleReelle;
    if (total > MAX_TOTAL) throw new ErreurZip('Archive trop volumineuse une fois décompressée (200 Mo au plus).');
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new ErreurZip(`Archive zip abîmée autour de « ${nom} ».`);
    const debut = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const brut = buf.subarray(debut, debut + tailleCompressee);
    let donnees: Buffer;
    if (methode === 0) donnees = Buffer.from(brut);
    else if (methode === 8) donnees = inflateRawSync(brut, { maxOutputLength: Math.max(tailleReelle, 1) });
    else throw new ErreurZip(`« ${nom} » est compressé d'une façon que SIIPI ne lit pas (méthode ${methode}) : recompressez l'archive en zip standard.`);
    if (donnees.length !== tailleReelle) throw new ErreurZip(`« ${nom} » ne fait pas la taille que l'archive annonce.`);
    entrees.push({ nom, donnees });
  }
  return entrees;
}
