// Le coût de collecte, par circuit et par engin (lot C).
//
// CHAQUE CHIFFRE DIT D'OÙ IL VIENT. Un plein enregistré et un ratio du guide ne
// se valent pas : la pastille le dit à côté de chaque montant, en mots. Un coût
// qui mêlerait sans le dire le réel et l'indicatif serait opposé un jour à un
// conseil municipal comme une dépense constatée.
//
// UNE COMPOSANTE ABSENTE N'EST PAS UN ZÉRO. Le total d'un circuit n'existe que si
// rien ne lui manque, et l'écran dit ce qui manque ; le total de la commune
// n'existe que si chaque circuit a le sien ; le coût complet que si une étude
// donne les frais indirects. Aucun forfait ne tient lieu de ce qui n'est pas tenu.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type ClasseEngin, type CoutCollecte as Cout, type CoutCollecteCircuit } from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { BoutonExport } from '../BoutonExport';
import { Chargement, Erreur } from '../Elements';
import { ChiffreCle } from '../ui/ChiffreCle';
import { Pastille, type TonPastille } from '../ui/Pastille';

// Le mois courant à Tunis (UTC+1, sans heure d'été).
const moisCourant = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 7);
const dt = (v: number) => formaterNombre(v, 3);

// Le réel se lit comme une mesure ; ce qui vient du guide demande l'attention de qui le lit.
const TON_PROVENANCE: Record<string, TonPastille> = {
  reel: 'mesure',
  ratio_guide: 'attention',
  prix_guide: 'attention',
  don: 'neutre',
  sans_activite: 'neutre',
};

function Montant(props: { valeur: number | null; provenance?: string | null; absent: string; decimales?: number; sansMontant?: boolean }) {
  const { valeur, provenance, absent, decimales = 3, sansMontant = false } = props;
  const { t } = useTranslation();
  if (valeur == null) return <span className="text-xs text-amber-800">{absent}</span>;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      {!sansMontant && <span className="chiffres tabular-nums text-ardoise-900">{formaterNombre(valeur, decimales)}</span>}
      {provenance && <Pastille ton={TON_PROVENANCE[provenance] ?? 'neutre'}>{t(`communal.coutCollecte.provenances.${provenance}`)}</Pastille>}
    </span>
  );
}

