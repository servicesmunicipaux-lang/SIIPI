// Les indicateurs d'une commune : ses 5 axes, sa note au Concours national de
// propreté, sa préparation au tri à la source — et sa fiche d'évaluation
// (Jalon 8, TDR §3.2.10). Le même écran sert la commune et, en lecture et en
// validation, la FNCT (A2.3 « Visualiser »).
//
// LA RÈGLE D'OR : UNE DONNÉE MANQUANTE N'EST PAS UN ZÉRO. Un indicateur sans
// source s'affiche « non renseigné », avec la raison au survol ; une note se
// montre toujours avec ce sur quoi elle porte (« 14/19 indicateurs »).

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type KpiCommune, type ResultatIndicateur } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { imprimer } from '../../lib/impression';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';
import { FicheEvaluation } from './FicheEvaluation';

const ANNEE = new Date().getFullYear();
const bouton = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50';

const CLASSES_STATUT: Record<string, string> = {
  renseigne: 'bg-siipi-100 text-siipi-800',
  non_renseigne: 'bg-ardoise-100 text-ardoise-600',
  sans_objet: 'bg-ardoise-100 text-ardoise-500',
  reventile: 'bg-blue-100 text-blue-800',
};

/** Une valeur, ou « non renseigné » avec la raison au survol — jamais un 0 inventé. */
export function ValeurKpi({ r }: { r: ResultatIndicateur }) {
  const { t } = useTranslation();
  if (r.statut !== 'renseigne' || r.valeur == null) {
    return (
      <span className="text-ardoise-400" title={t(`kpi.statuts.aide.${r.statut}`)}>
        {r.statut === 'renseigne' ? '—' : t(`kpi.statuts.${r.statut}`)}
      </span>
    );
  }
  const decimales = Number.isInteger(r.valeur) ? 0 : r.valeur < 10 ? 3 : 1;
  return (
    <span className="chiffres font-medium text-ardoise-900">
      {formaterNombre(r.valeur, decimales)}
      {r.cible != null && <span className="text-ardoise-500"> / {formaterNombre(r.cible, 0)}</span>}
      {r.unite && <span className="ms-1 text-xs text-ardoise-500">{r.unite}</span>}
    </span>
  );
}

/** Un indice sur 100, ou « non renseigné » — et ce sur quoi il porte. */
function Indice({ valeur, renseignes, total }: { valeur: number | null; renseignes: number; total: number }) {
  const { t } = useTranslation();
  return (
    <div>
      <p className="chiffres text-3xl font-bold text-ardoise-900" title={valeur == null ? t('kpi.statuts.aide.non_renseigne') : undefined}>
        {valeur == null ? <span className="text-xl text-ardoise-400">{t('kpi.statuts.non_renseigne')}</span> : formaterNombre(valeur, 1)}
        {valeur != null && <span className="text-base font-normal text-ardoise-500"> / 100</span>}
      </p>
      <p className="text-xs text-ardoise-500">{t('kpi.renseignes', { n: renseignes, total })}</p>
    </div>
  );
}

