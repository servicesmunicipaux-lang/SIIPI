// Le personnel du service.
//
// CE QUE CET ÉCRAN MONTRE, ET CE QU'IL NE MONTRERA JAMAIS. Il montre qui est
// là ce matin et sur quel circuit. Il ne montre aucun salaire individuel,
// aucune donnée de santé, aucun numéro de CIN : la base n'en porte pas, donc
// l'écran ne peut pas les afficher, même par accident (décret-loi n° 2022-54).
//
// POURQUOI LE POINTAGE EST LA PREMIÈRE CHOSE À L'ÉCRAN. Le service propreté de
// Dar Chaabane compte soixante et une personnes et UN seul cadre technique.
// C'est lui qui pointera, chaque matin, avant de partir en tournée. Soixante
// lignes, une case chacune, un seul enregistrement : au-delà, ce ne sera pas
// fait, et un module du personnel que personne ne remplit est pire qu'aucun
// module — il donne l'illusion d'un suivi.
//
// L'ÉCART DES CHIFFRES EST AFFICHÉ, PAS RÉSOLU. Deux feuilles du registre des
// circuits annoncent 48 et 39 agents ; la paie en compte 60. Aucun des trois ne
// dit qui fait quoi. Le bandeau montre les trois nombres côte à côte plutôt que
// d'en choisir un : c'est la commune qui tranchera, et elle seule le peut.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  type Agent,
  type EquipeDuJour,
  type CoutService,
  type LignePresence,
} from '../../lib/api';
import { Chargement, Erreur } from '../Elements';

const MOTIFS = [
  'conge', 'repos', 'formation', 'absence_justifiee',
  'absence_non_justifiee', 'detachement', 'autre',
] as const;
type Motif = (typeof MOTIFS)[number];

type Vue = 'pointage' | 'effectif' | 'equipes' | 'cout';
const VUES: Vue[] = ['pointage', 'effectif', 'equipes', 'cout'];

