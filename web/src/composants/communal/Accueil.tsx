// L'accueil du portail communal (jalon D, lot D2 ; repris au lot D3c, SPEC_D_pret_a_presenter.md).
//
// Ce que le directeur voit en ouvrant le portail : trois chiffres à retenir, ce qui va
// bien, ce qui demande une action. Chaque ligne mène, en un clic, à l'écran où l'on agit.
//
// LES CHIFFRES-CLÉS COMPTENT DES CHOSES À FAIRE, ILS NE NOTENT PAS. Les circuits
// contrôlés sur ceux qui sont attendus, les points à vérifier, les indicateurs sans
// source : des effectifs d'éléments, jamais un total, un pourcentage ou une note — un
// score de « ce qui va bien » recréerait le palmarès retiré au lot 1. Un zéro n'est
// affiché que quand il est réel : « aucun circuit attendu » se dit en mots, pas « 0 / 0 ».
//
// LES ÉCARTS IDENTIQUES SE REGROUPENT. Soixante-six circuits « en régie sans agent
// affecté » faisaient soixante-six lignes rouges, qui alarmaient sans rien apprendre
// de plus que la première : un seul avis, son nombre, et les premiers sujets. La
// plateforme constate, elle ne corrige pas — le regroupement ne cache aucun écart,
// il en dit le nombre.
//
// Il ne range jamais dans « ce qui va bien » ce qui n'a pas de source : un indicateur
// sans objectif déclaré est « calculé », sans jugement (règle 1.1). Une commune qui
// n'a rien saisi voit le parcours de démarrage, « Ma commune dans SIIPI », pas un
// tableau de zéros. La FNCT qui ouvre le portail d'une commune lit la même chose.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type AccueilCommune } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFormats, PREFERENCES_DEFAUT } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';
import { ChiffreCle } from '../ui/ChiffreCle';
import { Pastille } from '../ui/Pastille';
import { ecartVoulu } from './Coherence';
import { MaCommune } from './MaCommune';

/** Combien de lignes un bloc montre avant de renvoyer à l'écran complet : un accueil n'est pas une liste de tâches de fond. */
const LIGNES = 5;
/** Combien de sujets d'un écart regroupé on nomme avant « et N autres ». */
const SUJETS_NOMMES = 3;

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
type Ecart = AccueilCommune['a_agir']['a_verifier'][number];

/** Un avis et les sujets qui le portent : « 66 circuits en régie sans agent affecté ». */
interface EcartRegroupe {
  gravite: string;
  domaine: string;
  constat: string;
  quoi_faire: string;
  sujets: string[];
}

function regrouper(ecarts: Ecart[]): EcartRegroupe[] {
  const groupes = new Map<string, EcartRegroupe>();
  for (const e of ecarts) {
    const cle = `${e.gravite}|${e.domaine}|${e.constat}|${e.quoi_faire}`;
    const g = groupes.get(cle);
    if (g) g.sujets.push(e.sujet);
    else groupes.set(cle, { gravite: e.gravite, domaine: e.domaine, constat: e.constat, quoi_faire: e.quoi_faire, sujets: [e.sujet] });
  }
  return [...groupes.values()].sort((a, b) => (RANG_GRAVITE[a.gravite] ?? 9) - (RANG_GRAVITE[b.gravite] ?? 9) || b.sujets.length - a.sujets.length);
}

