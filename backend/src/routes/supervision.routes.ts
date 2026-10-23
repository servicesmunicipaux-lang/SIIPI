// ---------------------------------------------------------------------------
// L'état de l'exploitation, vu par la FNCT (chantier P, lot P5).
//
// La surveillance est un service À PART (backend/exploitation/surveillance/) :
// on ne confie pas à l'API le soin de dire que l'API est tombée. Toutes les
// 5 minutes, elle écrit son constat dans SUPERVISION_ETAT_DIR/etat.json, que
// l'API lit ici, en lecture seule, sans rien recalculer.
//
// UN ÉTAT PÉRIMÉ SE DIT PÉRIMÉ. Si la surveillance elle-même s'arrête, son
// dernier constat reste dans le fichier : le rendre tel quel ferait passer pour
// actuel un « tout va bien » d'il y a trois jours. L'âge du constat est donc
// toujours rendu, et au-delà de trois intervalles, `perime` le dit.
//
// Rien de secret ne sort : ni les destinataires des alertes, ni le serveur de
// courriel — seulement si les alertes peuvent partir.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const supervisionRouter = Router();

/** Les contrôles, dans l'ordre où l'écran les montre. */
export const CONTROLES = ['api', 'frontal', 'certificat', 'sauvegarde', 'copie', 'disque'] as const;
export const ETATS = ['ok', 'panne', 'avertissement', 'non_verifie'] as const;

const dossierEtat = () => process.env.SUPERVISION_ETAT_DIR ?? '/var/siipi/supervision';

interface ConstatFichier {
  verifie_le?: string;
  intervalle_s?: number;
  alertes_configurees?: boolean;
  controles?: Record<string, { etat?: string; message?: string; message_ar?: string; depuis?: string }>;
  derniere_alerte?: { le?: string; sujet?: string; statut?: string } | null;
}

supervisionRouter.get(
  '/etat',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (_req, res) => {
    let constat: ConstatFichier | null = null;
    try {
      constat = JSON.parse(await readFile(path.join(dossierEtat(), 'etat.json'), 'utf8')) as ConstatFichier;
    } catch {
      constat = null;
    }
    const verifieLe = constat?.verifie_le ? new Date(constat.verifie_le) : null;
    if (!constat || !verifieLe || Number.isNaN(verifieLe.getTime())) {
      // Pas de constat : la surveillance n'a jamais écrit ici. Rien n'est supposé.
      res.json({
        disponible: false,
        verifie_le: null,
        age_minutes: null,
        perime: null,
        alertes_configurees: null,
        controles: [],
        derniere_alerte: null,
      });
      return;
    }
    const ageMinutes = Math.max(0, Math.floor((Date.now() - verifieLe.getTime()) / 60000));
    const intervalle = constat.intervalle_s && constat.intervalle_s > 0 ? constat.intervalle_s : 300;
    const derniere = constat.derniere_alerte;
    res.json({
      disponible: true,
      verifie_le: verifieLe.toISOString(),
      age_minutes: ageMinutes,
      perime: ageMinutes * 60 > 3 * intervalle,
      alertes_configurees: constat.alertes_configurees === true,
      controles: CONTROLES.map((controle) => {
        const c = constat?.controles?.[controle];
        const brut = c?.etat ?? '';
        const etat = (ETATS as readonly string[]).includes(brut) ? (brut as (typeof ETATS)[number]) : 'non_verifie';
        return {
          controle,
          etat,
          depuis: c?.depuis ?? null,
          message: c?.message ?? null,
          message_ar: c?.message_ar ?? null,
        };
      }),
      // Le sujet et l'issue de la dernière alerte ; jamais à qui elle est partie.
      derniere_alerte:
        derniere && derniere.le ? { le: derniere.le, sujet: derniere.sujet ?? '', envoyee: derniere.statut === 'envoye' } : null,
    });
  })
);
