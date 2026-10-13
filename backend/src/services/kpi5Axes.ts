// Le tableau de bord des indicateurs : les 5 axes et la préparation au décret
// DMA — Jalon 8 (TDR §3.2.10), refondu au lot 1 de la refonte (retrait du
// barème, de la note et du classement ; SPEC_refonte_indicateurs_saisie.md).
//
// LA RÈGLE D'OR : UNE DONNÉE MANQUANTE N'EST PAS UN ZÉRO. Ce module ne remplace
// jamais une absence par 0 :
//   - un indicateur sans source est « non renseigné », et sort des moyennes ;
//   - la couverture se dit en clair : « 14 indicateurs calculables sur 19 » ;
//   - un indice d'axe ne porte que sur ses indicateurs renseignés, et dit sur
//     combien il porte.
//
// TROIS SOURCES, DANS CET ORDRE. La mesure d'un registre de la plateforme
// (app.mesures_kpi, migration 050/063, et app.mesures_kpi_auto, migration 051) ;
// sinon la valeur déclarée par la commune (declarations_indicateurs, migration
// 068), qui vaut dès qu'elle est enregistrée (D3) ; sinon rien.
//
// LE TAUX D'ATTEINTE. Pour un indicateur qui se rapporte à un objectif — un
// pourcentage, un ratio à une cible — c'est sa lecture entre 0 et 1 : la valeur
// divisée par la cible, ou le pourcentage lui-même. Il nourrit les indices des
// axes, l'indice de préparation DMA et les alertes nationales. Ce n'est pas une
// note : aucun barème ne le pondère, aucun classement ne l'utilise.

import { query } from '../db.js';

export interface Indicateur {
  code: string;
  famille: 'indicateur' | 'dma' | 'donnee';
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
  ordre: number;
  /** Le pas le plus fin auquel la valeur a un sens (migration 070). */
  granularite: 'mensuelle' | 'annuelle' | 'actuelle';
  /** La formule et les sources en arabe ; `description` les donne en français. */
  description_ar: string | null;
}

/** Ce que la commune a dit d'elle-même, et qui rend un indicateur « sans objet ». */
export interface Profil {
  a_abattoir: boolean | null;
  decharge_controlee_anged: boolean | null;
}

interface Declaration {
  id: string;
  valeur: number;
  cible: number | null;
  commentaire: string | null;
  saisi_par: string | null;
  saisi_le: string;
  commentaire_fnct: string | null;
  commente_le: string | null;
}

interface Mesure {
  valeur: number | null;
  /** Taux d'atteinte rendu par la base (colonne « note » des fonctions de mesure). */
  note: number | null;
  detail: Record<string, unknown>;
}

export type Statut = 'renseigne' | 'non_renseigne' | 'sans_objet';

export interface Resultat {
  code: string;
  famille: Indicateur['famille'];
  axe: number;
  libelle_fr: string;
  libelle_ar: string;
  unite: string | null;
  mode: Indicateur['mode'];
  statut: Statut;
  /**
   * D'où vient la valeur retenue : mesurée par un registre de la plateforme,
   * déclarée par la commune, ou rien (non renseigné). La mesure prime.
   */
  source: 'mesure' | 'declare' | null;
  valeur: number | null;
  cible: number | null;
  /** Lecture entre 0 et 1 d'un indicateur rapporté à un objectif ; null sinon, ou non renseigné. */
  taux_atteinte: number | null;
  detail: Record<string, unknown>;
  commentaire: string | null;
  /** La déclaration retenue : qui l'a saisie, quand, et le commentaire de la FNCT (D3). */
  declaration: Omit<Declaration, 'valeur' | 'cible' | 'commentaire'> | null;
}

export interface Parametres {
  reclamation_delai_heures: number;
  taux_resolution_min: number;
  bachage_min: number;
  maintenance_min: number;
  dma_en_vigueur: number;
}

