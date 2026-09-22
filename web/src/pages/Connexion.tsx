import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SelecteurLangue } from '../composants/Entete';
import { useAuth } from '../lib/auth';
import { ErreurApi } from '../lib/api';

export function Connexion() {
  const { t } = useTranslation();
  const { connexion } = useAuth();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      await connexion(email, motDePasse);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('connexion.erreurGenerique'));
    } finally {
      setEnCours(false);
    }
  }

  const champ =
    'w-full rounded-lg border border-ardoise-300 bg-white px-3 py-2.5 text-ardoise-900 ' +
    'placeholder:text-ardoise-400 focus:border-siipi-500 focus:ring-2 focus:ring-siipi-200';

  return (
    <div className="flex min-h-dvh flex-col bg-ardoise-100">
      <div className="flex justify-end p-4">
        <SelecteurLangue />
      </div>

      <main className="flex flex-1 items-start justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <span
              aria-hidden
              className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-siipi-600 text-xl font-bold text-white"
            >
              ن
            </span>
            <h1 className="text-xl font-bold text-balance text-ardoise-900">{t('app.nom')}</h1>
            <p className="mt-2 text-sm text-ardoise-500">{t('app.organisation')}</p>
          </div>

          <form
            onSubmit={soumettre}
            className="rounded-2xl border border-ardoise-200 bg-white p-6 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-ardoise-900">{t('connexion.titre')}</h2>
            <p className="mt-1 text-sm text-ardoise-500">{t('connexion.sousTitre')}</p>

            <div className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-medium text-ardoise-700"
                >
                  {t('connexion.email')}
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={champ}
                />
              </div>

              <div>
                <label
                  htmlFor="motDePasse"
                  className="mb-1.5 block text-sm font-medium text-ardoise-700"
                >
                  {t('connexion.motDePasse')}
                </label>
                <input
                  id="motDePasse"
                  type="password"
                  autoComplete="current-password"
                  required
                  dir="ltr"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  className={champ}
                />
              </div>
            </div>

            {erreur && (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900">
                {erreur}
              </p>
            )}

            <button
              type="submit"
              disabled={enCours}
              className="mt-6 w-full rounded-lg bg-siipi-600 px-4 py-2.5 font-semibold text-white hover:bg-siipi-700 disabled:opacity-60"
            >
              {enCours ? t('connexion.enCours') : t('connexion.valider')}
            </button>

            <p className="mt-4 text-center text-xs text-ardoise-500">{t('connexion.aide')}</p>
          </form>
        </div>
      </main>
    </div>
  );
}
