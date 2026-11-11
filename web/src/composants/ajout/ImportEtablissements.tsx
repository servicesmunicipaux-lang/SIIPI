// L'import des établissements (jalon G, lot G2b) : la liste TCL de la commune, ou
// un jeu open data, en CSV ou en Excel — TELS QU'ILS SONT.
//
// TROIS TEMPS, ET RIEN N'EST ÉCRIT AVANT LE DERNIER :
//   1. le type de fichier (et, pour l'open data, sa licence et son producteur), le
//      fichier ;
//   2. la CORRESPONDANCE DES COLONNES : chaque champ de SIIPI reçoit une colonne du
//      fichier, proposée (le modèle que la commune a gardé pour ce type de fichier,
//      sinon d'après les en-têtes usuels), que le directeur corrige en voyant des
//      valeurs d'exemple. La commune n'a jamais à renommer ses colonnes ;
//   3. l'APERÇU, ligne par ligne : à créer, à vérifier (le doublon nommé), à
//      rattacher (les cases vides qui se remplissent, les différences montrées),
//      inchangé, sans catégorie, erreur. Une activité sans catégorie se fait
//      correspondre ici même, et l'aperçu se relit.
// La validation relit le fichier côté API : l'aperçu affiché n'est jamais repris tel
// quel. La correspondance retenue est gardée pour l'import suivant.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  lireFichierLocal,
  type ApercuImportEtablissements,
  type ChampImportEtablissements,
  type ColonnesImportEtablissements,
  type ElementListeAssimiles,
  type LigneImportEtablissements,
} from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { Pastille, type TonPastille } from '../ui/Pastille';
import { champAjout } from './CadreAjout';
import { categoriesDuJour, aujourdhui } from './FormulaireEtablissement';

type Source = 'import_tcl' | 'open_data';
type Correspondance = Record<ChampImportEtablissements, string | null>;
type Action = LigneImportEtablissements['action'];

const bouton = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
const boutonDiscret = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';

const TON_ACTION: Record<Action, TonPastille> = {
  creer: 'mesure',
  a_verifier: 'attention',
  rattacher: 'declare',
  inchange: 'neutre',
  sans_categorie: 'action',
  erreur: 'attention',
};
// Les lignes : ce qui demande le regard d'abord (les erreurs, ce qui attend, ce qui est douteux).
const ORDRE: Action[] = ['erreur', 'sans_categorie', 'a_verifier', 'rattacher', 'creer', 'inchange'];
// Le résumé : dans l'ordre de ce que fera l'import.
const ORDRE_RESUME: Action[] = ['creer', 'a_verifier', 'rattacher', 'inchange', 'sans_categorie', 'erreur'];
const LIGNES_AFFICHEES = 200;

