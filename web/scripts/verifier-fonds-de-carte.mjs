// Les fonds de carte ne vivent qu'à un endroit (lot S0 : carte du conseiller SIG).
//
// `src/composants/carte/FondsDeCarte.tsx` porte les adresses de tuiles et leurs
// attributions : le plan OpenStreetMap et l'imagerie satellite d'Esri. Une carte
// qui écrirait sa propre adresse de tuiles échapperait au sélecteur de fonds,
// et risquerait d'oublier l'attribution que les fournisseurs exigent. Et aucune
// tuile Google : appelées hors de leur API, elles enfreignent les conditions de
// Google (la carte du conseiller en chargeait).
//
// Lancé par `npm run lint`, après le typage.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
const src = join(racine, 'src');
const fonds = join(src, 'composants', 'carte', 'FondsDeCarte.tsx');

const TUILES = /\{z\}\/\{[xy]\}\/\{[xy]\}|tile\.openstreetmap\.org|arcgisonline\.com|google\.com\/vt|mt[0-3]\.google|khms?\d?\.google/i;
const GOOGLE = /google\.com\/vt|mt[0-3]\.google|\{s\}\.google|khms?\d?\.google/i;

// Un commentaire « // » se retire, pas le « // » d'une adresse (https://…) : couper
// à la première paire de barres effacerait justement les adresses qu'on cherche.
const sansCommentaire = (ligne) => ligne.replace(/(^|[^:'"`])\/\/.*$/, '$1');

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(ts|tsx)$/.test(nom) ? [chemin] : [];
  });
}

const ailleurs = [];
const google = [];
const lus = fichiers(src);
for (const chemin of lus) {
  readFileSync(chemin, 'utf8')
    .split('\n')
    .forEach((ligne, i) => {
      const code = sansCommentaire(ligne);
      if (GOOGLE.test(code)) google.push(`${relative(racine, chemin)}:${i + 1}`);
      else if (chemin !== fonds && TUILES.test(code)) ailleurs.push(`${relative(racine, chemin)}:${i + 1}`);
    });
}

let refus = false;
if (google.length) {
  console.error(`[fonds de carte] Tuiles Google hors de leur API : ${google.join(', ')}.`);
  refus = true;
}
if (ailleurs.length) {
  console.error(`[fonds de carte] Adresse de tuiles écrite hors de FondsDeCarte.tsx : ${ailleurs.join(', ')}.`);
  console.error('  Utilisez <FondsDeCarte /> : le sélecteur de fonds et les attributions y sont.');
  refus = true;
}
if (refus) process.exit(1);
console.log(`[fonds de carte] ${lus.length} fichiers lus : les tuiles ne vivent que dans FondsDeCarte.tsx, aucune tuile Google.`);
