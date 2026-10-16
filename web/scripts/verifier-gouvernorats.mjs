// Aucun nom de gouvernorat dans le code du front (décision D-FNCT-2).
//
// Le découpage des gouvernorats en districts vit dans la base (migration 078),
// modifiable par la FNCT. Un nom de gouvernorat écrit entre guillemets dans un
// écran serait une règle cachée — « si Sfax, alors… » — que ce découpage ne
// pourrait plus corriger. Les commentaires peuvent nommer un gouvernorat ; le
// code, non. Le fichier généré depuis le contrat (api-types.ts) en garde les
// exemples, qui ne sont pas du code.
//
// La liste ci-dessous n'est pas une donnée de l'application : c'est ce que ce
// contrôle cherche. Le même contrôle, côté API, est fait par la campagne
// `districts`, avec le témoin du décret.
//
// Lancé par `npm run lint`, après le typage.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
const src = join(racine, 'src');
const exclus = new Set([join(src, 'lib', 'api-types.ts')]);

const GOUVERNORATS = [
  'Ariana', 'Béja', 'Ben Arous', 'Bizerte', 'Gabès', 'Gafsa', 'Jendouba', 'Kairouan', 'Kasserine', 'Kébili',
  'Le Kef', 'Mahdia', 'Manouba', 'La Manouba', 'Médenine', 'Monastir', 'Nabeul', 'Sfax', 'Sidi Bouzid', 'Siliana',
  'Sousse', 'Tataouine', 'Tozeur', 'Tunis', 'Zaghouan',
];
const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const motif = new RegExp(`['"\`](${GOUVERNORATS.map(echapper).join('|')})['"\`]`);

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(ts|tsx)$/.test(nom) && !exclus.has(chemin) ? [chemin] : [];
  });
}

const trouves = [];
const lus = fichiers(src);
for (const chemin of lus) {
  readFileSync(chemin, 'utf8')
    .split('\n')
    .forEach((ligne, i) => {
      const code = ligne.split('//')[0].trim();
      if (code.startsWith('*') || code.startsWith('/*') || code.startsWith('{/*')) return;
      if (motif.test(code)) trouves.push(`${relative(racine, chemin)}:${i + 1}`);
    });
}

if (trouves.length) {
  console.error(`[gouvernorats] Nom de gouvernorat écrit dans le code : ${trouves.join(', ')}.`);
  console.error('  Le découpage vit dans la base (D-FNCT-2) : lisez-le par l’API (/kpi/districts), ne l’écrivez pas.');
  process.exit(1);
}
console.log(`[gouvernorats] ${lus.length} fichiers lus : aucun nom de gouvernorat dans le code.`);
