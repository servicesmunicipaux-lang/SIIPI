// L'import d'un export Kobo des levées (jalon G, lot G5a) : CSV ou Excel, tel que
// Kobo le donne, avec la correspondance des colonnes gardée par commune.
//
// RIEN N'EST DEVINÉ.
//   - L'établissement se reconnaît à son matricule fiscal ou à son identifiant
//     SIIPI, jamais à son nom (deux cafés s'appellent « Café de la Gare »).
//   - Le voyage manquant ne vaut 1 que sur un circuit d'un seul voyage : c'est la
//     base qui le décide (app._examiner_levee), pas l'import.
//   - Une date et heure sans fuseau est refusée : Kobo écrit « _submission_time » en
//     temps universel sans le dire, et une levée de 23 h 30 changerait de jour.
//   - Une date JJ/MM/AAAA n'est lue que si le fichier le prouve (un jour au-delà de
//     12 dans la colonne) ; une colonne où toutes les dates se lisent dans les deux
//     sens est refusée : le format anglo-saxon MM/JJ/AAAA y tiendrait aussi.
//   - Un numéro de série Excel n'est lu comme une date que dans un classeur, et
//     d'après le calendrier que le classeur déclare (1900 ou 1904).
//
// LA CLÉ D'ENVOI est celle de la soumission (de préférence meta/rootUuid, qui reste
// la même quand la soumission est modifiée dans Kobo), complétée par un rang de
// répétition déclaré par le formulaire quand la soumission porte plusieurs levées.
// Ni le flux ni la position de la ligne dans l'export (« _index ») n'y entrent : une
// soumission corrigée dans Kobo (autre flux) ou un export autrement filtré
// changeraient la clé, et la même levée reviendrait comme une proposition nouvelle.

import { formeEntete, type ChampTableur } from './tableur.js';
import { normaliser } from './import.js';
import { MATRICULE_VALIDE, normaliserMatricule } from '../routes/etablissements.routes.js';

export const CHAMPS_LEVEES = [
  { cle: 'date', fr: 'Date de la levée', ar: 'تاريخ الرفع', obligatoire: true,
    usuels: ['date', 'date de la levee', 'date levee', 'jour', 'date collecte', 'today', 'التاريخ', 'تاريخ الرفع'] },
  { cle: 'heure', fr: 'Heure', ar: 'الساعة', obligatoire: false, usuels: ['heure', 'heure de la levee', 'heure levee', 'time', 'الساعة'] },
  { cle: 'etablissement', fr: 'Établissement (matricule fiscal ou identifiant SIIPI)', ar: 'المؤسسة (المعرف الجبائي أو معرّف SIIPI)', obligatoire: true,
    usuels: ['etablissement', 'matricule fiscal', 'matricule', 'mf', 'identifiant etablissement', 'id etablissement', 'commerce', 'المؤسسة', 'المعرف الجبائي'] },
  { cle: 'flux', fr: 'Flux', ar: 'الصنف', obligatoire: false, usuels: ['flux', 'dechet', 'type de dechet', 'flux de dechets', 'الصنف', 'نوع النفايات'] },
  { cle: 'voyage', fr: 'Voyage', ar: 'السفرة', obligatoire: false, usuels: ['voyage', 'rotation', 'tour', 'السفرة'] },
  { cle: 'circuit', fr: 'Circuit (code ou nom)', ar: 'الدائرة (الرمز أو الاسم)', obligatoire: false,
    usuels: ['circuit', 'code circuit', 'circuit code', 'tournee', 'الدائرة'] },
  // Les usuels de la clé se lisent DANS LEUR ORDRE : rootUuid d'abord, qui survit à
  // une modification de la soumission ; instanceID ou _uuid changent à chaque fois.
  { cle: 'cle', fr: 'Clé de la soumission', ar: 'مفتاح الإرسال', obligatoire: true, ordreDesUsuels: true,
    usuels: ['meta rootuuid', 'rootuuid', 'uuid', 'meta instanceid', 'instanceid', 'cle', 'cle de soumission'] },
  // Jamais « _index » : c'est la position de la ligne dans l'export, pas un rang de la soumission.
  { cle: 'repetition', fr: 'Rang de répétition (déclaré par le formulaire)', ar: 'رتبة التكرار (تحدّدها الاستمارة)', obligatoire: false,
    usuels: ['rang de repetition', 'repetition', 'رتبة التكرار'] },
] as const satisfies readonly ChampTableur<string>[];
export type ChampLevee = (typeof CHAMPS_LEVEES)[number]['cle'];
export const CLES_CHAMPS_LEVEES = CHAMPS_LEVEES.map((c) => c.cle) as [ChampLevee, ...ChampLevee[]];
export type CorrespondanceLevees = Partial<Record<ChampLevee, string | null>>;

