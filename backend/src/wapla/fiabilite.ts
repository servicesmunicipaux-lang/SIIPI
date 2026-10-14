// Le niveau de fiabilité d'un bilan WaPla (lot W2b ; SPEC_wapla § 3.1 ; règles
// tranchées en tête de la migration 075).
//
// Une fonction pure, comme le moteur : les entrées du bilan, le rôle de chaque
// entrée (wapla.cles_entrees), le seuil de la FNCT — un niveau, et de quoi
// l'expliquer. Le niveau dit ce qu'un chiffre vaut, pas ce qu'il est : un bilan
// « illustratif » se calcule et s'affiche, avec son bandeau, à la commune seule.

import { DEFAUTS_WAPLA } from './moteur.js';

export type ProvenanceEntree = 'siipi_mesure' | 'siipi_declare' | 'saisie_commune' | 'reference_tunisienne' | 'defaut_wapla';
export type EntreeBilan = {
  cle: string;
  valeur: number | boolean;
  provenance: ProvenanceEntree;
  detail: Record<string, unknown> | null;
};
export type RoleEntree = { cle: string; role: 'cle' | 'comptee'; groupe: string };
export type NiveauFiabilite = 'etaye' | 'indicatif' | 'illustratif';

export type Fiabilite = {
  /** null tant qu'une clé manque : le calcul attend (SPEC § 6). */
  niveau: NiveauFiabilite | null;
  /** Les clés que la commune doit encore traiter (une valeur, ou la valeur par défaut gardée exprès). */
  cles_manquantes: string[];
  /** Les clés gardées à la valeur par défaut de l'UNIDO : le bilan est illustratif. */
  cles_par_defaut: string[];
  comptees: number;
  /** Les entrées comptées restées par défaut — ou issues de la seule moyenne nationale. */
  comptees_par_defaut: string[];
  part_par_defaut: number;
  seuil: number;
};

/** Le procédé optionnel dont une clé de destination est la part. */
const PROCEDE_DE: Record<string, 'compostage' | 'mrf' | 'incineration'> = { tc_4: 'compostage', tc_5: 'mrf', tc_22: 'incineration' };

export function fiabilite(entrees: Map<string, EntreeBilan>, roles: RoleEntree[], seuil: number): Fiabilite {
  const actif = (proc: 'compostage' | 'mrf' | 'incineration') => {
    const e = entrees.get(proc);
    return e ? e.valeur === true : DEFAUTS_WAPLA[proc];
  };
  // La part vers un procédé inactif ne vaut rien : ce n'est pas une clé à traiter.
  const cles = roles.filter((r) => r.role === 'cle' && (!(r.cle in PROCEDE_DE) || actif(PROCEDE_DE[r.cle])));
  const comptees = roles.filter((r) => r.role === 'comptee');
  const parDefaut = (e: EntreeBilan | undefined) =>
    !e || e.provenance === 'defaut_wapla' || (e.detail != null && e.detail.propre_a_la_commune === false);

  const cles_manquantes = cles.filter((r) => !entrees.has(r.cle)).map((r) => r.cle);
  const cles_par_defaut = cles.filter((r) => entrees.get(r.cle)?.provenance === 'defaut_wapla').map((r) => r.cle);
  const comptees_par_defaut = comptees.filter((r) => parDefaut(entrees.get(r.cle))).map((r) => r.cle);
  const part = comptees.length ? comptees_par_defaut.length / comptees.length : 0;

  const niveau: NiveauFiabilite | null = cles_manquantes.length
    ? null
    : cles_par_defaut.length
      ? 'illustratif'
      : part >= seuil
        ? 'indicatif'
        : 'etaye';
  return {
    niveau,
    cles_manquantes,
    cles_par_defaut,
    comptees: comptees.length,
    comptees_par_defaut,
    part_par_defaut: part,
    seuil,
  };
}
