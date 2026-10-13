// Ajouter un agent (refonte, lot 2b ; catalogue « Mon équipe »).
//
// L'API savait créer un agent depuis le module 4 ; aucun écran ne l'appelait,
// et l'effectif ne s'alimentait que par les jeux chargés. Le formulaire reste
// court : un nom, une fonction, et ce qui sert au pointage et au coût du
// service. Le grade, la classe et l'échelon se complètent plus tard.
//
// CE QU'IL NE DEMANDE JAMAIS (CLAUDE.md § 2, loi 2004-63) : ni CIN, ni
// salaire, ni adresse personnelle — la base n'a pas ces colonnes.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi } from '../../lib/api';
import { CadreAjout, champAjout } from './CadreAjout';
import type { PropsFormulaireAjout } from './registre';

// Les listes de l'API (personnel.routes.ts) : une valeur hors liste y est refusée.
const FONCTIONS = [
  'chauffeur', 'agent', 'chef_equipe', 'agent_balayage', 'encadrement', 'ripeur', 'tractoriste',
  'mecanicien', 'jardinier', 'agent_hygiene', 'magasinier', 'gardien', 'administratif',
] as const;
const STATUTS = ['titulaire', 'contractuel', 'occasionnel', 'mise_a_disposition', 'prestataire'] as const;
const SERVICES = ['proprete', 'espaces_verts', 'hygiene', 'atelier', 'administratif'] as const;

export function FormulaireAgent({ communeId, onFait, onAnnuler }: PropsFormulaireAjout) {
  const { t } = useTranslation();
  const [nomComplet, setNomComplet] = useState('');
  const [fonction, setFonction] = useState<(typeof FONCTIONS)[number]>('agent');
  const [matricule, setMatricule] = useState('');
  const [statut, setStatut] = useState<(typeof STATUTS)[number]>('titulaire');
  const [service, setService] = useState<(typeof SERVICES)[number]>('proprete');
  const [dateRecrutement, setDateRecrutement] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      await api.creerAgent(communeId, {
        nomComplet: nomComplet.trim(),
        fonction,
        matricule: matricule.trim() || null,
        statut,
        service,
        dateRecrutement: dateRecrutement || null,
      });
      await onFait();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <CadreAjout
      id="ajout-agent"
      titre={t('ajout.agent.titre')}
      aide={t('ajout.agent.aide')}
      erreur={erreur}
      enregistrable={nomComplet.trim().length >= 2}
      envoi={envoi}
      onEnregistrer={enregistrer}
      onAnnuler={onAnnuler}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm" htmlFor="agent-nom">
          {t('ajout.agent.nom')}
          <input id="agent-nom" required minLength={2} maxLength={120} value={nomComplet} onChange={(e) => setNomComplet(e.target.value)} className={champAjout} />
        </label>
        <label className="text-sm" htmlFor="agent-fonction">
          {t('ajout.agent.fonction')}
          <select id="agent-fonction" value={fonction} onChange={(e) => setFonction(e.target.value as typeof fonction)} className={champAjout}>
            {FONCTIONS.map((f) => (
              <option key={f} value={f}>{t(`communal.personnel.fonctions.${f}`)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm" htmlFor="agent-statut">
          {t('ajout.agent.statut')}
          <select id="agent-statut" value={statut} onChange={(e) => setStatut(e.target.value as typeof statut)} className={champAjout}>
            {STATUTS.map((s) => (
              <option key={s} value={s}>{t(`ajout.agent.statuts.${s}`)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm" htmlFor="agent-service">
          {t('ajout.agent.service')}
          <select id="agent-service" value={service} onChange={(e) => setService(e.target.value as typeof service)} className={champAjout}>
            {SERVICES.map((s) => (
              <option key={s} value={s}>{t(`ajout.agent.services.${s}`)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm" htmlFor="agent-matricule">
          {t('ajout.agent.matricule')}
          <input id="agent-matricule" maxLength={40} dir="ltr" value={matricule} onChange={(e) => setMatricule(e.target.value)} className={champAjout} />
        </label>
        <label className="text-sm" htmlFor="agent-recrutement">
          {t('ajout.agent.dateRecrutement')}
          <input id="agent-recrutement" type="date" value={dateRecrutement} onChange={(e) => setDateRecrutement(e.target.value)} className={champAjout} />
        </label>
      </div>
    </CadreAjout>
  );
}
