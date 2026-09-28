// Ce que partagent le tableau des points, sa barre de lot et ses filtres :
// l'affichage d'une valeur de champ libre, sa saisie, et la pastille d'une
// étiquette (Jalon 6, B3.4 et B3.5).

import { useTranslation } from 'react-i18next';
import type { ChampPoint, EtiquettePoint } from '../../lib/api';

export type ValeurChamp = string | number | boolean | null;

/** Les classes d'une pastille, par couleur de la palette (migration 047). */
export const CLASSES_COULEUR: Record<string, string> = {
  ardoise: 'bg-ardoise-100 text-ardoise-800 border-ardoise-300',
  rouge: 'bg-red-100 text-red-800 border-red-300',
  orange: 'bg-orange-100 text-orange-800 border-orange-300',
  ambre: 'bg-amber-100 text-amber-900 border-amber-300',
  vert: 'bg-green-100 text-green-800 border-green-300',
  emeraude: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  bleu: 'bg-blue-100 text-blue-800 border-blue-300',
  violet: 'bg-violet-100 text-violet-800 border-violet-300',
  rose: 'bg-pink-100 text-pink-800 border-pink-300',
};
export const COULEURS = Object.keys(CLASSES_COULEUR);

export function PastilleEtiquette({
  etiquette,
  actif,
  onClick,
}: {
  etiquette: Pick<EtiquettePoint, 'nom' | 'couleur'>;
  actif?: boolean;
  onClick?: () => void;
}) {
  const classes = `inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
    CLASSES_COULEUR[etiquette.couleur] ?? CLASSES_COULEUR.ardoise
  }`;
  if (!onClick) return <span className={classes}>{etiquette.nom}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={`${classes} min-h-8 ${actif ? 'ring-2 ring-siipi-600 ring-offset-1' : 'opacity-70 hover:opacity-100'}`}
    >
      {etiquette.nom}
    </button>
  );
}

/** Le libellé d'un champ dans la langue de l'écran, le français à défaut. */
export function libelleChamp(champ: Pick<ChampPoint, 'libelle' | 'libelle_ar'>, langue: string): string {
  return langue.startsWith('ar') && champ.libelle_ar ? champ.libelle_ar : champ.libelle;
}

export function ValeurAffichee({ champ, valeur }: { champ: ChampPoint; valeur: unknown }) {
  const { t, i18n } = useTranslation();
  if (valeur === null || valeur === undefined || valeur === '') return <span className="text-ardoise-300">—</span>;
  if (champ.type === 'oui_non') {
    return (
      <span className={valeur ? 'text-siipi-700' : 'text-red-700'}>{valeur ? t('commun.oui') : t('commun.non')}</span>
    );
  }
  if (champ.type === 'nombre' && typeof valeur === 'number') {
    return <span className="chiffres">{valeur.toLocaleString(i18n.language.startsWith('ar') ? 'ar-TN' : 'fr-FR')}</span>;
  }
  return <span>{String(valeur)}</span>;
}

/**
 * La saisie d'une valeur, selon le type du champ. Elle rend toujours une
 * chaîne (« oui » / « non » pour un booléen) : l'API ramène au bon type et
 * refuse ce qui n'y entre pas, avec la raison.
 */
export function SaisieValeur({
  champ,
  valeur,
  onChange,
  autoFocus,
  libelle,
  onValider,
  sansVide,
}: {
  champ: ChampPoint;
  valeur: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  libelle: string;
  onValider?: () => void;
  /** Filtre : pas de choix « vide », il a son propre opérateur. */
  sansVide?: boolean;
}) {
  const { t } = useTranslation();
  const classe = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-2 text-sm';
  const touche = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && onValider) {
      e.preventDefault();
      onValider();
    }
  };
  if (champ.type === 'oui_non' || champ.type === 'liste') {
    const choix = champ.type === 'oui_non' ? ['oui', 'non'] : champ.options;
    return (
      <select
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        aria-label={libelle}
        autoFocus={autoFocus}
        onKeyDown={touche}
        className={classe}
      >
        {!sansVide && <option value="">—</option>}
        {sansVide && valeur === '' && <option value="">{t('communal.points.filtres.choisir')}</option>}
        {choix.map((c) => (
          <option key={c} value={c}>
            {champ.type === 'oui_non' ? t(`commun.${c}`) : c}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={champ.type === 'date' ? 'date' : 'text'}
      inputMode={champ.type === 'nombre' ? 'decimal' : undefined}
      value={valeur}
      onChange={(e) => onChange(e.target.value)}
      aria-label={libelle}
      autoFocus={autoFocus}
      onKeyDown={touche}
      maxLength={500}
      className={`${classe} ${champ.type === 'texte' ? 'min-w-40' : 'w-36'}`}
    />
  );
}

/** Valeur stockée → valeur de saisie. */
export function versSaisie(champ: ChampPoint, valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  if (champ.type === 'oui_non') return valeur ? 'oui' : 'non';
  return String(valeur);
}

/** Valeur de saisie → ce qu'on envoie : null efface la case. */
export function depuisSaisie(saisie: string): ValeurChamp {
  return saisie.trim() === '' ? null : saisie.trim();
}
