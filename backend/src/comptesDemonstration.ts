// Au démarrage en production : combien de comptes de démonstration gardent le
// mot de passe publié avec le code ?
//
// La connexion les refuse déjà (routes/auth) : il ne s'agit pas de fermer une
// porte, mais de dire à l'exploitant pourquoi la FNCT ne pourra pas se
// connecter, et comment y remédier — avant qu'elle ne l'apprenne en essayant.
// Le contrôle ne porte que sur les comptes du seed : comparer une empreinte
// bcrypt coûte un quart de seconde, et le faire sur tous les comptes
// retarderait d'autant chaque démarrage.
import bcrypt from 'bcryptjs';
import { queryOne } from './db.js';
import { COMPTES_DE_DEMONSTRATION, MOT_DE_PASSE_PUBLIC } from './motDePassePublic.js';

export async function comptesAuMotDePassePublic(): Promise<string[]> {
  const ouverts: string[] = [];
  for (const email of COMPTES_DE_DEMONSTRATION) {
    // app.find_user_for_login : la seule lecture des comptes permise sans
    // utilisateur connecté (migration 013).
    const compte = await queryOne<{ password_hash: string; is_active: boolean }>(
      'SELECT password_hash, is_active FROM app.find_user_for_login($1)',
      [email]
    );
    if (compte?.is_active && (await bcrypt.compare(MOT_DE_PASSE_PUBLIC, compte.password_hash))) ouverts.push(email);
  }
  return ouverts;
}

export async function signalerComptesDeDemonstration(): Promise<void> {
  try {
    const ouverts = await comptesAuMotDePassePublic();
    if (ouverts.length === 0) return;
    console.warn(
      `[siipi-backend] ATTENTION : ${ouverts.length} compte(s) de démonstration gardent le mot de passe publié avec le code ` +
        `(${ouverts.join(', ')}). En production, ce mot de passe n'ouvre aucun compte : attribuez-leur un mot de passe ` +
        `provisoire (npm run mot-de-passe:provisoire:prod -- <adresse>), ou désactivez ceux qui ne servent pas.`
    );
  } catch (err) {
    console.warn(`[siipi-backend] Contrôle des comptes de démonstration impossible : ${err instanceof Error ? err.message : err}`);
  }
}
