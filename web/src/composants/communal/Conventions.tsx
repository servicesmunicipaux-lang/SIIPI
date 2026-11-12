// Les conventions de propreté de la commune (jalon G, lots G4a et G4b ; SPEC_G § 3.4).
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
// UNE CONVENTION SIGNÉE NE SE MODIFIE PLUS (G4b) : un changement des déchets
// couverts est un AVENANT (son propre cycle, son document AV-…), une fin anticipée
// une résiliation, l'année suivante un RENOUVELLEMENT. Le détail montre les termes
// en vigueur aujourd'hui, ceux d'origine et chaque avenant ; la liste signale ce
// qui est « à renouveler » (fin dans moins de 60 jours, sans renouvellement).
//
// Chaque geste envoie la version lue à l'ouverture de la liste : si la convention a
// changé depuis (un autre directeur, un autre onglet), il est refusé, et la liste
// se relit avant que le refus ne s'affiche.
//
// La commune écrit ; la FNCT lit, sans aucun geste.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  imprimerDocument,
  type AvenantConvention,
  type Convention,
  type ConventionResume,
  type EtatConvention,
} from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';
import { FormulaireAvenant, FormulaireConvention } from '../ajout/FormulaireConvention';
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
const TON_AVENANT: Record<AvenantConvention['statut'], TonPastille> = { brouillon: 'neutre', instruit: 'declare', signe: 'mesure' };
const FILTRES: Array<'' | 'brouillon' | 'instruite' | 'signee' | 'resiliee' | 'a_renouveler'> = [
  '',
  'brouillon',
  'instruite',
  'signee',
  'resiliee',
  'a_renouveler',
];

type Geste =
  | { id: string; nature: 'signer'; date: string; reference: string }
  | { id: string; nature: 'resilier'; date: string; motif: string; reference: string }
  | { id: string; nature: 'signerAvenant'; avenant: AvenantConvention; date: string; reference: string };
