// Le panneau qui s'ouvre quand on choisit un circuit sur la carte.
//
// CE QU'IL RÉPARE. Les circuits, leurs arrêts et leurs contrôles vivaient dans
// trois onglets distincts. Vérifier « la tournée n° 3 est-elle passée, et
// où ? » demandait trois écrans et deux allers-retours de mémoire : on retient
// le nom du circuit, on va chercher ses arrêts, on retourne chercher le dernier
// constat. Ce n'est pas de la lenteur, c'est une charge mentale qui fait
// renoncer — et un contrôle auquel on renonce n'est pas fait.
//
// Le panneau répond aux trois questions au même endroit, SANS quitter la
// carte : qui l'exécute et avec quoi, combien d'arrêts et de quelle nature, et
// ce que disent les derniers passages.
//
// IL NE DUPLIQUE PAS LA FICHE DU CIRCUIT. Il montre ce qui aide à décider
// devant la carte ; la modification reste dans la fiche, où elle a sa place.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type ControleTerrain } from '../../lib/api';

const STYLE_ETAT: Record<string, string> = {
  fait: 'bg-siipi-100 text-siipi-800',
  partiel: 'bg-amber-100 text-amber-900',
  non_fait: 'bg-red-100 text-red-900',
};

export function PanneauCircuit({
  communeId,
  circuit,
  points,
  couleur,
  onFermer,
}: {
  communeId: string;
  /** Le circuit choisi sur la carte, tel que la carte le porte déjà. */
  circuit: { id: string; nom: string; prestataire_nom?: string | null; vehicule_code?: string | null; jours_passage?: number[] | null };
  /** Les arrêts de CE circuit, déjà chargés par la carte : on ne les redemande pas. */
  points: { id: string; nom?: string | null; type?: string | null; ordre?: number | null }[];
  couleur: string;
  onFermer: () => void;
}) {
  const { t } = useTranslation();
  const [controles, setControles] = useState<ControleTerrain[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    setControles(null);
    setErreur(null);
    // Trente jours : au-delà, un constat ne dit plus rien de l'état d'une
    // tournée ; en deçà, on raterait un circuit hebdomadaire.
    const depuis = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    api
      .controles(communeId, depuis)
      .then((tous) => {
        if (!vivant) return;
        setControles(tous.filter((c) => c.circuit_id === circuit.id));
      })
      .catch((err) => {
        if (vivant) setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
      });
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId, circuit.id]);

  // Les arrêts par nature : un point noir n'est pas un arrêt de collecte, et
  // trois points noirs sur une tournée sont l'information du jour.
  const parType = points.reduce<Record<string, number>>((acc, p) => {
    const cle = p.type ?? 'autre';
    acc[cle] = (acc[cle] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <aside
      className="flex max-h-[70vh] w-full flex-col overflow-y-auto rounded-xl border bg-white p-3 lg:max-h-none lg:w-80 lg:shrink-0"
      style={{ borderColor: couleur }}
      aria-label={t('communal.carte.panneauCircuit')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="inline-block size-3 rounded-full align-middle" style={{ background: couleur }} />
          <h2 className="ms-2 inline align-middle font-semibold text-ardoise-900">{circuit.nom}</h2>
          <p className="mt-0.5 text-xs text-ardoise-500">
            {circuit.prestataire_nom ?? t('communal.circuits.regie')}
            {circuit.vehicule_code ? ` · ${circuit.vehicule_code}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onFermer}
          className="min-h-9 shrink-0 rounded-lg px-2 text-sm text-ardoise-500 hover:bg-ardoise-100"
        >
          {t('commun.fermer')}
        </button>
      </div>

      {/* --- Les arrêts ---------------------------------------------------- */}
      <div className="mt-3 border-t border-ardoise-100 pt-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ardoise-500">
          {t('communal.carte.arrets', { n: points.length })}
        </p>
        {points.length === 0 ? (
          /* « Aucun arrêt » est une information, pas un vide : le circuit
             existe au registre et personne ne sait où il passe. */
          <p className="mt-1 text-sm text-amber-800">{t('communal.carte.aucunArret')}</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-1">
            {Object.entries(parType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, n]) => (
                <li key={type} className="rounded-full bg-ardoise-100 px-2 py-0.5 text-xs text-ardoise-700">
                  {t(`communal.points.types.${type}`, { defaultValue: type })} · {n}
                </li>
              ))}
          </ul>
        )}
      </div>

      {/* --- Les derniers passages ----------------------------------------- */}
      <div className="mt-3 border-t border-ardoise-100 pt-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ardoise-500">
          {t('communal.carte.derniersControles')}
        </p>

        {erreur && <p className="mt-1 text-sm text-red-800">{erreur}</p>}

        {!controles && !erreur && (
          <div className="mt-2 h-12 animate-pulse rounded-lg bg-ardoise-100" aria-label={t('commun.chargement')} />
        )}

        {controles?.length === 0 && (
          /* Trente jours sans constat sur une tournée active : ce n'est pas
             « rien à signaler », c'est un contrôle qui n'a pas eu lieu. */
          <p className="mt-1 text-sm text-amber-800">{t('communal.carte.aucunControle')}</p>
        )}

        {controles && controles.length > 0 && (
          <ul className="mt-1 space-y-1">
            {controles.slice(0, 6).map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLE_ETAT[c.etat] ?? ''}`}>
                  {t(`communal.preuve.etats.${c.etat}`, { defaultValue: c.etat })}
                </span>
                <span className="text-ardoise-600">
                  {new Date(c.date_controle).toLocaleDateString('fr-FR')}
                </span>
                {c.remarque && <span className="truncate text-ardoise-500">{c.remarque}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
