// Le registre des formulaires d'ajout (refonte ; SPEC_refonte § 2.2).
//
// UN COMPOSANT PAR TYPE D'OBJET, LE MÊME PARTOUT. Le bouton « Ajouter un
// engin » de l'écran Parc, le catalogue « + Ajouter » et, au lot 3, le panneau
// « ce qui manque » d'un indicateur ouvrent le même formulaire. Sinon, le jour
// où un champ s'ajoute, il s'ajoute à un seul des deux, et deux portes
// d'entrée enregistrent deux choses différentes sous le même nom.
//
// La règle est vérifiée, pas seulement écrite : `appels-creation.json` dit
// quel appel d'API crée chaque type, et `scripts/verifier-ajout.mjs` (lancé
// par `npm run lint`) refuse qu'un de ces appels vive ailleurs que dans un
// seul fichier de ce dossier.
//
// DEUX SORTES D'ENTRÉES. Un FORMULAIRE se remplit où qu'on soit. Un ÉCRAN, lui,
// demande un contexte que le catalogue n'a pas — une pesée se rattache à un
// voyage attendu, une action planifiée à une sélection de points, un secteur
// à une proposition de découpage : l'entrée y conduit plutôt que de faire
// semblant de le remplacer.

import type { ComponentType } from 'react';
import type { NomRegistre } from '../../lib/api';
import appels from './appels-creation.json';
import { FormulaireAgent } from './FormulaireAgent';
import { FormulaireBoitierGps } from './FormulaireBoitierGps';
import { FormulaireCaracterisation } from './FormulaireCaracterisation';
import { FormulaireCircuit } from './FormulaireCircuit';
import { FormulaireContact } from './FormulaireContact';
import { FormulaireDocument, type TypeDocumentEmis } from './FormulaireDocument';
import { FormulaireEngin } from './FormulaireEngin';
import { FormulaireLieu } from './FormulaireLieu';
import { FormulairePcgd } from './FormulairePcgd';
import { FormulairePoint } from './FormulairePoint';
import { FormulairePublication } from './FormulairePublication';
import { FormulaireRapport } from './FormulaireRapport';
import { FormulaireRegistre } from './FormulaireRegistre';
import { FormulaireSortieCarnet } from './FormulaireSortieCarnet';
import { ImportContacts, ImportParc, ImportPersonnel } from './ImportsCsv';

/** Les rubriques du catalogue, dans l'ordre où le directeur les cherche (SPEC § 2.2). */
export const RUBRIQUES = ['equipe', 'moyens', 'territoire', 'references', 'actions', 'registres', 'partenaires', 'imports'] as const;
export type Rubrique = (typeof RUBRIQUES)[number];

/** Les types qui ont un formulaire : ceux d'`appels-creation.json`, et eux seuls. */
export type TypeFormulaire = keyof typeof appels;

/** Les écrans du portail communal vers lesquels une entrée peut conduire. */
export type EcranAjout = 'pesees' | 'points' | 'registres' | 'decoupage' | 'comptes' | 'circuits';
export type TypeEcran = 'pesee' | 'action-planifiee' | 'campagne-nettoyage' | 'secteur' | 'prestataire' | 'import-geographique';

export type TypeAjout = TypeFormulaire | TypeEcran;

export type PropsFormulaireAjout = {
  communeId: string;
  onFait: () => void | Promise<void>;
  onAnnuler: () => void;
};

type Commun = {
  rubrique: Rubrique;
  /** Les rôles qui peuvent ajouter cet objet — ceux que l'API accepte. */
  roles: readonly string[];
};

export type EntreeFormulaire = Commun & { type: TypeFormulaire; Formulaire: ComponentType<PropsFormulaireAjout> };
export type EntreeEcran = Commun & { type: TypeEcran; ecran: EcranAjout };
export type EntreeAjout = EntreeFormulaire | EntreeEcran;

const COMMUNE_ET_FNCT = ['admin_commune', 'super_admin_fnct'] as const;
// La commune tient son PCGD et ses études ; la FNCT les lit (la base le tient).
const COMMUNE = ['admin_commune'] as const;

const registre = (nom: NomRegistre) => {
  const Formulaire = (p: PropsFormulaireAjout) => <FormulaireRegistre nom={nom} {...p} />;
  Formulaire.displayName = `FormulaireRegistre(${nom})`;
  return Formulaire;
};
const FormulaireProjet = (p: PropsFormulaireAjout) => <FormulairePublication type="projet" {...p} />;
// Les documents à numérotation scellée (lot 16.2) : un seul formulaire, tiré du
// gabarit de chaque type. Émettre est réservé à la commune (la base le tient).
const document = (type: TypeDocumentEmis) => {
  const Formulaire = (p: PropsFormulaireAjout) => <FormulaireDocument type={type} {...p} />;
  Formulaire.displayName = `FormulaireDocument(${type})`;
  return Formulaire;
};

