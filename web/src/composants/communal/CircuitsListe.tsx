// Liste des circuits — le tableau de bord du responsable propreté.
//
// Pourquoi un tableau et non des cartes empilées : à Dar Chaabane il y a
// treize circuits, et la question qu'on se pose devant cet écran est
// comparative — « lequel n'a pas de chauffeur », « lequel n'a aucun point
// saisi », « lequel fait deux voyages ». Un tableau répond d'un coup d'œil,
// une liste de cartes oblige à faire défiler et à retenir.
//
// Les colonnes vides sont montrées comme vides, avec un tiret, et non
// masquées : un circuit sans chauffeur affecté est une information, pas une
// absence d'information.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Circuit } from '../../lib/api';
import { Chargement, Erreur } from '../Elements';

const JOURS_COURTS = [1, 2, 3, 4, 5, 6, 7];

export function CircuitsListe({
  communeId,
  onOuvrir,
  onAjouter,
  rechargement,
}: {
  communeId: string;
  onOuvrir: (c: Circuit) => void;
  onAjouter: () => void;
  rechargement: number;
}) {
  const { t } = useTranslation();
  const [circuits, setCircuits] = useState<Circuit[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<'tous' | 'en_service' | 'clos'>('en_service');

  const charger = async () => {
    try {
      setCircuits(await api.circuits(communeId));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId, rechargement]);

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const estClos = (c: Circuit) =>
    !c.actif || (c.date_fin != null && String(c.date_fin).slice(0, 10) < aujourdhui);

  const affiches = useMemo(() => {
    const liste = circuits ?? [];
    if (filtre === 'tous') return liste;
    return liste.filter((c) => (filtre === 'clos' ? estClos(c) : !estClos(c)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circuits, filtre]);

  if (erreur) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!circuits) return <Chargement />;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.circuits.titre')}</h1>
          <p className="mt-1 text-sm text-ardoise-500">{t('communal.circuits.sousTitre')}</p>
        </div>
        <button
          type="button"
          onClick={onAjouter}
          className="min-h-11 rounded-lg bg-siipi-600 px-4 font-semibold text-white"
        >
          {t('communal.circuits.ajouter')}
        </button>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {(['en_service', 'clos', 'tous'] as const).map((cle) => (
          <button
            key={cle}
            type="button"
            onClick={() => setFiltre(cle)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              filtre === cle
                ? 'bg-ardoise-900 text-white'
                : 'border border-ardoise-300 bg-white text-ardoise-700'
            }`}
          >
            {t(`communal.circuits.filtres.${cle}`)}
          </button>
        ))}
      </div>

      {affiches.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">
          {t('communal.circuits.aucun')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="border-b border-ardoise-200 bg-ardoise-50 text-left text-xs uppercase tracking-wide text-ardoise-500">
              <tr>
                <th className="px-3 py-2 font-semibold">{t('communal.circuits.colonnes.nom')}</th>
                <th className="px-3 py-2 font-semibold">{t('communal.circuits.colonnes.mode')}</th>
                <th className="px-3 py-2 font-semibold">{t('communal.circuits.colonnes.jours')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('communal.circuits.colonnes.voyages')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('communal.circuits.colonnes.points')}</th>
                <th className="px-3 py-2 font-semibold">{t('communal.circuits.colonnes.vehicule')}</th>
                <th className="px-3 py-2 font-semibold">{t('communal.circuits.colonnes.chauffeur')}</th>
                <th className="px-3 py-2 font-semibold">{t('communal.circuits.colonnes.executant')}</th>
                <th className="px-3 py-2 font-semibold">{t('communal.circuits.colonnes.periode')}</th>
              </tr>
            </thead>
            <tbody>
              {affiches.map((c) => {
                const clos = estClos(c);
                return (
                  <tr
                    key={c.id}
                    onClick={() => onOuvrir(c)}
                    className="cursor-pointer border-b border-ardoise-100 last:border-0 hover:bg-siipi-50"
                  >
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-ardoise-900">{c.nom}</span>
                      {c.code && <span className="ms-2 text-xs text-ardoise-400">{c.code}</span>}
                      {clos && (
                        <span className="ms-2 rounded bg-ardoise-100 px-1.5 py-0.5 text-xs text-ardoise-600">
                          {t('communal.circuits.filtres.clos')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-ardoise-600">
                      {t(`communal.circuits.modes.${c.mode_collecte ?? 'porte_a_porte'}`)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex gap-0.5">
                        {JOURS_COURTS.map((j) => (
                          <span
                            key={j}
                            title={t(`citoyen.jours.${j}`)}
                            className={`flex size-5 items-center justify-center rounded text-[10px] font-semibold ${
                              (c.jours_passage ?? []).includes(j)
                                ? 'bg-siipi-600 text-white'
                                : 'bg-ardoise-100 text-ardoise-400'
                            }`}
                          >
                            {t(`citoyen.joursCourts.${j}`)}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="chiffres px-3 py-2.5 text-right text-ardoise-700">
                      {c.voyages_par_jour ?? 1}
                    </td>
                    <td className="chiffres px-3 py-2.5 text-right">
                      {Number(c.nb_points ?? 0) > 0 ? (
                        <span className="text-ardoise-700">{c.nb_points}</span>
                      ) : (
                        // Un circuit sans point n'est pas encore exploitable :
                        // ni carte, ni ordre de passage. On le signale ici
                        // plutôt que de laisser le vide passer inaperçu.
                        <span className="text-amber-700">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-ardoise-600">{c.vehicule_id ?? '—'}</td>
                    <td className="px-3 py-2.5 text-ardoise-600">{c.chauffeur_nom ?? '—'}</td>
                    <td className="px-3 py-2.5 text-ardoise-600">
                      {c.prestataire_nom ?? t('communal.circuits.regie')}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ardoise-500">
                      {String(c.date_debut ?? '').slice(0, 10)}
                      {c.date_fin ? ` → ${String(c.date_fin).slice(0, 10)}` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
