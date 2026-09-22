// La tournée du jour, côté prestataire.
//
// « Si mon camion est passé, je veux que ça se voie dans le système — pas que
// ça reste ma parole contre celle du citoyen. »
//
// C'est exactement ce que fait cet écran, et c'est pourquoi il est plus exigeant
// qu'un simple bouton « fait ». Une déclaration n'a de valeur probante que si
// l'on sait DANS QUELLES CONDITIONS elle a été produite : sur place, avec une
// position relevée par l'appareil, ou le soir au bureau de mémoire. L'écran
// capte la position avant même qu'on touche un bouton, et affiche honnêtement
// ce qu'il a obtenu — un système qui laisserait croire à une preuve GPS
// inexistante desservirait le prestataire le jour où elle serait contestée.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Circuit, type DeclarationPassage } from '../../lib/api';
import { Chargement, Erreur } from '../Elements';

type Statut = 'effectue' | 'partiel' | 'impossible';

const STATUTS: Statut[] = ['effectue', 'partiel', 'impossible'];

const STYLE: Record<Statut, { actif: string; repos: string }> = {
  effectue: { actif: 'bg-siipi-600 text-white', repos: 'text-siipi-700 hover:bg-siipi-50' },
  partiel: { actif: 'bg-amber-500 text-white', repos: 'text-amber-700 hover:bg-amber-50' },
  impossible: { actif: 'bg-red-600 text-white', repos: 'text-red-700 hover:bg-red-50' },
};

function dateLocale(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function MaTournee() {
  const { t } = useTranslation();
  const [circuits, setCircuits] = useState<Circuit[] | null>(null);
  const [passages, setPassages] = useState<DeclarationPassage[]>([]);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [geoRefusee, setGeoRefusee] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const aujourdhui = useMemo(dateLocale, []);
  const jourSemaine = useMemo(() => new Date().getDay() || 7, []);

  // La position est demandée à l'ouverture, pas au moment du clic : sur le
  // terrain, le premier relevé peut prendre plusieurs secondes, et personne
  // n'attend devant un bouton qui ne réagit pas.
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoRefusee(true);
      return;
    }
    const montre = navigator.geolocation.watchPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoRefusee(true),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 }
    );
    return () => navigator.geolocation.clearWatch(montre);
  }, []);

  const charger = async () => {
    try {
      const [c, p] = await Promise.all([api.mesCircuits(), api.mesPassages(aujourdhui)]);
      setCircuits(c);
      setPassages(p);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (erreur) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!circuits) return <Chargement />;

  const attendus = circuits.filter((c) => c.actif && (c.jours_passage ?? []).includes(jourSemaine));
  const declarationDe = (circuitId: string) =>
    passages.find((p) => p.circuit_id === circuitId && p.date_passage === aujourdhui);

  const declarer = async (circuitId: string, statut: Statut) => {
    setEnCours(circuitId);
    try {
      await api.declarerPassage({
        circuitId,
        datePassage: aujourdhui,
        statut,
        // Déclaré sur le terrain si et seulement si l'appareil a fourni une
        // position : c'est le serveur qui aura le dernier mot, mais le client
        // ne doit pas prétendre mieux que ce qu'il sait.
        modeSaisie: position ? 'terrain' : 'bureau',
        lat: position?.lat,
        lng: position?.lng,
        positionSource: position ? 'appareil' : 'absente',
      });
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(null);
    }
  };

  const declares = attendus.filter((c) => declarationDe(c.id)).length;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold text-ardoise-900">{t('prestataire.tournee.titre')}</h1>
        <p className="mt-1 text-sm text-ardoise-500">
          {t('prestataire.tournee.avancement', { declares, total: attendus.length })}
        </p>
      </header>

      {/* L'état de la preuve, annoncé avant la saisie et non après. */}
      <p
        className={`rounded-xl border p-3 text-sm ${
          position
            ? 'border-siipi-300 bg-siipi-50 text-siipi-800'
            : 'border-amber-300 bg-amber-50 text-amber-900'
        }`}
      >
        {position
          ? t('prestataire.tournee.positionActive')
          : geoRefusee
            ? t('prestataire.tournee.positionRefusee')
            : t('prestataire.tournee.positionAttente')}
      </p>

      {attendus.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">
          {circuits.length === 0
            ? t('prestataire.tournee.aucunCircuit')
            : t('prestataire.tournee.aucunAujourdhui')}
        </p>
      ) : (
        <ul className="space-y-2">
          {attendus.map((c) => {
            const declaration = declarationDe(c.id);
            return (
              <li
                key={c.id}
                className={`rounded-xl border p-4 ${
                  declaration ? 'border-ardoise-200 bg-white' : 'border-ardoise-300 bg-ardoise-50'
                }`}
              >
                <p className="font-medium text-ardoise-900">{c.nom}</p>
                <p className="text-xs text-ardoise-500">{c.commune_nom}</p>

                <div
                  className="mt-3 flex overflow-hidden rounded-lg border border-ardoise-300 bg-white"
                  role="group"
                  aria-label={c.nom}
                >
                  {STATUTS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={enCours === c.id}
                      onClick={() => void declarer(c.id, s)}
                      aria-pressed={declaration?.statut === s}
                      className={`min-h-12 flex-1 border-ardoise-300 px-2 text-sm font-medium not-first:border-s ${
                        declaration?.statut === s ? STYLE[s].actif : STYLE[s].repos
                      }`}
                    >
                      {t(`prestataire.statuts.${s}`)}
                    </button>
                  ))}
                </div>

                {declaration && (
                  <p className="mt-2 text-xs text-ardoise-500">
                    {t(`prestataire.tournee.preuve.${declaration.position_source}`)}
                    {declaration.mode_saisie === 'bureau' &&
                      ` · ${t('prestataire.tournee.preuve.bureau')}`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
