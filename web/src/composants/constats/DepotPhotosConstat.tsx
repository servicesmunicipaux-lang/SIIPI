// Le dépôt des photos d'un constat de manquement (jalon G, lot G7a), le même pour la
// création d'un constat et pour les photos jointes ensuite.
//
// LA POSITION DE LA PHOTO EST MONTRÉE, JAMAIS GARDÉE. Le service des fichiers retire
// les métadonnées EXIF au dépôt et rend la position que l'appareil avait écrite. Un
// constat n'a pas de position : l'écran la montre seulement, avec sa distance à
// l'établissement quand on la connaît — de quoi vérifier que la photo a été prise sur
// place —, et dit qu'elle n'est pas conservée. Rien n'est enregistré à l'insu de la
// personne qui a pris la photo (loi organique n° 2004-63).
//
// UNE PHOTO DÉPOSÉE QUI N'EST PAS JOINTE EST RETIRÉE DU SERVEUR. Elle part dès qu'on la
// choisit (il faut son identifiant pour la joindre) ; écartée, abandonnée avec le
// formulaire ou le panneau, ou revenue après leur fermeture, elle serait sinon gardée
// sans constat, sans finalité, et montrée par aucun écran — une photo de commerce, de
// passants parfois. Le retrait est logique (le fichier n'est plus lisible) ; une photo
// jointe, elle, ne se retire jamais : la base le refuse.
//
// LE DÉPÔT EN COURS SE DIT AU PARENT : tant qu'une photo part, le constat ne s'enregistre
// pas et le panneau ne se ferme pas, sinon elle arriverait après eux et resterait seule.
//
// Une photo se dépose avec l'usage « constat_assimile » : la base refuse d'en joindre
// une déposée pour un autre usage. Seul le directeur dépose.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, lireFichierLocal } from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { PhotoDeposee } from '../Elements';
import { distanceMetres, PHOTOS_MAX } from './regles';

// Les seuls types qu'une photo de constat peut avoir (ni PDF, ni SVG).
const TYPES_PHOTO = ['image/jpeg', 'image/png', 'image/webp'];

export type PhotoConstatDeposee = { id: string; url: string; position: { lat: number; lng: number } | null };

/** Retire du serveur une photo déposée et non jointe ; « introuvable » vaut déjà retirée. */
async function retirerPhoto(id: string): Promise<void> {
  try {
    await api.retirerFichier(id);
  } catch (err) {
    if (!(err instanceof ErreurApi && err.statut === 404)) throw err;
  }
}

/** Retire les photos déposées qu'aucun constat n'a reçues (abandon d'un formulaire ou d'un panneau). */
export async function retirerPhotosNonJointes(photos: PhotoConstatDeposee[]): Promise<void> {
  await Promise.allSettled(photos.map((p) => retirerPhoto(p.id)));
}

