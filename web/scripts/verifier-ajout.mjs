// Un composant par type d'objet (SPEC_refonte § 2.2, test de validation du lot 2).
//
// « Le même formulaire, ouvert depuis le catalogue, depuis l'écran Parc et
// depuis un indicateur, enregistre la même ligne avec les mêmes contrôles. »
// Ce qui le garantit : l'appel d'API qui crée un objet ne vit qu'à UN endroit,
// le formulaire du registre (src/composants/ajout/). Un second formulaire
// d'engin, écrit un jour dans un autre écran, appellerait `api.creerEngin`
// ailleurs — et ce script refuserait.
//
// La liste des appels est `src/composants/ajout/appels-creation.json`, celle
// que lit aussi le registre : il n'y a pas deux listes à tenir d'accord.
//
// Lancé par `npm run lint`, après le typage.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
const src = join(racine, 'src');
const dossierAjout = join(src, 'composants', 'ajout') + sep;
// Le client lui-même déclare ces fonctions ; il ne les appelle pas.
const exclus = new Set([join(src, 'lib', 'api.ts'), join(src, 'lib', 'api-types.ts')]);

const appels = JSON.parse(readFileSync(join(dossierAjout, 'appels-creation.json'), 'utf8'));

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(ts|tsx)$/.test(nom) && !exclus.has(chemin) ? [chemin] : [];
  });
}

const sources = fichiers(src).map((chemin) => ({ chemin, texte: readFileSync(chemin, 'utf8') }));
const fonctions = [...new Set(Object.values(appels).flat())].sort();
const defauts = [];

if (Object.keys(appels).length === 0) defauts.push('appels-creation.json ne nomme aucun type : le contrôle ne contrôlerait rien.');

for (const fn of fonctions) {
  const motif = new RegExp(`\\bapi\\.${fn}\\(`);
  const ou = sources.filter((s) => motif.test(s.texte)).map((s) => s.chemin);
  const lisible = ou.map((c) => relative(racine, c)).join(', ');
  if (ou.length === 0) defauts.push(`api.${fn} n'est appelé nulle part : le type qu'il crée n'a pas de formulaire.`);
  else if (ou.length > 1) defauts.push(`api.${fn} est appelé dans ${ou.length} fichiers (${lisible}) : un seul formulaire par type.`);
  else if (!ou[0].startsWith(dossierAjout)) defauts.push(`api.${fn} est appelé hors du registre (${lisible}) : le formulaire doit vivre dans src/composants/ajout/.`);
}

if (defauts.length) {
  console.error(`[ajout] ${defauts.length} défaut(s) :`);
  for (const d of defauts) console.error(`  ✗ ${d}`);
  process.exit(1);
}
console.log(
  `[ajout] ${Object.keys(appels).length} types, ${fonctions.length} appels de création : chacun dans un seul fichier du registre (src/composants/ajout/).`
);
