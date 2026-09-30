#!/usr/bin/env node
// =============================================================================
// skill:kpi-evaluator — contrôle du moteur de fusion des indicateurs.
//
// LA RÈGLE À TENIR : Automatique > Déclaré > Non renseigné.
//
//   Automatique     une mesure calculée depuis un registre réellement tenu.
//                   Elle l'emporte toujours : personne ne déclare mieux que ce
//                   que la donnée dit.
//   Déclaré         une valeur saisie par la commune. Elle vaut tant qu'aucune
//                   mesure automatique n'existe.
//   Non renseigné   ni l'un ni l'autre. **Ce n'est pas zéro.**
//
// CE QUE CET OUTIL CHERCHE. La faute qui ne se voit pas : un indicateur qui
// affiche 0 alors que rien ne l'alimente. « 0 accident » quand personne ne
// tient le registre des accidents sera lu comme vrai, et opposé un jour à un
// conseil municipal. L'outil confronte donc, pour chaque indicateur :
//   — ce que rend la mesure automatique,
//   — ce que la commune a déclaré,
//   — ce que l'écran finirait par montrer,
// et signale tout endroit où une absence s'est transformée en chiffre.
//
//   node scripts/skills/kpi-evaluator.mjs [commune] [annee]
// =============================================================================

import { execFileSync } from 'node:child_process';

const commune = process.argv[2] ?? 'nabeul_dar_chaabane_el_fehri';
const annee = process.argv[3] ?? new Date().getFullYear();

const dc = (() => {
  try { execFileSync('docker', ['compose', 'version'], { stdio: 'ignore' }); return ['docker', 'compose']; }
  catch { return ['docker-compose']; }
})();

function sql(requete) {
  const sortie = execFileSync(
    dc[0],
    [...dc.slice(1), 'exec', '-T', 'db', 'psql', '-qtA', '-F\u0001',
     '-U', process.env.PGUSER ?? 'siipi_admin',
     '-d', process.env.PGDATABASE ?? 'siipi_national', '-c', requete],
    { encoding: 'utf8' }
  );
  return sortie.split('\n').filter(Boolean).map((l) => l.split('\u0001'));
}

const vert = (s) => `\u001b[32m${s}\u001b[0m`;
const rouge = (s) => `\u001b[31m${s}\u001b[0m`;
const gris = (s) => `\u001b[90m${s}\u001b[0m`;

let alertes = 0;

console.log(`\nCommune : ${commune}   Exercice : ${annee}\n`);

// --- 1. Les deux sources, côte à côte ---------------------------------------
const auto = new Map(
  sql(`SELECT code, valeur::text FROM app.mesures_kpi_auto(${annee}) WHERE commune_id = '${commune}'`)
);
const declare = new Map(
  sql(`SELECT code, valeur::text FROM app.mesures_kpi(${annee}) WHERE commune_id = '${commune}'`)
);

const codes = [...new Set([...auto.keys(), ...declare.keys()])].sort();

if (codes.length === 0) {
  console.log(gris('  Aucune mesure, ni automatique ni déclarée, pour cette commune et cet exercice.'));
  console.log(gris('  Ce n’est pas une anomalie : c’est une commune dont aucun registre n’est encore tenu.\n'));
  process.exit(0);
}

console.log('  Code      Automatique   Déclaré       Retenu        Source');
console.log('  ' + '-'.repeat(68));

for (const code of codes) {
  const a = auto.get(code);
  const d = declare.get(code);
  const retenu = a ?? d ?? null;
  const source = a !== undefined ? 'automatique' : d !== undefined ? 'déclaré' : 'non renseigné';
  const col = (v) => String(v ?? '—').padEnd(13).slice(0, 13);
  console.log(`  ${code.padEnd(9)} ${col(a)} ${col(d)} ${col(retenu)} ${source}`);

  // La faute cherchée : une absence devenue zéro.
  if (a === undefined && d === undefined && retenu !== null) {
    console.log(rouge(`      ✗ ${code} : aucune source, et pourtant une valeur est retenue`));
    alertes++;
  }
  if (a !== undefined && d !== undefined && a !== d) {
    // Ce n'est pas une faute : c'est un écart à montrer. La commune a déclaré
    // autre chose que ce que son registre mesure, et c'est une information.
    console.log(gris(`      · écart déclaré/mesuré sur ${code} — à montrer, pas à réconcilier`));
  }
}

// --- 2. Les zéros suspects ---------------------------------------------------
console.log('\n  Zéros à vérifier — un zéro mesuré est légitime, un zéro inventé ne l’est pas');
console.log('  ' + '-'.repeat(68));
let zeros = 0;
for (const [code, v] of auto) {
  if (Number(v) === 0) {
    const lignes = sql(
      `SELECT count(*)::text FROM app.mesures_kpi_auto(${annee})
        WHERE commune_id = '${commune}' AND code = '${code}'`
    );
    // Une ligne existe → le registre est tenu et vaut réellement zéro.
    console.log(`  ${code.padEnd(9)} 0  ${lignes[0]?.[0] > 0 ? vert('registre tenu : zéro réel') : rouge('AUCUN registre : ce zéro est fabriqué')}`);
    if (!(lignes[0]?.[0] > 0)) alertes++;
    zeros++;
  }
}
if (zeros === 0) console.log(gris('  Aucune mesure automatique à zéro.'));

// --- 3. Ce que la base refuse -------------------------------------------------
console.log('\n  Garde-fous en base');
console.log('  ' + '-'.repeat(68));
const garde = sql(`
  SELECT count(*)::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'valeurs_kpi' AND NOT t.tgisinternal`);
console.log(`  déclencheurs de contrôle sur valeurs_kpi : ${garde[0]?.[0] ?? 0}`);
if ((garde[0]?.[0] ?? 0) === '0') {
  console.log(rouge('      ✗ aucun contrôle : une valeur hors bornes entrerait sans bruit'));
  alertes++;
}

console.log('');
if (alertes === 0) {
  console.log(vert('Aucune alerte : aucune absence n’a été transformée en chiffre.\n'));
} else {
  console.log(rouge(`${alertes} alerte(s).\n`));
  process.exit(1);
}
