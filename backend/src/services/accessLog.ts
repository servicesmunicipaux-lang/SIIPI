import { query } from '../db.js';
import { currentContext } from '../context.js';

/**
 * Journalise la consultation de données personnelles de citoyens
 * (décret-loi n° 2022-54 : pouvoir répondre à « qui a consulté mes données ? »).
 *
 * Une lecture SQL seule ne dit ni depuis quel écran ni pour quel usage elle a
 * lieu : ce journal-ci est donc alimenté par l'API, à la différence du journal
 * des écritures qui est porté par des déclencheurs en base.
 *
 * Deux règles pour ne pas journaliser du bruit :
 *  - un citoyen qui consulte ses propres données n'est pas tracé ;
 *  - une réponse qui ne contient aucune donnée citoyenne n'est pas tracée.
 */
export async function journaliserAccesCitoyens(
  endpoint: string,
  lignes: Array<{ citizen_id?: string | null; citizen_name?: string | null; citizen_phone?: string | null }>
): Promise<void> {
  const contexte = currentContext();
  if (contexte.role === 'citoyen' || contexte.role === 'anonyme') return;

  const concernees = lignes.filter((l) => l.citizen_id || l.citizen_name || l.citizen_phone);
  if (concernees.length === 0) return;

  const identifiants = Array.from(
    new Set(concernees.map((l) => l.citizen_id).filter((id): id is string => Boolean(id)))
  );

  try {
    await query('SELECT app.enregistrer_acces($1, $2::uuid[], $3)', [
      endpoint,
      identifiants,
      concernees.length,
    ]);
  } catch (err) {
    // Un échec de journalisation ne doit pas faire échouer la requête de
    // l'utilisateur, mais il doit être visible dans les logs du serveur :
    // c'est une perte de traçabilité, pas un incident anodin.
    console.error('[access-log] Échec de journalisation de %s :', endpoint, err);
  }
}
