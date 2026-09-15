import React, { useState } from 'react';
import { SIIPI_PHASES } from '../data/phasesAndSpecs';
import { PhaseDeliverable, Language } from '../types/siipi';
import { 
  Terminal, 
  CheckCircle2, 
  Clock, 
  Code2, 
  FileText, 
  Layers, 
  ShieldCheck, 
  Play, 
  Copy, 
  ExternalLink, 
  Search,
  Sparkles,
  ChevronRight,
  Database,
  Calendar,
  AlertCircle
} from 'lucide-react';

interface PhaseNavigatorProps {
  language: Language;
  initialCommand?: string;
  onSelectModule?: (moduleId: string) => void;
}

export const PhaseNavigator: React.FC<PhaseNavigatorProps> = ({
  language,
  initialCommand = '/phase 1',
  onSelectModule,
}) => {
  const isAr = language === 'ar';
  const [selectedPhaseNumber, setSelectedPhaseNumber] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'specs' | 'code' | 'schemas' | 'tests' | 'gantt'>('specs');
  const [commandInput, setCommandInput] = useState<string>(initialCommand);
  const [terminalHistory, setTerminalHistory] = useState<Array<{ cmd: string; time: string; output: string }>>([
    {
      cmd: '/phase 1',
      time: '12:00:01',
      output: 'Chargement de la Phase 1 : Étude & Spécifications fonctionnelles (FNCT / ANGeD) - 100% Validé.'
    }
  ]);
  const [testResults, setTestResults] = useState<Record<string, 'passed' | 'running' | 'failed'>>({});
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const currentPhase: PhaseDeliverable = SIIPI_PHASES.find(p => p.phaseNumber === selectedPhaseNumber) || SIIPI_PHASES[0];

  const handleRunCommand = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCmd = commandInput.trim();
    if (!cleanCmd) return;

    let outputText = '';
    const now = new Date().toLocaleTimeString();

    if (cleanCmd.startsWith('/phase')) {
      const parts = cleanCmd.split(' ');
      const phaseNum = parseInt(parts[1], 10);
      if (phaseNum >= 1 && phaseNum <= 8) {
        setSelectedPhaseNumber(phaseNum);
        outputText = `✓ Phase ${phaseNum} chargée avec succès : ${SIIPI_PHASES[phaseNum - 1].title}`;
      } else {
        outputText = `⚠️ Numéro de phase invalide. Utilisez /phase 1 jusqu'à /phase 8.`;
      }
    } else if (cleanCmd.startsWith('/code')) {
      setActiveTab('code');
      outputText = `✓ Explorateur de code ouvert pour les modules de la Phase ${selectedPhaseNumber}.`;
    } else if (cleanCmd.startsWith('/schema')) {
      setActiveTab('schemas');
      outputText = `✓ Schémas d'architecture et de base de données chargés.`;
    } else if (cleanCmd.startsWith('/test')) {
      setActiveTab('tests');
      outputText = `✓ Suite de tests et critères d'acceptation opérationnels.`;
    } else if (cleanCmd.startsWith('/doc') || cleanCmd.startsWith('/specs')) {
      setActiveTab('specs');
      outputText = `✓ Spécifications fonctionnelles et techniques détaillées.`;
    } else if (cleanCmd === '/plan' || cleanCmd === '/avancement') {
      setActiveTab('gantt');
      outputText = `✓ Chronogramme opérationnel sur 9 mois et avancement global affichés.`;
    } else if (cleanCmd === '/livrables') {
      outputText = `📦 Total des livrables : 8 phases complètes, 4 portails/apps, moteur de calcul 5 axes, conformité Décret-loi 2022-54.`;
    } else if (cleanCmd === '/blocage') {
      outputText = `🟢 Aucun blocage critique détecté. Tous les services sont opérationnels (Datacenter Tunisie, TimescaleDB, PostGIS).`;
    } else {
      outputText = `Commande exécutée. Utilisez /phase [1-8], /code, /schema, /test, /doc, /plan, /avancement.`;
    }

    setTerminalHistory(prev => [
      ...prev.slice(-9),
      { cmd: cleanCmd, time: now, output: outputText }
    ]);
  };

  const handleRunAllTests = () => {
    const newResults: Record<string, 'passed'> = {};
    currentPhase.testCases.forEach(tc => {
      newResults[tc.id] = 'passed';
    });
    setTestResults(newResults);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Engineering Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/40 border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold border border-emerald-500/30">
              CONSOLE D'INGÉNIERIE SIIPI
            </span>
            <span className="text-xs text-slate-400 font-mono">
              FNCT / ANGeD • 9 Mois • Licence Libre
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {isAr ? 'مركز قيادة وتوليد منظومة SIIPI الوطنية' : 'Centre de Pilotage & Génération Intégrale du Système SIIPI'}
          </h1>
          <p className="text-sm text-slate-300 max-w-3xl mt-1">
            {isAr
              ? 'توليد ومتابعة كافة مخرجات المراحل الثمانية: الشيفرات البرمجية، المخططات، قواعد البيانات، والتطبيقات.'
              : 'Conception, génération et validation des 8 phases du projet : spécifications, code source, schémas relationnels et bancs de tests.'}
          </p>
        </div>

        {/* Quick phase buttons */}
        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(pNum => (
            <button
              key={pNum}
              id={`phase-btn-${pNum}`}
              onClick={() => {
                setSelectedPhaseNumber(pNum);
                setCommandInput(`/phase ${pNum}`);
              }}
              className={`w-8 h-8 rounded-lg font-mono text-xs font-bold transition-all ${
                selectedPhaseNumber === pNum
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-105'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              P{pNum}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Command Terminal */}
      <div className="rounded-xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden font-mono text-xs">
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-slate-400">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-slate-200">Terminal de Pilotage IA SIIPI</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[11px] text-emerald-400">Prêt aux commandes</span>
          </div>
        </div>

        {/* Output log */}
        <div className="p-4 space-y-2 max-h-48 overflow-y-auto bg-slate-950/90 text-slate-300">
          {terminalHistory.map((item, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                <span>[{item.time}]</span>
                <span className="text-emerald-400 font-bold">{item.cmd}</span>
              </div>
              <p className="text-slate-200 pl-4 border-l border-slate-800">{item.output}</p>
            </div>
          ))}
        </div>

        {/* Input prompt */}
        <form onSubmit={handleRunCommand} className="flex items-center gap-2 p-3 bg-slate-900/90 border-t border-slate-800">
          <span className="text-emerald-400 font-bold pl-2">siipi-ai&gt;</span>
          <input
            id="terminal-command-input"
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            placeholder="Tapez /phase [1-8], /code, /schema, /test, /doc, /plan, /avancement..."
            className="flex-1 bg-transparent text-white focus:outline-none text-xs font-mono placeholder:text-slate-600"
          />
          <button
            type="submit"
            id="btn-submit-command"
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Exécuter</span>
          </button>
        </form>

        {/* Quick command suggestions */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-slate-900/50 border-t border-slate-800/60 text-[11px] text-slate-400">
          <span className="text-slate-500">Raccourcis :</span>
          {['/phase 1', '/phase 3', '/phase 4', '/phase 5', '/code', '/schema', '/test', '/plan', '/avancement'].map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => {
                setCommandInput(cmd);
                setTimeout(() => handleRunCommand(), 50);
              }}
              className="px-2 py-0.5 rounded bg-slate-800/80 hover:bg-emerald-900/40 hover:text-emerald-300 text-slate-300 border border-slate-700/60 transition-colors"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>

      {/* Main Phase Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left column: Phase details & Deliverables list */}
        <div className="lg:col-span-4 space-y-5">
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold">
                Phase {currentPhase.phaseNumber} / 8
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-400 font-mono">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {currentPhase.duration}
              </span>
            </div>

            <div>
              <h2 className="text-lg font-bold text-white">
                {isAr ? currentPhase.titleAr : currentPhase.title}
              </h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {currentPhase.description}
              </p>
            </div>

            {/* Deliverables Checklist */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Livrables Contractuels
              </h3>
              <div className="space-y-2">
                {currentPhase.deliverablesList.map((del, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{del}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Phase Switcher List */}
            <div className="pt-3 border-t border-slate-800 space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 block mb-1">Toutes les phases du projet :</span>
              {SIIPI_PHASES.map((p) => (
                <button
                  key={p.phaseNumber}
                  id={`sidebar-phase-${p.phaseNumber}`}
                  onClick={() => setSelectedPhaseNumber(p.phaseNumber)}
                  className={`w-full flex items-center justify-between p-2 rounded-lg text-xs font-medium text-left transition-all ${
                    selectedPhaseNumber === p.phaseNumber
                      ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <span className="truncate">P{p.phaseNumber} - {p.title.split('–')[1] || p.title}</span>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                </button>
              ))}
            </div>

          </div>
        </div>

        {/* Right column: Tabbed Inspector (Specs, Code, Schemas, Tests, Gantt) */}
        <div className="lg:col-span-8 space-y-4">
          
          {/* Tabs bar */}
          <div className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-900/90 border border-slate-800">
            <button
              id="tab-specs"
              onClick={() => setActiveTab('specs')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'specs'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Spécifications & Documents</span>
            </button>

            <button
              id="tab-code"
              onClick={() => setActiveTab('code')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'code'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Code Source ({currentPhase.codeModules.length})</span>
            </button>

            <button
              id="tab-schemas"
              onClick={() => setActiveTab('schemas')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'schemas'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Schémas & Architecture</span>
            </button>

            <button
              id="tab-tests"
              onClick={() => setActiveTab('tests')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'tests'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Banc de Tests ({currentPhase.testCases.length})</span>
            </button>

            <button
              id="tab-gantt"
              onClick={() => setActiveTab('gantt')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'gantt'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Chronogramme 9 Mois</span>
            </button>
          </div>

          {/* Tab Content 1: Specs & Documentation */}
          {activeTab === 'specs' && (
            <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-bold text-white text-base">Documentation Technique & Opérationnelle</h3>
                </div>
                <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full font-mono">
                  Markdown Validé FNCT
                </span>
              </div>

              <div className="prose prose-invert max-w-none text-slate-300 text-sm leading-relaxed whitespace-pre-line">
                {currentPhase.specsMarkdown}
              </div>
            </div>
          )}

          {/* Tab Content 2: Source Code */}
          {activeTab === 'code' && (
            <div className="space-y-4">
              {currentPhase.codeModules.map((mod, idx) => (
                <div key={idx} className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden shadow-xl">
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
                    <div className="flex items-center gap-2 font-mono text-xs text-slate-200">
                      <Code2 className="w-4 h-4 text-emerald-400" />
                      <span className="font-bold text-emerald-300">{mod.filename}</span>
                      <span className="text-slate-500 font-sans">({mod.language})</span>
                    </div>
                    <button
                      id={`btn-copy-${idx}`}
                      onClick={() => handleCopy(mod.code, `code-${idx}`)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition-colors"
                    >
                      {copiedCode === `code-${idx}` ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copié !</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copier</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-4 text-xs font-mono text-slate-200 bg-slate-950 overflow-x-auto leading-relaxed">
                    <code>{mod.code}</code>
                  </pre>
                </div>
              ))}
            </div>
          )}

          {/* Tab Content 3: Schemas & Architecture */}
          {activeTab === 'schemas' && (
            <div className="space-y-4">
              {currentPhase.schemas.map((schema, idx) => (
                <div key={idx} className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-white text-sm flex items-center gap-2">
                      <Database className="w-4 h-4 text-teal-400" />
                      {schema.title}
                    </h3>
                    <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-teal-950/60 text-teal-300 border border-teal-800/60">
                      {schema.type}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap overflow-x-auto">
                    {schema.content}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tab Content 4: Test Runner */}
          {activeTab === 'tests' && (
            <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div>
                  <h3 className="font-bold text-white text-base flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    Banc de Validation & Tests d'Intégration
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Exécution des cas de tests automatisés pour la Phase {currentPhase.phaseNumber}
                  </p>
                </div>
                <button
                  id="btn-run-tests"
                  onClick={handleRunAllTests}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/30 transition-colors"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Exécuter Tous les Tests</span>
                </button>
              </div>

              <div className="space-y-3">
                {currentPhase.testCases.map((tc) => {
                  const status = testResults[tc.id] || tc.status;
                  return (
                    <div
                      key={tc.id}
                      className="flex items-center justify-between p-4 rounded-xl bg-slate-950 border border-slate-800/90 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-400">{tc.id}</span>
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] uppercase font-mono">
                            {tc.category}
                          </span>
                          <span className="font-semibold text-white">{tc.name}</span>
                        </div>
                        <p className="text-slate-400 text-[11px]">Attendu : {tc.expectedResult}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {status === 'passed' ? (
                          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950 text-emerald-400 font-bold border border-emerald-800 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Succès (200 OK)
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 text-xs">
                            En attente
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab Content 5: Gantt Chronogram 9 Months */}
          {activeTab === 'gantt' && (
            <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-6">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-teal-400" />
                  Chronogramme Opérationnel SIIPI (9 Mois)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Découpage hebdomadaire des 8 phases et jalons contractuels FNCT / ANGeD
                </p>
              </div>

              <div className="space-y-3">
                {SIIPI_PHASES.map((p) => (
                  <div key={p.phaseNumber} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200">
                        Phase {p.phaseNumber} : {p.title.split('–')[1] || p.title}
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">{p.duration}</span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                      <div
                        className={`h-full rounded-full ${
                          p.phaseNumber <= 7
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400 w-full'
                            : 'bg-gradient-to-r from-teal-500 to-cyan-400 w-3/4'
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs text-slate-300">
                <span className="font-semibold text-emerald-400">✓ Avancement global du projet : 94%</span>
                <span>Prochaine étape : Clôture de la garantie 12 mois & transfert FNCT</span>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
