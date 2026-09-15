import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { Commune, Truck, ContainerSensor, TicketReport } from '../types/siipi';
import { 
  Layers, 
  Upload, 
  Download, 
  Plus, 
  Eye, 
  EyeOff, 
  Trash2, 
  MapPin, 
  Navigation, 
  Share2, 
  Maximize2, 
  Minimize2, 
  Sparkles, 
  CheckCircle2, 
  FileText, 
  Compass, 
  Palette,
  AlertCircle,
  HelpCircle,
  FolderOpen
} from 'lucide-react';

export interface GisLayer {
  id: string;
  name: string;
  type: 'gpx' | 'geojson' | 'custom_draw';
  color: string;
  visible: boolean;
  opacity: number;
  featureCount: number;
  description?: string;
  data: any; // GeoJSON or parsed objects
  leafletLayerGroup?: L.LayerGroup;
}

interface GisInteractiveMapProps {
  commune: Commune;
  trucks: Truck[];
  containers: ContainerSensor[];
  tickets: TicketReport[];
  isAr?: boolean;
}

// Sample pre-configured layers for demonstration and immediate exploration
const DEFAULT_PRESET_LAYERS: Omit<GisLayer, 'leafletLayerGroup'>[] = [
  {
    id: 'layer-circuit-gpx',
    name: 'Circuit Collecte Benne Tasseuse (GPX)',
    type: 'gpx',
    color: '#10b981', // emerald
    visible: true,
    opacity: 0.9,
    featureCount: 1,
    description: 'Tracé GPS réel de la tournée n°04 Marsa Plage -> Saf-Saf -> Corniche (14.2 km)',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Tournée Benne 16m³ Marsa Plage', distanceKm: 14.2, stops: 28 },
          geometry: {
            type: 'LineString',
            coordinates: [
              [10.3250, 36.8780],
              [10.3280, 36.8820],
              [10.3320, 36.8850],
              [10.3300, 36.8890],
              [10.3240, 36.8920],
              [10.3180, 36.8940],
              [10.3120, 36.8890],
              [10.3160, 36.8830],
              [10.3220, 36.8800],
            ]
          }
        }
      ]
    }
  },
  {
    id: 'layer-bacs-points',
    name: 'Bacs 770L & Points d\'Apport Volontaire (GeoJSON)',
    type: 'geojson',
    color: '#06b6d4', // cyan
    visible: true,
    opacity: 1,
    featureCount: 4,
    description: 'Emplacements géocodés des conteneurs collectifs et bornes de tri',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Point PAV 01: Place Saf-Saf (2 Bacs 770L)', status: 'Opérationnel', type: 'Plastique & Carton' },
          geometry: { type: 'Point', coordinates: [10.3255, 36.8825] }
        },
        {
          type: 'Feature',
          properties: { name: 'Point PAV 02: Marché Municipal Marsa Ville', status: 'Opérationnel', type: 'Ordures Ménagères' },
          geometry: { type: 'Point', coordinates: [10.3210, 36.8860] }
        },
        {
          type: 'Feature',
          properties: { name: 'Point PAV 03: Corniche Marsa Plage (PAV Verre)', status: 'Opérationnel', type: 'Verre & Canettes' },
          geometry: { type: 'Point', coordinates: [10.3315, 36.8875] }
        },
        {
          type: 'Feature',
          properties: { name: 'Point PAV 04: Parc Saada (Compostage)', status: 'Opérationnel', type: 'Déchets Verts' },
          geometry: { type: 'Point', coordinates: [10.3185, 36.8795] }
        }
      ]
    }
  },
  {
    id: 'layer-perimetre-geojson',
    name: 'Secteur Prioritaire Gammarth & Zone Hôtelière (GeoJSON)',
    type: 'geojson',
    color: '#8b5cf6', // purple
    visible: true,
    opacity: 0.35,
    featureCount: 1,
    description: 'Polygone de convention spéciale de collecte nocturne pour les établissements touristiques',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Zone Touristique Gammarth', superficieHa: 145, hotels: 12 },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [10.3000, 36.9050],
                [10.3250, 36.9150],
                [10.3350, 36.9000],
                [10.3100, 36.8950],
                [10.3000, 36.9050]
              ]
            ]
          }
        }
      ]
    }
  },
  {
    id: 'layer-points-noirs',
    name: 'Points Noirs & Dépôts Sauvages Signalés (Tickets)',
    type: 'geojson',
    color: '#f43f5e', // rose
    visible: false,
    opacity: 1,
    featureCount: 3,
    description: 'Historique des points d\'accumulation signalés par l\'application mobile citoyenne',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Dépôt sauvage gravats - Rue Sidi Abdelaziz', priorite: 'Haute' },
          geometry: { type: 'Point', coordinates: [10.3290, 36.8905] }
        },
        {
          type: 'Feature',
          properties: { name: 'Débordement herbes & branchages - Bhar Lazreg', priorite: 'Moyenne' },
          geometry: { type: 'Point', coordinates: [10.3080, 36.8750] }
        },
        {
          type: 'Feature',
          properties: { name: 'Accumulation cartons - Proche zone artisanale', priorite: 'Basse' },
          geometry: { type: 'Point', coordinates: [10.3150, 36.8710] }
        }
      ]
    }
  }
];

