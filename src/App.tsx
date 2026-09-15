import React, { useEffect, useMemo, useState } from 'react';
import { UserRole, Language, Commune } from './types/siipi';
import { Navbar } from './components/Navbar';
import { PhaseNavigator } from './components/PhaseNavigator';
import { NationalPortal } from './components/NationalPortal';
import { MunicipalPortal } from './components/MunicipalPortal';
import { CitizenAppSimulator } from './components/CitizenAppSimulator';
import { FieldAgentSimulator } from './components/FieldAgentSimulator';
import { GDMAView } from './components/GDMAView';
import { KpiAndFleetCalculator } from './components/KpiAndFleetCalculator';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { LoginScreen } from './components/LoginScreen';
import { FNCTLogo, TunisianCoatOfArmsLogo, ANGeDLogo } from './components/Logos';
import { AuthProvider, useAuth, BackendRole } from './contexts/AuthContext';
import { useCommunesDirectory } from './hooks/useCommunesDirectory';
import { ShieldCheck, Loader2 } from 'lucide-react';

// RBAC : quelles vues chaque rôle authentifié (4 rôles officiels du CDC — §5, matrice de
// permissions) peut ouvrir. Les noms de vues ('field_agent', 'gdma_actor', ...) sont hérités
// du prototype et ne correspondent plus à des rôles de connexion distincts — ce sont des
// écrans internes du portail Admin Commune (gestion du personnel de terrain / GDMA-Barbécha),
// pas des comptes séparés. 'engineering_hub' (console de développement) n'est pas un rôle
// métier — seul le Super Admin FNCT y a accès, en plus de son propre portail.
const ROLE_ALLOWED_VIEWS: Record<BackendRole, UserRole[]> = {
  // 'municipal_manager' est inclus ici pour que le Super Admin FNCT puisse ouvrir le
  // Portail Municipal de n'importe quelle commune depuis l'annuaire du Portail National
  // (bouton "Ouvrir Portail Municipal" — cohérent avec requireCommuneAccess côté API, qui
  // laisse déjà passer super_admin_fnct sur toutes les communes).
  super_admin_fnct: ['national_admin', 'engineering_hub', 'kpi_fleet' as UserRole, 'municipal_manager'],
  admin_commune: ['municipal_manager', 'kpi_fleet' as UserRole, 'field_agent', 'gdma_actor'],
  // Gestionnaire Prestataire (privé) : accès restreint aux opérations de sa flotte sous
  // contrat (Engins & GMAO). Le CDC prévoit un portail dédié et un scoping par zone/commune
  // pour ce rôle — non encore construit ; cette vue "field_agent" (opérations/flotte) sert
  // de base de démonstration en attendant ce module dédié.
  gestionnaire_prestataire: ['field_agent', 'kpi_fleet' as UserRole],
  citoyen: ['citizen'],
};

const DEFAULT_VIEW_BY_ROLE: Record<BackendRole, UserRole> = {
  super_admin_fnct: 'national_admin',
  admin_commune: 'municipal_manager',
  gestionnaire_prestataire: 'field_agent',
  citoyen: 'citizen',
};

interface AuthenticatedAppProps {
  language: Language;
  setLanguage: (lang: Language) => void;
}

