// Le registre communal des acteurs informels (lot 18.1).
//
// UN PROJET DE DÉCRET, PAS UN TEXTE EN VIGUEUR. Tant que la FNCT n'a pas
// déclaré le cadre en vigueur (texte publié cité), l'écran n'apparaît pas dans
// le portail (EspaceCommunal) et la base refuse toute écriture. Le bandeau
// « pas en vigueur » ne sert plus qu'au cas où la FNCT suspend le cadre
// pendant qu'une commune a l'écran ouvert : un formulaire refusé ne doit pas
// passer pour une panne.
//
// LA COMMUNE DÉCLARE, LES FAITS IMPLIQUENT. La catégorie (pré-collecteur ou
// intermédiaire) est celle que la commune écrit ; à côté, l'écran montre ce
// que les faits relevés impliquent (un local, des achats aux pairs). Un écart
// est signalé, jamais corrigé : c'est à la commune de requalifier.
//
// « NON RENSEIGNÉ » N'EST PAS « NON ». Chaque fait a trois états ; l'absence
// de réponse ne compte jamais comme une réponse négative.
//
// Pseudonyme seulement : ni nom, ni CIN, ni position, ni rendement individuel.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type ActeurInformel, type DemarcheFormalisation, type RegistreActeursInformels } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFormats } from '../../lib/formats';
import { Chargement, Erreur } from '../Elements';

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const bouton = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
const boutonDiscret = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';
const message = (e: unknown, defaut: string) => (e instanceof ErreurApi || e instanceof Error ? e.message : defaut);

type Categorie = 'pre_collecteur' | 'intermediaire';
type TroisEtats = '' | 'oui' | 'non';
const versBooleen = (v: TroisEtats) => (v === '' ? null : v === 'oui');
const versTroisEtats = (b: boolean | null): TroisEtats => (b === null ? '' : b ? 'oui' : 'non');
// Le jour à Tunis : borne des champs de date, aucun fait ne se relève demain.
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

type SaisieFaits = { categorie: Categorie; local: TroisEtats; achat: TroisEtats; motorise: TroisEtats; date: string };

