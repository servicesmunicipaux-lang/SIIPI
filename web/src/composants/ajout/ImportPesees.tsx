// L'import d'un export Kobo des pesées d'une campagne d'établissements (jalon G, lot
// G5b), en CSV ou en Excel, tel que Kobo le donne.
//
// LA MARCHE DE L'IMPORT DES LEVÉES, ÉTAPE POUR ÉTAPE. Rien n'est écrit avant la
// dernière :
//   0. la campagne — donnée par l'écran de la campagne ; depuis le catalogue, choisie
//      parmi les campagnes d'établissements OUVERTES (aucune autre n'accepte d'import) ;
//   1. le fichier ;
//   2. la CORRESPONDANCE DES COLONNES, proposée (le modèle gardé par la commune, sinon
//      les en-têtes usuels), que le directeur corrige en voyant des valeurs d'exemple ;
//   3. l'APERÇU, ligne par ligne : à enregistrer, déjà reçue, erreur (avec ce que la
//      base reproche à la ligne).
// La validation relit le fichier côté API, sous verrou de la campagne : l'aperçu
// affiché n'est jamais repris tel quel. À la différence des levées, une pesée
// importée est enregistrée d'emblée — c'est la commune qui pèse.
//
// LA DURÉE SE LIT EN JOURS OU EN HEURES, JAMAIS LES DEUX : l'écran le dit avant que
// l'API ne le refuse.
//
// UNE VALIDATION QUI ÉCHOUE N'EST PAS UNE VALIDATION SANS EFFET. La réponse a pu se
// perdre après l'écriture (coupure, frontal redémarré), la base a pu changer (import
// d'ailleurs, campagne close) : après tout échec, l'aperçu se relit — il dit alors ce
// qui est déjà reçu — et l'écran de la campagne relit son registre et son état, par un
// rappel distinct de `onFait`, qui annoncerait un succès.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  lireFichierLocal,
  type ApercuImportPesees,
  type CampagnePesee,
  type ChampImportPesees,
  type ColonnesImportPesees,
  type LigneImportPesees,
} from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { useFormats } from '../../lib/formats';
import { formaterExact, texteDuree } from '../campagnesPesee/mesures';
import { Chargement, Erreur } from '../Elements';
import { Pastille, type TonPastille } from '../ui/Pastille';
import { champAjout } from './CadreAjout';

type Correspondance = Record<ChampImportPesees, string | null>;
type Action = LigneImportPesees['action'];

const bouton = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
const boutonDiscret = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';

const TON_ACTION: Record<Action, TonPastille> = { enregistrer: 'mesure', deja_recue: 'neutre', erreur: 'attention' };
// Les lignes : ce qui demande le regard d'abord.
const ORDRE: Action[] = ['erreur', 'enregistrer', 'deja_recue'];
const ORDRE_RESUME: Action[] = ['enregistrer', 'deja_recue', 'erreur'];
const LIGNES_AFFICHEES = 200;

