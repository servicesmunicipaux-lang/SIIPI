// Ajouter un engin (refonte, lot 2b ; catalogue « Mes moyens »).
//
// Jusqu'ici, un engin n'entrait que par l'import CSV du parc : l'API savait le
// créer, aucun écran ne l'appelait. Une commune qui reçoit UNE benne n'a pas à
// fabriquer un fichier pour la déclarer.
//
// Un engin se reconnaît à son immatriculation, espaces et casse mis à part :
// l'API refuse un doublon (409), et son message le dit tel quel.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type ClasseEngin } from '../../lib/api';
import { ChampsTypologie, typologieValide, volumeSaisi, type SaisieTypologie } from '../communal/ChampsTypologie';
import { CadreAjout, champAjout } from './CadreAjout';
import type { PropsFormulaireAjout } from './registre';

// La liste de l'API (trucks.routes.ts) : un type hors liste y est refusé.
const TYPES = [
  'benne_tasseuse', 'camion', 'camion_ampliroll', 'camion_remorque', 'balayeuse', 'tracteur',
  'tracteur_remorque', 'remorque', 'chargeuse_pelleteuse', 'chargeuse', 'mini_chargeuse', 'niveleuse', 'autre',
] as const;

/** « 12,5 » ou « 12.5 » → 12.5 ; vide → null (champ non renseigné, pas zéro). */
const nombre = (s: string) => (s.trim() === '' ? null : Number(s.trim().replace(/\s/g, '').replace(',', '.')));

export function FormulaireEngin({ communeId, onFait, onAnnuler }: PropsFormulaireAjout) {
  const { t } = useTranslation();
  const [immatriculation, setImmatriculation] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]>('benne_tasseuse');
  const [marque, setMarque] = useState('');
  const [miseEnCirculation, setMiseEnCirculation] = useState('');
  const [typologie, setTypologie] = useState<SaisieTypologie>({ classe: null, volume: '', provenance: null });
  const [classes, setClasses] = useState<ClasseEngin[]>([]);
  const [chargeUtile, setChargeUtile] = useState('');
  const [valeurAchat, setValeurAchat] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const nombres = [chargeUtile, valeurAchat].map(nombre);
  const nombresValides = nombres.every((n) => n === null || (Number.isFinite(n) && n >= 0)) && typologieValide(typologie);

  // Sans le référentiel, la classe reste « non renseignée » : l'engin s'enregistre quand même.
  useEffect(() => {
    api.classesEngins().then(setClasses).catch(() => setClasses([]));
  }, []);

  // Une classe qui ne convient plus au type choisi est retirée, pas gardée en silence.
  const changerType = (nouveau: (typeof TYPES)[number]) => {
    setType(nouveau);
    const k = classes.find((c) => c.code === typologie.classe);
    if (k && !k.types_compatibles.includes(nouveau)) setTypologie({ ...typologie, classe: null });
  };

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      await api.creerEngin(communeId, {
        registration: immatriculation.trim(),
        type,
        marque: marque.trim() || null,
        datePremiereCirculation: miseEnCirculation || null,
        capacityM3: volumeSaisi(typologie.volume),
        volumeProvenance: typologie.provenance,
        classeCollecte: typologie.classe,
        chargeUtileT: nombres[0],
        valeurAchatTnd: nombres[1],
      });
      await onFait();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <CadreAjout
      id="ajout-engin"
      titre={t('ajout.engin.titre')}
      aide={t('ajout.engin.aide')}
      erreur={erreur}
      enregistrable={immatriculation.trim().length >= 2 && nombresValides}
      envoi={envoi}
      onEnregistrer={enregistrer}
      onAnnuler={onAnnuler}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm" htmlFor="engin-immat">
          {t('ajout.engin.immatriculation')}
          <input id="engin-immat" required minLength={2} dir="ltr" value={immatriculation} onChange={(e) => setImmatriculation(e.target.value)} className={champAjout} />
        </label>
        <label className="text-sm" htmlFor="engin-type">
          {t('ajout.engin.type')}
          <select id="engin-type" value={type} onChange={(e) => changerType(e.target.value as typeof type)} className={champAjout}>
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>{t(`communal.parc.types.${ty}`)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm" htmlFor="engin-marque">
          {t('ajout.engin.marque')}
          <input id="engin-marque" maxLength={80} value={marque} onChange={(e) => setMarque(e.target.value)} className={champAjout} />
        </label>
        <label className="text-sm" htmlFor="engin-circulation">
          {t('communal.parc.champs.miseEnCirculation')}
          <input id="engin-circulation" type="date" value={miseEnCirculation} onChange={(e) => setMiseEnCirculation(e.target.value)} className={champAjout} />
        </label>
        <label className="text-sm" htmlFor="engin-charge">
          {t('ajout.engin.chargeUtile')}
          <input id="engin-charge" inputMode="decimal" dir="ltr" value={chargeUtile} onChange={(e) => setChargeUtile(e.target.value)} className={champAjout} />
        </label>
        <label className="text-sm" htmlFor="engin-valeur">
          {t('ajout.engin.valeurAchat')}
          <input id="engin-valeur" inputMode="decimal" dir="ltr" value={valeurAchat} onChange={(e) => setValeurAchat(e.target.value)} className={champAjout} />
        </label>
      </div>
      <fieldset className="rounded-lg border border-ardoise-200 p-3">
        <legend className="px-1 text-sm font-medium text-ardoise-700">{t('communal.parc.typologie.titre')}</legend>
        <ChampsTypologie idPrefixe="engin" type={type} classes={classes} valeur={typologie} onChange={setTypologie} />
      </fieldset>
      {!nombresValides && <p className="text-xs text-amber-800">{t('ajout.engin.nombreInvalide')}</p>}
    </CadreAjout>
  );
}
