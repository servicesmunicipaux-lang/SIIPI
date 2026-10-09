// Conservation des photos (D-FNCT-4), à la main.
//
//   npm run medias:archive:initialiser   pose le témoin sur le volume de l'archive froide
//   npm run medias:compresser            lance un passage (photos de plus de 36 mois)
//   npm run medias:restaurer             sert les demandes de restauration ouvertes
//
// « -- --commune <id> » restreint compresser et restaurer à une commune.
//
// (variantes « :prod » dans l'image de production.)
//
// POURQUOI UNE COMMANDE EN PLUS DU PLANIFICATEUR. L'archive est froide : elle
// peut n'être branchée qu'un jour par mois, par la personne qui en a la garde.
// C'est elle qui sert alors les restaurations en attente, sans attendre l'heure
// de la vérification suivante — et c'est le même code que celui du planificateur.
process.env.SIIPI_DB_CONTEXT = 'server';
const { pool } = await import('../db.js');
const service = await import('../services/conservationMedias.js');

const action = process.argv[2];
const i = process.argv.indexOf('--commune');
const commune = i > 0 ? process.argv[i + 1] ?? null : null;
try {
  if (action === 'initialiser') {
    const temoin = await service.initialiserArchive();
    console.log(`Archive froide prête : ${temoin}`);
    const refus = await service.archiveIndisponible();
    if (refus) { console.error(refus); process.exitCode = 1; }
  } else if (action === 'compresser') {
    const b = await service.compresserPhotosAnciennes('commande', commune);
    if (b.statut === 'refuse') {
      console.error(`Passage ${b.passage} refusé, aucune photo touchée : ${b.motifRefus}`);
      process.exitCode = 1;
    } else {
      console.log(
        `Passage ${b.passage} : ${b.compressees} photo(s) compressée(s) sur ${b.eligibles} de plus de 36 mois ; ` +
          `${Math.round(b.octetsAvant / 1024)} Ko → ${Math.round(b.octetsApres / 1024)} Ko.`
      );
      for (const a of b.anomalies) console.log(`  anomalie : fichier ${a.fichier} — ${a.raison}`);
    }
  } else if (action === 'restaurer') {
    const b = await service.servirRestaurations(commune);
    console.log(`${b.restaurees} restauration(s) faite(s) sur ${b.traitees} demande(s) ouverte(s).`);
    for (const e of b.echecs) console.log(`  non servie : demande ${e.demande} — ${e.raison}`);
    if (b.echecs.length) process.exitCode = 1;
  } else {
    console.error('Usage : conservationMedias.ts initialiser | compresser | restaurer');
    process.exitCode = 2;
  }
} finally {
  await pool.end();
}
