import React, { useState } from 'react';
import { MOCK_WEIGHBRIDGE } from '../data/mockData';
import { Commune, Language } from '../types/siipi';
import { CommuneDirectorySection } from './CommuneDirectorySection';
import { NationalDMADashboard } from './NationalDMADashboard';
import { NationalHTMLReportEmbed } from './NationalHTMLReportEmbed';
import { FNCTLogo, TunisianCoatOfArmsLogo, ANGeDLogo, InstitutionalLogosBanner } from './Logos';
import { 
  Building2, 
  TrendingUp, 
  Truck, 
  Scale, 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  MapPin, 
  Filter,
  Download,
  Bell,
  ShieldCheck,
  BarChart2,
  Layers,
  Recycle,
  FileSpreadsheet,
  FileText
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface NationalPortalProps {
  language: Language;
  /** Annuaire des communes, chargé depuis l'API réelle (voir hooks/useCommunesDirectory.ts) */
  communes: Commune[];
  communesLoading?: boolean;
  onUpdateCommune: (updated: Commune) => Promise<void> | void;
  onSelectCommune?: (commune: Commune) => void;
}

export const NationalPortal: React.FC<NationalPortalProps> = ({
  language,
  communes,
  communesLoading,
  onUpdateCommune,
  onSelectCommune,
}) => {
  const isAr = language === 'ar';
  const communesList = communes;
  const [alertBroadcast, setAlertBroadcast] = useState<string | null>(null);
  const [activePortalView, setActivePortalView] = useState<'canva_dashboard' | 'html_report_2026' | 'directory_pcgd' | 'weighbridge_live'>('canva_dashboard');

  const totalWasteDaily = communesList.reduce((acc, c) => acc + c.wasteTonsPerDay, 0);
  const avgCollectionRate = communesList.length
    ? (communesList.reduce((acc, c) => acc + c.collectionRate, 0) / communesList.length).toFixed(1)
    : '0.0';
  const avgCleanliness = communesList.length
    ? Math.round(communesList.reduce((acc, c) => acc + c.cleanlinessIndex, 0) / communesList.length)
    : 0;
  const totalActiveTrucks = communesList.reduce((acc, c) => acc + c.activeTrucks, 0);

  // Top producing communes for chart
  const chartData = communesList
    .slice(0, 10)
    .map(c => ({
      name: c.name.split(' ')[0],
      tonnage: c.wasteTonsPerDay,
      tauxCollecte: c.collectionRate,
    }));

  const handleBroadcastAlert = () => {
    setAlertBroadcast('Alerte nationale météo : Vigilance fortes pluies sur le Grand Tunis, le Sahel et le Nord-Ouest. Sécurisation des conteneurs 770L et repli préventif des bennes côtières activé.');
  };

  const handleUpdateCommune = async (updated: Commune) => {
    await onUpdateCommune(updated);
  };

  const handleSelectCommune = (commune: Commune) => {
    if (onSelectCommune) {
      onSelectCommune(commune);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Official Institutional Logos Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
        <FNCTLogo variant="full" theme="dark" size="sm" />
        
        <div className="flex items-center gap-3 border-y md:border-y-0 md:border-x border-slate-800 py-2 md:py-0 md:px-6">
          <TunisianCoatOfArmsLogo size="sm" />
          <div className="text-center hidden sm:block">
            <span className="text-xs font-black text-amber-400 uppercase tracking-wider block" style={{ fontFamily: 'Cairo, sans-serif' }}>
              الجمهورية التونسية
            </span>
            <span className="text-[10px] text-slate-400 font-bold block">
              RÉPUBLIQUE TUNISIENNE
            </span>
          </div>
        </div>

        <ANGeDLogo variant="full" theme="dark" size="sm" />
      </div>

      {/* Header National FNCT & ANGeD */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-teal-950/40 border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-1 rounded-md bg-teal-500/20 text-teal-300 font-mono text-xs font-bold border border-teal-500/30">
              OBSERVATOIRE NATIONAL FNCT • ANGeD
            </span>
            <span className="text-xs text-slate-400 font-mono">
              350 Communes • Décret-loi 2022-54
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {isAr ? 'المرصد الوطني للتصرف المندمج في النفايات والنظافة' : 'Tableau de Bord National de la Propreté Intercommunale'}
          </h1>
          <p className="text-sm text-slate-300 max-w-2xl mt-1">
            {isAr
              ? 'متابعة حية للكميات المجمعة، المؤشرات الخماسية، ومطابقة عمليات الوزن بمصبات الوكالة الوطنية للتصرف في النفايات.'
              : 'Supervision macro-économique, suivi des flux de décharges contrôlées, réconciliation des pesées et indice de propreté des communes tunisiennes.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="btn-broadcast-alert"
            onClick={handleBroadcastAlert}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-semibold hover:bg-amber-500/30 transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            <span>Diffuser Alerte Nationale</span>
          </button>
          <button
            id="btn-export-national-pdf"
            onClick={() => window.print()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/30 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Rapport National PDF</span>
          </button>
        </div>
      </div>

      {/* Broadcast alert notification if active */}
      {alertBroadcast && (
        <div className="p-4 rounded-xl bg-amber-950/80 border border-amber-800/80 text-amber-200 text-xs flex items-start justify-between gap-3 animate-fadeIn">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>{alertBroadcast}</span>
          </div>
          <button 
            onClick={() => setAlertBroadcast(null)}
            className="text-amber-400 hover:text-white font-bold text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main View Mode Selector (Canva Dashboard vs Rapport Direct HTML vs 350 Communes Directory vs Weighbridges) */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md overflow-x-auto">
        <button
          onClick={() => setActivePortalView('canva_dashboard')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activePortalView === 'canva_dashboard'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Recycle className="w-4 h-4 text-emerald-300" />
          <span>{isAr ? 'لوحة القيادة الاستراتيجية DMA 2026' : 'Canva Stratégique DMA 2026'}</span>
        </button>

        <button
          onClick={() => setActivePortalView('html_report_2026')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activePortalView === 'html_report_2026'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <FileText className="w-4 h-4 text-amber-300" />
          <span>{isAr ? 'التقرير الوطني التفاعلي 2026 (HTML)' : 'Rapport National Interactif (HTML 2026)'}</span>
        </button>

        <button
          onClick={() => setActivePortalView('directory_pcgd')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activePortalView === 'directory_pcgd'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Building2 className="w-4 h-4 text-cyan-300" />
          <span>{isAr ? 'دليل الـ 350 بلدية ومخططات PCGD' : 'Annuaire & Plans PCGD (350 Communes)'}</span>
        </button>

        <button
          onClick={() => setActivePortalView('weighbridge_live')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activePortalView === 'weighbridge_live'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Scale className="w-4 h-4 text-purple-300" />
          <span>{isAr ? 'موازين المصبات المراقبة ANGeD' : 'Ponts-Bascules Décharges ANGeD'}</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: CANVA STRATÉGIQUE NATIONAL DMA 2026 (7 SUB-TABS) */}
      {/* ========================================================================= */}
      {activePortalView === 'canva_dashboard' && (
        <div className="space-y-6 animate-fadeIn">
          <NationalDMADashboard
            language={language}
            onNavigateCommune={(name) => {
              setActivePortalView('directory_pcgd');
            }}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: RAPPORT NATIONAL INTERACTIF HTML 2026 */}
      {/* ========================================================================= */}
      {activePortalView === 'html_report_2026' && (
        <div className="space-y-6 animate-fadeIn">
          <NationalHTMLReportEmbed language={language} />
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: ANNUAIRE OFFICIEL DES 350 COMMUNES & PLANS PCGD */}
      {/* ========================================================================= */}
      {activePortalView === 'directory_pcgd' && communesLoading && (
        <div className="p-10 text-center text-slate-400 text-sm">Chargement de l'annuaire depuis l'API...</div>
      )}
      {activePortalView === 'directory_pcgd' && !communesLoading && (
        <div className="space-y-6 animate-fadeIn">
          <CommuneDirectorySection
            communes={communesList}
            onUpdateCommune={handleUpdateCommune}
            onSelectCommune={handleSelectCommune}
            language={language}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: FLUX PONTS-BASCULES ANGeD & RÉCONCILIATION */}
      {/* ========================================================================= */}
      {activePortalView === 'weighbridge_live' && (
        <div className="space-y-6 animate-fadeIn">
          
          {/* 4 National Macro KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Tonnage Quotidien Reçu</span>
                <span className="p-1.5 rounded-lg bg-emerald-950 text-emerald-400">
                  <Scale className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-white tracking-tight">
                {totalWasteDaily.toLocaleString('fr-FR')} <span className="text-sm font-normal text-slate-400">Tonnes/j</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>+3.2% vs moyenne nationale</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Taux de Collecte Moyen (TC)</span>
                <span className="p-1.5 rounded-lg bg-teal-950 text-teal-400">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-white tracking-tight">
                {avgCollectionRate}%
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-teal-400 rounded-full" style={{ width: `${avgCollectionRate}%` }} />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Indice Moyen de Propreté</span>
                <span className="p-1.5 rounded-lg bg-cyan-950 text-cyan-400">
                  <BarChart2 className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-white tracking-tight">
                {avgCleanliness} <span className="text-sm font-normal text-slate-400">/ 100</span>
              </div>
              <div className="text-xs text-cyan-300 font-medium">
                Standard National 5 Axes
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Bennes & Véhicules Actifs</span>
                <span className="p-1.5 rounded-lg bg-blue-950 text-blue-400">
                  <Truck className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-white tracking-tight">
                {totalActiveTrucks} <span className="text-sm font-normal text-slate-400">unités GPS</span>
              </div>
              <div className="text-xs text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span>98.4% de disponibilité opérationnelle</span>
              </div>
            </div>

          </div>

          {/* Charts & ANGeD Weighbridge Stream Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left chart: Waste Production by Commune */}
            <div className="lg:col-span-7 p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-base">Production Journalière par Commune (Tonnes)</h3>
                  <p className="text-xs text-slate-400">Recoupement direct avec les décharges contrôlées ANGeD</p>
                </div>
                <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md font-mono">
                  PostgreSQL + TimescaleDB
                </span>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }} 
                      itemStyle={{ color: '#34d399' }}
                    />
                    <Bar dataKey="tonnage" name="Tonnage / Jour" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Right: Live ANGeD Weighbridge Inflow (Jbel Chakir, Oued Laya, etc.) */}
            <div className="lg:col-span-5 p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-base flex items-center gap-2">
                    <Scale className="w-4 h-4 text-emerald-400" />
                    Ponts-Bascules ANGeD en Direct
                  </h3>
                  <p className="text-xs text-slate-400">Contrôle des tonnages aux entrées décharges</p>
                </div>
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                  Synchronisé
                </span>
              </div>

              <div className="space-y-3">
                {MOCK_WEIGHBRIDGE.map((rec) => (
                  <div key={rec.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-200">{rec.ticketNumberANGeD}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        rec.status === 'conforme' 
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' 
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}>
                        {rec.status === 'conforme' ? 'Conforme (<2%)' : 'Écart ' + rec.discrepancyPercent + '%'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-400 text-[11px]">
                      <span>{rec.communeName} • {rec.truckReg}</span>
                      <span>{rec.timestampIn.split(' ')[1]}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/80 font-mono text-[11px]">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Poids Brut</span>
                        <span className="text-white font-bold">{rec.grossWeightKg.toLocaleString()} kg</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Poids Net</span>
                        <span className="text-emerald-400 font-bold">{rec.netWeightKg.toLocaleString()} kg</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Écart Bord</span>
                        <span className="text-slate-300 font-bold">{rec.discrepancyKg} kg</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
};

