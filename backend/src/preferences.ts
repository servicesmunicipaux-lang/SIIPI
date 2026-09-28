// Préférences personnelles (TDR §3.2.6 — B6.2, B6.4, B6.6).
//
// Rangées sur le compte (users.preferences, migration 048), pour qu'elles
// suivent la personne d'un poste à l'autre. Une clé absente vaut sa valeur par
// défaut : on ne stocke que ce que la personne a choisi, et un défaut changé
// demain s'appliquera à tous ceux qui n'ont rien choisi.

import { z } from 'zod';

export const FORMATS_DATE = ['jj/mm/aaaa', 'aaaa-mm-jj', 'jj mois aaaa'] as const;
export const UNITES_MASSE = ['t', 'kg'] as const;
export const UNITES_VOLUME = ['m3', 'l'] as const;
export const UNITES_SURFACE = ['km2', 'ha'] as const;
/** Les domaines du panneau « À vérifier » (migrations 033 à 036, et 048). */
export const DOMAINES_ALERTE = ['circuits', 'parc', 'personnel', 'communication', 'pesees', 'reclamations', 'points'] as const;
export const GRAVITES = ['information', 'avertissement', 'bloquant'] as const;

export const preferencesSchema = z
  .object({
    langue: z.enum(['fr', 'ar']).optional(),
    formatDate: z.enum(FORMATS_DATE).optional(),
    unites: z
      .object({
        masse: z.enum(UNITES_MASSE).optional(),
        volume: z.enum(UNITES_VOLUME).optional(),
        surface: z.enum(UNITES_SURFACE).optional(),
      })
      .strict()
      .optional(),
    alertes: z
      .object({
        // Un domaine masqué ne cache jamais un avis « bloquant » : c'est au
        // front de le garantir, et à l'écran de le dire.
        domainesMasques: z.array(z.enum(DOMAINES_ALERTE)).max(DOMAINES_ALERTE.length).optional(),
        graviteMin: z.enum(GRAVITES).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type Preferences = z.infer<typeof preferencesSchema>;

export interface PreferencesCompletes {
  langue: 'fr' | 'ar' | null;
  formatDate: (typeof FORMATS_DATE)[number];
  unites: { masse: (typeof UNITES_MASSE)[number]; volume: (typeof UNITES_VOLUME)[number]; surface: (typeof UNITES_SURFACE)[number] };
  alertes: { domainesMasques: (typeof DOMAINES_ALERTE)[number][]; graviteMin: (typeof GRAVITES)[number] };
}

/** Ce qui est stocké, complété des valeurs par défaut. */
export function completer(brut: unknown): PreferencesCompletes {
  // Une valeur stockée qui ne passe plus le contrôle (un format retiré depuis)
  // retombe sur le défaut plutôt que de casser l'écran.
  const lu = preferencesSchema.safeParse(brut ?? {});
  const p: Preferences = lu.success ? lu.data : {};
  return {
    // null : la personne n'a rien choisi, le navigateur garde sa langue.
    langue: p.langue ?? null,
    formatDate: p.formatDate ?? 'jj/mm/aaaa',
    unites: {
      masse: p.unites?.masse ?? 't',
      volume: p.unites?.volume ?? 'm3',
      surface: p.unites?.surface ?? 'km2',
    },
    alertes: {
      domainesMasques: [...new Set(p.alertes?.domainesMasques ?? [])],
      graviteMin: p.alertes?.graviteMin ?? 'information',
    },
  };
}

/** Fusionne un changement partiel dans ce qui est stocké. */
export function fusionner(stocke: unknown, changement: Preferences): Preferences {
  const actuel = preferencesSchema.safeParse(stocke ?? {});
  const a: Preferences = actuel.success ? actuel.data : {};
  return {
    ...a,
    ...(changement.langue !== undefined ? { langue: changement.langue } : {}),
    ...(changement.formatDate !== undefined ? { formatDate: changement.formatDate } : {}),
    ...(changement.unites ? { unites: { ...a.unites, ...changement.unites } } : {}),
    ...(changement.alertes ? { alertes: { ...a.alertes, ...changement.alertes } } : {}),
  };
}
