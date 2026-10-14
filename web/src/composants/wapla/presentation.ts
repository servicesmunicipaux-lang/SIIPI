// Ce que l'écran WaPla sait des entrées et des flux du moteur (lot W3).
//
// Le moteur (backend/src/wapla/moteur.ts) nomme ses entrées et ses flux comme
// l'outil d'origine (tc_1, ghg_19, W1, D2…). L'écran ne montre à la commune que
// les ENTRÉES DE PLANIFICATION — celles qu'elle peut connaître : gisement,
// collecte, destination, non-collecté, gasoil, coûts, composition, climat,
// décharge — avec un libellé dans sa langue et une saisie adaptée (une part se
// saisit en %, le moteur la reçoit entre 0 et 1). Les facteurs techniques de
// l'outil restent à leur valeur UNIDO, lisibles, non modifiables à cette étape.

export type NatureEntree = 'nombre' | 'part' | 'booleen' | 'choix';
export type EntreePlanification = {
  cle: string;
  groupe: string;
  nature: NatureEntree;
  /** Clé de l'unité dans wapla.unites (vide pour une part ou un booléen). */
  unite?: string;
  /** Pour un choix : les valeurs que le moteur accepte, dans l'ordre. */
  choix?: number[];
  min?: number;
  max?: number;
};

export const GROUPES = ['gisement', 'collecte', 'procedes', 'destination', 'non_collecte', 'gasoil', 'couts', 'composition', 'climat', 'decharge'] as const;

export const ENTREES_PLANIFICATION: EntreePlanification[] = [
  { cle: 'waste_in', groupe: 'gisement', nature: 'nombre', unite: 't_an', min: 0 },
  { cle: 'tc_1', groupe: 'collecte', nature: 'part' },
  { cle: 'tc_2', groupe: 'collecte', nature: 'part' },
  { cle: 'compostage', groupe: 'procedes', nature: 'booleen' },
  { cle: 'mrf', groupe: 'procedes', nature: 'booleen' },
  { cle: 'incineration', groupe: 'procedes', nature: 'booleen' },
  { cle: 'tc_4', groupe: 'destination', nature: 'part' },
  { cle: 'tc_5', groupe: 'destination', nature: 'part' },
  { cle: 'tc_22', groupe: 'destination', nature: 'part' },
  { cle: 'tc_6', groupe: 'non_collecte', nature: 'part' },
  { cle: 'tc_35', groupe: 'non_collecte', nature: 'part', max: 0.4 },
  { cle: 'ghg_1', groupe: 'gasoil', nature: 'nombre', unite: 'l_an', min: 0 },
  { cle: 'cost_1', groupe: 'couts', nature: 'nombre', unite: 'tnd_an', min: 0 },
  { cle: 'cost_5', groupe: 'couts', nature: 'nombre', unite: 'tnd_an', min: 0 },
  { cle: 'ghg_6', groupe: 'composition', nature: 'part' },
  { cle: 'ghg_5', groupe: 'composition', nature: 'part' },
  { cle: 'ghg_15', groupe: 'composition', nature: 'part' },
  { cle: 'ghg_14', groupe: 'composition', nature: 'part' },
  { cle: 'ghg_3', groupe: 'composition', nature: 'part' },
  { cle: 'ghg_11', groupe: 'composition', nature: 'part' },
  { cle: 'ghg_18', groupe: 'composition', nature: 'part' },
  { cle: 'APY', groupe: 'climat', nature: 'nombre', unite: 'mm', min: 0 },
  { cle: 'ATY', groupe: 'climat', nature: 'nombre', unite: 'degres' },
  { cle: 'ghg_4', groupe: 'decharge', nature: 'choix', choix: [1, 0.8, 0.4] },
  { cle: 'ghg_19', groupe: 'decharge', nature: 'nombre', unite: 'pourcent', min: 0, max: 50 },
];

export const CLES_PLANIFICATION = new Set(ENTREES_PLANIFICATION.map((e) => e.cle));

/** La destination d'une part de collecte vers un procédé optionnel : sans le procédé actif, elle ne compte pas. */
export const PROCEDE_DE_LA_PART: Record<string, string> = { tc_4: 'compostage', tc_5: 'mrf', tc_22: 'incineration' };

/** Les flux du moteur : code → [procédé source, procédé cible] (référence § 1.2). */
export const FLUX: Record<string, [number, number]> = {
  WoB: [3, 7], BR3: [7, 8], D2: [3, 8], CR: [6, 9], W1: [1, 2], W3: [1, 3], WR: [2, 5], RDF: [5, 11], Re1: [5, 10],
  Re2: [9, 10], CMP: [6, 13], Org: [5, 6], LGE1: [9, 12], LGE2: [8, 12], OBE: [7, 12], CE: [6, 12], WC: [2, 6],
  MR: [5, 9], D1: [2, 9], W2: [1, 10], Re3: [10, 10], OFG: [11, 12], IRes: [11, 9], ReT: [10, 13], LS1: [9, 14],
  LS2: [8, 14], WI: [2, 11], WG: [0, 1], WB1: [9, 15], WB2: [8, 15], EFLD: [15, 12], BR1: [15, 9], BR2: [15, 8],
  Re4: [8, 10], CU: [8, 9], LW: [3, 13],
};

/**
 * Les flux que le diagramme ne dessine pas : les résidus des feux reviennent
 * en décharge et au dépotoir (correction D8), ce qui ferait une boucle qu'un
 * diagramme de Sankey ne sait pas tracer ; le gisement est le nœud de départ,
 * pas un flux. Tous restent dans le tableau.
 */
export const HORS_DIAGRAMME = new Set(['BR1', 'BR2', 'WG', 'Re3']);

export const PROCEDES = [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

/** Les lignes de GES, dans l'ordre du tableau de l'outil. */
export const LIGNES_GES = ['collecte', 'decharge', 'depotoir', 'brulage', 'feux', 'recyclage', 'compostage', 'incineration'] as const;

/** Les uPOPs, rangées par procédé et par milieu. */
export const UPOPS: { cle: string; procede: string; milieu: string }[] = [
  { cle: 'brulage_air', procede: 'brulage', milieu: 'air' },
  { cle: 'brulage_sol', procede: 'brulage', milieu: 'sol' },
  { cle: 'feux_air', procede: 'feux', milieu: 'air' },
  { cle: 'feux_sol', procede: 'feux', milieu: 'sol' },
  { cle: 'decharge_eau', procede: 'decharge', milieu: 'eau' },
  { cle: 'decharge_residus', procede: 'decharge', milieu: 'residus' },
  { cle: 'depotoir_eau', procede: 'depotoir', milieu: 'eau' },
  { cle: 'depotoir_residus', procede: 'depotoir', milieu: 'residus' },
  { cle: 'incineration_air', procede: 'incineration', milieu: 'air' },
  { cle: 'incineration_residus', procede: 'incineration', milieu: 'residus' },
  { cle: 'compost_produit', procede: 'compostage', milieu: 'produit' },
];
