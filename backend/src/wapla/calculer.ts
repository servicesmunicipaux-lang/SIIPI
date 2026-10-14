// Le moteur WaPla en ligne de commande (lot W1a) : une liste de jeux d'entrées
// sur l'entrée standard, une liste de résultats sur la sortie.
//
// Chaque jeu ne donne que ce qui change par rapport aux valeurs par défaut de
// l'outil d'origine. C'est par ici que la campagne `wapla-moteur` confronte le
// moteur à son témoin indépendant (tests/wapla_attendus.py), sans base ni API :
// le moteur n'en a pas.
//
//   echo '[{}, {"tc_4": 0.1}]' | npm run -s wapla:calculer

import { calculerWapla, DEFAUTS_WAPLA, ErreurMoteur } from './moteur.js';

const morceaux: Buffer[] = [];
for await (const m of process.stdin) morceaux.push(m as Buffer);
const jeux = JSON.parse(Buffer.concat(morceaux).toString('utf8')) as Record<string, unknown>[];

const resultats = jeux.map((jeu) => {
  try {
    return calculerWapla({ ...DEFAUTS_WAPLA, ...jeu });
  } catch (err) {
    if (err instanceof ErreurMoteur) return { erreur: err.code, message: err.message };
    throw err;
  }
});
process.stdout.write(JSON.stringify(resultats));
