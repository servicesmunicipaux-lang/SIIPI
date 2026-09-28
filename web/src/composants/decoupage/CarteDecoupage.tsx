// La carte d'un découpage communal — périmètre et secteurs — en lecture, en
// comparaison avec l'état en vigueur, ou en édition (Jalon 7, C2.5/C2.6).
//
// En comparaison, l'état en vigueur est dessiné en gris pointillé SOUS la
// proposition : c'est ce que la FNCT doit voir pour décider, et ce que la
// commune doit voir avant de revenir à une version ancienne.

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

export type Geometrie = { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };

export interface SecteurCarte {
  cle: string;
  name: string;
  color?: string | null;
  geometry: Geometrie;
}

export interface EditionCarte {
  perimetre: boolean;
  secteurs: boolean;
  /** Vrai : le prochain tracé dessiné sur la carte devient un secteur. */
  dessiner: boolean;
  onPerimetre: (g: Geometrie) => void;
  onSecteur: (cle: string, g: Geometrie) => void;
  onNouveau: (g: Geometrie) => void;
}

/** La géométrie d'une couche Leaflet éditée, îlots compris. */
function geometrieDe(couche: L.Layer): Geometrie | null {
  const donnees = (couche as L.GeoJSON).toGeoJSON() as {
    features?: Array<{ geometry: Geometrie }>;
    geometry?: Geometrie;
  };
  if (donnees.features && donnees.features.length > 1) {
    return {
      type: 'MultiPolygon',
      coordinates: donnees.features.flatMap((f) =>
        f.geometry.type === 'MultiPolygon' ? (f.geometry.coordinates as unknown[]) : [f.geometry.coordinates as unknown]
      ),
    };
  }
  return donnees.features?.[0]?.geometry ?? donnees.geometry ?? null;
}

function activerEdition(groupe: L.GeoJSON, surChangement: () => void) {
  groupe.eachLayer((l) => {
    (l as never as { pm?: { enable: (o: object) => void } }).pm?.enable({ allowSelfIntersection: false });
  });
  groupe.on('pm:edit', surChangement);
  groupe.on('pm:markerdragend', surChangement);
}

function Couches({
  perimetre,
  secteurs,
  comparaison,
  edition,
  selection,
  onSelection,
  revision,
}: {
  perimetre: Geometrie | null;
  secteurs: SecteurCarte[];
  comparaison?: { perimetre: Geometrie | null; secteurs: { name: string; geometry: Geometrie }[] };
  edition?: EditionCarte;
  selection?: string | null;
  onSelection?: (cle: string) => void;
  revision: number;
}) {
  const carte = useMap();
  const cadre = useRef(false);
  // Les rappels changent à chaque rendu du parent ; les couches, elles, ne se
  // reconstruisent qu'à un changement de structure (revision). On lit donc
  // toujours les rappels courants par une référence.
  const rappels = useRef(edition);
  rappels.current = edition;

  useEffect(() => {
    const couches: L.Layer[] = [];

    if (comparaison) {
      const avant = L.geoJSON(
        {
          type: 'FeatureCollection',
          features: [
            ...(comparaison.perimetre ? [{ type: 'Feature', geometry: comparaison.perimetre, properties: {} }] : []),
            ...comparaison.secteurs.map((s) => ({ type: 'Feature', geometry: s.geometry, properties: { name: s.name } })),
          ],
        } as never,
        { style: { color: '#6f7c8d', weight: 2, dashArray: '6 6', fillOpacity: 0 }, interactive: false }
      ).addTo(carte);
      couches.push(avant);
    }

    if (perimetre) {
      const p = L.geoJSON(perimetre as never, {
        style: { color: '#13784f', weight: 3, fillOpacity: 0.04 },
        interactive: !!edition?.perimetre,
      }).addTo(carte);
      if (edition?.perimetre) {
        activerEdition(p, () => {
          const g = geometrieDe(p);
          if (g) rappels.current?.onPerimetre(g);
        });
      }
      couches.push(p);
    }

    for (const s of secteurs) {
      const choisi = selection === s.cle;
      const c = L.geoJSON(s.geometry as never, {
        style: {
          color: s.color || '#2563eb',
          weight: choisi ? 4 : 2,
          fillOpacity: choisi ? 0.35 : 0.18,
        },
      }).addTo(carte);
      c.bindTooltip(s.name, { sticky: true });
      if (onSelection) c.on('click', () => onSelection(s.cle));
      if (edition?.secteurs) {
        activerEdition(c, () => {
          const g = geometrieDe(c);
          if (g) rappels.current?.onSecteur(s.cle, g);
        });
      }
      couches.push(c);
    }

    // Le cadrage ne se fait qu'une fois : le refaire à chaque retouche
    // ferait sauter la carte sous la souris de celui qui dessine.
    if (!cadre.current) {
      const bornes = L.featureGroup(couches.filter((c) => c instanceof L.GeoJSON) as L.GeoJSON[]).getBounds();
      if (bornes.isValid()) {
        carte.fitBounds(bornes, { padding: [20, 20] });
        cadre.current = true;
      }
    }

    return () => {
      for (const c of couches) {
        c.off();
        carte.removeLayer(c);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carte, revision, selection, edition?.perimetre, edition?.secteurs]);

  // Le dessin d'un nouveau secteur.
  useEffect(() => {
    if (!edition?.dessiner) return;
    const pm = (carte as never as { pm: { enableDraw: (f: string, o: object) => void; disableDraw: () => void } }).pm;
    pm.enableDraw('Polygon', { allowSelfIntersection: false });
    const surCreation = (e: { layer: L.Layer }) => {
      const g = geometrieDe(e.layer);
      carte.removeLayer(e.layer);
      if (g) rappels.current?.onNouveau(g);
    };
    carte.on('pm:create', surCreation as never);
    return () => {
      carte.off('pm:create', surCreation as never);
      pm.disableDraw();
    };
  }, [carte, edition?.dessiner]);

  return null;
}

export function CarteDecoupage(props: {
  perimetre: Geometrie | null;
  secteurs: SecteurCarte[];
  comparaison?: { perimetre: Geometrie | null; secteurs: { name: string; geometry: Geometrie }[] };
  edition?: EditionCarte;
  selection?: string | null;
  onSelection?: (cle: string) => void;
  /** À incrémenter quand l'ensemble des secteurs change (ajout, retrait, import, couleur). */
  revision?: number;
  hauteur?: string;
}) {
  return (
    <div className={`${props.hauteur ?? 'h-[55dvh]'} overflow-hidden rounded-xl border border-ardoise-200`}>
      <MapContainer center={[34, 9.6]} zoom={7} scrollWheelZoom className="size-full">
        <TileLayer
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Couches {...props} revision={props.revision ?? 0} />
      </MapContainer>
    </div>
  );
}
