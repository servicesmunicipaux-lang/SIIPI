// Service d'émission des notifications (Jalon 2 : lot 1 + M6).
//
// UN SEUL CANAL, POUR L'INSTANT : le push web (Web Push API + VAPID), sur
// décision de l'utilisateur (feuille de route § 7.2) — aucun fournisseur
// externe à payer ni à choisir. Le SMS et le courriel restent ouverts dans le
// modèle de données (`canal`, `preferences_notification`) mais ne sont pas
// câblés ici.
//
// UNE SEULE TENTATIVE AUTOMATIQUE. Pas de reprise automatique : un échec est
// consigné dans `notifications_citoyen` immédiatement, jamais réessayé en
// silence. Un agent PEUT en revanche relancer manuellement (voir
// `renvoyerNotification`) — l'automatisme ne retente pas, une personne le
// peut.
//
// CE QUE CE FICHIER NE FAIT JAMAIS : renvoyer à un appelant HTTP la liste des
// citoyens ciblés. Les fonctions SQL qu'il appelle (`app.souscriptions_*`)
// sont réservées à cet usage précis ; leur résultat sert ici à composer des
// appels Web Push et à écrire le journal, et s'arrête là.
//
// L'HISTORIQUE EST ÉCRIT MÊME QUAND RIEN N'EST ENVOYÉ. Un désabonnement, une
// préférence désactivée ou l'absence de navigateur enregistré sont des
// ISSUES, pas des non-événements : c'est ce qui nourrit l'écran « Mes
// notifications » et son compteur de non-lus, qui doivent refléter tout ce
// qui s'est passé.

import webpush from 'web-push';
import { config } from '../config.js';
import { query, queryOne } from '../db.js';
import { ApiError } from '../middleware/errorHandler.js';

let vapidConfigure = false;
if (config.vapidPublicKey && config.vapidPrivateKey) {
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  vapidConfigure = true;
} else {
  // Absence assumée : le push est une fonctionnalité best-effort, pas une
  // condition de démarrage de l'API (contrairement à JWT_SECRET).
  console.warn('[notifications] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY absentes : le push web restera consigné en échec.');
}

type TypeNotification = 'decision_reclamation' | 'invitation_sondage' | 'notification_ciblee';
type Statut = 'livre' | 'echec' | 'non_abonne' | 'non_souhaite' | 'sans_souscription';

