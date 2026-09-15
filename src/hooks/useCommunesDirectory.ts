import { useCallback, useEffect, useState } from 'react';
import { Commune } from '../types/siipi';
import { apiClient } from '../lib/apiClient';
import { ApiCommuneRow, mapApiCommuneToFrontend, mapCommunePatchToApi } from '../lib/communeMapper';

// Remplace l'ancien accès synchrone à ALL_COMMUNES_DIRECTORY (JSON statique + overrides
// localStorage, voir data/communesDirectoryData.ts) par un vrai annuaire partagé,
// servi par l'API et stocké dans PostgreSQL — visible et modifiable par tous les
// utilisateurs autorisés, pas seulement dans le navigateur de la personne qui édite.
export function useCommunesDirectory() {
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await apiClient.get<ApiCommuneRow[]>('/communes');
      setCommunes(rows.map(mapApiCommuneToFrontend));
    } catch (err: any) {
      setError(err?.message ?? "Erreur lors du chargement de l'annuaire des communes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const updateCommune = useCallback(async (id: string, patch: Partial<Commune>): Promise<Commune> => {
    const row = await apiClient.patch<ApiCommuneRow>(`/communes/${id}`, mapCommunePatchToApi(patch));
    const updated = mapApiCommuneToFrontend(row);
    setCommunes((prev) => prev.map((c) => (c.id === id ? updated : c)));
    return updated;
  }, []);

  return { communes, loading, error, refetch, updateCommune };
}
