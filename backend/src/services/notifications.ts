// Service d'émission des notifications (Jalon 2, lot 1).
//
// UN SEUL CANAL, POUR L'INSTANT : le push web (Web Push API + VAPID), sur
// décision de la FNCT (feuille de route § 7.2) — aucun fournisseur externe à
// payer ni à choisir. Le SMS reste ouvert dans le modèle de données
// (`envois_notification.canal`, `notifications_envoyees.canal`) mais n'est
// pas câblé ici.
//
// UNE SEULE TENTATIVE. Pas de reprise automatique : un échec est consigné
// dans `notifications_envoyees` immédiatement, jamais réessayé en silence —
// c'est la politique retenue avec l'utilisateur, et le critère de validation
// de la feuille de route (« un échec est consigné et non silencieux »).
//
// CE QUE CE FICHIER NE FAIT JAMAIS : renvoyer à un appelant HTTP la liste des
// citoyens ciblés. Les fonctions SQL qu'il appelle (`app.souscriptions_*`)
// sont réservées à cet usage précis ; leur résultat sert ici à composer des
// appels Web Push et à écrire le journal, et s'arrête là.

import webpush from 'web-push';
import { config } from '../config.js';
import { query } from '../db.js';

let vapidConfigure = false;
if (config.vapidPublicKey && config.vapidPrivateKey) {
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  vapidConfigure = true;
} else {
  // Absence assumée : le push est une fonctionnalité best-effort, pas une
  // condition de démarrage de l'API (contrairement à JWT_SECRET).
  console.warn('[notifications] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY absentes : le push web restera consigné en échec.');
}

type Contexte = 'decision_reclamation' | 'invitation_sondage' | 'notification_ciblee';
type Statut = 'livre' | 'echec' | 'non_abonne' | 'sans_souscription';

interface Souscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function consigner(
  communeId: string,
  citoyenId: string | null,
  contexte: Contexte,
  referenceId: string | null,
  titre: string,
  corps: string,
  statut: Statut,
  erreur?: string
): Promise<void> {
  await query(
    `INSERT INTO notifications_envoyees
       (commune_id, citoyen_id, contexte, reference_id, titre, corps, statut, erreur)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [communeId, citoyenId, contexte, referenceId, titre, corps, statut, erreur ?? null]
  );
}

/**
 * Un seul envoi, vers un seul endpoint. Rend le statut, et retire du dépôt
 * l'endpoint expiré (410 Gone / 404) : le rappeler indéfiniment produirait un
 * échec identique à chaque publication, pour un navigateur qui n'écoute plus.
 */
async function pousser(s: Souscription, payload: string): Promise<{ statut: Statut; erreur?: string }> {
  if (!vapidConfigure) return { statut: 'echec', erreur: 'VAPID non configuré côté serveur.' };
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
    return { statut: 'livre' };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await query('DELETE FROM push_souscriptions WHERE endpoint = $1', [s.endpoint]).catch(() => undefined);
    }
    const message = err instanceof Error ? err.message : 'Échec inconnu.';
    return { statut: 'echec', erreur: message };
  }
}

/**
 * B5.1.2 — notifier le citoyen de la décision prise sur sa réclamation.
 *
 * Un seul destinataire, déjà connu de l'appelant (tickets.citizen_id) :
 * aucun ciblage géographique, donc aucune question de périmètre à poser.
 * Silencieux si le ticket n'a pas de citoyen rattaché (signalement saisi
 * pour le compte d'un tiers, ou compte supprimé depuis) — il n'y a alors
 * personne à notifier, et ce n'est pas une erreur.
 */
export async function notifierDecisionReclamation(
  communeId: string,
  citoyenId: string | null,
  ticketId: string,
  decision: 'acceptee' | 'refusee',
  motif?: string
): Promise<void> {
  if (!citoyenId) return;

  const titre = decision === 'acceptee' ? 'Votre réclamation a été acceptée' : 'Votre réclamation a été refusée';
  const corps = decision === 'acceptee'
    ? 'La commune a pris en charge votre signalement.'
    : `La commune a refusé votre signalement. Motif : ${motif ?? 'non précisé'}.`;

  const [ligne] = await query<{ abonne: boolean; endpoint: string | null; p256dh: string | null; auth: string | null }>(
    'SELECT * FROM app.souscriptions_citoyen($1)',
    [citoyenId]
  );
  if (!ligne) return; // citoyen introuvable (supprimé entre-temps) : rien à consigner.

  if (!ligne.abonne) {
    await consigner(communeId, citoyenId, 'decision_reclamation', ticketId, titre, corps, 'non_abonne');
    return;
  }
  if (!ligne.endpoint || !ligne.p256dh || !ligne.auth) {
    await consigner(communeId, citoyenId, 'decision_reclamation', ticketId, titre, corps, 'sans_souscription');
    return;
  }

  const payload = JSON.stringify({ titre, corps, lien: `/reclamations/${ticketId}` });
  const resultat = await pousser({ endpoint: ligne.endpoint, p256dh: ligne.p256dh, auth: ligne.auth }, payload);
  await consigner(communeId, citoyenId, 'decision_reclamation', ticketId, titre, corps, resultat.statut, resultat.erreur);
}

/**
 * B5.2.3 / B5.4.3 — pousser une publication (sondage ou notification ciblée)
 * vers chaque citoyen de son périmètre.
 *
 * Le ciblage a lieu entièrement dans `app.souscriptions_publication` (SQL,
 * SECURITY DEFINER) : cette fonction ne reçoit jamais autre chose qu'un
 * identifiant de publication en entrée, et ne renvoie rien à son appelant —
 * la route qui la déclenche a déjà répondu à l'agent avec l'agrégat de
 * `envois_notification`, avant que ceci ne s'exécute.
 */
export async function notifierPublication(
  communeId: string,
  publicationId: string,
  contexte: Extract<Contexte, 'invitation_sondage' | 'notification_ciblee'>,
  titre: string,
  corps: string
): Promise<void> {
  const lignes = await query<{
    citoyen_id: string; abonne: boolean; endpoint: string | null; p256dh: string | null; auth: string | null;
  }>('SELECT * FROM app.souscriptions_publication($1)', [publicationId]);

  const payload = JSON.stringify({ titre, corps, lien: `/publications/${publicationId}` });

  // Un citoyen abonné avec plusieurs navigateurs apparaît sur plusieurs
  // lignes (LEFT JOIN) : chacune est une tentative distincte, vers un
  // endpoint distinct.
  for (const ligne of lignes) {
    if (!ligne.abonne) {
      await consigner(communeId, ligne.citoyen_id, contexte, publicationId, titre, corps, 'non_abonne');
      continue;
    }
    if (!ligne.endpoint || !ligne.p256dh || !ligne.auth) {
      await consigner(communeId, ligne.citoyen_id, contexte, publicationId, titre, corps, 'sans_souscription');
      continue;
    }
    const resultat = await pousser({ endpoint: ligne.endpoint, p256dh: ligne.p256dh, auth: ligne.auth }, payload);
    await consigner(communeId, ligne.citoyen_id, contexte, publicationId, titre, corps, resultat.statut, resultat.erreur);
  }
}
