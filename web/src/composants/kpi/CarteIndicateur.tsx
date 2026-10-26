// La carte d'un indicateur (refonte, lot 3b ; SPEC_refonte § 3.3 ; reprise au jalon D,
// lot D3a).
//
// LA VALEUR D'ABORD. Elle est en grand, son libellé au-dessus, sa source dite en
// toutes lettres (une pastille avec un mot et un dessin, pas seulement une
// couleur). Dessous, l'atteinte de l'objectif quand la commune en a un, puis
// la petite courbe de douze mois et sa tendance.
//
// UNE DONNÉE ABSENTE SE TAIT. Un indicateur « non renseigné » n'a ni gros chiffre
// ni filet de couleur : une carte en pointillés, un mot discret et le chemin pour
// le compléter. Dix-sept absences au même poids que deux mesures réelles les
// auraient noyées, et l'écran aurait lu comme un tableau de défauts.
//
// La tendance est un fait, pas un jugement : l'écart entre le premier et le
// dernier mois renseignés, sans couleur. Un indicateur qui monte n'est pas
// forcément meilleur — pour des réclamations, c'est l'inverse. Elle n'existe que
// s'il y a au moins deux mois ; un mois sans valeur reste un trou (règle 1.1).

import { useTranslation } from 'react-i18next';
import { Line, LineChart, YAxis } from 'recharts';
import type { IndicateurCatalogue, ResultatIndicateur } from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { ChiffreCle } from '../ui/ChiffreCle';
import { Pastille } from '../ui/Pastille';
import { libelleMois } from './temps';

/** La valeur mise en forme — sans l'unité, qui se pose à côté en petit. */
export function texteValeur(valeur: number): string {
  return formaterNombre(valeur, Number.isInteger(valeur) ? 0 : valeur < 10 ? 3 : 1);
}

/** La borne haute d'une fourchette (lot K : detail.valeur_max), ou null pour une valeur simple. */
export function borneHaute(detail: unknown): number | null {
  const v = detail && typeof detail === 'object' ? (detail as Record<string, unknown>).valeur_max : null;
  return typeof v === 'number' ? v : v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
}

/** « 80 – 100 » pour une fourchette, la valeur seule sinon : jamais un point milieu. */
export function texteValeurOuFourchette(valeur: number, detail: unknown): string {
  const max = borneHaute(detail);
  return max === null || max === valeur ? texteValeur(valeur) : `${texteValeur(valeur)} – ${texteValeur(max)}`;
}

/** La source d'une valeur retenue, en toutes lettres : « mesuré » ou « déclaré ». */
export function PastilleSource({ r }: { r: ResultatIndicateur }) {
  const { t } = useTranslation();
  if (r.statut !== 'renseigne' || !r.source) return null;
  return (
    <Pastille ton={r.source === 'mesure' ? 'mesure' : 'declare'} titre={t(`kpi.sources.aide.${r.source}`)}>
      {t(`kpi.sources.court.${r.source}`)}
    </Pastille>
  );
}

/** L'atteinte de l'objectif : un filet et les mots. Absente sans objectif. */
export function AtteinteObjectif({ r }: { r: ResultatIndicateur }) {
  const { t } = useTranslation();
  if (r.statut !== 'renseigne' || r.taux_atteinte == null) return null;
  const pct = Math.round(100 * r.taux_atteinte);
  return (
    <span className="block space-y-1">
      <span className="block h-1.5 overflow-hidden rounded-full bg-ardoise-100" aria-hidden="true">
        <span className="block h-full rounded-full bg-siipi-600" style={{ width: `${pct}%` }} />
      </span>
      <span className="block text-xs text-ardoise-600">{t('kpi.carte.atteinte', { pct: formaterNombre(pct, 0) })}</span>
    </span>
  );
}

/** Premier et dernier mois renseignés de la fenêtre, et l'écart entre eux. */
function tendance(courbe: (number | null)[], mois: string[]): { ecart: number; depuis: string } | null {
  const points = courbe.map((v, i) => ({ v, m: mois[i] })).filter((p): p is { v: number; m: string } => p.v !== null && p.m !== undefined);
  if (points.length < 2) return null;
  return { ecart: points[points.length - 1].v - points[0].v, depuis: points[0].m };
}

