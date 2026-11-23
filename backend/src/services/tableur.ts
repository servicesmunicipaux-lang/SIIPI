// Lire un fichier de la commune, CSV ou Excel, TEL QU'IL EST, et proposer la
// correspondance de ses colonnes avec les champs de SIIPI. Né avec l'import des
// établissements (G2b) ; partagé depuis l'import des levées Kobo (G5a), qui lit
// d'autres champs mais de la même façon.
//
// LE FORMAT SE DÉCIDE SUR LES OCTETS, jamais sur l'extension ni sur le type que
// le navigateur annonce : un .xlsx est une archive zip, un .xls ancien est refusé
// en le disant, tout le reste se lit comme un CSV (UTF-8, sinon windows-1252 avec
// un avertissement).
//
// LA CORRESPONDANCE PROPOSÉE vient du modèle que la commune a gardé pour ce type
// de fichier, sinon des en-têtes usuels ; une même colonne ne sert jamais deux
// champs, et « aucune colonne » gardé dans le modèle reste un choix.

import { createHash } from 'node:crypto';
import { ApiError } from '../middleware/errorHandler.js';
import { decoder, LIGNES_MAX, lireCsvNumerote, normaliser } from './import.js';
import { ErreurXlsx, estXlsx, lireXlsx } from './xlsx.js';

// `numeriques` : les cellules typées « nombre » d'un classeur .xlsx (absent pour un CSV).
export type RangeeFichier = { cellules: string[]; ligne: number; numeriques?: boolean[] };

export type FichierTableur = {
  entetes: string[];
  rangees: RangeeFichier[];
  avertissements: string[];
  feuille: string | null;
  empreinte: string;
  ligneEntetes: number;
  /** Le classeur compte ses dates depuis 1904 (Excel ancien pour Mac) : un numéro de série n'y vaut pas le même jour. */
  calendrier1904: boolean;
};

