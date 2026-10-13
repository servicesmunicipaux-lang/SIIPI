// Ajouter un point de collecte (refonte, lot 2b ; catalogue « Mon territoire »).
//
// Un point appartient à un circuit : c'est ce qui le met dans une tournée, à
// un rang, dans un voyage. L'API savait en saisir un à la main ; les points
// n'entraient que par un fichier GPS ou une suggestion citoyenne validée.
// Saisi ici, il se place à la fin du voyage choisi — la fiche du circuit sait
// ensuite le déplacer dans l'ordre.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Circuit } from '../../lib/api';
import { CadreAjout, champAjout } from './CadreAjout';
import { ChoixPosition, type Position } from './ChoixPosition';
import type { PropsFormulaireAjout } from './registre';

// La liste de l'API (pointsCollecte.routes.ts).
const TYPES = [
  'porte_a_porte', 'point_de_collecte', 'debut_collecte', 'fin_collecte', 'point_noir',
  'centre_transfert', 'hors_conteneur', 'parc_municipal', 'autre',
] as const;

export function FormulairePoint({ communeId, onFait, onAnnuler }: PropsFormulaireAjout) {
  const { t } = useTranslation();
  const [circuits, setCircuits] = useState<Circuit[] | null>(null);
  const [circuitId, setCircuitId] = useState('');
  const [nom, setNom] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]>('point_de_collecte');
  const [voyage, setVoyage] = useState(1);
  const [position, setPosition] = useState<Position | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    void api.circuits(communeId).then(setCircuits).catch(() => setCircuits([]));
  }, [communeId]);

  const enregistrer = async () => {
    if (!position) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.ajouterPoint(circuitId, { nom: nom.trim() || undefined, type, voyage, lat: position.lat, lng: position.lng });
      await onFait();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <CadreAjout
      id="ajout-point"
      titre={t('ajout.point.titre')}
      aide={t('ajout.point.aide')}
      erreur={erreur}
      enregistrable={circuitId !== '' && position !== null}
      envoi={envoi}
      onEnregistrer={enregistrer}
      onAnnuler={onAnnuler}
    >
      {circuits && circuits.length === 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{t('ajout.point.aucunCircuit')}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm" htmlFor="point-circuit">
          {t('ajout.point.circuit')}
          <select id="point-circuit" required value={circuitId} onChange={(e) => setCircuitId(e.target.value)} className={champAjout}>
            <option value="">—</option>
            {(circuits ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </label>
        <label className="text-sm" htmlFor="point-type">
          {t('ajout.point.type')}
          <select id="point-type" value={type} onChange={(e) => setType(e.target.value as typeof type)} className={champAjout}>
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>{t(`communal.circuits.typesPoint.${ty}`)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm" htmlFor="point-nom">
          {t('ajout.point.nom')}
          <input id="point-nom" value={nom} onChange={(e) => setNom(e.target.value)} className={champAjout} />
        </label>
        <label className="text-sm" htmlFor="point-voyage">
          {t('ajout.point.voyage')}
          <input id="point-voyage" type="number" min={1} max={6} value={voyage} onChange={(e) => setVoyage(Math.min(6, Math.max(1, Number(e.target.value) || 1)))} className={champAjout} />
        </label>
      </div>
      <ChoixPosition communeId={communeId} position={position} onPosition={setPosition} />
    </CadreAjout>
  );
}
