import type { Request } from 'express';

/**
 * Commune sur laquelle porte une requête de lecture.
 *
 * Règle : une commune explicitement demandée l'emporte toujours. À défaut, on
 * retombe sur la commune de rattachement de l'utilisateur — SAUF pour un
 * gestionnaire prestataire.
 *
 * Pourquoi cette exception. La migration 020 a ouvert le multi-communes : un
 * prestataire travaille avec UN compte pour plusieurs communes sous contrat.
 * Or `users.commune_id` ne porte que son rattachement PRINCIPAL. Retomber
 * dessus filtrait silencieusement ses autres communes : ses tournées de Midoun
 * n'apparaissaient pas, et il aurait conclu que la plateforme les avait
 * perdues. En ne filtrant pas, on laisse le cloisonnement au seul endroit qui
 * connaît vraiment son périmètre — les politiques RLS, qui s'appuient sur
 * app.mes_communes().
 *
 * Ne jamais « corriger » ceci en réintroduisant un filtre applicatif : ce
 * n'est pas une protection (RLS la fournit déjà), c'est une amputation.
 */
export function communeDemandee(req: Request): string | null {
  if (typeof req.query.communeId === 'string' && req.query.communeId !== '') {
    return req.query.communeId;
  }
  if (req.user?.role === 'gestionnaire_prestataire') return null;
  return req.user?.communeId ?? null;
}
