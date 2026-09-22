// Signalement d'incident par le prestataire.
//
// C'est le canal qui manquait. Sans lui, un passage empêché par des travaux ou
// une décharge fermée est compté comme un manquement du prestataire — et
// celui-ci retourne à WhatsApp pour se défendre, hors de toute trace.
//
// L'écran affiche aussi la réponse de la commune, parce qu'un signalement sans
// accusé de réception ne se fait qu'une fois.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Circuit, type IncidentPrestataire } from '../../lib/api';
import { Chargement, Erreur } from '../Elements';

const TYPES = [
  'acces_bloque',
  'point_sature',
  'panne_vehicule',
  'dechets_non_conformes',
  'decharge_fermee',
  'autre',
] as const;

const STYLE_STATUT: Record<string, string> = {
  ouvert: 'bg-amber-100 text-amber-900',
  pris_en_compte: 'bg-sky-100 text-sky-900',
  clos: 'bg-siipi-100 text-siipi-800',
};

export function Incidents() {
  const { t } = useTranslation();
  const [incidents, setIncidents] = useState<IncidentPrestataire[] | null>(null);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<(typeof TYPES)[number]>('acces_bloque');
  const [circuitId, setCircuitId] = useState('');
  const [description, setDescription] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const charger = async () => {
    try {
      const [i, c] = await Promise.all([api.mesIncidents(), api.mesCircuits()]);
      setIncidents(i);
      setCircuits(c);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (erreur) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!incidents) return <Chargement />;

  const envoyer = async (evt: React.FormEvent) => {
    evt.preventDefault();
    const circuit = circuits.find((c) => c.id === circuitId);
    // La commune concernée se déduit du circuit : la demander séparément
    // ouvrirait la porte à un incident déclaré sur le territoire d'une autre.
    if (!circuit) return;
    setEnvoi(true);
    try {
      await api.signalerIncident({
        communeId: circuit.commune_id,
        circuitId: circuit.id,
        type,
        description: description || undefined,
      });
      setDescription('');
      setOuvert(false);
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ardoise-900">
            {t('prestataire.incidents.titre')}
          </h1>
          <p className="mt-1 text-sm text-ardoise-500">{t('prestataire.incidents.sousTitre')}</p>
        </div>
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-semibold text-white"
        >
          {t('prestataire.incidents.signaler')}
        </button>
      </header>

      {ouvert && (
        <form
          onSubmit={envoyer}
          className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4"
        >
          <label className="block">
            <span className="text-sm font-medium text-ardoise-700">
              {t('prestataire.incidents.circuit')}
            </span>
            <select
              required
              value={circuitId}
              onChange={(e) => setCircuitId(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base"
            >
              <option value="">{t('prestataire.incidents.choisirCircuit')}</option>
              {circuits.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend className="text-sm font-medium text-ardoise-700">
              {t('prestataire.incidents.type')}
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {TYPES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setType(v)}
                  className={`min-h-12 rounded-lg border px-3 text-sm font-medium ${
                    type === v
                      ? 'border-siipi-500 bg-siipi-50 text-siipi-800'
                      : 'border-ardoise-300 bg-white text-ardoise-700'
                  }`}
                >
                  {t(`communal.typesIncident.${v}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-sm font-medium text-ardoise-700">
              {t('prestataire.incidents.description')}
            </span>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ardoise-300 px-3 py-2.5 text-base"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOuvert(false)}
              className="min-h-11 flex-1 rounded-lg border border-ardoise-300 bg-white px-4 font-medium text-ardoise-700"
            >
              {t('citoyen.annuler')}
            </button>
            <button
              type="submit"
              disabled={envoi || !circuitId}
              className="min-h-11 flex-1 rounded-lg bg-siipi-600 px-4 font-semibold text-white disabled:opacity-50"
            >
              {t('prestataire.incidents.envoyer')}
            </button>
          </div>
        </form>
      )}

      {incidents.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">
          {t('prestataire.incidents.aucun')}
        </p>
      ) : (
        <ul className="space-y-2">
          {incidents.map((i) => (
            <li key={i.id} className="rounded-xl border border-ardoise-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-ardoise-900">
                  {t(`communal.typesIncident.${i.type}`, { defaultValue: i.type })}
                  {i.circuit_nom ? ` — ${i.circuit_nom}` : ''}
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    STYLE_STATUT[i.statut] ?? ''
                  }`}
                >
                  {t(`prestataire.statutsIncident.${i.statut}`)}
                </span>
              </div>
              <p className="chiffres mt-0.5 text-xs text-ardoise-500">{i.date_incident}</p>
              {i.description && <p className="mt-1 text-sm text-ardoise-600">{i.description}</p>}
              {/* La réponse de la commune : c'est elle qui fait revenir le
                  prestataire déclarer le prochain incident. */}
              {i.reponse_commune && (
                <p className="mt-2 rounded-lg bg-sky-50 p-2.5 text-sm text-sky-900">
                  {i.reponse_commune}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
