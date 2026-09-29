// Le tableau de bord KPI 5 axes, la note du Concours national de propreté et
// la maturité de préparation au décret DMA — Jalon 8 (TDR §3.2.10).
//
// LA RÈGLE D'OR : UNE DONNÉE MANQUANTE N'EST PAS UN ZÉRO. Ce module ne remplace
// jamais une absence par 0 :
//   - un indicateur sans source est « non renseigné », et sort du calcul ;
//   - la note du Concours se calcule sur les seuls points renseignés, et la
//     couverture (« 14/19 indicateurs, 72 % des points ») s'affiche à côté ;
//   - une commune dont la couverture est trop faible n'est pas classée : une
//     note calculée sur trois indicateurs ne se compare pas à une note
//     calculée sur dix-neuf.
//
// Les mesures viennent de la base (app.mesures_kpi, migration 050) ; les
// saisies de la fiche d'évaluation (valeurs_kpi). Tout le reste — notes,
// reventilation, moyennes — se fait ici, là où il se relit et se teste.

import { query } from '../db.js';

export interface Indicateur {
  code: string;
  famille: 'concours' | 'dma' | 'donnee';
  module: string | null;
  axe: number;
  libelle_fr: string;
  libelle_ar: string;
  description: string;
  mode: 'calcule' | 'saisi';
  saisie: 'ratio' | 'taux' | 'nombre' | 'montant' | null;
  libelle_valeur: string | null;
  libelle_cible: string | null;
  unite: string | null;
  points: number | null;
  ordre: number;
}

export interface Fiche {
  id: string;
  commune_id: string;
  annee: number;
  statut: 'brouillon' | 'soumise' | 'validee';
  a_abattoir: boolean | null;
  decharge_controlee_anged: boolean | null;
  experience_innovante: boolean | null;
  agent_reclamations: boolean | null;
}

interface Saisie {
  valeur: number;
  cible: number | null;
  commentaire: string | null;
}

interface Mesure {
  valeur: number | null;
  note: number | null;
  detail: Record<string, unknown>;
}

export type Statut = 'renseigne' | 'non_renseigne' | 'sans_objet' | 'reventile';

export interface Resultat {
  code: string;
  famille: Indicateur['famille'];
  module: string | null;
  axe: number;
  libelle_fr: string;
  libelle_ar: string;
  unite: string | null;
  mode: Indicateur['mode'];
  statut: Statut;
  valeur: number | null;
  cible: number | null;
  /** Taux d'atteinte, entre 0 et 1 ; null si l'indicateur n'est pas noté ou pas renseigné. */
  note: number | null;
  points_base: number | null;
  points_effectifs: number | null;
  points_obtenus: number | null;
  /** Vers quel indicateur les points ont été reportés, ou d'où ils viennent. */
  reventile_vers: string | null;
  recoit_de: string[];
  detail: Record<string, unknown>;
  commentaire: string | null;
}

export interface Parametres {
  reclamation_delai_heures: number;
  taux_resolution_min: number;
  bachage_min: number;
  maintenance_min: number;
  couverture_classement_min: number;
  bareme_provisoire: number;
  dma_en_vigueur: number;
}

export interface CommuneKpi {
  commune_id: string;
  nom: string;
  nom_ar: string | null;
  gouvernorat: string;
  district: string | null;
  population: number | null;
  fiche: { statut: Fiche['statut'] | null; id: string | null };
  indicateurs: Resultat[];
  concours: {
    score: number | null;
    indicateurs_renseignes: number;
    indicateurs_applicables: number;
    points_renseignes: number;
    points_applicables: number;
    couverture: number | null;
    classe: boolean;
    motif_non_classe: string | null;
  };
  axes: { axe: number; indice: number | null; renseignes: number; notes: number }[];
  dma: { indice: number | null; niveau: 'non_evalue' | 'initial' | 'en_preparation' | 'avance' | 'pret'; renseignes: number; total: number };
}

const arrondi = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------------

export async function catalogue(): Promise<Indicateur[]> {
  const lignes = await query<Indicateur & { points: string | null }>('SELECT * FROM indicateurs_kpi ORDER BY ordre, code');
  return lignes.map((l) => ({ ...l, points: l.points == null ? null : Number(l.points) }));
}

export async function parametres(): Promise<Parametres> {
  const lignes = await query<{ cle: string; valeur: string }>('SELECT cle, valeur FROM parametres_kpi');
  return Object.fromEntries(lignes.map((l) => [l.cle, Number(l.valeur)])) as unknown as Parametres;
}

