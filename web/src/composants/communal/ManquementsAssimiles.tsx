// Les manquements des établissements (jalon G, lot G7a), côté commune.
//
// UN CONSTAT DIT UN FAIT, DATÉ, SUR UN ÉTABLISSEMENT : ce qui a été vu, ses photos,
// puis ce qu'il est devenu — levé (le manquement a cessé), classé sans suite, annulé
// (saisi à tort). Rien ne s'efface : une levée erronée s'annule avec son motif, et le
// constat redevient « constaté » ; un constat annulé reste lisible, figé.
//
// UNE SANCTION NE SE RÉÉCRIT PAS. Elle s'annule avec un motif, puis une nouvelle peut
// être enregistrée : l'historique entier se lit dans l'ordre (la première, l'annulée
// avec son motif et sa date, la nouvelle). Aucun montant : la sanction cite le document
// (arrêté, procès-verbal) tel qu'il est numéroté.
//
// AUCUN AUTEUR N'EST AFFICHÉ. Qui a constaté, levé, classé ou sanctionné est au journal
// d'audit seulement (décision P3 du 23/11/2026) ; l'API ne le rend d'ailleurs jamais.
//
// LA PLATEFORME CONSTATE. Un constat qu'une fermeture inscrite après lui couvre est « à
// revoir » : l'écran le dit, avec le message de la base, et ne corrige rien.
//
// Chaque geste envoie la version lue à l'ouverture de son panneau : si le constat a
// changé depuis, il est refusé (409), le constat se relit, et le refus s'affiche dans
// sa carte. Disparu (404), il sort de la liste.
//
// La commune écrit ; la FNCT lit, sans aucun geste.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  type ConstatAssimile,
  type ConstatAssimileDetail,
  type Etablissement,
  type NatureSanction,
  type StatutConstat,
  type TypeConstat,
} from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { isolerLtr, useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { aujourdhui } from '../ajout/FormulaireEtablissement';
import { TYPES_CONSTAT } from '../ajout/FormulaireConstatAssimile';
import { useAjoutEnLigne } from '../ajout/useAjoutEnLigne';
import { DepotPhotosConstat, retirerPhotosNonJointes, type PhotoConstatDeposee } from '../constats/DepotPhotosConstat';
import { DELAI_SAISIE_INDICATIF, joursEntre, PHOTOS_MAX, porteUnIdentifiant } from '../constats/regles';
import { Chargement, Erreur, PhotoDeposee } from '../Elements';
import { Pastille, type TonPastille } from '../ui/Pastille';

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const bouton = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
const boutonDiscret = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';

const STATUTS: StatutConstat[] = ['constate', 'leve', 'classe', 'annule'];
const NATURES: NatureSanction[] = ['arrete', 'proces_verbal', 'autre'];
const TON_STATUT: Record<StatutConstat, TonPastille> = { constate: 'attention', leve: 'mesure', classe: 'neutre', annule: 'neutre' };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// La référence telle que le document la porte : la règle de l'API, dite avant son refus.
const REFERENCE = /^[\p{L}\p{N}\s°/.()_-]+$/u;

const texteErreur = (err: unknown, defaut: string) => (err instanceof ErreurApi ? err.message : defaut);
const longueur = (s: string) => [...s.trim()].length;

type Filtres = { type: TypeConstat | ''; statut: StatutConstat | ''; mois: string; commerceId: string };

export function ManquementsAssimiles({
  communeId,
  onOuvrirEtablissement,
}: {
  communeId: string;
  /** Ouvre la fiche d'un établissement, sur ses périodes de fermeture (un constat « à revoir » s'y corrige). */
  onOuvrirEtablissement?: (commerceId: string) => void;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const { utilisateur } = useAuth();
  const peutEcrire = utilisateur?.role === 'admin_commune';
  const [filtres, setFiltres] = useState<Filtres>({ type: '', statut: '', mois: '', commerceId: '' });
  const [liste, setListe] = useState<ConstatAssimile[] | null>(null);
  const [etablissements, setEtablissements] = useState<Etablissement[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ouvertId, setOuvertId] = useState<string | null>(null);

  // Seule la dernière lecture demandée s'affiche : un filtre changé pendant une lecture
  // lente ne laisse pas l'ancienne liste écraser la nouvelle.
  const derniere = useRef(0);
  const charger = useCallback(async (): Promise<ConstatAssimile[] | null> => {
    const numero = ++derniere.current;
    try {
      const lue = await api.constatsAssimiles(communeId, {
        type: filtres.type || undefined,
        statut: filtres.statut || undefined,
        commerceId: filtres.commerceId || undefined,
        mois: /^\d{4}-\d{2}$/.test(filtres.mois) ? filtres.mois : undefined,
      });
      if (numero !== derniere.current) return null;
      setListe(lue);
      setErreur(null);
      return lue;
    } catch (err) {
      if (numero !== derniere.current) return null;
      setErreur(texteErreur(err, t('commun.erreur')));
      return null;
    }
  }, [communeId, filtres, t]);
  useEffect(() => {
    void charger();
  }, [charger]);

  // Les établissements du filtre, fermés compris : un constat vise aussi un établissement fermé depuis.
  useEffect(() => {
    api
      .etablissements(communeId)
      .then((l) => setEtablissements([...l].sort((a, b) => a.nom.localeCompare(b.nom))))
      .catch(() => setEtablissements([]));
  }, [communeId]);

  const ajout = useAjoutEnLigne('constat-assimile', communeId, t('communal.manquements.nouveau'), async () => {
    setMessage(t('communal.manquements.messages.cree'));
    await charger();
  });

  if (erreur && !liste) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!liste) return <Chargement />;

  const majFiltre = (f2: Partial<Filtres>) => {
    setMessage(null);
    setOuvertId(null);
    setFiltres((x) => ({ ...x, ...f2 }));
  };
  const filtre = filtres.type || filtres.statut || filtres.mois || filtres.commerceId;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.manquements.titre')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-500">{t('communal.manquements.chapeau')}</p>
        </div>
        <div className="flex flex-wrap gap-2">{ajout.bouton}</div>
      </header>
      {!peutEcrire && <p className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">{t('communal.manquements.lectureSeule')}</p>}
      {ajout.formulaire}
      {message && <p role="status" className="rounded-lg bg-siipi-50 p-3 text-sm text-siipi-800">{message}</p>}
      {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          {t('communal.manquements.filtres.type')}
          <select value={filtres.type} onChange={(e) => majFiltre({ type: e.target.value as TypeConstat | '' })} className={champ}>
            <option value="">{t('communal.manquements.filtres.tous')}</option>
            {TYPES_CONSTAT.map((x) => (
              <option key={x} value={x}>{t(`constats.types.${x}`)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t('communal.manquements.filtres.statut')}
          <select value={filtres.statut} onChange={(e) => majFiltre({ statut: e.target.value as StatutConstat | '' })} className={champ}>
            <option value="">{t('communal.manquements.filtres.tous')}</option>
            {STATUTS.map((x) => (
              <option key={x} value={x}>{t(`constats.statuts.${x}`)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t('communal.manquements.filtres.mois')}
          <input type="month" value={filtres.mois} onChange={(e) => majFiltre({ mois: e.target.value })} className={champ} />
        </label>
        <label className="text-sm">
          {t('communal.manquements.filtres.etablissement')}
          <select value={filtres.commerceId} onChange={(e) => majFiltre({ commerceId: e.target.value })} className={champ}>
            <option value="">{t('communal.manquements.filtres.tous')}</option>
            {etablissements.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}
                {e.matricule_fiscal ? ` — ${isolerLtr(e.matricule_fiscal)}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {liste.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ardoise-300 bg-white p-4 text-sm text-ardoise-600">
          {filtre ? t('communal.manquements.aucunFiltre') : t('communal.manquements.aucun')}
        </p>
      ) : (
        <ul className="space-y-3">
          {liste.map((c) => (
            <li key={c.id} className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ardoise-900">{c.etablissement ?? '—'}</p>
                  <p className="text-sm text-ardoise-700">
                    {t(`constats.types.${c.type}`)} — {t('communal.manquements.constateLe', { date: f.date(c.date_constat) })}
                  </p>
                  {c.nb_photos > 0 && (
                    <p className="text-xs text-ardoise-600">{t('communal.manquements.nbPhotos', { count: c.nb_photos, n: formaterNombre(c.nb_photos, 0) })}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Pastille ton={TON_STATUT[c.statut]}>{t(`constats.statuts.${c.statut}`)}</Pastille>
                  {c.sanction_valide && <Pastille ton="declare">{t('communal.manquements.sanctionEnCours')}</Pastille>}
                  {c.a_revoir && <Pastille ton="attention">{t('communal.manquements.aRevoir')}</Pastille>}
                </div>
              </div>
              <button
                type="button"
                className={boutonDiscret}
                aria-expanded={ouvertId === c.id}
                onClick={() => {
                  setMessage(null);
                  setOuvertId(ouvertId === c.id ? null : c.id);
                }}
              >
                {ouvertId === c.id ? t('communal.manquements.masquer') : t('communal.manquements.detail')}
              </button>
              {ouvertId === c.id && (
                <DetailConstat
                  communeId={communeId}
                  id={c.id}
                  peutEcrire={peutEcrire}
                  positionEtablissement={positionDe(etablissements.find((e) => e.id === c.commerce_id))}
                  onOuvrirEtablissement={onOuvrirEtablissement ? () => onOuvrirEtablissement(c.commerce_id) : undefined}
                  onListeChangee={async (texteSiSortie) => {
                    // Le constat ne répond plus au filtre (levé sous « constaté », par exemple) :
                    // sa carte sort de la liste, et le message de son geste avec elle. Il se dit ici.
                    const lue = await charger();
                    if (lue && !lue.some((x) => x.id === c.id)) {
                      setOuvertId(null);
                      if (texteSiSortie) setMessage(`${texteSiSortie} ${t('communal.manquements.horsFiltre')}`);
                    }
                  }}
                  onRetire={async (texte) => {
                    setOuvertId(null);
                    setMessage(texte);
                    await charger();
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const positionDe = (e: Etablissement | undefined) => (e && e.latitude != null && e.longitude != null ? { lat: e.latitude, lng: e.longitude } : null);

// ---------------------------------------------------------------------------
// Un constat : ce qui a été vu, ce qu'il est devenu, ses sanctions, ses gestes
// ---------------------------------------------------------------------------
type Geste =
  | { nature: 'lever'; version: string; date: string; observation: string }
  | { nature: 'annulerLevee' | 'classer' | 'annuler'; version: string; motif: string }
  | { nature: 'sanction'; version: string; natureSanction: NatureSanction | ''; reference: string; date: string; observation: string }
  // La version de la SANCTION lue à l'ouverture du panneau (pas celle du constat).
  | { nature: 'annulerSanction'; sanctionId: string; version: string; motif: string }
  | { nature: 'photos'; version: string; photos: PhotoConstatDeposee[] };

function DetailConstat({
  communeId,
  id,
  peutEcrire,
  positionEtablissement,
  onOuvrirEtablissement,
  onListeChangee,
  onRetire,
}: {
  communeId: string;
  id: string;
  peutEcrire: boolean;
  positionEtablissement: { lat: number; lng: number } | null;
  onOuvrirEtablissement?: () => void;
  /** La liste se relit ; si la carte en sort, le parent affiche le texte du geste. */
  onListeChangee: (texteSiSortie?: string) => Promise<void>;
  onRetire: (message: string) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const arabe = i18n.language.startsWith('ar');
  const [detail, setDetail] = useState<ConstatAssimileDetail | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [geste, setGeste] = useState<Geste | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [depotEnCours, setDepotEnCours] = useState(false);
  // Les photos déposées pour le panneau ouvert, à jour pour le démontage : non jointes,
  // elles repartent du serveur quand le panneau ou la carte se ferme.
  const photosEnAttente = useRef<PhotoConstatDeposee[]>([]);
  photosEnAttente.current = geste?.nature === 'photos' ? geste.photos : [];
  useEffect(
    () => () => {
      void retirerPhotosNonJointes(photosEnAttente.current);
    },
    []
  );

  const derniere = useRef(0);
  const relire = useCallback(async () => {
    const numero = ++derniere.current;
    try {
      const lu = await api.constatAssimile(id);
      if (numero !== derniere.current) return null;
      setDetail(lu);
      setErreurLecture(null);
      return lu;
    } catch (err) {
      if (numero !== derniere.current) return null;
      setErreurLecture(texteErreur(err, t('commun.erreur')));
      return null;
    }
  }, [id, t]);
  useEffect(() => {
    void relire();
  }, [relire]);

  if (erreurLecture && !detail) return <Erreur message={erreurLecture} onReessayer={() => void relire()} />;
  if (!detail) return <Chargement />;
  const c = detail;
  const jour = aujourdhui();
  // Le délai des photos se dit avant le dépôt : le vrai est un paramètre national, la base tranche.
  const ageFaits = joursEntre(c.date_constat, jour);

  /**
   * Un geste, avec la version lue à l'ouverture de son panneau. Refusé parce que le
   * constat a changé (409), il se relit avant que le refus ne s'affiche ; le panneau se
   * ferme alors, pour se rouvrir sur la version à jour. Disparu (404), il sort de la liste.
   */
  const agir = async (action: () => Promise<ConstatAssimileDetail>, succes: string, perime?: (lu: ConstatAssimileDetail) => boolean) => {
    setEnvoi(true);
    setRefus(null);
    setMessage(null);
    try {
      setDetail(await action());
      // Jointes : elles ne repartent plus.
      photosEnAttente.current = [];
      setGeste(null);
      const texte = t(succes);
      setMessage(texte);
      await onListeChangee(texte);
    } catch (err) {
      const texte = texteErreur(err, t('commun.erreur'));
      if (err instanceof ErreurApi && (err.statut === 409 || err.statut === 404)) {
        const lu = await relire();
        await onListeChangee(texte);
        if (!lu && err.statut === 404) {
          await onRetire(t('communal.manquements.introuvable'));
          return;
        }
        // Une version changée : la saisie partait d'une lecture périmée. Un refus de
        // règle (sanction valide, transition), version intacte, laisse le panneau à corriger.
        if (lu && perime?.(lu)) fermer();
      }
      setRefus(texte);
    } finally {
      setEnvoi(false);
    }
  };

  /** Ferme le panneau ; les photos qu'il avait déposées sans les joindre repartent du serveur. */
  const fermer = () => {
    if (depotEnCours) return;
    void retirerPhotosNonJointes(photosEnAttente.current);
    photosEnAttente.current = [];
    setGeste(null);
  };

  const ouvrir = (g: Geste) => {
    setRefus(null);
    setMessage(null);
    setGeste(g);
  };

  // Ce qu'il manque au panneau ouvert pour partir, dit avant le refus de la base.
  const problemes: string[] = [];
  const cle = (s: string) => `communal.manquements.problemes.${s}`;
  if (geste && 'motif' in geste) {
    if (longueur(geste.motif) < 5 || longueur(geste.motif) > 300) problemes.push(t(cle('motif')));
    if (porteUnIdentifiant(geste.motif)) problemes.push(t(cle('identifiant')));
  }
  if (geste?.nature === 'lever') {
    if (!DATE.test(geste.date) || geste.date > jour || geste.date < c.date_constat) {
      problemes.push(t(cle('dateLevee'), { debut: f.date(c.date_constat), fin: f.date(jour) }));
    }
  }
  if (geste?.nature === 'sanction') {
    if (!geste.natureSanction) problemes.push(t(cle('nature')));
    if (longueur(geste.reference) < 3 || longueur(geste.reference) > 200 || !REFERENCE.test(geste.reference.trim())) problemes.push(t(cle('reference')));
    if (!DATE.test(geste.date) || geste.date > jour || geste.date < c.date_constat) {
      problemes.push(t(cle('dateDecision'), { debut: f.date(c.date_constat), fin: f.date(jour) }));
    }
  }
  if (geste && 'observation' in geste) {
    if (longueur(geste.observation) > 300) problemes.push(t(cle('observation')));
    if (porteUnIdentifiant(geste.observation)) problemes.push(t(cle('identifiant')));
  }
  if (geste?.nature === 'photos' && geste.photos.length === 0) problemes.push(t(cle('photos')));

  const lancer = () => {
    if (!geste || problemes.length > 0) return;
    switch (geste.nature) {
      case 'lever':
        return void agir(
          () => api.leverConstat(c.id, { version: geste.version, date: geste.date, observation: geste.observation.trim() || null }),
          'communal.manquements.messages.leve',
          (lu) => lu.version !== geste.version
        );
      case 'annulerLevee':
        return void agir(() => api.annulerLeveeConstat(c.id, { version: geste.version, motif: geste.motif.trim() }), 'communal.manquements.messages.leveeAnnulee', (lu) => lu.version !== geste.version);
      case 'classer':
        return void agir(() => api.classerConstat(c.id, { version: geste.version, motif: geste.motif.trim() }), 'communal.manquements.messages.classe', (lu) => lu.version !== geste.version);
      case 'annuler':
        return void agir(() => api.annulerConstat(c.id, { version: geste.version, motif: geste.motif.trim() }), 'communal.manquements.messages.annule', (lu) => lu.version !== geste.version);
      case 'sanction':
        return void agir(
          () =>
            api.enregistrerSanction(c.id, {
              version: geste.version,
              nature: geste.natureSanction as NatureSanction,
              reference: geste.reference.trim(),
              dateDecision: geste.date,
              observation: geste.observation.trim() || null,
            }),
          'communal.manquements.messages.sanction',
          (lu) => lu.version !== geste.version
        );
      case 'annulerSanction':
        return void agir(
          () => api.annulerSanction(geste.sanctionId, { version: geste.version, motif: geste.motif.trim() }),
          'communal.manquements.messages.sanctionAnnulee',
          // Périmée si la sanction a changé, ou n'est plus valide.
          (lu) => lu.sanctions.find((x) => x.id === geste.sanctionId)?.version !== geste.version
        );
      case 'photos':
        return void agir(
          () => api.joindrePhotosConstat(c.id, { version: geste.version, photos: geste.photos.map((p) => p.id) }),
          'communal.manquements.messages.photos',
          // Le panneau se ferme sur un constat changé ; ses photos non jointes repartent alors du serveur.
          (lu) => lu.version !== geste.version
        );
    }
  };

  const ouvert = c.statut === 'constate' || c.statut === 'leve';

  return (
    <div className="space-y-4 rounded-lg border border-ardoise-100 p-3 text-sm">
      {c.a_revoir && (
        <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-amber-900">
          <p>{arabe ? c.a_revoir.message_ar : c.a_revoir.message}</p>
          {/* La période en cause se corrige ou se retire sur la fiche de l'établissement : l'écran y mène. */}
          {onOuvrirEtablissement && (
            <button type="button" className={boutonDiscret} onClick={onOuvrirEtablissement}>
              {t('communal.manquements.ouvrirEtablissement')}
            </button>
          )}
        </div>
      )}
      {c.description && <p className="whitespace-pre-line text-ardoise-800">{c.description}</p>}

      {/* Ce que le constat est devenu, geste après geste, tel que la base le tient : une
          seconde levée annulée ne recouvre plus la première. Jamais l'auteur d'un geste. */}
      <ol className="space-y-1 text-ardoise-700">
        {c.historique.map((h, i) => (
          <li key={`${h.geste}-${h.created_at}-${i}`}>
            {t(`communal.manquements.historique.${h.geste}`, { date: f.date(h.date_effet ?? h.created_at) })}
            {h.texte && ` : ${h.texte}`}
          </li>
        ))}
      </ol>

      {c.photos.length > 0 && (
        <div className="space-y-1">
          <p className="font-medium text-ardoise-800">{t('communal.manquements.photos', { count: c.photos.length, n: formaterNombre(c.photos.length, 0) })}</p>
          <ul className="flex flex-wrap gap-2">
            {c.photos.map((p) => (
              <li key={p.fichier_id}>
                <PhotoDeposee chemin={p.url} alt={t('constats.photos.alt')} className="max-h-32 w-auto rounded-lg border border-ardoise-200" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* L'historique entier des sanctions : la première, l'annulée avec son motif, la nouvelle. */}
      <div className="space-y-1">
        <p className="font-medium text-ardoise-800">{t('communal.manquements.sanctions.titre')}</p>
        {c.sanctions.length === 0 ? (
          <p className="text-ardoise-600">{t('communal.manquements.sanctions.aucune')}</p>
        ) : (
          <ol className="space-y-2">
            {c.sanctions.map((s) => (
              <li key={s.id} className={`space-y-1 rounded-lg bg-ardoise-50 p-2 ${s.statut === 'annulee' ? 'opacity-70' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-ardoise-800">
                    {t('communal.manquements.sanctions.ligne', { nature: t(`constats.natures.${s.nature}`), date: f.date(s.date_decision) })}{' '}
                    <bdi dir="ltr" className="font-mono">{s.reference}</bdi>
                  </p>
                  <Pastille ton={s.statut === 'valide' ? 'declare' : 'neutre'}>{t(`constats.statutsSanction.${s.statut}`)}</Pastille>
                </div>
                {s.observation && <p className="text-ardoise-600">{s.observation}</p>}
                {s.statut === 'annulee' && s.annulee_le && (
                  <p className="text-xs text-ardoise-600">{t('communal.manquements.sanctions.annuleeLe', { date: f.date(s.annulee_le), motif: s.motif_annulation ?? '' })}</p>
                )}
                {peutEcrire && s.statut === 'valide' && geste?.nature !== 'annulerSanction' && (
                  <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => ouvrir({ nature: 'annulerSanction', sanctionId: s.id, version: s.version, motif: '' })}>
                    {t('communal.manquements.gestes.annulerSanction')}
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {message && <p role="status" className="rounded-lg bg-siipi-50 p-3 text-siipi-800">{message}</p>}

      {/* Les gestes de l'état présent ------------------------------------------ */}
      {peutEcrire && c.statut !== 'annule' && !geste && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {c.statut === 'constate' && (
              <button type="button" className={bouton} disabled={envoi} onClick={() => ouvrir({ nature: 'lever', version: c.version, date: jour, observation: '' })}>
                {t('communal.manquements.gestes.lever')}
              </button>
            )}
            {c.statut === 'leve' && (
              <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => ouvrir({ nature: 'annulerLevee', version: c.version, motif: '' })}>
                {t('communal.manquements.gestes.annulerLevee')}
              </button>
            )}
            {ouvert && !c.sanction_valide && (
              <button
                type="button"
                className={boutonDiscret}
                disabled={envoi}
                onClick={() => ouvrir({ nature: 'sanction', version: c.version, natureSanction: '', reference: '', date: jour, observation: '' })}
              >
                {t('communal.manquements.gestes.sanction')}
              </button>
            )}
            {c.statut === 'constate' && !c.sanction_valide && (
              <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => ouvrir({ nature: 'classer', version: c.version, motif: '' })}>
                {t('communal.manquements.gestes.classer')}
              </button>
            )}
            {!c.sanction_valide && (
              <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => ouvrir({ nature: 'annuler', version: c.version, motif: '' })}>
                {t('communal.manquements.gestes.annuler')}
              </button>
            )}
            {c.statut === 'constate' && c.photos.length < PHOTOS_MAX && (
              <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => ouvrir({ nature: 'photos', version: c.version, photos: [] })}>
                {t('communal.manquements.gestes.photos')}
              </button>
            )}
          </div>
          {c.statut === 'constate' && c.photos.length < PHOTOS_MAX && ageFaits > DELAI_SAISIE_INDICATIF && (
            <p className="text-xs text-amber-900">{t('communal.manquements.delaiPhotos', { count: ageFaits, n: ageFaits, delai: DELAI_SAISIE_INDICATIF })}</p>
          )}
          {/* La règle se dit avant le refus : une sanction valide retient le constat. */}
          {c.sanction_valide && <p className="text-xs text-ardoise-600">{t('communal.manquements.sanctionRetient')}</p>}
        </div>
      )}

      {geste && (
        <div className="space-y-3 rounded-lg bg-ardoise-50 p-3">
          <p className="text-ardoise-700">{t(`communal.manquements.aides.${geste.nature}`)}</p>
          {geste.nature === 'lever' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                {t('communal.manquements.champs.dateLevee')}
                <input type="date" value={geste.date} min={c.date_constat} max={jour} onChange={(e) => setGeste({ ...geste, date: e.target.value })} className={champ} />
              </label>
              <label>
                {t('communal.manquements.champs.observation')}
                <input value={geste.observation} onChange={(e) => setGeste({ ...geste, observation: e.target.value })} maxLength={300} className={champ} />
              </label>
            </div>
          )}
          {(geste.nature === 'annulerLevee' || geste.nature === 'classer' || geste.nature === 'annuler' || geste.nature === 'annulerSanction') && (
            <label className="block">
              {t('communal.manquements.champs.motif')}
              <input value={geste.motif} onChange={(e) => setGeste({ ...geste, motif: e.target.value })} maxLength={300} className={champ} />
            </label>
          )}
          {geste.nature === 'sanction' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                {t('communal.manquements.champs.nature')}
                <select value={geste.natureSanction} onChange={(e) => setGeste({ ...geste, natureSanction: e.target.value as NatureSanction | '' })} className={champ}>
                  <option value="">{t('ajout.etablissement.choisir')}</option>
                  {NATURES.map((n) => (
                    <option key={n} value={n}>{t(`constats.natures.${n}`)}</option>
                  ))}
                </select>
              </label>
              <label>
                {t('communal.manquements.champs.reference')}
                <input value={geste.reference} onChange={(e) => setGeste({ ...geste, reference: e.target.value })} maxLength={200} dir="ltr" className={champ} />
              </label>
              <label>
                {t('communal.manquements.champs.dateDecision')}
                <input type="date" value={geste.date} min={c.date_constat} max={jour} onChange={(e) => setGeste({ ...geste, date: e.target.value })} className={champ} />
              </label>
              <label>
                {t('communal.manquements.champs.observation')}
                <input value={geste.observation} onChange={(e) => setGeste({ ...geste, observation: e.target.value })} maxLength={300} className={champ} />
              </label>
              <p className="text-xs text-ardoise-500 sm:col-span-2">{t('communal.manquements.sansMontant')}</p>
            </div>
          )}
          {geste.nature === 'photos' && ageFaits > DELAI_SAISIE_INDICATIF && (
            <p role="status" className="text-amber-900">{t('communal.manquements.delaiPhotos', { count: ageFaits, n: ageFaits, delai: DELAI_SAISIE_INDICATIF })}</p>
          )}
          {geste.nature === 'photos' && (
            <DepotPhotosConstat
              communeId={communeId}
              photos={geste.photos}
              // Par mise à jour, jamais sur le geste capturé : un panneau fermé pendant le
              // dépôt ne se rouvre pas au retour des photos.
              onAjout={(d) => setGeste((g) => (g && g.nature === 'photos' ? { ...g, photos: [...g.photos, ...d] } : g))}
              onRetrait={(idPhoto) => setGeste((g) => (g && g.nature === 'photos' ? { ...g, photos: g.photos.filter((x) => x.id !== idPhoto) } : g))}
              onDepotChange={setDepotEnCours}
              dejaJointes={c.photos.length}
              positionEtablissement={positionEtablissement}
              desactive={envoi}
            />
          )}
          {geste.nature !== 'photos' && <p className="text-xs text-ardoise-500">{t('constats.sansPersonne')}</p>}
          {problemes.length > 0 && (
            <ul className="list-disc ps-5 text-ardoise-700">
              {problemes.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={bouton} disabled={envoi || depotEnCours || problemes.length > 0} onClick={lancer}>
              {t(`communal.manquements.confirmer.${geste.nature}`)}
            </button>
            <button type="button" className={boutonDiscret} disabled={depotEnCours} onClick={fermer}>
              {t('commun.annuler')}
            </button>
          </div>
        </div>
      )}
      {refus && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{refus}</p>}
    </div>
  );
}
