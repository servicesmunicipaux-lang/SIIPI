// Le service d'export unique (Jalon 4) — une requête, un jeu de colonnes, un
// fichier.
//
// UNE REQUÊTE : l'export n'a pas de requête à lui. Il est une autre
// REPRÉSENTATION d'une route de liste existante (`?format=csv|xlsx`) : même
// SQL, mêmes filtres, mêmes rôles, même cloisonnement RLS que l'écran. Ce qui
// sort du tableur est exactement ce que l'écran montrait — un export qui
// aurait sa propre requête finirait par ne plus dire la même chose que lui.
//
// UN JEU DE COLONNES : chaque route exportable déclare ses colonnes (libellé
// FR/AR, type, libellés des valeurs codées). Le type est ce qui fait qu'un
// nombre reste un nombre dans le tableur : `pg` rend un NUMERIC en chaîne, et
// une chaîne « 12.5 » ouverte dans un Excel français devient du texte, ou une
// date.
//
// UN FICHIER :
//   - CSV : UTF-8 avec BOM (sans lui, Excel lit l'arabe en caractères
//     illisibles), séparateur « ; » et virgule décimale — la convention du
//     tableur en français, celle des communes. Les textes qui commencent par
//     = + - @ sont neutralisés (injection de formule, OWASP).
//   - XLSX : écrit ici sans dépendance, comme le lecteur KMZ (services/kml.ts).
//     Les nombres y sont typés quelle que soit la langue du tableur ; la
//     feuille passe de droite à gauche quand l'export est demandé en arabe.

import type { NextFunction, Request, Response } from 'express';
import { deflateRawSync } from 'node:zlib';
import { ApiError } from '../middleware/errorHandler.js';

export type TypeColonne = 'texte' | 'nombre' | 'date' | 'horodatage' | 'booleen';
export type Langue = 'fr' | 'ar';

export interface Colonne {
  cle: string;
  fr: string;
  ar: string;
  type?: TypeColonne;
  /** Libellés des valeurs codées (« en_panne » → « En panne »). */
  libelles?: Record<string, { fr: string; ar: string }>;
}

export interface JeuExport {
  /** Préfixe du nom de fichier, sans accent ni espace. */
  nom: string;
  titre: { fr: string; ar: string };
  colonnes: Colonne[];
}

export const FORMATS_EXPORT = ['csv', 'xlsx'] as const;
export type FormatExport = (typeof FORMATS_EXPORT)[number];

const MIME: Record<FormatExport, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const OUI_NON: Record<Langue, [string, string]> = { fr: ['oui', 'non'], ar: ['نعم', 'لا'] };

// La Tunisie est à UTC+1 toute l'année, sans heure d'été.
const DECALAGE_TUNIS_MS = 60 * 60 * 1000;

type Valeur = string | number | boolean | null;

/** Une cellule, typée et prête à écrire — ou null pour une case vide. */
function valeur(col: Colonne, brut: unknown, langue: Langue): Valeur {
  if (brut === null || brut === undefined || brut === '') return null;
  switch (col.type ?? 'texte') {
    case 'nombre': {
      const n = typeof brut === 'number' ? brut : Number(brut);
      return Number.isFinite(n) ? n : null;
    }
    case 'booleen':
      return Boolean(brut);
    case 'date':
    case 'horodatage': {
      const d = brut instanceof Date ? brut : new Date(String(brut));
      return Number.isNaN(d.getTime()) ? String(brut) : d.toISOString();
    }
    default: {
      const texte = Array.isArray(brut) ? brut.join(', ') : String(brut);
      return col.libelles?.[texte]?.[langue] ?? texte;
    }
  }
}

