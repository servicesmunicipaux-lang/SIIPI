// « Ma commune dans SIIPI » (refonte, lot 5 ; SPEC_refonte § 2.4).
//
// Les données qui font de SIIPI la référence de la commune — population,
// périmètre, secteurs, circuits, parc, personnel, PCGD, caractérisation,
// contacts — et les registres tenus ce mois-ci. Chaque ligne est présente ou à
// ajouter, s'ouvre sur son formulaire, et dit les indicateurs qu'elle débloque.
//
// CE N'EST PAS UNE NOTE. Pas de pourcentage, pas de jauge, pas de « 12 sur
// 21 » : le compte des lignes présentes deviendrait un score, et un score de
// complétude recréerait le palmarès retiré au lot 1. L'écran est une liste
// de choses à faire ; le seul réglage est de n'y voir que ce qui reste.
//
// Un élément à ajouter ne montre jamais « 0 » : il dit « à ajouter » (règle
// d'or 1.1).

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type CompletudeCommune, type ElementCompletude, type IndicateurCatalogue } from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';
import { LigneACompleter } from '../kpi/LigneACompleter';
import { libelleMois } from '../kpi/temps';

export function MaCommune({
  communeId,
  fnct,
  onOuvrirEcran,
}: {
  communeId: string;
  fnct: boolean;
  onOuvrirEcran: (ecran: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const ar = i18n.language.startsWith('ar');
  const [donnees, setDonnees] = useState<CompletudeCommune | null>(null);
  const [catalogue, setCatalogue] = useState<IndicateurCatalogue[]>([]);
  const [seulementAAjouter, setSeulementAAjouter] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      setDonnees(await api.completudeCommune(communeId));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [communeId, t]);

  useEffect(() => {
    void charger();
    void api.catalogueIndicateurs().then((c) => setCatalogue(c.indicateurs)).catch(() => setCatalogue([]));
  }, [charger]);

  if (erreur && !donnees) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!donnees) return <Chargement />;

  const annee = Number(donnees.jour.slice(0, 4));
  const mois = libelleMois(donnees.jour.slice(0, 7), i18n.language);
  const visibles = (rubrique: ElementCompletude['rubrique']) =>
    donnees.elements.filter((e) => e.rubrique === rubrique && (!seulementAAjouter || !e.present));
  const libelleIndicateur = (code: string) => {
    const k = catalogue.find((c) => c.code === code);
    return k ? (ar ? k.libelle_ar : k.libelle_fr) : code;
  };

  const section = (rubrique: ElementCompletude['rubrique'], titre: string) => {
    const liste = visibles(rubrique);
    return (
      <section className="space-y-3" aria-labelledby={`ma-commune-${rubrique}`}>
        <h2 id={`ma-commune-${rubrique}`} className="text-lg font-semibold text-ardoise-900">{titre}</h2>
        {liste.length === 0 ? (
          <p className="rounded-xl border border-siipi-200 bg-siipi-50 p-3 text-sm text-siipi-900">{t('communal.maCommune.rienAAjouter')}</p>
        ) : (
          <ul className="space-y-3">
            {liste.map((e) => (
              <li key={e.code} className={`rounded-xl border bg-white p-3 ${e.present ? 'border-ardoise-200' : 'border-amber-300'}`}>
                <LigneACompleter
                  nature={e.nature}
                  cible={e.cible}
                  communeId={communeId}
                  annee={annee}
                  catalogue={catalogue}
                  lectureSeule={fnct}
                  onOuvrirEcran={onOuvrirEcran}
                  onFait={charger}
                  libelleBouton={
                    e.nature === 'parametre' ? t(e.present ? 'communal.maCommune.modifier' : 'communal.maCommune.renseigner') : t('communal.maCommune.ajouter')
                  }
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          e.present ? 'bg-siipi-100 text-siipi-900' : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {t(e.present ? 'communal.maCommune.present' : 'communal.maCommune.aAjouter')}
                      </span>
                      <span className="font-medium text-ardoise-900">{ar ? e.libelle_ar : e.libelle_fr}</span>
                    </p>
                    <p className="text-sm text-ardoise-600">{ar ? e.aide_ar : e.aide_fr}</p>
                    {detail(e) && <p className="text-sm text-ardoise-800">{detail(e)}</p>}
                    {e.indicateurs.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 text-xs">
                        <span className="text-ardoise-500">{t(e.present ? 'communal.maCommune.alimente' : 'communal.maCommune.debloque')}</span>
                        {e.indicateurs.map((code) => (
                          <span key={code} className="rounded-full bg-ardoise-100 px-2 py-0.5 text-ardoise-700">
                            {libelleIndicateur(code)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </LigneACompleter>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  /** Ce qu'il y a derrière un élément présent — jamais « 0 » pour un élément à ajouter. */
  function detail(e: ElementCompletude): string | null {
    if (!e.present) return e.annee != null ? t('communal.maCommune.aSaisirPour', { annee: e.annee }) : null;
    if (e.code === 'pcgd') return e.annee != null ? t('communal.maCommune.details.pcgdAdopte', { annee: e.annee }) : t('communal.maCommune.details.pcgdSansAnnee');
    if (e.code === 'caracterisation') return e.annee != null ? t('communal.maCommune.details.caracterisation', { annee: e.annee }) : null;
    if (e.code === 'masse_salariale') return t('communal.maCommune.details.masse_salariale', { annee: e.annee });
    if (e.code === 'perimetre') return t('communal.maCommune.details.perimetre');
    if (e.nombre == null) return null;
    return t(`communal.maCommune.details.${e.code}`, { n: formaterNombre(e.nombre), annee: e.annee, mois });
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.maCommune.titre')}</h1>
        <p className="max-w-3xl text-sm text-ardoise-600">{t('communal.maCommune.chapeau')}</p>
        {fnct && <p className="max-w-3xl text-sm text-ardoise-500">{t('communal.maCommune.fnctLecture')}</p>}
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm text-ardoise-800">
          <input type="checkbox" className="size-4" checked={seulementAAjouter} onChange={(ev) => setSeulementAAjouter(ev.target.checked)} />
          {t('communal.maCommune.seulementAAjouter')}
        </label>
      </header>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>
      )}

      {section('reference', t('communal.maCommune.references'))}
      {section('registre_mois', t('communal.maCommune.registres', { mois }))}
    </div>
  );
}
