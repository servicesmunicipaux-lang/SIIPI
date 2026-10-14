// Un scénario du PCGD (lot W4b ; SPEC_wapla § 5 et § 6, point 3).
//
// Il part du statu quo (le bilan calculé) : chaque entrée garde sa provenance
// jusqu'à ce que la commune y pose une hypothèse. Le calcul le met à côté du
// statu quo — tonnes mises en décharge, tonnes brûlées à l'air libre,
// t CO₂-éq, mg TEQ — et donne l'écart de coût de ce qu'il AJOUTE : un procédé
// que le statu quo n'alimentait pas. Un procédé déjà en service garde son coût
// dans celui de SIIPI : l'écran ne demande pas les coûts du statu quo.
//
// FIGÉ, IL NE CHANGE PLUS : plus aucun champ, plus de calcul. La base le tient ;
// l'écran le dit en tête.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type LigneBilanWapla, type ScenarioWapla as Scenario } from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';
import { LigneEntree } from './BilanWapla';
import { COUTS_PROCEDES_AJOUTES, ENTREES_PLANIFICATION, GROUPES, INDICATEURS_COMPARES, PROCEDE_DE_LA_PART } from './presentation';
import { ResultatWapla } from './ResultatWapla';

const bouton = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50 disabled:opacity-40';
const boutonPrincipal = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-semibold text-white hover:bg-siipi-700 disabled:opacity-40';

/** Un écart signé : « +12,5 », « −3,0 » — le signe se lit, il ne se devine pas. */
function signe(v: number, decimales = 1) {
  const n = formaterNombre(Math.abs(v), decimales);
  return v > 0 ? `+${n}` : v < 0 ? `−${n}` : n;
}

