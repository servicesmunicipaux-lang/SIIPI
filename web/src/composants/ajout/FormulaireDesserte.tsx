// Une desserte (jalon G, lot G5a) : un établissement rattaché à un point d'arrêt
// d'un circuit, du … au …. Le même formulaire pour le catalogue « + Ajouter » et
// l'écran « Levées ».
//
// LA RÈGLE SE DIT AVANT LE REFUS : un établissement fermé ne se propose pas, et un
// point qui n'est pas un arrêt de collecte (centre de transfert, parc, début ou fin
// de collecte, point noir) non plus — la base les refuserait. Le chevauchement avec
// une autre desserte du même établissement, lui, ne se voit qu'en base : son refus
// s'affiche tel quel, il dit laquelle clore d'abord.
//
// La date de début se propose au jour de Tunis, jamais au jour du poste.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Circuit, type Etablissement, type PointCollecte } from '../../lib/api';
import { Chargement, Erreur } from '../Elements';
import { isolerLtr } from '../../lib/formats';
import { CadreAjout, champAjout } from './CadreAjout';
import { aujourdhui } from './FormulaireEtablissement';
import type { PropsFormulaireAjout } from './registre';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Les arrêts où aucun établissement n'est desservi : la base refuse d'y rattacher une desserte.
const TYPES_EXCLUS = new Set(['centre_transfert', 'parc_municipal', 'debut_collecte', 'fin_collecte', 'point_noir']);

