// Les levées, côté prestataire (jalon G, lot G5a) : la feuille du jour de ses
// circuits, où il coche ce qu'il a levé.
//
// SES COCHES SONT DES PROPOSITIONS : la commune les valide ou les écarte. L'écran
// le dit avant la première coche, pour qu'une levée « proposée » ne soit pas lue
// comme acquise.
//
// LE JOUR EST CELUI DE TUNIS, pas celui du téléphone : un appareil resté à l'heure
// d'un autre pays proposerait sinon, passé minuit, la feuille du lendemain — que la
// base refuserait comme une date future.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Circuit } from '../../lib/api';
import { Chargement, Erreur } from '../Elements';
import { aujourdhui } from '../ajout/FormulaireEtablissement';
import { FeuilleDuJour } from '../levees/FeuilleDuJour';

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';

export function MesLevees() {
  const { t } = useTranslation();
  const [circuits, setCircuits] = useState<Circuit[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);
  const [circuitId, setCircuitId] = useState('');
  const [date, setDate] = useState(aujourdhui());

  useEffect(() => {
    setErreur(null);
    api
      .mesCircuits()
      .then((c) => {
        const actifs = c.filter((x) => x.actif);
        setCircuits(actifs);
        if (actifs.length === 1) setCircuitId(actifs[0].id);
      })
      .catch((err) => setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur')));
  }, [essai, t]);

  if (erreur) return <Erreur message={erreur} onReessayer={() => setEssai((n) => n + 1)} />;
  if (!circuits) return <Chargement />;

  const jourValable = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= aujourdhui();
  // Un prestataire peut servir plusieurs communes : le nom de la commune départage deux circuits homonymes.
  const plusieursCommunes = new Set(circuits.map((c) => c.commune_id)).size > 1;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ardoise-900">{t('prestataire.levees.titre')}</h1>
        <p className="mt-1 text-sm text-ardoise-600">{t('prestataire.levees.chapeau')}</p>
      </div>
      {circuits.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ardoise-300 bg-white p-4 text-sm text-ardoise-600">{t('prestataire.levees.aucunCircuit')}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              {t('prestataire.levees.circuit')}
              <select value={circuitId} onChange={(e) => setCircuitId(e.target.value)} className={champ}>
                <option value="">{t('ajout.etablissement.choisir')}</option>
                {circuits.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code ? `${c.code} — ${c.nom}` : c.nom}
                    {plusieursCommunes ? ` (${c.commune_nom})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t('prestataire.levees.date')}
              <input type="date" value={date} max={aujourdhui()} onChange={(e) => setDate(e.target.value)} className={champ} />
            </label>
          </div>
          {!jourValable && <p className="text-sm text-amber-900">{t('communal.levees.jourFutur')}</p>}
          {circuitId && jourValable && <FeuilleDuJour circuitId={circuitId} date={date} mode="prestataire" />}
        </>
      )}
    </div>
  );
}
