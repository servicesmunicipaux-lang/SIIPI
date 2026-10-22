// Les indicateurs d'une commune : ses 5 axes, la couverture de ses
// indicateurs, sa préparation au tri à la source — et les valeurs qu'elle
// déclare (Jalon 8, TDR §3.2.10 ; refonte, lot 1 : plus de barème, de note ni
// de classement). Le même écran sert la commune et, en lecture et en
// commentaire, la FNCT (A2.3 « Visualiser »).
//
// REFONTE, LOT 3b : chaque indicateur est une CARTE — sa valeur, une petite
// courbe de douze mois, sa source en toutes lettres — et s'ouvre sur un
// PANNEAU à côté de la vue : le graphique interactif s'il est renseigné, « ce
// qui manque » s'il ne l'est pas, avec de quoi le compléter sur place.
//
// LA RÈGLE D'OR : UNE DONNÉE MANQUANTE N'EST PAS UN ZÉRO. Un indicateur sans
// source s'affiche « non renseigné » ; un mois sans valeur est un trou dans la
// courbe ; un indice se montre toujours avec ce sur quoi il porte.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  type DependanceIndicateur,
  type IndicateurCatalogue,
  type KpiCommune,
  type PointSeriesCommune,
  type ResultatIndicateur,
} from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { imprimer } from '../../lib/impression';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';
import { DeclarationsIndicateurs } from './DeclarationsIndicateurs';
import { ChiffreCle } from '../ui/ChiffreCle';
import { CarteIndicateur } from './CarteIndicateur';
import { PanneauIndicateur } from './PanneauIndicateur';
import { bornesFenetre } from './temps';

const ANNEE = new Date().getFullYear();
const bouton = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50';

/** Vrai sur grand écran (lg, 64rem) : le panneau se pose à côté des cartes. */
function useGrandEcran() {
  const requete = '(min-width: 64rem)';
  const [grand, setGrand] = useState(() => window.matchMedia(requete).matches);
  useEffect(() => {
    const mq = window.matchMedia(requete);
    const changer = () => setGrand(mq.matches);
    mq.addEventListener('change', changer);
    return () => mq.removeEventListener('change', changer);
  }, []);
  return grand;
}

/** Un indice sur 100, ou « non renseigné » — et ce sur quoi il porte. */
function Indice({ valeur, renseignes, total }: { valeur: number | null; renseignes: number; total: number }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      {valeur == null ? (
        <p className="text-sm text-ardoise-500" title={t('kpi.statuts.aide.non_renseigne')}>{t('kpi.statuts.non_renseigne')}</p>
      ) : (
        <p><ChiffreCle valeur={formaterNombre(valeur, 1)} unite="/ 100" taille="md" /></p>
      )}
      <p className="text-xs text-ardoise-500">{t('kpi.renseignes', { n: renseignes, total })}</p>
    </div>
  );
}

