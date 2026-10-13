// Le catalogue « + Ajouter » (refonte, lot 2b ; SPEC_refonte § 2.2).
//
// UNE SEULE PORTE. Un directeur ne doit pas savoir OÙ aller avant de savoir
// QUOI faire : le catalogue est rangé par ce qu'il pense — mon équipe, mes
// moyens, mon territoire… —, pas par la structure de la base. Il ouvre le
// formulaire du registre, le même que l'écran métier ; ou, quand l'ajout
// demande un contexte (un voyage attendu, une sélection de points), il
// conduit à l'écran qui le donne et le dit.
//
// Le catalogue ne montre que ce que le rôle a le droit d'ajouter.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { catalogueDuRole, RUBRIQUES, type EcranAjout, type EntreeAjout, type EntreeFormulaire } from './registre';

export function Catalogue({
  communeId,
  role,
  onFermer,
  onEnregistre,
  onOuvrirEcran,
}: {
  communeId: string;
  role: string | undefined;
  onFermer: () => void;
  /** Une ligne a été enregistrée : l'écran ouvert doit se relire. */
  onEnregistre: (type: EntreeFormulaire['type'], fermer: boolean) => void;
  onOuvrirEcran: (ecran: EcranAjout) => void;
}) {
  const { t } = useTranslation();
  const [choix, setChoix] = useState<EntreeFormulaire | null>(null);
  const panneau = useRef<HTMLDivElement>(null);
  const entrees = catalogueDuRole(role);
  // Par une référence : l'appelant passe une fonction neuve à chaque rendu, et
  // l'effet ci-dessous, relancé, rendrait le focus au bouton d'ouverture en
  // plein milieu de la saisie.
  const fermer = useRef(onFermer);
  fermer.current = onFermer;

  // Échap ferme ; le défilement de la page est bloqué tant que le catalogue est
  // ouvert ; le focus y entre, et revient au bouton qui l'a ouvert en sortant.
  useEffect(() => {
    const avant = document.activeElement as HTMLElement | null;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fermer.current();
    };
    document.addEventListener('keydown', surTouche);
    const debordement = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', surTouche);
      document.body.style.overflow = debordement;
      avant?.focus?.();
    };
  }, []);

  useEffect(() => {
    panneau.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus();
  }, [choix]);

  const choisir = (e: EntreeAjout) => {
    if ('Formulaire' in e) setChoix(e);
    else onOuvrirEcran(e.ecran);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-ardoise-900/40 sm:items-start sm:p-6" onClick={onFermer}>
      <div
        ref={panneau}
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalogue-titre"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col overflow-hidden bg-white shadow-xl sm:max-h-[90dvh] sm:max-w-3xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-ardoise-200 px-4 py-3">
          <h2 id="catalogue-titre" className="text-lg font-semibold text-ardoise-900">
            {choix ? t(`ajout.types.${choix.type}`) : t('ajout.catalogue.titre')}
          </h2>
          <button type="button" onClick={onFermer} className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700">
            {t('ajout.catalogue.fermer')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {choix ? (
            <div className="space-y-3">
              <button type="button" onClick={() => setChoix(null)} className="min-h-11 text-sm font-medium text-siipi-700 hover:underline">
                <span aria-hidden="true" className="inline-block rtl:-scale-x-100">←</span> {t('ajout.catalogue.retour')}
              </button>
              <choix.Formulaire
                communeId={communeId}
                onAnnuler={() => setChoix(null)}
                onFait={() => {
                  // Un import se relit avant de fermer : son bilan (créées,
                  // mises à jour, refusées) s'affiche dans le formulaire.
                  const fermer = choix.rubrique !== 'imports';
                  onEnregistre(choix.type, fermer);
                }}
              />
            </div>
          ) : entrees.length === 0 ? (
            <p className="text-sm text-ardoise-600">{t('ajout.catalogue.rien')}</p>
          ) : (
            <div className="space-y-5">
              {RUBRIQUES.map((r) => {
                const lot = entrees.filter((e) => e.rubrique === r);
                if (lot.length === 0) return null;
                return (
                  <section key={r} aria-labelledby={`rubrique-${r}`}>
                    <h3 id={`rubrique-${r}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-ardoise-500">
                      {t(`ajout.rubriques.${r}`)}
                    </h3>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {lot.map((e) => (
                        <li key={e.type}>
                          <button
                            type="button"
                            onClick={() => choisir(e)}
                            className="flex min-h-12 w-full flex-col items-start justify-center rounded-xl border border-ardoise-200 bg-white px-3 py-2 text-start hover:border-siipi-400 hover:bg-siipi-50"
                          >
                            <span className="font-medium text-ardoise-900">{t(`ajout.types.${e.type}`)}</span>
                            {/* La précision (« avec son fichier GPX… ») reste dans le catalogue :
                                le nom court sert aussi au titre du formulaire et à l'annonce. */}
                            {t(`ajout.precisions.${e.type}`, { defaultValue: '' }) && (
                              <span className="text-xs text-ardoise-500">{t(`ajout.precisions.${e.type}`)}</span>
                            )}
                            {'ecran' in e && (
                              <span className="text-xs text-ardoise-500">
                                {t('ajout.catalogue.ouvreEcran', { ecran: t(`communal.onglets.${e.ecran}`) })}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
