// Le jumeau numérique en ligne de commande (lot S1).
//
//   npm run seed:jumeau              charge (ou recharge à l'identique) le jeu
//   npm run seed:jumeau -- --retirer efface la commune de démonstration
//
// Même code que l'écran « Mode démo » de l'observatoire (services/jumeau.ts),
// exécuté avec le contexte FNCT des scripts d'administration.
process.env.SIIPI_DB_CONTEXT = 'server';
const { pool, withTransaction } = await import('../src/db.js');
const { chargerDemo, retirerDemo, COMMUNE_DEMO } = await import('../src/services/jumeau.js');

const retirer = process.argv.includes('--retirer');
try {
  if (retirer) {
    const n = await withTransaction((client) => retirerDemo(client, COMMUNE_DEMO()));
    console.log(`[jumeau] commune de démonstration retirée (${n} pesées, présences et réclamations effacées).`);
  } else {
    const etat = await withTransaction((client) => chargerDemo(client));
    console.log(`[jumeau] ${etat.communeId} chargée, du ${etat.periode.debut} au ${etat.periode.fin} :`);
    for (const [table, n] of Object.entries(etat.compteurs)) console.log(`  ${table} : ${n}`);
  }
} finally {
  await pool.end();
}
