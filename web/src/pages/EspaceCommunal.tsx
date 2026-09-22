// Espace du directeur de la propreté.
//
// L'ordre des onglets est celui de sa journée : le constat du matin d'abord,
// les réclamations ensuite, la preuve quand il doit rendre des comptes, les
// circuits seulement quand l'organisation change, les comptes en dernier —
// on n'ouvre pas des accès tous les jours.
//
// LA COMMUNE AFFICHÉE. Pour un agent communal, c'est la sienne, et la question
// ne se pose pas. Pour la FNCT, elle se choisit : l'administrateur national a
// accès aux 350 communes, et la base le lui accordait déjà — c'est cet écran
// qui l'en empêchait, en ne lisant que la commune de rattachement du compte.
// Créer un compte par commune pour contourner cela aurait été une réponse à
// une question qui ne se posait pas, et ingérable à 350.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { ConstatDuJour } from '../composants/communal/ConstatDuJour';
import { Reclamations } from '../composants/communal/Reclamations';
import { Preuve } from '../composants/communal/Preuve';
import { Circuits } from '../composants/communal/Circuits';
import { CarteCommunale } from '../composants/communal/CarteCommunale';
import { Comptes } from '../composants/communal/Comptes';
import { Parc } from '../composants/communal/Parc';
import { Personnel } from '../composants/communal/Personnel';
import { Communication } from '../composants/communal/Communication';
import { Pesees } from '../composants/communal/Pesees';
import { NavigationOnglets } from '../composants/NavigationOnglets';

type Onglet = 'constat' | 'carte' | 'reclamations' | 'preuve' | 'circuits' | 'parc' | 'personnel' | 'pesees' | 'communication' | 'comptes';

const ONGLETS: Onglet[] = ['constat', 'carte', 'reclamations', 'preuve', 'circuits', 'parc', 'personnel', 'pesees', 'communication', 'comptes'];

export function EspaceCommunal({
  /** Commune imposée par l'appelant — l'annuaire national, qui vient de la
      désigner. Absente pour un agent communal, qui n'en a qu'une. */
  communeImposee,
  onChangerCommune,
}: {
  communeImposee?: string | null;
  onChangerCommune?: (communeId: string) => void;
} = {}) {
  const { t } = useTranslation();
  const { utilisateur } = useAuth();
  const [onglet, setOnglet] = useState<Onglet>('constat');

  const estFnct = utilisateur?.role === 'super_admin_fnct';
  const [communes, setCommunes] = useState<{ id: string; name: string; gouvernorat?: string | null; activee?: boolean }[]>([]);
  const [nomCommune, setNomCommune] = useState<string | null>(null);

  useEffect(() => {
    if (!estFnct) return;
    void api
      .communes()
      .then((liste) => setCommunes(liste as typeof communes))
      .catch(() => setCommunes([]));
  }, [estFnct]);

  const communeId = estFnct ? (communeImposee ?? null) : (utilisateur?.communeId ?? null);

  // Le nom de la commune ouverte, affiché en tête : sans lui, rien à l'écran
  // ne dit dans quelle commune on travaille, et l'on finit par saisir un
  // constat dans la mauvaise.
  useEffect(() => {
    // La liste des communes est déjà chargée pour le sélecteur : on y prend le
    // nom plutôt que d'ajouter un appel. Tant qu'elle arrive, le bandeau reste
    // sans nom — un instant, et jamais un nom faux.
    setNomCommune(communes.find((c) => c.id === communeId)?.name ?? null);
  }, [communeId, communes]);

  // Les communes pilotes d'abord : ce sont celles sur lesquelles on travaille,
  // et les faire chercher dans une liste de 350 n'a pas de sens.
  const pilotes = communes.filter((c) => c.activee);
  const autres = communes.filter((c) => !c.activee);

  const selecteur = estFnct && (
    <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-siipi-200 bg-siipi-50 p-3">
      <label className="min-w-64 flex-1">
        <span className="text-sm font-medium text-ardoise-700">
          {t('communal.choisirCommune')}
          {nomCommune && <span className="ms-2 font-semibold text-siipi-800">{nomCommune}</span>}
        </span>
        <select
          value={communeId ?? ''}
          onChange={(e) => e.target.value && onChangerCommune?.(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base"
        >
          <option value="">{t('communal.aucuneCommune')}</option>
          {pilotes.length > 0 && (
            <optgroup label={t('communal.communesPilotes')}>
              {pilotes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </optgroup>
          )}
          {autres.length > 0 && (
            <optgroup label={t('communal.autresCommunes')}>
              {autres.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.gouvernorat ? ` — ${c.gouvernorat}` : ''}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <p className="text-xs text-ardoise-600">{t('communal.choisirCommuneAide')}</p>
    </div>
  );

  if (!communeId) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
        {selecteur}
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          {estFnct ? t('communal.choisirPourCommencer') : t('communal.sansCommune')}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      {selecteur}
      <NavigationOnglets
        onglets={ONGLETS}
        actif={onglet}
        onChoisir={setOnglet}
        libelle={t('communal.navigation')}
        etiquette={(cle) => t(`communal.onglets.${cle}`)}
      />

      {/* La clé force le remontage à chaque changement de commune : sans elle,
          un écran garderait les données de la commune précédente le temps de
          son rechargement, et on lirait Sfax sous le nom de Nabeul. */}
      <div key={communeId}>
        {onglet === 'constat' && <ConstatDuJour communeId={communeId} />}
        {onglet === 'carte' && <CarteCommunale communeId={communeId} />}
        {onglet === 'reclamations' && <Reclamations communeId={communeId} />}
        {onglet === 'preuve' && <Preuve communeId={communeId} />}
        {onglet === 'circuits' && <Circuits communeId={communeId} />}
        {onglet === 'parc' && <Parc communeId={communeId} />}
        {onglet === 'personnel' && <Personnel communeId={communeId} />}
        {onglet === 'pesees' && <Pesees communeId={communeId} />}
        {onglet === 'communication' && <Communication communeId={communeId} />}
        {onglet === 'comptes' && <Comptes communeId={communeId} />}
      </div>
    </div>
  );
}
