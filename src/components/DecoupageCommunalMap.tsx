import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import { Commune, CollectionZone } from '../types/siipi';
import { useCollectionZones } from '../hooks/useCollectionZones';
import { apiClient } from '../lib/apiClient';
import {
  MapPinned,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  AlertCircle,
  Users,
  Palette,
  X,
  Check,
  Info,
} from 'lucide-react';

interface Prestataire {
  id: string;
  full_name: string;
  email: string;
}

interface DecoupageCommunalMapProps {
  commune: Commune;
  /** true pour Admin Commune / Super Admin FNCT (dessin + édition) ; false en lecture seule (Gestionnaire Prestataire). */
  canEdit: boolean;
}

const ZONE_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777'];

// Écran "Découpage communal" (CDC) : affiche la frontière administrative réelle de la
// commune (importée depuis OpenStreetMap, voir backend/seed/importBoundaries.ts) et
// permet à l'Admin Commune d'y dessiner des secteurs/zones de collecte — base pour la
// future affectation des tournées et le GeoTracker. Suit le même principe d'intégration
// à l'API réelle que GisInteractiveMap / MunicipalPortal (voir useCollectionZones.ts).
export const DecoupageCommunalMap: React.FC<DecoupageCommunalMapProps> = ({ commune, canEdit }) => {
  const { zones, boundary, loading, error, actionError, createZone, updateZone, deleteZone } = useCollectionZones(
    commune?.id
  );
  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const boundaryLayerRef = useRef<L.GeoJSON | null>(null);
  const zonesLayerRef = useRef<L.LayerGroup | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const drawControlRef = useRef<L.Control.Draw | null>(null);

  const [pendingGeometry, setPendingGeometry] = useState<any | null>(null);
  const [pendingLayer, setPendingLayer] = useState<L.Layer | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formFrequency, setFormFrequency] = useState('');
  const [formPopulation, setFormPopulation] = useState('');
  const [formColor, setFormColor] = useState(ZONE_COLORS[0]);
  const [formPrestataireId, setFormPrestataireId] = useState('');

  // Liste des Gestionnaire Prestataire de la commune, pour le sélecteur d'assignation
  // (endpoint réservé à Admin Commune / Super Admin FNCT — non appelé en lecture seule).
  useEffect(() => {
    if (!canEdit || !commune?.id) return;
    apiClient
      .get<Prestataire[]>(`/communes/${encodeURIComponent(commune.id)}/prestataires`)
      .then(setPrestataires)
      .catch(() => setPrestataires([]));
  }, [canEdit, commune?.id]);

  // Initialisation de la carte (une seule fois)
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;
    const defaultLat = commune?.coordinates?.[0] ?? 36.8780;
    const defaultLng = commune?.coordinates?.[1] ?? 10.3250;

    const map = L.map(mapContainerRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 13,
      zoomControl: false,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    zonesLayerRef.current = L.layerGroup().addTo(map);
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Affiche/rafraîchit la frontière réelle de la commune (fond de carte)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (boundaryLayerRef.current) {
      map.removeLayer(boundaryLayerRef.current);
      boundaryLayerRef.current = null;
    }
    if (boundary?.geometry) {
      const layer = L.geoJSON(boundary.geometry as any, {
        style: { color: '#64748b', weight: 2, dashArray: '6 4', fillOpacity: 0.03, fillColor: '#64748b' },
        interactive: false,
      }).addTo(map);
      boundaryLayerRef.current = layer;
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
    }
  }, [boundary]);

  // Affiche les secteurs/zones existants
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = zonesLayerRef.current;
    if (!map || !group) return;
    group.clearLayers();
    zones.forEach((zone) => {
      const layer = L.geoJSON(zone.geometry as any, {
        style: {
          color: zone.color,
          weight: selectedZoneId === zone.id ? 4 : 2,
          fillColor: zone.color,
          fillOpacity: selectedZoneId === zone.id ? 0.35 : 0.18,
        },
      });
      layer.bindTooltip(zone.name, { sticky: true });
      layer.on('click', () => setSelectedZoneId(zone.id));
      layer.addTo(group);
    });
  }, [zones, selectedZoneId]);

  // Active l'outil de dessin (Admin Commune / Super Admin FNCT uniquement)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const drawnItems = drawnItemsRef.current;
    if (!map || !drawnItems || !canEdit) return;

    const control = new (L.Control as any).Draw({
      position: 'topright',
      draw: {
        polygon: {
          allowIntersection: false,
          // showArea désactivé : bug connu de leaflet-draw 1.0.4 avec Leaflet 1.9.x
          // (L.GeometryUtil.readableArea référence une variable "type" non définie,
          // ce qui casse le dessin dès le 2e sommet). L'info de surface n'est pas
          // indispensable pour ce module.
          showArea: false,
          shapeOptions: { color: '#2563eb' },
        },
        marker: false,
        circle: false,
        circlemarker: false,
        polyline: false,
        rectangle: false,
      },
      edit: { featureGroup: drawnItems, remove: false, edit: false },
    });
    map.addControl(control);
    drawControlRef.current = control;

    const onCreated = (e: any) => {
      drawnItems.clearLayers();
      drawnItems.addLayer(e.layer);
      const geojson = e.layer.toGeoJSON();
      setPendingGeometry(geojson.geometry);
      setPendingLayer(e.layer);
      setFormName('');
      setFormCode('');
      setFormFrequency('');
      setFormPopulation('');
      setFormColor(ZONE_COLORS[zones.length % ZONE_COLORS.length]);
      setFormPrestataireId('');
    };
    map.on((L as any).Draw.Event.CREATED, onCreated);

    return () => {
      map.off((L as any).Draw.Event.CREATED, onCreated);
      map.removeControl(control);
      drawControlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, zones.length]);

  const cancelPendingZone = () => {
    if (pendingLayer && drawnItemsRef.current) {
      drawnItemsRef.current.removeLayer(pendingLayer);
    }
    setPendingGeometry(null);
    setPendingLayer(null);
  };

  const savePendingZone = async () => {
    if (!pendingGeometry || !formName.trim()) return;
    setBusy(true);
    const created = await createZone({
      name: formName.trim(),
      code: formCode.trim() || undefined,
      collectionFrequency: formFrequency.trim() || undefined,
      estimatedPopulation: formPopulation ? Number(formPopulation) : undefined,
      color: formColor,
      assignedPrestataireId: formPrestataireId || undefined,
      geometry: pendingGeometry,
    });
    setBusy(false);
    if (created) {
      cancelPendingZone();
      setSelectedZoneId(created.id);
    }
  };

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  const handleAssignPrestataire = async (zone: CollectionZone, prestataireId: string) => {
    setBusy(true);
    await updateZone(zone.id, { assignedPrestataireId: prestataireId || null });
    setBusy(false);
  };

  const handleDeleteZone = async (zone: CollectionZone) => {
    setBusy(true);
    const ok = await deleteZone(zone.id);
    setBusy(false);
    if (ok && selectedZoneId === zone.id) setSelectedZoneId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-600/30 flex items-center justify-center">
            <MapPinned className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Découpage communal — Secteurs de collecte</h3>
            <p className="text-xs text-slate-400 max-w-xl">
              {boundary?.geometry
                ? 'Frontière administrative réelle affichée en fond de carte (OpenStreetMap).'
                : "Frontière administrative non disponible pour cette commune — seul le point central est connu."}
              {canEdit
                ? ' Utilisez l\'outil polygone (en haut à droite de la carte) pour dessiner un nouveau secteur.'
                : ' Consultation seule : le découpage est géré par la commune.'}
            </p>
          </div>
        </div>
        {loading && <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
      {actionError && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl overflow-hidden border border-slate-800 relative" style={{ height: 480 }}>
          <div ref={mapContainerRef} className="w-full h-full" />

          {pendingGeometry && (
            <div className="absolute bottom-3 left-3 right-3 bg-slate-900/97 border border-blue-600/40 rounded-xl p-4 shadow-2xl space-y-3 z-[1000]">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-white flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5 text-blue-400" /> Nouveau secteur de collecte
                </p>
                <button onClick={cancelPendingZone} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nom du secteur *"
                  className="col-span-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500"
                />
                <input
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder="Code (ex: Z-01)"
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500"
                />
                <input
                  value={formPopulation}
                  onChange={(e) => setFormPopulation(e.target.value.replace(/\D/g, ''))}
                  placeholder="Population estimée"
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500"
                />
                <input
                  value={formFrequency}
                  onChange={(e) => setFormFrequency(e.target.value)}
                  placeholder="Fréquence (ex: Quotidienne)"
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500"
                />
                <select
                  value={formPrestataireId}
                  onChange={(e) => setFormPrestataireId(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                >
                  <option value="">Prestataire (optionnel)</option>
                  {prestataires.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5 col-span-2 md:col-span-1">
                  <Palette className="w-3.5 h-3.5 text-slate-500" />
                  {ZONE_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setFormColor(c)}
                      className={`w-5 h-5 rounded-full border-2 ${formColor === c ? 'border-white' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={cancelPendingZone}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Annuler
                </button>
                <button
                  onClick={savePendingZone}
                  disabled={!formName.trim() || busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Enregistrer le secteur
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2 overflow-y-auto" style={{ maxHeight: 480 }}>
          <p className="text-xs font-bold text-slate-300 mb-1">Secteurs ({zones.length})</p>
          {zones.length === 0 && !loading && (
            <p className="text-xs text-slate-500 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              Aucun secteur défini pour cette commune pour le moment.
            </p>
          )}
          {zones.map((zone) => (
            <div
              key={zone.id}
              onClick={() => setSelectedZoneId(zone.id)}
              className={`rounded-lg border p-2.5 cursor-pointer transition-colors ${
                selectedZoneId === zone.id ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: zone.color }} />
                  <span className="text-xs font-semibold text-white truncate">{zone.name}</span>
                  {zone.code && <span className="text-[10px] text-slate-500 flex-shrink-0">{zone.code}</span>}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingZoneId(editingZoneId === zone.id ? null : zone.id);
                      }}
                      className="p-1 text-slate-400 hover:text-blue-400"
                      title="Assigner un prestataire"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteZone(zone);
                      }}
                      className="p-1 text-slate-400 hover:text-red-400"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
              {zone.collectionFrequency && (
                <p className="text-[10px] text-slate-500 mt-1">Fréquence : {zone.collectionFrequency}</p>
              )}
              {typeof zone.estimatedPopulation === 'number' && (
                <p className="text-[10px] text-slate-500">Population estimée : {zone.estimatedPopulation.toLocaleString('fr-FR')}</p>
              )}
              <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
                <Users className="w-3 h-3" />
                {zone.assignedPrestataireName ?? 'Non assigné'}
              </p>

              {canEdit && editingZoneId === zone.id && (
                <div className="mt-2 pt-2 border-t border-slate-800" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={zone.assignedPrestataireId ?? ''}
                    onChange={(e) => handleAssignPrestataire(zone, e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white"
                  >
                    <option value="">Non assigné</option>
                    {prestataires.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {selectedZone && (
        <p className="text-[11px] text-slate-500">
          Secteur sélectionné : <span className="text-slate-300 font-semibold">{selectedZone.name}</span> — mis à jour le{' '}
          {new Date(selectedZone.updatedAt).toLocaleDateString('fr-FR')}
        </p>
      )}
    </div>
  );
};
