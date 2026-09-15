import React from 'react';
import { UserRole, Language } from '../types/siipi';
import { FNCTLogo, TunisianCoatOfArmsLogo, ANGeDLogo } from './Logos';
import {
  Building2,
  Truck,
  Smartphone,
  Radio,
  Users,
  BarChart3,
  Terminal,
  Globe2,
  ShieldCheck,
  Search,
  SlidersHorizontal,
  Layers,
  LogOut
} from 'lucide-react';

interface NavbarProps {
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  onOpenCommandPalette: () => void;
  /** Vues autorisées pour l'utilisateur connecté (RBAC) — filtre les onglets affichés. */
  allowedViews?: UserRole[];
  userFullName?: string;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRole,
  setCurrentRole,
  language,
  setLanguage,
  onOpenCommandPalette,
  allowedViews,
  userFullName,
  onLogout,
}) => {
  const isAr = language === 'ar';

  const roleItems: Array<{ role: UserRole; labelFr: string; labelAr: string; icon: any }> = [
    { role: 'national_admin', labelFr: 'Portail National', labelAr: 'البوابة الوطنية', icon: Building2 },
    { role: 'municipal_manager', labelFr: 'Portail Municipal', labelAr: 'البوابة البلدية', icon: Truck },
    { role: 'citizen', labelFr: 'App Citoyenne', labelAr: 'تطبيق المواطن', icon: Smartphone },
    { role: 'field_agent', labelFr: 'App Agent Terrain', labelAr: 'تطبيق أعوان الميدان', icon: Radio },
    { role: 'gdma_actor', labelFr: 'GDMA & Barbéchas', labelAr: 'فرز الفواضل والبرباشة', icon: Users },
    { role: 'kpi_fleet', labelFr: 'KPI 5 Axes & Flotte', labelAr: 'المؤشرات والأسطول', icon: BarChart3 } as any,
    { role: 'engineering_hub', labelFr: 'Console Phases & IA', labelAr: 'لوحة المراحل والذكاء', icon: Terminal },
  ].filter((item) => !allowedViews || allowedViews.includes(item.role));

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo & Platform identity */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center">
              <FNCTLogo variant="icon" size="sm" />
            </div>
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-400 shadow-lg shadow-emerald-500/20 text-white font-extrabold text-base tracking-wider shrink-0">
              <span>S</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base sm:text-lg text-white tracking-tight">SIIPI</span>
                <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                  <span>FNCT</span>
                  <span className="text-slate-500">•</span>
                  <span>ANGeD</span>
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate hidden md:block">
                {isAr ? 'الجامعة الوطنية للبلديات • شبكة التصرف في النفايات' : 'Fédération Nationale des Communes • Réseau Déchets'}
              </p>
            </div>
          </div>

          {/* Role / Module Switcher Tabs */}
          <nav className="hidden lg:flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800/80">
            {roleItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentRole === item.role;
              return (
                <button
                  key={item.role}
                  id={`nav-role-${item.role}`}
                  onClick={() => setCurrentRole(item.role)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{isAr ? item.labelAr : item.labelFr}</span>
                </button>
              );
            })}
          </nav>

          {/* Right actions: Command Launcher, Language, Compliance Badge */}
          <div className="flex items-center gap-2">
            
            {/* Quick Command shortcut */}
            <button
              id="btn-quick-cmd"
              onClick={onOpenCommandPalette}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-mono transition-colors"
              title="Ouvrir la console de commandes (/phase, /code, /test, /doc)"
            >
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden md:inline font-mono text-[11px]">/commandes</span>
              <kbd className="hidden sm:inline bg-slate-800 text-slate-400 px-1 rounded text-[10px]">⌘K</kbd>
            </button>

            {/* Language toggle (FR / AR) */}
            <button
              id="btn-language-toggle"
              onClick={() => setLanguage(language === 'fr' ? 'ar' : 'fr')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-medium transition-colors"
              title="Changer de langue (Français / العربية)"
            >
              <Globe2 className="w-3.5 h-3.5 text-teal-400" />
              <span className="font-semibold">{language === 'fr' ? 'العربية' : 'Français'}</span>
            </button>

            {/* Security Compliance badge */}
            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>DL 2022-54 Conforme</span>
            </div>

            {/* Authenticated user & logout */}
            {userFullName && (
              <div className="hidden md:flex items-center gap-2 pl-2 border-l border-slate-800">
                <span className="text-xs text-slate-300 font-medium truncate max-w-[120px]">{userFullName}</span>
                <button
                  id="btn-logout"
                  onClick={onLogout}
                  title="Se déconnecter"
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-800 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

          </div>
        </div>

        {/* Mobile secondary navigation */}
        <div className="flex lg:hidden overflow-x-auto py-2 gap-1 border-t border-slate-800/60 no-scrollbar">
          {roleItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentRole === item.role;
            return (
              <button
                key={item.role}
                id={`nav-role-mobile-${item.role}`}
                onClick={() => setCurrentRole(item.role)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-900'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{isAr ? item.labelAr : item.labelFr}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
