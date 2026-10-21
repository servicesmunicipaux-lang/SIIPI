// L'accueil du portail communal (jalon D, lot D2 ; SPEC_D_pret_a_presenter.md).
//
// Ce que le directeur voit en ouvrant le portail : ce qui va bien, ce qui demande
// une action, et où il en est du constat du jour. Chaque ligne mène, en un clic,
// à l'écran où l'on agit.
//
// L'ÉCRAN NE NOTE PAS. Pas de total, pas de pourcentage, pas de « 12 sur 21 » :
// un score de « ce qui va bien » recréerait le palmarès retiré au lot 1. Et il
// ne range jamais dans « ce qui va bien » ce qui n'a pas de source : un
// indicateur sans objectif déclaré est « calculé », sans jugement (règle 1.1).
//
// UNE COMMUNE QUI N'A RIEN SAISI n'a pas un tableau de zéros : elle voit le
// parcours de démarrage, « Ma commune dans SIIPI », qui est la liste de ce qu'il
// y a à poser d'abord.
//
// La FNCT qui ouvre le portail d'une commune lit : les liens la mènent aux
// écrans, qui se chargent de ne pas lui offrir de saisir à la place de la commune.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type AccueilCommune } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFormats, PREFERENCES_DEFAUT } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';
import { ecartVoulu } from './Coherence';
import { MaCommune } from './MaCommune';

/** Combien de lignes un bloc montre avant de renvoyer à l'écran complet : un accueil n'est pas une liste de tâches de fond. */
const LIGNES = 5;

/**
 * L'écran du portail où se traite un écart, selon son domaine. Un domaine absent d'ici
 * mène au constat du jour, où « À vérifier » les liste tous.
 */
const ECRAN_DU_DOMAINE: Record<string, string> = {
  circuits: 'circuits',
  parc: 'parc',
  personnel: 'personnel',
  communication: 'communication',
  pesees: 'pesees',
  reclamations: 'reclamations',
  points: 'points',
  kpi: 'indicateurs',
  carburant: 'carburant',
  declassement: 'declassement',
  acteurs_informels: 'acteursInformels',
};

/** L'écran du portail où se tient un registre du mois, selon son code (« Ma commune dans SIIPI »). */
const ECRAN_DU_REGISTRE: Record<string, string> = {
  pesees: 'pesees',
  carburant: 'carburant',
  presences: 'personnel',
  fins_de_poste: 'registres',
  controles: 'constat',
  maintenance: 'parc',
  balayage: 'registres',
};

const ALLURE_GRAVITE: Record<string, string> = {
  bloquant: 'border-red-300 bg-red-50 text-red-900',
  avertissement: 'border-amber-300 bg-amber-50 text-amber-900',
  information: 'border-ardoise-200 bg-ardoise-50 text-ardoise-700',
};
const RANG_GRAVITE: Record<string, number> = { bloquant: 0, avertissement: 1, information: 2 };

const lien = 'min-h-10 shrink-0 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50';

type Indicateur = AccueilCommune['va_bien']['calcules'][number];