export interface CommuneKpi {
  commune_id: string;
  nom: string;
  nom_ar: string | null;
  gouvernorat: string;
  district: string | null;
  population: number | null;
  profil: Profil;
  indicateurs: Resultat[];
  /** « 14 indicateurs calculables sur 19 » : les sans-objet sortent du total. */
  couverture: { calculables: number; total: number };
  axes: { axe: number; indice: number | null; renseignes: number; notes: number }[];
  dma: { indice: number | null; niveau: 'non_evalue' | 'initial' | 'en_preparation' | 'avance' | 'pret'; renseignes: number; total: number };
}

const arrondi = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------------

export async function catalogue(): Promise<Indicateur[]> {
  return query<Indicateur>('SELECT * FROM indicateurs_kpi ORDER BY ordre, code');
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
  profils: Map<string, Profil>;
  declarations: Map<string, Map<string, Declaration>>;
  mesures: Map<string, Map<string, Mesure>>;
  /** Les mesures automatiques des indicateurs jusqu'ici déclarés (migration 051). */
  auto: Map<string, Map<string, Mesure>>;
}

/**
 * Tout ce qu'il faut pour calculer une année, pour les communes que
 * l'appelant peut lire (RLS ; app.mesures_kpi applique la même règle).
 */
export async function charger(annee: number, communeIds?: string[]): Promise<Contexte> {
  const filtre = communeIds?.length ? communeIds : null;
  const [cat, params, communes, profils, declarations, mesures, automatiques] = await Promise.all([
    catalogue(),
    parametres(),
    query<Contexte['communes'][number]>(
      `SELECT c.id, c.name, c.name_ar, c.gouvernorat, c.population, gd.district_code AS district
         FROM communes c LEFT JOIN gouvernorats_district gd ON gd.gouvernorat = c.gouvernorat
        WHERE app.can_write_commune(c.id)
          -- La vue nationale, la DMA et les alertes portent sur toutes les
          -- communes : la commune de démonstration n'en est pas. Demandée
          -- nommément (son propre portail), elle se calcule.
          AND ($1::text[] IS NULL AND NOT c.est_demo OR c.id = ANY($1))
        ORDER BY c.name`,
      [filtre]
    ),
    query<Profil & { commune_id: string }>(
      `SELECT commune_id, a_abattoir, decharge_controlee_anged FROM parametres_commune
        WHERE ($1::text[] IS NULL OR commune_id = ANY($1))`,
      [filtre]
    ),
    query<Declaration & { commune_id: string; indicateur_code: string; valeur: string; cible: string | null }>(
      `SELECT d.id, d.commune_id, d.indicateur_code, d.valeur, d.cible, d.commentaire, d.saisi_le,
              u.full_name AS saisi_par, d.commentaire_fnct, d.commente_le
         FROM declarations_indicateurs d LEFT JOIN users u ON u.id = d.saisi_par
        WHERE d.annee = $1 AND d.mois IS NULL AND d.deleted_at IS NULL
          AND ($2::text[] IS NULL OR d.commune_id = ANY($2))`,
      [annee, filtre]
    ),
    query<{ commune_id: string; code: string; valeur: string | null; note: string | null; detail: Record<string, unknown> }>(
      // Des communes nommées : le calcul ne porte que sur elles (migration 070).
      filtre
        ? 'SELECT * FROM app.mesures_kpi_communes($1, $2)'
        : 'SELECT * FROM app.mesures_kpi($1)',
      filtre ? [annee, filtre] : [annee]
    ),
    query<{ commune_id: string; code: string; valeur: string | null; note: string | null; detail: Record<string, unknown> }>(
      // Des communes nommées : le calcul ne porte que sur elles (migration 070).
      filtre
        ? 'SELECT * FROM app.mesures_kpi_auto_communes($1, $2)'
        : 'SELECT * FROM app.mesures_kpi_auto($1)',
      filtre ? [annee, filtre] : [annee]
    ),
  ]);

  const parCommune = <T>(m: Map<string, Map<string, T>>, commune: string) => {
    let ligne = m.get(commune);
    if (!ligne) {
      ligne = new Map<string, T>();
      m.set(commune, ligne);
    }
    return ligne;
  };
  const decl = new Map<string, Map<string, Declaration>>();
  for (const d of declarations) {
    parCommune(decl, d.commune_id).set(d.indicateur_code, {
      id: d.id,
      valeur: Number(d.valeur),
      cible: d.cible == null ? null : Number(d.cible),
      commentaire: d.commentaire,
      saisi_par: d.saisi_par,
      saisi_le: d.saisi_le,
      commentaire_fnct: d.commentaire_fnct,
      commente_le: d.commente_le,
    });
  }
  const ranger = (lignes: typeof mesures) => {
    const m = new Map<string, Map<string, Mesure>>();
    for (const x of lignes) {
      parCommune(m, x.commune_id).set(x.code, {
        valeur: x.valeur == null ? null : Number(x.valeur),
        note: x.note == null ? null : Number(x.note),
        detail: x.detail ?? {},
      });
    }
    return m;
  };
  return {
    annee,
    catalogue: cat,
    parametres: params,
    communes: communes.map((c) => ({ ...c, population: c.population == null ? null : Number(c.population) })),
    profils: new Map(profils.map((p) => [p.commune_id, { a_abattoir: p.a_abattoir, decharge_controlee_anged: p.decharge_controlee_anged }])),
    declarations: decl,
    mesures: ranger(mesures),
    auto: ranger(automatiques),
  };
}

