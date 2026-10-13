// Le panneau d'un indicateur (refonte, lot 3b ; SPEC_refonte § 3.3).
//
// UN INDICATEUR RENSEIGNÉ s'ouvre sur son graphique : la valeur exacte au
// survol, la période réglable (3, 6, 12 mois, ou cinq ans), la comparaison
// avec l'année précédente, et le repère du gouvernorat quand au moins cinq
// communes y ont une valeur — sans en nommer aucune. Sous le graphique, les
// mêmes données en tableau (lisibles sans le dessin, exportables), puis la
// formule et les sources, en français et en arabe.
//
// UN INDICATEUR NON RENSEIGNÉ s'ouvre sur « Pour calculer cet indicateur, il
// manque : », avec de quoi compléter sur place — le formulaire du registre
// d'ajout, la déclaration, le paramètre de la commune. On complète une donnée
// SOURCE, jamais le résultat (règle d'or 1.1). Une fois la donnée enregistrée,
// l'écran se relit, et le graphique apparaît ici même, sans rechargement.
//
// LE TEMPS VA DE GAUCHE À DROITE, en arabe aussi (SPEC § 6, à confirmer en
// recette) : le graphique est posé dans un bloc « ltr », ses libellés restent
// dans la langue de l'écran.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  api,
  ErreurApi,
  parametresSerie,
  type DependanceIndicateur,
  type IndicateurCatalogue,
  type ManqueIndicateur,
  type PointReference,
  type PointSerie,
  type ResultatIndicateur,
} from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { BoutonExport } from '../BoutonExport';
import { Chargement } from '../Elements';
import { FormulaireDeclaration } from '../ajout/FormulaireDeclaration';
import { FormulairePopulation, FormulaireSeuilsCommune } from '../ajout/FormulairesParametres';
import { CATALOGUE, type EntreeFormulaire } from '../ajout/registre';
import { BadgeSource, ValeurKpi } from './CarteIndicateur';
import { bornesFenetre, decalerMois, finDeMois, libelleMois, type Fenetre } from './temps';

const bouton = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50';

type Ligne = { cle: string; libelle: string; valeur: number | null; source: PointSerie['source'] | null; n1: number | null; reference: number | null };

/** Le formulaire du registre d'ajout dont le type est `cible`, s'il existe. */
const formulaireDuRegistre = (cible: string | null) =>
  CATALOGUE.find((e): e is EntreeFormulaire => 'Formulaire' in e && e.type === cible) ?? null;

