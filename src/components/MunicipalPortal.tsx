import React, { useState, useEffect } from 'react';
import { MOCK_TRUCKS, MOCK_CONTAINERS, MOCK_WEIGHBRIDGE } from '../data/mockData';
import { Commune, Truck, ContainerSensor, TicketReport, Language } from '../types/siipi';
import { GisInteractiveMap } from './GisInteractiveMap';
import { DecoupageCommunalMap } from './DecoupageCommunalMap';
import { useTicketsWorkflow } from '../hooks/useTicketsWorkflow';
import { useAuth } from '../contexts/AuthContext';
import {
  Truck as TruckIcon,
  MapPin,
  Trash2,
  AlertCircle,
  FileCheck,
  QrCode,
  CheckCircle2,
  XCircle,
  ArrowRightCircle,
  Clock,
  Radio,
  Navigation,
  Plus,
  Send,
  Eye,
  Filter,
  Layers,
  Sparkles,
  Compass,
  Upload,
  Phone,
  Mail,
  ShieldCheck,
  Building2,
  Loader2,
  MapPinned
} from 'lucide-react';

interface MunicipalPortalProps {
  language: Language;
  selectedCommune: Commune;
  /** Annuaire complet, chargé depuis l'API réelle — utilisé uniquement pour le sélecteur rapide. */
  communes: Commune[];
}