export function ActeursInformels({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const { utilisateur } = useAuth();
  const [registre, setRegistre] = useState<RegistreActeursInformels | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);

  const charger = useCallback(() => {
    api
      .acteursInformels(communeId)
      .then((r) => {
        setRegistre(r);
        setErreur(null);
      })
      .catch((e) => setErreur(message(e, t('commun.erreur'))));
  }, [communeId, t]);
  useEffect(() => charger(), [charger]);

  if (erreur && !registre) return <Erreur message={erreur} onReessayer={charger} />;
  if (!registre) return <Chargement />;

  // La FNCT lit le registre ; elle ne l'établit pas à la place de la commune.
  const peutEcrire = registre.cadre_actif && utilisateur?.role === 'admin_commune';
  const onErreur = (e: unknown) => setErreur(message(e, t('commun.erreur')));

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-ardoise-900">{t('communal.acteursInformels.titre')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ardoise-600">{t('communal.acteursInformels.intro')}</p>
      </header>

      {registre.cadre_actif ? (
        <p className="rounded-lg border border-siipi-300 bg-siipi-50 p-3 text-sm text-siipi-900">
          {t('communal.acteursInformels.cadreActif', { reference: registre.reference_cadre ?? '' })}
        </p>
      ) : (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {t('communal.acteursInformels.cadreInactif')}
        </p>
      )}

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>
      )}

      {registre.acteurs.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-600">{t('communal.acteursInformels.aucun')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ardoise-50 text-xs text-ardoise-600">
              <tr>
                <th className="px-3 py-2 text-start">{t('communal.acteursInformels.pseudonyme')}</th>
                <th className="px-3 py-2 text-start">{t('communal.acteursInformels.zone')}</th>
                <th className="px-3 py-2 text-start">{t('communal.acteursInformels.categorieDeclaree')}</th>
                <th className="px-3 py-2 text-start">{t('communal.acteursInformels.categorieImpliquee')}</th>
                <th className="px-3 py-2 text-start">{t('communal.acteursInformels.faits')}</th>
                <th className="px-3 py-2 text-start">{t('communal.acteursInformels.demarche')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {registre.acteurs.map((a) => (
                <LigneActeur
                  key={a.id}
                  a={a}
                  ouvert={ouvert === a.id}
                  onBasculer={() => setOuvert(ouvert === a.id ? null : a.id)}
                  peutEcrire={peutEcrire}
                  onFait={charger}
                  onErreur={onErreur}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {peutEcrire && <Inscription communeId={communeId} onFait={charger} onErreur={onErreur} />}
    </section>
  );
}

function LibelleCategorie({ c }: { c: string | null }) {
  const { t } = useTranslation();
  return c ? <>{t(`communal.acteursInformels.categories.${c}`)}</> : <span className="text-ardoise-400">{t('communal.acteursInformels.nonRenseigne')}</span>;
}

function Fait({ libelle, v }: { libelle: string; v: boolean | null }) {
  const { t } = useTranslation();
  return (
    <span className="block">
      {libelle} :{' '}
      {v === null ? (
        <span className="text-ardoise-400">{t('communal.acteursInformels.nonRenseigne')}</span>
      ) : (
        t(v ? 'communal.acteursInformels.oui' : 'communal.acteursInformels.non')
      )}
    </span>
  );
}

function LigneActeur(props: {
  a: ActeurInformel;
  ouvert: boolean;
  onBasculer: () => void;
  peutEcrire: boolean;
  onFait: () => void;
  onErreur: (e: unknown) => void;
}) {
  const { a, ouvert, onBasculer, peutEcrire, onFait, onErreur } = props;
  const { t } = useTranslation();
  const f = useFormats();
  const ecart = a.categorie !== null && a.categorie_impliquee !== null && a.categorie !== a.categorie_impliquee;

  return (
    <>
      <tr className="border-t border-ardoise-100 align-top">
        <td className="px-3 py-2 font-mono text-xs">{a.id_precollecteur}</td>
        <td className="px-3 py-2">{a.zone ?? '—'}</td>
        <td className="px-3 py-2"><LibelleCategorie c={a.categorie} /></td>
        <td className="px-3 py-2">
          <LibelleCategorie c={a.categorie_impliquee} />
          {ecart && (
            <span className="mt-1 block rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
              {t('communal.acteursInformels.ecart')}
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-xs">
          <Fait libelle={t('communal.acteursInformels.local')} v={a.dispose_local} />
          <Fait libelle={t('communal.acteursInformels.achat')} v={a.achete_aux_pairs} />
          <Fait libelle={t('communal.acteursInformels.motorise')} v={a.vehicule_motorise} />
          {a.faits_releves_le && (
            <span className="block text-ardoise-500">{t('communal.acteursInformels.relevesLe', { date: f.date(a.faits_releves_le) })}</span>
          )}
        </td>
        <td className="px-3 py-2 text-xs">
          {a.derniere_demarche ? (
            <>
              {t(`communal.acteursInformels.statuts.${a.derniere_demarche}`)}
              {a.date_derniere_demarche && <span className="block text-ardoise-500">{f.date(a.date_derniere_demarche)}</span>}
            </>
          ) : (
            <span className="text-ardoise-400">{t('communal.acteursInformels.aucuneDemarche')}</span>
          )}
        </td>
        <td className="px-3 py-2 text-end">
          <button type="button" onClick={onBasculer} aria-expanded={ouvert} className={boutonDiscret}>
            {t(ouvert ? 'communal.acteursInformels.fermer' : 'communal.acteursInformels.ouvrir')}
          </button>
        </td>
      </tr>
      {ouvert && (
        <tr className="border-t border-ardoise-100 bg-ardoise-50/50">
          <td colSpan={7} className="space-y-4 px-3 py-3">
            {peutEcrire && <Requalification a={a} onFait={onFait} onErreur={onErreur} />}
            <Demarches acteurId={a.id} peutEcrire={peutEcrire} onFait={onFait} onErreur={onErreur} />
          </td>
        </tr>
      )}
    </>
  );
}

function ChampsFaits({ s, setS }: { s: SaisieFaits; setS: (s: SaisieFaits) => void }) {
  const { t } = useTranslation();
  const troisEtats = (cle: 'local' | 'achat' | 'motorise', libelle: string) => (
    <label className="text-sm">
      <span className="font-medium">{libelle}</span>
      <select value={s[cle]} onChange={(e) => setS({ ...s, [cle]: e.target.value as TroisEtats })} className={champ}>
        <option value="">{t('communal.acteursInformels.nonRenseigne')}</option>
        <option value="oui">{t('communal.acteursInformels.oui')}</option>
        <option value="non">{t('communal.acteursInformels.non')}</option>
      </select>
    </label>
  );
  return (
    <>
      <label className="text-sm">
        <span className="font-medium">{t('communal.acteursInformels.categorieDeclaree')}</span>
        <select value={s.categorie} onChange={(e) => setS({ ...s, categorie: e.target.value as Categorie })} className={champ}>
          <option value="pre_collecteur">{t('communal.acteursInformels.categories.pre_collecteur')}</option>
          <option value="intermediaire">{t('communal.acteursInformels.categories.intermediaire')}</option>
        </select>
      </label>
      {troisEtats('local', t('communal.acteursInformels.local'))}
      {troisEtats('achat', t('communal.acteursInformels.achat'))}
      {troisEtats('motorise', t('communal.acteursInformels.motorise'))}
      <label className="text-sm">
        <span className="font-medium">{t('communal.acteursInformels.dateReleve')}</span>
        <input type="date" max={aujourdhui()} value={s.date} onChange={(e) => setS({ ...s, date: e.target.value })} className={champ} />
      </label>
    </>
  );
}

const corpsFaits = (s: SaisieFaits) => ({
  categorie: s.categorie,
  disposeLocal: versBooleen(s.local),
  acheteAuxPairs: versBooleen(s.achat),
  vehiculeMotorise: versBooleen(s.motorise),
  faitsRelevesLe: s.date,
});

function Inscription({ communeId, onFait, onErreur }: { communeId: string; onFait: () => void; onErreur: (e: unknown) => void }) {
  const { t } = useTranslation();
  const vide: SaisieFaits = { categorie: 'pre_collecteur', local: '', achat: '', motorise: '', date: '' };
  const [s, setS] = useState(vide);
  const [zone, setZone] = useState('');
  const [vehicule, setVehicule] = useState('');
  const [envoi, setEnvoi] = useState(false);

  async function inscrire() {
    setEnvoi(true);
    try {
      await api.inscrireActeurInformel(communeId, {
        zone: zone.trim(),
        vehicleType: (vehicule || null) as 'charette' | 'tricycle_electrique' | 'triporteur_moteur' | null,
        ...corpsFaits(s),
      });
      setS(vide);
      setZone('');
      setVehicule('');
      onFait();
    } catch (e) {
      onErreur(e);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-siipi-200 bg-siipi-50/40 p-4">
      <h3 className="font-semibold text-ardoise-900">{t('communal.acteursInformels.inscrire')}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="font-medium">{t('communal.acteursInformels.zone')}</span>
          <input value={zone} onChange={(e) => setZone(e.target.value)} className={champ} />
        </label>
        <label className="text-sm">
          <span className="font-medium">{t('communal.acteursInformels.vehicule')}</span>
          <select value={vehicule} onChange={(e) => setVehicule(e.target.value)} className={champ}>
            <option value="">{t('communal.acteursInformels.nonRenseigne')}</option>
            {['charette', 'tricycle_electrique', 'triporteur_moteur'].map((v) => (
              <option key={v} value={v}>{t(`communal.acteursInformels.vehicules.${v}`)}</option>
            ))}
          </select>
        </label>
        <ChampsFaits s={s} setS={setS} />
        <div className="flex items-end">
          <button type="button" onClick={() => void inscrire()} disabled={envoi || !zone.trim() || !s.date} className={bouton}>
            {t('communal.acteursInformels.inscrire')}
          </button>
        </div>
      </div>
      <p className="text-xs text-ardoise-600">{t('communal.acteursInformels.aideInscription')}</p>
    </div>
  );
}

function Requalification({ a, onFait, onErreur }: { a: ActeurInformel; onFait: () => void; onErreur: (e: unknown) => void }) {
  const { t } = useTranslation();
  const [s, setS] = useState<SaisieFaits>({
    categorie: (a.categorie ?? a.categorie_impliquee ?? 'pre_collecteur') as Categorie,
    local: versTroisEtats(a.dispose_local),
    achat: versTroisEtats(a.achete_aux_pairs),
    motorise: versTroisEtats(a.vehicule_motorise),
    date: a.faits_releves_le ?? '',
  });
  const [envoi, setEnvoi] = useState(false);

  async function enregistrer() {
    setEnvoi(true);
    try {
      await api.faitsActeurInformel(a.id, corpsFaits(s));
      onFait();
    } catch (e) {
      onErreur(e);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-ardoise-800">{t('communal.acteursInformels.requalifier')}</h4>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <ChampsFaits s={s} setS={setS} />
        <div className="flex items-end">
          <button type="button" onClick={() => void enregistrer()} disabled={envoi || !s.date} className={bouton}>
            {t('communal.acteursInformels.enregistrer')}
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUTS = ['demarche_entamee', 'en_accompagnement', 'formalisee', 'interrompue'] as const;
type Statut = (typeof STATUTS)[number];

function Demarches(props: { acteurId: string; peutEcrire: boolean; onFait: () => void; onErreur: (e: unknown) => void }) {
  const { acteurId, peutEcrire, onFait, onErreur } = props;
  const { t } = useTranslation();
  const f = useFormats();
  const [etapes, setEtapes] = useState<DemarcheFormalisation[] | null>(null);
  const vide = { statut: 'demarche_entamee' as Statut, date: '', reference: '', observation: '' };
  const [s, setS] = useState(vide);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(() => {
    api.demarchesActeur(acteurId).then(setEtapes).catch(onErreur);
  }, [acteurId, onErreur]);
  // Chargé une fois à l'ouverture : onErreur change à chaque rendu du parent,
  // et le suivre rechargerait la liste en boucle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => charger(), [acteurId]);

  async function ajouter() {
    setEnvoi(true);
    try {
      setEtapes(
        await api.inscrireDemarche(acteurId, {
          statut: s.statut,
          dateStatut: s.date,
          reference: s.reference.trim() || null,
          observation: s.observation.trim() || null,
        })
      );
      setS(vide);
      onFait();
    } catch (e) {
      onErreur(e);
    } finally {
      setEnvoi(false);
    }
  }

  async function retirer(id: string) {
    try {
      await api.retirerDemarche(acteurId, id);
      charger();
      onFait();
    } catch (e) {
      onErreur(e);
    }
  }

  // Les règles de la base, rappelées avant l'envoi : une pièce pour une
  // démarche entamée, un motif pour une interruption.
  const complet =
    s.date !== '' &&
    (s.statut !== 'demarche_entamee' || s.reference.trim() !== '') &&
    (s.statut !== 'interrompue' || s.observation.trim().length >= 5);

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-ardoise-800">{t('communal.acteursInformels.demarcheTitre')}</h4>
      {!etapes ? (
        <Chargement />
      ) : etapes.length === 0 ? (
        <p className="text-sm text-ardoise-500">{t('communal.acteursInformels.aucuneDemarche')}</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {etapes.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums text-ardoise-600">{f.date(e.date_statut)}</span>
              <span className="font-medium">{t(`communal.acteursInformels.statuts.${e.statut}`)}</span>
              {e.reference && <span className="text-xs text-ardoise-600">{e.reference}</span>}
              {e.observation && <span className="text-xs text-ardoise-600">— {e.observation}</span>}
              {peutEcrire && (
                <button type="button" onClick={() => void retirer(e.id)} className="ms-auto text-xs text-red-700 underline">
                  {t('communal.acteursInformels.retirerEtape')}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {peutEcrire && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm">
            <span className="font-medium">{t('communal.acteursInformels.etape')}</span>
            <select value={s.statut} onChange={(e) => setS({ ...s, statut: e.target.value as Statut })} className={champ}>
              {STATUTS.map((st) => (
                <option key={st} value={st}>{t(`communal.acteursInformels.statuts.${st}`)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium">{t('communal.acteursInformels.dateEtape')}</span>
            <input type="date" max={aujourdhui()} value={s.date} onChange={(e) => setS({ ...s, date: e.target.value })} className={champ} />
          </label>
          <label className="text-sm">
            <span className="font-medium">{t('communal.acteursInformels.piece')}</span>
            <input value={s.reference} onChange={(e) => setS({ ...s, reference: e.target.value })} className={champ} />
          </label>
          <label className="text-sm">
            <span className="font-medium">{t('communal.acteursInformels.observation')}</span>
            <input value={s.observation} onChange={(e) => setS({ ...s, observation: e.target.value })} className={champ} />
          </label>
          <div className="flex items-end">
            <button type="button" onClick={() => void ajouter()} disabled={envoi || !complet} className={bouton}>
              {t('communal.acteursInformels.ajouterEtape')}
            </button>
          </div>
          <p className="text-xs text-ardoise-600 sm:col-span-2 lg:col-span-5">{t('communal.acteursInformels.aideDemarche')}</p>
        </div>
      )}
    </div>
  );
}
