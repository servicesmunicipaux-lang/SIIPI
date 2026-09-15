import React, { useState } from 'react';
import { Terminal, X, Play, Sparkles, Layers, Code2, Database, ShieldCheck, Calendar, BookOpen } from 'lucide-react';
import { UserRole } from '../types/siipi';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExecuteCommand: (command: string) => void;
  onNavigateToRole: (role: UserRole) => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  onExecuteCommand,
  onNavigateToRole,
}) => {
  const [inputVal, setInputVal] = useState('');

  if (!isOpen) return null;

  const quickCommands = [
    { cmd: '/phase 1', label: 'Phase 1 : Spécifications & Analyse des besoins', category: 'Phases' },
    { cmd: '/phase 2', label: 'Phase 2 : Architecture technique & Schémas PostGIS', category: 'Phases' },
    { cmd: '/phase 3', label: 'Phase 3 : Back-end Node/Python & API REST', category: 'Phases' },
    { cmd: '/phase 4', label: 'Phase 4 : Front-end Portails Web & GIS', category: 'Phases' },
    { cmd: '/phase 5', label: 'Phase 5 : Applications Mobiles Citoyen & Agent', category: 'Phases' },
    { cmd: '/phase 6', label: 'Phase 6 : Intégration & Tests de charge k6', category: 'Phases' },
    { cmd: '/phase 7', label: 'Phase 7 : Déploiement Pilote 3 Communes', category: 'Phases' },
    { cmd: '/phase 8', label: 'Phase 8 : Plan de Garantie & Maintenance 12 mois', category: 'Phases' },
    { cmd: '/module portail-national', label: 'Basculer vers le Portail National (FNCT / ANGeD)', category: 'Modules' },
    { cmd: '/module portail-municipal', label: 'Basculer vers le Portail Municipal (La Marsa)', category: 'Modules' },
    { cmd: '/module app-citoyenne', label: 'Ouvrir l’Application Mobile Citoyenne', category: 'Modules' },
    { cmd: '/module app-agent', label: 'Ouvrir l’Application Mobile Agent de Terrain', category: 'Modules' },
    { cmd: '/module gdma', label: 'Ouvrir l’Espace GDMA & Barbéchas', category: 'Modules' },
    { cmd: '/module kpi-flotte', label: 'Ouvrir le Simulateur Flotte & KPI 5 Axes', category: 'Modules' },
    { cmd: '/code', label: 'Inspecter les codes sources générés (SQL, TS, Dart)', category: 'Outils' },
    { cmd: '/test', label: 'Lancer les bancs de tests automatisés', category: 'Outils' },
    { cmd: '/plan', label: 'Afficher le planning opérationnel 9 mois', category: 'Outils' },
    { cmd: '/livrables', label: 'Lister tous les livrables contractuels', category: 'Outils' },
  ];

  const filteredCommands = quickCommands.filter(c => 
    c.cmd.toLowerCase().includes(inputVal.toLowerCase()) || 
    c.label.toLowerCase().includes(inputVal.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    execute(inputVal.trim());
  };

  const execute = (cmd: string) => {
    onClose();
    if (cmd.startsWith('/module portail-national')) onNavigateToRole('national_admin');
    else if (cmd.startsWith('/module portail-municipal')) onNavigateToRole('municipal_manager');
    else if (cmd.startsWith('/module app-citoyenne')) onNavigateToRole('citizen');
    else if (cmd.startsWith('/module app-agent')) onNavigateToRole('field_agent');
    else if (cmd.startsWith('/module gdma')) onNavigateToRole('gdma_actor');
    else if (cmd.startsWith('/module kpi-flotte')) onNavigateToRole('kpi_fleet' as any);
    else {
      onNavigateToRole('engineering_hub');
      onExecuteCommand(cmd);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start justify-center p-4 pt-20 animate-fadeIn">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden font-sans">
        
        {/* Search input bar */}
        <form onSubmit={handleSubmit} className="flex items-center gap-3 px-4 py-3.5 bg-slate-950 border-b border-slate-800">
          <Terminal className="w-5 h-5 text-emerald-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Tapez une commande (/phase 1, /module, /code, /test, /plan)..."
            className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-slate-500 font-mono"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-white rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </form>

        {/* Command list */}
        <div className="p-3 max-h-96 overflow-y-auto space-y-1 text-xs">
          {filteredCommands.length === 0 ? (
            <div className="p-6 text-center text-slate-500">
              Aucune commande correspondante. Appuyez sur Entrée pour exécuter "{inputVal}".
            </div>
          ) : (
            filteredCommands.map((item, idx) => (
              <button
                key={idx}
                onClick={() => execute(item.cmd)}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-800 text-left transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-emerald-400 px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                    {item.cmd}
                  </span>
                  <span className="text-slate-300 font-medium group-hover:text-white">
                    {item.label}
                  </span>
                </div>
                <span className="text-[10px] uppercase font-mono text-slate-500 group-hover:text-slate-400">
                  {item.category}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-slate-950/80 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between font-mono">
          <span>Commandes officielles SIIPI FNCT / ANGeD</span>
          <span>Échap pour fermer</span>
        </div>

      </div>
    </div>
  );
};
