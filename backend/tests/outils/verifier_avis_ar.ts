// Chaque texte de « À vérifier » écrit dans la base a-t-il son arabe ? (campagne `avis-ar`)
//
// Lit la définition des fonctions `app.incoherences_*`, en retire les textes qu'elles écrivent
// (services/avisAr.ts › textesDuSql) et exige un modèle pour chacun — et, à l'inverse, qu'aucun
// modèle ne reste sans texte dans le SQL (un modèle orphelin est une traduction d'un avis qui n'existe
// plus, ou dont la phrase française a changé sans que l'arabe suive).
//
// Ce n'est pas une campagne : il est rangé sous tests/outils/ et ne sort que des lignes « clé=valeur »
// que la campagne lit.
import { pool } from '../../src/db.js';
import { MODELES, textesDuSql, traduireAvis } from '../../src/services/avisAr.js';

const { rows } = await pool.query<{ proname: string; def: string }>(
  `SELECT p.proname, pg_get_functiondef(p.oid) AS def
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app' AND p.proname LIKE 'incoherences\\_%' AND p.proname <> 'incoherences_commune'
    ORDER BY p.proname`
);

const textes = rows.flatMap((r) => textesDuSql(r.def).map((texte) => ({ fonction: r.proname, texte })));
const AVEC_ARABE = /[؀-ۿ]/;
const sansModele: string[] = [];
const mal_rendus: string[] = [];
for (const { fonction, texte } of textes) {
  // Chaque « %s » reçoit une valeur d'essai : le modèle doit reconnaître le texte rendu.
  const rendu = texte.replace(/%s/g, 'valeur');
  const ar = traduireAvis(rendu);
  if (ar === null) sansModele.push(`${fonction} : ${texte}`);
  else if (!AVEC_ARABE.test(ar) || /\{\d+\}/.test(ar)) mal_rendus.push(`${fonction} : ${texte}`);
}

// Les modèles de phrases (une espace et un point, ou une valeur) qui ne sont plus dans le SQL.
const dansLeSql = new Set(textes.map((t) => t.texte));
const phrases = MODELES.filter((m) => m.fr.includes(' ') && (m.fr.endsWith('.') || m.fr.includes('%s')));
const orphelins = phrases.filter((m) => !dansLeSql.has(m.fr)).map((m) => m.fr);

console.log(`fonctions=${rows.length}`);
console.log(`textes=${textes.length}`);
console.log(`sans_modele=${sansModele.length}`);
for (const s of sansModele) console.log(`  SANS MODÈLE — ${s}`);
console.log(`mal_rendus=${mal_rendus.length}`);
for (const s of mal_rendus) console.log(`  MAL RENDU — ${s}`);
console.log(`orphelins=${orphelins.length}`);
for (const s of orphelins) console.log(`  ORPHELIN — ${s}`);
await pool.end();
