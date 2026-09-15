import { useCallback, useEffect, useState } from 'react';
import { CollectionZone, CommuneBoundary } from '../types/siipi';
import { apiClient } from '../lib/apiClient';
import { ApiZoneRow, mapApiZoneToFrontend, ZoneWritePayload } from '../lib/zoneMapper';

// Module "Découpage communal" : charge la frontière réelle de la commune (fond de
// carte) et ses secteurs/zones de collecte, avec les actions de création/édition/
// suppression réservées à l'Admin Commune et au Super Admin FNCT (le Gestionnaire
// Prestataire consulte en lecture seule). Même principe que useTicketsWorkflow.
export function useCollectionZones(communeId: string | undefined) {
  const [zones, setZones] = useState<CollectionZone[]>([]);
  const [boundary, setBoundary] = useState<CommuneBoundary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!communeId) return;
    setLoading(true);
    setError(null);
    try {
      const [zoneRows, boundaryRow] = await Promise.all([
        apiClient.get<ApiZoneRow[]>(`/zones?communeId=${encodeURIComponent(communeId)}`),
        apiClient.get<CommuneBoundary>(`/communes/${encodeURIComponent(communeId)}/boundary`),
      ]);
      setZones(zoneRows.map(mapApiZoneToFrontend));
      setBoundary(boundaryRow);
    } catch (err: any) {
      setError(err?.message ?? 'Erreur lors du chargement du découpage communal.');
    } finally {
      setLoading(false);
    }
  }, [communeId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createZone = useCallback(
    async (payload: ZoneWritePayload): Promise<CollectionZone | null> => {
      setActionError(null);
      try {
        const row = await apiClient.post<ApiZoneRow>('/zones', { communeId, ...payload });
        const created = mapApiZoneToFrontend(row);
        setZones((prev) => [...prev, created]);
        return created;
      } catch (err: any) {
        setActionError(err?.message ?? "Échec de la création de la zone.");
        return null;
      }
    },
    [communeId]
  );

  const updateZone = useCallback(
    async (zoneId: string, payload: ZoneWritePayload): Promise<CollectionZone | null> => {
      setActionError(null);
      try {
        const row = await apiClient.patch<ApiZoneRow>(`/zones/${zoneId}`, payload);
        const updated = mapApiZoneToFrontend(row);
        setZones((prev) => prev.map((z) => (z.id === zoneId ? updated : z)));
        return updated;
      } catch (err: any) {
        setActionError(err?.message ?? "Échec de la mise à jour de la zone.");
        return null;
      }
    },
    []
  );

  const deleteZone = useCallback(async (zoneId: string): Promise<boolean> => {
    setActionError(null);
    try {
      await apiClient.delete(`/zones/${zoneId}`);
      setZones((prev) => prev.filter((z) => z.id !== zoneId));
      return true;
    } catch (err: any) {
      setActionError(err?.message ?? "Échec de la suppression de la zone.");
      return false;
    }
  }, []);

  return { zones, boundary, loading, error, actionError, refetch, createZone, updateZone, deleteZone };
}
