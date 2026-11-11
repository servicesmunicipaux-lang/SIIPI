// La rédaction d'une convention de propreté, et la modification d'un brouillon
// (jalon G, lot G4a). Le même formulaire pour le catalogue « + Ajouter », l'écran
// « Conventions » et le « il manque » de l'indicateur M2-2.
//
// LA RÈGLE SE DIT AVANT LE REFUS : un établissement non fermé et classé (son tarif
// en dépend), une durée d'au plus un an, des flux de la liste nationale du jour —
// un flux dangereux se montre, grisé, avec la raison : il va vers sa filière. Ce
// que l'écran laisse passer, l'API et la base le refusent de toute façon.
//
// AUCUN MONTANT : le tarif vient de la grille approuvée, à l'instruction ; le
// montant dû vient de l'assiette (lot G6).

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Convention, type ElementListeAssimiles, type Etablissement } from '../../lib/api';
import { Chargement, Erreur } from '../Elements';
import { CadreAjout, champAjout } from './CadreAjout';
import { aujourdhui, categoriesDuJour } from './FormulaireEtablissement';

type TypeConvention = 'collecte' | 'nettoyage' | 'tri' | 'autre';
type LigneSaisie = { fluxCode: string; conteneurId: string; levees: string; volume: string };

const ligneVide = (): LigneSaisie => ({ fluxCode: '', conteneurId: '', levees: '1', volume: '' });