export function PanneauIndicateur({
  communeId,
  annee,
  r,
  indicateur,
  catalogue,
  dependances,
  fnct,
  onFermer,
  onModifie,
  onOuvrirEcran,
}: {
  communeId: string;
  annee: number;
  r: ResultatIndicateur;
  indicateur: IndicateurCatalogue | undefined;
  catalogue: IndicateurCatalogue[];
  dependances: DependanceIndicateur[];
  fnct: boolean;
  onFermer: () => void;
  /** Une donnée a été enregistrée : l'écran relit les indicateurs. */
  onModifie: () => Promise<void>;
  /** Ouvrir un écran du portail (absent hors du portail communal). */
  onOuvrirEcran?: (ecran: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const ar = i18n.language.startsWith('ar');
  const mensuel = indicateur?.granularite === 'mensuelle';
  const [fenetre, setFenetre] = useState<Fenetre>(mensuel ? '12m' : 'annees');
  const [comparer, setComparer] = useState(false);
  const [serie, setSerie] = useState<PointSerie[] | null>(null);
  const [serieN1, setSerieN1] = useState<PointSerie[]>([]);
  const [reference, setReference] = useState<PointReference[]>([]);
  const [manques, setManques] = useState<ManqueIndicateur[] | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // Un indicateur d'une autre granularité ne propose pas les fenêtres en mois.
  useEffect(() => setFenetre(mensuel ? '12m' : 'annees'), [r.code, mensuel]);

  const b = useMemo(() => bornesFenetre(annee, fenetre), [annee, fenetre]);

  useEffect(() => {
    let annule = false;
    setSerie(null);
    setErreur(null);
    const n1 = comparer && b.pas === 'mois'
      ? api.serieIndicateur(communeId, r.code, `${decalerMois(b.debut.slice(0, 7), -12)}-01`, finDeMois(decalerMois(b.fin.slice(0, 7), -12)), 'mois')
      : Promise.resolve([] as PointSerie[]);
    Promise.all([
      api.serieIndicateur(communeId, r.code, b.debut, b.fin, b.pas),
      n1,
      api.referenceGouvernorat(communeId, r.code, b.debut, b.fin, b.pas).catch(() => [] as PointReference[]),
    ])
      .then(([s, s1, ref]) => {
        if (annule) return;
        setSerie(s);
        setSerieN1(s1);
        setReference(ref);
      })
      .catch((err) => !annule && setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur')));
    return () => {
      annule = true;
    };
    // La série se relit aussi quand l'indicateur change de valeur ou de statut :
    // c'est ainsi que le graphique apparaît après qu'on l'a complété.
  }, [communeId, r.code, r.statut, r.valeur, b, comparer, t]);

  useEffect(() => {
    if (r.statut !== 'non_renseigne') {
      setManques([]);
      return;
    }
    let annule = false;
    setManques(null);
    api
      .manquesIndicateur(communeId, r.code, annee)
      .then((m) => !annule && setManques(m))
      .catch((err) => !annule && setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur')));
    return () => {
      annule = true;
    };
  }, [communeId, r.code, r.statut, annee, t]);

  // Les lignes du graphique et du tableau : une par mois de la fenêtre (null
  // pour un mois sans valeur — le trou reste un trou), ou une par année.
  const lignes: Ligne[] = useMemo(() => {
    if (!serie) return [];
    const parCle = (points: { periode_debut: string }[], longueur: number) =>
      new Map(points.map((p) => [p.periode_debut.slice(0, longueur), p]));
    if (b.pas === 'mois') {
      const s = parCle(serie, 7);
      const s1 = parCle(serieN1, 7);
      const ref = parCle(reference, 7);
      return b.mois.map((m) => ({
        cle: m,
        libelle: libelleMois(m, i18n.language),
        valeur: (s.get(m) as PointSerie | undefined)?.valeur ?? null,
        source: (s.get(m) as PointSerie | undefined)?.source ?? null,
        n1: (s1.get(decalerMois(m, -12)) as PointSerie | undefined)?.valeur ?? null,
        reference: (ref.get(m) as PointReference | undefined)?.moyenne ?? null,
      }));
    }
    const s = parCle(serie, 4);
    const ref = parCle(reference, 4);
    const premiere = Number(b.debut.slice(0, 4));
    return Array.from({ length: annee - premiere + 1 }, (_, i) => String(premiere + i)).map((a) => ({
      cle: a,
      libelle: a,
      valeur: (s.get(a) as PointSerie | undefined)?.valeur ?? null,
      source: (s.get(a) as PointSerie | undefined)?.source ?? null,
      n1: null,
      reference: (ref.get(a) as PointReference | undefined)?.moyenne ?? null,
    }));
  }, [serie, serieN1, reference, b, annee, i18n.language]);

  const avecValeur = lignes.some((l) => l.valeur !== null);
  const avecReference = lignes.some((l) => l.reference !== null);
  const unite = r.unite ?? '';
  const nombre = (v: number | null) => (v === null ? '—' : `${formaterNombre(v, Math.abs(v) < 10 && !Number.isInteger(v) ? 2 : Number.isInteger(v) ? 0 : 1)}${unite ? ` ${unite}` : ''}`);

  const sources = dependances.filter((d) => d.indicateur_code === r.code);
  const groupes = (liste: { groupe: number }[]) => [...new Set(liste.map((d) => d.groupe))];

  const apresEnregistrement = async () => {
    setOuvert(null);
    await onModifie();
  };

  /** Ce qui complète un élément manquant, sur place quand c'est possible. */
  const action = (m: ManqueIndicateur) => {
    const cle = `${m.groupe}-${m.ordre}`;
    if (fnct) return null;
    if (m.nature === 'ecran') {
      return onOuvrirEcran && m.cible ? (
        <button type="button" className={bouton} onClick={() => onOuvrirEcran(m.cible as string)}>
          {t('kpi.panneau.ouvrirEcran', { ecran: t(`communal.onglets.${m.cible}`) })}
        </button>
      ) : null;
    }
    if (m.nature === 'citoyen' || m.nature === 'fnct') return null;
    const disponible =
      (m.nature === 'formulaire' && formulaireDuRegistre(m.cible)) ||
      (m.nature === 'declaration' && catalogue.some((c) => c.code === m.cible)) ||
      (m.nature === 'parametre' && (m.cible === 'population' || m.cible === 'objectif_balayage'));
    if (!disponible) return null;
    return (
      <button type="button" className={bouton} aria-expanded={ouvert === cle} onClick={() => setOuvert((o) => (o === cle ? null : cle))}>
        {ouvert === cle ? t('commun.annuler') : t('kpi.panneau.completer')}
      </button>
    );
  };

  const formulaire = (m: ManqueIndicateur) => {
    if (ouvert !== `${m.groupe}-${m.ordre}`) return null;
    if (m.nature === 'formulaire') {
      const entree = formulaireDuRegistre(m.cible);
      if (!entree) return null;
      const { Formulaire } = entree;
      return <Formulaire communeId={communeId} onAnnuler={() => setOuvert(null)} onFait={apresEnregistrement} />;
    }
    if (m.nature === 'declaration') {
      const ind = catalogue.find((c) => c.code === m.cible);
      return ind ? (
        <FormulaireDeclaration communeId={communeId} annee={annee} indicateur={ind} onAnnuler={() => setOuvert(null)} onFait={apresEnregistrement} />
      ) : null;
    }
    if (m.cible === 'population') return <FormulairePopulation communeId={communeId} onFait={apresEnregistrement} />;
    if (m.cible === 'objectif_balayage') return <FormulaireSeuilsCommune communeId={communeId} onFait={apresEnregistrement} />;
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-ardoise-900">{ar ? r.libelle_ar : r.libelle_fr}</h2>
          <p className="mt-1 flex flex-wrap items-baseline gap-2">
            <span className="text-xl">
              <ValeurKpi r={r} />
            </span>
            <BadgeSource r={r} />
          </p>
          {r.statut === 'renseigne' && r.taux_atteinte != null && (
            <p className="text-xs text-ardoise-600">{t('kpi.carte.atteinte', { pct: formaterNombre(100 * r.taux_atteinte, 0) })}</p>
          )}
        </div>
        <button type="button" onClick={onFermer} className={`${bouton} shrink-0`}>
          {t('kpi.panneau.fermer')}
        </button>
      </div>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>
      )}

      {/* --- Ce qui manque ------------------------------------------------------ */}
      {r.statut === 'sans_objet' && <p className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">{t('kpi.statuts.aide.sans_objet')}</p>}
      {r.statut === 'non_renseigne' && (
        <section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3" aria-labelledby={`manques-${r.code}`}>
          <h3 id={`manques-${r.code}`} className="font-semibold text-amber-950">{t('kpi.panneau.ilManque')}</h3>
          {manques === null ? (
            <Chargement />
          ) : (
            <ul className="space-y-2">
              {groupes(manques).map((g) => (
                <li key={g} className="space-y-2 rounded-lg bg-white p-2">
                  {manques
                    .filter((m) => m.groupe === g)
                    .map((m, i) => (
                      <div key={`${m.groupe}-${m.ordre}`} className="space-y-2">
                        {i > 0 && <p className="text-xs font-semibold uppercase text-ardoise-500">{t('kpi.panneau.ou')}</p>}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm text-ardoise-900">
                            {ar ? m.libelle_ar : m.libelle_fr}
                            {(m.nature === 'citoyen' || m.nature === 'fnct') && (
                              <span className="block text-xs text-ardoise-500">{t(`kpi.panneau.nature.${m.nature}`)}</span>
                            )}
                          </span>
                          {action(m)}
                        </div>
                        {formulaire(m)}
                      </div>
                    ))}
                </li>
              ))}
            </ul>
          )}
          {fnct && <p className="text-xs text-amber-900">{t('kpi.panneau.fnctLecture')}</p>}
        </section>
      )}

      {/* --- Le graphique -------------------------------------------------------- */}
      <section className="space-y-2" aria-labelledby={`graphique-${r.code}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`graphique-${r.code}`} className="text-sm font-semibold text-ardoise-800">{t('kpi.panneau.evolution')}</h3>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('kpi.panneau.periode')}>
            {(mensuel ? (['3m', '6m', '12m', 'annees'] as const) : (['annees'] as const)).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={fenetre === f}
                onClick={() => setFenetre(f)}
                className={`min-h-9 rounded-full px-3 text-xs font-medium ${fenetre === f ? 'bg-siipi-600 text-white' : 'bg-white text-ardoise-700 ring-1 ring-ardoise-300'}`}
              >
                {t(`kpi.panneau.fenetres.${f}`)}
              </button>
            ))}
          </div>
        </div>
        {b.pas === 'mois' && (
          <label className="flex min-h-10 items-center gap-2 text-sm text-ardoise-700">
            <input type="checkbox" checked={comparer} onChange={(e) => setComparer(e.target.checked)} className="size-4" />
            {t('kpi.panneau.comparer')}
          </label>
        )}
        {!mensuel && indicateur && <p className="text-xs text-ardoise-500">{t(`kpi.carte.granularite.${indicateur.granularite}`)}</p>}

        {serie === null ? (
          <Chargement />
        ) : !avecValeur ? (
          <p className="rounded-lg border border-ardoise-200 bg-white p-3 text-sm text-ardoise-600">{t('kpi.panneau.aucunPoint')}</p>
        ) : (
          <div className="h-56 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={lignes} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                <XAxis dataKey="libelle" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={(v: number) => formaterNombre(v, Number.isInteger(v) ? 0 : 1)} />
                <Tooltip
                  formatter={(v) => (typeof v === 'number' ? nombre(v) : '—')}
                  labelStyle={{ direction: ar ? 'rtl' : 'ltr' }}
                  contentStyle={{ direction: ar ? 'rtl' : 'ltr', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="valeur" name={t('kpi.panneau.serie.valeur')} stroke="#13784f" strokeWidth={2} connectNulls={false} isAnimationActive={false} />
                {comparer && b.pas === 'mois' && (
                  <Line type="monotone" dataKey="n1" name={t('kpi.panneau.serie.n1')} stroke="#6f7c8d" strokeDasharray="5 4" connectNulls={false} isAnimationActive={false} />
                )}
                {avecReference && (
                  <Line type="monotone" dataKey="reference" name={t('kpi.panneau.serie.reference')} stroke="#d97706" strokeDasharray="2 3" dot={false} connectNulls={false} isAnimationActive={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        {serie !== null && avecValeur && !avecReference && <p className="text-xs text-ardoise-500">{t('kpi.panneau.referenceAbsente')}</p>}
      </section>

      {/* --- Les données sous le graphique --------------------------------------- */}
      {serie !== null && avecValeur && (
        <section className="space-y-2" aria-labelledby={`donnees-${r.code}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id={`donnees-${r.code}`} className="text-sm font-semibold text-ardoise-800">{t('kpi.panneau.donnees')}</h3>
            <BoutonExport chemin={`/kpi/serie?${parametresSerie(communeId, r.code, b.debut, b.fin, b.pas)}`} desactive={!avecValeur} />
          </div>
          <div className="overflow-x-auto rounded-lg border border-ardoise-200">
            <table className="w-full text-sm">
              <thead className="bg-ardoise-50 text-xs text-ardoise-600">
                <tr>
                  <th className="px-2 py-1.5 text-start">{t('kpi.panneau.colonnes.periode')}</th>
                  <th className="px-2 py-1.5 text-end">{t('kpi.panneau.serie.valeur')}</th>
                  <th className="px-2 py-1.5 text-start">{t('kpi.panneau.colonnes.source')}</th>
                  {comparer && b.pas === 'mois' && <th className="px-2 py-1.5 text-end">{t('kpi.panneau.serie.n1')}</th>}
                  {avecReference && <th className="px-2 py-1.5 text-end">{t('kpi.panneau.serie.reference')}</th>}
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.cle} className="border-t border-ardoise-100">
                    <td className="px-2 py-1.5">{l.libelle}</td>
                    <td className="chiffres px-2 py-1.5 text-end">{l.valeur === null ? <span className="text-ardoise-400">{t('kpi.statuts.non_renseigne')}</span> : nombre(l.valeur)}</td>
                    <td className="px-2 py-1.5 text-xs">{l.source ? t(`kpi.sources.${l.source}`) : ''}</td>
                    {comparer && b.pas === 'mois' && <td className="chiffres px-2 py-1.5 text-end">{nombre(l.n1)}</td>}
                    {avecReference && <td className="chiffres px-2 py-1.5 text-end">{nombre(l.reference)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* --- La formule et les sources ------------------------------------------- */}
      <section className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-3" aria-labelledby={`formule-${r.code}`}>
        <h3 id={`formule-${r.code}`} className="text-sm font-semibold text-ardoise-800">{t('kpi.panneau.formule')}</h3>
        <p className="text-sm text-ardoise-700">{(ar ? indicateur?.description_ar : indicateur?.description) ?? '—'}</p>
        {sources.length > 0 && (
          <>
            <h4 className="text-xs font-semibold uppercase text-ardoise-500">{t('kpi.panneau.sources')}</h4>
            <ul className="list-disc space-y-1 ps-5 text-sm text-ardoise-700">
              {groupes(sources).map((g) => (
                <li key={g}>
                  {sources
                    .filter((d) => d.groupe === g)
                    .map((d) => (ar ? d.libelle_ar : d.libelle_fr))
                    .join(` ${t('kpi.panneau.ou')} `)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
