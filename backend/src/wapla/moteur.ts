// Le moteur WaPla, réécrit (couche WaPla, lots W1a et W1b ;
// docs/specs_metier/SPEC_wapla_couche_planification.md § 4).
//
// MÉTHODE. UNIDO Solid Waste Management Plan (WaPla) Tool, v1.5 (février
// 2021), TU Wien pour l'UNIDO/GEF. Le code n'est pas copié : le moteur est
// réécrit à partir de la lecture de `app/shiny/server.r`, dont chaque formule
// est citée (`server.r:NNN`) dans docs/specs_metier/sources/wapla/
// wapla-moteur-reference.md. Réutilisation confirmée par l'UNIDO (13/10/2026).
//
// UNE FONCTION PURE. Des entrées, des résultats : ni base, ni réseau, ni
// horloge. La couche WaPla est à part (SPEC § 0) : aucun chiffre de SIIPI ne
// dépend jamais de ce qui sort d'ici.
//
// DEUX MODES, UN SEUL EN SERVICE (SPEC § 4.2).
// - CORRIGÉ, par défaut, le seul qui s'affiche : les défauts D1 à D10 de
//   l'outil d'origine sont corrigés.
// - FIDÈLE : l'outil d'origine, défauts compris. Il ne sert qu'aux campagnes :
//   il prouve que l'outil est compris avant d'être corrigé, et chaque écart
//   entre les deux modes doit porter le nom d'un défaut — la campagne le
//   vérifie en appliquant les corrections une à une (`corrections`).
// Les identifiants de l'outil (tc_1, pop_11, ghg_19, W1, D2…) sont gardés tels
// quels : c'est par eux que chaque calcul se retrouve dans le code d'origine.
//
// Ce que le moteur NE reproduit PAS, parce que ce n'est pas du calcul : les
// défauts d'écran de l'outil (téléchargements inversés, rechargement des
// facteurs uPOPs, plafond de 1 par tonne sur les recettes — référence § 7,
// n° 13, 14 et 18), et les arrondis d'affichage, qui restent à l'écran (seul
// le total de GES « affiché » du mode fidèle est rendu, parce qu'il diffère du
// total interne : c'est le défaut D3).

import { z } from 'zod';

export const VERSION_MOTEUR = 'w1b-1';

/** Une erreur du moteur : un code stable, un message en français qui dit quoi faire. */
export class ErreurMoteur extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/**
 * Les défauts de l'outil d'origine que le mode corrigé corrige (SPEC § 4.2).
 * D7 a été tranché le 14/10/2026 : le méthane se calcule sur le tonnage
 * déposé SANS les résidus (d'incinération, de feux, de brûlage), qui n'ont
 * pas de carbone dégradable ; le curseur de dégradation reste un paramètre de
 * masse, et le méthane un potentiel engagé.
 */
export const DEFAUTS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10'] as const;
export type CodeDefaut = (typeof DEFAUTS)[number];
export type ModeMoteur = 'fidele' | 'corrige';

// ---------------------------------------------------------------------------
// 1. Les procédés, les flux, les coefficients de transfert (server.r:19-308)
// ---------------------------------------------------------------------------

/** Les procédés optionnels : centre de tri (5), compostage (6), incinération (11). */
const OPTIONNELS = { mrf: 5, compostage: 6, incineration: 11 } as const;
/** Toujours actifs ; le tri chez l'habitant (4) est toujours retiré (server.r:1603). */
const PROCEDES_FIXES = [1, 2, 3, 7, 8, 9, 10, 12, 13, 14, 15];

/** id_fl → [code, procédé source, procédé cible] (server.r:204-288). */
const FLUX = {
  1: ['WoB', 3, 7], 2: ['BR3', 7, 8], 3: ['D2', 3, 8], 4: ['CR', 6, 9], 5: ['W1', 1, 2], 6: ['W3', 1, 3],
  7: ['WR', 2, 5], 8: ['RDF', 5, 11], 9: ['Re1', 5, 10], 10: ['Re2', 9, 10], 11: ['CMP', 6, 13], 12: ['Org', 5, 6],
  13: ['LGE1', 9, 12], 14: ['LGE2', 8, 12], 15: ['OBE', 7, 12], 16: ['CE', 6, 12], 17: ['WC', 2, 6], 18: ['MR', 5, 9],
  19: ['D1', 2, 9], 20: ['W2', 1, 10], 21: ['Re3', 10, 10], 22: ['OFG', 11, 12], 23: ['IRes', 11, 9], 24: ['ReT', 10, 13],
  25: ['LS1', 9, 14], 26: ['LS2', 8, 14], 27: ['WI', 2, 11], 28: ['WG', 0, 1], 29: ['input', 0, 0], 30: ['WB1', 9, 15],
  31: ['WB2', 8, 15], 32: ['EFLD', 15, 12], 33: ['BR1', 15, 9], 34: ['BR2', 15, 8], 35: ['Re4', 8, 10], 36: ['CU', 8, 9],
  37: ['LW', 3, 13],
} as const satisfies Record<number, readonly [string, number, number]>;

