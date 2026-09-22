// Import d'un relevé KML/KMZ, en deux temps.
//
// Le premier temps ne touche à rien : il montre ce qui serait créé, combien de
// voyages ont été reconnus, ce qui a été écarté et pourquoi. Le second écrit.
// Un fichier de Dar Chaabane porte jusqu'à 113 arrêts ; les écrire au premier
// clic obligerait l'administrateur à défaire à la main ce qu'il n'a pas relu.
//
// Les avertissements sont affichés au même rang que le reste, pas en petit en
// bas : « 3 points hors des repères de collecte ont été écartés » est
// exactement ce que la personne doit lire avant de valider.
//
// LE PANNEAU DIT TOUJOURS OÙ IL EN EST. Auparavant il n'affichait qu'un bouton
// « Choisir un fichier » : après un import réussi, l'écran redevenait
// exactement celui d'avant, et rien ne disait si quatre-vingt-deux arrêts
// étaient posés ou aucun. Il porte maintenant son état — combien d'éléments
// sont en place, de quel fichier ils viennent, et quand.
//
// ET SE TROMPER DE FICHIER N'EST PLUS DÉFINITIF. Deux relevés du même secteur,
// deux voyages du même matin : la confusion est banale. Elle coûtait une heure
// de suppressions une par une. Le bouton « Retirer » défait l'import entier,
// derrière une confirmation — quatre-vingt-deux arrêts ne s'effacent pas d'un
// clic distrait.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type ApercuImport } from '../../lib/api';

