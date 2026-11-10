// Le détail de M2-2 (migration 100, décision du 10 novembre 2026) : combien
// d'établissements sont sous convention, sur combien sont visés, et combien
// d'entre eux sont « à vérifier ».
//
// « À vérifier » porte sur l'identité d'un établissement (un doublon probable),
// pas sur sa convention : il reste compté. Le compter sans le dire réconcilierait
// l'écart en silence (règle 1.5) ; l'écran le montre, à côté du taux, sur la carte
// comme dans le panneau.

import { useTranslation } from 'react-i18next';
import type { ResultatIndicateur } from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { Pastille } from '../ui/Pastille';

/** Les trois nombres du détail de M2-2, ou null pour tout autre indicateur ou un détail absent. */
export function detailConventions(r: ResultatIndicateur): { cible: number; sous: number; aVerifier: number } | null {
  if (r.code !== 'M2-2' || r.statut !== 'renseigne' || r.source !== 'mesure') return null;
  const d = (r.detail ?? {}) as Record<string, unknown>;
  const [cible, sous, aVerifier] = [d.cible, d.sous_convention, d.dont_a_verifier].map((v) => (v == null || v === '' ? NaN : Number(v)));
  return [cible, sous, aVerifier].every(Number.isFinite) ? { cible, sous, aVerifier } : null;
}

export function DetailConventions({ r, compact = false }: { r: ResultatIndicateur; compact?: boolean }) {
  const { t } = useTranslation();
  const d = detailConventions(r);
  if (!d) return null;
  // Sur la carte, seul l'écart se montre : le taux dit déjà le reste.
  if (compact) {
    return d.aVerifier > 0 ? (
      <span className="block">
        <Pastille ton="attention">{t('kpi.conventions.dontAVerifierCourt', { m: formaterNombre(d.aVerifier, 0) })}</Pastille>
      </span>
    ) : null;
  }
  return (
    <section className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-4" aria-labelledby={`conventions-${r.code}`}>
      <h3 id={`conventions-${r.code}`} className="text-base font-semibold text-ardoise-900">{t('kpi.conventions.titre')}</h3>
      <p className="text-sm text-ardoise-800">
        {t('kpi.conventions.sousConvention', { n: formaterNombre(d.sous, 0), cible: formaterNombre(d.cible, 0) })}
        {d.aVerifier > 0 ? t('kpi.conventions.dontAVerifier', { m: formaterNombre(d.aVerifier, 0) }) : t('kpi.conventions.fin')}
      </p>
      {d.aVerifier > 0 && <p className="text-sm text-ardoise-600">{t('kpi.conventions.aide')}</p>}
    </section>
  );
}
