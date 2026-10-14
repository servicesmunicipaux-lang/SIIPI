// Un bilan WaPla (lot W3 ; SPEC § 6, points 1, 2 et 4).
//
// L'AMORCE D'ABORD. Le bilan s'ouvre sur ses entrées, rangées comme la commune
// les connaît (gisement, collecte, destination…), chacune avec sa provenance :
// mesurée ou déclarée dans SIIPI, saisie par la commune, référence nationale,
// ou valeur par défaut de l'UNIDO. Ce que SIIPI ne tient pas le dit, avec la
// raison que donne l'amorce. Rien n'est calculé tant qu'une entrée clé n'est
// pas traitée : la commune saisit une valeur, ou garde exprès celle de l'UNIDO.
//
// LE NIVEAU DE FIABILITÉ EN TÊTE, avec ce qui le fixe. Un bilan illustratif porte
// un bandeau permanent : il n'est visible que de la commune.
//
// La FNCT lit, sans rien saisir ni calculer : la commune décide.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  type AmorceWapla,
  type BilanWapla as Bilan,
  type EntreeBilanWapla,
  type LigneBilanWapla,
} from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { BoutonExport } from '../BoutonExport';
import { Chargement, Erreur } from '../Elements';
import { CLES_PLANIFICATION, ENTREES_PLANIFICATION, GROUPES, PROCEDE_DE_LA_PART, type EntreePlanification } from './presentation';
import { ResultatWapla } from './ResultatWapla';

const bouton = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50 disabled:opacity-40';
const boutonPrincipal = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-semibold text-white hover:bg-siipi-700 disabled:opacity-40';

const COULEURS_PROVENANCE: Record<string, string> = {
  siipi_mesure: 'bg-siipi-100 text-siipi-900',
  siipi_declare: 'bg-sky-100 text-sky-900',
  saisie_commune: 'bg-violet-100 text-violet-900',
  reference_tunisienne: 'bg-ardoise-100 text-ardoise-800',
  defaut_wapla: 'bg-amber-100 text-amber-900',
  non_renseigne: 'bg-ardoise-50 text-ardoise-500',
};
const COULEURS_NIVEAU: Record<string, string> = {
  etaye: 'border-siipi-300 bg-siipi-50 text-siipi-950',
  indicatif: 'border-sky-300 bg-sky-50 text-sky-950',
  illustratif: 'border-amber-400 bg-amber-50 text-amber-950',
};

