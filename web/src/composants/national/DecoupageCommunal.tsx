// Découpage communal — rectification d'une limite, réservée à la FNCT.
//
// Une frontière communale n'est pas un dessin : elle décide de ce qui relève
// de quelle commune, et donc où atterrissent les signalements, les tonnages et
// les comparaisons. Cet écran part toujours du tracé OFFICIEL importé, montre
// d'où vient ce qui est affiché, et garde le retour en arrière à un clic.
//
// Deux façons de corriger, parce que les deux usages existent :
//   — déplacer des sommets à la souris, pour un décalage de quelques mètres ;
//   — importer un fichier GeoJSON, quand la commune a fait relever sa limite
//     par un géomètre et qu'aucune correction à la main ne vaudra ce relevé.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { Layer, Map as CarteLeaflet } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { api, ErreurApi, type FrontiereCommune } from '../../lib/api';
import { Chargement, Erreur } from '../Elements';
import { formaterNombre } from '../../i18n';

type Geometrie = { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };

/** Active l'édition des sommets sur la couche affichée, et rend le tracé courant. */
function EditeurFrontiere({
  geometrie,
  actif,
  onChangement,
}: {
  geometrie: Geometrie;
  actif: boolean;
  onChangement: (g: Geometrie) => void;
}) {
  const carte = useMap();
  const coucheRef = useRef<Layer | null>(null);

  useEffect(() => {
    const couche = L.geoJSON(geometrie as never, {
      style: { color: '#13784f', weight: 2, fillOpacity: 0.12 },
    }).addTo(carte);
    coucheRef.current = couche;

    const bornes = couche.getBounds();
    if (bornes.isValid()) carte.fitBounds(bornes, { padding: [20, 20] });

    const relever = () => {
      const donnees = couche.toGeoJSON() as {
        features?: Array<{ geometry: Geometrie }>;
        geometry?: Geometrie;
      };
      // toGeoJSON rend une FeatureCollection quand la couche vient d'un
      // MultiPolygon éclaté en plusieurs anneaux ; on recompose alors un
      // MultiPolygon plutôt que de perdre les îlots en route.
      if (donnees.features && donnees.features.length > 1) {
        onChangement({
          type: 'MultiPolygon',
          coordinates: donnees.features.flatMap((f) =>
            f.geometry.type === 'MultiPolygon'
              ? (f.geometry.coordinates as unknown[])
              : [f.geometry.coordinates as unknown]
          ),
        });
      } else {
        const g = donnees.features?.[0]?.geometry ?? donnees.geometry;
        if (g) onChangement(g);
      }
    };

    if (actif) {
      couche.eachLayer((l) => {
        (l as never as { pm: { enable: (o: object) => void } }).pm?.enable({
          allowSelfIntersection: false,
        });
      });
      couche.on('pm:edit', relever);
      couche.on('pm:markerdragend', relever);
    }

    return () => {
      couche.off();
      carte.removeLayer(couche);
      coucheRef.current = null;
    };
  }, [carte, geometrie, actif, onChangement]);

  return null;
}

