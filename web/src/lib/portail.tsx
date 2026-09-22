// Quelle commune la FNCT a ouverte, et depuis quel écran.
//
// Deux écrans ont besoin de la même information : l'annuaire national, qui
// désigne la commune, et le portail municipal, qui l'affiche. Passer par un
// état partagé plutôt que par un sélecteur isolé en tête du portail, parce que
// le geste naturel est celui-ci : on cherche une commune dans l'annuaire, on
// clique dessus, on est dedans. Demander de la retrouver une seconde fois dans
// une liste déroulante après l'avoir déjà trouvée est un pas de trop.

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type VueNationale = 'observatoire' | 'communal';

interface ContextePortail {
  vue: VueNationale;
  communeOuverte: string | null;
  /** Ouvre le portail municipal d'une commune. */
  ouvrirPortail: (communeId: string) => void;
  /** Revient à l'observatoire sans oublier la commune ouverte. */
  revenirObservatoire: () => void;
  changerCommune: (communeId: string | null) => void;
}

const Contexte = createContext<ContextePortail | undefined>(undefined);

// La commune ouverte survit à un rafraîchissement de page : revenir sur
// l'écran qu'on avait quitté vaut mieux que repartir d'une liste vide.
const CLE = 'siipi.communeOuverte';

function lire(): string | null {
  try {
    return localStorage.getItem(CLE);
  } catch {
    return null;
  }
}

function ecrire(valeur: string | null) {
  try {
    if (valeur) localStorage.setItem(CLE, valeur);
    else localStorage.removeItem(CLE);
  } catch {
    // Stockage refusé (navigation privée, réglage du navigateur) : le choix
    // reste valable pour la session, il ne sera simplement pas retenu.
  }
}

export function FournisseurPortail({ children }: { children: ReactNode }) {
  const [vue, setVue] = useState<VueNationale>('observatoire');
  const [communeOuverte, setCommuneOuverte] = useState<string | null>(lire);

  const ouvrirPortail = useCallback((communeId: string) => {
    setCommuneOuverte(communeId);
    ecrire(communeId);
    setVue('communal');
    // L'annuaire est souvent défilé loin vers le bas quand on clique : sans
    // cela, le portail s'ouvrirait au milieu de sa page et l'on croirait qu'il
    // ne s'est rien passé.
    window.scrollTo({ top: 0 });
  }, []);

  const revenirObservatoire = useCallback(() => {
    setVue('observatoire');
    window.scrollTo({ top: 0 });
  }, []);

  const changerCommune = useCallback((communeId: string | null) => {
    setCommuneOuverte(communeId);
    ecrire(communeId);
  }, []);

  return (
    <Contexte.Provider value={{ vue, communeOuverte, ouvrirPortail, revenirObservatoire, changerCommune }}>
      {children}
    </Contexte.Provider>
  );
}

export function usePortail(): ContextePortail {
  const valeur = useContext(Contexte);
  if (!valeur) throw new Error('usePortail doit être utilisé dans FournisseurPortail.');
  return valeur;
}