export function BilanWapla({ id, fnct, onRetour }: { id: string; fnct: boolean; onRetour: () => void }) {
  const { t } = useTranslation();
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [lignes, setLignes] = useState<LigneBilanWapla[]>([]);
  const [amorce, setAmorce] = useState<AmorceWapla | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      const b = await api.bilanWapla(id);
      setBilan(b);
      setLignes(await api.lignesBilanWapla(id));
      setErreur(null);
      // L'amorce donne la raison d'une entrée que SIIPI ne tient pas.
      api.amorceWapla(b.commune_id, b.exercice).then(setAmorce).catch(() => setAmorce(null));
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [id, t]);
  useEffect(() => {
    void charger();
  }, [charger]);

  const agir = async (action: () => Promise<unknown>) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(false);
    }
  };

  if (!bilan) return erreur ? <Erreur message={erreur} onReessayer={() => void charger()} /> : <Chargement />;

  const entree = (cle: string) => bilan.entrees.find((e) => e.cle === cle);
  const ligne = (cle: string) => lignes.find((l) => l.rubrique === 'entree' && l.cle === cle);
  const actif = (proc: string) => {
    const e = entree(proc);
    return e ? e.valeur === true : ligne(proc)?.valeur === 1;
  };
  const fiab = bilan.fiabilite as null | { part_par_defaut: number; seuil: number; cles_par_defaut: string[]; comptees_par_defaut: string[]; comptees: number };
  const techniques = lignes.filter((l) => l.rubrique === 'entree' && !CLES_PLANIFICATION.has(l.cle));

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <button type="button" className={bouton} onClick={onRetour}>{t('wapla.retour')}</button>
        <h2 className="text-xl font-semibold text-ardoise-900">{t('wapla.bilan.titre', { exercice: bilan.exercice })}</h2>
        <p className="text-sm font-medium text-ardoise-600">{t('wapla.mention')}</p>
        {bilan.statut === 'calcule' && bilan.niveau ? (
          <div className={`rounded-xl border-2 p-3 text-sm ${COULEURS_NIVEAU[bilan.niveau]}`} role={bilan.niveau === 'illustratif' ? 'alert' : undefined}>
            <p className="font-semibold">{t(`wapla.niveaux.${bilan.niveau}`)}</p>
            <p className="mt-1">{t(`wapla.niveauxAide.${bilan.niveau}`)}</p>
            {fiab && (
              <p className="mt-1 text-xs">
                {t('wapla.bilan.partDefaut', {
                  n: fiab.comptees_par_defaut.length,
                  total: fiab.comptees,
                  part: formaterNombre(100 * fiab.part_par_defaut, 1),
                  seuil: formaterNombre(100 * fiab.seuil, 0),
                })}
              </p>
            )}
            <p className="mt-1 text-xs">{t('wapla.bilan.version', { version: bilan.version_moteur })}</p>
          </div>
        ) : (
          <p className="rounded-xl border border-ardoise-200 bg-ardoise-50 p-3 text-sm text-ardoise-700">{t('wapla.bilan.brouillon')}</p>
        )}
        {fnct && <p className="text-sm text-ardoise-500">{t('wapla.fnctLecture')}</p>}
      </header>

      {erreur && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>}

      {!fnct && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={boutonPrincipal} disabled={enCours || bilan.a_traiter.length > 0} onClick={() => void agir(() => api.calculerBilanWapla(id))}>
            {t('wapla.bilan.calculer')}
          </button>
          {bilan.a_traiter.length > 0 && (
            <p className="text-sm text-amber-900">
              {t('wapla.bilan.aTraiter', { cles: bilan.a_traiter.map((c) => t(`wapla.entrees.${c}`)).join(' · ') })}
            </p>
          )}
        </div>
      )}

      {bilan.statut === 'calcule' && bilan.resultat && (
        <section className="space-y-3" aria-labelledby="wapla-resultat">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="wapla-resultat" className="text-lg font-semibold text-ardoise-900">{t('wapla.resultat.titre')}</h3>
            <BoutonExport chemin={`/wapla/bilans/${id}/export`} />
          </div>
          <ResultatWapla resultat={bilan.resultat as Parameters<typeof ResultatWapla>[0]['resultat']} />
        </section>
      )}

      <section className="space-y-4" aria-labelledby="wapla-entrees">
        <h3 id="wapla-entrees" className="text-lg font-semibold text-ardoise-900">{t('wapla.bilan.entrees')}</h3>
        {GROUPES.map((g) => (
          <fieldset key={g} className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-3">
            <legend className="px-1 font-medium text-ardoise-900">{t(`wapla.groupes.${g}`)}</legend>
            {ENTREES_PLANIFICATION.filter((e) => e.groupe === g).map((def) => (
              <LigneEntree
                key={def.cle}
                def={def}
                entree={entree(def.cle)}
                ligne={ligne(def.cle)}
                manque={amorce?.entrees.find((a) => a.cle === def.cle && a.valeur == null)?.manque ?? null}
                cle_a_traiter={bilan.a_traiter.includes(def.cle)}
                sans_objet={def.cle in PROCEDE_DE_LA_PART && !actif(PROCEDE_DE_LA_PART[def.cle])}
                lectureSeule={fnct || enCours}
                onSaisir={(saisie) => void agir(() => api.saisirEntreeWapla(id, def.cle, saisie))}
              />
            ))}
          </fieldset>
        ))}
      </section>

      <details className="rounded-xl border border-ardoise-200 bg-white p-3 text-sm">
        <summary className="cursor-pointer font-medium text-ardoise-800">{t('wapla.bilan.techniques', { n: techniques.length })}</summary>
        <p className="mt-2 text-xs text-ardoise-500">{t('wapla.bilan.techniquesAide')}</p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {techniques.map((l) => (
            <li key={l.cle} className="flex justify-between gap-2 border-b border-ardoise-100 py-0.5">
              <span className="font-mono text-xs text-ardoise-600">{l.cle}</span>
              <span className="chiffres">{l.valeur == null ? t('kpi.statuts.non_renseigne') : formaterNombre(l.valeur, 3)}</span>
            </li>
          ))}
        </ul>
      </details>

      {!fnct && (
        <button
          type="button"
          className={`${bouton} text-red-800`}
          disabled={enCours}
          onClick={() => {
            if (window.confirm(t('wapla.bilan.confirmerRetrait'))) void agir(async () => { await api.retirerBilanWapla(id); onRetour(); });
          }}
        >
          {t('wapla.bilan.retirer')}
        </button>
      )}
    </div>
  );
}

