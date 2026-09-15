import React, { useState } from 'react';
import { FiveAxisScore, Language } from '../types/siipi';
import { 
  BarChart3, 
  Calculator, 
  TrendingUp, 
  ShieldCheck, 
  Truck, 
  Users, 
  Coins, 
  CheckCircle2, 
  Sliders, 
  Download,
  Building2,
  FileSpreadsheet
} from 'lucide-react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip } from 'recharts';

interface KpiAndFleetCalculatorProps {
  language: Language;
}

export const KpiAndFleetCalculator: React.FC<KpiAndFleetCalculatorProps> = ({ language }) => {
  const isAr = language === 'ar';
  
  // 5-Axis State — nomenclature officielle CDC FNCT §3.2.10
  const [axisScores, setAxisScores] = useState<FiveAxisScore>({
    efficaciteOperationnelle: 88,
    qualiteService: 92,
    performanceEnvironnementale: 84,
    performanceEconomique: 79,
    securiteRh: 76,
    overallScore: 83.8,
  });

  // Fleet & Investment Simulator Parameters
  const [population, setPopulation] = useState<number>(90000);
  const [dailyWasteTons, setDailyWasteTons] = useState<number>(85);
  const [benne16m3Count, setBenne16m3Count] = useState<number>(6);
  const [benne8m3Count, setBenne8m3Count] = useState<number>(2);
  const [amplirollCount, setAmplirollCount] = useState<number>(2);
  const [containers770LCount, setContainers770LCount] = useState<number>(350);

  // Unit costs in Tunisian Dinars (TND)
  const UNIT_COST_BENNE_16M3 = 340000; // TND
  const UNIT_COST_BENNE_8M3 = 220000;
  const UNIT_COST_AMPLIROLL = 290000;
  const UNIT_COST_CONTAINER_770L = 650;
  const VAT_RATE = 0.19; // 19% TVA

  // Cost Calculations
  const capexVehiclesExclVat = 
    (benne16m3Count * UNIT_COST_BENNE_16M3) +
    (benne8m3Count * UNIT_COST_BENNE_8M3) +
    (amplirollCount * UNIT_COST_AMPLIROLL);
  
  const capexContainersExclVat = containers770LCount * UNIT_COST_CONTAINER_770L;
  const totalCapexExclVat = capexVehiclesExclVat + capexContainersExclVat;
  const totalVat = totalCapexExclVat * VAT_RATE;
  const totalCapexInclVat = totalCapexExclVat + totalVat;

  // Annual OPEX (Carburant, Salaires chauffeurs & éboueurs, Maintenance 7% du CAPEX)
  const totalDrivers = (benne16m3Count + benne8m3Count + amplirollCount) * 3; // 3 agents par camion
  const annualSalariesTND = totalDrivers * 14000; // ~14k TND brut / an
  const annualFuelTND = (benne16m3Count + benne8m3Count + amplirollCount) * 22000; // Carburant diesel
  const annualMaintenanceTND = totalCapexExclVat * 0.07;
  const totalAnnualOpexTND = annualSalariesTND + annualFuelTND + annualMaintenanceTND;

  // Cost per inhabitant per year
  const costPerInhabitantYearTND = population > 0 ? Number((totalAnnualOpexTND / population).toFixed(2)) : 0;

  const radarData = [
    { subject: 'Efficacité Opérationnelle (Axe 1)', score: axisScores.efficaciteOperationnelle, fullMark: 100 },
    { subject: 'Qualité de Service (Axe 2)', score: axisScores.qualiteService, fullMark: 100 },
    { subject: 'Performance Environnementale (Axe 3)', score: axisScores.performanceEnvironnementale, fullMark: 100 },
    { subject: 'Performance Économique (Axe 4)', score: axisScores.performanceEconomique, fullMark: 100 },
    { subject: 'Sécurité & RH (Axe 5)', score: axisScores.securiteRh, fullMark: 100 },
  ];

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-1 rounded-md bg-cyan-500/20 text-cyan-300 font-mono text-xs font-bold border border-cyan-500/30">
              OUTIL D'AIDE À LA DÉCISION & MODÉLISATION FNCT
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Référentiel National des 5 Axes & Calculateur de Flotte
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {isAr ? 'لوحة قيادة المحاور الخمسة وحاسبة استثمارات الأسطول' : 'Évaluation 5 Axes & Simulateur d’Investissement de Flotte'}
          </h1>
          <p className="text-sm text-slate-300 max-w-3xl mt-1">
            {isAr
              ? 'نمذجة تكاليف اقتناء شاحنات النظافة، حساب الأداء المالي، احتساب الأداء على القيمة المضافة 19%، وكلفة الخدمة لكل ساكن.'
              : 'Outil financier certifié FNCT pour le dimensionnement des parcs de bennes tasseuses, l’évaluation de la viabilité économique et le calcul du coût annuel par habitant.'}
          </p>
        </div>

        <button
          onClick={() => alert('Export du rapport de simulation financière en PDF / Excel.')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/30 transition-colors"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Exporter Simulation Financière</span>
        </button>
      </div>

      {/* Part 1: Radar 5-Axis Scorecard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Radar Visualizer */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cyan-400" />
                Scorecard National des 5 Axes de Propreté
              </h3>
              <p className="text-xs text-slate-400">Évaluation globale de performance municipale</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block font-mono">Score Global</span>
              <span className="font-black text-cyan-300 text-lg font-mono">{axisScores.overallScore} / 100</span>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="subject" stroke="#94a3b8" fontSize={10} />
                <PolarRadiusAxis stroke="#475569" angle={30} domain={[0, 100]} fontSize={10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} 
                  itemStyle={{ color: '#22d3ee' }}
                />
                <Radar name="Performance Commune" dataKey="score" stroke="#06b6d4" fill="#0891b2" fillOpacity={0.5} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 5-Axis Detail Breakdown */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3.5 text-xs">
          <h3 className="font-bold text-white text-base">Détail des Piliers Stratégiques</h3>
          
          <div className="space-y-2.5">
            {[
              { axis: 'Axe 1: Efficacité Opérationnelle', score: axisScores.efficaciteOperationnelle, desc: 'Taux de collecte, respect des tournées, disponibilité de la flotte.', color: 'emerald' },
              { axis: 'Axe 2: Qualité de Service', score: axisScores.qualiteService, desc: 'Délai de traitement des réclamations, indice de propreté, satisfaction citoyenne.', color: 'teal' },
              { axis: 'Axe 3: Performance Environnementale', score: axisScores.performanceEnvironnementale, desc: 'Taux de valorisation/tri, conformité PCGD, écarts de pesée ANGeD.', color: 'cyan' },
              { axis: 'Axe 4: Performance Économique', score: axisScores.performanceEconomique, desc: 'Coût par habitant, taux de recouvrement TCL, exécution budgétaire.', color: 'blue' },
              { axis: 'Axe 5: Sécurité et Ressources Humaines', score: axisScores.securiteRh, desc: 'Accidents du travail, couverture sociale, formation du personnel.', color: 'amber' },
            ].map((item, i) => (
              <div key={i} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{item.axis}</span>
                  <span className="font-mono font-bold text-cyan-400">{item.score} %</span>
                </div>
                <p className="text-[11px] text-slate-400">{item.desc}</p>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${item.score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Part 2: Interactive Fleet & Investment Financial Simulator */}
      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Calculator className="w-5 h-5 text-emerald-400" />
              Simulateur d'Investissement & Modélisation de Flotte
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Ajustez les curseurs pour modéliser le coût d'acquisition (CAPEX), la TVA 19% et l'exploitation annuelle (OPEX)
            </p>
          </div>
          <span className="text-xs bg-slate-800 text-emerald-300 font-mono px-3 py-1 rounded-full border border-slate-700">
            Norme FNCT / DGCL
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Controls Sliders */}
          <div className="lg:col-span-6 space-y-4 text-xs">
            
            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span>Population à desservir :</span>
                <span className="font-mono font-bold text-white">{population.toLocaleString()} hab.</span>
              </div>
              <input
                type="range"
                min="10000"
                max="300000"
                step="5000"
                value={population}
                onChange={(e) => setPopulation(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span>Bennes Tasseuses 16m³ (340 000 DT / unité) :</span>
                <span className="font-mono font-bold text-emerald-400">{benne16m3Count} camions</span>
              </div>
              <input
                type="range"
                min="1"
                max="25"
                value={benne16m3Count}
                onChange={(e) => setBenne16m3Count(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span>Bennes Tasseuses 8m³ - Rues étroites (220 000 DT / unité) :</span>
                <span className="font-mono font-bold text-teal-400">{benne8m3Count} camions</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={benne8m3Count}
                onChange={(e) => setBenne8m3Count(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span>Camions Ampliroll 20m³ (290 000 DT / unité) :</span>
                <span className="font-mono font-bold text-cyan-400">{amplirollCount} camions</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={amplirollCount}
                onChange={(e) => setAmplirollCount(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span>Conteneurs Plastique 770L (650 DT / unité) :</span>
                <span className="font-mono font-bold text-white">{containers770LCount} bacs</span>
              </div>
              <input
                type="range"
                min="50"
                max="1500"
                step="25"
                value={containers770LCount}
                onChange={(e) => setContainers770LCount(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

          </div>

          {/* Results Summary Box */}
          <div className="lg:col-span-6 space-y-4">
            
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 text-xs">
              <h4 className="font-bold text-white text-sm uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Coins className="w-4 h-4 text-emerald-400" />
                Synthèse Budgétaire Prévisionnelle
              </h4>

              <div className="space-y-2 text-slate-300">
                <div className="flex justify-between p-2 rounded-lg bg-slate-900">
                  <span className="text-slate-400">Total Investissement Flotte & Bacs (HT) :</span>
                  <span className="font-bold font-mono text-white">{totalCapexExclVat.toLocaleString()} TND</span>
                </div>
                <div className="flex justify-between p-2 rounded-lg bg-slate-900">
                  <span className="text-slate-400">TVA 19% Récupérable / Financement :</span>
                  <span className="font-bold font-mono text-amber-400">{Math.round(totalVat).toLocaleString()} TND</span>
                </div>
                <div className="flex justify-between p-2 rounded-lg bg-slate-900 border border-slate-700">
                  <span className="font-bold text-white">Investissement Total (TTC) :</span>
                  <span className="font-black font-mono text-emerald-400 text-sm">{Math.round(totalCapexInclVat).toLocaleString()} TND</span>
                </div>
                <div className="flex justify-between p-2 rounded-lg bg-slate-900">
                  <span className="text-slate-400">Coût Annuel d'Exploitation (OPEX) :</span>
                  <span className="font-bold font-mono text-teal-300">{Math.round(totalAnnualOpexTND).toLocaleString()} TND / an</span>
                </div>
              </div>

              {/* Key Ratio: Cost per Inhabitant */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 border border-emerald-500/40 text-center space-y-1">
                <span className="text-[11px] text-slate-300 block">Coût Global Réel du Service par Habitant</span>
                <div className="text-3xl font-black text-white font-mono">
                  {costPerInhabitantYearTND} <span className="text-sm font-normal text-emerald-400">DT / hab / an</span>
                </div>
                <span className="text-[10px] text-emerald-300">
                  Conforme à la fourchette nationale tunisienne (25 - 45 DT/hab/an)
                </span>
              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
