// L'import des établissements (jalon G, lot G2b) : la liste TCL de la commune, ou
// un jeu open data, TELS QU'ILS SONT.
//
// LA COMMUNE N'A PAS À REFORMATER SON FICHIER. Chaque commune tient sa liste à sa
// façon : les en-têtes ne sont pas ceux de SIIPI. L'écran propose une
// CORRESPONDANCE des colonnes (le modèle enregistré par la commune pour ce type de
// fichier d'abord, sinon une proposition d'après les noms d'en-têtes usuels), la
// commune la corrige, et la correspondance retenue est gardée pour l'import suivant.
//
// LE RAPPROCHEMENT EST UNE FONCTION PURE de ce que la base contient déjà : aucune
// écriture ici, et l'aperçu se recalcule à la validation, jamais repris de l'écran.
//   - même matricule fiscal qu'un établissement inscrit → RATTACHÉ : seules ses
//     cases vides se remplissent ; une valeur différente est montrée, jamais
//     écrasée (rien à remplir → « inchangé ») ;
//   - même raison sociale, ou une position à moins de 5 m (d'un inscrit ou d'une
//     ligne plus haut dans le fichier) → créé « À VÉRIFIER », avec le nom du
//     doublon probable : jamais fusionné, la commune décide ;
//   - une ligne déjà importée de ce même fichier → « inchangé » : relancer un
//     import (après avoir donné leur catégorie aux activités qui n'en avaient pas)
//     ne crée pas de doubles ;
//   - une activité sans catégorie → la ligne attend sa CORRESPONDANCE, gardée par
//     commune ; elle n'est jamais devinée (seul un libellé identique à celui d'une
//     catégorie en vigueur vaut correspondance).

import { normaliser } from './import.js';
import {
  entetesUniques,
  formeEntete,
  ligneDesEntetes,
  problemesCorrespondanceDe,
  proposerCorrespondanceDe,
  type ProvenanceCorrespondance,
  type RangeeFichier,
} from './tableur.js';
import { MATRICULE_VALIDE, normaliserMatricule } from '../routes/etablissements.routes.js';

export const SOURCES_IMPORT = ['import_tcl', 'open_data'] as const;
export type SourceImport = (typeof SOURCES_IMPORT)[number];

/** Les champs de SIIPI qu'une colonne du fichier peut alimenter, avec les en-têtes usuels qui les désignent. */
export const CHAMPS_IMPORT = [
  { cle: 'nom', fr: 'Raison sociale', ar: 'الاسم التجاري', obligatoire: true,
    usuels: ['raison sociale', 'raison_sociale', 'nom', 'nom commercial', 'denomination', 'enseigne', 'etablissement', 'nom de l etablissement', 'name', 'التسمية', 'الاسم', 'الاسم التجاري', 'اسم المؤسسة'] },
  { cle: 'activite', fr: 'Activité', ar: 'النشاط', obligatoire: true,
    usuels: ['activite', 'activite principale', 'nature de l activite', 'nature activite', 'secteur d activite', 'type d activite', 'type', 'categorie', 'activity', 'النشاط', 'طبيعة النشاط', 'نوع النشاط'] },
  { cle: 'matricule_fiscal', fr: 'Matricule fiscal', ar: 'المعرف الجبائي', obligatoire: false,
    usuels: ['matricule fiscal', 'matricule_fiscal', 'matricule', 'mf', 'm.f', 'identifiant fiscal', 'id fiscal', 'المعرف الجبائي', 'المعرّف الجبائي', 'الرقم الجبائي'] },
  { cle: 'adresse', fr: 'Adresse', ar: 'العنوان', obligatoire: false,
    usuels: ['adresse', 'adresse de l etablissement', 'rue', 'localisation', 'address', 'العنوان'] },
  { cle: 'latitude', fr: 'Latitude', ar: 'خط العرض', obligatoire: false, usuels: ['latitude', 'lat', 'y', 'خط العرض'] },
  { cle: 'longitude', fr: 'Longitude', ar: 'خط الطول', obligatoire: false, usuels: ['longitude', 'lon', 'lng', 'long', 'x', 'خط الطول'] },
  { cle: 'precision_m', fr: 'Précision (m)', ar: 'الدقة (م)', obligatoire: false, usuels: ['precision', 'precision (m)', 'precision m', 'الدقة'] },
  { cle: 'surface_m2', fr: 'Surface (m²)', ar: 'المساحة (م²)', obligatoire: false, usuels: ['surface', 'surface (m2)', 'surface m2', 'superficie', 'المساحة'] },
] as const;
export type ChampImport = (typeof CHAMPS_IMPORT)[number]['cle'];
export const CLES_CHAMPS = CHAMPS_IMPORT.map((c) => c.cle) as [ChampImport, ...ChampImport[]];