export function ImportPesees({
  communeId,
  campagneId,
  onFait,
  onAnnuler,
  onBaseChangee,
}: {
  communeId: string;
  /** La campagne de l'écran ; absente (catalogue), le directeur la choisit parmi les ouvertes. */
  campagneId?: string;
  onFait: () => void | Promise<void>;
  onAnnuler?: () => void;
  /** Une validation a échoué : des pesées ont pu entrer en base, ou la campagne changer ; l'écran se relit. */
  onBaseChangee?: () => void | Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const arabe = i18n.language.startsWith('ar');
  const [ouvertes, setOuvertes] = useState<CampagnePesee[] | null>(null);
  const [campagnesIndisponibles, setCampagnesIndisponibles] = useState(false);
  const [essai, setEssai] = useState(0);
  const [choisie, setChoisie] = useState(campagneId ?? '');
  const [fichier, setFichier] = useState<{ nomFichier: string; contenu: string } | null>(null);
  const [colonnes, setColonnes] = useState<ColonnesImportPesees | null>(null);
  const [correspondance, setCorrespondance] = useState<Correspondance | null>(null);
  const [apercu, setApercu] = useState<ApercuImportPesees | null>(null);
  // Les entrées qui ont produit l'aperçu affiché : une correspondance (ou une campagne)
  // changée après l'aperçu demande un nouvel aperçu avant de valider.
  const [entreesApercu, setEntreesApercu] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [bilan, setBilan] = useState<string | null>(null);

  // Depuis le catalogue seulement : les campagnes qui acceptent un import.
  useEffect(() => {
    if (campagneId) return;
    setCampagnesIndisponibles(false);
    api
      .campagnesPesee(communeId)
      .then((l) => {
        const o = l.filter((c) => c.objet === 'etablissements' && c.statut === 'ouverte');
        setOuvertes(o);
        if (o.length === 1) setChoisie(o[0].id);
      })
      .catch(() => setCampagnesIndisponibles(true));
  }, [communeId, campagneId, essai]);

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
    // La durée : une colonne, en jours ou en heures — jamais aucune, jamais les deux.
    if (correspondance.duree_jours && correspondance.duree_heures) p.push(t('ajout.importPesees.problemes.dureeDeux'));
    if (!correspondance.duree_jours && !correspondance.duree_heures) p.push(t('ajout.importPesees.problemes.dureeAucune'));
    return p;
  }, [colonnes, correspondance, arabe, t]);

  const oublier = () => {
    setApercu(null);
    setColonnes(null);
    setFichier(null);
    setCorrespondance(null);
  };

  const choisirFichier = async (fl: File) => {
    if (!choisie) return;
    setOccupe(true);
    setErreur(null);
    setBilan(null);
    setApercu(null);
    try {
      const lu = await lireFichierLocal(fl);
      const c = await api.colonnesImportPesees(choisie, lu);
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

  const cleEntrees =
    fichier && correspondance ? JSON.stringify({ campagne: choisie, nomFichier: fichier.nomFichier, contenu: fichier.contenu.length, correspondance }) : null;
  const apercuPerime = apercu !== null && cleEntrees !== entreesApercu;

  /** Relit l'aperçu ; `garderErreur` laisse affiché un refus qui l'a demandé (un 409, par exemple). */
  const voirApercu = async (garderErreur = false) => {
    if (!fichier || !correspondance || !choisie) return;
    setOccupe(true);
    if (!garderErreur) setErreur(null);
    try {
      const cle = cleEntrees;
      setApercu(await api.importerPesees(choisie, { ...fichier, correspondance, valider: false }));
      setEntreesApercu(cle);
    } catch (err) {
      setErreur(message(err));
    } finally {
      setOccupe(false);
    }
  };

  const valider = async () => {
    if (apercuPerime || !fichier || !correspondance || !choisie) return;
    setOccupe(true);
    setErreur(null);
    let relire = false;
    try {
      const r = await api.importerPesees(choisie, { ...fichier, correspondance, valider: true });
      const n = r.enregistrees ?? 0;
      setBilan(t('ajout.importPesees.bilan', { count: n, n: formaterNombre(n, 0) }));
      oublier();
      await onFait();
    } catch (err) {
      setErreur(message(err));
      // 409 : la base a changé. 400 : « rien à enregistrer », quand l'aperçu disait le
      // contraire. 0 ou 5xx : la réponse s'est perdue, l'écriture a pu avoir lieu.
      relire = err instanceof ErreurApi && (err.statut === 0 || err.statut === 400 || err.statut === 409 || err.statut >= 500);
    } finally {
      setOccupe(false);
    }
    // L'aperçu se relit (le refus qui l'a demandé reste affiché), puis la campagne.
    if (relire) {
      setApercu(null);
      await voirApercu(true);
      await onBaseChangee?.();
    }
  };

  if (!campagneId && campagnesIndisponibles) {
    return <Erreur message={t('ajout.importPesees.campagnesIndisponibles')} onReessayer={() => setEssai((n) => n + 1)} />;
  }
  if (!campagneId && !ouvertes) return <Chargement />;

  const lignes = apercu ? [...apercu.lignes].sort((a, b) => ORDRE.indexOf(a.action) - ORDRE.indexOf(b.action) || a.numero - b.numero) : [];
  const aEnregistrer = apercu?.resume.enregistrer ?? 0;

  return (
    <section className="w-full space-y-4 rounded-xl border border-ardoise-200 bg-white p-4" aria-labelledby="import-pesees-titre">
      <div>
        <h2 id="import-pesees-titre" className="text-base font-semibold text-ardoise-900">{t('ajout.importPesees.titre')}</h2>
        <p className="mt-1 text-sm text-ardoise-600">{t('ajout.importPesees.aide')}</p>
        <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm text-ardoise-600">
          <li>{t('ajout.importPesees.aideDuree')}</li>
          <li>{t('ajout.importPesees.aideEtablissement')}</li>
          <li>{t('ajout.importPesees.aideNombres')}</li>
          <li>{t('ajout.importPesees.aideCles')}</li>
        </ul>
      </div>
      {bilan && <p role="status" className="rounded-lg bg-siipi-50 p-3 text-sm text-siipi-800">{bilan}</p>}
      {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}

      {/* 0. La campagne (catalogue) ------------------------------------------- */}
      {!campagneId && ouvertes && (
        <fieldset className="space-y-2" disabled={occupe}>
          <legend className="text-sm font-medium text-ardoise-800">{t('ajout.importPesees.etapes.campagne')}</legend>
          {ouvertes.length === 0 ? (
            <p className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">{t('ajout.importPesees.aucuneOuverte')}</p>
          ) : (
            <label className="block max-w-xl text-sm">
              {t('ajout.importPesees.campagne')}
              <select
                value={choisie}
                onChange={(e) => {
                  // Une autre campagne : le fichier se relit pour elle (son modèle, ses établissements).
                  setChoisie(e.target.value);
                  oublier();
                  setErreur(null);
                }}
                className={champAjout}
              >
                <option value="">{t('ajout.etablissement.choisir')}</option>
                {ouvertes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.intitule} — {t('campagnesPesee.periode', { debut: f.date(c.date_debut), fin: f.date(c.date_fin) })}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
      )}

      {/* 1. Le fichier ---------------------------------------------------------- */}
      {choisie && (
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
          {!colonnes && onAnnuler && (
            <div>
              <button type="button" className={boutonDiscret} onClick={onAnnuler}>
                {t('commun.annuler')}
              </button>
            </div>
          )}
        </fieldset>
      )}

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
                  const retenue = correspondance[c.cle];
                  const proposee = (colonnes.correspondance as Correspondance)[c.cle];
                  const provenance = retenue !== proposee ? 'modifiee' : colonnes.provenance[c.cle];
                  const indice = retenue ? colonnes.entetes.indexOf(retenue) : -1;
                  const exemples = indice >= 0 ? colonnes.exemples.map((r) => r[indice]).filter((v) => v !== '') : [];
                  return (
                    <tr key={c.cle} className="border-t border-ardoise-100 align-top">
                      <th scope="row" className="px-2 py-2 text-start font-normal text-ardoise-800">
                        {arabe ? c.ar : c.fr}
                        {c.obligatoire && <span className="ms-1 text-xs text-ardoise-500">({t('ajout.importEtablissements.obligatoire')})</span>}
                      </th>
                      <td className="px-2 py-2">
                        <select
                          value={retenue ?? ''}
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
                  {t(`ajout.importPesees.actions.${a}`)} : {formaterNombre(apercu.resume[a], 0)}
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
                  <Pastille ton={TON_ACTION[l.action]}>{t(`ajout.importPesees.actions.${l.action}`)}</Pastille>
                  <span className="font-medium text-ardoise-900">{l.etablissement || '—'}</span>
                  <span className="text-xs text-ardoise-600">
                    {l.date ? f.date(l.date) : '—'}
                    {' · '}
                    {t('ajout.importPesees.poidsDuree', {
                      poids: l.poids_kg === null ? '—' : formaterExact(l.poids_kg, 3),
                      duree: l.duree_jours === null ? '—' : texteDuree(t, l.duree_jours),
                    })}
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
            <button type="button" className={bouton} disabled={occupe || aEnregistrer === 0 || apercuPerime || problemesColonnes.length > 0} onClick={() => void valider()}>
              {t('ajout.importPesees.valider', { count: aEnregistrer, n: formaterNombre(aEnregistrer, 0) })}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
