import React, { useState } from 'react';
import { MOCK_TRUCKS } from '../data/mockData';
import { Language } from '../types/siipi';
import { 
  Radio, 
  CheckCircle2, 
  QrCode, 
  AlertTriangle, 
  MapPin, 
  Fuel, 
  Clock, 
  Database, 
  Wifi, 
  WifiOff, 
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Camera
} from 'lucide-react';

interface FieldAgentSimulatorProps {
  language: Language;
}

export const FieldAgentSimulator: React.FC<FieldAgentSimulatorProps> = ({ language }) => {
  const isAr = language === 'ar';
  const [activeTourStop, setActiveTourStop] = useState<number>(19);
  const totalStops = 28;
  const [offlineSyncCount, setOfflineSyncCount] = useState<number>(0);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [scannerActive, setScannerActive] = useState<boolean>(false);
  const [incidentModal, setIncidentModal] = useState<boolean>(false);
  const [incidentType, setIncidentType] = useState<string>('panne_mecanique');
  const [activeWeightInput, setActiveWeightInput] = useState<string>('850');

  const handleValidateStop = () => {
    if (activeTourStop < totalStops) {
      setActiveTourStop(prev => prev + 1);
      if (isOffline) {
        setOfflineSyncCount(prev => prev + 1);
      }
    }
  };

  const handleScanQr = () => {
    setScannerActive(true);
    setTimeout(() => {
      setScannerActive(false);
      handleValidateStop();
      alert(`✓ Bac CONT-MARSA-042 scanné avec succès ! Poids ajouté : ${activeWeightInput} kg. Enregistré dans SQLite.`);
    }, 1200);
  };

  const handleReportIncident = (e: React.FormEvent) => {
    e.preventDefault();
    setIncidentModal(false);
    alert(`⚠️ Incident terrain "${incidentType.replace('_', ' ')}" transmis en urgence au poste de commandement municipal !`);
  };

  return (
    <div className="flex flex-col lg:flex-row items-center lg:items-start justify-center gap-8 py-4">
      
      {/* Ruggedized Terminal Frame */}
      <div className="w-full max-w-[420px] h-[800px] rounded-[36px] p-4 bg-slate-900 border-4 border-amber-600/60 shadow-2xl relative flex flex-col overflow-hidden ring-8 ring-slate-800/80">
        
        {/* Terminal Top Bar */}
        <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-bold font-mono text-white text-xs">TERMINAL AGENT N°04</span>
          </div>

          {/* Offline/Online toggle */}
          <button
            onClick={() => setIsOffline(!isOffline)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
              isOffline
                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
            }`}
          >
            {isOffline ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
            <span>{isOffline ? 'Mode SQLite Offline' : '4G Connecté'}</span>
          </button>
        </div>

        {/* Inner Screen */}
        <div className="flex-1 bg-slate-950 rounded-2xl overflow-y-auto p-4 space-y-4 text-xs no-scrollbar flex flex-col">
          
          {/* Driver & Vehicle Header */}
          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 block font-mono">Chauffeur</span>
              <span className="font-bold text-white text-sm">Moncef Ben Salem</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block font-mono">Benne Tasseuse 16m³</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">189 TU 4521</span>
            </div>
          </div>

          {/* Progress Bar with Large Touch Targets */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">Tournée active : Marsa Plage</span>
              <span className="font-mono font-bold text-emerald-400">{activeTourStop} / {totalStops} arrêts</span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
              <div 
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${(activeTourStop / totalStops) * 100}%` }}
              />
            </div>
          </div>

          {/* Next Stop Card */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-emerald-950/40 border-2 border-emerald-500/40 space-y-2">
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
              Prochain Arrêt Prioritaire
            </span>
            <h4 className="font-bold text-white text-base">Point Saf-Saf (2 Bacs 770L)</h4>
            <p className="text-slate-300 text-xs flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>Face Café Saf-Saf, Marsa Ville</span>
            </p>
          </div>

          {/* Large Action Buttons (Designed for Protective Gloves) */}
          <div className="space-y-3 pt-2">
            
            {/* Big Button 1: Scan & Empty Container */}
            <button
              onClick={handleScanQr}
              disabled={scannerActive}
              className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-sm flex items-center justify-center gap-3 shadow-xl shadow-emerald-600/30 transition-all"
            >
              <QrCode className="w-6 h-6" />
              <span>{scannerActive ? 'Scan en cours...' : 'SCANNER & VALIDER LE BAC'}</span>
            </button>

            {/* Big Button 2: Incident Button */}
            <button
              onClick={() => setIncidentModal(true)}
              className="w-full py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-500 active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-600/20 transition-all"
            >
              <AlertTriangle className="w-5 h-5" />
              <span>SIGNALER INCIDENT TERRAIN</span>
            </button>

          </div>

          {/* Real-time Telemetry strip */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-center text-[11px]">
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Km Parcourus</span>
              <span className="font-bold text-white font-mono">14.8 km</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Carburant</span>
              <span className="font-bold text-teal-400 font-mono">78%</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Poids Net</span>
              <span className="font-bold text-cyan-400 font-mono">6.4 t</span>
            </div>
          </div>

          {/* SQLite Sync info if offline */}
          {offlineSyncCount > 0 && (
            <div className="p-3 rounded-xl bg-amber-950/80 border border-amber-800 text-amber-200 text-[11px] flex items-center justify-between">
              <span>{offlineSyncCount} pesées en cache SQLite local</span>
              <span className="font-mono font-bold">Sync auto 4G</span>
            </div>
          )}

        </div>

      </div>

      {/* Side Explanation & Features */}
      <div className="max-w-md space-y-5">
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-bold">
            <Radio className="w-4 h-4" />
            <span>APPLICATION AGENT DE TERRAIN DURCIE</span>
          </div>
          <h2 className="text-xl font-bold text-white">
            {isAr ? 'تطبيق أعوان الميدان وشاحنات النظافة' : 'Outil Embarqué Chauffeur & Agents de Propreté'}
          </h2>
          <p className="text-slate-300 text-xs leading-relaxed">
            {isAr
              ? 'مصمم بأزرار كبيرة للاستخدام المريح بالقفازات، مع دعم كامل للعمل دون اتصال بالإنترنت وحفظ البيانات في قاعدة SQLite مدمجة.'
              : 'Spécifiquement étudiée pour les conditions sévères de collecte : interface à haute lisibilité, scanner QR code des conteneurs 770L, recoupement de pesée et synchronisation résiliente.'}
          </p>

          <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Circuit pas-à-pas avec validation par géofencing</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Scan QR code des bacs et tickets ANGeD</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Signalement instantané des pannes mécaniques et voiries bloquées</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Base SQLite locale avec re-synchronisation automatique</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