interface Souscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function consigner(
  communeId: string,
  citoyenId: string | null,
  type: TypeNotification,
  referenceId: string | null,
  titre: string,
  corps: string,
  metadata: Record<string, unknown> | null,
  statut: Statut,
  erreur?: string
): Promise<void> {
  await query(
    `INSERT INTO notifications_citoyen
       (commune_id, citoyen_id, type, reference_id, titre, corps, metadata, statut, erreur)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [communeId, citoyenId, type, referenceId, titre, corps, metadata ? JSON.stringify(metadata) : null, statut, erreur ?? null]
  );
}

/**
 * Un seul envoi, vers un seul endpoint. Rend le statut, et retire du dépôt
 * l'endpoint expiré (410 Gone / 404) : le rappeler indéfiniment produirait un
 * échec identique à chaque publication, pour un navigateur qui n'écoute plus.
 */
async function pousser(s: Souscription, payload: string): Promise<{ statut: 'livre' | 'echec'; erreur?: string }> {
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
  const metadata = { lien: `/reclamations/${ticketId}` };

  const [ligne] = await query<{
    abonne: boolean; souhaite: boolean; endpoint: string | null; p256dh: string | null; auth: string | null;
  }>('SELECT * FROM app.souscriptions_citoyen($1, $2)', [citoyenId, 'decision_reclamation']);
  if (!ligne) return; // citoyen introuvable (supprimé entre-temps) : rien à consigner.

  if (!ligne.abonne) {
    await consigner(communeId, citoyenId, 'decision_reclamation', ticketId, titre, corps, metadata, 'non_abonne');
    return;
  }
  if (!ligne.souhaite) {
    await consigner(communeId, citoyenId, 'decision_reclamation', ticketId, titre, corps, metadata, 'non_souhaite');
    return;
  }
  if (!ligne.endpoint || !ligne.p256dh || !ligne.auth) {
    await consigner(communeId, citoyenId, 'decision_reclamation', ticketId, titre, corps, metadata, 'sans_souscription');
    return;
  }

  const payload = JSON.stringify({ titre, corps, lien: metadata.lien });
  const resultat = await pousser({ endpoint: ligne.endpoint, p256dh: ligne.p256dh, auth: ligne.auth }, payload);
  await consigner(communeId, citoyenId, 'decision_reclamation', ticketId, titre, corps, metadata, resultat.statut, resultat.erreur);
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
  type: Extract<TypeNotification, 'invitation_sondage' | 'notification_ciblee'>,
  titre: string,
  corps: string
): Promise<void> {
  const lignes = await query<{
    citoyen_id: string; abonne: boolean; souhaite: boolean;
    endpoint: string | null; p256dh: string | null; auth: string | null;
  }>('SELECT * FROM app.souscriptions_publication($1, $2)', [publicationId, type]);

  const metadata = { lien: `/publications/${publicationId}` };
  const payload = JSON.stringify({ titre, corps, lien: metadata.lien });

  // Un citoyen abonné avec plusieurs navigateurs apparaît sur plusieurs
  // lignes (LEFT JOIN) : chacune est une tentative distincte, vers un
  // endpoint distinct.
  for (const ligne of lignes) {
    if (!ligne.abonne) {
      await consigner(communeId, ligne.citoyen_id, type, publicationId, titre, corps, metadata, 'non_abonne');
      continue;
    }
    if (!ligne.souhaite) {
      await consigner(communeId, ligne.citoyen_id, type, publicationId, titre, corps, metadata, 'non_souhaite');
      continue;
    }
    if (!ligne.endpoint || !ligne.p256dh || !ligne.auth) {
      await consigner(communeId, ligne.citoyen_id, type, publicationId, titre, corps, metadata, 'sans_souscription');
      continue;
    }
    const resultat = await pousser({ endpoint: ligne.endpoint, p256dh: ligne.p256dh, auth: ligne.auth }, payload);
    await consigner(communeId, ligne.citoyen_id, type, publicationId, titre, corps, metadata, resultat.statut, resultat.erreur);
  }
}

/**
 * Relance manuelle d'un envoi ÉCHOUÉ — jamais automatique (voir l'en-tête de
 * ce fichier). Réservée aux lignes que l'appelant peut déjà LIRE (la requête
 * de chargement passe par les mêmes politiques RLS que la lecture normale) :
 * une commune ne relance ainsi qu'une décision de réclamation, la FNCT
 * n'importe quelle ligne.
 *
 * Re-résout la souscription du citoyen AU MOMENT DE LA RELANCE plutôt que de
 * rejouer l'ancienne : s'il s'est réabonné depuis (nouvel appareil), c'est ce
 * nouvel appareil qui reçoit l'essai suivant, pas l'ancien qui a échoué.
 */
export async function renvoyerNotification(id: string): Promise<void> {
  const notif = await queryOne<{
    id: string; citoyen_id: string | null; type: TypeNotification; titre: string; corps: string;
    metadata: { lien?: string } | null; statut: string;
  }>('SELECT id, citoyen_id, type, titre, corps, metadata, statut FROM notifications_citoyen WHERE id = $1', [id]);
  if (!notif) throw new ApiError(404, 'Notification introuvable.');
  if (notif.statut !== 'echec') {
    throw new ApiError(400, `Cette notification n'est pas en échec (statut actuel : « ${notif.statut} »).`);
  }
  if (!notif.citoyen_id) throw new ApiError(400, 'Aucun citoyen rattaché à cette notification.');

  const [ligne] = await query<{
    abonne: boolean; souhaite: boolean; endpoint: string | null; p256dh: string | null; auth: string | null;
  }>('SELECT * FROM app.souscriptions_citoyen($1, $2)', [notif.citoyen_id, notif.type]);

  // Le citoyen a pu changer d'avis (ou être supprimé) entre l'échec et la
  // relance : on respecte l'état ACTUEL, jamais celui d'hier.
  let statut: Statut;
  let erreur: string | undefined;
  if (!ligne) {
    statut = 'non_abonne';
  } else if (!ligne.abonne) {
    statut = 'non_abonne';
  } else if (!ligne.souhaite) {
    statut = 'non_souhaite';
  } else if (!ligne.endpoint || !ligne.p256dh || !ligne.auth) {
    statut = 'sans_souscription';
  } else {
    const payload = JSON.stringify({ titre: notif.titre, corps: notif.corps, lien: notif.metadata?.lien });
    const resultat = await pousser({ endpoint: ligne.endpoint, p256dh: ligne.p256dh, auth: ligne.auth }, payload);
    statut = resultat.statut;
    erreur = resultat.erreur;
  }

  await query(
    `UPDATE notifications_citoyen
        SET statut = $1, erreur = $2, tentatives = tentatives + 1, date_envoi = now()
      WHERE id = $3`,
    [statut, erreur ?? null, id]
  );
}
