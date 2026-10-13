// Les paramètres de la commune qui font calculer des indicateurs : sa
// population (lot 17.1) et ses seuils, dont l'objectif de balayage (lot
// « sources KPI ») — registre des formulaires, refonte lot 3b.
//
// Ils vivaient dans la page Paramètres ; le panneau « il manque » d'un
// indicateur doit pouvoir les ouvrir sur place. Les deux endroits montrent
// désormais le même composant.

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type ParametresCommune } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';

const champ = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const boutonPrincipal = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white hover:bg-siipi-700 disabled:opacity-50';

function Section({ titre, aide, children }: { titre: string; aide?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4 sm:p-5">
      <div>
        <h2 className="font-semibold text-ardoise-900">{titre}</h2>
        {aide && <p className="mt-1 text-sm text-ardoise-500">{aide}</p>}
      </div>
      {children}
    </section>
  );
}

// La population et le repère de production (lot 17.1). Une commune côtière
// triple en été : sans sa population de saison, le kilo par habitant et par
// jour de juillet est faux. Chaque chiffre se donne avec sa source ; laissé
// vide, il s'efface — le recensement s'applique, aucune saison n'existe.
export function FormulairePopulation({ communeId, onFait }: { communeId: string; onFait?: () => void | Promise<void> }) {
  const { t, i18n } = useTranslation();
  const vide = { permanente: '', sourcePermanente: '', saison: '', debut: '', fin: '', theorique: '', sourceTheorique: '' };
  const [parametres, setParametres] = useState<ParametresCommune | null>(null);
  const [s, setS] = useState(vide);
  const [etat, setEtat] = useState<{ type: 'ok' | 'erreur'; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const nomMois = (m: number) =>
    new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-TN' : 'fr-TN', { month: 'long' }).format(new Date(2026, m - 1, 1));

  const remplir = (p: ParametresCommune) => {
    setParametres(p);
    const texte = (v: number | string | null | undefined) => (v == null ? '' : String(v));
    setS({
      permanente: texte(p.population_permanente),
      sourcePermanente: texte(p.population_permanente_source),
      saison: texte(p.population_saisonniere),
      debut: texte(p.saison_debut_mois),
      fin: texte(p.saison_fin_mois),
      theorique: texte(p.production_theorique_kg_hab_j),
      sourceTheorique: texte(p.production_theorique_source),
    });
  };

  useEffect(() => {
    void api
      .parametresCommune(communeId)
      .then(remplir)
      .catch((err) => setEtat({ type: 'erreur', texte: err instanceof ErreurApi ? err.message : t('commun.erreur') }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId]);

  const entier = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\s/g, '')));
  const enregistrer = async () => {
    setEnCours(true);
    try {
      remplir(
        await api.changerPopulationCommune(communeId, {
          populationPermanente: entier(s.permanente),
          populationPermanenteSource: s.sourcePermanente.trim() || null,
          populationSaisonniere: entier(s.saison),
          saisonDebutMois: entier(s.debut),
          saisonFinMois: entier(s.fin),
          productionTheoriqueKgHabJ: s.theorique.trim() === '' ? null : Number(s.theorique.replace(',', '.')),
          productionTheoriqueSource: s.sourceTheorique.trim() || null,
        })
      );
      setEtat({ type: 'ok', texte: t('parametres.population.enregistre') });
      await onFait?.();
    } catch (err) {
      setEtat({ type: 'erreur', texte: err instanceof ErreurApi ? err.message : t('commun.erreur') });
    } finally {
      setEnCours(false);
    }
  };

  const texte = (cle: keyof typeof vide, libelle: string, mode: 'numeric' | 'decimal' | 'text', large = false) => (
    <label className="block text-sm">
      <span className="block font-medium text-ardoise-700">{libelle}</span>
      <input
        inputMode={mode}
        value={s[cle]}
        onChange={(e) => setS((x) => ({ ...x, [cle]: e.target.value }))}
        className={`${champ} mt-1 ${large ? 'w-full' : 'w-40'}`}
      />
    </label>
  );
  const choixMois = (cle: 'debut' | 'fin', libelle: string) => (
    <label className="block text-sm">
      <span className="block font-medium text-ardoise-700">{libelle}</span>
      <select value={s[cle]} onChange={(e) => setS((x) => ({ ...x, [cle]: e.target.value }))} className={`${champ} mt-1 w-40`}>
        <option value="">—</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>{nomMois(m)}</option>
        ))}
      </select>
    </label>
  );

  return (
    <Section titre={t('parametres.population.titre')} aide={t('parametres.population.aide')}>
      {etat && (
        <p role={etat.type === 'ok' ? 'status' : 'alert'} className={`text-sm ${etat.type === 'ok' ? 'text-siipi-700' : 'text-red-700'}`}>
          {etat.texte}
        </p>
      )}
      {parametres && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void enregistrer();
          }}
        >
          <p className="text-sm text-ardoise-700">
            {parametres.population_recensement == null
              ? t('parametres.population.recensementInconnu')
              : t('parametres.population.recensement', { population: formaterNombre(parametres.population_recensement) })}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {texte('permanente', t('parametres.population.permanente'), 'numeric')}
            {texte('sourcePermanente', t('parametres.population.source'), 'text', true)}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {texte('saison', t('parametres.population.saison'), 'numeric')}
            {choixMois('debut', t('parametres.population.debut'))}
            {choixMois('fin', t('parametres.population.fin'))}
          </div>
          <p className="text-xs text-ardoise-500">{t('parametres.population.aideSaison')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {texte('theorique', t('parametres.population.theorique'), 'decimal')}
            {texte('sourceTheorique', t('parametres.population.source'), 'text', true)}
          </div>
          <button type="submit" disabled={enCours} className={boutonPrincipal}>
            {t('parametres.population.enregistrer')}
          </button>
        </form>
      )}
    </Section>
  );
}

