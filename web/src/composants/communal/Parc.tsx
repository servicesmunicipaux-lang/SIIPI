// Le parc matériel.
//
// Cet écran répond à une seule question, et tout le reste en découle : qu'est-ce
// qui peut rouler demain matin ?
//
// À Dar Chaabane, la réponse au 19 avril 2024 était seize engins sur vingt-neuf.
// Le bandeau du haut la donne d'emblée, et la liste s'ouvre sur ce qui est
// immobilisé — pas sur l'ordre alphabétique. Un parc dont 45 % est à l'arrêt se
// consulte pour savoir ce qui ne roule pas ; ranger ces lignes au milieu des
// autres serait trier par commodité plutôt que par importance.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Vehicule, type EtatDuParc } from '../../lib/api';
import { Chargement, Erreur } from '../Elements';

const ETATS = ['en_service', 'en_panne', 'a_reformer', 'reforme'] as const;
type Etat = (typeof ETATS)[number];

const COULEUR_ETAT: Record<string, string> = {
  en_service: 'bg-siipi-100 text-siipi-800',
  en_panne: 'bg-amber-100 text-amber-900',
  a_reformer: 'bg-red-100 text-red-900',
  reforme: 'bg-ardoise-100 text-ardoise-600',
};

const nombre = (n: unknown) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('fr-FR');

