// Aiguilleur du module « circuits » : liste, création, fiche détaillée.
//
// Le formulaire de création reste volontairement court — un nom, des jours, un
// exécutant, une date de début. Tout le reste se règle dans la fiche, une fois
// le circuit créé. Un formulaire de création qui demande quinze champs fait
// abandonner avant le premier enregistrement.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Circuit } from '../../lib/api';
import { Erreur } from '../Elements';
import { CircuitsListe } from './CircuitsListe';
import { CircuitDetail } from './CircuitDetail';

const JOURS = [1, 2, 3, 4, 5, 6, 7];

export function Circuits({ communeId }: { communeId: string }) {
  const [ouvert, setOuvert] = useState<Circuit | null>(null);
  const [creation, setCreation] = useState(false);
  const [rechargement, setRechargement] = useState(0);

  if (ouvert) {
    return (
      <CircuitDetail
        circuit={ouvert}
        communeId={communeId}
        onFerme={() => {
          setOuvert(null);
          setRechargement((n) => n + 1);
        }}
        onModifie={() => setRechargement((n) => n + 1)}
      />
    );
  }

  if (creation) {
    return (
      <FormulaireCreation
        communeId={communeId}
        onAnnule={() => setCreation(false)}
        onCree={(c) => {
          setCreation(false);
          setRechargement((n) => n + 1);
          // On ouvre directement la fiche : c'est là que se règlent les points
          // de collecte et l'import, qui sont l'étape suivante évidente.
          setOuvert(c);
        }}
      />
    );
  }

  return (
    <CircuitsListe
      communeId={communeId}
      rechargement={rechargement}
      onOuvrir={setOuvert}
      onAjouter={() => setCreation(true)}
    />
  );
}

function FormulaireCreation({
  communeId,
  onAnnule,
  onCree,
}: {
  communeId: string;
  onAnnule: () => void;
  onCree: (c: Circuit) => void;
}) {
  const { t } = useTranslation();
  const [nom, setNom] = useState('');
  const [jours, setJours] = useState<number[]>([]);
  const [typeDechet, setTypeDechet] = useState('menager');
  const [modeCollecte, setModeCollecte] = useState<'porte_a_porte' | 'conteneurs' | 'mixte'>('porte_a_porte');
  const [voyagesParJour, setVoyagesParJour] = useState(1);
  const [prestataireId, setPrestataireId] = useState('');
  const [prestataires, setPrestataires] = useState<{ id: string; full_name: string }[]>([]);
  const [dateDebut, setDateDebut] = useState(() => new Date().toISOString().slice(0, 10));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useState(() => {
    void api.prestataires(communeId).then(setPrestataires).catch(() => undefined);
    return undefined;
  });

  const basculerJour = (j: number) =>
    setJours((l) => (l.includes(j) ? l.filter((x) => x !== j) : [...l, j].sort()));

  const creer = async (evt: React.FormEvent) => {
    evt.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      const cree = await api.creerCircuit({
        communeId,
        nom,
        joursPassage: jours,
        typeDechet,
        dateDebut,
        modeCollecte,
        voyagesParJour,
        prestataireId: prestataireId || null,
      });
      onCree(cree);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
  const etiquette = 'text-sm font-medium text-ardoise-700';

  return (
    <form onSubmit={creer} className="space-y-4">
      <div>
        <button type="button" onClick={onAnnule} className="text-sm font-medium text-siipi-700 hover:underline">
          ← {t('communal.circuits.retourListe')}
        </button>
        <h1 className="mt-1 text-xl font-semibold text-ardoise-900">{t('communal.circuits.ajouter')}</h1>
      </div>

      {erreur && <Erreur message={erreur} />}

      <div className="space-y-4 rounded-xl border border-ardoise-200 bg-white p-4">
        <label className="block">
          <span className={etiquette}>{t('communal.circuits.nom')}</span>
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder={t('communal.circuits.nomExemple')}
            className={champ}
            required
            minLength={2}
          />
        </label>

        <div>
          <span className={etiquette}>{t('communal.circuits.jours')}</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {JOURS.map((j) => (
              <button
                key={j}
                type="button"
                onClick={() => basculerJour(j)}
                className={`min-h-11 min-w-11 rounded-lg px-3 text-sm font-semibold ${
                  jours.includes(j)
                    ? 'bg-siipi-600 text-white'
                    : 'border border-ardoise-300 bg-white text-ardoise-600'
                }`}
              >
                {t(`citoyen.joursCourts.${j}`)}
              </button>
            ))}
          </div>
          {jours.length === 0 && (
            <p className="mt-1 text-xs text-ardoise-500">{t('communal.circuits.joursObligatoires')}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={etiquette}>{t('communal.circuits.typeDechet')}</span>
            <select value={typeDechet} onChange={(e) => setTypeDechet(e.target.value)} className={champ}>
              {['menager', 'tri', 'vert', 'encombrant', 'balayage'].map((v) => (
                <option key={v} value={v}>
                  {t(`citoyen.dechets.${v}`, { defaultValue: v })}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={etiquette}>{t('communal.circuits.modeCollecte')}</span>
            <select
              value={modeCollecte}
              onChange={(e) => setModeCollecte(e.target.value as typeof modeCollecte)}
              className={champ}
            >
              {(['porte_a_porte', 'conteneurs', 'mixte'] as const).map((m) => (
                <option key={m} value={m}>{t(`communal.circuits.modes.${m}`)}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={etiquette}>{t('communal.circuits.execute')}</span>
            <select value={prestataireId} onChange={(e) => setPrestataireId(e.target.value)} className={champ}>
              <option value="">{t('communal.circuits.regie')}</option>
              {prestataires.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
            {prestataires.length === 0 && (
              <span className="mt-1 block text-xs text-ardoise-500">
                {t('communal.circuits.aucunPrestataire')}
              </span>
            )}
          </label>

          <label className="block">
            <span className={etiquette}>{t('communal.circuits.voyages')}</span>
            <input
              type="number"
              min={1}
              max={6}
              value={voyagesParJour}
              onChange={(e) => setVoyagesParJour(Number(e.target.value))}
              className={champ}
            />
            <span className="mt-1 block text-xs text-ardoise-500">{t('communal.circuits.voyagesAide')}</span>
          </label>
        </div>

        <label className="block">
          <span className={etiquette}>{t('communal.circuits.dateDebut')}</span>
          <input
            type="date"
            value={dateDebut}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDateDebut(e.target.value)}
            className={champ}
          />
          <span className="mt-1 block text-xs text-ardoise-500">{t('communal.circuits.dateDebutAide')}</span>
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAnnule}
            className="min-h-11 flex-1 rounded-lg border border-ardoise-300 bg-white px-4 font-medium text-ardoise-700"
          >
            {t('citoyen.annuler')}
          </button>
          <button
            type="submit"
            disabled={envoi || nom.length < 2 || jours.length === 0}
            className="min-h-11 flex-1 rounded-lg bg-siipi-600 px-4 font-semibold text-white disabled:opacity-50"
          >
            {t('communal.circuits.enregistrer')}
          </button>
        </div>
      </div>
    </form>
  );
}