/** « 2026-09-28 » ou « 2026-09-28 14:05 », à l'heure de Tunis. */
function dateLisible(iso: string, type: TypeColonne): string {
  const local = new Date(new Date(iso).getTime() + (type === 'horodatage' ? DECALAGE_TUNIS_MS : 0));
  const jour = local.toISOString().slice(0, 10);
  return type === 'date' ? jour : `${jour} ${local.toISOString().slice(11, 16)}`;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function celluleCsv(col: Colonne, v: Valeur, langue: Langue): string {
  if (v === null) return '';
  let texte: string;
  if (typeof v === 'number') texte = String(v).replace('.', ',');
  else if (typeof v === 'boolean') texte = OUI_NON[langue][v ? 0 : 1];
  else if (col.type === 'date' || col.type === 'horodatage') texte = dateLisible(v, col.type);
  else {
    texte = v;
    // Un tableur exécute une cellule qui commence par = + - @ : un contact
    // nommé « =HYPERLINK(...) » deviendrait un lien piégé. L'apostrophe force
    // la lecture en texte.
    if (/^[=+\-@\t\r]/.test(texte)) texte = `'${texte}`;
  }
  return echapperCsv(texte);
}

function echapperCsv(texte: string): string {
  return /[;"\r\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}

export function versCsv(jeu: JeuExport, lignes: Record<string, unknown>[], langue: Langue): Buffer {
  const entete = jeu.colonnes.map((c) => echapperCsv(c[langue]));
  const corps = lignes.map((l) =>
    jeu.colonnes.map((c) => celluleCsv(c, valeur(c, l[c.cle], langue), langue)).join(';')
  );
  return Buffer.from('﻿' + [entete.join(';'), ...corps].join('\r\n') + '\r\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

function xml(texte: string): string {
  return texte
    // Caractères de contrôle interdits en XML 1.0 : un seul suffirait à ce
    // que le tableur refuse d'ouvrir tout le fichier.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lettreColonne(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Numéro de série Excel (jours depuis le 30/12/1899), à l'heure de Tunis. */
function serieExcel(iso: string, type: TypeColonne): number {
  const d = new Date(iso);
  const decalage = type === 'horodatage' ? DECALAGE_TUNIS_MS : 0;
  const serie = (d.getTime() + decalage - Date.UTC(1899, 11, 30)) / 86_400_000;
  return type === 'date' ? Math.floor(serie) : Math.round(serie * 86_400) / 86_400;
}

// Styles : 0 normal, 1 en-tête gras, 2 date, 3 date et heure (formats
// intégrés 14 et 22 : le tableur les affiche selon sa propre langue).
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="22" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function feuille(jeu: JeuExport, lignes: Record<string, unknown>[], langue: Langue): string {
  const texte = (ref: string, s: string, style = 0) =>
    `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${xml(s)}</t></is></c>`;

  const rangees: string[] = [];
  rangees.push(
    `<row r="1">${jeu.colonnes.map((c, i) => texte(`${lettreColonne(i)}1`, c[langue], 1)).join('')}</row>`
  );
  lignes.forEach((l, n) => {
    const r = n + 2;
    const cellules = jeu.colonnes
      .map((c, i) => {
        const v = valeur(c, l[c.cle], langue);
        const ref = `${lettreColonne(i)}${r}`;
        if (v === null) return '';
        if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
        if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
        if (c.type === 'date' || c.type === 'horodatage') {
          return `<c r="${ref}" s="${c.type === 'date' ? 2 : 3}"><v>${serieExcel(v, c.type)}</v></c>`;
        }
        return texte(ref, v);
      })
      .join('');
    rangees.push(`<row r="${r}">${cellules}</row>`);
  });

  const derniere = `${lettreColonne(jeu.colonnes.length - 1)}${lignes.length + 1}`;
  // Largeur d'après l'en-tête ET les valeurs (500 premières lignes : assez
  // pour juger, sans parcourir un gros export deux fois).
  const echantillon = lignes.slice(0, 500);
  const largeurs = jeu.colonnes
    .map((c, i) => {
      const plusLongue = echantillon.reduce((max, l) => {
        const v = valeur(c, l[c.cle], langue);
        return typeof v === 'string' && c.type !== 'date' && c.type !== 'horodatage' ? Math.max(max, v.length) : max;
      }, 0);
      const w = Math.min(60, Math.max(10, c[langue].length + 2, plusLongue + 2, c.type === 'horodatage' ? 17 : 0));
      return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    })
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    // En-tête figé, et feuille de droite à gauche quand l'export est en arabe.
    `<sheetViews><sheetView workbookViewId="0"${langue === 'ar' ? ' rightToLeft="1"' : ''}>` +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${largeurs}</cols>` +
    `<sheetData>${rangees.join('')}</sheetData>` +
    `<autoFilter ref="A1:${derniere}"/>` +
    '</worksheet>'
  );
}

export function versXlsx(jeu: JeuExport, lignes: Record<string, unknown>[], langue: Langue): Buffer {
  // Un nom d'onglet : 31 caractères, sans []:*?/\ — au-delà le tableur refuse le fichier.
  const onglet = xml(jeu.titre[langue].replace(/[[\]:*?/\\]/g, ' ').slice(0, 31));
  return zip([
    {
      nom: '[Content_Types].xml',
      contenu:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    },
    {
      nom: '_rels/.rels',
      contenu:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      nom: 'xl/workbook.xml',
      contenu:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${onglet}" sheetId="1" r:id="rId1"/></sheets>` +
        // Le filtre automatique n'apparaît que si ce nom défini existe.
        `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${onglet.replace(/'/g, "''")}'!$A$1:$${lettreColonne(jeu.colonnes.length - 1)}$${lignes.length + 1}</definedName></definedNames>` +
        '</workbook>',
    },
    {
      nom: 'xl/_rels/workbook.xml.rels',
      contenu:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    },
    { nom: 'xl/styles.xml', contenu: STYLES },
    { nom: 'xl/worksheets/sheet1.xml', contenu: feuille(jeu, lignes, langue) },
  ]);
}

// ---------------------------------------------------------------------------
// ZIP — le strict nécessaire à un XLSX : entrées dégonflées, un répertoire
// central, aucune option.
// ---------------------------------------------------------------------------

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const octet of b) c = TABLE_CRC[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(fichiers: Array<{ nom: string; contenu: string }>): Buffer {
  const maintenant = new Date();
  const heure = (maintenant.getHours() << 11) | (maintenant.getMinutes() << 5) | (maintenant.getSeconds() >> 1);
  const jour = ((maintenant.getFullYear() - 1980) << 9) | ((maintenant.getMonth() + 1) << 5) | maintenant.getDate();

  const locaux: Buffer[] = [];
  const centraux: Buffer[] = [];
  let decalage = 0;

  for (const f of fichiers) {
    const nom = Buffer.from(f.nom, 'utf-8');
    const brut = Buffer.from(f.contenu, 'utf-8');
    const compresse = deflateRawSync(brut);
    const crc = crc32(brut);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // noms en UTF-8
    local.writeUInt16LE(8, 8); // dégonflage
    local.writeUInt16LE(heure, 10);
    local.writeUInt16LE(jour, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compresse.length, 18);
    local.writeUInt32LE(brut.length, 22);
    local.writeUInt16LE(nom.length, 26);
    local.writeUInt16LE(0, 28);
    locaux.push(local, nom, compresse);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(heure, 12);
    central.writeUInt16LE(jour, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compresse.length, 20);
    central.writeUInt32LE(brut.length, 24);
    central.writeUInt16LE(nom.length, 28);
    central.writeUInt32LE(decalage, 42);
    centraux.push(central, nom);

    decalage += local.length + nom.length + compresse.length;
  }

  const repertoire = Buffer.concat(centraux);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(fichiers.length, 8);
  fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(repertoire.length, 12);
  fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...locaux, repertoire, fin]);
}

// ---------------------------------------------------------------------------
// Le branchement sur une route de liste.
// ---------------------------------------------------------------------------

/**
 * À placer avant le gestionnaire d'une route de liste. Sans `?format`, la
 * route répond en JSON comme avant ; avec `?format=csv|xlsx`, le tableau
 * qu'elle allait rendre devient un fichier. Une erreur (400, 403, 404…) reste
 * une erreur JSON : on ne télécharge jamais un message d'erreur déguisé en
 * tableur.
 */
export function exportable(jeu: JeuExport, suffixe?: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    const format = req.query.format;
    if (format === undefined) return next();
    if (typeof format !== 'string' || !(FORMATS_EXPORT as readonly string[]).includes(format)) {
      return next(new ApiError(400, `Format d'export inconnu. Formats acceptés : ${FORMATS_EXPORT.join(', ')}.`));
    }
    const langue: Langue = req.query.langue === 'ar' ? 'ar' : 'fr';
    const json = res.json.bind(res);

    res.json = (corps: unknown) => {
      if (res.statusCode >= 400 || !Array.isArray(corps)) return json(corps);
      const fichier =
        format === 'csv' ? versCsv(jeu, corps, langue) : versXlsx(jeu, corps, langue);
      const complement = suffixe?.(req)?.replace(/[^A-Za-z0-9_-]/g, '');
      const nom = `${jeu.nom}${complement ? `-${complement}` : ''}-${new Date().toISOString().slice(0, 10)}.${format}`;
      res.setHeader('Content-Type', MIME[format as FormatExport]);
      res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
      // Des données de commune, parfois personnelles : aucun cache
      // intermédiaire ne doit en garder une copie.
      res.setHeader('Cache-Control', 'no-store');
      return res.send(fichier);
    };
    next();
  };
}
