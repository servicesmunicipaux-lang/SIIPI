// Les agrégats nationaux des bilans WaPla, dans l'observatoire de la FNCT
// (lot W5 ; SPEC_wapla § 6).
//
// Par gouvernorat ou par district, les seuls bilans ÉTAYÉS de l'exercice, et
// toujours sur combien de communes ils portent : « 12 sur 31 communes ». Une
// somme qui ne dit pas sur combien de communes elle porte se lirait comme
// celle du territoire entier.
//
// AUCUN CLASSEMENT : ni rang, ni tri par valeur, ni ligne par commune — l'ordre
// est alphabétique (les districts dans l'ordre de la FNCT). Un territoire sans
// bilan étayé n'a pas de chiffres : l'écran le dit, il n'écrit pas 0.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type AgregatsWapla as Agregats } from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { Chargement } from '../Elements';

const anneeTunis = () => Number(new Date(Date.now() + 3_600_000).toISOString().slice(0, 4));
const EXERCICES = Array.from({ length: 6 }, (_, i) => anneeTunis() - i);

type Agregat = Agregats['national'];
type Grandeur = Agregats['grandeurs'][number];

export function AgregatsWapla() {
  const { t, i18n } = useTranslation();
  const [exercice, setExercice] = useState(anneeTunis() - 1);
  const [niveau, setNiveau] = useState<'gouvernorat' | 'district'>('gouvernorat');
  const [donnees, setDonnees] = useState<Agregats | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const arabe = i18n.language === 'ar';

  useEffect(() => {
    setDonnees(null);
    setErreur(null);
    api
      .agregatsWapla(exercice)
      .then(setDonnees)
      .catch((err) => setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur')));
  }, [exercice, t]);

  const couverture = (a: Agregat) => t('national.wapla.couverture', { n: a.communes_etayees, total: a.communes });
  const valeur = (a: Agregat, g: Grandeur) => (a.valeurs ? formaterNombre(a.valeurs[g], g === 'upops_mg_teq' ? 2 : 1) : null);

  const lignes =
    donnees &&
    (niveau === 'gouvernorat'
      ? donnees.gouvernorats.map((g) => ({ cle: g.gouvernorat, nom: g.gouvernorat, agregat: g as Agregat }))
      : donnees.districts.map((d) => ({
          cle: d.code ?? '—',
          nom: d.code == null ? t('kpi.national.nonRattache') : (arabe && d.nom_ar) || d.nom || d.code,
          agregat: d as Agregat,
        })));

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-ardoise-900">{t('national.wapla.titre')}</h1>
        <p className="text-sm font-medium text-ardoise-600">{t('wapla.mention')}</p>
        <p className="max-w-3xl text-sm text-ardoise-600">{t('national.wapla.chapeau')}</p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-ardoise-600">{t('wapla.exercice')}</span>
          <select
            className="mt-1 min-h-10 rounded-lg border border-ardoise-300 bg-white px-2 text-sm"
            value={exercice}
            onChange={(e) => setExercice(Number(e.target.value))}
          >
            {EXERCICES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <fieldset className="text-sm">
          <legend className="text-ardoise-600">{t('national.deploiement.niveau')}</legend>
          <div className="mt-1 inline-flex overflow-hidden rounded-lg border border-ardoise-300">
            {(['gouvernorat', 'district'] as const).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={niveau === n}
                onClick={() => setNiveau(n)}
                className={`min-h-10 px-3 ${niveau === n ? 'bg-siipi-600 text-white' : 'bg-white text-ardoise-700 hover:bg-ardoise-50'}`}
              >
                {t(`national.wapla.niveaux.${n}`)}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {erreur && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>}
      {!donnees && !erreur && <Chargement />}

      {donnees && lignes && (
        <>
          <section className="rounded-xl border border-ardoise-200 bg-white p-4" aria-labelledby="wapla-national">
            <h2 id="wapla-national" className="font-semibold text-ardoise-900">
              {t('national.wapla.national', { exercice: donnees.exercice })}
            </h2>
            <p className="mt-1 text-sm text-ardoise-700">{couverture(donnees.national)}</p>
            {donnees.national.valeurs ? (
              <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {donnees.grandeurs.map((g) => (
                  <div key={g} className="rounded-lg bg-ardoise-50 p-3">
                    <dt className="text-xs text-ardoise-600">{t(`national.wapla.grandeurs.${g}`)}</dt>
                    <dd className="chiffres mt-1 text-lg font-semibold text-ardoise-900">{valeur(donnees.national, g)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">{t('national.wapla.aucunEtaye')}</p>
            )}
          </section>

          <section className="space-y-2" aria-labelledby="wapla-territoires">
            <h2 id="wapla-territoires" className="font-semibold text-ardoise-900">{t(`national.wapla.parNiveau.${niveau}`)}</h2>
            <p className="text-xs text-ardoise-500">{t('national.wapla.ordre')}</p>
            <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
              <table className="w-full min-w-[46rem] text-sm">
                <thead className="bg-ardoise-50 text-xs text-ardoise-600">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-start">{t(`national.wapla.niveaux.${niveau}`)}</th>
                    <th scope="col" className="px-3 py-2 text-start">{t('national.wapla.communes')}</th>
                    {donnees.grandeurs.map((g) => (
                      <th key={g} scope="col" className="px-3 py-2 text-end">{t(`national.wapla.grandeurs.${g}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => (
                    <tr key={l.cle} className="border-t border-ardoise-100">
                      <th scope="row" className="px-3 py-2 text-start font-medium text-ardoise-900">{l.nom}</th>
                      <td className="chiffres px-3 py-2 text-ardoise-700">
                        {t('national.wapla.couvertureCourte', { n: l.agregat.communes_etayees, total: l.agregat.communes })}
                      </td>
                      {l.agregat.valeurs ? (
                        donnees.grandeurs.map((g) => (
                          <td key={g} className="chiffres px-3 py-2 text-end">{valeur(l.agregat, g)}</td>
                        ))
                      ) : (
                        <td colSpan={donnees.grandeurs.length} className="px-3 py-2 text-ardoise-500">{t('national.wapla.aucunEtayeLigne')}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="max-w-3xl rounded-lg bg-amber-50 p-2 text-xs text-amber-950">{t('wapla.resultat.potentielEngage')}</p>
        </>
      )}
    </div>
  );
}
