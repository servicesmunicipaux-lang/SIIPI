// Les levées des établissements sous convention (jalon G, lot G5a), côté commune.
//
// QUATRE PARTIES, UN SEUL ÉCRAN : la feuille du jour (ce qui a été levé, coché par
// circuit, jour et voyage), ce qui attend la validation (les propositions du
// prestataire et de l'import Kobo), le registre, et les dessertes qui disent quel
// établissement est servi par quel arrêt.
//
// LA PLATEFORME CONSTATE. Une levée que des changements ultérieurs mettent hors de
// ses règles (établissement fermé, desserte écourtée, avenant, résiliation) est
// « à revoir », avec ce qu'elle a perdu : l'écran le montre, il n'offre aucune
// correction automatique. Une desserte arrêtée par le retrait de son point ou de
// son circuit est « à clôturer » : la commune la clôt, en un geste, à la date que
// la base a calculée — rien ne le fait à sa place.
//
// Chaque geste sur une desserte envoie la version lue : si elle a changé depuis, il
// est refusé, et la liste se relit avant que le refus ne s'affiche.
//
// La commune écrit ; la FNCT lit, sans aucun geste.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  type Circuit,
  type Desserte,
  type EtatDesserte,
  type ImportLeveesJournal,
  type Levee,
  type StatutLevee,
} from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';
import { aujourdhui } from '../ajout/FormulaireEtablissement';
import { useAjoutEnLigne } from '../ajout/useAjoutEnLigne';
import { FeuilleDuJour } from '../levees/FeuilleDuJour';
import { ChiffreCle } from '../ui/ChiffreCle';
import { Pastille, type TonPastille } from '../ui/Pastille';

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const bouton = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
const boutonDiscret = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';

type Partie = 'feuille' | 'aValider' | 'registre' | 'dessertes';
const PARTIES: Partie[] = ['feuille', 'aValider', 'registre', 'dessertes'];

const TON_STATUT_LEVEE: Record<StatutLevee, TonPastille> = { proposee: 'declare', validee: 'mesure', ecartee: 'neutre', annulee: 'neutre' };
const TON_DESSERTE: Record<EtatDesserte, TonPastille> = { en_cours: 'mesure', a_venir: 'declare', a_cloturer: 'attention', terminee: 'neutre' };
const STATUTS: Array<'' | StatutLevee> = ['', 'proposee', 'validee', 'ecartee', 'annulee'];
const MOTIF_MIN = 5;

/** Un jour de Tunis décalé de `n` jours, sans passer par l'heure du poste. */
function decaler(jour: string, n: number): string {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}
const motifValable = (m: string) => [...m.trim()].length >= MOTIF_MIN;
const texteErreur = (err: unknown, defaut: string) => (err instanceof ErreurApi ? err.message : defaut);

