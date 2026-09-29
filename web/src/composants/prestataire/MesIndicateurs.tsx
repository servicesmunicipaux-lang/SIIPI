// Le tableau de bord restreint du prestataire (B7.4, Jalon 8) : ses propres
// indicateurs de service sur l'année, commune par commune — rien des
// indicateurs de la commune au-delà.
//
// Un taux sans contrôle terrain n'est pas un taux : il s'affiche « — ».

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { formaterNombre } from '../../i18n';

const pct = (v: number | null | undefined) => (v == null ? '—' : `${formaterNombre(100 * v, 0)} %`);

export function MesIndicateurs() {
  const { t } = useTranslation();
  const [lignes, setLignes] = useState<any[] | null>(null);
  const annee = new Date().getFullYear();

  useEffect(() => {
    void api
      .kpiPrestataire(annee)
      .then((r) => setLignes(r.lignes))
      // Utile, pas indispensable : son échec n'empêche pas de lire le dossier.
      .catch(() => setLignes([]));
  }, [annee]);

  if (!lignes || lignes.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-ardoise-900">{t('prestataire.indicateurs.titre', { annee })}</h2>
      <p className="text-xs text-ardoise-500">{t('prestataire.indicateurs.aide')}</p>
      <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="border-b border-ardoise-200 bg-ardoise-50 text-xs uppercase text-ardoise-500">
            <tr>
              <th className="px-3 py-2 text-start">{t('prestataire.indicateurs.commune')}</th>
              <th className="px-3 py-2 text-end">{t('prestataire.indicateurs.realisation')}</th>
              <th className="px-3 py-2 text-end">{t('prestataire.indicateurs.couverture')}</th>
              <th className="px-3 py-2 text-end">{t('prestataire.indicateurs.reclamations')}</th>
              <th className="px-3 py-2 text-end">{t('prestataire.indicateurs.delai')}</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={`${l.commune_id}`} className="border-b border-ardoise-100 last:border-0">
                <td className="px-3 py-2">{l.commune_id}</td>
                <td className="chiffres px-3 py-2 text-end">{pct(l.taux_realisation)}</td>
                <td className="chiffres px-3 py-2 text-end">{pct(l.taux_couverture)}</td>
                <td className="chiffres px-3 py-2 text-end">
                  {l.reclamations_transferees ? `${l.reclamations_traitees} / ${l.reclamations_transferees}` : '—'}
                </td>
                <td className="chiffres px-3 py-2 text-end">
                  {l.delai_moyen_heures == null ? '—' : `${formaterNombre(l.delai_moyen_heures, 0)} h`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
