// Le constat de terrain du jour.
//
// C'est l'écran qui décide du sort de toute la plateforme. Si le directeur de
// la propreté ne le remplit pas chaque matin, la confrontation avec le
// prestataire n'a rien à confronter, l'observatoire national reste vide, et le
// citoyen lit « aucun passage prévu ».
//
// Il est donc construit pour tenir en moins d'une minute : la liste des
// circuits attendus AUJOURD'HUI seulement, trois boutons par ligne, aucune
// saisie obligatoire. Une remarque est possible, jamais exigée — un champ
// obligatoire est ce qui transforme un geste quotidien en corvée abandonnée au
// bout d'une semaine.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  lireFichierLocal,
  type Circuit,
  type ControleTerrain,
  type EtatControle,
  type IncidentPrestataire,
} from '../../lib/api';
import { Chargement, Erreur, PhotoDeposee } from '../Elements';
import { Coherence } from './Coherence';

const ETATS: EtatControle[] = ['fait', 'partiel', 'non_fait'];

const STYLE_ETAT: Record<EtatControle, { actif: string; repos: string }> = {
  fait: { actif: 'bg-siipi-600 text-white', repos: 'text-siipi-700 hover:bg-siipi-50' },
  partiel: { actif: 'bg-amber-500 text-white', repos: 'text-amber-700 hover:bg-amber-50' },
  non_fait: { actif: 'bg-red-600 text-white', repos: 'text-red-700 hover:bg-red-50' },
};