type IdFlux = keyof typeof FLUX;
export type CodeFlux = Exclude<(typeof FLUX)[IdFlux][0], 'input'>;
const ID_FLUX = Object.keys(FLUX).map(Number) as IdFlux[];

/** id_tc → [procédé, flux source, flux cible] (server.r:290-308). */
const COEFFICIENTS: Record<number, readonly [number, IdFlux, IdFlux]> = {
  1: [1, 28, 5], 2: [1, 28, 20], 3: [2, 5, 19], 4: [2, 5, 17], 5: [2, 5, 7], 6: [3, 6, 3], 7: [3, 6, 1], 8: [4, 20, 21],
  9: [5, 29, 8], 10: [5, 29, 9], 11: [5, 29, 18], 12: [6, 29, 11], 13: [6, 29, 16], 14: [7, 1, 2], 15: [8, 29, 31],
  16: [8, 29, 14], 17: [9, 29, 30], 18: [9, 29, 10], 19: [9, 29, 13], 20: [11, 29, 22], 21: [1, 28, 6], 22: [2, 5, 27],
  23: [7, 1, 15], 24: [6, 29, 4], 25: [5, 29, 12], 26: [11, 29, 23], 27: [8, 29, 26], 28: [9, 29, 25], 29: [10, 29, 24],
  30: [15, 30, 33], 31: [15, 31, 34], 32: [15, 29, 32], 33: [8, 29, 35], 34: [8, 29, 36], 35: [3, 6, 37],
};

// ---------------------------------------------------------------------------
// 2. Les entrées, et ce que l'outil d'origine accepte (ui.r)
// ---------------------------------------------------------------------------

const part = z.number().min(0).max(1);
const coutFacultatif = z.number().min(0).nullable();
const annees = z.number().gt(0, 'Une durée d’amortissement est d’au moins une fraction d’année : 0 donnerait un coût infini.');

export const entreesSchema = z.object({
  /** Gisement annuel, t/an (waste_in, ui.r:604). */
  waste_in: z.number().min(0),
  /** Procédés optionnels actifs (p_opt, ui.r:601). */
  mrf: z.boolean(),
  compostage: z.boolean(),
  incineration: z.boolean(),
  // Coefficients de transfert saisis (server.r:1703-1737, bornes ui.r).
  tc_1: part, tc_2: part, tc_4: part, tc_5: part, tc_22: part, tc_6: part,
  tc_35: z.number().min(0).max(0.4),
  tc_9: part, tc_10: part, tc_25: part, tc_12: part, tc_24: part,
  tc_14: z.number().min(0.1).max(0.3),
  tc_15: part,
  tc_33: z.number().min(0).max(0.5),
  tc_34: part,
  tc_16: z.number().min(0.2).max(0.5),
  tc_17: part, tc_18: part,
  tc_19: z.number().min(0.2).max(0.5),
  tc_26: z.number().min(0).max(0.3),
  // uPOPs (server.r:1813-1989).
  pop_1: part, pop_2: part, pop_3: part, pop_7: part, pop_8: part,
  pop_9: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  pop_10: z.boolean(),
  pop_11: z.number().min(0), pop_12: z.number().min(0), pop_13: z.number().min(0), pop_14: z.number().min(0),
  // GES (server.r:1992-2361).
  ghg_1: z.number().min(0),
  ghg_2: z.union([z.literal(0.056), z.literal(0.245), z.literal(0.648)]),
  ghg_3: part,
  ghg_4: z.union([z.literal(1), z.literal(0.8), z.literal(0.4)]),
  ghg_5: part, ghg_6: part, ghg_7: part, ghg_8: part, ghg_9: part,
  ghg_10: z.boolean(),
  ghg_11: part, ghg_14: part, ghg_15: part,
  ghg_16: z.union([z.literal(0.8), z.literal(0.4)]),
  ghg_17: z.boolean(),
  ghg_18: part,
  ghg_19: z.number().min(0).max(50),
  /** Précipitations annuelles (mm) et température moyenne (°C) ; vides : pas de classe climatique. */
  APY: z.number().min(0).nullable(),
  ATY: z.number().nullable(),
  // Coûts (server.r:2363-2746) : vides par défaut. Durées et taux, ui.r:1003-1120.
  cost_1: coutFacultatif, cost_12: coutFacultatif, cost_13: annees, cost_14: z.number().min(0).max(50),
  cost_2: coutFacultatif, cost_18: coutFacultatif, cost_19: annees, cost_20: z.number().min(0).max(50),
  cost_3: coutFacultatif, cost_15: coutFacultatif, cost_16: annees, cost_17: z.number().min(0).max(50), cost_4: coutFacultatif,
  cost_5: coutFacultatif, cost_25: coutFacultatif, cost_26: annees, cost_27: z.number().min(0).max(50),
  cost_10: coutFacultatif, cost_21: coutFacultatif, cost_22: annees, cost_23: z.number().min(0).max(50), cost_24: coutFacultatif,
  cost_11: coutFacultatif,
  cost_6: coutFacultatif, cost_7: coutFacultatif, cost_8: coutFacultatif, cost_9: coutFacultatif,
})
  // Une clé inconnue est refusée : une faute de frappe (« tc_l » pour « tc_1 »)
  // laisserait sinon la valeur par défaut en place, sans que personne le voie.
  .strict();
