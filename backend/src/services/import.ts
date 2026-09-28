// Lecture des imports CSV (Jalon 4, lot 2) — le pendant de services/export.ts.
//
// LE MÊME JEU DE COLONNES QUE L'EXPORT. Un en-tête est reconnu par son
// libellé français, son libellé arabe ou sa clé technique, et une valeur
// codée par son libellé (« En panne », « معطّبة » ou « en_panne »). Un fichier
// exporté, retouché dans un tableur puis réimporté fait donc l'aller-retour
// sans qu'on ait rien à renommer.
//
// CE QUE LES TABLEURS FONT RÉELLEMENT D'UN CSV :
//   - « CSV UTF-8 » d'Excel : BOM + UTF-8 — lu tel quel ;
//   - « CSV (séparateur : point-virgule) » d'un Excel français : Windows-1252,
//     sans BOM. L'arabe y est déjà perdu (remplacé par « ? ») : on lit quand
//     même le reste, et on le DIT, plutôt que d'importer des « ??? » en silence ;
//   - séparateur « ; » en français, « , » ailleurs, tabulation depuis un
//     copier-coller : déduit de la ligne d'en-tête ;
//   - virgule ou point décimal, espaces de milliers : acceptés tous deux.

import type { Colonne, JeuExport } from './export.js';

export const LIGNES_MAX = 5000;

export interface LigneImportee {
  /** Numéro de ligne dans le fichier, en-tête compris (la 1re ligne de données est la 2). */
  numero: number;
  /** Valeurs converties, indexées par la clé d'import de la colonne. */
  valeurs: Record<string, string | number | boolean | null>;
  erreurs: string[];
}

export interface TableauImporte {
  colonnesReconnues: string[];
  colonnesIgnorees: string[];
  lignes: LigneImportee[];
  avertissements: string[];
}

/** Sans accent, sans casse, espaces réduits : « Réf. » et « ref. » se valent. */
export function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Décode les octets : UTF-8 si valide, Windows-1252 sinon (avec avertissement). */
export function decoder(octets: Buffer, avertissements: string[]): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets).replace(/^﻿/, '');
  } catch {
    avertissements.push(
      "Le fichier n'est pas en UTF-8 (enregistrement « CSV » classique d'Excel) : les accents ont été relus, " +
        "mais un texte en arabe y aurait déjà été perdu. Pour l'arabe, enregistrez en « CSV UTF-8 »."
    );
    return new TextDecoder('windows-1252').decode(octets);
  }
}

/** Le séparateur le plus fréquent de la ligne d'en-tête, hors guillemets. */
function separateur(texte: string): string {
  const compte: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let guillemets = false;
  for (const c of texte) {
    if (c === '"') guillemets = !guillemets;
    else if (!guillemets && (c === '\n' || c === '\r')) break;
    else if (!guillemets && c in compte) compte[c]++;
  }
  return Object.entries(compte).sort((a, b) => b[1] - a[1])[0][0];
}

/** CSV selon la RFC 4180 : guillemets doublés, retours à la ligne dans un champ. */
export function lireCsv(texte: string): string[][] {
  const sep = separateur(texte);
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = '';
  let guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"' && texte[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"' && champ === '') guillemets = true;
    else if (c === sep) {
      ligne.push(champ);
      champ = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
    } else champ += c;
  }
  if (champ !== '' || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  // Les lignes entièrement vides (fin de fichier, lignes de séparation) ne
  // sont pas des données.
  return lignes.filter((l) => l.some((c) => c.trim() !== ''));
}

const VRAI = new Set(['oui', 'vrai', 'true', '1', 'x', 'نعم']);
const FAUX = new Set(['non', 'faux', 'false', '0', 'لا']);

