// L'import d'un export Kobo des pesées d'une campagne d'établissements (jalon G,
// lot G5b) : CSV ou Excel, tel que Kobo le donne, avec la correspondance des
// colonnes gardée par commune.
//
// RIEN N'EST DEVINÉ, comme pour les levées (services/importLevees.ts, dont la
// lecture des dates est reprise telle quelle) :
//   - l'établissement se reconnaît à son matricule fiscal ou à son identifiant
//     SIIPI, jamais à son nom ;
//   - la durée couverte se lit en jours OU en heures, selon la colonne choisie,
//     jamais les deux ; une durée en heures est divisée par 24, à 6 décimales (comme au portail) ;
//   - un nombre s'écrit avec au plus un séparateur décimal (point ou virgule) :
//     « 1.250 » ou « 1 250 » sont refusés, on ne sait pas s'ils valent 1,25 ou 1250 —
//     sauf dans une cellule numérique d'un classeur, qui n'a jamais de milliers ;
//   - jamais plus de décimales que la base n'en garde : un remplissage de 0,04 %
//     deviendrait 0,0 en base, et le lot entier échouerait sans dire quelle ligne ;
//   - la clé d'une soumission se lit sans son préfixe « uuid: » et sans casse : Kobo
//     écrit la même soumission « abc… » dans _uuid et « uuid:abc… » dans
//     meta/instanceID ou meta/rootUuid, et changer de colonne ne doit pas la dédoubler.
//
// Les ménages ne s'importent pas : leur campagne n'a, pour l'instant, que son
// modèle et ses refus.

import type { ChampTableur } from './tableur.js';
import { lireDate, sensDesBarres } from './importLevees.js';
import { MATRICULE_VALIDE, normaliserMatricule } from '../routes/etablissements.routes.js';

export const CHAMPS_PESEES = [
  { cle: 'date', fr: 'Date de la pesée', ar: 'تاريخ الوزن', obligatoire: true,
    usuels: ['date', 'date de la pesee', 'date pesee', 'jour', 'today', 'التاريخ', 'تاريخ الوزن'] },
  { cle: 'etablissement', fr: 'Établissement (matricule fiscal ou identifiant SIIPI)', ar: 'المؤسسة (المعرف الجبائي أو معرّف SIIPI)', obligatoire: true,
    usuels: ['etablissement', 'matricule fiscal', 'matricule', 'mf', 'identifiant etablissement', 'id etablissement', 'المؤسسة', 'المعرف الجبائي'] },
  { cle: 'poids', fr: 'Poids (kg)', ar: 'الوزن (كغ)', obligatoire: true, usuels: ['poids', 'poids kg', 'poids (kg)', 'masse', 'الوزن'] },
  { cle: 'duree_jours', fr: 'Durée couverte (jours)', ar: 'المدة المغطاة (أيام)', obligatoire: false,
    // Jamais « durée » seule : elle commence aussi « durée (heures) », et un nombre d'heures
    // lu en jours compterait vingt-quatre fois trop.
    usuels: ['duree jours', 'duree (jours)', 'jours couverts', 'المدة بالأيام'] },
  { cle: 'duree_heures', fr: 'Durée couverte (heures)', ar: 'المدة المغطاة (ساعات)', obligatoire: false,
    usuels: ['duree heures', 'duree (heures)', 'heures couvertes', 'heures'] },
  { cle: 'contenant', fr: 'Contenant', ar: 'الحاوية', obligatoire: false, usuels: ['contenant', 'type de contenant', 'bac', 'الحاوية'] },
  { cle: 'volume', fr: 'Volume du contenant (L)', ar: 'سعة الحاوية (ل)', obligatoire: false,
    usuels: ['volume', 'volume (l)', 'volume litres', 'capacite', 'السعة'] },
  { cle: 'remplissage', fr: 'Remplissage (%)', ar: 'نسبة الامتلاء (%)', obligatoire: false,
    usuels: ['remplissage', 'remplissage (%)', 'taux de remplissage', 'نسبة الامتلاء'] },
  // Les usuels de la clé se lisent dans leur ordre : rootUuid survit à une modification de la soumission.
  { cle: 'cle', fr: 'Clé de la soumission', ar: 'مفتاح الإرسال', obligatoire: true, ordreDesUsuels: true,
    usuels: ['meta rootuuid', 'rootuuid', 'uuid', 'meta instanceid', 'instanceid', 'cle', 'cle de soumission'] },
  { cle: 'repetition', fr: 'Rang de répétition (déclaré par le formulaire)', ar: 'رتبة التكرار (تحدّدها الاستمارة)', obligatoire: false,
    usuels: ['rang de repetition', 'repetition', 'رتبة التكرار'] },
] as const satisfies readonly ChampTableur<string>[];
export type ChampPesee = (typeof CHAMPS_PESEES)[number]['cle'];
export const CLES_CHAMPS_PESEES = CHAMPS_PESEES.map((c) => c.cle) as [ChampPesee, ...ChampPesee[]];
export type CorrespondancePesees = Partial<Record<ChampPesee, string | null>>;

