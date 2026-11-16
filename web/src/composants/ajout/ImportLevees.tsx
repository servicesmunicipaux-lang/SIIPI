// L'import d'un export Kobo des levées (jalon G, lot G5a), en CSV ou en Excel, tel
// que Kobo le donne.
//
// TROIS TEMPS, ET RIEN N'EST ÉCRIT AVANT LE DERNIER — comme l'import des
// établissements, dont cet écran reprend la marche :
//   1. le fichier ;
//   2. la CORRESPONDANCE DES COLONNES, proposée (le modèle gardé par la commune,
//      sinon les en-têtes usuels de Kobo), que le directeur corrige en voyant des
//      valeurs d'exemple ;
//   3. l'APERÇU, ligne par ligne : à proposer, déjà reçue, erreur (avec ce que la
//      base reproche à la ligne).
// La validation relit le fichier côté API, sous verrou : l'aperçu affiché n'est
// jamais repris tel quel. Les lignes valables deviennent des PROPOSITIONS, que la
// commune valide ensuite comme celles du prestataire.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  lireFichierLocal,
  type ApercuImportLevees,
  type ChampImportLevees,
  type ColonnesImportLevees,
  type LigneImportLevees,
} from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { useFormats } from '../../lib/formats';
import { Pastille, type TonPastille } from '../ui/Pastille';
import { champAjout } from './CadreAjout';

type Correspondance = Record<ChampImportLevees, string | null>;
type Action = LigneImportLevees['action'];

const bouton = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
const boutonDiscret = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';

const TON_ACTION: Record<Action, TonPastille> = { proposer: 'declare', deja_recue: 'neutre', erreur: 'attention' };
// Les lignes : ce qui demande le regard d'abord.
const ORDRE: Action[] = ['erreur', 'proposer', 'deja_recue'];
const ORDRE_RESUME: Action[] = ['proposer', 'deja_recue', 'erreur'];
const LIGNES_AFFICHEES = 200;