export function FormulaireDesserte({ communeId, onFait, onAnnuler }: PropsFormulaireAjout) {
  const { t } = useTranslation();
  const [etablissements, setEtablissements] = useState<Etablissement[] | null>(null);
  const [circuits, setCircuits] = useState<Circuit[] | null>(null);
  const [indisponible, setIndisponible] = useState(false);
  const [essai, setEssai] = useState(0);
  const [commerceId, setCommerceId] = useState('');
  const [circuitId, setCircuitId] = useState('');
  const [points, setPoints] = useState<PointCollecte[] | null>(null);
  const [pointsIndisponibles, setPointsIndisponibles] = useState(false);
  const [pointId, setPointId] = useState('');
  const [dateDebut, setDateDebut] = useState(aujourdhui());
  const [dateFin, setDateFin] = useState('');
  const [observation, setObservation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    setIndisponible(false);
    Promise.all([api.etablissements(communeId), api.circuits(communeId)])
      .then(([e, c]) => {
        setEtablissements(e);
        setCircuits(c);
      })
      .catch(() => setIndisponible(true));
  }, [communeId, essai]);

  // Les points du circuit choisi ; un circuit changé pendant la lecture ne laisse pas
  // ceux du précédent s'afficher.
  useEffect(() => {
    setPointId('');
    setPoints(null);
    setPointsIndisponibles(false);
    if (!circuitId) return;
    let actuel = true;
    api
      .pointsCollecte(circuitId)
      .then((p) => {
        if (actuel) setPoints(p.filter((x) => !TYPES_EXCLUS.has(x.type)).sort((a, b) => a.voyage - b.voyage || a.ordre - b.ordre));
      })
      .catch(() => {
        if (actuel) setPointsIndisponibles(true);
      });
    return () => {
      actuel = false;
    };
  }, [circuitId]);

  const choisissables = useMemo(() => (etablissements ?? []).filter((e) => e.statut !== 'ferme'), [etablissements]);
  // Deux établissements de même raison sociale se départagent par leur matricule.
  const homonymes = useMemo(() => {
    const vus = new Map<string, number>();
    for (const e of choisissables) vus.set(e.nom.trim().toLowerCase(), (vus.get(e.nom.trim().toLowerCase()) ?? 0) + 1);
    return vus;
  }, [choisissables]);
  const departage = (e: Etablissement) =>
    (homonymes.get(e.nom.trim().toLowerCase()) ?? 0) > 1 ? ` — ${isolerLtr(e.matricule_fiscal ?? e.adresse ?? e.id.slice(0, 8))}` : '';
  const circuitsActifs = useMemo(() => (circuits ?? []).filter((c) => c.actif), [circuits]);

  const problemes: string[] = [];
  if (!commerceId) problemes.push(t('ajout.desserte.problemes.etablissement'));
  if (!pointId) problemes.push(t('ajout.desserte.problemes.point'));
  if (!DATE.test(dateDebut)) problemes.push(t('ajout.desserte.problemes.debut'));
  else if (dateFin && (!DATE.test(dateFin) || dateFin < dateDebut)) problemes.push(t('ajout.desserte.problemes.fin'));

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      await api.creerDesserte(communeId, {
        commerceId,
        pointId,
        dateDebut,
        dateFin: dateFin || null,
        observation: observation.trim() || null,
      });
      await onFait();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  if (indisponible) return <Erreur message={t('ajout.desserte.listesIndisponibles')} onReessayer={() => setEssai((n) => n + 1)} />;
  if (!etablissements || !circuits) return <Chargement />;

  return (
    <CadreAjout
      id="desserte-nouvelle"
      titre={t('ajout.desserte.titre')}
      aide={t('ajout.desserte.aide')}
      erreur={erreur}
      enregistrable={problemes.length === 0}
      envoi={envoi}
      onEnregistrer={enregistrer}
      onAnnuler={onAnnuler}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          {t('ajout.desserte.etablissement')}
          <select value={commerceId} onChange={(e) => setCommerceId(e.target.value)} className={champAjout}>
            <option value="">{t('ajout.etablissement.choisir')}</option>
            {choisissables.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}
                {departage(e)}
                {e.statut === 'a_verifier' ? ` (${t('communal.etablissements.statuts.a_verifier')})` : ''}
              </option>
            ))}
          </select>
          {choisissables.length === 0 && <span className="mt-1 block text-xs text-ardoise-600">{t('ajout.desserte.aucunEtablissement')}</span>}
        </label>
        <label className="text-sm">
          {t('ajout.desserte.circuit')}
          <select value={circuitId} onChange={(e) => setCircuitId(e.target.value)} className={champAjout}>
            <option value="">{t('ajout.etablissement.choisir')}</option>
            {circuitsActifs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} — ${c.nom}` : c.nom}
              </option>
            ))}
          </select>
          {circuitsActifs.length === 0 && <span className="mt-1 block text-xs text-ardoise-600">{t('ajout.desserte.aucunCircuit')}</span>}
        </label>
        <label className="text-sm">
          {t('ajout.desserte.point')}
          <select value={pointId} onChange={(e) => setPointId(e.target.value)} disabled={!circuitId || !points} className={`${champAjout} disabled:bg-ardoise-100`}>
            <option value="">{circuitId ? t('ajout.etablissement.choisir') : t('ajout.desserte.circuitDabord')}</option>
            {(points ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {t('ajout.desserte.pointLibelle', { voyage: p.voyage, ordre: p.ordre, nom: p.nom ?? t(`ajout.desserte.sansNom`) })}
              </option>
            ))}
          </select>
          {pointsIndisponibles && <span className="mt-1 block text-xs text-red-800">{t('ajout.desserte.pointsIndisponibles')}</span>}
          {points && points.length === 0 && <span className="mt-1 block text-xs text-ardoise-600">{t('ajout.desserte.aucunPoint')}</span>}
        </label>
        <label className="text-sm">
          {t('ajout.desserte.dateDebut')}
          <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className={champAjout} />
        </label>
        <label className="text-sm">
          {t('ajout.desserte.dateFin')}
          <input type="date" value={dateFin} min={dateDebut || undefined} onChange={(e) => setDateFin(e.target.value)} className={champAjout} />
          <span className="mt-1 block text-xs text-ardoise-500">{t('ajout.desserte.dateFinAide')}</span>
        </label>
      </div>
      <label className="block text-sm">
        {t('ajout.desserte.observation')}
        <textarea value={observation} onChange={(e) => setObservation(e.target.value)} maxLength={1000} rows={2} className={`${champAjout} py-2`} />
      </label>
      {problemes.length > 0 && (
        <div className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">
          <p>{t('ajout.etablissement.pourEnregistrer')}</p>
          <ul className="list-disc ps-5">
            {problemes.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </CadreAjout>
  );
}
