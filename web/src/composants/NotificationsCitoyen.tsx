// Historique « Mes notifications » et préférences par type (M6).
//
// L'historique affiche TOUT ce que l'API a consigné, y compris les
// tentatives qui n'ont rien envoyé (préférence désactivée, opt-out global,
// aucun appareil) : c'est le principe même de cette table (migration 044),
// et le cacher ici reviendrait à mentir sur ce qui s'est passé.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  type NotificationCitoyen,
  type PreferenceNotification,
} from '../lib/api';
import { Chargement, Erreur } from './Elements';

const STYLE_STATUT: Record<string, string> = {
  livre: 'bg-siipi-100 text-siipi-800',
  echec: 'bg-red-100 text-red-900',
  non_abonne: 'bg-ardoise-200 text-ardoise-700',
  non_souhaite: 'bg-ardoise-200 text-ardoise-700',
  sans_souscription: 'bg-ardoise-200 text-ardoise-700',
};

function formaterDate(iso: string): string {
  return new Intl.DateTimeFormat(document.documentElement.lang || 'fr', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function MesNotifications() {
  const { t } = useTranslation();
  const [lignes, setLignes] = useState<NotificationCitoyen[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = async () => {
    try {
      setLignes(await api.mesNotifications());
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const marquerLue = async (id: string) => {
    // Optimiste : la case passe à « lu » avant la réponse du serveur, la
    // liste ne saute pas d'un état visuel à l'autre pendant l'aller-retour.
    setLignes((l) => l?.map((n) => (n.id === id ? { ...n, lu: true } : n)) ?? l);
    try {
      await api.marquerNotificationLue(id);
    } catch {
      void charger();
    }
  };

  const toutMarquer = async () => {
    setLignes((l) => l?.map((n) => ({ ...n, lu: true })) ?? l);
    try {
      await api.toutMarquerLu();
    } catch {
      void charger();
    }
  };

  if (erreur) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!lignes) return <Chargement />;

  const nonLues = lignes.filter((n) => !n.lu).length;

  return (
    <div className="space-y-3">
      {nonLues > 0 && (
        <button
          type="button"
          onClick={() => void toutMarquer()}
          className="min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700"
        >
          {t('citoyen.notifications.toutMarquerLu')}
        </button>
      )}

      {lignes.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-center text-sm text-ardoise-500">
          {t('citoyen.notifications.vide')}
        </p>
      ) : (
        <ul className="space-y-2">
          {lignes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => !n.lu && void marquerLue(n.id)}
                className={`w-full rounded-xl border p-4 text-start ${
                  n.lu ? 'border-ardoise-200 bg-white' : 'border-siipi-300 bg-siipi-50'
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="flex items-center gap-2">
                    {!n.lu && <span aria-hidden className="size-2 shrink-0 rounded-full bg-siipi-600" />}
                    <span className="text-xs font-semibold text-ardoise-500 uppercase">
                      {t(`citoyen.notifications.types.${n.type}`, { defaultValue: n.type })}
                    </span>
                  </span>
                  <span className="text-xs text-ardoise-500">{formaterDate(n.date_envoi)}</span>
                </div>
                <p className="mt-1 font-medium text-ardoise-900">{n.titre}</p>
                <p className="mt-0.5 text-sm text-ardoise-600">{n.corps}</p>
                {n.statut !== 'livre' && (
                  <span
                    className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      STYLE_STATUT[n.statut] ?? ''
                    }`}
                  >
                    {t(`citoyen.notifications.statuts.${n.statut}`, { defaultValue: n.statut })}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TYPES = ['decision_reclamation', 'invitation_sondage', 'notification_ciblee'] as const;
// SMS et courriel existent dans le modèle (migration 044) mais aucun
// fournisseur n'est branché : les proposer comme s'ils marchaient tromperait
// le citoyen. Seul « push » reste modifiable ici.
const CANAUX_MODIFIABLES = new Set(['push']);

export function PreferencesNotification() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<PreferenceNotification[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [confirmation, setConfirmation] = useState(false);

  const charger = async () => {
    try {
      setPrefs(await api.mesPreferences());
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = (canal: string, type: string) =>
    prefs?.find((p) => p.canal === canal && p.type === type)?.active ?? true;

  const basculer = (type: string) => {
    setPrefs(
      (l) =>
        l?.map((p) => (p.canal === 'push' && p.type === type ? { ...p, active: !p.active } : p)) ?? l
    );
    setConfirmation(false);
  };

  const enregistrer = async () => {
    if (!prefs) return;
    setEnregistrement(true);
    setErreur(null);
    try {
      await api.enregistrerPreferences(prefs.filter((p) => CANAUX_MODIFIABLES.has(p.canal)));
      setConfirmation(true);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnregistrement(false);
    }
  };

  if (erreur) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!prefs) return <Chargement />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-ardoise-500">{t('citoyen.preferences.explication')}</p>

      <div className="overflow-hidden rounded-xl border border-ardoise-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ardoise-200 text-start text-xs text-ardoise-500">
              <th className="p-3 text-start font-medium" />
              {(['push', 'sms', 'email'] as const).map((canal) => (
                <th key={canal} className="p-3 text-center font-medium">
                  {t(`citoyen.preferences.canaux.${canal}`)}
                  {!CANAUX_MODIFIABLES.has(canal) && (
                    <span className="mt-0.5 block text-[10px] font-normal text-ardoise-400">
                      {t('citoyen.preferences.bientotDisponible')}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TYPES.map((type) => (
              <tr key={type} className="border-b border-ardoise-100 last:border-0">
                <th scope="row" className="p-3 text-start font-medium text-ardoise-800">
                  {t(`citoyen.notifications.types.${type}`)}
                </th>
                {(['push', 'sms', 'email'] as const).map((canal) => {
                  const modifiable = CANAUX_MODIFIABLES.has(canal);
                  return (
                    <td key={canal} className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={active(canal, type)}
                        disabled={!modifiable}
                        onChange={() => modifiable && basculer(type)}
                        aria-label={`${t(`citoyen.preferences.canaux.${canal}`)} — ${t(`citoyen.notifications.types.${type}`)}`}
                        className={`size-5 rounded border-ardoise-300 ${
                          modifiable ? 'accent-siipi-600' : 'opacity-40'
                        }`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void enregistrer()}
          disabled={enregistrement}
          className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {enregistrement ? t('citoyen.preferences.enregistrementEnCours') : t('citoyen.preferences.enregistrer')}
        </button>
        {confirmation && (
          <span className="text-sm text-siipi-800">{t('citoyen.preferences.enregistre')}</span>
        )}
      </div>
    </div>
  );
}

/** Bouton cloche + pastille de non-lus, pour l'en-tête de l'espace citoyen. */
export function ClocheNotifications({
  compte,
  onClick,
}: {
  compte: number;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative grid size-10 shrink-0 place-items-center rounded-full border border-ardoise-300 bg-white text-lg"
      aria-label={t('citoyen.notifications.ouvrir')}
    >
      <span aria-hidden>🔔</span>
      {compte > 0 && (
        <span
          aria-hidden
          className="absolute -end-1 -top-1 grid min-w-[1.1rem] place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white"
        >
          {compte > 9 ? '9+' : compte}
        </span>
      )}
    </button>
  );
}
