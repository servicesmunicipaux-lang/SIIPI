// La comparaison d'un scénario au statu quo (lot W4a ; SPEC_wapla § 5 et § 6).
//
// Une fonction pure : deux résultats du moteur — le statu quo, le scénario —
// et ce que la note de cadrage demande de mettre côte à côte : les tonnes
// mises en décharge, les tonnes brûlées à l'air libre, les t CO₂-éq, les mg
// TEQ, et l'écart de coût.
//
// L'ÉCART DE COÛT ne porte que sur ce que le scénario AJOUTE (SPEC § 5) : un
// procédé qui ne reçoit rien dans le statu quo et reçoit des déchets dans le
// scénario. Un procédé déjà en service garde son coût dans celui de SIIPI : le
// recalculer ici mettrait deux coûts de l'existant côte à côte. Un procédé
// ajouté dont les coûts ne sont pas saisis rend l'écart « non renseigné »
// (règle d'or 1.1) ; un scénario qui n'ajoute aucun procédé a un écart nul —
// un zéro de construction, pas une donnée manquante.

import type { ResultatWapla } from './moteur.js';

type ResultatComparable = Pick<ResultatWapla, 'flux' | 'ges' | 'upops' | 'couts'>;

export const INDICATEURS_COMPARES = ['mise_en_decharge_t', 'brule_air_libre_t', 'ges_t_co2e', 'upops_mg_teq'] as const;
export type IndicateurCompare = (typeof INDICATEURS_COMPARES)[number];

/** Les procédés qu'un scénario peut ajouter, et les flux qui les alimentent. */
const ENTREES_PROCEDE = {
  compostage: ['WC', 'Org'],
  mrf: ['WR'],
  incineration: ['RDF', 'WI'],
} as const;
export type ProcedeAjoutable = keyof typeof ENTREES_PROCEDE;

export type Comparaison = {
  indicateurs: Record<IndicateurCompare, { statu_quo: number; scenario: number; ecart: number }>;
  cout: {
    /** TND/an que le scénario ajoute ; null tant qu'un procédé ajouté n'a pas ses coûts. */
    ecart: number | null;
    procedes_ajoutes: ProcedeAjoutable[];
    /** Les procédés ajoutés dont un coût manque (investissement, durée, exploitation ou recettes). */
    couts_manquants: ProcedeAjoutable[];
    detail: Partial<Record<ProcedeAjoutable, number | null>>;
  };
};

const v = (r: ResultatComparable, code: string) => (r.flux as Record<string, number | null>)[code] ?? 0;

/** Les quatre grandeurs physiques d'un résultat. */
export function indicateurs(r: ResultatComparable): Record<IndicateurCompare, number> {
  return {
    // Tout ce qui entre en décharge : collecte directe, refus de tri et de
    // compostage, résidus d'incinération et des feux, nettoyage des dépotoirs.
    mise_en_decharge_t: ['D1', 'MR', 'CR', 'IRes', 'CU', 'BR1'].reduce((s, c) => s + v(r, c), 0),
    brule_air_libre_t: v(r, 'WoB'),
    ges_t_co2e: r.ges.total,
    upops_mg_teq: Object.values(r.upops).reduce((s, x) => s + x, 0),
  };
}

export function comparer(statuQuo: ResultatComparable, scenario: ResultatComparable): Comparaison {
  const a = indicateurs(statuQuo);
  const b = indicateurs(scenario);
  const ind = Object.fromEntries(
    INDICATEURS_COMPARES.map((k) => [k, { statu_quo: a[k], scenario: b[k], ecart: b[k] - a[k] }])
  ) as Comparaison['indicateurs'];

  const recu = (r: ResultatComparable, p: ProcedeAjoutable) => ENTREES_PROCEDE[p].reduce((s, c) => s + v(r, c), 0);
  const procedes_ajoutes = (Object.keys(ENTREES_PROCEDE) as ProcedeAjoutable[]).filter(
    (p) => !(recu(statuQuo, p) > 0) && recu(scenario, p) > 0
  );
  const detail: Comparaison['cout']['detail'] = {};
  for (const p of procedes_ajoutes) detail[p] = scenario.couts.procedes[p].total;
  const couts_manquants = procedes_ajoutes.filter((p) => detail[p] == null);
  const ecart = couts_manquants.length ? null : procedes_ajoutes.reduce((s, p) => s + (detail[p] as number), 0);

  return { indicateurs: ind, cout: { ecart, procedes_ajoutes, couts_manquants, detail } };
}