export function CircuitImport({
  circuitId,
  /** Ce que cette zone dépose : l'itinéraire, ou les arrêts. */
  cible,
  /** Ce qui est déjà en place, pour le dire plutôt que d'afficher du vide. */
  dejaPose,
  /**
   * Combien d'éléments sont posés : le nombre d'arrêts, ou 1 / 0 pour
   * l'itinéraire. Sert à écrire « 82 arrêts en place » plutôt que « des
   * arrêts », et à chiffrer la confirmation de retrait — on ne confirme pas
   * l'effacement de quelque chose dont on ignore l'ampleur.
   */
  nbEnPlace,
  onImporte,
}: {
  circuitId: string;
  cible: 'trace' | 'points';
  dejaPose?: { fichier: string | null; le: string | null } | null;
  nbEnPlace?: number | null;
  onImporte: () => void;
}) {
  const { t } = useTranslation();
  const [apercu, setApercu] = useState<ApercuImport | null>(null);
  const [fichier, setFichier] = useState<{ nomFichier: string; contenu: string } | null>(null);
  const [remplacer, setRemplacer] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);
  const [confirmeRetrait, setConfirmeRetrait] = useState(false);

  const enPlace = (nbEnPlace ?? 0) > 0 || Boolean(dejaPose?.le);

  const retirer = async () => {
    setOccupe(true);
    setErreur(null);
    try {
      if (cible === 'trace') await api.supprimerTrace(circuitId);
      else await api.supprimerPoints(circuitId);
      setConfirmeRetrait(false);
      setFait(t(`communal.circuits.import.retire_${cible}`));
      onImporte();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setOccupe(false);
    }
  };

  const choisir = async (evt: React.ChangeEvent<HTMLInputElement>) => {
    const f = evt.target.files?.[0];
    if (!f) return;
    setErreur(null);
    setFait(null);
    setOccupe(true);
    try {
      // Le fichier voyage en base64 : un même chemin pour le KML (texte) et le
      // KMZ (archive). La lecture se fait ici, l'analyse sur le serveur.
      const tampon = await f.arrayBuffer();
      let binaire = '';
      const octets = new Uint8Array(tampon);
      for (let i = 0; i < octets.length; i += 8192) {
        binaire += String.fromCharCode(...octets.subarray(i, i + 8192));
      }
      const contenu = btoa(binaire);
      setFichier({ nomFichier: f.name, contenu });
      setApercu(await api.importerKml(circuitId, { nomFichier: f.name, contenu, valider: false, cible }));
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
      setApercu(null);
    } finally {
      setOccupe(false);
      evt.target.value = '';
    }
  };

  const valider = async () => {
    if (!fichier) return;
    setOccupe(true);
    setErreur(null);
    try {
      const r = await api.importerKml(circuitId, { ...fichier, valider: true, remplacer, cible });
      setFait(t('communal.circuits.import.fait', { crees: r.crees ?? 0, remplaces: r.remplaces ?? 0 }));
      setApercu(null);
      setFichier(null);
      onImporte();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setOccupe(false);
    }
  };

  const parVoyage = apercu
    ? [...new Set(apercu.points.map((p) => p.voyage))].sort((a, b) => a - b)
    : [];

  return (
    <section className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4">
      <div>
        <h2 className="font-semibold text-ardoise-900">{t(`communal.circuits.import.titre_${cible}`)}</h2>
        <p className="mt-1 text-sm text-ardoise-500">{t(`communal.circuits.import.aide_${cible}`)}</p>
      </div>

      {/* --- L'état courant du panneau ------------------------------------- */}
      {enPlace ? (
        <div className="rounded-lg border border-siipi-200 bg-siipi-50 p-3">
          <p className="text-sm font-medium text-siipi-900">
            {cible === 'points'
              ? t('communal.circuits.import.enPlace_points', { n: nbEnPlace ?? 0 })
              : t('communal.circuits.import.enPlace_trace')}
          </p>
          {/* La provenance répond à la question qu'on se pose six mois plus
              tard : d'où sort cette ligne ? Quand elle manque — import
              antérieur à son enregistrement — on le dit, plutôt que de laisser
              un blanc qu'on prendrait pour une absence de données. */}
          <p className="mt-1 text-xs text-siipi-800">
            {dejaPose?.le
              ? t('communal.circuits.import.dejaPose', {
                  fichier: dejaPose.fichier ?? '—',
                  date: new Date(dejaPose.le).toLocaleDateString(),
                })
              : t('communal.circuits.import.provenanceInconnue')}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-ardoise-300 bg-white px-4 text-sm font-medium text-ardoise-700">
              {t('communal.circuits.import.remplacerFichier')}
              <input
                type="file"
                accept=".kml,.kmz,.gpx,.json,.geojson"
                onChange={choisir}
                className="hidden"
                disabled={occupe}
              />
            </label>

            {!confirmeRetrait ? (
              <button
                type="button"
                onClick={() => setConfirmeRetrait(true)}
                disabled={occupe}
                className="min-h-11 rounded-lg border border-red-300 bg-white px-4 text-sm font-medium text-red-800 disabled:opacity-50"
              >
                {t('communal.circuits.import.retirer')}
              </button>
            ) : (
              /* Deux temps, comme l'import lui-même. Quatre-vingt-deux arrêts
                 ne s'effacent pas d'un clic distrait. */
              <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5">
                <span className="text-sm text-red-900">
                  {cible === 'points'
                    ? t('communal.circuits.import.confirmerRetrait_points', { n: nbEnPlace ?? 0 })
                    : t('communal.circuits.import.confirmerRetrait_trace')}
                </span>
                <button
                  type="button"
                  onClick={() => void retirer()}
                  disabled={occupe}
                  className="min-h-11 rounded-lg bg-red-700 px-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {t('communal.circuits.import.confirmer')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmeRetrait(false)}
                  className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700"
                >
                  {t('citoyen.annuler')}
                </button>
              </span>
            )}
          </div>
        </div>
      ) : (
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-ardoise-300 bg-white px-4 font-medium text-ardoise-700">
          {t('communal.circuits.import.choisir')}
          <input
            type="file"
            accept=".kml,.kmz,.gpx,.json,.geojson"
            onChange={choisir}
            className="hidden"
            disabled={occupe}
          />
        </label>
      )}

      {erreur && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{erreur}</p>
      )}
      {fait && (
        <p className="rounded-lg border border-siipi-300 bg-siipi-50 p-3 text-sm text-siipi-800">{fait}</p>
      )}

      {apercu && (
        <div className="space-y-3 rounded-lg border border-ardoise-200 bg-ardoise-50 p-3">
          <p className="text-sm font-medium text-ardoise-900">
            {apercu.fichier}
            <span className="ms-2 rounded bg-white px-1.5 py-0.5 text-xs font-normal text-ardoise-600">
              {t(`communal.circuits.import.familles.${apercu.famille}`)}
            </span>
          </p>

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(cible === 'points'
              ? ([
                  ['points', apercu.nbPoints],
                  ['voyages', apercu.nbVoyages],
                ] as const)
              : ([['trace', apercu.nbSommetsTrace]] as const)
            ).map(([cle, valeur]) => (
              <div key={cle as string} className="rounded-lg bg-white p-2">
                <dt className="text-xs text-ardoise-500">{t(`communal.circuits.import.${cle}`)}</dt>
                <dd className="chiffres text-lg font-semibold text-ardoise-900">{valeur as number}</dd>
              </div>
            ))}
          </dl>

          {/* Les statistiques que le fichier porte sur lui-même, reprises sans
              retouche : elles permettent de confronter le relevé au registre
              communal, où la même tournée est déclarée bien plus longue. */}
          {Object.keys(apercu.statistiques).length > 0 && (
            <div className="rounded-lg bg-white p-2 text-xs text-ardoise-600">
              {['Total distance', 'Total time', 'Average speed'].map((k) =>
                apercu.statistiques[k] ? (
                  <span key={k} className="me-3">
                    {k} : <strong className="chiffres">{apercu.statistiques[k]}</strong>
                  </span>
                ) : null
              )}
            </div>
          )}

          {apercu.avertissements.map((a, i) => (
            <p
              key={i}
              className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900"
            >
              {a}
            </p>
          ))}

          {apercu.points.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-ardoise-200 bg-white">
              <table className="w-full text-xs">
                <tbody>
                  {apercu.points.slice(0, 40).map((p, i) => (
                    <tr key={i} className="border-b border-ardoise-100 last:border-0">
                      <td className="chiffres px-2 py-1 text-ardoise-400">
                        {parVoyage.length > 1 ? `V${p.voyage}·` : ''}
                        {p.ordre}
                      </td>
                      <td className="px-2 py-1">{p.nom ?? '—'}</td>
                      <td className="px-2 py-1 text-ardoise-600">
                        {t(`communal.circuits.typesPoint.${p.type}`, { defaultValue: p.type })}
                      </td>
                      <td className="chiffres px-2 py-1 text-ardoise-500">
                        {p.heureObservee?.slice(0, 5) ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {apercu.points.length > 40 && (
                <p className="px-2 py-1 text-xs text-ardoise-500">
                  {t('communal.circuits.import.reste', { n: apercu.points.length - 40 })}
                </p>
              )}
            </div>
          )}

          {cible === 'points' && apercu.nbPoints > 0 && (
            <label className="flex items-center gap-2 text-sm text-ardoise-700">
              <input
                type="checkbox"
                checked={remplacer}
                onChange={(e) => setRemplacer(e.target.checked)}
                className="size-4"
              />
              {t('communal.circuits.import.remplacer')}
            </label>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setApercu(null);
                setFichier(null);
              }}
              className="min-h-11 flex-1 rounded-lg border border-ardoise-300 bg-white px-4 font-medium text-ardoise-700"
            >
              {t('citoyen.annuler')}
            </button>
            <button
              type="button"
              onClick={() => void valider()}
              /* On ne propose d'importer que si quelque chose sera réellement
                 posé : un bouton actif qui ne fait rien est pire qu'un bouton
                 grisé qui explique pourquoi. */
              disabled={occupe || (!apercu.poseraPoints && !apercu.poseraTrace)}
              className="min-h-11 flex-1 rounded-lg bg-siipi-600 px-4 font-semibold text-white disabled:opacity-50"
            >
              {t('communal.circuits.import.valider')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
