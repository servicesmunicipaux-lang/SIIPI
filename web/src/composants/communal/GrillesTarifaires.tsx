// Les grilles tarifaires des conventions de propreté (jalon G, lot G1 ; SPEC_G
// § 3.3) : une par arrêté municipal, avec ses tarifs par catégorie d'activité et
// leurs majorations.
//
// UN PROJET NE S'APPLIQUE PAS. Tant que la commune n'a pas enregistré
// l'approbation de la tutelle, la grille est un projet : l'écran le dit sur la
// grille elle-même, pas dans une aide qu'on ne lit pas. Approuvée, elle est
// figée — l'écran n'offre plus que de la clore, quand un nouvel arrêté la
// remplace.
//
// La commune enregistre ; la FNCT lit, sans aucun geste (elle ne fixe pas les
// tarifs d'une commune). Aucun montant n'est calculé ici : l'assiette d'un
// établissement viendra de sa convention (lot G6).

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type GrilleTarifaire } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';
import { FormulaireGrilleTarifaire } from '../ajout/FormulaireGrilleTarifaire';
import { useAjoutEnLigne } from '../ajout/useAjoutEnLigne';
import { Pastille, type TonPastille } from '../ui/Pastille';

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const bouton = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
const boutonDiscret = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';

// Le jour à Tunis : une approbation s'enregistre une fois reçue, jamais datée de demain.
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

// Un montant ou un coefficient sans décimales inutiles : « × 1,000 » se lirait mille.
// Les décimales se comptent sur la valeur arrondie au millième : 1,1 × 100 ne
// vaut pas exactement 110 en virgule flottante, et 1,1 s'affichait « 1,100 ».
const nombre = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return formaterNombre(r, (r.toString().split('.')[1] ?? '').length);
};

const TON_ETAT: Record<GrilleTarifaire['etat'], TonPastille> = {
  projet: 'attention',
  a_venir: 'neutre',
  en_vigueur: 'mesure',
  close: 'neutre',
};

type Geste =
  | { id: string; nature: 'approbation'; date: string; texte: string }
  | { id: string; nature: 'cloture'; date: string; texte: string };

