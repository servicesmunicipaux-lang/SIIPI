// Le dossier de déclassement (lot 16.4) — référentiel du dépôt municipal,
// diapos 83 à 85.
//
// L'ÉCRAN S'OUVRE SUR LE CONSTAT DU PARC, pas sur les dossiers : c'est là que
// se voit l'engin qui coûte plus qu'il ne vaut. Le seuil de 80 % s'affiche
// « atteint / non atteint » — il ne propose rien, il ne déclasse rien. Une
// case dont le registre n'est pas tenu dit « non renseigné », jamais 0 (règle
// d'or 1.1) : c'est sur l'écran même l'argument pour tenir le carnet
// d'entretien et le carnet de bord.
//
// LE DOSSIER EST UNE PROCÉDURE : ses chiffres sont figés au jour de la
// proposition (ce qu'on a présenté ne bouge plus), ses pièces se joignent, son
// circuit s'inscrit étape par étape dans l'ordre que la base impose. L'écran
// ne propose que les étapes que la base accepterait ; s'il se trompait, c'est
// la base qui refuserait.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  lireFichierLocal,
  lireOctetsFichier,
  type ConstatDeclassement,
  type ConstatEngin,
  type DossierDeclassement,
  type Immobilisation,
  type LigneDossierDeclassement,
  type Vehicule,
} from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';

type Vue = 'constat' | 'dossiers' | 'immobilisations';
const VUES: Vue[] = ['constat', 'dossiers', 'immobilisations'];
const MOTIFS = ['depenses_80', 'pannes_repetees', 'reparation_excessive', 'service_degrade', 'mauvais_usage'] as const;
const NATURES = [
  'facture_acquisition', 'devis_reparation', 'inventaire_depenses', 'rapport_rendement',
  'decision_commune', 'avis_domaines', 'avis_controle_technique', 'publicite', 'pv_adjudication', 'autre',
] as const;
type Etape = DossierDeclassement['etapes_possibles'][number];

// Le jour à Tunis (UTC+1, sans heure d'été).
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const anneeCourante = () => Number(aujourdhui().slice(0, 4));

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const bouton = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
const boutonDiscret = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';

const message = (e: unknown, defaut: string) => (e instanceof ErreurApi || e instanceof Error ? e.message : defaut);

