// Signaler un problème.
//
// Trois champs et un bouton. Chaque champ supplémentaire fait abandonner une
// partie des gens qui avaient commencé — et un signalement abandonné est un
// point noir qui reste.
//
// Le formulaire prévient de ce qui deviendra public AVANT la saisie, pas dans
// des conditions d'utilisation : la photo peut être publiée après vérification
// par la commune, la position est arrondie, le nom n'est jamais publié.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type AdresseCitoyen } from '../lib/api';
import { Erreur } from './Elements';

const CATEGORIES = [
  'point_noir',
  'conteneur_plein',
  'conteneur_deteriore',
  'encombrants',
  'dechets_verts',
  'ddc',
  'autre',
] as const;

export function FormulaireSignalement({ adresse }: { adresse: AdresseCitoyen | null }) {
  const { t } = useTranslation();
  const [categorie, setCategorie] = useState<(typeof CATEGORIES)[number]>('point_noir');
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [numero, setNumero] = useState<string | null>(null);
  // Le signalement qui vient d'être envoyé portait-il une position ? L'écran
  // de confirmation doit le dire : sans position, le signalement part bien à
  // la commune mais n'apparaît pas sur la carte publique, qui n'affiche que
  // des points. Un citoyen qui reçoit un numéro puis ne trouve rien sur la
  // carte en conclut que son signalement s'est perdu — et ne recommence pas.
  const [envoyeAvecPosition, setEnvoyeAvecPosition] = useState(false);

  // La position est demandée à l'ouverture de l'écran : un signalement sans
  // localisation oblige la commune à rappeler le citoyen pour savoir où c'est.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }, []);

  if (!adresse?.commune_id) {
    return (
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        {t('citoyen.signaler.adresseRequise')}
      </p>
    );
  }

  if (numero) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-5xl" aria-hidden>
          ✓
        </p>
        <h1 className="text-lg font-semibold text-ardoise-900">{t('citoyen.signaler.envoye')}</h1>
        {/* Le numéro est l'accusé de réception que la persona réclamait : une
            preuve qu'on peut citer, y compris au guichet. */}
        <p className="chiffres rounded-xl border border-siipi-300 bg-siipi-50 p-4 text-lg font-bold text-siipi-800">
          {numero}
        </p>
        <p className="text-sm text-ardoise-600">
          {envoyeAvecPosition
            ? t('citoyen.signaler.suiteAvecPosition')
            : t('citoyen.signaler.suiteSansPosition')}
        </p>
        <button
          type="button"
          onClick={() => {
            setNumero(null);
            setTitre('');
            setDescription('');
          }}
          className="rounded-lg border border-ardoise-300 bg-white px-4 py-2.5 font-medium text-ardoise-700"
        >
          {t('citoyen.signaler.nouveau')}
        </button>
      </div>
    );
  }

  const envoyer = async (evt: React.FormEvent) => {
    evt.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      const cree = await api.signaler({
        communeId: adresse.commune_id as string,
        category: categorie,
        title: titre,
        description: description || undefined,
        lat: position?.lat,
        lng: position?.lng,
      });
      setEnvoyeAvecPosition(position != null);
      setNumero(cree.ticket_number);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <form onSubmit={envoyer} className="space-y-4">
      <h1 className="text-lg font-semibold text-ardoise-900">{t('citoyen.signaler.titre')}</h1>

      <fieldset>
        <legend className="text-sm font-medium text-ardoise-700">
          {t('citoyen.signaler.categorie')}
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategorie(c)}
              className={`rounded-lg border px-3 py-3 text-sm font-medium ${
                categorie === c
                  ? 'border-siipi-500 bg-siipi-50 text-siipi-800'
                  : 'border-ardoise-300 bg-white text-ardoise-700'
              }`}
            >
              {t(`citoyen.categories.${c}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="text-sm font-medium text-ardoise-700">{t('citoyen.signaler.quoi')}</span>
        <input
          required
          minLength={3}
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder={t('citoyen.signaler.quoiExemple')}
          className="mt-1 w-full rounded-lg border border-ardoise-300 px-3 py-2.5 text-base"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-ardoise-700">
          {t('citoyen.signaler.precisions')}
        </span>
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded-lg border border-ardoise-300 px-3 py-2.5 text-base"
        />
      </label>

      <p className="rounded-xl border border-ardoise-200 bg-ardoise-50 p-3 text-xs text-ardoise-600">
        {position ? t('citoyen.signaler.positionPrise') : t('citoyen.signaler.positionAbsente')}
        <br />
        {t('citoyen.signaler.mentionPublication')}
      </p>

      {erreur && <Erreur message={erreur} />}

      <button
        type="submit"
        disabled={envoi || titre.length < 3}
        className="w-full rounded-lg bg-siipi-600 px-4 py-3.5 font-semibold text-white disabled:opacity-50"
      >
        {envoi ? t('citoyen.signaler.envoiEnCours') : t('citoyen.signaler.envoyer')}
      </button>
    </form>
  );
}