export function ImportEtablissements({ communeId, onFait, onAnnuler }: { communeId: string; onFait: () => void | Promise<void>; onAnnuler?: () => void }) {
  const { t, i18n } = useTranslation();
  const arabe = i18n.language.startsWith('ar');
  const [source, setSource] = useState<Source>('import_tcl');
  const [licence, setLicence] = useState('');
  const [producteur, setProducteur] = useState('');
  const [urlSource, setUrlSource] = useState('');
  const [precision, setPrecision] = useState('');
  const [fichier, setFichier] = useState<{ nomFichier: string; contenu: string } | null>(null);
  const [colonnes, setColonnes] = useState<ColonnesImportEtablissements | null>(null);
  const [correspondance, setCorrespondance] = useState<Correspondance | null>(null);
  const [apercu, setApercu] = useState<ApercuImportEtablissements | null>(null);
  // Les entrées qui ont produit l'aperçu affiché : la validation envoie celles-là, et
  // rien d'autre — une correspondance changée après l'aperçu demande un nouvel aperçu.
  const [entreesApercu, setEntreesApercu] = useState<string | null>(null);
  const [categories, setCategories] = useState<ElementListeAssimiles[]>([]);
  const [choixActivites, setChoixActivites] = useState<Record<string, string>>({});
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [bilan, setBilan] = useState<string | null>(null);

  useEffect(() => {
    api
      .listesAssimiles()
      .then((l) => setCategories(categoriesDuJour(l.listes.find((x) => x.liste === 'categories_activite_assimiles')?.elements ?? [], aujourdhui())))
      .catch(() => setCategories([]));
  }, []);

  const message = (err: unknown) => (err instanceof ErreurApi ? err.message : t('commun.erreur'));
  const nPrecision = precision.trim() === '' ? null : Number(precision.replace(',', '.'));

  // Ce qui manque pour envoyer, dit avant l'envoi.
  const problemesSource: string[] = [];
  if (source === 'open_data') {
    if ([...licence.trim()].length < 2) problemesSource.push(t('ajout.importEtablissements.problemes.licence'));
    if ([...producteur.trim()].length < 2) problemesSource.push(t('ajout.importEtablissements.problemes.producteur'));
    if (urlSource.trim() && !/^https?:\/\/\S+$/.test(urlSource.trim())) problemesSource.push(t('ajout.importEtablissements.problemes.url'));
  }
  if (nPrecision !== null && !(Number.isFinite(nPrecision) && nPrecision >= 0.1 && nPrecision <= 1000)) {
    problemesSource.push(t('ajout.importEtablissements.problemes.precision'));
  }

  const problemesColonnes = useMemo(() => {
    if (!colonnes || !correspondance) return [];
    const p: string[] = [];
    const vues = new Map<string, string>();
    for (const c of colonnes.champs) {
      const e = correspondance[c.cle];
      const libelle = arabe ? c.ar : c.fr;
      if (!e) {
        if (c.obligatoire) p.push(t('ajout.importEtablissements.problemes.obligatoire', { champ: libelle }));
        continue;
      }
      const deja = vues.get(e);
      if (deja) p.push(t('ajout.importEtablissements.problemes.memeColonne', { colonne: e, a: deja, b: libelle }));
      vues.set(e, libelle);
    }
    if (Boolean(correspondance.latitude) !== Boolean(correspondance.longitude)) p.push(t('ajout.importEtablissements.problemes.position'));
    return p;
  }, [colonnes, correspondance, arabe, t]);

  const choisirFichier = async (f: File) => {
    setOccupe(true);
    setErreur(null);
    setBilan(null);
    setApercu(null);
    try {
      const lu = await lireFichierLocal(f);
      const c = await api.colonnesImportEtablissements(communeId, { source, ...lu });
      setFichier(lu);
      setColonnes(c);
      setCorrespondance({ ...(c.correspondance as Correspondance) });
    } catch (err) {
      setFichier(null);
      setColonnes(null);
      setErreur(message(err));
    } finally {
      setOccupe(false);
    }
  };

  const entrees = () => ({
    source,
    ...fichier!,
    correspondance: correspondance!,
    licence: source === 'open_data' ? licence.trim() : null,
    producteur: source === 'open_data' ? producteur.trim() : null,
    urlSource: source === 'open_data' && urlSource.trim() ? urlSource.trim() : null,
    precisionFichier: nPrecision,
  });
  const cleEntrees = fichier && correspondance ? JSON.stringify({ ...entrees(), contenu: fichier.contenu.length }) : null;
  const apercuPerime = apercu !== null && cleEntrees !== entreesApercu;

  /** Relit l'aperçu ; `garderErreur` laisse affiché un refus qui l'a demandé (un 409, par exemple). */
  const voirApercu = async (garderErreur = false) => {
    if (!fichier || !correspondance) return;
    setOccupe(true);
    if (!garderErreur) setErreur(null);
    try {
      const cle = cleEntrees;
      setApercu(await api.importerEtablissements(communeId, { ...entrees(), valider: false }));
      setEntreesApercu(cle);
    } catch (err) {
      setErreur(message(err));
    } finally {
      setOccupe(false);
    }
  };

  const enregistrerActivite = async (activite: string) => {
    const code = choixActivites[activite];
    if (!code) return;
    setOccupe(true);
    setErreur(null);
    try {
      await api.enregistrerCorrespondanceActivite(communeId, { activite, categorieActivite: code });
      // L'aperçu se relit : la correspondance vaut pour toutes les lignes de cette activité.
      const cle = cleEntrees;
      setApercu(await api.importerEtablissements(communeId, { ...entrees(), valider: false }));
      setEntreesApercu(cle);
    } catch (err) {
      setErreur(message(err));
    } finally {
      setOccupe(false);
    }
  };

  const valider = async () => {
    if (apercuPerime) return;
    setOccupe(true);
    setErreur(null);
    let relire = false;
    try {
      const r = await api.importerEtablissements(communeId, { ...entrees(), valider: true });
      setBilan(
        t('ajout.importEtablissements.bilan', {
          crees: formaterNombre(r.crees ?? 0, 0),
          aVerifier: formaterNombre(r.aVerifier ?? 0, 0),
          rattaches: formaterNombre(r.rattaches ?? 0, 0),
        })
      );
      setApercu(null);
      setColonnes(null);
      setFichier(null);
      await onFait();
    } catch (err) {
      setErreur(message(err));
      relire = err instanceof ErreurApi && err.statut === 409;
    } finally {
      setOccupe(false);
    }
    // La base a changé entre l'aperçu et la validation : l'aperçu se relit, et le
    // refus qui le dit reste affiché ; le bouton attend le nouvel aperçu.
    if (relire) {
      setApercu(null);
      await voirApercu(true);
    }
  };

  const libelleCategorie = (c: ElementListeAssimiles) => (arabe ? c.libelle_ar : c.libelle_fr);
  const aEcrire = apercu ? apercu.resume.creer + apercu.resume.a_verifier + apercu.resume.rattacher : 0;
  const lignes = apercu ? [...apercu.lignes].sort((a, b) => ORDRE.indexOf(a.action) - ORDRE.indexOf(b.action) || a.numero - b.numero) : [];

  return (
    <section className="w-full space-y-4 rounded-xl border border-ardoise-200 bg-white p-4" aria-labelledby="import-etablissements-titre">
      <div>
        <h2 id="import-etablissements-titre" className="text-base font-semibold text-ardoise-900">{t('ajout.importEtablissements.titre')}</h2>
        <p className="mt-1 text-sm text-ardoise-600">{t('ajout.importEtablissements.aide')}</p>
      </div>
      {bilan && <p role="status" className="rounded-lg bg-siipi-50 p-3 text-sm text-siipi-800">{bilan}</p>}
      {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}

      {/* 1. Le fichier ---------------------------------------------------------- */}
      <fieldset className="space-y-3" disabled={occupe}>
        <legend className="text-sm font-medium text-ardoise-800">{t('ajout.importEtablissements.etapes.fichier')}</legend>
        <div className="flex flex-wrap gap-4">
          {(['import_tcl', 'open_data'] as const).map((s) => (
            <label key={s} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="source-import"
                checked={source === s}
                onChange={() => {
                  setSource(s);
                  // Un autre type de fichier a son propre modèle : on relit les colonnes.
                  setColonnes(null);
                  setApercu(null);
                  setFichier(null);
                }}
                className="h-5 w-5"
              />
              {t(`ajout.importEtablissements.sources.${s}`)}
            </label>
          ))}
        </div>
        {source === 'open_data' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              {t('ajout.importEtablissements.licence')}
              <input value={licence} onChange={(e) => setLicence(e.target.value)} maxLength={200} className={champAjout} />
            </label>
            <label className="text-sm">
              {t('ajout.importEtablissements.producteur')}
              <input value={producteur} onChange={(e) => setProducteur(e.target.value)} maxLength={200} className={champAjout} />
            </label>
            <label className="text-sm">
              {t('ajout.importEtablissements.urlSource')}
              <input value={urlSource} onChange={(e) => setUrlSource(e.target.value)} maxLength={500} dir="ltr" className={champAjout} />
            </label>
          </div>
        )}
        <label className="block max-w-xs text-sm">
          {t('ajout.importEtablissements.precision')}
          <input value={precision} onChange={(e) => setPrecision(e.target.value)} inputMode="decimal" className={`${champAjout} text-end`} />
          <span className="mt-1 block text-xs text-ardoise-500">{t('ajout.importEtablissements.precisionAide')}</span>
        </label>
        <label
          className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 ${occupe ? 'opacity-50' : ''}`}
        >
          {occupe && !colonnes ? t('import.lecture') : fichier ? t('ajout.importEtablissements.autreFichier', { fichier: fichier.nomFichier }) : t('ajout.importEtablissements.choisir')}
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              // Remis à vide : rechoisir le même fichier après une correction doit relancer la lecture.
              e.target.value = '';
              if (f) void choisirFichier(f);
            }}
          />
        </label>
      </fieldset>

      {/* 2. La correspondance des colonnes ------------------------------------- */}
      {colonnes && correspondance && (
        <fieldset className="space-y-3" disabled={occupe}>
          <legend className="text-sm font-medium text-ardoise-800">
            {t('ajout.importEtablissements.etapes.colonnes', { lignes: formaterNombre(colonnes.lignes, 0), fichier: colonnes.fichier })}
          </legend>
          {colonnes.feuille && <p className="text-xs text-ardoise-600">{t('ajout.importEtablissements.feuille', { feuille: colonnes.feuille })}</p>}
          {colonnes.avertissements.map((a) => (
            <p key={a} className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{a}</p>
          ))}
          <p className="text-sm text-ardoise-600">
            {colonnes.modeleEnregistre ? t('ajout.importEtablissements.modeleEnregistre') : t('ajout.importEtablissements.modeleNouveau')}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="text-start text-xs text-ardoise-500">
                  <th className="px-2 py-1 text-start font-normal">{t('ajout.importEtablissements.champSiipi')}</th>
                  <th className="px-2 py-1 text-start font-normal">{t('ajout.importEtablissements.colonneFichier')}</th>
                  <th className="px-2 py-1 text-start font-normal">{t('ajout.importEtablissements.exemples')}</th>
                </tr>
              </thead>
              <tbody>
                {colonnes.champs.map((c) => {
                  const choisie = correspondance[c.cle];
                  const proposee = (colonnes.correspondance as Correspondance)[c.cle];
                  const provenance = choisie !== proposee ? 'modifiee' : colonnes.provenance[c.cle];
                  const indice = choisie ? colonnes.entetes.indexOf(choisie) : -1;
                  const exemples = indice >= 0 ? colonnes.exemples.map((r) => r[indice]).filter((v) => v !== '') : [];
                  return (
                    <tr key={c.cle} className="border-t border-ardoise-100 align-top">
                      <th scope="row" className="px-2 py-2 text-start font-normal text-ardoise-800">
                        {arabe ? c.ar : c.fr}
                        {c.obligatoire && <span className="ms-1 text-xs text-ardoise-500">({t('ajout.importEtablissements.obligatoire')})</span>}
                      </th>
                      <td className="px-2 py-2">
                        <select
                          value={choisie ?? ''}
                          onChange={(e) => setCorrespondance({ ...correspondance, [c.cle]: e.target.value || null })}
                          className={champAjout}
                          aria-label={arabe ? c.ar : c.fr}
                        >
                          <option value="">{t('ajout.importEtablissements.aucuneColonne')}</option>
                          {colonnes.entetes.map((e) => (
                            <option key={e} value={e}>{e}</option>
                          ))}
                        </select>
                        <span className="mt-1 block">
                          <Pastille ton={provenance === 'enregistree' ? 'mesure' : provenance === 'proposee' ? 'declare' : provenance === 'modifiee' ? 'action' : 'neutre'}>
                            {t(`ajout.importEtablissements.provenances.${provenance}`)}
                          </Pastille>
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs text-ardoise-600">{exemples.length > 0 ? exemples.join(' · ') : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {[...problemesSource, ...problemesColonnes].length > 0 && (
            <ul className="list-disc rounded-lg bg-ardoise-50 p-3 ps-8 text-sm text-ardoise-700">
              {[...new Set([...problemesSource, ...problemesColonnes])].map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={bouton} disabled={problemesSource.length + problemesColonnes.length > 0} onClick={() => void voirApercu()}>
              {apercu ? t('ajout.importEtablissements.relireApercu') : t('ajout.importEtablissements.voirApercu')}
            </button>
            {onAnnuler && (
              <button type="button" className={boutonDiscret} onClick={onAnnuler}>
                {t('commun.annuler')}
              </button>
            )}
          </div>
        </fieldset>
      )}

      {/* 3. L'aperçu ------------------------------------------------------------- */}
      {apercu && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-ardoise-800">
            {t('ajout.importEtablissements.etapes.apercu')} — <span className="font-normal text-ardoise-600">{t('import.rienEcrit')}</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {ORDRE_RESUME.map((a) =>
              apercu.resume[a] > 0 ? (
                <Pastille key={a} ton={TON_ACTION[a]}>
                  {t(`ajout.importEtablissements.actions.${a}`)} : {formaterNombre(apercu.resume[a], 0)}
                </Pastille>
              ) : null
            )}
          </div>
          {apercu.avertissements.map((a) => (
            <p key={a} className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{a}</p>
          ))}

          {apercu.activitesSansCategorie.length > 0 && (
            <div className="space-y-2 rounded-lg border border-siipi-200 bg-siipi-50 p-3">
              <p className="text-sm font-medium text-siipi-900">{t('ajout.importEtablissements.sansCategorie.titre')}</p>
              <p className="text-xs text-siipi-900">{t('ajout.importEtablissements.sansCategorie.aide')}</p>
              <ul className="space-y-2">
                {apercu.activitesSansCategorie.map((a) => (
                  <li key={a.activite} className="flex flex-wrap items-end gap-2">
                    <span className="min-w-40 flex-1 text-sm text-ardoise-800">
                      « {a.activite} » <span className="text-xs text-ardoise-500">({t('ajout.importEtablissements.sansCategorie.lignes', { n: formaterNombre(a.lignes, 0) })})</span>
                    </span>
                    <select
                      value={choixActivites[a.activite] ?? ''}
                      onChange={(e) => setChoixActivites({ ...choixActivites, [a.activite]: e.target.value })}
                      className={`${champAjout} max-w-xs`}
                      aria-label={t('ajout.importEtablissements.sansCategorie.choisir', { activite: a.activite })}
                    >
                      <option value="">{t('ajout.etablissement.choisir')}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.code}>{libelleCategorie(c)}</option>
                      ))}
                    </select>
                    <button type="button" className={boutonDiscret} disabled={occupe || !choixActivites[a.activite]} onClick={() => void enregistrerActivite(a.activite)}>
                      {t('ajout.importEtablissements.sansCategorie.enregistrer')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul className="divide-y divide-ardoise-100 rounded-lg border border-ardoise-200">
            {lignes.slice(0, LIGNES_AFFICHEES).map((l) => (
              <li key={l.numero} className="space-y-1 p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chiffres text-xs text-ardoise-500">{t('ajout.importEtablissements.ligne', { n: l.numero })}</span>
                  <Pastille ton={TON_ACTION[l.action]}>{t(`ajout.importEtablissements.actions.${l.action}`)}</Pastille>
                  <span className="font-medium text-ardoise-900">{l.nom || '—'}</span>
                  {l.activite && <span className="text-xs text-ardoise-500">{l.activite}</span>}
                </div>
                {l.erreurs.map((e) => <p key={e} className="text-xs text-red-800">{e}</p>)}
                {l.doublon && (
                  <p className="text-xs text-amber-900">
                    {l.doublon.raison === 'meme_nom'
                      ? t('ajout.importEtablissements.detail.memeNom', { nom: l.doublon.nom })
                      : t('ajout.importEtablissements.detail.proche', { nom: l.doublon.nom, distance: formaterNombre(l.doublon.distance_m ?? 0, 1) })}
                    {l.doublon.ligne != null && ` ${t('ajout.importEtablissements.detail.ligneFichier', { n: l.doublon.ligne })}`}
                  </p>
                )}
                {l.rattache_a && l.reconnu_par !== 'meme_fichier' && (
                  <p className="text-xs text-ardoise-700">
                    {t(l.reconnu_par === 'import_precedent' ? 'ajout.importEtablissements.detail.retrouve' : 'ajout.importEtablissements.detail.rattache', { nom: l.rattache_a.nom })}
                    {` ${
                      l.remplis.length > 0
                        ? t('ajout.importEtablissements.detail.remplis', { champs: l.remplis.map((c) => t(`ajout.importEtablissements.champs.${c}`)).join(', ') })
                        : t('ajout.importEtablissements.detail.rienARemplir')
                    }`}
                  </p>
                )}
                {l.differences.map((d) => (
                  <p key={d.champ} className="text-xs text-ardoise-600">
                    {t('ajout.importEtablissements.detail.difference', { champ: t(`ajout.importEtablissements.champs.${d.champ}`), inscrit: d.inscrit, fichier: d.fichier })}
                  </p>
                ))}
                {l.avertissements.map((a) => <p key={a} className="text-xs text-ardoise-500">{a}</p>)}
              </li>
            ))}
          </ul>
          {lignes.length > LIGNES_AFFICHEES && (
            <p className="text-xs text-ardoise-500">{t('ajout.importEtablissements.tronque', { n: formaterNombre(LIGNES_AFFICHEES, 0), total: formaterNombre(lignes.length, 0) })}</p>
          )}
          {apercuPerime && (
            <p role="status" className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{t('ajout.importEtablissements.apercuPerime')}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={bouton}
              disabled={occupe || aEcrire === 0 || apercuPerime || problemesSource.length + problemesColonnes.length > 0}
              onClick={() => void valider()}
            >
              {t('ajout.importEtablissements.valider', { n: formaterNombre(aEcrire, 0) })}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
