import React, { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, 
  PieChart, Pie, Legend, RadialBarChart, RadialBar 
} from 'recharts';
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
  PieChart as PieChartIcon, 
  Layers, 
  Map as MapIcon, 
  Sliders, 
  Flag, 
  Lightbulb, 
  Leaf, 
  Boxes, 
  Activity, 
  FileSpreadsheet, 
  AlertOctagon, 
  Users, 
  Factory, 
  Globe, 
  Radio, 
  FileText, 
  DollarSign, 
  Recycle, 
  Sparkles, 
  Calendar, 
  UserCheck
} from 'lucide-react';
import { Language, Commune } from '../types/siipi';

// Official National DMA 2026 Governorates Dataset (ANGeD / FNCT Expert Database)
export interface GovernorateDMAData {
  name: string;
  nameAr: string;
  pop: number;
  dma: number; // Tonnes/an
  dailyTons: number; // Tonnes/j
  infra: string;
  status: 'DC' | 'NON_CONTROLE';
  lat: number;
  lng: number;
  region: 'Nord' | 'Centre' | 'Sud' | 'Grand Tunis';
  communesCount: number;
  notes?: string;
}

export const GOVERNORATES_DMA_DATA: GovernorateDMAData[] = [
  { name: 'Tunis', nameAr: 'تونس', pop: 1078412, dma: 342388, dailyTons: 938, infra: 'DC Djebel Chakir', status: 'DC', lat: 36.8065, lng: 10.1815, region: 'Grand Tunis', communesCount: 8 },
  { name: 'Sfax', nameAr: 'صفاقس', pop: 1053688, dma: 326904, dailyTons: 895, infra: 'DC Sfax (Pôle Sud)', status: 'DC', lat: 34.7406, lng: 10.7603, region: 'Centre', communesCount: 23 },
  { name: 'Nabeul', nameAr: 'نابل', pop: 897133, dma: 278336, dailyTons: 762, infra: 'DC Nabeul (Béni Khiar)', status: 'DC', lat: 36.4561, lng: 10.7376, region: 'Nord', communesCount: 28 },
  { name: 'Sousse', nameAr: 'سوسة', pop: 773443, dma: 239963, dailyTons: 657, infra: 'DC Sousse (Oued Laya)', status: 'DC', lat: 35.8256, lng: 10.6369, region: 'Centre', communesCount: 18 },
  { name: 'Ben Arous', nameAr: 'بن عروس', pop: 741693, dma: 230065, dailyTons: 630, infra: 'DC Djebel Chakir', status: 'DC', lat: 36.7531, lng: 10.2283, region: 'Grand Tunis', communesCount: 13 },
  { name: 'Ariana', nameAr: 'أريانة', pop: 692880, dma: 214932, dailyTons: 588, infra: 'DC Djebel Chakir', status: 'DC', lat: 36.8665, lng: 10.1930, region: 'Grand Tunis', communesCount: 7 },
  { name: 'Monastir', nameAr: 'المنستير', pop: 627164, dma: 194578, dailyTons: 533, infra: 'Décharges Municipales Non Contrôlées (Point Noir)', status: 'NON_CONTROLE', lat: 35.7833, lng: 10.8333, region: 'Centre', communesCount: 31, notes: 'Urgence absolue : 31 communes sans DC conforme' },
  { name: 'Kairouan', nameAr: 'القيروان', pop: 616000, dma: 191076, dailyTons: 523, infra: 'DC Kairouan', status: 'DC', lat: 35.6781, lng: 10.0963, region: 'Centre', communesCount: 19 },
  { name: 'Bizerte', nameAr: 'بنزرت', pop: 614370, dma: 190608, dailyTons: 522, infra: 'DC Bizerte (Menzel Bourguiba)', status: 'DC', lat: 37.2744, lng: 9.8739, region: 'Nord', communesCount: 17 },
  { name: 'Mahdia', nameAr: 'المهدية', pop: 459386, dma: 142525, dailyTons: 390, infra: 'Décharges Municipales Non Contrôlées', status: 'NON_CONTROLE', lat: 35.5047, lng: 11.0622, region: 'Centre', communesCount: 18, notes: 'Forte sensibilité côtière sans DC' },
  { name: 'Gabès', nameAr: 'قابس', pop: 417139, dma: 129419, dailyTons: 354, infra: 'DC Gabès', status: 'DC', lat: 33.8815, lng: 10.0982, region: 'Sud', communesCount: 16 },
  { name: 'Manouba', nameAr: 'منوبة', pop: 462764, dma: 135842, dailyTons: 372, infra: 'DC Djebel Chakir', status: 'DC', lat: 36.8078, lng: 10.0863, region: 'Grand Tunis', communesCount: 10 },
  { name: 'Médenine', nameAr: 'مدنين', pop: 520000, dma: 140000, dailyTons: 383, infra: 'DC Djerba / Guellala / Médenine', status: 'DC', lat: 33.3549, lng: 10.5055, region: 'Sud', communesCount: 10 },
  { name: 'Kasserine', nameAr: 'القصرين', pop: 460000, dma: 125000, dailyTons: 342, infra: 'Décharge Non Contrôlée', status: 'NON_CONTROLE', lat: 35.1676, lng: 8.8365, region: 'Centre', communesCount: 19 },
  { name: 'Sidi Bouzid', nameAr: 'سيدي بوزيد', pop: 450000, dma: 122000, dailyTons: 334, infra: 'Décharge Non Contrôlée', status: 'NON_CONTROLE', lat: 35.0382, lng: 9.4849, region: 'Centre', communesCount: 17 },
  { name: 'Jendouba', nameAr: 'جندوبة', pop: 410000, dma: 110000, dailyTons: 301, infra: 'Décharge Non Contrôlée', status: 'NON_CONTROLE', lat: 36.5011, lng: 8.7802, region: 'Nord', communesCount: 14 },
  { name: 'Gafsa', nameAr: 'قفصة', pop: 350000, dma: 95000, dailyTons: 260, infra: 'Décharge Non Contrôlée', status: 'NON_CONTROLE', lat: 34.4250, lng: 8.7842, region: 'Sud', communesCount: 13 },
  { name: 'Béja', nameAr: 'باجة', pop: 320000, dma: 85000, dailyTons: 232, infra: 'Décharge Non Contrôlée', status: 'NON_CONTROLE', lat: 36.7256, lng: 9.1817, region: 'Nord', communesCount: 12 },
  { name: 'Le Kef', nameAr: 'الكاف', pop: 250000, dma: 68000, dailyTons: 186, infra: 'Décharge Non Contrôlée', status: 'NON_CONTROLE', lat: 36.1742, lng: 8.7049, region: 'Nord', communesCount: 15 },
  { name: 'Siliana', nameAr: 'سليانة', pop: 230000, dma: 62000, dailyTons: 169, infra: 'Décharge Non Contrôlée', status: 'NON_CONTROLE', lat: 36.0849, lng: 9.3708, region: 'Nord', communesCount: 12 },
  { name: 'Zaghouan', nameAr: 'زغوان', pop: 190000, dma: 52000, dailyTons: 142, infra: 'DC Zaghouan (El Fahs)', status: 'DC', lat: 36.4029, lng: 10.1429, region: 'Nord', communesCount: 8 },
  { name: 'Kébili', nameAr: 'قبلي', pop: 170000, dma: 44000, dailyTons: 120, infra: 'Décharge Non Contrôlée', status: 'NON_CONTROLE', lat: 33.7044, lng: 8.9690, region: 'Sud', communesCount: 9 },
  { name: 'Tataouine', nameAr: 'تطاوين', pop: 150000, dma: 40000, dailyTons: 109, infra: 'Décharge Non Contrôlée', status: 'NON_CONTROLE', lat: 32.9297, lng: 10.4518, region: 'Sud', communesCount: 7 },
  { name: 'Tozeur', nameAr: 'توزر', pop: 115000, dma: 32000, dailyTons: 87, infra: 'DC Tozeur / Nefta', status: 'DC', lat: 33.9197, lng: 8.1336, region: 'Sud', communesCount: 6 }
];

