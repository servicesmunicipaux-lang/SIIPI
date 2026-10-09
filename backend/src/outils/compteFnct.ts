// Créer un compte réel de la FNCT, depuis le serveur.
//
//   npm run compte:fnct:creer -- <adresse> "<nom complet>"        (développement)
//   npm run compte:fnct:creer:prod -- <adresse> "<nom complet>"   (image de production)
//
// POURQUOI UNE COMMANDE. Sur une instance de production, les comptes de
// démonstration sont refusés (D-FNCT-5) — y compris celui de la FNCT, qui est
// pourtant celui qui ouvre les autres comptes depuis l'écran. Le premier compte
// réel naît donc ici : avoir la main sur le serveur, c'est déjà avoir la main
// sur la base. Les suivants se créent depuis l'écran des comptes.
//
// Le mot de passe est provisoire, affiché une fois, n'est écrit qu'en empreinte
// bcrypt, et n'ouvre que son propre remplacement à la première connexion.
import bcrypt from 'bcryptjs';
// Contexte FNCT : la table users est cloisonnée (voir src/db.ts).
process.env.SIIPI_DB_CONTEXT = 'server';
const { pool } = await import('../db.js');
const { COMPTES_DE_DEMONSTRATION, motDePasseProvisoire } = await import('../motDePassePublic.js');

const adresse = process.argv[2]?.trim().toLowerCase();
const nom = process.argv[3]?.trim();
if (!adresse || !nom || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) {
  console.error('Usage : npm run compte:fnct:creer -- <adresse électronique> "<nom complet>"');
  process.exit(2);
}
if ((COMPTES_DE_DEMONSTRATION as readonly string[]).includes(adresse)) {
  console.error(`« ${adresse} » est l'adresse d'un compte de démonstration, publiée avec le code : choisissez une adresse réelle.`);
  process.exit(1);
}

const provisoire = motDePasseProvisoire();
try {
  const { rows } = await pool.query<{ email: string }>(
    `INSERT INTO users (email, password_hash, full_name, role, commune_id, mot_de_passe_provisoire)
     VALUES ($1, $2, $3, 'super_admin_fnct', NULL, true)
     ON CONFLICT (email) DO NOTHING
     RETURNING email`,
    [adresse, await bcrypt.hash(provisoire, 12), nom]
  );
  if (rows.length === 0) {
    console.error(
      `Un compte existe déjà pour « ${adresse} » (aucun compte n'a été créé). Pour lui donner un nouveau mot de passe : ` +
        `npm run mot-de-passe:provisoire -- ${adresse}`
    );
    process.exitCode = 1;
  } else {
    console.log(`Compte FNCT ${rows[0].email} créé (administration nationale).`);
    console.log(`Mot de passe provisoire : ${provisoire}`);
    console.log('Il ne sera plus affiché. La personne le remplace à sa première connexion.');
  }
} finally {
  await pool.end();
}
