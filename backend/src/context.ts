// Contexte de sécurité de la requête en cours.
//
// Le cloisonnement entre communes est appliqué par PostgreSQL (Row-Level
// Security, migration 013). Pour que la base sache QUI interroge, chaque
// transaction déclare l'utilisateur courant via trois variables de session :
// app.user_id, app.role et app.commune_id.
//
// Ce contexte est propagé automatiquement par AsyncLocalStorage : aucune route
// n'a besoin de le passer explicitement, et une route qui oublierait de filtrer
// par commune ne verra malgré tout que les lignes autorisées.

import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  userId: string | null;
  /** Rôle RBAC, ou 'anonyme' avant authentification. */
  role: string;
  communeId: string | null;
}

/** Aucune authentification : la base ne renverra aucune ligne métier. */
export const ANONYMOUS_CONTEXT: RequestContext = {
  userId: null,
  role: 'anonyme',
  communeId: null,
};

const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentContext(): RequestContext {
  return requestContext.getStore() ?? ANONYMOUS_CONTEXT;
}

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return requestContext.run(context, fn);
}
