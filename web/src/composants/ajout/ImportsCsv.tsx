// Les imports CSV de la commune — contacts, parc (registre des formulaires
// d'ajout, refonte lot 2b ; catalogue « Import en masse »).
//
// Le mécanisme est celui de `ImportCsv` (aperçu ligne par ligne sans rien
// écrire, puis validation) ; ici se fixe seulement CE QU'on importe, pour que
// l'écran Contacts, l'écran Parc et le catalogue appellent le même import.

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
