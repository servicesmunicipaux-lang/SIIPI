// La maintenance des engins (Jalon 5 — B2.2 carnet, B2.3 alertes).
//
// Deux morceaux, posés dans l'écran du parc :
//   - AlertesEntretien : en tête d'écran, ce qui est en retard, à prévoir, ou
//     à vérifier faute de relevé de compteur. C'est l'alerte « avant
//     l'échéance » du cahier des charges ;
//   - EntretienEngin : dans la fiche dépliée d'un engin, son compteur, ses
//     plans et son carnet.
//
// L'échéance n'est jamais calculée ici : c'est l'API qui la donne, depuis la
// dernière intervention. L'écran se contente de recharger après une saisie —
// l'alerte disparaît alors d'elle-même.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  type EcheanceEntretien,
  type InterventionMaintenance,
  type PlanEntretien,
  type Vehicule,
} from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { Erreur } from '../Elements';
import { BoutonExport } from '../BoutonExport';

const TYPES = [
  'vidange', 'revision', 'pneumatiques', 'freinage', 'hydraulique',
  'electricite', 'carrosserie', 'controle_technique', 'reparation', 'autre',
] as const;
type TypeIntervention = (typeof TYPES)[number];

export const STYLE_STATUT: Record<string, string> = {
  en_retard: 'bg-red-100 text-red-900',
  a_prevoir: 'bg-amber-100 text-amber-900',
  a_verifier: 'bg-sky-100 text-sky-900',
  a_jour: 'bg-siipi-100 text-siipi-800',
};

const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const nombre = (n: number | string | null | undefined) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString(document.documentElement.lang || 'fr');

