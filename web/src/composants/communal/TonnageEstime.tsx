// Le tonnage estimé, sans pont-bascule (lot 17.2).
//
// UNE ESTIMATION N'EST PAS UNE PESÉE. Le pesé du mois a sa propre colonne, et
// aucune ligne ne les additionne : un total qui mêlerait les deux se lirait comme
// un tonnage mesuré, et serait opposé un jour à un prestataire comme tel.
//
// UNE FOURCHETTE, BENNE PLEINE. « 4,8 – 6 t » et non « 5,4 t » : la densité est une
// plage. Et le moteur calcule la capacité de la benne remplie ; l'écran le dit, au
// lieu de laisser croire à un tonnage observé.
//
// Ce qui manque se dit en mots, avec le geste qui le comble : un circuit sans
// estimation n'est jamais un circuit à zéro tonne.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type ClasseEngin, type TonnageEstimeCircuit } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { BoutonExport } from '../BoutonExport';
import { Chargement, Erreur } from '../Elements';

// Le mois courant à Tunis (UTC+1, sans heure d'été).
const moisCourant = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 7);
const decimales = (x: number) => formaterNombre(x, Number.isInteger(x) ? 0 : 2);

export function TonnageEstime({ communeId }: { communeId: string }) {
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const [mois, setMois] = useState(moisCourant());
  const [lignes, setLignes] = useState<TonnageEstimeCircuit[] | null>(null);
  const [classes, setClasses] = useState<ClasseEngin[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      setLignes(await api.tonnageEstime(communeId, mois));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [communeId, mois, t]);

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

  if (erreur && !lignes) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!lignes) return <Chargement />;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ardoise-700">
          {t('communal.estimation.mois')}
          <input
            type="month"
            value={mois}
            max={moisCourant()}
            onChange={(e) => e.target.value && setMois(e.target.value)}
            className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-3"
          />
        </label>
        <BoutonExport
          chemin={`/volumetrie/tonnage?communeId=${encodeURIComponent(communeId)}&mois=${mois}`}
          desactive={lignes.length === 0}
        />
      </div>

      <p className="rounded-lg border border-ardoise-200 bg-ardoise-50 p-3 text-sm text-ardoise-700">
        {t('communal.estimation.chapeau')}
      </p>

      {erreur && <Erreur message={erreur} />}

      {lignes.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-600">{t('communal.estimation.aucunCircuit')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ardoise-50 text-start text-xs uppercase text-ardoise-600">
              <tr>
                <th className="p-3 text-start">{t('communal.estimation.colCircuit')}</th>
                <th className="p-3 text-start">{t('communal.estimation.colBenne')}</th>
                <th className="p-3 text-end">{t('communal.estimation.colVoyages')}</th>
                <th className="p-3 text-end">{t('communal.estimation.colEstime')}</th>
                <th className="p-3 text-end">{t('communal.estimation.colPese')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ardoise-200">
              {lignes.map((l) => (
                <tr key={l.circuit_id} className="align-top">
                  <td className="p-3 font-medium text-ardoise-900">
                    {l.circuit}
                    {l.vehicule_immat && <span className="chiffres block text-xs font-normal text-ardoise-500">{l.vehicule_immat}</span>}
                  </td>
                  <td className="p-3 text-ardoise-700">
                    {l.classe && l.volume_m3 != null ? (
                      <>
                        {libelleClasse(l.classe)} · {f.volume(l.volume_m3, 2)}
                        <span className="block text-xs text-ardoise-500">
                          {l.porteur_immat && l.porteur_immat !== l.vehicule_immat &&
                            `${t('communal.estimation.portePar', { immat: l.porteur_immat })} · `}
                          {l.volume_provenance
                            ? t(`communal.parc.typologie.provenances.${l.volume_provenance}`)
                            : t('communal.estimation.provenanceNonDite')}
                        </span>
                      </>
                    ) : (
                      <span className="text-ardoise-400">—</span>
                    )}
                  </td>
                  <td className="p-3 text-end tabular-nums">
                    {/* Sans estimation possible, « estimés » serait faux : on ne dit que ce qui est attendu et pesé. */}
                    {t(l.manque ? 'communal.estimation.voyagesSansEstimation' : 'communal.estimation.voyages', {
                      attendus: l.voyages_attendus,
                      peses: l.voyages_peses,
                      estimes: l.voyages_estimes,
                    })}
                  </td>
                  <td className="p-3 text-end">
                    {l.manque ? (
                      <span className="text-amber-800">
                        {t(`communal.estimation.manques.${l.manque}`)}
                        <span className="block text-xs text-ardoise-500">{t(`communal.estimation.quoiFaire.${l.manque}`)}</span>
                      </span>
                    ) : l.tonnage_min_t == null || l.tonnage_max_t == null ? (
                      <span className="text-ardoise-500">{t('communal.estimation.toutPese')}</span>
                    ) : (
                      <>
                        <span className="tabular-nums font-semibold text-ardoise-900">
                          {l.tonnage_min_t === l.tonnage_max_t
                            ? f.masse(l.tonnage_min_t, 2)
                            : `${decimales(l.tonnage_min_t)} – ${f.masse(l.tonnage_max_t, 2)}`}
                        </span>
                        <span className="block text-xs text-ardoise-500">
                          {t('communal.estimation.formule', {
                            volume: decimales(l.volume_m3 ?? 0),
                            densite:
                              l.densite_min === l.densite_max
                                ? decimales(l.densite_min ?? 0)
                                : `${decimales(l.densite_min ?? 0)} – ${decimales(l.densite_max ?? 0)}`,
                            voyages: l.voyages_estimes,
                          })}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="p-3 text-end tabular-nums">
                    {l.tonnage_pese_t == null ? (
                      <span className="text-ardoise-400">{t('communal.estimation.aucunePesee')}</span>
                    ) : (
                      f.masse(l.tonnage_pese_t, 2)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-ardoise-200 p-3 text-xs text-ardoise-500">{t('communal.estimation.noteSource')}</p>
        </div>
      )}
    </section>
  );
}
