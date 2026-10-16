// Les indicateurs de communication de la commune (B5.5.4 : délai, volumétrie, taux).
//
// Trois questions qu'une commune se pose après avoir écrit à ses habitants : mes
// messages arrivent-ils et sont-ils lus ? combien d'habitants ne puis-je pas
// joindre ? en combien de temps est-ce que je réponds aux points qu'ils me
// proposent ? La base calcule (migration 079) ; l'écran ne fait qu'afficher.
//
// UN TAUX SANS DÉNOMINATEUR N'EST PAS 0 % : l'écran dit « non renseigné », et
// donne à côté de chaque taux ce sur quoi il porte (« 30 sur 35 »). Un 100 % sur
// un seul envoi ne se lit pas comme un 100 % sur mille.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type IndicateursCommunication as Indicateurs } from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { aujourdhuiTunis } from '../kpi/temps';
import { Chargement } from '../Elements';

const TAUX = ['livraison', 'lecture', 'portee', 'validation_suggestions', 'participation_sondages'] as const;

/** Un an glissant, jusqu'à aujourd'hui (heure de Tunis). */
function anGlissant() {
  const fin = aujourdhuiTunis();
  const d = new Date(`${fin}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  d.setUTCDate(d.getUTCDate() + 1);
  return { debut: d.toISOString().slice(0, 10), fin };
}

function Carte({ titre, valeur, detail }: { titre: string; valeur: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-ardoise-200 bg-white p-3">
      <p className="text-xs text-ardoise-600">{titre}</p>
      <p className="chiffres mt-1 text-xl font-semibold text-ardoise-900">{valeur}</p>
      {detail && <p className="mt-1 text-xs text-ardoise-500">{detail}</p>}
    </div>
  );
}

export function IndicateursCommunication({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const [periode, setPeriode] = useState(anGlissant);
  const [donnees, setDonnees] = useState<Indicateurs | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!periode.debut || !periode.fin || periode.debut > periode.fin) return;
    setDonnees(null);
    setErreur(null);
    api
      .indicateursCommunication(communeId, periode.debut, periode.fin)
      .then(setDonnees)
      .catch((err) => setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur')));
  }, [communeId, periode, t]);

  const n = (x: number) => formaterNombre(x, 0);
  const nonRenseigne = t('kpi.statuts.non_renseigne');

  return (
    <section className="space-y-4" aria-labelledby="indicateurs-communication">
      <header className="space-y-1">
        <h2 id="indicateurs-communication" className="text-lg font-semibold text-ardoise-900">{t('communal.communication.indicateurs.titre')}</h2>
        <p className="max-w-3xl text-sm text-ardoise-600">{t('communal.communication.indicateurs.aide')}</p>
      </header>

      <div className="flex flex-wrap items-end gap-2">
        {(['debut', 'fin'] as const).map((b) => (
          <label key={b} className="text-sm">
            <span className="block text-ardoise-600">{t(`communal.communication.indicateurs.${b}`)}</span>
            <input
              type="date"
              value={periode[b]}
              max={aujourdhuiTunis()}
              onChange={(e) => setPeriode((p) => ({ ...p, [b]: e.target.value }))}
              className="mt-1 min-h-10 rounded-lg border border-ardoise-300 bg-white px-2 text-sm"
            />
          </label>
        ))}
        {periode.debut > periode.fin && (
          <p role="alert" className="text-sm text-red-800">{t('communal.communication.indicateurs.bornes')}</p>
        )}
      </div>

      {erreur && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>}
      {!donnees && !erreur && periode.debut <= periode.fin && <Chargement />}

      {donnees && (
        <>
          <section className="space-y-2" aria-labelledby="ic-volumetrie">
            <h3 id="ic-volumetrie" className="font-semibold text-ardoise-900">{t('communal.communication.indicateurs.volumetrie')}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Carte
                titre={t('communal.communication.indicateurs.publications')}
                valeur={n(donnees.volumetrie.publications.notification + donnees.volumetrie.publications.sondage + donnees.volumetrie.publications.projet)}
                detail={t('communal.communication.indicateurs.publicationsDetail', {
                  notifications: n(donnees.volumetrie.publications.notification),
                  sondages: n(donnees.volumetrie.publications.sondage),
                  projets: n(donnees.volumetrie.publications.projet),
                })}
              />
              <Carte
                titre={t('communal.communication.indicateurs.envois')}
                valeur={n(donnees.volumetrie.envois)}
                detail={t('communal.communication.indicateurs.envoisDetail', {
                  joints: n(donnees.volumetrie.destinataires),
                  sansAdresse: n(donnees.volumetrie.sans_adresse),
                  desabonnes: n(donnees.volumetrie.desabonnes),
                })}
              />
              <Carte
                titre={t('communal.communication.indicateurs.individuels')}
                valeur={n(donnees.volumetrie.envois_individuels.total)}
                detail={t('communal.communication.indicateurs.individuelsDetail', {
                  livres: n(donnees.volumetrie.envois_individuels.livre),
                  echecs: n(donnees.volumetrie.envois_individuels.echec),
                  nonJoints: n(
                    donnees.volumetrie.envois_individuels.non_abonne +
                      donnees.volumetrie.envois_individuels.non_souhaite +
                      donnees.volumetrie.envois_individuels.sans_souscription
                  ),
                })}
              />
              <Carte
                titre={t('communal.communication.indicateurs.courriels')}
                valeur={n(donnees.volumetrie.courriels.total)}
                detail={t('communal.communication.indicateurs.courrielsDetail', {
                  envoyes: n(donnees.volumetrie.courriels.envoye),
                  echecs: n(donnees.volumetrie.courriels.echec),
                  nonConfigure: n(donnees.volumetrie.courriels.non_configure),
                })}
              />
              <Carte titre={t('communal.communication.indicateurs.suggestions')} valeur={n(donnees.volumetrie.suggestions_recues)} />
              <Carte titre={t('communal.communication.indicateurs.repondants')} valeur={n(donnees.volumetrie.repondants_sondage)} />
            </div>
          </section>

          <section className="space-y-2" aria-labelledby="ic-delais">
            <h3 id="ic-delais" className="font-semibold text-ardoise-900">{t('communal.communication.indicateurs.delais')}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Carte
                titre={t('communal.communication.indicateurs.delaiDecision')}
                valeur={
                  donnees.delais.decision_suggestion_h.mediane == null
                    ? nonRenseigne
                    : t('communal.communication.indicateurs.heures', { n: formaterNombre(donnees.delais.decision_suggestion_h.mediane, 1) })
                }
                detail={t('communal.communication.indicateurs.surDecisions', { n: n(donnees.delais.decision_suggestion_h.decisions) })}
              />
              <Carte
                titre={t('communal.communication.indicateurs.enAttente')}
                valeur={n(donnees.delais.suggestions_en_attente.nombre)}
                detail={
                  donnees.delais.suggestions_en_attente.plus_ancienne_jours == null
                    ? undefined
                    : t('communal.communication.indicateurs.plusAncienne', { n: n(donnees.delais.suggestions_en_attente.plus_ancienne_jours) })
                }
              />
            </div>
          </section>

          <section className="space-y-2" aria-labelledby="ic-taux">
            <h3 id="ic-taux" className="font-semibold text-ardoise-900">{t('communal.communication.indicateurs.tauxTitre')}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TAUX.map((k) => {
                const x = donnees.taux[k];
                return (
                  <Carte
                    key={k}
                    titre={t(`communal.communication.indicateurs.taux.${k}`)}
                    valeur={x.valeur == null ? nonRenseigne : `${formaterNombre(x.valeur * 100, 1)} %`}
                    detail={
                      x.valeur == null
                        ? t(`communal.communication.indicateurs.tauxVide.${k}`)
                        : t('communal.communication.indicateurs.sur', { n: n(x.numerateur), d: n(x.denominateur) })
                    }
                  />
                );
              })}
            </div>
          </section>
          <p className="text-xs text-ardoise-500">{t('communal.communication.indicateurs.note')}</p>
        </>
      )}
    </section>
  );
}
