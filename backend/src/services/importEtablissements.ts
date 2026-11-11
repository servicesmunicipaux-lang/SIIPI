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
export type ProvenanceCorrespondance = 'enregistree' | 'proposee' | 'aucune';

/** Ramène un en-tête à une forme comparable : sans accent ni casse, la ponctuation devenue espace. */
export const formeEntete = (e: string) => normaliser(e).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * La raison sociale comparée pour le doublon : sans accent, sans casse, sans
 * ponctuation ni espaces superflus — « Café de l'Avenue » et « CAFE DE L AVENUE »
 * se valent.
 */
export const formeNom = (n: string) => normaliser(n).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** L'activité du fichier, telle que la correspondance la retient. */
export const formeActivite = (a: string) => normaliser(a).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

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

/**
 * La correspondance proposée : le modèle enregistré quand ses en-têtes sont dans
 * le fichier, sinon l'en-tête usuel le plus net (identique d'abord, puis qui
 * commence par le mot usuel). Une même colonne ne sert jamais deux champs.
 */
export function proposerCorrespondance(
  entetes: string[],
  enregistree: Correspondance | null
): { correspondance: Record<ChampImport, string | null>; provenance: Record<ChampImport, ProvenanceCorrespondance> } {
  const correspondance = {} as Record<ChampImport, string | null>;
  const provenance = {} as Record<ChampImport, ProvenanceCorrespondance>;
  const prises = new Set<string>();
  const parForme = new Map(entetes.map((e) => [formeEntete(e), e]));

  for (const champ of CHAMPS_IMPORT) {
    const garde = enregistree?.[champ.cle];
    const trouve = garde ? parForme.get(formeEntete(garde)) : undefined;
    if (trouve && !prises.has(trouve)) {
      correspondance[champ.cle] = trouve;
      provenance[champ.cle] = 'enregistree';
      prises.add(trouve);
    }
  }
  for (const champ of CHAMPS_IMPORT) {
    if (correspondance[champ.cle]) continue;
    const usuels = champ.usuels.map(formeEntete);
    const libre = (e: string) => !prises.has(e);
    const exact = entetes.find((e) => libre(e) && usuels.includes(formeEntete(e)));
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
export function problemesCorrespondance(entetes: string[], c: Correspondance): string[] {
  const problemes: string[] = [];
  const presents = new Set(entetes);
  const vus = new Map<string, string>();
  for (const champ of CHAMPS_IMPORT) {
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
};
export type CategorieDuJour = { code: string; libelle_fr: string; libelle_ar: string };
export type CorrespondanceActivite = { activite: string; categorie_activite: string };

export type ActionLigne = 'creer' | 'a_verifier' | 'rattacher' | 'inchange' | 'sans_categorie' | 'erreur';

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
  remplis: string[];
  differences: Array<{ champ: string; inscrit: string; fichier: string }>;
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

const LIBELLES_CHAMPS: Record<string, string> = {
  adresse: 'Adresse',
  activite: 'Activité',
  categorie_activite: "Catégorie d'activité",
  position: 'Position',
  surface_m2: 'Surface',
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

/**
 * Rapproche chaque ligne du fichier de ce que la commune a déjà.
 * `dejaImportees` : numéros de ligne déjà écrits depuis ce même fichier (même empreinte).
 * `precisionFichier` : la précision des positions que la commune déclare pour le fichier, quand il ne la porte pas.
 */
export function rapprocher(args: {
  entetes: string[];
  rangees: string[][];
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

  const matriculesDuFichier = new Map<string, number>();
  const nomsDuFichier = new Map<string, { numero: number; nom: string }>();
  const positionsDuFichier: Array<{ numero: number; nom: string; lat: number; lng: number }> = [];

  return rangees.map((r, i) => {
    const numero = i + 2;
    const nom = lire(r, 'nom');
    const activite = lire(r, 'activite');
    const base: LigneRapprochee = {
      numero, action: 'erreur', nom, activite: activite || null, categorie_activite: null, categorie_provenance: null,
      erreurs: [], doublon: null, rattache_a: null, remplis: [], differences: [], saisie: null, avertissements: [],
    };
    const erreurs: string[] = [];
    if (r.some(contientOctetNul)) erreurs.push('La ligne contient un caractère nul : enregistrez le fichier de nouveau depuis le tableur.');
    if (!nom) erreurs.push('« Raison sociale » est vide.');
    else if ([...nom].length > 200) erreurs.push('« Raison sociale » : 200 caractères au plus.');
    if (!activite) erreurs.push('« Activité » est vide.');
    else if ([...activite].length > 200) erreurs.push('« Activité » : 200 caractères au plus.');
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
        if (precision === 'invalide' || (precision !== null && !(precision > 0 && precision <= 1000))) {
          erreurs.push('« Précision » : un nombre de mètres, de 1 à 1 000.');
        } else if (precision === null) {
          avertissements.push("Position laissée de côté : le fichier n'en donne pas la précision, et aucune n'a été déclarée pour le fichier.");
        } else position = { lat, lng, precision };
      }
    }
    const surface = lireNombre(lire(r, 'surface_m2'));
    if (surface === 'invalide' || (surface !== null && !(surface > 0 && surface <= 10_000_000))) {
      erreurs.push('« Surface » : un nombre de m² positif.');
    }
    if (erreurs.length > 0) return { ...base, erreurs };

    // La catégorie : la correspondance de la commune, ou un libellé identique — jamais devinée.
    const formeAct = formeActivite(activite);
    let categorie: string | null = null;
    let provenanceCategorie: LigneRapprochee['categorie_provenance'] = null;
    const choisie = parActivite.get(formeAct);
    if (choisie && codesDuJour.has(choisie)) {
      categorie = choisie;
      provenanceCategorie = 'correspondance';
    } else if (parLibelle.has(formeAct)) {
      categorie = parLibelle.get(formeAct) as string;
      provenanceCategorie = 'libelle';
    }
    if (choisie && !codesDuJour.has(choisie)) {
      avertissements.push(`La catégorie « ${choisie} » choisie pour cette activité n'est plus en vigueur : choisissez-en une autre.`);
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

    // Une ligne déjà écrite depuis ce même fichier : rien de plus.
    const dejaId = args.dejaImportees.get(numero);
    if (dejaId) {
      const e = existants.find((x) => x.id === dejaId);
      return { ...ligne, action: 'inchange' as const, saisie: null,
        rattache_a: e ? { id: e.id, nom: e.nom, statut: e.statut } : null,
        avertissements: [...avertissements, 'Ligne déjà importée depuis ce même fichier.'] };
    }

    // Le matricule : rattachement, jamais un second établissement.
    if (matricule) {
      const ligneDeja = matriculesDuFichier.get(matricule);
      if (ligneDeja) return { ...ligne, action: 'erreur' as const, saisie: null, erreurs: [`Matricule fiscal déjà présent ligne ${ligneDeja} du fichier.`] };
      matriculesDuFichier.set(matricule, numero);
      const inscrit = parMatricule.get(matricule);
      if (inscrit) {
        const remplis: string[] = [];
        const differences: LigneRapprochee['differences'] = [];
        const comparer = (champ: string, inscritV: string | number | null, fichierV: string | number | null, egal = (a: string, b: string) => normaliser(a) === normaliser(b)) => {
          if (fichierV === null || fichierV === '') return;
          if (inscritV === null || inscritV === '') remplis.push(LIBELLES_CHAMPS[champ]);
          else if (!egal(String(inscritV), String(fichierV))) differences.push({ champ: LIBELLES_CHAMPS[champ], inscrit: String(inscritV), fichier: String(fichierV) });
        };
        comparer('adresse', inscrit.adresse, saisie.adresse);
        comparer('activite', inscrit.activite, saisie.activite);
        comparer('categorie_activite', inscrit.categorie_activite, saisie.categorie_activite);
        comparer('surface_m2', inscrit.surface_m2, saisie.surface_m2, (a, b) => Number(a) === Number(b));
        if (position) {
          if (inscrit.latitude == null) remplis.push(LIBELLES_CHAMPS.position);
          else {
            const d = distanceM({ lat: inscrit.latitude, lng: inscrit.longitude as number }, position);
            if (d > 5) differences.push({ champ: LIBELLES_CHAMPS.position, inscrit: `${inscrit.latitude} ; ${inscrit.longitude}`, fichier: `${position.lat} ; ${position.lng} (à ${Math.round(d)} m)` });
          }
        }
        const notes = [...avertissements];
        if (inscrit.statut === 'ferme') notes.push(`« ${inscrit.nom} » est fermé : le fichier le cite encore ; rouvrez-le depuis l'écran Établissements s'il a repris.`);
        return { ...ligne, action: remplis.length > 0 ? ('rattacher' as const) : ('inchange' as const),
          rattache_a: { id: inscrit.id, nom: inscrit.nom, statut: inscrit.statut }, remplis, differences, avertissements: notes,
          saisie: remplis.length > 0 ? saisie : null };
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
