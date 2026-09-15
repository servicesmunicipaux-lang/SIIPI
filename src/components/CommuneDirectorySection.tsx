import React, { useState } from 'react';
import { Commune, Language } from '../types/siipi';
import { CommuneEditModal } from './CommuneEditModal';
import { 
  Building2, 
  Phone, 
  Mail, 
  Search, 
  Filter, 
  Edit3, 
  ExternalLink, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  FileText, 
  MapPin, 
  Printer, 
  Download, 
  Plus, 
  Sparkles,
  LayoutGrid,
  ListFilter,
  CheckCircle,
  Truck,
  RotateCcw
} from 'lucide-react';

interface CommuneDirectorySectionProps {
  communes: Commune[];
  onUpdateCommune: (updatedCommune: Commune) => void;
  onSelectCommune: (commune: Commune) => void;
  language: Language;
}

export const CommuneDirectorySection: React.FC<CommuneDirectorySectionProps> = ({
  communes,
  onUpdateCommune,
  onSelectCommune,
  language
}) => {
  const isAr = language === 'ar';
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGovernorate, setSelectedGovernorate] = useState<string>('all');
  const [selectedPcgdStatus, setSelectedPcgdStatus] = useState<string>('all');
  const [editingCommune, setEditingCommune] = useState<Commune | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(24);

  // Extract unique governorates
  const governorates = Array.from(new Set(communes.map(c => c.gouvernorat))).sort();

  // Filtered list
  const filteredCommunes = communes.filter(commune => {
    const matchesSearch = 
      commune.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (commune.nameAr && commune.nameAr.includes(searchQuery)) ||
      (commune.phone && commune.phone.includes(searchQuery)) ||
      (commune.email && commune.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      commune.gouvernorat.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesGov = selectedGovernorate === 'all' || commune.gouvernorat === selectedGovernorate;
    
    const matchesPcgd = selectedPcgdStatus === 'all' || 
      (selectedPcgdStatus === 'valide' && commune.pcgdStatus === 'valide') ||
      (selectedPcgdStatus === 'en_cours' && commune.pcgdStatus === 'en_cours') ||
      (selectedPcgdStatus === 'non_existant' && (!commune.pcgdStatus || commune.pcgdStatus === 'non_existant')) ||
      (selectedPcgdStatus === 'a_actualiser' && commune.pcgdStatus === 'a_actualiser');

    return matchesSearch && matchesGov && matchesPcgd;
  });

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedGovernorate, selectedPcgdStatus, itemsPerPage]);

  const totalPages = Math.ceil(filteredCommunes.length / itemsPerPage);
  const paginatedCommunes = itemsPerPage === 0 ? filteredCommunes : filteredCommunes.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Calculate PCGD statistics
  const totalCommunes = communes.length;
  const pcgdValides = communes.filter(c => c.pcgdStatus === 'valide').length;
  const pcgdEnCours = communes.filter(c => c.pcgdStatus === 'en_cours').length;
  const pcgdSans = communes.filter(c => !c.pcgdStatus || c.pcgdStatus === 'non_existant').length;
  const pcgdTauxValidation = Math.round((pcgdValides / totalCommunes) * 100);

  const handleSaveCommune = (updated: Commune) => {
    onUpdateCommune(updated);
    setToastMessage(`La fiche de la commune de "${updated.name}" a été mise à jour avec succès.`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const getPcgdBadge = (status?: string, date?: string) => {
    switch (status) {
      case 'valide':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>PCGD Validé {date ? `(${date.slice(0, 4)})` : ''}</span>
          </span>
        );
      case 'en_cours':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-950 text-amber-300 border border-amber-800">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>PCGD En cours</span>
          </span>
        );
      case 'a_actualiser':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-purple-950 text-purple-300 border border-purple-800">
            <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
            <span>PCGD À actualiser</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <AlertTriangle className="w-3.5 h-3.5 text-slate-500" />
            <span>Sans PCGD</span>
          </span>
        );
    }
  };

  return (
    <section id="section-annuaire-communes" className="space-y-6 pt-6 border-t-2 border-slate-800/80">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-950 border border-emerald-700 text-emerald-200 text-xs font-medium flex items-center justify-between shadow-xl animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-emerald-400 hover:text-white font-bold text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Title & Section Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/95 to-teal-950/40 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-mono text-[11px] font-bold border border-emerald-500/30">
                RUBRIQUE 2 • BDD OFFICIELLE AG FNCT 2023
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {totalCommunes} Communes indexées
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Building2 className="w-6 h-6 text-emerald-400" />
              <span>
                {isAr ? 'دليل البلديات التونسية، جهات الاتصال ومخططات التصرف في النفايات (PCGD)' : 'Annuaire Officiel des Communes, Contacts & Plans PCGD'}
              </span>
            </h2>
            <p className="text-xs md:text-sm text-slate-300 max-w-3xl mt-1">
              {isAr
                ? 'قائمة شاملة للبلديات مع أرقام الهاتف القار والفاكس والبريد الرسمي، وحالة المخطط البلدي للتصرف في النفايات (PCGD). اضغط على أي بلدية للانتقال مباشرة لبوابتها البلدية الخاصة.'
                : 'Consultez la liste officielle des communes tunisiennes, leurs coordonnées directes (téléphone, fax, email) et l\'état d\'avancement de leur Plan Communal de Gestion des Déchets (PCGD). Cliquez sur une commune pour accéder directement à son portail municipal dédié.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  viewMode === 'cards' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
                title="Vue Fiches"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">Fiches</span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  viewMode === 'table' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
                title="Vue Tableau"
              >
                <ListFilter className="w-4 h-4" />
                <span className="hidden sm:inline">Tableau</span>
              </button>
            </div>
          </div>
        </div>

        {/* 4 Mini Summary Metric Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[11px] text-slate-400 block">Total Communes Indexées</span>
            <span className="text-lg font-black text-white font-mono">{totalCommunes}</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[11px] text-emerald-400 block flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              PCGD Validés (ANGeD)
            </span>
            <span className="text-lg font-black text-emerald-300 font-mono">
              {pcgdValides} <span className="text-xs text-slate-400 font-normal">({pcgdTauxValidation}%)</span>
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[11px] text-amber-400 block flex items-center gap-1">
              <Clock className="w-3 h-3" />
              PCGD En Élaboration
            </span>
            <span className="text-lg font-black text-amber-300 font-mono">{pcgdEnCours}</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[11px] text-slate-400 block flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-slate-500" />
              Sans PCGD Actif
            </span>
            <span className="text-lg font-black text-slate-300 font-mono">{pcgdSans}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? 'ابحث عن بلدية، هاتف، بريد أو ولاية...' : 'Rechercher par nom (FR/AR), téléphone, fax, email ou gouvernorat...'}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter by Governorate */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span>Gouvernorat :</span>
          </div>
          <select
            value={selectedGovernorate}
            onChange={(e) => setSelectedGovernorate(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Tous ({totalCommunes})</option>
            {governorates.map(gov => (
              <option key={gov} value={gov}>
                {gov} ({communes.filter(c => c.gouvernorat === gov).length})
              </option>
            ))}
          </select>

          {/* Filter by PCGD Status */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0 ml-1">
            <FileText className="w-3.5 h-3.5 text-teal-400" />
            <span>PCGD :</span>
          </div>
          <select
            value={selectedPcgdStatus}
            onChange={(e) => setSelectedPcgdStatus(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Tous les statuts</option>
            <option value="valide">✅ Validés ({pcgdValides})</option>
            <option value="en_cours">⏳ En cours ({pcgdEnCours})</option>
            <option value="a_actualiser">🔄 À actualiser</option>
            <option value="non_existant">❌ Non existants ({pcgdSans})</option>
          </select>
        </div>

      </div>

      {/* Results Count Banner */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-2">
        <span>
          Affichage de <strong className="text-white font-mono">{filteredCommunes.length}</strong> commune(s) trouvée(s)
        </span>
        {(searchQuery || selectedGovernorate !== 'all' || selectedPcgdStatus !== 'all') && (
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedGovernorate('all');
              setSelectedPcgdStatus('all');
            }}
            className="text-emerald-400 hover:underline text-xs flex items-center gap-1"
          >
            <span>Réinitialiser les filtres</span>
          </button>
        )}
      </div>

      {/* GRID VIEW (CARDS) */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {paginatedCommunes.map((commune) => (
            <div
              key={commune.id}
              className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 shadow-xl transition-all flex flex-col justify-between space-y-4 group"
            >
              {/* Card Top */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    {commune.logoUrl ? (
                      <img
                        src={commune.logoUrl}
                        alt={`Logo ${commune.name}`}
                        className="w-11 h-11 object-contain rounded-xl bg-slate-950 p-1 border border-slate-750 shadow-md shrink-0 mt-0.5"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 shrink-0 mt-0.5">
                        <Building2 className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-teal-300 border border-slate-700">
                          {commune.gouvernorat}
                        </span>
                        {commune.isPilot && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                            Pilote SIIPI
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors mt-1">
                        {commune.name}
                      </h3>
                      <p className="text-xs text-slate-400 font-arabic" dir="rtl">
                        {commune.nameAr}
                      </p>
                    </div>
                  </div>

                  {getPcgdBadge(commune.pcgdStatus, commune.pcgdValidationDate)}
                </div>

                {/* Contacts Box from PDF */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5 font-mono">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Fixe : {commune.phone || 'Non renseigné'}</span>
                  </div>
                  {commune.fax && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <FileText className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      <span>Fax : {commune.fax}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-slate-300 truncate">
                    <Mail className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="truncate text-[11px] font-sans text-cyan-300" title={commune.email}>
                      {commune.email || 'Email en cours de création'}
                    </span>
                  </div>
                </div>

                {/* Waste Management Attributes */}
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                    <span className="text-slate-400 block text-[10px]">Tonnage Quotidien</span>
                    <span className="font-bold text-white font-mono">{commune.wasteTonsPerDay} t/j</span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                    <span className="text-slate-400 block text-[10px]">Taux Collecte (TC)</span>
                    <span className="font-bold text-emerald-400 font-mono">{commune.collectionRate}%</span>
                  </div>
                </div>

                {/* Landfill info */}
                {commune.landfillSite && (
                  <div className="text-[11px] text-slate-400 flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                    <span className="line-clamp-1">{commune.landfillSite}</span>
                  </div>
                )}
              </div>

              {/* Card Footer Actions */}
              <div className="pt-3 border-t border-slate-800 flex items-center gap-2">
                {/* Direct Access to Municipal Portal */}
                <button
                  id={`btn-portal-commune-${commune.id}`}
                  onClick={() => onSelectCommune(commune)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all hover:scale-[1.02]"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Ouvrir Portail Municipal</span>
                </button>

                {/* Edit Button */}
                <button
                  id={`btn-edit-commune-${commune.id}`}
                  onClick={() => setEditingCommune(commune)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors flex items-center gap-1.5 border border-slate-700"
                  title="Modifier les contacts et informations déchets / PCGD"
                >
                  <Edit3 className="w-3.5 h-3.5 text-teal-400" />
                  <span className="hidden sm:inline">Modifier</span>
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === 'table' && (
        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Commune (FR / AR)</th>
                  <th className="py-3 px-4">Gouvernorat</th>
                  <th className="py-3 px-4">Numéro Fixe</th>
                  <th className="py-3 px-4">Mail Générique</th>
                  <th className="py-3 px-4">Statut PCGD</th>
                  <th className="py-3 px-4">Tonnage/j</th>
                  <th className="py-3 px-4">Mode Gestion</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {paginatedCommunes.map((commune) => (
                  <tr key={commune.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-bold text-white">
                      <div className="flex items-center gap-2.5">
                        {commune.logoUrl ? (
                          <img
                            src={commune.logoUrl}
                            alt={`Logo ${commune.name}`}
                            className="w-7 h-7 object-contain rounded-lg bg-slate-950 p-0.5 border border-slate-750 shadow-sm shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="p-1.5 rounded-lg bg-emerald-950/80 border border-emerald-800/60 text-emerald-400 shrink-0">
                            <Building2 className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <span>{commune.name}</span>
                          <span className="block text-[11px] text-slate-400 font-normal font-arabic">
                            {commune.nameAr}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-teal-300">
                        {commune.gouvernorat}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-200">
                      {commune.phone || '—'}
                    </td>
                    <td className="py-3 px-4 text-cyan-300 text-[11px]">
                      {commune.email || '—'}
                    </td>
                    <td className="py-3 px-4">
                      {getPcgdBadge(commune.pcgdStatus, commune.pcgdValidationDate)}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-white">
                      {commune.wasteTonsPerDay} t/j
                    </td>
                    <td className="py-3 px-4 text-slate-400 capitalize">
                      {commune.wasteManagementMode ? commune.wasteManagementMode.replace('_', ' ') : 'Régie directe'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onSelectCommune(commune)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] transition-colors"
                        >
                          Portail
                        </button>
                        <button
                          onClick={() => setEditingCommune(commune)}
                          className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                          title="Modifier la fiche"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-teal-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {filteredCommunes.length > 0 && (
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3 text-slate-400">
            <span>
              Page <strong className="text-white font-mono">{currentPage}</strong> sur{' '}
              <strong className="text-white font-mono">{totalPages || 1}</strong> ({filteredCommunes.length} communes au total)
            </span>
            <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
              <span className="text-[11px]">Afficher par page:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs"
              >
                <option value={12}>12</option>
                <option value={24}>24</option>
                <option value={48}>48</option>
                <option value={96}>96</option>
                <option value={0}>Tous (350)</option>
              </select>
            </div>
          </div>

          {itemsPerPage > 0 && totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-xs font-mono"
              >
                « Première
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-xs font-mono"
              >
                ‹ Précédent
              </button>

              <div className="flex items-center gap-1 px-1">
                {(() => {
                  let start = Math.max(1, currentPage - 2);
                  let end = Math.min(totalPages, start + 4);
                  if (end - start < 4) {
                    start = Math.max(1, end - 4);
                  }
                  const pages: number[] = [];
                  for (let p = start; p <= end; p++) {
                    pages.push(p);
                  }
                  return pages.map((pageNum) => (
                    <button
                      key={`page-${pageNum}`}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition-colors ${
                        currentPage === pageNum
                          ? 'bg-emerald-600 text-white shadow-md'
                          : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ));
                })()}
              </div>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-xs font-mono"
              >
                Suivant ›
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-xs font-mono"
              >
                Dernière »
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {filteredCommunes.length === 0 && (
        <div className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <Building2 className="w-12 h-12 text-slate-600 mx-auto" />
          <h4 className="text-base font-bold text-white">Aucune commune ne correspond aux critères</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Vérifiez l'orthographe du nom ou réinitialisez les filtres par gouvernorat et statut PCGD.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedGovernorate('all');
              setSelectedPcgdStatus('all');
            }}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
          >
            Réinitialiser la recherche
          </button>
        </div>
      )}

      {/* Edit Modal Component */}
      {editingCommune && (
        <CommuneEditModal
          commune={editingCommune}
          isOpen={!!editingCommune}
          onClose={() => setEditingCommune(null)}
          onSave={handleSaveCommune}
          language={language}
        />
      )}

    </section>
  );
};