interface Contexte {
  annee: number;
  catalogue: Indicateur[];
  parametres: Parametres;
  communes: { id: string; name: string; name_ar: string | null; gouvernorat: string; population: number | null; district: string | null }[];
  fiches: Map<string, Fiche>;
  saisies: Map<string, Map<string, Saisie>>;
  mesures: Map<string, Map<string, Mesure>>;
}

/**
 * Tout ce qu'il faut pour calculer une année, pour les communes que
 * l'appelant peut lire (RLS ; app.mesures_kpi applique la même règle).
 */
export async function charger(annee: number, communeIds?: string[]): Promise<Contexte> {
  const filtre = communeIds?.length ? communeIds : null;
  const [cat, params, communes, fiches, saisies, mesures] = await Promise.all([
    catalogue(),
    parametres(),
    query<Contexte['communes'][number]>(
      `SELECT c.id, c.name, c.name_ar, c.gouvernorat, c.population, gd.district_code AS district
         FROM communes c LEFT JOIN gouvernorats_district gd ON gd.gouvernorat = c.gouvernorat
        WHERE app.can_write_commune(c.id) AND ($1::text[] IS NULL OR c.id = ANY($1))
        ORDER BY c.name`,
      [filtre]
    ),
    query<Fiche>('SELECT * FROM evaluations_kpi WHERE annee = $1 AND ($2::text[] IS NULL OR commune_id = ANY($2))', [annee, filtre]),
    query<{ commune_id: string; indicateur_code: string; valeur: string; cible: string | null; commentaire: string | null }>(
      `SELECT v.commune_id, v.indicateur_code, v.valeur, v.cible, v.commentaire
         FROM valeurs_kpi v JOIN evaluations_kpi e ON e.id = v.evaluation_id
        WHERE e.annee = $1 AND ($2::text[] IS NULL OR v.commune_id = ANY($2))`,
      [annee, filtre]
    ),
    query<{ commune_id: string; code: string; valeur: string | null; note: string | null; detail: Record<string, unknown> }>(
      'SELECT * FROM app.mesures_kpi($1) WHERE ($2::text[] IS NULL OR commune_id = ANY($2))',
      [annee, filtre]
    ),
  ]);

  const parCommune = <T>(m: Map<string, Map<string, T>>, commune: string) => {
    if (!m.has(commune)) m.set(commune, new Map());
    return m.get(commune)!;
  };
  const s = new Map<string, Map<string, Saisie>>();
  for (const v of saisies) {
    parCommune(s, v.commune_id).set(v.indicateur_code, {
      valeur: Number(v.valeur),
      cible: v.cible == null ? null : Number(v.cible),
      commentaire: v.commentaire,
    });
  }
  const m = new Map<string, Map<string, Mesure>>();
  for (const x of mesures) {
    parCommune(m, x.commune_id).set(x.code, {
      valeur: x.valeur == null ? null : Number(x.valeur),
      note: x.note == null ? null : Number(x.note),
      detail: x.detail ?? {},
    });
  }
  return {
    annee,
    catalogue: cat,
    parametres: params,
    communes: communes.map((c) => ({ ...c, population: c.population == null ? null : Number(c.population) })),
    fiches: new Map(fiches.map((f) => [f.commune_id, f])),
    saisies: s,
    mesures: m,
  };
}

// ---------------------------------------------------------------------------
// Une commune
// ---------------------------------------------------------------------------

/** La note d'une saisie : un ratio plafonné à 1, un taux ramené entre 0 et 1. */
function noteSaisie(ind: Indicateur, s: Saisie): number | null {
  if (ind.saisie === 'ratio') return s.cible && s.cible > 0 ? Math.min(1, s.valeur / s.cible) : null;
  if (ind.saisie === 'taux') return Math.max(0, Math.min(1, s.valeur / 100));
  return null;
}

/**
 * Le coût global à la tonne : masse salariale, carburant, maintenance et
 * redevances de l'année, ramenés aux jours effectivement pesés, divisés par
 * le tonnage pesé. Une seule composante manquante, et il n'y a pas de coût
 * global : un coût « complet » sans le carburant serait un chiffre faux.
 */