export function DecoupageCommunal({
  communeId,
  onFermer,
}: {
  communeId: string;
  onFermer: () => void;
}) {
  const { t } = useTranslation();
  const [commune, setCommune] = useState<FrontiereCommune | null>(null);
  const [geometrie, setGeometrie] = useState<Geometrie | null>(null);
  const [modifiee, setModifiee] = useState<Geometrie | null>(null);
  const [edition, setEdition] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const carteRef = useRef<CarteLeaflet | null>(null);

  // Nombre de sommets du tracé. Une limite officielle en compte couramment
  // plusieurs milliers : à l'échelle de la commune entière, les poignées
  // d'édition se superposent et rien n'est saisissable. Le dire évite à
  // l'utilisateur de conclure que l'outil est cassé.
  const sommets = useMemo(() => {
    if (!geometrie) return 0;
    const compter = (t: unknown): number =>
      Array.isArray(t)
        ? typeof t[0] === 'number'
          ? 1
          : (t as unknown[]).reduce((n: number, x) => n + compter(x), 0)
        : 0;
    return compter(geometrie.coordinates);
  }, [geometrie]);

  const charger = async () => {
    try {
      // Tolérance nulle : on édite le tracé réel, pas sa version simplifiée
      // pour l'affichage — enregistrer une simplification reviendrait à
      // dégrader la limite officielle à chaque retouche.
      const collection = await api.frontieres([communeId], 0);
      const f = collection.features[0];
      if (!f) {
        setErreur(t('national.decoupage.sansFrontiere'));
        return;
      }
      setCommune(f.properties);
      setGeometrie(f.geometry);
      setModifiee(null);
      setEdition(false);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId]);

  const enregistrer = async () => {
    if (!modifiee) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.enregistrerFrontiere(communeId, modifiee);
      setMessage(t('national.decoupage.enregistree'));
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  const importerFichier = async (fichier: File) => {
    setErreur(null);
    try {
      const contenu = JSON.parse(await fichier.text());
      // On accepte indifféremment une géométrie nue, une Feature ou une
      // FeatureCollection : ce sont les trois formes que produisent QGIS,
      // ArcGIS et les exports en ligne, et l'utilisateur n'a pas à savoir
      // laquelle il tient.
      const g: Geometrie | undefined =
        contenu.type === 'FeatureCollection'
          ? contenu.features?.[0]?.geometry
          : contenu.type === 'Feature'
            ? contenu.geometry
            : contenu;
      if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) {
        throw new Error(t('national.decoupage.fichierInvalide'));
      }
      setGeometrie(g);
      setModifiee(g);
      setEdition(false);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('national.decoupage.fichierInvalide'));
    }
  };

  if (erreur && !commune) {
    return (
      <div className="space-y-4">
        <Erreur message={erreur} />
        <button
          type="button"
          onClick={onFermer}
          className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-4 font-medium text-ardoise-700"
        >
          {t('national.decoupage.retour')}
        </button>
      </div>
    );
  }
  if (!commune || !geometrie) return <Chargement />;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ardoise-900">
            {t('national.decoupage.titre', { commune: commune.name })}
          </h2>
          <p className="chiffres mt-1 text-sm text-ardoise-500">
            {formaterNombre(commune.areaKm2, 2)} km² · {formaterNombre(commune.population)}{' '}
            {t('commun.habitants')}
            {commune.codeMunicipalite
              ? ` · ${t('national.decoupage.code')} ${commune.codeMunicipalite}`
              : ''}
          </p>
          {/* D'où vient le tracé affiché : une limite rectifiée à la main
              n'engage pas la même chose que la couche nationale. */}
          <p className="mt-1 text-xs text-ardoise-500">
            {t(`national.decoupage.sources.${commune.source ?? 'officiel'}`)}
          </p>
        </div>
        <button
          type="button"
          onClick={onFermer}
          className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-4 text-sm font-medium text-ardoise-700"
        >
          {t('national.decoupage.retour')}
        </button>
      </header>

      <div className="h-[60dvh] overflow-hidden rounded-xl border border-ardoise-200">
        <MapContainer
          center={[34, 9.6]}
          zoom={7}
          scrollWheelZoom
          className="size-full"
          ref={(c) => {
            carteRef.current = c;
          }}
        >
          <TileLayer
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <EditeurFrontiere
            geometrie={geometrie}
            actif={edition}
            onChangement={(g) => setModifiee(g)}
          />
        </MapContainer>
      </div>

      {message && (
        <p className="rounded-xl border border-siipi-300 bg-siipi-50 p-3 text-sm text-siipi-800">
          {message}
        </p>
      )}
      {erreur && <Erreur message={erreur} />}

      <div className="flex flex-wrap gap-2">
        {!edition ? (
          <button
            type="button"
            onClick={() => {
              setEdition(true);
              setMessage(null);
            }}
            className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-semibold text-white"
          >
            {t('national.decoupage.modifier')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEdition(false);
              setModifiee(null);
              void charger();
            }}
            className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-4 text-sm font-medium text-ardoise-700"
          >
            {t('national.decoupage.abandonner')}
          </button>
        )}

        <label className="min-h-11 cursor-pointer rounded-lg border border-ardoise-300 bg-white px-4 py-2.5 text-sm font-medium text-ardoise-700">
          {t('national.decoupage.importer')}
          <input
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importerFichier(f);
              e.target.value = '';
            }}
          />
        </label>

        <button
          type="button"
          disabled={!modifiee || envoi}
          onClick={() => void enregistrer()}
          className="min-h-11 rounded-lg bg-ardoise-900 px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          {t('national.decoupage.enregistrer')}
        </button>
      </div>

      {edition && sommets > 500 && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {t('national.decoupage.tropDeSommets', { sommets: formaterNombre(sommets) })}
        </p>
      )}

      <p className="text-xs text-ardoise-500">{t('national.decoupage.aide')}</p>
    </div>
  );
}
