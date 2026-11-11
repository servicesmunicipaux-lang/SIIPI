// Lecture d'un classeur Excel (.xlsx), sans bibliothèque supplémentaire (jalon G,
// lot G2b) : un .xlsx est une archive zip de fichiers XML, que `zip.ts` ouvre et
// `fast-xml-parser` lit.
//
// ON NE LIT QUE CE QU'UNE LISTE PORTE : la première feuille, ses cellules en
// texte, en nombre ou en booléen. Une formule rend sa dernière valeur calculée,
// telle qu'Excel l'a enregistrée ; SIIPI ne recalcule rien. Une date reste le
// nombre qu'Excel garde (aucune colonne de l'import n'est une date) ; deviner
// qu'un nombre est une date d'après son format d'affichage serait une conversion
// silencieuse.
//
// UN CLASSEUR SE MÉFIE DE LUI-MÊME, comme toute archive : `zip.ts` plafonne le
// nombre d'entrées et la taille décompressée, et l'on plafonne ici les lignes et
// les colonnes avant d'allouer quoi que ce soit.

import { XMLParser } from 'fast-xml-parser';
import { ErreurZip, estZip, lireZip } from './zip.js';

export class ErreurXlsx extends Error {}

const MAX_LIGNES = 20_000;
const MAX_COLONNES = 200;

const lecteur = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  // Une feuille d'une seule ligne, une ligne d'une seule cellule restent des listes.
  isArray: (nom) => ['sheet', 'Relationship', 'si', 'r', 'row', 'c'].includes(nom),
});

type Noeud = Record<string, unknown>;

/** Le texte d'un nœud XML, qu'il soit une chaîne, `{ '#text': … }` ou absent. */
function texte(n: unknown): string {
  if (n == null) return '';
  if (typeof n === 'string' || typeof n === 'number' || typeof n === 'boolean') return String(n);
  const o = n as Noeud;
  return o['#text'] != null ? String(o['#text']) : '';
}

/** Une chaîne partagée : `<t>` simple, ou suite de `<r><t>` (texte mis en forme). Les annotations phonétiques sont ignorées. */
function chainePartagee(si: Noeud): string {
  if (si.t != null) return texte(si.t);
  return ((si.r as Noeud[] | undefined) ?? []).map((r) => texte(r.t)).join('');
}

/** « C12 » → 2 (colonne C, comptée depuis 0). */
function indiceColonne(reference: string): number {
  const lettres = /^([A-Z]+)/.exec(reference)?.[1];
  if (!lettres) return -1;
  let n = 0;
  for (const l of lettres) n = n * 26 + (l.charCodeAt(0) - 64);
  return n - 1;
}

function entree(entrees: Map<string, Buffer>, nom: string): string | null {
  const b = entrees.get(nom.replace(/^\/+/, ''));
  return b ? b.toString('utf-8') : null;
}

export const estXlsx = (octets: Buffer) => estZip(octets);

/**
 * Les rangées de la première feuille, en texte. `feuille` nomme la feuille lue ;
 * `autresFeuilles` dit combien ont été laissées, pour que l'écran le dise.
 */
export function lireXlsx(octets: Buffer): { rangees: string[][]; feuille: string; autresFeuilles: number } {
  let fichiers;
  try {
    fichiers = lireZip(octets);
  } catch (err) {
    throw new ErreurXlsx(err instanceof ErreurZip ? `Classeur illisible : ${err.message}` : 'Classeur illisible.');
  }
  const entrees = new Map(fichiers.map((f) => [f.nom.replace(/^\/+/, ''), f.donnees]));

  const classeur = entree(entrees, 'xl/workbook.xml');
  if (!classeur) throw new ErreurXlsx("Ce fichier n'est pas un classeur Excel (.xlsx) : enregistrez-le au format Excel ou en CSV.");
  const feuilles = ((lecteur.parse(classeur) as Noeud).workbook as Noeud | undefined)?.sheets as Noeud | undefined;
  const liste = (feuilles?.sheet as Noeud[] | undefined) ?? [];
  if (liste.length === 0) throw new ErreurXlsx('Le classeur ne contient aucune feuille.');
  const premiere = liste[0];
  const idRelation = String(premiere['@r:id'] ?? '');

  // La feuille se trouve par la relation que le classeur nomme, pas par son
  // numéro : une feuille supprimée puis recréée s'appelle « sheet3.xml ».
  let chemin = 'xl/worksheets/sheet1.xml';
  const relations = entree(entrees, 'xl/_rels/workbook.xml.rels');
  if (relations && idRelation) {
    const rel = (((lecteur.parse(relations) as Noeud).Relationships as Noeud | undefined)?.Relationship as Noeud[] | undefined)?.find(
      (r) => r['@Id'] === idRelation
    );
    const cible = rel ? String(rel['@Target'] ?? '') : '';
    if (cible) chemin = cible.startsWith('/') ? cible.slice(1) : `xl/${cible.replace(/^\.\//, '')}`;
  }
  const feuille = entree(entrees, chemin);
  if (!feuille) throw new ErreurXlsx('La première feuille du classeur est introuvable.');

  const partagees: string[] = [];
  const sst = entree(entrees, 'xl/sharedStrings.xml');
  if (sst) {
    for (const si of (((lecteur.parse(sst) as Noeud).sst as Noeud | undefined)?.si as Noeud[] | undefined) ?? []) partagees.push(chainePartagee(si));
  }

  const lignesXml = ((((lecteur.parse(feuille) as Noeud).worksheet as Noeud | undefined)?.sheetData as Noeud | undefined)?.row as
    | Noeud[]
    | undefined) ?? [];
  if (lignesXml.length > MAX_LIGNES) throw new ErreurXlsx(`La feuille compte ${lignesXml.length} lignes : ${MAX_LIGNES} au plus.`);

  const rangees: string[][] = [];
  for (const ligne of lignesXml) {
    const valeurs: string[] = [];
    let suivante = 0;
    for (const c of (ligne.c as Noeud[] | undefined) ?? []) {
      const ref = String(c['@r'] ?? '');
      const i = ref ? indiceColonne(ref) : suivante;
      suivante = i + 1;
      if (i < 0 || i >= MAX_COLONNES) continue;
      const type = String(c['@t'] ?? 'n');
      let v: string;
      if (type === 's') v = partagees[Number(texte(c.v))] ?? '';
      else if (type === 'inlineStr') v = chainePartagee((c.is as Noeud | undefined) ?? {});
      else if (type === 'b') v = texte(c.v) === '1' ? 'oui' : 'non';
      else if (type === 'e') v = '';
      else v = texte(c.v);
      while (valeurs.length < i) valeurs.push('');
      valeurs[i] = v;
    }
    if (valeurs.some((v) => v.trim() !== '')) rangees.push(valeurs);
  }
  return { rangees, feuille: String(premiere['@name'] ?? ''), autresFeuilles: liste.length - 1 };
}
