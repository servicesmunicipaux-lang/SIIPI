// La période transitoire du secteur informel (lot I3, 18.3) — deux sections de
// l'écran des acteurs informels : la période et l'état de chaque acteur, puis le
// bilan de la conversion.
//
// SANS DATE DE DÉPART, AUCUN ÉTAT. Tant que la FNCT n'a pas fixé le départ de la
// période (paramètre national daté), l'écran le dit et n'affiche aucune échéance :
// une date inventée serait lue comme vraie.
//
// UN ÉTAT EST UN CONSTAT. « À régulariser » ne bloque rien ; la couleur double le
// mot, elle ne le remplace pas. Des effectifs par état, jamais un total ni un
// pourcentage.
//
// LA CONVERSION EST DÉCLARÉE. Les tonnes détournées viennent des livraisons du
// registre des acteurs ; elles ne s'additionnent jamais au tonnage pesé. La
// redevance évitée et les voyages économisés reposent sur deux hypothèses écrites
// à côté des chiffres.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  type ConversionInformel,
  type PeriodeTransitoire as Donnees,
  type SituationActeur,
} from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { BoutonExport } from '../BoutonExport';

type Etat = SituationActeur['etat'];
const ORDRE: Etat[] = [
  'peut_exercer',
  'formalise',
  'sans_demarche',
  'a_regulariser',
  'avant_periode',
];
const TEINTE: Record<Etat, string> = {
  date_depart_non_fixee: 'border-ardoise-300 bg-ardoise-50 text-ardoise-700',
  regles_incompletes: 'border-ardoise-300 bg-ardoise-50 text-ardoise-700',
  avant_periode: 'border-ardoise-300 bg-white text-ardoise-700',
  peut_exercer: 'border-sky-300 bg-sky-50 text-sky-900',
  formalise: 'border-siipi-300 bg-siipi-50 text-siipi-900',
  sans_demarche: 'border-ardoise-300 bg-ardoise-50 text-ardoise-800',
  a_regulariser: 'border-amber-300 bg-amber-50 text-amber-900',
};

