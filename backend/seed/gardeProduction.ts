// Ce qu'un chargement a le droit de poser dans une base de production (préparation de R1).
//
// Une base de production ne reçoit que du réel. Les chargements d'une commune
// mêlent les deux : à Dar Chaabane, les circuits, le parc et la masse salariale
// viennent des registres de la commune, mais les noms des agents sont fabriqués
// (loi organique n° 2004-63) et les contenus de communication sont des exemples.
// Chargés en production, ces derniers seraient lus comme le registre réel de la
// commune : un pointage sur des agents qui n'existent pas, un sondage qu'un élu
// prendrait pour une consultation.
//
// La nature se lit sans être fixée (instance.ts) : un chargement ne décide pas
// de ce qu'est la base.
const { natureSansFixer } = await import('../src/instance.js');

export async function enProduction(): Promise<boolean> {
  return (await natureSansFixer()) === 'production';
}

/** Arrête un chargement dont rien n'a sa place dans une base de production. */
export async function refuserEnProduction(chargement: string, raison: string): Promise<void> {
  if (!(await enProduction())) return;
  console.error(
    `[${chargement}] Refusé : la base est une base de PRODUCTION. ${raison} Rien n'a été chargé.`
  );
  const { pool } = await import('../src/db.js');
  await pool.end();
  process.exit(1);
}