export type EntreesWapla = z.infer<typeof entreesSchema>;

/** Les valeurs par défaut de l'outil (ui.r) — calibrées pour l'Afrique australe, à remplacer (SPEC § 3.1). */
export const DEFAUTS_WAPLA: EntreesWapla = {
  waste_in: 1000, mrf: true, compostage: true, incineration: true,
  tc_1: 0.46, tc_2: 0.14, tc_4: 0, tc_5: 0, tc_22: 0, tc_6: 0.5, tc_35: 0, tc_9: 0.2, tc_10: 0.05, tc_25: 0.35,
  tc_12: 0.15, tc_24: 0.14, tc_14: 0.2, tc_15: 0.4, tc_33: 0.01, tc_34: 0, tc_16: 0.35, tc_17: 0.25, tc_18: 0.01,
  tc_19: 0.3, tc_26: 0.2,
  pop_1: 0.5, pop_2: 0, pop_3: 1, pop_7: 0, pop_8: 1, pop_9: 1, pop_10: false, pop_11: 40, pop_12: 1, pop_13: 300, pop_14: 10,
  ghg_1: 1000, ghg_2: 0.056, ghg_3: 0.1, ghg_4: 1, ghg_5: 0.1, ghg_6: 0.6, ghg_7: 0.35, ghg_8: 0.2, ghg_9: 0.25,
  ghg_10: false, ghg_11: 0.1, ghg_14: 0.1, ghg_15: 0.6, ghg_16: 0.8, ghg_17: false, ghg_18: 0.1, ghg_19: 0,
  APY: null, ATY: null,
  cost_1: null, cost_12: null, cost_13: 1, cost_14: 0, cost_2: null, cost_18: null, cost_19: 1, cost_20: 0,
  cost_3: null, cost_15: null, cost_16: 1, cost_17: 0, cost_4: null, cost_5: null, cost_25: null, cost_26: 1, cost_27: 0,
  cost_10: null, cost_21: null, cost_22: 1, cost_23: 0, cost_24: null, cost_11: null,
  cost_6: null, cost_7: null, cost_8: null, cost_9: null,
};

// ---------------------------------------------------------------------------
// 3. Les résultats
// ---------------------------------------------------------------------------

type CoutProcede = {
  annuite: number | null;
  exploitation: number | null;
  /** null : « non renseigné » en mode corrigé dès qu'un terme manque (D4). */
  total: number | null;
  /** Investissement TOTAL divisé par le tonnage ANNUEL : ce n'est pas un coût annuel à la tonne (SPEC § 5). */
  specifique_investissement: number | null;
  specifique_exploitation: number | null;
};

export type ResultatWapla = {
  version_moteur: string;
  /** « partiel » : un jeu de corrections choisi à la main (campagnes seulement). */
  mode: ModeMoteur | 'partiel';
  corrections: CodeDefaut[];
  /** t/an ; null pour un flux d'un procédé inactif (absent du bilan, pas nul). */
  flux: Record<CodeFlux, number | null>;
  /** Les coefficients effectivement appliqués, dérivés compris (id_tc → valeur). */
  coefficients: Record<number, number>;
  /** mg TEQ/an (server.r:1813-1989). */
  upops: {
    brulage_air: number; brulage_sol: number; feux_air: number; feux_sol: number;
    decharge_eau: number; decharge_residus: number; depotoir_eau: number; depotoir_residus: number;
    incineration_air: number; incineration_residus: number; compost_produit: number;
  };
  /** t CO₂-éq/an (server.r:1992-2361). */
  ges: {
    collecte: number; incineration: number; brulage: number; feux: number; compostage: number;
    decharge: number; depotoir: number; recyclage: number;
    /** Fidèle : le total de l'outil (TAGHG, server.r:2358), sans les feux. Corrigé : feux compris (D3). */
    total: number;
    /** Fidèle seulement : le total du tableau de l'outil, somme de valeurs arrondies à deux chiffres (server.r:2900-2939). */
    total_affiche: number | null;
  };
  climat: { classe: number | null; dof_decharge: number; dof_depotoir: number };
  /** Devise de la commune, par an. */
  couts: {
    procedes: Record<'collecte' | 'incineration' | 'compostage' | 'decharge' | 'mrf' | 'depotoir' | 'brulage' | 'recyclage', CoutProcede>;
    /** Recettes du recyclage, matériau par matériau (négatives : ce sont des recettes). */
    recyclage_par_matiere: { papier: number | null; verre: number | null; plastiques: number | null; metaux: number | null };
    /** Fidèle : somme des totaux présents. Corrigé : null dès qu'un procédé est non renseigné. */
    total: number | null;
  };
};

