// Rattacher un boîtier GPS à un engin (lot 17.4b).
//
// Le seul endroit qui crée une correspondance boîtier → engin : l'écran
// « Intégration GPS » l'ouvre depuis son tableau des boîtiers, et depuis une
// position signalée « boîtier sans engin » — alors l'identifiant arrive déjà
// rempli, tel que le fournisseur l'envoie.
//
// La liste ne propose que les engins de la commune : la base refuserait les
// autres (un boîtier ne se rattache qu'à un engin de sa commune), et un choix
// qui mène à un refus ne se propose pas. Les positions déjà signalées pour ce
// boîtier ne sont pas reprises en silence : seules les suivantes seront tracées.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Vehicule } from '../../lib/api';
import { CadreAjout, champAjout } from './CadreAjout';
import type { PropsFormulaireAjout } from './registre';

export function FormulaireBoitierGps({
  communeId,
  onFait,
  onAnnuler,
  identifiantInitial = '',
}: PropsFormulaireAjout & { identifiantInitial?: string }) {
  const { t } = useTranslation();
  const [engins, setEngins] = useState<Vehicule[] | null>(null);
  const [identifiant, setIdentifiant] = useState(identifiantInitial);
  const [vehiculeId, setVehiculeId] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    api
      .engins(communeId)
      .then(setEngins)
      .catch((err) => setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur')));
  }, [communeId, t]);

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      await api.rattacherBoitierGps(communeId, { identifiant: identifiant.trim(), vehiculeId });
      await onFait();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <CadreAjout
      id="ajout-boitier-gps"
      titre={t('ajout.boitierGps.titre')}
      aide={t('ajout.boitierGps.aide')}
      erreur={erreur}
      enregistrable={identifiant.trim().length > 0 && vehiculeId !== ''}
      envoi={envoi}
      onEnregistrer={enregistrer}
      onAnnuler={onAnnuler}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm" htmlFor="boitier-identifiant">
          {t('ajout.boitierGps.identifiant')}
          <input
            id="boitier-identifiant"
            required
            dir="ltr"
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
            className={champAjout}
          />
        </label>
        <label className="text-sm" htmlFor="boitier-engin">
          {t('ajout.boitierGps.engin')}
          <select id="boitier-engin" value={vehiculeId} onChange={(e) => setVehiculeId(e.target.value)} className={champAjout}>
            <option value="">{engins === null ? t('commun.chargement') : t('ajout.boitierGps.choisirEngin')}</option>
            {(engins ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.registration}
              </option>
            ))}
          </select>
        </label>
      </div>
      {engins !== null && engins.length === 0 && <p className="mt-2 text-sm text-ardoise-600">{t('ajout.boitierGps.aucunEngin')}</p>}
    </CadreAjout>
  );
}