export const MunicipalPortal: React.FC<MunicipalPortalProps> = ({
  language,
  selectedCommune,
  communes,
}) => {
  const isAr = language === 'ar';
  const { user } = useAuth();
  // Le dessin/édition du découpage communal est réservé à l'Admin Commune et au Super
  // Admin FNCT (CDC §5) ; le Gestionnaire Prestataire consulte les secteurs en lecture seule.
  const canEditZones = user?.role === 'admin_commune' || user?.role === 'super_admin_fnct';
  const [activeCommune, setActiveCommune] = useState<Commune>(selectedCommune);

  useEffect(() => {
    if (selectedCommune) {
      setActiveCommune(selectedCommune);
    }
  }, [selectedCommune]);
  const [trucks, setTrucks] = useState<Truck[]>(MOCK_TRUCKS);
  const [containers, setContainers] = useState<ContainerSensor[]>(MOCK_CONTAINERS);
  // Réclamations citoyennes : chargées depuis l'API réelle et traitées via le workflow
  // CDC (accepter / refuser / transférer / traiter) — remplace l'ancien état local
  // basé sur MOCK_TICKETS (voir hooks/useTicketsWorkflow.ts).
  const {
    tickets,
    prestataires,
    loading: ticketsLoading,
    error: ticketsError,
    actionError: ticketActionError,
    accept: acceptTicket,
    refuse: refuseTicket,
    assign: assignTicket,
    treat: treatTicket,
  } = useTicketsWorkflow(activeCommune?.id);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(MOCK_TRUCKS[0]);
  const [activeTab, setActiveTab] = useState<'carte_gis' | 'bons_collecte' | 'reclamations' | 'pesees_reconciliation' | 'decoupage'>('carte_gis');
  const [showNewBonModal, setShowNewBonModal] = useState(false);
  const [newBonZone, setNewBonZone] = useState('Zone Marsa Plage & Saf-Saf');
  const [refusingTicketId, setRefusingTicketId] = useState<string | null>(null);
  const [refuseReasonDraft, setRefuseReasonDraft] = useState('');
  const [assignPrestataireDraft, setAssignPrestataireDraft] = useState('');
  const [ticketActionBusy, setTicketActionBusy] = useState(false);

  const selectedTicket: TicketReport | null =
    tickets.find((t) => t.id === selectedTicketId) ?? (selectedTicketId ? null : tickets[0] ?? null);

  // Simulation: live GPS jitter for active trucks
  useEffect(() => {
    const interval = setInterval(() => {
      setTrucks(prev => prev.map(t => {
        if (t.status === 'en_tournee') {
          const latJitter = (Math.random() - 0.5) * 0.0008;
          const lngJitter = (Math.random() - 0.5) * 0.0008;
          return {
            ...t,
            coordinates: [t.coordinates[0] + latJitter, t.coordinates[1] + lngJitter] as [number, number],
            currentSpeedKmH: Math.floor(15 + Math.random() * 15),
            fuelLevelPercent: Math.max(10, t.fuelLevelPercent - 0.1),
            lastUpdate: 'À l’instant'
          };
        }
        return t;
      }));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Actions du workflow réclamations (CDC) — voir hooks/useTicketsWorkflow.ts.
  const handleAcceptTicket = async (ticketId: string) => {
    setTicketActionBusy(true);
    await acceptTicket(ticketId);
    setTicketActionBusy(false);
  };

  const handleOpenRefuse = (ticketId: string) => {
    setRefusingTicketId(ticketId);
    setRefuseReasonDraft('');
  };

  const handleConfirmRefuse = async () => {
    if (!refusingTicketId || refuseReasonDraft.trim().length < 3) return;
    setTicketActionBusy(true);
    const ok = await refuseTicket(refusingTicketId, refuseReasonDraft.trim());
    setTicketActionBusy(false);
    if (ok) setRefusingTicketId(null);
  };

  const handleAssignTicket = async (ticketId: string) => {
    if (!assignPrestataireDraft) return;
    setTicketActionBusy(true);
    await assignTicket(ticketId, assignPrestataireDraft);
    setTicketActionBusy(false);
    setAssignPrestataireDraft('');
  };

  const handleTreatTicket = async (ticketId: string, status: 'en_cours' | 'resolu') => {
    setTicketActionBusy(true);
    await treatTicket(
      ticketId,
      status,
      status === 'resolu' ? 'https://images.unsplash.com/photo-1516992654410-9309d4587e94?w=600&auto=format&fit=crop&q=60' : undefined
    );
    setTicketActionBusy(false);
  };

  const handleCreateBon = (e: React.FormEvent) => {
    e.preventDefault();
    setShowNewBonModal(false);
    alert(`✓ Bon de collecte émis avec succès pour la ${newBonZone}. QR Code de tournée généré et transmis à l'application du chauffeur.`);
  };

  return (
    <div className="space-y-6">
      
      {/* Municipal Portal Header & Commune Switcher */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/40 border border-slate-800 shadow-xl">
        <div className="flex items-start gap-4">
          {activeCommune.logoUrl ? (
            <img
              src={activeCommune.logoUrl}
              alt={`Logo ${activeCommune.name}`}
              className="w-14 h-14 object-contain rounded-2xl bg-slate-950 p-1.5 border border-slate-750 shadow-lg shrink-0 mt-1"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0 mt-1">
              <Building2 className="w-7 h-7" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold border border-emerald-500/30">
                PORTAIL MUNICIPAL D'EXPLOITATION
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Commune de {isAr ? activeCommune.nameAr : activeCommune.name} • {activeCommune.gouvernorat}
              </span>
              {activeCommune.pcgdStatus === 'valide' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  PCGD Validé
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {isAr ? `بلدية ${activeCommune.nameAr} - الإدارة والتحكم في النظافة` : `Gestion Opérationnelle & Télématique - ${activeCommune.name}`}
            </h1>
            <div className="flex items-center gap-4 text-xs text-slate-300 mt-2 flex-wrap font-mono">
              {activeCommune.phone && (
                <span className="flex items-center gap-1 text-emerald-400">
                  <Phone className="w-3 h-3" />
                  Fixe: {activeCommune.phone}
                </span>
              )}
              {activeCommune.email && (
                <span className="flex items-center gap-1 text-cyan-300 font-sans">
                  <Mail className="w-3 h-3" />
                  {activeCommune.email}
                </span>
              )}
              {activeCommune.landfillSite && (
                <span className="flex items-center gap-1 text-slate-400 font-sans">
                  <MapPin className="w-3 h-3 text-slate-500" />
                  {activeCommune.landfillSite}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Commune quick switcher */}
        <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800 shrink-0">
          <span className="text-xs text-slate-400 font-medium pl-2">Commune :</span>
          <select
            value={activeCommune.id}
            onChange={(e) => {
              const found = communes.find(c => c.id === e.target.value);
              if (found) setActiveCommune(found);
            }}
            className="bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-emerald-500"
          >
            {communes.map(c => (
              <option key={c.id} value={c.id}>
                {isAr ? c.nameAr : c.name} ({c.gouvernorat})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-900/90 border border-slate-800 overflow-x-auto">
        <button
          id="tab-gis-map"
          onClick={() => setActiveTab('carte_gis')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'carte_gis'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Supervision Télématique GIS & Bacs IoT</span>
        </button>

        <button
          id="tab-bons-collecte"
          onClick={() => setActiveTab('bons_collecte')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'bons_collecte'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <FileCheck className="w-3.5 h-3.5" />
          <span>Bons de Collecte & QR Tournées</span>
        </button>

        <button
          id="tab-reclamations"
          onClick={() => setActiveTab('reclamations')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'reclamations'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Gestion des Réclamations ({tickets.filter(t => t.status !== 'resolu').length})</span>
        </button>

        <button
          id="tab-pesees"
          onClick={() => setActiveTab('pesees_reconciliation')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'pesees_reconciliation'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <QrCode className="w-3.5 h-3.5" />
          <span>Réconciliation Pesées ANGeD</span>
        </button>

        <button
          id="tab-decoupage"
          onClick={() => setActiveTab('decoupage')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'decoupage'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <MapPinned className="w-3.5 h-3.5" />
          <span>Découpage Communal</span>
        </button>
      </div>

      {/* Tab 1: GIS Map & Live Fleet Telemetry */}
      {activeTab === 'carte_gis' && (
        <div className="space-y-6">
          {/* Rich Real GIS Map with Google My Maps Style Layer Engine */}
          <GisInteractiveMap
            commune={activeCommune}
            trucks={trucks}
            containers={containers}
            tickets={tickets}
            isAr={isAr}
          />

          {/* Detailed Fleet Telemetry & Inspector Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Selected Truck Inspector */}
            <div className="lg:col-span-6 space-y-4">
              {selectedTruck ? (
                <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                        {selectedTruck.type.replace('_', ' ')}
                      </span>
                      <h3 className="font-bold text-white text-base mt-1">{selectedTruck.registration}</h3>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">{selectedTruck.lastUpdate}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 text-[11px] block">Chauffeur</span>
                      <span className="font-bold text-white mt-0.5 block">{selectedTruck.driverName}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 text-[11px] block">Vitesse Actuelle</span>
                      <span className="font-bold text-emerald-400 mt-0.5 block font-mono">{selectedTruck.currentSpeedKmH} km/h</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 text-[11px] block">Carburant Réservoir</span>
                      <span className="font-bold text-teal-400 mt-0.5 block font-mono">{selectedTruck.fuelLevelPercent}%</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 text-[11px] block">Poids Embarqué</span>
                      <span className="font-bold text-cyan-400 mt-0.5 block font-mono">{selectedTruck.currentWeightTons}t / {selectedTruck.maxWeightTons}t</span>
                    </div>
                  </div>

                  {/* Tour Progress */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-800 text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Progression du circuit :</span>
                      <span className="font-bold font-mono text-emerald-400">
                        {selectedTruck.completedStops} / {selectedTruck.totalStops} arrêts
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all"
                        style={{ width: `${(selectedTruck.completedStops / selectedTruck.totalStops) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
                    <span className="text-slate-500 text-[11px] block">Zone d'Affectation :</span>
                    <span className="font-semibold text-slate-200">{selectedTruck.assignedZone}</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => alert(`Envoi message radio au camion ${selectedTruck.registration} (${selectedTruck.driverName})`)}
                      className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Message Radio</span>
                    </button>
                    <button
                      onClick={() => alert(`Circuit du camion ${selectedTruck.registration} réoptimisé pour inclure 2 bacs pleins prioritaires.`)}
                      className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/30 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Réorienter Circuit</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Right Column: Fleet List */}
            <div className="lg:col-span-6 space-y-4">
              <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white text-xs uppercase tracking-wider text-slate-400">
                    Flotte Municipale ({trucks.length} Véhicules en temps réel)
                  </h4>
                  <span className="text-xs font-mono text-emerald-400">
                    {trucks.filter(t => t.status === 'en_tournee').length} en tournée active
                  </span>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {trucks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTruck(t)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-xs text-left transition-all ${
                        selectedTruck?.id === t.id
                          ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                          : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800/80'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white text-sm">{t.registration}</span>
                          <span className="text-[10px] text-slate-400">({t.type.replace('_', ' ')})</span>
                        </div>
                        <span className="text-[11px] text-slate-400 block">{t.driverName} • {t.assignedZone}</span>
                      </div>
                      <div className="text-right space-y-1">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                          t.status === 'en_tournee'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {t.status.replace('_', ' ')}
                        </span>
                        <span className="block text-[10px] font-mono text-slate-400">{t.currentWeightTons}t</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Tab 2: Bons de Collecte & QR Generation */}
      {activeTab === 'bons_collecte' && (
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-emerald-400" />
                Émission des Bons de Collecte & Traçabilité Numérique
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Chaque bon génère un QR code unique pour le suivi du tonnage et la validation au pont-bascule ANGeD
              </p>
            </div>
            <button
              onClick={() => setShowNewBonModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/30 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Nouveau Bon de Collecte</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { num: 'BON-MARSA-2026-089', truck: '189 TU 4521', zone: 'Marsa Plage & Saf-Saf', driver: 'Moncef Ben Salem', status: 'En cours' },
              { num: 'BON-MARSA-2026-090', truck: '210 TU 9832', zone: 'Gammarth Village', driver: 'Kamel Trabelsi', status: 'En cours' },
              { num: 'BON-MARSA-2026-087', truck: '198 TU 3314', zone: 'Transfert Jbel Chakir', driver: 'Habib Gharbi', status: 'Clôturé ANGeD' },
            ].map((b) => (
              <div key={b.num} className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-emerald-400">{b.num}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">{b.status}</span>
                </div>
                <div className="space-y-1 text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Véhicule :</span>
                    <span className="font-bold text-white">{b.truck}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Chauffeur :</span>
                    <span>{b.driver}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Zone :</span>
                    <span className="text-slate-200">{b.zone}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-teal-400 font-mono text-[11px]">
                    <QrCode className="w-4 h-4" />
                    <span>QR Validé</span>
                  </div>
                  <button
                    onClick={() => alert(`Impression / Affichage du bon officiel ${b.num}`)}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px]"
                  >
                    Voir Bon PDF
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Modal Create Bon */}
          {showNewBonModal && (
            <div className="p-5 rounded-xl bg-slate-950 border border-emerald-500/50 space-y-4 animate-fadeIn">
              <h4 className="font-bold text-white text-sm">Créer un nouvel Ordre de Mission / Bon de Collecte</h4>
              <form onSubmit={handleCreateBon} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Véhicule Assigné :</label>
                  <select className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white">
                    {trucks.map(t => (
                      <option key={t.id} value={t.registration}>{t.registration} ({t.driverName})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Zone de Collecte :</label>
                  <input
                    type="text"
                    value={newBonZone}
                    onChange={(e) => setNewBonZone(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div className="sm:col-span-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewBonModal(false)}
                    className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold"
                  >
                    Émettre Bon de Collecte
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Citizen Ticket Management */}
      {activeTab === 'reclamations' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          <div className="lg:col-span-6 space-y-3">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              Réclamations Citoyennes & Signalements de Points Noirs
            </h3>

            {ticketsError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                {ticketsError}
              </div>
            )}

            {ticketsLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-xs">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Chargement des réclamations...</span>
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-500 text-xs">
                Aucune réclamation pour cette commune pour le moment.
              </div>
            ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer text-xs space-y-2 ${
                    selectedTicket?.id === ticket.id
                      ? 'bg-slate-900 border-emerald-500 shadow-lg'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-emerald-400">{ticket.ticketNumber}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                      ticket.status === 'resolu'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : ticket.status === 'rejete'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : ticket.status === 'en_cours'
                        ? 'bg-blue-950 text-blue-300 border border-blue-800'
                        : ticket.status === 'assigne'
                        ? 'bg-violet-950 text-violet-300 border border-violet-800'
                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>

                  <h4 className="font-bold text-white text-sm">{ticket.title}</h4>
                  <p className="text-slate-400 text-xs line-clamp-2">{ticket.description}</p>

                  <div className="flex items-center justify-between text-slate-500 text-[11px] pt-1">
                    <span>{ticket.locationName}</span>
                    <span>{new Date(ticket.createdAt).toLocaleString('fr-TN')}</span>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>

          {/* Ticket Inspector */}
          <div className="lg:col-span-6 space-y-4">
            {selectedTicket ? (
              <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4 text-xs">
                
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {selectedTicket.category.replace('_', ' ')}
                    </span>
                    <h3 className="font-bold text-white text-base mt-1">{selectedTicket.ticketNumber}</h3>
                  </div>
                  <span className="text-amber-400 font-bold uppercase text-[10px]">
                    Priorité {selectedTicket.priority}
                  </span>
                </div>

                <div className="space-y-1">
                  <h4 className="font-bold text-white text-sm">{selectedTicket.title}</h4>
                  <p className="text-slate-300 text-xs leading-relaxed">{selectedTicket.description}</p>
                </div>

                {/* Photos Before / After */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1">
                    <span className="text-slate-400 text-[11px] block">Photo Signalement Citoyen :</span>
                    <div className="h-36 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center">
                      {selectedTicket.photoUrl ? (
                        <img
                          src={selectedTicket.photoUrl}
                          alt="Photo signalement"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-slate-600 text-xs">Aucune photo jointe</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 text-[11px] block">Preuve d'Intervention / Résolution :</span>
                    <div className="h-36 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center">
                      {selectedTicket.resolvedPhotoUrl ? (
                        <img 
                          src={selectedTicket.resolvedPhotoUrl} 
                          alt="Photo résolution" 
                          className="w-full h-full object-cover" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-slate-600 text-xs">En attente d'intervention</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Citoyen :</span>
                    <span className="text-white font-medium">
                      {selectedTicket.citizenName || 'Non renseigné'}
                      {selectedTicket.citizenPhone ? ` (${selectedTicket.citizenPhone})` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Prestataire transféré :</span>
                    <span className="text-emerald-400 font-medium">{selectedTicket.assignedTeam || 'Non transféré'}</span>
                  </div>
                  {selectedTicket.status === 'rejete' && selectedTicket.rejectionReason && (
                    <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800 mt-1">
                      <span>Motif du refus :</span>
                      <span className="text-rose-300 font-medium text-right max-w-[60%]">{selectedTicket.rejectionReason}</span>
                    </div>
                  )}
                </div>

                {ticketActionError && (
                  <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                    {ticketActionError}
                  </div>
                )}

                {/* Workflow réclamations CDC : accepter / refuser / transférer / traiter — voir
                    backend/src/routes/tickets.routes.ts pour les règles de permissions exactes. */}
                {selectedTicket.status === 'recu' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      disabled={ticketActionBusy}
                      onClick={() => handleAcceptTicket(selectedTicket.id)}
                      className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Accepter</span>
                    </button>
                    <button
                      disabled={ticketActionBusy}
                      onClick={() => handleOpenRefuse(selectedTicket.id)}
                      className="py-2.5 rounded-xl bg-rose-950 hover:bg-rose-900 disabled:opacity-60 text-rose-300 font-semibold flex items-center justify-center gap-2 border border-rose-800 transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Refuser</span>
                    </button>
                  </div>
                )}

                {(selectedTicket.status === 'en_cours' || selectedTicket.status === 'assigne') && (
                  <div className="space-y-2">
                    {prestataires.length > 0 && (
                      <div className="flex items-center gap-2">
                        <select
                          value={assignPrestataireDraft}
                          onChange={(e) => setAssignPrestataireDraft(e.target.value)}
                          className="flex-1 p-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">Transférer à un Gestionnaire Prestataire...</option>
                          {prestataires.map((p) => (
                            <option key={p.id} value={p.id}>{p.full_name}</option>
                          ))}
                        </select>
                        <button
                          disabled={ticketActionBusy || !assignPrestataireDraft}
                          onClick={() => handleAssignTicket(selectedTicket.id)}
                          className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
                        >
                          <ArrowRightCircle className="w-3.5 h-3.5" />
                          <span>Transférer</span>
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        disabled={ticketActionBusy}
                        onClick={() => handleTreatTicket(selectedTicket.id, 'resolu')}
                        className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Marquer Résolu</span>
                      </button>
                      <button
                        disabled={ticketActionBusy}
                        onClick={() => handleOpenRefuse(selectedTicket.id)}
                        className="py-2.5 rounded-xl bg-rose-950 hover:bg-rose-900 disabled:opacity-60 text-rose-300 font-semibold flex items-center justify-center gap-2 border border-rose-800 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Refuser</span>
                      </button>
                    </div>
                  </div>
                )}

                {refusingTicketId === selectedTicket.id && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-rose-800/60 space-y-2">
                    <label className="text-rose-300 text-[11px] block">Motif du refus (obligatoire) :</label>
                    <textarea
                      rows={2}
                      value={refuseReasonDraft}
                      onChange={(e) => setRefuseReasonDraft(e.target.value)}
                      placeholder="Ex : doublon, hors périmètre de compétence de la commune..."
                      className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-rose-500"
                    />
                    <div className="flex gap-2">
                      <button
                        disabled={ticketActionBusy || refuseReasonDraft.trim().length < 3}
                        onClick={handleConfirmRefuse}
                        className="flex-1 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold"
                      >
                        Confirmer le refus
                      </button>
                      <button
                        onClick={() => setRefusingTicketId(null)}
                        className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {selectedTicket.status === 'resolu' && (
                  <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs text-center font-semibold">
                    ✓ Réclamation résolue{selectedTicket.resolvedAt ? ` le ${new Date(selectedTicket.resolvedAt).toLocaleString('fr-TN')}` : ''}
                  </div>
                )}

              </div>
            ) : null}
          </div>

        </div>
      )}

      {/* Tab 4: Pesées & Recoupement ANGeD */}
      {activeTab === 'pesees_reconciliation' && (
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <QrCode className="w-5 h-5 text-teal-400" />
                Recoupement & Réconciliation des Pesées (ANGeD vs Télématique)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Audit des tickets de ponts-bascules pour la certification des tonnages et calcul des redevances
              </p>
            </div>
            <span className="text-xs font-mono bg-slate-800 text-emerald-300 px-3 py-1 rounded-full border border-slate-700">
              Tolérance contractuelle : ± 3%
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">N° Ticket ANGeD</th>
                  <th className="py-3 px-4">Véhicule</th>
                  <th className="py-3 px-4">Site Décharge</th>
                  <th className="py-3 px-4">Heure Entrée/Sortie</th>
                  <th className="py-3 px-4">Poids Net Pont</th>
                  <th className="py-3 px-4">Poids Estimé Bord</th>
                  <th className="py-3 px-4">Écart (%)</th>
                  <th className="py-3 px-4">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {MOCK_WEIGHBRIDGE.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono font-bold text-emerald-400">{w.ticketNumberANGeD}</td>
                    <td className="py-3 px-4 font-bold text-white">{w.truckReg}</td>
                    <td className="py-3 px-4">{w.landfillSite}</td>
                    <td className="py-3 px-4 font-mono text-slate-400">{w.timestampIn.split(' ')[1]} - {w.timestampOut.split(' ')[1]}</td>
                    <td className="py-3 px-4 font-mono font-bold text-white">{w.netWeightKg.toLocaleString()} kg</td>
                    <td className="py-3 px-4 font-mono text-slate-300">{w.onboardEstimateKg.toLocaleString()} kg</td>
                    <td className="py-3 px-4 font-mono font-bold text-teal-300">{w.discrepancyPercent}% ({w.discrepancyKg} kg)</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        w.status === 'conforme'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}>
                        {w.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Découpage Communal — secteurs de collecte (CDC) */}
      {activeTab === 'decoupage' && (
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
          <DecoupageCommunalMap commune={activeCommune} canEdit={canEditZones} />
        </div>
      )}

    </div>
  );
};