export type EtablissementConnu = { id: string; matricule_fiscal: string | null };
export type FluxConnu = { code: string; libelle_fr: string; libelle_ar: string };
export type CircuitConnu = { id: string; code: string | null; nom: string };

/** Une ligne du fichier, lue : ce qu'elle dit, ou pourquoi elle ne se lit pas. */
export type LigneLue = {
  numero: number;
  erreurs: string[];
  commerceId: string | null;
  fluxCode: string | null;
  jour: string | null;
  heure: string | null;
  voyage: number | null;
  circuitId: string | null;
  cleEnvoi: string | null;
  /** Ce que la ligne disait, pour l'aperçu. */
  brut: { etablissement: string; date: string; flux: string; circuit: string };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const deux = (n: number) => String(n).padStart(2, '0');

function dateValide(a: number, m: number, j: number): string | null {
  const d = new Date(Date.UTC(a, m - 1, j));
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) return null;
  const iso = `${a}-${deux(m)}-${deux(j)}`;
  return iso >= '2000-01-01' && iso <= '2100-12-31' ? iso : null;
}

/** Un instant (avec son fuseau) ramené au jour et à l'heure de Tunis. */
function aTunis(instant: Date): { jour: string; heure: string } {
  const parties = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(instant);
  const p = (t: string) => parties.find((x) => x.type === t)?.value ?? '00';
  const h = p('hour') === '24' ? '00' : p('hour');
  return { jour: `${p('year')}-${p('month')}-${p('day')}`, heure: `${h}:${p('minute')}` };
}

/**
 * Une fraction de jour d'Excel → HH:MM. Arrondie à la seconde (un 23:59 exact se
 * stocke 0,99930555…), puis tronquée à la minute, jamais au-delà de 23:59 : arrondir
 * à la minute ferait de 23:59:35 un 00:00 du même jour.
 */
function heureDeFraction(fraction: number): string {
  const minutes = Math.min(1439, Math.floor(Math.round(fraction * 86_400) / 60));
  return `${deux(Math.floor(minutes / 60))}:${deux(minutes % 60)}`;
}

/** Le numéro de série d'un classeur → jour et heure (calendrier 1900 ou 1904). */
function serieExcel(v: number, calendrier1904: boolean): { jour: string; heure: string | null } | null {
  if (!Number.isFinite(v) || v < 1) return null;
  const jours = Math.floor(v);
  const origine = calendrier1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(origine + jours * 86_400_000);
  const jour = dateValide(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  if (!jour) return null;
  const fraction = v - jours;
  if (fraction <= 0) return { jour, heure: null };
  return { jour, heure: heureDeFraction(fraction) };
}

/** Le sens des dates JJ/MM/AAAA de la colonne : prouvé par un jour au-delà de 12, sinon ambigu. */
export function sensDesBarres(valeurs: string[]): 'jj_mm' | 'mm_jj' | 'ambigu' | 'aucune' {
  let vues = 0;
  let premierGrand = false;
  let secondGrand = false;
  for (const v of valeurs) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v.trim());
    if (!m) continue;
    vues++;
    if (Number(m[1]) > 12) premierGrand = true;
    if (Number(m[2]) > 12) secondGrand = true;
  }
  if (vues === 0) return 'aucune';
  if (premierGrand && !secondGrand) return 'jj_mm';
  if (secondGrand && !premierGrand) return 'mm_jj';
  return 'ambigu';
}

