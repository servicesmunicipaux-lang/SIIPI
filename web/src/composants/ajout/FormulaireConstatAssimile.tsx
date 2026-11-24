// Un constat de manquement d'un établissement (jalon G, lot G7a). Le même formulaire
// pour le catalogue « + Ajouter », l'écran « Manquements » et la fiche d'un
// établissement (qui le pré-remplit).
//
// LA COMMUNE CONSTATE UN FAIT, JAMAIS UNE PERSONNE. La description et les photos disent
// ce qui a été vu ; aucun champ ne nomme ni n'identifie quelqu'un, et une suite de huit
// chiffres (un CIN, un téléphone) est refusée par la base — l'écran le dit avant.
//
// LES RÈGLES DE LA BASE SE DISENT, ELLES NE SE REFONT PAS ICI. Le délai de saisie est
// un paramètre national daté (30 jours d'ordinaire) : au-delà, l'écran avertit, et le
// refus de la base, s'il vient, s'affiche tel quel avec le nombre de jours. Un jour
// couvert par une période de fermeture non retirée — en cours ou close, la réouverture
// exclue — ne se constate pas : l'écran lit les périodes de l'établissement pour le dire
// avant, et la base tranche.
//
// LES PHOTOS DÉPOSÉES ET NON JOINTES REPARTENT DU SERVEUR : à « Annuler », et à la
// fermeture du formulaire par tout autre chemin, tant que le constat n'est pas créé.
// Après un refus de la base, elles restent : le formulaire reste ouvert pour corriger.
//
// La date se propose au jour de Tunis, jamais au jour du poste.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type ConstatAssimileDetail, type Etablissement, type FermetureEtablissement, type TypeConstat } from '../../lib/api';
import { isolerLtr, useFormats } from '../../lib/formats';
import { DepotPhotosConstat, retirerPhotosNonJointes, type PhotoConstatDeposee } from '../constats/DepotPhotosConstat';
import { DELAI_SAISIE_INDICATIF, joursEntre, porteUnIdentifiant } from '../constats/regles';
import { Chargement, Erreur } from '../Elements';
import { CadreAjout, champAjout } from './CadreAjout';
import { aujourdhui } from './FormulaireEtablissement';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const TYPES_CONSTAT: TypeConstat[] = [
  'depot_hors_conteneur',
  'conteneur_non_conforme',
  'debordement',
  'tri_non_respecte',
  'absence_convention',
  'autre',
];

