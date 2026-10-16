// Le serveur de courriel, dans les paramètres nationaux (v0.15.47).
//
// Il se désigne dans la configuration du serveur (variables SMTP_*), pas ici :
// un mot de passe de messagerie saisi dans un écran finirait dans la base et
// dans ses sauvegardes. L'écran dit seulement ce qui est désigné, et permet un
// essai — vers l'adresse du compte connecté, à nulle autre.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type EssaiCourriel, type EtatCourriel } from '../../lib/api';
import { Chargement, Erreur } from '../Elements';

const boutonDiscret = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';

export function ServeurCourriel() {
  const { t } = useTranslation();
  const [etat, setEtat] = useState<EtatCourriel | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [essai, setEssai] = useState<EssaiCourriel | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(() => {
    api
      .etatCourriel()
      .then((e) => {
        setEtat(e);
        setErreur(null);
      })
      .catch((err) => setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur')));
  }, [t]);
  useEffect(() => charger(), [charger]);

  if (!etat) return erreur ? <Erreur message={erreur} onReessayer={charger} /> : <Chargement />;

  const essayer = async () => {
    setEnCours(true);
    setEssai(null);
    setErreur(null);
    try {
      setEssai(await api.essaiCourriel());
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4" aria-labelledby="serveur-courriel">
      <header>
        <h3 id="serveur-courriel" className="text-lg font-semibold text-ardoise-900">{t('national.courriel.titre')}</h3>
        <p className="mt-1 max-w-3xl text-sm text-ardoise-600">{t('national.courriel.intro')}</p>
      </header>
      {erreur && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>}

      {etat.configure ? (
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-ardoise-500">{t('national.courriel.serveur')}</dt>
          <dd className="chiffres text-ardoise-900" dir="ltr">{etat.serveur}</dd>
          <dt className="text-ardoise-500">{t('national.courriel.securite')}</dt>
          <dd className="text-ardoise-900">{t(`national.courriel.securites.${etat.securite}`)}</dd>
          <dt className="text-ardoise-500">{t('national.courriel.authentification')}</dt>
          <dd className="text-ardoise-900">{etat.authentifie ? t('national.courriel.authentifie') : t('national.courriel.sansAuthentification')}</dd>
          <dt className="text-ardoise-500">{t('national.courriel.expediteur')}</dt>
          <dd className="text-ardoise-900" dir="ltr">{etat.expediteur}</dd>
        </dl>
      ) : (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          {t('national.courriel.nonConfigure')}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={boutonDiscret} disabled={enCours} onClick={() => void essayer()}>
          {enCours ? t('national.courriel.essaiEnCours') : t('national.courriel.essai')}
        </button>
        {essai && (
          <p role="status" className="text-sm text-ardoise-800">
            {essai.statut === 'envoye'
              ? t('national.courriel.essaiEnvoye', { adresse: essai.destinataire })
              : essai.statut === 'echec'
                ? t('national.courriel.essaiEchec', { erreur: essai.erreur ?? '' })
                : t('national.courriel.essaiNonConfigure')}
          </p>
        )}
      </div>
    </section>
  );
}