/** Une entrée de planification : sa valeur, sa provenance, et de quoi la saisir. */
function LigneEntree({
  def,
  entree,
  ligne,
  manque,
  cle_a_traiter,
  sans_objet,
  lectureSeule,
  onSaisir,
}: {
  def: EntreePlanification;
  entree: EntreeBilanWapla | undefined;
  ligne: LigneBilanWapla | undefined;
  manque: string | null;
  cle_a_traiter: boolean;
  sans_objet: boolean;
  lectureSeule: boolean;
  onSaisir: (saisie: { valeur: number | boolean } | { defaut: true }) => void;
}) {
  const { t } = useTranslation();
  const valeurActuelle = entree ? entree.valeur : ligne?.valeur ?? null;
  const provenance = entree ? entree.provenance : (ligne?.provenance ?? 'non_renseigne');
  const [saisie, setSaisie] = useState('');

  // Une part s'affiche et se saisit en %, le moteur la reçoit entre 0 et 1.
  const affiche = (v: number | boolean | null) => {
    if (v == null) return t('kpi.statuts.non_renseigne');
    if (def.nature === 'booleen') return t(v === true || v === 1 ? 'commun.oui' : 'commun.non');
    if (def.nature === 'part') return `${formaterNombre(100 * Number(v), 1)} %`;
    if (def.nature === 'choix') return t(`wapla.choix.${def.cle}.${String(v).replace('.', '_')}`);
    return `${formaterNombre(Number(v), Number(v) < 10 ? 2 : 0)}${def.unite ? ` ${t(`wapla.unites.${def.unite}`)}` : ''}`;
  };
  const enregistrer = () => {
    const n = Number(saisie.replace(',', '.'));
    if (saisie.trim() === '' || Number.isNaN(n)) return;
    onSaisir({ valeur: def.nature === 'part' ? n / 100 : n });
    setSaisie('');
  };
  // Une entrée encore absente du bilan vaut la valeur par défaut de l'outil, si
  // elle en a une (l'export la marque « defaut_wapla ») : la commune peut la
  // garder exprès. Un coût n'en a pas.
  const peutGarderDefaut = !entree && ligne?.provenance === 'defaut_wapla';

  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 rounded-lg p-2 ${cle_a_traiter ? 'bg-amber-50 ring-1 ring-amber-300' : ''}`}>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ardoise-900">{t(`wapla.entrees.${def.cle}`)}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COULEURS_PROVENANCE[provenance] ?? ''}`}>{t(`wapla.provenances.${provenance}`)}</span>
        </p>
        <p className="chiffres text-sm text-ardoise-800">{sans_objet ? t('wapla.bilan.sansObjet') : affiche(valeurActuelle)}</p>
        {entree?.source && <p className="text-xs text-ardoise-500">{entree.source}</p>}
        {!entree && manque && <p className="text-xs text-ardoise-500">{t('wapla.bilan.siipiNeTientPas', { manque })}</p>}
      </div>
      {!lectureSeule && !sans_objet && (
        <div className="flex flex-wrap items-center gap-2">
          {def.nature === 'booleen' ? (
            <button type="button" className={bouton} onClick={() => onSaisir({ valeur: !(valeurActuelle === true || valeurActuelle === 1) })}>
              {t(valeurActuelle === true || valeurActuelle === 1 ? 'wapla.bilan.desactiver' : 'wapla.bilan.activer')}
            </button>
          ) : def.nature === 'choix' ? (
            <select
              className="min-h-10 rounded-lg border border-ardoise-300 bg-white px-2 text-sm"
              aria-label={t(`wapla.entrees.${def.cle}`)}
              value={valeurActuelle == null ? '' : String(valeurActuelle)}
              onChange={(e) => onSaisir({ valeur: Number(e.target.value) })}
            >
              {(def.choix ?? []).map((c) => (
                <option key={c} value={String(c)}>{t(`wapla.choix.${def.cle}.${String(c).replace('.', '_')}`)}</option>
              ))}
            </select>
          ) : (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                enregistrer();
              }}
            >
              <input
                inputMode="decimal"
                className="min-h-10 w-28 rounded-lg border border-ardoise-300 px-2 text-sm"
                aria-label={t(`wapla.entrees.${def.cle}`)}
                placeholder={def.nature === 'part' ? '%' : def.unite ? t(`wapla.unites.${def.unite}`) : ''}
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
              />
              <button type="submit" className={bouton} disabled={saisie.trim() === ''}>{t('wapla.bilan.enregistrer')}</button>
            </form>
          )}
          {peutGarderDefaut && (
            <button type="button" className={bouton} onClick={() => onSaisir({ defaut: true })}>{t('wapla.bilan.garderDefaut')}</button>
          )}
        </div>
      )}
    </div>
  );
}
