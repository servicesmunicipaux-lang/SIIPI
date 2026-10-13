// La carte d'un indicateur (refonte, lot 3b ; SPEC_refonte § 3.3) : la valeur
// de la période et son unité, une petite courbe de douze mois, la source
// écrite en toutes lettres (pas seulement une couleur), et l'atteinte de
// l'objectif quand la commune en a un.
//
// La petite courbe ne relie pas deux mois à travers un mois vide : un trou
// reste un trou (règle d'or 1.1). Elle est décorative pour un lecteur d'écran,
// qui lit la valeur et le nombre de mois renseignés.

import { useTranslation } from 'react-i18next';
import { Line, LineChart, YAxis } from 'recharts';
import type { IndicateurCatalogue, ResultatIndicateur } from '../../lib/api';
import { formaterNombre } from '../../i18n';

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

export const CLASSES_BADGE: Record<string, string> = {
  mesure: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200',
  declare: 'bg-blue-50 text-blue-800 ring-1 ring-blue-200',
  non_renseigne: 'bg-ardoise-100 text-ardoise-600',
  sans_objet: 'bg-ardoise-100 text-ardoise-500',
};

/**
 * Le badge de source : « mesuré » ou « déclaré ». Pour un indicateur non
 * renseigné ou sans objet, la valeur le dit déjà en toutes lettres : un second
 * badge répéterait le même mot.
 */
export function BadgeSource({ r }: { r: ResultatIndicateur }) {
  const { t } = useTranslation();
  if (r.statut !== 'renseigne' || !r.source) return null;
  const cle = r.statut === 'renseigne' && r.source ? r.source : r.statut;
  const texte = r.statut === 'renseigne' && r.source ? t(`kpi.sources.${r.source}`) : t(`kpi.statuts.${r.statut}`);
  const aide = r.statut === 'renseigne' && r.source ? t(`kpi.sources.aide.${r.source}`) : t(`kpi.statuts.aide.${r.statut}`);
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${CLASSES_BADGE[cle] ?? CLASSES_BADGE.non_renseigne}`} title={aide}>
      {texte}
    </span>
  );
}

export function CarteIndicateur({
  r,
  indicateur,
  courbe,
  choisie,
  onChoisir,
}: {
  r: ResultatIndicateur;
  indicateur: IndicateurCatalogue | undefined;
  /** Les douze mois, `null` pour un mois sans valeur ; absent si l'indicateur n'est pas mensuel. */
  courbe: (number | null)[] | null;
  choisie: boolean;
  onChoisir: () => void;
}) {
  const { t, i18n } = useTranslation();
  const libelle = i18n.language.startsWith('ar') ? r.libelle_ar : r.libelle_fr;
  const renseignes = courbe ? courbe.filter((v) => v !== null).length : 0;

  return (
    <button
      type="button"
      onClick={onChoisir}
      aria-pressed={choisie}
      className={`flex h-full w-full flex-col gap-2 rounded-xl border bg-white p-3 text-start hover:border-siipi-400 ${choisie ? 'border-siipi-600 ring-2 ring-siipi-200' : 'border-ardoise-200'}`}
    >
      <span className="text-sm font-medium text-ardoise-900">{libelle}</span>
      <span className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-lg">
          <ValeurKpi r={r} />
        </span>
        <BadgeSource r={r} />
      </span>
      {r.statut === 'renseigne' && r.taux_atteinte != null && (
        <span className="text-xs text-ardoise-600">{t('kpi.carte.atteinte', { pct: formaterNombre(100 * r.taux_atteinte, 0) })}</span>
      )}
      {r.statut === 'non_renseigne' && <span className="text-xs text-siipi-700">{t('kpi.carte.completer')}</span>}
      {courbe && renseignes > 0 ? (
        <span className="mt-auto block" dir="ltr">
          <span className="sr-only">{t('kpi.carte.moisRenseignes', { n: renseignes, total: courbe.length })}</span>
          <LineChart width={160} height={32} data={courbe.map((v) => ({ v }))} aria-hidden="true">
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Line type="monotone" dataKey="v" stroke="#13784f" strokeWidth={2} dot={renseignes === 1} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </span>
      ) : (
        indicateur &&
        indicateur.granularite !== 'mensuelle' && <span className="mt-auto text-xs text-ardoise-400">{t(`kpi.carte.granularite.${indicateur.granularite}`)}</span>
      )}
    </button>
  );
}
