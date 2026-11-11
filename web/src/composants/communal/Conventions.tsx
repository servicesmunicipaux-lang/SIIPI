// Les conventions de propreté de la commune (jalon G, lot G4a ; SPEC_G § 3.4).
//
// LE CYCLE SE LIT D'UN COUP D'ŒIL, ET CHAQUE GESTE DIT SON REFUS. Brouillon,
// instruite, signée, résiliée : l'écran n'offre que les gestes de l'état présent ;
// « active », « à venir », « expirée » se calculent d'après les dates. Un refus de
// la base (grille absente, tarif manquant, chevauchement, base légale) s'affiche
// dans la carte de la convention, en mots, avec ce qu'il faut faire.
//
// LA SIGNATURE ÉMET LE DOCUMENT SCELLÉ (CV-…) : il s'imprime ici, A4 bilingue,
// « modèle provisoire » jusqu'à la validation du gabarit. Aucun montant dû n'y
// figure : le tarif de la grille, et l'arrêté (le montant vient au lot G6).
//
// Chaque geste envoie la version lue à l'ouverture de la liste : si la convention a
// changé depuis (un autre directeur, un autre onglet), il est refusé, et la liste
// se relit avant que le refus ne s'affiche.
//
// La commune écrit ; la FNCT lit, sans aucun geste.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, imprimerDocument, type Convention, type ConventionResume, type EtatConvention } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';
import { FormulaireConvention } from '../ajout/FormulaireConvention';
import { useAjoutEnLigne } from '../ajout/useAjoutEnLigne';
import { Pastille, type TonPastille } from '../ui/Pastille';

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const bouton = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
const boutonDiscret = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';

// Le jour à Tunis : une signature ou une résiliation se date au plus tard aujourd'hui.
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

const TON_ETAT: Record<EtatConvention, TonPastille> = {
  brouillon: 'neutre',
  instruite: 'declare',
  a_venir: 'declare',
  active: 'mesure',
  expiree: 'neutre',
  resiliee: 'attention',
  registre: 'neutre',
};
const FILTRES: Array<'' | 'brouillon' | 'instruite' | 'signee' | 'resiliee'> = ['', 'brouillon', 'instruite', 'signee', 'resiliee'];

type Geste =
  | { id: string; nature: 'signer'; date: string; reference: string }
  | { id: string; nature: 'resilier'; date: string; motif: string; reference: string };

