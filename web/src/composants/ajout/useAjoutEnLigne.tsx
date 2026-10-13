// Ouvrir un formulaire du registre depuis un écran métier — « Ajouter un
// engin » dans le Parc, « Ajouter un agent » dans le Personnel.
//
// Le crochet rend deux morceaux : le bouton, que l'écran pose dans son
// en-tête, et le formulaire, qu'il pose sous l'en-tête. Un seul composant
// aurait mis le formulaire dans la rangée de boutons, à l'étroit.
//
// Le bouton n'apparaît pas pour un rôle que l'API refuserait : un bouton
// qui mène à un refus est pire qu'un bouton absent.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';
import { formulaireAjout, type TypeFormulaire } from './registre';

export function useAjoutEnLigne(type: TypeFormulaire, communeId: string, libelle: string, onFait: () => void | Promise<void>) {
  const { t } = useTranslation();
  const { utilisateur } = useAuth();
  const [ouvert, setOuvert] = useState(false);
  const entree = formulaireAjout(type);
  const autorise = !!utilisateur && entree.roles.includes(utilisateur.role);
  const { Formulaire } = entree;

  const bouton = autorise ? (
    <button
      type="button"
      onClick={() => setOuvert((o) => !o)}
      aria-expanded={ouvert}
      className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white"
    >
      {ouvert ? t('commun.annuler') : libelle}
    </button>
  ) : null;

  const formulaire =
    autorise && ouvert ? (
      <Formulaire
        communeId={communeId}
        onAnnuler={() => setOuvert(false)}
        onFait={async () => {
          setOuvert(false);
          await onFait();
        }}
      />
    ) : null;

  return { bouton, formulaire };
}