// ---------------------------------------------------------------------------
// 4. Le calcul
// ---------------------------------------------------------------------------

/**
 * R : signif(x, 2) — au plus proche, et à égalité vers le chiffre PAIR, comme R
 * sur une valeur exacte (signif(7450, 2) = 7400). `toPrecision` arrondirait
 * l'égalité vers le haut (7500) : le total « affiché » ne serait plus celui de
 * l'outil. Dix-sept chiffres significatifs distinguent deux doubles : seule une
 * valeur exactement à mi-chemin s'écrit « …5000… » à cette précision.
 */
function signif2(x: number): number {
  if (x === 0) return 0;
  const [mantisse, exposant] = Math.abs(x).toExponential(16).split('e');
  const chiffres = mantisse.replace('.', '');
  const tete = Number(chiffres.slice(0, 2));
  const reste = chiffres.slice(2);
  const egalite = /^50*$/.test(reste);
  const versLeHaut = egalite ? tete % 2 === 1 : reste[0] >= '5';
  const entier = tete + (versLeHaut ? 1 : 0);
  const puissance = Number(exposant) - 1;
  // Diviser par 10ⁿ plutôt que multiplier par 10⁻ⁿ : 0,001 n'a pas d'écriture
  // exacte en binaire, 1000 si — 74 / 1000 donne le double le plus proche de 0,074.
  return Math.sign(x) * (puissance >= 0 ? entier * 10 ** puissance : entier / 10 ** -puissance);
}

/** R : sum(..., na.rm = TRUE) — un terme absent (ou NaN) compte pour rien. C'est ce que D4 corrige. */
const sommeNaRm = (...termes: (number | null)[]) =>
  termes.reduce<number>((s, t) => (t == null || Number.isNaN(t) ? s : s + t), 0);

/** Règle d'or 1.1 : un terme absent rend la somme « non renseignée ». */
const sommeStricte = (...termes: (number | null)[]) =>
  termes.some((t) => t == null || Number.isNaN(t)) ? null : termes.reduce<number>((s, t) => s + (t as number), 0);

/** Annuité d'investissement (server.r:2368-2381 et quatre copies) ; null si l'investissement n'est pas saisi. */
function annuite(p: number | null, n: number, tauxPourcent: number): number | null {
  if (p == null) return null;
  const i = tauxPourcent / 100;
  if (i === 0) return p / n;
  const f = (1 + i) ** n;
  return (p * f * i) / (f - 1);
}

/** Une division dont le résultat n'est pas fini (dénominateur nul) n'est pas rendue. */
const quotient = (a: number | null, b: number) => (a == null || !(b > 0) ? null : a / b);

/** Une somme de parts au-delà de 1, à l'arrondi près. */
const depasse = (...parts: number[]) => parts.reduce((s, x) => s + x, 0) > 1 + 1e-9;

