import { useCallback, useEffect, useState } from 'react';
import { TicketReport } from '../types/siipi';
import { apiClient } from '../lib/apiClient';
import { ApiTicketRow, mapApiTicketToFrontend } from '../lib/ticketMapper';

export interface Prestataire {
  id: string;
  full_name: string;
  email: string;
}

// Remplace l'ancien état local `useState<TicketReport[]>(MOCK_TICKETS)` du prototype
// (voir src/data/mockData.ts) par de vraies réclamations chargées depuis l'API et
// traitées via le workflow CDC réel (accepter / refuser / transférer / traiter —
// voir backend/src/routes/tickets.routes.ts). Même principe que useCommunesDirectory.
export function useTicketsWorkflow(communeId: string | undefined) {
  const [tickets, setTickets] = useState<TicketReport[]>([]);
  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!communeId) return;
    setLoading(true);
    setError(null);
    try {
      const [ticketRows, prestataireRows] = await Promise.all([
        apiClient.get<ApiTicketRow[]>(`/tickets?communeId=${encodeURIComponent(communeId)}`),
        apiClient.get<Prestataire[]>(`/communes/${encodeURIComponent(communeId)}/prestataires`),
      ]);
      setTickets(ticketRows.map(mapApiTicketToFrontend));
      setPrestataires(prestataireRows);
    } catch (err: any) {
      setError(err?.message ?? 'Erreur lors du chargement des réclamations.');
    } finally {
      setLoading(false);
    }
  }, [communeId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const applyUpdatedTicket = useCallback((row: ApiTicketRow) => {
    const updated = mapApiTicketToFrontend(row);
    setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    return updated;
  }, []);

  const runAction = useCallback(
    async (fn: () => Promise<ApiTicketRow>): Promise<TicketReport | null> => {
      setActionError(null);
      try {
        const row = await fn();
        return applyUpdatedTicket(row);
      } catch (err: any) {
        setActionError(err?.message ?? "Échec de l'action sur ce ticket.");
        return null;
      }
    },
    [applyUpdatedTicket]
  );

  const accept = useCallback(
    (ticketId: string) => runAction(() => apiClient.patch<ApiTicketRow>(`/tickets/${ticketId}/accept`)),
    [runAction]
  );

  const refuse = useCallback(
    (ticketId: string, reason: string) =>
      runAction(() => apiClient.patch<ApiTicketRow>(`/tickets/${ticketId}/refuse`, { reason })),
    [runAction]
  );

  const assign = useCallback(
    (ticketId: string, prestataireUserId: string) =>
      runAction(() => apiClient.patch<ApiTicketRow>(`/tickets/${ticketId}/assign`, { prestataireUserId })),
    [runAction]
  );

  const treat = useCallback(
    (ticketId: string, status: 'en_cours' | 'resolu', resolvedPhotoUrl?: string) =>
      runAction(() => apiClient.patch<ApiTicketRow>(`/tickets/${ticketId}/treat`, { status, resolvedPhotoUrl })),
    [runAction]
  );

  return { tickets, prestataires, loading, error, actionError, refetch, accept, refuse, assign, treat };
}
