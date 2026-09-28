// Paramètres (TDR §3.2.6) — ce que chacun règle pour lui-même, et, pour le
// cadre communal, les seuils de sa commune.
//
// Les préférences personnelles s'enregistrent au moment où on les choisit et
// s'appliquent aussitôt à tout le portail : pas de bouton « Enregistrer » à
// oublier, et l'exemple affiché à côté de chaque choix montre ce qu'il change.
//
// Les seuils de la commune, eux, s'enregistrent d'un geste explicite : ils
// changent ce que toute l'équipe verra dans « À vérifier » dès demain matin.

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { api, ErreurApi, type ChangementPreferences, type ParametresCommune } from '../lib/api';
import { creerFormats, PREFERENCES_DEFAUT, useFormats } from '../lib/formats';

const DOMAINES = ['circuits', 'parc', 'personnel', 'communication', 'pesees', 'reclamations', 'points'] as const;
const GRAVITES = ['information', 'avertissement', 'bloquant'] as const;

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

/** Un groupe de choix exclusifs, avec un exemple par choix. */
function Choix<T extends string>({
  nom,
  valeur,
  options,
  onChoisir,
}: {
  nom: string;
  valeur: T;
  options: { valeur: T; libelle: string; exemple?: string }[];
  onChoisir: (v: T) => void;
}) {
  return (
    <fieldset className="grid gap-2 sm:grid-cols-3">
      <legend className="sr-only">{nom}</legend>
      {options.map((o) => (
        <label
          key={o.valeur}
          className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${
            valeur === o.valeur ? 'border-siipi-500 bg-siipi-50' : 'border-ardoise-200 hover:bg-ardoise-50'
          }`}
        >
          <input
            type="radio"
            name={nom}
            checked={valeur === o.valeur}
            onChange={() => onChoisir(o.valeur)}
            className="mt-0.5 size-4"
          />
          <span>
            <span className="block font-medium text-ardoise-900">{o.libelle}</span>
            {o.exemple && <span className="chiffres block text-ardoise-500">{o.exemple}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function Parametres({ onFermer }: { onFermer: () => void }) {
  const { t, i18n } = useTranslation();
  const { utilisateur, changerPreferences } = useAuth();
  const [etat, setEtat] = useState<{ type: 'ok' | 'erreur'; texte: string } | null>(null);
  const p = utilisateur?.preferences ?? PREFERENCES_DEFAUT;
  const voitAlertes = utilisateur?.role === 'admin_commune' || utilisateur?.role === 'super_admin_fnct';

  const changer = async (changement: ChangementPreferences) => {
    try {
      await changerPreferences(changement);
      setEtat({ type: 'ok', texte: t('parametres.enregistre') });
    } catch (err) {
      setEtat({ type: 'erreur', texte: err instanceof ErreurApi ? err.message : t('commun.erreur') });
    }
  };

  // Les exemples se calculent avec le choix qu'ils illustrent, pas avec le
  // choix courant : sinon les trois options montreraient la même date.
  const exemple = (changement: Partial<typeof p>) =>
    creerFormats({ ...p, ...changement, unites: { ...p.unites, ...(changement.unites ?? {}) } }, i18n.language, (c) => t(c));
  const maintenant = new Date();

  const masques = new Set<string>(p.alertes.domainesMasques);
  const basculerDomaine = (d: (typeof DOMAINES)[number]) => {
    const n = new Set(masques);
    if (n.has(d)) n.delete(d);
    else n.add(d);
    void changer({ alertes: { domainesMasques: [...n] as (typeof DOMAINES)[number][] } });
  };

  return (
    <div className="mx-auto max-w-[900px] space-y-4 px-4 py-6 sm:px-6">
      <button type="button" onClick={onFermer} className="text-sm font-medium text-siipi-700 hover:underline">
        ← {t('parametres.retour')}
      </button>
      <header>
        <h1 className="text-xl font-semibold text-ardoise-900">{t('parametres.titre')}</h1>
        <p className="mt-1 text-sm text-ardoise-500">{t('parametres.chapeau')}</p>
      </header>

      {etat && (
        <p
          role={etat.type === 'ok' ? 'status' : 'alert'}
          className={`rounded-lg border p-3 text-sm ${
            etat.type === 'ok' ? 'border-siipi-200 bg-siipi-50 text-siipi-800' : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {etat.texte}
        </p>
      )}

      <Section titre={t('parametres.langue.titre')} aide={t('parametres.langue.aide')}>
        <Choix
          nom="langue"
          valeur={(p.langue ?? (i18n.language.startsWith('ar') ? 'ar' : 'fr')) as 'fr' | 'ar'}
          options={[
            { valeur: 'fr', libelle: 'Français' },
            { valeur: 'ar', libelle: 'العربية' },
          ]}
          onChoisir={(langue) => void changer({ langue })}
        />
      </Section>

      <Section titre={t('parametres.date.titre')} aide={t('parametres.date.aide')}>
        <Choix
          nom="formatDate"
          valeur={p.formatDate}
          options={(['jj/mm/aaaa', 'aaaa-mm-jj', 'jj mois aaaa'] as const).map((f) => ({
            valeur: f,
            libelle: t(`parametres.date.formats.${f}`),
            exemple: exemple({ formatDate: f }).date(maintenant, { heure: true }),
          }))}
          onChoisir={(formatDate) => void changer({ formatDate })}
        />
      </Section>

      <Section titre={t('parametres.unites.titre')} aide={t('parametres.unites.aide')}>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-ardoise-700">{t('parametres.unites.masse')}</p>
            <Choix
              nom="masse"
              valeur={p.unites.masse}
              options={(['t', 'kg'] as const).map((u) => ({
                valeur: u,
                libelle: t(`parametres.unites.noms.${u}`),
                exemple: exemple({ unites: { ...p.unites, masse: u } }).masse(12.48),
              }))}
              onChoisir={(masse) => void changer({ unites: { masse } })}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ardoise-700">{t('parametres.unites.volume')}</p>
            <Choix
              nom="volume"
              valeur={p.unites.volume}
              options={(['m3', 'l'] as const).map((u) => ({
                valeur: u,
                libelle: t(`parametres.unites.noms.${u}`),
                exemple: exemple({ unites: { ...p.unites, volume: u } }).volume(2.5),
              }))}
              onChoisir={(volume) => void changer({ unites: { volume } })}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ardoise-700">{t('parametres.unites.surface')}</p>
            <Choix
              nom="surface"
              valeur={p.unites.surface}
              options={(['km2', 'ha'] as const).map((u) => ({
                valeur: u,
                libelle: t(`parametres.unites.noms.${u}`),
                exemple: exemple({ unites: { ...p.unites, surface: u } }).surface(103.4),
              }))}
              onChoisir={(surface) => void changer({ unites: { surface } })}
            />
          </div>
        </div>
      </Section>

      {voitAlertes && (
        <Section titre={t('parametres.alertes.titre')} aide={t('parametres.alertes.aide')}>
          <label className="block text-sm">
            <span className="block font-medium text-ardoise-700">{t('parametres.alertes.graviteMin')}</span>
            <select
              value={p.alertes.graviteMin}
              onChange={(e) => void changer({ alertes: { graviteMin: e.target.value as (typeof GRAVITES)[number] } })}
              className={`${champ} mt-1`}
            >
              {GRAVITES.map((g) => (
                <option key={g} value={g}>
                  {t(`parametres.alertes.gravites.${g}`)}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-ardoise-700">{t('parametres.alertes.domaines')}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {DOMAINES.map((d) => (
                <label key={d} className="flex min-h-11 items-center gap-2 rounded-lg border border-ardoise-200 px-3 text-sm">
                  <input type="checkbox" checked={!masques.has(d)} onChange={() => basculerDomaine(d)} className="size-4" />
                  {t(`parametres.alertes.noms.${d}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-ardoise-500">{t('parametres.alertes.bloquantsToujours')}</p>
        </Section>
      )}

      {utilisateur?.role === 'admin_commune' && utilisateur.communeId && <SeuilsCommune communeId={utilisateur.communeId} />}

      <MotDePasse />
    </div>
  );
}

// ---------------------------------------------------------------------------

function SeuilsCommune({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const [parametres, setParametres] = useState<ParametresCommune | null>(null);
  const [saisie, setSaisie] = useState({ delai: '', km: '', jours: '', actions: true });
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
        })
      );
      setEtat({ type: 'ok', texte: t('parametres.commune.enregistre') });
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
          <button type="submit" disabled={enCours} className={boutonPrincipal}>
            {t('parametres.commune.enregistrer')}
          </button>
        </form>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------

function MotDePasse() {
  const { t } = useTranslation();
  const [s, setS] = useState({ actuel: '', nouveau: '', confirmation: '' });
  const [etat, setEtat] = useState<{ type: 'ok' | 'erreur'; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  const envoyer = async () => {
    if (s.nouveau !== s.confirmation) {
      setEtat({ type: 'erreur', texte: t('parametres.motDePasse.differents') });
      return;
    }
    setEnCours(true);
    try {
      await api.changerMonMotDePasse({ motDePasseActuel: s.actuel, nouveauMotDePasse: s.nouveau });
      setS({ actuel: '', nouveau: '', confirmation: '' });
      setEtat({ type: 'ok', texte: t('parametres.motDePasse.change') });
    } catch (err) {
      setEtat({ type: 'erreur', texte: err instanceof ErreurApi ? err.message : t('commun.erreur') });
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Section titre={t('parametres.motDePasse.titre')} aide={t('parametres.motDePasse.aide')}>
      {etat && (
        <p role={etat.type === 'ok' ? 'status' : 'alert'} className={`text-sm ${etat.type === 'ok' ? 'text-siipi-700' : 'text-red-700'}`}>
          {etat.texte}
        </p>
      )}
      <form
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          void envoyer();
        }}
      >
        {(
          [
            ['actuel', 'current-password'],
            ['nouveau', 'new-password'],
            ['confirmation', 'new-password'],
          ] as const
        ).map(([cle, auto]) => (
          <label key={cle} className="block text-sm">
            <span className="block font-medium text-ardoise-700">{t(`parametres.motDePasse.${cle}`)}</span>
            <input
              type="password"
              required
              minLength={cle === 'actuel' ? 1 : 10}
              autoComplete={auto}
              value={s[cle]}
              onChange={(e) => setS((x) => ({ ...x, [cle]: e.target.value }))}
              className={`${champ} mt-1 w-full`}
            />
          </label>
        ))}
        <div className="sm:col-span-3">
          <button type="submit" disabled={enCours} className={boutonPrincipal}>
            {t('parametres.motDePasse.envoyer')}
          </button>
        </div>
      </form>
    </Section>
  );
}
