// D'où vient chaque terme d'un indicateur ODD calculé (décisions du 4 novembre,
// § 3.1) : le pesé, la population et sa source, la production spécifique et sa
// source, le proxy des assimilés, la caractérisation et son niveau.
//
// Une valeur ODD mêle une mesure et une estimation : le pesé est mesuré, le
// gisement assimilé ne l'est pas encore. La donner sans ses termes ferait lire
// une estimation comme une mesure — l'écran les montre tous, chacun avec sa
// provenance, et dit pourquoi le taux ODD est plus bas que le taux de collecte.

import { useTranslation } from 'react-i18next';
import type { ResultatIndicateur } from '../../lib/api';
import { formaterNombre } from '../../i18n';

const nombre = (v: unknown, decimales: number) => {
  const n = typeof v === 'number' ? v : v != null && v !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? formaterNombre(n, decimales) : '—';
};

function Terme({ libelle, valeur, provenance }: { libelle: string; valeur: string; provenance: string }) {
  return (
    <tr className="border-t border-ardoise-100 align-top">
      <th scope="row" className="px-2 py-1.5 text-start font-normal text-ardoise-700">{libelle}</th>
      <td className="chiffres px-2 py-1.5 text-end text-ardoise-900" dir="ltr">{valeur}</td>
      <td className="px-2 py-1.5 text-start text-ardoise-600">{provenance}</td>
    </tr>
  );
}

export function ProvenanceOdd({ r }: { r: ResultatIndicateur }) {
  const { t } = useTranslation();
  if (r.statut !== 'renseigne' || r.source !== 'mesure') return null;
  const d = (r.detail ?? {}) as Record<string, unknown>;
  const population = t('kpi.odd.termes.populationProvenance', {
    n: nombre(d.population, 0),
    source: d.population_provenance === 'recensement' ? t('kpi.odd.termes.recensement') : String(d.population_provenance ?? '—'),
  });
  const production = t('kpi.odd.termes.productionProvenance', {
    valeur: nombre(d.production_kg_hab_j, 3),
    source: String(d.production_source ?? '—'),
  });

  let termes: { libelle: string; valeur: string; provenance: string }[] = [];
  let note = '';
  if (r.code === 'ODD_11_6_1_A') {
    termes = [
      {
        libelle: t('kpi.odd.termes.collecte'),
        valeur: `${nombre(d.collecte_t, 1)} t`,
        provenance: t('kpi.odd.termes.pese', { peses: nombre(d.voyages_peses, 0), attendus: nombre(d.voyages_attendus, 0) }),
      },
      { libelle: t('kpi.odd.termes.gisementMenager'), valeur: `${nombre(d.gisement_menager_t, 1)} t`, provenance: `${production} ; ${population}` },
      {
        libelle: t('kpi.odd.termes.gisementAssimile'),
        valeur: `${nombre(d.gisement_assimile_t, 1)} t`,
        provenance: t('kpi.odd.termes.proxy', { part: nombre(d.part_assimiles_pct, 0) }),
      },
    ];
    note = t('kpi.odd.noteTauxCollecte');
  } else if (r.code === 'ODD_12_3_1_B') {
    const niveau = String(d.caracterisation_niveau ?? '');
    termes = [
      { libelle: t('kpi.odd.termes.production'), valeur: `${nombre(d.production_kg_hab_j, 3)} kg/hab/j`, provenance: t('kpi.odd.termes.source', { source: String(d.production_source ?? '—') }) },
      {
        libelle: t('kpi.odd.termes.organiques'),
        valeur: `${nombre(d.part_organiques_pct, 1)} %`,
        provenance: t('kpi.odd.termes.caracterisation', {
          niveau: niveau ? t(`ajout.caracterisation.niveaux.${niveau}`) : '—',
          annee: String(d.caracterisation_annee ?? '—'),
        }),
      },
      { libelle: t('kpi.odd.termes.total'), valeur: `${nombre(d.total_t_j, 3)} t/j`, provenance: population },
    ];
    note = t('kpi.odd.noteApproximation');
  } else {
    return null;
  }

  return (
    <section className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-4" aria-labelledby={`termes-${r.code}`}>
      <h3 id={`termes-${r.code}`} className="text-base font-semibold text-ardoise-900">{t('kpi.odd.termes.titre')}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-ardoise-500">
            <tr>
              <th className="px-2 py-1.5 text-start">{t('kpi.odd.termes.terme')}</th>
              <th className="px-2 py-1.5 text-end">{t('kpi.odd.termes.valeur')}</th>
              <th className="px-2 py-1.5 text-start">{t('kpi.odd.termes.provenance')}</th>
            </tr>
          </thead>
          <tbody>
            {termes.map((x) => (
              <Terme key={x.libelle} {...x} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="rounded-lg bg-ardoise-50 p-2 text-xs text-ardoise-700">{note}</p>
    </section>
  );
}
