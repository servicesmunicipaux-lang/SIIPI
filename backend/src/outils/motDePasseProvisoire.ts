// Attribuer un mot de passe provisoire à un compte, depuis le serveur.
//
//   npm run mot-de-passe:provisoire -- <adresse>        (développement)
//   npm run mot-de-passe:provisoire:prod -- <adresse>   (image de production)
//
// POURQUOI UNE COMMANDE, ET PAS UN ÉCRAN. En production, le mot de passe des
// comptes de démonstration n'ouvre aucun compte (src/motDePassePublic.ts) — y
// compris celui de la FNCT, qui est pourtant celui qui réinitialise les autres.
// Il faut donc une porte qui ne passe pas par une connexion : avoir la main sur
// le serveur, c'est déjà avoir la main sur la base. La commande ne fait rien de
// plus que ce que fait la FNCT depuis l'écran des comptes : un mot de passe
// provisoire, affiché une fois, à remplacer à la première connexion.
//
// Le mot de passe n'est écrit qu'en empreinte bcrypt ; il n'apparaît qu'à
// l'écran de celui qui lance la commande.
import bcrypt from 'bcryptjs';
// Contexte FNCT : la table users est cloisonnée (voir src/db.ts).
process.env.SIIPI_DB_CONTEXT = 'server';
const { pool } = await import('../db.js');
const { motDePasseProvisoire } = await import('../motDePassePublic.js');

const adresse = process.argv[2]?.trim();
if (!adresse) {
  console.error('Usage : npm run mot-de-passe:provisoire -- <adresse électronique du compte>');
  process.exit(2);
}

const provisoire = motDePasseProvisoire();
try {
  const { rows } = await pool.query<{ email: string; role: string }>(
    `UPDATE users SET password_hash = $1, mot_de_passe_provisoire = true, updated_at = now()
      WHERE lower(email) = lower($2) AND deleted_at IS NULL
      RETURNING email, role`,
    [await bcrypt.hash(provisoire, 12), adresse]
  );
  if (rows.length === 0) {
    console.error(`Aucun compte actif pour « ${adresse} ». Vérifiez l'adresse (aucun compte n'a été modifié).`);
    process.exitCode = 1;
  } else {
    console.log(`Compte ${rows[0].email} (${rows[0].role}) : mot de passe provisoire attribué.`);
    console.log(`Mot de passe provisoire : ${provisoire}`);
    console.log('Il ne sera plus affiché. La personne le remplace à sa première connexion.');
  }
} finally {
  await pool.end();
}
