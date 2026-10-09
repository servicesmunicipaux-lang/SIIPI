// Au démarrage d'une instance de production : où en sont les comptes de
// démonstration ?
//
// Depuis D-FNCT-5, la base les désactive au premier démarrage en production et
// la connexion ne les trouve plus (migration 067) : il ne s'agit plus de fermer
// une porte, mais de dire à l'exploitant pourquoi le compte de la FNCT du jeu de
// démonstration ne s'ouvre pas, et comment créer le premier compte réel — avant
// qu'il ne l'apprenne en essayant.
import { pool } from './db.js';

export async function signalerComptesDeDemonstration(): Promise<void> {
  try {
    // Lecture directe sur le pool : la table users est cloisonnée, et ce contrôle
    // n'a pas d'utilisateur connecté.
    const { rows } = await pool.query<{ n: number; fnct_reels: number }>(
      `SELECT count(*) FILTER (WHERE compte_demonstration)::int AS n,
              count(*) FILTER (WHERE NOT compte_demonstration AND role = 'super_admin_fnct'
                                 AND is_active AND deleted_at IS NULL)::int AS fnct_reels
         FROM users`
    );
    const { n, fnct_reels } = rows[0];
    if (n > 0) {
      console.log(
        `[siipi-backend] ${n} compte(s) de démonstration en base : désactivés et refusés à la connexion sur cette instance de production.`
      );
    }
    if (fnct_reels === 0) {
      console.warn(
        `[siipi-backend] ATTENTION : aucun compte réel de la FNCT. Créez-le depuis le serveur : ` +
          `npm run compte:fnct:creer:prod -- <adresse> "<nom complet>" (mot de passe provisoire, à remplacer à la première connexion).`
      );
    }
  } catch (err) {
    console.warn(`[siipi-backend] Contrôle des comptes impossible : ${err instanceof Error ? err.message : err}`);
  }
}