export function ScenarioWapla({
  id,
  lignesBilan,
  fnct,
  onRetour,
}: {
  id: string;
  /** Les entrées du statu quo (valeurs par défaut comprises), pour ce que le scénario n'a pas touché. */
  lignesBilan: LigneBilanWapla[];
  fnct: boolean;
  onRetour: () => void;
}) {
  const { t } = useTranslation();
  const [s, setS] = useState<Scenario | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      setS(await api.scenarioWapla(id));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [id, t]);
  useEffect(() => {
    void charger();
  }, [charger]);

  const agir = async (action: () => Promise<unknown>) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(false);
    }
  };

  if (!s) return erreur ? <Erreur message={erreur} onReessayer={() => void charger()} /> : <Chargement />;

  const fige = s.statut === 'fige';
  const lectureSeule = fnct || fige || enCours;
  const entree = (cle: string) => s.entrees.find((e) => e.cle === cle);
  const ligne = (cle: string) => lignesBilan.find((l) => l.rubrique === 'entree' && l.cle === cle);
  const actif = (proc: string) => {
    const e = entree(proc);
    return e ? e.valeur === true : ligne(proc)?.valeur === 1;
  };
  const saisir = (cle: string) => (saisie: { valeur: number | boolean } | { defaut: true }) => {
    if ('valeur' in saisie) void agir(() => api.hypotheseScenarioWapla(id, cle, saisie.valeur));
  };
  const comparaison = s.comparaison;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <button type="button" className={bouton} onClick={onRetour}>{t('wapla.scenarios.retour')}</button>
        <h2 className="text-xl font-semibold text-ardoise-900">{t('wapla.scenarios.titre', { nom: s.nom })}</h2>
        {s.description && <p className="text-sm text-ardoise-600">{s.description}</p>}
        <p className="text-sm font-medium text-ardoise-600">{t('wapla.mention')}</p>
        {fige ? (
          <p role="status" className="rounded-xl border-2 border-ardoise-400 bg-ardoise-50 p-3 text-sm text-ardoise-900">
            {t('wapla.scenarios.fige', { le: s.fige_le?.slice(0, 10), version: s.version_moteur })}
          </p>
        ) : s.statut === 'brouillon' ? (
          <p className="rounded-xl border border-ardoise-200 bg-ardoise-50 p-3 text-sm text-ardoise-700">{t('wapla.scenarios.brouillon')}</p>
        ) : null}
        {fnct && <p className="text-sm text-ardoise-500">{t('wapla.fnctLecture')}</p>}
      </header>

      {erreur && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>}

      {!fnct && !fige && (
        <div className="flex flex-wrap gap-3">
          <button type="button" className={boutonPrincipal} disabled={enCours} onClick={() => void agir(() => api.calculerScenarioWapla(id))}>
            {t('wapla.scenarios.calculer')}
          </button>
          {s.statut === 'calcule' && (
            <button
              type="button"
              className={bouton}
              disabled={enCours}
              onClick={() => {
                if (window.confirm(t('wapla.scenarios.confirmerFiger'))) void agir(() => api.figerScenarioWapla(id));
              }}
            >
              {t('wapla.scenarios.figer')}
            </button>
          )}
        </div>
      )}

      {comparaison && (
        <section className="space-y-2" aria-labelledby="wapla-comparaison">
          <h3 id="wapla-comparaison" className="text-lg font-semibold text-ardoise-900">{t('wapla.scenarios.comparaison')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="text-xs text-ardoise-500">
                <tr>
                  <th className="px-2 py-1 text-start" />
                  <th className="px-2 py-1 text-end">{t('wapla.scenarios.statuQuo')}</th>
                  <th className="px-2 py-1 text-end">{t('wapla.scenarios.scenario')}</th>
                  <th className="px-2 py-1 text-end">{t('wapla.scenarios.ecart')}</th>
                </tr>
              </thead>
              <tbody>
                {INDICATEURS_COMPARES.map((k) => {
                  const c = comparaison.indicateurs[k];
                  return (
                    <tr key={k} className="border-t border-ardoise-100">
                      <td className="px-2 py-1">{t(`wapla.scenarios.indicateurs.${k}`)}</td>
                      <td className="chiffres px-2 py-1 text-end">{formaterNombre(c.statu_quo, 1)}</td>
                      <td className="chiffres px-2 py-1 text-end">{formaterNombre(c.scenario, 1)}</td>
                      <td className={`chiffres px-2 py-1 text-end font-medium ${c.ecart < 0 ? 'text-siipi-800' : c.ecart > 0 ? 'text-amber-800' : ''}`}>{signe(c.ecart)}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-ardoise-300">
                  <td className="px-2 py-1">{t('wapla.scenarios.indicateurs.cout')}</td>
                  <td className="px-2 py-1 text-end text-xs text-ardoise-500">{t('wapla.scenarios.coutSiipi')}</td>
                  <td className="px-2 py-1" />
                  <td className="chiffres px-2 py-1 text-end font-medium">
                    {comparaison.cout.ecart == null ? (
                      <span className="text-ardoise-500">{t('kpi.statuts.non_renseigne')}</span>
                    ) : (
                      t('wapla.scenarios.ecartCout', { ecart: signe(comparaison.cout.ecart, 0) })
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ardoise-600">
            {comparaison.cout.procedes_ajoutes.length === 0
              ? t('wapla.scenarios.aucunAjout')
              : t('wapla.scenarios.ajoutes', { procedes: comparaison.cout.procedes_ajoutes.map((p) => t(`wapla.lignesGes.${p}`)).join(', ') })}
            {comparaison.cout.couts_manquants.length > 0 &&
              ` ${t('wapla.scenarios.coutsManquants', { procedes: comparaison.cout.couts_manquants.map((p) => t(`wapla.lignesGes.${p}`)).join(', ') })}`}
          </p>
          <p className="max-w-3xl rounded-lg bg-amber-50 p-2 text-xs text-amber-950">{t('wapla.resultat.potentielEngage')}</p>
        </section>
      )}

      <section className="space-y-4" aria-labelledby="wapla-hypotheses">
        <h3 id="wapla-hypotheses" className="text-lg font-semibold text-ardoise-900">{t('wapla.scenarios.hypotheses')}</h3>
        <p className="max-w-3xl text-sm text-ardoise-600">{t('wapla.scenarios.hypothesesAide')}</p>
        {GROUPES.filter((g) => g !== 'couts').map((g) => (
          <fieldset key={g} className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-3">
            <legend className="px-1 font-medium text-ardoise-900">{t(`wapla.groupes.${g}`)}</legend>
            {ENTREES_PLANIFICATION.filter((e) => e.groupe === g).map((def) => (
              <LigneEntree
                key={def.cle}
                def={def}
                entree={entree(def.cle)}
                ligne={ligne(def.cle)}
                manque={null}
                cle_a_traiter={false}
                sans_objet={def.cle in PROCEDE_DE_LA_PART && !actif(PROCEDE_DE_LA_PART[def.cle])}
                lectureSeule={lectureSeule}
                defautPossible={false}
                onSaisir={saisir(def.cle)}
              />
            ))}
          </fieldset>
        ))}
        {COUTS_PROCEDES_AJOUTES.filter((c) => actif(c.procede)).map((c) => (
          <fieldset key={c.procede} className="space-y-2 rounded-xl border border-rose-200 bg-white p-3">
            <legend className="px-1 font-medium text-ardoise-900">{t('wapla.scenarios.coutsDe', { procede: t(`wapla.lignesGes.${c.procede}`) })}</legend>
            <p className="text-xs text-ardoise-500">{t('wapla.scenarios.coutsDeAide')}</p>
            {c.entrees.map((def) => (
              <LigneEntree
                key={def.cle}
                def={def}
                entree={entree(def.cle)}
                ligne={ligne(def.cle)}
                manque={null}
                cle_a_traiter={false}
                sans_objet={false}
                lectureSeule={lectureSeule}
                defautPossible={false}
                onSaisir={saisir(def.cle)}
              />
            ))}
          </fieldset>
        ))}
      </section>

      {s.resultat && (
        <details className="rounded-xl border border-ardoise-200 bg-white p-3">
          <summary className="cursor-pointer font-medium text-ardoise-800">{t('wapla.scenarios.resultatDetaille')}</summary>
          <div className="mt-3">
            <ResultatWapla resultat={s.resultat as Parameters<typeof ResultatWapla>[0]['resultat']} />
          </div>
        </details>
      )}

      {!fnct && (
        <button
          type="button"
          className={`${bouton} text-red-800`}
          disabled={enCours}
          onClick={() => {
            if (window.confirm(t('wapla.scenarios.confirmerRetrait'))) void agir(async () => { await api.retirerScenarioWapla(id); onRetour(); });
          }}
        >
          {t('wapla.scenarios.retirer')}
        </button>
      )}
    </div>
  );
}
