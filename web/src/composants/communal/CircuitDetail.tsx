// Fiche d'un circuit : modification, arrêts, carte, import, historique.
//
// Tout se modifie ici, par l'administrateur municipal lui-même. C'est la
// condition posée au cahier des charges : aucune saisie en base, aucune
// intervention de développeur après livraison.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Circuit, type EquipeDuJour, type PointCollecte } from '../../lib/api';
import { Chargement, Erreur } from '../Elements';
import { CircuitCarte } from './CircuitCarte';
import { CircuitImport } from './CircuitImport';

const JOURS = [1, 2, 3, 4, 5, 6, 7];
const MODES = ['porte_a_porte', 'conteneurs', 'mixte'] as const;

/** Champs texte : vide à l'écran → null en base, pour qu'effacer efface. */
function texteOuNul(champs: Record<string, string>): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(champs).map(([k, v]) => [k, v.trim() === '' ? null : v.trim()])
  );
}

/** Champs numériques : vide → null, sinon le nombre. */
function nombreOuNul(champs: Record<string, string | number>): Record<string, number | null> {
  return Object.fromEntries(
    Object.entries(champs).map(([k, v]) => {
      if (v === '' || v === null || v === undefined) return [k, null];
      const n = Number(v);
      return [k, Number.isFinite(n) ? n : null];
    })
  );
}

type Onglet = 'fiche' | 'points' | 'carte' | 'historique';

