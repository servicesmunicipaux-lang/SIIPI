// File des réclamations citoyennes.
//
// Deux principes tenus ici :
//
//   1. l'écran s'ouvre sur ce qui n'a pas encore été regardé. Une file triée
//      par date descendante enterre les vieux dossiers sous les nouveaux, et
//      ce sont justement les vieux qui font les articles de presse.
//
//   2. le nom et le téléphone du citoyen sont affichés, parce que la commune
//      doit pouvoir rappeler — mais chaque consultation de cette liste est
//      journalisée côté serveur (décret-loi 2022-54). Ce n'est pas au
//      front-end d'en décider : il ne fait qu'afficher ce que l'API a déjà
//      tracé.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, lireFichierLocal, type Reclamation } from '../../lib/api';
import { Chargement, Erreur, PhotoDeposee } from '../Elements';

const STYLE_STATUT: Record<string, string> = {
  recu: 'bg-red-100 text-red-900',
  assigne: 'bg-amber-100 text-amber-900',
  en_cours: 'bg-sky-100 text-sky-900',
  resolu: 'bg-siipi-100 text-siipi-800',
  rejete: 'bg-ardoise-200 text-ardoise-700',
};

// Ancienneté en jours, calculée sur la date de dépôt : c'est le chiffre qui
// fait agir, bien plus qu'une date d'il y a trois semaines.
function anciennete(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function Reclamations({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const [reclamations, setReclamations] = useState<Reclamation[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<string>('ouvertes');
  const [motifRefus, setMotifRefus] = useState<Record<string, string>>({});
  const [depotEnCours, setDepotEnCours] = useState<string | null>(null);
  const [renvoiEnCours, setRenvoiEnCours] = useState<string | null>(null);

  const charger = async () => {
    try {
      setReclamations(await api.reclamations(communeId));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId]);

  const affichees = useMemo(() => {
    const liste = reclamations ?? [];
    const filtrees =
      filtre === 'tous'
        ? liste
        : filtre === 'ouvertes'
          ? liste.filter((r) => r.status !== 'resolu' && r.status !== 'rejete')
          : liste.filter((r) => r.status === filtre);
    // La plus ancienne non traitée en tête : c'est elle qui coûte le plus cher.
    return [...filtrees].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [reclamations, filtre]);

  if (erreur) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!reclamations) return <Chargement />;

  // RÉSOUDRE AVEC LA PREUVE, EN UN SEUL GESTE.
  //
  // Le cahier des charges (B5.1.3) demande que l'administrateur dépose une
  // photo « après traitement » ET passe le statut à « traitée ». Deux boutons
  // séparés produiraient immanquablement des réclamations closes sans preuve :
  // le second geste, celui qui ne bloque rien, est toujours celui qu'on oublie.
  //
  // La photo est déposée d'abord, la réclamation close ensuite. Si le dépôt
  // échoue, rien n'est clos — mieux vaut une réclamation encore ouverte qu'une
  // réclamation close dont la preuve manque.
  const resoudreAvecPreuve = async (id: string, fichier: File) => {
    setDepotEnCours(id);
    setErreur(null);
    try {
      const depose = await api.deposerFichier(communeId, {
        ...(await lireFichierLocal(fichier)),
        usage: 'preuve_traitement',
      });
      // C'est l'API qui ouvre ensuite la photo au citoyen concerné : elle
      // seule sait à quelle réclamation elle se rattache, donc à qui l'ouvrir.
      await api.traiterReclamation(id, 'resolu', depose.url);
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setDepotEnCours(null);
    }
  };

  const agir = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  // Une seule tentative automatique (M6) : un échec n'est jamais réessayé en
  // silence, mais un agent peut relancer explicitement — voir
  // services/notifications.ts côté API.
  const renvoyerNotification = async (id: string) => {
    setRenvoiEnCours(id);
    try {
      await agir(() => api.renvoyerNotificationTicket(id));
    } finally {
      setRenvoiEnCours(null);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ardoise-900">
          {t('communal.reclamations.titre')}
        </h1>
        <p className="mt-1 text-sm text-ardoise-500">
          {t('communal.reclamations.enAttente', {
            nombre: reclamations.filter((r) => r.status === 'recu').length,
          })}
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {['ouvertes', 'recu', 'en_cours', 'resolu', 'tous'].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltre(f)}
            className={`min-h-11 rounded-full px-3 text-sm font-medium ${
              filtre === f
                ? 'bg-ardoise-900 text-white'
                : 'border border-ardoise-300 bg-white text-ardoise-700'
            }`}
          >
            {t(`communal.filtresReclamation.${f}`)}
          </button>
        ))}
      </div>

      {affichees.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">
          {t('communal.reclamations.aucune')}
        </p>
      ) : (
        <ul className="space-y-2">
          {affichees.map((r) => {
            const jours = anciennete(r.created_at);
            return (
              <li key={r.id} className="rounded-xl border border-ardoise-200 bg-white p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-ardoise-900">{r.title}</p>
                    <p className="text-xs text-ardoise-500">
                      <span className="chiffres">{r.ticket_number}</span> ·{' '}
                      {t(`citoyen.categories.${r.category}`, { defaultValue: r.category })}
                      {r.location_name ? ` · ${r.location_name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* L'ancienneté est signalée dès qu'elle devient un
                        problème, pas quand elle devient un scandale. */}
                    <span
                      className={`chiffres text-xs font-medium ${
                        jours >= 7 && r.status !== 'resolu' && r.status !== 'rejete'
                          ? 'text-red-700'
                          : 'text-ardoise-500'
                      }`}
                    >
                      {t('communal.reclamations.depuis', { jours })}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        STYLE_STATUT[r.status] ?? ''
                      }`}
                    >
                      {t(`citoyen.statuts.${r.status}`)}
                    </span>
                  </div>
                </div>

                {r.description && <p className="mt-2 text-sm text-ardoise-600">{r.description}</p>}

                {/* La photo du signalement, et celle d'après traitement quand
                    elle existe. Côte à côte : c'est l'avant/après qui dit si
                    le dossier est réellement clos. */}
                {(r.photo_url || r.resolved_photo_url) && (
                  <div className="mt-2 flex flex-wrap gap-3">
                    {r.photo_url && (
                      <figure>
                        <figcaption className="text-xs text-ardoise-500">
                          {t('communal.reclamations.photoSignalement')}
                        </figcaption>
                        <PhotoDeposee
                          chemin={r.photo_url}
                          alt={t('communal.reclamations.photoSignalement')}
                        />
                      </figure>
                    )}
                    {r.resolved_photo_url && (
                      <figure>
                        <figcaption className="text-xs text-ardoise-500">
                          {t('communal.reclamations.photoApres')}
                        </figcaption>
                        <PhotoDeposee
                          chemin={r.resolved_photo_url}
                          alt={t('communal.reclamations.photoApres')}
                        />
                      </figure>
                    )}
                  </div>
                )}
                {(r.citizen_name || r.citizen_phone) && (
                  <p className="mt-1 text-sm text-ardoise-600">
                    {r.citizen_name}
                    {r.citizen_phone && (
                      <a href={`tel:${r.citizen_phone}`} className="ms-2 text-siipi-700 underline">
                        {r.citizen_phone}
                      </a>
                    )}
                  </p>
                )}

                {/* Une seule tentative automatique : un échec reste visible et
                    relançable tant qu'il n'a pas réussi, plutôt que de se
                    perdre silencieusement dans le journal. */}
                {r.notification_statut === 'echec' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2">
                    <span className="text-sm text-red-900">
                      {t('communal.reclamations.notificationEchec')}
                    </span>
                    <button
                      type="button"
                      onClick={() => void renvoyerNotification(r.id)}
                      disabled={renvoiEnCours === r.id}
                      className="min-h-9 rounded-lg border border-red-300 bg-white px-3 text-sm font-medium text-red-800 disabled:opacity-50"
                    >
                      {renvoiEnCours === r.id
                        ? t('communal.reclamations.renvoiEnCours')
                        : t('communal.reclamations.renvoyerNotification')}
                    </button>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {r.status === 'recu' && (
                    <button
                      type="button"
                      onClick={() => void agir(() => api.accepterReclamation(r.id))}
                      className="min-h-11 rounded-lg bg-siipi-600 px-3 text-sm font-semibold text-white"
                    >
                      {t('communal.reclamations.accepter')}
                    </button>
                  )}
                  {(r.status === 'assigne' || r.status === 'en_cours' || r.status === 'recu') && (
                    <>
                      {/* Le chemin normal : une preuve, et la clôture avec.
                          Un « input file » habillé en bouton — il déclenche le
                          sélecteur de fichiers, et sur un téléphone l'appareil
                          photo directement. */}
                      <label
                        className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-siipi-600 px-3 text-sm font-semibold text-white ${
                          depotEnCours === r.id ? 'opacity-50' : ''
                        }`}
                      >
                        {depotEnCours === r.id
                          ? t('communal.reclamations.depotEnCours')
                          : t('communal.reclamations.resoudreAvecPreuve')}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          capture="environment"
                          className="sr-only"
                          disabled={depotEnCours !== null}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            // Le champ est remis à zéro : sans cela, rechoisir
                            // le même fichier après un échec ne déclencherait
                            // aucun événement, et l'écran paraîtrait figé.
                            e.target.value = '';
                            if (f) void resoudreAvecPreuve(r.id, f);
                          }}
                        />
                      </label>
                      {/* Sans preuve : possible, mais au second rang. Il y a
                          des traitements qui ne se photographient pas. */}
                      <button
                        type="button"
                        onClick={() => void agir(() => api.traiterReclamation(r.id, 'resolu'))}
                        disabled={depotEnCours !== null}
                        className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-600"
                      >
                        {t('communal.reclamations.resoudreSansPreuve')}
                      </button>
                    </>
                  )}
                  {r.photo_url && (
                    // La publication de la photo est un acte de la commune :
                    // elle vérifie qu'on n'y voit ni visage ni plaque.
                    <button
                      type="button"
                      onClick={() => void agir(() => api.publierPhoto(r.id, !r.photo_publique))}
                      className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700"
                    >
                      {r.photo_publique
                        ? t('communal.reclamations.depublierPhoto')
                        : t('communal.reclamations.publierPhoto')}
                    </button>
                  )}
                  {r.status === 'recu' && (
                    <span className="flex min-w-48 flex-1 gap-2">
                      <input
                        value={motifRefus[r.id] ?? ''}
                        onChange={(e) => setMotifRefus((m) => ({ ...m, [r.id]: e.target.value }))}
                        placeholder={t('communal.reclamations.motifRefus')}
                        className="min-h-11 w-full rounded-lg border border-ardoise-300 px-3 text-sm"
                      />
                      <button
                        type="button"
                        disabled={(motifRefus[r.id] ?? '').length < 3}
                        onClick={() =>
                          void agir(() => api.refuserReclamation(r.id, motifRefus[r.id]))
                        }
                        className="min-h-11 shrink-0 rounded-lg border border-red-300 bg-white px-3 text-sm font-medium text-red-800 disabled:opacity-40"
                      >
                        {t('communal.reclamations.refuser')}
                      </button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
