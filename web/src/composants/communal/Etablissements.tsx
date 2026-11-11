// Les établissements de la commune (jalon G, lot G2a ; SPEC_G § 3.1) :
// commerces, institutions et services, tels qu'ils seront conventionnés.
//
// UN ÉTABLISSEMENT NE SE SUPPRIME PAS. L'écran n'offre que de le fermer (avec
// la date constatée et le motif), de le signaler « à vérifier », ou de le
// rouvrir ; un établissement fermé reste dans la liste, et son historique au
// journal d'audit.
//
// L'IDENTITÉ DU RESPONSABLE EST À PART. Elle ne s'affiche qu'à la demande du
// directeur, et chaque lecture est journalisée ; tant que la FNCT n'a pas déclaré
// l'hébergement accrédité et que la commune n'a pas son récépissé INPDP, l'écran
// dit pourquoi elle ne s'enregistre pas, plutôt que d'offrir un formulaire voué
// au refus.
//
// La commune écrit ; la FNCT lit, sans aucun geste.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Etablissement, type IdentiteEtablissement, type ImportEtablissementsJournal, type StatutEtablissement } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';
import { BoutonExport } from '../BoutonExport';
import { FormulaireEtablissement } from '../ajout/FormulaireEtablissement';
import { useAjoutEnLigne } from '../ajout/useAjoutEnLigne';
import { Pastille, type TonPastille } from '../ui/Pastille';

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const bouton = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
const boutonDiscret = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';

// Le jour à Tunis : une fermeture se constate, jamais dans l'avenir.
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

const TON_STATUT: Record<StatutEtablissement, TonPastille> = { actif: 'mesure', ferme: 'neutre', a_verifier: 'attention' };

type Geste = { id: string; statut: StatutEtablissement; date: string; motif: string };