const nombre = (n: unknown) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('fr-FR');
const dinars = (n: unknown) =>
  n === null || n === undefined
    ? '—'
    : `${Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} TND`;

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export function Personnel({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const [vue, setVue] = useState<Vue>('pointage');
  const [jour, setJour] = useState(aujourdhui());

  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [presences, setPresences] = useState<LignePresence[] | null>(null);
  const [equipes, setEquipes] = useState<EquipeDuJour[] | null>(null);
  const [cout, setCout] = useState<CoutService[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = async () => {
    try {
      const [a, p, e, c] = await Promise.all([
        api.personnel(communeId),
        api.presences(communeId, jour),
        api.equipesDuJour(communeId, jour),
        api.coutService(communeId),
      ]);
      setAgents(a);
      setPresences(p);
      setEquipes(e);
      setCout(c);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId, jour]);

  const compteurs = useMemo(() => {
    const l = presences ?? [];
    return {
      effectif: l.length,
      pointes: l.filter((x) => x.present !== null).length,
      presents: l.filter((x) => x.present === true).length,
      absents: l.filter((x) => x.present === false).length,
    };
  }, [presences]);

  if (erreur && !agents) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!agents || !presences || !equipes || !cout) return <Chargement />;

  const pointer = async (ligne: LignePresence, present: boolean, motif?: Motif) => {
    setEnCours(ligne.personnel_id);
    setErreur(null);
    try {
      await api.pointer({
        personnelId: ligne.personnel_id,
        jour,
        present,
        motifAbsence: present ? null : (motif ?? 'absence_justifiee'),
        // On reconduit le circuit déjà inscrit sur la ligne : sans cela, un
        // agent pointé deux fois dans la matinée perdait la tournée qu'on lui
        // avait attribuée, et la feuille ne disait plus où il était.
        circuitId: present ? (ligne.circuit_id ?? null) : null,
      });
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(null);
    }
  };

  // --- Affecter et retirer ---------------------------------------------------
  //
  // L'écran signalait les tournées non pourvues sans offrir d'y remédier :
  // l'API savait affecter depuis le module 4, aucun composant ne l'appelait.
  // Un écran qui constate un manque sans permettre de le combler renvoie
  // l'utilisateur vers un formulaire qui n'existe pas.

  const affecter = async (circuitId: string, personnelId: string, role: string) => {
    setEnCours(personnelId);
    setErreur(null);
    try {
      await api.affecterAgent(personnelId, { circuitId, role, dateDebut: jour });
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(null);
    }
  };

  // On CLÔT l'affectation, on ne l'efface pas : la tournée de la semaine
  // dernière doit rester lisible avec l'équipe qui l'a réellement faite. Un
  // agent retiré aujourd'hui reste donc inscrit sur les journées passées.
  const retirerDuCircuit = async (personnelId: string, affectationId: string) => {
    setEnCours(personnelId);
    setErreur(null);
    try {
      await api.cloreAffectation(personnelId, affectationId, jour);
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(null);
    }
  };

  // Pointer tout le monde présent d'un geste, puis corriger les absents : c'est
  // l'ordre réel des choses un matin où presque tout le monde est là.
  const toutPresent = async () => {
    const aPointer = presences
      .filter((l) => l.present === null)
      .map((l) => ({ personnelId: l.personnel_id, jour, present: true }));
    if (aPointer.length === 0) return;

    setEnCours('tous');
    setErreur(null);
    try {
      await api.pointer(aPointer);
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(null);
    }
  };

  const dernier = cout.length > 0 ? cout[cout.length - 1] : null;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.personnel.titre')}</h1>
        <p className="mt-1 text-sm text-ardoise-600">{t('communal.personnel.chapeau')}</p>
      </header>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {erreur}
        </p>
      )}

      {/* Le bandeau : l'effectif, la présence du jour, le coût du service. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Carte libelle={t('communal.personnel.effectif')} valeur={nombre(compteurs.effectif)} />
        <Carte
          libelle={t('communal.personnel.presents')}
          valeur={`${nombre(compteurs.presents)} / ${nombre(compteurs.effectif)}`}
          accent={compteurs.pointes === 0 ? 'attente' : undefined}
        />
        <Carte libelle={t('communal.personnel.absents')} valeur={nombre(compteurs.absents)} />
        <Carte
          libelle={dernier ? t('communal.personnel.masse', { annee: dernier.annee }) : t('communal.personnel.masse', { annee: '—' })}
          valeur={dinars(dernier?.masse_salariale_tnd)}
        />
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-ardoise-200" aria-label={t('communal.personnel.navigation')}>
        {VUES.map((cle) => (
          <button
            key={cle}
            type="button"
            onClick={() => setVue(cle)}
            aria-current={vue === cle ? 'page' : undefined}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 text-sm font-medium ${
              vue === cle
                ? 'border-siipi-600 text-siipi-700'
                : 'border-transparent text-ardoise-500 hover:text-ardoise-800'
            }`}
          >
            {t(`communal.personnel.vues.${cle}`)}
          </button>
        ))}
      </nav>

      {(vue === 'pointage' || vue === 'equipes') && (
        <label className="flex items-center gap-2 text-sm text-ardoise-700">
          {t('communal.personnel.jour')}
          <input
            type="date"
            value={jour}
            max={aujourdhui()}
            onChange={(e) => setJour(e.target.value)}
            className="min-h-11 rounded-lg border border-ardoise-300 px-3"
          />
        </label>
      )}

      {/* --- Le pointage ---------------------------------------------------- */}
      {vue === 'pointage' && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void toutPresent()}
              disabled={enCours !== null || compteurs.pointes === compteurs.effectif}
              className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40"
            >
              {t('communal.personnel.toutPresent')}
            </button>
            <span className="text-sm text-ardoise-600">
              {t('communal.personnel.restants', { n: compteurs.effectif - compteurs.pointes })}
            </span>
          </div>

          <ul className="divide-y divide-ardoise-200 rounded-xl border border-ardoise-200 bg-white">
            {presences.map((l) => (
              <li key={l.personnel_id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-[10rem] flex-1">
                  <p className="font-medium text-ardoise-900">{l.nom_complet}</p>
                  <p className="text-xs text-ardoise-500">
                    {t(`communal.personnel.fonctions.${l.fonction}`, { defaultValue: l.fonction })}
                    {l.circuit ? ` · ${l.circuit}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void pointer(l, true)}
                    disabled={enCours !== null}
                    aria-pressed={l.present === true}
                    className={`min-h-11 rounded-lg px-3 text-sm ${
                      l.present === true
                        ? 'bg-siipi-600 text-white'
                        : 'border border-ardoise-300 text-ardoise-700'
                    }`}
                  >
                    {t('communal.personnel.present')}
                  </button>

                  <select
                    value={l.present === false ? (l.motif_absence ?? '') : ''}
                    onChange={(e) => {
                      // « Absent… » est un libellé d'attente, pas un motif. Le
                      // choisir ne veut rien dire : on ne pointe que sur un
                      // motif réel. (Sans ce garde-fou, la chaîne vide partait
                      // vers l'API, qui la refusait — et l'écran semblait figé.)
                      if (e.target.value === '') return;
                      void pointer(l, false, e.target.value as Motif);
                    }}
                    disabled={enCours !== null}
                    className={`min-h-11 rounded-lg border px-2 text-sm ${
                      l.present === false
                        ? 'border-amber-400 bg-amber-50 text-amber-900'
                        : 'border-ardoise-300 text-ardoise-700'
                    }`}
                    aria-label={t('communal.personnel.motif')}
                  >
                    <option value="">{t('communal.personnel.absent')}</option>
                    {MOTIFS.map((m) => (
                      <option key={m} value={m}>
                        {t(`communal.personnel.motifs.${m}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>

          {/* Le vocabulaire des motifs ne comporte volontairement aucun terme
              médical. On le dit à l'agent qui saisit, plutôt que de le laisser
              chercher « maladie » dans la liste. */}
          <p className="text-xs text-ardoise-500">{t('communal.personnel.noteMotifs')}</p>
        </section>
      )}

      {/* --- L'effectif ----------------------------------------------------- */}
      {vue === 'effectif' && (
        <section className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ardoise-50 text-left text-xs uppercase text-ardoise-600">
              <tr>
                <th className="p-3">{t('communal.personnel.colNom')}</th>
                <th className="p-3">{t('communal.personnel.colFonction')}</th>
                <th className="p-3">{t('communal.personnel.colGrade')}</th>
                <th className="p-3">{t('communal.personnel.colCircuits')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ardoise-200">
              {agents.map((a) => (
                <tr key={a.id}>
                  <td className="p-3 font-medium text-ardoise-900">{a.nom_complet}</td>
                  <td className="p-3">
                    {t(`communal.personnel.fonctions.${a.fonction}`, { defaultValue: a.fonction })}
                  </td>
                  <td className="p-3 text-ardoise-600">
                    {a.grade ?? '—'}
                    {a.classe ? ` · ${t('communal.personnel.classe')} ${a.classe}` : ''}
                    {a.echelon ? `.${a.echelon}` : ''}
                  </td>
                  <td className="p-3 text-ardoise-600">{a.circuits ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* --- Les équipes du jour -------------------------------------------- */}
      {vue === 'equipes' && (
        <section className="space-y-2">
          {equipes.length === 0 && (
            <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-600">
              {t('communal.personnel.aucunCircuit')}
            </p>
          )}
          {equipes.map((e) => (
            <CarteEquipe
              key={e.circuit_id}
              equipe={e}
              agents={agents}
              jour={jour}
              gele={enCours !== null}
              onAffecter={affecter}
              onRetirer={retirerDuCircuit}
            />
          ))}
          {equipes.length > 0 && (
            <p className="text-xs text-ardoise-500">{t('communal.personnel.noteAffectation')}</p>
          )}
        </section>
      )}

      {/* --- Le coût du service --------------------------------------------- */}
      {vue === 'cout' && (
        <section className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-ardoise-50 text-left text-xs uppercase text-ardoise-600">
                <tr>
                  <th className="p-3">{t('communal.personnel.colAnnee')}</th>
                  <th className="p-3">{t('communal.personnel.colEffectif')}</th>
                  <th className="p-3">{t('communal.personnel.colMasse')}</th>
                  <th className="p-3">{t('communal.personnel.colMoyen')}</th>
                  <th className="p-3">{t('communal.personnel.colEvolution')}</th>
                  <th className="p-3">{t('communal.personnel.colSource')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ardoise-200">
                {cout.map((c) => (
                  <tr key={c.annee}>
                    <td className="p-3 font-medium text-ardoise-900">{c.annee}</td>
                    <td className="p-3">{c.effectif_total ? nombre(c.effectif_total) : '—'}</td>
                    <td className="p-3">{dinars(c.masse_salariale_tnd)}</td>
                    <td className="p-3">{dinars(c.cout_moyen_agent_tnd)}</td>
                    <td className="p-3">
                      {c.evolution_pct === null || c.evolution_pct === undefined
                        ? '—'
                        : `${Number(c.evolution_pct) > 0 ? '+' : ''}${c.evolution_pct} %`}
                    </td>
                    <td className="p-3 text-xs text-ardoise-500">{c.source ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Le coût à la tonne est le seul chiffre qui permette de comparer
              deux communes. Il attend les pesées : un ratio calculé sur un
              tonnage estimé serait plus nuisible qu'utile. */}
          <p className="text-xs text-ardoise-500">{t('communal.personnel.noteCout')}</p>
        </section>
      )}
    </div>
  );
}

function Carte({
  libelle,
  valeur,
  accent,
}: {
  libelle: string;
  valeur: string;
  accent?: 'attente';
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        accent === 'attente' ? 'border-amber-300 bg-amber-50' : 'border-ardoise-200 bg-white'
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-ardoise-500">{libelle}</p>
      <p className="mt-1 text-lg font-semibold text-ardoise-900">{valeur}</p>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Une tournée et son équipe.
//
// Le choix de l'agent et celui du rôle vivent DANS la carte : quatorze cartes
// à l'écran, quatorze saisies indépendantes. Un état partagé plus haut ferait
// qu'ouvrir le sélecteur d'un circuit réinitialiserait celui d'à côté.
//
// Le rôle tenu sur la tournée est proposé d'après la fonction au registre
// (un chauffeur conduit, un chef d'équipe encadre), mais reste modifiable :
// un tractoriste peut très bien tenir le rôle d'agent sur un circuit de
// balayage, et c'est la commune qui le sait, pas la plateforme.
// ---------------------------------------------------------------------------

const ROLES = ['chauffeur', 'agent', 'chef_equipe'] as const;
type Role = (typeof ROLES)[number];

const rolePropose = (fonction: string): Role =>
  fonction === 'chauffeur' || fonction === 'tractoriste'
    ? 'chauffeur'
    : fonction === 'chef_equipe' || fonction === 'encadrement'
      ? 'chef_equipe'
      : 'agent';

function CarteEquipe({
  equipe,
  agents,
  jour,
  gele,
  onAffecter,
  onRetirer,
}: {
  equipe: EquipeDuJour;
  agents: Agent[];
  jour: string;
  gele: boolean;
  onAffecter: (circuitId: string, personnelId: string, role: Role) => Promise<void>;
  onRetirer: (personnelId: string, affectationId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [choix, setChoix] = useState('');
  const [role, setRole] = useState<Role>('agent');
  // Deux temps pour retirer : le premier clic demande, le second agit. Sans
  // cela, un pouce qui glisse sur mobile décroche un chauffeur de sa tournée.
  const [aRetirer, setARetirer] = useState<string | null>(null);

  const membres = equipe.membres ?? [];
  const dejaLa = new Set(membres.map((m) => m.personnel_id));
  // Un agent inactif est en poste mais ne travaille pas ce mois-ci : on ne
  // l'affecte pas à une tournée qu'il ne fera pas.
  const disponibles = agents.filter((a) => a.actif && !dejaLa.has(a.id));

  return (
    <article
      className={`rounded-xl border bg-white p-3 ${
        equipe.affectes === 0 ? 'border-red-300' : 'border-ardoise-200'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium text-ardoise-900">{equipe.circuit}</h2>
        <p className="text-sm text-ardoise-600">
          {t('communal.personnel.affectes', { n: equipe.affectes })}
          {equipe.taille_prevue ? ` / ${equipe.taille_prevue}` : ''} ·{' '}
          {t('communal.personnel.presentsN', { n: equipe.presents })}
        </p>
      </div>

      {/* Un circuit motorisé sans chauffeur est la première chose qu'un
          chef de service veut voir le matin. */}
      {!equipe.chauffeur && (
        <p className="mt-2 text-sm text-amber-800">{t('communal.personnel.sansChauffeur')}</p>
      )}
      {equipe.affectes === 0 && (
        <p className="mt-2 text-sm text-red-800">{t('communal.personnel.sansEquipe')}</p>
      )}

      {membres.length > 0 && (
        <ul className="mt-2 divide-y divide-ardoise-100 border-t border-ardoise-100">
          {membres.map((m) => (
            <li key={m.affectation_id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="text-sm font-medium text-ardoise-900">{m.nom_complet}</span>
              <span className="rounded-full bg-ardoise-100 px-2 py-0.5 text-xs text-ardoise-700">
                {t(`communal.personnel.roles.${m.role}`, { defaultValue: m.role })}
              </span>
              {m.matricule && <span className="text-xs text-ardoise-500">{m.matricule}</span>}
              {/* Trois états, pas deux : pointé présent, pointé absent, ou pas
                  encore pointé. Nul ne veut pas dire absent. */}
              {m.present === true && (
                <span className="text-xs text-emerald-700">{t('communal.personnel.present')}</span>
              )}
              {m.present === false && (
                <span className="text-xs text-amber-800">{t('communal.personnel.absents')}</span>
              )}
              {m.present === null && (
                <span className="text-xs text-ardoise-400">{t('communal.personnel.pasPointe')}</span>
              )}
              <button
                type="button"
                onClick={() => {
                  if (aRetirer === m.affectation_id) {
                    setARetirer(null);
                    void onRetirer(m.personnel_id, m.affectation_id);
                  } else {
                    setARetirer(m.affectation_id);
                  }
                }}
                disabled={gele}
                className={`ms-auto min-h-11 rounded-lg border px-3 text-sm ${
                  aRetirer === m.affectation_id
                    ? 'border-red-400 bg-red-50 text-red-900'
                    : 'border-ardoise-300 text-ardoise-700'
                }`}
              >
                {aRetirer === m.affectation_id
                  ? t('communal.personnel.retirerConfirme')
                  : t('communal.personnel.retirer')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-ardoise-100 pt-2">
        <select
          value={choix}
          onChange={(e) => {
            setChoix(e.target.value);
            const a = agents.find((x) => x.id === e.target.value);
            if (a) setRole(rolePropose(a.fonction));
          }}
          disabled={gele || disponibles.length === 0}
          className="min-h-11 flex-1 rounded-lg border border-ardoise-300 px-2 text-sm text-ardoise-700"
          aria-label={t('communal.personnel.choisirAgent')}
        >
          <option value="">
            {disponibles.length === 0
              ? t('communal.personnel.tousAffectes')
              : t('communal.personnel.choisirAgent')}
          </option>
          {disponibles.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nom_complet} —{' '}
              {t(`communal.personnel.fonctions.${a.fonction}`, { defaultValue: a.fonction })}
            </option>
          ))}
        </select>

        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          disabled={gele || choix === ''}
          className="min-h-11 rounded-lg border border-ardoise-300 px-2 text-sm text-ardoise-700"
          aria-label={t('communal.personnel.role')}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`communal.personnel.roles.${r}`)}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => {
            if (choix === '') return;
            const agent = choix;
            setChoix('');
            void onAffecter(equipe.circuit_id, agent, role);
          }}
          disabled={gele || choix === ''}
          className="min-h-11 rounded-lg bg-ardoise-900 px-4 text-sm font-medium text-white disabled:opacity-40"
        >
          {t('communal.personnel.affecter')}
        </button>
      </div>

      {/* La date de début est celle affichée en haut de l'écran, pas
          forcément aujourd'hui : on enregistre parfois une organisation la
          veille au soir pour le lendemain. */}
      <p className="mt-1 text-xs text-ardoise-400">
        {t('communal.personnel.affecterDepuis', { date: jour })}
      </p>
    </article>
  );
}
