// Espace du prestataire privé.
//
// Conçu pour le téléphone, comme l'espace citoyen : la déclaration se fait
// depuis le camion, pas au bureau — c'est même toute la différence entre une
// preuve et un souvenir.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MaTournee } from '../composants/prestataire/MaTournee';
import { Incidents } from '../composants/prestataire/Incidents';
import { MonDossier } from '../composants/prestataire/MonDossier';

type Onglet = 'tournee' | 'incidents' | 'dossier';

const ONGLETS: Array<{ cle: Onglet; icone: string }> = [
  { cle: 'tournee', icone: '🚛' },
  { cle: 'incidents', icone: '⚠️' },
  { cle: 'dossier', icone: '📋' },
];

export function EspacePrestataire() {
  const { t } = useTranslation();
  const [onglet, setOnglet] = useState<Onglet>('tournee');

  return (
    <div className="mx-auto max-w-2xl px-4 pt-4 pb-24">
      {onglet === 'tournee' && <MaTournee />}
      {onglet === 'incidents' && <Incidents />}
      {onglet === 'dossier' && <MonDossier />}

      <nav
        className="fixed inset-x-0 bottom-0 z-[500] border-t border-ardoise-200 bg-white/95 backdrop-blur"
        aria-label={t('prestataire.navigation')}
      >
        <div className="mx-auto grid max-w-2xl grid-cols-3">
          {ONGLETS.map(({ cle, icone }) => (
            <button
              key={cle}
              type="button"
              onClick={() => setOnglet(cle)}
              aria-current={onglet === cle ? 'page' : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                onglet === cle ? 'text-siipi-700' : 'text-ardoise-500'
              }`}
            >
              <span aria-hidden className="text-xl leading-none">
                {icone}
              </span>
              {t(`prestataire.onglets.${cle}`)}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
