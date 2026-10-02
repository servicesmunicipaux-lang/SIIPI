// Le carnet de bord et le carburant (lot 16.3).
//
// L'ÉCRAN S'OUVRE SUR LA CONSOMMATION, et la consommation sur les LITRES AUX
// 100 KM : c'est le chiffre qu'un chef de parc compare d'un mois sur l'autre,
// d'un engin à l'autre. Il n'existe que si le carnet de bord est tenu — sans
// carnet, la case dit « non renseigné », jamais 0 (règle d'or 1.1). C'est
// l'argument, sur l'écran même, pour tenir le carnet.
//
// LA DISTANCE NE SE SAISIT PAS : on saisit les deux compteurs, la base déduit
// le reste. Un écart au quota est un constat, pas un reproche : le référentiel
// y voit d'abord une avarie possible. Aucun chiffre n'est rapporté à un
// chauffeur.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  type Agent,
  type Circuit,
  type Consommation,
  type DocumentEmis,
  type QuotaCarburant,
  type SortieCarnet,
  type Vehicule,
} from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';

type Vue = 'consommation' | 'carnet' | 'bons' | 'quotas';
const VUES: Vue[] = ['consommation', 'carnet', 'bons', 'quotas'];
const SEANCES = ['matin', 'apres_midi', 'nuit'] as const;

// Le mois et le jour à Tunis (UTC+1, sans heure d'été).
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const moisCourant = () => aujourdhui().slice(0, 7);

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const bouton = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';