export function CarteIndicateur({
  r,
  indicateur,
  courbe,
  mois,
  choisie,
  onChoisir,
}: {
  r: ResultatIndicateur;
  indicateur: IndicateurCatalogue | undefined;
  /** Les douze mois, `null` pour un mois sans valeur ; absent si l'indicateur n'est pas mensuel. */
  courbe: (number | null)[] | null;
  /** Les mois « AAAA-MM » de la courbe, dans le même ordre. */
  mois: string[];
  choisie: boolean;
  onChoisir: () => void;
}) {
  const { t, i18n } = useTranslation();
  const libelle = i18n.language.startsWith('ar') ? r.libelle_ar : r.libelle_fr;
  const renseigne = r.statut === 'renseigne' && r.valeur != null;
  const renseignes = courbe ? courbe.filter((v) => v !== null).length : 0;
  const evolution = renseigne && courbe ? tendance(courbe, mois) : null;
  const unite = r.unite && r.unite.trim() !== '' ? r.unite : null;

  const ecartTexte = (e: number) => {
    const signe = e > 0 ? '+' : '−';
    return `${signe}${formaterNombre(Math.abs(e), 1)}${unite === '%' ? ' pts' : unite ? ` ${unite}` : ''}`;
  };
  const stable = evolution != null && Math.abs(evolution.ecart) < 0.05;

  const bord = !renseigne
    ? 'border-dashed border-ardoise-300 bg-ardoise-50/60'
    : `border-ardoise-200 border-s-4 bg-white ${r.source === 'declare' ? 'border-s-blue-600' : 'border-s-siipi-600'}`;

  return (
    <button
      type="button"
      onClick={onChoisir}
      aria-pressed={choisie}
      className={`group flex h-full w-full flex-col gap-3 rounded-lg border p-4 text-start transition-colors hover:border-siipi-400 ${bord} ${choisie ? 'ring-2 ring-siipi-300' : ''}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className={`text-sm leading-snug ${renseigne ? 'font-medium text-ardoise-800' : 'text-ardoise-600'}`}>{libelle}</span>
        <PastilleSource r={r} />
      </span>

      {renseigne ? (
        <span className="flex flex-wrap items-baseline gap-x-2">
          <ChiffreCle valeur={texteValeurOuFourchette(r.valeur as number, r.detail)} unite={unite} />
          {r.cible != null && <span className="chiffre-cle text-sm text-ardoise-500">/ {formaterNombre(r.cible, 0)}</span>}
        </span>
      ) : (
        <span className="space-y-1">
          <span className="block text-sm text-ardoise-500" title={t(`kpi.statuts.aide.${r.statut}`)}>
            {t(`kpi.statuts.${r.statut}`)}
          </span>
          {r.statut === 'non_renseigne' && (
            <span className="block text-sm font-medium text-siipi-700 underline-offset-2 group-hover:underline">{t('kpi.carte.completer')}</span>
          )}
        </span>
      )}

      <AtteinteObjectif r={r} />

      {renseigne &&
        (courbe && renseignes > 0 ? (
          <span className="mt-auto flex items-center justify-between gap-3 pt-1" dir="ltr">
            <span className="sr-only">{t('kpi.carte.moisRenseignes', { n: renseignes, total: courbe.length })}</span>
            <LineChart width={112} height={28} data={courbe.map((v) => ({ v }))} aria-hidden="true">
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Line type="monotone" dataKey="v" stroke="#97a2b0" strokeWidth={1.5} dot={renseignes === 1} connectNulls={false} isAnimationActive={false} />
            </LineChart>
            {evolution && (
              <span className="flex items-center gap-1 text-xs text-ardoise-600" dir={i18n.dir()}>
                {!stable && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                    <path d={evolution.ecart > 0 ? 'M5 1 9.5 8.5h-9z' : 'M5 9 .5 1.5h9z'} />
                  </svg>
                )}
                {stable
                  ? t('kpi.carte.tendance.stable', { mois: libelleMois(evolution.depuis, i18n.language) })
                  : t('kpi.carte.tendance.evolue', { ecart: ecartTexte(evolution.ecart), mois: libelleMois(evolution.depuis, i18n.language) })}
              </span>
            )}
          </span>
        ) : (
          indicateur &&
          indicateur.granularite !== 'mensuelle' && <span className="mt-auto pt-1 text-xs text-ardoise-500">{t(`kpi.carte.granularite.${indicateur.granularite}`)}</span>
        ))}
    </button>
  );
}