export function ImportLevees({ communeId, onFait, onAnnuler }: { communeId: string; onFait: () => void | Promise<void>; onAnnuler?: () => void }) {
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const arabe = i18n.language.startsWith('ar');
  const [fichier, setFichier] = useState<{ nomFichier: string; contenu: string } | null>(null);
  const [colonnes, setColonnes] = useState<ColonnesImportLevees | null>(null);
  const [correspondance, setCorrespondance] = useState<Correspondance | null>(null);
  const [apercu, setApercu] = useState<ApercuImportLevees | null>(null);
  // Les entrées qui ont produit l'aperçu affiché : une correspondance changée après
  // l'aperçu demande un nouvel aperçu avant de valider.
  const [entreesApercu, setEntreesApercu] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [bilan, setBilan] = useState<string | null>(null);

  const message = (err: unknown) => (err instanceof ErreurApi ? err.message : t('commun.erreur'));

  const problemesColonnes = useMemo(() => {
    if (!colonnes || !correspondance) return [];
    const p: string[] = [];
    const vues = new Map<string, string>();
    for (const c of colonnes.champs) {
      const e = correspondance[c.cle];
      const libelle = arabe ? c.ar : c.fr;
      if (!e) {
        if (c.obligatoire) p.push(t('ajout.importLevees.problemes.obligatoire', { champ: libelle }));
        continue;
      }
      const deja = vues.get(e);
      if (deja) p.push(t('ajout.importLevees.problemes.memeColonne', { colonne: e, a: deja, b: libelle }));
      vues.set(e, libelle);
    }
    return p;
  }, [colonnes, correspondance, arabe, t]);

  const choisirFichier = async (fl: File) => {
    setOccupe(true);
    setErreur(null);
    setBilan(null);
    setApercu(null);
    try {
      const lu = await lireFichierLocal(fl);
      const c = await api.colonnesImportLevees(communeId, lu);
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

  const entrees = () => ({ ...fichier!, correspondance: correspondance! });
  const cleEntrees = fichier && correspondance ? JSON.stringify({ nomFichier: fichier.nomFichier, contenu: fichier.contenu.length, correspondance }) : null;
  const apercuPerime = apercu !== null && cleEntrees !== entreesApercu;

  /** Relit l'aperçu ; `garderErreur` laisse affiché un refus qui l'a demandé (un 409, par exemple). */
  const voirApercu = async (garderErreur = false) => {
    if (!fichier || !correspondance) return;
    setOccupe(true);
    if (!garderErreur) setErreur(null);
    try {
      const cle = cleEntrees;
      setApercu(await api.importerLevees(communeId, { ...entrees(), valider: false }));
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
      const r = await api.importerLevees(communeId, { ...entrees(), valider: true });
      setBilan(t('ajout.importLevees.bilan', { count: r.proposees ?? 0, n: formaterNombre(r.proposees ?? 0, 0) }));
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

  const lignes = apercu ? [...apercu.lignes].sort((a, b) => ORDRE.indexOf(a.action) - ORDRE.indexOf(b.action) || a.numero - b.numero) : [];
  const aProposer = apercu?.resume.proposer ?? 0;

  return (
    <section className="w-full space-y-4 rounded-xl border border-ardoise-200 bg-white p-4" aria-labelledby="import-levees-titre">
      <div>
        <h2 id="import-levees-titre" className="text-base font-semibold text-ardoise-900">{t('ajout.importLevees.titre')}</h2>
        <p className="mt-1 text-sm text-ardoise-600">{t('ajout.importLevees.aide')}</p>
        <p className="mt-1 text-sm text-ardoise-600">{t('ajout.importLevees.aideCles')}</p>
      </div>
      {bilan && <p role="status" className="rounded-lg bg-siipi-50 p-3 text-sm text-siipi-800">{bilan}</p>}
      {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}

      {/* 1. Le fichier ---------------------------------------------------------- */}
      <fieldset className="space-y-3" disabled={occupe}>
        <legend className="text-sm font-medium text-ardoise-800">{t('ajout.importLevees.etapes.fichier')}</legend>
        <label
          className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 ${occupe ? 'opacity-50' : ''}`}
        >
          {occupe && !colonnes ? t('import.lecture') : fichier ? t('ajout.importLevees.autreFichier', { fichier: fichier.nomFichier }) : t('ajout.importLevees.choisir')}
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              const fl = e.target.files?.[0];
              // Remis à vide : rechoisir le même fichier après une correction doit relancer la lecture.
              e.target.value = '';
              if (fl) void choisirFichier(fl);
            }}
          />
        </label>
      </fieldset>

      {/* 2. La correspondance des colonnes ------------------------------------- */}
      {colonnes && correspondance && (
        <fieldset className="space-y-3" disabled={occupe}>
          <legend className="text-sm font-medium text-ardoise-800">
            {t('ajout.importLevees.etapes.colonnes', { lignes: formaterNombre(colonnes.lignes, 0), fichier: colonnes.fichier })}
          </legend>
          {colonnes.feuille && <p className="text-xs text-ardoise-600">{t('ajout.importLevees.feuille', { feuille: colonnes.feuille })}</p>}
          {colonnes.avertissements.map((a) => (
            <p key={a} className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{a}</p>
          ))}
          <p className="text-sm text-ardoise-600">
            {colonnes.modeleEnregistre ? t('ajout.importLevees.modeleEnregistre') : t('ajout.importLevees.modeleNouveau')}
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
                            {t(`ajout.importEtablissements.provenances.${provenance ?? 'aucune'}`)}
                          </Pastille>
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs text-ardoise-600">
                        <bdi dir="ltr">{exemples.length > 0 ? exemples.join(' · ') : '—'}</bdi>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {problemesColonnes.length > 0 && (
            <ul className="list-disc rounded-lg bg-ardoise-50 p-3 ps-8 text-sm text-ardoise-700">
              {[...new Set(problemesColonnes)].map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={bouton} disabled={problemesColonnes.length > 0} onClick={() => void voirApercu()}>
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
            {t('ajout.importLevees.etapes.apercu')} — <span className="font-normal text-ardoise-600">{t('import.rienEcrit')}</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {ORDRE_RESUME.map((a) =>
              apercu.resume[a] > 0 ? (
                <Pastille key={a} ton={TON_ACTION[a]}>
                  {t(`ajout.importLevees.actions.${a}`)} : {formaterNombre(apercu.resume[a], 0)}
                </Pastille>
              ) : null
            )}
          </div>
          {apercu.avertissements.map((a) => (
            <p key={a} className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{a}</p>
          ))}
          <ul className="divide-y divide-ardoise-100 rounded-lg border border-ardoise-200">
            {lignes.slice(0, LIGNES_AFFICHEES).map((l) => (
              <li key={l.numero} className="space-y-1 p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chiffres text-xs text-ardoise-500">{t('ajout.importEtablissements.ligne', { n: l.numero })}</span>
                  <Pastille ton={TON_ACTION[l.action]}>{t(`ajout.importLevees.actions.${l.action}`)}</Pastille>
                  <span className="font-medium text-ardoise-900">{l.etablissement || '—'}</span>
                  <span className="text-xs text-ardoise-600">
                    {f.date(l.date)}
                    {l.heure && <bdi dir="ltr"> {l.heure}</bdi>}
                    {l.voyage != null && ` · ${t('levees.feuille.voyageN', { n: l.voyage })}`}
                    {l.flux_code && <> · <bdi dir="ltr">{l.flux_code}</bdi></>}
                  </span>
                </div>
                {l.erreurs.map((e) => (
                  <p key={e} className="text-xs text-red-800">{e}</p>
                ))}
              </li>
            ))}
          </ul>
          {lignes.length > LIGNES_AFFICHEES && (
            <p className="text-xs text-ardoise-500">
              {t('ajout.importLevees.tronque', { n: formaterNombre(LIGNES_AFFICHEES, 0), total: formaterNombre(lignes.length, 0) })}
            </p>
          )}
          {apercuPerime && <p role="status" className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{t('ajout.importLevees.apercuPerime')}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={bouton} disabled={occupe || aProposer === 0 || apercuPerime || problemesColonnes.length > 0} onClick={() => void valider()}>
              {t('ajout.importLevees.valider', { count: aProposer, n: formaterNombre(aProposer, 0) })}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