export function Declassement({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const { utilisateur } = useAuth();
  // Proposer, inscrire une étape, joindre une pièce : des actes de la commune,
  // donc de son admin. La FNCT lit ; elle peut tenir le registre des
  // immobilisations, comme les autres registres du parc.
  const peutInstruire = utilisateur?.role === 'admin_commune';
  const peutSaisir = peutInstruire || utilisateur?.role === 'super_admin_fnct';
  const [vue, setVue] = useState<Vue>('constat');
  const [annee, setAnnee] = useState(anneeCourante());
  const [engins, setEngins] = useState<Vehicule[]>([]);
  const [dossierOuvert, setDossierOuvert] = useState<string | null>(null);
  const [aProposer, setAProposer] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    void api.engins(communeId).then(setEngins).catch(() => setEngins([]));
  }, [communeId]);

  const signaler = useCallback((e: unknown) => {
    setInfo(null);
    setErreur(message(e, t('commun.erreur')));
  }, [t]);
  const annoncer = useCallback((m: string) => {
    setErreur(null);
    setInfo(m);
  }, []);

  const ouvrir = (id: string) => {
    setErreur(null);
    setInfo(null);
    setAProposer(null);
    setDossierOuvert(id);
    setVue('dossiers');
  };

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ardoise-900">{t('communal.declassement.titre')}</h2>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-600">{t('communal.declassement.intro')}</p>
        </div>
        {vue === 'constat' && (
          <label className="text-sm">
            <span className="font-medium text-ardoise-700">{t('communal.declassement.anneeRendement')}</span>
            <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))} className={champ}>
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={anneeCourante() - n}>{anneeCourante() - n}</option>
              ))}
            </select>
          </label>
        )}
      </header>

      <nav className="flex flex-wrap gap-2" aria-label={t('communal.declassement.titre')}>
        {VUES.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              setVue(v);
              setDossierOuvert(null);
              setAProposer(null);
            }}
            aria-pressed={vue === v}
            className={`min-h-11 rounded-full px-4 text-sm font-medium ${
              vue === v ? 'bg-siipi-700 text-white' : 'border border-ardoise-300 bg-white text-ardoise-700'
            }`}
          >
            {t(`communal.declassement.vues.${v}`)}
          </button>
        ))}
      </nav>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>
      )}
      {info && (
        <p role="status" className="rounded-lg border border-siipi-300 bg-siipi-50 p-3 text-sm text-siipi-900">{info}</p>
      )}

      {vue === 'constat' && (
        <VueConstat
          communeId={communeId}
          annee={annee}
          peutInstruire={peutInstruire}
          onProposer={(id) => {
            setAProposer(id);
            setDossierOuvert(null);
            setVue('dossiers');
          }}
        />
      )}
      {vue === 'dossiers' && aProposer !== null && (
        <Proposition
          communeId={communeId}
          engins={engins}
          vehiculeId={aProposer}
          onAnnuler={() => setAProposer(null)}
          onOuvert={(id) => {
            annoncer(t('communal.declassement.dossierOuvert'));
            ouvrir(id);
          }}
          onErreur={signaler}
        />
      )}
      {vue === 'dossiers' && aProposer === null && dossierOuvert === null && (
        <VueDossiers communeId={communeId} peutInstruire={peutInstruire} onOuvrir={ouvrir} onProposer={() => setAProposer('')} />
      )}
      {vue === 'dossiers' && aProposer === null && dossierOuvert !== null && (
        <FicheDossier
          communeId={communeId}
          id={dossierOuvert}
          peutInstruire={peutInstruire}
          onRetour={() => setDossierOuvert(null)}
          onErreur={signaler}
          onMessage={annoncer}
        />
      )}
      {vue === 'immobilisations' && (
        <VueImmobilisations communeId={communeId} engins={engins} peutSaisir={peutSaisir} onErreur={signaler} onMessage={annoncer} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Petites pièces d'affichage
// ---------------------------------------------------------------------------

function NonRenseigne() {
  const { t } = useTranslation();
  return <span className="text-ardoise-400">{t('communal.declassement.nonRenseigne')}</span>;
}

function nombre(v: number | null | undefined, decimales = 0) {
  return v === null || v === undefined ? <NonRenseigne /> : formaterNombre(v, decimales);
}

function Seuil({ c }: { c: Pick<ConstatEngin, 'seuil_80' | 'interventions_sans_cout'> }) {
  const { t } = useTranslation();
  const teinte = {
    atteint: 'bg-amber-100 text-amber-900 border-amber-300',
    indetermine: 'bg-amber-50 text-amber-800 border-amber-200',
    non_atteint: 'bg-ardoise-50 text-ardoise-700 border-ardoise-200',
    non_calculable: 'bg-white text-ardoise-500 border-ardoise-200',
  }[c.seuil_80];
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${teinte}`}>
      {t(`communal.declassement.seuil.${c.seuil_80}`)}
      {c.seuil_80 === 'indetermine' && c.interventions_sans_cout
        ? ` · ${t('communal.declassement.sansCout', { count: c.interventions_sans_cout })}`
        : ''}
    </span>
  );
}

function Rendement({ c }: { c: Pick<ConstatEngin, 'jours_immobilisation' | 'jours_travailles' | 'rapport_rendement' | 'debut_immobilisation_inconnu'> }) {
  const { t } = useTranslation();
  return (
    <span className="tabular-nums">
      {c.debut_immobilisation_inconnu ? (
        <span className="text-amber-800">{t('communal.declassement.debutInconnu')}</span>
      ) : (
        nombre(c.jours_immobilisation)
      )}
      {' / '}
      {nombre(c.jours_travailles)}
      {c.rapport_rendement !== null && <span className="ms-2 font-semibold">({formaterNombre(c.rapport_rendement, 2)})</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Le constat du parc
// ---------------------------------------------------------------------------

function VueConstat(props: { communeId: string; annee: number; peutInstruire: boolean; onProposer: (id: string) => void }) {
  const { communeId, annee, peutInstruire, onProposer } = props;
  const { t } = useTranslation();
  const [donnees, setDonnees] = useState<ConstatDeclassement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    setErreur(null);
    setDonnees(null);
    api.constatDeclassement(communeId, annee).then(setDonnees).catch((e) => setErreur(message(e, t('commun.erreur'))));
  }, [communeId, annee, t]);
  useEffect(() => charger(), [charger]);

  if (erreur) return <Erreur message={erreur} onReessayer={charger} />;
  if (!donnees) return <Chargement />;
  if (donnees.engins.length === 0) {
    return <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-600">{t('communal.declassement.aucunEngin')}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-ardoise-50 text-xs text-ardoise-600">
          <tr>
            <th className="px-3 py-2 text-start">{t('communal.declassement.engin')}</th>
            <th className="px-3 py-2 text-end">{t('communal.declassement.age')}</th>
            <th className="px-3 py-2 text-end">{t('communal.declassement.valeurAchat')}</th>
            <th className="px-3 py-2 text-end">{t('communal.declassement.depenses')}</th>
            <th className="bg-siipi-50 px-3 py-2 text-end font-bold text-siipi-900">{t('communal.declassement.part')}</th>
            <th className="px-3 py-2 text-start">{t('communal.declassement.seuil80')}</th>
            <th className="px-3 py-2 text-end">{t('communal.declassement.pannes12')}</th>
            <th className="px-3 py-2 text-end">{t('communal.declassement.rendement', { annee })}</th>
            {peutInstruire && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {donnees.engins.map((c) => (
            <tr key={c.vehicule_id} className="border-t border-ardoise-100">
              <td className="px-3 py-2">
                <span className="font-medium text-ardoise-900">{c.registration}</span>
                <span className="block text-xs text-ardoise-500">
                  {[t(`communal.parc.types.${c.type_engin}`, { defaultValue: c.type_engin }), c.marque].filter(Boolean).join(' · ')}
                  {c.etat !== 'en_service' && ` · ${t(`communal.parc.etats.${c.etat}`)}`}
                </span>
              </td>
              <td className="px-3 py-2 text-end tabular-nums">{nombre(c.age_annees, 1)}</td>
              <td className="px-3 py-2 text-end tabular-nums">{nombre(c.valeur_achat_tnd, 0)}</td>
              <td className="px-3 py-2 text-end tabular-nums">{nombre(c.cumul_depenses_tnd, 0)}</td>
              <td className="whitespace-nowrap bg-siipi-50 px-3 py-2 text-end text-base font-bold tabular-nums text-siipi-900">
                {c.part_depenses_pct === null ? <NonRenseigne /> : `${formaterNombre(c.part_depenses_pct, 1)} %`}
              </td>
              <td className="px-3 py-2"><Seuil c={c} /></td>
              <td className="px-3 py-2 text-end tabular-nums">{nombre(c.pannes_12_mois)}</td>
              <td className="px-3 py-2 text-end"><Rendement c={c} /></td>
              {peutInstruire && (
                <td className="px-3 py-2 text-end">
                  <button type="button" onClick={() => onProposer(c.vehicule_id)} className={boutonDiscret}>
                    {t('communal.declassement.proposer')}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-ardoise-100 p-3 text-xs text-ardoise-600">{t('communal.declassement.noteConstat')}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La liste de proposition (diapo 85)
// ---------------------------------------------------------------------------

function VueDossiers(props: { communeId: string; peutInstruire: boolean; onOuvrir: (id: string) => void; onProposer: () => void }) {
  const { communeId, peutInstruire, onOuvrir, onProposer } = props;
  const { t } = useTranslation();
  const f = useFormats();
  const [dossiers, setDossiers] = useState<LigneDossierDeclassement[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    setErreur(null);
    api.dossiersDeclassement(communeId).then(setDossiers).catch((e) => setErreur(message(e, t('commun.erreur'))));
  }, [communeId, t]);
  useEffect(() => charger(), [charger]);

  if (erreur) return <Erreur message={erreur} onReessayer={charger} />;
  if (!dossiers) return <Chargement />;

  return (
    <div className="space-y-3">
      {peutInstruire && (
        <button type="button" onClick={onProposer} className={bouton}>{t('communal.declassement.nouveauDossier')}</button>
      )}
      {dossiers.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-600">{t('communal.declassement.aucunDossier')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ardoise-50 text-xs text-ardoise-600">
              <tr>
                <th className="px-3 py-2 text-start">{t('communal.declassement.engin')}</th>
                <th className="px-3 py-2 text-end">{t('communal.declassement.ageProposition')}</th>
                <th className="px-3 py-2 text-start">{t('communal.declassement.dateProposition')}</th>
                <th className="px-3 py-2 text-start">{t('communal.declassement.motifs')}</th>
                <th className="px-3 py-2 text-start">{t('communal.declassement.statut')}</th>
                <th className="px-3 py-2 text-start">{t('communal.declassement.derniereEtape')}</th>
              </tr>
            </thead>
            <tbody>
              {dossiers.map((d) => (
                <tr key={d.id} className="border-t border-ardoise-100">
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => onOuvrir(d.id)} className="min-h-11 text-start font-medium text-siipi-700 underline">
                      {d.registration}
                    </button>
                    <span className="block text-xs text-ardoise-500">{[t(`communal.parc.types.${d.type_engin}`, { defaultValue: d.type_engin }), d.marque].filter(Boolean).join(' · ')}</span>
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums">{nombre(d.age_annees, 1)}</td>
                  <td className="px-3 py-2">{f.date(d.date_proposition)}</td>
                  <td className="px-3 py-2 text-xs">{d.motifs.map((m) => t(`communal.declassement.motifs_.${m}`)).join(' ; ')}</td>
                  <td className="px-3 py-2">{t(`communal.declassement.statuts.${d.statut}`)}</td>
                  <td className="px-3 py-2 text-xs">
                    {d.derniere_etape ? `${t(`communal.declassement.etapes.${d.derniere_etape}`)} · ${f.date(d.date_derniere_etape ?? '')}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proposer un engin
// ---------------------------------------------------------------------------

function Proposition(props: {
  communeId: string;
  engins: Vehicule[];
  vehiculeId: string;
  onAnnuler: () => void;
  onOuvert: (id: string) => void;
  onErreur: (e: unknown) => void;
}) {
  const { communeId, engins, onAnnuler, onOuvert, onErreur } = props;
  const { t } = useTranslation();
  const [vehiculeId, setVehiculeId] = useState(props.vehiculeId);
  const [motifs, setMotifs] = useState<string[]>([]);
  const [expose, setExpose] = useState('');
  const [cout, setCout] = useState('');
  const [annee, setAnnee] = useState(anneeCourante());
  const [envoi, setEnvoi] = useState(false);

  async function proposer() {
    setEnvoi(true);
    try {
      const d = await api.proposerDeclassement(communeId, {
        vehiculeId,
        motifs: motifs as (typeof MOTIFS)[number][],
        expose,
        coutReparationEstimeTnd: cout === '' ? null : Number(cout),
        anneeRendement: annee,
      });
      onOuvert(d.id);
    } catch (e) {
      onErreur(e);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-siipi-200 bg-siipi-50/40 p-4">
      <h3 className="font-semibold text-ardoise-900">{t('communal.declassement.nouveauDossier')}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="font-medium">{t('communal.declassement.engin')}</span>
          <select value={vehiculeId} onChange={(e) => setVehiculeId(e.target.value)} className={champ}>
            <option value="">—</option>
            {engins.filter((e) => e.etat !== 'reforme').map((e) => (
              <option key={e.id} value={e.id}>{e.registration}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium">{t('communal.declassement.coutEstime')}</span>
          <input type="number" inputMode="decimal" min={0} value={cout} onChange={(e) => setCout(e.target.value)} className={champ} />
        </label>
        <label className="text-sm">
          <span className="font-medium">{t('communal.declassement.anneeRendement')}</span>
          <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))} className={champ}>
            {[0, 1, 2].map((n) => (
              <option key={n} value={anneeCourante() - n}>{anneeCourante() - n}</option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">{t('communal.declassement.motifs')}</legend>
        <p className="text-xs text-ardoise-600">{t('communal.declassement.aideMotifs')}</p>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {MOTIFS.map((m) => (
            <label key={m} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={motifs.includes(m)}
                onChange={(e) => setMotifs(e.target.checked ? [...motifs, m] : motifs.filter((x) => x !== m))}
                className="h-5 w-5"
              />
              {t(`communal.declassement.motifs_.${m}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm">
        <span className="font-medium">{t('communal.declassement.expose')}</span>
        <textarea value={expose} onChange={(e) => setExpose(e.target.value)} rows={4} className={`${champ} py-2`} />
        <span className="text-xs text-ardoise-600">{t('communal.declassement.aideExpose')}</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void proposer()}
          disabled={envoi || !vehiculeId || motifs.length === 0 || expose.trim().length < 20}
          className={bouton}
        >
          {t('communal.declassement.proposer')}
        </button>
        <button type="button" onClick={onAnnuler} className={boutonDiscret}>{t('commun.annuler')}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La fiche d'un dossier
// ---------------------------------------------------------------------------

function FicheDossier(props: {
  communeId: string;
  id: string;
  peutInstruire: boolean;
  onRetour: () => void;
  onErreur: (e: unknown) => void;
  onMessage: (m: string) => void;
}) {
  const { communeId, id, peutInstruire, onRetour, onErreur, onMessage } = props;
  const { t } = useTranslation();
  const f = useFormats();
  const [d, setD] = useState<DossierDeclassement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    setErreur(null);
    api.dossierDeclassement(id).then(setD).catch((e) => setErreur(message(e, t('commun.erreur'))));
  }, [id, t]);
  useEffect(() => charger(), [charger]);

  if (erreur) return <Erreur message={erreur} onReessayer={charger} />;
  if (!d) return <Chargement />;

  const enCours = d.statut === 'en_cours';
  const agir = async (action: () => Promise<DossierDeclassement>, reussite: string) => {
    try {
      setD(await action());
      onMessage(reussite);
    } catch (e) {
      onErreur(e);
    }
  };

  const ouvrirPiece = async (url: string) => {
    try {
      const objet = await lireOctetsFichier(url);
      window.open(objet, '_blank', 'noopener');
      window.setTimeout(() => URL.revokeObjectURL(objet), 60_000);
    } catch (e) {
      onErreur(e);
    }
  };

  const figures: [string, (c: ConstatEngin) => ReactNode][] = [
    ['age', (c) => nombre(c.age_annees, 1)],
    ['valeurAchat', (c) => nombre(c.valeur_achat_tnd, 0)],
    ['depenses', (c) => nombre(c.cumul_depenses_tnd, 0)],
    ['part', (c) => (c.part_depenses_pct === null ? <NonRenseigne /> : `${formaterNombre(c.part_depenses_pct, 1)} %`)],
    ['seuil80', (c) => <Seuil c={c} />],
    ['rendement', (c) => <Rendement c={c} />],
  ];

  return (
    <div className="space-y-4">
      <button type="button" onClick={onRetour} className={boutonDiscret}>{t('communal.declassement.retourListe')}</button>

      <div className="rounded-xl border border-ardoise-200 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold text-ardoise-900">
            {d.registration} <span className="text-sm font-normal text-ardoise-500">{[t(`communal.parc.types.${d.type_engin}`, { defaultValue: d.type_engin }), d.marque].filter(Boolean).join(' · ')}</span>
          </h3>
          <span className="rounded-full bg-ardoise-100 px-3 py-1 text-sm">{t(`communal.declassement.statuts.${d.statut}`)}</span>
        </div>
        <p className="mt-1 text-sm text-ardoise-600">
          {t('communal.declassement.proposeLe', { date: f.date(d.date_proposition) })}
          {' · '}
          {d.motifs.map((m) => t(`communal.declassement.motifs_.${m}`)).join(' ; ')}
        </p>
        <p className="mt-3 whitespace-pre-line text-sm text-ardoise-800">{d.expose}</p>
        <p className="mt-2 text-sm">
          <span className="font-medium">{t('communal.declassement.coutEstime')} : </span>
          {d.cout_reparation_estime_tnd === null ? <NonRenseigne /> : `${formaterNombre(d.cout_reparation_estime_tnd, 3)} ${t('communal.declassement.tnd')}`}
        </p>
        {d.statut === 'adjuge' && d.etat_engin !== 'reforme' && (
          <p role="note" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {t('communal.declassement.adjugeEncoreAuParc')}
          </p>
        )}
      </div>

      {/* Les chiffres présentés, et ceux du jour : un écart dit qu'une dépense
          est arrivée depuis — pas que le dossier serait faux. */}
      <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ardoise-50 text-xs text-ardoise-600">
            <tr>
              <th className="px-3 py-2 text-start" />
              <th className="px-3 py-2 text-end">{t('communal.declassement.constatFige', { date: f.date(d.date_proposition) })}</th>
              <th className="px-3 py-2 text-end">{t('communal.declassement.constatDuJour')}</th>
            </tr>
          </thead>
          <tbody>
            {figures.map(([cle, rendu]) => (
              <tr key={cle} className="border-t border-ardoise-100">
                <th scope="row" className="px-3 py-2 text-start font-medium text-ardoise-700">
                  {t(`communal.declassement.${cle}`, { annee: d.annee_rendement })}
                </th>
                <td className="px-3 py-2 text-end tabular-nums">{rendu(d.constat)}</td>
                <td className="px-3 py-2 text-end tabular-nums">{d.constat_du_jour ? rendu(d.constat_du_jour) : <NonRenseigne />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Pieces
          communeId={communeId}
          d={d}
          modifiable={peutInstruire && enCours}
          peutJoindre={peutInstruire}
          onAgir={agir}
          onOuvrir={(url) => void ouvrirPiece(url)}
          onErreur={onErreur}
        />
        <Circuit d={d} peutInstruire={peutInstruire} onAgir={agir} />
      </div>

      <div className="rounded-xl border border-ardoise-200 bg-white">
        <h4 className="border-b border-ardoise-100 p-3 font-semibold text-ardoise-900">{t('communal.declassement.inventaire')}</h4>
        {d.depenses.length === 0 ? (
          <p className="p-3 text-sm text-ardoise-600">{t('communal.declassement.aucuneDepense')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {d.depenses.map((x) => (
                  <tr key={x.id} className="border-t border-ardoise-100 first:border-t-0">
                    <td className="px-3 py-2">{f.date(x.date_intervention)}</td>
                    <td className="px-3 py-2">{t(`communal.entretien.types.${x.type}`, { defaultValue: x.type })} · {t(`communal.entretien.natures.${x.nature}`, { defaultValue: x.nature })}</td>
                    <td className="px-3 py-2 text-ardoise-600">{x.prestataire ?? ''}</td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {x.cout_tnd === null ? <span className="text-amber-800">{t('communal.declassement.sansCoutUne')}</span> : formaterNombre(x.cout_tnd, 3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Pieces(props: {
  communeId: string;
  d: DossierDeclassement;
  modifiable: boolean;
  peutJoindre: boolean;
  onAgir: (action: () => Promise<DossierDeclassement>, reussite: string) => Promise<void>;
  onOuvrir: (url: string) => void;
  onErreur: (e: unknown) => void;
}) {
  const { communeId, d, modifiable, peutJoindre, onAgir, onOuvrir, onErreur } = props;
  const { t } = useTranslation();
  const [nature, setNature] = useState<(typeof NATURES)[number]>('facture_acquisition');
  const [envoi, setEnvoi] = useState(false);

  async function joindre(fichier: File) {
    setEnvoi(true);
    try {
      const depose = await api.deposerFichier(communeId, { ...(await lireFichierLocal(fichier)), usage: 'declassement' });
      await onAgir(() => api.joindrePieceDeclassement(d.id, { fichierId: depose.id, nature }), t('communal.declassement.pieceJointe'));
    } catch (e) {
      onErreur(e);
    } finally {
      setEnvoi(false);
    }
  }

  const teinte = { jointe: 'text-siipi-800', calculee: 'text-siipi-800', renseignee: 'text-siipi-800', manquante: 'text-amber-800 font-semibold' };

  return (
    <div className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4">
      <h4 className="font-semibold text-ardoise-900">{t('communal.declassement.pieces')}</h4>
      <ul className="space-y-1 text-sm">
        {d.completude.map((c) => (
          <li key={c.piece} className="flex justify-between gap-2">
            <span>{t(`communal.declassement.natures.${c.piece}`)}</span>
            <span className={teinte[c.statut]}>{t(`communal.declassement.completude.${c.statut}`)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ardoise-600">{t('communal.declassement.aidePieces')}</p>
      {d.pieces.length > 0 && (
        <ul className="divide-y divide-ardoise-100 rounded-lg border border-ardoise-200 text-sm">
          {d.pieces.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
              <button type="button" onClick={() => onOuvrir(p.url)} className="min-h-11 text-start text-siipi-700 underline">
                {t(`communal.declassement.natures.${p.nature}`)} — {p.nom_original}
              </button>
              {modifiable && (
                <button
                  type="button"
                  onClick={() => void onAgir(() => api.retirerPieceDeclassement(d.id, p.id), t('communal.declassement.pieceRetiree'))}
                  className={boutonDiscret}
                >
                  {t('communal.declassement.retirer')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {peutJoindre && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="font-medium">{t('communal.declassement.naturePiece')}</span>
            <select value={nature} onChange={(e) => setNature(e.target.value as (typeof NATURES)[number])} className={champ}>
              {NATURES.map((n) => (
                <option key={n} value={n}>{t(`communal.declassement.natures.${n}`)}</option>
              ))}
            </select>
          </label>
          <label className={`${bouton} inline-flex cursor-pointer items-center ${envoi ? 'opacity-40' : ''}`}>
            {t('communal.declassement.joindre')}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={envoi}
              onChange={(e) => {
                const fichier = e.target.files?.[0];
                // Remis à zéro : rechoisir le même fichier après un échec
                // ne déclencherait sinon aucun événement.
                e.target.value = '';
                if (fichier) void joindre(fichier);
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function Circuit(props: {
  d: DossierDeclassement;
  peutInstruire: boolean;
  onAgir: (action: () => Promise<DossierDeclassement>, reussite: string) => Promise<void>;
}) {
  const { d, peutInstruire, onAgir } = props;
  const { t } = useTranslation();
  const f = useFormats();
  const vide = { etape: '' as Etape | '', dateEtape: aujourdhui(), sens: 'favorable', reference: '', observation: '', mode: 'pli_ferme', montant: '' };
  const [s, setS] = useState(vide);
  const avecSens = s.etape === 'accord_commune' || s.etape === 'avis_domaines' || s.etape === 'avis_controle_technique';

  async function inscrire() {
    if (!s.etape) return;
    await onAgir(
      () =>
        api.inscrireEtapeDeclassement(d.id, {
          etape: s.etape as Etape,
          dateEtape: s.dateEtape,
          sens: avecSens ? (s.sens as 'favorable' | 'defavorable') : null,
          reference: s.reference || null,
          observation: s.observation || null,
          modeAdjudication: s.etape === 'adjudication' ? (s.mode as 'pli_ferme' | 'enchere_publique') : null,
          montantAdjugeTnd: s.etape === 'adjudication' && s.montant !== '' ? Number(s.montant) : null,
        }),
      t('communal.declassement.etapeInscrite')
    );
    setS(vide);
  }

  return (
    <div className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4">
      <h4 className="font-semibold text-ardoise-900">{t('communal.declassement.circuit')}</h4>
      {d.etapes.length === 0 ? (
        <p className="text-sm text-ardoise-600">{t('communal.declassement.aucuneEtape')}</p>
      ) : (
        <ol className="space-y-2 border-s-2 border-siipi-200 ps-4 text-sm">
          {d.etapes.map((e, i) => (
            <li key={e.id}>
              <span className="font-medium">{t(`communal.declassement.etapes.${e.etape}`)}</span>
              {' · '}
              {f.date(e.date_etape)}
              {e.sens && (
                <span className={e.sens === 'favorable' ? 'ms-2 text-siipi-800' : 'ms-2 font-semibold text-amber-800'}>
                  {t(`communal.declassement.sens.${e.sens}`)}
                </span>
              )}
              {e.mode_adjudication && ` · ${t(`communal.declassement.modes.${e.mode_adjudication}`)}`}
              {e.montant_adjuge_tnd !== null && ` · ${formaterNombre(e.montant_adjuge_tnd, 3)} ${t('communal.declassement.tnd')}`}
              {e.reference && <span className="block text-xs text-ardoise-500">{e.reference}</span>}
              {e.observation && <span className="block text-xs text-ardoise-600">{e.observation}</span>}
              {/* Seule la dernière se propose au retrait : la base refuserait
                  celle sur laquelle une autre s'appuie. */}
              {peutInstruire && d.statut === 'en_cours' && i === d.etapes.length - 1 && (
                <button
                  type="button"
                  onClick={() => void onAgir(() => api.retirerEtapeDeclassement(d.id, e.id), t('communal.declassement.etapeRetiree'))}
                  className={`${boutonDiscret} mt-1 block`}
                >
                  {t('communal.declassement.retirer')}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {peutInstruire && d.etapes_possibles.length > 0 && (
        <div className="grid gap-2 rounded-lg border border-siipi-200 bg-siipi-50/40 p-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-medium">{t('communal.declassement.etapeSuivante')}</span>
            <select value={s.etape} onChange={(e) => setS({ ...s, etape: e.target.value as Etape })} className={champ}>
              <option value="">—</option>
              {d.etapes_possibles.map((e) => (
                <option key={e} value={e}>{t(`communal.declassement.etapes.${e}`)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium">{t('communal.declassement.dateEtape')}</span>
            <input type="date" value={s.dateEtape} min={d.date_proposition} max={aujourdhui()} onChange={(e) => setS({ ...s, dateEtape: e.target.value })} className={champ} />
          </label>
          {avecSens && (
            <label className="text-sm">
              <span className="font-medium">{t('communal.declassement.sensAvis')}</span>
              <select value={s.sens} onChange={(e) => setS({ ...s, sens: e.target.value })} className={champ}>
                <option value="favorable">{t('communal.declassement.sens.favorable')}</option>
                <option value="defavorable">{t('communal.declassement.sens.defavorable')}</option>
              </select>
            </label>
          )}
          {s.etape === 'adjudication' && (
            <>
              <label className="text-sm">
                <span className="font-medium">{t('communal.declassement.modeAdjudication')}</span>
                <select value={s.mode} onChange={(e) => setS({ ...s, mode: e.target.value })} className={champ}>
                  <option value="pli_ferme">{t('communal.declassement.modes.pli_ferme')}</option>
                  <option value="enchere_publique">{t('communal.declassement.modes.enchere_publique')}</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="font-medium">{t('communal.declassement.montantAdjuge')}</span>
                <input type="number" inputMode="decimal" min={0} value={s.montant} onChange={(e) => setS({ ...s, montant: e.target.value })} className={champ} />
              </label>
            </>
          )}
          <label className="text-sm">
            <span className="font-medium">{t('communal.declassement.reference')}</span>
            <input value={s.reference} onChange={(e) => setS({ ...s, reference: e.target.value })} className={champ} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="font-medium">
              {s.etape === 'sans_suite' ? t('communal.declassement.motifSansSuite') : t('communal.declassement.observation')}
            </span>
            <input value={s.observation} onChange={(e) => setS({ ...s, observation: e.target.value })} className={champ} />
          </label>
          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={() => void inscrire()}
              disabled={!s.etape || (s.etape === 'sans_suite' && s.observation.trim().length < 5)}
              className={bouton}
            >
              {t('communal.declassement.inscrireEtape')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Les immobilisations
// ---------------------------------------------------------------------------

function VueImmobilisations(props: {
  communeId: string;
  engins: Vehicule[];
  peutSaisir: boolean;
  onErreur: (e: unknown) => void;
  onMessage: (m: string) => void;
}) {
  const { communeId, engins, peutSaisir, onErreur, onMessage } = props;
  const { t } = useTranslation();
  const f = useFormats();
  const [liste, setListe] = useState<Immobilisation[] | null>(null);
  const [saisie, setSaisie] = useState({ vehiculeId: '', debut: '', fin: '', motif: '' });
  const [fins, setFins] = useState<Record<string, string>>({});

  const charger = useCallback(() => {
    api.immobilisations(communeId).then(setListe).catch(onErreur);
  }, [communeId, onErreur]);
  useEffect(() => charger(), [charger]);

  async function executer(action: () => Promise<unknown>, reussite: string) {
    try {
      await action();
      onMessage(reussite);
      charger();
    } catch (e) {
      onErreur(e);
    }
  }

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-ardoise-600">{t('communal.declassement.introImmobilisations')}</p>
      {peutSaisir && (
        <div className="grid gap-3 rounded-xl border border-siipi-200 bg-siipi-50/40 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm">
            <span className="font-medium">{t('communal.declassement.engin')}</span>
            <select value={saisie.vehiculeId} onChange={(e) => setSaisie({ ...saisie, vehiculeId: e.target.value })} className={champ}>
              <option value="">—</option>
              {engins.map((e) => (
                <option key={e.id} value={e.id}>{e.registration}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium">{t('communal.declassement.debut')}</span>
            <input type="date" value={saisie.debut} max={aujourdhui()} onChange={(e) => setSaisie({ ...saisie, debut: e.target.value })} className={champ} />
          </label>
          <label className="text-sm">
            <span className="font-medium">{t('communal.declassement.fin')}</span>
            <input type="date" value={saisie.fin} min={saisie.debut} max={aujourdhui()} onChange={(e) => setSaisie({ ...saisie, fin: e.target.value })} className={champ} />
          </label>
          <label className="text-sm">
            <span className="font-medium">{t('communal.declassement.motifImmobilisation')}</span>
            <input value={saisie.motif} onChange={(e) => setSaisie({ ...saisie, motif: e.target.value })} className={champ} />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={!saisie.vehiculeId || !saisie.debut}
              onClick={() =>
                void executer(async () => {
                  await api.inscrireImmobilisation(communeId, {
                    vehiculeId: saisie.vehiculeId,
                    debut: saisie.debut,
                    fin: saisie.fin || null,
                    motif: saisie.motif || null,
                  });
                  setSaisie({ vehiculeId: '', debut: '', fin: '', motif: '' });
                }, t('communal.declassement.immobilisationInscrite'))
              }
              className={bouton}
            >
              {t('communal.declassement.inscrire')}
            </button>
          </div>
        </div>
      )}

      {!liste ? (
        <Chargement />
      ) : liste.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-600">{t('communal.declassement.aucuneImmobilisation')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ardoise-50 text-xs text-ardoise-600">
              <tr>
                <th className="px-3 py-2 text-start">{t('communal.declassement.engin')}</th>
                <th className="px-3 py-2 text-start">{t('communal.declassement.debut')}</th>
                <th className="px-3 py-2 text-start">{t('communal.declassement.fin')}</th>
                <th className="px-3 py-2 text-end">{t('communal.declassement.jours')}</th>
                <th className="px-3 py-2 text-start">{t('communal.declassement.motifImmobilisation')}</th>
                {peutSaisir && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {liste.map((i) => (
                <tr key={i.id} className="border-t border-ardoise-100">
                  <td className="px-3 py-2 font-medium">{i.registration}</td>
                  <td className="px-3 py-2">{f.date(i.debut)}</td>
                  <td className="px-3 py-2">
                    {i.fin ? (
                      f.date(i.fin)
                    ) : peutSaisir ? (
                      <span className="inline-flex gap-2">
                        <input
                          type="date"
                          aria-label={t('communal.declassement.fin')}
                          min={i.debut}
                          max={aujourdhui()}
                          value={fins[i.id] ?? ''}
                          onChange={(e) => setFins({ ...fins, [i.id]: e.target.value })}
                          className="min-h-11 rounded-lg border border-ardoise-300 px-2"
                        />
                        <button
                          type="button"
                          disabled={!fins[i.id]}
                          onClick={() => void executer(() => api.fermerImmobilisation(i.id, fins[i.id]), t('communal.declassement.immobilisationFermee'))}
                          className={bouton}
                        >
                          {t('communal.declassement.fermer')}
                        </button>
                      </span>
                    ) : (
                      <span className="text-amber-800">{t('communal.declassement.enCours')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums">{i.jours}</td>
                  <td className="px-3 py-2 text-xs">
                    {i.motif ?? ''}
                    {i.origine === 'etat_engin' && <span className="block text-ardoise-500">{t('communal.declassement.origineEtat')}</span>}
                  </td>
                  {peutSaisir && (
                    <td className="px-3 py-2 text-end">
                      <button
                        type="button"
                        onClick={() => void executer(() => api.retirerImmobilisation(i.id), t('communal.declassement.immobilisationRetiree'))}
                        className={boutonDiscret}
                      >
                        {t('communal.declassement.retirer')}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
