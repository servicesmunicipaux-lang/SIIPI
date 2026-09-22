// Bilinguisme français / arabe avec support de l'écriture de droite à gauche.
//
// Posé dès la première ligne du front-end, et non ajouté après coup : le TDR
// l'exige (§4.1), et rattraper l'internationalisation sur une application déjà
// écrite revient à relire chaque composant.

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './locales/fr.json';
import ar from './locales/ar.json';

export const LANGUES = {
  fr: { nom: 'Français', direction: 'ltr' },
  ar: { nom: 'العربية', direction: 'rtl' },
} as const;

export type CodeLangue = keyof typeof LANGUES;

const CLE_STOCKAGE = 'siipi.langue';

function langueInitiale(): CodeLangue {
  try {
    const memorisee = window.localStorage.getItem(CLE_STOCKAGE);
    if (memorisee === 'fr' || memorisee === 'ar') return memorisee;
  } catch {
    // Navigation privée ou stockage refusé : on retombe sur la langue du navigateur.
  }
  return navigator.language?.startsWith('ar') ? 'ar' : 'fr';
}

void i18next.use(initReactI18next).init({
  resources: { fr: { translation: fr }, ar: { translation: ar } },
  lng: langueInitiale(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

/** Applique la langue au document : direction du texte, attribut lang, mémorisation. */
export function appliquerLangue(code: CodeLangue): void {
  void i18next.changeLanguage(code);
  document.documentElement.lang = code;
  document.documentElement.dir = LANGUES[code].direction;
  try {
    window.localStorage.setItem(CLE_STOCKAGE, code);
  } catch {
    // Sans stockage, la langue ne survivra pas au rechargement — l'application reste utilisable.
  }
}

appliquerLangue(i18next.language as CodeLangue);

export default i18next;

/** Formatage des nombres selon la langue, avec séparateurs de milliers. */
export function formaterNombre(valeur: number | string | null | undefined, decimales = 0): string {
  if (valeur === null || valeur === undefined || valeur === '') return '—';
  const n = typeof valeur === 'string' ? Number.parseFloat(valeur) : valeur;
  if (!Number.isFinite(n)) return '—';
  // Chiffres latins même en arabe : c'est la convention des documents
  // administratifs tunisiens, et cela garde les colonnes comparables.
  return new Intl.NumberFormat('fr-TN', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(n);
}
