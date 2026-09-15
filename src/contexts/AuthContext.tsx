import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient, getStoredToken, setStoredToken } from '../lib/apiClient';

// Rôles RBAC officiels — cahier des charges FNCT/ANGeD §5 (matrice de permissions) :
// Super Admin FNCT · Admin Commune · Gestionnaire Prestataire (privé) · Citoyen.
// 'engineering_hub' n'existe pas en base : c'est une console interne, accessible
// uniquement aux super_admin_fnct (voir App.tsx).
export type BackendRole = 'super_admin_fnct' | 'admin_commune' | 'gestionnaire_prestataire' | 'citoyen';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: BackendRole;
  communeId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  registerCitizen: (data: { email: string; password: string; fullName: string; phone?: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Au chargement de la page : si un token est stocké, on vérifie qu'il est encore
  // valide auprès de l'API avant de restaurer la session (évite de faire confiance
  // aveuglément à un token expiré ou révoqué).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getStoredToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const me = await apiClient.get<AuthUser>('/auth/me');
        if (!cancelled) setUser(me);
      } catch {
        setStoredToken(null);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const res = await apiClient.post<{ token: string; user: AuthUser }>('/auth/login', { email, password });
      setStoredToken(res.token);
      setUser(res.user);
    } catch (err: any) {
      setError(err?.message ?? 'Échec de la connexion.');
      throw err;
    }
  }, []);

  const registerCitizen = useCallback(
    async (data: { email: string; password: string; fullName: string; phone?: string }) => {
      setError(null);
      try {
        await apiClient.post('/citizens/register', data);
        await login(data.email, data.password);
      } catch (err: any) {
        setError(err?.message ?? "Échec de l'inscription.");
        throw err;
      }
    },
    [login]
  );

  const logout = useCallback(() => {
    setStoredToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, registerCitizen, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() doit être utilisé à l’intérieur de <AuthProvider>.');
  return ctx;
}