export type Correspondance = Partial<Record<ChampImport, string | null>>;
// Lus et rapprochés comme tout fichier de la commune (services/tableur.ts).
export { entetesUniques, formeEntete, ligneDesEntetes, type ProvenanceCorrespondance, type RangeeFichier };

/**
 * La raison sociale comparée pour le doublon : sans accent, sans casse, sans
 * ponctuation ni espaces superflus — « Café de l'Avenue » et « CAFE DE L AVENUE »
 * se valent.
 */
export const formeNom = (n: string) => normaliser(n).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** L'activité du fichier, telle que la correspondance la retient. */
export const formeActivite = (a: string) => normaliser(a).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** La correspondance proposée pour les champs d'un établissement (voir services/tableur.ts). */
export function proposerCorrespondance(
  entetes: string[],
  enregistree: Correspondance | null
): { correspondance: Record<ChampImport, string | null>; provenance: Record<ChampImport, ProvenanceCorrespondance> } {
  return proposerCorrespondanceDe<ChampImport>(CHAMPS_IMPORT, entetes, enregistree);
}

/** Ce qui rend une correspondance inutilisable, en mots ; vide si elle convient. */
export function problemesCorrespondance(entetes: string[], c: Correspondance): string[] {
  const problemes = problemesCorrespondanceDe<ChampImport>(CHAMPS_IMPORT, entetes, c);
  if (Boolean(c.latitude) !== Boolean(c.longitude)) problemes.push('Une position se lit avec sa latitude ET sa longitude : choisissez les deux colonnes, ou aucune.');
  return problemes;
}

// ---------------------------------------------------------------------------
// Le rapprochement
// ---------------------------------------------------------------------------

export type Existant = {
  id: string;
  nom: string;
  statut: string;
  matricule_fiscal: string | null;
  activite: string | null;
  categorie_activite: string | null;
  adresse: string | null;
  latitude: number | null;
  longitude: number | null;
  surface_m2: number | null;
  import_id: string | null;
  source_creation: string;
};
export type CategorieDuJour = { code: string; libelle_fr: string; libelle_ar: string };
export type CorrespondanceActivite = { activite: string; categorie_activite: string };
/** Une ligne de données du fichier, avec son numéro dans le tableur (en-tête compris, lignes vides comptées). */

export type ActionLigne = 'creer' | 'a_verifier' | 'rattacher' | 'inchange' | 'sans_categorie' | 'erreur';
/** Les champs qu'un rattachement remplit ou compare : des clés, que l'écran dit dans sa langue. */
export type ChampCompare = 'adresse' | 'activite' | 'categorie_activite' | 'position' | 'surface_m2';

