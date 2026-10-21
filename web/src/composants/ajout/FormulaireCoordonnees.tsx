// Les coordonnées d'une commune : son téléphone, son fax, son courriel, son
// adresse, et son responsable de la propreté (son nom ou sa fonction, et son
// numéro). C'est la fiche de la commune elle-même (PATCH /communes/:id), à ne pas
// confondre avec l'écran « Contacts », qui tient ses interlocuteurs extérieurs
// (l'ANGeD, le gouvernorat, un prestataire…).
//
// Le formulaire n'envoie que ce qui a changé : une fiche rouverte et enregistrée
// sans rien toucher ne laisse pas de ligne de plus au journal d'audit.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Commune } from '../../lib/api';
import { Chargement } from '../Elements';
import { CadreAjout, champAjout } from './CadreAjout';

type Cle = 'phone' | 'fax' | 'email' | 'address' | 'responsible_officer' | 'responsible_phone';

/** La colonne de la fiche, le nom du champ dans le corps de la requête, et le type de saisie. */
const CHAMPS: { cle: Cle; corps: string; type: 'tel' | 'email' | 'text'; autoComplete?: string }[] = [
  { cle: 'phone', corps: 'phone', type: 'tel' },
  { cle: 'fax', corps: 'fax', type: 'tel' },
  { cle: 'email', corps: 'email', type: 'email' },
  { cle: 'address', corps: 'address', type: 'text' },
  { cle: 'responsible_officer', corps: 'responsibleOfficer', type: 'text' },
  { cle: 'responsible_phone', corps: 'responsiblePhone', type: 'tel' },
];

type Valeurs = Record<Cle, string>;
const lire = (c: Commune): Valeurs => ({
  phone: c.phone ?? '',
  fax: c.fax ?? '',
  email: c.email ?? '',
  address: c.address ?? '',
  responsible_officer: c.responsible_officer ?? '',
  responsible_phone: c.responsible_phone ?? '',
});

export function FormulaireCoordonnees({ communeId, onFait }: { communeId: string; onFait?: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const [initiales, setInitiales] = useState<Valeurs | null>(null);
  const [valeurs, setValeurs] = useState<Valeurs | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    setInitiales(null);
    setValeurs(null);
    setMessage(null);
    void api
      .commune(communeId)
      .then((c) => {
        setInitiales(lire(c));
        setValeurs(lire(c));
      })
      .catch((e) => setErreur((e as Error).message));
  }, [communeId]);

  if (!valeurs || !initiales) return erreur ? <p role="alert" className="text-sm text-red-900">{erreur}</p> : <Chargement />;

  const modifies = CHAMPS.filter((c) => valeurs[c.cle] !== initiales[c.cle]);

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    setMessage(null);
    try {
      const corps = Object.fromEntries(modifies.map((c) => [c.corps, valeurs[c.cle].trim()]));
      const maj = await api.majCommune(communeId, corps);
      setInitiales(lire(maj));
      setValeurs(lire(maj));
      setMessage(t('coordonnees.enregistrees'));
      await onFait?.();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <CadreAjout
      id={`coordonnees-${communeId}`}
      titre={t('coordonnees.titre')}
      aide={t('coordonnees.aide')}
      erreur={erreur}
      enregistrable={modifies.length > 0}
      envoi={envoi}
      onEnregistrer={enregistrer}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {CHAMPS.map((c) => (
          <label key={c.cle} className={c.cle === 'address' ? 'sm:col-span-2' : undefined}>
            <span className="text-sm font-medium text-ardoise-700">{t(`coordonnees.champs.${c.cle}`)}</span>
            <input
              type={c.type}
              value={valeurs[c.cle]}
              onChange={(e) => {
                setMessage(null);
                setValeurs({ ...valeurs, [c.cle]: e.target.value });
              }}
              className={champAjout}
              // Un numéro ou une adresse de courriel se lit de gauche à droite, même dans une page arabe.
              dir={c.type === 'tel' || c.type === 'email' ? 'ltr' : undefined}
            />
          </label>
        ))}
      </div>
      {message && <p role="status" className="rounded-lg border border-siipi-300 bg-siipi-50 p-3 text-sm text-siipi-900">{message}</p>}
    </CadreAjout>
  );
}