// ---------------------------------------------------------------------------
// Une commune
// ---------------------------------------------------------------------------

/** Le taux d'atteinte d'une déclaration : un ratio plafonné à 1, un taux ramené entre 0 et 1. */
function tauxDeclaration(ind: Indicateur, d: Declaration): number | null {
  if (ind.saisie === 'ratio') return d.cible && d.cible > 0 ? Math.min(1, d.valeur / d.cible) : null;
  if (ind.saisie === 'taux') return Math.max(0, Math.min(1, d.valeur / 100));
  return null;
}

/**
 * Le coût global à la tonne : masse salariale, carburant, maintenance et
 * redevances de l'année, ramenés aux jours effectivement pesés, divisés par
 * le tonnage pesé. Une seule composante manquante, et il n'y a pas de coût
 * global : un coût « complet » sans le carburant serait un chiffre faux.
 */
function coutTonne(
  mesures: Map<string, Mesure>,
  declarations: Map<string, Declaration>,
  auto: Map<string, Mesure>,
  annee: number
): Mesure {
  const masse = mesures.get('MASSE_SALARIALE')?.valeur ?? null;
  const maintenance = mesures.get('COUT_MAINTENANCE')?.valeur ?? null;
  // Le carburant mesuré (pleins enregistrés) prime sur le carburant déclaré.
  const carburant = auto.get('ECO-CARBURANT')?.valeur ?? declarations.get('ECO-CARBURANT')?.valeur ?? null;
  const decharge = declarations.get('ECO-DECHARGE')?.valeur ?? null;
  const tonnage = mesures.get('TONNAGE_T')?.valeur ?? null;
  // Les jours couverts par les pesées viennent du tonnage (migration 070) : le
  // coût à la tonne n'a pas besoin de la population. Il les lisait dans le
  // kilo par habitant, et une commune sans population déclarée voyait son coût
  // « non renseigné » faute de… pesées.
  const jours = Number(mesures.get('TONNAGE_T')?.detail?.jours_couverts ?? 0) || null;
  if (masse == null || carburant == null || maintenance == null || decharge == null || tonnage == null || !jours) {
    const manquent = [
      masse == null && 'masse salariale',
      carburant == null && 'carburant',
      maintenance == null && 'maintenance',
      decharge == null && 'redevances',
      (tonnage == null || !jours) && 'pesées',
    ].filter(Boolean);
    return { valeur: null, note: null, detail: { manquent } };
  }
  const debut = Date.UTC(annee, 0, 1);
  const fin = Math.min(Date.UTC(annee, 11, 31), Date.now());
  const joursPeriode = Math.floor((fin - debut) / 86_400_000) + 1;
  const prorata = Math.min(1, jours / joursPeriode);
  const total = (masse + carburant + maintenance + decharge) * prorata;
  return {
    valeur: arrondi(total / tonnage, 3),
    note: null,
    detail: { prorata: arrondi(prorata, 3), cout_rapporte_tnd: arrondi(total, 3), tonnage_t: tonnage },
  };
}