export type LigneRapprochee = {
  numero: number;
  action: ActionLigne;
  nom: string;
  activite: string | null;
  categorie_activite: string | null;
  /** D'où vient la catégorie : la correspondance de la commune, ou un libellé identique. */
  categorie_provenance: 'correspondance' | 'libelle' | null;
  erreurs: string[];
  /** Pour « à vérifier » : le doublon probable, nommé. */
  doublon: { nom: string; raison: 'meme_nom' | 'proche'; distance_m: number | null; ligne: number | null; id: string | null } | null;
  /** Pour « rattacher » / « inchangé » : l'établissement inscrit, ce qui se remplit, et ce qui diffère sans être écrasé. */
  rattache_a: { id: string; nom: string; statut: string } | null;
  /** Comment la ligne a été reconnue : par son matricule, ou comme une ligne d'un import précédent. */
  reconnu_par: 'matricule' | 'import_precedent' | 'meme_fichier' | null;
  remplis: ChampCompare[];
  differences: Array<{ champ: ChampCompare; inscrit: string; fichier: string }>;
  /** Ce que l'écriture posera (créer, à vérifier) ou remplira (rattacher). */
  saisie: {
    nom: string;
    activite: string;
    categorie_activite: string | null;
    matricule_fiscal: string | null;
    adresse: string | null;
    latitude: number | null;
    longitude: number | null;
    precision_m: number | null;
    surface_m2: number | null;
  } | null;
  avertissements: string[];
};

/** La distance en mètres entre deux points (sphère de rayon moyen) : assez juste à 5 m près, sans base. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6_371_008.8;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function lireNombre(v: string): number | null | 'invalide' {
  const s = v.trim().replace(/[\s  ]/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : 'invalide';
}

const contientOctetNul = (t: string) => t.includes('\u0000');
// Les colonnes gardent la précision au dixième de mètre et la surface au centième
// de m² : une valeur qui s'y arrondirait à zéro serait refusée par la base, à la
// validation, sans dire quelle ligne. Elle est refusée ici, à sa ligne.
const precisionValide = (p: number) => Math.round(p * 10) / 10 > 0 && p <= 1000;
const surfaceValide = (s: number) => Math.round(s * 100) / 100 > 0 && s <= 10_000_000;
export const PRECISION_MINIMALE = 0.1;

/**
 * Rapproche chaque ligne du fichier de ce que la commune a déjà.
 * `dejaImportees` : numéros de ligne déjà écrits depuis ce même fichier (même empreinte).
 * `precisionFichier` : la précision des positions que la commune déclare pour le fichier, quand il ne la porte pas.
 */