export function IndicateursCommune({
  communeId,
  fnct = false,
  codeInitial = null,
  onOuvrirEcran,
}: {
  communeId: string;
  fnct?: boolean;
  /** L'indicateur dont le panneau s'ouvre d'emblée (un lien de l'accueil du portail). */
  codeInitial?: string | null;
  /** Ouvrir un écran du portail depuis « ce qui manque » (portail communal seulement). */
  onOuvrirEcran?: (ecran: string) => void;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const [annee, setAnnee] = useState(ANNEE);
  const [vue, setVue] = useState<'tableau' | 'declarations'>('tableau');
  const [kpi, setKpi] = useState<KpiCommune | null>(null);
  const [catalogue, setCatalogue] = useState<IndicateurCatalogue[]>([]);
  const [dependances, setDependances] = useState<DependanceIndicateur[]>([]);
  const [series, setSeries] = useState<PointSeriesCommune[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choisi, setChoisi] = useState<string | null>(codeInitial);
  const bloc = useRef<HTMLDivElement>(null);
  const grandEcran = useGrandEcran();
  const douzeMois = bornesFenetre(annee, '12m');

  const charger = useCallback(async () => {
    try {
      const [k, s] = await Promise.all([
        api.kpiCommune(communeId, annee),
        // Les petites courbes : un seul appel pour toutes les séries mensuelles.
        api.seriesCommune(communeId, douzeMois.debut, douzeMois.fin).catch(() => [] as PointSeriesCommune[]),
      ]);
      setKpi(k);
      setSeries(s);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [communeId, annee, douzeMois.debut, douzeMois.fin, t]);

  useEffect(() => {
    setKpi(null);
    void charger();
  }, [charger]);

  useEffect(() => {
    void api.catalogueIndicateurs().then((c) => setCatalogue(c.indicateurs)).catch(() => setCatalogue([]));
    void api.dependancesIndicateurs().then(setDependances).catch(() => setDependances([]));
  }, []);

  if (erreur && !kpi) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!kpi) return <Chargement />;

  const indicateurs = kpi.indicateurs.filter((r) => r.famille === 'indicateur');
  const dma = kpi.indicateurs.filter((r) => r.famille === 'dma');
  const donnees = kpi.indicateurs.filter((r) => r.famille === 'donnee');
  const choisiR = kpi.indicateurs.find((r) => r.code === choisi) ?? null;
  const parCode = new Map(catalogue.map((c) => [c.code, c]));

  /** Les douze mois d'un indicateur mensuel, `null` pour un mois sans valeur. */
  const courbe = (code: string): (number | null)[] | null => {
    if (parCode.get(code)?.granularite !== 'mensuelle') return null;
    const points = new Map(series.filter((p) => p.code === code).map((p) => [p.periode_debut.slice(0, 7), p.valeur]));
    return douzeMois.mois.map((m) => points.get(m) ?? null);
  };

  const grille = (liste: ResultatIndicateur[]) => (
    <ul className={`grid gap-4 ${choisiR ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
      {liste.map((r) => (
        <li key={r.code}>
          <CarteIndicateur
            r={r}
            indicateur={parCode.get(r.code)}
            courbe={courbe(r.code)}
            mois={douzeMois.mois}
            choisie={choisi === r.code}
            onChoisir={() => setChoisi((c) => (c === r.code ? null : r.code))}
          />
        </li>
      ))}
    </ul>
  );

  const panneau = choisiR && (
    <PanneauIndicateur
      key={choisiR.code}
      communeId={communeId}
      annee={annee}
      r={choisiR}
      indicateur={parCode.get(choisiR.code)}
      catalogue={catalogue}
      dependances={dependances}
      fnct={fnct}
      onFermer={() => setChoisi(null)}
      onModifie={charger}
      onOuvrirEcran={onOuvrirEcran}
    />
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ardoise-900">{t('kpi.titre', { commune: kpi.nom })}</h1>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-500">{t('kpi.chapeau')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm">
            <span className="sr-only">{t('kpi.annee')}</span>
            <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))} className="min-h-10 rounded-lg border border-ardoise-300 bg-white px-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <option key={i} value={ANNEE - i}>
                  {ANNEE - i}
                </option>
              ))}
            </select>
          </label>
          {(['tableau', 'declarations'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vue === v}
              onClick={() => setVue(v)}
              className={`min-h-10 rounded-full px-4 text-sm font-medium ${vue === v ? 'bg-siipi-600 text-white' : 'bg-white text-ardoise-700 ring-1 ring-ardoise-300'}`}
            >
              {t(`kpi.vues.${v}`)}
            </button>
          ))}
        </div>
      </header>

      {vue === 'declarations' ? (
        <DeclarationsIndicateurs
          communeId={communeId}
          annee={annee}
          fnct={fnct}
          sources={Object.fromEntries(kpi.indicateurs.map((r) => [r.code, r.source]))}
          onModifiee={() => void charger()}
        />
      ) : (
        <div className="lg:flex lg:items-start lg:gap-4">
          <div ref={bloc} className="min-w-0 flex-1 space-y-4">
            {/* --- La couverture et la préparation DMA --------------------------- */}
            <section className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-ardoise-200 bg-white p-4 lg:col-span-2">
                <h2 className="font-semibold text-ardoise-900">{t('kpi.couverture.titre')}</h2>
                <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <ChiffreCle valeur={formaterNombre(kpi.couverture.calculables, 0)} taille="xl" />
                  <span className="text-base text-ardoise-700">{t('kpi.couverture.suite', { total: kpi.couverture.total })}</span>
                </p>
                <p className="mt-3 max-w-prose text-sm text-ardoise-500">{t('kpi.couverture.aide')}</p>
              </div>
              <div className="rounded-xl border border-ardoise-200 bg-white p-4">
                <h2 className="font-semibold text-ardoise-900">{t('kpi.dma.titre')}</h2>
                <p className="mt-1 rounded bg-blue-50 p-2 text-xs text-blue-900">
                  {kpi.parametres.dma_en_vigueur === 1 ? t('kpi.dma.enVigueur') : t('kpi.dma.anticipation')}
                </p>
                <div className="mt-3">
                  <Indice valeur={kpi.dma.indice} renseignes={kpi.dma.renseignes} total={kpi.dma.total} />
                  <p className="mt-1 text-sm font-medium text-ardoise-800">{t(`kpi.dma.niveaux.${kpi.dma.niveau}`)}</p>
                </div>
              </div>
            </section>

            {/* --- Les 5 axes ---------------------------------------------------- */}
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {kpi.axes.map((a) => (
                <a key={a.axe} href={`#axe-${a.axe}`} className="rounded-xl border border-ardoise-200 bg-white p-4 hover:border-siipi-300">
                  <p className="text-xs font-semibold text-siipi-700">{t('kpi.axe', { n: a.axe })}</p>
                  <p className="mb-3 text-sm font-medium leading-snug text-ardoise-900">{t(`kpi.axes.${a.axe}`)}</p>
                  <Indice valeur={a.indice} renseignes={a.renseignes} total={a.notes} />
                </a>
              ))}
            </section>

            {/* --- Les indicateurs, par axe : une carte chacun ---------------------- */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-ardoise-900">{t('kpi.parAxe')}</h2>
                <button
                  type="button"
                  className={bouton}
                  onClick={() =>
                    bloc.current &&
                    imprimer(bloc.current, {
                      titre: t('kpi.impression.titre', { commune: kpi.nom, annee }),
                      details: [
                        t('kpi.couverture.texte', { calculables: kpi.couverture.calculables, total: kpi.couverture.total }),
                        f.date(new Date(), { heure: true }),
                      ],
                      paysage: true,
                    })
                  }
                >
                  {t('kpi.impression.bouton')}
                </button>
              </div>
              <p className="text-sm text-ardoise-500">{t('kpi.carte.aide')}</p>
              {[1, 2, 3, 4, 5].map((axe) => {
                const liste = indicateurs.filter((r) => r.axe === axe);
                if (liste.length === 0) return null;
                return (
                  <div key={axe} id={`axe-${axe}`} className="scroll-mt-4 space-y-2">
                    <h3 className="text-sm font-medium text-ardoise-700">{t('kpi.axeNomme', { n: axe, nom: t(`kpi.axes.${axe}`) })}</h3>
                    {grille(liste)}
                  </div>
                );
              })}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-ardoise-700">{t('kpi.dma.titre')}</h3>
                {grille(dma)}
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-ardoise-700">{t('kpi.donnees.titre')}</h3>
                <p className="text-xs text-ardoise-500">{t('kpi.donnees.aide')}</p>
                {grille(donnees)}
              </div>
            </section>
          </div>

          {/* Le panneau : à côté de la vue sur grand écran ; par-dessus, en plein
              écran, sur téléphone — à côté, il écraserait les cartes. En plein
              écran, il est posé à la racine du document : la colonne du contenu
              est « isolate » (pour contenir les cartes Leaflet), et le bouton
              flottant « + Ajouter » passerait sinon par-dessus. */}
          {panneau &&
            (grandEcran ? (
              <aside
                aria-label={t('kpi.panneau.titre')}
                className="sticky top-4 max-h-[calc(100dvh-2rem)] w-[28rem] shrink-0 overflow-y-auto rounded-xl border border-ardoise-200 bg-ardoise-50 p-4"
              >
                {panneau}
              </aside>
            ) : (
              createPortal(
                <aside aria-label={t('kpi.panneau.titre')} className="fixed inset-0 z-[70] overflow-y-auto bg-ardoise-50 p-4">
                  {panneau}
                </aside>,
                document.body
              )
            ))}
        </div>
      )}
    </div>
  );
}
