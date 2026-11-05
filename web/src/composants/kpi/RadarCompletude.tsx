// Le radar de complétude d'une commune (décisions du 4 novembre, § 3.3).
//
// Pour chaque axe, la part des indicateurs RENSEIGNÉS parmi les APPLICABLES —
// un indicateur « sans objet » sort du compte, il ne fait pas baisser son axe.
// Il dit ce que la commune tient, pas ce qu'elle vaut : chaque axe porte son
// compte en mots (« 4 sur 7 »), le rayon n'a pas de graduation chiffrée, et il
// n'y a ni total, ni moyenne, ni comparaison avec une autre commune, ni radar
// national. Le tableau qui le suit dit la même chose, pour qui ne lit pas un
// dessin et pour l'impression.

import { useTranslation } from 'react-i18next';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import type { KpiCommune } from '../../lib/api';

export function RadarCompletude({ completude }: { completude: KpiCommune['completude'] }) {
  const { t } = useTranslation();
  const compte = (c: KpiCommune['completude'][number]) =>
    c.applicables === 0 ? t('kpi.radar.aucunApplicable') : t('kpi.radar.compte', { n: c.renseignes, total: c.applicables });
  const donnees = completude.map((c) => ({
    libelle: `${t('kpi.axe', { n: c.axe })} · ${compte(c)}`,
    part: c.applicables === 0 ? 0 : (100 * c.renseignes) / c.applicables,
  }));

  return (
    <section className="rounded-xl border border-ardoise-200 bg-white p-4" aria-labelledby="radar-completude">
      <h2 id="radar-completude" className="font-semibold text-ardoise-900">{t('kpi.radar.titre')}</h2>
      <p className="mt-1 max-w-prose text-sm text-ardoise-500">{t('kpi.radar.aide')}</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-2 lg:items-center">
        <div className="h-72" dir="ltr" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={donnees} outerRadius="70%">
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="libelle" tick={{ fontSize: 11, fill: '#4b5563' }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="part" stroke="#13784f" fill="#13784f" fillOpacity={0.25} isAnimationActive={false} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <table className="w-full text-sm">
          <caption className="sr-only">{t('kpi.radar.titre')}</caption>
          <thead className="text-xs text-ardoise-500">
            <tr>
              <th scope="col" className="px-2 py-1.5 text-start">{t('kpi.radar.colonnes.axe')}</th>
              <th scope="col" className="px-2 py-1.5 text-start">{t('kpi.radar.colonnes.renseignes')}</th>
            </tr>
          </thead>
          <tbody>
            {completude.map((c) => (
              <tr key={c.axe} className="border-t border-ardoise-100">
                <th scope="row" className="px-2 py-1.5 text-start font-normal text-ardoise-800">
                  {t('kpi.axeNomme', { n: c.axe, nom: t(`kpi.axes.${c.axe}`) })}
                </th>
                <td className="px-2 py-1.5 text-start text-ardoise-700">{compte(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
