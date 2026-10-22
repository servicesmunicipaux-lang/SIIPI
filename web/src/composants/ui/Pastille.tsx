// Un état dit en toutes lettres, avec une icône (jalon D, lot D3).
//
// La couleur ne porte jamais seule le sens : « mesuré » et « déclaré » se
// distinguent par le mot et par le dessin, pas seulement par le vert et le bleu —
// une personne qui ne distingue pas ces teintes, ou une impression en noir et
// blanc, lit la même chose. Un ton par sens, les mêmes d'un écran à l'autre :
//   mesure     — une valeur lue dans un registre de la plateforme ;
//   declare    — une valeur que la commune a déclarée ;
//   attention  — à vérifier, à prévoir ;
//   action     — en retard, bloquant ;
//   neutre     — une information sans jugement.
import type { ReactNode } from 'react';

export type TonPastille = 'mesure' | 'declare' | 'attention' | 'action' | 'neutre';

const COULEURS: Record<TonPastille, string> = {
  mesure: 'bg-siipi-50 text-siipi-800 ring-siipi-200',
  declare: 'bg-blue-50 text-blue-800 ring-blue-200',
  attention: 'bg-amber-50 text-amber-900 ring-amber-300',
  action: 'bg-red-50 text-red-800 ring-red-300',
  neutre: 'bg-ardoise-100 text-ardoise-700 ring-ardoise-200',
};

/** Le dessin de chaque ton : 12 px, décoratif (le mot suit toujours). */
const DESSINS: Record<TonPastille, string> = {
  mesure: 'M2.5 6.5 5 9l4.5-5.5', // une coche
  declare: 'M2 10l.7-2.6L8 2.1a1 1 0 0 1 1.4 0l.5.5a1 1 0 0 1 0 1.4L4.6 9.3 2 10z', // un crayon
  attention: 'M6 2.5v4M6 9v.01', // un point d'exclamation
  action: 'M3 3l6 6M9 3 3 9', // une croix
  neutre: 'M6 3.5v.01M6 5.5V9', // un « i »
};

export function Pastille({ ton, children, titre }: { ton: TonPastille; children: ReactNode; titre?: string }) {
  return (
    <span
      title={titre}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${COULEURS[ton]}`}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={DESSINS[ton]} />
      </svg>
      {children}
    </span>
  );
}
