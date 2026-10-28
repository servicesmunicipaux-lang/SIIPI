// Les imports CSV de la commune — contacts, parc, personnel (registre des formulaires
// d'ajout, refonte lot 2b ; catalogue « Import en masse »).
//
// Le mécanisme est celui de `ImportCsv` (aperçu ligne par ligne sans rien
// écrire, puis validation) ; ici se fixe seulement CE QU'on importe, pour que
// l'écran Contacts, l'écran Parc et le catalogue appellent le même import.

import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { ImportCsv } from '../ImportCsv';

type Props = { communeId: string; onFait: () => void | Promise<void> };

export function ImportContacts({ communeId, onFait }: Props) {
  return <ImportCsv envoyer={(saisie) => api.importerContacts(communeId, saisie)} onFait={onFait} />;
}

// Un engin se reconnaît à son immatriculation : réimporter un export retouché
// met à jour les fiches, sans en créer de doubles.
export function ImportParc({ communeId, onFait }: Props) {
  return <ImportCsv envoyer={(saisie) => api.importerParc(communeId, saisie)} onFait={onFait} />;
}

// Un agent se reconnaît à son nom et son prénom, dans un ordre ou dans l'autre :
// réimporter le fichier de la paie ne crée pas de doubles. Le format est dit AVANT
// le choix du fichier — une feuille de paie porte des colonnes que SIIPI refuse, et
// mieux vaut le savoir avant d'envoyer que par un refus.
export function ImportPersonnel({ communeId, onFait }: Props) {
  const { t } = useTranslation();
  return (
    <div className="w-full space-y-2">
      <p className="text-sm text-ardoise-700">{t('ajout.importPersonnel.format')}</p>
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">{t('ajout.importPersonnel.jamais')}</p>
      <ImportCsv envoyer={(saisie) => api.importerPersonnel(communeId, saisie)} onFait={onFait} />
    </div>
  );
}
