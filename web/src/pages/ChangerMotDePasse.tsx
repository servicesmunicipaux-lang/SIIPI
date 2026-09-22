// Remplacement obligatoire d'un mot de passe provisoire.
//
// Tant que l'agent utilise le mot de passe que son cadre lui a dicté, le cadre
// reste en mesure d'agir en son nom — et la trace d'une saisie n'engage plus
// personne. Cet écran barre donc l'accès au reste : ce n'est pas une
// suggestion qu'on repousse à plus tard.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi } from '../lib/api';
import { useAuth } from '../lib/auth';

export function ChangerMotDePasse() {
  const { t } = useTranslation();
  const { rafraichir, deconnexion } = useAuth();
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const assezLong = nouveau.length >= 10;
  const concordent = nouveau.length > 0 && nouveau === confirmation;

  const envoyer = async (evt: React.FormEvent) => {
    evt.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await api.changerMonMotDePasse({ motDePasseActuel: actuel, nouveauMotDePasse: nouveau });
      await rafraichir();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-xl font-semibold text-ardoise-900">{t('motDePasse.titre')}</h1>
      <p className="mt-1 text-sm text-ardoise-600">{t('motDePasse.pourquoi')}</p>

      <form onSubmit={envoyer} className="mt-6 space-y-4 rounded-xl border border-ardoise-200 bg-white p-4">
        <label className="block">
          <span className="text-sm font-medium text-ardoise-700">{t('motDePasse.actuel')}</span>
          <input type="password" value={actuel} onChange={(e) => setActuel(e.target.value)} className={champ} required autoComplete="current-password" />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ardoise-700">{t('motDePasse.nouveau')}</span>
          <input type="password" value={nouveau} onChange={(e) => setNouveau(e.target.value)} className={champ} required autoComplete="new-password" />
          <span className={`mt-1 block text-xs ${assezLong ? 'text-siipi-700' : 'text-ardoise-500'}`}>
            {t('motDePasse.longueur')}
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ardoise-700">{t('motDePasse.confirmation')}</span>
          <input type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={champ} required autoComplete="new-password" />
          {confirmation.length > 0 && !concordent && (
            <span className="mt-1 block text-xs text-red-700">{t('motDePasse.discordance')}</span>
          )}
        </label>

        {erreur && (
          <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{erreur}</p>
        )}

        <button
          type="submit"
          disabled={envoi || !assezLong || !concordent || actuel.length === 0}
          className="min-h-11 w-full rounded-lg bg-siipi-600 px-4 font-semibold text-white disabled:opacity-50"
        >
          {t('motDePasse.valider')}
        </button>

        <button
          type="button"
          onClick={deconnexion}
          className="min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-4 font-medium text-ardoise-700"
        >
          {t('entete.deconnexion')}
        </button>
      </form>
    </div>
  );
}
