// Proposer un point de collecte manquant (TDR M3.1).
//
// Géolocalisation obligatoire — sans elle, la commune ne sait pas où
// regarder — et photo facultative. Le formulaire ne montre jamais si le point
// existe déjà : c'est à la commune de le constater à la validation, avec la
// distance au point le plus proche que l'API calcule pour elle.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, lireFichierLocal, type AdresseCitoyen, type PointSuggere } from '../lib/api';
import { Erreur } from './Elements';

export function ProposerPoint({ adresse }: { adresse: AdresseCitoyen | null }) {
  const { t } = useTranslation();
  const [nom, setNom] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [position, setPosition] = useState<{ lat: number; lng: number; precisionM?: number } | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [depotEnCours, setDepotEnCours] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmee, setConfirmee] = useState<PointSuggere | null>(null);
  const [mesPropositions, setMesPropositions] = useState<PointSuggere[]>([]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precisionM: pos.coords.accuracy,
        }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }, []);

  useEffect(() => {
    void api
      .mesPointsSuggeres()
      .then(setMesPropositions)
      .catch(() => setMesPropositions([]));
  }, [confirmee]);

  if (!adresse?.commune_id) {
    return (
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        {t('citoyen.proposerPoint.adresseRequise')}
      </p>
    );
  }

  const deposerPhoto = async (fichier: File) => {
    setDepotEnCours(true);
    setErreur(null);
    try {
      const depose = await api.deposerFichier(adresse.commune_id as string, {
        ...(await lireFichierLocal(fichier)),
        usage: 'suggestion_point',
      });
      setPhotoUrl(depose.url);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setDepotEnCours(false);
    }
  };

  if (confirmee) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-5xl" aria-hidden>
          ✓
        </p>
        <h1 className="text-lg font-semibold text-ardoise-900">{t('citoyen.proposerPoint.envoyee')}</h1>
        <p className="text-sm text-ardoise-600">{t('citoyen.proposerPoint.suite')}</p>
        <button
          type="button"
          onClick={() => {
            setConfirmee(null);
            setNom('');
            setCommentaire('');
            setPhotoUrl(null);
          }}
          className="rounded-lg border border-ardoise-300 bg-white px-4 py-2.5 font-medium text-ardoise-700"
        >
          {t('citoyen.proposerPoint.nouvelle')}
        </button>

        {mesPropositions.length > 0 && (
          <MesPropositions propositions={mesPropositions} />
        )}
      </div>
    );
  }

  const envoyer = async (evt: React.FormEvent) => {
    evt.preventDefault();
    if (!position) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const cree = await api.proposerPoint({
        communeId: adresse.commune_id as string,
        nom: nom || undefined,
        commentaire: commentaire || undefined,
        lat: position.lat,
        lng: position.lng,
        precisionM: position.precisionM,
        photoUrl: photoUrl ?? undefined,
      });
      setConfirmee(cree);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={envoyer} className="space-y-4">
        <h1 className="text-lg font-semibold text-ardoise-900">{t('citoyen.proposerPoint.titre')}</h1>
        <p className="text-sm text-ardoise-600">{t('citoyen.proposerPoint.explication')}</p>

        <label className="block">
          <span className="text-sm font-medium text-ardoise-700">{t('citoyen.proposerPoint.nom')}</span>
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder={t('citoyen.proposerPoint.nomExemple')}
            className="mt-1 w-full rounded-lg border border-ardoise-300 px-3 py-2.5 text-base"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ardoise-700">
            {t('citoyen.proposerPoint.commentaire')}
          </span>
          <textarea
            rows={3}
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ardoise-300 px-3 py-2.5 text-base"
          />
        </label>

        <p className="rounded-xl border border-ardoise-200 bg-ardoise-50 p-3 text-xs text-ardoise-600">
          {position ? t('citoyen.proposerPoint.positionPrise') : t('citoyen.proposerPoint.positionAbsente')}
        </p>

        <div>
          {photoUrl ? (
            <p className="text-sm text-siipi-700">{t('citoyen.proposerPoint.photoAjoutee')}</p>
          ) : (
            <label
              className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 ${
                depotEnCours ? 'opacity-50' : ''
              }`}
            >
              {depotEnCours ? t('citoyen.proposerPoint.depotEnCours') : t('citoyen.proposerPoint.ajouterPhoto')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="sr-only"
                disabled={depotEnCours}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void deposerPhoto(f);
                }}
              />
            </label>
          )}
        </div>

        {erreur && <Erreur message={erreur} />}

        <button
          type="submit"
          disabled={envoi || !position || depotEnCours}
          className="w-full rounded-lg bg-siipi-600 px-4 py-3.5 font-semibold text-white disabled:opacity-50"
        >
          {envoi ? t('citoyen.proposerPoint.envoiEnCours') : t('citoyen.proposerPoint.envoyer')}
        </button>
      </form>

      {mesPropositions.length > 0 && <MesPropositions propositions={mesPropositions} />}
    </div>
  );
}

/** Ce que le citoyen a déjà proposé, et ce que c'est devenu. */
function MesPropositions({ propositions }: { propositions: PointSuggere[] }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-2 text-start">
      <h2 className="text-sm font-semibold text-ardoise-700">{t('citoyen.proposerPoint.mesPropositions')}</h2>
      <ul className="space-y-2">
        {propositions.map((p) => (
          <li key={p.id} className="rounded-xl border border-ardoise-200 bg-white p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-medium text-ardoise-900">
                {p.nom || t('citoyen.proposerPoint.sansNom')}
              </p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  p.statut === 'en_attente'
                    ? 'bg-amber-100 text-amber-900'
                    : p.statut === 'valide'
                      ? 'bg-siipi-100 text-siipi-800'
                      : 'bg-ardoise-200 text-ardoise-700'
                }`}
              >
                {t(`citoyen.proposerPoint.statuts.${p.statut}`)}
              </span>
            </div>
            {p.statut === 'refuse' && p.motif_refus && (
              <p className="mt-1 text-sm text-ardoise-600">{p.motif_refus}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
