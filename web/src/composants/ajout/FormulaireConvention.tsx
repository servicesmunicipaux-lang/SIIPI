// La rédaction d'une convention de propreté, la modification d'un brouillon (jalon
// G, lot G4a), et celles d'un avenant (lot G4b). Le même formulaire pour le
// catalogue « + Ajouter », l'écran « Conventions » et le « il manque » de
// l'indicateur M2-2 ; l'avenant vit dans ce fichier, avec l'éditeur des déchets
// couverts qu'il partage : une ligne se saisit et se contrôle d'une seule façon.
//
// LA RÈGLE SE DIT AVANT LE REFUS : un établissement non fermé et classé (son tarif
// en dépend), une durée d'au plus un an, des flux de la liste nationale du jour —
// un flux dangereux se montre, grisé, avec la raison : il va vers sa filière. Ce
// que l'écran laisse passer, l'API et la base le refusent de toute façon.
//
// UN AVENANT NE CHANGE QUE LES DÉCHETS COUVERTS : il en donne la liste complète,
// proposée à partir des derniers termes signés, à compter de sa date d'effet. Ni
// l'établissement, ni les dates, ni le tarif : ils ne s'y saisissent pas.
//
// AUCUN MONTANT : le tarif vient de la grille approuvée, à l'instruction ; le
// montant dû vient de l'assiette (lot G6).

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  api,
  ErreurApi,
  type AvenantConvention,
  type Convention,
  type ElementListeAssimiles,
  type Etablissement,
} from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { Chargement, Erreur } from '../Elements';
import { CadreAjout, champAjout } from './CadreAjout';
import { aujourdhui, categoriesDuJour } from './FormulaireEtablissement';

type TypeConvention = 'collecte' | 'nettoyage' | 'tri' | 'autre';
type LigneSaisie = { fluxCode: string; conteneurId: string; levees: string; volume: string };
type LigneLue = { flux_code: string; conteneur_id: string | null; levees_par_semaine: number; volume_litres: number | null };

const ligneVide = (): LigneSaisie => ({ fluxCode: '', conteneurId: '', levees: '1', volume: '' });
const enSaisie = (ls: LigneLue[]): LigneSaisie[] =>
  ls.length > 0
    ? ls.map((l) => ({
        fluxCode: l.flux_code,
        conteneurId: l.conteneur_id ?? '',
        levees: String(l.levees_par_semaine),
        volume: l.volume_litres != null ? String(l.volume_litres) : '',
      }))
    : [ligneVide()];

/**
 * La fin la plus tardive d'une convention annuelle : la veille du même jour, un an
 * après — comme la base (un 29 février donne le 28 février, puis la veille).
 */
export function finMaximale(debut: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(debut)) return '';
  const [a, m, j] = debut.split('-').map(Number);
  const jours = new Date(Date.UTC(a + 1, m, 0)).getUTCDate();
  const d = new Date(Date.UTC(a + 1, m - 1, Math.min(j, jours)));
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const nombre = (v: string) => (v.trim() === '' ? null : Number(v.trim().replace(',', '.')));

/** Ce qui manque aux lignes pour s'enregistrer, en mots. */
function problemesLignes(lignes: LigneSaisie[], t: TFunction, flux: ElementListeAssimiles[]): string[] {
  const p: string[] = [];
  const cle = (s: string) => `ajout.convention.problemes.${s}`;
  const codes = lignes.map((l) => l.fluxCode).filter(Boolean);
  if (lignes.some((l) => !l.fluxCode)) p.push(t(cle('flux')));
  // Repris d'anciens termes, un flux fermé depuis, ou devenu dangereux, se dit avant
  // l'envoi : l'API le refuserait de toute façon.
  if (lignes.some((l) => l.fluxCode && !flux.some((f) => f.code === l.fluxCode && !f.dangereux))) p.push(t(cle('fluxPlusEnVigueur')));
  if (new Set(codes).size !== codes.length) p.push(t(cle('fluxDouble')));
  if (lignes.some((l) => { const n = nombre(l.levees); return n === null || !Number.isInteger(n) || n < 1 || n > 21; })) {
    p.push(t(cle('levees')));
  }
  if (lignes.some((l) => { const n = nombre(l.volume); return n !== null && !(Number.isFinite(n) && Math.round(n * 10) / 10 > 0 && n <= 100000); })) {
    p.push(t(cle('volume')));
  }
  return p;
}
const lignesEnvoyees = (lignes: LigneSaisie[]) =>
  lignes.map((l) => ({
    fluxCode: l.fluxCode,
    conteneurId: l.conteneurId || null,
    leveesParSemaine: nombre(l.levees) as number,
    volumeLitres: nombre(l.volume),
  }));

