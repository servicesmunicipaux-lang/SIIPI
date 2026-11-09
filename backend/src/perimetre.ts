import type { Request } from 'express';
import { ApiError } from './middleware/errorHandler.js';

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

/**
 * La commune d'une requête qui en exige une : celle que désigne communeDemandee,
 * ou un refus qui dit quoi corriger.
 *
 * Un caractère de contrôle (l'octet nul) dans l'identifiant ferait échouer
 * PostgreSQL (500) : un tel identifiant ne désigne aucune commune, elle est
 * introuvable (404), comme une commune hors du périmètre.
 */
export function communeRequise(req: Request): string {
  const c = communeDemandee(req);
  if (!c) throw new ApiError(400, 'Commune requise (paramètre communeId).');
  if (/[\u0000-\u001f]/.test(c)) throw new ApiError(404, 'Commune introuvable.');
  return c;
}