export type EtablissementConnu = { id: string; matricule_fiscal: string | null };

export type PeseeLue = {
  numero: number;
  erreurs: string[];
  commerceId: string | null;
  jour: string | null;
  poids: number | null;
  duree: number | null;
  contenant: string | null;
  volume: number | null;
  remplissage: number | null;
  cleEnvoi: string | null;
  etablissement: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La clé d'une soumission Kobo, sans préfixe « uuid: » et sans casse. */
export const normaliserCleKobo = (cle: string) => cle.trim().replace(/^uuid:/i, '').toLowerCase();

/**
 * Un nombre à un séparateur décimal au plus, et `decimales` décimales au plus ; une
 * erreur en mots sinon. `typee` : la cellule numérique d'un classeur, lue telle
 * qu'Excel l'écrit (« 2.375 », ou « 2.2999999999999998 » pour 2,3).
 */
export function lireNombreStrict(brut: string, libelle: string, decimales = 6, typee = false): number | null | { erreur: string } {
  const v = brut.trim();
  if (!v) return null;
  const tropDeDecimales = { erreur: `${libelle} « ${v} » : ${decimales} décimale${decimales > 1 ? 's' : ''} au plus.` };
  if (typee) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return { erreur: `${libelle} « ${v} » : un nombre positif attendu.` };
    const arrondi = Number(n.toFixed(decimales));
    return Math.abs(n - arrondi) > 1e-9 * Math.max(1, Math.abs(n)) ? tropDeDecimales : arrondi;
  }
  if (!/^\d+([.,]\d+)?$/.test(v)) return { erreur: `${libelle} « ${v} » : un nombre attendu, avec au plus un séparateur décimal (12,5 ou 12.5).` };
  // « 1.250 » : 1,25 ou 1 250 ? Trois chiffres après le séparateur ressemblent aux
  // milliers d'un tableur ; on ne choisit pas.
  if (/^\d{1,3}[.,]\d{3}$/.test(v)) return { erreur: `${libelle} « ${v} » : se lit aussi bien ${v.replace(/[.,]/, ' ')} que ${v.replace(/[.,]/, ',')} ; écrivez-le sans ambiguïté.` };
  if ((v.split(/[.,]/)[1] ?? '').length > decimales) return tropDeDecimales;
  return Number(v.replace(',', '.'));
}

/** Les problèmes propres à la correspondance des pesées : une durée, en jours ou en heures. */
export function problemesDuree(c: CorrespondancePesees): string[] {
  if (c.duree_jours && c.duree_heures) return ['La durée couverte se lit en jours OU en heures : choisissez une seule des deux colonnes.'];
  if (!c.duree_jours && !c.duree_heures) return ['« Durée couverte » : choisissez la colonne qui la porte, en jours ou en heures.'];
  return [];
}

