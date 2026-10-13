// Le cadre commun des formulaires d'ajout : un titre, une phrase d'aide, les
// champs, l'erreur de l'API telle qu'elle est (elle dit quoi faire), puis
// « Enregistrer » et « Annuler ». Le même cadre partout : un directeur qui a
// rempli un formulaire sait remplir les autres.

import type { FormEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export const champAjout = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';

export function CadreAjout({
  id,
  titre,
  aide,
  erreur,
  enregistrable,
  envoi,
  onEnregistrer,
  onAnnuler,
  children,
}: {
  /** Préfixe des identifiants : le titre s'appelle `${id}-titre`. */
  id: string;
  titre: string;
  aide?: string;
  erreur: string | null;
  enregistrable: boolean;
  envoi: boolean;
  onEnregistrer: () => void | Promise<void>;
  /** Absent quand le formulaire reste ouvert au-dessus d'une liste (registres, carnet). */
  onAnnuler?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    if (enregistrable && !envoi) void onEnregistrer();
  };
  return (
    <form onSubmit={soumettre} className="space-y-4 rounded-xl border border-siipi-200 bg-siipi-50/40 p-4" aria-labelledby={`${id}-titre`}>
      <div>
        <h2 id={`${id}-titre`} className="text-base font-semibold text-ardoise-900">{titre}</h2>
        {aide && <p className="mt-1 text-sm text-ardoise-600">{aide}</p>}
      </div>
      {children}
      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={envoi || !enregistrable} className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40">
          {t('ajout.enregistrer')}
        </button>
        {onAnnuler && (
          <button type="button" onClick={onAnnuler} className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-4 text-sm text-ardoise-700">
            {t('commun.annuler')}
          </button>
        )}
      </div>
    </form>
  );
}
