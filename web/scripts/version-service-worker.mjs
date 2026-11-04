// La version du service worker, apposée à la construction (vite.config.ts).
//
// Elle naît de l'index construit, qui nomme chaque fichier par son empreinte,
// et du service worker lui-même : tout changement du front en donne une
// nouvelle, et le navigateur installe alors le service worker qui purge les
// caches de l'ancienne. Figée, elle laissait un appareil déjà venu sur la
// première version, pour toujours (E2, SPEC_F_releve_terrain.md).
//
// La campagne `service-worker` appose la version par cette même fonction : elle
// éprouve ce que la construction produit, pas une copie.

import { createHash } from 'node:crypto';

export const MARQUE_VERSION = '__VERSION_CONSTRUCTION__';

export function versionDeConstruction(index, serviceWorker) {
  return createHash('sha256').update(index).update(serviceWorker).digest('hex').slice(0, 16);
}

// Une marque absente ou répétée arrête la construction : un service worker sans
// version propre ne serait jamais remplacé.
export function apposerVersion(serviceWorker, version) {
  const n = serviceWorker.split(MARQUE_VERSION).length - 1;
  if (n !== 1) {
    throw new Error(`sw.js doit porter la marque ${MARQUE_VERSION} une fois exactement (trouvée ${n} fois).`);
  }
  if (!/^[0-9a-z-]+$/.test(version)) throw new Error(`Version de service worker illisible : ${version}`);
  return serviceWorker.replace(MARQUE_VERSION, version);
}
