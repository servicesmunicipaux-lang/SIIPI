// Les règles d'écriture et de lecture des mesures d'une campagne de pesée (lot G5b),
// partagées par l'écran des campagnes et l'import Kobo.
//
// L'ÉCRAN APPLIQUE LA RÈGLE DE L'API AVANT L'ENVOI. Le lot s'écrit en entier ou pas du
// tout : une seule valeur que l'API refuse (trop de décimales) faisait échouer tout le
// lot d'un « Requête invalide. » qui ne nommait ni la pesée ni le champ.
//
// L'ÉCRAN MONTRE CE QUE LA BASE GARDE. Arrondir à l'affichage cachait la pesée fautive
// (« 67 % » pour 66,67) et fabriquait des zéros (« 0,0 kg » pour 0,04) ; une durée
// dite « 0,33 j » ne pouvait plus être retapée à l'identique.

import type { TFunction } from 'i18next';
import { formaterNombre } from '../../i18n';

/** La règle de l'API (campagnesPesee.routes.ts) : `n` n'a pas plus de `d` décimales, à 1e-9 près relatif. */
export const auPlusDecimales = (n: number, d: number) => Math.abs(n - Number(n.toFixed(d))) <= 1e-9 * Math.max(1, Math.abs(n));

/** Le plus petit nombre de décimales (au plus `max`) qui écrit `n` tel qu'il est : ni zéro ajouté, ni zéro fabriqué. */
export function decimalesDe(n: number, max: number): number {
  for (let k = 0; k < max; k++) if (auPlusDecimales(n, k)) return k;
  return max;
}

/** Une valeur écrite telle que la base la garde (au plus `max` décimales). */
export const formaterExact = (n: number, max: number) => formaterNombre(n, decimalesDe(n, max));

/** Une durée en jours, ramenée aux 6 décimales que l'API garde. */
export const arrondiJours = (j: number) => Math.round(j * 1e6) / 1e6;

/**
 * Des heures en jours. La même conversion que l'import Kobo (backend, importPesees.ts) :
 * sans elle, 8 h saisies au portail et 8 h importées s'écriraient différemment, et la
 * règle « les pesées d'un même jour couvrent la même durée » les opposerait.
 */
export const joursDepuisHeures = (h: number) => arrondiJours(h / 24);

/** Les heures d'une durée qui en est un nombre exact (2 décimales au plus, comme la saisie et l'import), sinon null. */
export function heuresExactes(j: number): number | null {
  const h = Math.round(j * 2400) / 100;
  return h > 0 && joursDepuisHeures(h) === arrondiJours(j) ? h : null;
}

/** La durée couverte, telle que la base la garde, avec ses heures quand elle en est un nombre exact. */
export function texteDuree(t: TFunction, j: number): string {
  const n = formaterExact(j, 6);
  const h = Number.isInteger(j) ? null : heuresExactes(j);
  return h === null ? t('campagnesPesee.duree.jours', { n }) : t('campagnesPesee.duree.joursHeures', { n, h: formaterExact(h, 2) });
}

/**
 * Une valeur mesurée (un quartile, une densité), avec au moins deux chiffres
 * significatifs. Des décimales fixes écriraient « 0,00 » pour 0,004 kg par jour et par
 * m², ou « 0 » pour une densité de 0,2 : un zéro là où l'on a mesuré quelque chose.
 */
export function formaterMesure(v: number, decimalesMin: number): string {
  if (v === 0 || !Number.isFinite(v)) return formaterNombre(v, decimalesMin);
  const pourDeuxChiffres = 1 - Math.floor(Math.log10(Math.abs(v)));
  return formaterNombre(v, Math.min(6, Math.max(decimalesMin, pourDeuxChiffres)));
}