/** Ce qui reste avant l'échéance, en clair : « dans 10 j · 5 000 km ». */
function reste(e: EcheanceEntretien, t: (c: string, o?: Record<string, unknown>) => string): string {
  const parts: string[] = [];
  if (e.jours_restants != null) {
    parts.push(
      e.jours_restants < 0
        ? t('communal.entretien.retardJours', { n: -e.jours_restants })
        : t('communal.entretien.dansJours', { n: e.jours_restants })
    );
  }
  if (e.km_restants != null) {
    parts.push(
      e.km_restants < 0
        ? t('communal.entretien.retardKm', { n: nombre(-e.km_restants) })
        : t('communal.entretien.resteKm', { n: nombre(e.km_restants) })
    );
  }
  if (e.statut === 'a_verifier') parts.push(t('communal.entretien.kmInconnu'));
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// En tête du parc : les alertes
// ---------------------------------------------------------------------------

export function AlertesEntretien({
  communeId,
  echeances,
  onOuvrir,
}: {
  communeId: string;
  echeances: EcheanceEntretien[];
  onOuvrir: (vehiculeId: string) => void;
}) {
  const { t } = useTranslation();
  const [deplie, setDeplie] = useState(false);
  const alertes = echeances.filter((e) => e.statut !== 'a_jour');
  const compte = (s: string) => echeances.filter((e) => e.statut === s).length;

  if (echeances.length === 0) {
    return <p className="rounded-xl border border-ardoise-200 bg-white p-3 text-sm text-ardoise-500">{t('communal.entretien.aucunPlan')}</p>;
  }

  return (
    <section
      className={`rounded-xl border p-3 ${
        compte('en_retard') > 0 ? 'border-red-300 bg-red-50' : alertes.length > 0 ? 'border-amber-300 bg-amber-50' : 'border-siipi-200 bg-siipi-50'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ardoise-900">
          {alertes.length === 0
            ? t('communal.entretien.toutAJour', { count: echeances.length, n: echeances.length })
            : t('communal.entretien.resume', {
                retard: compte('en_retard'),
                prevoir: compte('a_prevoir'),
                verifier: compte('a_verifier'),
              })}
        </p>
        <span className="flex flex-wrap items-center gap-2">
          <BoutonExport chemin={`/maintenance/echeances?communeId=${encodeURIComponent(communeId)}`} />
          {alertes.length > 0 && (
            <button
              type="button"
              onClick={() => setDeplie((d) => !d)}
              aria-expanded={deplie}
              className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700"
            >
              {deplie ? t('communal.entretien.masquer') : t('communal.entretien.voir')}
            </button>
          )}
        </span>
      </div>
      {deplie && (
        <ul className="mt-2 space-y-1">
          {alertes.map((e) => (
            <li key={e.plan_id}>
              <button
                type="button"
                onClick={() => onOuvrir(e.vehicule_id)}
                className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-start text-sm"
              >
                <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${STYLE_STATUT[e.statut]}`}>
                  {t(`communal.entretien.statuts.${e.statut}`)}
                </span>
                <span className="chiffres font-medium text-ardoise-900">{e.registration}</span>
                <span className="text-ardoise-700">{e.libelle || t(`communal.entretien.types.${e.type}`)}</span>
                <span className="text-xs text-ardoise-500">{reste(e, t)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dans la fiche d'un engin
// ---------------------------------------------------------------------------

export function EntretienEngin({
  communeId,
  vehicule,
  echeances,
  onChange,
}: {
  communeId: string;
  vehicule: Vehicule;
  echeances: EcheanceEntretien[];
  onChange: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const [interventions, setInterventions] = useState<InterventionMaintenance[] | null>(null);
  const [plans, setPlans] = useState<PlanEntretien[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [formulaire, setFormulaire] = useState<'intervention' | 'plan' | null>(null);

  const charger = async () => {
    try {
      const [i, p] = await Promise.all([
        api.interventionsEngin(communeId, vehicule.id),
        api.plansEngin(communeId, vehicule.id),
      ]);
      setInterventions(i);
      setPlans(p);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicule.id]);

  /** Rend vrai si l'action a abouti : un formulaire ne se vide qu'à ce moment-là. */
  const agir = async (action: () => Promise<unknown>): Promise<boolean> => {
    setErreur(null);
    try {
      await action();
      setFormulaire(null);
      await Promise.all([charger(), onChange()]);
      return true;
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
      return false;
    }
  };

  const echeanceDuPlan = (id: string) => echeances.find((e) => e.plan_id === id);

  return (
    <section className="space-y-3 rounded-lg border border-ardoise-200 bg-ardoise-50/50 p-3">
      <h3 className="text-sm font-semibold text-ardoise-900">{t('communal.entretien.titre')}</h3>
      {erreur && <Erreur message={erreur} />}

      <Compteur vehicule={vehicule} onReleve={(saisie) => agir(() => api.releverKilometrage(vehicule.id, saisie))} />

      {/* Les plans, avec leur échéance calculée par l'API. */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold tracking-wide text-ardoise-600 uppercase">{t('communal.entretien.plans')}</h4>
          <button
            type="button"
            onClick={() => setFormulaire((f) => (f === 'plan' ? null : 'plan'))}
            className="min-h-9 rounded-lg border border-ardoise-300 bg-white px-2 text-xs font-medium text-ardoise-700"
          >
            {formulaire === 'plan' ? t('commun.annuler') : t('communal.entretien.nouveauPlan')}
          </button>
        </div>
        {formulaire === 'plan' && (
          <FormulairePlan onEnvoyer={(saisie) => agir(() => api.poserPlan({ ...saisie, vehiculeId: vehicule.id }))} />
        )}
        {plans && plans.length === 0 && <p className="text-xs text-ardoise-500">{t('communal.entretien.aucunPlanEngin')}</p>}
        <ul className="space-y-1">
          {(plans ?? []).map((p) => {
            const e = echeanceDuPlan(p.id);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-sm">
                {e && (
                  <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${STYLE_STATUT[e.statut]}`}>
                    {t(`communal.entretien.statuts.${e.statut}`)}
                  </span>
                )}
                <span className="font-medium text-ardoise-900">{p.libelle || t(`communal.entretien.types.${p.type}`)}</span>
                <span className="text-xs text-ardoise-500">
                  {[
                    p.intervalle_km ? t('communal.entretien.tousLesKm', { n: nombre(p.intervalle_km) }) : null,
                    p.intervalle_jours ? t('communal.entretien.tousLesJours', { n: p.intervalle_jours }) : null,
                  ]
                    .filter(Boolean)
                    .join(t('communal.entretien.ou'))}
                  {e && ` — ${reste(e, t)}`}
                  {e?.echeance_date && ` · ${t('communal.entretien.echeanceLe', { date: f.date(e.echeance_date) })}`}
                </span>
                <button
                  type="button"
                  onClick={() => void agir(() => api.retirerPlan(p.id))}
                  className="ms-auto min-h-9 rounded-lg px-2 text-xs text-red-800 underline"
                >
                  {t('communal.entretien.retirer')}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Le carnet : ce qui a été fait, ce que ça a coûté. */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold tracking-wide text-ardoise-600 uppercase">{t('communal.entretien.carnet')}</h4>
          <span className="flex flex-wrap items-center gap-2">
            {interventions && interventions.length > 0 && (
              <BoutonExport
                chemin={`/maintenance/interventions?communeId=${encodeURIComponent(communeId)}&vehiculeId=${encodeURIComponent(vehicule.id)}`}
              />
            )}
            <button
              type="button"
              onClick={() => setFormulaire((f) => (f === 'intervention' ? null : 'intervention'))}
              className="min-h-9 rounded-lg bg-siipi-600 px-2 text-xs font-medium text-white"
            >
              {formulaire === 'intervention' ? t('commun.annuler') : t('communal.entretien.saisir')}
            </button>
          </span>
        </div>
        {formulaire === 'intervention' && (
          <FormulaireIntervention
            kmActuel={vehicule.kilometrage ?? null}
            onEnvoyer={(saisie) => agir(() => api.saisirIntervention({ ...saisie, vehiculeId: vehicule.id }))}
          />
        )}
        {interventions && interventions.length === 0 && (
          <p className="text-xs text-ardoise-500">{t('communal.entretien.carnetVide')}</p>
        )}
        <ul className="space-y-1">
          {(interventions ?? []).map((i) => (
            <li key={i.id} className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-white px-2 py-1.5 text-sm">
              <span className="chiffres text-xs text-ardoise-500">{f.date(i.date_intervention)}</span>
              <span className="font-medium text-ardoise-900">{t(`communal.entretien.types.${i.type}`)}</span>
              <span className="text-xs text-ardoise-500">{t(`communal.entretien.natures.${i.nature}`)}</span>
              {i.cout_tnd != null && <span className="chiffres text-xs text-ardoise-700">{nombre(i.cout_tnd)} TND</span>}
              {i.kilometrage != null && <span className="chiffres text-xs text-ardoise-500">{nombre(i.kilometrage)} km</span>}
              {i.prestataire && <span className="text-xs text-ardoise-500">{i.prestataire}</span>}
              {i.description && <span className="w-full text-xs text-ardoise-600">{i.description}</span>}
              <button
                type="button"
                onClick={() => void agir(() => api.retirerIntervention(i.id))}
                className="ms-auto min-h-9 rounded-lg px-2 text-xs text-red-800 underline"
              >
                {t('communal.entretien.retirer')}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Compteur({
  vehicule,
  onReleve,
}: {
  vehicule: Vehicule;
  onReleve: (saisie: { kilometrage: number; forcer?: boolean }) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const [km, setKm] = useState('');
  const [remplace, setRemplace] = useState(false);
  const valeur = Number(km.replace(/\s/g, ''));
  const valide = km.trim() !== '' && Number.isInteger(valeur) && valeur >= 0;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <p className="text-sm text-ardoise-700">
        {vehicule.kilometrage != null
          ? t('communal.entretien.compteur', { km: nombre(vehicule.kilometrage), date: f.date(vehicule.kilometrage_le) })
          : t('communal.entretien.compteurInconnu')}
      </p>
      <label className="text-xs">
        {t('communal.entretien.nouveauReleve')}
        <input
          inputMode="numeric"
          value={km}
          onChange={(e) => setKm(e.target.value)}
          className="mt-0.5 block min-h-9 w-32 rounded-lg border border-ardoise-300 px-2 text-sm"
        />
      </label>
      <label className="flex min-h-9 items-center gap-1 text-xs text-ardoise-600">
        <input type="checkbox" checked={remplace} onChange={(e) => setRemplace(e.target.checked)} />
        {t('communal.entretien.compteurRemplace')}
      </label>
      <button
        type="button"
        disabled={!valide}
        onClick={() =>
          void onReleve({ kilometrage: valeur, forcer: remplace || undefined }).then((ok) => {
            if (ok) {
              setKm('');
              setRemplace(false);
            }
          })
        }
        className="min-h-9 rounded-lg border border-ardoise-300 bg-white px-3 text-xs font-medium text-ardoise-700 disabled:opacity-40"
      >
        {t('communal.entretien.relever')}
      </button>
    </div>
  );
}

const champ = 'mt-0.5 block min-h-9 w-full rounded-lg border border-ardoise-300 bg-white px-2 text-sm';

function SelectType({ valeur, onChange }: { valeur: TypeIntervention; onChange: (t: TypeIntervention) => void }) {
  const { t } = useTranslation();
  return (
    <select value={valeur} onChange={(e) => onChange(e.target.value as TypeIntervention)} className={champ}>
      {TYPES.map((ty) => (
        <option key={ty} value={ty}>
          {t(`communal.entretien.types.${ty}`)}
        </option>
      ))}
    </select>
  );
}

const nombreSaisi = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(n) ? undefined : n;
};

function FormulaireIntervention({
  kmActuel,
  onEnvoyer,
}: {
  kmActuel: number | null;
  onEnvoyer: (saisie: {
    dateIntervention: string;
    type: TypeIntervention;
    nature: 'preventive' | 'corrective';
    coutTnd?: number;
    kilometrage?: number;
    prestataire?: string;
    description?: string;
  }) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(aujourdhui());
  const [type, setType] = useState<TypeIntervention>('vidange');
  const [nature, setNature] = useState<'preventive' | 'corrective'>('preventive');
  const [cout, setCout] = useState('');
  const [km, setKm] = useState(kmActuel != null ? String(kmActuel) : '');
  const [prestataire, setPrestataire] = useState('');
  const [description, setDescription] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onEnvoyer({
          dateIntervention: date,
          type,
          nature,
          coutTnd: nombreSaisi(cout),
          kilometrage: nombreSaisi(km),
          prestataire: prestataire.trim() || undefined,
          description: description.trim() || undefined,
        });
      }}
      className="grid gap-2 rounded-lg border border-siipi-200 bg-white p-2 sm:grid-cols-3"
    >
      <label className="text-xs">
        {t('communal.entretien.champDate')}
        <input type="date" max={aujourdhui()} required value={date} onChange={(e) => setDate(e.target.value)} className={champ} />
      </label>
      <label className="text-xs">
        {t('communal.entretien.champType')}
        <SelectType valeur={type} onChange={setType} />
      </label>
      <label className="text-xs">
        {t('communal.entretien.champNature')}
        <select value={nature} onChange={(e) => setNature(e.target.value as 'preventive' | 'corrective')} className={champ}>
          <option value="preventive">{t('communal.entretien.natures.preventive')}</option>
          <option value="corrective">{t('communal.entretien.natures.corrective')}</option>
        </select>
      </label>
      <label className="text-xs">
        {t('communal.entretien.champCout')}
        <input inputMode="decimal" value={cout} onChange={(e) => setCout(e.target.value)} className={champ} />
      </label>
      <label className="text-xs">
        {t('communal.entretien.champKm')}
        <input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} className={champ} />
      </label>
      <label className="text-xs">
        {t('communal.entretien.champPrestataire')}
        <input value={prestataire} onChange={(e) => setPrestataire(e.target.value)} className={champ} />
      </label>
      <label className="text-xs sm:col-span-3">
        {t('communal.entretien.champDescription')}
        <input value={description} onChange={(e) => setDescription(e.target.value)} className={champ} />
      </label>
      <div className="sm:col-span-3">
        <button type="submit" className="min-h-9 rounded-lg bg-siipi-600 px-3 text-xs font-semibold text-white">
          {t('communal.entretien.enregistrer')}
        </button>
      </div>
    </form>
  );
}

function FormulairePlan({
  onEnvoyer,
}: {
  onEnvoyer: (saisie: {
    type: TypeIntervention;
    libelle?: string;
    intervalleKm?: number;
    intervalleJours?: number;
    seuilAlerteKm?: number;
    seuilAlerteJours?: number;
    referenceDate?: string;
    referenceKm?: number;
  }) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<TypeIntervention>('vidange');
  const [libelle, setLibelle] = useState('');
  const [intervalleKm, setIntervalleKm] = useState('');
  const [intervalleJours, setIntervalleJours] = useState('');
  const [seuilKm, setSeuilKm] = useState('1000');
  const [seuilJours, setSeuilJours] = useState('30');
  const [refDate, setRefDate] = useState('');
  const [refKm, setRefKm] = useState('');
  const aUnIntervalle = nombreSaisi(intervalleKm) !== undefined || nombreSaisi(intervalleJours) !== undefined;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onEnvoyer({
          type,
          libelle: libelle.trim() || undefined,
          intervalleKm: nombreSaisi(intervalleKm),
          intervalleJours: nombreSaisi(intervalleJours),
          seuilAlerteKm: nombreSaisi(seuilKm),
          seuilAlerteJours: nombreSaisi(seuilJours),
          referenceDate: refDate || undefined,
          referenceKm: nombreSaisi(refKm),
        });
      }}
      className="grid gap-2 rounded-lg border border-siipi-200 bg-white p-2 sm:grid-cols-4"
    >
      <label className="text-xs">
        {t('communal.entretien.champType')}
        <SelectType valeur={type} onChange={setType} />
      </label>
      <label className="text-xs sm:col-span-3">
        {t('communal.entretien.champLibelle')}
        <input value={libelle} onChange={(e) => setLibelle(e.target.value)} className={champ} />
      </label>
      <label className="text-xs">
        {t('communal.entretien.champIntervalleKm')}
        <input inputMode="numeric" value={intervalleKm} onChange={(e) => setIntervalleKm(e.target.value)} className={champ} />
      </label>
      <label className="text-xs">
        {t('communal.entretien.champIntervalleJours')}
        <input inputMode="numeric" value={intervalleJours} onChange={(e) => setIntervalleJours(e.target.value)} className={champ} />
      </label>
      <label className="text-xs">
        {t('communal.entretien.champSeuilKm')}
        <input inputMode="numeric" value={seuilKm} onChange={(e) => setSeuilKm(e.target.value)} className={champ} />
      </label>
      <label className="text-xs">
        {t('communal.entretien.champSeuilJours')}
        <input inputMode="numeric" value={seuilJours} onChange={(e) => setSeuilJours(e.target.value)} className={champ} />
      </label>
      <label className="text-xs">
        {t('communal.entretien.champReferenceDate')}
        <input type="date" max={aujourdhui()} value={refDate} onChange={(e) => setRefDate(e.target.value)} className={champ} />
      </label>
      <label className="text-xs">
        {t('communal.entretien.champReferenceKm')}
        <input inputMode="numeric" value={refKm} onChange={(e) => setRefKm(e.target.value)} className={champ} />
      </label>
      <p className="text-xs text-ardoise-500 sm:col-span-2">{t('communal.entretien.referenceAide')}</p>
      <div className="sm:col-span-4">
        <button
          type="submit"
          disabled={!aUnIntervalle}
          className="min-h-9 rounded-lg bg-siipi-600 px-3 text-xs font-semibold text-white disabled:opacity-40"
        >
          {t('communal.entretien.enregistrerPlan')}
        </button>
        {!aUnIntervalle && <span className="ms-2 text-xs text-amber-800">{t('communal.entretien.intervalleRequis')}</span>}
      </div>
    </form>
  );
}