export const GisInteractiveMap: React.FC<GisInteractiveMapProps> = ({
  commune,
  trucks,
  containers,
  tickets,
  isAr = false
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layerGroupsRef = useRef<{ [key: string]: L.LayerGroup }>({});
  const liveTrucksLayerRef = useRef<L.LayerGroup | null>(null);
  const liveContainersLayerRef = useRef<L.LayerGroup | null>(null);

  const [layers, setLayers] = useState<GisLayer[]>(() => {
    return DEFAULT_PRESET_LAYERS.map(l => ({ ...l }));
  });

  const [activeBaseMap, setActiveBaseMap] = useState<'satellite' | 'osm' | 'dark' | 'positron'>('satellite');
  const [showAddLayerModal, setShowAddLayerModal] = useState(false);
  const [showDrawToolbar, setShowDrawToolbar] = useState(false);
  const [drawMode, setDrawMode] = useState<'none' | 'marker' | 'line' | 'polygon'>('none');
  const [drawnCoordinates, setDrawnCoordinates] = useState<[number, number][]>([]);
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerColor, setNewLayerColor] = useState('#10b981');
  const [rawFileInput, setRawFileInput] = useState<string>('');
  const [importFormat, setImportFormat] = useState<'auto' | 'gpx' | 'geojson'>('auto');
  const [selectedFeatureInfo, setSelectedFeatureInfo] = useState<any | null>(null);
  const [showLiveFleet, setShowLiveFleet] = useState(true);
  const [showLiveContainers, setShowLiveContainers] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Available Real Free Tile Providers
  const TILE_SERVERS = {
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxZoom: 19,
    },
    osm: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    },
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    },
    positron: {
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const defaultLat = commune?.coordinates?.[0] ?? 36.8780;
      const defaultLng = commune?.coordinates?.[1] ?? 10.3250;

      const map = L.map(mapContainerRef.current, {
        center: [defaultLat, defaultLng],
        zoom: 14,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Base tile
      const initialTile = L.tileLayer(TILE_SERVERS.satellite.url, {
        attribution: TILE_SERVERS.satellite.attribution,
        maxZoom: TILE_SERVERS.satellite.maxZoom,
      }).addTo(map);
      tileLayerRef.current = initialTile;

      // Create groups for live trucks and containers
      liveTrucksLayerRef.current = L.layerGroup().addTo(map);
      liveContainersLayerRef.current = L.layerGroup().addTo(map);

      mapInstanceRef.current = map;

      // Handle map clicks when in drawing mode
      map.on('click', (e: L.LeafletMouseEvent) => {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;

        if (drawMode === 'marker') {
          const ptName = prompt('Nom du repère ou point d\'intérêt :', 'Nouveau Bac / Point');
          if (ptName) {
            addNewDrawnPoint(lat, lng, ptName);
          }
        } else if (drawMode === 'line' || drawMode === 'polygon') {
          setDrawnCoordinates(prev => [...prev, [lat, lng]]);
        }
      });
    }

    return () => {
      // Map cleanup on unmount
    };
  }, []);

  // Update base tile when base map changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const config = TILE_SERVERS[activeBaseMap];
    tileLayerRef.current = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: config.maxZoom,
    }).addTo(map);
  }, [activeBaseMap]);

  // Recenter map if commune coordinates change
  useEffect(() => {
    if (mapInstanceRef.current && commune?.coordinates && commune.coordinates.length >= 2) {
      mapInstanceRef.current.setView([commune.coordinates[0], commune.coordinates[1]], 14);
    }
  }, [commune?.id]);

  // Render & Synchronize all user and preset GIS layers
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Clear old layers
    Object.keys(layerGroupsRef.current).forEach(layerId => {
      const group = layerGroupsRef.current[layerId];
      if (group && map.hasLayer(group)) {
        map.removeLayer(group);
      }
    });

    const newGroups: { [key: string]: L.LayerGroup } = {};

    layers.forEach(layer => {
      if (!layer.visible) return;

      const group = L.layerGroup();

      if (layer.data && layer.data.features) {
        L.geoJSON(layer.data, {
          style: (feature) => {
            return {
              color: layer.color,
              weight: 4,
              opacity: layer.opacity,
              fillColor: layer.color,
              fillOpacity: layer.type === 'geojson' ? layer.opacity : 0.2,
            };
          },
          pointToLayer: (feature, latlng) => {
            const markerHtml = `
              <div style="
                background-color: ${layer.color};
                width: 22px;
                height: 22px;
                border-radius: 50%;
                border: 2px solid #ffffff;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 10px;
                font-weight: bold;
              ">
                📍
              </div>
            `;
            const customIcon = L.divIcon({
              className: 'custom-gis-pin',
              html: markerHtml,
              iconSize: [22, 22],
              iconAnchor: [11, 11]
            });

            return L.marker(latlng, { icon: customIcon });
          },
          onEachFeature: (feature, leafletLayer) => {
            const props = feature.properties || {};
            const title = props.name || layer.name;
            const desc = Object.entries(props)
              .filter(([k]) => k !== 'name')
              .map(([k, v]) => `<div style="font-size: 11px; margin-top: 2px;"><strong style="color: #94a3b8;">${k}:</strong> <span style="color: #f1f5f9;">${v}</span></div>`)
              .join('');

            const popupContent = `
              <div style="font-family: system-ui; min-width: 180px; padding: 4px;">
                <div style="font-weight: bold; color: ${layer.color}; font-size: 13px; margin-bottom: 4px;">
                  ${title}
                </div>
                <div style="font-size: 10px; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 6px; text-transform: uppercase;">
                  Couche : ${layer.type.toUpperCase()}
                </div>
                ${desc}
              </div>
            `;

            leafletLayer.bindPopup(popupContent);
            leafletLayer.on('click', () => {
              setSelectedFeatureInfo({
                layerName: layer.name,
                layerType: layer.type,
                properties: props,
              });
            });
          }
        }).addTo(group);
      }

      group.addTo(map);
      newGroups[layer.id] = group;
    });

    layerGroupsRef.current = newGroups;
  }, [layers]);

  // Synchronize Live Trucks Telemetry Layer
  useEffect(() => {
    if (!liveTrucksLayerRef.current) return;
    const group = liveTrucksLayerRef.current;
    group.clearLayers();

    if (!showLiveFleet) return;

    trucks.forEach(truck => {
      if (!truck?.coordinates || truck.coordinates.length < 2) return;
      const isTour = truck.status === 'en_tournee';
      const bgColor = isTour ? '#10b981' : '#0d9488';
      const iconHtml = `
        <div style="
          background: ${bgColor};
          width: 32px;
          height: 32px;
          border-radius: 10px;
          border: 2px solid white;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 14px;
        ">
          🚛
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'truck-pin',
        html: iconHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([truck.coordinates[0], truck.coordinates[1]], { icon: customIcon });
      marker.bindPopup(`
        <div style="font-family: system-ui; min-width: 190px;">
          <div style="font-weight: bold; color: #10b981; font-size: 13px;">Benne ${truck.registration}</div>
          <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">Chauffeur : <strong>${truck.driverName}</strong></div>
          <div style="font-size: 11px; color: #cbd5e1;">Poids actuel : <strong>${truck.currentWeightTons}t</strong> / ${truck.maxWeightTons}t</div>
          <div style="font-size: 11px; color: #cbd5e1;">Vitesse : <strong>${truck.currentSpeedKmH} km/h</strong></div>
          <div style="font-size: 11px; color: #cbd5e1;">Progression : <strong>${truck.completedStops}/${truck.totalStops} arrêts</strong></div>
        </div>
      `);

      marker.addTo(group);
    });
  }, [trucks, showLiveFleet]);

  // Synchronize Live IoT Containers Layer
  useEffect(() => {
    if (!liveContainersLayerRef.current) return;
    const group = liveContainersLayerRef.current;
    group.clearLayers();

    if (!showLiveContainers) return;

    containers.forEach(cnt => {
      if (!cnt?.coordinates || cnt.coordinates.length < 2) return;
      const isFull = cnt.fillLevel > 80;
      const color = isFull ? '#f59e0b' : '#334155';
      const iconHtml = `
        <div style="
          background: ${color};
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: 2px solid ${isFull ? '#fbbf24' : '#64748b'};
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 10px;
          font-weight: bold;
        ">
          🗑️
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'container-pin',
        html: iconHtml,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });

      const marker = L.marker([cnt.coordinates[0], cnt.coordinates[1]], { icon: customIcon });
      marker.bindPopup(`
        <div style="font-family: system-ui; min-width: 170px;">
          <div style="font-weight: bold; color: ${isFull ? '#f59e0b' : '#38bdf8'}; font-size: 12px;">Bac IoT ${cnt.code}</div>
          <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">${cnt.locationName}</div>
          <div style="font-size: 12px; font-weight: bold; color: ${isFull ? '#f59e0b' : '#4ade80'}; margin-top: 4px;">
            Remplissage : ${cnt.fillLevel}%
          </div>
          <div style="font-size: 10px; color: #94a3b8;">Capteur Ultrason LoRaWAN</div>
        </div>
      `);

      marker.addTo(group);
    });
  }, [containers, showLiveContainers]);

  // Toggle layer visibility
  const toggleLayerVisibility = (id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  };

  // Change layer color
  const changeLayerColor = (id: string, color: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, color } : l));
  };

  // Delete layer
  const deleteLayer = (id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id));
  };

  // Parser for GPX or GeoJSON raw strings
  const parseRawFileData = (text: string, format: string): { geojson: any; count: number } => {
    const trimmed = text.trim();

    // Check if JSON / GeoJSON
    if (format === 'geojson' || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const count = parsed.features ? parsed.features.length : 1;
        return { geojson: parsed, count };
      } catch (err) {
        console.error('Invalid GeoJSON format', err);
      }
    }

    // GPX Parser (Extract trackpoints <trkpt lat="..." lon="..."> and waypoints <wpt>)
    if (format === 'gpx' || trimmed.includes('<gpx')) {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(trimmed, 'text/xml');
      const trkpts = xmlDoc.getElementsByTagName('trkpt');
      const wpts = xmlDoc.getElementsByTagName('wpt');

      const features: any[] = [];

      // LineString track
      if (trkpts.length > 0) {
        const lineCoords: [number, number][] = [];
        for (let i = 0; i < trkpts.length; i++) {
          const lat = parseFloat(trkpts[i].getAttribute('lat') || '0');
          const lon = parseFloat(trkpts[i].getAttribute('lon') || '0');
          if (lat && lon) lineCoords.push([lon, lat]);
        }
        features.push({
          type: 'Feature',
          properties: { name: 'Tracé GPX Importé', pointsCount: lineCoords.length },
          geometry: {
            type: 'LineString',
            coordinates: lineCoords
          }
        });
      }

      // Waypoints
      for (let i = 0; i < wpts.length; i++) {
        const lat = parseFloat(wpts[i].getAttribute('lat') || '0');
        const lon = parseFloat(wpts[i].getAttribute('lon') || '0');
        const nameNode = wpts[i].getElementsByTagName('name')[0];
        const name = nameNode ? nameNode.textContent : `Waypoint ${i + 1}`;

        if (lat && lon) {
          features.push({
            type: 'Feature',
            properties: { name },
            geometry: { type: 'Point', coordinates: [lon, lat] }
          });
        }
      }

      return {
        geojson: { type: 'FeatureCollection', features },
        count: features.length
      };
    }

    // Default fallback simple point if raw lat,lng pasted
    const matches = trimmed.match(/([0-9]+\.[0-9]+)[,\s]+([0-9]+\.[0-9]+)/g);
    if (matches) {
      const features = matches.map((m, i) => {
        const parts = m.split(/[,\s]+/);
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        return {
          type: 'Feature',
          properties: { name: `Point importé #${i + 1}` },
          geometry: { type: 'Point', coordinates: [lon, lat] }
        };
      });
      return { geojson: { type: 'FeatureCollection', features }, count: features.length };
    }

    return { geojson: { type: 'FeatureCollection', features: [] }, count: 0 };
  };

  // Handle file upload from user disk
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name;
    const extension = fileName.split('.').pop()?.toLowerCase() || '';

    if (extension === 'kml') {
      alert("⚠️ Le format KML n'est plus pris en charge pour le téléversement de données. Veuillez utiliser un fichier GPX ou GeoJSON (.geojson, .json).");
      if (e.target) e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      if (content.includes('<kml')) {
        alert("⚠️ Le format KML n'est plus pris en charge pour le téléversement de données. Veuillez téléverser un fichier GPX ou GeoJSON valide.");
        return;
      }

      let detectedFormat: 'gpx' | 'geojson' = 'geojson';
      if (extension === 'gpx' || content.includes('<gpx')) detectedFormat = 'gpx';

      const { geojson, count } = parseRawFileData(content, detectedFormat);

      if (count > 0) {
        const newLayer: GisLayer = {
          id: 'layer-uploaded-' + Date.now(),
          name: fileName.replace(/\.[^/.]+$/, ''),
          type: detectedFormat,
          color: newLayerColor,
          visible: true,
          opacity: 0.9,
          featureCount: count,
          description: `Importé depuis le fichier local ${fileName} (${count} entités détectées)`,
          data: geojson
        };

        setLayers(prev => [newLayer, ...prev]);
        setShowAddLayerModal(false);
        setRawFileInput('');
        alert(`✓ Fichier ${fileName} importé avec succès ! ${count} entités géographiques ajoutées sur la carte.`);
      } else {
        alert('⚠️ Impossible de parser les entités géographiques du fichier. Vérifiez qu\'il s\'agit d\'un fichier GPX ou GeoJSON valide.');
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  // Manual Layer Submit from Textarea
  const handleCreateManualLayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawFileInput.trim()) return;

    const { geojson, count } = parseRawFileData(rawFileInput, importFormat);

    if (count > 0) {
      const newLayer: GisLayer = {
        id: 'layer-manual-' + Date.now(),
        name: newLayerName.trim() || 'Nouveau Calque SIG',
        type: importFormat === 'auto' ? 'geojson' : importFormat,
        color: newLayerColor,
        visible: true,
        opacity: 0.9,
        featureCount: count,
        description: `Créé par saisie directe (${count} éléments)`,
        data: geojson
      };

      setLayers(prev => [newLayer, ...prev]);
      setShowAddLayerModal(false);
      setNewLayerName('');
      setRawFileInput('');
      alert(`✓ Couche "${newLayer.name}" créée et ajoutée à la carte avec ${count} entités.`);
    } else {
      alert('⚠️ Aucun élément géographique valide trouvé dans le texte saisi.');
    }
  };

  // Add drawn point
  const addNewDrawnPoint = (lat: number, lng: number, name: string) => {
    const pointFeature = {
      type: 'Feature',
      properties: { name, dateCreation: new Date().toLocaleTimeString() },
      geometry: { type: 'Point', coordinates: [lng, lat] }
    };

    setLayers(prev => {
      const existingDrawn = prev.find(l => l.id === 'layer-user-drawings');
      if (existingDrawn) {
        return prev.map(l => {
          if (l.id === 'layer-user-drawings') {
            return {
              ...l,
              featureCount: l.featureCount + 1,
              data: {
                ...l.data,
                features: [...l.data.features, pointFeature]
              }
            };
          }
          return l;
        });
      } else {
        const newDrawnLayer: GisLayer = {
          id: 'layer-user-drawings',
          name: 'Mes Dessins & Repères Personnalisés',
          type: 'custom_draw',
          color: '#f59e0b',
          visible: true,
          opacity: 1,
          featureCount: 1,
          description: 'Tracés et points d\'intérêt créés directement à la souris sur la carte',
          data: {
            type: 'FeatureCollection',
            features: [pointFeature]
          }
        };
        return [newDrawnLayer, ...prev];
      }
    });

    setDrawMode('none');
  };

  // Complete drawn line or polygon
  const handleFinishDrawing = () => {
    if (drawnCoordinates.length < 2) {
      alert('Veuillez cliquer au moins 2 points sur la carte pour créer un tracé.');
      return;
    }

    const featureGeometry = drawMode === 'polygon'
      ? {
          type: 'Polygon',
          coordinates: [[...drawnCoordinates.map(c => [c[1], c[0]]), [drawnCoordinates[0][1], drawnCoordinates[0][0]]]]
        }
      : {
          type: 'LineString',
          coordinates: drawnCoordinates.map(c => [c[1], c[0]])
        };

    const shapeName = prompt(
      drawMode === 'polygon' ? 'Nom du secteur de collecte / polygone :' : 'Nom du circuit tracé :',
      drawMode === 'polygon' ? 'Nouveau Secteur Polygone' : 'Nouveau Circuit Tracé'
    );

    if (!shapeName) {
      setDrawnCoordinates([]);
      setDrawMode('none');
      return;
    }

    const newFeature = {
      type: 'Feature',
      properties: { name: shapeName, points: drawnCoordinates.length },
      geometry: featureGeometry
    };

    setLayers(prev => {
      const existingDrawn = prev.find(l => l.id === 'layer-user-drawings');
      if (existingDrawn) {
        return prev.map(l => {
          if (l.id === 'layer-user-drawings') {
            return {
              ...l,
              featureCount: l.featureCount + 1,
              data: {
                ...l.data,
                features: [...l.data.features, newFeature]
              }
            };
          }
          return l;
        });
      } else {
        const newDrawnLayer: GisLayer = {
          id: 'layer-user-drawings',
          name: 'Mes Dessins & Repères Personnalisés',
          type: 'custom_draw',
          color: '#f59e0b',
          visible: true,
          opacity: 0.8,
          featureCount: 1,
          description: 'Tracés et polygones créés manuellement',
          data: {
            type: 'FeatureCollection',
            features: [newFeature]
          }
        };
        return [newDrawnLayer, ...prev];
      }
    });

    setDrawnCoordinates([]);
    setDrawMode('none');
  };

  // Export layer to GeoJSON file download
  const handleExportLayer = (layer: GisLayer) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(layer.data, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${layer.name.replace(/\s+/g, '_')}.geojson`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-4">
      
      {/* Top Banner explaining Google My Maps capabilities & 100% Free architecture */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/40 border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[11px] font-bold border border-emerald-500/30">
              MODULE SIG & GOOGLE MY MAPS ILLIMITÉ
            </span>
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              100% Gratuit • Sans Clé API Requise • Couches Illimitées
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-3xl">
            Importez directement vos fichiers <strong>GPX, GeoJSON</strong> (circuits des bennes, bacs 770L, déchetteries, points noirs), commutez les fonds de cartes réels (Satellite haute définition, OpenStreetMap, CartoDB) et dessinez vos propres secteurs sans limite.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddLayerModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Importer Couche (GPX / GeoJSON)</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Map Grid */}
      <div className={`grid grid-cols-1 lg:grid-cols-12 gap-5 ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-950 p-4' : ''}`}>
        
        {/* Left / Center Map Stage */}
        <div className="lg:col-span-8 space-y-3 flex flex-col">
          
          <div className="relative w-full h-[580px] rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden shadow-2xl flex flex-col">
            
            {/* Real Interactive Leaflet Container */}
            <div ref={mapContainerRef} className="flex-1 w-full h-full z-10" />

            {/* Top Left Floating Bar: Quick Base Map Switcher */}
            <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 p-1.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-800 text-xs shadow-xl">
              <span className="text-[10px] uppercase font-mono font-bold text-slate-400 px-1">Fond :</span>
              <button
                onClick={() => setActiveBaseMap('satellite')}
                className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-all ${
                  activeBaseMap === 'satellite' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                🛰️ Satellite HD
              </button>
              <button
                onClick={() => setActiveBaseMap('osm')}
                className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-all ${
                  activeBaseMap === 'osm' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                🗺️ OpenStreetMap
              </button>
              <button
                onClick={() => setActiveBaseMap('dark')}
                className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-all ${
                  activeBaseMap === 'dark' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                🌃 Nuit SIG
              </button>
            </div>

            {/* Top Right Floating Toolbar: Drawing & Controls */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 p-1.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-800 text-xs shadow-xl">
              
              {/* Draw Point */}
              <button
                title="Ajouter un repère ponctuel (bac, signalement)"
                onClick={() => setDrawMode(drawMode === 'marker' ? 'none' : 'marker')}
                className={`p-2 rounded-lg transition-all ${
                  drawMode === 'marker' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <MapPin className="w-4 h-4" />
              </button>

              {/* Draw Line */}
              <button
                title="Tracer une ligne / circuit"
                onClick={() => {
                  setDrawnCoordinates([]);
                  setDrawMode(drawMode === 'line' ? 'none' : 'line');
                }}
                className={`p-2 rounded-lg transition-all ${
                  drawMode === 'line' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Navigation className="w-4 h-4" />
              </button>

              {/* Draw Polygon */}
              <button
                title="Dessiner un polygone / secteur de collecte"
                onClick={() => {
                  setDrawnCoordinates([]);
                  setDrawMode(drawMode === 'polygon' ? 'none' : 'polygon');
                }}
                className={`p-2 rounded-lg transition-all ${
                  drawMode === 'polygon' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Layers className="w-4 h-4" />
              </button>

              <div className="w-[1px] h-4 bg-slate-700 mx-1"></div>

              {/* Toggle Fullscreen */}
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
                title={isFullscreen ? 'Quitter plein écran' : 'Plein écran'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

            </div>

            {/* Drawing in progress hint / finish button banner */}
            {drawMode !== 'none' && (
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs shadow-2xl flex items-center gap-3 animate-pulse">
                <span>
                  {drawMode === 'marker' && '📍 Cliquez sur la carte pour placer un nouveau repère'}
                  {drawMode === 'line' && `✏️ Cliquez pour ajouter des points de circuit (${drawnCoordinates.length} clics)`}
                  {drawMode === 'polygon' && `🔲 Cliquez pour définir le polygone (${drawnCoordinates.length} sommets)`}
                </span>

                {(drawMode === 'line' || drawMode === 'polygon') && drawnCoordinates.length >= 2 && (
                  <button
                    onClick={handleFinishDrawing}
                    className="px-3 py-1 rounded-lg bg-slate-950 text-white font-bold text-[11px] shadow hover:bg-slate-900"
                  >
                    Valider le Tracé
                  </button>
                )}

                <button
                  onClick={() => {
                    setDrawMode('none');
                    setDrawnCoordinates([]);
                  }}
                  className="px-2 py-0.5 rounded text-[11px] bg-amber-600 text-white"
                >
                  Annuler
                </button>
              </div>
            )}

            {/* Bottom Status Bar */}
            <div className="p-3 bg-slate-900/95 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-300 z-20">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showLiveFleet}
                    onChange={(e) => setShowLiveFleet(e.target.checked)}
                    className="rounded accent-emerald-500"
                  />
                  <span className="text-emerald-400 font-semibold">Flotte Bennes Live ({trucks.length})</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showLiveContainers}
                    onChange={(e) => setShowLiveContainers(e.target.checked)}
                    className="rounded accent-cyan-500"
                  />
                  <span className="text-cyan-400 font-semibold">Bacs IoT 770L ({containers.length})</span>
                </label>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                <span>Coordonnées : {commune?.coordinates ? `${commune.coordinates[0]?.toFixed(4)}°N, ${commune.coordinates[1]?.toFixed(4)}°E` : '36.8780°N, 10.3250°E'}</span>
                <span>•</span>
                <span className="text-emerald-400">{layers.filter(l => l.visible).length} Couches actives</span>
              </div>
            </div>

          </div>

          {/* Selected Feature Inspector Card */}
          {selectedFeatureInfo && (
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-start justify-between gap-4 text-xs animate-fadeIn">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">{selectedFeatureInfo.properties.name || 'Entité sélectionnée'}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-emerald-300 uppercase">
                    {selectedFeatureInfo.layerType}
                  </span>
                </div>
                <div className="text-slate-400 text-[11px]">
                  Couche parente : <span className="text-slate-200">{selectedFeatureInfo.layerName}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {Object.entries(selectedFeatureInfo.properties)
                    .filter(([k]) => k !== 'name')
                    .map(([k, v]) => (
                      <div key={k} className="p-1.5 rounded bg-slate-950 border border-slate-800 text-[11px]">
                        <span className="text-slate-500 block text-[10px]">{k}</span>
                        <span className="text-white font-medium">{String(v)}</span>
                      </div>
                    ))}
                </div>
              </div>
              <button
                onClick={() => setSelectedFeatureInfo(null)}
                className="text-slate-500 hover:text-white p-1"
              >
                ✕
              </button>
            </div>
          )}

        </div>

        {/* Right Column: Google My Maps Style Layer Manager */}
        <div className="lg:col-span-4 space-y-4">
          
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4 text-xs flex flex-col h-[580px]">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-white text-sm">Gestionnaire de Couches SIG</h3>
              </div>
              <span className="font-mono text-[11px] bg-slate-800 text-emerald-300 px-2.5 py-0.5 rounded-full font-bold">
                {layers.length} Calques
              </span>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowAddLayerModal(true)}
                className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nouveau Calque</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-700"
              >
                <FolderOpen className="w-3.5 h-3.5 text-teal-400" />
                <span>Ouvrir Fichier</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".gpx,.geojson,.json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {/* Scrollable Layer Tree */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {layers.length === 0 ? (
                <div className="p-8 text-center text-slate-500 space-y-2">
                  <Layers className="w-8 h-8 mx-auto text-slate-600" />
                  <p>Aucune couche active. Importez un fichier GPX ou GeoJSON pour commencer.</p>
                </div>
              ) : (
                layers.map(layer => (
                  <div
                    key={layer.id}
                    className={`p-3 rounded-xl border transition-all space-y-2 ${
                      layer.visible
                        ? 'bg-slate-950 border-slate-800 hover:border-slate-700'
                        : 'bg-slate-950/50 border-slate-900 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Eye toggle */}
                        <button
                          onClick={() => toggleLayerVisibility(layer.id)}
                          className={`p-1 rounded hover:bg-slate-800 transition-colors ${
                            layer.visible ? 'text-emerald-400' : 'text-slate-600'
                          }`}
                          title={layer.visible ? 'Masquer la couche' : 'Afficher la couche'}
                        >
                          {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>

                        {/* Color indicator / picker */}
                        <input
                          type="color"
                          value={layer.color}
                          onChange={(e) => changeLayerColor(layer.id, e.target.value)}
                          className="w-4 h-4 rounded cursor-pointer border-0 bg-transparent p-0"
                          title="Changer la couleur"
                        />

                        {/* Layer title */}
                        <div className="truncate">
                          <span className="font-bold text-white text-xs block truncate" title={layer.name}>
                            {layer.name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {layer.type.toUpperCase()} • {layer.featureCount} entités
                          </span>
                        </div>
                      </div>

                      {/* Export & Delete */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleExportLayer(layer)}
                          className="p-1 text-slate-400 hover:text-emerald-400 rounded hover:bg-slate-800"
                          title="Exporter en GeoJSON"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteLayer(layer.id)}
                          className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800"
                          title="Supprimer ce calque"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                    </div>

                    {layer.description && (
                      <p className="text-[11px] text-slate-400 leading-tight pl-6">
                        {layer.description}
                      </p>
                    )}

                    {/* Opacity slider */}
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-900 pl-6 text-[10px] text-slate-500">
                      <span>Opacité :</span>
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={layer.opacity}
                        onChange={(e) => {
                          const op = parseFloat(e.target.value);
                          setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, opacity: op } : l));
                        }}
                        className="flex-1 accent-emerald-500 h-1"
                      />
                      <span className="font-mono">{Math.round(layer.opacity * 100)}%</span>
                    </div>

                  </div>
                ))
              )}
            </div>

            {/* Bottom info banner on Google Maps pricing vs OpenStreetMap */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Gratuité garantie :</strong> Moteur Leaflet + Tuiles OSM & ESRI Satellite illimitées sans frais d'API.
              </span>
            </div>

          </div>

        </div>

      </div>

      {/* Modal: Import / Create New Layer */}
      {showAddLayerModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 text-xs animate-fadeIn">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Ajouter une Couche Géographique (GPX, GeoJSON)</h3>
              </div>
              <button onClick={() => setShowAddLayerModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateManualLayer} className="space-y-4">
              
              {/* Option A: Direct File Upload */}
              <div className="p-4 rounded-xl bg-slate-950 border-2 border-dashed border-slate-700 text-center space-y-2">
                <FolderOpen className="w-8 h-8 text-emerald-400 mx-auto" />
                <div>
                  <label className="cursor-pointer text-emerald-400 font-bold hover:underline">
                    Cliquez ici pour sélectionner un fichier (.gpx, .geojson)
                    <input
                      type="file"
                      accept=".gpx,.geojson,.json"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[11px] text-slate-500 mt-1">Glissez-déposez ou parcourez votre disque dur</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-slate-500 text-[11px] justify-center">
                <span>— OU COLLER DU TEXTE / COORDONNÉES DIRECTEMENT —</span>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Nom du Calque :</label>
                <input
                  type="text"
                  value={newLayerName}
                  onChange={(e) => setNewLayerName(e.target.value)}
                  placeholder="Ex: Circuit Matin Sidi Bou Saïd"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Format des Données :</label>
                  <select
                    value={importFormat}
                    onChange={(e: any) => setImportFormat(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  >
                    <option value="auto">Détection Automatique</option>
                    <option value="gpx">GPX (Tracés GPS & Waypoints)</option>
                    <option value="geojson">GeoJSON (Points & Polygones)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Couleur d'Affichage :</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newLayerColor}
                      onChange={(e) => setNewLayerColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0"
                    />
                    <span className="font-mono text-slate-300">{newLayerColor}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Contenu brut GPX / GeoJSON (ou liste de coordonnées lat,lng) :</label>
                <textarea
                  rows={4}
                  value={rawFileInput}
                  onChange={(e) => setRawFileInput(e.target.value)}
                  placeholder="Collez ici du GPX ou du GeoJSON..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono text-[11px] placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddLayerModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors"
                >
                  Créer et Ajouter la Couche
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
