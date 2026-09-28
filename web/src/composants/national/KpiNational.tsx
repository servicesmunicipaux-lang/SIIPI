// Les indicateurs nationaux de la FNCT (Jalon 8) : le Concours national de
// propreté, les 5 axes agrégés, la préparation au tri à la source, les
// alertes (A3.3), et les réglages — barème, seuils, districts.
//
// Quatre niveaux de lecture : commune, gouvernorat, district FNCT, national.
// Une moyenne ne porte jamais sur les communes sans donnée : chaque case dit
// sur combien de communes elle repose.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type NiveauKpi } from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';
import { BoutonExport } from '../BoutonExport';

type Vue = 'concours' | 'axes' | 'dma' | 'alertes' | 'reglages';
const VUES: Vue[] = ['concours', 'axes', 'dma', 'alertes', 'reglages'];
const NIVEAUX: NiveauKpi[] = ['commune', 'gouvernorat', 'district', 'national'];
const ANNEE = new Date().getFullYear();

const champ = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-2 text-sm';
const bouton = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50 disabled:opacity-50';
const boutonPrincipal = 'min-h-10 rounded-lg bg-siipi-600 px-4 text-sm font-semibold text-white hover:bg-siipi-700 disabled:opacity-50';
const th = 'px-3 py-2 text-start text-xs uppercase text-ardoise-500';
const td = 'px-3 py-2';

/** Un nombre, ou « — » avec la raison au survol : jamais un zéro inventé. */
function N({ v, d = 1, suffixe = '' }: { v: number | null | undefined; d?: number; suffixe?: string }) {
  const { t } = useTranslation();
  if (v == null) return <span className="text-ardoise-400" title={t('kpi.statuts.aide.non_renseigne')}>—</span>;
  return (
    <span className="chiffres">
      {formaterNombre(v, d)}
      {suffixe}
    </span>
  );
}

