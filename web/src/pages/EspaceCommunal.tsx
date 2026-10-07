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
import { CarnetCarburant } from '../composants/communal/CarnetCarburant';
import { Declassement } from '../composants/communal/Declassement';
import { Parc } from '../composants/communal/Parc';
import { Personnel } from '../composants/communal/Personnel';
import { Communication } from '../composants/communal/Communication';
import { Pesees } from '../composants/communal/Pesees';
import { PointsSuggeres } from '../composants/communal/PointsSuggeres';
import { RapportsEtudes } from '../composants/communal/RapportsEtudes';
import { Contacts } from '../composants/communal/Contacts';
import { TableauPoints } from '../composants/communal/TableauPoints';
import { DecoupageCommune } from '../composants/communal/DecoupageCommune';
import { IndicateursCommune } from '../composants/kpi/IndicateursCommune';
import { Registres } from '../composants/registres/Registres';
import { BarreLaterale, type EntreeNavigation } from '../composants/BarreLaterale';

type Onglet = 'constat' | 'carte' | 'decoupage' | 'reclamations' | 'suggestions' | 'preuve' | 'indicateurs' | 'circuits' | 'points' | 'registres' | 'parc' | 'carburant' | 'declassement' | 'personnel' | 'pesees' | 'communication' | 'rapports' | 'contacts' | 'comptes';

// LES CINQ PÔLES, ET CE QUI DÉCIDE DE L'AFFECTATION.
//
// Ce n'est pas la parenté technique qui range un écran, c'est le MOMENT où on
// l'ouvre et l'interlocuteur qu'on a en face. Les pesées vont au terrain parce
// qu'un tonnage se saisit le soir même, rattaché à la tournée qui l'a produit —
// pas au pilotage, où elles ne seraient relues qu'en fin de mois. Le personnel
// va au dépôt parce que c'est le même chef de parc qui répond des agents et des
// engins, au même endroit.
//
// « Administration » n'est pas un sixième pôle métier : c'est le tiroir des
// réglages, posé à part en bas. Forcer « Comptes » dans un pôle métier ferait
// chercher les accès là où personne ne les cherche.
const ENTREES: EntreeNavigation<Onglet>[] = [
  { cle: 'constat',       pole: 'cockpit' },

  { cle: 'carte',         pole: 'terrain' },
  { cle: 'circuits',      pole: 'terrain' },
  { cle: 'points',        pole: 'terrain' },
  { cle: 'pesees',        pole: 'terrain' },
  { cle: 'preuve',        pole: 'terrain' },

  { cle: 'reclamations',  pole: 'citoyens' },
  { cle: 'suggestions',   pole: 'citoyens' },
  { cle: 'communication', pole: 'citoyens' },
  { cle: 'decoupage',     pole: 'citoyens' },

  { cle: 'parc',          pole: 'flotte' },
  { cle: 'carburant',     pole: 'flotte' },
  { cle: 'declassement',  pole: 'flotte' },
  { cle: 'registres',     pole: 'flotte' },
  { cle: 'personnel',     pole: 'flotte' },

  { cle: 'indicateurs',   pole: 'pilotage' },
  { cle: 'rapports',      pole: 'pilotage' },

  { cle: 'contacts',      pole: 'administration' },
  { cle: 'comptes',       pole: 'administration' },
];

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
  const [communes, setCommunes] = useState<{ id: string; name: string; gouvernorat?: string | null; activee?: boolean; est_demo?: boolean }[]>([]);
  const [nomCommune, setNomCommune] = useState<string | null>(null);

  useEffect(() => {
    if (!estFnct) return;
    // Avec la commune de démonstration (jumeau numérique) : la FNCT doit
    // pouvoir ouvrir son portail, que l'annuaire national ne montre pas.
    void api
      .communes(true)
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
  const demonstration = communes.filter((c) => c.est_demo);
  const pilotes = communes.filter((c) => c.activee && !c.est_demo);
  const autres = communes.filter((c) => !c.activee && !c.est_demo);
  const enDemo = communes.some((c) => c.id === communeId && c.est_demo);

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
          {demonstration.length > 0 && (
            <optgroup label={t('communal.demo.groupe')}>
              {demonstration.map((c) => (
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
    // Plus large qu'avant : la carte unifiée du pôle Terrain a besoin de place,
    // et la barre latérale en prend déjà une part sur poste fixe.
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      {selecteur}
      {/* Sur CHAQUE écran du portail de démonstration, et collée en haut :
          une capture d'écran du jumeau ne doit jamais pouvoir passer pour
          les chiffres d'une commune réelle (FEUILLE_DE_ROUTE.md § 6bis). */}
      {enDemo && (
        <div
          role="status"
          className="sticky top-0 z-20 mb-4 rounded-xl border-2 border-amber-400 bg-amber-100 px-4 py-3 text-sm text-amber-950 shadow-sm"
        >
          <p className="font-bold">{t('communal.demo.banniereTitre')}</p>
          <p className="mt-0.5">{t('communal.demo.banniereTexte')}</p>
        </div>
      )}
      <div className="flex gap-4">
        <BarreLaterale
          entrees={ENTREES}
          actif={onglet}
          onChoisir={setOnglet}
          libelle={t('communal.navigation')}
          etiquette={(cle) => t(`communal.onglets.${cle}`)}
        />
        <div className="min-w-0 flex-1">

      {/* La clé force le remontage à chaque changement de commune : sans elle,
          un écran garderait les données de la commune précédente le temps de
          son rechargement, et on lirait Sfax sous le nom de Nabeul. */}
      <div key={communeId}>
        {onglet === 'constat' && <ConstatDuJour communeId={communeId} />}
        {onglet === 'carte' && <CarteCommunale communeId={communeId} />}
        {onglet === 'decoupage' && <DecoupageCommune communeId={communeId} />}
        {onglet === 'reclamations' && <Reclamations communeId={communeId} />}
        {onglet === 'suggestions' && <PointsSuggeres communeId={communeId} />}
        {onglet === 'preuve' && <Preuve communeId={communeId} />}
        {onglet === 'indicateurs' && <IndicateursCommune communeId={communeId} fnct={estFnct} />}
        {onglet === 'circuits' && <Circuits communeId={communeId} />}
        {onglet === 'points' && <TableauPoints communeId={communeId} />}
        {onglet === 'registres' && <Registres communeId={communeId} />}
        {onglet === 'parc' && <Parc communeId={communeId} />}
        {onglet === 'carburant' && <CarnetCarburant communeId={communeId} />}
        {onglet === 'declassement' && <Declassement communeId={communeId} />}
        {onglet === 'personnel' && <Personnel communeId={communeId} />}
        {onglet === 'pesees' && <Pesees communeId={communeId} />}
        {onglet === 'communication' && <Communication communeId={communeId} />}
        {onglet === 'rapports' && <RapportsEtudes communeId={communeId} />}
        {onglet === 'contacts' && <Contacts communeId={communeId} />}
        {onglet === 'comptes' && <Comptes communeId={communeId} />}
        </div>
        </div>
      </div>
    </div>
  );
}