export function Parc({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const [engins, setEngins] = useState<Vehicule[] | null>(null);
  const [etatParc, setEtatParc] = useState<EtatDuParc | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Etat | 'tous'>('tous');
  const [ouvert, setOuvert] = useState<string | null>(null);

  const charger = async () => {
    try {
      const [liste, etat] = await Promise.all([api.engins(communeId), api.etatDuParc(communeId)]);
      setEngins(liste as unknown as Vehicule[]);
      setEtatParc(etat);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId]);

  const affiches = useMemo(
    () => (engins ?? []).filter((v) => filtre === 'tous' || v.etat === filtre),
    [engins, filtre]
  );

  const compteurs = useMemo(() => {
    const c: Record<string, number> = { tous: engins?.length ?? 0 };
    for (const e of ETATS) c[e] = (engins ?? []).filter((v) => v.etat === e).length;
    return c;
  }, [engins]);

  if (erreur && !engins) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!engins || !etatParc) return <Chargement />;

  const changerEtat = async (v: Vehicule, etat: Etat) => {
    setErreur(null);
    try {
      await api.modifierEngin(v.id, { etat });
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  const enregistrerMotif = async (v: Vehicule, motif: string) => {
    try {
      await api.modifierEngin(v.id, { motifImmobilisation: motif.trim() || null });
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.parc.titre')}</h1>
        <p className="mt-1 text-sm text-ardoise-500">{t('communal.parc.sousTitre')}</p>
      </header>

      {erreur && <Erreur message={erreur} />}

      {/* La phrase avant les chiffres. « 16 engins sur 29 peuvent rouler » se
          retient ; un tableau de cinq nombres ne se retient pas. */}
      <div className="rounded-xl border border-ardoise-200 bg-white p-4">
        <p className="text-lg font-semibold text-ardoise-900">
          {t('communal.parc.resume', {
            enService: etatParc.en_service,
            total: etatParc.total,
          })}
        </p>
        {etatParc.inventaire_le && (
          <p className="mt-0.5 text-xs text-ardoise-500">
            {t('communal.parc.inventaireLe', {
              date: new Date(etatParc.inventaire_le).toLocaleDateString(),
            })}
          </p>
        )}

        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['disponibilite', etatParc.taux_disponibilite == null ? '—' : `${etatParc.taux_disponibilite} %`],
              ['ageMoyen', etatParc.age_moyen_annees == null ? '—' : `${etatParc.age_moyen_annees} ans`],
              ['valeur', `${nombre(etatParc.valeur_parc_tnd)} TND`],
              ['remorques', String(etatParc.remorques)],
            ] as const
          ).map(([cle, valeur]) => (
            <div key={cle} className="rounded-lg border border-ardoise-200 p-2.5">
              <dt className="text-xs text-ardoise-500">{t(`communal.parc.indicateurs.${cle}`)}</dt>
              <dd className="chiffres mt-0.5 text-lg font-semibold text-ardoise-900">{valeur}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-ardoise-500">{t('communal.parc.disponibiliteAide')}</p>

        {/* Un engin à l'arrêt dont personne n'a écrit pourquoi est un engin que
            personne ne réparera. Le signaler, c'est rendre l'oubli visible. */}
        {Number(etatParc.immobilises_sans_motif) > 0 && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900">
            {t('communal.parc.sansMotif', { count: Number(etatParc.immobilises_sans_motif) })}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(['tous', ...ETATS] as const).map((cle) => (
          <button
            key={cle}
            type="button"
            onClick={() => setFiltre(cle as Etat | 'tous')}
            disabled={compteurs[cle] === 0 && cle !== 'tous'}
            className={`min-h-11 rounded-full px-3 text-sm font-medium disabled:opacity-40 ${
              filtre === cle ? 'bg-ardoise-900 text-white' : 'border border-ardoise-300 bg-white text-ardoise-700'
            }`}
          >
            {t(`communal.parc.etats.${cle}`)}
            <span className="chiffres ms-1.5 opacity-70">{compteurs[cle] ?? 0}</span>
          </button>
        ))}
      </div>

      {affiches.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">
          {t('communal.parc.aucun')}
        </p>
      ) : (
        <ul className="space-y-2">
          {affiches.map((v) => {
            const deplie = ouvert === v.id;
            const immobilise = v.etat === 'en_panne' || v.etat === 'a_reformer';
            return (
              <li key={v.id} className="rounded-xl border border-ardoise-200 bg-white">
                <button
                  type="button"
                  onClick={() => setOuvert(deplie ? null : v.id)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-3 text-start"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ardoise-900">
                      <span className="chiffres">{v.registration}</span>
                      <span className="text-sm font-normal text-ardoise-600">
                        {t(`communal.parc.types.${v.type}`, { defaultValue: v.type })}
                      </span>
                      {v.marque && <span className="text-sm font-normal text-ardoise-400">{v.marque}</span>}
                    </p>
                    <p className="chiffres mt-0.5 text-xs text-ardoise-500">
                      {v.age_annees != null && t('communal.parc.age', { n: v.age_annees })}
                      {v.charge_utile_t != null && ` · ${v.charge_utile_t} t`}
                      {v.attele_a_immat && ` · ${t('communal.parc.atteleA', { immat: v.attele_a_immat })}`}
                    </p>
                    {/* Le motif est la partie utile de la ligne : il dit à qui
                        s'adresser. On le montre sans déplier. */}
                    {immobilise && (
                      <p className="mt-1 text-xs text-amber-800">
                        {v.motif_immobilisation || (
                          <span className="italic">{t('communal.parc.motifAbsent')}</span>
                        )}
                      </p>
                    )}
                  </div>
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${COULEUR_ETAT[v.etat] ?? ''}`}>
                    {t(`communal.parc.etats.${v.etat}`)}
                  </span>
                </button>

                {deplie && (
                  <div className="space-y-3 border-t border-ardoise-100 p-3">
                    <div>
                      <span className="text-xs font-medium text-ardoise-700">
                        {t('communal.parc.changerEtat')}
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {ETATS.map((e) => (
                          <button
                            key={e}
                            type="button"
                            onClick={() => void changerEtat(v, e)}
                            className={`min-h-11 rounded-lg px-3 text-sm font-medium ${
                              v.etat === e
                                ? 'bg-ardoise-900 text-white'
                                : 'border border-ardoise-300 bg-white text-ardoise-700'
                            }`}
                          >
                            {t(`communal.parc.etats.${e}`)}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-ardoise-500">{t('communal.parc.changerEtatAide')}</p>
                    </div>

                    <label className="block">
                      <span className="text-xs font-medium text-ardoise-700">
                        {t('communal.parc.motif')}
                      </span>
                      <textarea
                        defaultValue={v.motif_immobilisation ?? ''}
                        onBlur={(e) => void enregistrerMotif(v, e.target.value)}
                        rows={2}
                        placeholder={t('communal.parc.motifExemple')}
                        className="mt-1 w-full rounded-lg border border-ardoise-300 bg-white px-3 py-2 text-sm"
                      />
                      <span className="mt-1 block text-xs text-ardoise-500">{t('communal.parc.motifAide')}</span>
                    </label>

                    <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      {(
                        [
                          ['miseEnCirculation', v.date_premiere_circulation ? new Date(v.date_premiere_circulation).toLocaleDateString() : '—'],
                          ['etatDepuis', v.etat_depuis ? new Date(v.etat_depuis).toLocaleDateString() : t('communal.parc.nonRenseigne')],
                          ['valeur', v.valeur_achat_tnd != null ? `${nombre(v.valeur_achat_tnd)} TND` : '—'],
                          ['domaine', v.domaine_emploi ?? '—'],
                        ] as const
                      ).map(([cle, valeur]) => (
                        <div key={cle}>
                          <dt className="text-ardoise-500">{t(`communal.parc.champs.${cle}`)}</dt>
                          <dd className="text-ardoise-800">{valeur}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
