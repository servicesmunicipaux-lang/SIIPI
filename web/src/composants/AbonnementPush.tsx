// Bandeau d'abonnement aux notifications push (Jalon 2, lot 1).
//
// SILENCIEUX PARTOUT OÙ IL DOIT L'ÊTRE : navigateur sans Push API, permission
// déjà refusée, clé publique pas encore configurée côté serveur — dans tous
// ces cas, rien ne s'affiche plutôt qu'un bouton qui échouerait au clic.
//
// « Déjà proposé » se retient en local (préférence de CET appareil, pas une
// donnée de compte) : sans cela, le bandeau reviendrait à chaque ouverture
// pour qui a cliqué « Plus tard ».

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi } from '../lib/api';

const CLE_MASQUE = 'siipi.push.masque';

function base64UrlVersUint8Array(base64Url: string): Uint8Array {
  const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const brut = window.atob(base64);
  return Uint8Array.from([...brut].map((c) => c.charCodeAt(0)));
}

export function AbonnementPush() {
  const { t } = useTranslation();
  const [disponible, setDisponible] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [masque, setMasque] = useState(true);

  useEffect(() => {
    let annule = false;
    void (async () => {
      const supporte = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!supporte || Notification.permission === 'denied') return;

      try {
        const registration = await navigator.serviceWorker.ready;
        const abonnementExistant = await registration.pushManager.getSubscription();
        if (abonnementExistant || annule) return; // déjà abonné sur cet appareil

        const deja = window.localStorage.getItem(CLE_MASQUE) === '1';
        if (deja) return;

        const { clePublique } = await api.clePubliquePush();
        if (!clePublique || annule) return; // pas encore configuré côté serveur

        setDisponible(true);
        setMasque(false);
      } catch {
        // Aucun bandeau plutôt qu'un bouton cassé.
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  const fermer = () => {
    try {
      window.localStorage.setItem(CLE_MASQUE, '1');
    } catch {
      /* tant pis, le bandeau réapparaîtra */
    }
    setMasque(true);
  };

  const activer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        fermer();
        return;
      }
      const { clePublique } = await api.clePubliquePush();
      if (!clePublique) throw new ErreurApi(0, 'Notifications non configurées côté serveur.');

      const registration = await navigator.serviceWorker.ready;
      const abonnement = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlVersUint8Array(clePublique),
      });
      const json = abonnement.toJSON();
      await api.sabonnerPush({
        endpoint: json.endpoint!,
        keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
        userAgent: navigator.userAgent.slice(0, 300),
      });
      fermer();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(false);
    }
  };

  if (!disponible || masque) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-siipi-300 bg-siipi-50 p-3">
      <p className="text-sm text-siipi-900">{t('citoyen.push.proposition')}</p>
      <div className="flex shrink-0 items-center gap-2">
        {erreur && <span className="text-xs text-red-700">{erreur}</span>}
        <button
          type="button"
          onClick={fermer}
          className="min-h-11 rounded-lg border border-siipi-300 bg-white px-3 text-sm font-medium text-siipi-800"
        >
          {t('citoyen.push.plusTard')}
        </button>
        <button
          type="button"
          onClick={() => void activer()}
          disabled={enCours}
          className="min-h-11 rounded-lg bg-siipi-600 px-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {enCours ? t('citoyen.push.activationEnCours') : t('citoyen.push.activer')}
        </button>
      </div>
    </div>
  );
}