/** La veille du même jour, un an après : la fin la plus tardive d'une convention annuelle. */
export function finMaximale(debut: string): string {
  const d = new Date(`${debut}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const nombre = (v: string) => (v.trim() === '' ? null : Number(v.trim().replace(',', '.')));

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
  const [etablissements, setEtablissements] = useState<Etablissement[] | null>(null);
  const [flux, setFlux] = useState<ElementListeAssimiles[] | null>(null);
  const [conteneurs, setConteneurs] = useState<{ id: string; code: string }[]>([]);
  const [indisponible, setIndisponible] = useState(false);
  const [essai, setEssai] = useState(0);
  const [commerceId, setCommerceId] = useState(c?.commerce_id ?? '');
  const [type, setType] = useState<TypeConvention>((c?.type as TypeConvention) ?? 'collecte');
  const [dateDebut, setDateDebut] = useState(c?.date_debut ?? '');
  const [dateFin, setDateFin] = useState(c?.date_fin ?? '');
  const [observation, setObservation] = useState(c?.observation ?? '');
  const [lignes, setLignes] = useState<LigneSaisie[]>(
    c && c.lignes.length > 0
      ? c.lignes.map((l) => ({
          fluxCode: l.flux_code,
          conteneurId: l.conteneur_id ?? '',
          levees: String(l.levees_par_semaine),
          volume: l.volume_litres != null ? String(l.volume_litres) : '',
        }))
      : [ligneVide()]
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Une liste qui n'a pas pu se lire n'est pas une liste vide : la confondre ferait
  // dire « aucun établissement » ou « aucun flux » à tort, et bloquerait l'envoi.
  useEffect(() => {
    setIndisponible(false);
    Promise.all([api.etablissements(communeId), api.listesAssimiles()])
      .then(([e, l]) => {
        setEtablissements(e);
        setFlux(categoriesDuJour(l.listes.find((x) => x.liste === 'flux_assimiles')?.elements ?? [], aujourdhui()));
      })
      .catch(() => setIndisponible(true));
    api
      .conteneurs(communeId)
      .then((k) => setConteneurs((k as { id: string; code: string }[]).map((x) => ({ id: x.id, code: x.code }))))
      .catch(() => setConteneurs([]));
  }, [communeId, essai]);

  // Un établissement fermé, ou sans catégorie, ne reçoit pas de convention : il ne se propose pas.
  const choisissables = useMemo(
    () => (etablissements ?? []).filter((e) => e.statut !== 'ferme' && e.categorie_activite),
    [etablissements]
  );
  const libelleFlux = (f: ElementListeAssimiles) => (arabe ? f.libelle_ar : f.libelle_fr);

  const problemes: string[] = [];
  const cle = (s: string) => `ajout.convention.problemes.${s}`;
  if (!commerceId) problemes.push(t(cle('etablissement')));
  if (!DATE.test(dateDebut) || !DATE.test(dateFin)) problemes.push(t(cle('dates')));
  else if (dateFin < dateDebut) problemes.push(t(cle('ordre')));
  else if (dateFin > finMaximale(dateDebut)) problemes.push(t(cle('annuelle'), { fin: finMaximale(dateDebut) }));
  const codes = lignes.map((l) => l.fluxCode).filter(Boolean);
  if (lignes.some((l) => !l.fluxCode)) problemes.push(t(cle('flux')));
  if (new Set(codes).size !== codes.length) problemes.push(t(cle('fluxDouble')));
  if (lignes.some((l) => { const n = nombre(l.levees); return n === null || !Number.isInteger(n) || n < 1 || n > 21; })) {
    problemes.push(t(cle('levees')));
  }
  if (lignes.some((l) => { const n = nombre(l.volume); return n !== null && !(Number.isFinite(n) && Math.round(n * 10) / 10 > 0 && n <= 100000); })) {
    problemes.push(t(cle('volume')));
  }

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    const saisieLignes = lignes.map((l) => ({
      fluxCode: l.fluxCode,
      conteneurId: l.conteneurId || null,
      leveesParSemaine: nombre(l.levees) as number,
      volumeLitres: nombre(l.volume),
    }));
    try {
      const r = c
        ? await api.modifierConvention(c.id, {
            version: c.version,
            type,
            dateDebut,
            dateFin,
            observation: observation.trim() || null,
            lignes: saisieLignes,
          })
        : await api.creerConvention(communeId, {
            commerceId,
            type,
            dateDebut,
            dateFin,
            observation: observation.trim() || null,
            lignes: saisieLignes,
          });
      await onFait(r);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  if (indisponible) return <Erreur message={t('ajout.convention.listesIndisponibles')} onReessayer={() => setEssai((n) => n + 1)} />;
  if (!etablissements || !flux) return <Chargement />;

  const majLigne = (i: number, champ: keyof LigneSaisie, valeur: string) =>
    setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, [champ]: valeur } : l)));

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
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          {t('ajout.convention.etablissement')}
          <select value={commerceId} onChange={(e) => setCommerceId(e.target.value)} disabled={Boolean(c)} className={`${champAjout} disabled:bg-ardoise-100`}>
            <option value="">{t('ajout.etablissement.choisir')}</option>
            {c && !choisissables.some((e) => e.id === c.commerce_id) && <option value={c.commerce_id}>{c.etablissement}</option>}
            {choisissables.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom} — {(arabe ? e.categorie_activite_ar : e.categorie_activite_fr) ?? e.categorie_activite}
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
            onChange={(e) => {
              setDateDebut(e.target.value);
              // Une convention est annuelle : la fin se propose, la commune la change.
              if (!dateFin && DATE.test(e.target.value)) setDateFin(finMaximale(e.target.value));
            }}
            className={champAjout}
          />
        </label>
        <label className="text-sm">
          {t('ajout.convention.dateFin')}
          <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className={champAjout} />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ardoise-800">{t('ajout.convention.flux')}</legend>
        {flux.length === 0 && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{t('ajout.convention.aucunFlux')}</p>}
        {lignes.map((l, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-ardoise-200 p-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <label className="text-xs">
              {t('ajout.convention.fluxLigne')}
              <select value={l.fluxCode} onChange={(e) => majLigne(i, 'fluxCode', e.target.value)} className={champAjout}>
                <option value="">{t('ajout.etablissement.choisir')}</option>
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
        <p className="text-xs text-ardoise-500">{t('ajout.convention.fluxAide')}</p>
      </fieldset>

      <label className="block text-sm">
        {t('ajout.convention.observation')}
        <textarea value={observation} onChange={(e) => setObservation(e.target.value)} maxLength={1000} rows={2} className={`${champAjout} py-2`} />
      </label>

      {problemes.length > 0 && (
        <div className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">
          <p>{t('ajout.etablissement.pourEnregistrer')}</p>
          <ul className="list-disc ps-5">
            {[...new Set(problemes)].map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </CadreAjout>
  );
}