function coutTonne(mesures: Map<string, Mesure>, saisies: Map<string, Saisie>, annee: number): Mesure {
  const masse = mesures.get('MASSE_SALARIALE')?.valeur ?? null;
  const maintenance = mesures.get('COUT_MAINTENANCE')?.valeur ?? null;
  const carburant = saisies.get('ECO-CARBURANT')?.valeur ?? null;
  const decharge = saisies.get('ECO-DECHARGE')?.valeur ?? null;
  const tonnage = mesures.get('TONNAGE_T')?.valeur ?? null;
  const jours = Number(mesures.get('KG_HAB_J')?.detail?.jours_couverts ?? 0) || null;
  const manquent = [
    masse == null && 'masse salariale',
    carburant == null && 'carburant',
    maintenance == null && 'maintenance',
    decharge == null && 'redevances',
    (tonnage == null || !jours) && 'pesées',
  ].filter(Boolean);
  if (manquent.length) return { valeur: null, note: null, detail: { manquent } };
  const debut = Date.UTC(annee, 0, 1);
  const fin = Math.min(Date.UTC(annee, 11, 31), Date.now());
  const joursPeriode = Math.floor((fin - debut) / 86_400_000) + 1;
  const prorata = Math.min(1, jours! / joursPeriode);
  const total = (masse! + carburant! + maintenance! + decharge!) * prorata;
  return {
    valeur: arrondi(total / tonnage!, 3),
    note: null,
    detail: { prorata: arrondi(prorata, 3), cout_rapporte_tnd: arrondi(total, 3), tonnage_t: tonnage },
  };
}

