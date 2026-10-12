// La caractérisation des déchets (refonte, lot 2a ; SPEC_refonte § 2.3 c, D6).
//
// LE MÊME FORMULAIRE POUR LA COMMUNE ET POUR LA FNCT. Sans commune, c'est la
// moyenne nationale de l'ANGeD, que seule la FNCT saisit ; avec une commune,
// c'est une de ses études. Le niveau de source se choisit dans la liste qui
// correspond — la base refuse de toute façon l'autre cas (migration 069).
//
// LE TOTAL SE VOIT PENDANT LA SAISIE. La base refuse une composition qui ne
// fait pas 100 % à 1 près ; le dire seulement au retour d'un refus ferait
// chercher, fraction par fraction, l'erreur que la somme affichée montre tout
// de suite.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type FractionReference, type Pcgd, type RapportEtude } from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { Chargement } from '../Elements';

const NIVEAUX_COMMUNE = ['etude_anged_commune', 'pcgd', 'autre_etude'] as const;
const SAISONS = ['annuelle', 'ete', 'hiver', 'autre'] as const;
type NiveauSource = (typeof NIVEAUX_COMMUNE)[number] | 'moyenne_nationale_anged';
type Saison = (typeof SAISONS)[number];

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';

export function FormulaireCaracterisation({
  communeId,
  onFait,
  onAnnuler,
}: {
  /** null : la moyenne nationale de l'ANGeD, saisie par la FNCT. */
  communeId: string | null;
  onFait: () => void | Promise<void>;
  onAnnuler: () => void;
}) {
  const { t, i18n } = useTranslation();
  const nationale = communeId === null;
  const [fractions, setFractions] = useState<FractionReference[] | null>(null);
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [niveau, setNiveau] = useState<NiveauSource>(nationale ? 'moyenne_nationale_anged' : 'pcgd');
  const [annee, setAnnee] = useState('');
  const [saison, setSaison] = useState<Saison | ''>('');
  const [methode, setMethode] = useState('');
  const [pcgdId, setPcgdId] = useState('');
  const [rapportId, setRapportId] = useState('');
  const [plans, setPlans] = useState<Pcgd[]>([]);
  const [rapports, setRapports] = useState<RapportEtude[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    void api.fractionsReference().then(setFractions).catch(() => setFractions([]));
    if (communeId) {
      void api.pcgd(communeId).then(setPlans).catch(() => setPlans([]));
      void api.rapportsEtudes(communeId).then(setRapports).catch(() => setRapports([]));
    }
  }, [communeId]);

  if (!fractions) return <Chargement />;

  // Une case laissée vide n'est pas un zéro (règle d'or 1.1) : elle ne part
  // pas. Une étude qui n'a pas mesuré les textiles ne dit pas qu'il n'y en a pas.
  const saisies = Object.entries(valeurs).filter(([, v]) => v.trim() !== '');
  const total = saisies.reduce((s, [, v]) => s + Number(v.replace(',', '.')), 0);
  const nonNombre = saisies.some(([, v]) => !Number.isFinite(Number(v.replace(',', '.'))));
  const negative = saisies.some(([, v]) => Number(v.replace(',', '.')) < 0);
  const dansTolerance = !nonNombre && saisies.length > 0 && total >= 99 && total <= 101;
  const anneeValide = /^\d{4}$/.test(annee) && Number(annee) >= 1990 && Number(annee) <= 2100;

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      await api.enregistrerCaracterisation(communeId, {
        niveauSource: niveau,
        annee: Number(annee),
        saison: saison || null,
        methode: methode || null,
        pcgdId: niveau === 'pcgd' && pcgdId ? pcgdId : null,
        rapportId: rapportId || null,
        fractions: Object.fromEntries(saisies.map(([code, v]) => [code, Number(v.replace(',', '.'))])),
      });
      await onFait();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-siipi-200 bg-siipi-50/40 p-4" aria-labelledby="ajout-carac-titre">
      <div>
        <h2 id="ajout-carac-titre" className="text-base font-semibold text-ardoise-900">
          {t(nationale ? 'ajout.caracterisation.titreNationale' : 'ajout.caracterisation.titre')}
        </h2>
        <p className="mt-1 text-sm text-ardoise-600">{t('ajout.caracterisation.aide')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {!nationale && (
          <label className="text-sm" htmlFor="carac-niveau">
            {t('ajout.caracterisation.niveau')}
            <select id="carac-niveau" value={niveau} onChange={(e) => setNiveau(e.target.value as NiveauSource)} className={champ}>
              {NIVEAUX_COMMUNE.map((n) => (
                <option key={n} value={n}>{t(`ajout.caracterisation.niveaux.${n}`)}</option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm" htmlFor="carac-annee">
          {t('ajout.caracterisation.annee')}
          <input
            id="carac-annee"
            type="number"
            inputMode="numeric"
            min={1990}
            max={2100}
            value={annee}
            onChange={(e) => setAnnee(e.target.value)}
            className={champ}
          />
        </label>
        <label className="text-sm" htmlFor="carac-saison">
          {t('ajout.caracterisation.saison')}
          <select id="carac-saison" value={saison} onChange={(e) => setSaison(e.target.value as Saison | '')} className={champ}>
            <option value="">{t('ajout.nonPrecise')}</option>
            {SAISONS.map((s) => (
              <option key={s} value={s}>{t(`ajout.caracterisation.saisons.${s}`)}</option>
            ))}
          </select>
        </label>
        {!nationale && niveau === 'pcgd' && (
          <label className="text-sm" htmlFor="carac-pcgd">
            {t('ajout.caracterisation.pcgd')}
            <select id="carac-pcgd" value={pcgdId} onChange={(e) => setPcgdId(e.target.value)} className={champ}>
              <option value="">{t('ajout.nonPrecise')}</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {t(`ajout.pcgd.statuts.${p.statut}`)}
                  {p.annee_adoption ? ` ${p.annee_adoption}` : ''}
                  {p.bureau_etudes ? ` — ${p.bureau_etudes}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {!nationale && (
          <label className="text-sm" htmlFor="carac-rapport">
            {t('ajout.caracterisation.rapport')}
            <select id="carac-rapport" value={rapportId} onChange={(e) => setRapportId(e.target.value)} className={champ}>
              <option value="">{t('ajout.pcgd.aucunRapport')}</option>
              {rapports.map((r) => (
                <option key={r.id} value={r.id}>{r.titre}</option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm sm:col-span-2" htmlFor="carac-methode">
          {t('ajout.caracterisation.methode')}
          <input id="carac-methode" value={methode} onChange={(e) => setMethode(e.target.value)} maxLength={500} className={champ} />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ardoise-900">{t('ajout.caracterisation.fractions')}</legend>
        <p className="text-xs text-ardoise-500">{t('ajout.caracterisation.nomenclatureProvisoire')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {fractions.map((fr) => (
            <label key={fr.code} htmlFor={`carac-fr-${fr.code}`} className="flex items-center justify-between gap-3 rounded-lg border border-ardoise-200 bg-white px-3 py-1 text-sm">
              <span id={`carac-fr-${fr.code}-libelle`}>{i18n.language === 'ar' ? fr.libelle_ar : fr.libelle_fr}</span>
              <span className="flex items-center gap-1">
                <input
                  id={`carac-fr-${fr.code}`}
                  aria-labelledby={`carac-fr-${fr.code}-libelle`}
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  value={valeurs[fr.code] ?? ''}
                  onChange={(e) => setValeurs((v) => ({ ...v, [fr.code]: e.target.value }))}
                  className="min-h-11 w-20 rounded-lg border border-ardoise-300 px-2 text-end text-base tabular-nums"
                />
                <span aria-hidden="true">%</span>
              </span>
            </label>
          ))}
        </div>
        <p
          aria-live="polite"
          className={`rounded-lg border p-2 text-sm font-medium ${
            saisies.length === 0
              ? 'border-ardoise-200 bg-white text-ardoise-600'
              : dansTolerance && !negative
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          {t('ajout.caracterisation.total', { total: nonNombre ? '—' : formaterNombre(total, 1) })}
          {saisies.length > 0 && !dansTolerance && ` — ${t('ajout.caracterisation.horsTolerance')}`}
          {negative && ` — ${t('ajout.caracterisation.negative')}`}
        </p>
      </fieldset>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void enregistrer()}
          disabled={envoi || !anneeValide || !dansTolerance || negative}
          className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40"
        >
          {t('ajout.enregistrer')}
        </button>
        <button type="button" onClick={onAnnuler} className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-4 text-sm text-ardoise-700">
          {t('commun.annuler')}
        </button>
      </div>
    </section>
  );
}