export function KpiNational({ onOuvrirCommune }: { onOuvrirCommune: (communeId: string) => void }) {
  const { t } = useTranslation();
  const [vue, setVue] = useState<Vue>('concours');
  const [annee, setAnnee] = useState(ANNEE);
  const [niveau, setNiveau] = useState<NiveauKpi>('commune');
  const [officiel, setOfficiel] = useState(true);

  return (
    <section className="mb-10 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ardoise-900">{t('kpi.national.titre')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={t('kpi.annee')} value={annee} onChange={(e) => setAnnee(Number(e.target.value))} className={champ}>
            {[0, 1, 2, 3, 4].map((i) => (
              <option key={i} value={ANNEE - i}>
                {ANNEE - i}
              </option>
            ))}
          </select>
          {vue !== 'alertes' && vue !== 'reglages' && (
            <select aria-label={t('kpi.national.niveau')} value={niveau} onChange={(e) => setNiveau(e.target.value as NiveauKpi)} className={champ}>
              {NIVEAUX.map((n) => (
                <option key={n} value={n}>
                  {t(`kpi.national.niveaux.${n}`)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {VUES.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={vue === v}
            onClick={() => setVue(v)}
            className={`min-h-10 rounded-full px-4 text-sm font-medium ${vue === v ? 'bg-siipi-600 text-white' : 'bg-white text-ardoise-700 ring-1 ring-ardoise-300'}`}
          >
            {t(`kpi.national.vues.${v}`)}
          </button>
        ))}
      </div>

      {vue === 'concours' && (
        <Concours annee={annee} niveau={niveau} officiel={officiel} setOfficiel={setOfficiel} onOuvrirCommune={onOuvrirCommune} />
      )}
      {vue === 'axes' && <Axes annee={annee} niveau={niveau} onOuvrirCommune={onOuvrirCommune} />}
      {vue === 'dma' && <Dma annee={annee} niveau={niveau} onOuvrirCommune={onOuvrirCommune} />}
      {vue === 'alertes' && <Alertes annee={annee} onOuvrirCommune={onOuvrirCommune} />}
      {vue === 'reglages' && <Reglages />}
    </section>
  );
}

function useDonnees<T>(charger: () => Promise<T>, cles: unknown[]) {
  const { t } = useTranslation();
  const [d, setD] = useState<T | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const relancer = () => {
    setD(null);
    charger()
      .then((x) => {
        setD(x);
        setErreur(null);
      })
      .catch((err) => setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur')));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(relancer, cles);
  return { d, erreur, relancer };
}

function NomLigne({ l, niveau, onOuvrirCommune }: { l: any; niveau: NiveauKpi; onOuvrirCommune: (id: string) => void }) {
  const { t } = useTranslation();
  if (niveau === 'commune') {
    return (
      <button type="button" className="text-start font-medium text-siipi-700 hover:underline" onClick={() => onOuvrirCommune(l.commune_id)}>
        {l.nom}
      </button>
    );
  }
  if (l.cle === 'non_rattache') return <span className="text-ardoise-500">{t('kpi.national.nonRattache')}</span>;
  return <span className="font-medium text-ardoise-900">{niveau === 'national' ? t('kpi.national.niveaux.national') : (l.nom ?? l.cle)}</span>;
}

// ---------------------------------------------------------------------------

function Concours({
  annee,
  niveau,
  officiel,
  setOfficiel,
  onOuvrirCommune,
}: {
  annee: number;
  niveau: NiveauKpi;
  officiel: boolean;
  setOfficiel: (x: boolean) => void;
  onOuvrirCommune: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { d, erreur, relancer } = useDonnees(() => api.kpiConcours(annee, niveau, officiel), [annee, niveau, officiel]);
  if (erreur) return <Erreur message={erreur} onReessayer={relancer} />;
  if (!d) return <Chargement />;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-ardoise-700">
          <input type="checkbox" checked={officiel} onChange={(e) => setOfficiel(e.target.checked)} className="size-4" />
          {t('kpi.national.officiel')}
        </label>
        {niveau === 'commune' && (
          <BoutonExport chemin={`/kpi/concours-national?annee=${annee}&niveau=commune&officiel=${officiel}`} desactive={d.length === 0} />
        )}
      </div>
      <p className="text-xs text-ardoise-500">{t('kpi.national.aideConcours')}</p>
      {d.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">{t('kpi.national.aucuneCommune')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b border-ardoise-200 bg-ardoise-50">
              {niveau === 'commune' ? (
                <tr>
                  <th className={th}>{t('kpi.national.colonnes.rang')}</th>
                  <th className={th}>{t('kpi.national.colonnes.commune')}</th>
                  <th className={th}>{t('kpi.national.colonnes.gouvernorat')}</th>
                  <th className={`${th} text-end`}>{t('kpi.national.colonnes.note')}</th>
                  <th className={`${th} text-end`}>{t('kpi.national.colonnes.renseignes')}</th>
                  <th className={`${th} text-end`}>{t('kpi.national.colonnes.couverture')}</th>
                  <th className={th}>{t('kpi.national.colonnes.fiche')}</th>
                </tr>
              ) : (
                <tr>
                  <th className={th}>{t(`kpi.national.niveaux.${niveau}`)}</th>
                  <th className={`${th} text-end`}>{t('kpi.national.colonnes.communes')}</th>
                  <th className={`${th} text-end`}>{t('kpi.national.colonnes.classees')}</th>
                  <th className={`${th} text-end`}>{t('kpi.national.colonnes.noteMoyenne')}</th>
                  <th className={`${th} text-end`}>{t('kpi.national.colonnes.couvertureMoyenne')}</th>
                </tr>
              )}
            </thead>
            <tbody>
              {d.map((l: any) =>
                niveau === 'commune' ? (
                  <tr key={l.commune_id} className={`border-b border-ardoise-100 last:border-0 ${l.classe ? '' : 'text-ardoise-500'}`}>
                    <td className={`${td} chiffres font-semibold`}>{l.rang ?? '—'}</td>
                    <td className={td}>
                      <NomLigne l={l} niveau={niveau} onOuvrirCommune={onOuvrirCommune} />
                      {!l.classe && <span className="block text-xs">{t(`kpi.concours.motifs.${l.motif_non_classe}`)}</span>}
                    </td>
                    <td className={td}>{l.gouvernorat}</td>
                    <td className={`${td} text-end`}>
                      <N v={l.score} />
                    </td>
                    <td className={`${td} chiffres text-end`}>
                      {l.indicateurs_renseignes}/{l.indicateurs_applicables}
                    </td>
                    <td className={`${td} text-end`}>
                      <N v={l.couverture} d={0} suffixe=" %" />
                    </td>
                    <td className={td}>{t(`kpi.fiche.statuts.${l.fiche ?? 'aucune'}`)}</td>
                  </tr>
                ) : (
                  <tr key={l.cle} className="border-b border-ardoise-100 last:border-0">
                    <td className={td}>
                      <NomLigne l={l} niveau={niveau} onOuvrirCommune={onOuvrirCommune} />
                    </td>
                    <td className={`${td} chiffres text-end`}>{l.communes}</td>
                    <td className={`${td} chiffres text-end`}>{l.concours.communes_classees}</td>
                    <td className={`${td} text-end`}>
                      <N v={l.concours.score_moyen} />
                    </td>
                    <td className={`${td} text-end`}>
                      <N v={l.concours.couverture_moyenne} d={0} suffixe=" %" />
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Axes({ annee, niveau, onOuvrirCommune }: { annee: number; niveau: NiveauKpi; onOuvrirCommune: (id: string) => void }) {
  const { t } = useTranslation();
  const { d, erreur, relancer } = useDonnees(() => api.kpiNational(annee, niveau), [annee, niveau]);
  if (erreur) return <Erreur message={erreur} onReessayer={relancer} />;
  if (!d) return <Chargement />;
  if (d.length === 0) return <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">{t('kpi.national.aucuneCommune')}</p>;
  const indice = (l: any, axe: number) =>
    niveau === 'commune' ? l.axes.find((a: any) => a.axe === axe)?.indice : l.axes.find((a: any) => a.axe === axe)?.indice_moyen;
  const base = (l: any, axe: number) => (niveau === 'commune' ? null : l.axes.find((a: any) => a.axe === axe)?.communes_renseignees);
  return (
    <div className="space-y-2">
      <p className="text-xs text-ardoise-500">{t('kpi.national.aideAxes')}</p>
      <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b border-ardoise-200 bg-ardoise-50">
            <tr>
              <th className={th}>{t(`kpi.national.niveaux.${niveau}`)}</th>
              {[1, 2, 3, 4, 5].map((a) => (
                <th key={a} className={`${th} text-end`} title={t(`kpi.axes.${a}`)}>
                  {t('kpi.axe', { n: a })}
                </th>
              ))}
              {niveau !== 'commune' && <th className={`${th} text-end`}>{t('kpi.national.colonnes.tonnage')}</th>}
              {niveau !== 'commune' && <th className={`${th} text-end`}>{t('kpi.national.colonnes.resolution')}</th>}
            </tr>
          </thead>
          <tbody>
            {d.map((l: any) => (
              <tr key={l.commune_id ?? l.cle} className="border-b border-ardoise-100 last:border-0">
                <td className={td}>
                  <NomLigne l={l} niveau={niveau} onOuvrirCommune={onOuvrirCommune} />
                </td>
                {[1, 2, 3, 4, 5].map((a) => (
                  <td key={a} className={`${td} text-end`}>
                    <N v={indice(l, a)} />
                    {base(l, a) != null && <span className="block text-xs text-ardoise-400">{t('kpi.national.surCommunes', { count: base(l, a) })}</span>}
                  </td>
                ))}
                {niveau !== 'commune' && (
                  <td className={`${td} text-end`}>
                    <N v={l.tonnage_t} d={1} suffixe=" t" />
                  </td>
                )}
                {niveau !== 'commune' && (
                  <td className={`${td} text-end`}>
                    <N v={l.taux_resolution} d={0} suffixe=" %" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Dma({ annee, niveau, onOuvrirCommune }: { annee: number; niveau: NiveauKpi; onOuvrirCommune: (id: string) => void }) {
  const { t } = useTranslation();
  const { d, erreur, relancer } = useDonnees(() => api.kpiDma(annee, niveau), [annee, niveau]);
  if (erreur) return <Erreur message={erreur} onReessayer={relancer} />;
  if (!d) return <Chargement />;
  return (
    <div className="space-y-2">
      <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{d.en_vigueur ? t('kpi.dma.enVigueur') : t('kpi.dma.anticipation')}</p>
      {d.lignes.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">{t('kpi.national.aucuneDma')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="border-b border-ardoise-200 bg-ardoise-50">
              <tr>
                <th className={th}>{t(`kpi.national.niveaux.${niveau}`)}</th>
                <th className={`${th} text-end`}>{t('kpi.national.colonnes.indiceDma')}</th>
                <th className={th}>{niveau === 'commune' ? t('kpi.national.colonnes.niveauDma') : t('kpi.national.colonnes.evaluees')}</th>
              </tr>
            </thead>
            <tbody>
              {d.lignes.map((l: any) => (
                <tr key={l.commune_id ?? l.cle} className="border-b border-ardoise-100 last:border-0">
                  <td className={td}>
                    <NomLigne l={l} niveau={niveau} onOuvrirCommune={onOuvrirCommune} />
                  </td>
                  <td className={`${td} text-end`}>
                    <N v={niveau === 'commune' ? l.dma.indice : l.dma.indice_moyen} />
                  </td>
                  <td className={td}>
                    {niveau === 'commune' ? t(`kpi.dma.niveaux.${l.dma.niveau}`) : t('kpi.national.surCommunes', { count: l.dma.communes_evaluees })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

const ALLURE: Record<string, string> = {
  bloquant: 'border-red-300 bg-red-50 text-red-900',
  avertissement: 'border-amber-300 bg-amber-50 text-amber-900',
  information: 'border-ardoise-200 bg-ardoise-50 text-ardoise-700',
};

function Alertes({ annee, onOuvrirCommune }: { annee: number; onOuvrirCommune: (id: string) => void }) {
  const { t } = useTranslation();
  const { d, erreur, relancer } = useDonnees(() => api.kpiAlertes(annee), [annee]);
  if (erreur) return <Erreur message={erreur} onReessayer={relancer} />;
  if (!d) return <Chargement />;
  if (d.length === 0) return <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">{t('kpi.national.aucuneAlerte')}</p>;
  return (
    <ul className="space-y-1.5">
      {d.map((a, i) => (
        <li key={`${a.commune_id}-${a.code}-${i}`} className={`rounded-lg border p-2.5 text-sm ${ALLURE[a.gravite] ?? ALLURE.information}`}>
          <button type="button" className="font-semibold hover:underline" onClick={() => onOuvrirCommune(a.commune_id)}>
            {a.nom}
          </button>{' '}
          <span className="text-xs opacity-80">({a.gouvernorat})</span> — {a.constat}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Les réglages de la FNCT : le barème des 19 indicateurs, les seuils, les
// districts. Rien de tout cela n'est supposé par la plateforme.
// ---------------------------------------------------------------------------

function Reglages() {
  const { t, i18n } = useTranslation();
  const [cat, setCat] = useState<{ indicateurs: Record<string, any>[]; parametres: Record<string, number> } | null>(null);
  const [points, setPoints] = useState<Record<string, string>>({});
  const [seuils, setSeuils] = useState<Record<string, string>>({});
  const [districts, setDistricts] = useState<{ code: string; nom: string }[]>([]);
  const [rattachements, setRattachements] = useState<Record<string, string>>({});
  const [gouvernorats, setGouvernorats] = useState<string[]>([]);
  const [etat, setEtat] = useState<{ type: 'ok' | 'erreur'; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = async () => {
    const [c, dist] = await Promise.all([api.kpiCatalogue(), api.kpiDistricts()]);
    setCat(c);
    setPoints(Object.fromEntries(c.indicateurs.filter((i) => i.famille === 'concours').map((i) => [i.code, String(i.points)])));
    setSeuils(Object.fromEntries(Object.entries(c.parametres).map(([k, v]) => [k, String(v)])));
    setDistricts(dist.districts.map((x) => ({ code: x.code, nom: x.nom })));
    setRattachements(Object.fromEntries(dist.rattachements.map((r) => [r.gouvernorat, r.district_code])));
    setGouvernorats(dist.gouvernorats);
  };
  useEffect(() => {
    void charger();
  }, []);

  const executer = async (tache: () => Promise<unknown>, texte: string) => {
    setEnCours(true);
    setEtat(null);
    try {
      await tache();
      await charger();
      setEtat({ type: 'ok', texte });
    } catch (err) {
      setEtat({ type: 'erreur', texte: err instanceof ErreurApi ? err.message : t('commun.erreur') });
    } finally {
      setEnCours(false);
    }
  };

  if (!cat) return <Chargement />;
  const total = Object.values(points).reduce((s, v) => s + (Number(v.replace(',', '.')) || 0), 0);
  const concours = cat.indicateurs.filter((i) => i.famille === 'concours');
  const SEUILS = ['reclamation_delai_heures', 'taux_resolution_min', 'bachage_min', 'maintenance_min', 'couverture_classement_min'];

  return (
    <div className="space-y-4">
      {etat && (
        <p role={etat.type === 'ok' ? 'status' : 'alert'} className={`rounded-lg p-3 text-sm ${etat.type === 'ok' ? 'bg-siipi-50 text-siipi-800' : 'bg-red-50 text-red-800'}`}>
          {etat.texte}
        </p>
      )}

      <div className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-4">
        <h3 className="font-semibold text-ardoise-900">{t('kpi.reglages.bareme')}</h3>
        <p className="text-sm text-ardoise-600">{cat.parametres.bareme_provisoire === 1 ? t('kpi.baremeProvisoire') : t('kpi.reglages.baremeConfirme')}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {concours.map((i) => (
            <label key={i.code} className="flex items-center justify-between gap-2 rounded-lg border border-ardoise-200 px-2 py-1 text-sm">
              <span>
                <span className="me-1 font-mono text-xs text-ardoise-500">{i.code}</span>
                {i18n.language.startsWith('ar') ? i.libelle_ar : i.libelle_fr}
              </span>
              <input
                inputMode="decimal"
                value={points[i.code] ?? ''}
                onChange={(e) => setPoints((p) => ({ ...p, [i.code]: e.target.value }))}
                className={`${champ} w-16 text-end`}
                aria-label={`${i.code} — ${t('kpi.colonnes.points')}`}
              />
            </label>
          ))}
        </div>
        <p className={`chiffres text-sm ${Math.abs(total - 100) < 0.01 ? 'text-siipi-700' : 'text-red-700'}`}>{t('kpi.reglages.total', { n: formaterNombre(total, 1) })}</p>
        <div className="flex flex-wrap gap-2">
          {[false, true].map((confirmer) => (
            <button
              key={String(confirmer)}
              type="button"
              disabled={enCours || Math.abs(total - 100) > 0.01}
              className={confirmer ? boutonPrincipal : bouton}
              onClick={() =>
                void executer(
                  () => api.kpiBareme(Object.fromEntries(Object.entries(points).map(([k, v]) => [k, Number(v.replace(',', '.'))])), confirmer),
                  t('kpi.reglages.baremeEnregistre')
                )
              }
            >
              {confirmer ? t('kpi.reglages.confirmerBareme') : t('kpi.reglages.enregistrer')}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-4">
        <h3 className="font-semibold text-ardoise-900">{t('kpi.reglages.seuils')}</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {SEUILS.map((cle) => (
            <label key={cle} className="text-sm">
              <span className="block text-ardoise-700">{t(`kpi.reglages.cles.${cle}`)}</span>
              <input
                inputMode="decimal"
                value={seuils[cle] ?? ''}
                onChange={(e) => setSeuils((s) => ({ ...s, [cle]: e.target.value }))}
                className={`${champ} w-28`}
              />
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={seuils.dma_en_vigueur === '1'}
              onChange={(e) => setSeuils((s) => ({ ...s, dma_en_vigueur: e.target.checked ? '1' : '0' }))}
              className="size-4"
            />
            {t('kpi.reglages.cles.dma_en_vigueur')}
          </label>
        </div>
        <button
          type="button"
          disabled={enCours}
          className={boutonPrincipal}
          onClick={() =>
            void executer(
              () =>
                api.kpiParametres(
                  Object.fromEntries([...SEUILS, 'dma_en_vigueur'].map((k) => [k, Number(String(seuils[k]).replace(',', '.'))]))
                ),
              t('kpi.reglages.seuilsEnregistres')
            )
          }
        >
          {t('kpi.reglages.enregistrer')}
        </button>
      </div>

      <div className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-4">
        <h3 className="font-semibold text-ardoise-900">{t('kpi.reglages.districts')}</h3>
        <p className="text-sm text-ardoise-600">{t('kpi.reglages.districtsAide')}</p>
        <ul className="space-y-1">
          {districts.map((d, i) => (
            <li key={i} className="flex flex-wrap gap-2">
              <input
                value={d.code}
                onChange={(e) => setDistricts((l) => l.map((x, j) => (j === i ? { ...x, code: e.target.value.toLowerCase() } : x)))}
                placeholder={t('kpi.reglages.code')}
                aria-label={t('kpi.reglages.code')}
                className={`${champ} w-32 font-mono`}
              />
              <input
                value={d.nom}
                onChange={(e) => setDistricts((l) => l.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))}
                placeholder={t('kpi.reglages.nom')}
                aria-label={t('kpi.reglages.nom')}
                className={`${champ} min-w-48 flex-1`}
              />
              <button type="button" className={bouton} onClick={() => setDistricts((l) => l.filter((_, j) => j !== i))}>
                {t('kpi.reglages.retirer')}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className={bouton} onClick={() => setDistricts((l) => [...l, { code: '', nom: '' }])}>
          {t('kpi.reglages.ajouterDistrict')}
        </button>
        {districts.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {gouvernorats.map((g) => (
              <label key={g} className="flex items-center justify-between gap-2 text-sm">
                <span>{g}</span>
                <select value={rattachements[g] ?? ''} onChange={(e) => setRattachements((r) => ({ ...r, [g]: e.target.value }))} className={champ}>
                  <option value="">{t('kpi.national.nonRattache')}</option>
                  {districts
                    .filter((d) => d.code)
                    .map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.nom || d.code}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
        )}
        <button
          type="button"
          disabled={enCours}
          className={boutonPrincipal}
          onClick={() =>
            void executer(
              () =>
                api.enregistrerDistricts({
                  districts: districts.filter((d) => d.code && d.nom),
                  rattachements: Object.fromEntries(gouvernorats.map((g) => [g, rattachements[g] || null])),
                }),
              t('kpi.reglages.districtsEnregistres')
            )
          }
        >
          {t('kpi.reglages.enregistrer')}
        </button>
      </div>
    </div>
  );
}
