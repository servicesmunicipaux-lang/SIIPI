// La grille tarifaire des déchets assimilés (jalon G, lot G1 ; SPEC_G § 3.3).
//
// UN SEUL FORMULAIRE POUR CRÉER ET POUR MODIFIER UN PROJET. Ouvert sans grille,
// il enregistre un projet ; ouvert avec un projet, il le remplace en entier. Un
// second formulaire de modification, écrit dans l'écran des grilles, aurait un
// jour un champ de moins que celui-ci — et un projet modifié perdrait ce que la
// création avait su dire. `appels-creation.json` nomme les deux appels : le
// lint refuse qu'ils vivent ailleurs.
//
// LES CATÉGORIES SONT CELLES DE LA DATE D'EFFET. La base refuse une catégorie
// qui n'est pas en vigueur à la date d'effet de la grille ; proposer la liste du
// jour laisserait choisir, pour une grille de l'an prochain, une catégorie qui
// sera fermée d'ici là. La liste suit donc la date saisie, et une catégorie
// déjà choisie qui n'y figure plus reste affichée, signalée, plutôt que de
// disparaître en silence du formulaire.
//
// LA RÈGLE SE DIT AVANT LE REFUS. Une tranche qui chevauche une autre, deux
// critères au même rang : la base les refuse, mais le directeur doit le savoir
// en saisissant, pas en lisant l'erreur d'un enregistrement. « Pour
// enregistrer » dit ce qui manque, en mots, tant qu'il manque quelque chose.
//
// AUCUN MONTANT N'EST CALCULÉ. Le formulaire enregistre des tarifs et des
// règles ; l'assiette d'un établissement se calculera avec sa convention.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type ElementListeAssimiles, type GrilleTarifaire, type SaisieGrilleTarifaire } from '../../lib/api';
import { Chargement } from '../Elements';
import { CadreAjout, champAjout } from './CadreAjout';

type LigneGrille = GrilleTarifaire['lignes'][number];
export type ModeTarif = LigneGrille['mode'];
export type CritereMajoration = LigneGrille['majorations'][number]['critere'];
type EffetMajoration = LigneGrille['majorations'][number]['effet'];

export const MODES_TARIF: readonly ModeTarif[] = ['forfait_annuel', 'forfait_mensuel', 'reel_levee', 'reel_poids'];
export const CRITERES_MAJORATION: readonly CritereMajoration[] = ['surface_m2', 'frequence_hebdo', 'capacite_conteneur_l', 'nb_points_vente'];
const EFFETS: readonly EffetMajoration[] = ['coefficient', 'ajout'];

type MajorationSaisie = {
  cle: number;
  critere: CritereMajoration | '';
  borneMin: string;
  borneMax: string;
  effet: EffetMajoration | '';
  valeur: string;
  ordre: string;
};
type LigneSaisie = { cle: number; categorie: string; mode: ModeTarif | ''; tarif: string; majorations: MajorationSaisie[] };

// Une clé par ligne et par majoration, pour React : l'indice ne suffit pas,
// retirer la deuxième ligne ferait passer la saisie de la troisième dans ses champs.
let compteur = 0;
const nouvelleCle = () => ++compteur;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Un nombre saisi : null quand la case est vide, NaN quand elle n'est pas un nombre. */
function lireNombre(v: string): number | null {
  const s = v.trim().replace(',', '.');
  return s === '' ? null : Number(s);
}
// Ce que la base garde (NUMERIC(12, 3)) : trois décimales, 999 999 999,999 au
// plus. La règle se dit avant l'envoi : l'API refuserait d'un « Requête
// invalide » qui ne nomme ni la case ni la règle.
const MONTANT_MAX = 999_999_999.999;
const auMillieme = (n: number) => Math.round(n * 1000) / 1000 === n && Math.abs(n) <= MONTANT_MAX;
const positif = (v: string) => {
  const n = lireNombre(v);
  return n !== null && Number.isFinite(n) && n > 0 && auMillieme(n);
};

/** Les catégories d'activité en vigueur à une date : ni à venir, ni fermées, ni retirées. */
function categoriesALaDate(elements: ElementListeAssimiles[], jour: string): ElementListeAssimiles[] {
  const parCode = new Map<string, ElementListeAssimiles>();
  for (const e of elements) {
    if (e.retire_le || !e.date_effet || e.date_effet > jour || (e.date_fin && e.date_fin <= jour)) continue;
    if (!parCode.has(e.code)) parCode.set(e.code, e);
  }
  return [...parCode.values()];
}

