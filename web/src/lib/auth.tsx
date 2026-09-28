import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ecrireJeton, lireJeton, type ChangementPreferences, type Utilisateur } from './api';
import { appliquerLangue } from '../i18n';

/** La langue choisie sur le compte suit la personne d'un poste à l'autre. */
function appliquerPreferences(u: Utilisateur | null) {
  if (u?.preferences?.langue) appliquerLangue(u.preferences.langue);
}

interface ContexteAuth {
  utilisateur: Utilisateur | null;
  chargement: boolean;
  connexion: (email: string, motDePasse: string) => Promise<void>;
  deconnexion: () => void;
  /** Relit le compte auprès de l'API — après un changement de mot de passe. */
  rafraichir: () => Promise<void>;
  /** Enregistre un changement de préférences et l'applique aussitôt. */
  changerPreferences: (changement: ChangementPreferences) => Promise<void>;
}

const Contexte = createContext<ContexteAuth | undefined>(undefined);

export function FournisseurAuth({ children }: { children: ReactNode }) {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [chargement, setChargement] = useState(true);

  // Au chargement, un jeton conservé est vérifié auprès de l'API avant de
  // restaurer la session : on ne fait jamais confiance à un jeton stocké sans
  // l'avoir soumis au serveur, qui seul sait s'il est encore valable.
  useEffect(() => {
    let annule = false;
    void (async () => {
      if (!lireJeton()) {
        setChargement(false);
        return;
      }
      try {
        const moi = await api.moi();
        if (!annule) {
          setUtilisateur(moi);
          appliquerPreferences(moi);
        }
      } catch {
        ecrireJeton(null);
        if (!annule) setUtilisateur(null);
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  const connexion = useCallback(async (email: string, motDePasse: string) => {
    const reponse = await api.connexion(email, motDePasse);
    ecrireJeton(reponse.token);
    setUtilisateur(reponse.user);
    appliquerPreferences(reponse.user);
  }, []);

  const deconnexion = useCallback(() => {
    ecrireJeton(null);
    setUtilisateur(null);
  }, []);

  const rafraichir = useCallback(async () => {
    try {
      setUtilisateur(await api.moi());
    } catch {
      // Le jeton n'est plus valable : on referme proprement plutôt que de
      // laisser une session à moitié vivante.
      ecrireJeton(null);
      setUtilisateur(null);
    }
  }, []);

  const changerPreferences = useCallback(async (changement: ChangementPreferences) => {
    const preferences = await api.changerPreferences(changement);
    setUtilisateur((u) => (u ? { ...u, preferences } : u));
    if (changement.langue) appliquerLangue(changement.langue);
  }, []);

  return (
    <Contexte.Provider value={{ utilisateur, chargement, connexion, deconnexion, rafraichir, changerPreferences }}>
      {children}
    </Contexte.Provider>
  );
}

/** Pour un composant qui s'affiche aussi hors session (l'écran de connexion). */
export function useAuthFacultatif(): ContexteAuth | undefined {
  return useContext(Contexte);
}

export function useAuth(): ContexteAuth {
  const contexte = useContext(Contexte);
  if (!contexte) throw new Error('useAuth doit être utilisé dans <FournisseurAuth>.');
  return contexte;
}