/** La liste nationale des flux du jour et les conteneurs de la commune. */
function useListes(communeId: string) {
  const [flux, setFlux] = useState<ElementListeAssimiles[] | null>(null);
  const [conteneurs, setConteneurs] = useState<{ id: string; code: string }[]>([]);
  const [indisponible, setIndisponible] = useState(false);
  const [essai, setEssai] = useState(0);
  // Une liste qui n'a pas pu se lire n'est pas une liste vide : la confondre ferait
  // dire « aucun flux » à tort, et bloquerait l'envoi.
  useEffect(() => {
    setIndisponible(false);
    api
      .listesAssimiles()
      .then((l) => setFlux(categoriesDuJour(l.listes.find((x) => x.liste === 'flux_assimiles')?.elements ?? [], aujourdhui())))
      .catch(() => setIndisponible(true));
    api
      .conteneurs(communeId)
      .then((k) => setConteneurs((k as { id: string; code: string }[]).map((x) => ({ id: x.id, code: x.code }))))
      .catch(() => setConteneurs([]));
  }, [communeId, essai]);
  return { flux, conteneurs, indisponible, reessayer: () => setEssai((n) => n + 1) };
}

/** Les déchets couverts : une ligne par flux de la liste nationale du jour. */
function EditeurLignes({
  flux,
  conteneurs,
  lignes,
  setLignes,
  aide,
}: {
  flux: ElementListeAssimiles[];
  conteneurs: { id: string; code: string }[];
  lignes: LigneSaisie[];
  setLignes: (f: (ls: LigneSaisie[]) => LigneSaisie[]) => void;
  aide: string;
}) {
  const { t, i18n } = useTranslation();
  const arabe = i18n.language.startsWith('ar');
  const libelleFlux = (f: ElementListeAssimiles) => (arabe ? f.libelle_ar : f.libelle_fr);
  const majLigne = (i: number, champ: keyof LigneSaisie, valeur: string) =>
    setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, [champ]: valeur } : l)));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-ardoise-800">{t('ajout.convention.flux')}</legend>
      {flux.length === 0 && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{t('ajout.convention.aucunFlux')}</p>}
      {lignes.map((l, i) => (
        <div key={i} className="grid gap-2 rounded-lg border border-ardoise-200 p-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <label className="text-xs">
            {t('ajout.convention.fluxLigne')}
            <select value={l.fluxCode} onChange={(e) => majLigne(i, 'fluxCode', e.target.value)} className={champAjout}>
              <option value="">{t('ajout.etablissement.choisir')}</option>
              {/* Un flux repris d'anciens termes, qui n'est plus en vigueur, se montre pour être remplacé. */}
              {l.fluxCode && !flux.some((f) => f.code === l.fluxCode) && (
                <option value={l.fluxCode}>{`${l.fluxCode} — ${t('ajout.convention.plusEnVigueur')}`}</option>
              )}
              {flux.map((f) => (
                <option key={f.id} value={f.code} disabled={Boolean(f.dangereux)}>
                  {libelleFlux(f)}
                  {f.dangereux ? ` — ${t('ajout.convention.dangereux')}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            {t('ajout.convention.levees')}
            <input value={l.levees} onChange={(e) => majLigne(i, 'levees', e.target.value)} inputMode="numeric" className={`${champAjout} text-end`} />
          </label>
          <label className="text-xs">
            {t('ajout.convention.volume')}
            <input value={l.volume} onChange={(e) => majLigne(i, 'volume', e.target.value)} inputMode="decimal" className={`${champAjout} text-end`} />
          </label>
          <label className="text-xs">
            {t('ajout.convention.conteneur')}
            <select value={l.conteneurId} onChange={(e) => majLigne(i, 'conteneurId', e.target.value)} className={champAjout}>
              <option value="">{t('ajout.convention.aucunConteneur')}</option>
              {conteneurs.map((k) => (
                <option key={k.id} value={k.id}>{k.code}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setLignes((ls) => ls.filter((_, j) => j !== i))}
            className="min-h-11 self-end rounded-lg border border-ardoise-300 px-3 text-xs text-ardoise-700"
          >
            {t('ajout.convention.retirerLigne')}
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setLignes((ls) => [...ls, ligneVide()])}
        disabled={lignes.length >= 20}
        className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40"
      >
        {t('ajout.convention.ajouterLigne')}
      </button>
      <p className="text-xs text-ardoise-500">{aide}</p>
    </fieldset>
  );
}

function ListeProblemes({ problemes }: { problemes: string[] }) {
  const { t } = useTranslation();
  if (problemes.length === 0) return null;
  return (
    <div className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">
      <p>{t('ajout.etablissement.pourEnregistrer')}</p>
      <ul className="list-disc ps-5">
        {[...new Set(problemes)].map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

export function FormulaireConvention({
  communeId,
  convention,
  onFait,
  onAnnuler,
}: {
  communeId: string;
  /** Un brouillon à modifier ; absent, le formulaire en rédige un. */
  convention?: Convention;
  onFait: (enregistree?: Convention) => void | Promise<void>;
  onAnnuler?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const arabe = i18n.language.startsWith('ar');
  const c = convention;
  // Un renouvellement garde son début : le lendemain de la fin de la convention renouvelée.
  const renouvellement = Boolean(c?.convention_precedente_id);
  const listes = useListes(communeId);
  const [etablissements, setEtablissements] = useState<Etablissement[] | null>(null);
  const [etabIndisponibles, setEtabIndisponibles] = useState(false);
  const [essai, setEssai] = useState(0);
  const [commerceId, setCommerceId] = useState(c?.commerce_id ?? '');
  const [type, setType] = useState<TypeConvention>((c?.type as TypeConvention) ?? 'collecte');
  const [dateDebut, setDateDebut] = useState(c?.date_debut ?? '');
  const [dateFin, setDateFin] = useState(c?.date_fin ?? '');
  const [observation, setObservation] = useState(c?.observation ?? '');
  const [lignes, setLignes] = useState<LigneSaisie[]>(enSaisie(c?.lignes ?? []));
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    setEtabIndisponibles(false);
    api
      .etablissements(communeId)
      .then(setEtablissements)
      .catch(() => setEtabIndisponibles(true));
  }, [communeId, essai]);

  // Un établissement fermé, ou sans catégorie, ne reçoit pas de convention : il ne se propose pas.
  const choisissables = useMemo(
    () => (etablissements ?? []).filter((e) => e.statut !== 'ferme' && e.categorie_activite),
    [etablissements]
  );
  // Deux établissements de même raison sociale se départagent : le document scellé
  // de la convention ne se corrige plus s'il désigne le mauvais.
  const homonymes = useMemo(() => {
    const vus = new Map<string, number>();
    for (const e of choisissables) vus.set(e.nom.trim().toLowerCase(), (vus.get(e.nom.trim().toLowerCase()) ?? 0) + 1);
    return vus;
  }, [choisissables]);
  const departage = (e: Etablissement) =>
    (homonymes.get(e.nom.trim().toLowerCase()) ?? 0) > 1 ? ` — ${e.matricule_fiscal ?? e.adresse ?? e.id.slice(0, 8)}` : '';

  const problemes: string[] = [];
  const cle = (s: string) => `ajout.convention.problemes.${s}`;
  if (!commerceId) problemes.push(t(cle('etablissement')));
  if (!DATE.test(dateDebut) || !DATE.test(dateFin)) problemes.push(t(cle('dates')));
  else if (dateFin < dateDebut) problemes.push(t(cle('ordre')));
  else if (dateFin > finMaximale(dateDebut)) problemes.push(t(cle('annuelle'), { fin: finMaximale(dateDebut) }));
  problemes.push(...problemesLignes(lignes, t, listes.flux ?? []));

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = c
        ? await api.modifierConvention(c.id, {
            version: c.version,
            type,
            dateDebut,
            dateFin,
            observation: observation.trim() || null,
            lignes: lignesEnvoyees(lignes),
          })
        : await api.creerConvention(communeId, {
            commerceId,
            type,
            dateDebut,
            dateFin,
            observation: observation.trim() || null,
            lignes: lignesEnvoyees(lignes),
          });
      await onFait(r);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  if (listes.indisponible || etabIndisponibles) {
    return (
      <Erreur
        message={t('ajout.convention.listesIndisponibles')}
        onReessayer={() => {
          listes.reessayer();
          setEssai((n) => n + 1);
        }}
      />
    );
  }
  if (!etablissements || !listes.flux) return <Chargement />;

  return (
    <CadreAjout
      id={c ? `convention-${c.id}` : 'convention-nouvelle'}
      titre={t(c ? 'ajout.convention.titreModification' : 'ajout.convention.titre')}
      aide={t('ajout.convention.aide')}
      erreur={erreur}
      enregistrable={problemes.length === 0}
      envoi={envoi}
      onEnregistrer={enregistrer}
      onAnnuler={onAnnuler}
    >
      {renouvellement && (
        <p className="rounded-lg bg-siipi-50 p-2 text-sm text-siipi-800">
          {t('ajout.convention.renouvellementDe', { numero: c?.numero_precedente ?? '' })}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          {t('ajout.convention.etablissement')}
          <select value={commerceId} onChange={(e) => setCommerceId(e.target.value)} disabled={Boolean(c)} className={`${champAjout} disabled:bg-ardoise-100`}>
            <option value="">{t('ajout.etablissement.choisir')}</option>
            {c && !choisissables.some((e) => e.id === c.commerce_id) && <option value={c.commerce_id}>{c.etablissement}</option>}
            {choisissables.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}{departage(e)} — {(arabe ? e.categorie_activite_ar : e.categorie_activite_fr) ?? e.categorie_activite}
                {e.statut === 'a_verifier' ? ` (${t('communal.etablissements.statuts.a_verifier')})` : ''}
              </option>
            ))}
          </select>
          {choisissables.length === 0 && <span className="mt-1 block text-xs text-ardoise-600">{t('ajout.convention.aucunEtablissement')}</span>}
        </label>
        <label className="text-sm">
          {t('ajout.convention.type')}
          <select value={type} onChange={(e) => setType(e.target.value as TypeConvention)} className={champAjout}>
            {(['collecte', 'nettoyage', 'tri', 'autre'] as const).map((x) => (
              <option key={x} value={x}>{t(`ajout.convention.types.${x}`)}</option>
            ))}
          </select>
        </label>
        <span className="hidden sm:block" />
        <label className="text-sm">
          {t('ajout.convention.dateDebut')}
          <input
            type="date"
            value={dateDebut}
            disabled={renouvellement}
            onChange={(e) => {
              setDateDebut(e.target.value);
              // Une convention est annuelle : la fin se propose, la commune la change.
              if (!dateFin && DATE.test(e.target.value)) setDateFin(finMaximale(e.target.value));
            }}
            className={`${champAjout} disabled:bg-ardoise-100`}
          />
          {renouvellement && <span className="mt-1 block text-xs text-ardoise-600">{t('ajout.convention.debutRenouvellement')}</span>}
        </label>
        <label className="text-sm">
          {t('ajout.convention.dateFin')}
          <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className={champAjout} />
        </label>
      </div>

      <EditeurLignes flux={listes.flux} conteneurs={listes.conteneurs} lignes={lignes} setLignes={setLignes} aide={t('ajout.convention.fluxAide')} />

      <label className="block text-sm">
        {t('ajout.convention.observation')}
        <textarea value={observation} onChange={(e) => setObservation(e.target.value)} maxLength={1000} rows={2} className={`${champAjout} py-2`} />
      </label>

      <ListeProblemes problemes={problemes} />
    </CadreAjout>
  );
}

/**
 * Les derniers termes signés d'une convention : ceux de l'avenant signé dont la date
 * d'effet est la plus tardive (même à venir), sinon ceux d'origine. Un avenant
 * nouveau part de là : il donne la liste complète, pas une différence.
 */
function derniersTermesSignes(c: Convention): { lignes: LigneLue[]; dateEffet: string | null } {
  const signes = c.avenants.filter((a) => a.statut === 'signe').sort((a, b) => b.date_effet.localeCompare(a.date_effet));
  return signes.length > 0 ? { lignes: signes[0].lignes, dateEffet: signes[0].date_effet } : { lignes: c.lignes, dateEffet: null };
}

export function FormulaireAvenant({
  communeId,
  convention,
  avenant,
  onFait,
  onAnnuler,
}: {
  communeId: string;
  /** La convention signée, lue avec ses avenants. */
  convention: Convention;
  /** Un brouillon d'avenant à modifier ; absent, le formulaire en rédige un. */
  avenant?: AvenantConvention;
  onFait: (enregistre?: AvenantConvention) => void | Promise<void>;
  onAnnuler?: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const c = convention;
  const derniers = derniersTermesSignes(c);
  const listes = useListes(communeId);
  const [dateEffet, setDateEffet] = useState(avenant?.date_effet ?? '');
  const [observation, setObservation] = useState(avenant?.observation ?? '');
  const [lignes, setLignes] = useState<LigneSaisie[]>(enSaisie(avenant ? avenant.lignes : derniers.lignes));
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const problemes: string[] = [];
  const cle = (s: string) => `ajout.avenant.problemes.${s}`;
  if (!DATE.test(dateEffet)) problemes.push(t(cle('date')));
  else if (dateEffet < c.date_debut || (c.date_fin && dateEffet > c.date_fin)) {
    problemes.push(t(cle('periode'), { debut: f.date(c.date_debut), fin: c.date_fin ? f.date(c.date_fin) : '' }));
  } else if (derniers.dateEffet && dateEffet <= derniers.dateEffet) {
    problemes.push(t(cle('ordre'), { date: f.date(derniers.dateEffet) }));
  }
  problemes.push(...problemesLignes(lignes, t, listes.flux ?? []));
  if (lignes.length === 0) problemes.push(t(cle('lignes')));

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = avenant
        ? await api.modifierAvenant(avenant.id, {
            version: avenant.version,
            dateEffet,
            observation: observation.trim() || null,
            lignes: lignesEnvoyees(lignes),
          })
        : await api.creerAvenant(c.id, { dateEffet, observation: observation.trim() || null, lignes: lignesEnvoyees(lignes) });
      await onFait(r);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  if (listes.indisponible) return <Erreur message={t('ajout.convention.listesIndisponibles')} onReessayer={listes.reessayer} />;
  if (!listes.flux) return <Chargement />;

  return (
    <CadreAjout
      id={avenant ? `avenant-${avenant.id}` : `avenant-nouveau-${c.id}`}
      titre={t(avenant ? 'ajout.avenant.titreModification' : 'ajout.avenant.titre', { etablissement: c.etablissement })}
      aide={t('ajout.avenant.aide', { numero: c.numero_document ?? '' })}
      erreur={erreur}
      enregistrable={problemes.length === 0}
      envoi={envoi}
      onEnregistrer={enregistrer}
      onAnnuler={onAnnuler}
    >
      <label className="block max-w-xs text-sm">
        {t('ajout.avenant.dateEffet')}
        <input
          type="date"
          value={dateEffet}
          min={c.date_debut}
          max={c.date_fin ?? undefined}
          onChange={(e) => setDateEffet(e.target.value)}
          className={champAjout}
        />
      </label>

      <EditeurLignes flux={listes.flux} conteneurs={listes.conteneurs} lignes={lignes} setLignes={setLignes} aide={t('ajout.avenant.fluxAide')} />

      <label className="block text-sm">
        {t('ajout.convention.observation')}
        <textarea value={observation} onChange={(e) => setObservation(e.target.value)} maxLength={1000} rows={2} className={`${champAjout} py-2`} />
      </label>

      <ListeProblemes problemes={problemes} />
    </CadreAjout>
  );
}
