// Les règles d'un constat de manquement (jalon G, lot G7a) que l'écran dit AVANT le
// refus de la base — sans jamais les remplacer : c'est la base qui tranche.

/** Les chiffres arabes-indiens (٠-٩), persans (۰-۹) et pleine chasse (０-９), ramenés aux chiffres latins. */
const chiffresLatins = (texte: string) =>
  texte.replace(/[٠-٩۰-۹０-９]/g, (c) => {
    const code = c.charCodeAt(0);
    const base = code >= 0xff10 ? 0xff10 : code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });

/**
 * Un champ libre décrit le fait, jamais la personne. La même forme que la base
 * (migration 107) : les chiffres de toute écriture ramenés aux chiffres latins, les
 * seuls blancs entre deux chiffres retirés (espaces insécables compris), puis huit
 * chiffres qui se suivent — la forme d'un CIN ou d'un téléphone (« 98 123 456 »,
 * « ٠٩ ٨٧٦ ٥٤٣ »). Points, tirets et barres obliques ne joignent pas les chiffres :
 * une date (23.11.2026, 2026-11-23) ou « arrêté n° 2026-1123 » restent permis.
 */
export const porteUnIdentifiant = (texte: string) => /\d{8}/.test(chiffresLatins(texte).replace(/(?<=\d)\s+(?=\d)/gu, ''));

/**
 * Le délai de saisie tel qu'il vaut d'ordinaire. Le vrai est un paramètre national
 * daté, lu par la base au jour de la saisie : l'écran n'en fait qu'un avertissement.
 */
export const DELAI_SAISIE_INDICATIF = 30;

/** Le nombre de jours entre deux dates AAAA-MM-JJ, sur le calendrier (sans heure). */
export function joursEntre(debut: string, fin: string): number {
  const [a1, m1, j1] = debut.split('-').map(Number);
  const [a2, m2, j2] = fin.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, j2) - Date.UTC(a1, m1 - 1, j1)) / 86_400_000);
}

/** La distance au sol, en mètres, entre deux positions (haversine). */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export const PHOTOS_MAX = 10;
