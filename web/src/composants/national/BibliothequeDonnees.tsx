// La bibliothèque nationale des données (jalon D, lot D4 ; SPEC_D_pret_a_presenter.md).
//
// Un catalogue de tout ce que SIIPI réunit sur la gestion des déchets, par territoire. Neuf éléments en
// trois groupes — documents, références, séries — chacun avec « N communes sur M », sa période et sa
// provenance. C'est ce qui dit, à la FNCT comme au ministère qui la regarde, ce que la plateforme
// CAPITALISE : ce qui existe, d'où cela vient, et ce qui manque.
//
// LECTURE SEULE, ET SANS FICHIERS. La bibliothèque ne crée aucune donnée et n'ouvre aucun fichier : un
// rapport est listé (titre, auteur, année), jamais téléchargé d'ici — les fichiers restent dans leur
// commune. Elle ne classe personne : les territoires viennent dans l'ordre alphabétique.
//
// UNE DONNÉE ABSENTE SE DIT, ELLE NE SE CHIFFRE PAS À ZÉRO À LA PLACE D'UNE AUTRE. « Aucune commune sur 350 »
// est un fait (personne n'a de PCGD dans SIIPI), dit en mots, sur une carte discrète ; une date qui
// n'existe pas reste vide. Les pesées gardent leur nature « pesé », la population dit si elle est déclarée
// ou estimée : rien ne se mélange.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type BibliothequeCatalogue, type BibliothequeDetail } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { BoutonExport } from '../BoutonExport';
import { Chargement, Erreur } from '../Elements';
import { ChiffreCle } from '../ui/ChiffreCle';
import { Pastille, type TonPastille } from '../ui/Pastille';

type Element = BibliothequeCatalogue['elements'][number];
type Ligne = BibliothequeDetail['lignes'][number];

const GROUPES = ['documents', 'references', 'series'] as const;

/** Une valeur de répartition dit sa nature : « pesé » est une mesure, le reste une information. */
const tonDe = (valeur: string): TonPastille => (valeur === 'pese' ? 'mesure' : valeur === 'declaree' ? 'declare' : 'neutre');