export function lirePesees(args: {
  entetes: string[];
  rangees: Array<{ cellules: string[]; ligne: number; numeriques?: boolean[] }>;
  correspondance: CorrespondancePesees;
  xlsx: boolean;
  calendrier1904: boolean;
  etablissements: EtablissementConnu[];
}): PeseeLue[] {
  const indice = (c: ChampPesee) => {
    const e = args.correspondance[c];
    return e ? args.entetes.indexOf(e) : -1;
  };
  const cellule = (r: { cellules: string[] }, c: ChampPesee) => {
    const i = indice(c);
    return i < 0 ? '' : (r.cellules[i] ?? '').replace(/\u0000/g, '').trim();
  };
  const sens = sensDesBarres(args.rangees.map((r) => cellule(r, 'date')));
  const parId = new Map(args.etablissements.map((e) => [e.id.toLowerCase(), e.id]));
  const parMatricule = new Map(args.etablissements.filter((e) => e.matricule_fiscal).map((e) => [e.matricule_fiscal as string, e.id]));

  return args.rangees.map((r) => {
    const erreurs: string[] = [];
    const etablissement = cellule(r, 'etablissement');
    let commerceId: string | null = null;
    if (!etablissement) erreurs.push('établissement absent.');
    else if (UUID.test(etablissement)) {
      commerceId = parId.get(etablissement.toLowerCase()) ?? null;
      if (!commerceId) erreurs.push(`aucun établissement de la commune n'a l'identifiant « ${etablissement} ».`);
    } else {
      const mf = normaliserMatricule(etablissement);
      if (!MATRICULE_VALIDE.test(mf)) erreurs.push(`« ${etablissement} » n'est ni un matricule fiscal ni un identifiant SIIPI : l'établissement ne se reconnaît pas à son nom.`);
      else {
        commerceId = parMatricule.get(mf) ?? null;
        if (!commerceId) erreurs.push(`aucun établissement de la commune n'a le matricule fiscal ${mf}.`);
      }
    }

    let jour: string | null = null;
    const d = lireDate(cellule(r, 'date'), { xlsx: args.xlsx, calendrier1904: args.calendrier1904, sens });
    if ('erreur' in d) erreurs.push(d.erreur);
    else jour = d.jour;

    const nombre = (c: ChampPesee, libelle: string, decimales: number) => {
      const n = lireNombreStrict(cellule(r, c), libelle, decimales, args.xlsx && Boolean(r.numeriques?.[indice(c)]));
      if (n && typeof n === 'object') {
        erreurs.push(n.erreur);
        return null;
      }
      return n;
    };
    // Les décimales que la base garde : 3 pour le poids, 1 pour le volume et le remplissage.
    const poids = nombre('poids', 'poids', 3);
    if (poids === null && !erreurs.some((e) => e.startsWith('poids'))) erreurs.push('poids absent.');
    else if (poids !== null && (poids <= 0 || poids > 5000)) erreurs.push(`poids ${poids} kg : de plus de 0 à 5 000 kg.`);
    let duree: number | null = null;
    if (args.correspondance.duree_jours) duree = nombre('duree_jours', 'durée (jours)', 4);
    else {
      const h = nombre('duree_heures', 'durée (heures)', 2);
      // En jours, 6 décimales, comme le portail (l'API n'en accepte pas plus) : 8 h donnent
      // 0,333333 par les deux chemins. Sans cet arrondi, une pesée Kobo de 8 h et une pesée
      // saisie de 8 h, même établissement et même jour, porteraient deux durées, et la base
      // refuserait la seconde (une seule durée par jour).
      duree = h === null ? null : Math.round((h / 24) * 1e6) / 1e6;
    }
    if (duree === null && !erreurs.some((e) => e.startsWith('durée'))) erreurs.push('durée couverte absente.');
    else if (duree !== null && (duree <= 0 || duree > 31)) erreurs.push('durée couverte : de plus de 0 à 31 jours.');
    const volume = nombre('volume', 'volume', 1);
    if (volume !== null && (volume <= 0 || volume > 30000)) erreurs.push('volume du contenant : de plus de 0 à 30 000 L.');
    const remplissage = nombre('remplissage', 'remplissage', 1);
    if (remplissage !== null && (remplissage <= 0 || remplissage > 100)) erreurs.push('remplissage : de plus de 0 à 100 %.');
    // La borne de la base (PESEE_DENSITE), dite ici ligne par ligne : à la validation,
    // elle refuserait le lot entier sans nommer la ligne.
    else if (poids !== null && volume !== null && remplissage !== null && volume > 0 && poids / ((volume / 1000) * (remplissage / 100)) > 2000) {
      erreurs.push(`${poids} kg dans ${volume} L remplis à ${remplissage} % font plus de 2 000 kg/m³ : le remplissage se dit en pourcentage (50, et non 0,5) ; vérifiez le volume.`);
    }
    const contenant = cellule(r, 'contenant') || null;
    if (contenant && [...contenant].length > 60) erreurs.push('contenant : 60 caractères au plus.');

    const cle = cellule(r, 'cle');
    const rep = cellule(r, 'repetition');
    let cleEnvoi: string | null = null;
    if (!cle) erreurs.push('clé de la soumission absente : chaque ligne d’un export Kobo en porte une.');
    else if ([...cle].length > 150 || [...rep].length > 20) erreurs.push('clé de la soumission trop longue.');
    else cleEnvoi = `kobo:${normaliserCleKobo(cle)}${rep ? `#${rep}` : ''}`;

    return { numero: r.ligne, erreurs, commerceId, jour, poids, duree, contenant, volume, remplissage, cleEnvoi, etablissement };
  });
}

