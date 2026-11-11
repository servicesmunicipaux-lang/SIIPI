// L'onglet « Registres » de la commune (lot « sources KPI ») : les lieux et
// leurs nettoyages, les pleins de carburant, les fins de poste, les dotations
// EPI, le journal des incidents du travail, les commerces et leurs
// conventions.
//
// Chaque registre tenu fait MESURER par la plateforme un indicateur que la
// fiche d'évaluation faisait déclarer ; tant qu'il ne l'est pas, la
// déclaration reste la source (et l'écran Indicateurs le dit, indicateur par
// indicateur).

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LieuxCommune } from './LieuxCommune';
import { RegistreSimple } from './RegistreSimple';

type Vue = 'lieux' | 'carburant' | 'fins-de-poste' | 'epi' | 'incidents' | 'conventions';
const VUES: Vue[] = ['lieux', 'fins-de-poste', 'carburant', 'epi', 'incidents', 'conventions'];

export function Registres({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const [vue, setVue] = useState<Vue>('lieux');

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ardoise-900">{t('registres.titre')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-ardoise-500">{t('registres.chapeau')}</p>
      </header>
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {VUES.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={vue === v}
            onClick={() => setVue(v)}
            className={`min-h-10 rounded-full px-4 text-sm font-medium ${vue === v ? 'bg-siipi-600 text-white' : 'bg-white text-ardoise-700 ring-1 ring-ardoise-300'}`}
          >
            {t(`registres.vues.${v}`)}
          </button>
        ))}
      </div>

      {vue === 'lieux' && <LieuxCommune communeId={communeId} />}
      {vue === 'fins-de-poste' && (
        <RegistreSimple
          communeId={communeId}
          nom="fins-de-poste"
          colonnes={[{ cle: 'jour', type: 'date' }, { cle: 'registration' }, { cle: 'chauffeur' }, { cle: 'benne_bachee', type: 'ouiNon' }, { cle: 'observation' }]}
        />
      )}
      {vue === 'carburant' && (
        <RegistreSimple
          communeId={communeId}
          nom="carburant"
          colonnes={[{ cle: 'date_plein', type: 'date' }, { cle: 'registration' }, { cle: 'litres', type: 'nombre' }, { cle: 'montant_tnd', type: 'montant' }, { cle: 'kilometrage', type: 'nombre' }]}
        />
      )}
      {vue === 'epi' && (
        <RegistreSimple
          communeId={communeId}
          nom="epi"
          colonnes={[
            { cle: 'nom_complet' },
            { cle: 'type_epi', type: 'choix', prefixe: 'epi.options.typeEpi' },
            { cle: 'date_remise', type: 'date' },
            { cle: 'date_renouvellement', type: 'date' },
            { cle: 'en_cours', type: 'ouiNon' },
          ]}
        />
      )}
      {vue === 'incidents' && (
        <RegistreSimple
          communeId={communeId}
          nom="incidents"
          colonnes={[
            { cle: 'date_incident', type: 'date' },
            { cle: 'type', type: 'choix', prefixe: 'incidents.options.type' },
            { cle: 'gravite', type: 'choix', prefixe: 'incidents.options.gravite' },
            { cle: 'nom_complet' },
            { cle: 'jours_arret', type: 'nombre' },
          ]}
        />
      )}
      {vue === 'conventions' && (
        // Les établissements (G2a) et les conventions (G4a) vivent dans leurs écrans du
        // pôle Pilotage : leur cycle (fermeture, instruction, signature) ne tient pas
        // dans un registre simple.
        <div className="space-y-2">
          <p className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">{t('registres.etablissementsAilleurs')}</p>
          <p className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">{t('registres.conventionsAilleurs')}</p>
        </div>
      )}
    </div>
  );
}