const majorationVide = (): MajorationSaisie => ({
  cle: nouvelleCle(),
  critere: '',
  // La borne basse est écrite, pas sous-entendue : une tranche qui commence à
  // zéro se lit sur l'écran comme elle partira en base.
  borneMin: '0',
  borneMax: '',
  effet: '',
  valeur: '',
  ordre: '',
});
const ligneVide = (): LigneSaisie => ({ cle: nouvelleCle(), categorie: '', mode: '', tarif: '', majorations: [] });

const depuisGrille = (g: GrilleTarifaire): LigneSaisie[] =>
  g.lignes.map((l) => ({
    cle: nouvelleCle(),
    categorie: l.categorie,
    mode: l.mode,
    tarif: String(l.tarif),
    majorations: l.majorations.map((m) => ({
      cle: nouvelleCle(),
      critere: m.critere,
      borneMin: String(m.borne_min),
      borneMax: m.borne_max === null ? '' : String(m.borne_max),
      effet: m.effet,
      valeur: String(m.valeur),
      ordre: String(m.ordre),
    })),
  }));

export function FormulaireGrilleTarifaire({
  communeId,
  grille,
  onFait,
  onAnnuler,
  onConflit,
}: {
  communeId: string;
  /** Un projet à remplacer ; absent, le formulaire crée une grille. */
  grille?: GrilleTarifaire;
  onFait: () => void | Promise<void>;
  onAnnuler: () => void;
  /** Le remplacement a été refusé : la grille a changé depuis l'ouverture. L'écran la relit. */
  onConflit?: () => void | Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  // La version de la grille telle qu'elle était à l'ouverture du formulaire, avec
  // le contenu qu'il en a tiré. La lire au moment d'enregistrer prendrait celle
  // d'une grille relue entre-temps par l'écran (changement de langue, autre geste),
  // et le remplacement d'un autre directeur serait écrasé sans refus.
  const [versionLue] = useState(grille?.version);
  const arabe = i18n.language.startsWith('ar');
  const [elements, setElements] = useState<ElementListeAssimiles[] | null>(null);
  const [intitule, setIntitule] = useState(grille?.intitule ?? '');
  const [referenceArrete, setReferenceArrete] = useState(grille?.reference_arrete ?? '');
  const [dateArrete, setDateArrete] = useState(grille?.date_arrete ?? '');
  const [referenceDeliberation, setReferenceDeliberation] = useState(grille?.reference_deliberation ?? '');
  const [dateDeliberation, setDateDeliberation] = useState(grille?.date_deliberation ?? '');
  const [dateEffet, setDateEffet] = useState(grille?.date_effet ?? '');
  const [dateFin, setDateFin] = useState(grille?.date_fin ?? '');
  const [lignes, setLignes] = useState<LigneSaisie[]>(() => (grille ? depuisGrille(grille) : [ligneVide()]));
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    void api
      .listesAssimiles()
      .then((l) => setElements(l.listes.find((x) => x.liste === 'categories_activite_assimiles')?.elements ?? []))
      .catch((err) => {
        setElements([]);
        setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
      });
  }, [t]);

  if (!elements) return <Chargement />;

  const effetSaisi = DATE.test(dateEffet);
  const disponibles = effetSaisi ? categoriesALaDate(elements, dateEffet) : [];
  const codesDisponibles = new Set(disponibles.map((e) => e.code));

  // Le libellé d'une catégorie qui n'est plus dans la liste du jour : celui de
  // la liste nationale à une autre date, sinon celui que la grille a gardé.
  const libelleCategorie = (code: string) => {
    const e = elements.find((x) => x.code === code && !x.retire_le) ?? elements.find((x) => x.code === code);
    if (e) return arabe ? e.libelle_ar : e.libelle_fr;
    const l = grille?.lignes.find((x) => x.categorie === code);
    return (arabe ? l?.categorie_ar : l?.categorie_fr) ?? code;
  };

  const modifierLigne = (cle: number, modif: Partial<LigneSaisie>) =>
    setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...modif } : l)));
  const modifierMajoration = (cleLigne: number, cle: number, modif: Partial<MajorationSaisie>) =>
    setLignes((ls) =>
      ls.map((l) =>
        l.cle === cleLigne ? { ...l, majorations: l.majorations.map((m) => (m.cle === cle ? { ...m, ...modif } : m)) } : l
      )
    );

  // Les tranches d'un même critère partagent un rang, deux critères n'en
  // partagent pas (la base le tient) : choisir un critère propose le rang qui
  // lui revient. Le directeur peut le changer ; la règle reste vérifiée.
  const choisirCritere = (ligne: LigneSaisie, m: MajorationSaisie, critere: CritereMajoration | '') => {
    const autres = ligne.majorations.filter((x) => x.cle !== m.cle);
    const meme = autres.find((x) => x.critere === critere && x.ordre.trim() !== '');
    const rangs = autres.filter((x) => x.critere !== critere).map((x) => Number(x.ordre)).filter(Number.isInteger);
    const ordre = critere === '' ? m.ordre : meme ? meme.ordre : String(Math.max(0, ...rangs) + 1);
    modifierMajoration(ligne.cle, m.cle, { critere, ordre });
  };

  const problemes: string[] = [];
  if (referenceArrete.trim().length < 3) problemes.push(t('ajout.grilleTarifaire.problemes.arrete'));
  if (!DATE.test(dateArrete)) problemes.push(t('ajout.grilleTarifaire.problemes.dateArrete'));
  if (!effetSaisi) problemes.push(t('ajout.grilleTarifaire.problemes.dateEffet'));
  if (dateFin && effetSaisi && dateFin <= dateEffet) problemes.push(t('ajout.grilleTarifaire.problemes.dateFin'));
  lignes.forEach((l, i) => {
    const n = i + 1;
    if (!l.categorie) problemes.push(t('ajout.grilleTarifaire.problemes.ligneCategorie', { n }));
    else if (effetSaisi && !codesDisponibles.has(l.categorie)) problemes.push(t('ajout.grilleTarifaire.problemes.ligneHorsListe', { n }));
    if (!l.mode) problemes.push(t('ajout.grilleTarifaire.problemes.ligneMode', { n }));
    if (!positif(l.tarif)) problemes.push(t('ajout.grilleTarifaire.problemes.ligneTarif', { n }));
    l.majorations.forEach((m, j) => {
      const p = { n, m: j + 1 };
      const bas = lireNombre(m.borneMin);
      const haut = lireNombre(m.borneMax);
      const ordre = Number(m.ordre);
      if (!m.critere) problemes.push(t('ajout.grilleTarifaire.problemes.majCritere', p));
      if (bas === null || !Number.isFinite(bas) || bas < 0 || !auMillieme(bas)) problemes.push(t('ajout.grilleTarifaire.problemes.majBorneMin', p));
      if (haut !== null && (!Number.isFinite(haut) || !auMillieme(haut) || (bas !== null && Number.isFinite(bas) && haut <= bas))) {
        problemes.push(t('ajout.grilleTarifaire.problemes.majBorneMax', p));
      }
      if (!m.effet) problemes.push(t('ajout.grilleTarifaire.problemes.majEffet', p));
      if (!positif(m.valeur)) problemes.push(t('ajout.grilleTarifaire.problemes.majValeur', p));
      if (m.ordre.trim() === '' || !Number.isInteger(ordre) || ordre < 1 || ordre > 100) {
        problemes.push(t('ajout.grilleTarifaire.problemes.majOrdre', p));
      }
    });
    // Un rang par critère, un critère par rang.
    const rangDe = new Map<string, Set<string>>();
    const critereDe = new Map<string, Set<string>>();
    for (const m of l.majorations) {
      if (!m.critere || m.ordre.trim() === '') continue;
      rangDe.set(m.critere, (rangDe.get(m.critere) ?? new Set()).add(m.ordre.trim()));
      critereDe.set(m.ordre.trim(), (critereDe.get(m.ordre.trim()) ?? new Set()).add(m.critere));
    }
    if ([...rangDe.values(), ...critereDe.values()].some((s) => s.size > 1)) {
      problemes.push(t('ajout.grilleTarifaire.problemes.majRang', { n }));
    }
    // Des tranches demi-ouvertes [basse, haute[ : celle qui finit à 100 et
    // celle qui commence à 100 se touchent sans se chevaucher.
    const chevauchees = new Set<CritereMajoration>();
    l.majorations.forEach((a, ia) =>
      l.majorations.forEach((b, ib) => {
        if (ib <= ia || !a.critere || a.critere !== b.critere) return;
        const [aMin, bMin] = [lireNombre(a.borneMin) ?? 0, lireNombre(b.borneMin) ?? 0];
        const [aMax, bMax] = [lireNombre(a.borneMax) ?? Infinity, lireNombre(b.borneMax) ?? Infinity];
        if (aMin < bMax && bMin < aMax) chevauchees.add(a.critere);
      })
    );
    for (const c of chevauchees) {
      problemes.push(t('ajout.grilleTarifaire.problemes.majChevauchement', { n, critere: t(`ajout.grilleTarifaire.criteres.${c}`) }));
    }
  });

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    const saisie: SaisieGrilleTarifaire = {
      intitule: intitule.trim() || null,
      referenceArrete: referenceArrete.trim(),
      dateArrete,
      referenceDeliberation: referenceDeliberation.trim() || null,
      dateDeliberation: dateDeliberation || null,
      dateEffet,
      dateFin: dateFin || null,
      lignes: lignes.map((l) => ({
        categorie: l.categorie,
        mode: l.mode as ModeTarif,
        tarif: lireNombre(l.tarif) as number,
        majorations: l.majorations.map((m) => ({
          critere: m.critere as CritereMajoration,
          borneMin: lireNombre(m.borneMin) as number,
          borneMax: lireNombre(m.borneMax),
          effet: m.effet as EffetMajoration,
          valeur: lireNombre(m.valeur) as number,
          ordre: Number(m.ordre),
        })),
      })),
    };
    try {
      // La version lue part avec la modification : si un autre l'a changée entre-temps, refus (409).
      if (grille) await api.modifierGrilleTarifaire(grille.id, { ...saisie, version: versionLue ?? grille.version });
      else await api.creerGrilleTarifaire(communeId, saisie);
      await onFait();
    } catch (err) {
      const refus = err instanceof ErreurApi ? err.message : t('commun.erreur');
      // Un 409 : la grille a changé depuis l'ouverture. L'écran la relit ; le
      // formulaire garde la saisie et la version d'ouverture — il continue donc
      // d'être refusé, et dit comment repartir de la grille relue.
      if (grille && err instanceof ErreurApi && err.statut === 409) {
        await onConflit?.();
        setErreur(`${refus} ${t('ajout.grilleTarifaire.conflit')}`);
      } else {
        setErreur(refus);
      }
    } finally {
      setEnvoi(false);
    }
  };

  const champNombre = `${champAjout} text-end tabular-nums`;

  return (
    <CadreAjout
      id={grille ? `grille-${grille.id}` : 'grille-nouvelle'}
      titre={t(grille ? 'ajout.grilleTarifaire.titreModification' : 'ajout.grilleTarifaire.titre')}
      aide={t('ajout.grilleTarifaire.aide')}
      erreur={erreur}
      enregistrable={problemes.length === 0}
      envoi={envoi}
      onEnregistrer={enregistrer}
      onAnnuler={onAnnuler}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          {t('ajout.grilleTarifaire.intitule')}
          <input value={intitule} onChange={(e) => setIntitule(e.target.value)} maxLength={200} className={champAjout} />
        </label>
        <label className="text-sm">
          {t('ajout.grilleTarifaire.referenceArrete')}
          <input value={referenceArrete} onChange={(e) => setReferenceArrete(e.target.value)} maxLength={300} required className={champAjout} />
        </label>
        <label className="text-sm">
          {t('ajout.grilleTarifaire.dateArrete')}
          <input type="date" min="2000-01-01" value={dateArrete} onChange={(e) => setDateArrete(e.target.value)} required className={champAjout} />
        </label>
        <label className="text-sm">
          {t('ajout.grilleTarifaire.referenceDeliberation')}
          <input value={referenceDeliberation} onChange={(e) => setReferenceDeliberation(e.target.value)} maxLength={300} className={champAjout} />
        </label>
        <label className="text-sm">
          {t('ajout.grilleTarifaire.dateDeliberation')}
          <input type="date" min="2000-01-01" value={dateDeliberation} onChange={(e) => setDateDeliberation(e.target.value)} className={champAjout} />
        </label>
        <label className="text-sm">
          {t('ajout.grilleTarifaire.dateEffet')}
          <input type="date" min="2000-01-01" value={dateEffet} onChange={(e) => setDateEffet(e.target.value)} required className={champAjout} />
        </label>
        <label className="text-sm">
          {t('ajout.grilleTarifaire.dateFin')}
          <input type="date" min={dateEffet || '2000-01-01'} value={dateFin} onChange={(e) => setDateFin(e.target.value)} className={champAjout} />
        </label>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ardoise-900">{t('ajout.grilleTarifaire.tarifs')}</legend>
        <p className="text-xs text-ardoise-600">{t('ajout.grilleTarifaire.aideTarifs')}</p>
        {!effetSaisi ? (
          <p className="rounded-lg border border-ardoise-200 bg-white p-2 text-sm text-ardoise-600">{t('ajout.grilleTarifaire.dateEffetDabord')}</p>
        ) : (
          disponibles.length === 0 && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">{t('ajout.grilleTarifaire.aucuneCategorie')}</p>
          )
        )}
        {lignes.length === 0 && <p className="text-sm text-ardoise-600">{t('ajout.grilleTarifaire.sansTarif')}</p>}

        {lignes.map((l, i) => {
          const prises = new Set(lignes.filter((x) => x.cle !== l.cle).map((x) => x.categorie));
          const horsListe = l.categorie !== '' && !codesDisponibles.has(l.categorie);
          const unite = l.mode ? t(`ajout.grilleTarifaire.unites.${l.mode}`) : '';
          return (
            <fieldset key={l.cle} className="space-y-3 rounded-lg border border-ardoise-200 bg-white p-3">
              <legend className="px-1 text-sm font-medium text-ardoise-900">{t('ajout.grilleTarifaire.ligne', { n: i + 1 })}</legend>
              <div className="grid gap-3 sm:grid-cols-4">
                <label className="text-sm sm:col-span-2">
                  {t('ajout.grilleTarifaire.categorie')}
                  <select
                    value={l.categorie}
                    onChange={(e) => modifierLigne(l.cle, { categorie: e.target.value })}
                    aria-invalid={horsListe || undefined}
                    className={champAjout}
                  >
                    <option value="">{t('ajout.grilleTarifaire.choisirCategorie')}</option>
                    {horsListe && (
                      <option value={l.categorie}>{t('ajout.grilleTarifaire.horsListe', { libelle: libelleCategorie(l.categorie) })}</option>
                    )}
                    {disponibles.map((e) => (
                      <option key={e.code} value={e.code} disabled={prises.has(e.code)}>
                        {arabe ? e.libelle_ar : e.libelle_fr}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  {t('ajout.grilleTarifaire.mode')}
                  <select value={l.mode} onChange={(e) => modifierLigne(l.cle, { mode: e.target.value as ModeTarif | '' })} className={champAjout}>
                    <option value="">{t('ajout.grilleTarifaire.choisirMode')}</option>
                    {MODES_TARIF.map((m) => (
                      <option key={m} value={m}>{t(`ajout.grilleTarifaire.modes.${m}`)}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  {t('ajout.grilleTarifaire.tarif')}
                  <span className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      dir="ltr"
                      value={l.tarif}
                      onChange={(e) => modifierLigne(l.cle, { tarif: e.target.value })}
                      className={champNombre}
                    />
                    {unite && <span className="mt-1 shrink-0 text-xs text-ardoise-600">{unite}</span>}
                  </span>
                </label>
              </div>
              {horsListe && <p className="text-xs text-amber-800">{t('ajout.grilleTarifaire.horsListeAide')}</p>}

              <div className="space-y-2">
                <p className="text-sm font-medium text-ardoise-800">{t('ajout.grilleTarifaire.majorations')}</p>
                {l.majorations.length === 0 ? (
                  <p className="text-xs text-ardoise-600">{t('ajout.grilleTarifaire.aucuneMajoration')}</p>
                ) : (
                  <p className="text-xs text-ardoise-600">{t('ajout.grilleTarifaire.aideMajorations')}</p>
                )}
                {l.majorations.map((m, j) => (
                  <fieldset key={m.cle} className="rounded-lg border border-ardoise-100 bg-ardoise-50 p-2">
                    <legend className="px-1 text-xs font-medium text-ardoise-700">{t('ajout.grilleTarifaire.majoration', { m: j + 1 })}</legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                      <label className="col-span-2 text-xs sm:col-span-1 lg:col-span-2">
                        {t('ajout.grilleTarifaire.critere')}
                        <select value={m.critere} onChange={(e) => choisirCritere(l, m, e.target.value as CritereMajoration | '')} className={champAjout}>
                          <option value="">{t('ajout.grilleTarifaire.choisirCritere')}</option>
                          {CRITERES_MAJORATION.map((c) => (
                            <option key={c} value={c}>
                              {t(`ajout.grilleTarifaire.criteres.${c}`)} ({t(`ajout.grilleTarifaire.unitesCriteres.${c}`)})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs">
                        {t('ajout.grilleTarifaire.borneMin')}
                        <input
                          type="text"
                          inputMode="decimal"
                          dir="ltr"
                          value={m.borneMin}
                          onChange={(e) => modifierMajoration(l.cle, m.cle, { borneMin: e.target.value })}
                          className={champNombre}
                        />
                      </label>
                      <label className="text-xs">
                        {t('ajout.grilleTarifaire.borneMax')}
                        <input
                          type="text"
                          inputMode="decimal"
                          dir="ltr"
                          value={m.borneMax}
                          placeholder={t('ajout.grilleTarifaire.sansPlafond')}
                          onChange={(e) => modifierMajoration(l.cle, m.cle, { borneMax: e.target.value })}
                          className={champNombre}
                        />
                      </label>
                      <label className="text-xs">
                        {t('ajout.grilleTarifaire.effet')}
                        <select
                          value={m.effet}
                          onChange={(e) => modifierMajoration(l.cle, m.cle, { effet: e.target.value as EffetMajoration | '' })}
                          className={champAjout}
                        >
                          <option value="">{t('ajout.grilleTarifaire.choisirEffet')}</option>
                          {EFFETS.map((x) => (
                            <option key={x} value={x}>{t(`ajout.grilleTarifaire.effets.${x}`)}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs">
                        {t('ajout.grilleTarifaire.valeur')}
                        <span className="flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            dir="ltr"
                            value={m.valeur}
                            onChange={(e) => modifierMajoration(l.cle, m.cle, { valeur: e.target.value })}
                            className={champNombre}
                          />
                          {m.effet === 'coefficient' && <span className="mt-1 shrink-0 text-ardoise-600" aria-hidden="true">×</span>}
                          {m.effet === 'ajout' && unite && <span className="mt-1 shrink-0 text-ardoise-600">{unite}</span>}
                        </span>
                      </label>
                      <label className="text-xs">
                        {t('ajout.grilleTarifaire.rang')}
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={100}
                          step={1}
                          dir="ltr"
                          value={m.ordre}
                          onChange={(e) => modifierMajoration(l.cle, m.cle, { ordre: e.target.value })}
                          className={champNombre}
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => modifierLigne(l.cle, { majorations: l.majorations.filter((x) => x.cle !== m.cle) })}
                      className="mt-2 min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-xs text-ardoise-700"
                    >
                      {t('ajout.grilleTarifaire.retirerMajoration')}
                    </button>
                  </fieldset>
                ))}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => modifierLigne(l.cle, { majorations: [...l.majorations, majorationVide()] })}
                    className="min-h-11 rounded-lg border border-siipi-300 bg-white px-3 text-sm text-siipi-800"
                  >
                    {t('ajout.grilleTarifaire.ajouterMajoration')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLignes((ls) => ls.filter((x) => x.cle !== l.cle))}
                    className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700"
                  >
                    {t('ajout.grilleTarifaire.retirerLigne')}
                  </button>
                </div>
              </div>
            </fieldset>
          );
        })}

        <button
          type="button"
          onClick={() => setLignes((ls) => [...ls, ligneVide()])}
          className="min-h-11 rounded-lg border border-siipi-300 bg-white px-4 text-sm font-medium text-siipi-800"
        >
          {t('ajout.grilleTarifaire.ajouterLigne')}
        </button>
      </fieldset>

      {problemes.length > 0 && (
        <div aria-live="polite" className="rounded-lg border border-ardoise-200 bg-white p-3 text-sm text-ardoise-700">
          <p className="font-medium">{t('ajout.grilleTarifaire.pourEnregistrer')}</p>
          <ul className="mt-1 list-disc space-y-0.5 ps-5">
            {problemes.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </CadreAjout>
  );
}
