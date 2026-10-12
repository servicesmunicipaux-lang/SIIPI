// Le registre des formulaires d'ajout (refonte ; SPEC_refonte § 2.2).
//
// UN COMPOSANT PAR TYPE D'OBJET, LE MÊME PARTOUT. Un écran qui veut « ajouter
// un PCGD » ne réécrit pas un formulaire : il prend celui du registre. Sinon,
// le jour où un champ s'ajoute, il s'ajoute à un seul des deux, et deux portes
// d'entrée enregistrent deux choses différentes sous le même nom.
//
// Le lot 2a y range les références de la commune ; le lot 2b y portera les
// formulaires existants (engin, agent, circuit, projet…) et le catalogue
// « + Ajouter », rangé par rubrique et filtré par rôle.

import type { ComponentType } from 'react';
import { FormulaireCaracterisation } from './FormulaireCaracterisation';
import { FormulairePcgd } from './FormulairePcgd';

/** Les rubriques du catalogue, dans l'ordre où le directeur les cherche (SPEC § 2.2). */
export const RUBRIQUES = ['equipe', 'moyens', 'territoire', 'references', 'actions', 'registres', 'partenaires', 'imports'] as const;
export type Rubrique = (typeof RUBRIQUES)[number];

export type TypeAjout = 'pcgd' | 'caracterisation';

export type PropsFormulaireAjout = {
  communeId: string;
  onFait: () => void | Promise<void>;
  onAnnuler: () => void;
};

export type EntreeAjout = {
  type: TypeAjout;
  rubrique: Rubrique;
  /** Les rôles qui peuvent ajouter cet objet — la base tient la même règle. */
  roles: readonly string[];
  Formulaire: ComponentType<PropsFormulaireAjout>;
};

export const REGISTRE_AJOUT: readonly EntreeAjout[] = [
  // La FNCT lit le PCGD et les études de la commune, elle ne les saisit pas.
  { type: 'pcgd', rubrique: 'references', roles: ['admin_commune'], Formulaire: FormulairePcgd },
  { type: 'caracterisation', rubrique: 'references', roles: ['admin_commune'], Formulaire: FormulaireCaracterisation },
];

export function formulaireAjout(type: TypeAjout): EntreeAjout {
  const entree = REGISTRE_AJOUT.find((e) => e.type === type);
  // Un type sans formulaire est une faute de code, pas une situation à gérer à
  // l'écran : TypeAjout ne nomme que des types inscrits ci-dessus.
  if (!entree) throw new Error(`Aucun formulaire d'ajout pour « ${type} ».`);
  return entree;
}
