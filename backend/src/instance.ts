// Production, formation, développement (décision FNCT D-FNCT-5).
//
// DEUX SOURCES, ET LA BASE A LE DERNIER MOT. L'environnement dit ce que
// l'exploitant DEMANDE (PRODUCTION, FORMATION, NODE_ENV) ; la base dit ce
// qu'elle EST (migration 067). La première fois qu'une base est servie en
// production ou en formation, elle le devient pour toujours. Ensuite :
//
//   - une base de production servie avec FORMATION=true : l'API refuse de
//     démarrer — le mode formation n'est jamais activable sur la production ;
//   - une base de formation servie avec PRODUCTION=true : refus aussi — ses
//     données sont fictives ;
//   - une base de production servie avec une configuration de développement
//     (un .env recopié, une variable oubliée) : elle reste une instance de
//     production, comptes de démonstration refusés. C'est le « même par erreur
//     de configuration » de la décision.
//
// La demande : FORMATION=true l'emporte sur NODE_ENV=production — l'image de
// production pose toujours NODE_ENV, et une instance de formation doit pouvoir
// en tourner (réponse de l'utilisateur du 9 octobre 2026). PRODUCTION=true et
// FORMATION=true ensemble se contredisent : refus.
import { pool } from './db.js';

export type NatureInstance = 'developpement' | 'formation' | 'production';

/** Un démarrage que l'API refuse : la raison est dite à l'exploitant, puis le processus s'arrête. */
export class RefusDemarrage extends Error {}

function vrai(valeur: string | undefined): boolean {
  return ['true', '1', 'oui', 'yes'].includes((valeur ?? '').trim().toLowerCase());
}

export function natureDemandee(env: NodeJS.ProcessEnv = process.env): NatureInstance {
  const formation = vrai(env.FORMATION);
  const production = vrai(env.PRODUCTION);
  if (formation && production) {
    throw new RefusDemarrage(
      'FORMATION=true et PRODUCTION=true se contredisent : une instance de formation n’est jamais une instance de production. ' +
        'Retirez l’une des deux variables.'
    );
  }
  if (formation) return 'formation';
  if (production || env.NODE_ENV === 'production') return 'production';
  return 'developpement';
}

let etablie: NatureInstance | null = null;

/** La nature inscrite en base, ou null si la base n'est pas encore migrée. */
async function natureEnBase(): Promise<NatureInstance | null> {
  try {
    const { rows } = await pool.query<{ nature: NatureInstance }>('SELECT nature FROM instance_siipi WHERE id');
    return rows[0]?.nature ?? 'developpement';
  } catch (err) {
    // 42P01 : la table n'existe pas encore (migrations en attente). La nature
    // sera établie dès qu'elle existera — à la première connexion au plus tard.
    if ((err as { code?: string }).code === '42P01') return null;
    throw err;
  }
}

/**
 * Concilie la demande et la base, fixe la nature en base au premier démarrage
 * en production ou en formation, et rend la nature effective. Lève
 * RefusDemarrage si les deux se contredisent.
 */
export async function etablirNatureInstance(): Promise<NatureInstance> {
  const demandee = natureDemandee();
  const enBase = await natureEnBase();
  if (enBase === null) return demandee;

  if (enBase === 'production' && demandee === 'formation') {
    throw new RefusDemarrage(
      'FORMATION=true sur une base de PRODUCTION : refusé. Le mode formation n’est jamais activable sur la base de production ; ' +
        'une instance de formation a sa propre base, dédiée.'
    );
  }
  if (enBase === 'formation' && demandee === 'production') {
    throw new RefusDemarrage(
      'Base de FORMATION servie en production : refusé. Ses données sont fictives et ses comptes de démonstration ouverts ; ' +
        'une instance de production a sa propre base.'
    );
  }
  let nature = enBase;
  if (enBase === 'developpement' && demandee !== 'developpement') {
    const { rows } = await pool.query<{ nature: NatureInstance }>(
      'SELECT app.fixer_nature_instance($1) AS nature',
      [demandee]
    );
    nature = rows[0].nature;
  }
  etablie = nature;
  return nature;
}

/** La nature effective, établie une fois pour toutes (et retentée tant que la base n'est pas migrée). */
export async function natureInstance(): Promise<NatureInstance> {
  return etablie ?? etablirNatureInstance();
}

/**
 * Pour le seed et les commandes : la nature, SANS rien fixer en base. Une
 * commande d'installation ne doit pas décider seule de ce qu'est la base ; elle
 * doit seulement ne pas créer de compte de démonstration là où ils sont refusés.
 */
export async function natureSansFixer(): Promise<NatureInstance> {
  const enBase = await natureEnBase();
  if (enBase && enBase !== 'developpement') return enBase;
  return natureDemandee();
}
