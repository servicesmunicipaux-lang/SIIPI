// Le moteur WaPla en ligne de commande (lots W1a, W1b) : une liste de jeux
// d'entrées sur l'entrée standard, une liste de résultats sur la sortie.
//
// Chaque jeu ne donne que ce qui change par rapport aux valeurs par défaut de
// l'outil d'origine. C'est par ici que la campagne `wapla-moteur` confronte le
// moteur à son témoin indépendant (tests/wapla_attendus.py), sans base ni API :
// le moteur n'en a pas.
//
//   echo '[{}, {"tc_4": 0.1}]' | npm run -s wapla:calculer                     # mode corrigé
//   echo '[{}]' | npm run -s wapla:calculer -- --mode=fidele
//   echo '[{}]' | npm run -s wapla:calculer -- --corrections=D7,D8             # campagnes : défauts choisis

import { calculerWapla, DEFAUTS, DEFAUTS_WAPLA, ErreurMoteur, type CodeDefaut, type ModeMoteur } from './moteur.js';

const argument = (nom: string) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);
const mode = argument('mode') as ModeMoteur | undefined;
const liste = argument('corrections');
const corrections = liste === undefined ? undefined : (liste.split(',').filter(Boolean) as CodeDefaut[]);
if (mode !== undefined && mode !== 'fidele' && mode !== 'corrige') throw new Error(`Mode inconnu : ${mode} (fidele ou corrige).`);
for (const d of corrections ?? []) if (!DEFAUTS.includes(d)) throw new Error(`Défaut inconnu : ${d} (D1 à D10).`);

const morceaux: Buffer[] = [];
for await (const m of process.stdin) morceaux.push(m as Buffer);
const jeux = JSON.parse(Buffer.concat(morceaux).toString('utf8')) as Record<string, unknown>[];

const resultats = jeux.map((jeu) => {
  try {
    return calculerWapla({ ...DEFAUTS_WAPLA, ...jeu }, { mode, corrections });
  } catch (err) {
    if (err instanceof ErreurMoteur) return { erreur: err.code, message: err.message };
    throw err;
  }
});
process.stdout.write(JSON.stringify(resultats));