export function FormulaireConstatAssimile({
  communeId,
  commerceId: commerceImpose,
  onFait,
  onAnnuler,
}: {
  communeId: string;
  /** L'établissement de la fiche qui ouvre le formulaire ; absent, il se choisit. */
  commerceId?: string;
  onFait: (enregistre?: ConstatAssimileDetail) => void | Promise<void>;
  onAnnuler?: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const [etablissements, setEtablissements] = useState<Etablissement[] | null>(null);
  const [indisponible, setIndisponible] = useState(false);
  const [essai, setEssai] = useState(0);
  const [commerceId, setCommerceId] = useState(commerceImpose ?? '');
  const [dateConstat, setDateConstat] = useState(aujourdhui());
  const [type, setType] = useState<TypeConstat | ''>('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PhotoConstatDeposee[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [depotEnCours, setDepotEnCours] = useState(false);
  // Les périodes de fermeture de l'établissement choisi ; null tant qu'elles ne sont pas
  // lues, ou si leur lecture échoue — l'écran ne dit alors rien et la base tranche.
  const [fermetures, setFermetures] = useState<FermetureEtablissement[] | null>(null);
  // Les photos en attente, à jour pour le nettoyage au démontage ; et le constat créé, qui
  // les a reçues : elles ne se retirent plus (la base le refuserait).
  const photosEnAttente = useRef<PhotoConstatDeposee[]>([]);
  photosEnAttente.current = photos;
  const cree = useRef(false);
  useEffect(
    () => () => {
      if (!cree.current) void retirerPhotosNonJointes(photosEnAttente.current);
    },
    []
  );

  useEffect(() => {
    setFermetures(null);
    if (!commerceId) return;
    let actuel = true;
    api
      .fermeturesEtablissement(commerceId)
      .then((l) => {
        if (actuel) setFermetures(l);
      })
      .catch(() => undefined);
    return () => {
      actuel = false;
    };
  }, [commerceId]);

  // Tous les établissements, fermés compris : un établissement fermé se constate encore
  // pour des faits d'avant sa fermeture. La liste dit sa date.
  useEffect(() => {
    setIndisponible(false);
    api
      .etablissements(communeId)
      .then((l) => setEtablissements([...l].sort((a, b) => a.nom.localeCompare(b.nom))))
      .catch(() => setIndisponible(true));
  }, [communeId, essai]);

  const choisi = useMemo(() => (etablissements ?? []).find((e) => e.id === commerceId) ?? null, [etablissements, commerceId]);
  const jour = aujourdhui();
  const ecart = DATE.test(dateConstat) ? joursEntre(dateConstat, jour) : null;

  const problemes: string[] = [];
  const cle = (s: string) => `ajout.constatAssimile.problemes.${s}`;
  if (!commerceId) problemes.push(t(cle('etablissement')));
  if (!DATE.test(dateConstat)) problemes.push(t(cle('date')));
  else if (dateConstat > jour) problemes.push(t(cle('dateFuture')));
  else {
    // La règle de la base (app._fermeture_au) : une période non retirée couvre le jour,
    // de sa fermeture incluse à sa réouverture exclue.
    const periode = (fermetures ?? [])
      .filter((p) => !p.retiree_le && p.ferme_le <= dateConstat && (p.rouvert_le === null || dateConstat < p.rouvert_le))
      .sort((a, b) => b.ferme_le.localeCompare(a.ferme_le))[0];
    if (periode && choisi) {
      problemes.push(
        periode.rouvert_le === null
          ? t(cle('ferme'), { nom: choisi.nom, date: f.date(periode.ferme_le) })
          : t(cle('fermeDu'), { nom: choisi.nom, du: f.date(periode.ferme_le), au: f.date(periode.rouvert_le) })
      );
    }
  }
  if (!type) problemes.push(t(cle('type')));
  if (type === 'autre' && !description.trim()) problemes.push(t(cle('description')));
  if ([...description.trim()].length > 500) problemes.push(t(cle('longueur')));
  if (porteUnIdentifiant(description)) problemes.push(t(cle('identifiant')));
  // Une photo qui part encore arriverait après le constat, et ne serait jamais jointe.
  if (depotEnCours) problemes.push(t(cle('depotEnCours')));

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api.creerConstatAssimile(communeId, {
        commerceId,
        dateConstat,
        type: type as TypeConstat,
        description: description.trim() || null,
        photos: photos.map((p) => p.id),
      });
      cree.current = true;
      await onFait(r);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  const annuler = async () => {
    if (depotEnCours || envoi) return;
    await retirerPhotosNonJointes(photos);
    photosEnAttente.current = [];
    onAnnuler?.();
  };

  if (indisponible) return <Erreur message={t('ajout.constatAssimile.listeIndisponible')} onReessayer={() => setEssai((n) => n + 1)} />;
  if (!etablissements) return <Chargement />;

  const position = choisi && choisi.latitude != null && choisi.longitude != null ? { lat: choisi.latitude, lng: choisi.longitude } : null;

  return (
    <CadreAjout
      id="constat-assimile-nouveau"
      titre={t('ajout.constatAssimile.titre')}
      aide={t('ajout.constatAssimile.aide')}
      erreur={erreur}
      enregistrable={problemes.length === 0}
      envoi={envoi}
      onEnregistrer={enregistrer}
      onAnnuler={onAnnuler ? () => void annuler() : undefined}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          {t('ajout.constatAssimile.etablissement')}
          <select
            value={commerceId}
            onChange={(e) => setCommerceId(e.target.value)}
            disabled={Boolean(commerceImpose)}
            className={`${champAjout} disabled:bg-ardoise-100`}
          >
            <option value="">{t('ajout.etablissement.choisir')}</option>
            {etablissements.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}
                {e.matricule_fiscal ? ` — ${isolerLtr(e.matricule_fiscal)}` : ''}
                {e.statut === 'ferme' && e.ferme_le ? ` — ${t('ajout.constatAssimile.fermeLe', { date: f.date(e.ferme_le) })}` : ''}
              </option>
            ))}
          </select>
          {etablissements.length === 0 && <span className="mt-1 block text-xs text-ardoise-600">{t('ajout.constatAssimile.aucunEtablissement')}</span>}
        </label>
        <label className="text-sm">
          {t('ajout.constatAssimile.date')}
          <input type="date" value={dateConstat} max={jour} onChange={(e) => setDateConstat(e.target.value)} className={champAjout} />
          {ecart !== null && ecart > DELAI_SAISIE_INDICATIF && (
            <span role="status" className="mt-1 block text-xs text-amber-900">
              {t('ajout.constatAssimile.delai', { count: ecart, n: ecart, delai: DELAI_SAISIE_INDICATIF })}
            </span>
          )}
        </label>
        <label className="text-sm">
          {t('ajout.constatAssimile.type')}
          <select value={type} onChange={(e) => setType(e.target.value as TypeConstat | '')} className={champAjout}>
            <option value="">{t('ajout.etablissement.choisir')}</option>
            {TYPES_CONSTAT.map((x) => (
              <option key={x} value={x}>{t(`constats.types.${x}`)}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        {type === 'autre' ? t('ajout.constatAssimile.descriptionObligatoire') : t('ajout.constatAssimile.description')}
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} className={`${champAjout} py-2`} />
        <span className="mt-1 block text-xs text-ardoise-500">{t('constats.sansPersonne')}</span>
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm">{t('ajout.constatAssimile.photos')}</legend>
        <DepotPhotosConstat
          communeId={communeId}
          photos={photos}
          onAjout={(d) => setPhotos((p) => [...p, ...d])}
          onRetrait={(id) => setPhotos((p) => p.filter((x) => x.id !== id))}
          onDepotChange={setDepotEnCours}
          positionEtablissement={position}
          desactive={envoi}
        />
      </fieldset>
      {problemes.length > 0 && (
        <div className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">
          <p>{t('ajout.etablissement.pourEnregistrer')}</p>
          <ul className="list-disc ps-5">
            {problemes.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </CadreAjout>
  );
}