type LigneAffichee = {
  flux_code: string;
  flux_fr: string | null;
  flux_ar: string | null;
  conteneur: string | null;
  levees_par_semaine: number;
  volume_litres: number | null;
};

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
  // Le formulaire d'avenant ouvert : une rédaction, ou un brouillon à modifier.
  // La convention y est gardée telle qu'elle était à l'ouverture : masquer ou ouvrir un
  // autre détail ne démonte pas le formulaire, et la saisie en cours n'est pas perdue.
  const [redaction, setRedaction] = useState<{ conventionId: string; convention: Convention; avenant?: AvenantConvention } | null>(null);
  const [geste, setGeste] = useState<Geste | null>(null);
  const [refusCarte, setRefusCarte] = useState<{ id: string; texte: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Seule la dernière lecture demandée s'affiche : un filtre changé pendant une
  // lecture lente ne laisse pas l'ancienne liste écraser la nouvelle.
  const derniere = useRef(0);
  const charger = useCallback(async () => {
    const numero = ++derniere.current;
    try {
      // « À renouveler » se calcule sur la liste entière : ce n'est pas un statut.
      const lue = await api.conventions(communeId, filtre && filtre !== 'a_renouveler' ? filtre : undefined);
      if (numero !== derniere.current) return;
      setListe(filtre === 'a_renouveler' ? lue.filter((c) => c.a_renouveler) : lue);
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

  /** Ouvre (ou referme) le détail d'une convention : ses termes, ses avenants, sa version du moment. */
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

  /** Le détail ouvert se relit : une convention et ses avenants se lisent ensemble. */
  const relireOuverte = async (id: string) => {
    if (ouverte?.id === id || redaction?.conventionId === id) setOuverte(await api.convention(id).catch(() => null));
  };

  /** Un geste du cycle, avec la version lue ; un refus s'affiche dans la carte, après la relecture. */
  const agir = async (
    c: ConventionResume,
    action: () => Promise<Convention | AvenantConvention | void>,
    succes: string,
    surAvenant = false
  ) => {
    setEnvoi(true);
    setMessage(null);
    setRefusCarte(null);
    try {
      const r = await action();
      setGeste(null);
      setMessage(t(succes, { etablissement: c.etablissement }));
      await charger();
      // Un geste sur un avenant relit sa convention ; un geste sur la convention rend celle-ci.
      if (r && 'convention_id' in r) await relireOuverte(c.id);
      else if (r && ouverte?.id === c.id) setOuverte(r);
      else if (!r && ouverte?.id === c.id) setOuverte(await api.convention(c.id).catch(() => null));
    } catch (err) {
      const texte = err instanceof ErreurApi ? err.message : t('commun.erreur');
      // La convention a changé, ou une condition manque : la liste se relit d'abord
      // (sinon le prochain essai partirait encore avec l'ancienne version), puis le
      // refus s'affiche dans la carte.
      if (err instanceof ErreurApi && (err.statut === 409 || err.statut === 404)) {
        await charger();
        const lue = ouverte?.id === c.id || (geste?.id === c.id && geste.nature === 'signerAvenant') ? await api.convention(c.id).catch(() => null) : null;
        if (ouverte?.id === c.id) setOuverte(lue);
        // La signature d'un avenant reprend la version relue : sans cela, chaque nouvel
        // essai repartirait avec la version périmée et recevrait encore 409.
        if (geste?.id === c.id && geste.nature === 'signerAvenant') {
          const frais = lue?.avenants.find((a) => a.id === geste.avenant.id);
          setGeste(frais && frais.statut === 'instruit' ? { ...geste, avenant: frais } : null);
        }
      }
      // Introuvable : un avenant retiré ailleurs se dit dans la carte de sa convention,
      // qui reste ; une convention retirée ailleurs, dont la carte disparaît à la
      // relecture, se dit en tête de l'écran — sinon le geste échouerait en silence.
      if (err instanceof ErreurApi && err.statut === 404 && surAvenant) {
        setRefusCarte({ id: c.id, texte: t('communal.conventions.avenantIntrouvable') });
      } else if (err instanceof ErreurApi && err.statut === 404) {
        setErreur(t('communal.conventions.introuvable', { etablissement: c.etablissement }));
      } else {
        setRefusCarte({ id: c.id, texte });
      }
    } finally {
      setEnvoi(false);
    }
  };

  /** Le renouvellement : un brouillon de l'année suivante ; un flux non repris se nomme. */
  const renouveler = async (c: ConventionResume) => {
    let nonReprises: string[] = [];
    await agir(
      c,
      async () => {
        const r = await api.renouvelerConvention(c.id, c.version);
        nonReprises = r.non_reprises.map((x) => {
          const flux = (arabe ? x.flux_ar : x.flux_fr) ?? x.flux_code;
          return x.motif === 'conteneur' ? t('communal.conventions.sansConteneur', { flux }) : flux;
        });
      },
      'communal.conventions.messages.renouvelee'
    );
    if (nonReprises.length > 0) {
      setMessage(
        `${t('communal.conventions.messages.renouvelee', { etablissement: c.etablissement })} ${t('communal.conventions.nonReprises', { flux: nonReprises.join(', ') })}`
      );
    }
  };

  /** Ouvre le formulaire d'un avenant : la convention se relit d'abord, avec ses derniers termes signés. */
  const ouvrirRedaction = async (c: ConventionResume, avenant?: AvenantConvention) => {
    setRefusCarte(null);
    try {
      const lue = await api.convention(c.id);
      setOuverte(lue);
      // L'avenant se reprend tel que la convention relue le donne : sa version, ses
      // lignes, son statut d'aujourd'hui, jamais ceux de l'ancien détail.
      const frais = avenant ? lue.avenants.find((a) => a.id === avenant.id) : undefined;
      if (avenant && (!frais || frais.statut !== 'brouillon')) {
        setRefusCarte({ id: c.id, texte: t('communal.conventions.avenantPlusBrouillon') });
        return;
      }
      setRedaction({ conventionId: c.id, convention: lue, avenant: frais });
    } catch (err) {
      setRefusCarte({ id: c.id, texte: err instanceof ErreurApi ? err.message : t('commun.erreur') });
    }
  };

  const imprimer = async (c: ConventionResume, documentId: string | null) => {
    if (!documentId) return;
    setRefusCarte(null);
    try {
      await imprimerDocument(documentId);
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
  const ligneLue = (l: LigneAffichee, cle: string) => (
    <li key={cle}>
      {(arabe ? l.flux_ar : l.flux_fr) ?? l.flux_code} — {t('communal.conventions.frequence', { n: l.levees_par_semaine })}
      {l.volume_litres != null && `, ${t('communal.conventions.volume', { v: formaterNombre(l.volume_litres, 1) })}`}
      {l.conteneur && `, ${t('communal.conventions.conteneur', { code: l.conteneur })}`}
    </li>
  );
  const listeLignes = (ls: LigneAffichee[], prefixe: string) =>
    ls.length === 0 ? (
      <p className="text-ardoise-600">{t('communal.conventions.aucuneLigne')}</p>
    ) : (
      <ul className="list-disc space-y-0.5 ps-5 text-ardoise-700">{ls.map((l, i) => ligneLue(l, `${prefixe}-${i}`))}</ul>
    );

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
                  onFait={async (r) => {
                    setModifiee(null);
                    setMessage(t('communal.conventions.messages.modifiee', { etablissement: c.etablissement }));
                    // Le détail ouvert montre la convention telle qu'elle vient d'être enregistrée.
                    if (ouverte?.id === c.id) setOuverte(r ?? null);
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
                        {/* Sur sa ligne : collé à la date, le numéro se mêlerait à ses chiffres en arabe (bidi). */}
                        {c.numero_document && <bdi className="block font-mono text-xs" dir="ltr">{c.numero_document}</bdi>}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {c.a_renouveler && <Pastille ton="action">{t('communal.conventions.aRenouveler')}</Pastille>}
                      <Pastille ton={TON_ETAT[c.etat]}>{t(`communal.conventions.etats.${c.etat}`)}</Pastille>
                    </div>
                  </div>
                  {tarif(c) && <p className="text-sm text-ardoise-700">{tarif(c)} — {c.grille}</p>}
                  {c.precedente_resiliee && <p className="text-xs text-amber-800">{t('communal.conventions.precedenteResiliee')}</p>}
                  {c.numero_precedente && (
                    <p className="text-xs text-ardoise-600">
                      {t('communal.conventions.renouvellementDe')} <span className="font-mono" dir="ltr">{c.numero_precedente}</span>
                    </p>
                  )}
                  {c.renouvellement_id && c.statut_renouvellement && (
                    <p className="text-xs text-ardoise-600">
                      {t('communal.conventions.renouveleePar', { statut: t(`communal.conventions.statutsRenouvellement.${c.statut_renouvellement}`) })}
                    </p>
                  )}
                  {c.avenants_signes > 0 && (
                    <p className="text-xs text-ardoise-600">{t('communal.conventions.avenantsSignes', { count: c.avenants_signes })}</p>
                  )}
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
                      <button type="button" className={boutonDiscret} onClick={() => void imprimer(c, c.document_id)}>
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
                      <>
                        <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => void ouvrirRedaction(c)}>
                          {t('communal.conventions.avenant')}
                        </button>
                        {!c.renouvellement_id && (
                          <button type="button" className={c.a_renouveler ? bouton : boutonDiscret} disabled={envoi} onClick={() => void renouveler(c)}>
                            {t('communal.conventions.renouveler')}
                          </button>
                        )}
                        <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => setGeste({ id: c.id, nature: 'resilier', date: aujourdhui(), motif: '', reference: '' })}>
                          {t('communal.conventions.resilier')}
                        </button>
                      </>
                    )}
                  </div>

                  {geste?.id === c.id && (
                    <div className="grid gap-3 rounded-lg bg-ardoise-50 p-3 sm:grid-cols-3">
                      <p className="text-sm text-ardoise-700 sm:col-span-3">
                        {geste.nature === 'signerAvenant'
                          ? t('communal.conventions.aideSignatureAvenant', { date: f.date(geste.avenant.date_effet) })
                          : t(geste.nature === 'signer' ? 'communal.conventions.aideSignature' : 'communal.conventions.aideResiliation')}
                      </p>
                      <label className="text-sm">
                        {t(geste.nature === 'resilier' ? 'communal.conventions.dateResiliation' : 'communal.conventions.dateSignature')}
                        <input
                          type="date"
                          value={geste.date}
                          max={geste.nature === 'resilier' ? (c.date_fin ?? undefined) : aujourdhui()}
                          onChange={(e) => setGeste({ ...geste, date: e.target.value })}
                          className={champ}
                        />
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
                                  : geste.nature === 'signerAvenant'
                                    ? api.signerAvenant(geste.avenant.id, {
                                        version: geste.avenant.version,
                                        dateSignature: geste.date,
                                        referenceSignature: geste.reference.trim(),
                                      })
                                    : api.resilierConvention(c.id, {
                                        version: c.version,
                                        dateResiliation: geste.date,
                                        motif: geste.motif.trim(),
                                        reference: geste.reference.trim(),
                                      }),
                              geste.nature === 'signer'
                                ? 'communal.conventions.messages.signee'
                                : geste.nature === 'signerAvenant'
                                  ? 'communal.conventions.messages.avenantSigne'
                                  : 'communal.conventions.messages.resiliee',
                              geste.nature === 'signerAvenant'
                            )
                          }
                        >
                          {t(geste.nature === 'resilier' ? 'communal.conventions.confirmerResiliation' : 'communal.conventions.confirmerSignature')}
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

                  {redaction?.conventionId === c.id && (
                    <FormulaireAvenant
                      communeId={communeId}
                      convention={redaction.convention}
                      avenant={redaction.avenant}
                      onAnnuler={() => setRedaction(null)}
                      onFait={async () => {
                        setRedaction(null);
                        setMessage(t(redaction.avenant ? 'communal.conventions.messages.avenantModifie' : 'communal.conventions.messages.avenantRedige', { etablissement: c.etablissement }));
                        await charger();
                        setOuverte(await api.convention(c.id).catch(() => null));
                      }}
                    />
                  )}

                  {ouverte?.id === c.id && (
                    <div className="space-y-3 rounded-lg border border-ardoise-100 p-3 text-sm">
                      {ouverte.avenants.some((a) => a.statut === 'signe') && (
                        <div className="space-y-1">
                          <p className="font-medium text-ardoise-800">{t('communal.conventions.termesEnVigueur')}</p>
                          {listeLignes(ouverte.termes_en_vigueur, 'termes')}
                        </div>
                      )}
                      <div className="space-y-1">
                        <p className="font-medium text-ardoise-800">
                          {ouverte.avenants.some((a) => a.statut === 'signe') ? t('communal.conventions.termesOrigine') : t('communal.conventions.lignes')}
                        </p>
                        {listeLignes(ouverte.lignes, 'origine')}
                      </div>
                      {ouverte.observation && <p className="text-ardoise-600">{ouverte.observation}</p>}

                      {ouverte.avenants.length > 0 && (
                        <div className="space-y-2">
                          <p className="font-medium text-ardoise-800">{t('communal.conventions.avenants')}</p>
                          <ul className="space-y-2">
                            {ouverte.avenants.map((a) => (
                              <li key={a.id} className="space-y-1 rounded-lg bg-ardoise-50 p-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-ardoise-800">
                                    {a.numero ? t('communal.conventions.avenantNumero', { n: a.numero }) : t('communal.conventions.avenantSansNumero')}
                                    {' — '}
                                    {t('communal.conventions.avenantEffet', { date: f.date(a.date_effet) })}
                                    {/* Sur sa ligne : collé à la date, le numéro se mêlerait à elle en arabe (bidi). */}
                                    {a.numero_document && <bdi className="block font-mono text-xs" dir="ltr">{a.numero_document}</bdi>}
                                  </p>
                                  <Pastille ton={TON_AVENANT[a.statut]}>{t(`communal.conventions.statutsAvenant.${a.statut}`)}</Pastille>
                                </div>
                                {listeLignes(a.lignes, `avenant-${a.id}`)}
                                {a.observation && <p className="text-ardoise-600">{a.observation}</p>}
                                <div className="flex flex-wrap gap-2">
                                  {a.document_id && (
                                    <button type="button" className={boutonDiscret} onClick={() => void imprimer(c, a.document_id)}>
                                      {t('communal.conventions.imprimer')}
                                    </button>
                                  )}
                                  {peutEcrire && a.statut === 'brouillon' && (
                                    <>
                                      <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => void ouvrirRedaction(c, a)}>
                                        {t('communal.conventions.modifier')}
                                      </button>
                                      <button type="button" className={bouton} disabled={envoi} onClick={() => void agir(c, () => api.instruireAvenant(a.id, a.version), 'communal.conventions.messages.avenantInstruit', true)}>
                                        {t('communal.conventions.instruire')}
                                      </button>
                                      <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => void agir(c, () => api.retirerAvenant(a.id, a.version), 'communal.conventions.messages.avenantRetire', true)}>
                                        {t('communal.conventions.retirer')}
                                      </button>
                                    </>
                                  )}
                                  {peutEcrire && a.statut === 'instruit' && (
                                    <>
                                      <button
                                        type="button"
                                        className={bouton}
                                        disabled={envoi}
                                        onClick={() => setGeste({ id: c.id, nature: 'signerAvenant', avenant: a, date: aujourdhui(), reference: '' })}
                                      >
                                        {t('communal.conventions.signer')}
                                      </button>
                                      <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => void agir(c, () => api.reprendreAvenant(a.id, a.version), 'communal.conventions.messages.avenantRepris', true)}>
                                        {t('communal.conventions.reprendre')}
                                      </button>
                                    </>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
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
