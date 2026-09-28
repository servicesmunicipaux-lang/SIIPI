// Tableau des points de collecte — le tableau attributaire du Jalon 6
// (TDR §3.2.3, B3.4 et B3.5).
//
// Tous les arrêts de la commune, tous circuits confondus, avec les colonnes
// que la commune ajoute elle-même (« accès camion », « nombre de bacs »…),
// ses étiquettes, et les actions planifiées sur une sélection. C'est ce qui
// lui permet d'organiser une campagne de déchets verts sans attendre une
// évolution du logiciel.
//
// Les filtres de l'écran sont ceux de la route de liste, et l'export passe
// par cette même route : le fichier est exactement ce qu'on voit (B3.6).

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';
import {
  api,
  cheminPoints,
  ErreurApi,
  type ChampPoint,
  type EtiquettePoint,
  type FiltresPoints,
  type PointDeCommune,
} from '../../lib/api';
import { Chargement, Erreur } from '../Elements';
import { BoutonExport } from '../BoutonExport';
import { GestionChampsPoints } from './GestionChampsPoints';
import { ActionsPoints } from './ActionsPoints';
import {
  depuisSaisie,
  libelleChamp,
  PastilleEtiquette,
  SaisieValeur,
  ValeurAffichee,
  versSaisie,
} from './valeursChamps';

type Vue = 'tableau' | 'actions';
type Lot = null | 'renseigner' | 'etiqueter' | 'planifier';

const bouton = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50 disabled:opacity-50';
const boutonPrincipal = 'min-h-10 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white hover:bg-siipi-700 disabled:opacity-50';
const champSaisie = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-2 text-sm';

