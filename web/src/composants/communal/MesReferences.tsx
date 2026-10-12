// Les références de la commune (refonte, lot 2a ; SPEC_refonte § 2.3) : son
// PCGD et la caractérisation de ses déchets, avec la composition retenue.
//
// LA COMPOSITION RETENUE DIT TOUJOURS D'OÙ ELLE VIENT. « PCGD 2026 » n'a pas
// le même poids que « moyenne nationale ANGeD 2022 » : un chiffre de
// valorisation calculé sur la seconde décrit le pays, pas la commune. Sans
// étude ni moyenne nationale saisie, l'écran dit « non renseignée » — il
// n'invente pas une composition par défaut (règle d'or 1.1).
//
// La FNCT lit cet écran ; elle n'y ajoute rien (la commune décide).

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  type Caracterisation,
  type CaracterisationRetenue,
  type FractionReference,
  type Pcgd,
} from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';
import { formulaireAjout, type TypeAjout } from '../ajout/registre';

type Donnees = {
  plans: Pcgd[];
  caracterisations: Caracterisation[];
  retenue: CaracterisationRetenue;
  fractions: FractionReference[];
};

const boutonDiscret = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700';

export function MesReferences({ communeId, fnct = false }: { communeId: string; fnct?: boolean }) {
  const { t, i18n } = useTranslation();
  const [d, setD] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ajout, setAjout] = useState<TypeAjout | null>(null);

  const charger = useCallback(async () => {
    try {
      const [plans, caracterisations, retenue, fractions] = await Promise.all([
        api.pcgd(communeId),
        api.caracterisations(communeId),
        api.caracterisationRetenue(communeId),
        api.fractionsReference(),
      ]);
      setD({ plans, caracterisations, retenue, fractions });
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [communeId, t]);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (erreur && !d) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!d) return <Chargement />;

  const libelleFraction = (code: string) => {
    const fr = d.fractions.find((x) => x.code === code);
    if (!fr) return code;
    return i18n.language === 'ar' ? fr.libelle_ar : fr.libelle_fr;
  };

  const retirer = async (table: 'pcgd' | 'caracterisations', id: string) => {
    if (!window.confirm(t('communal.references.confirmerRetrait'))) return;
    try {
      await api.retirerReference(table, id);
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  const Ajout = ajout ? formulaireAjout(ajout).Formulaire : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.references.titre')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-ardoise-500">{t('communal.references.chapeau')}</p>
      </header>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>
      )}

      <CompositionRetenue retenue={d.retenue} libelleFraction={libelleFraction} />

      {Ajout && (
        <Ajout
          communeId={communeId}
          onAnnuler={() => setAjout(null)}
          onFait={async () => {
            setAjout(null);
            await charger();
          }}
        />
      )}

      <section className="space-y-2" aria-labelledby="refs-pcgd">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="refs-pcgd" className="text-base font-semibold text-ardoise-900">{t('communal.references.pcgd')}</h2>
          {!fnct && ajout === null && (
            <button type="button" onClick={() => setAjout('pcgd')} className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white">
              {t('communal.references.ajouterPcgd')}
            </button>
          )}
        </div>
        {d.plans.length === 0 ? (
          <p className="rounded-xl border border-ardoise-200 bg-white p-4 text-sm text-ardoise-500">{t('communal.references.aucunPcgd')}</p>
        ) : (
          <ul className="space-y-2">
            {d.plans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ardoise-200 bg-white p-4">
                <div className="min-w-0">
                  <p className="font-medium text-ardoise-900">
                    {t(`ajout.pcgd.statuts.${p.statut}`)}
                    {p.annee_adoption ? ` ${p.annee_adoption}` : ''}
                    {p.horizon ? ` — ${t('communal.references.horizon', { annee: p.horizon })}` : ''}
                  </p>
                  <p className="text-xs text-ardoise-500">
                    {[p.bureau_etudes, p.rapport_titre, p.saisi_par].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {!fnct && (
                  <button type="button" onClick={() => void retirer('pcgd', p.id)} className={boutonDiscret}>
                    {t('communal.references.retirer')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="refs-carac">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="refs-carac" className="text-base font-semibold text-ardoise-900">{t('communal.references.caracterisations')}</h2>
          {!fnct && ajout === null && (
            <button type="button" onClick={() => setAjout('caracterisation')} className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white">
              {t('communal.references.ajouterCaracterisation')}
            </button>
          )}
        </div>
        {d.caracterisations.length === 0 ? (
          <p className="rounded-xl border border-ardoise-200 bg-white p-4 text-sm text-ardoise-500">{t('communal.references.aucuneCaracterisation')}</p>
        ) : (
          <ul className="space-y-2">
            {d.caracterisations.map((c) => (
              <li key={c.id} className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ardoise-900">
                      {t(`ajout.caracterisation.niveaux.${c.niveau_source}`)} {c.annee}
                      {c.id === d.retenue?.caracterisation_id && (
                        <span className="ms-2 rounded bg-siipi-100 px-1.5 py-0.5 text-xs font-semibold text-siipi-800">
                          {t('communal.references.retenue')}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-ardoise-500">
                      {[c.saison ? t(`ajout.caracterisation.saisons.${c.saison}`) : null, c.methode, c.saisi_par].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {/* La moyenne nationale appartient à la FNCT : la commune ne la retire pas. */}
                  {!fnct && c.commune_id !== null && (
                    <button type="button" onClick={() => void retirer('caracterisations', c.id)} className={boutonDiscret}>
                      {t('communal.references.retirer')}
                    </button>
                  )}
                </div>
                <Fractions fractions={c.fractions ?? []} libelleFraction={libelleFraction} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CompositionRetenue({
  retenue,
  libelleFraction,
}: {
  retenue: CaracterisationRetenue;
  libelleFraction: (code: string) => string;
}) {
  const { t } = useTranslation();
  if (!retenue) {
    return (
      <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" aria-live="polite">
        <p className="font-semibold">{t('communal.references.compositionNonRenseignee')}</p>
        <p className="mt-1">{t('communal.references.compositionNonRenseigneeAide')}</p>
      </section>
    );
  }
  const nationale = retenue.niveau_source === 'moyenne_nationale_anged';
  return (
    <section
      className={`space-y-3 rounded-xl border p-4 ${nationale ? 'border-amber-300 bg-amber-50' : 'border-siipi-200 bg-siipi-50'}`}
      aria-live="polite"
    >
      <p className={`font-semibold ${nationale ? 'text-amber-900' : 'text-siipi-900'}`}>
        {nationale
          ? t('communal.references.compositionNationale', { annee: retenue.annee })
          : t('communal.references.compositionRetenue', {
              source: t(`ajout.caracterisation.niveaux.${retenue.niveau_source}`),
              annee: retenue.annee,
            })}
      </p>
      <Fractions fractions={retenue.fractions ?? []} libelleFraction={libelleFraction} />
    </section>
  );
}

function Fractions({
  fractions,
  libelleFraction,
}: {
  fractions: { fraction: string; pourcentage: number }[];
  libelleFraction: (code: string) => string;
}) {
  return (
    <ul className="grid gap-1 sm:grid-cols-2">
      {fractions.map((f) => (
        <li key={f.fraction} className="text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-ardoise-700">{libelleFraction(f.fraction)}</span>
            <span className="tabular-nums font-medium text-ardoise-900" dir="ltr">{formaterNombre(f.pourcentage, 1)} %</span>
          </div>
          <div className="mt-0.5 h-1.5 rounded bg-ardoise-100" aria-hidden="true">
            <div className="h-1.5 rounded bg-siipi-500" style={{ width: `${Math.min(100, Math.max(0, f.pourcentage))}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