function LigneIndicateur({ r, langue }: { r: ResultatIndicateur; langue: string }) {
  const { t } = useTranslation();
  return (
    <tr className="border-b border-ardoise-100 last:border-0 align-top">
      <td className="px-3 py-2">
        <span className="me-2 font-mono text-xs text-ardoise-500">{r.famille === 'donnee' ? '' : r.code}</span>
        <span className="text-ardoise-900">{langue.startsWith('ar') ? r.libelle_ar : r.libelle_fr}</span>
        {r.reventile_vers && <span className="block text-xs text-blue-700">{t('kpi.reventileVers', { code: r.reventile_vers })}</span>}
        {r.recoit_de.length > 0 && <span className="block text-xs text-blue-700">{t('kpi.recoitDe', { codes: r.recoit_de.join(', ') })}</span>}
        {r.commentaire && <span className="block text-xs text-ardoise-500">{r.commentaire}</span>}
      </td>
      <td className="px-3 py-2 text-end">
        <ValeurKpi r={r} />
      </td>
      <td className="chiffres px-3 py-2 text-end text-ardoise-700">{r.note != null ? `${formaterNombre(100 * r.note, 0)} %` : '—'}</td>
      <td className="chiffres px-3 py-2 text-end text-ardoise-700">
        {r.famille === 'concours' && r.points_effectifs != null
          ? r.points_obtenus != null
            ? `${formaterNombre(r.points_obtenus, 1)} / ${formaterNombre(r.points_effectifs, 0)}`
            : `— / ${formaterNombre(r.points_effectifs, 0)}`
          : ''}
      </td>
      <td className="px-3 py-2">
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${CLASSES_STATUT[r.statut]}`} title={t(`kpi.statuts.aide.${r.statut}`)}>
          {t(`kpi.statuts.${r.statut}`)}
        </span>
        <span className="ms-1 text-xs text-ardoise-400">{t(`kpi.sources.${r.mode}`)}</span>
      </td>
    </tr>
  );
}

function TableIndicateurs({ liste }: { liste: ResultatIndicateur[] }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="overflow-x-auto rounded-lg border border-ardoise-200">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="border-b border-ardoise-200 bg-ardoise-50 text-xs uppercase text-ardoise-500">
          <tr>
            <th className="px-3 py-2 text-start">{t('kpi.colonnes.indicateur')}</th>
            <th className="px-3 py-2 text-end">{t('kpi.colonnes.valeur')}</th>
            <th className="px-3 py-2 text-end">{t('kpi.colonnes.atteinte')}</th>
            <th className="px-3 py-2 text-end">{t('kpi.colonnes.points')}</th>
            <th className="px-3 py-2 text-start">{t('kpi.colonnes.statut')}</th>
          </tr>
        </thead>
        <tbody>
          {liste.map((r) => (
            <LigneIndicateur key={r.code} r={r} langue={i18n.language} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IndicateursCommune({ communeId, fnct = false }: { communeId: string; fnct?: boolean }) {
  const { t } = useTranslation();
  const f = useFormats();
  const [annee, setAnnee] = useState(ANNEE);
  const [vue, setVue] = useState<'tableau' | 'fiche'>('tableau');
  const [kpi, setKpi] = useState<KpiCommune | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [axeOuvert, setAxeOuvert] = useState<number | null>(null);
  const bloc = useRef<HTMLDivElement>(null);

  const charger = async () => {
    try {
      setKpi(await api.kpiCommune(communeId, annee));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    setKpi(null);
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId, annee]);

  if (erreur && !kpi) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!kpi) return <Chargement />;

  const concours = kpi.indicateurs.filter((r) => r.famille === 'concours');
  const dma = kpi.indicateurs.filter((r) => r.famille === 'dma');

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ardoise-900">{t('kpi.titre', { commune: kpi.nom })}</h1>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-500">{t('kpi.chapeau')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm">
            <span className="sr-only">{t('kpi.annee')}</span>
            <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))} className="min-h-10 rounded-lg border border-ardoise-300 bg-white px-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <option key={i} value={ANNEE - i}>
                  {ANNEE - i}
                </option>
              ))}
            </select>
          </label>
          {(['tableau', 'fiche'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vue === v}
              onClick={() => setVue(v)}
              className={`min-h-10 rounded-full px-4 text-sm font-medium ${vue === v ? 'bg-siipi-600 text-white' : 'bg-white text-ardoise-700 ring-1 ring-ardoise-300'}`}
            >
              {t(`kpi.vues.${v}`)}
            </button>
          ))}
        </div>
      </header>

      {kpi.parametres.bareme_provisoire === 1 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{t('kpi.baremeProvisoire')}</p>
      )}

      {vue === 'fiche' ? (
        <FicheEvaluation communeId={communeId} annee={annee} fnct={fnct} onModifiee={() => void charger()} />
      ) : (
        <div ref={bloc} className="space-y-4">
          {/* --- Le Concours ------------------------------------------------ */}
          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-ardoise-200 bg-white p-4 lg:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-ardoise-900">{t('kpi.concours.titre')}</h2>
                  <p className="text-xs text-ardoise-500">{t('kpi.concours.aide')}</p>
                </div>
                <span className="rounded-full bg-ardoise-100 px-2.5 py-0.5 text-xs text-ardoise-700">
                  {t(`kpi.fiche.statuts.${kpi.fiche.statut ?? 'aucune'}`)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-6">
                <Indice valeur={kpi.concours.score} renseignes={kpi.concours.indicateurs_renseignes} total={kpi.concours.indicateurs_applicables} />
                <p className="chiffres text-sm text-ardoise-600">
                  {t('kpi.concours.couverture', {
                    renseignes: formaterNombre(kpi.concours.points_renseignes, 0),
                    applicables: formaterNombre(kpi.concours.points_applicables, 0),
                    pct: kpi.concours.couverture == null ? '—' : formaterNombre(kpi.concours.couverture, 0),
                  })}
                </p>
              </div>
              <p className="mt-2 text-sm text-ardoise-700">
                {kpi.concours.classe ? t('kpi.concours.classable') : t(`kpi.concours.motifs.${kpi.concours.motif_non_classe}`)}
              </p>
            </div>
            <div className="rounded-xl border border-ardoise-200 bg-white p-4">
              <h2 className="font-semibold text-ardoise-900">{t('kpi.dma.titre')}</h2>
              <p className="mt-1 rounded bg-blue-50 p-2 text-xs text-blue-900">
                {kpi.parametres.dma_en_vigueur === 1 ? t('kpi.dma.enVigueur') : t('kpi.dma.anticipation')}
              </p>
              <div className="mt-3">
                <Indice valeur={kpi.dma.indice} renseignes={kpi.dma.renseignes} total={kpi.dma.total} />
                <p className="mt-1 text-sm font-medium text-ardoise-800">{t(`kpi.dma.niveaux.${kpi.dma.niveau}`)}</p>
              </div>
            </div>
          </section>

          {/* --- Les 5 axes ---------------------------------------------------- */}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {kpi.axes.map((a) => (
              <button
                key={a.axe}
                type="button"
                aria-expanded={axeOuvert === a.axe}
                onClick={() => setAxeOuvert((x) => (x === a.axe ? null : a.axe))}
                className={`rounded-xl border bg-white p-4 text-start hover:border-siipi-300 ${axeOuvert === a.axe ? 'border-siipi-500' : 'border-ardoise-200'}`}
              >
                <p className="text-xs font-semibold uppercase text-siipi-700">{t('kpi.axe', { n: a.axe })}</p>
                <p className="mb-2 text-sm font-medium text-ardoise-900">{t(`kpi.axes.${a.axe}`)}</p>
                <Indice valeur={a.indice} renseignes={a.renseignes} total={a.notes} />
              </button>
            ))}
          </section>
          {axeOuvert != null && (
            <section className="space-y-2">
              <h2 className="font-semibold text-ardoise-900">
                {t('kpi.axe', { n: axeOuvert })} — {t(`kpi.axes.${axeOuvert}`)}
              </h2>
              <TableIndicateurs liste={kpi.indicateurs.filter((r) => r.axe === axeOuvert)} />
            </section>
          )}

          {/* --- La grille du Concours, entière --------------------------------- */}
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-ardoise-900">{t('kpi.concours.grille')}</h2>
              <button
                type="button"
                className={bouton}
                onClick={() =>
                  bloc.current &&
                  imprimer(bloc.current, {
                    titre: t('kpi.impression.titre', { commune: kpi.nom, annee }),
                    details: [
                      t('kpi.impression.note', {
                        score: kpi.concours.score == null ? '—' : formaterNombre(kpi.concours.score, 1),
                        n: kpi.concours.indicateurs_renseignes,
                        total: kpi.concours.indicateurs_applicables,
                      }),
                      t(`kpi.fiche.statuts.${kpi.fiche.statut ?? 'aucune'}`),
                      f.date(new Date(), { heure: true }),
                    ],
                    paysage: true,
                  })
                }
              >
                {t('kpi.impression.bouton')}
              </button>
            </div>
            {(['M1', 'M2', 'M3'] as const).map((m) => (
              <div key={m} className="space-y-1">
                <h3 className="text-sm font-medium text-ardoise-700">{t(`kpi.modules.${m}`)}</h3>
                <TableIndicateurs liste={concours.filter((r) => r.module === m)} />
              </div>
            ))}
            <h3 className="text-sm font-medium text-ardoise-700">{t('kpi.dma.titre')}</h3>
            <TableIndicateurs liste={dma} />
          </section>
        </div>
      )}
    </div>
  );
}