/** Un chiffre-clé de l'accueil : un bouton, qui mène à l'écran où l'on agit. */
function ChiffreAccueil({
  libelle,
  valeur,
  unite,
  detail,
  marque,
  ton,
  absent,
  onClick,
}: {
  libelle: string;
  valeur: string;
  unite?: string;
  detail: string;
  marque?: React.ReactNode;
  /** Le filet de couleur du bord : le mot, ou la pastille, dit déjà ce que la couleur dit. */
  ton: 'neutre' | 'attention' | 'action' | 'bien';
  absent?: boolean;
  onClick: () => void;
}) {
  const filet = {
    neutre: 'border-s-ardoise-300',
    attention: 'border-s-amber-500',
    action: 'border-s-red-600',
    bien: 'border-s-siipi-600',
  }[ton];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-full w-full flex-col gap-2 rounded-lg border border-ardoise-200 border-s-4 bg-white p-4 text-start hover:border-siipi-400 ${filet}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-snug text-ardoise-700">{libelle}</span>
        {marque}
      </span>
      {absent ? <span className="text-sm text-ardoise-500">{valeur}</span> : <ChiffreCle valeur={valeur} unite={unite} taille="lg" />}
      <span className="text-sm text-ardoise-500">{detail}</span>
    </button>
  );
}

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

  // Les écarts que les préférences de l'utilisateur laissent voir, regroupés par avis.
  const groupes = useMemo(
    () => (donnees ? regrouper(donnees.a_agir.a_verifier.filter((e) => ecartVoulu(e, alertes))) : []),
    [donnees, alertes]
  );

  if (erreur && !donnees) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!donnees) return <Chargement />;

  const libelle = (x: { libelle_fr: string; libelle_ar: string }) => (ar ? x.libelle_ar : x.libelle_fr);
  const jour = f.date(donnees.jour);

  const enTete = (
    <header className="space-y-1">
      <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.accueil.titre')}</h1>
      <p className="text-sm text-ardoise-600">{t('communal.accueil.dateDuJour', { jour })}</p>
    </header>
  );

  // La commune qui n'a rien saisi : le parcours de démarrage, pas des blocs vides.
  if (donnees.commune_vide) {
    return (
      <div className="space-y-6">
        {enTete}
        <p className="rounded-xl border border-siipi-200 bg-siipi-50 p-4 text-sm text-siipi-900">{t('communal.accueil.communeVide')}</p>
        <MaCommune communeId={communeId} fnct={fnct} onOuvrirEcran={onOuvrirEcran} />
      </div>
    );
  }

  const { constat, va_bien: bien, a_agir: agir } = donnees;
  const nbEcarts = groupes.reduce((n, g) => n + g.sujets.length, 0);
  const nbBloquants = groupes.filter((g) => g.gravite === 'bloquant').reduce((n, g) => n + g.sujets.length, 0);
  const enRetard = agir.entretiens.filter((e) => e.statut === 'en_retard').length;
  const rienAAgir = groupes.length === 0 && agir.non_renseignes.length === 0 && agir.entretiens.length === 0;
  const rienDeCalcule = bien.objectif_atteint.length === 0 && bien.calcules.length === 0 && bien.registres.length === 0;
  const constatComplet = constat.attendus > 0 && constat.saisis >= constat.attendus;

  const valeur = (i: Indicateur) =>
    i.valeur == null ? null : `${formaterNombre(i.valeur, Number.isInteger(i.valeur) ? 0 : i.valeur < 10 ? 2 : 1)}${i.unite ? ` ${i.unite}` : ''}`;

  const ligneIndicateur = (i: Indicateur, avecObjectif: boolean) => (
    <li key={i.code} className="flex items-center justify-between gap-3 rounded-lg border border-ardoise-200 bg-white p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ardoise-900">{libelle(i)}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ardoise-600">
          <span className="chiffres text-sm font-semibold text-ardoise-900">{valeur(i)}</span>
          {avecObjectif && i.cible != null && <span>{t('communal.accueil.objectif', { cible: formaterNombre(i.cible, Number.isInteger(i.cible) ? 0 : 1) })}</span>}
          {i.source && <Pastille ton={i.source === 'mesure' ? 'mesure' : 'declare'}>{t(`kpi.sources.court.${i.source}`)}</Pastille>}
        </p>
      </div>
      <button type="button" className={lien} onClick={() => onOuvrirIndicateur(i.code)}>{t('communal.accueil.voir')}</button>
    </li>
  );

  const titreSection = (cle: string) => <h3 className="text-sm font-semibold text-ardoise-800">{t(`communal.accueil.${cle}`)}</h3>;

  return (
    <div className="space-y-6">
      {enTete}

      {/* Les chiffres à retenir : un bouton chacun, vers l'écran où l'on agit. */}
      <section aria-label={t('communal.accueil.chiffres.titre')} className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-4">
        <ChiffreAccueil
          libelle={t('communal.accueil.constatTitre')}
          valeur={constat.attendus === 0 ? t('communal.accueil.constatAucun') : formaterNombre(constat.saisis)}
          unite={constat.attendus === 0 ? undefined : `/ ${formaterNombre(constat.attendus)}`}
          absent={constat.attendus === 0}
          detail={constat.attendus === 0 ? t('communal.accueil.chiffres.constatRien') : t('communal.accueil.chiffres.constatDetail')}
          marque={constatComplet ? <Pastille ton="mesure">{t('communal.accueil.chiffres.complet')}</Pastille> : undefined}
          ton={constatComplet ? 'bien' : constat.attendus === 0 ? 'neutre' : 'attention'}
          onClick={() => onOuvrirEcran('constat')}
        />
        <ChiffreAccueil
          libelle={t('communal.accueil.aVerifier')}
          valeur={nbEcarts === 0 ? t('communal.accueil.chiffres.rien') : formaterNombre(nbEcarts)}
          absent={nbEcarts === 0}
          detail={nbEcarts === 0 ? t('communal.accueil.chiffres.aVerifierRien') : t('communal.accueil.chiffres.aVerifierDetail', { count: groupes.length })}
          marque={nbBloquants > 0 ? <Pastille ton="action">{t('communal.accueil.chiffres.bloquants', { count: nbBloquants })}</Pastille> : undefined}
          ton={nbBloquants > 0 ? 'action' : nbEcarts > 0 ? 'attention' : 'bien'}
          onClick={() => onOuvrirEcran('constat')}
        />
        <ChiffreAccueil
          libelle={t('communal.accueil.nonRenseignes')}
          valeur={agir.non_renseignes.length === 0 ? t('communal.accueil.chiffres.rien') : formaterNombre(agir.non_renseignes.length)}
          absent={agir.non_renseignes.length === 0}
          detail={t('communal.accueil.chiffres.nonRenseignesDetail')}
          ton={agir.non_renseignes.length > 0 ? 'neutre' : 'bien'}
          onClick={() => onOuvrirEcran('indicateurs')}
        />
        {/* Les entretiens : seulement s'il y en a de dus. Sans plan d'entretien, « 0 en retard » se
            lirait « le parc est à jour » — rien ne prouve qu'on le suive (règle 1.1). */}
        {agir.entretiens.length > 0 && (
          <ChiffreAccueil
            libelle={t('communal.accueil.entretiens')}
            valeur={formaterNombre(agir.entretiens.length)}
            detail={t('communal.accueil.chiffres.entretiensDetail', { count: enRetard })}
            marque={enRetard > 0 ? <Pastille ton="action">{t('communal.entretien.statuts.en_retard')}</Pastille> : undefined}
            ton={enRetard > 0 ? 'action' : 'attention'}
            onClick={() => onOuvrirEcran('parc')}
          />
        )}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="accueil-bien" className="space-y-4 rounded-lg border border-ardoise-200 bg-white p-4 sm:p-5">
          <h2 id="accueil-bien" className="text-lg font-semibold text-ardoise-900">{t('communal.accueil.vaBien')}</h2>
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

        <section aria-labelledby="accueil-agir" className="space-y-4 rounded-lg border border-ardoise-200 bg-white p-4 sm:p-5">
          <h2 id="accueil-agir" className="text-lg font-semibold text-ardoise-900">{t('communal.accueil.demandeAction')}</h2>
          {rienAAgir && <p className="rounded-lg border border-siipi-200 bg-siipi-50 p-3 text-sm text-siipi-900">{t('communal.accueil.rienAAgir')}</p>}

          {groupes.length > 0 && (
            <div className="space-y-2">
              {titreSection('aVerifier')}
              <ul className="space-y-2">
                {groupes.slice(0, LIGNES).map((g) => (
                  <li key={`${g.gravite}|${g.domaine}|${g.constat}`} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 ${ALLURE_GRAVITE[g.gravite] ?? ALLURE_GRAVITE.information}`}>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">
                        {g.sujets.length > 1 && <span className="chiffres me-1.5 font-semibold">{formaterNombre(g.sujets.length)} ×</span>}
                        {g.constat}
                      </p>
                      <p className="mt-0.5 text-xs opacity-90">
                        {/* Un nom en arabe dans une phrase française (ou l'inverse) s'inverse sans isolation. */}
                        {g.sujets.slice(0, SUJETS_NOMMES).map((sujet, i) => (
                          <span key={`${sujet}-${i}`}>
                            {i > 0 && ' · '}
                            <bdi>{sujet}</bdi>
                          </span>
                        ))}
                        {g.sujets.length > SUJETS_NOMMES && ` ${t('communal.accueil.etAutres', { count: g.sujets.length - SUJETS_NOMMES })}`}
                      </p>
                      <p className="mt-1 text-xs opacity-80">{g.quoi_faire}</p>
                    </div>
                    <button type="button" className={lien} onClick={() => onOuvrirEcran(ECRAN_DU_DOMAINE[g.domaine] ?? 'constat')}>
                      {t('communal.accueil.ouvrir')}
                    </button>
                  </li>
                ))}
              </ul>
              {groupes.length > LIGNES && (
                <button type="button" className={lien} onClick={() => onOuvrirEcran('constat')}>
                  {t('communal.accueil.tousLesEcarts', { count: groupes.length - LIGNES })}
                </button>
              )}
            </div>
          )}

          {agir.non_renseignes.length > 0 && (
            <div className="space-y-2">
              {titreSection('nonRenseignes')}
              <ul className="space-y-2">
                {agir.non_renseignes.slice(0, LIGNES).map((i) => (
                  <li key={i.code} className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-ardoise-300 bg-ardoise-50/60 p-3">
                    <p className="min-w-0 flex-1 text-sm text-ardoise-800">{libelle(i)}</p>
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
                  <li key={e.plan_id} className="flex items-center justify-between gap-3 rounded-lg border border-ardoise-200 bg-white p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ardoise-900">{e.registration} — {e.libelle}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ardoise-600">
                        <Pastille ton={e.statut === 'en_retard' ? 'action' : 'attention'}>{t(`communal.entretien.statuts.${e.statut}`)}</Pastille>
                        {e.echeance_date && <span>{f.date(e.echeance_date)}</span>}
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