export function rapprocher(args: {
  source: SourceImport;
  entetes: string[];
  rangees: RangeeFichier[];
  correspondance: Correspondance;
  existants: Existant[];
  categories: CategorieDuJour[];
  correspondancesActivites: CorrespondanceActivite[];
  dejaImportees: Map<number, string>;
  precisionFichier: number | null;
}): LigneRapprochee[] {
  const { entetes, rangees, correspondance, existants, categories } = args;
  const indice = (champ: ChampImport) => {
    const e = correspondance[champ];
    return e ? entetes.indexOf(e) : -1;
  };
  const colonnes = Object.fromEntries(CLES_CHAMPS.map((c) => [c, indice(c)])) as Record<ChampImport, number>;
  const lire = (r: string[], champ: ChampImport) => (colonnes[champ] >= 0 ? (r[colonnes[champ]] ?? '').trim() : '');

  const codesDuJour = new Set(categories.map((c) => c.code));
  const parLibelle = new Map<string, string>();
  for (const c of categories) for (const l of [c.code, c.libelle_fr, c.libelle_ar]) parLibelle.set(formeActivite(l), c.code);
  const parActivite = new Map(args.correspondancesActivites.map((c) => [formeActivite(c.activite), c.categorie_activite]));

  const parMatricule = new Map(existants.filter((e) => e.matricule_fiscal).map((e) => [e.matricule_fiscal as string, e]));
  const parNom = new Map<string, Existant>();
  for (const e of existants) if (!parNom.has(formeNom(e.nom))) parNom.set(formeNom(e.nom), e);
  const positionnes = existants.filter((e) => e.latitude != null && e.longitude != null);
  // Les établissements venus d'un import précédent de ce type de fichier, par raison sociale :
  // une liste corrigée puis importée de nouveau les retrouve au lieu d'en créer des doubles.
  const importesParNom = new Map<string, Existant[]>();
  for (const e of existants) {
    if (!e.import_id || e.source_creation !== args.source) continue;
    const f = formeNom(e.nom);
    importesParNom.set(f, [...(importesParNom.get(f) ?? []), e]);
  }

  const matriculesDuFichier = new Map<string, number>();
  const nomsDuFichier = new Map<string, { numero: number; nom: string }>();
  const positionsDuFichier: Array<{ numero: number; nom: string; lat: number; lng: number }> = [];

  return rangees.map(({ cellules: r, ligne: numero }) => {
    const nom = lire(r, 'nom');
    const activite = lire(r, 'activite');
    const base: LigneRapprochee = {
      numero, action: 'erreur', nom, activite: activite || null, categorie_activite: null, categorie_provenance: null,
      erreurs: [], doublon: null, rattache_a: null, reconnu_par: null, remplis: [], differences: [], saisie: null, avertissements: [],
    };
    const erreurs: string[] = [];
    if (r.some(contientOctetNul)) erreurs.push('La ligne contient un caractère nul : enregistrez le fichier de nouveau depuis le tableur.');
    if (!nom) erreurs.push('« Raison sociale » est vide.');
    else if ([...nom].length > 200) erreurs.push('« Raison sociale » : 200 caractères au plus.');
    else if (!formeNom(nom)) erreurs.push('« Raison sociale » : des lettres ou des chiffres, au moins.');
    if (!activite) erreurs.push('« Activité » est vide.');
    else if ([...activite].length > 200) erreurs.push('« Activité » : 200 caractères au plus.');
    // « - » ou « ? » pour une activité inconnue : aucune catégorie ne pourrait lui correspondre.
    else if (!formeActivite(activite)) erreurs.push(`« Activité » : « ${activite} » ne dit pas l'activité (des lettres ou des chiffres, au moins).`);
    const adresseBrute = lire(r, 'adresse');
    if ([...adresseBrute].length > 300) erreurs.push('« Adresse » : 300 caractères au plus.');

    const matriculeBrut = lire(r, 'matricule_fiscal');
    const matricule = matriculeBrut ? normaliserMatricule(matriculeBrut) : null;
    if (matricule && !MATRICULE_VALIDE.test(matricule)) {
      erreurs.push(`« Matricule fiscal » : « ${matriculeBrut} » n'a pas la forme d'un matricule (1234567A, ou 1234567A/A/M/000).`);
    }

    const avertissements: string[] = [];
    const lat = lireNombre(lire(r, 'latitude'));
    const lng = lireNombre(lire(r, 'longitude'));
    const precisionLue = lireNombre(lire(r, 'precision_m'));
    let position: { lat: number; lng: number; precision: number } | null = null;
    if (lat === 'invalide' || lng === 'invalide') erreurs.push('Position : la latitude et la longitude sont des nombres.');
    else if ((lat === null) !== (lng === null)) erreurs.push('Position : la latitude et la longitude se donnent ensemble.');
    else if (lat !== null && lng !== null) {
      if (!(lat >= 30.2 && lat <= 37.6 && lng >= 7.5 && lng <= 11.7)) {
        erreurs.push(`Position (${lat} ; ${lng}) hors de Tunisie : vérifiez l'ordre latitude, longitude.`);
      } else {
        const precision = precisionLue === 'invalide' ? 'invalide' : precisionLue ?? args.precisionFichier;
        if (precision === 'invalide' || (precision !== null && !precisionValide(precision))) {
          erreurs.push('« Précision » : un nombre de mètres, de 0,1 à 1 000.');
        } else if (precision === null) {
          avertissements.push("Position laissée de côté : le fichier n'en donne pas la précision, et aucune n'a été déclarée pour le fichier.");
        } else position = { lat, lng, precision };
      }
    }
    const surface = lireNombre(lire(r, 'surface_m2'));
    if (surface === 'invalide' || (surface !== null && !surfaceValide(surface))) {
      erreurs.push('« Surface » : un nombre de m² positif (au centième près).');
    }
    if (erreurs.length > 0) return { ...base, erreurs };

    // La catégorie : la correspondance de la commune, ou un libellé identique — jamais devinée.
    // Une correspondance que la commune a posée et que la FNCT a fermée depuis ne laisse
    // pas la place au libellé : la commune avait écarté ce choix, elle en refait un.
    const formeAct = formeActivite(activite);
    let categorie: string | null = null;
    let provenanceCategorie: LigneRapprochee['categorie_provenance'] = null;
    const choisie = parActivite.get(formeAct);
    if (choisie) {
      if (codesDuJour.has(choisie)) {
        categorie = choisie;
        provenanceCategorie = 'correspondance';
      } else {
        avertissements.push(`La catégorie « ${choisie} » choisie pour cette activité n'est plus en vigueur : choisissez-en une autre.`);
      }
    } else if (parLibelle.has(formeAct)) {
      categorie = parLibelle.get(formeAct) as string;
      provenanceCategorie = 'libelle';
    }

    const saisie = {
      nom,
      activite,
      categorie_activite: categorie,
      matricule_fiscal: matricule,
      adresse: adresseBrute || null,
      latitude: position?.lat ?? null,
      longitude: position?.lng ?? null,
      precision_m: position?.precision ?? null,
      surface_m2: typeof surface === 'number' ? surface : null,
    };
    const ligne = { ...base, categorie_activite: categorie, categorie_provenance: provenanceCategorie, saisie, avertissements };

    /** Rattache la ligne à un inscrit : ses cases vides se remplissent, une valeur différente est montrée, jamais écrasée. */
    const rattacher = (inscrit: Existant, reconnuPar: 'matricule' | 'import_precedent', notes: string[]): LigneRapprochee => {
      const remplis: ChampCompare[] = [];
      const differences: LigneRapprochee['differences'] = [];
      const comparer = (champ: ChampCompare, inscritV: string | number | null, fichierV: string | number | null, egal = (a: string, b: string) => normaliser(a) === normaliser(b)) => {
        if (fichierV === null || fichierV === '') return;
        if (inscritV === null || inscritV === '') remplis.push(champ);
        else if (!egal(String(inscritV), String(fichierV))) differences.push({ champ, inscrit: String(inscritV), fichier: String(fichierV) });
      };
      comparer('adresse', inscrit.adresse, saisie.adresse);
      comparer('activite', inscrit.activite, saisie.activite);
      comparer('categorie_activite', inscrit.categorie_activite, saisie.categorie_activite);
      comparer('surface_m2', inscrit.surface_m2, saisie.surface_m2, (a, b) => Number(a) === Number(b));
      if (position) {
        if (inscrit.latitude == null) remplis.push('position');
        else {
          const d = distanceM({ lat: inscrit.latitude, lng: inscrit.longitude as number }, position);
          if (d > 5) differences.push({ champ: 'position', inscrit: `${inscrit.latitude} ; ${inscrit.longitude}`, fichier: `${position.lat} ; ${position.lng} (à ${Math.round(d)} m)` });
        }
      }
      if (inscrit.statut === 'ferme') notes.push(`« ${inscrit.nom} » est fermé : le fichier le cite encore ; rouvrez-le depuis l'écran Établissements s'il a repris.`);
      return { ...ligne, action: remplis.length > 0 ? 'rattacher' : 'inchange', reconnu_par: reconnuPar,
        rattache_a: { id: inscrit.id, nom: inscrit.nom, statut: inscrit.statut }, remplis, differences, avertissements: notes,
        saisie: remplis.length > 0 ? saisie : null };
    };

    // Une ligne déjà écrite depuis ce même fichier : rien de plus.
    const dejaId = args.dejaImportees.get(numero);
    if (dejaId) {
      const e = existants.find((x) => x.id === dejaId);
      return { ...ligne, action: 'inchange' as const, saisie: null, reconnu_par: 'meme_fichier' as const,
        rattache_a: e ? { id: e.id, nom: e.nom, statut: e.statut } : null,
        avertissements: [...avertissements, 'Ligne déjà importée depuis ce même fichier.'] };
    }

    // Le matricule : rattachement, jamais un second établissement.
    if (matricule) {
      const ligneDeja = matriculesDuFichier.get(matricule);
      if (ligneDeja) return { ...ligne, action: 'erreur' as const, saisie: null, erreurs: [`Matricule fiscal déjà présent ligne ${ligneDeja} du fichier.`] };
      matriculesDuFichier.set(matricule, numero);
      const inscrit = parMatricule.get(matricule);
      if (inscrit) return rattacher(inscrit, 'matricule', [...avertissements]);
    } else {
      // Sans matricule : la même ligne d'un import précédent de ce type de fichier
      // (même raison sociale, même activité, et même adresse ou moins de 5 m) est
      // retrouvée. Une liste corrigée d'une case puis importée de nouveau ne crée
      // pas des centaines de doubles « à vérifier ».
      const fAdresse = saisie.adresse ? formeNom(saisie.adresse) : '';
      const retrouve = (importesParNom.get(formeNom(nom)) ?? []).find(
        (e) =>
          formeActivite(e.activite ?? '') === formeAct &&
          ((fAdresse !== '' && e.adresse != null && formeNom(e.adresse) === fAdresse) ||
            (position != null && e.latitude != null && distanceM({ lat: e.latitude, lng: e.longitude as number }, position) < 5))
      );
      if (retrouve) {
        return rattacher(retrouve, 'import_precedent', [
          ...avertissements,
          "Retrouvé dans un import précédent : même raison sociale, même activité et même adresse (ou moins de 5 m).",
        ]);
      }
    }

    if (!categorie) return { ...ligne, action: 'sans_categorie' as const, saisie: null };

    // Le doublon probable : nommé, jamais fusionné.
    const fNom = formeNom(nom);
    let doublon: LigneRapprochee['doublon'] = null;
    const memeNomInscrit = parNom.get(fNom);
    if (memeNomInscrit) doublon = { nom: memeNomInscrit.nom, raison: 'meme_nom', distance_m: null, ligne: null, id: memeNomInscrit.id };
    else {
      const plusHaut = nomsDuFichier.get(fNom);
      if (plusHaut) doublon = { nom: plusHaut.nom, raison: 'meme_nom', distance_m: null, ligne: plusHaut.numero, id: null };
    }
    if (!doublon && position) {
      for (const e of positionnes) {
        const d = distanceM({ lat: e.latitude as number, lng: e.longitude as number }, position);
        if (d < 5) { doublon = { nom: e.nom, raison: 'proche', distance_m: Math.round(d * 10) / 10, ligne: null, id: e.id }; break; }
      }
      if (!doublon) {
        for (const p of positionsDuFichier) {
          const d = distanceM(p, position);
          if (d < 5) { doublon = { nom: p.nom, raison: 'proche', distance_m: Math.round(d * 10) / 10, ligne: p.numero, id: null }; break; }
        }
      }
    }
    if (!nomsDuFichier.has(fNom)) nomsDuFichier.set(fNom, { numero, nom });
    if (position) positionsDuFichier.push({ numero, nom, lat: position.lat, lng: position.lng });
    return { ...ligne, action: doublon ? ('a_verifier' as const) : ('creer' as const), doublon };
  });
}

/** Le motif posé sur un établissement créé « à vérifier » : le doublon, nommé. */
export function motifDoublon(d: NonNullable<LigneRapprochee['doublon']>, fichier: string): string {
  const qui = d.ligne ? `« ${d.nom} » (ligne ${d.ligne} du fichier)` : `« ${d.nom} »`;
  const pourquoi = d.raison === 'meme_nom' ? `même raison sociale que ${qui}` : `à ${d.distance_m} m de ${qui}`;
  return `Doublon probable à l'import de « ${fichier} » : ${pourquoi}. À confirmer ou à fermer.`.slice(0, 500);
}
