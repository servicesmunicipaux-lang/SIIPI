// LE MOT DE PASSE DES COMPTES DE DÉMONSTRATION EST PUBLIC.
//
// Il est écrit dans le dépôt (seed, DEMARRAGE.md, DEMARRER.bat) : quiconque a
// lu le code le connaît. C'est voulu en développement — tout le monde doit
// pouvoir ouvrir la plateforme après DEMARRER.bat, et les campagnes de tests
// s'en servent. Mais l'image de production exécute le même seed : une instance
// installée et jamais reprise aurait onze comptes, dont celui de la FNCT,
// ouverts à n'importe qui (FEUILLE_DE_ROUTE § 8).
//
// D'où trois règles :
//   - en production, ce mot de passe n'ouvre AUCUN compte (routes/auth) ;
//   - en production, les comptes de démonstration eux-mêmes sont refusés, quel
//     que soit leur mot de passe (D-FNCT-5, migration 067 : la base les
//     désactive et ne les trouve plus) ; le premier compte réel de la FNCT se
//     crée depuis le serveur : `npm run compte:fnct:creer:prod -- <adresse> "<nom>"` ;
//   - nulle part on ne peut le choisir comme nouveau mot de passe
//     (routes/comptes).
//
// Ce module ne charge pas la base : le seed l'importe avant d'avoir fixé son
// contexte de connexion (voir seed/seed.ts et src/db.ts).
import { randomInt } from 'node:crypto';

export const MOT_DE_PASSE_PUBLIC = 'Siipi2026!';

/** Les comptes que crée le seed. Le seed refuse d'en créer un qui n'y figure
    pas : sans cela, le contrôle du démarrage en oublierait un. */
export const COMPTES_DE_DEMONSTRATION = [
  'admin.national@siipi.tn',
  'directeur.marsa@siipi.tn',
  'directeur.sfax@siipi.tn',
  'prestataire.marsa@siipi.tn',
  'directeur.houmtsouk@siipi.tn',
  'directeur.midoun@siipi.tn',
  'directeur.ajim@siipi.tn',
  'prestataire.houmtsouk@siipi.tn',
  'prestataire.midoun@siipi.tn',
  'prestataire.ajim@siipi.tn',
  'citoyen.demo@siipi.tn',
] as const;

export const MESSAGE_MOT_DE_PASSE_PUBLIC =
  'Ce mot de passe est celui des comptes de démonstration, publié avec le code : en production, il n’ouvre aucun compte. ' +
  'L’exploitant du serveur attribue un mot de passe provisoire (npm run mot-de-passe:provisoire:prod -- <adresse>), ' +
  'à remplacer à la première connexion.';

export const MESSAGE_COMPTE_DEMONSTRATION =
  'Les comptes de démonstration sont refusés sur une instance de production. ' +
  'Le premier compte réel de la FNCT se crée depuis le serveur (npm run compte:fnct:creer:prod -- <adresse> "<nom>").';

/** Le message de la décision D-FNCT-5, mot pour mot. */
export const MESSAGE_MOT_DE_PASSE_A_CHANGER = 'Vous devez changer votre mot de passe avant de continuer.';

/**
 * Mot de passe provisoire lisible à voix haute : ni « l » ni « 1 », ni « O »
 * ni « 0 ». Le cadre le dicte à son agent — s'il faut épeler trois fois, il
 * finira par écrire « Azerty123 » sur un papier.
 */
export function motDePasseProvisoire(): string {
  const lettres = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const minuscules = 'abcdefghijkmnpqrstuvwxyz';
  const chiffres = '23456789';
  const tirer = (source: string, n: number) =>
    Array.from({ length: n }, () => source[randomInt(source.length)]).join('');
  return `${tirer(lettres, 1)}${tirer(minuscules, 5)}-${tirer(chiffres, 4)}`;
}
