// Ajouter un lieu de la commune — marché, cimetière, abattoir, école, centre
// de santé (lot « sources KPI » ; registre de formulaires, refonte lot 2b).
//
// Le formulaire vivait dans l'écran des lieux, pointé sur sa grande carte. Il
// a désormais la sienne, petite : le même formulaire s'ouvre depuis cet écran
// et depuis le catalogue « + Ajouter », où il n'y a pas d'autre carte.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi } from '../../lib/api';
import { CadreAjout, champAjout } from './CadreAjout';
import { ChoixPosition, type Position } from './ChoixPosition';
import type { PropsFormulaireAjout } from './registre';

export const TYPES_LIEU = ['marche', 'cimetiere', 'abattoir', 'ecole', 'sante', 'autre'] as const;

export function FormulaireLieu({ communeId, onFait, onAnnuler }: PropsFormulaireAjout) {
  const { t } = useTranslation();
  const [nom, setNom] = useState('');
  const [type, setType] = useState<(typeof TYPES_LIEU)[number]>('marche');
  const [adresse, setAdresse] = useState('');
  const [position, setPosition] = useState<Position | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const enregistrer = async () => {
    if (!position) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.creerLieu(communeId, { nom: nom.trim(), type, lat: position.lat, lng: position.lng, adresse: adresse.trim() || null });
      await onFait();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <CadreAjout
      id="ajout-lieu"
      titre={t('registres.lieux.ajouter')}
      aide={t('registres.lieux.aide')}
      erreur={erreur}
      enregistrable={nom.trim().length > 0 && position !== null}
      envoi={envoi}
      onEnregistrer={enregistrer}
      onAnnuler={onAnnuler}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm" htmlFor="lieu-nom">
          {t('registres.lieux.nom')}
          <input id="lieu-nom" required value={nom} onChange={(e) => setNom(e.target.value)} className={champAjout} />
        </label>
        <label className="text-sm" htmlFor="lieu-type">
          {t('registres.lieux.type')}
          <select id="lieu-type" value={type} onChange={(e) => setType(e.target.value as typeof type)} className={champAjout}>
            {TYPES_LIEU.map((ty) => (
              <option key={ty} value={ty}>{t(`registres.lieux.types.${ty}`)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm" htmlFor="lieu-adresse">
          {t('registres.lieux.adresse')}
          <input id="lieu-adresse" value={adresse} onChange={(e) => setAdresse(e.target.value)} className={champAjout} />
        </label>
      </div>
      <ChoixPosition communeId={communeId} position={position} onPosition={setPosition} />
    </CadreAjout>
  );
}