export function CoutCollecte({ communeId }: { communeId: string }) {
  const { t, i18n } = useTranslation();
  const [annuelle, setAnnuelle] = useState(false);
  const [mois, setMois] = useState(moisCourant());
  const [annee, setAnnee] = useState(moisCourant().slice(0, 4));
  const [cout, setCout] = useState<Cout | null>(null);
  const [classes, setClasses] = useState<ClasseEngin[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const periode = annuelle ? annee : mois;

  const charger = useCallback(async () => {
    try {
      setCout(await api.coutCollecte(communeId, periode));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [communeId, periode, t]);

  useEffect(() => {
    void charger();
  }, [charger]);
  useEffect(() => {
    api.classesEngins().then(setClasses).catch(() => setClasses([]));
  }, []);

  const libelleClasse = (code: string | null) => {
    const k = classes.find((c) => c.code === code);
    return k ? (i18n.language === 'ar' ? k.libelle_ar : k.libelle_fr) : code ?? '';
  };
  const absent = t('communal.coutCollecte.nonRenseigne');

  if (erreur && !cout) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!cout) return <Chargement />;
  const c = cout.commune;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm text-ardoise-700">
          <div role="group" aria-label={t('communal.coutCollecte.periode')} className="inline-flex overflow-hidden rounded-lg border border-ardoise-300">
            {[false, true].map((a) => (
              <button
                key={String(a)}
                type="button"
                aria-pressed={annuelle === a}
                onClick={() => setAnnuelle(a)}
                className={`min-h-11 px-3 ${annuelle === a ? 'bg-siipi-700 text-white' : 'bg-white text-ardoise-700 hover:bg-ardoise-50'}`}
              >
                {t(a ? 'communal.coutCollecte.annee' : 'communal.coutCollecte.mois')}
              </button>
            ))}
          </div>
          {annuelle ? (
            <input
              type="number"
              min={2000}
              max={Number(moisCourant().slice(0, 4))}
              value={annee}
              aria-label={t('communal.coutCollecte.annee')}
              onChange={(e) => /^\d{4}$/.test(e.target.value) && setAnnee(e.target.value)}
              className="chiffres min-h-11 w-28 rounded-lg border border-ardoise-300 bg-white px-3"
            />
          ) : (
            <input
              type="month"
              value={mois}
              max={moisCourant()}
              aria-label={t('communal.coutCollecte.mois')}
              onChange={(e) => e.target.value && setMois(e.target.value)}
              className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-3"
            />
          )}
        </div>
        <BoutonExport
          chemin={`/cout-collecte?communeId=${encodeURIComponent(communeId)}&periode=${periode}`}
          desactive={cout.circuits.length === 0}
        />
      </div>

      <p className="rounded-lg border border-ardoise-200 bg-ardoise-50 p-3 text-sm text-ardoise-700">{t('communal.coutCollecte.chapeau')}</p>

      {erreur && <Erreur message={erreur} />}

      {cout.circuits.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-600">{t('communal.coutCollecte.aucunCircuit')}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-ardoise-200 bg-white p-4">
              <p className="text-sm text-ardoise-600">{t('communal.coutCollecte.coutDirect')}</p>
              {c.cout_direct_tnd != null ? (
                <ChiffreCle valeur={formaterNombre(c.cout_direct_tnd, 0)} unite={t('communal.coutCollecte.tnd')} />
              ) : (
                <p className="mt-1 text-sm text-amber-800">{t('communal.coutCollecte.directIncomplet', { complets: c.circuits_complets, circuits: c.circuits })}</p>
              )}
            </div>
            <div className="rounded-xl border border-ardoise-200 bg-white p-4">
              <p className="text-sm text-ardoise-600">{t('communal.coutCollecte.indirects')}</p>
              {cout.indirects?.indirects_tnd != null ? (
                <>
                  <ChiffreCle valeur={formaterNombre(cout.indirects.indirects_tnd, 0)} unite={t('communal.coutCollecte.tnd')} />
                  <p className="mt-1 text-xs text-ardoise-500">{t('communal.coutCollecte.depuisEtude', { document: cout.indirects.document, exercice: cout.indirects.exercice })}</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-amber-800">{t('communal.coutCollecte.sansEtude', { exercice: cout.debut.slice(0, 4) })}</p>
              )}
            </div>
            <div className="rounded-xl border border-ardoise-200 bg-white p-4">
              <p className="text-sm text-ardoise-600">{t('communal.coutCollecte.coutComplet')}</p>
              {c.cout_complet_tnd != null ? (
                <>
                  <ChiffreCle valeur={formaterNombre(c.cout_complet_tnd, 0)} unite={t('communal.coutCollecte.tnd')} />
                  {c.cout_complet_par_habitant != null && (
                    <p className="mt-1 text-xs text-ardoise-500">{t('communal.coutCollecte.parHabitant', { valeur: formaterNombre(c.cout_complet_par_habitant, 2) })}</p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-sm text-amber-800">{t('communal.coutCollecte.completAbsent')}</p>
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
            <table className="w-full text-sm">
              <caption className="p-3 text-start font-medium text-ardoise-900">{t('communal.coutCollecte.titreCircuits')}</caption>
              <thead className="bg-ardoise-50 text-xs uppercase text-ardoise-600">
                <tr>
                  <th className="p-3 text-start">{t('communal.coutCollecte.colCircuit')}</th>
                  <th className="p-3 text-end">{t('communal.coutCollecte.colPersonnel')}</th>
                  <th className="p-3 text-end">{t('communal.coutCollecte.colCarburant')}</th>
                  <th className="p-3 text-end">{t('communal.coutCollecte.colEntretien')}</th>
                  <th className="p-3 text-end">{t('communal.coutCollecte.colAmortissement')}</th>
                  <th className="p-3 text-end">{t('communal.coutCollecte.colRedevance')}</th>
                  <th className="p-3 text-end">{t('communal.coutCollecte.colTotal')}</th>
                  <th className="p-3 text-end">{t('communal.coutCollecte.colTonne')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ardoise-200">
                {cout.circuits.map((l) => (
                  <LigneCircuit key={l.circuit_id} l={l} absent={absent} />
                ))}
              </tbody>
            </table>
            <p className="border-t border-ardoise-200 p-3 text-xs text-ardoise-500">{t('communal.coutCollecte.noteCircuits')}</p>
          </div>

          {cout.engins.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
              <table className="w-full text-sm">
                <caption className="p-3 text-start font-medium text-ardoise-900">{t('communal.coutCollecte.titreEngins')}</caption>
                <thead className="bg-ardoise-50 text-xs uppercase text-ardoise-600">
                  <tr>
                    <th className="p-3 text-start">{t('communal.coutCollecte.colEngin')}</th>
                    <th className="p-3 text-end">{t('communal.coutCollecte.colValeur')}</th>
                    <th className="p-3 text-end">{t('communal.coutCollecte.colAmortissement')}</th>
                    <th className="p-3 text-end">{t('communal.coutCollecte.colEntretien')}</th>
                    <th className="p-3 text-end">{t('communal.coutCollecte.colCarburant')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ardoise-200">
                  {cout.engins.map((e) => (
                    <tr key={e.vehicule_id} className="align-top">
                      <td className="p-3">
                        <span className="chiffres font-medium text-ardoise-900">{e.immat}</span>
                        <span className="block text-xs text-ardoise-500">
                          {e.classe ? libelleClasse(e.classe) : t('communal.coutCollecte.sansClasse')}
                          {e.volume_m3 != null && ` · ${formaterNombre(e.volume_m3, Number.isInteger(e.volume_m3) ? 0 : 2)} m³`}
                          {e.membres.length > 1 && ` · ${t('communal.coutCollecte.attelage')}`}
                        </span>
                        <span className="block text-xs text-ardoise-500">
                          {e.age_ans != null
                            ? t('communal.coutCollecte.ageDuree', { age: e.age_ans, duree: e.duree_ans ?? '' })
                            : t('communal.coutCollecte.ageInconnu')}
                          {' · '}
                          {t('communal.coutCollecte.seances', { n: e.seances })}
                        </span>
                      </td>
                      <td className="p-3 text-end">
                        {/* Un don ne retient aucune valeur : afficher « 0 » le ferait lire comme un engin gratuit à amortir. */}
                        <Montant
                          valeur={e.valeur_tnd}
                          provenance={e.valeur_provenance}
                          absent={t('communal.coutCollecte.valeurAbsente')}
                          decimales={0}
                          sansMontant={e.valeur_provenance === 'don'}
                        />
                      </td>
                      <td className="p-3 text-end">
                        <Montant valeur={e.amortissement_tnd} provenance={e.amortissement_provenance} absent={absent} />
                      </td>
                      <td className="p-3 text-end">
                        <Montant valeur={e.entretien_tnd} provenance={e.entretien_provenance} absent={absent} />
                      </td>
                      <td className="p-3 text-end">
                        <Montant valeur={e.carburant_tnd} provenance={e.carburant_provenance} absent={absent} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-ardoise-200 p-3 text-xs text-ardoise-500">{t('communal.coutCollecte.noteEngins')}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function LigneCircuit({ l, absent }: { l: CoutCollecteCircuit; absent: string }) {
  const { t } = useTranslation();
  return (
    <tr className="align-top">
      <td className="p-3">
        <span className="font-medium text-ardoise-900">{l.circuit}</span>
        {l.vehicule_immat && <span className="chiffres block text-xs text-ardoise-500">{l.vehicule_immat}</span>}
        <span className="block text-xs text-ardoise-500">
          {l.cle_engin && t(`communal.coutCollecte.cles.${l.cle_engin}`)}
          {l.cle_engin && l.personnel_cle && ' · '}
          {l.personnel_cle && t(`communal.coutCollecte.clesPersonnel.${l.personnel_cle}`)}
        </span>
      </td>
      <td className="p-3 text-end">
        <Montant valeur={l.personnel_tnd} absent={absent} />
      </td>
      <td className="p-3 text-end">
        <Montant valeur={l.carburant_tnd} provenance={l.carburant_provenance} absent={absent} />
      </td>
      <td className="p-3 text-end">
        <Montant valeur={l.entretien_tnd} provenance={l.entretien_provenance} absent={absent} />
      </td>
      <td className="p-3 text-end">
        <Montant valeur={l.amortissement_tnd} provenance={l.amortissement_provenance} absent={absent} />
      </td>
      <td className="p-3 text-end">
        <Montant valeur={l.redevance_tnd} absent={t('communal.coutCollecte.sansPesee')} />
      </td>
      <td className="p-3 text-end">
        {l.total_tnd != null ? (
          <span className="chiffres font-semibold tabular-nums text-ardoise-900">{dt(l.total_tnd)}</span>
        ) : (
          <span className="text-xs text-amber-800">
            {t('communal.coutCollecte.manque', { liste: l.manque.map((m) => t(`communal.coutCollecte.manques.${m}`)).join(', ') })}
          </span>
        )}
      </td>
      <td className="p-3 text-end">
        {l.cout_tonne != null ? (
          <span className="chiffres tabular-nums text-ardoise-900">{formaterNombre(l.cout_tonne, 3)}</span>
        ) : l.total_tnd == null ? (
          <span className="text-xs text-ardoise-500">{t('communal.coutCollecte.tonneSansTotal')}</span>
        ) : (
          <span className="text-xs text-ardoise-500">
            {t('communal.coutCollecte.tonneAbsente', { peses: l.voyages_peses, attendus: l.voyages_attendus })}
          </span>
        )}
      </td>
    </tr>
  );
}
