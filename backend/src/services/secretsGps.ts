// Les secrets du connecteur GPS (lot 17.4a) : le jeton d'un fournisseur et le
// secret de son webhook.
//
// Chiffrés ICI, dans l'API, avant d'entrer en base (AES-256-GCM) ; la clé n'est
// que dans l'environnement (SIIPI_SECRET_GPS). La base ne voit jamais un secret
// en clair : une sauvegarde volée, ou une requête qui lirait la table par erreur,
// ne livre aucun jeton. GCM authentifie aussi : un octet changé en base, et le
// déchiffrement échoue au lieu de rendre un faux jeton.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';

/** La clé de 32 octets, tirée du secret de l'environnement quelle qu'en soit la forme. */
const cle = () => createHash('sha256').update(`siipi-gps:${config.secretGps}`).digest();

/** iv (12 octets) | étiquette (16 octets) | texte chiffré. */
export function chiffrerSecret(texte: string): Buffer {
  const iv = randomBytes(12);
  const chiffreur = createCipheriv('aes-256-gcm', cle(), iv);
  const corps = Buffer.concat([chiffreur.update(texte, 'utf8'), chiffreur.final()]);
  return Buffer.concat([iv, chiffreur.getAuthTag(), corps]);
}

export function dechiffrerSecret(valeur: Buffer): string {
  const dechiffreur = createDecipheriv('aes-256-gcm', cle(), valeur.subarray(0, 12));
  dechiffreur.setAuthTag(valeur.subarray(12, 28));
  return Buffer.concat([dechiffreur.update(valeur.subarray(28)), dechiffreur.final()]).toString('utf8');
}

/** Un secret de webhook neuf : 32 octets aléatoires, en hexadécimal. */
export function nouveauSecretWebhook(): string {
  return randomBytes(32).toString('hex');
}