// Physico-chemical composition national reference
export const WASTE_COMPOSITION_DATA = [
  { name: 'Matière Organique Humide', percent: 58.7, tons: 2211670, color: '#10b981', icon: Leaf },
  { name: 'Plastiques (Emballages & Bouteilles)', percent: 12.1, tons: 455898, color: '#0ea5e9', icon: Boxes },
  { name: 'Papiers & Cartons', percent: 9.0, tons: 339098, color: '#f59e0b', icon: FileText },
  { name: 'Textiles & Chiffons', percent: 8.1, tons: 305188, color: '#8b5cf6', icon: Layers },
  { name: 'Divers & Inertes', percent: 8.1, tons: 305188, color: '#64748b', icon: Activity },
  { name: 'Métaux (Fer, Alu)', percent: 2.4, tons: 90426, color: '#475569', icon: Factory },
  { name: 'Verres', percent: 1.6, tons: 60284, color: '#06b6d4', icon: Recycle }
];

interface NationalDMADashboardProps {
  language: Language;
  onNavigateCommune?: (communeName: string) => void;
}

export const NationalDMADashboard: React.FC<NationalDMADashboardProps> = ({ language, onNavigateCommune }) => {
  const isAr = language === 'ar';
  const [activeTab, setActiveTab] = useState<'kpis' | 'map' | 'gisement' | 'agglos' | 'defis' | 'simulator' | 'reco'>('kpis');
  const [mapFilter, setMapFilter] = useState<'ALL' | 'DC' | 'NON_CONTROLE'>('ALL');
  const [selectedGovernorate, setSelectedGovernorate] = useState<GovernorateDMAData | null>(GOVERNORATES_DMA_DATA[0]);

  // Dynamic Simulator State
  const [compostRate, setCompostRate] = useState<number>(25); // %
  const [recyclingRate, setRecyclingRate] = useState<number>(30); // %

  // Simulation calculations (2030 Horizon)
  const simulationResults = useMemo(() => {
    const dmaOrganique = 2211670; // Tonnes/an
    const dmaRecyclable = 885422; // Tonnes/an (Plastiques + Papiers + Métaux)

    const tonOrganiqueEvite = dmaOrganique * (compostRate / 100);
    const tonRecyclableEvite = dmaRecyclable * (recyclingRate / 100);
    const totalEvite = Math.round(tonOrganiqueEvite + tonRecyclableEvite);
    const totalPct = ((totalEvite / 3767752) * 100).toFixed(1);

    const compostProduit = Math.round(tonOrganiqueEvite * 0.4); // 40% conversion yield
    const co2Evite = Math.round(totalEvite * 0.5); // 0.5 T CO2eq / Tonne détournée
    const valeurEconomiqueM = Math.round(((totalEvite * 80) / 1000000) * 10) / 10; // 80 TND/T net gain

    return {
      totalEvite,
      totalPct,
      compostProduit,
      co2Evite,
      valeurEconomiqueM
    };
  }, [compostRate, recyclingRate]);

  // Top 10 Governorates by DMA
  const topGovChartData = useMemo(() => {
    return [...GOVERNORATES_DMA_DATA]
      .sort((a, b) => b.dma - a.dma)
      .slice(0, 10)
      .map(g => ({
        name: g.name,
        dma: g.dma,
        dailyTons: g.dailyTons,
        status: g.status,
        color: g.status === 'DC' ? '#0ea5e9' : '#ef4444'
      }));
  }, []);

  // Filtered Governorates for map / table
  const filteredGovs = useMemo(() => {
    if (mapFilter === 'ALL') return GOVERNORATES_DMA_DATA;
    return GOVERNORATES_DMA_DATA.filter(g => g.status === mapFilter);
  }, [mapFilter]);

  const dcCount = GOVERNORATES_DMA_DATA.filter(g => g.status === 'DC').length;
  const nonControleCount = GOVERNORATES_DMA_DATA.filter(g => g.status === 'NON_CONTROLE').length;

  const handleExportReport = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      
      {/* CANVA TOP BANNER - EXPERT NATIONAL DASHBOARD */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-emerald-950/80 border border-slate-800 shadow-2xl space-y-5">
        
        {/* Official Institutional Header Showcase */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/80 border border-slate-800/80">
          <FNCTLogo variant="full" theme="dark" size="sm" />
          
          <div className="flex items-center gap-2.5 px-3 py-1 border-x border-slate-800">
            <TunisianCoatOfArmsLogo size="sm" />
            <div className="text-center hidden sm:block">
              <span className="text-xs font-black text-amber-400 block" style={{ fontFamily: 'Cairo, sans-serif' }}>
                الجمهورية التونسية
              </span>
              <span className="text-[9px] text-slate-400 font-bold block">
                RÉPUBLIQUE TUNISIENNE
              </span>
            </div>
          </div>

          <ANGeDLogo variant="full" theme="dark" size="sm" />
        </div>
        
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-3 py-1 rounded-md bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold border border-emerald-500/30 flex items-center gap-1.5">
                <Recycle className="w-3.5 h-3.5 text-emerald-400" />
                CANVA STRATÉGIQUE NATIONAL 2026
              </span>
              <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-500" />
                Base DMA 2025/2026 • ANGeD / FNCT
              </span>
              <span className="text-xs text-emerald-400 font-mono bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700">
                Observatoire National DMA • FNCT / ANGeD
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {isAr ? 'لوحة القيادة الاستراتيجية الوطنية - التصرف في النفايات المنزلية بتونس (2026)' : 'Tableau de Bord Stratégique National - Gestion des DMA Tunisie 2026'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl mt-1">
              Évaluation sectorielle macro-économique, flux de décharges contrôlées vs points noirs, caractérisation physico-chimique et simulateur de valorisation pour décideurs municipaux.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExportReport}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Exporter Rapport Stratégique</span>
            </button>
          </div>
        </div>

        {/* SOMMAIRE ANALYTIQUE (7 TABS) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 pb-1 border-t border-slate-800/80 text-xs font-bold scrollbar-thin">
          
          <button
            onClick={() => setActiveTab('kpis')}
            className={`px-3.5 py-2 rounded-xl flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'kpis'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>1. Vue d'Ensemble & KPIs</span>
          </button>

          <button
            onClick={() => setActiveTab('map')}
            className={`px-3.5 py-2 rounded-xl flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'map'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5 text-cyan-400" />
            <span>2. Carte des Infrastructures (24 Gov.)</span>
          </button>

          <button
            onClick={() => setActiveTab('gisement')}
            className={`px-3.5 py-2 rounded-xl flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'gisement'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
            }`}
          >
            <PieChartIcon className="w-3.5 h-3.5 text-purple-400" />
            <span>3. Gisement & Caractérisation</span>
          </button>

          <button
            onClick={() => setActiveTab('agglos')}
            className={`px-3.5 py-2 rounded-xl flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'agglos'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-amber-400" />
            <span>4. Focus Agglomérations</span>
          </button>

          <button
            onClick={() => setActiveTab('defis')}
            className={`px-3.5 py-2 rounded-xl flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'defis'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>5. Défis & Opportunités</span>
          </button>

          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-3.5 py-2 rounded-xl flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'simulator'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-emerald-400" />
            <span>6. Simulateur de Valorisation (2030)</span>
          </button>

          <button
            onClick={() => setActiveTab('reco')}
            className={`px-3.5 py-2 rounded-xl flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'reco'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
            }`}
          >
            <Flag className="w-3.5 h-3.5 text-indigo-400" />
            <span>7. Plan d'Action Stratégique</span>
          </button>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: VUE D'ENSEMBLE & 8 KPIS STRATÉGIQUES */}
      {/* ========================================================================= */}
      {activeTab === 'kpis' && (
        <div className="space-y-6 animate-fadeIn">
          
          {/* Dualité Structurelle Callout Banner */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/60 border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="space-y-1.5 max-w-3xl">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-slate-950">
                  Constat National 2026
                </span>
                <span className="text-xs text-slate-400 font-mono">Dualité Structurelle du Secteur</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white">
                3 767 752 Tonnes/an de DMA produites en Tunisie (10 323 Tonnes/jour)
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Tandis que <strong className="text-emerald-400">67,5% (2,54 M T/an)</strong> sont prises en charge dans 13 décharges contrôlées (DC ANGeD), <strong className="text-rose-400">32,5% (1,22 M T/an)</strong> restent enfouies dans des décharges municipales non contrôlées réparties sur 11 gouvernorats déficitaires.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 text-center shrink-0 w-full md:w-auto">
              <div className="text-2xl font-black text-emerald-400 font-mono">91,9%</div>
              <div className="text-xs text-slate-200 font-bold">Gisement Valorisable Estimé</div>
              <div className="text-[10px] text-slate-400 mt-0.5">(3 462 564 T/an sous-exploitées)</div>
            </div>
          </div>

          {/* 8 Stratégic KPI Cards (Grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* KPI 1 */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold">Population Totale</span>
                <div className="w-8 h-8 rounded-lg bg-blue-950/80 text-blue-400 border border-blue-800/60 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-white tracking-tight font-mono">
                12 144 222
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Répartis sur 350 communes (24 gouvernorats)
              </p>
            </div>

            {/* KPI 2 */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold">Gisement National DMA</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 flex items-center justify-center">
                  <Scale className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-emerald-400 tracking-tight font-mono">
                3 767 752 <span className="text-xs text-slate-400 font-normal">T/an</span>
              </div>
              <p className="text-xs text-emerald-400/90 font-medium flex items-center gap-1">
                <Truck className="w-3 h-3" /> Flux quotidien : 10 323 T/jour
              </p>
            </div>

            {/* KPI 3 */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold">Ratio de Production</span>
                <div className="w-8 h-8 rounded-lg bg-amber-950/80 text-amber-400 border border-amber-800/60 flex items-center justify-center">
                  <Activity className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-amber-400 tracking-tight font-mono">
                0,815 <span className="text-xs text-slate-400 font-normal">kg/hab/j</span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Moyenne nationale (0,850 dans le Grand Tunis)
              </p>
            </div>

            {/* KPI 4 */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold">Centres Contrôlés (DC)</span>
                <div className="w-8 h-8 rounded-lg bg-teal-950/80 text-teal-400 border border-teal-800/60 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-teal-300 tracking-tight font-mono">
                67,5% <span className="text-xs text-slate-400 font-normal">(2,54 M T)</span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                13 gouvernorats équipés (8,2 M hab.)
              </p>
            </div>

            {/* KPI 5 */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold">Non Contrôlé / Urgence</span>
                <div className="w-8 h-8 rounded-lg bg-rose-950/80 text-rose-400 border border-rose-800/60 flex items-center justify-center">
                  <AlertOctagon className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-rose-400 tracking-tight font-mono">
                32,5% <span className="text-xs text-slate-400 font-normal">(1,22 M T)</span>
              </div>
              <p className="text-xs text-rose-400 font-medium">
                11 gouvernorats sans DC conforme
              </p>
            </div>

            {/* KPI 6 */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold">Fraction Organique</span>
                <div className="w-8 h-8 rounded-lg bg-lime-950/80 text-lime-400 border border-lime-800/60 flex items-center justify-center">
                  <Leaf className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-lime-400 tracking-tight font-mono">
                58,7%
              </div>
              <p className="text-xs text-slate-400 font-medium">
                2 211 670 T/an (Gisement compostable)
              </p>
            </div>

            {/* KPI 7 */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold">Recyclables Sèches</span>
                <div className="w-8 h-8 rounded-lg bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 flex items-center justify-center">
                  <Boxes className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-cyan-400 tracking-tight font-mono">
                23,5%
              </div>
              <p className="text-xs text-slate-400 font-medium">
                885 422 T/an (Plastique, Papier, Métal)
              </p>
            </div>

            {/* KPI 8 */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold">Points Noirs Critiques</span>
                <div className="w-8 h-8 rounded-lg bg-purple-950/80 text-purple-400 border border-purple-800/60 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="text-lg font-black text-purple-300 tracking-tight">
                Monastir & Mahdia
              </div>
              <p className="text-xs text-rose-400 font-medium">
                Monastir (31 comm, 194k T) sans DC !
              </p>
            </div>

          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Chart 1: Elimination Mode Breakdown */}
            <div className="lg:col-span-5 p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-sm">Mode d'Élimination National</h3>
                  <p className="text-xs text-slate-400">Centres Contrôlés (ANGeD) vs Décharges Sauvages</p>
                </div>
                <span className="text-[11px] font-mono text-emerald-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  Total : 3,77 M T/an
                </span>
              </div>

              <div className="h-64 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Décharge Contrôlée (DC)', value: 2543344, color: '#10b981' },
                        { name: 'Décharge Non Contrôlée', value: 1224408, color: '#ef4444' }
                      ]}
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      <Cell fill="#10b981" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Tooltip
                      formatter={(val: number) => [`${val.toLocaleString('fr-FR')} Tonnes/an (${((val / 3767752) * 100).toFixed(1)}%)`]}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs font-bold">
                <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300">
                  <span>13 Gov. sous DC</span>
                  <div className="text-sm font-black font-mono">2 543 344 T/an</div>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300">
                  <span>11 Gov. Hors DC</span>
                  <div className="text-sm font-black font-mono">1 224 408 T/an</div>
                </div>
              </div>
            </div>

            {/* Chart 2: Top 10 Governorates by DMA Production */}
            <div className="lg:col-span-7 p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-sm">Top 10 Gouvernorats Générateurs de DMA</h3>
                  <p className="text-xs text-slate-400">Bleu = Équipé en DC | Rouge = Décharge Non Contrôlée</p>
                </div>
                <span className="text-[11px] font-mono text-cyan-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  Tonnes / An
                </span>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topGovChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip
                      formatter={(val: number) => [`${val.toLocaleString('fr-FR')} T/an`, 'Gisement DMA']}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Bar dataKey="dma" radius={[4, 4, 0, 0]}>
                      {topGovChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <span className="w-3 h-3 rounded bg-sky-500 inline-block"></span>
                  Gouvernorat avec DC Conforme
                </span>
                <span className="flex items-center gap-1.5 text-rose-400">
                  <span className="w-3 h-3 rounded bg-red-500 inline-block"></span>
                  Gouvernorat en Décharge Sauvage (Monastir, Mahdia...)
                </span>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CARTE DES INFRASTRUCTURES & DÉCHARGES (24 GOUVERNORATS) */}
      {/* ========================================================================= */}
      {activeTab === 'map' && (
        <div className="space-y-6 animate-fadeIn">
          
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-emerald-400" />
                  Cartographie Nationale des Infrastructures & Décharges (24 Gouvernorats)
                </h2>
                <p className="text-xs text-slate-400">
                  Répartition territoriale des 13 Décharges Contrôlées (DC ANGeD) vs 11 Gouvernorats en Décharge Non Contrôlée
                </p>
              </div>

              {/* Quick Filter Buttons */}
              <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs">
                <button
                  onClick={() => setMapFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                    mapFilter === 'ALL' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Tous (24 Gov.)
                </button>
                <button
                  onClick={() => setMapFilter('DC')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                    mapFilter === 'DC' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  DC Conforme ({dcCount})
                </button>
                <button
                  onClick={() => setMapFilter('NON_CONTROLE')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                    mapFilter === 'NON_CONTROLE' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Non Contrôlé ({nonControleCount})
                </button>
              </div>
            </div>

            {/* Interactive Grid of 24 Governorates */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {filteredGovs.map((gov) => {
                const isDC = gov.status === 'DC';
                const isSelected = selectedGovernorate?.name === gov.name;

                return (
                  <div
                    key={gov.name}
                    onClick={() => setSelectedGovernorate(gov)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer space-y-3 ${
                      isSelected
                        ? 'bg-slate-850 border-emerald-500 ring-2 ring-emerald-500/20 shadow-lg'
                        : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white text-base">{gov.name}</h3>
                          <span className="text-xs text-slate-400 font-arabic" dir="rtl">{gov.nameAr}</span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">
                          Région {gov.region} • {gov.communesCount} communes
                        </span>
                      </div>

                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        isDC 
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' 
                          : 'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}>
                        {isDC ? 'DC Conforme' : 'Non Contrôlé'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 space-y-1 text-xs font-mono">
                      <div className="flex justify-between text-slate-300">
                        <span className="text-slate-500 font-sans">Infrastructure :</span>
                        <span className={`font-bold font-sans ${isDC ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {gov.infra}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span className="text-slate-500 font-sans">Population :</span>
                        <span className="text-white font-bold">{gov.pop.toLocaleString('fr-FR')} hab.</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span className="text-slate-500 font-sans">Gisement DMA :</span>
                        <span className="text-emerald-400 font-bold">{gov.dma.toLocaleString('fr-FR')} T/an ({gov.dailyTons} T/j)</span>
                      </div>
                    </div>

                    {gov.notes && (
                      <p className="text-[11px] text-rose-300 bg-rose-950/40 p-2 rounded-lg border border-rose-900/40">
                        ⚠️ {gov.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Summary Bar */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-800">
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-200 flex items-center gap-3">
                <div className="w-3.5 h-3.5 rounded-full bg-emerald-400 shrink-0"></div>
                <div>
                  <strong className="block text-white">13 Gouvernorats Équipés en DC (67,5% du DMA National)</strong>
                  <span>Djebel Chakir (Grand Tunis), Sfax, Nabeul, Sousse, Bizerte, Kairouan, Gabès, Médenine, Zaghouan, Tozeur.</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 flex items-center gap-3">
                <div className="w-3.5 h-3.5 rounded-full bg-rose-500 shrink-0"></div>
                <div>
                  <strong className="block text-white">11 Gouvernorats sans Décharge Contrôlée (32,5% du DMA)</strong>
                  <span>Urgences absolues : Monastir (194k T/an), Mahdia (142k T/an), Sidi Bouzid, Kasserine, Jendouba, Béja...</span>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: GISEMENT & CARACTÉRISATION PHYSICO-CHIMIQUE */}
      {/* ========================================================================= */}
      {activeTab === 'gisement' && (
        <div className="space-y-6 animate-fadeIn">
          
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
            
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <PieChartIcon className="w-5 h-5 text-purple-400" />
                Composition Physico-Chimique & Potentiel de Valorisation (3 767 752 T/an)
              </h2>
              <p className="text-xs text-slate-400">
                Un gisement national à forte humidité, dominé à 58,7% par la matière organique fermentescible.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              
              {/* Pie Chart */}
              <div className="lg:col-span-6 h-80 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={WASTE_COMPOSITION_DATA}
                      outerRadius={110}
                      innerRadius={50}
                      paddingAngle={3}
                      dataKey="percent"
                      nameKey="name"
                      label={({ percent }) => `${percent}%`}
                    >
                      {WASTE_COMPOSITION_DATA.map((entry, idx) => (
                        <Cell key={`cell-comp-${idx}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: number, name: string) => [`${val}%`, name]}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Fraction Details Cards */}
              <div className="lg:col-span-6 space-y-2.5">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Détail par Fraction & Tonnages Annuels :
                </h3>

                {WASTE_COMPOSITION_DATA.map((item) => {
                  const IconComp = item.icon;
                  return (
                    <div
                      key={item.name}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs transition-colors hover:border-slate-700"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: item.color }}>
                          <IconComp className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-white">{item.name}</span>
                      </div>

                      <div className="text-right font-mono">
                        <span className="text-sm font-black text-emerald-400">{item.percent}%</span>
                        <span className="block text-[10px] text-slate-400">{item.tons.toLocaleString('fr-FR')} T/an</span>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

            {/* Strategic takeaway */}
            <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-800/60 text-xs text-purple-200 space-y-1">
              <strong className="block text-white flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Opportunité Majeure de Décarbonation & Économie Circulaire :
              </strong>
              <p className="text-slate-300">
                La combinaison de la fraction organique (58,7%) et des recyclables sèches plastiques, papiers et métaux (23,5%) représente plus de <strong>82,2% du gisement total (3,10 M T/an)</strong> immédiatement valorisable par compostage, biométhanisation et tri sélectif mécanique.
              </p>
            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: FOCUS GRANDES AGGLOMÉRATIONS */}
      {/* ========================================================================= */}
      {activeTab === 'agglos' && (
        <div className="space-y-6 animate-fadeIn">
          
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
            
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-amber-400" />
                Analyse Stratégique par Grande Agglomération (Pôles Métropolitains)
              </h2>
              <p className="text-xs text-slate-400">
                Spécificités territoriales, saturation des décharges, saisonnalité touristique et opportunités industrielles.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              
              {/* Grand Tunis */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 relative overflow-hidden flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-950 text-emerald-300 border border-emerald-800">
                      DC Djebel Chakir
                    </span>
                    <span className="text-xs text-slate-400 font-mono">24,5% du total national</span>
                  </div>
                  <h3 className="text-base font-bold text-white">Grand Tunis (4 Gouvernorats)</h3>
                  <p className="text-xs text-slate-400">Tunis, Ariana, Ben Arous, Manouba</p>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs font-mono">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Population</span>
                      <span className="text-white font-bold">2 975 749 hab.</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Gisement DMA</span>
                      <span className="text-emerald-400 font-bold">923 227 T/an</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Flux Quotidien</span>
                      <span className="text-white font-bold">2 529 T/jour</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Ratio Prod.</span>
                      <span className="text-amber-400 font-bold">0,850 kg/h/j</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs text-amber-200 space-y-1">
                  <strong className="block text-amber-300">⚠️ Risque Critique :</strong>
                  <p className="text-[11px] leading-relaxed">
                    Monosite Djebel Chakir en risque de saturation imminente. Urgence de créer une unité métropolitaine de Traitement Mécano-Biologique (TMB).
                  </p>
                </div>
              </div>

              {/* Grand Sfax */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 relative overflow-hidden flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-950 text-emerald-300 border border-emerald-800">
                      DC Sfax
                    </span>
                    <span className="text-xs text-slate-400 font-mono">8,7% du total national</span>
                  </div>
                  <h3 className="text-base font-bold text-white">Grand Sfax (2ème Pôle Économique)</h3>
                  <p className="text-xs text-slate-400">23 Communes - Zone Industrielle & Portuaire</p>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs font-mono">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Population</span>
                      <span className="text-white font-bold">1 053 688 hab.</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Gisement DMA</span>
                      <span className="text-emerald-400 font-bold">326 904 T/an</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Flux Quotidien</span>
                      <span className="text-white font-bold">895 T/jour</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Communes</span>
                      <span className="text-white font-bold">23 municipalités</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-800/60 text-xs text-blue-200 space-y-1">
                  <strong className="block text-blue-300">💡 Opportunité Majeure :</strong>
                  <p className="text-[11px] leading-relaxed">
                    Candidat naturel pour un projet pilote de compostage à grande échelle (~192k T/an de bio-déchets) et filière CSR pour cimenteries.
                  </p>
                </div>
              </div>

              {/* Monastir (Point Noir) */}
              <div className="p-5 rounded-2xl bg-rose-950/20 border border-rose-800/80 space-y-3 relative overflow-hidden flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-rose-900 text-white">
                      DÉCHARGE MUNICIPALE SAUVAGE
                    </span>
                    <span className="text-xs text-rose-300 font-mono font-bold">7ème Rang National</span>
                  </div>
                  <h3 className="text-base font-bold text-white">Monastir (Urgence Absolue)</h3>
                  <p className="text-xs text-slate-400">31 Communes (Plus forte densité communale)</p>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs font-mono">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Population</span>
                      <span className="text-white font-bold">627 164 hab.</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Gisement DMA</span>
                      <span className="text-rose-400 font-bold">194 578 T/an</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Flux Quotidien</span>
                      <span className="text-white font-bold">533 T/jour</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Statut DC</span>
                      <span className="text-rose-400 font-bold">0 DC Conforme</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-rose-900 text-white text-xs space-y-1 shadow-lg">
                  <strong className="block font-black">🚨 Anomalie Majeure :</strong>
                  <p className="text-[11px] leading-relaxed">
                    3ème agglomération littorale sans aucune décharge contrôlée. Création prioritaire d'un DC Régional partagé Sousse-Monastir requise.
                  </p>
                </div>
              </div>

              {/* Sousse */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 relative overflow-hidden flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-950 text-emerald-300 border border-emerald-800">
                      DC Sousse (Oued Laya)
                    </span>
                    <span className="text-xs text-slate-400 font-mono">6,4% du national</span>
                  </div>
                  <h3 className="text-base font-bold text-white">Sousse & Sahel Nord</h3>
                  <p className="text-xs text-slate-400">18 Communes - Zone Touristique & Métropolitaine</p>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs font-mono">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Population</span>
                      <span className="text-white font-bold">773 443 hab.</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Gisement DMA</span>
                      <span className="text-emerald-400 font-bold">239 963 T/an</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Saisonnalité</span>
                      <span className="text-amber-400 font-bold">+30% à +50% en Été</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Communes</span>
                      <span className="text-white font-bold">18 municipalités</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
                  Gestion adaptative de la saisonnalité touristique côtière et renforcement des tournées estivales obligatoire.
                </div>
              </div>

              {/* Nabeul (Cap Bon) */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 relative overflow-hidden flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-950 text-emerald-300 border border-emerald-800">
                      DC Nabeul
                    </span>
                    <span className="text-xs text-slate-400 font-mono">7,4% du national</span>
                  </div>
                  <h3 className="text-base font-bold text-white">Nabeul (Cap Bon)</h3>
                  <p className="text-xs text-slate-400">28 Communes - Pôle Agricole & Tourisme</p>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs font-mono">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Population</span>
                      <span className="text-white font-bold">897 133 hab.</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Gisement DMA</span>
                      <span className="text-emerald-400 font-bold">278 336 T/an</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-200">
                  Haut potentiel de valorisation en compostage des sous-produits maraîchers et agrumicoles du Cap Bon.
                </div>
              </div>

              {/* Mahdia */}
              <div className="p-5 rounded-2xl bg-rose-950/20 border border-rose-800/60 space-y-3 relative overflow-hidden flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-rose-900 text-white">
                      DÉCHARGE NON CONTRÔLÉE
                    </span>
                    <span className="text-xs text-rose-300 font-mono">18 Communes</span>
                  </div>
                  <h3 className="text-base font-bold text-white">Mahdia & Sahel Sud</h3>
                  <p className="text-xs text-slate-400">Zone Littorale & Halieutique</p>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs font-mono">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Population</span>
                      <span className="text-white font-bold">459 386 hab.</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Gisement DMA</span>
                      <span className="text-rose-400 font-bold">142 525 T/an</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-xs text-rose-200">
                  Décharge municipale à résorber d'urgence. Risque de pollution marine et nappe phréatique.
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: DÉFIS & OPPORTUNITÉS DU SECTEUR */}
      {/* ========================================================================= */}
      {activeTab === 'defis' && (
        <div className="space-y-6 animate-fadeIn">
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* 5 Défis Majeurs */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <h2 className="text-base font-black text-rose-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                Les 5 Défis Majeurs du Secteur des DMA
              </h2>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-900/50 space-y-1">
                  <span className="font-bold text-white text-sm block">1. Déficit d'Infrastructures Normées</span>
                  <p className="text-slate-300">
                    11 gouvernorats et près de 3,9 millions d'habitants sont encore tributaires de décharges sauvages sans étanchéité ni traitement de lixiviats.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-900/50 space-y-1">
                  <span className="font-bold text-white text-sm block">2. Gouvernance & Cadre Institutionnel</span>
                  <p className="text-slate-300">
                    Fragmentation des compétences entre l'ANGeD (gestion des décharges) et les 350 municipalités sous-dotées en matériel et techniciens qualifiés.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="font-bold text-white text-sm block">3. Modèle Financier Chroniquement Déficitaire</span>
                  <p className="text-slate-300">
                    Faiblesse des redevances communales (TCL), recouvrement partiel et absence d'application rigoureuse du principe pollueur-payeur.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="font-bold text-white text-sm block">4. Déficit de Tri à la Source & Sensibilisation</span>
                  <p className="text-slate-300">
                    Quasi-inexistence de collecte sélective structurée à l'échelle des ménages entraînant la dégradation de la matière organique par mélange.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="font-bold text-white text-sm block">5. Sous-Exploitation Immense de la Valorisation</span>
                  <p className="text-slate-300">
                    Moins de 5% du gisement national est effectivement valorisé malgré un potentiel technique démontré de 91,9%.
                  </p>
                </div>
              </div>
            </div>

            {/* 5 Opportunités */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <h2 className="text-base font-black text-emerald-400 flex items-center gap-2">
                <Leaf className="w-5 h-5 text-emerald-500" />
                Les 5 Opportunités de Transformation Durable
              </h2>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-900/50 space-y-1">
                  <span className="font-bold text-white text-sm block">1. Économie Circulaire & Biométhanisation</span>
                  <p className="text-slate-300">
                    Valorisation des 2,2 M T/an d'organique en compost agricole pour enrichir les sols tunisiens et en biogaz pour la transition énergétique.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-sky-950/30 border border-sky-900/50 space-y-1">
                  <span className="font-bold text-white text-sm block">2. Structuration des Filières REP (Emballages)</span>
                  <p className="text-slate-300">
                    Responsabilité Élargie des Producteurs pour recycler 455k T de plastiques et 339k T de papier/carton avec éco-contributions industrielles.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-900/50 space-y-1">
                  <span className="font-bold text-white text-sm block">3. Financement Climat & Partenariats Public-Privé (PPP)</span>
                  <p className="text-slate-300">
                    Éligibilité aux fonds verts internationaux pour capturer les émissions de méthane (CH4) et moderniser les centres de transfert intercommunaux.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-900/50 space-y-1">
                  <span className="font-bold text-white text-sm block">4. Création d'Emplois Verts & Formalisation</span>
                  <p className="text-slate-300">
                    Intégration socio-économique et dignification des chiffonniers traditionnels (barbéchas) au sein de centres de tri mécanisés et coopératives.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="font-bold text-white text-sm block">5. Smart Waste Management & Numérique (SIIPI)</span>
                  <p className="text-slate-300">
                    Optimisation télématique des tournées de camions, capteurs de remplissage des bacs 770L et pesée automatique aux ponts-bascules.
                  </p>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: SIMULATEUR DYNAMIQUE DE VALORISATION (HORIZON 2030) */}
      {/* ========================================================================= */}
      {activeTab === 'simulator' && (
        <div className="space-y-6 animate-fadeIn">
          
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
            
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-emerald-400" />
                Simulateur Dynamique de Scénarios de Valorisation (Horizon 2030)
              </h2>
              <p className="text-xs text-slate-400">
                Ajustez les curseurs pour modéliser le détournement de décharge, la production de compost, la réduction d'émissions de CO2 et les gains économiques.
              </p>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 rounded-xl bg-slate-950 border border-slate-800">
              
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-slate-200 font-bold">Taux de Compostage / Méthanisation de l'Organique :</label>
                  <span className="text-sm font-black text-emerald-400 font-mono bg-emerald-950/80 px-2.5 py-0.5 rounded border border-emerald-800">
                    {compostRate}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="80"
                  step="5"
                  value={compostRate}
                  onChange={(e) => setCompostRate(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
                <p className="text-[11px] text-slate-400">Gisement organique total : 2 211 670 T/an</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-slate-200 font-bold">Taux de Recyclage Plastique / Papier / Métal :</label>
                  <span className="text-sm font-black text-cyan-400 font-mono bg-cyan-950/80 px-2.5 py-0.5 rounded border border-cyan-800">
                    {recyclingRate}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="80"
                  step="5"
                  value={recyclingRate}
                  onChange={(e) => setRecyclingRate(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
                <p className="text-[11px] text-slate-400">Gisement recyclable total : 885 422 T/an</p>
              </div>

            </div>

            {/* Simulation KPI Output Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              <div className="p-5 rounded-2xl bg-emerald-950/40 border border-emerald-800/80 space-y-1 text-emerald-200">
                <span className="text-[11px] uppercase font-bold text-emerald-400">Tonnage Évité d'Enfouissement</span>
                <div className="text-2xl font-black text-white font-mono">
                  {simulationResults.totalEvite.toLocaleString('fr-FR')} <span className="text-xs text-slate-300">T/an</span>
                </div>
                <p className="text-[11px] text-emerald-300 font-medium">
                  Équivalent à <strong>{simulationResults.totalPct}%</strong> du gisement total national
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-sky-950/40 border border-sky-800/80 space-y-1 text-sky-200">
                <span className="text-[11px] uppercase font-bold text-sky-400">Compost Normé Produit</span>
                <div className="text-2xl font-black text-white font-mono">
                  {simulationResults.compostProduit.toLocaleString('fr-FR')} <span className="text-xs text-slate-300">T/an</span>
                </div>
                <p className="text-[11px] text-sky-300 font-medium">
                  Fertilisation biologique pour les terres agricoles
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-purple-950/40 border border-purple-800/80 space-y-1 text-purple-200">
                <span className="text-[11px] uppercase font-bold text-purple-400">Réduction Émissions CO2eq</span>
                <div className="text-2xl font-black text-white font-mono">
                  {simulationResults.co2Evite.toLocaleString('fr-FR')} <span className="text-xs text-slate-300">T CO2/an</span>
                </div>
                <p className="text-[11px] text-purple-300 font-medium">
                  Évitement de méthane de décharge (CH4)
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-amber-950/40 border border-amber-800/80 space-y-1 text-amber-200">
                <span className="text-[11px] uppercase font-bold text-amber-400">Valeur Économique Nette</span>
                <div className="text-2xl font-black text-amber-300 font-mono">
                  {simulationResults.valeurEconomiqueM} <span className="text-xs text-slate-300">M TND/an</span>
                </div>
                <p className="text-[11px] text-amber-300 font-medium">
                  Économies de transport, décharge & ventes matières
                </p>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: PLAN D'ACTION STRATÉGIQUE (FEUILLE DE ROUTE) */}
      {/* ========================================================================= */}
      {activeTab === 'reco' && (
        <div className="space-y-6 animate-fadeIn">
          
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
            
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <Flag className="w-5 h-5 text-indigo-400" />
                Orientations Stratégiques & Feuille de Route Sectorielle
              </h2>
              <p className="text-xs text-slate-400">
                Recommandations stratégiques nationales et feuille de route opérationnelle (FNCT / ANGeD).
              </p>
            </div>

            {/* National Level Priorities */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> Actions Prioritaires à l'Échelle Nationale
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <span className="font-bold text-white text-sm block">1. Résorption Totale des Décharges Non Contrôlées (Horizon 2028)</span>
                  <p className="text-slate-300 leading-relaxed">
                    Lancer un programme national contraignant pour équiper les 11 gouvernorats déficitaires en centres conformes et centres de transfert intercommunaux.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <span className="font-bold text-white text-sm block">2. Révision du Schéma Directeur des Décharges Contrôlées</span>
                  <p className="text-slate-300 leading-relaxed">
                    Réduire la vulnérabilité liée aux installations uniques (Djebel Chakir) et développer des hubs régionaux intercommunaux modulaires.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <span className="font-bold text-white text-sm block">3. Lancement du PNVD (Programme National de Valorisation)</span>
                  <p className="text-slate-300 leading-relaxed">
                    Fixer des objectifs obligatoires de compostage des biodéchets municipaux et de tri mécanique des emballages plastiques et cartons.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <span className="font-bold text-white text-sm block">4. Réforme du Financement & Taxes Communales</span>
                  <p className="text-slate-300 leading-relaxed">
                    Instaurer une redevance déchets réaliste et activer la Responsabilité Élargie des Producteurs (REP) avec éco-organismes agréés.
                  </p>
                </div>
              </div>
            </div>

            {/* Prescriptions Spécifiques Locales */}
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Prescriptions Spécifiques par Agglomération
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 space-y-1">
                  <span className="font-bold text-amber-300 text-sm block">Grand Tunis</span>
                  <p className="text-slate-300">
                    Accélérer le site successeur de Djebel Chakir et déployer une unité métropolitaine de Traitement Mécano-Biologique (TMB).
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/60 space-y-1">
                  <span className="font-bold text-rose-300 text-sm block">Monastir & Mahdia</span>
                  <p className="text-slate-300">
                    Créer de toute urgence un DC régional partagé pour éliminer le fléau des décharges sauvages littorales.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/60 space-y-1">
                  <span className="font-bold text-emerald-300 text-sm block">Nabeul & Sfax</span>
                  <p className="text-slate-300">
                    Développer la filière compostage orientée vers l'agriculture maraîchère du Cap Bon et du Sahel.
                  </p>
                </div>
              </div>
            </div>

            {/* Institutional Sign-off footer */}
            <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
              <FNCTLogo variant="full" theme="dark" size="sm" />
              
              <div className="flex items-center gap-3 border-y md:border-y-0 md:border-x border-slate-800 py-2 md:py-0 md:px-6">
                <TunisianCoatOfArmsLogo size="sm" />
                <div className="text-center">
                  <span className="text-xs font-black text-amber-400 block" style={{ fontFamily: 'Cairo, sans-serif' }}>
                    الجمهورية التونسية
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold block">
                    Observatoire DMA • 349 Communes
                  </span>
                </div>
              </div>

              <ANGeDLogo variant="full" theme="dark" size="sm" />
            </div>

          </div>

        </div>
      )}

    </div>
  );
};
