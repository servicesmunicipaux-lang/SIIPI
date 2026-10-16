// Poser une position d'un clic sur la carte de la commune — pour un point de
// collecte ou un lieu. La carte s'ouvre sur la frontière de la commune : une
// commune qui n'a encore rien posé ne doit pas s'ouvrir sur le centre de Tunis.
//
// La position reste celle qu'on a cliquée : la plateforme ne la « recale » ni
// sur une rue ni sur un secteur (elle constate, elle ne corrige pas).

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, GeoJSON, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import { FondsDeCarte } from '../carte/FondsDeCarte';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, type CollectionFrontieres } from '../../lib/api';

export type Position = { lat: number; lng: number };

function Pointeur({ onPosition }: { onPosition: (p: Position) => void }) {
  useMapEvents({
    click: (e) => onPosition({ lat: Number(e.latlng.lat.toFixed(6)), lng: Number(e.latlng.lng.toFixed(6)) }),
  });
  return null;
}

function Cadrer({ frontiere }: { frontiere: CollectionFrontieres | null }) {
  const carte = useMap();
  const fait = useRef(false);
  useEffect(() => {
    if (fait.current || !frontiere?.features.length) return;
    const cadre = L.geoJSON(frontiere as unknown as GeoJSON.GeoJsonObject).getBounds();
    if (cadre.isValid()) {
      carte.fitBounds(cadre, { padding: [16, 16] });
      fait.current = true;
    }
  }, [frontiere, carte]);
  return null;
}

export function ChoixPosition({
  communeId,
  position,
  onPosition,
}: {
  communeId: string;
  position: Position | null;
  onPosition: (p: Position) => void;
}) {
  const { t } = useTranslation();
  const [frontiere, setFrontiere] = useState<CollectionFrontieres | null>(null);

  useEffect(() => {
    api.frontieres([communeId], 0.0002).then(setFrontiere, () => setFrontiere(null));
  }, [communeId]);

  return (
    <div className="space-y-1">
      <p className="text-xs text-ardoise-600">{t('ajout.position.aide')}</p>
      <div className="h-64 overflow-hidden rounded-xl border border-ardoise-200 sm:h-72">
        <MapContainer center={[34, 9.6]} zoom={7} scrollWheelZoom className="size-full cursor-crosshair">
          <FondsDeCarte />
          <Cadrer frontiere={frontiere} />
          {frontiere && (
            <GeoJSON
              key={communeId}
              data={frontiere as unknown as GeoJSON.GeoJsonObject}
              interactive={false}
              style={{ color: '#13784f', weight: 2, fillOpacity: 0.03 }}
            />
          )}
          <Pointeur onPosition={onPosition} />
          {position && <CircleMarker center={[position.lat, position.lng]} radius={10} pathOptions={{ color: '#13784f', weight: 3 }} />}
        </MapContainer>
      </div>
      <p className="chiffres text-xs text-ardoise-700" aria-live="polite" dir="ltr">
        {position ? `${position.lat}, ${position.lng}` : ''}
      </p>
      {!position && <p className="text-xs text-amber-800">{t('ajout.position.requise')}</p>}
    </div>
  );
}