export function DepotPhotosConstat({
  communeId,
  photos,
  onAjout,
  onRetrait,
  onDepotChange,
  dejaJointes = 0,
  positionEtablissement,
  desactive = false,
}: {
  communeId: string;
  /** Les photos déposées, pas encore jointes à un constat. */
  photos: PhotoConstatDeposee[];
  /**
   * Des photos viennent d'être déposées. Le parent les ajoute par une fonction de mise à
   * jour, jamais à un tableau capturé au début du dépôt : un panneau fermé entre-temps
   * ne doit pas se rouvrir à leur retour.
   */
  onAjout: (deposees: PhotoConstatDeposee[]) => void;
  /** Une photo a été retirée du serveur : le parent la sort de sa liste. */
  onRetrait: (id: string) => void;
  onDepotChange?: (enCours: boolean) => void;
  /** Les photos que le constat porte déjà : le plafond de 10 les compte. */
  dejaJointes?: number;
  positionEtablissement?: { lat: number; lng: number } | null;
  desactive?: boolean;
}) {
  const { t } = useTranslation();
  const [depot, setDepot] = useState(false);
  const [retrait, setRetrait] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const place = PHOTOS_MAX - dejaJointes - photos.length;
  // Monté ou non : une photo revenue après le démontage n'a plus de parent pour la joindre.
  const vivant = useRef(true);
  const signalerDepot = useRef(onDepotChange);
  signalerDepot.current = onDepotChange;
  useEffect(() => {
    vivant.current = true;
    return () => {
      vivant.current = false;
      signalerDepot.current?.(false);
    };
  }, []);

  const deposer = async (choisis: File[]) => {
    // Une photo seulement : la base refuse un PDF ou un SVG pour un constat. Le filtre du
    // sélecteur n'est qu'une suggestion au navigateur ; l'écran le dit avant l'envoi.
    const fichiers = choisis.filter((f) => TYPES_PHOTO.includes(f.type));
    setDepot(true);
    onDepotChange?.(true);
    setErreur(fichiers.length < choisis.length ? t('constats.photos.imagesSeulement') : null);
    const deposees: PhotoConstatDeposee[] = [];
    try {
      // Une à une : une photo refusée (trop lourde, d'un type inconnu) nomme la cause,
      // et celles déposées avant elle restent proposées.
      for (const fichier of fichiers.slice(0, Math.max(0, place))) {
        const d = await api.deposerFichier(communeId, { ...(await lireFichierLocal(fichier)), usage: 'constat_assimile' });
        deposees.push({ id: d.id, url: d.url, position: d.positionPhoto });
      }
      if (vivant.current && fichiers.length > place) setErreur(t('constats.photos.plafond', { n: PHOTOS_MAX }));
    } catch (err) {
      if (vivant.current) setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      if (!vivant.current) {
        // Revenues après la fermeture : personne ne les joindra ; elles repartent du serveur.
        void retirerPhotosNonJointes(deposees);
      } else {
        if (deposees.length > 0) onAjout(deposees);
        setDepot(false);
        onDepotChange?.(false);
      }
    }
  };

  const ecarter = async (id: string) => {
    setRetrait(id);
    setErreur(null);
    try {
      await retirerPhoto(id);
      onRetrait(id);
    } catch (err) {
      // Pas retirée : elle reste affichée, avec la raison.
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setRetrait(null);
    }
  };

  return (
    <div className="space-y-2">
      <label
        className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 ${
          depot || desactive || place <= 0 ? 'pointer-events-none opacity-50' : ''
        }`}
      >
        {depot ? t('constats.photos.depot') : t('constats.photos.ajouter', { n: Math.max(0, place) })}
        <input
          type="file"
          accept={TYPES_PHOTO.join(',')}
          multiple
          className="sr-only"
          disabled={depot || desactive || place <= 0}
          onChange={(e) => {
            const fichiers = Array.from(e.target.files ?? []);
            // Remis à vide : rechoisir les mêmes photos après un refus doit relancer le dépôt.
            e.target.value = '';
            if (fichiers.length > 0) void deposer(fichiers);
          }}
        />
      </label>
      <p className="text-xs text-ardoise-500">{t('constats.photos.aide')}</p>
      {erreur && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{erreur}</p>}
      {photos.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {photos.map((p) => {
            const distance = p.position && positionEtablissement ? distanceMetres(p.position, positionEtablissement) : null;
            return (
              <li key={p.id} className="space-y-1 rounded-lg border border-ardoise-200 bg-white p-2">
                <PhotoDeposee chemin={p.url} alt={t('constats.photos.alt')} className="max-h-32 w-auto rounded" />
                <p className="text-xs text-ardoise-600">
                  {p.position === null
                    ? t('constats.photos.sansPosition')
                    : distance !== null
                      ? t('constats.photos.positionDistance', { distance: formaterNombre(distance, 0) })
                      : t('constats.photos.position', {
                          lat: formaterNombre(p.position.lat, 5),
                          lng: formaterNombre(p.position.lng, 5),
                        })}
                </p>
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-xs text-ardoise-700 disabled:opacity-40"
                  disabled={desactive || depot || retrait !== null}
                  onClick={() => void ecarter(p.id)}
                >
                  {retrait === p.id ? t('constats.photos.retraitEnCours') : t('constats.photos.nePasJoindre')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
