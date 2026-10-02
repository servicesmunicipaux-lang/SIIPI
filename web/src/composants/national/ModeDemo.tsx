import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type EtatDemo } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { usePortail } from '../../lib/portail';

/**
 * Le mode démo de l'observatoire (lot S1, FEUILLE_DE_ROUTE.md § 6bis).
 *
 * Il vit dans l'observatoire et non dans le portail communal : charger le jeu
 * crée une commune, ce qu'aucune commune ne peut faire. Le portail de
 * démonstration s'ouvre ensuite comme celui de n'importe quelle commune, sous
 * une bannière permanente.
 *
 * Retirer et recharger effacent : on le demande avant, en disant quoi. Charger
 * pour la première fois n'efface rien et ne demande rien.
 */
export function ModeDemo() {
  const { t } = useTranslation();
  const f = useFormats();
  const { ouvrirPortail } = usePortail();
  const [etat, setEtat] = useState<EtatDemo | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<'charger' | 'retirer' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function lire() {
    setErreur(null);
    try {
      setEtat(await api.etatDemo());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : t('commun.erreur'));
    }
  }

  useEffect(() => {
    void lire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function charger() {
    if (etat?.chargee && !window.confirm(t('national.demo.confirmerRecharger'))) return;
    setEnCours('charger');
    setErreur(null);
    setMessage(null);
    try {
      setEtat(await api.chargerDemo());
      setMessage(t('national.demo.charge'));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : t('commun.erreur'));
    } finally {
      setEnCours(null);
    }
  }

  async function retirer() {
    if (!window.confirm(t('national.demo.confirmerRetirer'))) return;
    setEnCours('retirer');
    setErreur(null);
    setMessage(null);
    try {
      await api.retirerDemo();
      setMessage(t('national.demo.retire'));
      await lire();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : t('commun.erreur'));
    } finally {
      setEnCours(null);
    }
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-ardoise-900">{t('national.demo.titre')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ardoise-700">{t('national.demo.intro')}</p>
      </header>

      <ul className="max-w-3xl list-disc space-y-1 ps-5 text-sm text-ardoise-700">
        <li>{t('national.demo.garde1')}</li>
        <li>{t('national.demo.garde2')}</li>
        <li>{t('national.demo.garde3')}</li>
      </ul>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {erreur}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-lg border border-siipi-300 bg-siipi-50 p-3 text-sm text-siipi-900">
          {message}
        </p>
      )}

      {!etat && !erreur && <p className="text-sm text-ardoise-600">{t('commun.chargement')}</p>}

      {etat && (
        <div className="space-y-4 rounded-xl border border-ardoise-200 bg-white p-4">
          <p className="text-sm text-ardoise-800">
            <span className="font-semibold">{t('national.demo.periode')} : </span>
            {t('national.demo.periodeValeur', { debut: f.date(etat.periode.debut), fin: f.date(etat.periode.fin) })}
          </p>
          <p className="text-sm">
            <span className="font-semibold text-ardoise-800">{t('national.demo.etat')} : </span>
            {etat.chargee ? (
              <span className="font-semibold text-amber-800">{t('national.demo.chargee')}</span>
            ) : (
              <span className="text-ardoise-700">{t('national.demo.nonChargee')}</span>
            )}
          </p>

          {etat.chargee && (
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
              {Object.entries(etat.compteurs).map(([table, n]) => (
                <div key={table} className="rounded-lg bg-ardoise-50 p-2">
                  <dt className="text-xs text-ardoise-600">{t(`national.demo.tables.${table}`, { defaultValue: table })}</dt>
                  <dd className="font-semibold tabular-nums text-ardoise-900">{formaterNombre(n)}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void charger()}
              disabled={enCours !== null}
              className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40"
            >
              {enCours === 'charger'
                ? t('national.demo.enChargement')
                : etat.chargee
                  ? t('national.demo.recharger')
                  : t('national.demo.charger')}
            </button>
            {etat.chargee && (
              <>
                <button
                  type="button"
                  onClick={() => ouvrirPortail(etat.communeId)}
                  disabled={enCours !== null}
                  className="min-h-11 rounded-lg border border-siipi-600 px-4 text-sm font-medium text-siipi-700 disabled:opacity-40"
                >
                  {t('national.demo.ouvrir')}
                </button>
                <button
                  type="button"
                  onClick={() => void retirer()}
                  disabled={enCours !== null}
                  className="min-h-11 rounded-lg border border-red-300 px-4 text-sm font-medium text-red-800 disabled:opacity-40"
                >
                  {enCours === 'retirer' ? t('national.demo.enRetrait') : t('national.demo.retirer')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
