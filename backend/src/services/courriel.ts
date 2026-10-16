// L'envoi des courriels (décision du 16 octobre 2026 : « courriel d'abord,
// SMS plus tard » ; B1.2, B5.4.3).
//
// UN SERVEUR SMTP DÉSIGNÉ PAR L'EXPLOITANT (SMTP_HOST, SMTP_PORT, …), et aucun
// autre : SIIPI ne s'abonne à aucun service d'envoi. Sans SMTP_HOST, rien ne
// part — le résultat est « non_configure », dit à l'écran, jamais un envoi
// supposé réussi.
//
// UNE SEULE TENTATIVE, comme le push (services/notifications.ts) : un échec
// est consigné, pas réessayé en silence. « Envoyé » veut dire « accepté par le
// serveur SMTP » — pas « lu », ni même « arrivé » : l'écran ne dit pas plus.
//
// RIEN DU CONTENU N'EST JOURNALISÉ. Un courriel peut porter un mot de passe
// provisoire : seuls le résultat et, en cas d'échec, le message d'erreur du
// serveur (qui ne contient pas le corps) sont gardés.

import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

export type ResultatCourriel = { statut: 'envoye' | 'echec' | 'non_configure'; erreur?: string };

let transport: Transporter | null = null;

export const courrielConfigure = () => config.courriel.hote !== '';

function transporteur(): Transporter {
  if (!transport) {
    const c = config.courriel;
    transport = nodemailer.createTransport({
      host: c.hote,
      port: c.port,
      secure: c.securite === 'tls',
      ignoreTLS: c.securite === 'aucune',
      requireTLS: c.securite === 'starttls',
      auth: c.utilisateur ? { user: c.utilisateur, pass: c.motDePasse } : undefined,
      // Un serveur qui ne répond pas ne doit pas tenir la requête de l'agent.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transport;
}

/** Envoie un courriel en texte brut ; ne lève jamais : le résultat dit ce qui s'est passé. */
export async function envoyerCourriel(a: string, sujet: string, texte: string): Promise<ResultatCourriel> {
  if (!courrielConfigure()) return { statut: 'non_configure' };
  try {
    await transporteur().sendMail({ from: config.courriel.expediteur, to: a, subject: sujet, text: texte });
    return { statut: 'envoye' };
  } catch (err) {
    // Le message d'erreur du serveur, sans le corps du courriel.
    const message = err instanceof Error ? err.message.slice(0, 300) : 'Échec inconnu.';
    console.warn(`[courriel] échec d'envoi : ${message}`);
    return { statut: 'echec', erreur: message };
  }
}

/** Ce que l'écran de la FNCT montre de la configuration — jamais le mot de passe. */
export function etatCourriel() {
  const c = config.courriel;
  return {
    configure: courrielConfigure(),
    serveur: c.hote ? `${c.hote}:${c.port}` : null,
    securite: c.securite,
    authentifie: c.utilisateur !== '',
    expediteur: c.expediteur,
  };
}
