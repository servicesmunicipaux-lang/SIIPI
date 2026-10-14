// Le résultat d'un bilan WaPla (lot W3 ; SPEC § 6, point 2) : le diagramme des
// flux, puis les mêmes chiffres en tableaux — flux, GES par procédé, uPOPs par
// procédé et par milieu, coûts.
//
// UNE ESTIMATION, PAS UNE MESURE. Le total de GES est un POTENTIEL ENGAGÉ : tout
// le méthane qu'émettra, sur des décennies, la tonne déposée cette année. Il
// sert à comparer des scénarios ; comparé à un inventaire national, il serait
// faux. L'écran le dit à côté du chiffre (SPEC § 4.1).
//
// Le diagramme se lit de gauche à droite, en arabe aussi : comme une courbe, il
// suit le sens de la matière, pas celui du texte.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sankey, Tooltip } from 'recharts';
import { formaterNombre } from '../../i18n';
import { FLUX, HORS_DIAGRAMME, LIGNES_GES, UPOPS } from './presentation';

type Resultat = {
  flux: Record<string, number | null>;
  ges: Record<string, number | null>;
  upops: Record<string, number>;
  couts: { procedes: Record<string, { total: number | null }>; total: number | null };
};

const nombre = (v: number | null | undefined, decimales = 1) =>
  v == null ? null : formaterNombre(v, Math.abs(v) < 10 && v !== 0 ? 3 : decimales);

/** En deçà, le diagramme défile dans son cadre plutôt que de s'écraser. */
const LARGEUR_MIN = 640;

/**
 * La largeur du bloc, suivie : le Sankey de Recharts 3 ne prend pas sa taille
 * d'un ResponsiveContainer (il ne dessine rien sans largeur ni hauteur à lui).
 */
function useLargeur() {
  const ref = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observateur = new ResizeObserver(([e]) => setLargeur(Math.floor(e.contentRect.width)));
    observateur.observe(el);
    return () => observateur.disconnect();
  }, []);
  return [ref, largeur] as const;
}

/**
 * Un procédé du diagramme : sa barre, son nom et le tonnage qui le traverse.
 * Le nom se pose à droite de la barre, sauf en dernière colonne, où il passe
 * à gauche pour ne pas sortir du cadre.
 */
function NoeudSankey(props: {
  x?: number; y?: number; width?: number; height?: number;
  payload?: { name?: string; value?: number };
  largeurTotale: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload, largeurTotale } = props;
  const aDroite = x + width + 160 < largeurTotale;
  return (
    <g>
      <rect x={x} y={y} width={width} height={Math.max(height, 1)} fill="#13784f" />
      {/* Deux lignes, et un liseré blanc : le nom reste lisible par-dessus les flux. */}
      <text
        x={aDroite ? x + width + 5 : x - 5}
        y={y + height / 2 - 7}
        textAnchor={aDroite ? 'start' : 'end'}
        fontSize={11}
        fill="#1f2937"
        stroke="#ffffff"
        strokeWidth={3}
        paintOrder="stroke"
      >
        <tspan>{payload?.name}</tspan>
        <tspan x={aDroite ? x + width + 5 : x - 5} dy={13} fill="#4b5563">
          {formaterNombre(payload?.value ?? 0, 0)} t
        </tspan>
      </text>
    </g>
  );
}