function convertir(col: Colonne, brut: string): { valeur: string | number | boolean | null; erreur?: string } {
  let v = brut.trim();
  if (v === '') return { valeur: null };
  switch (col.type ?? 'texte') {
    case 'nombre': {
      const n = Number(v.replace(/[\s  ]/g, '').replace(',', '.'));
      return Number.isFinite(n) ? { valeur: n } : { valeur: null, erreur: `« ${col.fr} » : « ${v} » n'est pas un nombre.` };
    }
    case 'booleen': {
      const b = normaliser(v);
      if (VRAI.has(b)) return { valeur: true };
      if (FAUX.has(b)) return { valeur: false };
      return { valeur: null, erreur: `« ${col.fr} » : « ${v} » n'est ni oui ni non.` };
    }
    case 'date': {
      let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
      if (m) return { valeur: `${m[1]}-${m[2]}-${m[3]}` };
      m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
      if (m) return { valeur: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` };
      return { valeur: null, erreur: `« ${col.fr} » : « ${v} » n'est pas une date (AAAA-MM-JJ ou JJ/MM/AAAA).` };
    }
    default: {
      // L'export préfixe d'une apostrophe les textes qui commencent par
      // = + - @ (injection de formule) : on la retire au retour.
      if (/^'[=+\-@]/.test(v)) v = v.slice(1);
      if (col.libelles) {
        const cible = normaliser(v);
        for (const [code, lib] of Object.entries(col.libelles)) {
          if (cible === normaliser(code) || cible === normaliser(lib.fr) || cible === normaliser(lib.ar)) {
            return { valeur: code };
          }
        }
        return {
          valeur: null,
          erreur: `« ${col.fr} » : « ${v} » n'est pas une valeur connue (${Object.values(col.libelles).map((l) => l.fr).join(', ')}).`,
        };
      }
      return { valeur: v };
    }
  }
}

/**
 * Lit un CSV selon un jeu de colonnes. Seules les colonnes qui portent une
 * clé d'import sont lues ; les autres (calculées, en lecture seule) sont
 * signalées comme ignorées, jamais écrites.
 */
export function lireTableau(jeu: JeuExport, octets: Buffer): TableauImporte {
  const avertissements: string[] = [];
  const rangees = lireCsv(decoder(octets, avertissements));
  if (rangees.length === 0) throw new Error('FICHIER_VIDE');

  const entetes = rangees[0].map((e) => normaliser(e.replace(/^﻿/, '')));
  const correspondance: Array<Colonne | null> = entetes.map(
    (e) =>
      jeu.colonnes.find(
        (c) =>
          e === normaliser(c.cle) ||
          e === normaliser(c.fr) ||
          e === normaliser(c.ar) ||
          (c.alias ?? []).some((a) => e === normaliser(a))
      ) ?? null
  );
  const colonnesReconnues: string[] = [];
  const colonnesIgnorees: string[] = [];
  correspondance.forEach((c, i) => {
    const libelle = rangees[0][i].trim();
    if (c?.import) colonnesReconnues.push(libelle);
    else if (libelle) colonnesIgnorees.push(libelle);
  });
  if (colonnesReconnues.length === 0) throw new Error('AUCUNE_COLONNE_RECONNUE');

  const donnees = rangees.slice(1);
  if (donnees.length > LIGNES_MAX) {
    throw new Error(`TROP_DE_LIGNES: ${donnees.length} lignes, ${LIGNES_MAX} au plus par import.`);
  }

  const lignes = donnees.map((r, n) => {
    const ligne: LigneImportee = { numero: n + 2, valeurs: {}, erreurs: [] };
    correspondance.forEach((c, i) => {
      if (!c?.import) return;
      const { valeur, erreur } = convertir(c, r[i] ?? '');
      ligne.valeurs[c.import] = valeur;
      if (erreur) ligne.erreurs.push(erreur);
    });
    return ligne;
  });
  return { colonnesReconnues, colonnesIgnorees, lignes, avertissements };
}

/**
 * Les refus d'un schéma zod, rendus lisibles pour un agent : le libellé de la
 * colonne du fichier plutôt que le nom technique du champ.
 */
export function messagesValidation(
  jeu: JeuExport,
  issues: Array<{ path: (string | number)[]; code: string; message: string; received?: unknown }>
): string[] {
  return issues.map((i) => {
    const champ = String(i.path[0] ?? '');
    const libelle = jeu.colonnes.find((c) => c.import === champ)?.fr ?? champ;
    if (i.code === 'custom') return i.message;
    if (i.code === 'invalid_type' && (i.received === 'null' || i.received === 'undefined')) {
      return `« ${libelle} » est obligatoire.`;
    }
    if (i.code === 'invalid_string') return `« ${libelle} » : format invalide.`;
    if (i.code === 'too_small') return `« ${libelle} » : trop court.`;
    if (i.code === 'too_big') return `« ${libelle} » : trop long.`;
    return `« ${libelle} » : valeur refusée.`;
  });
}

/** Message lisible pour les erreurs de lecture levées ci-dessus. */
export function messageLecture(err: unknown): string {
  const m = err instanceof Error ? err.message : '';
  if (m === 'FICHIER_VIDE') return 'Le fichier est vide.';
  if (m === 'AUCUNE_COLONNE_RECONNUE') {
    return "Aucune colonne reconnue : la première ligne doit porter les en-têtes (par exemple ceux d'un export de cet écran).";
  }
  if (m.startsWith('TROP_DE_LIGNES')) return m.replace('TROP_DE_LIGNES: ', '');
  return 'Fichier illisible.';
}
