// Une donnée à compléter, et de quoi la compléter sur place (refonte, lots 3b
// et 5).
//
// Le panneau d'un indicateur (« il manque ») et « Ma commune dans SIIPI » disent
// la même chose de la même donnée : où elle se complète. Ce composant est le
// seul à en décider — le formulaire du registre d'ajout, la déclaration d'un
// indicateur, un paramètre de la commune, ou l'écran du portail qui a le
// contexte. S'ils en avaient chacun une copie, le jour où un paramètre gagne
// son formulaire, l'un des deux écrans continuerait d'envoyer ailleurs.

import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { IndicateurCatalogue } from '../../lib/api';
import { FormulaireDeclaration } from '../ajout/FormulaireDeclaration';
import { FormulairePopulation, FormulaireSeuilsCommune } from '../ajout/FormulairesParametres';
import { CATALOGUE, type EntreeFormulaire } from '../ajout/registre';

export const boutonCompleter = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50';

export type NatureComplement = 'formulaire' | 'ecran' | 'parametre' | 'declaration' | 'citoyen' | 'fnct';

/** Les paramètres de la commune qui ont un formulaire. */
const PARAMETRES = ['population', 'objectif_balayage'] as const;

/** Le formulaire du registre d'ajout dont le type est `cible`, s'il existe. */
const formulaireDuRegistre = (cible: string | null) =>
  CATALOGUE.find((e): e is EntreeFormulaire => 'Formulaire' in e && e.type === cible) ?? null;

export function LigneACompleter({
  nature,
  cible,
  communeId,
  annee,
  catalogue,
  lectureSeule,
  onOuvrirEcran,
  onFait,
  libelleBouton,
  children,
}: {
  nature: NatureComplement;
  cible: string | null;
  communeId: string;
  annee: number;
  catalogue: IndicateurCatalogue[];
  /** La FNCT lit, elle ne complète pas à la place de la commune. */
  lectureSeule: boolean;
  /** Ouvrir un écran du portail (absent hors du portail communal). */
  onOuvrirEcran?: (ecran: string) => void;
  /** La donnée est enregistrée : l'écran se relit. */
  onFait: () => void | Promise<void>;
  /** Le texte du bouton, quand « Compléter » ne convient pas (« Ajouter »). */
  libelleBouton?: string;
  /** Ce qu'est la donnée : le libellé, à gauche du bouton. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = useState(false);

  const fermerPuis = async () => {
    setOuvert(false);
    await onFait();
  };

  const formulaire = (() => {
    if (nature === 'formulaire') {
      const entree = formulaireDuRegistre(cible);
      if (!entree) return null;
      const { Formulaire } = entree;
      return <Formulaire communeId={communeId} onAnnuler={() => setOuvert(false)} onFait={fermerPuis} />;
    }
    if (nature === 'declaration') {
      const ind = catalogue.find((c) => c.code === cible);
      return ind ? <FormulaireDeclaration communeId={communeId} annee={annee} indicateur={ind} onAnnuler={() => setOuvert(false)} onFait={fermerPuis} /> : null;
    }
    if (nature === 'parametre' && cible === 'population') return <FormulairePopulation communeId={communeId} onFait={fermerPuis} />;
    if (nature === 'parametre' && cible === 'objectif_balayage') return <FormulaireSeuilsCommune communeId={communeId} onFait={fermerPuis} />;
    return null;
  })();

  const action = (() => {
    if (lectureSeule || nature === 'citoyen' || nature === 'fnct') return null;
    if (nature === 'ecran') {
      return onOuvrirEcran && cible ? (
        <button type="button" className={boutonCompleter} onClick={() => onOuvrirEcran(cible)}>
          {t('kpi.panneau.ouvrirEcran', { ecran: t(`communal.onglets.${cible}`) })}
        </button>
      ) : null;
    }
    const disponible =
      (nature === 'formulaire' && formulaireDuRegistre(cible)) ||
      (nature === 'declaration' && catalogue.some((c) => c.code === cible)) ||
      (nature === 'parametre' && (PARAMETRES as readonly (string | null)[]).includes(cible));
    if (!disponible) return null;
    return (
      <button type="button" className={boutonCompleter} aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        {ouvert ? t('commun.annuler') : (libelleBouton ?? t('kpi.panneau.completer'))}
      </button>
    );
  })();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {children}
        {action}
      </div>
      {ouvert && formulaire}
    </div>
  );
}