export function Accueil({
  communeId,
  fnct,
  onOuvrirEcran,
  onOuvrirIndicateur,
}: {
  communeId: string;
  fnct: boolean;
  /** Ouvrir un écran du portail. */
  onOuvrirEcran: (ecran: string) => void;
  /** Ouvrir l'écran des indicateurs sur un indicateur, son panneau « il manque » ou sa courbe. */
  onOuvrirIndicateur: (code: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const ar = i18n.language.startsWith('ar');
  const f = useFormats();
  const { utilisateur } = useAuth();
  const alertes = (utilisateur?.preferences ?? PREFERENCES_DEFAUT).alertes;
  const [donnees, setDonnees] = useState<AccueilCommune | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      setDonnees(await api.accueil(communeId));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [communeId, t]);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (erreur && !donnees) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!donnees) return <Chargement />;

  const libelle = (x: { libelle_fr: string; libelle_ar: string }) => (ar ? x.libelle_ar : x.libelle_fr);
  const jour = f.date(donnees.jour);

  const en_tete = (
    <header className="space-y-1">
      <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.accueil.titre')}</h1>
      <p className="text-sm text-ardoise-600">{t('communal.accueil.dateDuJour', { jour })}</p>
    </header>
  );

  // La commune qui n'a rien saisi : le parcours de démarrage, pas des blocs vides.
  if (donnees.commune_vide) {
    return (
      <div className="space-y-6">
        {en_tete}
        <p className="rounded-xl border border-siipi-200 bg-siipi-50 p-4 text-sm text-siipi-900">{t('communal.accueil.communeVide')}</p>
        <MaCommune communeId={communeId} fnct={fnct} onOuvrirEcran={onOuvrirEcran} />
      </div>
    );
  }

  const { constat, va_bien: bien, a_agir: agir } = donnees;
  const ecarts = agir.a_verifier
    .filter((e) => ecartVoulu(e, alertes))
    .sort((a, b) => (RANG_GRAVITE[a.gravite] ?? 9) - (RANG_GRAVITE[b.gravite] ?? 9));
  const rienAAgir = ecarts.length === 0 && agir.non_renseignes.length === 0 && agir.entretiens.length === 0;
  const rienDeCalcule = bien.objectif_atteint.length === 0 && bien.calcules.length === 0 && bien.registres.length === 0;

  const valeur = (i: Indicateur) =>
    i.valeur == null ? null : `${formaterNombre(i.valeur, Number.isInteger(i.valeur) ? 0 : i.valeur < 10 ? 2 : 1)}${i.unite ? ` ${i.unite}` : ''}`;

  const ligneIndicateur = (i: Indicateur, avecObjectif: boolean) => (
    <li key={i.code} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ardoise-200 bg-white p-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ardoise-900">{libelle(i)}</p>
        <p className="text-xs text-ardoise-600">
          <span className="chiffres font-medium text-ardoise-800">{valeur(i)}</span>
          {avecObjectif && i.cible != null && <span> · {t('communal.accueil.objectif', { cible: formaterNombre(i.cible, Number.isInteger(i.cible) ? 0 : 1) })}</span>}
          {i.source && <span> · {t(`kpi.sources.${i.source}`)}</span>}
        </p>
      </div>
      <button type="button" className={lien} onClick={() => onOuvrirIndicateur(i.code)}>{t('communal.accueil.voir')}</button>
    </li>
  );

  const titreSection = (cle: string, n?: number) => (
    <h3 className="text-sm font-semibold text-ardoise-700">{t(`communal.accueil.${cle}`, { count: n })}</h3>
  );

  return (
    <div className="space-y-6">
      {en_tete}

      {/* Le constat du matin : l'avancement, et la porte vers l'écran où on le pose. */}
      <section aria-labelledby="accueil-constat" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ardoise-200 bg-white p-4">
        <div>
          <h2 id="accueil-constat" className="text-base font-semibold text-ardoise-900">{t('communal.accueil.constatTitre')}</h2>
          <p className="text-sm text-ardoise-600">
            {constat.attendus === 0
              ? t('communal.accueil.constatAucun')
              : t('communal.constat.avancement', { saisis: constat.saisis, total: constat.attendus })}
          </p>
        </div>
        <button type="button" className={lien} onClick={() => onOuvrirEcran('constat')}>
          {t(fnct ? 'communal.accueil.constatVoir' : 'communal.accueil.constatFaire')}
        </button>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="accueil-bien" className="space-y-4 rounded-xl border border-siipi-200 bg-siipi-50/40 p-4">
          <h2 id="accueil-bien" className="text-lg font-semibold text-siipi-900">{t('communal.accueil.vaBien')}</h2>
          {rienDeCalcule && <p className="text-sm text-ardoise-600">{t('communal.accueil.rienDeCalcule')}</p>}

          {bien.objectif_atteint.length > 0 && (
            <div className="space-y-2">
              {titreSection('objectifAtteint')}
              <ul className="space-y-2">{bien.objectif_atteint.map((i) => ligneIndicateur(i, true))}</ul>
            </div>
          )}

          {bien.calcules.length > 0 && (
            <div className="space-y-2">
              {titreSection('calcules')}
              <ul className="space-y-2">{bien.calcules.slice(0, LIGNES).map((i) => ligneIndicateur(i, false))}</ul>
              {bien.calcules.length > LIGNES && (
                <button type="button" className={lien} onClick={() => onOuvrirEcran('indicateurs')}>
                  {t('communal.accueil.tousLesIndicateurs', { count: bien.calcules.length - LIGNES })}
                </button>
              )}
            </div>
          )}

          {bien.registres.length > 0 && (
            <div className="space-y-2">
              {titreSection('registres')}
              <ul className="flex flex-wrap gap-2">
                {bien.registres.map((r) => (
                  <li key={r.code}>
                    <button type="button" className={lien} onClick={() => onOuvrirEcran(ECRAN_DU_REGISTRE[r.code] ?? 'maCommune')}>
                      {libelle(r)}
                      {r.nombre != null && <span className="chiffres ms-1 text-ardoise-500">({formaterNombre(r.nombre, 0)})</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section aria-labelledby="accueil-agir" className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
          <h2 id="accueil-agir" className="text-lg font-semibold text-amber-950">{t('communal.accueil.demandeAction')}</h2>
          {rienAAgir && <p className="rounded-lg border border-siipi-200 bg-siipi-50 p-3 text-sm text-siipi-900">{t('communal.accueil.rienAAgir')}</p>}

          {ecarts.length > 0 && (
            <div className="space-y-2">
              {titreSection('aVerifier')}
              <ul className="space-y-2">
                {ecarts.slice(0, LIGNES).map((e, i) => (
                  <li key={`${e.sujet_id}-${i}`} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 ${ALLURE_GRAVITE[e.gravite] ?? ALLURE_GRAVITE.information}`}>
                    <div className="min-w-0 flex-1 text-sm">
                      <p>
                        <span className="font-semibold">{e.sujet}</span>
                        {' — '}
                        {e.constat}
                      </p>
                      <p className="mt-0.5 text-xs opacity-80">{e.quoi_faire}</p>
                    </div>
                    <button type="button" className={lien} onClick={() => onOuvrirEcran(ECRAN_DU_DOMAINE[e.domaine] ?? 'constat')}>
                      {t('communal.accueil.ouvrir')}
                    </button>
                  </li>
                ))}
              </ul>
              {ecarts.length > LIGNES && (
                <button type="button" className={lien} onClick={() => onOuvrirEcran('constat')}>
                  {t('communal.accueil.tousLesEcarts', { count: ecarts.length - LIGNES })}
                </button>
              )}
            </div>
          )}

          {agir.non_renseignes.length > 0 && (
            <div className="space-y-2">
              {titreSection('nonRenseignes')}
              <ul className="space-y-2">
                {agir.non_renseignes.slice(0, LIGNES).map((i) => (
                  <li key={i.code} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ardoise-200 bg-white p-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ardoise-900">{libelle(i)}</p>
                      <p className="text-xs text-ardoise-600">{t('kpi.statuts.non_renseigne')}</p>
                    </div>
                    <button type="button" className={lien} onClick={() => onOuvrirIndicateur(i.code)}>{t('communal.accueil.ceQuiManque')}</button>
                  </li>
                ))}
              </ul>
              {agir.non_renseignes.length > LIGNES && (
                <button type="button" className={lien} onClick={() => onOuvrirEcran('indicateurs')}>
                  {t('communal.accueil.tousLesIndicateurs', { count: agir.non_renseignes.length - LIGNES })}
                </button>
              )}
            </div>
          )}

          {agir.entretiens.length > 0 && (
            <div className="space-y-2">
              {titreSection('entretiens')}
              <ul className="space-y-2">
                {agir.entretiens.slice(0, LIGNES).map((e) => (
                  <li key={e.plan_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ardoise-200 bg-white p-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ardoise-900">{e.registration} — {e.libelle}</p>
                      <p className="text-xs text-ardoise-600">
                        {t(`communal.entretien.statuts.${e.statut}`)}
                        {e.echeance_date && <span> · {f.date(e.echeance_date)}</span>}
                      </p>
                    </div>
                    <button type="button" className={lien} onClick={() => onOuvrirEcran('parc')}>{t('communal.accueil.ouvrir')}</button>
                  </li>
                ))}
              </ul>
              {agir.entretiens.length > LIGNES && (
                <button type="button" className={lien} onClick={() => onOuvrirEcran('parc')}>
                  {t('communal.accueil.tousLesEntretiens', { count: agir.entretiens.length - LIGNES })}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
