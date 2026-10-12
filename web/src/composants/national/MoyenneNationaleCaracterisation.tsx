// La moyenne nationale de l'ANGeD (refonte, lot 2a ; SPEC_refonte § 2.3 c).
//
// C'est la composition que reçoit une commune sans étude propre — étiquetée
// comme telle. Tant que la FNCT ne l'a pas saisie, il n'y en a pas, et les
// communes sans étude lisent « non renseignée » : la plateforme ne la remplace
// pas par des chiffres trouvés ailleurs (règle d'or 1.1).
//
// Le formulaire est celui des communes (registre ajout/), sans commune.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Caracterisation, type FractionReference } from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { FormulaireCaracterisation } from '../ajout/FormulaireCaracterisation';

export function MoyenneNationaleCaracterisation() {
  const { t, i18n } = useTranslation();
  const [liste, setListe] = useState<Caracterisation[] | null>(null);
  const [fractions, setFractions] = useState<FractionReference[]>([]);
  const [ajout, setAjout] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const [l, f] = await Promise.all([api.caracterisations(null), api.fractionsReference()]);
      setListe(l);
      setFractions(f);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [t]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const libelle = (code: string) => {
    const fr = fractions.find((x) => x.code === code);
    if (!fr) return code;
    return i18n.language === 'ar' ? fr.libelle_ar : fr.libelle_fr;
  };

  const retirer = async (id: string) => {
    if (!window.confirm(t('communal.references.confirmerRetrait'))) return;
    try {
      await api.retirerReference('caracterisations', id);
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4" aria-labelledby="moyenne-nationale-titre">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="moyenne-nationale-titre" className="font-semibold text-ardoise-900">{t('national.moyenneNationale.titre')}</h3>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-600">{t('national.moyenneNationale.intro')}</p>
        </div>
        {!ajout && (
          <button type="button" onClick={() => setAjout(true)} className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white">
            {t('national.moyenneNationale.ajouter')}
          </button>
        )}
      </div>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>
      )}

      {ajout && (
        <FormulaireCaracterisation
          communeId={null}
          onAnnuler={() => setAjout(false)}
          onFait={async () => {
            setAjout(false);
            await charger();
          }}
        />
      )}

      {liste && liste.length === 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{t('national.moyenneNationale.aucune')}</p>
      )}
      {liste && liste.length > 0 && (
        <ul className="space-y-2">
          {liste.map((c) => (
            <li key={c.id} className="space-y-1 rounded-lg border border-ardoise-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ardoise-900">
                  {t('ajout.caracterisation.niveaux.moyenne_nationale_anged')} {c.annee}
                  {c.methode ? <span className="font-normal text-ardoise-500"> · {c.methode}</span> : null}
                </p>
                <button
                  type="button"
                  onClick={() => void retirer(c.id)}
                  className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700"
                >
                  {t('communal.references.retirer')}
                </button>
              </div>
              <p className="text-xs text-ardoise-600">
                {(c.fractions ?? []).map((f) => `${libelle(f.fraction)} ${formaterNombre(f.pourcentage, 1)} %`).join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