export function TableauPoints({ communeId }: { communeId: string }) {
  const { t, i18n } = useTranslation();
  const { utilisateur } = useAuth();
  const peutEcrire = utilisateur?.role === 'admin_commune' || utilisateur?.role === 'super_admin_fnct';

  const [vue, setVue] = useState<Vue>('tableau');
  const [points, setPoints] = useState<PointDeCommune[] | null>(null);
  const [champs, setChamps] = useState<ChampPoint[]>([]);
  const [etiquettes, setEtiquettes] = useState<EtiquettePoint[]>([]);
  const [circuits, setCircuits] = useState<{ id: string; nom: string }[]>([]);
  const [filtres, setFiltres] = useState<FiltresPoints>({});
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [gestion, setGestion] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const signaler = (err: unknown) => setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));

  const chargerReferentiels = async () => {
    try {
      const [c, e] = await Promise.all([api.champsPoints(communeId), api.etiquettesPoints(communeId)]);
      setChamps(c);
      setEtiquettes(e);
    } catch (err) {
      signaler(err);
    }
  };

  const chargerPoints = async () => {
    try {
      setPoints(await api.pointsFiltres(communeId, filtres));
      setErreur(null);
    } catch (err) {
      signaler(err);
    }
  };

  useEffect(() => {
    void chargerReferentiels();
    void api
      .circuits(communeId)
      .then((l) => setCircuits((l as { id: string; nom: string }[]).map((c) => ({ id: c.id, nom: c.nom }))))
      .catch(() => setCircuits([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId]);

  useEffect(() => {
    // Une valeur tapée dans le filtre part après une courte pause, pas à
    // chaque touche.
    const minuteur = window.setTimeout(() => void chargerPoints(), 250);
    return () => window.clearTimeout(minuteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId, filtres]);

  // Une sélection ne survit pas à un changement de filtre : agir sur des
  // points qu'on ne voit plus est la façon la plus sûre de se tromper.
  useEffect(() => setSelection(new Set()), [filtres]);

  const parId = useMemo(() => new Map(etiquettes.map((e) => [e.id, e])), [etiquettes]);
  const champFiltre = champs.find((c) => c.id === filtres.champId);

  const basculerEtiquette = (id: string) =>
    setFiltres((f) => {
      const actuelles = f.etiquettes ?? [];
      return { ...f, etiquettes: actuelles.includes(id) ? actuelles.filter((x) => x !== id) : [...actuelles, id] };
    });

  const apresModification = async (texte: string) => {
    setMessage(texte);
    await Promise.all([chargerPoints(), chargerReferentiels()]);
  };

  if (erreur && !points) return <Erreur message={erreur} onReessayer={() => void chargerPoints()} />;

  const nbFiltres =
    (filtres.circuitId ? 1 : 0) + (filtres.etiquettes?.length ?? 0) + (filtres.champId ? 1 : 0) + (filtres.actionId ? 1 : 0);
  const tousCoches = !!points?.length && points.every((p) => selection.has(p.id));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.points.titre')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-500">{t('communal.points.chapeau')}</p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('communal.points.titre')}>
          {(['tableau', 'actions'] as Vue[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={vue === v}
              onClick={() => setVue(v)}
              className={`min-h-10 rounded-full px-4 text-sm font-medium ${
                vue === v ? 'bg-siipi-600 text-white' : 'bg-white text-ardoise-700 ring-1 ring-ardoise-300'
              }`}
            >
              {t(`communal.points.vues.${v}`)}
            </button>
          ))}
        </div>
      </header>

      {message && (
        <p role="status" className="flex items-start justify-between gap-3 rounded-lg border border-siipi-200 bg-siipi-50 p-3 text-sm text-siipi-800">
          {message}
          <button type="button" onClick={() => setMessage(null)} className="text-siipi-700 underline">
            {t('communal.points.fermer')}
          </button>
        </p>
      )}
      {erreur && points && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {erreur}
        </p>
      )}

      {vue === 'actions' ? (
        <ActionsPoints
          communeId={communeId}
          peutEcrire={peutEcrire}
          onVoirDansTableau={(actionId) => {
            setFiltres({ actionId });
            setVue('tableau');
          }}
        />
      ) : (
        <>
          {/* --- Filtres --------------------------------------------------- */}
          <section className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-3" aria-label={t('communal.points.filtres.titre')}>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                <span className="block text-xs text-ardoise-500">{t('communal.points.filtres.circuit')}</span>
                <select
                  value={filtres.circuitId ?? ''}
                  onChange={(e) => setFiltres((f) => ({ ...f, circuitId: e.target.value || undefined }))}
                  className={champSaisie}
                >
                  <option value="">{t('communal.points.filtres.tousCircuits')}</option>
                  {circuits.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs text-ardoise-500">{t('communal.points.filtres.champ')}</span>
                <select
                  value={filtres.champId ?? ''}
                  onChange={(e) =>
                    setFiltres((f) => ({ ...f, champId: e.target.value || undefined, operateur: undefined, valeur: undefined }))
                  }
                  className={champSaisie}
                  disabled={champs.length === 0}
                >
                  <option value="">{champs.length ? t('communal.points.filtres.aucunChamp') : t('communal.points.champs.aucun')}</option>
                  {champs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {libelleChamp(c, i18n.language)}
                    </option>
                  ))}
                </select>
              </label>
              {champFiltre && (
                <>
                  <label className="text-sm">
                    <span className="block text-xs text-ardoise-500">{t('communal.points.filtres.operateur')}</span>
                    <select
                      value={filtres.operateur ?? (champFiltre.type === 'texte' ? 'contient' : 'egal')}
                      onChange={(e) => setFiltres((f) => ({ ...f, operateur: e.target.value as FiltresPoints['operateur'] }))}
                      className={champSaisie}
                    >
                      {(champFiltre.type === 'texte'
                        ? (['contient', 'egal', 'renseigne', 'vide'] as const)
                        : (['egal', 'renseigne', 'vide'] as const)
                      ).map((o) => (
                        <option key={o} value={o}>
                          {t(`communal.points.filtres.operateurs.${o}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!['renseigne', 'vide'].includes(filtres.operateur ?? '') && (
                    <label className="text-sm">
                      <span className="block text-xs text-ardoise-500">{t('communal.points.filtres.valeur')}</span>
                      <SaisieValeur
                        champ={champFiltre}
                        valeur={filtres.valeur ?? ''}
                        onChange={(v) => setFiltres((f) => ({ ...f, valeur: v }))}
                        libelle={t('communal.points.filtres.valeur')}
                        sansVide
                      />
                    </label>
                  )}
                </>
              )}
              {nbFiltres > 0 && (
                <button type="button" onClick={() => setFiltres({})} className={bouton}>
                  {t('communal.points.filtres.effacer')}
                </button>
              )}
            </div>
            {etiquettes.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-ardoise-500">{t('communal.points.filtres.etiquettes')}</span>
                {etiquettes.map((e) => (
                  <PastilleEtiquette
                    key={e.id}
                    etiquette={e}
                    actif={filtres.etiquettes?.includes(e.id)}
                    onClick={() => basculerEtiquette(e.id)}
                  />
                ))}
              </div>
            )}
            {filtres.actionId && (
              <p className="text-sm text-ardoise-700">
                {t('communal.points.filtres.parAction')}{' '}
                <button type="button" className="text-siipi-700 underline" onClick={() => setFiltres((f) => ({ ...f, actionId: undefined }))}>
                  {t('communal.points.filtres.retirerAction')}
                </button>
              </p>
            )}
          </section>

          {/* --- Compte, export, gestion ----------------------------------- */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ardoise-600" aria-live="polite">
              {points ? t('communal.points.nbPoints', { count: points.length }) : ''}
              {selection.size > 0 && <> · {t('communal.points.selection.n', { count: selection.size })}</>}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <BoutonExport chemin={cheminPoints(communeId, filtres)} desactive={!points?.length} />
              {peutEcrire && (
                <button type="button" onClick={() => setGestion((g) => !g)} aria-expanded={gestion} className={bouton}>
                  {t('communal.points.gerer')}
                </button>
              )}
            </div>
          </div>

          {gestion && peutEcrire && (
            <GestionChampsPoints
              communeId={communeId}
              champs={champs}
              etiquettes={etiquettes}
              onModifie={() => void Promise.all([chargerReferentiels(), chargerPoints()])}
            />
          )}

          {peutEcrire && selection.size > 0 && (
            <BarreLot
              communeId={communeId}
              ids={[...selection]}
              champs={champs}
              etiquettes={etiquettes}
              onFait={(texte) => void apresModification(texte)}
              onPlanifie={(texte) => {
                setSelection(new Set());
                void apresModification(texte);
              }}
              onErreur={signaler}
            />
          )}

          {/* --- Le tableau ------------------------------------------------ */}
          {!points ? (
            <Chargement />
          ) : points.length === 0 ? (
            <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">
              {nbFiltres ? t('communal.points.aucunResultat') : t('communal.points.vide')}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
              <table className="w-full min-w-[48rem] text-sm">
                <thead className="border-b border-ardoise-200 bg-ardoise-50 text-start text-xs uppercase text-ardoise-500">
                  <tr>
                    {peutEcrire && (
                      <th className="w-10 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={tousCoches}
                          onChange={() => setSelection(tousCoches ? new Set() : new Set(points.map((p) => p.id)))}
                          aria-label={t('communal.points.selection.tout')}
                          className="size-4"
                        />
                      </th>
                    )}
                    <th className="px-3 py-2 text-start">{t('communal.points.colonnes.circuit')}</th>
                    <th className="px-3 py-2 text-start">{t('communal.points.colonnes.ordre')}</th>
                    <th className="px-3 py-2 text-start">{t('communal.points.colonnes.nom')}</th>
                    <th className="px-3 py-2 text-start">{t('communal.points.colonnes.type')}</th>
                    <th className="px-3 py-2 text-start">{t('communal.points.colonnes.etiquettes')}</th>
                    {champs.map((c) => (
                      <th key={c.id} className="px-3 py-2 text-start normal-case text-ardoise-700">
                        {libelleChamp(c, i18n.language)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.id} className={`border-b border-ardoise-100 last:border-0 ${selection.has(p.id) ? 'bg-siipi-50' : ''}`}>
                      {peutEcrire && (
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selection.has(p.id)}
                            onChange={() =>
                              setSelection((s) => {
                                const n = new Set(s);
                                if (n.has(p.id)) n.delete(p.id);
                                else n.add(p.id);
                                return n;
                              })
                            }
                            aria-label={t('communal.points.selection.cocher', { nom: p.nom ?? `#${p.ordre}` })}
                            className="size-4"
                          />
                        </td>
                      )}
                      <td className="px-3 py-2 text-ardoise-600">{p.circuit_nom ?? '—'}</td>
                      <td className="chiffres px-3 py-2">
                        {p.voyage > 1 ? `${p.voyage}·` : ''}
                        {p.ordre}
                      </td>
                      <td className="px-3 py-2 font-medium text-ardoise-900">{p.nom ?? '—'}</td>
                      <td className="px-3 py-2 text-ardoise-600">
                        {t(`communal.circuits.typesPoint.${p.type}`, { defaultValue: p.type })}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap gap-1">
                          {(p.etiquettes ?? []).map((id) => {
                            const e = parId.get(id);
                            return e ? <PastilleEtiquette key={id} etiquette={e} /> : null;
                          })}
                        </span>
                      </td>
                      {champs.map((c) => (
                        <td key={c.id} className="px-3 py-1">
                          <CelluleChamp
                            point={p}
                            champ={c}
                            peutEcrire={peutEcrire}
                            onEnregistre={(attributs) =>
                              setPoints((l) => l?.map((x) => (x.id === p.id ? { ...x, attributs } : x)) ?? l)
                            }
                            onErreur={signaler}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Une case d'un champ libre : un clic l'ouvre, Entrée ou la sortie l'enregistre.
// ---------------------------------------------------------------------------

function CelluleChamp({
  point,
  champ,
  peutEcrire,
  onEnregistre,
  onErreur,
}: {
  point: PointDeCommune;
  champ: ChampPoint;
  peutEcrire: boolean;
  onEnregistre: (attributs: PointDeCommune['attributs']) => void;
  onErreur: (err: unknown) => void;
}) {
  const { t, i18n } = useTranslation();
  const valeur = (point.attributs ?? {})[champ.id];
  const [saisie, setSaisie] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  if (!peutEcrire) return <ValeurAffichee champ={champ} valeur={valeur} />;

  const enregistrer = async () => {
    if (saisie === null || enCours) return;
    if (saisie === versSaisie(champ, valeur)) {
      setSaisie(null);
      return;
    }
    setEnCours(true);
    try {
      const r = await api.modifierAttributsPoint(point.id, { attributs: { [champ.id]: depuisSaisie(saisie) } });
      onEnregistre(r.attributs as PointDeCommune['attributs']);
      setSaisie(null);
    } catch (err) {
      // La saisie reste affichée : on corrige ce qu'on a tapé, on ne le retape pas.
      onErreur(err);
    } finally {
      setEnCours(false);
    }
  };

  if (saisie === null) {
    return (
      <button
        type="button"
        onClick={() => setSaisie(versSaisie(champ, valeur))}
        className="min-h-9 w-full rounded px-1 text-start hover:bg-ardoise-100"
        aria-label={t('communal.points.cellule.modifier', { champ: libelleChamp(champ, i18n.language), nom: point.nom ?? `#${point.ordre}` })}
      >
        <ValeurAffichee champ={champ} valeur={valeur} />
      </button>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1"
      onBlur={(e) => {
        // La sortie de la case enregistre ; passer du champ au bouton non.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void enregistrer();
      }}
      onKeyDown={(e) => e.key === 'Escape' && setSaisie(null)}
    >
      <SaisieValeur
        champ={champ}
        valeur={saisie}
        onChange={setSaisie}
        autoFocus
        libelle={libelleChamp(champ, i18n.language)}
        onValider={() => void enregistrer()}
      />
      <button
        type="button"
        onClick={() => void enregistrer()}
        disabled={enCours}
        className="min-h-9 rounded bg-siipi-600 px-2 text-xs font-medium text-white"
      >
        {t('communal.points.cellule.ok')}
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// La barre de lot : renseigner, étiqueter, planifier — sur la sélection.
// ---------------------------------------------------------------------------

function BarreLot({
  communeId,
  ids,
  champs,
  etiquettes,
  onFait,
  onPlanifie,
  onErreur,
}: {
  communeId: string;
  ids: string[];
  champs: ChampPoint[];
  etiquettes: EtiquettePoint[];
  onFait: (message: string) => void;
  onPlanifie: (message: string) => void;
  onErreur: (err: unknown) => void;
}) {
  const { t, i18n } = useTranslation();
  const [lot, setLot] = useState<Lot>(null);
  const [champId, setChampId] = useState('');
  const [valeur, setValeur] = useState('');
  const [etiquetteId, setEtiquetteId] = useState('');
  const [action, setAction] = useState({ titre: '', datePrevue: '', dateFin: '', responsable: '' });
  const [enCours, setEnCours] = useState(false);
  const champ = champs.find((c) => c.id === champId);

  const executer = async (tache: () => Promise<void>) => {
    setEnCours(true);
    try {
      await tache();
    } catch (err) {
      onErreur(err);
    } finally {
      setEnCours(false);
    }
  };

  const renseigner = () =>
    executer(async () => {
      const r = await api.modifierPointsParLot({ pointIds: ids, attributs: { [champId]: depuisSaisie(valeur) } });
      onFait(t('communal.points.selection.renseignes', { count: r.modifies, champ: champ ? libelleChamp(champ, i18n.language) : '' }));
    });

  const etiqueter = (sens: 'ajouter' | 'retirer') =>
    executer(async () => {
      const r = await api.modifierPointsParLot(
        sens === 'ajouter' ? { pointIds: ids, ajouterEtiquettes: [etiquetteId] } : { pointIds: ids, retirerEtiquettes: [etiquetteId] }
      );
      const nom = etiquettes.find((e) => e.id === etiquetteId)?.nom ?? '';
      onFait(t(`communal.points.selection.${sens === 'ajouter' ? 'etiquetes' : 'desetiquetes'}`, { count: r.modifies, nom }));
    });

  const planifier = () =>
    executer(async () => {
      const a = await api.planifierAction(communeId, {
        titre: action.titre,
        datePrevue: action.datePrevue,
        dateFin: action.dateFin || null,
        responsable: action.responsable || null,
        pointIds: ids,
      });
      onPlanifie(t('communal.points.actions.creee', { count: a.nb_points, titre: a.titre }));
    });

  return (
    <section className="space-y-3 rounded-xl border border-siipi-200 bg-siipi-50 p-3" aria-label={t('communal.points.selection.titre')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-siipi-900">{t('communal.points.selection.n', { count: ids.length })}</span>
        {(['renseigner', 'etiqueter', 'planifier'] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLot((x) => (x === l ? null : l))}
            aria-expanded={lot === l}
            className={lot === l ? boutonPrincipal : bouton}
          >
            {t(`communal.points.selection.${l}`)}
          </button>
        ))}
      </div>

      {lot === 'renseigner' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block text-xs text-ardoise-600">{t('communal.points.selection.choisirChamp')}</span>
            <select
              value={champId}
              onChange={(e) => {
                setChampId(e.target.value);
                setValeur('');
              }}
              className={champSaisie}
            >
              <option value="">—</option>
              {champs.map((c) => (
                <option key={c.id} value={c.id}>
                  {libelleChamp(c, i18n.language)}
                </option>
              ))}
            </select>
          </label>
          {champ && (
            <label className="text-sm">
              <span className="block text-xs text-ardoise-600">{t('communal.points.filtres.valeur')}</span>
              <SaisieValeur champ={champ} valeur={valeur} onChange={setValeur} libelle={t('communal.points.filtres.valeur')} />
            </label>
          )}
          <button type="button" onClick={() => void renseigner()} disabled={!champ || enCours} className={boutonPrincipal}>
            {valeur.trim() === '' ? t('communal.points.selection.effacer') : t('communal.points.selection.appliquer')}
          </button>
          {champs.length === 0 && <p className="text-sm text-ardoise-600">{t('communal.points.selection.sansChamp')}</p>}
        </div>
      )}

      {lot === 'etiqueter' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block text-xs text-ardoise-600">{t('communal.points.selection.choisirEtiquette')}</span>
            <select value={etiquetteId} onChange={(e) => setEtiquetteId(e.target.value)} className={champSaisie}>
              <option value="">—</option>
              {etiquettes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void etiqueter('ajouter')} disabled={!etiquetteId || enCours} className={boutonPrincipal}>
            {t('communal.points.selection.poser')}
          </button>
          <button type="button" onClick={() => void etiqueter('retirer')} disabled={!etiquetteId || enCours} className={bouton}>
            {t('communal.points.selection.oter')}
          </button>
          {etiquettes.length === 0 && <p className="text-sm text-ardoise-600">{t('communal.points.selection.sansEtiquette')}</p>}
        </div>
      )}

      {lot === 'planifier' && (
        <form
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            void planifier();
          }}
        >
          <label className="text-sm sm:col-span-2">
            <span className="block text-xs text-ardoise-600">{t('communal.points.actions.titreAction')}</span>
            <input
              required
              maxLength={200}
              value={action.titre}
              onChange={(e) => setAction((a) => ({ ...a, titre: e.target.value }))}
              placeholder={t('communal.points.actions.exemple')}
              className={`${champSaisie} w-full`}
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-ardoise-600">{t('communal.points.actions.datePrevue')}</span>
            <input
              required
              type="date"
              value={action.datePrevue}
              onChange={(e) => setAction((a) => ({ ...a, datePrevue: e.target.value }))}
              className={`${champSaisie} w-full`}
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-ardoise-600">{t('communal.points.actions.dateFin')}</span>
            <input
              type="date"
              min={action.datePrevue || undefined}
              value={action.dateFin}
              onChange={(e) => setAction((a) => ({ ...a, dateFin: e.target.value }))}
              className={`${champSaisie} w-full`}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="block text-xs text-ardoise-600">{t('communal.points.actions.responsable')}</span>
            <input
              maxLength={200}
              value={action.responsable}
              onChange={(e) => setAction((a) => ({ ...a, responsable: e.target.value }))}
              className={`${champSaisie} w-full`}
            />
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={enCours} className={boutonPrincipal}>
              {t('communal.points.actions.planifier', { count: ids.length })}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