const sansAccent = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function BibliothequeDonnees() {
  const { t, i18n } = useTranslation();
  const ar = i18n.language.startsWith('ar');
  const f = useFormats();
  const [catalogue, setCatalogue] = useState<BibliothequeCatalogue | null>(null);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [detail, setDetail] = useState<BibliothequeDetail | null>(null);
  const [niveau, setNiveau] = useState<'gouvernorats' | 'districts'>('gouvernorats');
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const panneau = useRef<HTMLElement>(null);

  const charger = useCallback(async () => {
    try {
      setCatalogue(await api.bibliotheque());
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [t]);

  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => {
    if (!choisi) return;
    let annule = false;
    setDetail(null);
    setRecherche('');
    api
      .bibliothequeElement(choisi)
      .then((d) => !annule && setDetail(d))
      .catch((err) => !annule && setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur')));
    return () => {
      annule = true;
    };
  }, [choisi, t]);

  // Les communes qui tiennent l'élément, avec leurs lignes, dans l'ordre alphabétique.
  const communes = useMemo(() => {
    if (!detail) return [];
    const terme = sansAccent(recherche.trim());
    const parCommune = new Map<string, { id: string; nom: string; nomAr: string | null; gouvernorat: string; lignes: Ligne[] }>();
    for (const l of detail.lignes) {
      const c = parCommune.get(l.commune_id) ?? { id: l.commune_id, nom: l.commune, nomAr: l.commune_ar, gouvernorat: l.gouvernorat, lignes: [] };
      c.lignes.push(l);
      parCommune.set(l.commune_id, c);
    }
    return [...parCommune.values()]
      .filter((c) => !terme || sansAccent(c.nom).includes(terme) || sansAccent(c.gouvernorat).includes(terme) || (c.nomAr ?? '').includes(recherche.trim()))
      .sort((a, b) => a.gouvernorat.localeCompare(b.gouvernorat, 'fr') || a.nom.localeCompare(b.nom, 'fr'));
  }, [detail, recherche]);

  if (erreur && !catalogue) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!catalogue) return <Chargement />;

  const valeur = (code: string) => t(`national.bibliotheque.valeurs.${code}`, { defaultValue: code });
  const periode = (e: { premiere: string | null; derniere: string | null }) =>
    e.premiere && e.derniere
      ? t('national.bibliotheque.periode', { debut: f.date(e.premiere), fin: f.date(e.derniere) })
      : e.derniere
        ? t('national.bibliotheque.jusquau', { date: f.date(e.derniere) })
        : null;

  const carte = (e: Element) => {
    const aucune = e.communes_avec === 0;
    const sel = choisi === e.element;
    return (
      <li key={e.element}>
        <button
          type="button"
          aria-pressed={sel}
          onClick={() => {
            setChoisi(sel ? null : e.element);
            if (!sel) setTimeout(() => panneau.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
          }}
          className={`flex h-full w-full flex-col gap-3 rounded-lg border p-4 text-start transition-colors hover:border-siipi-400 ${
            aucune ? 'border-dashed border-ardoise-300 bg-ardoise-50/60' : 'border-ardoise-200 border-s-4 border-s-siipi-600 bg-white'
          } ${sel ? 'ring-2 ring-siipi-300' : ''}`}
        >
          <span className="text-sm font-medium leading-snug text-ardoise-800">{t(`national.bibliotheque.elements.${e.element}.libelle`)}</span>
          {aucune ? (
            <span className="text-sm text-ardoise-600">{t('national.bibliotheque.aucune', { total: formaterNombre(catalogue.communes_total) })}</span>
          ) : (
            <>
              <span>
                <ChiffreCle valeur={formaterNombre(e.communes_avec)} unite={`/ ${formaterNombre(catalogue.communes_total)}`} />
              </span>
              <span className="text-sm text-ardoise-600">
                {t('national.bibliotheque.communesAvec', { n: formaterNombre(e.communes_avec), total: formaterNombre(catalogue.communes_total) })}
              </span>
            </>
          )}
          <span className="text-xs text-ardoise-500">{t(`national.bibliotheque.elements.${e.element}.aide`)}</span>
          {!aucune && (
            <span className="mt-auto space-y-1.5 pt-1">
              <span className="block text-xs text-ardoise-700">
                <span className="chiffres font-semibold">{formaterNombre(e.nombre)}</span> {t(`national.bibliotheque.elements.${e.element}.unite`)}
                {periode(e) && <span className="text-ardoise-500"> · {periode(e)}</span>}
              </span>
              {Object.keys(e.repartition).length > 0 && (
                <span className="flex flex-wrap gap-1.5">
                  {Object.entries(e.repartition).map(([code, n]) => (
                    <Pastille key={code} ton={tonDe(code)}>
                      {valeur(code)} · {formaterNombre(n)}
                    </Pastille>
                  ))}
                </span>
              )}
            </span>
          )}
        </button>
      </li>
    );
  };

  /** Une ligne de commune : un document (titre, auteur, année, statut) ou le résumé d'une série. */
  const ligne = (l: Ligne, element: string) => {
    const documentaire = detail?.groupe === 'documents' || element === 'caracterisation';
    if (documentaire) {
      return (
        <li key={`${l.intitule}-${l.annee}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-medium text-ardoise-900">{l.intitule && element === 'caracterisation' ? valeur(l.intitule) : (l.intitule ?? '')}</span>
          {l.annee != null && <span className="chiffres text-ardoise-600">{l.annee}</span>}
          {l.auteur && <span className="text-ardoise-600">{l.auteur}</span>}
          {l.statut && element !== 'caracterisation' && <Pastille ton="neutre">{valeur(l.statut)}</Pastille>}
          {l.derniere && <span className="text-xs text-ardoise-500">{f.date(l.derniere)}</span>}
        </li>
      );
    }
    return (
      <li key={l.commune_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="chiffres font-semibold text-ardoise-900">{formaterNombre(l.nombre)}</span>
        <span className="text-ardoise-700">{t(`national.bibliotheque.elements.${element}.unite`)}</span>
        {l.nature && <Pastille ton={tonDe(l.nature)}>{valeur(l.nature)}</Pastille>}
        {l.mois_couverts != null && <span className="text-ardoise-600">{t('national.bibliotheque.moisCouverts', { count: l.mois_couverts })}</span>}
        {periode(l) && <span className="text-xs text-ardoise-500">{periode(l)}</span>}
      </li>
    );
  };

  const territoires = detail ? detail[niveau] : [];

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-ardoise-900">{t('national.bibliotheque.titre')}</h1>
        <p className="max-w-3xl text-sm text-ardoise-600">{t('national.bibliotheque.chapeau')}</p>
      </header>

      {erreur && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>}

      {GROUPES.map((g) => (
        <section key={g} aria-labelledby={`bibliotheque-${g}`} className="space-y-3">
          <h2 id={`bibliotheque-${g}`} className="text-lg font-semibold text-ardoise-900">{t(`national.bibliotheque.groupes.${g}`)}</h2>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-4">{catalogue.elements.filter((e) => e.groupe === g).map(carte)}</ul>
        </section>
      ))}

      {choisi && (
        <section ref={panneau} aria-labelledby="bibliotheque-detail" className="scroll-mt-4 space-y-5 rounded-lg border border-ardoise-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 id="bibliotheque-detail" className="text-lg font-semibold text-ardoise-900">{t(`national.bibliotheque.elements.${choisi}.libelle`)}</h2>
              {detail && (
                <p className="text-sm text-ardoise-600">
                  {detail.communes_avec === 0
                    ? t('national.bibliotheque.aucune', { total: formaterNombre(detail.communes_total) })
                    : t('national.bibliotheque.communesAvec', { n: formaterNombre(detail.communes_avec), total: formaterNombre(detail.communes_total) })}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <BoutonExport chemin={`/bibliotheque/lignes?element=${encodeURIComponent(choisi)}`} desactive={!detail || detail.lignes.length === 0} />
              <button type="button" onClick={() => setChoisi(null)} className="min-h-10 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50">
                {t('national.bibliotheque.fermer')}
              </button>
            </div>
          </div>

          {!detail ? (
            <Chargement />
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ardoise-800">{t('national.bibliotheque.parTerritoire')}</h3>
                  <div className="flex gap-1" role="group" aria-label={t('national.deploiement.niveau')}>
                    {(['gouvernorats', 'districts'] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={niveau === n}
                        onClick={() => setNiveau(n)}
                        className={`min-h-9 rounded-full px-3 text-xs font-medium ${niveau === n ? 'bg-siipi-600 text-white' : 'bg-white text-ardoise-700 ring-1 ring-ardoise-300'}`}
                      >
                        {t(`kpi.national.niveaux.${n === 'districts' ? 'district' : 'gouvernorat'}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto rounded-lg border border-ardoise-200">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead className="border-b border-ardoise-200 bg-ardoise-50 text-xs text-ardoise-600">
                      <tr>
                        <th className="px-3 py-2 text-start">{t(`kpi.national.niveaux.${niveau === 'districts' ? 'district' : 'gouvernorat'}`)}</th>
                        <th className="px-3 py-2 text-end">{t('national.bibliotheque.colCommunes')}</th>
                        <th className="px-3 py-2 text-end">{t('national.bibliotheque.colEn')}</th>
                        <th className="px-3 py-2 text-end">{t(`national.bibliotheque.elements.${choisi}.unite`)}</th>
                        <th className="px-3 py-2 text-end">{t('national.bibliotheque.colDerniere')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {territoires.map((x) => (
                        <tr key={x.cle} className="border-t border-ardoise-100">
                          <td className="px-3 py-2 font-medium text-ardoise-900">{x.cle === 'non_rattache' ? t('kpi.national.nonRattache') : x.nom}</td>
                          <td className="chiffres px-3 py-2 text-end text-ardoise-700">{formaterNombre(x.communes)}</td>
                          <td className={`chiffres px-3 py-2 text-end ${x.communes_avec === 0 ? 'text-ardoise-400' : 'font-semibold text-ardoise-900'}`}>{formaterNombre(x.communes_avec)}</td>
                          <td className={`chiffres px-3 py-2 text-end ${x.nombre === 0 ? 'text-ardoise-400' : 'text-ardoise-700'}`}>{formaterNombre(x.nombre)}</td>
                          <td className="chiffres px-3 py-2 text-end text-ardoise-600">{x.derniere ? f.date(x.derniere) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ardoise-800">{t('national.bibliotheque.parCommune')}</h3>
                  <input
                    type="search"
                    value={recherche}
                    onChange={(ev) => setRecherche(ev.target.value)}
                    placeholder={t('national.bibliotheque.rechercher')}
                    aria-label={t('national.bibliotheque.rechercher')}
                    className="min-h-10 w-full rounded-lg border border-ardoise-300 px-3 text-sm sm:w-72"
                  />
                </div>
                {detail.lignes.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-ardoise-300 bg-ardoise-50/60 p-4 text-sm text-ardoise-600">
                    {t('national.bibliotheque.aucune', { total: formaterNombre(detail.communes_total) })}
                  </p>
                ) : (
                  <ul className="divide-y divide-ardoise-100 rounded-lg border border-ardoise-200">
                    {communes.map((c) => (
                      <li key={c.id} className="space-y-1.5 p-3">
                        <p className="text-sm font-semibold text-ardoise-900">
                          {ar && c.nomAr ? c.nomAr : c.nom} <span className="text-xs font-normal text-ardoise-500">{c.gouvernorat}</span>
                        </p>
                        <ul className="space-y-1">{c.lignes.map((l) => ligne(l, detail.element))}</ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