export function calculerCommune(ctx: Contexte, communeId: string): CommuneKpi {
  const c = ctx.communes.find((x) => x.id === communeId)!;
  const fiche = ctx.fiches.get(communeId) ?? null;
  const saisies = ctx.saisies.get(communeId) ?? new Map<string, Saisie>();
  const mesures = new Map(ctx.mesures.get(communeId) ?? new Map<string, Mesure>());
  mesures.set('COUT_TONNE', coutTonne(mesures, saisies, ctx.annee));

  const resultats: Resultat[] = ctx.catalogue.map((ind) => {
    const base = {
      code: ind.code,
      famille: ind.famille,
      module: ind.module,
      axe: ind.axe,
      libelle_fr: ind.libelle_fr,
      libelle_ar: ind.libelle_ar,
      unite: ind.unite,
      mode: ind.mode,
      points_base: ind.points,
      points_effectifs: ind.points,
      points_obtenus: null,
      reventile_vers: null,
      recoit_de: [] as string[],
      commentaire: null as string | null,
    };
    if (ind.mode === 'calcule') {
      const m = mesures.get(ind.code);
      const renseigne = m != null && m.valeur != null;
      return {
        ...base,
        statut: renseigne ? 'renseigne' : 'non_renseigne',
        valeur: renseigne ? m!.valeur : null,
        cible: null,
        note: renseigne ? m!.note : null,
        detail: m?.detail ?? {},
      } as Resultat;
    }
    const s = saisies.get(ind.code);
    const note = s ? noteSaisie(ind, s) : null;
    // Un ratio sans cible ne se note pas : il reste « non renseigné » pour
    // le Concours, mais sa valeur saisie s'affiche.
    const renseigne = s != null && (ind.saisie === 'nombre' || ind.saisie === 'montant' || note != null);
    return {
      ...base,
      statut: renseigne ? 'renseigne' : 'non_renseigne',
      valeur: s ? s.valeur : null,
      cible: s ? s.cible : null,
      note: renseigne ? note : null,
      detail: {},
      commentaire: s?.commentaire ?? null,
    } as Resultat;
  });
  const parCode = new Map(resultats.map((r) => [r.code, r]));

  // --- Reventilation du Concours (méthodologie ministérielle) --------------
  const reporter = (de: string, vers: string) => {
    const a = parCode.get(de);
    const b = parCode.get(vers);
    if (!a || !b) return;
    b.points_effectifs = (b.points_effectifs ?? 0) + (a.points_effectifs ?? 0);
    b.recoit_de.push(de);
    a.statut = 'reventile';
    a.reventile_vers = vers;
    a.points_effectifs = 0;
    a.note = null;
  };
  // Décharge contrôlée par l'ANGeD : M1-8 ne dépend plus de la commune.
  if (fiche?.decharge_controlee_anged === true) reporter('M1-8', 'M1-9');
  // Aucune expérience innovante : M1-10 revient à la propreté générale.
  if (fiche?.experience_innovante === false) reporter('M1-10', 'M1-3');
  // Pas d'abattoir municipal : sans objet, hors du dénominateur.
  if (fiche?.a_abattoir === false) {
    const a = parCode.get('M2-5');
    if (a) {
      a.statut = 'sans_objet';
      a.points_effectifs = 0;
      a.note = null;
    }
  }

  // --- La note du Concours, sur les seuls points renseignés -----------------
  const concours = resultats.filter((r) => r.famille === 'concours');
  const applicables = concours.filter((r) => r.statut === 'renseigne' || r.statut === 'non_renseigne');
  const renseignes = applicables.filter((r) => r.statut === 'renseigne' && r.note != null);
  for (const r of renseignes) r.points_obtenus = arrondi((r.note ?? 0) * (r.points_effectifs ?? 0), 2);
  const pointsApplicables = applicables.reduce((s, r) => s + (r.points_effectifs ?? 0), 0);
  const pointsRenseignes = renseignes.reduce((s, r) => s + (r.points_effectifs ?? 0), 0);
  const obtenus = renseignes.reduce((s, r) => s + (r.points_obtenus ?? 0), 0);
  const score = pointsRenseignes > 0 ? arrondi((100 * obtenus) / pointsRenseignes) : null;
  const couverture = pointsApplicables > 0 ? arrondi((100 * pointsRenseignes) / pointsApplicables) : null;
  const seuil = ctx.parametres.couverture_classement_min ?? 60;
  // Le classement OFFICIEL exige en plus une fiche validée par la FNCT :
  // c'est classement() qui l'ajoute, selon la vue demandée.
  const motif = score == null ? 'aucun_indicateur' : (couverture ?? 0) < seuil ? 'couverture_insuffisante' : null;

  // --- Les axes : moyenne des taux d'atteinte renseignés --------------------
  const axes = [1, 2, 3, 4, 5].map((axe) => {
    const notes = resultats.filter((r) => r.axe === axe && r.famille !== 'donnee' && (r.statut === 'renseigne' || r.statut === 'non_renseigne'));
    const avecNote = notes.filter((r) => r.note != null);
    return {
      axe,
      indice: avecNote.length ? arrondi((100 * avecNote.reduce((s, r) => s + r.note!, 0)) / avecNote.length) : null,
      renseignes: avecNote.length,
      notes: notes.length,
    };
  });

  // --- Préparation au tri à la source (dispositif d'anticipation) -----------
  const dma = resultats.filter((r) => r.famille === 'dma');
  const dmaNotes = dma.filter((r) => r.note != null);
  const indiceDma = dmaNotes.length ? arrondi((100 * dmaNotes.reduce((s, r) => s + r.note!, 0)) / dmaNotes.length) : null;
  const niveau =
    indiceDma == null ? 'non_evalue' : indiceDma < 25 ? 'initial' : indiceDma < 50 ? 'en_preparation' : indiceDma < 75 ? 'avance' : 'pret';

  return {
    commune_id: c.id,
    nom: c.name,
    nom_ar: c.name_ar,
    gouvernorat: c.gouvernorat,
    district: c.district,
    population: c.population,
    fiche: { statut: fiche?.statut ?? null, id: fiche?.id ?? null },
    indicateurs: resultats,
    concours: {
      score,
      indicateurs_renseignes: renseignes.length,
      indicateurs_applicables: applicables.length,
      points_renseignes: arrondi(pointsRenseignes, 2),
      points_applicables: arrondi(pointsApplicables, 2),
      couverture,
      classe: motif === null,
      motif_non_classe: motif,
    },
    axes,
    dma: { indice: indiceDma, niveau, renseignes: dmaNotes.length, total: dma.length },
  };
}

// ---------------------------------------------------------------------------
// Les niveaux d'agrégation : commune, gouvernorat, district FNCT, national
// ---------------------------------------------------------------------------

export type Niveau = 'commune' | 'gouvernorat' | 'district' | 'national';

const moyenne = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? arrondi(v.reduce((s, x) => s + x, 0) / v.length) : null;
};