function PastilleEtat({ etat }: { etat: Etat }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${TEINTE[etat]}`}>
      {t(`communal.transition.etats.${etat}`)}
    </span>
  );
}

export function PeriodeTransitoire({
  communeId,
  onErreur,
}: {
  communeId: string;
  onErreur: (e: unknown) => void;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const [donnees, setDonnees] = useState<Donnees | null>(null);

  useEffect(() => {
    api.periodeTransitoire(communeId).then(setDonnees).catch(onErreur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId]);

  if (!donnees) return null;
  const p = donnees.periode;
  const sansEtat = p.debut === null || p.fin === null;

  return (
    <section
      aria-labelledby="titre-periode-transitoire"
      className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4"
    >
      <header>
        <h3 id="titre-periode-transitoire" className="text-lg font-semibold text-ardoise-900">
          {t('communal.transition.titre')}
        </h3>
        <p className="mt-1 max-w-3xl text-sm text-ardoise-600">{t('communal.transition.intro')}</p>
      </header>

      {p.debut === null ? (
        <p
          role="status"
          className="rounded-lg border border-ardoise-300 bg-ardoise-50 p-3 text-sm text-ardoise-800"
        >
          {t('communal.transition.departNonFixe')}
        </p>
      ) : (
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-ardoise-500">{t('communal.transition.debut')}</dt>
            <dd className="font-medium tabular-nums">{f.date(p.debut)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ardoise-500">{t('communal.transition.fin')}</dt>
            <dd className="font-medium tabular-nums">
              {p.fin ? f.date(p.fin) : t('communal.transition.nonRenseigne')}
              {p.duree_mois !== null && (
                <span className="ms-1 text-xs text-ardoise-500">
                  {t('communal.transition.duree', { mois: p.duree_mois })}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ardoise-500">{t('communal.transition.finEtalonnage')}</dt>
            <dd className="font-medium tabular-nums">
              {p.fin_etalonnage ? f.date(p.fin_etalonnage) : t('communal.transition.nonRenseigne')}
            </dd>
          </div>
        </dl>
      )}
      {p.provisoire && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          {t('communal.transition.provisoire')}
        </p>
      )}

      {!sansEtat && (
        <ul className="flex flex-wrap gap-2" aria-label={t('communal.transition.decompte')}>
          {ORDRE.filter((e) => (donnees.etats[e] ?? 0) > 0).map((e) => (
            <li key={e} className="flex items-center gap-1.5 text-sm">
              <PastilleEtat etat={e} />
              <span className="font-semibold tabular-nums">{donnees.etats[e]}</span>
            </li>
          ))}
        </ul>
      )}

      {donnees.acteurs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ardoise-50 text-xs text-ardoise-600">
              <tr>
                <th className="px-3 py-2 text-start">
                  {t('communal.acteursInformels.pseudonyme')}
                </th>
                <th className="px-3 py-2 text-start">{t('communal.transition.etat')}</th>
                <th className="px-3 py-2 text-start">{t('communal.transition.etapes')}</th>
                <th className="px-3 py-2 text-start">{t('communal.transition.agrement')}</th>
              </tr>
            </thead>
            <tbody>
              {donnees.acteurs.map((a) => (
                <tr key={a.acteur_id} className="border-t border-ardoise-100 align-top">
                  <td className="px-3 py-2 font-mono text-xs">{a.id_precollecteur}</td>
                  <td className="px-3 py-2">
                    {sansEtat ? (
                      <span className="text-ardoise-400">{t('communal.transition.sansEtat')}</span>
                    ) : (
                      <PastilleEtat etat={a.etat} />
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {t('communal.transition.etapesFranchies', {
                      n: a.jalons_franchis,
                      sur: a.jalons_en_vigueur,
                    })}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {a.categorie !== 'intermediaire' ? (
                      <span className="text-ardoise-400">{t('communal.transition.sansObjet')}</span>
                    ) : a.agrement_echeance === null ? (
                      <span className="text-ardoise-500">
                        {t('communal.transition.aucunAgrement')}
                      </span>
                    ) : (
                      t(
                        a.agrement_valable
                          ? 'communal.transition.agrementJusquau'
                          : 'communal.transition.agrementEchu',
                        {
                          date: f.date(a.agrement_echeance),
                        }
                      )
                    )}
                    {a.categorie === 'intermediaire' && (
                      <span className="block text-ardoise-500">
                        {t(
                          a.etalonnage_enregistre
                            ? 'communal.transition.etalonne'
                            : 'communal.transition.nonEtalonne'
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function BilanConversion({
  communeId,
  onErreur,
}: {
  communeId: string;
  onErreur: (e: unknown) => void;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const anneeCourante = Number(new Date(Date.now() + 3_600_000).toISOString().slice(0, 4));
  const [annee, setAnnee] = useState(anneeCourante);
  const [bilan, setBilan] = useState<ConversionInformel | null>(null);

  useEffect(() => {
    setBilan(null);
    api.conversionInformel(communeId, annee).then(setBilan).catch(onErreur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId, annee]);

  const nr = <span className="text-ardoise-400">{t('communal.transition.nonRenseigne')}</span>;
  const masque = <span className="text-ardoise-400">{t('communal.transition.masque')}</span>;

  return (
    <section
      aria-labelledby="titre-conversion"
      className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4"
    >
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="titre-conversion" className="text-lg font-semibold text-ardoise-900">
            {t('communal.transition.conversionTitre')}
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-600">
            {t('communal.transition.conversionIntro')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={annee}
            aria-label={t('communal.transition.annee')}
            onChange={(e) => setAnnee(Number(e.target.value))}
            className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-3"
          >
            {[0, 1, 2, 3].map((d) => (
              <option key={d} value={anneeCourante - d}>
                {anneeCourante - d}
              </option>
            ))}
          </select>
          <BoutonExport
            chemin={`/periode-transitoire/conversion?communeId=${encodeURIComponent(communeId)}&annee=${annee}`}
            desactive={!bilan || bilan.mois.length === 0}
          />
        </div>
      </header>
      <ul className="list-disc space-y-1 ps-5 text-xs text-ardoise-600">
        <li>{t('communal.transition.hypotheseDeclaree')}</li>
        <li>{t('communal.transition.hypotheseRedevance')}</li>
        <li>{t('communal.transition.hypotheseVoyages')}</li>
      </ul>

      {!bilan ? null : bilan.mois.length === 0 ? (
        <p className="text-sm text-ardoise-600">
          {t('communal.transition.aucuneLivraison', { annee })}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ardoise-50 text-xs text-ardoise-600">
              <tr>
                <th className="px-3 py-2 text-start">{t('communal.transition.mois')}</th>
                <th className="px-3 py-2 text-end">{t('communal.transition.acteursLivres')}</th>
                <th className="px-3 py-2 text-end">{t('communal.transition.tonnesDetournees')}</th>
                <th className="px-3 py-2 text-end">{t('communal.transition.redevanceEvitee')}</th>
                <th className="px-3 py-2 text-end">{t('communal.transition.voyageMoyen')}</th>
                <th className="px-3 py-2 text-end">{t('communal.transition.voyagesEconomises')}</th>
              </tr>
            </thead>
            <tbody>
              {bilan.mois.map((m) => (
                <tr key={m.mois} className="border-t border-ardoise-100">
                  <td className="px-3 py-2 tabular-nums">
                    {t(`communal.transition.nomsMois.${m.mois}`)}
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums">
                    {m.masque ? masque : m.acteurs}
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums">
                    {m.masque ? masque : f.masse(m.tonnes_detournees, 3)}
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums">
                    {m.masque
                      ? masque
                      : m.redevance_evitee_tnd === null
                        ? nr
                        : `${formaterNombre(m.redevance_evitee_tnd, 3)} ${t('communal.transition.tnd')}`}
                    {!m.masque && m.tonnes_sans_taux !== null && m.tonnes_sans_taux > 0 && (
                      <span className="block text-xs text-ardoise-500">
                        {t('communal.transition.sansTaux', {
                          masse: f.masse(m.tonnes_sans_taux, 3),
                        })}
                      </span>
                    )}
                    {m.redevance_provisoire && (
                      <span className="block text-xs text-amber-800">
                        {t('communal.transition.tauxProvisoire')}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums">
                    {m.poids_moyen_voyage_t === null ? nr : f.masse(m.poids_moyen_voyage_t, 3)}
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums">
                    {m.masque
                      ? masque
                      : m.voyages_economises === null
                        ? nr
                        : formaterNombre(m.voyages_economises, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