export function Conventions({ communeId }: { communeId: string }) {
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const { utilisateur } = useAuth();
  const peutEcrire = utilisateur?.role === 'admin_commune';
  const arabe = i18n.language.startsWith('ar');
  const [liste, setListe] = useState<ConventionResume[] | null>(null);
  const [filtre, setFiltre] = useState<(typeof FILTRES)[number]>('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState<Convention | null>(null);
  const [modifiee, setModifiee] = useState<Convention | null>(null);
  const [geste, setGeste] = useState<Geste | null>(null);
  const [refusCarte, setRefusCarte] = useState<{ id: string; texte: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Seule la dernière lecture demandée s'affiche : un filtre changé pendant une
  // lecture lente ne laisse pas l'ancienne liste écraser la nouvelle.
  const derniere = useRef(0);
  const charger = useCallback(async () => {
    const numero = ++derniere.current;
    try {
      const lue = await api.conventions(communeId, filtre || undefined);
      if (numero !== derniere.current) return;
      setListe(lue);
      setErreur(null);
    } catch (err) {
      if (numero !== derniere.current) return;
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [communeId, filtre, t]);
  useEffect(() => {
    void charger();
  }, [charger]);

  const ajout = useAjoutEnLigne('convention', communeId, t('communal.conventions.nouvelle'), async () => {
    setMessage(t('communal.conventions.messages.redigee'));
    await charger();
  });

  /** Ouvre (ou referme) le détail d'une convention : ses lignes, sa version du moment. */
  const ouvrir = async (id: string) => {
    if (ouverte?.id === id) {
      setOuverte(null);
      return;
    }
    try {
      setOuverte(await api.convention(id));
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  /** Un geste du cycle, avec la version lue ; un refus s'affiche dans la carte, après la relecture. */
  const agir = async (c: ConventionResume, action: () => Promise<Convention | void>, succes: string) => {
    setEnvoi(true);
    setMessage(null);
    setRefusCarte(null);
    try {
      const r = await action();
      setGeste(null);
      setMessage(t(succes, { etablissement: c.etablissement }));
      await charger();
      if (r && ouverte?.id === c.id) setOuverte(r);
      else if (!r && ouverte?.id === c.id) setOuverte(null);
    } catch (err) {
      const texte = err instanceof ErreurApi ? err.message : t('commun.erreur');
      // La convention a changé, ou une condition manque : la liste se relit d'abord
      // (sinon le prochain essai partirait encore avec l'ancienne version), puis le
      // refus s'affiche dans la carte.
      if (err instanceof ErreurApi && err.statut === 409) {
        await charger();
        if (ouverte?.id === c.id) setOuverte(await api.convention(c.id).catch(() => null));
      }
      setRefusCarte({ id: c.id, texte });
    } finally {
      setEnvoi(false);
    }
  };

  const imprimer = async (c: ConventionResume) => {
    if (!c.document_id) return;
    setRefusCarte(null);
    try {
      await imprimerDocument(c.document_id);
    } catch (err) {
      setRefusCarte({ id: c.id, texte: err instanceof ErreurApi ? err.message : t('commun.erreur') });
    }
  };

  if (erreur && !liste) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!liste) return <Chargement />;

  const tarif = (c: ConventionResume) =>
    c.mode_tarification && c.tarif != null
      ? t(`communal.conventions.modes.${c.mode_tarification}`, { tarif: formaterNombre(c.tarif, 3) })
      : null;
  const gesteIncomplet = (g: Geste) =>
    !g.date || [...g.reference.trim()].length < 3 || (g.nature === 'resilier' && [...g.motif.trim()].length < 5);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.conventions.titre')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-500">{t('communal.conventions.chapeau')}</p>
        </div>
        <div className="flex flex-wrap gap-2">{ajout.bouton}</div>
      </header>
      {!peutEcrire && <p className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">{t('communal.conventions.lectureSeule')}</p>}
      {ajout.formulaire}
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

      <label className="block max-w-xs text-sm">
        {t('communal.conventions.filtre')}
        <select value={filtre} onChange={(e) => setFiltre(e.target.value as (typeof FILTRES)[number])} className={champ}>
          {FILTRES.map((s) => (
            <option key={s || 'tous'} value={s}>{t(`communal.conventions.filtres.${s || 'tous'}`)}</option>
          ))}
        </select>
      </label>

      {liste.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ardoise-300 bg-white p-4 text-sm text-ardoise-600">
          {filtre ? t('communal.conventions.aucuneFiltre') : t('communal.conventions.aucune')}
        </p>
      ) : (
        <ul className="space-y-3">
          {liste.map((c) => (
            <li key={c.id} className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-4">
              {modifiee?.id === c.id ? (
                <FormulaireConvention
                  communeId={communeId}
                  convention={modifiee}
                  onAnnuler={() => setModifiee(null)}
                  onFait={async () => {
                    setModifiee(null);
                    setMessage(t('communal.conventions.messages.modifiee', { etablissement: c.etablissement }));
                    await charger();
                  }}
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-ardoise-900">{c.etablissement}</p>
                      <p className="text-sm text-ardoise-600">
                        {t('communal.conventions.periode', { debut: f.date(c.date_debut), fin: c.date_fin ? f.date(c.date_fin) : '—' })}
                        {c.numero_document && <span className="ms-2 font-mono text-xs" dir="ltr">{c.numero_document}</span>}
                      </p>
                    </div>
                    <Pastille ton={TON_ETAT[c.etat]}>{t(`communal.conventions.etats.${c.etat}`)}</Pastille>
                  </div>
                  {tarif(c) && <p className="text-sm text-ardoise-700">{tarif(c)} — {c.grille}</p>}
                  {c.date_signature && (
                    <p className="text-xs text-ardoise-600">{t('communal.conventions.signeeLe', { date: f.date(c.date_signature), reference: c.reference_signature ?? '' })}</p>
                  )}
                  {c.date_resiliation && (
                    <p className="text-xs text-ardoise-600">
                      {t('communal.conventions.resilieeLe', { date: f.date(c.date_resiliation), motif: c.motif_resiliation ?? '' })}
                    </p>
                  )}
                  {c.statut_etablissement === 'a_verifier' && (
                    <p className="text-xs text-amber-800">{t('communal.conventions.etablissementAVerifier')}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={boutonDiscret} onClick={() => void ouvrir(c.id)} aria-expanded={ouverte?.id === c.id}>
                      {ouverte?.id === c.id ? t('communal.conventions.masquer') : t('communal.conventions.detail')}
                    </button>
                    {c.document_id && (
                      <button type="button" className={boutonDiscret} onClick={() => void imprimer(c)}>
                        {t('communal.conventions.imprimer')}
                      </button>
                    )}
                    {peutEcrire && c.statut === 'brouillon' && (
                      <>
                        <button
                          type="button"
                          className={boutonDiscret}
                          disabled={envoi}
                          onClick={() => void api.convention(c.id).then(setModifiee).catch((err) => setRefusCarte({ id: c.id, texte: err instanceof ErreurApi ? err.message : t('commun.erreur') }))}
                        >
                          {t('communal.conventions.modifier')}
                        </button>
                        <button type="button" className={bouton} disabled={envoi} onClick={() => void agir(c, () => api.instruireConvention(c.id, c.version), 'communal.conventions.messages.instruite')}>
                          {t('communal.conventions.instruire')}
                        </button>
                        <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => void agir(c, () => api.retirerConvention(c.id, c.version), 'communal.conventions.messages.retiree')}>
                          {t('communal.conventions.retirer')}
                        </button>
                      </>
                    )}
                    {peutEcrire && c.statut === 'instruite' && (
                      <>
                        <button type="button" className={bouton} disabled={envoi} onClick={() => setGeste({ id: c.id, nature: 'signer', date: aujourdhui(), reference: '' })}>
                          {t('communal.conventions.signer')}
                        </button>
                        <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => void agir(c, () => api.reprendreConvention(c.id, c.version), 'communal.conventions.messages.reprise')}>
                          {t('communal.conventions.reprendre')}
                        </button>
                      </>
                    )}
                    {peutEcrire && c.statut === 'signee' && (
                      <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => setGeste({ id: c.id, nature: 'resilier', date: aujourdhui(), motif: '', reference: '' })}>
                        {t('communal.conventions.resilier')}
                      </button>
                    )}
                  </div>

                  {geste?.id === c.id && (
                    <div className="grid gap-3 rounded-lg bg-ardoise-50 p-3 sm:grid-cols-3">
                      <p className="text-sm text-ardoise-700 sm:col-span-3">
                        {t(geste.nature === 'signer' ? 'communal.conventions.aideSignature' : 'communal.conventions.aideResiliation')}
                      </p>
                      <label className="text-sm">
                        {t(geste.nature === 'signer' ? 'communal.conventions.dateSignature' : 'communal.conventions.dateResiliation')}
                        <input type="date" value={geste.date} max={geste.nature === 'signer' ? aujourdhui() : (c.date_fin ?? undefined)} onChange={(e) => setGeste({ ...geste, date: e.target.value })} className={champ} />
                      </label>
                      <label className="text-sm">
                        {t('communal.conventions.reference')}
                        <input value={geste.reference} onChange={(e) => setGeste({ ...geste, reference: e.target.value })} maxLength={200} className={champ} />
                      </label>
                      {geste.nature === 'resilier' && (
                        <label className="text-sm">
                          {t('communal.conventions.motif')}
                          <input value={geste.motif} onChange={(e) => setGeste({ ...geste, motif: e.target.value })} maxLength={1000} className={champ} />
                        </label>
                      )}
                      <div className="flex flex-wrap gap-2 sm:col-span-3">
                        <button
                          type="button"
                          className={bouton}
                          disabled={envoi || gesteIncomplet(geste)}
                          onClick={() =>
                            void agir(
                              c,
                              () =>
                                geste.nature === 'signer'
                                  ? api.signerConvention(c.id, { version: c.version, dateSignature: geste.date, referenceSignature: geste.reference.trim() })
                                  : api.resilierConvention(c.id, {
                                      version: c.version,
                                      dateResiliation: geste.date,
                                      motif: geste.motif.trim(),
                                      reference: geste.reference.trim(),
                                    }),
                              geste.nature === 'signer' ? 'communal.conventions.messages.signee' : 'communal.conventions.messages.resiliee'
                            )
                          }
                        >
                          {t(geste.nature === 'signer' ? 'communal.conventions.confirmerSignature' : 'communal.conventions.confirmerResiliation')}
                        </button>
                        <button type="button" className={boutonDiscret} onClick={() => setGeste(null)}>
                          {t('commun.annuler')}
                        </button>
                      </div>
                    </div>
                  )}

                  {refusCarte?.id === c.id && (
                    <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{refusCarte.texte}</p>
                  )}

                  {ouverte?.id === c.id && (
                    <div className="space-y-1 rounded-lg border border-ardoise-100 p-3 text-sm">
                      <p className="font-medium text-ardoise-800">{t('communal.conventions.lignes')}</p>
                      {ouverte.lignes.length === 0 ? (
                        <p className="text-ardoise-600">{t('communal.conventions.aucuneLigne')}</p>
                      ) : (
                        <ul className="list-disc space-y-0.5 ps-5 text-ardoise-700">
                          {ouverte.lignes.map((l) => (
                            <li key={l.id}>
                              {(arabe ? l.flux_ar : l.flux_fr) ?? l.flux_code} —{' '}
                              {t('communal.conventions.frequence', { n: l.levees_par_semaine })}
                              {l.volume_litres != null && `, ${t('communal.conventions.volume', { v: formaterNombre(l.volume_litres, 1) })}`}
                              {l.conteneur && `, ${t('communal.conventions.conteneur', { code: l.conteneur })}`}
                            </li>
                          ))}
                        </ul>
                      )}
                      {ouverte.observation && <p className="text-ardoise-600">{ouverte.observation}</p>}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
