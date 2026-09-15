import React, { useState } from 'react';
import { MOCK_BARBECHA } from '../data/mockData';
import { BarbechaProfile, Language } from '../types/siipi';
import { 
  Users, 
  Recycle, 
  ShieldCheck, 
  HeartHandshake, 
  Coins, 
  QrCode, 
  CheckCircle2, 
  Building, 
  School, 
  Plus, 
  Calendar,
  Sparkles,
  Award
} from 'lucide-react';

interface GDMAViewProps {
  language: Language;
}

export const GDMAView: React.FC<GDMAViewProps> = ({ language }) => {
  const isAr = language === 'ar';
  const [activeSubTab, setActiveSubTab] = useState<'barbechas' | 'associations' | 'entreprises'>('barbechas');
  const [barbecha, setBarbecha] = useState<BarbechaProfile>(MOCK_BARBECHA);
  const [newDeliveryWeight, setNewDeliveryWeight] = useState<string>('30');
  const [newDeliveryMaterial, setNewDeliveryMaterial] = useState<'PET_plastique' | 'PEHD' | 'Carton' | 'Aluminium'>('PET_plastique');

  const unitPricesTND: Record<string, number> = {
    PET_plastique: 1.10, // DT / kg
    PEHD: 0.95,
    Carton: 0.35,
    Aluminium: 2.50,
  };

  const handleAddDelivery = (e: React.FormEvent) => {
    e.preventDefault();
    const weight = parseFloat(newDeliveryWeight) || 0;
    const pricePerKg = unitPricesTND[newDeliveryMaterial] || 1.0;
    const amount = Number((weight * pricePerKg).toFixed(2));

    const newDelivery = {
      date: 'Aujourd’hui',
      material: newDeliveryMaterial,
      weightKg: weight,
      amountTND: amount,
      hubName: 'Centre de Tri Social La Marsa',
    };

    setBarbecha(prev => ({
      ...prev,
      collectedTotalKg: prev.collectedTotalKg + weight,
      earningsThisMonthTND: prev.earningsThisMonthTND + amount,
      recentDeliveries: [newDelivery, ...prev.recentDeliveries]
    }));

    alert(`✓ Pesée enregistrée : ${weight} kg de ${newDeliveryMaterial} = ${amount} DT versés à ${barbecha.name}.`);
  };

  return (
    <div className="space-y-6">
      
      {/* GDMA Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-teal-950/40 border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-1 rounded-md bg-teal-500/20 text-teal-300 font-mono text-xs font-bold border border-teal-500/30">
              MODULE GDMA • INCLUSION SOCIALE & ÉCONOMIE CIRCULAIRE
            </span>
            <span className="text-xs text-slate-400 font-mono">
              FNCT / ANGeD / Municipalités
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {isAr ? 'منظومة التصرف في النفايات بقيادة الفاعلين المحليين (GDMA)' : 'Gestion des Déchets Menée par les Acteurs (GDMA)'}
          </h1>
          <p className="text-sm text-slate-300 max-w-3xl mt-1">
            {isAr
              ? 'إدماج البرباشة (عمال الفرز غير المهيكلين)، تعزيز دور الجمعيات والمدارس، وشراكات الفرز مع المؤسسات الاقتصادية.'
              : 'Structuration et inclusion des récupérateurs informels (Barbéchas), mobilisation des associations écocitoyennes et conventions de tri avec les commerces et entreprises.'}
          </p>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-900/90 border border-slate-800">
        <button
          onClick={() => setActiveSubTab('barbechas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeSubTab === 'barbechas'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <HeartHandshake className="w-3.5 h-3.5" />
          <span>Espace Barbéchas & Économie Sociale</span>
        </button>

        <button
          onClick={() => setActiveSubTab('associations')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeSubTab === 'associations'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <School className="w-3.5 h-3.5" />
          <span>Associations & Écoles</span>
        </button>

        <button
          onClick={() => setActiveSubTab('entreprises')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeSubTab === 'entreprises'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          <span>Commerces & Entreprises</span>
        </button>
      </div>

      {/* Sub-Tab 1: Barbéchas & Informal Sector Integration */}
      {activeSubTab === 'barbechas' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Barbécha Identity & Social Card */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4 text-xs">
              
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-white font-bold text-lg">
                    {barbecha.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">{barbecha.name}</h3>
                    <span className="font-mono text-emerald-400 text-[11px]">{barbecha.codeId}</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold">
                  Badge Officiel FNCT
                </span>
              </div>

              <div className="space-y-2 text-slate-300">
                <div className="flex justify-between p-2 rounded-lg bg-slate-950">
                  <span className="text-slate-400">Zone d'Activité :</span>
                  <span className="font-bold text-white">{barbecha.zone}</span>
                </div>
                <div className="flex justify-between p-2 rounded-lg bg-slate-950">
                  <span className="text-slate-400">Équipement Attribué :</span>
                  <span className="font-bold text-teal-400">Tricycle Électrique Sécurisé</span>
                </div>
                <div className="flex justify-between p-2 rounded-lg bg-slate-950">
                  <span className="text-slate-400">Couverture Sociale / Maladie :</span>
                  <span className="font-bold text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Active (CNAM / FNCT)
                  </span>
                </div>
              </div>

              {/* Monthly Stats */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                  <span className="text-slate-400 text-[11px] block">Total Collecté</span>
                  <span className="font-black text-white text-lg font-mono">{barbecha.collectedTotalKg.toLocaleString()} kg</span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                  <span className="text-slate-400 text-[11px] block">Revenus du Mois</span>
                  <span className="font-black text-emerald-400 text-lg font-mono">{barbecha.earningsThisMonthTND} DT</span>
                </div>
              </div>

            </div>

            {/* Quick Saisie Pesée Form */}
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3 text-xs">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <Coins className="w-4 h-4 text-emerald-400" />
                Saisie Pesée d'Achat au Centre de Tri Social
              </h4>
              <form onSubmit={handleAddDelivery} className="space-y-3">
                <div>
                  <label className="text-slate-400 text-[11px] block mb-1">Matière Valor迴ée :</label>
                  <select
                    value={newDeliveryMaterial}
                    onChange={(e: any) => setNewDeliveryMaterial(e.target.value)}
                    className="w-full p-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                  >
                    <option value="PET_plastique">Plastique PET (Bouteilles) - 1.10 DT/kg</option>
                    <option value="PEHD">Plastique PEHD (Flacons) - 0.95 DT/kg</option>
                    <option value="Carton">Carton Ondulé Propre - 0.35 DT/kg</option>
                    <option value="Aluminium">Aluminium (Canettes) - 2.50 DT/kg</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-[11px] block mb-1">Poids Pesé (kg) :</label>
                  <input
                    type="number"
                    value={newDeliveryWeight}
                    onChange={(e) => setNewDeliveryWeight(e.target.value)}
                    className="w-full p-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors"
                >
                  Enregistrer Pesée & Créditer Compte
                </button>
              </form>
            </div>
          </div>

          {/* Delivery History & Transparency */}
          <div className="lg:col-span-7 p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-bold text-white text-base">Historique des Livraisons & Traçabilité Matière</h3>
                <p className="text-xs text-slate-400">Registre numérique conforme aux exigences de l'ANGeD</p>
              </div>
              <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full font-mono">
                Paiement Instantané
              </span>
            </div>

            <div className="space-y-3">
              {barbecha.recentDeliveries.map((del, i) => (
                <div key={i} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{del.material.replace('_', ' ')}</span>
                      <span className="text-[10px] text-slate-500">• {del.date}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">{del.hubName}</span>
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-bold text-white block text-sm">{del.weightKg} kg</span>
                    <span className="font-mono font-bold text-emerald-400 text-xs">+{del.amountTND} DT</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* Sub-Tab 2: Associations & Écoles */}
      {activeSubTab === 'associations' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { name: 'Association Éco-Marsa Verte', action: 'Campagne Clean-Up Sidi Abdelaziz', date: 'Samedi 05 Septembre', volunteers: 65, bags: 120 },
            { name: 'Club Environnement Lycée Gustave Flaubert', action: 'Atelier de tri sélectif & compostage', date: 'Mardi 08 Septembre', volunteers: 40, bags: 45 },
            { name: 'Scouts Tunisiens (Section La Marsa)', action: 'Sensibilisation porte-à-porte Saf-Saf', date: 'Dimanche 13 Septembre', volunteers: 85, bags: 90 },
          ].map((assoc, i) => (
            <div key={i} className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3 text-xs">
              <div className="flex items-center gap-2 text-teal-400 font-bold">
                <School className="w-4 h-4" />
                <span>{assoc.name}</span>
              </div>
              <h4 className="font-bold text-white text-sm">{assoc.action}</h4>
              <div className="space-y-1 text-slate-400">
                <div>Date : <span className="text-white">{assoc.date}</span></div>
                <div>Bénévoles mobilisés : <span className="text-emerald-400 font-bold">{assoc.volunteers}</span></div>
                <div>Sacs de tri collectés : <span className="text-cyan-400 font-bold">{assoc.bags}</span></div>
              </div>
              <button className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-[11px] transition-colors">
                Coordonner avec la Municipalité
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Sub-Tab 3: Entreprises & Commerces */}
      {activeSubTab === 'entreprises' && (
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4 text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="font-bold text-white text-base">Conventions Municipales de Tri avec le Secteur Privé</h3>
              <p className="text-xs text-slate-400">Dépôts volontaires de cartons et plastiques commerciaux</p>
            </div>
            <button className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors">
              + Nouvelle Convention Entreprise
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { company: 'Monoprix La Marsa', type: 'Grande Distribution', volume: '14.5 t / mois de carton', status: 'Convention Active', color: 'emerald' },
              { company: 'Hôtel Le Golfe Gammarth', type: 'Hôtellerie / Tourisme', volume: '6.2 t / mois verre et organique', status: 'Convention Active', color: 'emerald' },
              { company: 'Zone Artisanale Bhar Lazreg', type: 'Artisans & Menuisiers', volume: '8.0 t / mois bois et chutes', status: 'En audit de convention', color: 'amber' },
            ].map((c, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">{c.company}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    c.color === 'emerald' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-amber-950 text-amber-300 border border-amber-800'
                  }`}>
                    {c.status}
                  </span>
                </div>
                <div className="text-slate-400 text-[11px]">{c.type} • Gisement estimé : <span className="text-white font-bold">{c.volume}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
