// Carte d'un circuit : tracé et arrêts numérotés dans l'ordre de passage.
//
// Le numéro est l'information principale de cette carte. Un point noir sur un
// fond de plan ne dit rien ; « 14ᵉ arrêt, 8 h 12 » situe la tournée dans le
// temps et permet de répondre à « à quelle heure passez-vous chez moi ».
//
// Quand le relevé porte plusieurs voyages, chacun a sa couleur et sa propre
// numérotation : deux rotations ne desservent pas les mêmes rues, les fondre
// dans une suite unique donnerait un itinéraire qui n'a jamais existé.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PointCollecte } from '../../lib/api';

// Couleurs par voyage. Volontairement peu nombreuses et contrastées : au-delà
// de trois rotations, la couleur ne distingue plus rien et c'est le filtre qui
// sert.
const COULEURS = ['#0f766e', '#b45309', '#6d28d9', '#be123c', '#1d4ed8', '#4d7c0f'];

const COULEURS_TYPE: Record<string, string> = {
  debut_collecte: '#16a34a',
  fin_collecte: '#dc2626',
  point_noir: '#171717',
  centre_transfert: '#7c3aed',
  parc_municipal: '#0369a1',
};

function Cadrer({ points, trace }: { points: PointCollecte[]; trace: [number, number][] }) {
  const carte = useMap();
  useMemo(() => {
    const coords: [number, number][] = [
      ...points.map((p) => [p.lat, p.lng] as [number, number]),
      ...trace.map(([lng, lat]) => [lat, lng] as [number, number]),
    ];
    if (coords.length === 0) return;
    const cadre = L.latLngBounds(coords);
    if (cadre.isValid()) carte.fitBounds(cadre, { padding: [24, 24] });
  }, [points, trace, carte]);
  return null;
}

export function CircuitCarte({
  points,
  trace,
  voyageAffiche,
}: {
  points: PointCollecte[];
  /** [lng, lat][] tel que renvoyé par l'API. */
  trace?: [number, number][];
  voyageAffiche?: number | 'tous';
}) {
  const { t } = useTranslation();
  const tracePoints = trace ?? [];

  const visibles = useMemo(
    () =>
      voyageAffiche === undefined || voyageAffiche === 'tous'
        ? points
        : points.filter((p) => p.voyage === voyageAffiche),
    [points, voyageAffiche]
  );

  // Segments reliant les arrêts d'un même voyage, dans l'ordre de passage.
  // C'est l'itinéraire réellement suivi entre deux arrêts consécutifs, pas le
  // tracé GPS : il montre l'enchaînement, non le chemin.
  const chemins = useMemo(() => {
    const parVoyage = new Map<number, [number, number][]>();
    for (const p of [...visibles].sort((a, b) => a.voyage - b.voyage || a.ordre - b.ordre)) {
      if (!parVoyage.has(p.voyage)) parVoyage.set(p.voyage, []);
      parVoyage.get(p.voyage)!.push([p.lat, p.lng]);
    }
    return [...parVoyage.entries()];
  }, [visibles]);

  if (points.length === 0 && tracePoints.length === 0) {
    return (
      <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">
        {t('communal.circuits.carte.aucunPoint')}
      </p>
    );
  }

  return (
    <div className="h-[60dvh] overflow-hidden rounded-xl border border-ardoise-200">
      <MapContainer
        center={[36.4661, 10.7435]}
        zoom={14}
        /* La molette fait défiler la page, pas zoomer la carte : les boutons
           + et − et le pincement suffisent, et l'écran reste parcourable. */
        scrollWheelZoom={false}
        className="size-full"
      >
        <TileLayer
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Cadrer points={visibles} trace={tracePoints} />

        {/* Le tracé relevé, en fond et en gris : c'est un repère, pas une
            donnée métier. */}
        {tracePoints.length >= 2 && (
          <Polyline
            positions={tracePoints.map(([lng, lat]) => [lat, lng] as [number, number])}
            pathOptions={{ color: '#94a3b8', weight: 3, opacity: 0.7 }}
          />
        )}

        {chemins.map(([voyage, coords]) => (
          <Polyline
            key={`chemin-${voyage}`}
            positions={coords}
            pathOptions={{
              color: COULEURS[(voyage - 1) % COULEURS.length],
              weight: 2,
              opacity: 0.5,
              dashArray: '5 5',
            }}
          />
        ))}

        {visibles.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={11}
            pathOptions={{
              color: COULEURS_TYPE[p.type] ?? COULEURS[(p.voyage - 1) % COULEURS.length],
              fillColor: COULEURS_TYPE[p.type] ?? COULEURS[(p.voyage - 1) % COULEURS.length],
              fillOpacity: 0.85,
              weight: 2,
            }}
          >
            {/* Le numéro est collé au marqueur en permanence, pas au survol :
                sur un écran tactile il n'y a pas de survol. */}
            <Tooltip permanent direction="center" className="siipi-numero">
              <span className="chiffres text-[11px] font-bold text-white">{p.ordre}</span>
            </Tooltip>
            <Popup>
              <p className="font-semibold">
                {p.ordre}. {p.nom ?? t(`communal.circuits.typesPoint.${p.type}`)}
              </p>
              <p className="text-xs">{t(`communal.circuits.typesPoint.${p.type}`)}</p>
              {p.heure_observee && (
                <p className="text-xs">
                  {t('communal.circuits.carte.heureObservee')} {p.heure_observee.slice(0, 5)}
                </p>
              )}
              {!p.heure_observee && p.heure_estimee && (
                <p className="text-xs text-ardoise-500">
                  {t('communal.circuits.carte.heureEstimee')} {p.heure_estimee.slice(0, 5)}
                </p>
              )}
              {p.precision_m != null && (
                <p className="text-xs text-ardoise-500">
                  {t('communal.circuits.carte.precision', { m: Number(p.precision_m).toFixed(1) })}
                </p>
              )}
              {p.observation && <p className="mt-1 text-xs italic">{p.observation}</p>}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