export function ResultatWapla({ resultat }: { resultat: Resultat }) {
  const { t } = useTranslation();
  const [cadre, largeur] = useLargeur();

  // Les nœuds du diagramme : les procédés que touche au moins un flux non nul.
  const liens = Object.entries(resultat.flux).filter(([code, v]) => v != null && v > 0 && !HORS_DIAGRAMME.has(code) && FLUX[code]);
  const procedes = [...new Set(liens.flatMap(([code]) => FLUX[code]))].sort((a, b) => a - b);
  const indice = new Map(procedes.map((p, i) => [p, i]));
  const donnees = {
    nodes: procedes.map((p) => ({ name: t(`wapla.procedes.${p}`) })),
    links: liens.map(([code, v]) => ({ source: indice.get(FLUX[code][0]) as number, target: indice.get(FLUX[code][1]) as number, value: v as number, code })),
  };
  const procedesUpops = [...new Set(UPOPS.map((u) => u.procede))];
  const milieux = ['air', 'eau', 'sol', 'produit', 'residus'];

  return (
    <div className="space-y-6">
      <section className="space-y-2" aria-labelledby="wapla-diagramme">
        <h3 id="wapla-diagramme" className="font-semibold text-ardoise-900">{t('wapla.resultat.diagramme')}</h3>
        {/* Sur téléphone, six colonnes ne tiennent pas dans 340 px : le diagramme
            garde 640 px et défile dans son cadre, la page ne déborde pas. */}
        <div ref={cadre} className="h-[28rem] w-full overflow-x-auto rounded-xl border border-ardoise-200 bg-white p-2" dir="ltr">
          {donnees.links.length ? (
            largeur > 0 && (
              <Sankey
                width={Math.max(largeur, LARGEUR_MIN) - 16}
                height={430}
                data={donnees}
                nodePadding={24}
                margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                link={{ stroke: '#93c5aa' }}
                node={<NoeudSankey largeurTotale={Math.max(largeur, LARGEUR_MIN) - 16} />}
              >
                <Tooltip formatter={(v) => `${formaterNombre(Number(v), 1)} t/an`} />
              </Sankey>
            )
          ) : (
            <p className="p-4 text-sm text-ardoise-500">{t('wapla.resultat.aucunFlux')}</p>
          )}
        </div>
        <p className="text-xs text-ardoise-500">{t('wapla.resultat.horsDiagramme')}</p>
      </section>

      <section className="space-y-2" aria-labelledby="wapla-ges">
        <h3 id="wapla-ges" className="font-semibold text-ardoise-900">{t('wapla.resultat.ges')}</h3>
        <table className="w-full max-w-xl text-sm">
          <tbody>
            {LIGNES_GES.map((l) => (
              <tr key={l} className="border-t border-ardoise-100">
                <td className="px-2 py-1">{t(`wapla.lignesGes.${l}`)}</td>
                <td className="chiffres px-2 py-1 text-end">{nombre(resultat.ges[l])}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-ardoise-300 font-semibold">
              <td className="px-2 py-1">{t('wapla.resultat.totalGes')}</td>
              <td className="chiffres px-2 py-1 text-end">{nombre(resultat.ges.total)}</td>
            </tr>
          </tbody>
        </table>
        <p className="max-w-3xl rounded-lg bg-amber-50 p-2 text-xs text-amber-950">{t('wapla.resultat.potentielEngage')}</p>
      </section>

      <section className="space-y-2" aria-labelledby="wapla-upops">
        <h3 id="wapla-upops" className="font-semibold text-ardoise-900">{t('wapla.resultat.upops')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="text-xs text-ardoise-500">
              <tr>
                <th className="px-2 py-1 text-start">{t('wapla.resultat.procede')}</th>
                {milieux.map((m) => (
                  <th key={m} className="px-2 py-1 text-end">{t(`wapla.milieux.${m}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {procedesUpops.map((p) => (
                <tr key={p} className="border-t border-ardoise-100">
                  <td className="px-2 py-1">{t(`wapla.lignesGes.${p}`)}</td>
                  {milieux.map((m) => {
                    const u = UPOPS.find((x) => x.procede === p && x.milieu === m);
                    return <td key={m} className="chiffres px-2 py-1 text-end">{u ? nombre(resultat.upops[u.cle], 2) : ''}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="max-w-3xl text-xs text-ardoise-500">{t('wapla.resultat.upopsNote')}</p>
      </section>

      <section className="space-y-2" aria-labelledby="wapla-couts">
        <h3 id="wapla-couts" className="font-semibold text-ardoise-900">{t('wapla.resultat.couts')}</h3>
        <table className="w-full max-w-xl text-sm">
          <tbody>
            {Object.entries(resultat.couts.procedes).map(([p, c]) => (
              <tr key={p} className="border-t border-ardoise-100">
                <td className="px-2 py-1">{t(`wapla.lignesGes.${p}`)}</td>
                <td className="chiffres px-2 py-1 text-end">
                  {c.total == null ? <span className="text-ardoise-500">{t('kpi.statuts.non_renseigne')}</span> : nombre(c.total, 0)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-ardoise-300 font-semibold">
              <td className="px-2 py-1">{t('wapla.resultat.totalCouts')}</td>
              <td className="chiffres px-2 py-1 text-end">
                {resultat.couts.total == null ? <span className="font-normal text-ardoise-500">{t('kpi.statuts.non_renseigne')}</span> : nombre(resultat.couts.total, 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <details className="rounded-xl border border-ardoise-200 bg-white p-3 text-sm">
        <summary className="cursor-pointer font-medium text-ardoise-800">{t('wapla.resultat.tableauFlux')}</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="text-xs text-ardoise-500">
              <tr>
                <th className="px-2 py-1 text-start">{t('wapla.resultat.flux')}</th>
                <th className="px-2 py-1 text-start">{t('wapla.resultat.deVers')}</th>
                <th className="px-2 py-1 text-end">t/an</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(resultat.flux)
                .filter(([, v]) => v != null)
                .map(([code, v]) => (
                  <tr key={code} className="border-t border-ardoise-100">
                    <td className="px-2 py-1 font-mono text-xs">{code}</td>
                    <td className="px-2 py-1">
                      {FLUX[code]
                        ? t('wapla.resultat.trajet', { de: t(`wapla.procedes.${FLUX[code][0]}`), vers: t(`wapla.procedes.${FLUX[code][1]}`) })
                        : ''}
                    </td>
                    <td className="chiffres px-2 py-1 text-end">{nombre(v)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
