import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { FNCTLogo, TunisianCoatOfArmsLogo, ANGeDLogo } from './Logos';
import { Lock, Mail, LogIn, Loader2, UserPlus, ShieldCheck, User, Phone } from 'lucide-react';
import { Language } from '../types/siipi';

interface LoginScreenProps {
  language: Language;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ language }) => {
  const isAr = language === 'ar';
  const { login, registerCitizen, error } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await registerCitizen({ email, password, fullName, phone: phone || undefined });
      }
    } catch (err: any) {
      setLocalError(err?.message ?? 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Institutional header */}
        <div className="flex items-center justify-center gap-4 pb-2">
          <FNCTLogo variant="icon" size="md" />
          <TunisianCoatOfArmsLogo size="md" />
          <ANGeDLogo variant="icon" size="md" />
        </div>

        <div className="p-7 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-xl font-bold text-white tracking-tight">SIIPI</h1>
            <p className="text-xs text-slate-400">
              {isAr
                ? 'منظومة المعلومات الذكية للنظافة المشتركة بين البلديات'
                : "Système d'Information Intelligent pour la Propreté Intercommunale"}
            </p>
            <p className="text-[11px] text-slate-500 font-mono pt-1">FNCT / ANGeD</p>
          </div>

          {/* Mode switch */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                mode === 'login' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                mode === 'register' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Inscription Citoyen
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Nom complet
                </label>
                <input
                  required
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                  placeholder="Prénom Nom"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Email
              </label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                placeholder="nom@siipi.tn"
                autoComplete="email"
              />
            </div>

            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> Téléphone (optionnel)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                  placeholder="+216 XX XXX XXX"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Mot de passe
              </label>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={mode === 'register' ? 8 : undefined}
                className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                placeholder={mode === 'register' ? 'Au moins 8 caractères' : '••••••••'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            {(localError || error) && (
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                {localError || error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === 'login' ? (
                <LogIn className="w-4 h-4" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              <span>{mode === 'login' ? 'Se connecter' : 'Créer mon compte citoyen'}</span>
            </button>
          </form>

          <div className="flex items-center gap-1.5 justify-center text-[10px] text-slate-500 pt-1">
            <ShieldCheck className="w-3 h-3 text-emerald-500" />
            <span>Connexion chiffrée • Décret-loi n° 2022-54</span>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-600">
          Directeurs municipaux, agents de terrain et acteurs GDMA : contactez l'administrateur FNCT/ANGeD pour la
          création de votre compte.
        </p>
      </div>
    </div>
  );
};
