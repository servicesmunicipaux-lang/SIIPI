// Le PCGD comme donnée (refonte, lot 2a ; SPEC_refonte § 2.3 b).
//
// Jusqu'ici, le plan communal de gestion des déchets n'existait sur la
// plateforme que comme un fichier déposé dans « Rapports et études » : rien ne
// disait s'il était adopté, ni jusqu'à quand il courait. La fiche le dit, et
// pointe vers le rapport plutôt que de le recopier.
//
// UN SEUL FORMULAIRE (SPEC § 2.2) : c'est celui-ci qu'ouvrent l'écran « Mes
// références », le catalogue « + Ajouter » (lot 2b) et le panneau « ce qui
// manque » d'un indicateur (lot 3). Un champ ajouté ici l'est partout.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type RapportEtude } from '../../lib/api';

const STATUTS = ['en_preparation', 'adopte', 'en_revision'] as const;
type StatutPcgd = (typeof STATUTS)[number];

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';

export function FormulairePcgd({
  communeId,
  onFait,
  onAnnuler,
}: {
  communeId: string;
  onFait: () => void | Promise<void>;
  onAnnuler: () => void;
}) {
  const { t } = useTranslation();
  const [statut, setStatut] = useState<StatutPcgd>('en_preparation');
  const [anneeAdoption, setAnneeAdoption] = useState('');
  const [horizon, setHorizon] = useState('');
  const [bureauEtudes, setBureauEtudes] = useState('');
  const [rapportId, setRapportId] = useState('');
  const [observation, setObservation] = useState('');
  const [rapports, setRapports] = useState<RapportEtude[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    // Le document lié se choisit parmi les rapports déjà déposés : le PCGD ne
    // garde pas une seconde copie du fichier, il pointe vers celui de la commune.
    void api.rapportsEtudes(communeId).then(setRapports).catch(() => setRapports([]));
  }, [communeId]);

  // Les mêmes règles que la base, dites avant l'envoi : un PCGD adopté l'a été
  // une année, et un horizon ne précède pas l'adoption.
  const manqueAnnee = statut === 'adopte' && anneeAdoption === '';
  const horizonAvant = horizon !== '' && anneeAdoption !== '' && Number(horizon) < Number(anneeAdoption);

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      await api.enregistrerPcgd(communeId, {
        statut,
        anneeAdoption: anneeAdoption ? Number(anneeAdoption) : null,
        horizon: horizon ? Number(horizon) : null,
        bureauEtudes: bureauEtudes || null,
        rapportId: rapportId || null,
        observation: observation || null,
      });
      await onFait();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-siipi-200 bg-siipi-50/40 p-4" aria-labelledby="ajout-pcgd-titre">
      <div>
        <h2 id="ajout-pcgd-titre" className="text-base font-semibold text-ardoise-900">{t('ajout.pcgd.titre')}</h2>
        <p className="mt-1 text-sm text-ardoise-600">{t('ajout.pcgd.aide')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm" htmlFor="pcgd-statut">
          {t('ajout.pcgd.statut')}
          <select id="pcgd-statut" value={statut} onChange={(e) => setStatut(e.target.value as StatutPcgd)} className={champ}>
            {STATUTS.map((s) => (
              <option key={s} value={s}>{t(`ajout.pcgd.statuts.${s}`)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm" htmlFor="pcgd-bureau">
          {t('ajout.pcgd.bureauEtudes')}
          <input id="pcgd-bureau" value={bureauEtudes} onChange={(e) => setBureauEtudes(e.target.value)} maxLength={200} className={champ} />
        </label>
        <label className="text-sm" htmlFor="pcgd-adoption">
          {t('ajout.pcgd.anneeAdoption')}
          <input
            id="pcgd-adoption"
            type="number"
            inputMode="numeric"
            min={2000}
            max={2100}
            value={anneeAdoption}
            onChange={(e) => setAnneeAdoption(e.target.value)}
            aria-invalid={manqueAnnee}
            className={champ}
          />
          {manqueAnnee && <span className="mt-1 block text-xs text-amber-800">{t('ajout.pcgd.manqueAnnee')}</span>}
        </label>
        <label className="text-sm" htmlFor="pcgd-horizon">
          {t('ajout.pcgd.horizon')}
          <input
            id="pcgd-horizon"
            type="number"
            inputMode="numeric"
            min={2000}
            max={2100}
            value={horizon}
            onChange={(e) => setHorizon(e.target.value)}
            aria-invalid={horizonAvant}
            className={champ}
          />
          {horizonAvant && <span className="mt-1 block text-xs text-amber-800">{t('ajout.pcgd.horizonAvant')}</span>}
        </label>
        <label className="text-sm sm:col-span-2" htmlFor="pcgd-rapport">
          {t('ajout.pcgd.rapport')}
          <select id="pcgd-rapport" value={rapportId} onChange={(e) => setRapportId(e.target.value)} className={champ}>
            <option value="">{t('ajout.pcgd.aucunRapport')}</option>
            {rapports.map((r) => (
              <option key={r.id} value={r.id}>{r.titre}</option>
            ))}
          </select>
          {rapports.length === 0 && <span className="mt-1 block text-xs text-ardoise-500">{t('ajout.pcgd.rapportAide')}</span>}
        </label>
        <label className="text-sm sm:col-span-2" htmlFor="pcgd-observation">
          {t('ajout.observation')}
          <textarea
            id="pcgd-observation"
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            rows={2}
            maxLength={2000}
            className="mt-1 w-full rounded-lg border border-ardoise-300 bg-white px-3 py-2 text-base"
          />
        </label>
      </div>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void enregistrer()}
          disabled={envoi || manqueAnnee || horizonAvant}
          className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40"
        >
          {t('ajout.enregistrer')}
        </button>
        <button type="button" onClick={onAnnuler} className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-4 text-sm text-ardoise-700">
          {t('commun.annuler')}
        </button>
      </div>
    </section>
  );
}
