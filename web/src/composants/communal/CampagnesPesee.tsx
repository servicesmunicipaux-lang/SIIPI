// Les campagnes de pesée et les densités des assimilés (jalon G, lot G5b), côté commune.
//
// DEUX PARTIES, UN SEUL ÉCRAN : les campagnes (brouillon → ouverte → close), et les
// densités qui en sortent — ou qui viennent d'une source écrite, ou du pays.
//
// UNE CAMPAGNE PÈSE CHEZ L'ÉTABLISSEMENT OU AU MÉNAGE, jamais à la benne : aucun
// circuit, aucun engin. Ouverte, elle reçoit ses pesées (saisies ici par lot, ou
// importées de Kobo) ; close, elle est figée et ses résultats sont calculés UNE fois,
// par la base. L'écran ne calcule rien : il lit les quartiles et les dit.
//
// UNE PESÉE SAISIE NE DISPARAÎT QUE PAR UN GESTE DU DIRECTEUR. Le lot en attente
// d'envoi vit au-dessus des cartes : replier une carte, passer aux densités, importer
// un export ou annuler une pesée ne l'efface pas. Seuls son envoi réussi (pour les
// pesées parties, pas celles ajoutées entre-temps) et « Retirer » l'allègent. La
// clôture attend qu'il soit vide : elle figerait les résultats sans lui.
//
// UN RÉSULTAT SOUS LE SEUIL NE PROPOSE RIEN, et le dit. Un écarté l'est avec sa
// raison, en mots — jamais retiré en silence du compte. Une tranche de moins de cinq
// ménages ne rend aucun quartile, et l'écran le dit au lieu d'afficher un tiret muet.
//
// LES MÉNAGES NE SORTENT PAS DE LA COMMUNE. Un ménage n'est qu'un code (M-001), un
// nombre d'habitants et une tranche de revenu ; la FNCT n'en lit aucun — l'écran ne
// les lui demande pas (l'API répondrait 403), elle lit les résultats par tranche.
//
// Chaque geste envoie la version lue : si la campagne a changé depuis, il est refusé,
// et la campagne se relit avant que le refus ne s'affiche, dans sa carte. Un refus
// venu d'une section (lot, annulation, ménage) relit aussi la campagne, pas seulement
// la section : close ailleurs, elle ne doit plus se montrer ouverte.
//
// La commune écrit ; la FNCT lit, sans aucun geste.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  type CampagnePesee,
  type CampagnePeseeDetail,
  type DensiteAssimiles,
  type ElementListeAssimiles,
  type Etablissement,
  type ImportPeseesJournal,
  type IndicateurCampagne,
  type MenageEchantillon,
  type PeseeCampagne,
  type ResultatCampagne,
  type SaisiePeseeCampagne,
  type StatutCampagnePesee,
  type TrancheRevenu,
} from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { isolerLtr, useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import {
  arrondiJours,
  auPlusDecimales,
  formaterExact,
  formaterMesure,
  heuresExactes,
  joursDepuisHeures,
  texteDuree,
} from '../campagnesPesee/mesures';
import { Chargement, Erreur } from '../Elements';
import { FormulaireCampagnePesee } from '../ajout/FormulaireCampagnePesee';
import { aujourdhui } from '../ajout/FormulaireEtablissement';
import { ImportPesees } from '../ajout/ImportPesees';
import { useAjoutEnLigne } from '../ajout/useAjoutEnLigne';
import { ChiffreCle } from '../ui/ChiffreCle';
import { Pastille, type TonPastille } from '../ui/Pastille';

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const bouton = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
const boutonDiscret = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';

type Partie = 'campagnes' | 'densites';
const PARTIES: Partie[] = ['campagnes', 'densites'];

const TON_STATUT: Record<StatutCampagnePesee, TonPastille> = { brouillon: 'neutre', ouverte: 'declare', close: 'mesure' };
// L'ordre de lecture d'un groupe : la quantité produite, le poids d'une levée, la densité.
const ORDRE_INDICATEURS: IndicateurCampagne[] = ['kg_jour_unite', 'kg_hab_jour', 'kg_levee', 'kg_m3'];
const DECIMALES: Record<IndicateurCampagne, number> = { kg_jour_unite: 2, kg_hab_jour: 2, kg_levee: 1, kg_m3: 0 };
// Au-delà, une densité dit une saisie fautive (un remplissage tapé 0,5 au lieu de 50) : la base la refuse.
const DENSITE_MAX = 2000;
const TRANCHES: TrancheRevenu[] = ['bas', 'moyen', 'eleve'];
const MOTIF_MIN = 5;
const PESEES_AFFICHEES = 300;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const texteErreur = (err: unknown, defaut: string) => (err instanceof ErreurApi ? err.message : defaut);
const motifValable = (m: string) => [...m.trim()].length >= MOTIF_MIN;
const nombre = (v: string) => (v.trim() === '' ? null : Number(v.trim().replace(',', '.')));

/** Une clé d'envoi unique ; `randomUUID` manque hors d'un contexte sécurisé (http sur le réseau local). */
function nouvelleCle(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const octets = new Uint8Array(16);
  crypto.getRandomValues(octets);
  return Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
}

/** Les catégories d'activité par code, toutes dates confondues : une catégorie fermée depuis la campagne garde son nom. */
type Categories = Map<string, ElementListeAssimiles>;

/** Une pesée du lot : ce qui part à l'API, sa clé d'envoi comprise, et le nom de sa cible pour l'écran. */
type PeseeEnAttente = SaisiePeseeCampagne & { libelle: string };
type MajLot = (maj: (lot: PeseeEnAttente[]) => PeseeEnAttente[]) => void;
/**
 * Ce qui, d'une campagne, doit survivre au démontage de sa carte : son lot, l'envoi en
 * cours de ce lot, et la version de son registre. Une réponse qui arrive après le repli
 * d'une carte agirait sinon sur des composants démontés : le lot s'allégerait sans
 * qu'aucun message ne le dise, et la section remontée ne relirait pas son registre.
 */
type SuiviLots = {
  lots: Record<string, PeseeEnAttente[]>;
  majLot: (campagneId: string, maj: (lot: PeseeEnAttente[]) => PeseeEnAttente[]) => void;
  envois: Record<string, boolean>;
  marquerEnvoi: (campagneId: string, enCours: boolean) => void;
  versionsRegistre: Record<string, number>;
  registreChange: (campagneId: string) => void;
};
// Une référence stable pour « aucun lot » : un tableau neuf à chaque rendu relancerait les calculs qui en dépendent.
const LOT_VIDE: PeseeEnAttente[] = [];

export function CampagnesPesee({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const { utilisateur } = useAuth();
  const peutEcrire = utilisateur?.role === 'admin_commune';
  const [partie, setPartie] = useState<Partie>('campagnes');
  const [categories, setCategories] = useState<Categories>(new Map());
  // Les lots en attente d'envoi, par campagne : voir l'en-tête du fichier.
  const [lots, setLots] = useState<Record<string, PeseeEnAttente[]>>({});
  const majLot = useCallback((campagneId: string, maj: (lot: PeseeEnAttente[]) => PeseeEnAttente[]) => {
    setLots((tous) => ({ ...tous, [campagneId]: maj(tous[campagneId] ?? LOT_VIDE) }));
  }, []);
  const [envois, setEnvois] = useState<Record<string, boolean>>({});
  const marquerEnvoi = useCallback((campagneId: string, enCours: boolean) => setEnvois((e) => ({ ...e, [campagneId]: enCours })), []);
  const [versionsRegistre, setVersionsRegistre] = useState<Record<string, number>>({});
  const registreChange = useCallback(
    (campagneId: string) => setVersionsRegistre((v) => ({ ...v, [campagneId]: (v[campagneId] ?? 0) + 1 })),
    []
  );
  const suivi: SuiviLots = { lots, majLot, envois, marquerEnvoi, versionsRegistre, registreChange };
  // Pendant un envoi, on ne quitte pas la partie : sa réponse doit trouver la carte qui l'attend.
  const envoiEnCours = Object.values(envois).some(Boolean);

  // Les libellés des catégories : sans eux, le code s'affiche, et rien n'est faux.
  useEffect(() => {
    api
      .listesAssimiles()
      .then((l) => {
        const m: Categories = new Map();
        for (const e of l.listes.find((x) => x.liste === 'categories_activite_assimiles')?.elements ?? []) {
          // L'élément le plus récent d'un code l'emporte, et un élément retiré (saisi à tort) ne nomme rien.
          const avant = m.get(e.code);
          if (!e.retire_le && (!avant || (e.date_effet ?? '') > (avant.date_effet ?? ''))) m.set(e.code, e);
        }
        setCategories(m);
      })
      .catch(() => setCategories(new Map()));
  }, []);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.campagnesPesee.titre')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-ardoise-500">{t('communal.campagnesPesee.chapeau')}</p>
      </header>
      {!peutEcrire && <p className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">{t('communal.campagnesPesee.lectureSeule')}</p>}

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('communal.campagnesPesee.parties.libelle')}>
        {PARTIES.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={partie === p}
            disabled={envoiEnCours && partie !== p}
            onClick={() => setPartie(p)}
            className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${
              partie === p ? 'border-siipi-600 bg-siipi-600 text-white' : 'border-ardoise-300 bg-white text-ardoise-700'
            }`}
          >
            {t(`communal.campagnesPesee.parties.${p}`)}
          </button>
        ))}
      </div>
      {envoiEnCours && <p role="status" className="text-sm text-ardoise-600">{t('communal.campagnesPesee.envoiEnCours')}</p>}

      {partie === 'campagnes' && (
        <PartieCampagnes communeId={communeId} peutEcrire={peutEcrire} categories={categories} suivi={suivi} />
      )}
      {partie === 'densites' && <PartieDensites communeId={communeId} peutEcrire={peutEcrire} />}
    </div>
  );
}

/** Le nom d'un groupe de résultats : une catégorie d'activité, ou une tranche de revenu. */
function useLibelles(categories: Categories) {
  const { t, i18n } = useTranslation();
  const arabe = i18n.language.startsWith('ar');
  const categorie = (code: string) => {
    const e = categories.get(code);
    return e ? (arabe ? e.libelle_ar : e.libelle_fr) : code;
  };
  const groupe = (c: { objet: CampagnePesee['objet'] }, g: string) => (c.objet === 'menages' ? t(`campagnesPesee.tranches.${g}`, { defaultValue: g }) : categorie(g));
  const indicateur = (ind: string, sousGroupe: string) => {
    if (ind === 'kg_jour_unite') {
      // Une ligne sans unité est celle d'un écarté : les écartés se comptent toutes unités
      // confondues, et un établissement changé de catégorie n'en garde aucune. L'indicateur
      // se nomme alors sans elle, et c'est la raison qui dit ce qui manque ou ce qui a
      // changé : « unité non précisée » la disait absente à côté d'« unité changée ».
      if (sousGroupe === '') return t('campagnesPesee.indicateurs.kg_jour_unite_sans_unite');
      return t('campagnesPesee.indicateurs.kg_jour_unite', { unite: t(`campagnesPesee.unites.${sousGroupe}`, { defaultValue: sousGroupe }) });
    }
    if (ind === 'kg_levee') {
      const v = Number(sousGroupe);
      // Un écarté « sans volume » n'a pas de contenant : l'indicateur se nomme sans lui.
      if (sousGroupe === '' || !Number.isFinite(v)) return t('campagnesPesee.indicateurs.kg_levee_sans_volume');
      return t('campagnesPesee.indicateurs.kg_levee', { volume: formaterNombre(v, Number.isInteger(v) ? 0 : 1) });
    }
    return t(`campagnesPesee.indicateurs.${ind}`, { defaultValue: ind });
  };
  return { categorie, groupe, indicateur };
}

// ---------------------------------------------------------------------------
// Les campagnes
// ---------------------------------------------------------------------------
function PartieCampagnes({
  communeId,
  peutEcrire,
  categories,
  suivi,
}: {
  communeId: string;
  peutEcrire: boolean;
  categories: Categories;
  suivi: SuiviLots;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const [liste, setListe] = useState<CampagnePesee[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ouverteId, setOuverteId] = useState<string | null>(null);

  // Seule la dernière lecture demandée s'affiche : une liste relue après un geste ne
  // se laisse pas écraser par une lecture plus ancienne, arrivée plus tard.
  const derniere = useRef(0);
  const charger = useCallback(async () => {
    const numero = ++derniere.current;
    try {
      const lue = await api.campagnesPesee(communeId);
      if (numero !== derniere.current) return;
      setListe(lue);
      setErreur(null);
    } catch (err) {
      if (numero !== derniere.current) return;
      setErreur(texteErreur(err, t('commun.erreur')));
    }
  }, [communeId, t]);
  useEffect(() => {
    void charger();
  }, [charger]);

  const ajout = useAjoutEnLigne('campagne-pesee', communeId, t('communal.campagnesPesee.nouvelle'), async () => {
    setMessage(t('communal.campagnesPesee.messages.creee'));
    await charger();
  });

  if (erreur && !liste) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!liste) return <Chargement />;

  return (
    <section className="space-y-3" aria-labelledby="campagnes-titre">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="campagnes-titre" className="text-base font-semibold text-ardoise-900">{t('communal.campagnesPesee.parties.campagnes')}</h2>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-600">{t('communal.campagnesPesee.campagnesAide')}</p>
        </div>
        <div className="flex flex-wrap gap-2">{ajout.bouton}</div>
      </div>
      {ajout.formulaire}
      {message && <p role="status" className="rounded-lg bg-siipi-50 p-3 text-sm text-siipi-800">{message}</p>}
      {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}

      {liste.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ardoise-300 bg-white p-4 text-sm text-ardoise-600">{t('communal.campagnesPesee.aucune')}</p>
      ) : (
        <ul className="space-y-3">
          {liste.map((c) => {
            const lot = suivi.lots[c.id] ?? LOT_VIDE;
            const envoiLot = suivi.envois[c.id] ?? false;
            return (
              <li key={c.id} className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ardoise-900">{c.intitule}</p>
                    <p className="text-sm text-ardoise-600">{t('campagnesPesee.periode', { debut: f.date(c.date_debut), fin: f.date(c.date_fin) })}</p>
                    <p className="text-xs text-ardoise-600">
                      {t('communal.campagnesPesee.compteurPesees', { count: c.pesees, n: formaterNombre(c.pesees, 0) })}
                      {' · '}
                      {c.objet === 'menages'
                        ? t('communal.campagnesPesee.compteurMenages', { count: c.menages, n: formaterNombre(c.menages, 0) })
                        : t('communal.campagnesPesee.compteurEtablissements', { count: c.etablissements, n: formaterNombre(c.etablissements, 0) })}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {/* Carte repliée ou non, un lot qui attend se voit : il n'est pas parti. */}
                    {lot.length > 0 && (
                      <Pastille ton="attention">{t('communal.campagnesPesee.lotEnAttente', { count: lot.length, n: formaterNombre(lot.length, 0) })}</Pastille>
                    )}
                    <Pastille ton="neutre">{t(`campagnesPesee.objets.${c.objet}`)}</Pastille>
                    <Pastille ton={TON_STATUT[c.statut]}>{t(`campagnesPesee.statuts.${c.statut}`)}</Pastille>
                  </div>
                </div>
                <button
                  type="button"
                  className={boutonDiscret}
                  aria-expanded={ouverteId === c.id}
                  disabled={ouverteId === c.id && envoiLot}
                  onClick={() => {
                    setMessage(null);
                    setOuverteId(ouverteId === c.id ? null : c.id);
                  }}
                >
                  {ouverteId === c.id ? t('communal.campagnesPesee.masquer') : t('communal.campagnesPesee.detail')}
                </button>
                {ouverteId === c.id && (
                  <DetailCampagne
                    communeId={communeId}
                    resume={c}
                    peutEcrire={peutEcrire}
                    categories={categories}
                    lot={lot}
                    majLot={(maj) => suivi.majLot(c.id, maj)}
                    envoiLot={envoiLot}
                    marquerEnvoi={(enCours) => suivi.marquerEnvoi(c.id, enCours)}
                    versionRacine={suivi.versionsRegistre[c.id] ?? 0}
                    registreChange={() => suivi.registreChange(c.id)}
                    onListeChangee={charger}
                    onRetiree={async (texte) => {
                      setOuverteId(null);
                      setMessage(texte);
                      await charger();
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Une campagne : ses gestes, ses ménages, ses pesées, ses résultats
// ---------------------------------------------------------------------------
type Confirmation = 'clore' | 'retirer' | null;

function DetailCampagne({
  communeId,
  resume,
  peutEcrire,
  categories,
  lot,
  majLot,
  envoiLot,
  marquerEnvoi,
  versionRacine,
  registreChange,
  onListeChangee,
  onRetiree,
}: {
  communeId: string;
  resume: CampagnePesee;
  peutEcrire: boolean;
  categories: Categories;
  lot: PeseeEnAttente[];
  majLot: MajLot;
  envoiLot: boolean;
  marquerEnvoi: (enCours: boolean) => void;
  /** La version du registre tenue au-dessus des cartes : une carte remontée relit ce qu'un envoi a écrit. */
  versionRacine: number;
  registreChange: () => void;
  onListeChangee: () => Promise<void>;
  onRetiree: (message: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const [detail, setDetail] = useState<CampagnePeseeDetail | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [menages, setMenages] = useState<MenageEchantillon[] | null>(null);
  // null veut dire « pas encore lu » ; un échec se dit à part, avec de quoi réessayer.
  const [menagesEchec, setMenagesEchec] = useState(false);
  const [modification, setModification] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [importOuvert, setImportOuvert] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // La version du registre des pesées : la section des pesées et le journal des imports
  // se relisent sur elle, sans être remontés — la saisie en cours et les messages restent.
  const [versionPesees, setVersionPesees] = useState(0);

  const derniere = useRef(0);
  const relire = useCallback(async () => {
    const numero = ++derniere.current;
    try {
      const lue = await api.campagnePesee(resume.id);
      if (numero !== derniere.current) return null;
      setDetail(lue);
      setErreurLecture(null);
      return lue;
    } catch (err) {
      if (numero !== derniere.current) return null;
      setErreurLecture(texteErreur(err, t('commun.erreur')));
      return null;
    }
  }, [resume.id, t]);
  useEffect(() => {
    void relire();
  }, [relire]);

  // Les ménages : le directeur seul, et une campagne de ménages seulement.
  const lireMenages = useCallback(async () => {
    if (!peutEcrire || resume.objet !== 'menages') return;
    try {
      setMenages(await api.menagesCampagne(resume.id));
      setMenagesEchec(false);
    } catch {
      setMenagesEchec(true);
    }
  }, [peutEcrire, resume.objet, resume.id]);
  useEffect(() => {
    void lireMenages();
  }, [lireMenages]);

  if (erreurLecture && !detail) return <Erreur message={erreurLecture} onReessayer={() => void relire()} />;
  if (!detail) return <Chargement />;
  const c = detail;
  // Un lot qui attend : la clôture figerait les résultats sans lui. Elle attend qu'il soit
  // envoyé, ou que le directeur en retire lui-même ce qu'il ne veut pas.
  const lotEnAttente = peutEcrire && c.statut === 'ouverte' && lot.length > 0;

  /** Un geste avec la version lue ; un refus s'affiche dans la carte, après la relecture. */
  const agir = async (action: () => Promise<CampagnePeseeDetail | void>, succes: string) => {
    setEnvoi(true);
    setRefus(null);
    setMessage(null);
    try {
      const r = await action();
      setConfirmation(null);
      if (r) setDetail(r);
      setMessage(t(succes));
      await onListeChangee();
    } catch (err) {
      const texte = texteErreur(err, t('commun.erreur'));
      // La campagne a changé : elle se relit d'abord, sinon le prochain essai
      // repartirait encore avec l'ancienne version.
      if (err instanceof ErreurApi && err.statut === 404) {
        await onRetiree(t('communal.campagnesPesee.introuvable', { intitule: c.intitule }));
        return;
      }
      if (err instanceof ErreurApi && err.statut === 409) {
        await relire();
        await onListeChangee();
      }
      setRefus(texte);
    } finally {
      setEnvoi(false);
    }
  };

  const retirer = async () => {
    setEnvoi(true);
    setRefus(null);
    try {
      await api.retirerCampagnePesee(c.id, c.version);
      await onRetiree(t('communal.campagnesPesee.messages.retiree', { intitule: c.intitule }));
    } catch (err) {
      if (err instanceof ErreurApi && err.statut === 404) {
        await onRetiree(t('communal.campagnesPesee.introuvable', { intitule: c.intitule }));
        return;
      }
      // Ouverte ou modifiée ailleurs : le détail ET l'en-tête de la carte se relisent,
      // sinon la pastille dirait « Brouillon » au-dessus d'un détail « Ouverte ».
      if (err instanceof ErreurApi && err.statut === 409) {
        await relire();
        await onListeChangee();
      }
      setRefus(texteErreur(err, t('commun.erreur')));
    } finally {
      setEnvoi(false);
    }
  };

  /** Après un lot, une annulation ou un import : le registre, la campagne, l'échantillon et les compteurs de la carte. */
  const apresPesees = async () => {
    setVersionPesees((v) => v + 1);
    const lue = await relire();
    await lireMenages();
    await onListeChangee();
    return lue;
  };

  /** Après l'ajout d'un ménage : l'échantillon, et le compteur de la carte. */
  const apresMenage = async () => {
    await lireMenages();
    await onListeChangee();
  };

  /**
   * Un geste refusé dans une section (lot, annulation, ménage) : la campagne se relit
   * avant que le refus ne s'affiche. Close ailleurs, sa saisie disparaît avec le message
   * qu'elle portait : le refus se dit alors dans la carte. Disparue, la carte se ferme.
   */
  const surRefus = async (statut: number, texte: string) => {
    const lue = await relire();
    await onListeChangee();
    if (!lue && statut === 404) {
      await onRetiree(t('communal.campagnesPesee.introuvable', { intitule: c.intitule }));
      return;
    }
    if (lue && lue.statut === 'close') setRefus(texte);
  };

  return (
    <div className="space-y-4 rounded-lg border border-ardoise-100 p-3">
      {c.protocole && (
        <div className="text-sm">
          <p className="font-medium text-ardoise-800">{t('communal.campagnesPesee.protocole')}</p>
          <p className="whitespace-pre-line text-ardoise-700">{c.protocole}</p>
        </div>
      )}
      {c.observation && <p className="text-sm text-ardoise-600">{c.observation}</p>}
      <p className="text-xs text-ardoise-600">
        {[
          c.ouverte_le ? t('communal.campagnesPesee.ouverteLe', { date: f.date(c.ouverte_le) }) : null,
          c.close_le ? t('communal.campagnesPesee.closeLe', { date: f.date(c.close_le) }) : null,
          // Aucun seuil d'échantillon ne vaut pour des ménages (la base ne le lit pas pour
          // eux) : leur seule règle est le masquage d'une tranche de moins de 5 ménages.
          // « Seuil appliqué : 10 » ferait lire une tranche de 6 comme « au seuil ».
          c.seuil_applique != null && c.objet === 'etablissements'
            ? t('communal.campagnesPesee.seuilApplique', { n: formaterNombre(c.seuil_applique, 0) })
            : null,
          c.statut === 'close' && c.objet === 'menages' ? t('communal.campagnesPesee.regleMenages') : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>

      {message && <p role="status" className="rounded-lg bg-siipi-50 p-3 text-sm text-siipi-800">{message}</p>}

      {/* Les gestes de l'état présent -------------------------------------- */}
      {peutEcrire && c.statut !== 'close' && !modification && (
        <div className="flex flex-wrap gap-2">
          {c.statut === 'brouillon' && (
            <>
              <button type="button" className={bouton} disabled={envoi} onClick={() => void agir(() => api.ouvrirCampagnePesee(c.id, c.version), 'communal.campagnesPesee.messages.ouverte')}>
                {t('communal.campagnesPesee.ouvrir')}
              </button>
              <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => setModification(true)}>
                {t('communal.campagnesPesee.modifier')}
              </button>
              <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => setConfirmation('retirer')}>
                {t('communal.campagnesPesee.retirer')}
              </button>
            </>
          )}
          {c.statut === 'ouverte' && (
            <>
              <button type="button" className={bouton} disabled={envoi || lotEnAttente} onClick={() => setConfirmation('clore')}>
                {t('communal.campagnesPesee.clore')}
              </button>
              <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => setModification(true)}>
                {t('communal.campagnesPesee.modifierFin')}
              </button>
              {c.objet === 'etablissements' && (
                <button type="button" className={boutonDiscret} aria-expanded={importOuvert} onClick={() => setImportOuvert((o) => !o)}>
                  {importOuvert ? t('commun.annuler') : t('communal.campagnesPesee.importer')}
                </button>
              )}
            </>
          )}
        </div>
      )}
      {lotEnAttente && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {t('communal.campagnesPesee.cloreLotEnAttente', { count: lot.length, n: formaterNombre(lot.length, 0) })}
        </p>
      )}
      {c.statut === 'brouillon' && <p className="text-xs text-ardoise-600">{t('communal.campagnesPesee.brouillonAide')}</p>}

      {confirmation && (
        <div className="space-y-2 rounded-lg bg-ardoise-50 p-3">
          <p className="text-sm text-ardoise-700">
            {confirmation === 'clore' ? t('communal.campagnesPesee.cloreAide') : t('communal.campagnesPesee.retirerAide')}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={bouton}
              disabled={envoi || (confirmation === 'clore' && lotEnAttente)}
              onClick={() =>
                void (confirmation === 'clore' ? agir(() => api.cloreCampagnePesee(c.id, c.version), 'communal.campagnesPesee.messages.close') : retirer())
              }
            >
              {confirmation === 'clore' ? t('communal.campagnesPesee.confirmerClore') : t('communal.campagnesPesee.confirmerRetrait')}
            </button>
            <button type="button" className={boutonDiscret} onClick={() => setConfirmation(null)}>
              {t('commun.annuler')}
            </button>
          </div>
        </div>
      )}
      {refus && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{refus}</p>}

      {/* Le formulaire fige la campagne à son ouverture : relue entre-temps, elle ne le change pas. */}
      {modification && c.statut !== 'close' && (
        <FormulaireCampagnePesee
          communeId={communeId}
          campagne={c}
          onAnnuler={() => setModification(false)}
          onConflit={async () => {
            const lue = await relire();
            await onListeChangee();
            // Close entre-temps : il n'y a plus rien à modifier ; le formulaire se ferme et la carte le dit.
            if (lue?.statut === 'close') {
              setModification(false);
              setRefus(t('communal.campagnesPesee.closeEntreTemps'));
            }
            return lue;
          }}
          onIntrouvable={() => onRetiree(t('communal.campagnesPesee.introuvable', { intitule: c.intitule }))}
          onFait={async (r) => {
            setModification(false);
            if (r) setDetail(r);
            setMessage(t('communal.campagnesPesee.messages.modifiee'));
            await onListeChangee();
          }}
        />
      )}

      {importOuvert && c.statut === 'ouverte' && (
        <ImportPesees
          communeId={communeId}
          campagneId={c.id}
          onAnnuler={() => setImportOuvert(false)}
          onFait={async () => {
            setMessage(t('communal.campagnesPesee.messages.importe'));
            await apresPesees();
          }}
          onBaseChangee={async () => {
            // Close ailleurs, la campagne démonte le panneau d'import et le refus qu'il
            // portait : la carte le dit, comme pour un lot, une annulation ou un ménage.
            const lue = await apresPesees();
            if (lue?.statut === 'close') setRefus(t('communal.campagnesPesee.closeEntreTemps'));
          }}
        />
      )}

      {c.statut === 'close' && <Resultats campagne={c} categories={categories} peutEcrire={peutEcrire} onAdoptee={relire} />}

      {c.objet === 'menages' &&
        (peutEcrire ? (
          <SectionMenages
            campagne={c}
            menages={menages}
            echec={menagesEchec}
            onReessayer={lireMenages}
            onAjoute={apresMenage}
            onRefus={surRefus}
          />
        ) : (
          <p className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">{t('communal.campagnesPesee.menagesFnct')}</p>
        ))}

      {/* La FNCT ne lit aucun ménage : ni leur liste, ni leurs pesées. */}
      {(c.objet === 'etablissements' || peutEcrire) && (
        <SectionPesees
          communeId={communeId}
          campagne={c}
          peutEcrire={peutEcrire}
          menages={menages}
          versionRegistre={versionPesees + versionRacine}
          lot={lot}
          majLot={majLot}
          envoiLot={envoiLot}
          marquerEnvoi={marquerEnvoi}
          registreChange={registreChange}
          onChange={apresPesees}
          onRefus={surRefus}
        />
      )}

      {c.objet === 'etablissements' && <JournalImports campagneId={c.id} version={versionPesees + versionRacine} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Les résultats d'une campagne close
// ---------------------------------------------------------------------------
function Resultats({
  campagne: c,
  categories,
  peutEcrire,
  onAdoptee,
}: {
  campagne: CampagnePeseeDetail;
  categories: Categories;
  peutEcrire: boolean;
  onAdoptee: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const libelles = useLibelles(categories);
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<{ groupe: string; texte: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Les groupes dans l'ordre de la base (alphabétique des codes), chacun avec ses lignes.
  const groupes = useMemo(() => {
    const m = new Map<string, ResultatCampagne[]>();
    for (const r of c.resultats) m.set(r.groupe, [...(m.get(r.groupe) ?? []), r]);
    for (const e of c.ecartes) if (!m.has(e.groupe)) m.set(e.groupe, []);
    return [...m.entries()].map(([groupe, lignes]) => ({
      groupe,
      lignes: [...lignes].sort((a, b) => ORDRE_INDICATEURS.indexOf(a.indicateur) - ORDRE_INDICATEURS.indexOf(b.indicateur) || a.sous_groupe.localeCompare(b.sous_groupe, undefined, { numeric: true })),
      ecartes: c.ecartes.filter((e) => e.groupe === groupe),
    }));
  }, [c.resultats, c.ecartes]);

  const adopter = async (groupe: string) => {
    setEnvoi(true);
    setRefus(null);
    setMessage(null);
    try {
      await api.adopterDensite(c.id, groupe);
      setMessage(t('communal.campagnesPesee.messages.adoptee', { categorie: libelles.categorie(groupe) }));
      await onAdoptee();
    } catch (err) {
      // Une autre densité vaut déjà, ou l'adoption a eu lieu ailleurs : la campagne se relit.
      if (err instanceof ErreurApi && (err.statut === 409 || err.statut === 404)) await onAdoptee();
      setRefus({ groupe, texte: texteErreur(err, t('commun.erreur')) });
    } finally {
      setEnvoi(false);
    }
  };

  const valeur = (r: ResultatCampagne, v: number | null) => (v === null ? '—' : formaterMesure(v, DECIMALES[r.indicateur]));
  const menages = c.objet === 'menages';

  return (
    <section className="space-y-3" aria-labelledby={`resultats-${c.id}`}>
      <div>
        <h3 id={`resultats-${c.id}`} className="text-base font-semibold text-ardoise-900">{t('communal.campagnesPesee.resultats.titre')}</h3>
        <p className="mt-1 max-w-3xl text-sm text-ardoise-600">
          {menages ? t('communal.campagnesPesee.resultats.aideMenages') : t('communal.campagnesPesee.resultats.aide', { n: formaterNombre(c.seuil_applique ?? 0, 0) })}
        </p>
      </div>
      {message && <p role="status" className="rounded-lg bg-siipi-50 p-3 text-sm text-siipi-800">{message}</p>}
      {groupes.length === 0 && (
        <p className="rounded-xl border border-dashed border-ardoise-300 p-4 text-sm text-ardoise-600">{t('communal.campagnesPesee.resultats.aucun')}</p>
      )}
      {groupes.map(({ groupe, lignes, ecartes }) => (
        <div key={groupe} className="space-y-2 rounded-lg border border-ardoise-200 p-3">
          <h4 className="font-medium text-ardoise-900">{libelles.groupe(c, groupe)}</h4>
          {lignes.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="text-xs text-ardoise-500">
                    <th className="px-2 py-1 text-start font-normal">{t('communal.campagnesPesee.resultats.indicateur')}</th>
                    <th className="px-2 py-1 text-end font-normal">{t('communal.campagnesPesee.resultats.n')}</th>
                    <th className="px-2 py-1 text-end font-normal">{t('communal.campagnesPesee.resultats.fourchette')}</th>
                    <th className="px-2 py-1 text-end font-normal">{t('communal.campagnesPesee.resultats.mediane')}</th>
                    <th className="px-2 py-1 text-start font-normal">{t('communal.campagnesPesee.resultats.etat')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((r) => {
                    // Sous le seuil, les quartiles se lisent mais ne proposent rien : ils s'effacent à l'œil.
                    const effaces = r.seuil_atteint === false;
                    return (
                      <tr key={`${r.indicateur}-${r.sous_groupe}`} className="border-t border-ardoise-100 align-top">
                        <th scope="row" className="px-2 py-2 text-start font-normal text-ardoise-800">{libelles.indicateur(r.indicateur, r.sous_groupe)}</th>
                        <td className="chiffres px-2 py-2 text-end">{formaterNombre(r.n, 0)}</td>
                        <td className={`chiffres px-2 py-2 text-end ${effaces ? 'text-ardoise-400' : ''}`}>
                          {r.masque ? '—' : <bdi dir="ltr">{`${valeur(r, r.q1)} – ${valeur(r, r.q3)}`}</bdi>}
                        </td>
                        <td className={`chiffres px-2 py-2 text-end font-medium ${effaces ? 'text-ardoise-400' : 'text-ardoise-900'}`}>
                          {r.masque ? '—' : valeur(r, r.mediane)}
                        </td>
                        <td className="space-y-1 px-2 py-2">
                          {r.masque ? (
                            <Pastille ton="neutre">{t('communal.campagnesPesee.resultats.masque')}</Pastille>
                          ) : r.seuil_atteint === true ? (
                            <Pastille ton="mesure">{t('communal.campagnesPesee.resultats.seuilAtteint')}</Pastille>
                          ) : r.seuil_atteint === false ? (
                            <Pastille ton="attention">{t('communal.campagnesPesee.resultats.sousSeuil')}</Pastille>
                          ) : null}
                          {r.indicateur === 'kg_m3' && r.adoptee && (
                            <span className="block">
                              <Pastille ton="mesure">{t('communal.campagnesPesee.resultats.adoptee')}</Pastille>
                            </span>
                          )}
                          {r.indicateur === 'kg_m3' && r.seuil_atteint === true && !r.adoptee && peutEcrire && (
                            <button type="button" className={`${boutonDiscret} block`} disabled={envoi} onClick={() => void adopter(groupe)}>
                              {t('communal.campagnesPesee.resultats.adopter')}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {lignes.some((r) => r.masque) && <p className="text-xs text-ardoise-600">{t('communal.campagnesPesee.resultats.masqueAide')}</p>}
          {lignes.some((r) => r.seuil_atteint === false) && (
            <p className="text-xs text-amber-900">{t('communal.campagnesPesee.resultats.sousSeuilAide', { n: formaterNombre(c.seuil_applique ?? 0, 0) })}</p>
          )}
          {ecartes.length > 0 && (
            <ul className="list-disc space-y-0.5 ps-5 text-xs text-ardoise-700">
              {ecartes.map((e) => (
                <li key={`${e.indicateur}-${e.raison}`}>
                  {t(menages ? 'communal.campagnesPesee.resultats.ecartesMenages' : 'communal.campagnesPesee.resultats.ecartesEtablissements', {
                    count: e.nombre,
                    n: formaterNombre(e.nombre, 0),
                    // Les écartés se comptent par groupe, indicateur et raison, sans unité ni
                    // contenant : l'indicateur se nomme donc sans eux.
                    indicateur: libelles.indicateur(e.indicateur, ''),
                    raison: t(`campagnesPesee.raisons.${e.raison}`, { defaultValue: e.raison }),
                  })}
                </li>
              ))}
            </ul>
          )}
          {refus?.groupe === groupe && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{refus.texte}</p>}
        </div>
      ))}

      {!menages && c.mesures.length > 0 && (
        <details className="rounded-lg border border-ardoise-200 p-3">
          <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-ardoise-800">
            {t('communal.campagnesPesee.resultats.mesures', { count: c.mesures.length, n: formaterNombre(c.mesures.length, 0) })}
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-xs text-ardoise-500">
                  <th className="px-2 py-1 text-start font-normal">{t('communal.campagnesPesee.resultats.etablissement')}</th>
                  <th className="px-2 py-1 text-start font-normal">{t('communal.campagnesPesee.resultats.indicateur')}</th>
                  <th className="px-2 py-1 text-end font-normal">{t('communal.campagnesPesee.resultats.valeur')}</th>
                </tr>
              </thead>
              <tbody>
                {c.mesures.map((m) => (
                  <tr key={`${m.commerce_id}-${m.indicateur}-${m.sous_groupe}`} className="border-t border-ardoise-100 align-top">
                    <td className="px-2 py-1.5 text-ardoise-800">
                      {m.etablissement}
                      <span className="block text-xs text-ardoise-500">{libelles.categorie(m.groupe)}</span>
                    </td>
                    <td className="px-2 py-1.5 text-ardoise-700">{libelles.indicateur(m.indicateur, m.sous_groupe)}</td>
                    <td className="px-2 py-1.5 text-end">
                      {m.valeur !== null ? (
                        <span className="chiffres">{formaterMesure(m.valeur, DECIMALES[m.indicateur as IndicateurCampagne] ?? 2)}</span>
                      ) : (
                        <span className="text-xs text-ardoise-600">
                          {t('communal.campagnesPesee.resultats.ecarte', { raison: t(`campagnesPesee.raisons.${m.raison_ecart}`, { defaultValue: m.raison_ecart ?? '' }) })}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// L'échantillon de ménages (le directeur seul)
// ---------------------------------------------------------------------------
function SectionMenages({
  campagne: c,
  menages,
  echec,
  onReessayer,
  onAjoute,
  onRefus,
}: {
  campagne: CampagnePeseeDetail;
  /** null : pas encore lu. */
  menages: MenageEchantillon[] | null;
  echec: boolean;
  onReessayer: () => Promise<void>;
  onAjoute: () => Promise<void>;
  onRefus: (statut: number, texte: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [habitants, setHabitants] = useState('');
  const [tranche, setTranche] = useState<TrancheRevenu | ''>('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const n = nombre(habitants);
  const habitantsValables = n !== null && Number.isInteger(n) && n >= 1 && n <= 30;

  const ajouter = async () => {
    if (!habitantsValables || !tranche) return;
    setEnvoi(true);
    setErreur(null);
    setMessage(null);
    try {
      const m = await api.ajouterMenage(c.id, { habitants: n as number, trancheRevenu: tranche });
      setMessage(t('communal.campagnesPesee.menages.ajoute', { code: m.code }));
      setHabitants('');
      setTranche('');
      await onAjoute();
    } catch (err) {
      const texte = texteErreur(err, t('commun.erreur'));
      // Close ou retirée ailleurs : la campagne se relit, et la carte avec elle.
      if (err instanceof ErreurApi && (err.statut === 409 || err.statut === 404)) await onRefus(err.statut, texte);
      setErreur(texte);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <section className="space-y-3" aria-labelledby={`menages-${c.id}`}>
      <div>
        <h3 id={`menages-${c.id}`} className="text-base font-semibold text-ardoise-900">{t('communal.campagnesPesee.menages.titre')}</h3>
        <p className="mt-1 max-w-3xl text-sm text-ardoise-600">{t('communal.campagnesPesee.menages.aide')}</p>
      </div>
      {c.statut !== 'close' && (
        <div className="grid gap-2 rounded-lg bg-ardoise-50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-sm">
            {t('communal.campagnesPesee.menages.habitants')}
            <input value={habitants} onChange={(e) => setHabitants(e.target.value)} inputMode="numeric" className={`${champ} text-end`} />
          </label>
          <label className="text-sm">
            {t('communal.campagnesPesee.menages.tranche')}
            <select value={tranche} onChange={(e) => setTranche(e.target.value as TrancheRevenu | '')} className={champ}>
              <option value="">{t('ajout.etablissement.choisir')}</option>
              {TRANCHES.map((x) => (
                <option key={x} value={x}>{t(`campagnesPesee.tranches.${x}`)}</option>
              ))}
            </select>
          </label>
          <button type="button" className={bouton} disabled={envoi || !habitantsValables || !tranche} onClick={() => void ajouter()}>
            {t('communal.campagnesPesee.menages.ajouter')}
          </button>
          {habitants.trim() !== '' && !habitantsValables && (
            <p className="text-xs text-ardoise-600 sm:col-span-3">{t('communal.campagnesPesee.menages.habitantsBornes')}</p>
          )}
        </div>
      )}
      {message && <p role="status" className="rounded-lg bg-siipi-50 p-2 text-sm text-siipi-800">{message}</p>}
      {erreur && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{erreur}</p>}
      {echec ? (
        <Erreur message={t('communal.campagnesPesee.menages.indisponibles')} onReessayer={() => void onReessayer()} />
      ) : menages === null ? (
        <Chargement />
      ) : menages.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ardoise-300 p-3 text-sm text-ardoise-600">{t('communal.campagnesPesee.menages.aucun')}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {menages.map((m) => (
            <li key={m.id} className="rounded-lg border border-ardoise-200 p-2 text-sm">
              <bdi dir="ltr" className="font-mono font-medium text-ardoise-900">{m.code}</bdi>
              <span className="block text-xs text-ardoise-600">
                {t('communal.campagnesPesee.menages.ligne', {
                  habitants: t('communal.campagnesPesee.menages.nbHabitants', { count: m.habitants, n: formaterNombre(m.habitants, 0) }),
                  tranche: t(`campagnesPesee.tranches.${m.tranche_revenu}`),
                  pesees: t('communal.campagnesPesee.compteurPesees', { count: m.pesees, n: formaterNombre(m.pesees, 0) }),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Les pesées : le lot à envoyer, puis le registre
// ---------------------------------------------------------------------------
type UniteDuree = 'jours' | 'heures';

function SectionPesees({
  communeId,
  campagne: c,
  peutEcrire,
  menages,
  versionRegistre,
  lot,
  majLot,
  envoiLot,
  marquerEnvoi,
  registreChange,
  onChange,
  onRefus,
}: {
  communeId: string;
  campagne: CampagnePeseeDetail;
  peutEcrire: boolean;
  menages: MenageEchantillon[] | null;
  /** Le registre se relit à chaque nouvelle version, sans que la section soit remontée. */
  versionRegistre: number;
  /** Le lot de la campagne, tenu au-dessus des cartes : voir l'en-tête du fichier. */
  lot: PeseeEnAttente[];
  majLot: MajLot;
  /** L'envoi du lot en cours, tenu au-dessus des cartes : une section remontée le voit encore. */
  envoiLot: boolean;
  marquerEnvoi: (enCours: boolean) => void;
  registreChange: () => void;
  onChange: () => Promise<unknown>;
  onRefus: (statut: number, texte: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const menagesCampagne = c.objet === 'menages';
  const saisie = peutEcrire && c.statut === 'ouverte';
  const [pesees, setPesees] = useState<PeseeCampagne[] | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [etablissements, setEtablissements] = useState<Etablissement[] | null>(null);
  const [etabIndisponibles, setEtabIndisponibles] = useState(false);
  const jourMax = c.date_fin < aujourdhui() ? c.date_fin : aujourdhui();
  const [cible, setCible] = useState('');
  const [date, setDate] = useState(jourMax);
  const [poids, setPoids] = useState('');
  const [duree, setDuree] = useState('1');
  const [uniteDuree, setUniteDuree] = useState<UniteDuree>('jours');
  const [contenant, setContenant] = useState('');
  const [volume, setVolume] = useState('');
  const [remplissage, setRemplissage] = useState('');
  const [envoi, setEnvoi] = useState(false);
  // Une annulation (locale) ou l'envoi du lot (tenu au-dessus des cartes) : l'un ou l'autre, et les gestes attendent.
  const occupe = envoi || envoiLot;
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [annulation, setAnnulation] = useState<{ id: string; motif: string } | null>(null);
  const [refusAnnulation, setRefusAnnulation] = useState<{ id: string; texte: string } | null>(null);

  const derniere = useRef(0);
  const charger = useCallback(async () => {
    const numero = ++derniere.current;
    try {
      const lues = await api.peseesCampagne(c.id);
      if (numero !== derniere.current) return;
      setPesees(lues);
      setErreurLecture(null);
    } catch (err) {
      if (numero !== derniere.current) return;
      setErreurLecture(texteErreur(err, t('commun.erreur')));
    }
  }, [c.id, t]);
  // Relu après un lot, une annulation ou un import, SANS remonter la section : une clé
  // changée effaçait en silence la saisie en cours, son unité, et les messages qui
  // disaient ce qui venait d'être enregistré ou annulé.
  useEffect(() => {
    void charger();
  }, [charger, versionRegistre]);

  // Les établissements qu'une pesée peut viser : avec leur catégorie d'activité (la base
  // refuse une pesée sans elle), et pas fermés avant le premier jour de la campagne. La
  // base, comme l'import, ne refuse un établissement fermé qu'à partir du jour de sa
  // fermeture : fermé pendant la campagne, il se pèse encore pour les jours d'avant, et
  // la liste dit sa date. Ceux qui manquent d'une catégorie se comptent.
  useEffect(() => {
    if (!saisie || menagesCampagne) return;
    api
      .etablissements(communeId)
      .then(setEtablissements)
      .catch(() => setEtabIndisponibles(true));
  }, [saisie, menagesCampagne, communeId]);
  const choisissables = useMemo(
    () =>
      (etablissements ?? [])
        .filter((e) => e.categorie_activite && (e.statut !== 'ferme' || (e.ferme_le !== null && e.ferme_le > c.date_debut)))
        .sort((a, b) => a.nom.localeCompare(b.nom)),
    [etablissements, c.date_debut]
  );
  const sansCategorie = (etablissements ?? []).filter((e) => e.statut !== 'ferme' && !e.categorie_activite).length;
  const etabChoisi = choisissables.find((e) => e.id === cible) ?? null;

  const nPoids = nombre(poids);
  const nDuree = nombre(duree);
  // Des heures se convertissent comme à l'import Kobo (6 décimales en jours) : la même
  // durée, par les deux chemins, s'écrit le même nombre.
  const dureeJours = nDuree === null || !Number.isFinite(nDuree) ? null : uniteDuree === 'heures' ? joursDepuisHeures(nDuree) : nDuree;
  const [nVolume, nRemplissage] = [nombre(volume), nombre(remplissage)];

  // Les pesées d'un même jour d'une cible couvrent la même durée : la règle se dit
  // avant l'envoi, d'après le registre et le lot.
  const dureeDejaFixee = useMemo(() => {
    if (!cible || !DATE.test(date)) return null;
    const enregistree = (pesees ?? []).find((p) => p.statut === 'valide' && (p.commerce_id ?? p.menage_id) === cible && p.date_pesee === date);
    if (enregistree) return enregistree.duree_jours;
    const enAttente = lot.find((p) => (p.commerceId ?? p.menageId) === cible && p.date === date);
    return enAttente ? enAttente.dureeJours : null;
  }, [cible, date, pesees, lot]);
  // Comparées au nombre que garde l'API, jamais à une valeur arrondie pour l'affichage.
  const dureeDifferente = dureeDejaFixee !== null && dureeJours !== null && arrondiJours(dureeDejaFixee) !== arrondiJours(dureeJours);

  // Chaque règle de l'API se vérifie avant l'entrée au lot, décimales comprises : le lot
  // s'écrit en entier ou pas du tout, et une seule valeur refusée le bloquait entier.
  const problemes: string[] = [];
  const cle = (s: string) => `communal.campagnesPesee.pesees.problemes.${s}`;
  if (!cible) problemes.push(t(cle(menagesCampagne ? 'menage' : 'etablissement')));
  if (!DATE.test(date) || date < c.date_debut || date > jourMax) problemes.push(t(cle('date'), { debut: f.date(c.date_debut), fin: f.date(jourMax) }));
  else if (etabChoisi?.statut === 'ferme' && etabChoisi.ferme_le && date >= etabChoisi.ferme_le) {
    problemes.push(t(cle('ferme'), { nom: etabChoisi.nom, date: f.date(etabChoisi.ferme_le) }));
  }
  if (nPoids === null || !Number.isFinite(nPoids) || nPoids <= 0 || nPoids > 5000 || !auPlusDecimales(nPoids, 3)) problemes.push(t(cle('poids')));
  const dureeLisible = nDuree !== null && Number.isFinite(nDuree) && auPlusDecimales(nDuree, uniteDuree === 'heures' ? 2 : 6);
  if (!dureeLisible || dureeJours === null || dureeJours <= 0 || dureeJours > 31) problemes.push(t(cle('duree')));
  else if (dureeDifferente) problemes.push(t(cle('dureeDuJour'), { date: f.date(date), duree: texteDuree(t, dureeDejaFixee as number) }));
  if (!menagesCampagne) {
    const volumeValable = nVolume === null || (Number.isFinite(nVolume) && nVolume > 0 && nVolume <= 30000 && auPlusDecimales(nVolume, 1));
    if (!volumeValable) problemes.push(t(cle('volume')));
    if (nRemplissage !== null && !(Number.isFinite(nRemplissage) && nRemplissage > 0 && nRemplissage <= 100 && auPlusDecimales(nRemplissage, 1))) {
      problemes.push(t(cle('remplissage')));
    }
    // La densité que la pesée impliquerait : la règle se dit avant le refus de la base,
    // avec sa cause la plus probable (le remplissage est un pourcentage).
    else if (volumeValable && nPoids !== null && nPoids > 0 && nVolume !== null && nRemplissage !== null && nRemplissage > 0) {
      const densite = nPoids / ((nVolume / 1000) * (nRemplissage / 100));
      if (densite > DENSITE_MAX) problemes.push(t(cle('densite'), { densite: formaterNombre(densite, 0), max: formaterNombre(DENSITE_MAX, 0) }));
    }
  }

  /** Pose la durée déjà fixée pour ce jour, dans une écriture qui redonne exactement la même valeur. */
  const reprendreDuree = (j: number) => {
    const h = Number.isInteger(j) ? null : heuresExactes(j);
    if (h !== null) {
      setUniteDuree('heures');
      setDuree(String(h).replace('.', ','));
    } else {
      setUniteDuree('jours');
      setDuree(String(arrondiJours(j)).replace('.', ','));
    }
  };

  const libelleCible = () =>
    menagesCampagne ? (menages ?? []).find((m) => m.id === cible)?.code ?? '' : etabChoisi?.nom ?? '';

  const ajouterAuLot = () => {
    if (occupe || problemes.length > 0) return;
    const commun = {
      cle: nouvelleCle(),
      libelle: libelleCible(),
      date,
      poidsKg: nPoids as number,
      dureeJours: dureeJours as number,
    };
    majLot((l) => [
      ...l,
      menagesCampagne
        ? { ...commun, menageId: cible }
        : {
            ...commun,
            commerceId: cible,
            contenant: contenant.trim() || null,
            volumeLitres: nVolume,
            remplissagePct: nRemplissage,
          },
    ]);
    setMessage(null);
    setPoids('');
  };

  const envoyer = async () => {
    // Ce qui part, pris au clic : la réponse ne retire du lot que ces pesées-là.
    const envoye = lot;
    if (envoye.length === 0 || occupe) return;
    marquerEnvoi(true);
    setErreur(null);
    setMessage(null);
    try {
      const r = await api.enregistrerPeseesCampagne(c.id, { pesees: envoye.map(({ libelle, ...p }) => (void libelle, p)) });
      const dejaRecues = r.pesees.filter((x) => x.deja_recue).length;
      const nouvelles = r.pesees.length - dejaRecues;
      setMessage(
        [
          t('communal.campagnesPesee.pesees.enregistrees', { count: nouvelles, n: formaterNombre(nouvelles, 0) }),
          dejaRecues > 0 ? t('communal.campagnesPesee.pesees.dejaRecues', { count: dejaRecues, n: formaterNombre(dejaRecues, 0) }) : '',
        ]
          .filter(Boolean)
          .join(' ')
      );
      // Arrivées : leurs clés ont servi.
      const parties = new Set(envoye.map((p) => p.cle));
      majLot((l) => l.filter((p) => !parties.has(p.cle)));
      // Tenue au-dessus des cartes : une section remontée entre-temps relit aussi son registre.
      registreChange();
      await onChange();
    } catch (err) {
      // Le lot s'écrit en entier ou pas du tout : il reste, avec ses clés, pour un nouvel essai.
      const texte = texteErreur(err, t('commun.erreur'));
      setErreur(texte);
      // La campagne a pu changer (close ailleurs) : elle se relit, pas seulement le registre.
      if (err instanceof ErreurApi && (err.statut === 409 || err.statut === 404)) {
        await charger();
        await onRefus(err.statut, texte);
      }
    } finally {
      marquerEnvoi(false);
    }
  };

  const annuler = async (p: PeseeCampagne, motif: string) => {
    setEnvoi(true);
    setRefusAnnulation(null);
    setMessage(null);
    try {
      await api.annulerPeseeCampagne(p.id, motif.trim());
      setAnnulation(null);
      setMessage(t('communal.campagnesPesee.pesees.annulee', { cible: p.etablissement ?? p.menage ?? '' }));
      await onChange();
    } catch (err) {
      const texte = texteErreur(err, t('commun.erreur'));
      setRefusAnnulation({ id: p.id, texte });
      if (err instanceof ErreurApi && (err.statut === 409 || err.statut === 404)) {
        await charger();
        await onRefus(err.statut, texte);
      }
    } finally {
      setEnvoi(false);
    }
  };

  /** Ce que porte une pesée, tel que la base le garde : rien n'est arrondi à l'affichage. */
  const mesuresDe = (poidsKg: number, dureeJ: number, volumeL: number | null | undefined, remplissagePct: number | null | undefined) =>
    [
      t('communal.campagnesPesee.pesees.poidsDuree', { poids: formaterExact(poidsKg, 3), duree: texteDuree(t, dureeJ) }),
      volumeL != null ? t('communal.campagnesPesee.pesees.volumeL', { v: formaterExact(volumeL, 1) }) : null,
      remplissagePct != null ? `${formaterExact(remplissagePct, 1)} %` : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const valides = (pesees ?? []).filter((p) => p.statut === 'valide').length;

  return (
    <section className="space-y-3" aria-labelledby={`pesees-${c.id}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id={`pesees-${c.id}`} className="text-base font-semibold text-ardoise-900">{t('communal.campagnesPesee.pesees.titre')}</h3>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-600">
            {menagesCampagne ? t('communal.campagnesPesee.pesees.aideMenages') : t('communal.campagnesPesee.pesees.aide')}
          </p>
        </div>
        {pesees && (
          <p className="flex items-baseline gap-2">
            <ChiffreCle valeur={formaterNombre(valides, 0)} taille="md" />
            <span className="text-sm text-ardoise-600">{t('communal.campagnesPesee.pesees.valides', { count: valides })}</span>
          </p>
        )}
      </div>
      {c.statut === 'brouillon' && <p className="text-sm text-ardoise-600">{t('communal.campagnesPesee.pesees.brouillon')}</p>}
      {message && <p role="status" className="rounded-lg bg-siipi-50 p-3 text-sm text-siipi-800">{message}</p>}

      {/* Un lot resté en attente quand la campagne a été close ailleurs : il ne peut plus
          partir. Il se montre, et c'est le directeur qui l'abandonne — rien ne s'efface seul. */}
      {peutEcrire && !saisie && lot.length > 0 && (
        <div role="alert" className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p>{t('communal.campagnesPesee.pesees.lotOrphelin', { count: lot.length, n: formaterNombre(lot.length, 0) })}</p>
          <ul className="list-disc space-y-0.5 ps-5 text-xs">
            {lot.map((p) => (
              <li key={p.cle}>
                {p.libelle} — {f.date(p.date)} · {mesuresDe(p.poidsKg, p.dureeJours, p.volumeLitres, p.remplissagePct)}
              </li>
            ))}
          </ul>
          <button type="button" className={boutonDiscret} onClick={() => majLot(() => LOT_VIDE)}>
            {t('communal.campagnesPesee.pesees.viderLot')}
          </button>
        </div>
      )}

      {/* La saisie, par lot ------------------------------------------------- */}
      {saisie && (
        <div className="space-y-3 rounded-lg bg-ardoise-50 p-3">
          {aujourdhui() < c.date_debut && (
            <p className="text-sm text-amber-900">{t('communal.campagnesPesee.pesees.pasCommencee', { date: f.date(c.date_debut) })}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm sm:col-span-2">
              {menagesCampagne ? t('communal.campagnesPesee.pesees.menage') : t('communal.campagnesPesee.pesees.etablissement')}
              <select value={cible} onChange={(e) => setCible(e.target.value)} className={champ}>
                <option value="">{t('ajout.etablissement.choisir')}</option>
                {menagesCampagne
                  ? (menages ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code} — {t(`campagnesPesee.tranches.${m.tranche_revenu}`)}
                      </option>
                    ))
                  : choisissables.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nom}
                        {e.matricule_fiscal ? ` — ${isolerLtr(e.matricule_fiscal)}` : ''}
                        {e.statut === 'ferme' && e.ferme_le ? ` — ${t('communal.campagnesPesee.pesees.fermeLe', { date: f.date(e.ferme_le) })}` : ''}
                      </option>
                    ))}
              </select>
              {menagesCampagne && menages && menages.length === 0 && (
                <span className="mt-1 block text-xs text-ardoise-600">{t('communal.campagnesPesee.pesees.aucunMenage')}</span>
              )}
              {!menagesCampagne && etabIndisponibles && (
                <span className="mt-1 block text-xs text-red-800">{t('communal.campagnesPesee.pesees.etablissementsIndisponibles')}</span>
              )}
              {!menagesCampagne && sansCategorie > 0 && (
                <span className="mt-1 block text-xs text-ardoise-600">
                  {t('communal.campagnesPesee.pesees.sansCategorie', { count: sansCategorie, n: formaterNombre(sansCategorie, 0) })}
                </span>
              )}
              {etabChoisi && !etabChoisi.unite_echelle && (
                <span className="mt-1 block text-xs text-amber-900">{t('communal.campagnesPesee.pesees.sansUnite')}</span>
              )}
            </label>
            <label className="text-sm">
              {t('communal.campagnesPesee.pesees.date')}
              <input type="date" value={date} min={c.date_debut} max={jourMax} onChange={(e) => setDate(e.target.value)} className={champ} />
            </label>
            <label className="text-sm">
              {t('communal.campagnesPesee.pesees.poids')}
              <input value={poids} onChange={(e) => setPoids(e.target.value)} inputMode="decimal" className={`${champ} text-end`} />
            </label>
            <div className="text-sm sm:col-span-2">
              <label htmlFor={`duree-${c.id}`}>{t('communal.campagnesPesee.pesees.duree')}</label>
              <div className="flex gap-2">
                <input id={`duree-${c.id}`} value={duree} onChange={(e) => setDuree(e.target.value)} inputMode="decimal" className={`${champ} text-end`} />
                <select
                  value={uniteDuree}
                  onChange={(e) => setUniteDuree(e.target.value as UniteDuree)}
                  className={`${champ} w-auto`}
                  aria-label={t('communal.campagnesPesee.pesees.uniteDuree')}
                >
                  <option value="jours">{t('communal.campagnesPesee.pesees.jours')}</option>
                  <option value="heures">{t('communal.campagnesPesee.pesees.heures')}</option>
                </select>
              </div>
              <span className="mt-1 block text-xs text-ardoise-500">{t('communal.campagnesPesee.pesees.dureeAide')}</span>
            </div>
            {!menagesCampagne && (
              <>
                <label className="text-sm">
                  {t('communal.campagnesPesee.pesees.contenant')}
                  <input value={contenant} onChange={(e) => setContenant(e.target.value)} maxLength={60} className={champ} />
                </label>
                <label className="text-sm">
                  {t('communal.campagnesPesee.pesees.volume')}
                  <input value={volume} onChange={(e) => setVolume(e.target.value)} inputMode="decimal" className={`${champ} text-end`} />
                </label>
                <label className="text-sm">
                  {t('communal.campagnesPesee.pesees.remplissage')}
                  <input value={remplissage} onChange={(e) => setRemplissage(e.target.value)} inputMode="decimal" className={`${champ} text-end`} />
                </label>
                <p className="text-xs text-ardoise-500 sm:col-span-2 lg:col-span-4">{t('communal.campagnesPesee.pesees.contenantAide')}</p>
              </>
            )}
          </div>
          {problemes.length > 0 && (cible || poids) && (
            <ul className="list-disc ps-5 text-sm text-ardoise-700">
              {problemes.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {/* La durée exacte déjà fixée pour ce jour se reprend d'un geste : retapée d'après un affichage arrondi, elle ne passerait jamais. */}
          {dureeDifferente && dureeDejaFixee !== null && (
            <button type="button" className={boutonDiscret} onClick={() => reprendreDuree(dureeDejaFixee)}>
              {t('communal.campagnesPesee.pesees.reprendreDuree', { duree: texteDuree(t, dureeDejaFixee) })}
            </button>
          )}
          <div>
            <button type="button" className={boutonDiscret} disabled={occupe || problemes.length > 0} onClick={ajouterAuLot}>
              {t('communal.campagnesPesee.pesees.ajouterAuLot')}
            </button>
          </div>

          {lot.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-ardoise-800">{t('communal.campagnesPesee.pesees.lot', { count: lot.length, n: formaterNombre(lot.length, 0) })}</p>
              <ul className="divide-y divide-ardoise-200 rounded-lg border border-ardoise-200 bg-white">
                {lot.map((p) => (
                  <li key={p.cle} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm">
                    <span>
                      <span className="font-medium text-ardoise-900">{p.libelle}</span>
                      <span className="block text-xs text-ardoise-600">
                        {f.date(p.date)} · {mesuresDe(p.poidsKg, p.dureeJours, p.volumeLitres, p.remplissagePct)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className={boutonDiscret}
                      disabled={occupe}
                      onClick={() => majLot((l) => l.filter((x) => x.cle !== p.cle))}
                      aria-label={t('communal.campagnesPesee.pesees.retirerDuLotDe', { cible: p.libelle })}
                    >
                      {t('communal.campagnesPesee.pesees.retirerDuLot')}
                    </button>
                  </li>
                ))}
              </ul>
              {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}
              <button type="button" className={bouton} disabled={occupe} onClick={() => void envoyer()}>
                {t('communal.campagnesPesee.pesees.envoyer', { count: lot.length, n: formaterNombre(lot.length, 0) })}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Le registre de la campagne ----------------------------------------- */}
      {erreurLecture && !pesees ? (
        <Erreur message={erreurLecture} onReessayer={() => void charger()} />
      ) : !pesees ? (
        <Chargement />
      ) : pesees.length === 0 ? (
        c.statut !== 'brouillon' && (
          <p className="rounded-xl border border-dashed border-ardoise-300 p-3 text-sm text-ardoise-600">{t('communal.campagnesPesee.pesees.aucune')}</p>
        )
      ) : (
        <ul className="divide-y divide-ardoise-100 rounded-lg border border-ardoise-200">
          {pesees.slice(0, PESEES_AFFICHEES).map((p) => (
            <li key={p.id} className={`space-y-2 p-3 ${p.statut === 'annulee' ? 'opacity-70' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {p.menage ? (
                      <bdi dir="ltr" className="font-mono font-medium text-ardoise-900">{p.menage}</bdi>
                    ) : (
                      <span className="font-medium text-ardoise-900">{p.etablissement}</span>
                    )}
                    <Pastille ton="neutre">{t(`campagnesPesee.sourcesPesee.${p.source}`)}</Pastille>
                    {p.statut === 'annulee' && <Pastille ton="attention">{t('communal.campagnesPesee.pesees.annuleePastille')}</Pastille>}
                  </div>
                  <p className="text-sm text-ardoise-700">
                    {f.date(p.date_pesee)} · {t('communal.campagnesPesee.pesees.jourN', { n: p.jour_campagne })} ·{' '}
                    {t('communal.campagnesPesee.pesees.poidsDuree', { poids: formaterExact(p.poids_kg, 3), duree: texteDuree(t, p.duree_jours) })}
                  </p>
                  {(p.contenant || p.volume_litres != null || p.remplissage_pct != null) && (
                    <p className="text-xs text-ardoise-600">
                      {[
                        p.contenant,
                        p.volume_litres != null ? t('communal.campagnesPesee.pesees.volumeL', { v: formaterExact(p.volume_litres, 1) }) : null,
                        p.remplissage_pct != null ? `${formaterExact(p.remplissage_pct, 1)} %` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                  {p.import_ligne != null && <p className="text-xs text-ardoise-500">{t('communal.campagnesPesee.pesees.ligneImport', { n: p.import_ligne })}</p>}
                  {p.statut === 'annulee' && p.motif_annulation && (
                    <p className="text-xs text-ardoise-600">{t('communal.campagnesPesee.pesees.motifAnnulation', { motif: p.motif_annulation })}</p>
                  )}
                </div>
                {saisie && p.statut === 'valide' && annulation?.id !== p.id && (
                  <button type="button" className={boutonDiscret} disabled={occupe} onClick={() => setAnnulation({ id: p.id, motif: '' })}>
                    {t('communal.campagnesPesee.pesees.annuler')}
                  </button>
                )}
              </div>
              {annulation?.id === p.id && (
                <div className="grid gap-2 rounded-lg bg-ardoise-50 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <label className="text-sm">
                    {t('communal.campagnesPesee.pesees.motifAnnulationLibelle')}
                    <input value={annulation.motif} onChange={(e) => setAnnulation({ ...annulation, motif: e.target.value })} maxLength={500} className={champ} />
                  </label>
                  <button type="button" className={bouton} disabled={occupe || !motifValable(annulation.motif)} onClick={() => void annuler(p, annulation.motif)}>
                    {t('communal.campagnesPesee.pesees.confirmerAnnulation')}
                  </button>
                  <button type="button" className={boutonDiscret} onClick={() => setAnnulation(null)}>
                    {t('commun.annuler')}
                  </button>
                  <p className="text-xs text-ardoise-600 sm:col-span-3">
                    {motifValable(annulation.motif) ? t('communal.campagnesPesee.pesees.annulationAide') : t('communal.campagnesPesee.motifMin', { n: MOTIF_MIN })}
                  </p>
                </div>
              )}
              {refusAnnulation?.id === p.id && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{refusAnnulation.texte}</p>}
            </li>
          ))}
        </ul>
      )}
      {pesees && pesees.length > PESEES_AFFICHEES && (
        <p className="text-xs text-ardoise-500">
          {t('communal.campagnesPesee.pesees.tronque', { n: formaterNombre(PESEES_AFFICHEES, 0), total: formaterNombre(pesees.length, 0) })}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Le journal des imports Kobo d'une campagne
// ---------------------------------------------------------------------------
function JournalImports({ campagneId, version }: { campagneId: string; version: number }) {
  const { t } = useTranslation();
  const f = useFormats();
  const [imports, setImports] = useState<ImportPeseesJournal[] | null>(null);
  useEffect(() => {
    let actuel = true;
    api
      .importsPesees(campagneId)
      .then((l) => {
        if (actuel) setImports(l);
      })
      .catch(() => {
        if (actuel) setImports(null);
      });
    return () => {
      actuel = false;
    };
  }, [campagneId, version]);
  if (!imports || imports.length === 0) return null;
  return (
    <details className="rounded-lg border border-ardoise-200 p-3">
      <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-ardoise-800">
        {t('communal.campagnesPesee.journalImports', { count: imports.length, n: formaterNombre(imports.length, 0) })}
      </summary>
      <ul className="mt-2 space-y-1 text-sm text-ardoise-700">
        {imports.map((i) => (
          <li key={i.id}>
            <bdi>{i.nom_fichier}</bdi> — {f.date(i.created_at, { heure: true })}
            {i.saisi_par_nom && ` — ${i.saisi_par_nom}`}
            <span className="block text-xs text-ardoise-600">
              {t('communal.campagnesPesee.bilanImport', {
                enregistrees: formaterNombre(i.nb_enregistrees, 0),
                dejaRecues: formaterNombre(i.nb_deja_recues, 0),
                erreurs: formaterNombre(i.nb_erreurs, 0),
              })}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Les densités des assimilés : de la commune et du pays
// ---------------------------------------------------------------------------
type EtatDensite = 'en_vigueur' | 'a_venir' | 'remplacee' | 'retiree';
const TON_ETAT_DENSITE: Record<EtatDensite, TonPastille> = { en_vigueur: 'mesure', a_venir: 'declare', remplacee: 'neutre', retiree: 'attention' };

/**
 * L'état de chaque densité au jour de Tunis, d'après la règle d'emploi de la base
 * (app._densite_assimiles) : pour une catégorie, la densité de la commune prévaut sur
 * celle du pays, et parmi elles sert la plus récente déjà en vigueur et non retirée.
 * L'API rend la liste sans cet état : « En vigueur depuis… » sur chaque ligne laissait
 * croire qu'une densité à venir, remplacée ou retirée servait aux estimations.
 */
function etatsDensites(liste: DensiteAssimiles[], jour: string) {
  const plusRecente = (a: DensiteAssimiles, b: DensiteAssimiles) =>
    a.date_effet > b.date_effet || (a.date_effet === b.date_effet && a.created_at > b.created_at) ? a : b;
  const retenues = new Map<string, DensiteAssimiles>();
  for (const d of liste) {
    if (d.retire_le !== null || d.date_effet > jour) continue;
    const r = retenues.get(d.categorie_activite);
    if (!r) retenues.set(d.categorie_activite, d);
    else if (r.portee !== d.portee) {
      if (d.portee === 'commune') retenues.set(d.categorie_activite, d);
    } else retenues.set(d.categorie_activite, plusRecente(r, d));
  }
  const etats = new Map<string, { etat: EtatDensite; retenue: DensiteAssimiles | null }>();
  for (const d of liste) {
    const retenue = retenues.get(d.categorie_activite) ?? null;
    const etat: EtatDensite =
      d.retire_le !== null ? 'retiree' : d.date_effet > jour ? 'a_venir' : retenue?.id === d.id ? 'en_vigueur' : 'remplacee';
    etats.set(d.id, { etat, retenue: etat === 'remplacee' ? retenue : null });
  }
  return etats;
}

function PartieDensites({ communeId, peutEcrire }: { communeId: string; peutEcrire: boolean }) {
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const arabe = i18n.language.startsWith('ar');
  const [liste, setListe] = useState<DensiteAssimiles[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [retrait, setRetrait] = useState<{ id: string; motif: string } | null>(null);
  const [refus, setRefus] = useState<{ id: string; texte: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const derniere = useRef(0);
  const charger = useCallback(async () => {
    const numero = ++derniere.current;
    try {
      const lue = await api.densitesAssimiles(communeId);
      if (numero !== derniere.current) return;
      setListe(lue);
      setErreur(null);
    } catch (err) {
      if (numero !== derniere.current) return;
      setErreur(texteErreur(err, t('commun.erreur')));
    }
  }, [communeId, t]);
  useEffect(() => {
    void charger();
  }, [charger]);

  const ajout = useAjoutEnLigne('densite-assimiles', communeId, t('communal.campagnesPesee.densites.nouvelle'), async () => {
    setMessage(t('communal.campagnesPesee.densites.messages.saisie'));
    await charger();
  });

  const etats = useMemo(() => etatsDensites(liste ?? [], aujourdhui()), [liste]);

  const retirer = async (d: DensiteAssimiles, motif: string) => {
    setEnvoi(true);
    setRefus(null);
    setMessage(null);
    try {
      await api.retirerDensiteAssimiles(d.id, motif.trim());
      setRetrait(null);
      setMessage(t('communal.campagnesPesee.densites.messages.retiree'));
      await charger();
    } catch (err) {
      if (err instanceof ErreurApi && (err.statut === 409 || err.statut === 404)) await charger();
      setRefus({ id: d.id, texte: texteErreur(err, t('commun.erreur')) });
    } finally {
      setEnvoi(false);
    }
  };

  if (erreur && !liste) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!liste) return <Chargement />;

  /** Ce que dit l'état d'une densité, avec ses dates. */
  const texteEtat = (d: DensiteAssimiles) => {
    const { etat, retenue } = etats.get(d.id) ?? { etat: 'retiree' as EtatDensite, retenue: null };
    const date = f.date(d.date_effet);
    if (etat === 'remplacee' && retenue) {
      // Une densité du pays que celle de la commune écarte n'est pas « plus ancienne » :
      // elle cède le pas à la commune, quelle que soit sa date.
      return retenue.portee === 'commune' && d.portee === 'nationale'
        ? t('communal.campagnesPesee.densites.textes.remplaceeCommune', { date, depuis: f.date(retenue.date_effet) })
        : t('communal.campagnesPesee.densites.textes.remplaceePlusRecente', { date, depuis: f.date(retenue.date_effet) });
    }
    return t(`communal.campagnesPesee.densites.textes.${etat}`, { date });
  };

  return (
    <section className="space-y-3" aria-labelledby="densites-titre">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="densites-titre" className="text-base font-semibold text-ardoise-900">{t('communal.campagnesPesee.parties.densites')}</h2>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-600">{t('communal.campagnesPesee.densites.aide')}</p>
        </div>
        <div className="flex flex-wrap gap-2">{ajout.bouton}</div>
      </div>
      {ajout.formulaire}
      {message && <p role="status" className="rounded-lg bg-siipi-50 p-3 text-sm text-siipi-800">{message}</p>}

      {liste.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ardoise-300 bg-white p-4 text-sm text-ardoise-600">{t('communal.campagnesPesee.densites.aucune')}</p>
      ) : (
        <ul className="space-y-2">
          {liste.map((d) => {
            const etat = etats.get(d.id)?.etat ?? 'retiree';
            const retiree = etat === 'retiree';
            const categorie = (arabe ? d.categorie_ar : d.categorie_fr) ?? d.categorie_activite;
            return (
              <li key={d.id} className={`space-y-2 rounded-xl border border-ardoise-200 bg-white p-3 ${retiree ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ardoise-900">{categorie}</p>
                    <p className="text-sm text-ardoise-700">
                      {/* Deux chiffres significatifs au moins : une densité de 0,2 ne s'écrit jamais « 0 ». */}
                      {t('communal.campagnesPesee.densites.fourchette', {
                        min: formaterMesure(d.densite_min, DECIMALES.kg_m3),
                        max: formaterMesure(d.densite_max, DECIMALES.kg_m3),
                      })}
                      {d.mediane != null && ` — ${t('communal.campagnesPesee.densites.mediane', { v: formaterMesure(d.mediane, DECIMALES.kg_m3) })}`}
                    </p>
                    <p className="text-xs text-ardoise-600">
                      {texteEtat(d)}
                      {d.campagne && ` · ${t('communal.campagnesPesee.densites.campagne', { intitule: d.campagne })}`}
                      {d.reference && ` · ${d.reference}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Pastille ton={TON_ETAT_DENSITE[etat]}>{t(`communal.campagnesPesee.densites.etats.${etat}`)}</Pastille>
                    <Pastille ton={d.portee === 'commune' ? 'declare' : 'neutre'}>{t(`campagnesPesee.portees.${d.portee}`)}</Pastille>
                    <Pastille ton="neutre">{t(`campagnesPesee.sources.${d.source}`)}</Pastille>
                  </div>
                </div>
                {retiree && d.retire_le && (
                  <p className="text-xs text-ardoise-600">
                    {t('communal.campagnesPesee.densites.retireeLe', { date: f.date(d.retire_le), motif: d.motif_retrait ?? '' })}
                  </p>
                )}
                {peutEcrire && !retiree && d.portee === 'commune' && retrait?.id !== d.id && (
                  <button type="button" className={boutonDiscret} disabled={envoi} onClick={() => setRetrait({ id: d.id, motif: '' })}>
                    {t('communal.campagnesPesee.densites.retirer')}
                  </button>
                )}
                {retrait?.id === d.id && (
                  <div className="grid gap-2 rounded-lg bg-ardoise-50 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                    <label className="text-sm">
                      {t('communal.campagnesPesee.densites.motifRetrait')}
                      <input value={retrait.motif} onChange={(e) => setRetrait({ ...retrait, motif: e.target.value })} maxLength={500} className={champ} />
                    </label>
                    <button type="button" className={bouton} disabled={envoi || !motifValable(retrait.motif)} onClick={() => void retirer(d, retrait.motif)}>
                      {t('communal.campagnesPesee.densites.confirmerRetrait')}
                    </button>
                    <button type="button" className={boutonDiscret} onClick={() => setRetrait(null)}>
                      {t('commun.annuler')}
                    </button>
                    <p className="text-xs text-ardoise-600 sm:col-span-3">
                      {motifValable(retrait.motif) ? t('communal.campagnesPesee.densites.retraitAide') : t('communal.campagnesPesee.motifMin', { n: MOTIF_MIN })}
                    </p>
                  </div>
                )}
                {refus?.id === d.id && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{refus.texte}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