/** Lit la date (et l'heure qu'elle porte) d'une cellule ; une erreur en mots sinon. */
export function lireDate(
  brut: string,
  ctx: { xlsx: boolean; calendrier1904: boolean; sens: ReturnType<typeof sensDesBarres> }
): { jour: string; heure: string | null } | { erreur: string } {
  const v = brut.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) {
    const jour = dateValide(+m[1], +m[2], +m[3]);
    return jour ? { jour, heure: null } : { erreur: `date « ${v} » : ce jour n'existe pas.` };
  }
  m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(v);
  if (m) {
    if (!m[5]) {
      return { erreur: `« ${v} » : une date et heure sans fuseau ne dit pas le jour à Tunis (l'heure de soumission de Kobo est en temps universel) ; choisissez la colonne de la date de la levée.` };
    }
    const instant = new Date(v.replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    if (Number.isNaN(instant.getTime())) return { erreur: `« ${v} » : date et heure illisibles.` };
    const t = aTunis(instant);
    return dateValide(+t.jour.slice(0, 4), +t.jour.slice(5, 7), +t.jour.slice(8, 10)) ? t : { erreur: `« ${v} » : date hors de l'intervalle admis.` };
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (m) {
    if (ctx.sens === 'ambigu') {
      return { erreur: `date « ${v} » : dans cette colonne, chaque date se lit aussi bien JJ/MM que MM/JJ ; enregistrez les dates au format AAAA-MM-JJ.` };
    }
    if (ctx.sens === 'mm_jj') return { erreur: `date « ${v} » : la colonne est au format MM/JJ/AAAA ; enregistrez les dates au format AAAA-MM-JJ.` };
    const jour = dateValide(+m[3], +m[2], +m[1]);
    return jour ? { jour, heure: null } : { erreur: `date « ${v} » : ce jour n'existe pas.` };
  }
  if (/^\d+(\.\d+)?$/.test(v)) {
    if (!ctx.xlsx) return { erreur: `date « ${v} » : un nombre n'est pas une date (AAAA-MM-JJ attendu).` };
    const s = serieExcel(Number(v), ctx.calendrier1904);
    return s ?? { erreur: `date « ${v} » : numéro de date Excel illisible.` };
  }
  return { erreur: v ? `date « ${v} » illisible (AAAA-MM-JJ attendu).` : 'date absente.' };
}

/**
 * Lit une heure (HH:MM, HH:MM:SS, avec ou sans fuseau ; fraction de jour d'Excel).
 * Une heure à fuseau qui, ramenée à Tunis, change de jour (23:30Z, c'est 00:30 le
 * lendemain) est refusée : la date de sa ligne ne le sait pas, et la levée serait
 * examinée au mauvais jour.
 */
export function lireHeure(brut: string, xlsx: boolean): string | null | { erreur: string } {
  const v = brut.trim();
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(v);
  if (m) {
    let minutes = Number(m[1]) * 60 + Number(m[2]);
    if (Number(m[1]) > 23 || Number(m[2]) > 59) return { erreur: `heure « ${v} » illisible.` };
    if (m[4]) {
      // Ramenée à l'heure de Tunis (UTC+1, sans heure d'été).
      const o = m[4] === 'Z' ? 0 : (m[4][0] === '-' ? -1 : 1) * (Number(m[4].slice(1, 3)) * 60 + Number(m[4].slice(-2)));
      const brute = minutes - o + 60;
      if (brute < 0 || brute >= 1440) {
        return { erreur: `heure « ${v} » : ramenée à l'heure de Tunis, elle tombe un autre jour que la date de la ligne ; donnez la date et l'heure ensemble, avec leur fuseau.` };
      }
      minutes = brute;
    }
    return `${deux(Math.floor(minutes / 60))}:${deux(minutes % 60)}`;
  }
  if (xlsx && /^0(\.\d+)?$/.test(v)) return heureDeFraction(Number(v));
  return { erreur: `heure « ${v} » illisible (HH:MM attendu).` };
}

/**
 * Lit chaque ligne d'après la correspondance : ce qui se lit sans la base des
 * levées (établissement, flux, circuit, date, voyage, clé). Les règles d'une levée
 * (desserte, convention, termes, doublon) sont celles de la base, examinées ensuite.
 */
export function lireLignes(args: {
  entetes: string[];
  rangees: Array<{ cellules: string[]; ligne: number }>;
  correspondance: CorrespondanceLevees;
  xlsx: boolean;
  calendrier1904: boolean;
  etablissements: EtablissementConnu[];
  flux: FluxConnu[];
  circuits: CircuitConnu[];
}): LigneLue[] {
  const indice = (c: ChampLevee) => {
    const e = args.correspondance[c];
    return e ? args.entetes.indexOf(e) : -1;
  };
  const cellule = (r: { cellules: string[] }, c: ChampLevee) => {
    const i = indice(c);
    return i < 0 ? '' : (r.cellules[i] ?? '').replace(/\u0000/g, '').trim();
  };
  const sens = sensDesBarres(args.rangees.map((r) => cellule(r, 'date')));
  const parId = new Map(args.etablissements.map((e) => [e.id.toLowerCase(), e.id]));
  const parMatricule = new Map(args.etablissements.filter((e) => e.matricule_fiscal).map((e) => [e.matricule_fiscal as string, e.id]));
  // Le code d'abord, à l'identique ; un libellé ensuite, s'il ne désigne qu'un flux.
  const codes = new Set(args.flux.map((f) => f.code));
  const fluxParLibelle = new Map<string, Set<string>>();
  for (const f of args.flux) {
    for (const nom of [f.libelle_fr, f.libelle_ar]) {
      const forme = formeEntete(nom);
      fluxParLibelle.set(forme, (fluxParLibelle.get(forme) ?? new Set<string>()).add(f.code));
    }
  }
  const unique = (liste: CircuitConnu[], cle: (c: CircuitConnu) => string | null, v: string) => {
    const f = normaliser(v);
    return liste.filter((c) => cle(c) && normaliser(cle(c) as string) === f);
  };

  return args.rangees.map((r) => {
    const erreurs: string[] = [];
    const brut = { etablissement: cellule(r, 'etablissement'), date: cellule(r, 'date'), flux: cellule(r, 'flux'), circuit: cellule(r, 'circuit') };

    let commerceId: string | null = null;
    if (!brut.etablissement) erreurs.push('établissement absent.');
    else if (UUID.test(brut.etablissement)) {
      commerceId = parId.get(brut.etablissement.toLowerCase()) ?? null;
      if (!commerceId) erreurs.push(`aucun établissement de la commune n'a l'identifiant « ${brut.etablissement} ».`);
    } else {
      const mf = normaliserMatricule(brut.etablissement);
      if (!MATRICULE_VALIDE.test(mf)) {
        erreurs.push(`« ${brut.etablissement} » n'est ni un matricule fiscal ni un identifiant SIIPI : l'établissement ne se reconnaît pas à son nom.`);
      } else {
        commerceId = parMatricule.get(mf) ?? null;
        if (!commerceId) erreurs.push(`aucun établissement de la commune n'a le matricule fiscal ${mf}.`);
      }
    }

    let fluxCode: string | null = null;
    if (brut.flux) {
      const code = brut.flux.trim().toLowerCase();
      const trouves = codes.has(code) ? new Set([code]) : fluxParLibelle.get(formeEntete(brut.flux));
      if (!trouves) erreurs.push(`flux « ${brut.flux} » inconnu de la liste nationale.`);
      else if (trouves.size > 1) erreurs.push(`le libellé « ${brut.flux} » désigne ${trouves.size} flux de la liste nationale : donnez son code.`);
      else fluxCode = [...trouves][0];
    }

    let circuitId: string | null = null;
    if (brut.circuit) {
      let trouves = unique(args.circuits, (c) => c.code, brut.circuit);
      if (trouves.length === 0) trouves = unique(args.circuits, (c) => c.nom, brut.circuit);
      if (trouves.length === 1) circuitId = trouves[0].id;
      else if (trouves.length === 0) erreurs.push(`circuit « ${brut.circuit} » inconnu (ou retiré) dans la commune.`);
      else erreurs.push(`« ${brut.circuit} » désigne ${trouves.length} circuits de la commune : précisez son code.`);
    }

    let jour: string | null = null;
    let heure: string | null = null;
    const d = lireDate(brut.date, { xlsx: args.xlsx, calendrier1904: args.calendrier1904, sens });
    if ('erreur' in d) erreurs.push(d.erreur);
    else {
      jour = d.jour;
      heure = d.heure;
    }
    const h = lireHeure(cellule(r, 'heure'), args.xlsx);
    if (h && typeof h === 'object') erreurs.push(h.erreur);
    else if (h) heure = h;

    let voyage: number | null = null;
    const vv = cellule(r, 'voyage');
    if (vv) {
      if (/^[1-6]$/.test(vv)) voyage = Number(vv);
      else erreurs.push(`voyage « ${vv} » : un nombre de 1 à 6 attendu.`);
    }

    const cle = cellule(r, 'cle');
    const rep = cellule(r, 'repetition');
    let cleEnvoi: string | null = null;
    if (!cle) erreurs.push('clé de la soumission absente : chaque ligne d’un export Kobo en porte une.');
    else if ([...cle].length > 150 || [...rep].length > 20) erreurs.push('clé de la soumission trop longue.');
    else cleEnvoi = `kobo:${cle}${rep ? `#${rep}` : ''}`;
    // La base garde 200 caractères : au-delà, la ligne le dit, la validation ne tombe pas.
    if (cleEnvoi && [...cleEnvoi].length > 200) {
      erreurs.push('clé de la soumission trop longue (200 caractères au plus) : vérifiez la colonne associée à la clé.');
      cleEnvoi = null;
    }

    return { numero: r.ligne, erreurs, commerceId, fluxCode, jour, heure, voyage, circuitId, cleEnvoi, brut };
  });
}