export function CarnetCarburant({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const { utilisateur } = useAuth();
  // Émettre un bon est un acte de la commune (registre scellé) : son admin.
  const peutEmettre = utilisateur?.role === 'admin_commune';
  const [vue, setVue] = useState<Vue>('consommation');
  const [mois, setMois] = useState(moisCourant());
  const [engins, setEngins] = useState<Vehicule[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([api.engins(communeId), api.personnel(communeId), api.circuits(communeId)])
      .then(([e, a, c]) => {
        setEngins(e);
        setAgents(a);
        setCircuits(c);
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : t('commun.erreur')));
  }, [communeId, t]);

  const signaler = (e: unknown) => setErreur(e instanceof Error ? e.message : t('commun.erreur'));

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ardoise-900">{t('communal.carburant.titre')}</h2>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-600">{t('communal.carburant.intro')}</p>
        </div>
        <label className="text-sm">
          <span className="font-medium text-ardoise-700">{t('communal.carburant.mois')}</span>
          <input type="month" value={mois} max={moisCourant()} onChange={(e) => e.target.value && setMois(e.target.value)} className={champ} />
        </label>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label={t('communal.carburant.titre')}>
        {VUES.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVue(v)}
            aria-pressed={vue === v}
            className={`min-h-11 rounded-full px-4 text-sm font-medium ${
              vue === v ? 'bg-siipi-700 text-white' : 'border border-ardoise-300 bg-white text-ardoise-700'
            }`}
          >
            {t(`communal.carburant.vues.${v}`)}
          </button>
        ))}
      </nav>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {erreur}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-lg border border-siipi-300 bg-siipi-50 p-3 text-sm text-siipi-900">
          {message}
        </p>
      )}

      {vue === 'consommation' && <VueConsommation communeId={communeId} mois={mois} />}
      {vue === 'carnet' && (
        <VueCarnet
          communeId={communeId}
          mois={mois}
          engins={engins}
          agents={agents}
          circuits={circuits}
          onErreur={signaler}
          onMessage={(m) => {
            setErreur(null);
            setMessage(m);
          }}
        />
      )}
      {vue === 'bons' && (
        <VueBons
          communeId={communeId}
          engins={engins}
          agents={agents}
          peutEmettre={peutEmettre}
          onErreur={signaler}
          onMessage={(m) => {
            setErreur(null);
            setMessage(m);
          }}
        />
      )}
      {vue === 'quotas' && (
        <VueQuotas
          communeId={communeId}
          engins={engins}
          onEnginsChanges={() => void api.engins(communeId).then(setEngins)}
          onErreur={signaler}
          onMessage={(m) => {
            setErreur(null);
            setMessage(m);
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// La consommation du mois
// ---------------------------------------------------------------------------

function VueConsommation({ communeId, mois }: { communeId: string; mois: string }) {
  const { t } = useTranslation();
  const [donnees, setDonnees] = useState<Consommation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    setErreur(null);
    setDonnees(null);
    api
      .consommation(communeId, mois)
      .then(setDonnees)
      .catch((e) => setErreur(e instanceof Error ? e.message : t('commun.erreur')));
  }, [communeId, mois, t]);
  useEffect(() => charger(), [charger]);

  if (erreur) return <Erreur message={erreur} onReessayer={charger} />;
  if (!donnees) return <Chargement />;
  if (donnees.engins.length === 0) {
    return <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-600">{t('communal.carburant.aucuneDonnee')}</p>;
  }

  const nr = <span className="text-ardoise-400">{t('communal.carburant.nonRenseigne')}</span>;
  const nombre = (v: number | null, decimales = 0) => (v === null ? nr : formaterNombre(v, decimales));

  return (
    <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-ardoise-50 text-start text-xs text-ardoise-600">
          <tr>
            <th className="px-3 py-2 text-start">{t('communal.carburant.engin')}</th>
            <th className="px-3 py-2 text-end">{t('communal.carburant.litres')}</th>
            <th className="px-3 py-2 text-end">{t('communal.carburant.parcouru')}</th>
            <th className="bg-siipi-50 px-3 py-2 text-end font-bold text-siipi-900">{t('communal.carburant.ratio')}</th>
            <th className="px-3 py-2 text-end">{t('communal.carburant.quota')}</th>
            <th className="px-3 py-2 text-end">{t('communal.carburant.ecart')}</th>
            <th className="px-3 py-2 text-end">{t('communal.carburant.seances')}</th>
          </tr>
        </thead>
        <tbody>
          {donnees.engins.map((e) => {
            const km = e.unite_compteur === 'km';
            return (
              <tr key={e.vehicule_id} className="border-t border-ardoise-100">
                <td className="px-3 py-2 font-medium text-ardoise-900">
                  {e.registration}
                  {e.sorties_ouvertes > 0 && (
                    <span className="ms-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                      {t('communal.carburant.sortiesOuvertes', { count: e.sorties_ouvertes })}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-end tabular-nums">{nombre(e.litres, 1)}</td>
                <td className="px-3 py-2 text-end tabular-nums">
                  {e.parcouru === null ? nr : `${nombre(e.parcouru, km ? 0 : 1)} ${t(km ? 'communal.carburant.km' : 'communal.carburant.heures')}`}
                </td>
                <td className="bg-siipi-50 px-3 py-2 text-end text-base font-bold tabular-nums text-siipi-900">
                  {km
                    ? e.litres_100km === null
                      ? nr
                      : `${nombre(e.litres_100km, 1)} ${t('communal.carburant.l100km')}`
                    : e.litres_heure === null
                      ? nr
                      : `${nombre(e.litres_heure, 2)} ${t('communal.carburant.lHeure')}`}
                </td>
                <td className="px-3 py-2 text-end tabular-nums">{nombre(e.quota_litres, 0)}</td>
                <td
                  className={`px-3 py-2 text-end tabular-nums ${
                    e.ecart_quota_litres !== null && e.ecart_quota_litres > 0 ? 'font-semibold text-amber-800' : ''
                  }`}
                >
                  {e.ecart_quota_litres === null
                    ? nr
                    : `${e.ecart_quota_litres > 0 ? '+' : ''}${nombre(e.ecart_quota_litres, 1)} ${t('communal.carburant.unitL')} (${(e.ecart_quota_pct ?? 0) > 0 ? '+' : ''}${nombre(e.ecart_quota_pct, 1)} %)`}
                </td>
                <td className="px-3 py-2 text-end tabular-nums">{e.seances}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-ardoise-100 p-3 text-xs text-ardoise-600">{t('communal.carburant.noteRatio')}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Le carnet de bord
// ---------------------------------------------------------------------------

function VueCarnet(props: {
  communeId: string;
  mois: string;
  engins: Vehicule[];
  agents: Agent[];
  circuits: Circuit[];
  onErreur: (e: unknown) => void;
  onMessage: (m: string) => void;
}) {
  const { communeId, mois, engins, agents, circuits, onErreur, onMessage } = props;
  const { t } = useTranslation();
  const f = useFormats();
  const [sorties, setSorties] = useState<SortieCarnet[] | null>(null);
  const [saisie, setSaisie] = useState({ vehiculeId: '', jour: aujourdhui(), seance: 'matin' as (typeof SEANCES)[number], chauffeurId: '', circuitId: '', compteurSortie: '', compteurRetour: '' });
  const [retours, setRetours] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(() => {
    api.carnets(communeId, mois).then(setSorties).catch(onErreur);
  }, [communeId, mois, onErreur]);
  useEffect(() => charger(), [charger]);

  const chauffeurs = useMemo(
    () => agents.filter((a) => ['chauffeur', 'tractoriste'].includes(String((a as { fonction?: string }).fonction))),
    [agents]
  );

  async function enregistrer() {
    setEnvoi(true);
    try {
      await api.enregistrerSortie(communeId, {
        vehiculeId: saisie.vehiculeId,
        jour: saisie.jour,
        seance: saisie.seance,
        chauffeurId: saisie.chauffeurId || null,
        circuitId: saisie.circuitId || null,
        compteurSortie: Number(saisie.compteurSortie),
        compteurRetour: saisie.compteurRetour === '' ? null : Number(saisie.compteurRetour),
      });
      onMessage(t('communal.carburant.sortieEnregistree'));
      setSaisie((s) => ({ ...s, compteurSortie: '', compteurRetour: '' }));
      charger();
    } catch (e) {
      onErreur(e);
    } finally {
      setEnvoi(false);
    }
  }

  async function rentrer(id: string) {
    try {
      await api.saisirRetour(id, { compteurRetour: Number(retours[id]) });
      onMessage(t('communal.carburant.retourEnregistre'));
      charger();
    } catch (e) {
      onErreur(e);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-siipi-200 bg-siipi-50/40 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="font-medium">{t('communal.carburant.engin')}</span>
          <select value={saisie.vehiculeId} onChange={(e) => setSaisie({ ...saisie, vehiculeId: e.target.value })} className={champ}>
            <option value="">—</option>
            {engins.map((e) => (
              <option key={e.id} value={e.id}>{e.registration}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium">{t('communal.carburant.jour')}</span>
          <input type="date" value={saisie.jour} max={aujourdhui()} onChange={(e) => setSaisie({ ...saisie, jour: e.target.value })} className={champ} />
        </label>
        <label className="text-sm">
          <span className="font-medium">{t('communal.carburant.seance')}</span>
          <select value={saisie.seance} onChange={(e) => setSaisie({ ...saisie, seance: e.target.value as (typeof SEANCES)[number] })} className={champ}>
            {SEANCES.map((s) => (
              <option key={s} value={s}>{t(`communal.carburant.seances_.${s}`)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium">{t('communal.carburant.chauffeur')}</span>
          <select value={saisie.chauffeurId} onChange={(e) => setSaisie({ ...saisie, chauffeurId: e.target.value })} className={champ}>
            <option value="">—</option>
            {chauffeurs.map((a) => (
              <option key={a.id} value={a.id}>{(a as { nom_complet?: string }).nom_complet}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium">{t('communal.carburant.circuit')}</span>
          <select value={saisie.circuitId} onChange={(e) => setSaisie({ ...saisie, circuitId: e.target.value })} className={champ}>
            <option value="">—</option>
            {circuits.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium">{t('communal.carburant.compteurSortie')}</span>
          <input type="number" inputMode="decimal" min={0} value={saisie.compteurSortie} onChange={(e) => setSaisie({ ...saisie, compteurSortie: e.target.value })} className={champ} />
        </label>
        <label className="text-sm">
          <span className="font-medium">{t('communal.carburant.compteurRetour')}</span>
          <input type="number" inputMode="decimal" min={0} value={saisie.compteurRetour} onChange={(e) => setSaisie({ ...saisie, compteurRetour: e.target.value })} className={champ} />
        </label>
        <div className="flex items-end">
          <button type="button" onClick={() => void enregistrer()} disabled={envoi || !saisie.vehiculeId || saisie.compteurSortie === ''} className={bouton}>
            {t('communal.carburant.enregistrerSortie')}
          </button>
        </div>
        <p className="text-xs text-ardoise-600 sm:col-span-2 lg:col-span-4">{t('communal.carburant.aideCompteurs')}</p>
      </div>

      {!sorties ? (
        <Chargement />
      ) : sorties.length === 0 ? (
        <p className="text-sm text-ardoise-600">{t('communal.carburant.aucuneSortie')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ardoise-50 text-xs text-ardoise-600">
              <tr>
                <th className="px-3 py-2 text-start">{t('communal.carburant.jour')}</th>
                <th className="px-3 py-2 text-start">{t('communal.carburant.engin')}</th>
                <th className="px-3 py-2 text-start">{t('communal.carburant.circuit')}</th>
                <th className="px-3 py-2 text-end">{t('communal.carburant.compteurSortie')}</th>
                <th className="px-3 py-2 text-end">{t('communal.carburant.compteurRetour')}</th>
                <th className="px-3 py-2 text-end">{t('communal.carburant.parcouru')}</th>
              </tr>
            </thead>
            <tbody>
              {sorties.map((s) => (
                <tr key={s.id} className="border-t border-ardoise-100">
                  <td className="px-3 py-2">{f.date(s.jour)} · {t(`communal.carburant.seances_.${s.seance}`)}</td>
                  <td className="px-3 py-2 font-medium">{s.registration}</td>
                  <td className="px-3 py-2">{s.circuit_nom ?? '—'}</td>
                  <td className="px-3 py-2 text-end tabular-nums">{formaterNombre(s.compteur_sortie)}</td>
                  <td className="px-3 py-2 text-end">
                    {s.compteur_retour !== null ? (
                      <span className="tabular-nums">{formaterNombre(s.compteur_retour)}</span>
                    ) : (
                      <span className="inline-flex gap-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={s.compteur_sortie}
                          aria-label={t('communal.carburant.compteurRetour')}
                          value={retours[s.id] ?? ''}
                          onChange={(e) => setRetours({ ...retours, [s.id]: e.target.value })}
                          className="min-h-11 w-28 rounded-lg border border-ardoise-300 px-2"
                        />
                        <button type="button" onClick={() => void rentrer(s.id)} disabled={!retours[s.id]} className={bouton}>
                          {t('communal.carburant.rentrer')}
                        </button>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums">
                    {s.parcouru === null ? '—' : `${formaterNombre(s.parcouru)} ${t(s.unite_compteur === 'km' ? 'communal.carburant.km' : 'communal.carburant.heures')}`}
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
// Les bons de carburant
// ---------------------------------------------------------------------------

function VueBons(props: {
  communeId: string;
  engins: Vehicule[];
  agents: Agent[];
  peutEmettre: boolean;
  onErreur: (e: unknown) => void;
  onMessage: (m: string) => void;
}) {
  const { communeId, engins, agents, peutEmettre, onErreur, onMessage } = props;
  const { t } = useTranslation();
  const f = useFormats();
  const [bons, setBons] = useState<DocumentEmis[] | null>(null);
  const [saisie, setSaisie] = useState({ vehiculeId: '', date: aujourdhui(), litres: '', montantTnd: '', carburant: 'gasoil' as 'gasoil' | 'essence', compteur: '', chauffeurId: '' });
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(() => {
    api.bonsCarburant(communeId).then(setBons).catch(onErreur);
  }, [communeId, onErreur]);
  useEffect(() => charger(), [charger]);

  async function emettre() {
    setEnvoi(true);
    try {
      const bon = await api.emettreBonCarburant(communeId, {
        vehiculeId: saisie.vehiculeId,
        date: saisie.date,
        litres: Number(saisie.litres),
        montantTnd: Number(saisie.montantTnd),
        carburant: saisie.carburant,
        compteur: saisie.compteur === '' ? null : Number(saisie.compteur),
        chauffeurId: saisie.chauffeurId || null,
      });
      onMessage(t('communal.carburant.bonEmis', { numero: bon.numero_affiche }));
      setSaisie((s) => ({ ...s, litres: '', montantTnd: '', compteur: '' }));
      charger();
    } catch (e) {
      onErreur(e);
    } finally {
      setEnvoi(false);
    }
  }

  async function annuler(bon: DocumentEmis) {
    const motif = window.prompt(t('communal.carburant.motifAnnulation', { numero: bon.numero_affiche }));
    if (!motif) return;
    try {
      await api.annulerDocument(bon.id, motif);
      onMessage(t('communal.carburant.bonAnnule', { numero: bon.numero_affiche }));
      charger();
    } catch (e) {
      onErreur(e);
    }
  }

  return (
    <div className="space-y-4">
      {peutEmettre ? (
        <div className="grid gap-3 rounded-xl border border-siipi-200 bg-siipi-50/40 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className="font-medium">{t('communal.carburant.engin')}</span>
            <select value={saisie.vehiculeId} onChange={(e) => setSaisie({ ...saisie, vehiculeId: e.target.value })} className={champ}>
              <option value="">—</option>
              {engins.map((e) => (
                <option key={e.id} value={e.id}>{e.registration}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium">{t('communal.carburant.jour')}</span>
            <input type="date" value={saisie.date} max={aujourdhui()} onChange={(e) => setSaisie({ ...saisie, date: e.target.value })} className={champ} />
          </label>
          <label className="text-sm">
            <span className="font-medium">{t('communal.carburant.litres')}</span>
            <input type="number" inputMode="decimal" min={0} value={saisie.litres} onChange={(e) => setSaisie({ ...saisie, litres: e.target.value })} className={champ} />
          </label>
          <label className="text-sm">
            <span className="font-medium">{t('communal.carburant.montant')}</span>
            <input type="number" inputMode="decimal" min={0} value={saisie.montantTnd} onChange={(e) => setSaisie({ ...saisie, montantTnd: e.target.value })} className={champ} />
          </label>
          <label className="text-sm">
            <span className="font-medium">{t('communal.carburant.carburant')}</span>
            <select value={saisie.carburant} onChange={(e) => setSaisie({ ...saisie, carburant: e.target.value as 'gasoil' | 'essence' })} className={champ}>
              <option value="gasoil">{t('communal.carburant.gasoil')}</option>
              <option value="essence">{t('communal.carburant.essence')}</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium">{t('communal.carburant.compteur')}</span>
            <input type="number" inputMode="decimal" min={0} value={saisie.compteur} onChange={(e) => setSaisie({ ...saisie, compteur: e.target.value })} className={champ} />
          </label>
          <label className="text-sm">
            <span className="font-medium">{t('communal.carburant.chauffeur')}</span>
            <select value={saisie.chauffeurId} onChange={(e) => setSaisie({ ...saisie, chauffeurId: e.target.value })} className={champ}>
              <option value="">—</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{(a as { nom_complet?: string }).nom_complet}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="button" onClick={() => void emettre()} disabled={envoi || !saisie.vehiculeId || !saisie.litres || saisie.montantTnd === ''} className={bouton}>
              {t('communal.carburant.emettreBon')}
            </button>
          </div>
          <p className="text-xs text-ardoise-600 sm:col-span-2 lg:col-span-4">{t('communal.carburant.aideBon')}</p>
        </div>
      ) : (
        <p className="rounded-lg border border-ardoise-200 bg-ardoise-50 p-3 text-sm text-ardoise-700">{t('communal.carburant.lectureSeule')}</p>
      )}

      {!bons ? (
        <Chargement />
      ) : bons.length === 0 ? (
        <p className="text-sm text-ardoise-600">{t('communal.carburant.aucunBon')}</p>
      ) : (
        <ul className="divide-y divide-ardoise-100 rounded-xl border border-ardoise-200 bg-white">
          {bons.map((b) => {
            const c = b.contenu as { engin?: string; date?: string; litres?: number; carburant?: string };
            return (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span>
                  <span className="font-mono font-semibold">{b.numero_affiche}</span>
                  <span className="ms-3">{c.engin} · {c.date ? f.date(c.date) : ''} · {c.litres} L {c.carburant ?? ''}</span>
                </span>
                {b.statut === 'annule' ? (
                  <span className="rounded bg-ardoise-100 px-2 py-0.5 text-xs text-ardoise-700">
                    {t('communal.carburant.annule')} — {b.motif_annulation}
                  </span>
                ) : (
                  peutEmettre && (
                    <button type="button" onClick={() => void annuler(b)} className="min-h-11 rounded-lg border border-red-300 px-3 text-sm text-red-800">
                      {t('communal.carburant.annuler')}
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Les quotas et l'unité des compteurs
// ---------------------------------------------------------------------------

function VueQuotas(props: {
  communeId: string;
  engins: Vehicule[];
  onEnginsChanges: () => void;
  onErreur: (e: unknown) => void;
  onMessage: (m: string) => void;
}) {
  const { communeId, engins, onEnginsChanges, onErreur, onMessage } = props;
  const { t } = useTranslation();
  const f = useFormats();
  const [quotas, setQuotas] = useState<QuotaCarburant[] | null>(null);
  const [saisie, setSaisie] = useState({ vehiculeId: '', litresMois: '', depuis: `${moisCourant()}-01` });

  const charger = useCallback(() => {
    api.quotasCarburant(communeId).then(setQuotas).catch(onErreur);
  }, [communeId, onErreur]);
  useEffect(() => charger(), [charger]);

  async function fixer() {
    try {
      await api.fixerQuota(communeId, { vehiculeId: saisie.vehiculeId, litresMois: Number(saisie.litresMois), depuis: saisie.depuis });
      onMessage(t('communal.carburant.quotaFixe'));
      setSaisie((s) => ({ ...s, litresMois: '' }));
      charger();
    } catch (e) {
      onErreur(e);
    }
  }

  async function unite(vehiculeId: string, u: 'km' | 'heures') {
    try {
      await api.changerUniteCompteur(vehiculeId, u);
      onEnginsChanges();
    } catch (e) {
      onErreur(e);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-siipi-200 bg-siipi-50/40 p-4 sm:grid-cols-4">
        <label className="text-sm">
          <span className="font-medium">{t('communal.carburant.engin')}</span>
          <select value={saisie.vehiculeId} onChange={(e) => setSaisie({ ...saisie, vehiculeId: e.target.value })} className={champ}>
            <option value="">—</option>
            {engins.map((e) => (
              <option key={e.id} value={e.id}>{e.registration}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium">{t('communal.carburant.litresMois')}</span>
          <input type="number" inputMode="decimal" min={1} value={saisie.litresMois} onChange={(e) => setSaisie({ ...saisie, litresMois: e.target.value })} className={champ} />
        </label>
        <label className="text-sm">
          <span className="font-medium">{t('communal.carburant.depuis')}</span>
          <input type="date" value={saisie.depuis} onChange={(e) => setSaisie({ ...saisie, depuis: e.target.value })} className={champ} />
        </label>
        <div className="flex items-end">
          <button type="button" onClick={() => void fixer()} disabled={!saisie.vehiculeId || !saisie.litresMois} className={bouton}>
            {t('communal.carburant.fixerQuota')}
          </button>
        </div>
      </div>

      {!quotas ? (
        <Chargement />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ardoise-50 text-xs text-ardoise-600">
              <tr>
                <th className="px-3 py-2 text-start">{t('communal.carburant.engin')}</th>
                <th className="px-3 py-2 text-start">{t('communal.carburant.uniteCompteur')}</th>
                <th className="px-3 py-2 text-end">{t('communal.carburant.quotaEnVigueur')}</th>
              </tr>
            </thead>
            <tbody>
              {engins
                .filter((e) => (e as { categorie?: string }).categorie !== 'remorque')
                .map((e) => {
                  const q = quotas.find((x) => x.vehicule_id === e.id);
                  const u = (e as { unite_compteur?: string }).unite_compteur === 'heures' ? 'heures' : 'km';
                  return (
                    <tr key={e.id} className="border-t border-ardoise-100">
                      <td className="px-3 py-2 font-medium">{e.registration}</td>
                      <td className="px-3 py-2">
                        <select
                          value={u}
                          aria-label={t('communal.carburant.uniteCompteur')}
                          onChange={(ev) => void unite(e.id, ev.target.value as 'km' | 'heures')}
                          className="min-h-11 rounded-lg border border-ardoise-300 px-2"
                        >
                          <option value="km">{t('communal.carburant.uniteKm')}</option>
                          <option value="heures">{t('communal.carburant.uniteHeures')}</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-end tabular-nums">
                        {q ? `${formaterNombre(q.litres_mois)} ${t('communal.carburant.unitL')} · ${t('communal.carburant.depuisLe', { date: f.date(q.depuis) })}` : '—'}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