export function GrillesTarifaires({ communeId }: { communeId: string }) {
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const { utilisateur } = useAuth();
  const peutEcrire = utilisateur?.role === 'admin_commune';
  const arabe = i18n.language.startsWith('ar');
  const [grilles, setGrilles] = useState<GrilleTarifaire[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [modifiee, setModifiee] = useState<string | null>(null);
  const [geste, setGeste] = useState<Geste | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    try {
      setGrilles(await api.grillesTarifaires(communeId));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [communeId, t]);

  // Le rechargement garde la liste à l'écran : la remettre à vide démontait les
  // formulaires ouverts, et un changement de langue (qui renouvelle `t`, donc
  // `charger`) effaçait la grille en cours de saisie. Une autre commune remonte
  // l'écran entier (clé de l'espace communal).
  useEffect(() => {
    void charger();
  }, [charger]);

  const ajout = useAjoutEnLigne('grille-tarifaire', communeId, t('communal.grilles.nouvelle'), async () => {
    setMessage(t('communal.grilles.messages.enregistree'));
    await charger();
  });

  const executer = async (tache: () => Promise<unknown>, texte: string) => {
    setEnvoi(true);
    setMessage(null);
    try {
      await tache();
      setGeste(null);
      setMessage(texte);
      setErreur(null);
      await charger();
    } catch (err) {
      const refus = err instanceof ErreurApi ? err.message : t('commun.erreur');
      // Un 409 dit que la grille a changé (modifiée, approuvée par un autre) :
      // elle est relue, pour que la décision se prenne sur ce qui est en base.
      // Relue d'abord, le refus affiché ensuite : la relecture efface l'erreur
      // d'un chargement précédent, et elle effaçait ce refus avec.
      if (err instanceof ErreurApi && err.statut === 409) await charger();
      setErreur(refus);
    } finally {
      setEnvoi(false);
    }
  };

  if (erreur && !grilles) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!grilles) return <Chargement />;

  const unite = (mode: GrilleTarifaire['lignes'][number]['mode']) => t(`ajout.grilleTarifaire.unites.${mode}`);
  const majorationEnMots = (m: GrilleTarifaire['lignes'][number]['majorations'][number], mode: GrilleTarifaire['lignes'][number]['mode']) => {
    const critere = `${t(`ajout.grilleTarifaire.criteres.${m.critere}`)} (${t(`ajout.grilleTarifaire.unitesCriteres.${m.critere}`)})`;
    const tranche =
      m.borne_max === null
        ? t('communal.grilles.tranches.aPartirDe', { min: nombre(m.borne_min) })
        : t('communal.grilles.tranches.entre', { min: nombre(m.borne_min), max: nombre(m.borne_max) });
    const effet =
      m.effet === 'coefficient'
        ? t('communal.grilles.effets.coefficient', { valeur: nombre(m.valeur) })
        : t('communal.grilles.effets.ajout', { valeur: nombre(m.valeur), unite: unite(mode) });
    return t('communal.grilles.majorationEnMots', { rang: m.ordre, critere, tranche, effet });
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.grilles.titre')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-500">{t('communal.grilles.chapeau')}</p>
        </div>
        {ajout.bouton}
      </header>
      {!peutEcrire && <p className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">{t('communal.grilles.lectureSeule')}</p>}
      {ajout.formulaire}
      {message && (
        <p role="status" className="rounded-lg bg-siipi-50 p-3 text-sm text-siipi-800">
          {message}
        </p>
      )}
      {erreur && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {erreur}
        </p>
      )}

      {grilles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ardoise-300 bg-white p-4 text-sm text-ardoise-600">{t('communal.grilles.aucune')}</p>
      ) : (
        <ul className="space-y-4">
          {grilles.map((g) => (
            <li key={g.id} className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4">
              {modifiee === g.id ? (
                <FormulaireGrilleTarifaire
                  communeId={communeId}
                  grille={g}
                  onAnnuler={() => setModifiee(null)}
                  onFait={async () => {
                    setModifiee(null);
                    setMessage(t('communal.grilles.messages.modifiee'));
                    await charger();
                  }}
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-ardoise-900">{g.intitule || g.reference_arrete}</h2>
                        <Pastille ton={TON_ETAT[g.etat]} titre={t(`communal.grilles.etats.aide.${g.etat}`)}>
                          {t(`communal.grilles.etats.${g.etat}`)}
                        </Pastille>
                      </div>
                      <p className="text-sm text-ardoise-700">
                        {t('communal.grilles.arrete', { reference: g.reference_arrete, date: f.date(g.date_arrete) })}
                        {/* La délibération se montre dès qu'on en a un élément ; la partie absente se dit en mots. */}
                        {(g.reference_deliberation || g.date_deliberation) &&
                          ` · ${
                            g.reference_deliberation && g.date_deliberation
                              ? t('communal.grilles.deliberation', {
                                  reference: g.reference_deliberation,
                                  date: f.date(g.date_deliberation),
                                })
                              : g.reference_deliberation
                                ? t('communal.grilles.deliberationSansDate', { reference: g.reference_deliberation })
                                : t('communal.grilles.deliberationSansReference', { date: f.date(g.date_deliberation ?? '') })
                          }`}
                      </p>
                      <p className="text-sm text-ardoise-700">
                        {g.date_fin
                          ? t('communal.grilles.periodeBornee', { debut: f.date(g.date_effet), fin: f.date(g.date_fin) })
                          : t('communal.grilles.periodeOuverte', { debut: f.date(g.date_effet) })}
                      </p>
                      {g.etat === 'projet' ? (
                        <p className="text-sm text-amber-900">{t('communal.grilles.projetNeSappliquePas')}</p>
                      ) : (
                        <p className="text-sm text-ardoise-700">
                          {t('communal.grilles.approuvee', {
                            date: f.date(g.date_approbation_tutelle ?? ''),
                            reference: g.reference_approbation ?? '—',
                          })}
                        </p>
                      )}
                      {/* La pièce de la fin, sans dire « close » : une grille bornée dès son arrêté a sa fin
                          fixée, et reste en vigueur jusqu'à elle. */}
                      {g.reference_fin && <p className="text-xs text-ardoise-500">{t('communal.grilles.finDecideePar', { texte: g.reference_fin })}</p>}
                    </div>
                    {peutEcrire && geste?.id !== g.id && (
                      <div className="flex max-w-full flex-wrap gap-2">
                        {g.etat === 'projet' && (
                          <>
                            <button type="button" className={boutonDiscret} onClick={() => setModifiee(g.id)}>
                              {t('communal.grilles.gestes.modifier')}
                            </button>
                            <button
                              type="button"
                              className={boutonDiscret}
                              onClick={() => setGeste({ id: g.id, nature: 'approbation', date: '', texte: '' })}
                            >
                              {t('communal.grilles.gestes.approuver')}
                            </button>
                            <button
                              type="button"
                              className={boutonDiscret}
                              disabled={envoi}
                              onClick={() => {
                                if (window.confirm(t('communal.grilles.gestes.confirmerRetrait'))) {
                                  void executer(() => api.retirerGrilleTarifaire(g.id), t('communal.grilles.messages.retiree'));
                                }
                              }}
                            >
                              {t('communal.grilles.gestes.retirer')}
                            </button>
                          </>
                        )}
                        {g.etat !== 'projet' && !g.date_fin && (
                          <button
                            type="button"
                            className={boutonDiscret}
                            onClick={() => setGeste({ id: g.id, nature: 'cloture', date: '', texte: '' })}
                          >
                            {t('communal.grilles.gestes.clore')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {geste?.id === g.id && (
                    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-siipi-200 bg-siipi-50/40 p-3">
                      <p className="w-full text-sm text-ardoise-700">
                        {geste.nature === 'approbation' ? t('communal.grilles.aideApprobation') : t('communal.grilles.aideCloture')}
                      </p>
                      <label className="text-xs">
                        {geste.nature === 'approbation' ? t('communal.grilles.champs.dateApprobation') : t('communal.grilles.champs.dateFin')}
                        <input
                          type="date"
                          dir="ltr"
                          min={geste.nature === 'approbation' ? g.date_arrete : g.date_effet}
                          max={geste.nature === 'approbation' ? aujourdhui() : undefined}
                          value={geste.date}
                          onChange={(e) => setGeste({ ...geste, date: e.target.value })}
                          className={champ}
                        />
                      </label>
                      <label className="min-w-56 flex-1 text-xs">
                        {geste.nature === 'approbation' ? t('communal.grilles.champs.pieceApprobation') : t('communal.grilles.champs.pieceCloture')}
                        <input value={geste.texte} onChange={(e) => setGeste({ ...geste, texte: e.target.value })} maxLength={300} className={champ} />
                      </label>
                      <button
                        type="button"
                        className={bouton}
                        disabled={envoi || !geste.date || geste.texte.trim().length < 3}
                        onClick={() =>
                          void (geste.nature === 'approbation'
                            ? executer(
                                () =>
                                  api.approuverGrilleTarifaire(g.id, {
                                    dateApprobation: geste.date,
                                    reference: geste.texte.trim(),
                                    version: g.version,
                                  }),
                                t('communal.grilles.messages.approuvee')
                              )
                            : executer(
                                () => api.cloreGrilleTarifaire(g.id, { dateFin: geste.date, reference: geste.texte.trim() }),
                                t('communal.grilles.messages.close')
                              ))
                        }
                      >
                        {geste.nature === 'approbation' ? t('communal.grilles.gestes.confirmerApprobation') : t('communal.grilles.gestes.confirmerCloture')}
                      </button>
                      <button type="button" className={boutonDiscret} onClick={() => setGeste(null)}>
                        {t('commun.annuler')}
                      </button>
                    </div>
                  )}

                  {g.lignes.length === 0 ? (
                    <p className="text-sm text-ardoise-600">{t('communal.grilles.sansTarif')}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <caption className="sr-only">{t('communal.grilles.tableau', { reference: g.reference_arrete })}</caption>
                        <thead className="text-xs text-ardoise-500">
                          <tr>
                            <th scope="col" className="px-2 py-1.5 text-start">{t('communal.grilles.colonnes.categorie')}</th>
                            <th scope="col" className="px-2 py-1.5 text-start">{t('communal.grilles.colonnes.mode')}</th>
                            <th scope="col" className="px-2 py-1.5 text-end">{t('communal.grilles.colonnes.tarif')}</th>
                            <th scope="col" className="px-2 py-1.5 text-start">{t('communal.grilles.colonnes.majorations')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.lignes.map((l) => (
                            <tr key={l.id} className="border-t border-ardoise-100 align-top">
                              <th scope="row" className="px-2 py-1.5 text-start font-normal text-ardoise-800">
                                {(arabe ? l.categorie_ar : l.categorie_fr) ?? l.categorie}
                              </th>
                              <td className="px-2 py-1.5 text-ardoise-700">{t(`ajout.grilleTarifaire.modes.${l.mode}`)}</td>
                              <td className="chiffres px-2 py-1.5 text-end text-ardoise-900">
                                <span dir="ltr">{nombre(l.tarif)}</span> <span className="text-xs text-ardoise-500">{unite(l.mode)}</span>
                              </td>
                              <td className="px-2 py-1.5 text-ardoise-700">
                                {l.majorations.length === 0 ? (
                                  <span className="text-ardoise-500">{t('communal.grilles.aucuneMajoration')}</span>
                                ) : (
                                  <ul className="space-y-0.5">
                                    {l.majorations.map((m) => (
                                      <li key={m.id}>{majorationEnMots(m, l.mode)}</li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