export function Levees({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const { utilisateur } = useAuth();
  const peutEcrire = utilisateur?.role === 'admin_commune';
  const [partie, setPartie] = useState<Partie>('feuille');
  const [message, setMessage] = useState<string | null>(null);
  // Une relecture des propositions et du registre après un import ou un geste.
  const [version, setVersion] = useState(0);

  const importer = useAjoutEnLigne('import-levees', communeId, t('communal.levees.importer'), async () => {
    setMessage(t('communal.levees.messages.importe'));
    setVersion((v) => v + 1);
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.levees.titre')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-500">{t('communal.levees.chapeau')}</p>
        </div>
        <div className="flex flex-wrap gap-2">{importer.bouton}</div>
      </header>
      {!peutEcrire && <p className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">{t('communal.levees.lectureSeule')}</p>}
      {importer.formulaire}
      {message && (
        <p role="status" className="rounded-lg bg-siipi-50 p-3 text-sm text-siipi-800">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('communal.levees.parties.libelle')}>
        {PARTIES.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={partie === p}
            onClick={() => {
              setMessage(null);
              setPartie(p);
            }}
            className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${
              partie === p ? 'border-siipi-600 bg-siipi-600 text-white' : 'border-ardoise-300 bg-white text-ardoise-700'
            }`}
          >
            {t(`communal.levees.parties.${p}`)}
          </button>
        ))}
      </div>

      {partie === 'feuille' && <PartieFeuille communeId={communeId} peutEcrire={peutEcrire} />}
      {partie === 'aValider' && <PartieAValider key={version} communeId={communeId} peutEcrire={peutEcrire} />}
      {partie === 'registre' && <PartieRegistre key={version} communeId={communeId} peutEcrire={peutEcrire} />}
      {partie === 'dessertes' && <PartieDessertes communeId={communeId} peutEcrire={peutEcrire} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La feuille du jour
// ---------------------------------------------------------------------------
function PartieFeuille({ communeId, peutEcrire }: { communeId: string; peutEcrire: boolean }) {
  const { t } = useTranslation();
  const [circuits, setCircuits] = useState<Circuit[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [circuitId, setCircuitId] = useState('');
  const [date, setDate] = useState(aujourdhui());

  const charger = useCallback(() => {
    setErreur(null);
    api
      .circuits(communeId)
      .then((c) => {
        const actifs = c.filter((x) => x.actif);
        setCircuits(actifs);
        if (actifs.length === 1) setCircuitId(actifs[0].id);
      })
      .catch((err) => setErreur(texteErreur(err, t('commun.erreur'))));
  }, [communeId, t]);
  useEffect(() => charger(), [charger]);

  if (erreur) return <Erreur message={erreur} onReessayer={charger} />;
  if (!circuits) return <Chargement />;

  const jourValable = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= aujourdhui();
  return (
    <section className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4" aria-labelledby="feuille-titre">
      <h2 id="feuille-titre" className="text-base font-semibold text-ardoise-900">{t('communal.levees.parties.feuille')}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {t('communal.levees.circuit')}
          <select value={circuitId} onChange={(e) => setCircuitId(e.target.value)} className={champ}>
            <option value="">{t('ajout.etablissement.choisir')}</option>
            {circuits.map((c) => (
              <option key={c.id} value={c.id}>{c.code ? `${c.code} — ${c.nom}` : c.nom}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t('communal.levees.date')}
          <input type="date" value={date} max={aujourdhui()} onChange={(e) => setDate(e.target.value)} className={champ} />
        </label>
      </div>
      {circuits.length === 0 && <p className="text-sm text-ardoise-600">{t('communal.levees.aucunCircuit')}</p>}
      {!jourValable && <p className="text-sm text-amber-900">{t('communal.levees.jourFutur')}</p>}
      {circuitId && jourValable && <FeuilleDuJour circuitId={circuitId} date={date} mode={peutEcrire ? 'commune' : 'lecture'} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Une levée lue : ce qui la situe, son statut, ce qu'elle a perdu depuis
// ---------------------------------------------------------------------------
function DescriptionLevee({ l }: { l: Levee }) {
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const flux = (i18n.language.startsWith('ar') ? l.flux_ar : l.flux_fr) ?? l.flux_code;
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ardoise-900">{l.etablissement}</span>
        <Pastille ton={TON_STATUT_LEVEE[l.statut]}>{t(`levees.statuts.${l.statut}`)}</Pastille>
        <Pastille ton="neutre">{t(`levees.sources.${l.source}`)}</Pastille>
        {l.a_revoir && (
          <Pastille ton="attention" titre={l.a_revoir_message ?? undefined}>
            {t('communal.levees.aRevoir')}
          </Pastille>
        )}
      </div>
      <p className="text-sm text-ardoise-700">
        {flux} — {f.date(l.date_levee)}
        {l.heure_levee && <bdi dir="ltr"> {l.heure_levee}</bdi>}
        {' · '}
        {t('levees.feuille.voyageN', { n: l.voyage })}
      </p>
      <p className="text-xs text-ardoise-600">
        {[l.circuit, l.point].filter(Boolean).join(' — ')}
        {l.numero_convention && (
          <>
            {' · '}
            <bdi dir="ltr" className="font-mono">{l.numero_convention}</bdi>
          </>
        )}
      </p>
      {l.a_revoir && l.a_revoir_message && <p className="text-xs text-amber-900">{l.a_revoir_message}</p>}
      {l.statut === 'ecartee' && l.motif_ecart && <p className="text-xs text-ardoise-600">{t('communal.levees.motifEcart', { motif: l.motif_ecart })}</p>}
      {l.statut === 'annulee' && l.motif_annulation && (
        <p className="text-xs text-ardoise-600">{t('communal.levees.motifAnnulation', { motif: l.motif_annulation })}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// À valider : les propositions du prestataire et de l'import
// ---------------------------------------------------------------------------
function PartieAValider({ communeId, peutEcrire }: { communeId: string; peutEcrire: boolean }) {
  const { t } = useTranslation();
  const [liste, setListe] = useState<Levee[] | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [choisies, setChoisies] = useState<Set<string>>(new Set());
  const [motif, setMotif] = useState('');
  const [ecart, setEcart] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const derniere = useRef(0);
  const charger = useCallback(async () => {
    const numero = ++derniere.current;
    try {
      // Depuis toujours : une proposition de plus de trente jours attend encore sa
      // décision, et la borne par défaut du registre la cacherait.
      const lue = await api.leveesCommune(communeId, { statut: 'proposee', depuis: '2000-01-01' });
      if (numero !== derniere.current) return;
      setListe(lue);
      // Une proposition décidée ailleurs sort de la sélection.
      setChoisies((s) => new Set([...s].filter((id) => lue.some((l) => l.id === id))));
      setErreurLecture(null);
    } catch (err) {
      if (numero !== derniere.current) return;
      setErreurLecture(texteErreur(err, t('commun.erreur')));
    }
  }, [communeId, t]);
  useEffect(() => {
    void charger();
  }, [charger]);

  const agir = async (action: () => Promise<unknown>, succes: (n: number) => string) => {
    setEnvoi(true);
    setErreur(null);
    setMessage(null);
    const n = choisies.size;
    try {
      await action();
      setMessage(succes(n));
      setChoisies(new Set());
      setMotif('');
      setEcart(false);
      await charger();
    } catch (err) {
      // Une seule proposition qui ne tient plus et rien n'est décidé : la liste se
      // relit, puis le refus s'affiche, qui nomme la proposition en cause.
      if (err instanceof ErreurApi && (err.statut === 409 || err.statut === 404)) await charger();
      setErreur(texteErreur(err, t('commun.erreur')));
    } finally {
      setEnvoi(false);
    }
  };

  if (erreurLecture && !liste) return <Erreur message={erreurLecture} onReessayer={() => void charger()} />;
  if (!liste) return <Chargement />;

  const tout = liste.length > 0 && liste.every((l) => choisies.has(l.id));
  const basculer = (id: string) =>
    setChoisies((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <section className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4" aria-labelledby="a-valider-titre">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="a-valider-titre" className="text-base font-semibold text-ardoise-900">{t('communal.levees.parties.aValider')}</h2>
          <p className="mt-1 text-sm text-ardoise-600">{t('communal.levees.aValiderAide')}</p>
        </div>
        <p className="flex items-baseline gap-2">
          {/* Le total de la base, pas la longueur de la liste : au-delà de 2 000, elle est tronquée. */}
          <ChiffreCle valeur={formaterNombre(liste[0]?.total ?? 0, 0)} taille="md" />
          <span className="text-sm text-ardoise-600">{t('communal.levees.propositions', { count: liste[0]?.total ?? 0 })}</span>
        </p>
      </div>
      {message && <p role="status" className="rounded-lg bg-siipi-50 p-3 text-sm text-siipi-800">{message}</p>}
      {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}

      {liste.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ardoise-300 p-4 text-sm text-ardoise-600">{t('communal.levees.aucuneProposition')}</p>
      ) : (
        <>
          {peutEcrire && (
            <label className="flex min-h-11 items-center gap-2 text-sm text-ardoise-700">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={tout}
                onChange={() => setChoisies(tout ? new Set() : new Set(liste.map((l) => l.id)))}
              />
              {t('communal.levees.toutChoisir')}
            </label>
          )}
          <ul className="divide-y divide-ardoise-100 rounded-lg border border-ardoise-200">
            {liste.map((l) => (
              <li key={l.id} className="flex items-start gap-3 p-3">
                {peutEcrire && (
                  <input
                    type="checkbox"
                    className="mt-1 h-6 w-6"
                    checked={choisies.has(l.id)}
                    onChange={() => basculer(l.id)}
                    aria-label={t('communal.levees.choisir', { etablissement: l.etablissement })}
                  />
                )}
                <DescriptionLevee l={l} />
              </li>
            ))}
          </ul>
          {peutEcrire && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={bouton}
                  disabled={envoi || choisies.size === 0}
                  onClick={() =>
                    void agir(
                      () => api.validerLevees([...choisies]),
                      (n) => t('communal.levees.messages.validees', { count: n, n: formaterNombre(n, 0) })
                    )
                  }
                >
                  {t('communal.levees.valider', { n: formaterNombre(choisies.size, 0) })}
                </button>
                <button type="button" className={boutonDiscret} disabled={envoi || choisies.size === 0} onClick={() => setEcart((e) => !e)} aria-expanded={ecart}>
                  {t('communal.levees.ecarter', { n: formaterNombre(choisies.size, 0) })}
                </button>
              </div>
              {ecart && (
                <div className="grid gap-2 rounded-lg bg-ardoise-50 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="text-sm">
                    {t('communal.levees.motifEcartLibelle')}
                    <input value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={500} className={champ} />
                  </label>
                  <button
                    type="button"
                    className={bouton}
                    disabled={envoi || choisies.size === 0 || !motifValable(motif)}
                    onClick={() =>
                      void agir(
                        () => api.ecarterLevees([...choisies], motif.trim()),
                        (n) => t('communal.levees.messages.ecartees', { count: n, n: formaterNombre(n, 0) })
                      )
                    }
                  >
                    {t('communal.levees.confirmerEcart')}
                  </button>
                  {!motifValable(motif) && <p className="text-xs text-ardoise-600 sm:col-span-2">{t('communal.levees.motifMin', { n: MOTIF_MIN })}</p>}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Le registre, et le journal des imports Kobo
// ---------------------------------------------------------------------------
function PartieRegistre({ communeId, peutEcrire }: { communeId: string; peutEcrire: boolean }) {
  const { t } = useTranslation();
  const f = useFormats();
  const [statut, setStatut] = useState<'' | StatutLevee>('');
  // Les trente derniers jours, comme l'API par défaut : une liste sans borne grossirait sans fin.
  const [depuis, setDepuis] = useState(() => decaler(aujourdhui(), -30));
  const [jusqua, setJusqua] = useState(aujourdhui());
  const [liste, setListe] = useState<Levee[] | null>(null);
  const [imports, setImports] = useState<ImportLeveesJournal[] | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [annulation, setAnnulation] = useState<{ id: string; motif: string } | null>(null);
  const [refus, setRefus] = useState<{ id: string; texte: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const periodeValable = /^\d{4}-\d{2}-\d{2}$/.test(depuis) && /^\d{4}-\d{2}-\d{2}$/.test(jusqua) && depuis <= jusqua;
  const derniere = useRef(0);
  const charger = useCallback(async () => {
    if (!periodeValable) return;
    const numero = ++derniere.current;
    try {
      const lue = await api.leveesCommune(communeId, { statut: statut || undefined, depuis, jusqua });
      if (numero !== derniere.current) return;
      setListe(lue);
      setErreurLecture(null);
    } catch (err) {
      if (numero !== derniere.current) return;
      setErreurLecture(texteErreur(err, t('commun.erreur')));
    }
  }, [communeId, statut, depuis, jusqua, periodeValable, t]);
  useEffect(() => {
    void charger();
  }, [charger]);
  useEffect(() => {
    api
      .importsLevees(communeId)
      .then(setImports)
      .catch(() => setImports(null));
  }, [communeId]);

  const annuler = async (l: Levee, motif: string) => {
    setEnvoi(true);
    setRefus(null);
    setMessage(null);
    try {
      await api.annulerLevee(l.id, motif.trim());
      setAnnulation(null);
      setMessage(t('communal.levees.messages.annulee', { etablissement: l.etablissement }));
      await charger();
    } catch (err) {
      if (err instanceof ErreurApi && (err.statut === 409 || err.statut === 404)) await charger();
      setRefus({ id: l.id, texte: texteErreur(err, t('commun.erreur')) });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4" aria-labelledby="registre-levees-titre">
      <h2 id="registre-levees-titre" className="text-base font-semibold text-ardoise-900">{t('communal.levees.parties.registre')}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          {t('communal.levees.statut')}
          <select value={statut} onChange={(e) => setStatut(e.target.value as '' | StatutLevee)} className={champ}>
            {STATUTS.map((s) => (
              <option key={s || 'tous'} value={s}>{s ? t(`levees.statuts.${s}`) : t('communal.levees.tous')}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t('communal.levees.depuis')}
          <input type="date" value={depuis} max={jusqua || undefined} onChange={(e) => setDepuis(e.target.value)} className={champ} />
        </label>
        <label className="text-sm">
          {t('communal.levees.jusqua')}
          <input type="date" value={jusqua} min={depuis || undefined} max={aujourdhui()} onChange={(e) => setJusqua(e.target.value)} className={champ} />
        </label>
      </div>
      {!periodeValable && <p className="text-sm text-amber-900">{t('communal.levees.periodeInvalide')}</p>}
      {message && <p role="status" className="rounded-lg bg-siipi-50 p-3 text-sm text-siipi-800">{message}</p>}

      {erreurLecture && !liste ? (
        <Erreur message={erreurLecture} onReessayer={() => void charger()} />
      ) : !liste ? (
        <Chargement />
      ) : liste.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ardoise-300 p-4 text-sm text-ardoise-600">{t('communal.levees.aucuneLevee')}</p>
      ) : (
        <ul className="divide-y divide-ardoise-100 rounded-lg border border-ardoise-200">
          {liste.map((l) => (
            <li key={l.id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-start gap-3">
                <DescriptionLevee l={l} />
                {peutEcrire && l.statut === 'validee' && annulation?.id !== l.id && (
                  <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => setAnnulation({ id: l.id, motif: '' })}>
                    {t('communal.levees.annuler')}
                  </button>
                )}
              </div>
              {annulation?.id === l.id && (
                <div className="grid gap-2 rounded-lg bg-ardoise-50 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <label className="text-sm">
                    {t('communal.levees.motifAnnulationLibelle')}
                    <input value={annulation.motif} onChange={(e) => setAnnulation({ ...annulation, motif: e.target.value })} maxLength={500} className={champ} />
                  </label>
                  <button type="button" className={bouton} disabled={envoi || !motifValable(annulation.motif)} onClick={() => void annuler(l, annulation.motif)}>
                    {t('communal.levees.confirmerAnnulation')}
                  </button>
                  <button type="button" className={boutonDiscret} onClick={() => setAnnulation(null)}>
                    {t('commun.annuler')}
                  </button>
                  <p className="text-xs text-ardoise-600 sm:col-span-3">{t('communal.levees.annulationAide')}</p>
                </div>
              )}
              {refus?.id === l.id && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{refus.texte}</p>}
            </li>
          ))}
        </ul>
      )}
      {liste && liste.length > 0 && liste[0].total > liste.length && (
        <p className="text-xs text-ardoise-500">{t('communal.levees.tronque', { n: liste.length, total: liste[0].total })}</p>
      )}

      {imports && imports.length > 0 && (
        <details className="rounded-lg border border-ardoise-200 p-3">
          <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-ardoise-800">
            {t('communal.levees.journalImports', { count: imports.length })}
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-ardoise-700">
            {imports.map((i) => (
              <li key={i.id}>
                <bdi>{i.nom_fichier}</bdi> — {f.date(i.created_at, { heure: true })}
                {i.saisi_par_nom && ` — ${i.saisi_par_nom}`}
                <span className="block text-xs text-ardoise-600">
                  {t('communal.levees.bilanImport', {
                    proposees: formaterNombre(i.nb_proposees, 0),
                    dejaRecues: formaterNombre(i.nb_deja_recues, 0),
                    erreurs: formaterNombre(i.nb_erreurs, 0),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Les dessertes
// ---------------------------------------------------------------------------
function PartieDessertes({ communeId, peutEcrire }: { communeId: string; peutEcrire: boolean }) {
  const { t } = useTranslation();
  const f = useFormats();
  const [etat, setEtat] = useState<'actives' | 'toutes'>('actives');
  const [liste, setListe] = useState<Desserte[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cloture, setCloture] = useState<{ id: string; date: string; observation: string } | null>(null);
  const [refus, setRefus] = useState<{ id: string; texte: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const derniere = useRef(0);
  const charger = useCallback(async () => {
    const numero = ++derniere.current;
    try {
      const lue = await api.dessertes(communeId, { etat });
      if (numero !== derniere.current) return;
      setListe(lue);
      setErreur(null);
    } catch (err) {
      if (numero !== derniere.current) return;
      setErreur(texteErreur(err, t('commun.erreur')));
    }
  }, [communeId, etat, t]);
  useEffect(() => {
    void charger();
  }, [charger]);

  const ajout = useAjoutEnLigne('desserte', communeId, t('communal.levees.nouvelleDesserte'), async () => {
    setMessage(t('communal.levees.messages.desserteCreee'));
    await charger();
  });

  /** Un geste avec la version lue ; un refus s'affiche dans la carte, après la relecture. */
  const agir = async (d: Desserte, action: () => Promise<unknown>, succes: string) => {
    setEnvoi(true);
    setMessage(null);
    setRefus(null);
    try {
      await action();
      setCloture(null);
      setMessage(t(succes, { etablissement: d.etablissement }));
      await charger();
    } catch (err) {
      const texte = texteErreur(err, t('commun.erreur'));
      // La desserte a changé : la liste se relit d'abord, sinon le prochain essai
      // repartirait encore avec l'ancienne version.
      if (err instanceof ErreurApi && (err.statut === 409 || err.statut === 404)) await charger();
      if (err instanceof ErreurApi && err.statut === 404) setErreur(t('communal.levees.desserteIntrouvable', { etablissement: d.etablissement }));
      else setRefus({ id: d.id, texte });
    } finally {
      setEnvoi(false);
    }
  };

  if (erreur && !liste) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!liste) return <Chargement />;

  return (
    <section className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4" aria-labelledby="dessertes-titre">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="dessertes-titre" className="text-base font-semibold text-ardoise-900">{t('communal.levees.parties.dessertes')}</h2>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-600">{t('communal.levees.dessertesAide')}</p>
        </div>
        <div className="flex flex-wrap gap-2">{ajout.bouton}</div>
      </div>
      {ajout.formulaire}
      {message && <p role="status" className="rounded-lg bg-siipi-50 p-3 text-sm text-siipi-800">{message}</p>}
      {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}

      <label className="block max-w-xs text-sm">
        {t('communal.levees.filtreDessertes')}
        <select value={etat} onChange={(e) => setEtat(e.target.value as 'actives' | 'toutes')} className={champ}>
          <option value="actives">{t('communal.levees.dessertesActives')}</option>
          <option value="toutes">{t('communal.levees.dessertesToutes')}</option>
        </select>
      </label>

      {liste.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ardoise-300 p-4 text-sm text-ardoise-600">{t('communal.levees.aucuneDesserte')}</p>
      ) : (
        <ul className="space-y-2">
          {liste.map((d) => (
            <li key={d.id} className="space-y-2 rounded-xl border border-ardoise-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ardoise-900">{d.etablissement}</p>
                  <p className="text-sm text-ardoise-700">
                    {d.circuit_code ? `${d.circuit_code} — ` : ''}
                    {d.circuit ?? '—'}
                    {' · '}
                    {t('levees.feuille.point', { nom: d.point ?? '—', voyage: d.point_voyage ?? '—', ordre: d.point_ordre ?? '—' })}
                  </p>
                  <p className="text-xs text-ardoise-600">
                    {d.date_fin
                      ? t('communal.levees.periode', { debut: f.date(d.date_debut), fin: f.date(d.date_fin) })
                      : t('communal.levees.periodeSansFin', { debut: f.date(d.date_debut) })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Pastille ton={TON_DESSERTE[d.etat]}>{t(`communal.levees.etats.${d.etat}`)}</Pastille>
                  {d.statut_etablissement === 'ferme' && <Pastille ton="neutre">{t('levees.feuille.ferme')}</Pastille>}
                </div>
              </div>
              {/* La fin calculée n'est dite que lorsqu'elle diffère de celle que porte la desserte. */}
              {d.fin_effective && d.raison_fin && d.raison_fin !== 'date' && (
                <p className={`text-xs ${d.etat === 'a_cloturer' ? 'text-amber-900' : 'text-ardoise-600'}`}>
                  {t(`communal.levees.raisons.${d.raison_fin}`, { date: f.date(d.fin_effective) })}
                </p>
              )}
              {d.observation && <p className="text-xs text-ardoise-600">{d.observation}</p>}
              <p className="text-xs text-ardoise-500">{t('communal.levees.leveesRattachees', { count: d.levees, n: formaterNombre(d.levees, 0) })}</p>

              {peutEcrire && d.etat !== 'terminee' && (
                <div className="flex flex-wrap gap-2">
                  {d.etat === 'a_cloturer' && d.fin_effective && (
                    <button
                      type="button"
                      className={bouton}
                      disabled={envoi}
                      onClick={() =>
                        void agir(d, () => api.cloturerDesserte(d.id, { version: d.version, dateFin: d.fin_effective }), 'communal.levees.messages.desserteClose')
                      }
                    >
                      {t('communal.levees.cloturerAu', { date: f.date(d.fin_effective) })}
                    </button>
                  )}
                  {d.etat !== 'a_cloturer' && cloture?.id !== d.id && (
                    <button
                      type="button"
                      className={boutonDiscret}
                      disabled={envoi}
                      onClick={() => setCloture({ id: d.id, date: d.date_debut > aujourdhui() ? d.date_debut : aujourdhui(), observation: d.observation ?? '' })}
                    >
                      {t('communal.levees.cloturer')}
                    </button>
                  )}
                  {d.levees === 0 && (
                    <button
                      type="button"
                      className={boutonDiscret}
                      disabled={envoi}
                      onClick={() => void agir(d, () => api.retirerDesserte(d.id, d.version), 'communal.levees.messages.desserteRetiree')}
                    >
                      {t('communal.levees.retirer')}
                    </button>
                  )}
                </div>
              )}
              {cloture?.id === d.id && (
                <div className="grid gap-2 rounded-lg bg-ardoise-50 p-3 sm:grid-cols-2">
                  <p className="text-sm text-ardoise-700 sm:col-span-2">{t('communal.levees.clotureAide')}</p>
                  <label className="text-sm">
                    {t('communal.levees.dernierJour')}
                    <input type="date" value={cloture.date} min={d.date_debut} onChange={(e) => setCloture({ ...cloture, date: e.target.value })} className={champ} />
                  </label>
                  <label className="text-sm">
                    {t('ajout.desserte.observation')}
                    <input value={cloture.observation} onChange={(e) => setCloture({ ...cloture, observation: e.target.value })} maxLength={1000} className={champ} />
                  </label>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <button
                      type="button"
                      className={bouton}
                      disabled={envoi || !/^\d{4}-\d{2}-\d{2}$/.test(cloture.date) || cloture.date < d.date_debut}
                      onClick={() =>
                        void agir(
                          d,
                          () => api.cloturerDesserte(d.id, { version: d.version, dateFin: cloture.date, observation: cloture.observation.trim() || null }),
                          'communal.levees.messages.desserteClose'
                        )
                      }
                    >
                      {t('communal.levees.confirmerCloture')}
                    </button>
                    <button type="button" className={boutonDiscret} onClick={() => setCloture(null)}>
                      {t('commun.annuler')}
                    </button>
                  </div>
                </div>
              )}
              {refus?.id === d.id && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{refus.texte}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
