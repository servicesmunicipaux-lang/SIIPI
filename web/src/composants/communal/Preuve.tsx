// « Je veux pouvoir prouver, chiffres à l'appui, si un prestataire fait son
// travail ou pas — pas me fier aux coups de fil des citoyens. »
//
// Cet écran est la réponse à cette phrase. Il montre deux choses que le
// directeur de la propreté ne pouvait pas obtenir jusqu'ici :
//
//   1. la performance sur la période, avec le taux de RÉALISATION affiché à
//      côté du taux de COUVERTURE du contrôle. Les confondre est l'erreur qui
//      ruine un tableau contractuel : 100 % de réussite sur deux contrôles en
//      un mois ne prouve rien, et l'écran doit le dire lui-même.
//
//   2. la confrontation jour par jour : ce que le prestataire a déclaré face à
//      ce que la commune a constaté. Quand les deux divergent, on n'a plus une
//      parole contre une autre mais un désaccord daté et localisé.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  type LigneConfrontation,
  type PerformancePrestataire,
} from '../../lib/api';
import { Chargement, Erreur, CarteIndicateur } from '../Elements';
import { formaterNombre } from '../../i18n';

const STYLE_SITUATION: Record<string, string> = {
  concordant: 'bg-siipi-100 text-siipi-800',
  divergent: 'bg-red-100 text-red-900',
  non_controle: 'bg-amber-100 text-amber-900',
  non_declare: 'bg-sky-100 text-sky-900',
  silence: 'bg-ardoise-200 text-ardoise-700',
};

function ilYA(jours: number): string {
  const d = new Date();
  d.setDate(d.getDate() - jours);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function Preuve({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const [jours, setJours] = useState(30);
  const [performance, setPerformance] = useState<PerformancePrestataire[] | null>(null);
  const [confrontation, setConfrontation] = useState<LigneConfrontation[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<string>('divergent');

  const depuis = useMemo(() => ilYA(jours), [jours]);
  const jusqua = useMemo(() => ilYA(0), []);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const [p, c] = await Promise.all([
          api.performance(communeId, depuis, jusqua),
          api.confrontation(communeId, depuis, jusqua),
        ]);
        if (!annule) {
          setPerformance(p);
          setConfrontation(c);
          setErreur(null);
        }
      } catch (err) {
        if (!annule) setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
      }
    })();
    return () => {
      annule = true;
    };
  }, [communeId, depuis, jusqua, t]);

  if (erreur) return <Erreur message={erreur} />;
  if (!performance) return <Chargement />;

  const lignes = confrontation.filter((l) => filtre === 'tous' || l.situation === filtre);
  const divergences = confrontation.filter((l) => l.situation === 'divergent').length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.preuve.titre')}</h1>
          <p className="mt-1 text-sm text-ardoise-500">{t('communal.preuve.sousTitre')}</p>
        </div>
        <div className="flex gap-1.5">
          {[7, 30, 90].map((j) => (
            <button
              key={j}
              type="button"
              onClick={() => setJours(j)}
              className={`min-h-11 rounded-lg px-3 text-sm font-medium ${
                jours === j
                  ? 'bg-ardoise-900 text-white'
                  : 'border border-ardoise-300 bg-white text-ardoise-700'
              }`}
            >
              {t('communal.preuve.jours', { jours: j })}
            </button>
          ))}
        </div>
      </header>

      {performance.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">
          {t('communal.preuve.aucuneDonnee')}
        </p>
      ) : (
        performance.map((p) => (
          <section key={p.prestataire_id ?? 'regie'} className="space-y-3">
            <h2 className="font-medium text-ardoise-900">
              {p.prestataire_nom ?? t('communal.constat.regie')}
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <CarteIndicateur
                accent
                libelle={t('communal.preuve.realisation')}
                valeur={
                  p.taux_realisation == null ? '—' : `${formaterNombre(p.taux_realisation, 1)} %`
                }
                detail={t('communal.preuve.realisationAide')}
              />
              <CarteIndicateur
                libelle={t('communal.preuve.couverture')}
                valeur={
                  p.taux_couverture == null ? '—' : `${formaterNombre(p.taux_couverture, 1)} %`
                }
                detail={t('communal.preuve.couvertureAide')}
              />
              <CarteIndicateur
                libelle={t('communal.preuve.nonFait')}
                valeur={formaterNombre(p.controles_non_fait)}
                detail={t('communal.preuve.nonFaitAide', {
                  saisis: p.controles_saisis,
                  attendus: p.passages_attendus,
                })}
              />
            </div>
            {/* Une couverture faible rend le taux de réalisation peu probant :
                l'écran le dit au lieu de laisser interpréter un chiffre flatteur. */}
            {p.taux_couverture != null && p.taux_couverture < 50 && (
              <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                {t('communal.preuve.couvertureFaible')}
              </p>
            )}
          </section>
        ))
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium text-ardoise-900">{t('communal.preuve.confrontation')}</h2>
          <p className="text-sm text-ardoise-500">
            {t('communal.preuve.divergences', { nombre: divergences })}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {['divergent', 'silence', 'non_declare', 'non_controle', 'concordant', 'tous'].map(
            (s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFiltre(s)}
                className={`min-h-11 rounded-full px-3 text-sm font-medium ${
                  filtre === s
                    ? 'bg-ardoise-900 text-white'
                    : 'border border-ardoise-300 bg-white text-ardoise-700'
                }`}
              >
                {t(`communal.situations.${s}`)}
              </button>
            )
          )}
        </div>

        {lignes.length === 0 ? (
          <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">
            {t('communal.preuve.aucuneLigne')}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-ardoise-200 text-start text-xs text-ardoise-500 uppercase">
                <tr>
                  <th className="p-3 text-start">{t('communal.preuve.jour')}</th>
                  <th className="p-3 text-start">{t('communal.preuve.circuit')}</th>
                  <th className="p-3 text-start">{t('communal.preuve.declare')}</th>
                  <th className="p-3 text-start">{t('communal.preuve.constate')}</th>
                  <th className="p-3 text-start">{t('communal.preuve.situation')}</th>
                </tr>
              </thead>
              <tbody>
                {lignes.slice(0, 200).map((l) => (
                  <tr
                    key={`${l.circuit_id}-${l.jour}`}
                    className="border-b border-ardoise-100 last:border-0"
                  >
                    <td className="chiffres p-3 whitespace-nowrap">{l.jour}</td>
                    <td className="p-3">{l.circuit_nom}</td>
                    <td className="p-3">
                      {l.declaration ? t(`communal.declarations.${l.declaration}`) : '—'}
                      {/* Une déclaration saisie au bureau n'a pas la force d'un
                          relevé horodaté sur place : le dire ici évite d'opposer
                          au prestataire une preuve qu'il n'a pas produite. */}
                      {l.mode_saisie === 'bureau' && (
                        <span className="ms-1 text-xs text-ardoise-500">
                          ({t('communal.preuve.bureau')})
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {l.constat ? t(`communal.etats.${l.constat}`) : '—'}
                      {l.incident && (
                        <span className="ms-1 text-xs text-amber-700">
                          ({t(`communal.typesIncident.${l.incident}`, { defaultValue: l.incident })}
                          )
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STYLE_SITUATION[l.situation] ?? ''
                        }`}
                      >
                        {t(`communal.situations.${l.situation}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
