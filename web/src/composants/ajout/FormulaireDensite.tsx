// Une densité des assimilés saisie par la commune (jalon G, lot G5b) : une fourchette
// en kg/m³ pour une catégorie d'activité, tirée du guide TADAEEM ou posée par défaut,
// avec la pièce qui la fonde.
//
// TROIS ORIGINES, UNE SEULE SAISIE ICI. Une densité de campagne ne se tape pas : elle
// s'ADOPTE depuis la campagne close qui la propose (seuil atteint), avec ses quartiles
// pour bornes. Une densité du pays est tenue par la FNCT. Ce formulaire ne connaît
// que la densité de la commune, d'après une source écrite.
//
// UNE DENSITÉ NE SE RÉÉCRIT PAS. Si une autre vaut déjà pour la catégorie à cette
// date, la base refuse (elle se retire d'abord, avec son motif) : le refus s'affiche
// tel quel, il dit quoi faire.
//
// La catégorie se choisit dans la liste nationale du jour ; la date d'effet se propose
// au jour de Tunis.
//
// UNE DENSITÉ DE MOINS DE 10 kg/m³ EST PROBABLEMENT DES t/m³. Le guide TADAEEM et la
// matrice nationale donnent leurs densités en t/m³ (0,2 t/m³ = 200 kg/m³) : recopiée
// telle quelle, une telle valeur rendrait mille fois trop faible tout tonnage estimé de
// la catégorie. L'écran le dit en clair, sans refuser — c'est la commune qui sait ce que
// sa pièce porte.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type ElementListeAssimiles } from '../../lib/api';
import { Chargement, Erreur } from '../Elements';
import { CadreAjout, champAjout } from './CadreAjout';
import { aujourdhui, categoriesDuJour } from './FormulaireEtablissement';
import type { PropsFormulaireAjout } from './registre';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DENSITE_MAX = 2000;
// En dessous, la valeur ressemble à des t/m³ : un avertissement, pas un refus.
const DENSITE_EN_TONNES_PROBABLE = 10;
const nombre = (v: string) => (v.trim() === '' ? null : Number(v.trim().replace(',', '.')));
const SOURCES = ['tadaeem', 'defaut'] as const;

export function FormulaireDensite({ communeId, onFait, onAnnuler }: PropsFormulaireAjout) {
  const { t, i18n } = useTranslation();
  const arabe = i18n.language.startsWith('ar');
  const [categories, setCategories] = useState<ElementListeAssimiles[] | null>(null);
  const [indisponible, setIndisponible] = useState(false);
  const [essai, setEssai] = useState(0);
  const [categorie, setCategorie] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [mediane, setMediane] = useState('');
  const [source, setSource] = useState<(typeof SOURCES)[number]>('tadaeem');
  const [reference, setReference] = useState('');
  const [dateEffet, setDateEffet] = useState(aujourdhui());
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Une liste qui n'a pas pu se lire n'est pas une liste vide : la confondre dirait
  // « aucune catégorie en vigueur » d'une liste que la FNCT n'a pas touchée.
  useEffect(() => {
    setIndisponible(false);
    api
      .listesAssimiles()
      .then((l) => setCategories(categoriesDuJour(l.listes.find((x) => x.liste === 'categories_activite_assimiles')?.elements ?? [], aujourdhui())))
      .catch(() => setIndisponible(true));
  }, [essai]);

  const [nMin, nMax, nMed] = [nombre(min), nombre(max), nombre(mediane)];
  const valable = (n: number | null) => n !== null && Number.isFinite(n) && n > 0 && n <= DENSITE_MAX;
  const problemes: string[] = [];
  const cle = (s: string) => `ajout.densite.problemes.${s}`;
  if (!categorie) problemes.push(t(cle('categorie')));
  if (!valable(nMin) || !valable(nMax)) problemes.push(t(cle('bornes'), { max: DENSITE_MAX }));
  else if ((nMin as number) > (nMax as number)) problemes.push(t(cle('ordre')));
  if (nMed !== null && (!valable(nMed) || (valable(nMin) && valable(nMax) && (nMed < (nMin as number) || nMed > (nMax as number))))) {
    problemes.push(t(cle('mediane')));
  }
  if ([...reference.trim()].length < 5) problemes.push(t(cle('reference')));
  const tonnesProbables = [nMin, nMax, nMed].some((n) => n !== null && Number.isFinite(n) && n > 0 && n < DENSITE_EN_TONNES_PROBABLE);
  if (!DATE.test(dateEffet)) problemes.push(t(cle('date')));

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      await api.creerDensiteAssimiles(communeId, {
        portee: 'commune',
        categorie,
        densiteMin: nMin as number,
        densiteMax: nMax as number,
        mediane: nMed,
        source,
        reference: reference.trim(),
        dateEffet,
      });
      await onFait();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  if (indisponible) return <Erreur message={t('ajout.densite.listeIndisponible')} onReessayer={() => setEssai((n) => n + 1)} />;
  if (!categories) return <Chargement />;

  return (
    <CadreAjout
      id="densite-nouvelle"
      titre={t('ajout.densite.titre')}
      aide={t('ajout.densite.aide')}
      erreur={erreur}
      enregistrable={problemes.length === 0}
      envoi={envoi}
      onEnregistrer={enregistrer}
      onAnnuler={onAnnuler}
    >
      <label className="block text-sm">
        {t('ajout.densite.categorie')}
        <select value={categorie} onChange={(e) => setCategorie(e.target.value)} className={champAjout}>
          <option value="">{t('ajout.etablissement.choisir')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.code}>
              {arabe ? c.libelle_ar : c.libelle_fr}
            </option>
          ))}
        </select>
        {categories.length === 0 && <span className="mt-1 block text-xs text-ardoise-600">{t('ajout.densite.aucuneCategorie')}</span>}
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          {t('ajout.densite.min')}
          <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" className={`${champAjout} text-end`} />
        </label>
        <label className="text-sm">
          {t('ajout.densite.max')}
          <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" className={`${champAjout} text-end`} />
        </label>
        <label className="text-sm">
          {t('ajout.densite.mediane')}
          <input value={mediane} onChange={(e) => setMediane(e.target.value)} inputMode="decimal" className={`${champAjout} text-end`} />
        </label>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm">{t('ajout.densite.source')}</legend>
        <div className="flex flex-wrap gap-2">
          {SOURCES.map((s) => (
            <label key={s} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-ardoise-200 bg-white px-3 text-sm">
              <input type="radio" name="source-densite" value={s} checked={source === s} onChange={() => setSource(s)} className="h-5 w-5" />
              {t(`campagnesPesee.sources.${s}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {t('ajout.densite.reference')}
          <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={300} className={champAjout} />
          <span className="mt-1 block text-xs text-ardoise-500">{t('ajout.densite.referenceAide')}</span>
        </label>
        <label className="text-sm">
          {t('ajout.densite.dateEffet')}
          <input type="date" value={dateEffet} onChange={(e) => setDateEffet(e.target.value)} className={champAjout} />
        </label>
      </div>
      {tonnesProbables && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {t('ajout.densite.tonnesProbables', { seuil: DENSITE_EN_TONNES_PROBABLE })}
        </p>
      )}
      {problemes.length > 0 && (
        <div className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">
          <p>{t('ajout.etablissement.pourEnregistrer')}</p>
          <ul className="list-disc ps-5">
            {problemes.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </CadreAjout>
  );
}