/** Regroupe des communes calculées ; une commune sans district reste « non rattachée ». */
export function agreger(communes: CommuneKpi[], niveau: Exclude<Niveau, 'commune'>, districts: Map<string, string>) {
  const groupes = new Map<string, CommuneKpi[]>();
  for (const c of communes) {
    const cle = niveau === 'national' ? 'national' : niveau === 'gouvernorat' ? c.gouvernorat : (c.district ?? 'non_rattache');
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle)!.push(c);
  }
  return [...groupes.entries()]
    .map(([cle, liste]) => {
      const classees = liste.filter((c) => c.concours.classe);
      const somme = (code: string, champ: 'valeur') =>
        liste.reduce((s, c) => {
          const r = c.indicateurs.find((i) => i.code === code);
          return r?.[champ] != null ? s + r[champ]! : s;
        }, 0);
      const renseigneDans = (code: string) => liste.filter((c) => c.indicateurs.find((i) => i.code === code)?.statut === 'renseigne').length;
      // Le taux de résolution agrégé se recompose depuis les comptes, pas
      // comme une moyenne de taux : une commune de dix réclamations ne pèse
      // pas autant qu'une commune de mille.
      const rec = liste.reduce(
        (s, c) => {
          const d = c.indicateurs.find((i) => i.code === 'M3-1')?.detail as { reclamations?: number; resolues?: number } | undefined;
          return { n: s.n + (d?.reclamations ?? 0), r: s.r + (d?.resolues ?? 0) };
        },
        { n: 0, r: 0 }
      );
      return {
        cle,
        nom: niveau === 'district' ? (districts.get(cle) ?? null) : cle,
        communes: liste.length,
        concours: {
          communes_classees: classees.length,
          score_moyen: moyenne(classees.map((c) => c.concours.score)),
          couverture_moyenne: moyenne(liste.map((c) => c.concours.couverture)),
        },
        axes: [1, 2, 3, 4, 5].map((axe) => {
          const indices = liste.map((c) => c.axes.find((a) => a.axe === axe)?.indice ?? null);
          return { axe, indice_moyen: moyenne(indices), communes_renseignees: indices.filter((x) => x != null).length };
        }),
        dma: {
          indice_moyen: moyenne(liste.map((c) => c.dma.indice)),
          communes_evaluees: liste.filter((c) => c.dma.indice != null).length,
        },
        // A3.1 — les tonnages et le taux de résolution, joints à l'agrégation.
        tonnage_t: renseigneDans('TONNAGE_T') ? arrondi(somme('TONNAGE_T', 'valeur'), 3) : null,
        communes_pesees: renseigneDans('TONNAGE_T'),
        reclamations: rec.n || null,
        taux_resolution: rec.n ? arrondi((100 * rec.r) / rec.n) : null,
      };
    })
    .sort((a, b) => (a.cle === 'non_rattache' ? 1 : b.cle === 'non_rattache' ? -1 : (a.nom ?? a.cle).localeCompare(b.nom ?? b.cle)));
}

/**
 * Le classement du Concours : les communes classées d'abord, par score.
 * Officiel : seules les fiches validées par la FNCT concourent — une note
 * déclarée par la commune elle-même n'est pas une note de concours.
 */
export function marquerOfficiel(liste: CommuneKpi[], officiel: boolean): CommuneKpi[] {
  return liste.map((c) =>
    officiel && c.concours.classe && c.fiche.statut !== 'validee'
      ? { ...c, concours: { ...c.concours, classe: false, motif_non_classe: 'fiche_non_validee' } }
      : c
  );
}

export function classement(liste: CommuneKpi[], officiel: boolean) {
  const communes = marquerOfficiel(liste, officiel);
  const classees = communes.filter((c) => c.concours.classe).sort((a, b) => (b.concours.score ?? 0) - (a.concours.score ?? 0));
  let rang = 0;
  let precedent: number | null = null;
  const avecRang = classees.map((c, i) => {
    if (c.concours.score !== precedent) rang = i + 1;
    precedent = c.concours.score;
    return { ...ligneClassement(c), rang };
  });
  const autres = communes
    .filter((c) => !c.concours.classe && c.concours.score != null)
    .sort((a, b) => (b.concours.couverture ?? 0) - (a.concours.couverture ?? 0))
    .map((c) => ({ ...ligneClassement(c), rang: null }));
  return [...avecRang, ...autres];
}

function ligneClassement(c: CommuneKpi) {
  return {
    commune_id: c.commune_id,
    nom: c.nom,
    nom_ar: c.nom_ar,
    gouvernorat: c.gouvernorat,
    district: c.district,
    score: c.concours.score,
    indicateurs_renseignes: c.concours.indicateurs_renseignes,
    indicateurs_applicables: c.concours.indicateurs_applicables,
    couverture: c.concours.couverture,
    fiche: c.fiche.statut,
    classe: c.concours.classe,
    motif_non_classe: c.concours.motif_non_classe,
    dma_indice: c.dma.indice,
  };
}
