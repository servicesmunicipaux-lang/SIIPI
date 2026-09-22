// Points de collecte proposés par les citoyens — instruction communale
// (TDR M3.1, sous-module 5.5.2).
//
// UNE PROPOSITION SE TERMINE. Elle est retenue et devient un arrêt de
// tournée, ou elle est refusée avec un motif que son auteur peut lire — jamais
// laissée « en attente » indéfiniment, ce qui coûterait à quelqu'un le temps
// d'avoir sorti son téléphone pour rien.
//
// LA DISTANCE AU VOISIN LE PLUS PROCHE EST LA SEULE CHOSE QUI COMPTE POUR
// DÉCIDER VITE : une proposition à quinze mètres d'un arrêt déjà desservi est
// un doublon probable, et le citoyen ne peut pas le savoir — il ne voit pas la
// tournée.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Circuit, type PointSuggere } from '../../lib/api';
import { Chargement, Erreur, PhotoDeposee } from '../Elements';

export function PointsSuggeres({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const [propositions, setPropositions] = useState<PointSuggere[] | null>(null);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<string>('en_attente');
  const [motifRefus, setMotifRefus] = useState<Record<string, string>>({});
  const [circuitChoisi, setCircuitChoisi] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = async () => {
    try {
      const [p, c] = await Promise.all([
        api.pointsSuggeres(communeId),
        api.circuits(communeId).catch(() => []),
      ]);
      setPropositions(p);
      setCircuits(c);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId]);

  const affichees = useMemo(() => {
    const liste = propositions ?? [];
    return filtre === 'tous' ? liste : liste.filter((p) => p.statut === filtre);
  }, [propositions, filtre]);

  if (erreur && !propositions) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!propositions) return <Chargement />;

  const valider = async (id: string) => {
    const circuitId = circuitChoisi[id];
    if (!circuitId) return;
    setEnCours(id);
    setErreur(null);
    try {
      await api.validerPointSuggere(id, { circuitId });
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(null);
    }
  };

  const refuser = async (id: string) => {
    const motif = motifRefus[id] ?? '';
    if (motif.length < 3) return;
    setEnCours(id);
    setErreur(null);
    try {
      await api.refuserPointSuggere(id, motif);
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(null);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ardoise-900">
          {t('communal.pointsSuggeres.titre')}
        </h1>
        <p className="mt-1 text-sm text-ardoise-500">
          {t('communal.pointsSuggeres.enAttente', {
            nombre: propositions.filter((p) => p.statut === 'en_attente').length,
          })}
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {['en_attente', 'valide', 'refuse', 'tous'].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltre(f)}
            className={`min-h-11 rounded-full px-3 text-sm font-medium ${
              filtre === f
                ? 'bg-ardoise-900 text-white'
                : 'border border-ardoise-300 bg-white text-ardoise-700'
            }`}
          >
            {t(`communal.pointsSuggeres.filtres.${f}`)}
          </button>
        ))}
      </div>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {erreur}
        </p>
      )}

      {affichees.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">
          {t('communal.pointsSuggeres.aucune')}
        </p>
      ) : (
        <ul className="space-y-2">
          {affichees.map((p) => (
            <li key={p.id} className="rounded-xl border border-ardoise-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-ardoise-900">
                    {p.nom || t('communal.pointsSuggeres.sansNom')}
                  </p>
                  <p className="text-xs text-ardoise-500">
                    {new Date(p.created_at).toLocaleDateString('fr-FR')}
                    {p.voisin_nom && (
                      <>
                        {' · '}
                        {t('communal.pointsSuggeres.voisin', {
                          nom: p.voisin_nom,
                          m: p.voisin_distance_m,
                        })}
                      </>
                    )}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.statut === 'en_attente'
                      ? 'bg-amber-100 text-amber-900'
                      : p.statut === 'valide'
                        ? 'bg-siipi-100 text-siipi-800'
                        : 'bg-ardoise-200 text-ardoise-700'
                  }`}
                >
                  {t(`communal.pointsSuggeres.statuts.${p.statut}`)}
                </span>
              </div>

              {p.commentaire && <p className="mt-2 text-sm text-ardoise-600">{p.commentaire}</p>}
              {p.voisin_distance_m !== null && Number(p.voisin_distance_m) < 30 && (
                <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                  {t('communal.pointsSuggeres.doublonProbable')}
                </p>
              )}
              {p.photo_url && (
                <div className="mt-2">
                  <PhotoDeposee chemin={p.photo_url} alt={t('communal.pointsSuggeres.photo')} />
                </div>
              )}
              {p.statut === 'refuse' && p.motif_refus && (
                <p className="mt-2 text-sm text-ardoise-600">
                  {t('communal.pointsSuggeres.motifDonne', { motif: p.motif_refus })}
                </p>
              )}

              {p.statut === 'en_attente' && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={circuitChoisi[p.id] ?? ''}
                    onChange={(e) => setCircuitChoisi((c) => ({ ...c, [p.id]: e.target.value }))}
                    className="min-h-11 min-w-48 rounded-lg border border-ardoise-300 bg-white px-3 text-sm"
                  >
                    <option value="">{t('communal.pointsSuggeres.choisirCircuit')}</option>
                    {circuits.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!circuitChoisi[p.id] || enCours === p.id}
                    onClick={() => void valider(p.id)}
                    className="min-h-11 rounded-lg bg-siipi-600 px-3 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    {t('communal.pointsSuggeres.valider')}
                  </button>
                  <span className="flex min-w-48 flex-1 gap-2">
                    <input
                      value={motifRefus[p.id] ?? ''}
                      onChange={(e) => setMotifRefus((m) => ({ ...m, [p.id]: e.target.value }))}
                      placeholder={t('communal.pointsSuggeres.motifRefus')}
                      className="min-h-11 w-full rounded-lg border border-ardoise-300 px-3 text-sm"
                    />
                    <button
                      type="button"
                      disabled={(motifRefus[p.id] ?? '').length < 3 || enCours === p.id}
                      onClick={() => void refuser(p.id)}
                      className="min-h-11 shrink-0 rounded-lg border border-red-300 bg-white px-3 text-sm font-medium text-red-800 disabled:opacity-40"
                    >
                      {t('communal.pointsSuggeres.refuser')}
                    </button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