// `Record<TypeFormulaire, …>` : un type d'`appels-creation.json` sans
// formulaire ne compile pas.
const FORMULAIRES: Record<TypeFormulaire, Omit<EntreeFormulaire, 'type'>> = {
  agent: { rubrique: 'equipe', roles: COMMUNE_ET_FNCT, Formulaire: FormulaireAgent },
  engin: { rubrique: 'moyens', roles: COMMUNE_ET_FNCT, Formulaire: FormulaireEngin },
  circuit: { rubrique: 'territoire', roles: COMMUNE_ET_FNCT, Formulaire: FormulaireCircuit },
  point: { rubrique: 'territoire', roles: COMMUNE_ET_FNCT, Formulaire: FormulairePoint },
  lieu: { rubrique: 'territoire', roles: COMMUNE_ET_FNCT, Formulaire: FormulaireLieu },
  pcgd: { rubrique: 'references', roles: COMMUNE, Formulaire: FormulairePcgd },
  caracterisation: { rubrique: 'references', roles: COMMUNE, Formulaire: FormulaireCaracterisation },
  rapport: { rubrique: 'references', roles: COMMUNE_ET_FNCT, Formulaire: FormulaireRapport },
  projet: { rubrique: 'actions', roles: COMMUNE_ET_FNCT, Formulaire: FormulaireProjet },
  'plein-carburant': { rubrique: 'registres', roles: COMMUNE_ET_FNCT, Formulaire: registre('carburant') },
  'fin-de-poste': { rubrique: 'registres', roles: COMMUNE_ET_FNCT, Formulaire: registre('fins-de-poste') },
  'carnet-de-bord': { rubrique: 'registres', roles: COMMUNE_ET_FNCT, Formulaire: FormulaireSortieCarnet },
  incident: { rubrique: 'registres', roles: COMMUNE_ET_FNCT, Formulaire: registre('incidents') },
  'dotation-epi': { rubrique: 'registres', roles: COMMUNE_ET_FNCT, Formulaire: registre('epi') },
  contact: { rubrique: 'partenaires', roles: COMMUNE_ET_FNCT, Formulaire: FormulaireContact },
  commerce: { rubrique: 'partenaires', roles: COMMUNE_ET_FNCT, Formulaire: registre('commerces') },
  convention: { rubrique: 'partenaires', roles: COMMUNE_ET_FNCT, Formulaire: registre('conventions') },
  'import-contacts': { rubrique: 'imports', roles: COMMUNE_ET_FNCT, Formulaire: ImportContacts },
  'import-parc': { rubrique: 'imports', roles: COMMUNE_ET_FNCT, Formulaire: ImportParc },
  'import-personnel': { rubrique: 'imports', roles: COMMUNE_ET_FNCT, Formulaire: ImportPersonnel },
  'ordre-mission': { rubrique: 'equipe', roles: COMMUNE, Formulaire: document('ordre_mission') },
  'bon-travail': { rubrique: 'moyens', roles: COMMUNE, Formulaire: document('bon_travail') },
  'declaration-panne': { rubrique: 'moyens', roles: COMMUNE, Formulaire: document('declaration_panne') },
  // Le connecteur GPS (lot 17.4) : la commune seule rattache un boîtier ; la FNCT lit.
  'boitier-gps': { rubrique: 'moyens', roles: COMMUNE, Formulaire: FormulaireBoitierGps },
};

const ECRANS: Record<TypeEcran, Omit<EntreeEcran, 'type'>> = {
  secteur: { rubrique: 'territoire', roles: COMMUNE_ET_FNCT, ecran: 'decoupage' },
  'campagne-nettoyage': { rubrique: 'actions', roles: COMMUNE_ET_FNCT, ecran: 'registres' },
  'action-planifiee': { rubrique: 'actions', roles: COMMUNE_ET_FNCT, ecran: 'points' },
  pesee: { rubrique: 'registres', roles: COMMUNE_ET_FNCT, ecran: 'pesees' },
  prestataire: { rubrique: 'partenaires', roles: COMMUNE_ET_FNCT, ecran: 'comptes' },
  'import-geographique': { rubrique: 'imports', roles: COMMUNE_ET_FNCT, ecran: 'circuits' },
};

/** Le catalogue entier, rangé par rubrique (l'ordre d'écriture fait foi dans une rubrique). */
export const CATALOGUE: readonly EntreeAjout[] = [
  ...Object.entries(FORMULAIRES).map(([type, e]) => ({ ...e, type }) as EntreeFormulaire),
  ...Object.entries(ECRANS).map(([type, e]) => ({ ...e, type }) as EntreeEcran),
].sort((a, b) => RUBRIQUES.indexOf(a.rubrique) - RUBRIQUES.indexOf(b.rubrique));

/** Le catalogue que voit un rôle : un prestataire ne voit que ce qu'il a le droit d'ajouter. */
export const catalogueDuRole = (role: string | undefined) =>
  CATALOGUE.filter((e) => role !== undefined && e.roles.includes(role));

export function formulaireAjout(type: TypeFormulaire): EntreeFormulaire {
  return { ...FORMULAIRES[type], type };
}