export function ConstatDuJour({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const [circuits, setCircuits] = useState<Circuit[] | null>(null);
  const [controles, setControles] = useState<ControleTerrain[]>([]);
  const [incidents, setIncidents] = useState<IncidentPrestataire[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [remarques, setRemarques] = useState<Record<string, string>>({});
  const [depotPhotoEnCours, setDepotPhotoEnCours] = useState<string | null>(null);

  // Date du jour au format ISO, calculée en heure LOCALE. toISOString() aurait
  // renvoyé la veille pour toute heure avant 01 h 00 à Tunis (UTC+1) : le même
  // piège que celui corrigé côté serveur sur les colonnes DATE.
  const aujourdhui = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  // getDay() rend 0 pour dimanche ; la base compte 1 = lundi … 7 = dimanche.
  const jourSemaine = useMemo(() => new Date().getDay() || 7, []);

  const charger = async () => {
    try {
      const [c, ct, inc] = await Promise.all([
        api.circuits(communeId),
        api.controles(communeId, aujourdhui),
        api.incidents(communeId, 'ouvert').catch(() => []),
      ]);
      setCircuits(c);
      setControles(ct);
      setIncidents(inc);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId]);

  if (erreur) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!circuits) return <Chargement />;

  const attendus = circuits.filter((c) => c.actif && (c.jours_passage ?? []).includes(jourSemaine));
  const controleDuJour = (circuitId: string) =>
    controles.find((ct) => ct.circuit_id === circuitId && ct.date_controle === aujourdhui);
  const etatDe = (circuitId: string) => controleDuJour(circuitId)?.etat as EtatControle | undefined;
  const photoDe = (circuitId: string) => controleDuJour(circuitId)?.photo_url ?? null;

  const enregistrer = async (circuitId: string, etat: EtatControle, photoUrl?: string) => {
    setEnCours(circuitId);
    try {
      await api.enregistrerControle({
        circuitId,
        dateControle: aujourdhui,
        etat,
        remarque: remarques[circuitId] || undefined,
        // Le constat déjà photographié ne perd pas sa photo au passage
        // suivant : sans ce report, changer « partiel » en « fait » plus tard
        // dans la journée effacerait silencieusement la preuve déposée.
        photoUrl: photoUrl ?? photoDe(circuitId) ?? undefined,
      });
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(null);
    }
  };

  const deposerPhoto = async (circuitId: string, etat: EtatControle, fichier: File) => {
    setDepotPhotoEnCours(circuitId);
    try {
      const depose = await api.deposerFichier(communeId, {
        ...(await lireFichierLocal(fichier)),
        usage: 'constat_terrain',
      });
      await enregistrer(circuitId, etat, depose.url);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setDepotPhotoEnCours(null);
    }
  };

  const saisis = attendus.filter((c) => etatDe(c.id)).length;

  return (
    <div className="space-y-6">
      {/* Les écarts entre le registre des circuits et l'inventaire du parc, en
          tête de l'écran ouvert chaque matin : c'est le moment où « ce circuit
          est confié à un engin en panne » sert à quelque chose. Le composant ne
          s'affiche pas quand il n'y a rien à dire. */}
      <Coherence communeId={communeId} />

      <header>
        <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.constat.titre')}</h1>
        <p className="mt-1 text-sm text-ardoise-500">
          {t('communal.constat.avancement', { saisis, total: attendus.length })}
        </p>
      </header>

      {attendus.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">
          {circuits.length === 0
            ? t('communal.constat.aucunCircuit')
            : t('communal.constat.aucunAujourdhui')}
        </p>
      ) : (
        <ul className="space-y-2">
          {attendus.map((c) => {
            const etat = etatDe(c.id);
            return (
              <li
                key={c.id}
                className={`rounded-xl border p-4 ${
                  etat ? 'border-ardoise-200 bg-white' : 'border-ardoise-300 bg-ardoise-50'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ardoise-900">{c.nom}</p>
                    <p className="text-xs text-ardoise-500">
                      {c.prestataire_nom ?? t('communal.constat.regie')}
                      {c.zone_nom ? ` · ${c.zone_nom}` : ''}
                    </p>
                  </div>
                  <div
                    className="flex shrink-0 overflow-hidden rounded-lg border border-ardoise-300 bg-white"
                    role="group"
                    aria-label={c.nom}
                  >
                    {ETATS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        disabled={enCours === c.id}
                        onClick={() => void enregistrer(c.id, e)}
                        aria-pressed={etat === e}
                        className={`min-h-11 border-ardoise-300 px-3 text-sm font-medium not-first:border-s ${
                          etat === e ? STYLE_ETAT[e].actif : STYLE_ETAT[e].repos
                        }`}
                      >
                        {t(`communal.etats.${e}`)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* La remarque n'apparaît qu'une fois l'état posé : elle
                    explique un constat, elle ne le remplace pas. */}
                {etat && etat !== 'fait' && (
                  <input
                    value={remarques[c.id] ?? ''}
                    onChange={(evt) => setRemarques((r) => ({ ...r, [c.id]: evt.target.value }))}
                    onBlur={() => remarques[c.id] && void enregistrer(c.id, etat)}
                    placeholder={t('communal.constat.remarque')}
                    className="mt-3 w-full rounded-lg border border-ardoise-300 px-3 py-2 text-sm"
                  />
                )}

                {/* La photo, comme la remarque, n'a de sens qu'une fois l'état
                    posé — sans quoi elle documenterait un constat qui n'existe
                    pas encore. */}
                {etat && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label
                      className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 ${
                        depotPhotoEnCours === c.id ? 'opacity-50' : ''
                      }`}
                    >
                      {depotPhotoEnCours === c.id
                        ? t('communal.constat.depotPhotoEnCours')
                        : photoDe(c.id)
                          ? t('communal.constat.remplacerPhoto')
                          : t('communal.constat.ajouterPhoto')}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        className="sr-only"
                        disabled={depotPhotoEnCours !== null}
                        onChange={(evt) => {
                          const f = evt.target.files?.[0];
                          evt.target.value = '';
                          if (f) void deposerPhoto(c.id, etat, f);
                        }}
                      />
                    </label>
                    {photoDe(c.id) && (
                      <PhotoDeposee chemin={photoDe(c.id)} alt={t('communal.constat.photo')} className="max-h-24 w-auto rounded-lg border border-ardoise-200" />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Les incidents du prestataire, à côté du constat et non ailleurs : un
          « non fait » expliqué par un accès bloqué n'est pas un manquement, et
          les deux informations doivent se lire ensemble. */}
      {incidents.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ardoise-700">
            {t('communal.constat.incidents')}
          </h2>
          {incidents.map((i) => (
            <article key={i.id} className="rounded-xl border border-amber-300 bg-amber-50 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-amber-900">
                  {t(`communal.typesIncident.${i.type}`, { defaultValue: i.type })}
                  {i.circuit_nom ? ` — ${i.circuit_nom}` : ''}
                </p>
                <span className="text-xs text-amber-800">{i.date_incident}</span>
              </div>
              {i.description && <p className="mt-1 text-sm text-amber-900">{i.description}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void api.repondreIncident(i.id, 'pris_en_compte').then(charger)}
                  className="min-h-11 rounded-lg border border-amber-400 bg-white px-3 text-sm font-medium text-amber-900"
                >
                  {t('communal.constat.prendreEnCompte')}
                </button>
                <button
                  type="button"
                  onClick={() => void api.repondreIncident(i.id, 'clos').then(charger)}
                  className="min-h-11 rounded-lg border border-amber-400 bg-white px-3 text-sm font-medium text-amber-900"
                >
                  {t('communal.constat.clore')}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
