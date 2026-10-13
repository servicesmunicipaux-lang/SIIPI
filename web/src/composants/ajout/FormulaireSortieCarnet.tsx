// Une sortie au carnet de bord (lot 16.3 ; registre des formulaires d'ajout,
// refonte lot 2b ; catalogue « Registres du jour »).
//
// LA DISTANCE NE SE SAISIT PAS : on saisit les deux compteurs, la base déduit
// le reste. Le compteur de retour peut attendre le soir — la sortie s'inscrit
// le matin, le retour se complète depuis sa ligne, dans l'écran « Carnet &
// carburant ».

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Agent, type Circuit, type Vehicule } from '../../lib/api';
import { CadreAjout, champAjout } from './CadreAjout';

const SEANCES = ['matin', 'apres_midi', 'nuit'] as const;

// Le jour à Tunis (UTC+1, sans heure d'été).
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

export function FormulaireSortieCarnet({
  communeId,
  onFait,
  onAnnuler,
}: {
  communeId: string;
  onFait: () => void | Promise<void>;
  /** Absent dans l'écran du carnet, où le formulaire reste ouvert au-dessus des sorties du mois. */
  onAnnuler?: () => void;
}) {
  const { t } = useTranslation();
  const [engins, setEngins] = useState<Vehicule[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [saisie, setSaisie] = useState({
    vehiculeId: '',
    jour: aujourdhui(),
    seance: 'matin' as (typeof SEANCES)[number],
    chauffeurId: '',
    circuitId: '',
    compteurSortie: '',
    compteurRetour: '',
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    void Promise.all([api.engins(communeId), api.personnel(communeId), api.circuits(communeId)])
      .then(([e, a, c]) => {
        setEngins(e);
        setAgents(a);
        setCircuits(c);
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : t('commun.erreur')));
  }, [communeId, t]);

  const chauffeurs = useMemo(
    () => agents.filter((a) => ['chauffeur', 'tractoriste'].includes(String((a as { fonction?: string }).fonction))),
    [agents]
  );

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      await api.enregistrerSortie(communeId, {
        vehiculeId: saisie.vehiculeId,
        jour: saisie.jour,
        seance: saisie.seance,
        chauffeurId: saisie.chauffeurId || null,
        circuitId: saisie.circuitId || null,
        compteurSortie: Number(saisie.compteurSortie),
        compteurRetour: saisie.compteurRetour === '' ? null : Number(saisie.compteurRetour),
      });
      setSaisie((s) => ({ ...s, compteurSortie: '', compteurRetour: '' }));
      await onFait();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <CadreAjout
      id="ajout-sortie"
      titre={t('ajout.carnet.titre')}
      aide={t('communal.carburant.aideCompteurs')}
      erreur={erreur}
      enregistrable={saisie.vehiculeId !== '' && saisie.compteurSortie !== ''}
      envoi={envoi}
      onEnregistrer={enregistrer}
      onAnnuler={onAnnuler}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm" htmlFor="sortie-engin">
          <span className="font-medium">{t('communal.carburant.engin')}</span>
          <select id="sortie-engin" value={saisie.vehiculeId} onChange={(e) => setSaisie({ ...saisie, vehiculeId: e.target.value })} className={champAjout}>
            <option value="">—</option>
            {engins.map((e) => (
              <option key={e.id} value={e.id}>{e.registration}</option>
            ))}
          </select>
        </label>
        <label className="text-sm" htmlFor="sortie-jour">
          <span className="font-medium">{t('communal.carburant.jour')}</span>
          <input id="sortie-jour" type="date" value={saisie.jour} max={aujourdhui()} onChange={(e) => setSaisie({ ...saisie, jour: e.target.value })} className={champAjout} />
        </label>
        <label className="text-sm" htmlFor="sortie-seance">
          <span className="font-medium">{t('communal.carburant.seance')}</span>
          <select id="sortie-seance" value={saisie.seance} onChange={(e) => setSaisie({ ...saisie, seance: e.target.value as (typeof SEANCES)[number] })} className={champAjout}>
            {SEANCES.map((s) => (
              <option key={s} value={s}>{t(`communal.carburant.seances_.${s}`)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm" htmlFor="sortie-chauffeur">
          <span className="font-medium">{t('communal.carburant.chauffeur')}</span>
          <select id="sortie-chauffeur" value={saisie.chauffeurId} onChange={(e) => setSaisie({ ...saisie, chauffeurId: e.target.value })} className={champAjout}>
            <option value="">—</option>
            {chauffeurs.map((a) => (
              <option key={a.id} value={a.id}>{(a as { nom_complet?: string }).nom_complet}</option>
            ))}
          </select>
        </label>
        <label className="text-sm" htmlFor="sortie-circuit">
          <span className="font-medium">{t('communal.carburant.circuit')}</span>
          <select id="sortie-circuit" value={saisie.circuitId} onChange={(e) => setSaisie({ ...saisie, circuitId: e.target.value })} className={champAjout}>
            <option value="">—</option>
            {circuits.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </label>
        <label className="text-sm" htmlFor="sortie-compteur">
          <span className="font-medium">{t('communal.carburant.compteurSortie')}</span>
          <input id="sortie-compteur" type="number" inputMode="decimal" min={0} value={saisie.compteurSortie} onChange={(e) => setSaisie({ ...saisie, compteurSortie: e.target.value })} className={champAjout} />
        </label>
        <label className="text-sm" htmlFor="sortie-retour">
          <span className="font-medium">{t('communal.carburant.compteurRetour')}</span>
          <input id="sortie-retour" type="number" inputMode="decimal" min={0} value={saisie.compteurRetour} onChange={(e) => setSaisie({ ...saisie, compteurRetour: e.target.value })} className={champAjout} />
        </label>
      </div>
    </CadreAjout>
  );
}