/** Ce que le profil de la commune rend « sans objet » — rien d'autre ne change. */
function sansObjet(code: string, profil: Profil): boolean {
  if (code === 'M1-8') return profil.decharge_controlee_anged === true;
  if (code === 'M2-5') return profil.a_abattoir === false;
  return false;
}

export function calculerCommune(ctx: Contexte, communeId: string): CommuneKpi {
  const c = ctx.communes.find((x) => x.id === communeId);
  if (!c) throw new Error(`Commune hors du contexte de calcul : ${communeId}`);
  const profil = ctx.profils.get(communeId) ?? { a_abattoir: null, decharge_controlee_anged: null };
  const declarations = ctx.declarations.get(communeId) ?? new Map<string, Declaration>();
  const mesures = new Map(ctx.mesures.get(communeId) ?? new Map<string, Mesure>());
  const auto = ctx.auto.get(communeId) ?? new Map<string, Mesure>();
  mesures.set('COUT_TONNE', coutTonne(mesures, declarations, auto, ctx.annee));

  const resultats: Resultat[] = ctx.catalogue.map((ind) => {
    const base = {
      code: ind.code,
      famille: ind.famille,
      axe: ind.axe,
      libelle_fr: ind.libelle_fr,
      libelle_ar: ind.libelle_ar,
      unite: ind.unite,
      mode: ind.mode,
      commentaire: null as string | null,
      declaration: null as Resultat['declaration'],
    };
    if (sansObjet(ind.code, profil)) {
      return { ...base, statut: 'sans_objet', source: null, valeur: null, cible: null, taux_atteinte: null, detail: {} } as Resultat;
    }
    if (ind.mode === 'calcule') {
      const m = mesures.get(ind.code);
      if (m != null && m.valeur != null) {
        return { ...base, statut: 'renseigne', source: 'mesure', valeur: m.valeur, cible: null, taux_atteinte: m.note, detail: m.detail } as Resultat;
      }
      return { ...base, statut: 'non_renseigne', source: null, valeur: null, cible: null, taux_atteinte: null, detail: m?.detail ?? {} } as Resultat;
    }
    const d = declarations.get(ind.code);

    // 1. LA MESURE D'ABORD. Un registre tenu (nettoyages, fins de poste,
    //    dotations EPI, conventions, pleins, journal des incidents) donne la
    //    valeur. Un ratio mesuré sans cible connue de la plateforme reprend la
    //    cible déclarée ; sans cible du tout, il cède la place à la déclaration.
    const a = auto.get(ind.code);
    if (a && a.valeur != null) {
      const cibleAuto = typeof a.detail.cible === 'number' ? a.detail.cible : a.detail.cible != null ? Number(a.detail.cible) : null;
      const cible = cibleAuto ?? d?.cible ?? null;
      const taux =
        ind.saisie === 'ratio'
          ? a.note ?? (cible && cible > 0 ? Math.min(1, a.valeur / cible) : null)
          : ind.saisie === 'taux'
            ? a.note
            : null;
      if (ind.saisie === 'nombre' || ind.saisie === 'montant' || taux != null) {
        return {
          ...base,
          statut: 'renseigne',
          source: 'mesure',
          valeur: a.valeur,
          cible: ind.saisie === 'ratio' ? cible : null,
          taux_atteinte: taux,
          detail: a.detail,
        } as Resultat;
      }
    }

    // 2. SINON, LA DÉCLARATION — elle vaut dès qu'elle est enregistrée (D3).
    // 3. Sinon, non renseigné.
    if (!d) {
      return { ...base, statut: 'non_renseigne', source: null, valeur: null, cible: null, taux_atteinte: null, detail: {} } as Resultat;
    }
    const taux = tauxDeclaration(ind, d);
    // Un ratio sans cible ne se lit pas : sa valeur s'affiche, il reste « non
    // renseigné » pour les indices.
    const renseigne = ind.saisie === 'nombre' || ind.saisie === 'montant' || taux != null;
    return {
      ...base,
      statut: renseigne ? 'renseigne' : 'non_renseigne',
      source: renseigne ? 'declare' : null,
      valeur: d.valeur,
      cible: d.cible,
      taux_atteinte: renseigne ? taux : null,
      detail: {},
      commentaire: d.commentaire,
      declaration: {
        id: d.id,
        saisi_par: d.saisi_par,
        saisi_le: d.saisi_le,
        commentaire_fnct: d.commentaire_fnct,
        commente_le: d.commente_le,
      },
    } as Resultat;
  });

  // --- La couverture : « 14 indicateurs calculables sur 19 » ---------------
  const indicateurs = resultats.filter((r) => r.famille === 'indicateur');
  const applicables = indicateurs.filter((r) => r.statut !== 'sans_objet');
  const couverture = { calculables: applicables.filter((r) => r.statut === 'renseigne').length, total: applicables.length };

  // --- Les axes : moyenne des taux d'atteinte renseignés --------------------
  const axes = [1, 2, 3, 4, 5].map((axe) => {
    const lus = resultats.filter((r) => r.axe === axe && r.famille !== 'donnee' && r.statut !== 'sans_objet');
    const avecTaux = lus.filter((r): r is Resultat & { taux_atteinte: number } => r.taux_atteinte != null);
    return {
      axe,
      indice: avecTaux.length ? arrondi((100 * avecTaux.reduce((s, r) => s + r.taux_atteinte, 0)) / avecTaux.length) : null,
      renseignes: avecTaux.length,
      notes: lus.length,
    };
  });

  // --- Préparation au tri à la source (dispositif d'anticipation) -----------
  const dma = resultats.filter((r) => r.famille === 'dma');
  const dmaLus = dma.filter((r): r is Resultat & { taux_atteinte: number } => r.taux_atteinte != null);
  const indiceDma = dmaLus.length ? arrondi((100 * dmaLus.reduce((s, r) => s + r.taux_atteinte, 0)) / dmaLus.length) : null;
  const niveau =
    indiceDma == null ? 'non_evalue' : indiceDma < 25 ? 'initial' : indiceDma < 50 ? 'en_preparation' : indiceDma < 75 ? 'avance' : 'pret';

  return {
    commune_id: c.id,
    nom: c.name,
    nom_ar: c.name_ar,
    gouvernorat: c.gouvernorat,
    district: c.district,
    population: c.population,
    profil,
    indicateurs: resultats,
    couverture,
    axes,
    dma: { indice: indiceDma, niveau, renseignes: dmaLus.length, total: dma.length },
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
    const groupe = groupes.get(cle);
    if (groupe) groupe.push(c);
    else groupes.set(cle, [c]);
  }
  return [...groupes.entries()]
    .map(([cle, liste]) => {
      const renseigneDans = (code: string) => liste.filter((c) => c.indicateurs.find((i) => i.code === code)?.statut === 'renseigne').length;
      const somme = (code: string) =>
        liste.reduce((s, c) => {
          const v = c.indicateurs.find((i) => i.code === code)?.valeur;
          return v != null ? s + v : s;
        }, 0);
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
        axes: [1, 2, 3, 4, 5].map((axe) => {
          const indices = liste.map((c) => c.axes.find((a) => a.axe === axe)?.indice ?? null);
          return { axe, indice_moyen: moyenne(indices), communes_renseignees: indices.filter((x) => x != null).length };
        }),
        dma: {
          indice_moyen: moyenne(liste.map((c) => c.dma.indice)),
          communes_evaluees: liste.filter((c) => c.dma.indice != null).length,
        },
        // A3.1 — les tonnages et le taux de résolution, joints à l'agrégation.
        tonnage_t: renseigneDans('TONNAGE_T') ? arrondi(somme('TONNAGE_T'), 3) : null,
        communes_pesees: renseigneDans('TONNAGE_T'),
        reclamations: rec.n || null,
        taux_resolution: rec.n ? arrondi((100 * rec.r) / rec.n) : null,
      };
    })
    .sort((a, b) => (a.cle === 'non_rattache' ? 1 : b.cle === 'non_rattache' ? -1 : (a.nom ?? a.cle).localeCompare(b.nom ?? b.cle)));
}
