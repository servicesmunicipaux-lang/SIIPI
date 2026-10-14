// « Bilan de planification (WaPla) » dans le portail communal (lot W3 ;
// SPEC_wapla § 6).
//
// Les bilans de la commune, un par exercice, et l'ouverture d'un nouveau. Tout
// ce qui s'affiche ici est une ESTIMATION DE PLANIFICATION — la mention suit
// chaque écran. Aucun indicateur, coût ou tonnage de SIIPI n'en dépend : la
// couche lit SIIPI, SIIPI ne la lit jamais.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type ResumeBilanWapla } from '../../lib/api';
import { Chargement, Erreur } from '../Elements';
import { BilanWapla } from './BilanWapla';

const anneeTunis = () => Number(new Date(Date.now() + 3_600_000).toISOString().slice(0, 4));
/** Les six derniers exercices qui n'ont pas encore de bilan. */
const anneesOuvrables = (bilans: { exercice: number }[]) =>
  Array.from({ length: 6 }, (_, i) => anneeTunis() - i).filter((a) => !bilans.some((b) => b.exercice === a));

export function EcranWapla({ communeId, fnct }: { communeId: string; fnct: boolean }) {
  const { t } = useTranslation();
  const [bilans, setBilans] = useState<ResumeBilanWapla[] | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [exercice, setExercice] = useState(anneeTunis() - 1);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      const liste = await api.bilansWapla(communeId);
      setBilans(liste);
      // L'exercice proposé est le premier qui n'a pas encore de bilan : sinon
      // la liste montrerait une année et le bouton en garderait une autre.
      const libres = anneesOuvrables(liste);
      setExercice((e) => (libres.includes(e) ? e : (libres[0] ?? e)));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [communeId, t]);
  useEffect(() => {
    void charger();
  }, [charger]);

  if (ouvert) {
    return (
      <BilanWapla
        id={ouvert}
        fnct={fnct}
        onRetour={() => {
          setOuvert(null);
          void charger();
        }}
      />
    );
  }
  if (erreur && !bilans) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!bilans) return <Chargement />;

  const annees = anneesOuvrables(bilans);
  const ouvrir = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      const b = await api.ouvrirBilanWapla(communeId, exercice);
      setOuvert(b.id);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-ardoise-900">{t('wapla.titre')}</h1>
        <p className="text-sm font-medium text-ardoise-600">{t('wapla.mention')}</p>
        <p className="max-w-3xl text-sm text-ardoise-600">{t('wapla.chapeau')}</p>
        {fnct && <p className="text-sm text-ardoise-500">{t('wapla.fnctLecture')}</p>}
      </header>

      {erreur && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>}

      {!fnct && annees.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-ardoise-200 bg-white p-3">
          <label className="text-sm">
            <span className="block text-ardoise-600">{t('wapla.exercice')}</span>
            <select className="mt-1 min-h-10 rounded-lg border border-ardoise-300 bg-white px-2 text-sm" value={exercice} onChange={(e) => setExercice(Number(e.target.value))}>
              {annees.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-semibold text-white hover:bg-siipi-700 disabled:opacity-40"
            disabled={enCours || !annees.includes(exercice)}
            onClick={() => void ouvrir()}
          >
            {t('wapla.ouvrir')}
          </button>
          <p className="w-full text-xs text-ardoise-500">{t('wapla.ouvrirAide')}</p>
        </div>
      )}

      {bilans.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-ardoise-50 p-3 text-sm text-ardoise-700">{t(fnct ? 'wapla.aucunFnct' : 'wapla.aucun')}</p>
      ) : (
        <ul className="space-y-2">
          {bilans.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => setOuvert(b.id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-ardoise-200 bg-white p-3 text-start hover:bg-ardoise-50"
              >
                <span className="font-medium text-ardoise-900">{t('wapla.bilan.titre', { exercice: b.exercice })}</span>
                <span className="text-sm text-ardoise-600">
                  {b.statut === 'calcule' && b.niveau ? t(`wapla.niveaux.${b.niveau}`) : t('wapla.statuts.brouillon')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