export function calculerWapla(
  entreesBrutes: unknown,
  options: { mode?: ModeMoteur; corrections?: readonly CodeDefaut[] } = {}
): ResultatWapla {
  const corrections = new Set<CodeDefaut>(options.corrections ?? ((options.mode ?? 'corrige') === 'corrige' ? DEFAUTS : []));
  const corrige = (d: CodeDefaut) => corrections.has(d);
  const mode: ResultatWapla['mode'] = corrections.size === DEFAUTS.length ? 'corrige' : corrections.size === 0 ? 'fidele' : 'partiel';

  const analyse = entreesSchema.safeParse(entreesBrutes);
  if (!analyse.success) {
    const p = analyse.error.issues[0];
    throw new ErreurMoteur('WAPLA_ENTREE', `Entrée « ${p.path.join('.')} » refusée : ${p.message}`);
  }
  const e = analyse.data;

  // D10 : l'outil laisse passer des parts dont la somme dépasse 1 et calcule
  // une part déduite négative (server.r:1442-1473, simple avertissement).
  if (corrige('D10')) {
    const sommes: [string, number[]][] = [
      ['déchets mélangés et ménagers mis en décharge (pop_2 + pop_3)', [e.pop_2, e.pop_3]],
      ['déchets mélangés et ménagers déposés au dépotoir (pop_7 + pop_8)', [e.pop_7, e.pop_8]],
      ['papier, verre et plastiques parmi les recyclables (ghg_7 + ghg_8 + ghg_9)', [e.ghg_7, e.ghg_8, e.ghg_9]],
      ['papier et biodéchets mis en décharge (ghg_5 + ghg_6)', [e.ghg_5, e.ghg_6]],
      ['papier et biodéchets déposés au dépotoir (ghg_14 + ghg_15)', [e.ghg_14, e.ghg_15]],
    ];
    const trop = sommes.find(([, parts]) => depasse(...parts));
    if (trop) {
      throw new ErreurMoteur('WAPLA_PARTS', `Les parts des ${trop[0]} dépassent 100 % : la part restante serait négative. Corrigez-les.`);
    }
  }

  // Un coût saisi pour un procédé inactif : l'outil d'origine ne dit pas ce
  // qu'il en fait (la lecture de server.r ne l'établit pas). Le moteur refuse
  // plutôt que de deviner.
  const coutsDe = { mrf: ['cost_2', 'cost_18'], compostage: ['cost_3', 'cost_15', 'cost_4'], incineration: ['cost_10', 'cost_21', 'cost_24'] } as const;
  for (const proc of ['mrf', 'compostage', 'incineration'] as const) {
    if (!e[proc] && coutsDe[proc].some((c) => e[c] != null)) {
      throw new ErreurMoteur('WAPLA_COUT_INACTIF', `Un coût est saisi pour le procédé « ${proc} », qui n'est pas actif : activez-le ou retirez ce coût.`);
    }
  }

  // --- Procédés et flux actifs (server.r:1596-1606, 1680-1696) -------------
  const actifs = new Set<number>(PROCEDES_FIXES);
  for (const [cle, id] of Object.entries(OPTIONNELS)) if (e[cle as keyof typeof OPTIONNELS]) actifs.add(id);
  const dansLeSysteme = (p: number) => p === 0 || actifs.has(p);
  const fluxActifs = new Set<IdFlux>(ID_FLUX.filter((id) => dansLeSysteme(FLUX[id][1]) && dansLeSysteme(FLUX[id][2])));

  // --- Coefficients : saisis, calculés, puis dérivés (server.r:1699-1762) --
  const tc30 = 0.3; // codé en dur, sans saisie (server.r:1700, 1732)
  const saisis: Record<number, number | null> = {
    1: e.tc_1, 2: e.tc_2, 3: null, 4: e.tc_4, 5: e.tc_5, 6: e.tc_6, 7: null, 8: null, 9: e.tc_9, 10: e.tc_10, 11: null,
    12: e.tc_12, 13: null, 14: e.tc_14, 15: e.tc_15,
    16: (1 - e.tc_15 - e.tc_33 - e.tc_34) * e.tc_16, // server.r:1718
    17: e.tc_17, 18: e.tc_18,
    19: (1 - e.tc_17 - e.tc_18) * e.tc_19, // server.r:1721
    20: null, 21: null, 22: e.tc_22, 23: null, 24: e.tc_24, 25: e.tc_25, 26: e.tc_26, 27: null, 28: null, 29: null,
    30: tc30, 31: tc30, 32: 1 - tc30, 33: e.tc_33, 34: e.tc_34, 35: e.tc_35,
  };
  const retenus = Object.entries(COEFFICIENTS)
    .map(([id, [p, source, cible]]) => ({ id: Number(id), p, source, cible, valeur: saisis[Number(id)] }))
    .filter((c) => fluxActifs.has(c.source) && fluxActifs.has(c.cible));
  const coefficients: Record<number, number> = {};
  const negatifs: number[] = [];
  for (let p = 1; p <= 14; p++) {
    const duProcede = retenus.filter((c) => c.p === p);
    const somme = duProcede.reduce((s, c) => s + (c.valeur ?? 0), 0);
    for (const c of duProcede) {
      coefficients[c.id] = c.valeur ?? 1 - somme;
      if (coefficients[c.id] < -1e-12) negatifs.push(p);
    }
  }
  for (const c of retenus.filter((c) => c.p === 15)) coefficients[c.id] = c.valeur as number;
  // L'outil remplace le bouton « Calculer » par un message (server.r:1659-1676).
  if (negatifs.length) {
    throw new ErreurMoteur(
      'WAPLA_COEFFICIENTS',
      `Les coefficients du procédé ${[...new Set(negatifs)].join(', ')} dépassent 1 au total : la part restante serait négative. Réduisez-les.`
    );
  }

  // --- Flux de matière (server.r:1766-1809) --------------------------------
  // Cinq passes, comme l'outil. Les résidus des feux (source 15) n'entrent
  // pas dans le calcul de la décharge et du dépotoir : l'outil les écarte pour
  // ne pas boucler, et ils sortent du bilan (D8). Corrigé, ils y rentrent : la
  // boucle se résout exactement — l'entrée d'un procédé qui brûle une part f de
  // ce qu'il reçoit, et en récupère 30 % en résidus, vaut sa base / (1 − 0,3 f).
  const valeur = new Map<IdFlux, number | null>([...fluxActifs].map((id) => [id, null]));
  valeur.set(28, e.waste_in);
  valeur.set(21, 0);
  const feuDuProcede: Record<number, number> = { 9: 17, 8: 15 }; // le coefficient qui envoie au feu
  const residuDuProcede: Record<number, number> = { 9: 30, 8: 31 }; // le coefficient du résidu qui revient
  for (let passe = 0; passe < 5; passe++) {
    for (let p = 1; p <= 16; p++) {
      const entrees = [...fluxActifs].filter((id) => FLUX[id][2] === p && FLUX[id][1] !== 15).map((id) => valeur.get(id) ?? null);
      let y = entrees.some((v) => v == null) ? null : entrees.reduce<number>((s, v) => s + (v as number), 0);
      if (y != null && corrige('D8') && p in feuDuProcede) {
        y /= 1 - coefficients[residuDuProcede[p]] * coefficients[feuDuProcede[p]];
      }
      for (const c of retenus) if (c.p === p) valeur.set(c.cible, y == null ? null : coefficients[c.id] * y);
    }
  }
  // Les feux de décharge et de dépotoir (server.r:1787-1806).
  const v = (id: IdFlux) => valeur.get(id) ?? 0;
  valeur.set(33, v(30) * coefficients[30]);
  valeur.set(34, v(31) * coefficients[31]);
  valeur.set(32, (v(30) + v(31)) * coefficients[32]);
  for (const id of fluxActifs) {
    if (id !== 29 && valeur.get(id) == null) {
      throw new ErreurMoteur('WAPLA_FLUX', `Le flux ${FLUX[id][0]} n'a pas pu être calculé.`);
    }
  }
  const flux = Object.fromEntries(
    ID_FLUX.filter((id) => id !== 29).map((id) => [FLUX[id][0], fluxActifs.has(id) ? (valeur.get(id) as number) : null])
  ) as Record<CodeFlux, number | null>;

  // Les entrées des procédés, telles que les formules les lisent : avec les
  // résidus des feux quand ils rentrent dans le bilan (D8).
  const residusFeuxDecharge = corrige('D8') ? v(33) : 0;
  const residusFeuxDepotoir = corrige('D8') ? v(34) : 0;
  const entreeDecharge = v(4) + v(18) + v(19) + v(23) + v(36) + residusFeuxDecharge; // CR + MR + D1 + IRes + CU (+ BR1)
  const entreeDepotoir = v(2) + v(3) + residusFeuxDepotoir; // BR3 + D2 (+ BR2)
  const rdf = actifs.has(5) ? v(8) : 0; // server.r:2004-2013
  const wi = v(27);

  // --- uPOPs (server.r:1813-1989) ------------------------------------------
  const shwlf = 1 - e.pop_2 - e.pop_3; // server.r:1869-1872
  const shwid = 1 - e.pop_7 - e.pop_8; // server.r:1884-1887
  const efIncAir = [3500, 350, 30, 0.5][e.pop_9 - 1];
  const efIncResidus = [75, 75, 30, 3][e.pop_9 - 1];
  const four = e.pop_10 ? 1 : 0;
  // D1 : l'outil soustrait la constante 36 (l'identifiant du flux CU) au lieu
  // du tonnage nettoyé (server.r:1901, 1917).
  const baseDepotoirUpops = entreeDepotoir - (corrige('D1') ? v(36) : 36);
  const upops: ResultatWapla['upops'] = {
    brulage_air: (v(1) * e.pop_11) / 1000,
    brulage_sol: (v(1) * e.pop_12) / 1000,
    feux_air: ((v(30) + v(31)) * e.pop_13) / 1000,
    feux_sol: ((v(30) + v(31)) * e.pop_14) / 1000,
    decharge_eau: ((5 * shwlf + 0.5 * e.pop_2 + 0.05 * e.pop_3) / 1000) * entreeDecharge,
    decharge_residus: ((500 * shwlf + 50 * e.pop_2 + 5 * e.pop_3) / 1000) * entreeDecharge,
    depotoir_eau: ((5 * shwid + 0.5 * e.pop_7 + 0.05 * e.pop_8) / 1000) * baseDepotoirUpops,
    depotoir_residus: ((500 * shwid + 50 * e.pop_7 + 5 * e.pop_8) / 1000) * baseDepotoirUpops,
    incineration_air: actifs.has(11) ? (efIncAir / 1000) * (rdf * (1 - four) + wi) + (3 / 1000) * rdf * four : 0,
    incineration_residus: actifs.has(11) ? (efIncResidus / 1000) * (rdf * (1 - four) + wi) : 0,
    compost_produit: actifs.has(6) ? ((v(11) * (5 * e.pop_1 + 50 * (1 - e.pop_1))) / 1000) * 0.65 : 0,
  };

  // --- Climat (server.r:2116-2136, 2206-2236, 2294-2321) -------------------
  const classe = classeClimatique(e.APY, e.ATY, corrige('D6'));
  const baseDof: Record<number, number> = { 1: 0.4, 2: 0.45, 3: 0.5, 4: 0.5, 5: 0.55, 6: 0.6, 7: 0.6, 8: 0.7 };
  const multiplicateur = (mcf: number) => ({ 1: 1, 0.8: 1.05, 0.4: 1.1 })[mcf] as number;
  const dofDecharge = (classe == null ? 0.7 : baseDof[classe]) * multiplicateur(e.ghg_4);
  // D9 : sans climat, le dépotoir garde 0,7 SANS le multiplicateur (server.r:2318).
  const dofDepotoir = classe == null ? (corrige('D9') ? 0.7 * multiplicateur(e.ghg_16) : 0.7) : baseDof[classe] * multiplicateur(e.ghg_16);

  // --- GES (server.r:1992-2361) ----------------------------------------------
  const rdfIndustrie = e.ghg_17 ? 1 : 0;
  const valorisation = e.ghg_10 ? 1 : 0;
  const aIncinerer = rdf * (1 - rdfIndustrie) + wi;
  const ferraille = 1 - e.ghg_7 - e.ghg_8 - e.ghg_9; // server.r:2340-2343
  const methane = (mcf: number, bio: number, papier: number, dof: number) => mcf * (bio * 0.16 + papier * 0.4) * 0.5 * (16 / 12) * 28 * dof;
  // D7 : la base du méthane. L'outil laisse de côté les résidus
  // d'incinération mais retire les tonnes brûlées et récupérées, calculées
  // sur une entrée qui les compte — plus de cendres, moins de méthane. Corrigé
  // (décision du 14/10/2026) : la part non brûlée et non récupérée de ce qui
  // a du carbone dégradable, c'est-à-dire l'entrée SANS les résidus
  // (d'incinération, des feux, du brûlage à l'air libre). Le curseur de
  // dégradation (tc_19, tc_16) ne s'en mêle pas : il règle la masse, le
  // méthane reste un potentiel engagé, sans double compte avec le DOCf.
  const baseMethaneDecharge = corrige('D7')
    ? (entreeDecharge - v(23) - residusFeuxDecharge) * (1 - e.tc_17 - e.tc_18)
    : v(19) + v(18) + v(4) + v(36) - v(10) - v(30);
  const baseMethaneDepotoir = corrige('D7')
    ? (entreeDepotoir - v(2) - residusFeuxDepotoir) * (1 - e.tc_15 - e.tc_33 - e.tc_34)
    : v(3) - v(35) - v(31) - v(36);
  const ges = {
    collecte: e.ghg_1 * 0.0026,
    // D2 : avec valorisation énergétique, le CO₂ fossile des plastiques disparaît (server.r:2040-2043).
    incineration: !actifs.has(11)
      ? 0
      : corrige('D2')
        ? e.ghg_11 * 2.5 * aIncinerer + aIncinerer * valorisation * -0.35 + rdf * rdfIndustrie * -0.55
        : e.ghg_11 * 2.5 * (aIncinerer * (1 - valorisation)) + aIncinerer * valorisation * -0.35 + rdf * rdfIndustrie * -0.55,
    brulage: v(1) * e.ghg_3 * 2.5 * 0.7,
    feux: (v(30) + v(31)) * e.ghg_18 * 2.5 * 0.7,
    compostage: actifs.has(6) ? (v(17) + v(12)) * e.ghg_2 : 0,
    decharge: methane(e.ghg_4, e.ghg_6, e.ghg_5, dofDecharge) * baseMethaneDecharge * (1 - e.ghg_19 / 100),
    depotoir: methane(e.ghg_16, e.ghg_15, e.ghg_14, dofDepotoir) * baseMethaneDepotoir,
    recyclage: (v(9) + v(10) + v(20) + v(21) + v(35)) * (e.ghg_7 * -0.15 + e.ghg_8 * -0.3 + e.ghg_9 * -1.5 + ferraille * -1.8),
  };
  const lignes = [ges.collecte, ges.decharge, ges.depotoir, ges.brulage, ges.feux, ges.recyclage, ges.compostage, ges.incineration];

  // --- Coûts (server.r:2363-2746) ------------------------------------------
  // D4 : l'outil additionne avec na.rm — un coût non saisi compte pour zéro,
  // et la décharge tombe à 0 dès qu'un de ses deux termes manque
  // (server.r:2575). Corrigé : un total dont un terme manque est « non
  // renseigné » (règle d'or 1.1). Un investissement nul se saisit : 0.
  const somme = corrige('D4') ? sommeStricte : sommeNaRm;
  const aicCollecte = annuite(e.cost_12, e.cost_13, e.cost_14);
  const aicIncineration = actifs.has(11) ? annuite(e.cost_21, e.cost_22, e.cost_23) : 0;
  const aicCompostage = actifs.has(6) ? annuite(e.cost_15, e.cost_16, e.cost_17) : 0;
  const aicDecharge = annuite(e.cost_25, e.cost_26, e.cost_27);
  // MRF inactif : 0/0 = NaN dans l'outil, retiré ensuite par na.rm.
  const aicMrf = actifs.has(5) ? annuite(e.cost_18, e.cost_19, e.cost_20) : Number.NaN;
  const prix = { papier: e.cost_6, verre: e.cost_7, plastiques: e.cost_8, metaux: e.cost_9 };
  const parts = { papier: e.ghg_7, verre: e.ghg_8, plastiques: e.ghg_9, metaux: ferraille };
  const prixManquant = Object.values(prix).some((p) => p == null);
  // D5 : un seul prix absent, et toute la ligne disparaît (server.r:2655).
  // Corrigé : seul le matériau sans prix est « non renseigné ».
  const recyclage_par_matiere = Object.fromEntries(
    (Object.keys(prix) as (keyof typeof prix)[]).map((m) => [
      m,
      prix[m] == null || (prixManquant && !corrige('D5')) ? null : v(24) * parts[m] * -(prix[m] as number),
    ])
  ) as ResultatWapla['couts']['recyclage_par_matiere'];
  const actifOuSansObjet = (p: number, cout: CoutProcede): CoutProcede =>
    actifs.has(p) || !corrige('D4') ? cout : { ...cout, total: 0 };
  const procedes: ResultatWapla['couts']['procedes'] = {
    collecte: {
      annuite: aicCollecte, exploitation: e.cost_1, total: somme(aicCollecte, e.cost_1),
      specifique_investissement: quotient(e.cost_12, v(5)), specifique_exploitation: quotient(e.cost_1, v(5)),
    },
    incineration: actifOuSansObjet(11, {
      annuite: aicIncineration, exploitation: e.cost_10, total: somme(aicIncineration, e.cost_10, e.cost_24 == null ? null : -e.cost_24),
      specifique_investissement: quotient(e.cost_21, rdf + wi), specifique_exploitation: quotient(e.cost_10, rdf + wi),
    }),
    compostage: actifOuSansObjet(6, {
      annuite: aicCompostage, exploitation: e.cost_3,
      total: somme(aicCompostage, e.cost_3, e.cost_4 == null ? null : -v(11) * e.cost_4),
      specifique_investissement: quotient(e.cost_15, v(12) + v(17)), specifique_exploitation: quotient(e.cost_3, v(12) + v(17)),
    }),
    decharge: {
      annuite: aicDecharge, exploitation: e.cost_5,
      total: corrige('D4') ? sommeStricte(aicDecharge, e.cost_5) : aicDecharge == null || e.cost_5 == null ? 0 : aicDecharge + e.cost_5,
      specifique_investissement: quotient(e.cost_25, v(4) + v(18) + v(19) + v(23)),
      specifique_exploitation: quotient(e.cost_5, v(4) + v(18) + v(19) + v(23)),
    },
    mrf: actifOuSansObjet(5, {
      annuite: Number.isNaN(aicMrf) ? null : aicMrf, exploitation: e.cost_2, total: somme(e.cost_2, aicMrf),
      specifique_investissement: quotient(e.cost_18, v(7)), specifique_exploitation: quotient(e.cost_2, v(7)),
    }),
    depotoir: {
      annuite: null, exploitation: e.cost_11, total: e.cost_11,
      specifique_investissement: null, specifique_exploitation: quotient(e.cost_11, v(3)),
    },
    brulage: { annuite: null, exploitation: null, total: 0, specifique_investissement: null, specifique_exploitation: null },
    recyclage: {
      annuite: null, exploitation: null,
      total: prixManquant ? null : Object.values(recyclage_par_matiere).reduce<number>((s, x) => s + (x as number), 0),
      specifique_investissement: null, specifique_exploitation: null,
    },
  };
  const totaux = Object.values(procedes).map((p) => p.total);

  return {
    version_moteur: VERSION_MOTEUR,
    mode,
    corrections: DEFAUTS.filter((d) => corrections.has(d)),
    flux,
    coefficients,
    upops,
    ges: {
      ...ges,
      // D3 : le total interne de l'outil oublie les feux ; le tableau affiché les compte.
      total: corrige('D3') ? lignes.reduce((s, x) => s + x, 0) : lignes.reduce((s, x) => s + x, 0) - ges.feux,
      total_affiche: corrige('D3') ? null : signif2(lignes.map(signif2).reduce((s, x) => s + x, 0)),
    },
    climat: { classe, dof_decharge: dofDecharge, dof_depotoir: dofDepotoir },
    couts: { procedes, recyclage_par_matiere, total: corrige('D4') ? sommeStricte(...totaux) : sommeNaRm(...totaux) },
  };
}

/** La classe climatique (server.r:2116-2136). Fidèle : avec son trou (D6) ; corrigée : bornes fermées. */
export function classeClimatique(precipitations: number | null, temperature: number | null, bornesFermees = true): number | null {
  if (precipitations == null || temperature == null) return null;
  const a = precipitations;
  const t = temperature;
  if (t <= 10 && a <= 400) return 1;
  if (t <= 10 && a > 400) return 2;
  if (t > 10 && t <= 20 && a <= 400) return 3;
  // L'outil écrit « < 400 » ici, et plus de 20 °C avec exactement 400 mm ne
  // tombe dans aucune branche.
  if (t > 20 && (bornesFermees ? a <= 400 : a < 400)) return 4;
  if (t > 10 && t <= 20 && a > 400 && a <= 1000) return 5;
  if (t > 10 && t <= 20 && a > 1000) return 6;
  if (t > 20 && a > 400 && a <= 1000) return 7;
  if (t > 20 && a > 1000) return 8;
  throw new ErreurMoteur('WAPLA_CLIMAT', 'Aucune classe climatique pour plus de 20 °C et exactement 400 mm de pluie (défaut D6 de l’outil d’origine).');
}