export function CircuitDetail({
  circuit,
  communeId,
  onFerme,
  onModifie,
}: {
  circuit: Circuit;
  communeId: string;
  onFerme: () => void;
  onModifie: () => void;
}) {
  const { t } = useTranslation();
  const [onglet, setOnglet] = useState<Onglet>('fiche');
  const [points, setPoints] = useState<PointCollecte[] | null>(null);
  const [historique, setHistorique] = useState<Awaited<ReturnType<typeof api.historiqueCircuit>> | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState(false);
  const [voyageAffiche, setVoyageAffiche] = useState<number | 'tous'>('tous');
  const [prestataires, setPrestataires] = useState<{ id: string; full_name: string }[]>([]);
  // L'équipe est affichée ici EN LECTURE. Elle se modifie dans Personnel ›
  // Équipes, où l'on voit les quatorze tournées côte à côte : affecter un
  // chauffeur est une décision qui se prend en regardant l'ensemble du
  // service, pas une fiche isolée. La rappeler ici évite seulement d'avoir à
  // changer d'écran pour savoir qui sort avec cet engin.
  const [equipe, setEquipe] = useState<EquipeDuJour | null>(null);
  const [aSupprimer, setASupprimer] = useState(false);

  // Formulaire, initialisé sur la fiche existante.
  const [f, setF] = useState({
    nom: circuit.nom,
    code: circuit.code ?? '',
    description: circuit.description ?? '',
    joursPassage: (circuit.jours_passage ?? []) as number[],
    modeCollecte: (circuit.mode_collecte ?? 'porte_a_porte') as (typeof MODES)[number],
    voyagesParJour: Number(circuit.voyages_par_jour ?? 1),
    dureePrevueMinutes: circuit.duree_prevue_minutes ?? '',
    longueurDeclareeKm: circuit.longueur_declaree_km ?? '',
    tailleEquipe: circuit.taille_equipe ?? '',
    prestataireId: circuit.prestataire_id ?? '',
    dateDebut: String(circuit.date_debut ?? '').slice(0, 10),
    dateFin: circuit.date_fin ? String(circuit.date_fin).slice(0, 10) : '',
    actif: circuit.actif !== false,
    // Fiche d'identité, d'après le relevé d'affectation du matériel. Tout est
    // facultatif : une commune sans ce relevé garde un circuit utilisable.
    secteurCode: circuit.secteur_code ?? '',
    secteurNom: circuit.secteur_nom ?? '',
    poste: (circuit.poste ?? '') as '' | 'jour' | 'nuit' | 'mixte',
    heureDepart: (circuit.heure_depart ?? '').slice(0, 5),
    heureFin: (circuit.heure_fin ?? '').slice(0, 5),
    lieuDechargement: circuit.lieu_dechargement ?? '',
    vehiculeCode: circuit.vehicule_code ?? '',
    vehiculeImmat: circuit.vehicule_immat ?? '',
    enginAppuiCode: circuit.engin_appui_code ?? '',
    enginAppuiImmat: circuit.engin_appui_immat ?? '',
    // Campagne d'observation : des mesures, datées.
    etudeDate: circuit.etude_date ? String(circuit.etude_date).slice(0, 10) : '',
    etudeTempsParcMin: circuit.etude_temps_parc_min ?? '',
    etudeTempsDechargementMin: circuit.etude_temps_dechargement_min ?? '',
    etudeTempsRetourMin: circuit.etude_temps_retour_min ?? '',
    etudeTempsCollecteMin: circuit.etude_temps_collecte_min ?? '',
    etudeDistanceParcKm: circuit.etude_distance_parc_km ?? '',
    etudeDistanceDechargementKm: circuit.etude_distance_dechargement_km ?? '',
    etudeDistanceRetourKm: circuit.etude_distance_retour_km ?? '',
    etudeDistanceCollecteKm: circuit.etude_distance_collecte_km ?? '',
    etudeTonnageT: circuit.etude_tonnage_t ?? '',
    etudeConsommationL: circuit.etude_consommation_l ?? '',
  });

  const chargerPoints = async () => {
    try {
      setPoints(await api.pointsCollecte(circuit.id));
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    void chargerPoints();
    void api.prestataires(communeId).then(setPrestataires).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circuit.id]);

  useEffect(() => {
    void api
      .equipesDuJour(communeId)
      .then((lignes) => setEquipe(lignes.find((l) => l.circuit_id === circuit.id) ?? null))
      // Un circuit inactif ou hors période n'est pas rendu par la fonction :
      // ce n'est pas une erreur, c'est une absence d'équipe ce jour-là.
      .catch(() => setEquipe(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circuit.id, communeId]);

  useEffect(() => {
    if (onglet !== 'historique' || historique) return;
    void api
      .historiqueCircuit(circuit.id)
      .then(setHistorique)
      .catch(() => setHistorique([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onglet]);

  const basculerJour = (j: number) =>
    setF((x) => ({
      ...x,
      joursPassage: x.joursPassage.includes(j)
        ? x.joursPassage.filter((y) => y !== j)
        : [...x.joursPassage, j].sort(),
    }));

  const enregistrer = async (evt: React.FormEvent) => {
    evt.preventDefault();
    setErreur(null);
    try {
      await api.modifierCircuit(circuit.id, {
        nom: f.nom,
        code: f.code || undefined,
        description: f.description || undefined,
        joursPassage: f.joursPassage,
        modeCollecte: f.modeCollecte,
        voyagesParJour: Number(f.voyagesParJour),
        dureePrevueMinutes: f.dureePrevueMinutes === '' ? undefined : Number(f.dureePrevueMinutes),
        longueurDeclareeKm: f.longueurDeclareeKm === '' ? undefined : Number(f.longueurDeclareeKm),
        tailleEquipe: f.tailleEquipe === '' ? undefined : Number(f.tailleEquipe),
        prestataireId: f.prestataireId || null,
        dateDebut: f.dateDebut || undefined,
        dateFin: f.dateFin || null,
        actif: f.actif,
        // Un champ vidé à l'écran doit se vider en base : « undefined » le
        // laisserait intact, et l'utilisateur croirait avoir effacé.
        ...texteOuNul({
          secteurCode: f.secteurCode,
          secteurNom: f.secteurNom,
          poste: f.poste,
          heureDepart: f.heureDepart,
          heureFin: f.heureFin,
          lieuDechargement: f.lieuDechargement,
          vehiculeCode: f.vehiculeCode,
          vehiculeImmat: f.vehiculeImmat,
          enginAppuiCode: f.enginAppuiCode,
          enginAppuiImmat: f.enginAppuiImmat,
          etudeDate: f.etudeDate,
        }),
        ...nombreOuNul({
          etudeTempsParcMin: f.etudeTempsParcMin,
          etudeTempsDechargementMin: f.etudeTempsDechargementMin,
          etudeTempsRetourMin: f.etudeTempsRetourMin,
          etudeTempsCollecteMin: f.etudeTempsCollecteMin,
          etudeDistanceParcKm: f.etudeDistanceParcKm,
          etudeDistanceDechargementKm: f.etudeDistanceDechargementKm,
          etudeDistanceRetourKm: f.etudeDistanceRetourKm,
          etudeDistanceCollecteKm: f.etudeDistanceCollecteKm,
          etudeTonnageT: f.etudeTonnageT,
          etudeConsommationL: f.etudeConsommationL,
        }),
      } as Record<string, unknown>);
      setEnregistre(true);
      setHistorique(null);
      onModifie();
      setTimeout(() => setEnregistre(false), 2500);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  // Suppression LOGIQUE, en deux temps. La route existait depuis le module 2
  // et le client d'API l'appelait déjà — mais aucun écran ne s'en servait :
  // une commune pouvait créer un circuit d'essai et ne plus jamais s'en
  // défaire autrement qu'en base. Le circuit et ses contrôles restent
  // conservés ; il cesse seulement d'être compté et affiché.
  const supprimer = async () => {
    setErreur(null);
    try {
      await api.supprimerCircuit(circuit.id);
      onModifie();
      onFerme();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
      setASupprimer(false);
    }
  };

  const voyages = points ? [...new Set(points.map((p) => p.voyage))].sort((a, b) => a - b) : [];
  // Le tracé arrive en GeoJSON MultiLineString : [ligne][sommet][lng, lat].
  // On l'aplatit en une seule suite de sommets, qui suffit à l'afficher. Le
  // contrat le type en « any » — c'est une géométrie libre — d'où la lecture
  // défensive plutôt qu'un transtypage aveugle.
  const trace: [number, number][] = (() => {
    const g = circuit.trace as { coordinates?: unknown } | null | undefined;
    const c = g?.coordinates;
    if (!Array.isArray(c)) return [];
    return (c as unknown[]).flatMap((ligne) =>
      Array.isArray(ligne)
        ? (ligne as unknown[]).filter(
            (s): s is [number, number] =>
              Array.isArray(s) && s.length >= 2 && typeof s[0] === 'number' && typeof s[1] === 'number'
          )
        : []
    );
  })();

  const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
  const etiquette = 'text-sm font-medium text-ardoise-700';

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onFerme}
            className="text-sm font-medium text-siipi-700 hover:underline"
          >
            ← {t('communal.circuits.retourListe')}
          </button>
          <h1 className="mt-1 text-xl font-semibold text-ardoise-900">{circuit.nom}</h1>
          <p className="text-sm text-ardoise-500">
            {t(`communal.circuits.modes.${circuit.mode_collecte ?? 'porte_a_porte'}`)}
            {' · '}
            {circuit.prestataire_nom ?? t('communal.circuits.regie')}
          </p>
        </div>

        {/* Deux temps : le premier clic demande, le second agit. Un bouton de
            suppression qui agit au premier clic n'a pas sa place à côté d'un
            registre. */}
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => (aSupprimer ? void supprimer() : setASupprimer(true))}
            className={`min-h-11 rounded-lg border px-3 text-sm ${
              aSupprimer
                ? 'border-red-400 bg-red-50 font-medium text-red-900'
                : 'border-ardoise-300 text-ardoise-600'
            }`}
          >
            {aSupprimer
              ? t('communal.circuits.supprimerConfirme')
              : t('communal.circuits.supprimer')}
          </button>
          {aSupprimer && (
            <p className="max-w-xs text-end text-xs text-ardoise-500">
              {t('communal.circuits.supprimerAide')}
            </p>
          )}
        </div>
      </header>

      <nav className="flex flex-wrap gap-1.5 border-b border-ardoise-200">
        {(['fiche', 'points', 'carte', 'historique'] as const).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOnglet(o)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              onglet === o
                ? 'border-siipi-600 text-siipi-700'
                : 'border-transparent text-ardoise-500 hover:text-ardoise-700'
            }`}
          >
            {t(`communal.circuits.onglets.${o}`)}
            {o === 'points' && points && ` (${points.length})`}
          </button>
        ))}
      </nav>

      {erreur && <Erreur message={erreur} />}

      {onglet === 'fiche' && (
        <form onSubmit={enregistrer} className="space-y-4 rounded-xl border border-ardoise-200 bg-white p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={etiquette}>{t('communal.circuits.nom')}</span>
              <input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} className={champ} required minLength={2} />
            </label>

            <label className="block">
              <span className={etiquette}>{t('communal.circuits.code')}</span>
              <input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className={champ} />
            </label>

            <label className="block">
              <span className={etiquette}>{t('communal.circuits.execute')}</span>
              <select value={f.prestataireId} onChange={(e) => setF({ ...f, prestataireId: e.target.value })} className={champ}>
                <option value="">{t('communal.circuits.regie')}</option>
                {prestataires.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={etiquette}>{t('communal.circuits.modeCollecte')}</span>
              <select
                value={f.modeCollecte}
                onChange={(e) => setF({ ...f, modeCollecte: e.target.value as (typeof MODES)[number] })}
                className={champ}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>{t(`communal.circuits.modes.${m}`)}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={etiquette}>{t('communal.circuits.voyages')}</span>
              <input
                type="number" min={1} max={6}
                value={f.voyagesParJour}
                onChange={(e) => setF({ ...f, voyagesParJour: Number(e.target.value) })}
                className={champ}
              />
              <span className="mt-1 block text-xs text-ardoise-500">{t('communal.circuits.voyagesAide')}</span>
            </label>
          </div>

          <div>
            <span className={etiquette}>{t('communal.circuits.jours')}</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {JOURS.map((j) => (
                <button
                  key={j}
                  type="button"
                  onClick={() => basculerJour(j)}
                  className={`min-h-11 min-w-11 rounded-lg px-3 text-sm font-semibold ${
                    f.joursPassage.includes(j)
                      ? 'bg-siipi-600 text-white'
                      : 'border border-ardoise-300 bg-white text-ardoise-600'
                  }`}
                >
                  {t(`citoyen.joursCourts.${j}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Ces trois valeurs viennent du registre communal : ce sont des
              déclarations, pas des mesures. L'écran le dit, pour qu'on ne les
              oppose pas un jour à un relevé GPS comme s'il s'agissait de
              constats. */}
          <fieldset className="rounded-lg border border-ardoise-200 p-3">
            <legend className="px-1 text-sm font-medium text-ardoise-700">
              {t('communal.circuits.declare')}
            </legend>
            <p className="mb-2 text-xs text-ardoise-500">{t('communal.circuits.declareAide')}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-xs text-ardoise-600">{t('communal.circuits.longueur')}</span>
                <input type="number" step="0.01" min="0" value={f.longueurDeclareeKm}
                  onChange={(e) => setF({ ...f, longueurDeclareeKm: e.target.value })} className={champ} />
              </label>
              <label className="block">
                <span className="text-xs text-ardoise-600">{t('communal.circuits.duree')}</span>
                <input type="number" min="0" value={f.dureePrevueMinutes}
                  onChange={(e) => setF({ ...f, dureePrevueMinutes: e.target.value })} className={champ} />
              </label>
              <label className="block">
                <span className="text-xs text-ardoise-600">{t('communal.circuits.equipe')}</span>
                <input type="number" min="1" value={f.tailleEquipe}
                  onChange={(e) => setF({ ...f, tailleEquipe: e.target.value })} className={champ} />
              </label>
            </div>
          </fieldset>


          {/* ----------------------------------------------------------------
              Fiche d'identité — relevé d'affectation du matériel.
              Tous ces champs sont facultatifs. Le secteur mérite une place à
              part : c'est lui qui relie le numéro du registre communal
              (« مسلك عدد 1 ») au nom de quartier que portent les relevés GPS
              (« Cité Gharbi »), et sans ce chaînon personne ne sait quel
              fichier appartient à quel circuit.
              ---------------------------------------------------------------- */}
          <fieldset className="rounded-lg border border-ardoise-200 p-3">
            <legend className="px-1 text-sm font-medium text-ardoise-700">
              {t('communal.circuits.fiche')}
            </legend>
            <p className="mb-2 text-xs text-ardoise-500">{t('communal.circuits.ficheAide')}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block">
                <span className="text-xs text-ardoise-600">{t('communal.circuits.secteurCode')}</span>
                <input value={f.secteurCode} onChange={(e) => setF({ ...f, secteurCode: e.target.value })}
                  placeholder="S01" className={champ} />
              </label>
              <label className="block sm:col-span-1 lg:col-span-2">
                <span className="text-xs text-ardoise-600">{t('communal.circuits.secteurNom')}</span>
                <input value={f.secteurNom} onChange={(e) => setF({ ...f, secteurNom: e.target.value })}
                  placeholder="Cité Gharbi" className={champ} />
              </label>

              <label className="block">
                <span className="text-xs text-ardoise-600">{t('communal.circuits.poste')}</span>
                <select value={f.poste} onChange={(e) => setF({ ...f, poste: e.target.value as typeof f.poste })} className={champ}>
                  <option value="">—</option>
                  {(['jour', 'nuit', 'mixte'] as const).map((p) => (
                    <option key={p} value={p}>{t(`communal.circuits.postes.${p}`)}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-ardoise-600">{t('communal.circuits.heureDepart')}</span>
                <input type="time" value={f.heureDepart} onChange={(e) => setF({ ...f, heureDepart: e.target.value })} className={champ} />
              </label>
              <label className="block">
                <span className="text-xs text-ardoise-600">{t('communal.circuits.heureFin')}</span>
                <input type="time" value={f.heureFin} onChange={(e) => setF({ ...f, heureFin: e.target.value })} className={champ} />
              </label>

              <label className="block lg:col-span-3">
                <span className="text-xs text-ardoise-600">{t('communal.circuits.lieuDechargement')}</span>
                <input value={f.lieuDechargement} onChange={(e) => setF({ ...f, lieuDechargement: e.target.value })}
                  placeholder="Centre de transfert" className={champ} />
              </label>

              <label className="block">
                <span className="text-xs text-ardoise-600">{t('communal.circuits.vehiculeCode')}</span>
                <input value={f.vehiculeCode} onChange={(e) => setF({ ...f, vehiculeCode: e.target.value })}
                  placeholder="BB1" className={champ} />
              </label>
              <label className="block lg:col-span-2">
                <span className="text-xs text-ardoise-600">{t('communal.circuits.vehiculeImmat')}</span>
                <input value={f.vehiculeImmat} onChange={(e) => setF({ ...f, vehiculeImmat: e.target.value })}
                  placeholder="02-220610" className={champ} />
              </label>
              <label className="block">
                <span className="text-xs text-ardoise-600">{t('communal.circuits.enginAppuiCode')}</span>
                <input value={f.enginAppuiCode} onChange={(e) => setF({ ...f, enginAppuiCode: e.target.value })}
                  placeholder="BT1" className={champ} />
              </label>
              <label className="block lg:col-span-2">
                <span className="text-xs text-ardoise-600">{t('communal.circuits.enginAppuiImmat')}</span>
                <input value={f.enginAppuiImmat} onChange={(e) => setF({ ...f, enginAppuiImmat: e.target.value })}
                  placeholder="02-589489" className={champ} />
              </label>
            </div>
            <p className="mt-2 text-xs text-ardoise-500">{t('communal.circuits.enginsAide')}</p>

            {/* Qui sort avec cet engin. En lecture : la modification se fait
                dans Personnel › Équipes. */}
            <div className="mt-3 border-t border-ardoise-200 pt-2">
              <p className="text-xs font-medium text-ardoise-700">
                {t('communal.circuits.equipeAffectee')}
              </p>
              {!equipe || equipe.membres.length === 0 ? (
                <p className="mt-1 text-xs text-red-800">
                  {t('communal.circuits.equipeAucune')}
                </p>
              ) : (
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {equipe.membres.map((m) => (
                    <li
                      key={m.affectation_id}
                      className="rounded-full bg-ardoise-100 px-2 py-0.5 text-xs text-ardoise-700"
                    >
                      {m.nom_complet} ·{' '}
                      {t(`communal.personnel.roles.${m.role}`, { defaultValue: m.role })}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-ardoise-500">{t('communal.circuits.equipeOu')}</p>
            </div>
          </fieldset>

          {/* ----------------------------------------------------------------
              Campagne d'observation. Séparée du reste, et datée, parce que ce
              sont des MESURES faites un jour donné — pas des propriétés du
              circuit. Les ranger à côté du nom laisserait croire qu'un circuit
              « fait » 19,3 km, alors qu'il en a fait 19,3 ce jour-là.
              ---------------------------------------------------------------- */}
          <fieldset className="rounded-lg border border-ardoise-200 p-3">
            <legend className="px-1 text-sm font-medium text-ardoise-700">
              {t('communal.circuits.etude')}
            </legend>
            <p className="mb-2 text-xs text-ardoise-500">{t('communal.circuits.etudeAide')}</p>
            <label className="mb-3 block max-w-xs">
              <span className="text-xs text-ardoise-600">{t('communal.circuits.etudeDate')}</span>
              <input type="date" value={f.etudeDate} onChange={(e) => setF({ ...f, etudeDate: e.target.value })} className={champ} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ['etudeTempsParcMin', 'tempsParc', 1],
                  ['etudeTempsDechargementMin', 'tempsDechargement', 1],
                  ['etudeTempsRetourMin', 'tempsRetour', 1],
                  ['etudeTempsCollecteMin', 'tempsCollecte', 1],
                  ['etudeDistanceParcKm', 'distanceParc', 0.01],
                  ['etudeDistanceDechargementKm', 'distanceDechargement', 0.01],
                  ['etudeDistanceRetourKm', 'distanceRetour', 0.01],
                  ['etudeDistanceCollecteKm', 'distanceCollecte', 0.01],
                  ['etudeTonnageT', 'tonnage', 0.01],
                  ['etudeConsommationL', 'consommation', 0.01],
                ] as const
              ).map(([cle, libelle, pas]) => (
                <label key={cle} className="block">
                  <span className="text-xs text-ardoise-600">{t(`communal.circuits.mesures.${libelle}`)}</span>
                  <input
                    type="number"
                    min="0"
                    step={pas}
                    value={(f as Record<string, unknown>)[cle] as string | number}
                    onChange={(e) => setF({ ...f, [cle]: e.target.value })}
                    className={champ}
                  />
                </label>
              ))}
            </div>
            {/* Le rapprochement qui saute aux yeux quand on a les deux : la
                commune déclare une longueur, la campagne en a mesuré une
                autre. On l'affiche sans trancher — l'arbitrage appartient à la
                commune, pas à la plateforme. */}
            {f.longueurDeclareeKm !== '' && f.etudeDistanceCollecteKm !== '' && (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                {t('communal.circuits.ecartMesure', {
                  declaree: f.longueurDeclareeKm,
                  mesuree: f.etudeDistanceCollecteKm,
                })}
              </p>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={etiquette}>{t('communal.circuits.dateDebut')}</span>
              <input type="date" value={f.dateDebut} onChange={(e) => setF({ ...f, dateDebut: e.target.value })} className={champ} />
              <span className="mt-1 block text-xs text-ardoise-500">{t('communal.circuits.dateDebutAide')}</span>
            </label>
            <label className="block">
              <span className={etiquette}>{t('communal.circuits.dateFin')}</span>
              <input type="date" value={f.dateFin} min={f.dateDebut} onChange={(e) => setF({ ...f, dateFin: e.target.value })} className={champ} />
              <span className="mt-1 block text-xs text-ardoise-500">{t('communal.circuits.dateFinAide')}</span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" className="min-h-11 rounded-lg bg-siipi-600 px-5 font-semibold text-white">
              {t('communal.circuits.enregistrer')}
            </button>
            {enregistre && <span className="text-sm font-medium text-siipi-700">{t('communal.circuits.enregistre')}</span>}
          </div>
        </form>
      )}

      {onglet === 'points' && (
        <div className="space-y-4">
          {/* Deux dépôts distincts, parce qu'un circuit a deux choses à
              recevoir et qu'elles arrivent dans des fichiers différents :
              l'itinéraire dessiné d'un côté, les arrêts relevés de l'autre.
              Une zone unique devait deviner, et sa devinette écrasait
              parfois l'itinéraire prévu par le trajet suivi un matin. */}
          <div className="grid gap-4 lg:grid-cols-2">
            <CircuitImport
              circuitId={circuit.id}
              cible="trace"
              dejaPose={{ fichier: circuit.trace_fichier ?? null, le: circuit.trace_importee_le ?? null }}
              nbEnPlace={circuit.trace_source ? 1 : 0}
              onImporte={onModifie}
            />
            <CircuitImport
              circuitId={circuit.id}
              cible="points"
              dejaPose={{ fichier: circuit.points_fichier ?? null, le: circuit.points_importes_le ?? null }}
              nbEnPlace={points?.length ?? 0}
              onImporte={() => {
                void chargerPoints();
                onModifie();
              }}
            />
          </div>
          {!points ? (
            <Chargement />
          ) : points.length === 0 ? (
            <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">
              {t('communal.circuits.carte.aucunPoint')}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="border-b border-ardoise-200 bg-ardoise-50 text-left text-xs uppercase text-ardoise-500">
                  <tr>
                    {voyages.length > 1 && <th className="px-3 py-2">{t('communal.circuits.colonnes.voyage')}</th>}
                    <th className="px-3 py-2">{t('communal.circuits.colonnes.ordre')}</th>
                    <th className="px-3 py-2">{t('communal.circuits.colonnes.nom')}</th>
                    <th className="px-3 py-2">{t('communal.circuits.colonnes.type')}</th>
                    <th className="px-3 py-2">{t('communal.circuits.colonnes.heure')}</th>
                    <th className="px-3 py-2">{t('communal.circuits.colonnes.precision')}</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.id} className="border-b border-ardoise-100 last:border-0">
                      {voyages.length > 1 && <td className="chiffres px-3 py-2 text-ardoise-500">{p.voyage}</td>}
                      <td className="chiffres px-3 py-2 font-medium text-ardoise-900">{p.ordre}</td>
                      <td className="px-3 py-2">{p.nom ?? '—'}</td>
                      <td className="px-3 py-2 text-ardoise-600">
                        {t(`communal.circuits.typesPoint.${p.type}`, { defaultValue: p.type })}
                      </td>
                      <td className="chiffres px-3 py-2">
                        {p.heure_observee ? (
                          <span className="text-ardoise-900">{p.heure_observee.slice(0, 5)}</span>
                        ) : p.heure_estimee ? (
                          // L'estimé se distingue du constaté à l'œil : sans
                          // cela, une heure saisie au bureau finirait par être
                          // opposée à un prestataire comme un relevé.
                          <span className="italic text-ardoise-500">
                            ≈ {p.heure_estimee.slice(0, 5)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="chiffres px-3 py-2 text-xs text-ardoise-500">
                        {p.precision_m != null ? `±${Number(p.precision_m).toFixed(1)} m` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {onglet === 'carte' && (
        <div className="space-y-3">
          {voyages.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {(['tous', ...voyages] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setVoyageAffiche(v as number | 'tous')}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                    voyageAffiche === v
                      ? 'bg-ardoise-900 text-white'
                      : 'border border-ardoise-300 bg-white text-ardoise-700'
                  }`}
                >
                  {v === 'tous' ? t('communal.circuits.tousVoyages') : t('communal.circuits.voyageN', { n: v })}
                </button>
              ))}
            </div>
          )}
          {!points ? <Chargement /> : <CircuitCarte points={points} trace={trace} voyageAffiche={voyageAffiche} />}
        </div>
      )}

      {onglet === 'historique' && (
        <div className="rounded-xl border border-ardoise-200 bg-white">
          {!historique ? (
            <Chargement />
          ) : historique.length === 0 ? (
            <p className="p-6 text-sm text-ardoise-500">{t('communal.circuits.historique.aucun')}</p>
          ) : (
            <ul className="divide-y divide-ardoise-100">
              {historique.map((h, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3 text-sm">
                  <span className="chiffres text-xs text-ardoise-500">
                    {new Date(h.changed_at).toLocaleString()}
                  </span>
                  <span className="font-medium text-ardoise-900">
                    {t(`communal.circuits.historique.${h.operation}`, { defaultValue: h.operation })}
                  </span>
                  {h.changed_fields && h.changed_fields.length > 0 && (
                    <span className="text-ardoise-600">
                      {h.changed_fields
                        .map((c) => t(`communal.circuits.champs.${c}`, { defaultValue: c }))
                        .join(', ')}
                    </span>
                  )}
                  {h.changed_by_role && (
                    <span className="ms-auto text-xs text-ardoise-400">{h.changed_by_role}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
