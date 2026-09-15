import React, { useEffect, useState } from 'react';
import { MOCK_CITIZEN, MOCK_CONTAINERS } from '../data/mockData';
import { CitizenProfile, Language, TicketReport } from '../types/siipi';
import { useAuth } from '../contexts/AuthContext';
import { useCommunesDirectory } from '../hooks/useCommunesDirectory';
import { apiClient, ApiClientError } from '../lib/apiClient';
import { ApiTicketRow, mapApiTicketToFrontend } from '../lib/ticketMapper';
import {
  Camera,
  MapPin,
  QrCode,
  Trophy,
  Bell,
  Sparkles,
  Send,
  Trash2,
  Recycle,
  Award,
  Gift,
  CheckCircle2,
  Calendar,
  Info,
  Clock,
  Smartphone,
  ChevronRight,
  Loader2
} from 'lucide-react';
import confetti from 'canvas-confetti';

const CATEGORY_LABELS: Record<string, string> = {
  point_noir: 'Dépôt sauvage / Point noir',
  conteneur_plein: 'Bac 770L débordant',
  conteneur_deteriore: 'Conteneur cassé ou brûlé',
  gravats: 'Gravats et déchets de démolition',
};

interface CitizenAppSimulatorProps {
  language: Language;
}

export const CitizenAppSimulator: React.FC<CitizenAppSimulatorProps> = ({ language }) => {
  const isAr = language === 'ar';
  const { user } = useAuth();
  // Annuaire des communes chargé depuis l'API réelle, pour laisser le citoyen indiquer
  // sa commune au moment du signalement (aucune commune n'est encore associée au compte
  // citoyen lui-même — voir GUIDE_DEMARRAGE.md, limites connues).
  const { communes } = useCommunesDirectory();
  const [profile, setProfile] = useState<CitizenProfile>(MOCK_CITIZEN);
  const [activeScreen, setActiveScreen] = useState<'home' | 'report' | 'special_pickup' | 'bins_map' | 'gamification' | 'notifications'>('home');
  const [reportCategory, setReportCategory] = useState<string>('point_noir');
  const [reportCommuneId, setReportCommuneId] = useState<string>('');
  const [reportDescription, setReportDescription] = useState<string>('');
  const [reportSubmitted, setReportSubmitted] = useState<boolean>(false);
  const [reportSubmitting, setReportSubmitting] = useState<boolean>(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [createdTicket, setCreatedTicket] = useState<TicketReport | null>(null);
  const [activePickupQr, setActivePickupQr] = useState<string | null>(null);
  const [phoneOs, setPhoneOs] = useState<'ios' | 'android'>('ios');

  // Signalement citoyen : envoyé au vrai back-end (POST /tickets) — remplace l'ancienne
  // simulation purement locale du prototype. Le ticket créé est immédiatement visible et
  // traitable par l'Admin Commune dans le Portail Municipal (voir hooks/useTicketsWorkflow.ts).
  const handleTriggerReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportCommuneId) {
      setReportError('Merci de sélectionner votre commune.');
      return;
    }
    setReportSubmitting(true);
    setReportError(null);
    try {
      const row = await apiClient.post<ApiTicketRow>('/tickets', {
        communeId: reportCommuneId,
        category: reportCategory,
        title: `Signalement : ${CATEGORY_LABELS[reportCategory] ?? reportCategory}`,
        description: reportDescription || undefined,
        citizenName: user?.fullName,
      });
      setCreatedTicket(mapApiTicketToFrontend(row));
      setReportSubmitted(true);

      // La gamification (points, badges) n'est pas encore reliée au profil citoyen réel
      // côté back-end (voir GET /citizens/me) — ce compteur reste une simulation locale
      // pour l'instant, comme le reste de l'écran "Kenz El Medina".
      setProfile(prev => ({
        ...prev,
        points: prev.points + 50,
        co2SavedKg: prev.co2SavedKg + 5.2
      }));

      try {
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
      } catch {
        // ignore
      }

      setTimeout(() => {
        setReportSubmitted(false);
        setActiveScreen('home');
        setReportDescription('');
        setCreatedTicket(null);
      }, 4000);
    } catch (err) {
      setReportError(err instanceof ApiClientError ? err.message : 'Échec de l\'envoi du signalement.');
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleGeneratePickupQr = () => {
    setActivePickupQr('QR-ENCOMB-MARSA-' + Math.floor(1000 + Math.random() * 9000));
  };

  // Présélectionne une commune pilote dès que l'annuaire réel est chargé, pour que le
  // formulaire de signalement soit utilisable immédiatement sans étape supplémentaire.
  useEffect(() => {
    if (!reportCommuneId && communes.length > 0) {
      const pilot = communes.find((c) => c.isPilot);
      setReportCommuneId((pilot ?? communes[0]).id);
    }
  }, [communes, reportCommuneId]);

  return (
    <div className="flex flex-col lg:flex-row items-center lg:items-start justify-center gap-8 py-4">
      
      {/* Phone Simulator Frame */}
      <div className="w-full max-w-[390px] h-[780px] rounded-[48px] p-3.5 bg-slate-900 border-4 border-slate-700 shadow-2xl relative flex flex-col overflow-hidden ring-8 ring-slate-800/60">
        
        {/* Phone Notch / Dynamic Island */}
        <div className="w-full flex items-center justify-between px-6 pt-2 pb-1 z-30">
          <span className="text-[11px] font-semibold text-white font-mono">09:41</span>
          <div className="w-24 h-5 rounded-full bg-black flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-900 ml-auto mr-2"></div>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-white">
            <span>5G</span>
            <span>100%</span>
          </div>
        </div>

        {/* Inner App Canvas */}
        <div className="flex-1 bg-slate-950 rounded-[36px] overflow-hidden flex flex-col text-slate-100 relative">
          
          {/* Mobile App Header */}
          <div className="p-4 bg-gradient-to-b from-slate-900 to-slate-950 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-bold text-white text-xs">
                🌱
              </div>
              <div>
                <span className="text-xs font-extrabold text-white block">Nadhfa & Kenz</span>
                <span className="text-[10px] text-emerald-400 font-medium">La Marsa • Éco-Citoyen</span>
              </div>
            </div>

            <button
              onClick={() => setActiveScreen('gamification')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 text-[11px] font-bold"
            >
              <Trophy className="w-3 h-3 text-amber-400" />
              <span>{profile.points} pts</span>
            </button>
          </div>

          {/* Screen 1: Home Dashboard */}
          {activeScreen === 'home' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs no-scrollbar">
              
              {/* Daily Eco Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-900/60 via-slate-900 to-teal-950/60 border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 font-mono">Défi du Jour</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">+50 Pts</span>
                </div>
                <h4 className="font-bold text-white text-sm">Trier 3 bouteilles plastiques PET</h4>
                <p className="text-slate-300 text-[11px]">Déposez-les dans le bac jaune Saf-Saf pour valider vos points Kenz El Medina.</p>
              </div>

              {/* Main Quick Action Cards */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  id="btn-app-report"
                  onClick={() => setActiveScreen('report')}
                  className="p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex flex-col items-start gap-2 text-left transition-all group"
                >
                  <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 group-hover:scale-110 transition-transform">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-white block text-xs">Signaler un Point Noir</span>
                    <span className="text-[10px] text-slate-400">Photo & GPS direct</span>
                  </div>
                </button>

                <button
                  id="btn-app-special-pickup"
                  onClick={() => setActiveScreen('special_pickup')}
                  className="p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex flex-col items-start gap-2 text-left transition-all group"
                >
                  <div className="p-2.5 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 group-hover:scale-110 transition-transform">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-white block text-xs">Demande Encombrants</span>
                    <span className="text-[10px] text-slate-400">Génération QR Code</span>
                  </div>
                </button>
              </div>

              {/* Nearest collection schedules */}
              <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    Prochains passages de la benne
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono">Marsa Plage</span>
                </div>
                <div className="space-y-1.5 text-[11px] text-slate-300">
                  <div className="flex justify-between p-2 rounded-lg bg-slate-950">
                    <span>Ordures Ménagères</span>
                    <span className="font-bold text-white">Ce soir à 21h30</span>
                  </div>
                  <div className="flex justify-between p-2 rounded-lg bg-slate-950">
                    <span>Tri Plastique / Carton</span>
                    <span className="font-bold text-teal-400">Mercredi 08h00</span>
                  </div>
                </div>
              </div>

              {/* Eco Impact widget */}
              <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 block">Votre impact écologique</span>
                  <span className="font-bold text-white text-xs">{profile.co2SavedKg} kg CO₂ évités</span>
                </div>
                <span className="text-xl">🌳</span>
              </div>

            </div>
          )}

          {/* Screen 2: Signalement Point Noir */}
          {activeScreen === 'report' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs no-scrollbar">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="font-bold text-white text-sm">Signaler une anomalie</h3>
                <button onClick={() => setActiveScreen('home')} className="text-slate-400 hover:text-white">✕</button>
              </div>

              {reportSubmitted ? (
                <div className="p-6 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 text-center space-y-3 animate-fadeIn">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center text-xl font-bold">
                    ✓
                  </div>
                  <h4 className="font-bold text-white text-sm">Signalement Transmis !</h4>
                  <p className="text-emerald-300 text-xs">
                    {createdTicket
                      ? `Ticket #${createdTicket.ticketNumber} créé. L'équipe municipale a été notifiée.`
                      : 'Signalement transmis. L\'équipe municipale a été notifiée.'}
                  </p>
                  <span className="inline-block px-3 py-1 rounded-full bg-emerald-500 text-slate-950 font-bold text-xs">
                    +50 Points Verts !
                  </span>
                </div>
              ) : (
                <form onSubmit={handleTriggerReport} className="space-y-3">

                  {/* Photo Simulation */}
                  <div className="h-32 rounded-2xl bg-slate-900 border-2 border-dashed border-slate-700 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-emerald-500 transition-colors">
                    <Camera className="w-6 h-6 text-emerald-400" />
                    <span className="text-slate-300 font-semibold text-xs">Prendre une photo du point noir</span>
                    <span className="text-slate-500 text-[10px]">Photo géolocalisée automatiquement</span>
                  </div>

                  {/* Commune Selection — requis par l'API pour router le signalement vers le
                      bon Portail Municipal (aucune commune n'est encore enregistrée sur le
                      profil citoyen lui-même). */}
                  <div className="space-y-1">
                    <label className="text-slate-400 text-[11px] block">Commune :</label>
                    <select
                      value={reportCommuneId}
                      onChange={(e) => setReportCommuneId(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                    >
                      {communes.length === 0 && <option value="">Chargement des communes...</option>}
                      {communes.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Category Selection */}
                  <div className="space-y-1">
                    <label className="text-slate-400 text-[11px] block">Catégorie :</label>
                    <select
                      value={reportCategory}
                      onChange={(e) => setReportCategory(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                    >
                      <option value="point_noir">Dépôt sauvage / Point noir</option>
                      <option value="conteneur_plein">Bac 770L débordant</option>
                      <option value="conteneur_deteriore">Conteneur cassé ou brûlé</option>
                      <option value="gravats">Gravats et déchets de démolition</option>
                    </select>
                  </div>

                  {/* Location detected */}
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2 text-slate-300 text-[11px]">
                    <MapPin className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>GPS : Avenue Habib Bourguiba, La Marsa</span>
                  </div>

                  {/* Description text */}
                  <div className="space-y-1">
                    <label className="text-slate-400 text-[11px] block">Description (optionnelle) :</label>
                    <textarea
                      rows={2}
                      value={reportDescription}
                      onChange={(e) => setReportDescription(e.target.value)}
                      placeholder="Précisez un repère (ex: près de la boulangerie)..."
                      className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {reportError && (
                    <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                      {reportError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={reportSubmitting || !reportCommuneId}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-colors"
                  >
                    {reportSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>{reportSubmitting ? 'Envoi en cours...' : 'Envoyer le Signalement'}</span>
                  </button>

                </form>
              )}
            </div>
          )}

          {/* Screen 3: Demande Encombrants avec QR Code */}
          {activeScreen === 'special_pickup' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs no-scrollbar">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="font-bold text-white text-sm">Collecte d'encombrants</h3>
                <button onClick={() => setActiveScreen('home')} className="text-slate-400 hover:text-white">✕</button>
              </div>

              {activePickupQr ? (
                <div className="p-5 rounded-2xl bg-slate-900 border border-emerald-500/40 text-center space-y-3">
                  <div className="p-4 bg-white rounded-xl inline-block shadow-xl">
                    {/* Simulated visual QR Code */}
                    <div className="w-28 h-28 bg-slate-950 flex flex-col items-center justify-center text-emerald-400 font-mono text-[10px] p-2 text-center rounded">
                      <QrCode className="w-16 h-16 text-emerald-400" />
                      <span className="text-[8px] text-slate-300 mt-1">{activePickupQr}</span>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-white text-sm">QR Code de Dépôt Actif</h4>
                    <p className="text-slate-400 text-[11px] mt-1">
                      Scotchez ce QR code sur votre encombrant. L'équipe municipale scannera le code lors de la collecte.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950 text-slate-300 text-[11px]">
                    Passage prévu : <span className="font-bold text-emerald-400">Demain entre 08h et 12h</span>
                  </div>

                  <button
                    onClick={() => setActivePickupQr(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs"
                  >
                    Nouvelle demande
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                    <span className="font-bold text-white block">Types d'objets pris en charge :</span>
                    <span className="text-slate-400 text-[11px] block">Mobilier (canapé, table), électroménager usagé, branchages verts et gravats propres.</span>
                  </div>

                  <button
                    onClick={handleGeneratePickupQr}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-colors"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Générer QR Code de Dépôt</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Screen 4: Gamification "Kenz El Medina" */}
          {activeScreen === 'gamification' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs no-scrollbar">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  Kenz El Medina
                </h3>
                <button onClick={() => setActiveScreen('home')} className="text-slate-400 hover:text-white">✕</button>
              </div>

              {/* Wallet header */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 border border-emerald-500/30 text-center space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-mono">Solde Points Verts</span>
                <div className="text-3xl font-black text-white">{profile.points} <span className="text-sm font-normal text-emerald-400">Pts</span></div>
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                  {profile.levelBadge}
                </span>
              </div>

              {/* Partner Rewards */}
              <div className="space-y-2">
                <span className="font-bold text-white text-xs block">Récompenses Éco-Partenaires</span>
                {profile.rewards.map(r => (
                  <div key={r.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white block text-xs">{r.title}</span>
                      <span className="text-[10px] text-slate-400">{r.partner}</span>
                    </div>
                    <button
                      disabled={r.claimed || profile.points < r.pointsCost}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                        r.claimed
                          ? 'bg-slate-800 text-slate-500'
                          : profile.points >= r.pointsCost
                          ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {r.claimed ? 'Échangé' : `${r.pointsCost} pts`}
                    </button>
                  </div>
                ))}
              </div>

            </div>
          )}

          {/* Mobile Bottom Navigation Bar */}
          <div className="p-2 bg-slate-900 border-t border-slate-800 flex items-center justify-around">
            <button
              onClick={() => setActiveScreen('home')}
              className={`p-2 rounded-xl flex flex-col items-center gap-1 ${activeScreen === 'home' ? 'text-emerald-400' : 'text-slate-400'}`}
            >
              <Recycle className="w-4 h-4" />
              <span className="text-[9px]">Accueil</span>
            </button>

            <button
              onClick={() => setActiveScreen('report')}
              className={`p-2 rounded-xl flex flex-col items-center gap-1 ${activeScreen === 'report' ? 'text-emerald-400' : 'text-slate-400'}`}
            >
              <Camera className="w-4 h-4" />
              <span className="text-[9px]">Signaler</span>
            </button>

            <button
              onClick={() => setActiveScreen('special_pickup')}
              className={`p-2 rounded-xl flex flex-col items-center gap-1 ${activeScreen === 'special_pickup' ? 'text-emerald-400' : 'text-slate-400'}`}
            >
              <QrCode className="w-4 h-4" />
              <span className="text-[9px]">Encombrants</span>
            </button>

            <button
              onClick={() => setActiveScreen('gamification')}
              className={`p-2 rounded-xl flex flex-col items-center gap-1 ${activeScreen === 'gamification' ? 'text-emerald-400' : 'text-slate-400'}`}
            >
              <Trophy className="w-4 h-4" />
              <span className="text-[9px]">Défis</span>
            </button>
          </div>

        </div>

      </div>

      {/* Side Context & Explanation */}
      <div className="max-w-md space-y-5">
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-bold">
            <Smartphone className="w-4 h-4" />
            <span>APPLICATION MOBILE CITOYENNE NATIVE / HYBRIDE</span>
          </div>
          <h2 className="text-xl font-bold text-white">
            {isAr ? 'تطبيق المواطن: الإبلاغ والتحفيز الإيكولوجي' : 'Expérience Citoyenne & Gamification Écologique'}
          </h2>
          <p className="text-slate-300 text-xs leading-relaxed">
            {isAr
              ? 'يتيح للمواطن إرسال صور النقاط السوداء المرفقة بالإحداثيات الجغرافية، طلب رفع الفواضل الكبيرة برمز QR، وجمع النقاط القابلة للاستبدال.'
              : 'Conçue pour iOS et Android, cette application intègre un moteur de signalement instantané des points noirs, un générateur de QR codes de collecte spécifique et le portefeuille "Kenz El Medina".'}
          </p>

          <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Géolocalisation précise & prise de photo instantanée</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Génération de QR code pour encombrants et gravats</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Portefeuille de points verts "Kenz El Medina" et récompenses</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Mode hors-ligne avec stockage SQLite embarqué</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