function AuthenticatedApp({ language, setLanguage }: AuthenticatedAppProps) {
  const { user, logout } = useAuth();
  const allowedViews = useMemo(() => (user ? ROLE_ALLOWED_VIEWS[user.role] : []), [user]);

  const [currentRole, setCurrentRole] = useState<UserRole>(user ? DEFAULT_VIEW_BY_ROLE[user.role] : 'citizen');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [pendingTerminalCommand, setPendingTerminalCommand] = useState<string>('/phase 1');

  const { communes, loading: communesLoading, updateCommune } = useCommunesDirectory();
  const [selectedCommune, setSelectedCommune] = useState<Commune | null>(null);

  // Sélectionne automatiquement la commune de rattachement de l'utilisateur (directeur
  // municipal / agent terrain / GDMA), ou la première commune pour un admin national.
  useEffect(() => {
    if (selectedCommune || communes.length === 0) return;
    if (user?.communeId) {
      const own = communes.find((c) => c.id === user.communeId);
      if (own) {
        setSelectedCommune(own);
        return;
      }
    }
    setSelectedCommune(communes[0]);
  }, [communes, user, selectedCommune]);

  // Sync RTL direction for Arabic language
  useEffect(() => {
    if (language === 'ar') {
      document.documentElement.setAttribute('dir', 'rtl');
      document.documentElement.setAttribute('lang', 'ar');
    } else {
      document.documentElement.setAttribute('dir', 'ltr');
      document.documentElement.setAttribute('lang', 'fr');
    }
  }, [language]);

  // Keyboard shortcut Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const safeSetCurrentRole = (role: UserRole) => {
    if (allowedViews.includes(role)) setCurrentRole(role);
  };

  const handleSelectCommuneFromNational = (commune: Commune) => {
    setSelectedCommune(commune);
    safeSetCurrentRole('municipal_manager');
  };

  const handleExecuteCommandFromPalette = (cmd: string) => {
    setPendingTerminalCommand(cmd);
    safeSetCurrentRole('engineering_hub');
  };

  const handleUpdateCommune = async (updated: Commune) => {
    await updateCommune(updated.id, updated);
  };

  const isAr = language === 'ar';

  if (!allowedViews.includes(currentRole)) {
    // Filet de sécurité : si l'état courant pointe vers une vue non autorisée
    // (ex. lien direct, ancien état), on retombe sur la vue par défaut du rôle.
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      <Navbar
        currentRole={currentRole}
        setCurrentRole={safeSetCurrentRole}
        language={language}
        setLanguage={setLanguage}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        allowedViews={allowedViews}
        userFullName={user?.fullName}
        onLogout={logout}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {currentRole === 'engineering_hub' && (
          <PhaseNavigator
            language={language}
            initialCommand={pendingTerminalCommand}
            onSelectModule={(mod) => {
              if (mod === 'portail-municipal') safeSetCurrentRole('municipal_manager');
              else if (mod === 'portail-national') safeSetCurrentRole('national_admin');
            }}
          />
        )}

        {currentRole === 'national_admin' && (
          <NationalPortal
            language={language}
            communes={communes}
            communesLoading={communesLoading}
            onUpdateCommune={handleUpdateCommune}
            onSelectCommune={handleSelectCommuneFromNational}
          />
        )}

        {currentRole === 'municipal_manager' && (
          communesLoading || !selectedCommune ? (
            <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Chargement de la commune...</span>
            </div>
          ) : (
            <MunicipalPortal language={language} selectedCommune={selectedCommune} communes={communes} />
          )
        )}

        {currentRole === 'citizen' && <CitizenAppSimulator language={language} />}

        {currentRole === 'field_agent' && <FieldAgentSimulator language={language} />}

        {currentRole === 'gdma_actor' && <GDMAView language={language} />}

        {currentRole === ('kpi_fleet' as UserRole) && <KpiAndFleetCalculator language={language} />}
      </main>

      <footer className="w-full border-t border-slate-800 bg-slate-950 text-xs text-slate-400 py-10 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <FNCTLogo variant="full" theme="dark" size="md" />
            </div>
            <div className="flex items-center gap-3 border-y md:border-y-0 md:border-x border-slate-800 py-3 md:py-0 md:px-8 w-full md:w-auto justify-center">
              <TunisianCoatOfArmsLogo size="md" />
              <div className="text-center">
                <span
                  className="text-sm font-black text-amber-400 uppercase tracking-widest block"
                  style={{ fontFamily: 'Cairo, sans-serif' }}
                >
                  الجمهورية التونسية
                </span>
                <span className="text-[11px] text-slate-300 font-bold block tracking-wider">RÉPUBLIQUE TUNISIENNE</span>
                <span className="text-[10px] text-slate-500 block">349 Communes • 24 Gouvernorats</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <ANGeDLogo variant="full" theme="dark" size="md" />
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-2 text-slate-400">
            <div>
              <span className="font-bold text-white block text-sm">
                SIIPI — Système d'Information Intelligent pour la Propreté Intercommunale
              </span>
              <span className="text-xs text-slate-500">
                Plateforme Nationale de Suivi des Déchets Ménagers et Assimilés (DMA) • FNCT & ANGeD
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800/60 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Décret-loi n° 2022-54 Conforme
              </span>
              <span>•</span>
              <span className="text-slate-300 font-medium">Loi n° 2018-29 (Code des Collectivités Locales)</span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>© {new Date().getFullYear()} FNCT / ANGeD — Hébergement Sécurisé Datacenter National Tunisie</span>
          </div>
        </div>
      </footer>

      {allowedViews.includes('engineering_hub') && (
        <CommandPaletteModal
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          onExecuteCommand={handleExecuteCommandFromPalette}
          onNavigateToRole={(role) => safeSetCurrentRole(role)}
        />
      )}
    </div>
  );
}

function AppGate() {
  const { user, loading } = useAuth();
  const [language, setLanguage] = useState<Language>('fr');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Chargement de la session...</span>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen language={language} />;
  }

  return <AuthenticatedApp language={language} setLanguage={setLanguage} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  );
}
