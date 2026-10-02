// L'EMPREINTE DU CIN (lot 16.1, docs/specs_metier/SPEC_v0.16.md R1).
//
// Un CIN tunisien compte huit chiffres : cent millions de possibilités, qu'un
// hachage simple laisse énumérer en quelques secondes. L'empreinte n'a donc de
// valeur que par une clé hors de la base :
//   clé de commune = HMAC-SHA256(secret maître, "siipi-identite:" + commune)
//   empreinte      = HMAC-SHA256(clé de commune, CIN normalisé)
// Calculée ICI, dans l'API, jamais en SQL : la clé ne traverse ni le journal
// de la base ni les traces de requêtes. Le CIN en clair n'est ni écrit, ni
// journalisé, ni renvoyé : il ne vit que le temps de ce calcul.
//
// Une clé par commune : la même personne inscrite dans deux communes n'a pas
// la même empreinte, et l'on ne peut pas recouper les registres entre eux.
import { createHmac } from 'node:crypto';
import { config } from '../config.js';

/** Un CIN se saisit avec des espaces ou des tirets ; seuls les chiffres comptent. */
export function normaliserCin(cin: string): string {
  return cin.replace(/\D/g, '');
}

export function empreinteCin(communeId: string, cin: string): string {
  const cleCommune = createHmac('sha256', config.secretIdentites).update(`siipi-identite:${communeId}`).digest();
  return createHmac('sha256', cleCommune).update(normaliserCin(cin)).digest('hex');
}