export function Etablissements({ communeId }: { communeId: string }) {
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const { utilisateur } = useAuth();
  const peutEcrire = utilisateur?.role === 'admin_commune';
  const arabe = i18n.language.startsWith('ar');
  const [liste, setListe] = useState<Etablissement[] | null>(null);
  const [filtreStatut, setFiltreStatut] = useState<StatutEtablissement | ''>('');
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [modifie, setModifie] = useState<string | null>(null);
  const [geste, setGeste] = useState<Geste | null>(null);
  const [identiteOuverte, setIdentiteOuverte] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Seule la dernière lecture demandée s'affiche : une recherche plus ancienne,
  // plus lente, écrirait sinon ses résultats sous le texte de la nouvelle.
  const derniereLecture = useRef(0);
  const charger = useCallback(async () => {
    const numero = ++derniereLecture.current;
    try {
      const lue = await api.etablissements(communeId, { statut: filtreStatut || undefined, q: recherche.trim() || undefined });
      if (numero !== derniereLecture.current) return;
      setListe(lue);
      setErreur(null);
    } catch (err) {
      if (numero !== derniereLecture.current) return;
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [communeId, filtreStatut, recherche, t]);

  // La liste reste affichée pendant qu'elle se relit : la vider démonterait un
  // formulaire ouvert, et un changement de langue effacerait la saisie.
  useEffect(() => {
    const minuterie = setTimeout(() => void charger(), 250);
    return () => clearTimeout(minuterie);
  }, [charger]);

  const ajout = useAjoutEnLigne('commerce', communeId, t('communal.etablissements.nouveau'), async () => {
    setMessage(t('communal.etablissements.messages.inscrit'));
    await charger();
  });
  // Le journal des imports : chaque fichier, sa source et, pour l'open data, sa licence.
  const [imports, setImports] = useState<ImportEtablissementsJournal[]>([]);
  const chargerImports = useCallback(() => {
    api.importsEtablissements(communeId).then(setImports).catch(() => setImports([]));
  }, [communeId]);
  useEffect(() => chargerImports(), [chargerImports]);
  const importer = useAjoutEnLigne('import-etablissements', communeId, t('communal.etablissements.importer'), async () => {
    // Le formulaire se referme : le bilan se dit ici, et le détail reste au journal des imports.
    setMessage(t('communal.etablissements.messages.importe'));
    await charger();
    chargerImports();
  });

  const changerStatut = async () => {
    if (!geste) return;
    setEnvoi(true);
    setMessage(null);
    try {
      await api.changerStatutEtablissement(geste.id, {
        statut: geste.statut,
        motif: geste.motif.trim(),
        ...(geste.statut === 'ferme' ? { date: geste.date } : {}),
      });
      setGeste(null);
      setMessage(t(`communal.etablissements.messages.${geste.statut}`));
      setErreur(null);
      await charger();
    } catch (err) {
      const refus = err instanceof ErreurApi ? err.message : t('commun.erreur');
      if (err instanceof ErreurApi && err.statut === 409) await charger();
      setErreur(refus);
    } finally {
      setEnvoi(false);
    }
  };

  if (erreur && !liste) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!liste) return <Chargement />;

  const nombre = (v: number) => formaterNombre(v, Number.isInteger(v) ? 0 : 2);
  const gesteIncomplet = (g: Geste) => [...g.motif.trim()].length < 5 || (g.statut === 'ferme' && !g.date);
  const cheminExport = `/etablissements?communeId=${encodeURIComponent(communeId)}`;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.etablissements.titre')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-500">{t('communal.etablissements.chapeau')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ajout.bouton}
          {importer.bouton}
          <BoutonExport chemin={cheminExport} desactive={liste.length === 0} />
        </div>
      </header>
      {!peutEcrire && <p className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">{t('communal.etablissements.lectureSeule')}</p>}
      {ajout.formulaire}
      {importer.formulaire}
      {message && (
        <p role="status" className="rounded-lg bg-siipi-50 p-3 text-sm text-siipi-800">
          {message}
        </p>
      )}
      {erreur && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {erreur}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          {t('communal.etablissements.filtres.statut')}
          <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value as StatutEtablissement | '')} className={champ}>
            <option value="">{t('communal.etablissements.filtres.tous')}</option>
            {(['actif', 'a_verifier', 'ferme'] as const).map((s) => (
              <option key={s} value={s}>{t(`communal.etablissements.statuts.${s}`)}</option>
            ))}
          </select>
        </label>
        <label className="min-w-56 flex-1 text-sm">
          {t('communal.etablissements.filtres.recherche')}
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} maxLength={100} className={champ} />
        </label>
      </div>

      {liste.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ardoise-300 bg-white p-4 text-sm text-ardoise-600">
          {filtreStatut || recherche.trim() ? t('communal.etablissements.aucunFiltre') : t('communal.etablissements.aucun')}
        </p>
      ) : (
        <ul className="space-y-3">
          {liste.map((e) => (
            <li key={e.id} className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-4">
              {modifie === e.id ? (
                <FormulaireEtablissement
                  communeId={communeId}
                  etablissement={e}
                  onAnnuler={() => setModifie(null)}
                  onFait={async () => {
                    setModifie(null);
                    setMessage(t('communal.etablissements.messages.modifie'));
                    await charger();
                  }}
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-ardoise-900">{e.nom}</h2>
                        <Pastille ton={TON_STATUT[e.statut]}>{t(`communal.etablissements.statuts.${e.statut}`)}</Pastille>
                        {e.produit_dangereux && <Pastille ton="attention">{t('communal.etablissements.dangereux')}</Pastille>}
                        {e.sous_convention && <Pastille ton="neutre">{t('communal.etablissements.sousConvention')}</Pastille>}
                      </div>
                      <p className="text-sm text-ardoise-700">
                        {(arabe ? e.categorie_activite_ar : e.categorie_activite_fr) ?? t('communal.etablissements.categorieNonRenseignee')}
                        {e.activite && ` · ${e.activite}`}
                        {e.unite_echelle && e.valeur_echelle != null &&
                          ` · ${nombre(e.valeur_echelle)} ${t(`national.parametres.assimiles.unites.${e.unite_echelle}`)}`}
                      </p>
                      <p className="text-sm text-ardoise-700">
                        {e.matricule_fiscal ? (
                          <span dir="ltr">{e.matricule_fiscal}</span>
                        ) : (
                          t(`communal.etablissements.identifiants.${e.statut_identifiant}`)
                        )}
                        {e.secteur && ` · ${e.secteur}`}
                        {e.adresse && ` · ${e.adresse}`}
                      </p>
                      <p className="text-xs text-ardoise-500">
                        {t(`communal.etablissements.sources.${e.source_creation}`)}
                        {e.latitude != null
                          ? ` · ${t('communal.etablissements.positionRelevee', { precision: nombre(e.precision_m ?? 0) })}`
                          : ` · ${t('communal.etablissements.sansPosition')}`}
                      </p>
                      {e.statut === 'ferme' && e.ferme_le && (
                        <p className="text-sm text-ardoise-700">{t('communal.etablissements.fermeLe', { date: f.date(e.ferme_le), motif: e.motif_statut ?? '' })}</p>
                      )}
                      {e.statut === 'a_verifier' && <p className="text-sm text-amber-900">{t('communal.etablissements.aVerifier', { motif: e.motif_statut ?? '' })}</p>}
                    </div>
                    {peutEcrire && geste?.id !== e.id && (
                      <div className="flex max-w-full flex-wrap gap-2">
                        <button type="button" className={boutonDiscret} onClick={() => setModifie(e.id)}>
                          {t('communal.etablissements.gestes.modifier')}
                        </button>
                        {e.statut !== 'ferme' && (
                          <button type="button" className={boutonDiscret} onClick={() => setGeste({ id: e.id, statut: 'ferme', date: '', motif: '' })}>
                            {t('communal.etablissements.gestes.fermer')}
                          </button>
                        )}
                        {e.statut === 'actif' && (
                          <button type="button" className={boutonDiscret} onClick={() => setGeste({ id: e.id, statut: 'a_verifier', date: '', motif: '' })}>
                            {t('communal.etablissements.gestes.aVerifier')}
                          </button>
                        )}
                        {e.statut !== 'actif' && (
                          <button type="button" className={boutonDiscret} onClick={() => setGeste({ id: e.id, statut: 'actif', date: '', motif: '' })}>
                            {e.statut === 'ferme' ? t('communal.etablissements.gestes.rouvrir') : t('communal.etablissements.gestes.confirmer')}
                          </button>
                        )}
                        <button
                          type="button"
                          className={boutonDiscret}
                          aria-expanded={identiteOuverte === e.id}
                          onClick={() => setIdentiteOuverte(identiteOuverte === e.id ? null : e.id)}
                        >
                          {t('communal.etablissements.gestes.identite')}
                        </button>
                      </div>
                    )}
                  </div>

                  {geste?.id === e.id && (
                    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-siipi-200 bg-siipi-50/40 p-3">
                      <p className="w-full text-sm text-ardoise-700">{t(`communal.etablissements.aides.${geste.statut}`)}</p>
                      {geste.statut === 'ferme' && (
                        <label className="text-xs">
                          {t('communal.etablissements.champs.dateFermeture')}
                          <input
                            type="date"
                            dir="ltr"
                            min="2000-01-01"
                            max={aujourdhui()}
                            value={geste.date}
                            onChange={(ev) => setGeste({ ...geste, date: ev.target.value })}
                            className={champ}
                          />
                        </label>
                      )}
                      <label className="min-w-56 flex-1 text-xs">
                        {t('communal.etablissements.champs.motif')}
                        <input value={geste.motif} onChange={(ev) => setGeste({ ...geste, motif: ev.target.value })} maxLength={500} className={champ} />
                      </label>
                      <button type="button" className={bouton} disabled={envoi || gesteIncomplet(geste)} onClick={() => void changerStatut()}>
                        {t(`communal.etablissements.confirmer.${geste.statut}`)}
                      </button>
                      <button type="button" className={boutonDiscret} onClick={() => setGeste(null)}>
                        {t('commun.annuler')}
                      </button>
                    </div>
                  )}

                  {peutEcrire && identiteOuverte === e.id && <IdentiteResponsable communeId={communeId} etablissement={e} onChange={charger} />}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {imports.length > 0 && (
        <section className="space-y-2" aria-labelledby="journal-imports">
          <h2 id="journal-imports" className="text-base font-semibold text-ardoise-900">{t('communal.etablissements.imports.titre')}</h2>
          <ul className="space-y-2">
            {imports.map((i) => (
              <li key={i.id} className="rounded-lg border border-ardoise-200 bg-white p-3 text-sm">
                <p className="font-medium text-ardoise-900">
                  {i.nom_fichier} <span className="font-normal text-ardoise-500">— {t(`ajout.importEtablissements.sources.${i.source}`)}, {f.date(i.created_at)}</span>
                </p>
                <p className="text-xs text-ardoise-600">
                  {t('communal.etablissements.imports.comptes', {
                    crees: nombre(i.nb_crees),
                    aVerifier: nombre(i.nb_a_verifier),
                    rattaches: nombre(i.nb_rattaches),
                    attente: nombre(i.nb_sans_categorie),
                    erreurs: nombre(i.nb_erreurs),
                  })}
                </p>
                {i.licence && (
                  <p className="text-xs text-ardoise-600">{t('communal.etablissements.imports.licence', { licence: i.licence, producteur: i.producteur ?? '—' })}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * L'identité du responsable : lue seulement quand le directeur la demande
 * (chaque lecture est journalisée), écrite seulement quand la garde le permet.
 */
function IdentiteResponsable({
  communeId,
  etablissement,
  onChange,
}: {
  communeId: string;
  etablissement: Etablissement;
  onChange: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [garde, setGarde] = useState<{ accredite: boolean; recepisse: boolean } | null>(null);
  const [identite, setIdentite] = useState<IdentiteEtablissement | null | 'absente'>(null);
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [cin, setCin] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    api.gardeIdentiteEtablissements(communeId).then(setGarde).catch(() => setGarde({ accredite: false, recepisse: false }));
  }, [communeId]);

  const lire = async () => {
    setErreur(null);
    try {
      const i = await api.identiteEtablissement(etablissement.id);
      setIdentite(i);
      setNom(i.nom_responsable);
      setTelephone(i.telephone ?? '');
    } catch (err) {
      if (err instanceof ErreurApi && err.statut === 404) setIdentite('absente');
      else setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const i = await api.enregistrerIdentiteEtablissement(etablissement.id, {
        nomResponsable: nom.trim(),
        telephone: telephone.trim() || null,
        ...(cin.trim() ? { cin: cin.trim() } : {}),
      });
      setIdentite(i);
      // Le CIN ne reste pas à l'écran : seule son empreinte est gardée.
      setCin('');
      await onChange();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  const retirer = async () => {
    if (!window.confirm(t('communal.etablissements.identite.confirmerRetrait'))) return;
    setEnvoi(true);
    try {
      await api.retirerIdentiteEtablissement(etablissement.id);
      setIdentite('absente');
      setNom('');
      setTelephone('');
      await onChange();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  if (!garde) return <Chargement />;
  const ouverte = garde.accredite && garde.recepisse;
  return (
    <section className="space-y-3 rounded-lg border border-ardoise-200 bg-ardoise-50 p-3 text-sm" aria-label={t('communal.etablissements.identite.titre')}>
      <p className="text-ardoise-700">{t('communal.etablissements.identite.aide')}</p>
      {!ouverte && (
        <p className="rounded-lg bg-amber-50 p-3 text-amber-950">
          {!garde.accredite ? t('communal.etablissements.identite.gardeHebergement') : t('communal.etablissements.identite.gardeRecepisse')}
        </p>
      )}
      {identite === null ? (
        <button type="button" className={boutonDiscret} onClick={() => void lire()}>
          {t('communal.etablissements.identite.lire')}
        </button>
      ) : (
        <>
          {identite === 'absente' ? (
            <p className="text-ardoise-600">{t('communal.etablissements.identite.absente')}</p>
          ) : (
            <p className="text-ardoise-800">
              {identite.nom_responsable}
              {identite.telephone && <span dir="ltr"> · {identite.telephone}</span>}
              {' · '}
              {identite.cin_enregistre ? t('communal.etablissements.identite.cinEnregistre') : t('communal.etablissements.identite.sansCin')}
            </p>
          )}
          {ouverte && (
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-xs">
                {t('communal.etablissements.identite.nom')}
                <input value={nom} onChange={(ev) => setNom(ev.target.value)} maxLength={200} className={champ} />
              </label>
              <label className="text-xs">
                {t('communal.etablissements.identite.telephone')}
                <input value={telephone} onChange={(ev) => setTelephone(ev.target.value)} inputMode="tel" dir="ltr" maxLength={30} className={champ} />
              </label>
              <label className="text-xs">
                {t('communal.etablissements.identite.cin')}
                <input value={cin} onChange={(ev) => setCin(ev.target.value)} inputMode="numeric" dir="ltr" maxLength={30} autoComplete="off" className={champ} />
              </label>
              <div className="flex flex-wrap gap-2 sm:col-span-3">
                <button type="button" className={bouton} disabled={envoi || !nom.trim()} onClick={() => void enregistrer()}>
                  {t('communal.etablissements.identite.enregistrer')}
                </button>
              </div>
            </div>
          )}
          {identite !== 'absente' && (
            <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => void retirer()}>
              {t('communal.etablissements.identite.retirer')}
            </button>
          )}
        </>
      )}
      {erreur && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
          {erreur}
        </p>
      )}
    </section>
  );
}
