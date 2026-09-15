import React, { useState, useRef } from 'react';
import { Commune, Language } from '../types/siipi';
import { 
  Building2, 
  Phone, 
  Mail, 
  FileText, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  MapPin, 
  Save, 
  X, 
  ShieldCheck, 
  Truck, 
  Scale, 
  UserCheck,
  Upload,
  Image as ImageIcon,
  Link as LinkIcon,
  RefreshCw
} from 'lucide-react';

interface CommuneEditModalProps {
  commune: Commune;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedCommune: Commune) => void;
  language: Language;
}

export const CommuneEditModal: React.FC<CommuneEditModalProps> = ({
  commune,
  isOpen,
  onClose,
  onSave,
  language
}) => {
  const isAr = language === 'ar';
  const [formData, setFormData] = useState<Commune>({ ...commune });
  const [activeTab, setActiveTab] = useState<'contacts' | 'pcgd_dechets' | 'indicateurs'>('contacts');
  const [isSavedSuccess, setIsSavedSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [urlInputMode, setUrlInputMode] = useState(false);
  const [customLogoUrl, setCustomLogoUrl] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  // Process file upload with automatic canvas optimization (max 400x400)
  const processImageFile = (file: File) => {
    setUploadError(null);
    if (!file.type.startsWith('image/')) {
      setUploadError('Veuillez sélectionner un fichier image valide (PNG, JPG, SVG, WebP).');
      return;
    }

    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          setFormData((prev) => ({ ...prev, logoUrl: result }));
        }
      };
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 400;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/png', 0.9);
          setFormData((prev) => ({ ...prev, logoUrl: compressedDataUrl }));
        }
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      setUploadError("Erreur lors de la lecture de l'image.");
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleApplyUrl = () => {
    if (customLogoUrl.trim()) {
      setFormData((prev) => ({ ...prev, logoUrl: customLogoUrl.trim() }));
      setCustomLogoUrl('');
      setUrlInputMode(false);
      setUploadError(null);
    }
  };

  const handleRemoveLogo = () => {
    setFormData((prev) => ({ ...prev, logoUrl: undefined }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setIsSavedSuccess(true);
    setTimeout(() => {
      setIsSavedSuccess(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-750 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-800">
          <div className="flex items-center gap-3">
            {formData.logoUrl ? (
              <img
                src={formData.logoUrl}
                alt={`Logo ${formData.name}`}
                className="w-10 h-10 object-contain rounded-xl bg-slate-950 p-1 border border-slate-700 shadow-md shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">
                  {isAr ? `تحديث بيانات بلدية : ${formData.nameAr || formData.name}` : `Fiche & Paramètres : Commune de ${formData.name}`}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-teal-300 border border-slate-700">
                  {formData.gouvernorat}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Annuaire officiel FNCT 2023 • Plan Communal de Gestion des Déchets (PCGD)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-6 pt-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('contacts')}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'contacts'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            <span>1. Identité, Logo & Coordonnées</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pcgd_dechets')}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'pcgd_dechets'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>2. Filière Déchets & Statut PCGD</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('indicateurs')}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'indicateurs'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>3. Métriques & Décharge</span>
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* TAB 1: LOGO, IDENTITÉ & CONTACTS */}
          {activeTab === 'contacts' && (
            <div className="space-y-5 animate-fadeIn">
              
              {/* SECTION: LOGO UPLOAD & ARMOIRIES */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">
                      {isAr ? 'شعار / درع البلدية الرسمي' : 'Armoiries & Logo Officiel de la Commune'}
                    </span>
                  </div>
                  {formData.logoUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 font-medium px-2 py-1 rounded-lg hover:bg-rose-950/40 border border-rose-900/50 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{isAr ? 'حذف الشعار' : 'Supprimer le logo'}</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  
                  {/* Preview Box */}
                  <div className="md:col-span-4 flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center space-y-2">
                    {formData.logoUrl ? (
                      <div className="space-y-1.5 flex flex-col items-center">
                        <div className="w-20 h-20 rounded-xl bg-slate-950 p-1.5 border border-emerald-500/40 shadow-lg flex items-center justify-center overflow-hidden">
                          <img
                            src={formData.logoUrl}
                            alt={`Logo ${formData.name}`}
                            className="w-full h-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <span className="text-[10px] text-emerald-400 font-mono font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Logo actif
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1.5 flex flex-col items-center py-2">
                        <div className="w-16 h-16 rounded-xl bg-slate-950 p-2 border border-slate-800 flex items-center justify-center text-emerald-400">
                          <Building2 className="w-8 h-8" />
                        </div>
                        <span className="text-[11px] text-slate-400">
                          Icône par défaut
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Upload Dropzone & Controls */}
                  <div className="md:col-span-8 space-y-2.5">
                    
                    {/* Drag and Drop Zone */}
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`p-4 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center space-y-1.5 ${
                        isDragging
                          ? 'border-emerald-500 bg-emerald-950/20'
                          : 'border-slate-800 hover:border-emerald-600/50 bg-slate-900/40 hover:bg-slate-900/80'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <Upload className="w-5 h-5 text-emerald-400" />
                      <div className="text-xs text-slate-200 font-medium">
                        {isAr ? 'اضغط لاختيار صورة الشعار أو اسحبها هنا' : 'Cliquez pour uploader le logo ou glissez-déposez le fichier'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        PNG, JPG, SVG ou WebP (optimisé automatiquement)
                      </div>
                    </div>

                    {/* Secondary: URL Link option */}
                    <div className="flex items-center justify-between text-xs pt-1">
                      {!urlInputMode ? (
                        <button
                          type="button"
                          onClick={() => setUrlInputMode(true)}
                          className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1.5 underline"
                        >
                          <LinkIcon className="w-3 h-3" />
                          <span>Ou coller l'URL directe d'une image</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 w-full">
                          <input
                            type="url"
                            value={customLogoUrl}
                            onChange={(e) => setCustomLogoUrl(e.target.value)}
                            placeholder="https://exemple.tn/logo_commune.png"
                            className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={handleApplyUrl}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                          >
                            Appliquer
                          </button>
                          <button
                            type="button"
                            onClick={() => setUrlInputMode(false)}
                            className="p-1.5 text-slate-400 hover:text-white"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>

                    {uploadError && (
                      <p className="text-xs text-rose-400 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {uploadError}
                      </p>
                    )}

                  </div>

                </div>
              </div>

              {/* Basic Details (FR & AR) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Nom de la Commune (Français)
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    اسم البلدية (بالعربية)
                  </label>
                  <input
                    type="text"
                    value={formData.nameAr}
                    onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                    dir="rtl"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Gouvernorat (الولاية)
                  </label>
                  <input
                    type="text"
                    value={formData.gouvernorat}
                    onChange={(e) => setFormData({ ...formData, gouvernorat: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Numéro Fixe (الهاتف القار)
                  </label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Ex: 71.740.408"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Numéro Fax (الفاكس)
                  </label>
                  <input
                    type="text"
                    value={formData.fax || ''}
                    onChange={(e) => setFormData({ ...formData, fax: e.target.value })}
                    placeholder="Ex: 71.743.406"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Mail Générique Officiel (البريد الإلكتروني)
                  </label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Ex: contact@commune.gov.tn"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Adresse de l'Hôtel de Ville / Siège Municipal
                </label>
                <input
                  type="text"
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Ex: Place de la République, 2070 La Marsa"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Responsable Propreté & Cadre de Vie
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <input
                      type="text"
                      value={formData.responsibleOfficer || ''}
                      onChange={(e) => setFormData({ ...formData, responsibleOfficer: e.target.value })}
                      placeholder="Nom du directeur / ingénieur"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={formData.responsiblePhone || ''}
                      onChange={(e) => setFormData({ ...formData, responsiblePhone: e.target.value })}
                      placeholder="Téléphone direct ou flotte"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PCGD & GESTION DES DECHETS */}
          {activeTab === 'pcgd_dechets' && (
            <div className="space-y-4 animate-fadeIn">
              
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Plan Communal de Gestion des Déchets (PCGD)
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.hasPcgd || false}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        hasPcgd: e.target.checked,
                        pcgdStatus: e.target.checked ? (formData.pcgdStatus || 'valide') : 'non_existant'
                      })}
                      className="w-4 h-4 accent-emerald-500 rounded"
                    />
                    <span className="text-xs text-slate-200 font-medium">La commune possède un PCGD</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Statut d'élaboration / validation du PCGD
                    </label>
                    <select
                      value={formData.pcgdStatus || 'non_existant'}
                      onChange={(e) => {
                        const val = e.target.value as any;
                        setFormData({ 
                          ...formData, 
                          pcgdStatus: val,
                          hasPcgd: val === 'valide' || val === 'en_cours' || val === 'a_actualiser'
                        });
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="valide">✅ Validé par le Conseil Municipal / ANGeD</option>
                      <option value="en_cours">⏳ En cours d'élaboration (Assistance FNCT)</option>
                      <option value="a_actualiser">🔄 À actualiser (Ancien plan quinquennal)</option>
                      <option value="non_existant">❌ Non existant (À programmer)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Date d'adoption / Horizon prévisionnel
                    </label>
                    <input
                      type="text"
                      value={formData.pcgdValidationDate || ''}
                      onChange={(e) => setFormData({ ...formData, pcgdValidationDate: e.target.value })}
                      placeholder="Ex: 2023-04-18 ou 2024-Q4"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Mode de Gestion de la Propreté
                  </label>
                  <select
                    value={formData.wasteManagementMode || 'regie_directe'}
                    onChange={(e) => setFormData({ ...formData, wasteManagementMode: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="regie_directe">Régie directe (Agents & matériel municipaux)</option>
                    <option value="sous_traitance_privee">Sous-traitance privée (Entreprises de collecte)</option>
                    <option value="mixte">Mixte (Régie municipale + Prestataires privés)</option>
                    <option value="delegation_sp">Délégation de Service Public (DSP)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Fréquence de Passage & Collecte
                  </label>
                  <input
                    type="text"
                    value={formData.collectionFrequency || ''}
                    onChange={(e) => setFormData({ ...formData, collectionFrequency: e.target.value })}
                    placeholder="Ex: Quotidienne 7j/7 ou 6j/7"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Décharge Contrôlée de Destination (Site ANGeD)
                </label>
                <input
                  type="text"
                  value={formData.landfillSite || ''}
                  onChange={(e) => setFormData({ ...formData, landfillSite: e.target.value })}
                  placeholder="Ex: Décharge Contrôlée de Jbel Chakir / Borj Chakir / Oued Laya"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Notes & Spécificités Opérationnelles (Filières de tri, conventions GDMA)
                </label>
                <textarea
                  rows={3}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Ex: Convention avec les collecteurs informels (Barbéchas), tri sélectif plastique 770L..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

            </div>
          )}

          {/* TAB 3: INDICATEURS ET METRIQUES */}
          {activeTab === 'indicateurs' && (
            <div className="space-y-4 animate-fadeIn">
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Population Desservie (Habitants)
                  </label>
                  <input
                    type="number"
                    value={formData.population}
                    onChange={(e) => setFormData({ ...formData, population: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Superficie (km²)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.areaKm2}
                    onChange={(e) => setFormData({ ...formData, areaKm2: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Tonnage Moyen Produit (t/j)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.wasteTonsPerDay}
                    onChange={(e) => setFormData({ ...formData, wasteTonsPerDay: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-emerald-400 font-mono font-bold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Taux de Collecte Global (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    max="100"
                    value={formData.collectionRate}
                    onChange={(e) => setFormData({ ...formData, collectionRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Indice Propreté 5 Axes (/100)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.cleanlinessIndex}
                    onChange={(e) => setFormData({ ...formData, cleanlinessIndex: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-cyan-400 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Taux Recouvrement TCL (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    max="100"
                    value={formData.tclRecoveryRate || 65}
                    onChange={(e) => setFormData({ ...formData, tclRecoveryRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Nombre de Camions / Bennes Actives
                  </label>
                  <input
                    type="number"
                    value={formData.activeTrucks}
                    onChange={(e) => setFormData({ ...formData, activeTrucks: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Total Bacs & Points d'Apport (770L)
                  </label>
                  <input
                    type="number"
                    value={formData.totalContainers}
                    onChange={(e) => setFormData({ ...formData, totalContainers: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-200">Statut Commune Pilote SIIPI</span>
                  <p className="text-[11px] text-slate-400">Activer le suivi télématique direct et les capteurs connectés</p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.isPilot}
                  onChange={(e) => setFormData({ ...formData, isPilot: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
              </div>

            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <span className="text-xs text-slate-400">
              * Les modifications et le logo sont immédiatement synchronisés avec l'Observatoire National.
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/30 transition-colors"
              >
                {isSavedSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-200 animate-bounce" />
                    <span>Enregistré !</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Enregistrer les Modifications</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};