/** Ramène un en-tête à une forme comparable : sans accent ni casse, la ponctuation devenue espace. */
export const formeEntete = (e: string) => normaliser(e).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Rend les en-têtes uniques et nommés : une colonne sans en-tête devient « Colonne 3 », un doublon « Nom (2) ». */
export function entetesUniques(brut: string[]): string[] {
  const vus = new Map<string, number>();
  return brut.map((e, i) => {
    const base = e.replace(/^﻿/, '').trim() || `Colonne ${i + 1}`;
    const n = (vus.get(base) ?? 0) + 1;
    vus.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

/** La première ligne qui porte des en-têtes : une liste administrative commence souvent par un titre. */
export function ligneDesEntetes(rangees: RangeeFichier[]): number {
  const premieres = rangees.slice(0, 10);
  const remplies = (r: RangeeFichier) => r.cellules.filter((c) => c.trim() !== '').length;
  const plus = Math.max(0, ...premieres.map(remplies));
  const i = premieres.findIndex((r) => remplies(r) >= 2 && remplies(r) * 2 >= plus);
  return i < 0 ? 0 : i;
}

/** Lit le fichier reçu en base64 : ses en-têtes, ses lignes de données numérotées comme dans le tableur, son empreinte. */
export function lireTableur(contenu: string): FichierTableur {
  const octets = Buffer.from(contenu, 'base64');
  if (octets.length === 0) throw new ApiError(400, 'Le fichier est vide.');
  const empreinte = createHash('sha256').update(octets).digest('hex');
  const avertissements: string[] = [];
  let rangees: RangeeFichier[];
  let feuille: string | null = null;
  let calendrier1904 = false;
  // L'ancien format binaire d'Excel (.xls) : SIIPI ne le lit pas, et le dit.
  if (octets.length >= 8 && octets.readUInt32BE(0) === 0xd0cf11e0) {
    throw new ApiError(400, 'Ancien format Excel (.xls) : ouvrez le fichier dans le tableur et enregistrez-le en .xlsx ou en CSV.');
  }
  if (estXlsx(octets)) {
    try {
      const lu = lireXlsx(octets);
      rangees = lu.rangees;
      feuille = lu.feuille;
      calendrier1904 = lu.calendrier1904;
      if (lu.autresFeuilles > 0) {
        avertissements.push(`Seule la première feuille (« ${lu.feuille} ») est lue ; le classeur en compte ${lu.autresFeuilles + 1}.`);
      }
    } catch (err) {
      throw new ApiError(400, err instanceof ErreurXlsx ? err.message : 'Classeur illisible.');
    }
  } else {
    rangees = lireCsvNumerote(decoder(octets, avertissements));
  }
  if (rangees.length === 0) throw new ApiError(400, 'Le fichier ne contient aucune ligne.');
  // Une liste administrative commence souvent par un titre : les en-têtes sont la
  // première ligne qui en a l'allure, et ce qui la précède est dit, pas importé.
  const i = ligneDesEntetes(rangees);
  if (i > 0) {
    avertissements.push(
      `Les en-têtes sont lus ligne ${rangees[i].ligne} ; ${i === 1 ? 'la ligne qui la précède est laissée de côté' : `les ${i} lignes qui la précèdent sont laissées de côté`} (titre du document).`
    );
  }
  const entetes = entetesUniques(rangees[i].cellules);
  const donnees = rangees.slice(i + 1);
  if (donnees.length === 0) throw new ApiError(400, 'Le fichier ne porte que sa ligne d’en-têtes : aucune ligne à importer.');
  if (donnees.length > LIGNES_MAX) throw new ApiError(400, `${donnees.length} lignes : ${LIGNES_MAX} au plus par import. Découpez le fichier.`);
  return { entetes, rangees: donnees, avertissements, feuille, empreinte, ligneEntetes: rangees[i].ligne, calendrier1904 };
}

// ---------------------------------------------------------------------------
// La correspondance des colonnes, pour une liste de champs donnée
// ---------------------------------------------------------------------------

export type ChampTableur<K extends string> = {
  cle: K;
  fr: string;
  ar: string;
  obligatoire: boolean;
  usuels: readonly string[];
  /** Les usuels se lisent dans leur ordre de préférence, pas dans l'ordre des colonnes du fichier. */
  ordreDesUsuels?: boolean;
};
export type ProvenanceCorrespondance = 'enregistree' | 'proposee' | 'aucune';

/**
 * La correspondance proposée : le modèle enregistré quand ses en-têtes sont dans
 * le fichier, sinon l'en-tête usuel le plus net (identique d'abord, puis qui
 * commence par le mot usuel). Une même colonne ne sert jamais deux champs.
 */
export function proposerCorrespondanceDe<K extends string>(
  champs: readonly ChampTableur<K>[],
  entetes: string[],
  enregistree: Partial<Record<K, string | null>> | null
): { correspondance: Record<K, string | null>; provenance: Record<K, ProvenanceCorrespondance> } {
  const correspondance = {} as Record<K, string | null>;
  const provenance = {} as Record<K, ProvenanceCorrespondance>;
  const prises = new Set<string>();
  const parForme = new Map(entetes.map((e) => [formeEntete(e), e]));

  const decides = new Set<K>();
  for (const champ of champs) {
    // « Aucune colonne » est un choix de la commune, gardé comme tel : des colonnes
    // X et Y en Lambert, écartées une fois, ne reviennent pas en latitude et longitude.
    if (enregistree && Object.prototype.hasOwnProperty.call(enregistree, champ.cle) && enregistree[champ.cle] === null) {
      correspondance[champ.cle] = null;
      provenance[champ.cle] = 'enregistree';
      decides.add(champ.cle);
      continue;
    }
    const garde = enregistree?.[champ.cle];
    const trouve = garde ? parForme.get(formeEntete(garde)) : undefined;
    if (trouve && !prises.has(trouve)) {
      correspondance[champ.cle] = trouve;
      provenance[champ.cle] = 'enregistree';
      prises.add(trouve);
      decides.add(champ.cle);
    }
  }
  for (const champ of champs) {
    if (decides.has(champ.cle)) continue;
    const usuels = champ.usuels.map(formeEntete);
    const libre = (e: string) => !prises.has(e);
    const exact = champ.ordreDesUsuels
      ? usuels.map((u) => entetes.find((e) => libre(e) && formeEntete(e) === u)).find(Boolean)
      : entetes.find((e) => libre(e) && usuels.includes(formeEntete(e)));
    // Un en-tête qui COMMENCE par le mot usuel (« Adresse de l'établissement ») vaut
    // proposition ; les mots courts (« x », « y », « mf ») ne valent qu'à
    // l'identique : ils commencent trop d'autres en-têtes.
    const prefixe = exact
      ? undefined
      : entetes.find((e) => libre(e) && usuels.some((u) => u.length >= 3 && formeEntete(e).startsWith(`${u} `)));
    const choisi = exact ?? prefixe ?? null;
    correspondance[champ.cle] = choisi;
    provenance[champ.cle] = choisi ? 'proposee' : 'aucune';
    if (choisi) prises.add(choisi);
  }
  return { correspondance, provenance };
}

/** Ce qui rend une correspondance inutilisable, en mots ; vide si elle convient. */
export function problemesCorrespondanceDe<K extends string>(
  champs: readonly ChampTableur<K>[],
  entetes: string[],
  c: Partial<Record<K, string | null>>
): string[] {
  const problemes: string[] = [];
  const presents = new Set(entetes);
  const vus = new Map<string, string>();
  for (const champ of champs) {
    const e = c[champ.cle];
    if (!e) {
      if (champ.obligatoire) problemes.push(`« ${champ.fr} » : choisissez la colonne du fichier qui la porte.`);
      continue;
    }
    if (!presents.has(e)) problemes.push(`« ${champ.fr} » : la colonne « ${e} » n'est pas dans ce fichier.`);
    const deja = vus.get(e);
    if (deja) problemes.push(`La colonne « ${e} » ne peut pas servir à la fois « ${deja} » et « ${champ.fr} ».`);
    vus.set(e, champ.fr);
  }
  return problemes;
}
