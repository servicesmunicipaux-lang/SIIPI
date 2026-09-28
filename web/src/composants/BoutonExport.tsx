// Le bouton d'export commun aux cinq écrans qui en demandent (Jalon 4).
//
// Il ne reçoit que le chemin de la liste affichée, filtres compris : le
// fichier est la même réponse que l'écran, sous une autre forme. Excel en
// premier — c'est lui qui garde les nombres et les dates typés quelle que
// soit la langue du tableur ; le CSV reste là pour les autres outils.

import { useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { ErreurApi, telechargerExport } from '../lib/api';
import { imprimer, type OptionsImpression } from '../lib/impression';

export function BoutonExport({
  chemin,
  desactive,
  impression,
}: {
  chemin: string;
  desactive?: boolean;
  /** Le bloc à imprimer, pour proposer aussi le PDF (impression du navigateur). */
  impression?: OptionsImpression & { cible: RefObject<HTMLElement | null> };
}) {
  const { t, i18n } = useTranslation();
  const [enCours, setEnCours] = useState<'csv' | 'xlsx' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const exporter = async (format: 'csv' | 'xlsx') => {
    setEnCours(format);
    setErreur(null);
    try {
      await telechargerExport(chemin, format, i18n.language);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(null);
    }
  };

  const bouton =
    'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 disabled:opacity-40';

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" role="group" aria-label={t('export.titre')}>
      <span className="text-xs text-ardoise-500">{t('export.titre')}</span>
      <button type="button" onClick={() => void exporter('xlsx')} disabled={desactive || enCours !== null} className={bouton}>
        {enCours === 'xlsx' ? t('export.enCours') : t('export.excel')}
      </button>
      <button type="button" onClick={() => void exporter('csv')} disabled={desactive || enCours !== null} className={bouton}>
        {enCours === 'csv' ? t('export.enCours') : t('export.csv')}
      </button>
      {impression && (
        <button
          type="button"
          onClick={() => impression.cible.current && imprimer(impression.cible.current, impression)}
          disabled={desactive || enCours !== null}
          title={t('export.pdfAide')}
          className={bouton}
        >
          {t('export.pdf')}
        </button>
      )}
      {erreur && (
        <span role="alert" className="text-xs text-red-700">
          {erreur}
        </span>
      )}
    </span>
  );
}