export function FormulaireSeuilsCommune({ communeId, onFait }: { communeId: string; onFait?: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const [parametres, setParametres] = useState<ParametresCommune | null>(null);
  const [saisie, setSaisie] = useState({ delai: '', km: '', jours: '', actions: true, balayage: '' });
  const [etat, setEtat] = useState<{ type: 'ok' | 'erreur'; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const { date } = useFormats();

  const remplir = (p: ParametresCommune) => {
    setParametres(p);
    setSaisie({
      delai: String(p.delai_reclamation_jours),
      km: String(p.seuil_entretien_km),
      jours: String(p.seuil_entretien_jours),
      actions: p.alerter_actions_retard,
      balayage: p.objectif_balayage_ml_j == null ? '' : String(p.objectif_balayage_ml_j),
    });
  };

  useEffect(() => {
    void api
      .parametresCommune(communeId)
      .then(remplir)
      .catch((err) => setEtat({ type: 'erreur', texte: err instanceof ErreurApi ? err.message : t('commun.erreur') }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId]);

  const enregistrer = async () => {
    setEnCours(true);
    try {
      remplir(
        await api.changerParametresCommune(communeId, {
          delaiReclamationJours: Number(saisie.delai),
          seuilEntretienKm: Number(saisie.km),
          seuilEntretienJours: Number(saisie.jours),
          alerterActionsRetard: saisie.actions,
          objectifBalayageMlJ: saisie.balayage.trim() === '' ? null : Number(saisie.balayage.replace(',', '.')),
        })
      );
      setEtat({ type: 'ok', texte: t('parametres.commune.enregistre') });
      await onFait?.();
    } catch (err) {
      setEtat({ type: 'erreur', texte: err instanceof ErreurApi ? err.message : t('commun.erreur') });
    } finally {
      setEnCours(false);
    }
  };

  const nombre = (cle: 'delai' | 'km' | 'jours', libelle: string, aide: string, max: number, min = 0) => (
    <label className="block text-sm">
      <span className="block font-medium text-ardoise-700">{libelle}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        required
        value={saisie[cle]}
        onChange={(e) => setSaisie((s) => ({ ...s, [cle]: e.target.value }))}
        className={`${champ} mt-1 w-40`}
      />
      <span className="mt-1 block text-xs text-ardoise-500">{aide}</span>
    </label>
  );

  return (
    <Section titre={t('parametres.commune.titre')} aide={t('parametres.commune.aide')}>
      {etat && (
        <p role={etat.type === 'ok' ? 'status' : 'alert'} className={`text-sm ${etat.type === 'ok' ? 'text-siipi-700' : 'text-red-700'}`}>
          {etat.texte}
        </p>
      )}
      {parametres && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void enregistrer();
          }}
        >
          <p className="text-xs text-ardoise-500">
            {parametres.par_defaut
              ? t('parametres.commune.parDefaut')
              : t('parametres.commune.derniere', { date: date(parametres.updated_at, { heure: true }), auteur: parametres.auteur ?? '—' })}
          </p>
          {nombre('delai', t('parametres.commune.delai'), t('parametres.commune.delaiAide'), 90, 1)}
          <div className="grid gap-4 sm:grid-cols-2">
            {nombre('km', t('parametres.commune.seuilKm'), t('parametres.commune.seuilAide'), 100000)}
            {nombre('jours', t('parametres.commune.seuilJours'), t('parametres.commune.seuilAide'), 365)}
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={saisie.actions}
              onChange={(e) => setSaisie((s) => ({ ...s, actions: e.target.checked }))}
              className="size-4"
            />
            {t('parametres.commune.actions')}
          </label>
          <label className="block text-sm">
            <span className="block font-medium text-ardoise-700">{t('parametres.commune.balayage')}</span>
            <input
              inputMode="decimal"
              value={saisie.balayage}
              onChange={(e) => setSaisie((s) => ({ ...s, balayage: e.target.value }))}
              placeholder={t('kpi.statuts.non_renseigne')}
              className={`${champ} mt-1 w-40`}
            />
            <span className="mt-1 block text-xs text-ardoise-500">{t('parametres.commune.balayageAide')}</span>
          </label>
          <button type="submit" disabled={enCours} className={boutonPrincipal}>
            {t('parametres.commune.enregistrer')}
          </button>
        </form>
      )}
    </Section>
  );
}
