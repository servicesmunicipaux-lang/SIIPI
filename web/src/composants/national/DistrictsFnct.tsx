// Les districts de la FNCT, dans les paramètres nationaux (décision D-FNCT-2).
//
// Le découpage officiel est celui du décret n° 2023-589 du 21 septembre 2023 ;
// la base le porte (migration 078) et l'écran le LIT — aucun nom de gouvernorat
// n'est écrit ici. La FNCT peut le redéfinir : elle cite alors la pièce qui
// fonde le changement, et chaque gouvernorat reçoit un district — un oubli
// ferait sortir ses communes de toutes les sommes par district, sans bruit.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type DistrictsFnct as Decoupage } from '../../lib/api';
import { Chargement, Erreur } from '../Elements';

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const bouton = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
const boutonDiscret = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';

type DistrictSaisi = { code: string; nom: string; nom_ar: string };

export function DistrictsFnct() {
  const { t, i18n } = useTranslation();
  const [decoupage, setDecoupage] = useState<Decoupage | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [edition, setEdition] = useState(false);
  const [districts, setDistricts] = useState<DistrictSaisi[]>([]);
  const [rattachements, setRattachements] = useState<Record<string, string>>({});
  const [source, setSource] = useState('');
  const [enCours, setEnCours] = useState(false);
  const arabe = i18n.language === 'ar';

  const charger = useCallback(() => {
    api
      .kpiDistricts()
      .then((d) => {
        setDecoupage(d);
        setErreur(null);
      })
      .catch((err) => setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur')));
  }, [t]);
  useEffect(() => charger(), [charger]);

  if (!decoupage) return erreur ? <Erreur message={erreur} onReessayer={charger} /> : <Chargement />;

  const districtDe = new Map(decoupage.rattachements.map((r) => [r.gouvernorat, r.district_code]));
  const orphelins = decoupage.gouvernorats.filter((g) => !districtDe.has(g));
  const sources = [...new Set(decoupage.districts.map((d) => d.source).filter(Boolean))];
  const nomDe = (d: { code: string; nom: string; nom_ar: string | null }) => (arabe && d.nom_ar) || d.nom;

  const ouvrir = () => {
    setDistricts(decoupage.districts.map((d) => ({ code: d.code, nom: d.nom, nom_ar: d.nom_ar ?? '' })));
    setRattachements(Object.fromEntries(decoupage.rattachements.map((r) => [r.gouvernorat, r.district_code])));
    setSource('');
    setInfo(null);
    setEdition(true);
  };

  const enregistrer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      await api.enregistrerDistricts({
        districts: districts.filter((d) => d.code.trim() && d.nom.trim()).map((d) => ({ code: d.code.trim(), nom: d.nom.trim(), nom_ar: d.nom_ar.trim() || null })),
        rattachements: Object.fromEntries(decoupage.gouvernorats.map((g) => [g, rattachements[g] || null])),
        source,
      });
      setEdition(false);
      setInfo(t('national.districts.enregistres'));
      charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4" aria-labelledby="districts-fnct">
      <header className="space-y-1">
        <h3 id="districts-fnct" className="text-lg font-semibold text-ardoise-900">{t('national.districts.titre')}</h3>
        <p className="max-w-3xl text-sm text-ardoise-600">{t('national.districts.aide')}</p>
        {sources.length > 0 && (
          <p className="text-sm text-ardoise-800">
            <span className="font-medium">{t('national.districts.source')}</span> {sources.join(' ; ')}
          </p>
        )}
      </header>

      {erreur && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>}
      {info && <p role="status" className="rounded-lg border border-siipi-300 bg-siipi-50 p-3 text-sm text-siipi-900">{info}</p>}
      {orphelins.length > 0 && (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          {t('national.districts.orphelins', { gouvernorats: orphelins.join(', ') })}
        </p>
      )}

      {!edition ? (
        <>
          {decoupage.districts.length === 0 ? (
            <p className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">{t('national.districts.aucun')}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {decoupage.districts.map((d) => {
                const siens = decoupage.rattachements.filter((r) => r.district_code === d.code).map((r) => r.gouvernorat);
                return (
                  <li key={d.code} className="rounded-lg border border-ardoise-200 p-3">
                    <p className="font-semibold text-ardoise-900">
                      <span className="font-mono">{d.code}</span> — {nomDe(d)}
                    </p>
                    <p className="text-xs text-ardoise-500">{t('national.districts.nombre', { n: siens.length })}</p>
                    <p className="mt-1 text-sm text-ardoise-700">{siens.join(' · ')}</p>
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" className={boutonDiscret} onClick={ouvrir}>
            {t('national.districts.modifier')}
          </button>
        </>
      ) : (
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="font-medium text-ardoise-900">{t('national.districts.liste')}</legend>
            {districts.map((d, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-end">
                {(['code', 'nom', 'nom_ar'] as const).map((k) => (
                  <label key={k} className="text-sm">
                    <span className="block text-ardoise-600">{t(`national.districts.champs.${k}`)}</span>
                    <input
                      value={d[k]}
                      dir={k === 'nom_ar' ? 'rtl' : undefined}
                      onChange={(e) => setDistricts((l) => l.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}
                      className={`${champ} ${k === 'code' ? 'font-mono' : ''}`}
                    />
                  </label>
                ))}
                <button type="button" className={boutonDiscret} onClick={() => setDistricts((l) => l.filter((_, j) => j !== i))}>
                  {t('national.districts.retirer')}
                </button>
              </div>
            ))}
            <button type="button" className={boutonDiscret} onClick={() => setDistricts((l) => [...l, { code: '', nom: '', nom_ar: '' }])}>
              {t('national.districts.ajouter')}
            </button>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="font-medium text-ardoise-900">{t('national.districts.rattachements')}</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {decoupage.gouvernorats.map((g) => (
                <label key={g} className="flex items-center justify-between gap-2 text-sm">
                  <span>{g}</span>
                  <select
                    value={rattachements[g] ?? ''}
                    onChange={(e) => setRattachements((r) => ({ ...r, [g]: e.target.value }))}
                    className="min-h-10 rounded-lg border border-ardoise-300 bg-white px-2 text-sm"
                  >
                    <option value="">{t('national.districts.choisir')}</option>
                    {districts
                      .filter((d) => d.code.trim())
                      .map((d) => (
                        <option key={d.code} value={d.code.trim()}>
                          {d.code.trim()} — {(arabe && d.nom_ar) || d.nom}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block text-sm">
            <span className="block font-medium text-ardoise-900">{t('national.districts.sourceSaisie')}</span>
            <span className="block text-xs text-ardoise-500">{t('national.districts.sourceAide')}</span>
            <input value={source} onChange={(e) => setSource(e.target.value)} className={champ} />
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="button" className={bouton} disabled={enCours || source.trim().length < 5} onClick={() => void enregistrer()}>
              {t('national.districts.enregistrer')}
            </button>
            <button type="button" className={boutonDiscret} disabled={enCours} onClick={() => setEdition(false)}>
              {t('national.districts.annuler')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
